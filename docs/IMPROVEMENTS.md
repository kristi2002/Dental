# Where there is room for improvement

Findings from reading the schema and the logic around it, ranked by what they
actually cost. Companion to [DATA-MODEL.md](DATA-MODEL.md), which describes the
current design as it stands.

Nothing here is a criticism of the design intent — most of the deliberate
choices (no billing, text-first UI, warn-don't-block, derive-don't-store) are
sound and should stay. These are the places where the implementation does not
yet hold up the intent, or where a decision that is right at 10 patients becomes
wrong at 3 000.

**Legend** — 🔴 correctness · 🟠 modelling · 🟡 scale · ⚪ operational

---

## 1. Correctness and data integrity

### 1.1 🔴 Deleting a patient orphans their files on disk

`Patient` → `PatientDocument` is `onDelete: Cascade`
([schema.prisma:185](../prisma/schema.prisma)), so `prisma.patient.delete()` in
[`patients.ts:83`](../src/lib/actions/patients.ts) removes the document *rows*
in the database. The bytes under `storage/patient-files/` are never touched —
`deleteStoredFile()` is only called from `deleteDocument`
([`documents.ts:102`](../src/lib/actions/documents.ts)).

Result: every X-ray of every deleted patient stays on disk forever, with no row
pointing at it. For medical images that is both a storage leak and a
data-protection problem — the record was deleted, the radiograph was not.

**Fix.** Read the storage keys before the delete and unlink them after:

```ts
const documents = await prisma.patientDocument.findMany({
  where: { patientId: id },
  select: { storageKey: true },
});

await prisma.patient.delete({ where: { id } });

await Promise.all(documents.map((d) => deleteStoredFile(d.storageKey)));
```

`deleteStoredFile` is already best-effort on `ENOENT`, so a missing file cannot
break the delete. Worth adding a small "sweep unreferenced files" script too, for
anything already orphaned.

### 1.2 🔴 Lost update on stock quantity

[`adjustStock`](../src/lib/actions/stock.ts) reads the item, computes
`nextQuantity` in JavaScript, then writes that **absolute** value inside a
transaction:

```ts
const item = await prisma.stockItem.findUnique({ where: { id } });   // outside
const nextQuantity = Math.max(0, item.quantity + delta);
await prisma.$transaction([
  prisma.stockItem.update({ where: { id }, data: { quantity: nextQuantity } }),
  prisma.stockMovement.create({ ... }),
]);
```

Two people tapping −1 on the same box of gloves at the same time both read 8,
both write 7. One decrement is lost — but **two** movement rows are written, so
the ledger and the counter now disagree, and `reorder.ts` (which trusts the
ledger) diverges from the low-stock badge (which trusts the counter).

The same shape appears in `saveStockItem`'s update path, which reads `existing`
outside the transaction and derives the movement delta from it.

**Fix.** Make the write relative and let Postgres do the arithmetic:

```ts
data: { quantity: { increment: delta } }
```

Clamping at zero then needs either a `CHECK (quantity >= 0)` constraint with the
error handled, or a conditional update (`updateMany` with
`where: { id, quantity: { gte: -delta } }`) whose `count === 0` means "not
enough on hand". Either way the read and the write must be the same statement.

### 1.3 🔴 Stock can go negative under concurrent visits

[`consumeMaterialsForServices`](../src/lib/stock-consumption.ts) clamps each
line to `Math.min(quantity, onHand)` — but `onHand` came from a read taken
before the transaction opened. The transaction then issues an unconditional
`decrement`. Two visits recorded simultaneously that both consume the last 2
syringes both pass the clamp and both decrement, landing at −2.

The comment on that function says a cupboard cannot hold −3 gloves; the code
does not yet guarantee it. Same fix as 1.2 — move the clamp into the statement,
or add the `CHECK` constraint and treat the failure as "record the visit, flag
the discrepancy".

### 1.4 🔴 `nextSlotTime()` uses server-local time in a UTC-only app

[`scheduling.ts:63-66`](../src/lib/scheduling.ts):

```ts
const minutes = now.getHours() * 60 + now.getMinutes();
```

`getHours()` is **local** to the server process. Every other date computation in
the app is explicitly UTC (`today()`, `toDay()`, formatting pinned to
`timeZone: 'UTC'`), and DATA-MODEL §1 states that as a project-wide invariant.

If the app is ever deployed anywhere but a machine set to clinic time — a
container defaulting to UTC, a host in another region — "the rest of today"
shifts by the offset, and the dashboard's free-time card starts offering slots
that have already passed, or hiding slots that have not.

**Fix.** Decide where the clinic's wall clock comes from and use it everywhere.
Simplest: `getUTCHours()`/`getUTCMinutes()` plus a `CLINIC_UTC_OFFSET` (or
`CLINIC_TIMEZONE` via `Intl.DateTimeFormat`) constant next to `DAY_START_HOUR`,
which is the other place a clinic-local assumption is already hard-coded.

### 1.5 🔴 A declined appointment can be silently un-cancelled

[`respondToAppointment`](../src/lib/actions/confirmations.ts) rejects only
`COMPLETED` and `NO_SHOW`. A `CANCELLED` appointment is still answerable, and
answering "yes" sets `status = SCHEDULED`.

The realistic sequence: patient declines → the slot shows as free → the clinic
offers it to someone on the waiting list → the first patient re-opens the same
WhatsApp link and taps "yes" → the chair is now double-booked, with no warning
to anyone, because the confirmation path does not run `findConflicts`.

The token never expires, so this stays possible indefinitely.

**Fix.** Two small changes, either of which closes it:
- Treat a decline as terminal for that link — refuse the response when
  `declinedAt !== null`, and let the clinic re-book explicitly.
- Bound the token's usefulness by the appointment itself: refuse when
  `date < today()`.

Re-confirming is also worth an audit line and a visible flag on the day view, so
a flip-flop is something the front desk can see.

### 1.6 🟠 Deleting a material erases its consumption history

`StockItem` → `StockMovement` is Cascade. Removing a discontinued material
therefore deletes every movement that ever referenced it — and those movements
are exactly what the "material usage" chart and the 90-day burn rate read. Last
quarter's usage figures change retroactively, with no trace.

**Fix.** `onDelete: Restrict` plus an `archivedAt` column on `StockItem`, mirroring
the "deactivate, never delete" rule already applied to staff. The ledger is the
asset; the item row is just its label.

---

## 2. Modelling

### 2.1 🟠 Services are referenced by text, not by key

Three columns name a service as a free string:

| Column | Consequence |
| --- | --- |
| `Appointment.serviceName` | Renaming a service in the catalog does not update the calendar |
| `VisitRecord.services` | The "top services" chart groups by typed text — one typo, one extra space, or one entry made before a rename becomes a separate bar |
| `WaitlistEntry.serviceName` | Same, and the duration is copied rather than looked up |

`VisitRecord.services` is the worst of the three: it is a comma-separated list
in a single column, parsed with `String.split(',')`
([`utils.ts`](../src/lib/utils.ts)). A service whose name contains a comma
silently becomes two services. And because stock deduction runs off a *separate*
hidden `serviceIds` field on the same form
([`patients.ts:108-111`](../src/lib/actions/patients.ts)), the text list and the
materials actually deducted can disagree with nothing to reconcile them.

**Fix**, in increasing order of effort:

1. Add `serviceId String?` alongside `serviceName` on `Appointment` and
   `WaitlistEntry`. Keep the name as a **snapshot** (same reasoning as
   `Prescription.body`) but make the id the thing analytics groups by.
2. Replace `VisitRecord.services` with a join table:

   ```prisma
   model VisitService {
     visitId   String
     visit     VisitRecord @relation(fields: [visitId], references: [id], onDelete: Cascade)
     serviceId String?
     service   Service?    @relation(fields: [serviceId], references: [id], onDelete: SetNull)
     nameSnapshot String   // what it was called on the day
     @@id([visitId, serviceId])
   }
   ```

   This makes the top-services chart a `groupBy` instead of an in-memory string
   tally, and makes "which visits consumed this material" answerable.

### 2.2 🟠 Four columns are enums pretending to be strings

| Column | Valid values live in |
| --- | --- |
| `ToothRecord.status` | `TOOTH_STATUSES` in [`teeth.ts`](../src/lib/teeth.ts) |
| `StockMovement.reason` | Four string literals scattered across three action files |
| `AuditLog.action` | A doc comment on `AuditEntry` |
| `AuditLog.entity` | A doc comment on `AuditEntry` |

The schema already uses enums well for `Role`, `AppointmentStatus`,
`TreatmentPlanStatus`, `TreatmentStepStatus` and `DocumentKind`, so this is
inconsistency rather than a considered choice. `ToothRecord.status` is the one
that matters clinically: nothing at the database level stops a typo becoming a
tooth status, and `isToothStatus()` silently falls back to `HEALTHY` on unknown
input — a corrupted write would read as "nothing wrong with that tooth".

`AuditLog.action`/`entity` are the arguable ones: keeping them open means new
entity types need no migration. If they stay strings, the doc comment should
move into a `const` union that `AuditEntry` actually types against, so adding an
entity is a compile-time decision rather than a spelling one.

### 2.3 🟠 `startTime` as `String` pushes scheduling out of the database

`Appointment.date` (UTC midnight) + `startTime` (`"HH:MM"`) + `durationMin`
means the database cannot answer any temporal question. Consequences already
visible in the code:

- `getAppointmentsBetween` sorts by day in SQL then **re-sorts by clock time in
  JavaScript** ([`queries.ts:100-106`](../src/lib/queries.ts)).
- `findConflicts` and `findFreeGaps` each load the whole day and do interval
  maths in memory.
- There is no way to express "no two appointments may overlap" as a constraint,
  so the only thing preventing a double-booking is a check the user is allowed
  to override — and one write path (the confirmation link, §1.5) skips it.

**Fix.** Store `startsAt DateTime` and `endsAt DateTime` (keeping `date` as a
generated or denormalised day key for the existing index). Ordering and range
queries become SQL. And with `btree_gist`, Postgres can enforce the rule
directly while still permitting the deliberate override:

```sql
ALTER TABLE "Appointment" ADD CONSTRAINT no_overlap
  EXCLUDE USING gist (tstzrange("startsAt", "endsAt") WITH &&)
  WHERE (status IN ('SCHEDULED','COMPLETED') AND NOT "overrideConflict");
```

That is a bigger change than the others here, and it is reasonable to defer it —
but it is the root cause behind several of the smaller items.

### 2.4 🟠 A dead relation that promises a feature

```prisma
/// Booking the step links it here, so "3 of 5 done" and the calendar agree.
appointmentId String?      @unique
appointment   Appointment? @relation(...)
```

Nothing writes or reads `TreatmentStep.appointmentId` — grep finds zero
references outside the generated client. The calendar and the plan progress line
do **not** agree; a step is ticked off by hand, independently of whether its
appointment happened.

Either wire it up (booking from a plan step sets it; completing the appointment
offers to tick the step) or delete both fields. A schema comment describing
behaviour that does not exist is worse than no comment.

### 2.5 🟠 A stock movement cannot be traced to its cause

`StockMovement.reason` is `"used in visit"` — a string, with no `visitRecordId`.
So "why did we burn 40 syringes in March?" is unanswerable, and a mis-recorded
visit cannot have its deductions reversed except by hand.

Adding `visitRecordId String?` (SetNull) costs nothing and makes the ledger
self-explaining.

### 2.6 🟠 Patients are hard-deleted; everyone else is archived

**Fixed.** `Patient.archivedAt` is the ordinary action, on `patient.edit`, and
every list, picker, search, count and recall sweep filters on it
(`ACTIVE_PATIENTS`, the twin of `ACTIVE_STOCK`). True deletion stays owner-only
for an actual erasure request and still sweeps the files from §1.1.

Staff are deactivated because "the audit trail, recorded visits and stock
movements all point at them". Patients — who have far more history hanging off
them — are `Cascade`-deleted outright. The reasoning that protects a staff
account applies at least as strongly to a clinical record, and in most
jurisdictions dental records carry a legal retention period.

Consider `Patient.archivedAt` as the default action, with true deletion reserved
for an explicit "erase this person" (data-subject request) that also handles the
files from §1.1.

### 2.7 🟡 Nothing flags a duplicate patient

**Fixed.** The create path warns on a matching number and can be overridden, and
`mergePatients` answers the case the warning cannot: two records that already
exist. Everything pointing at the loser is repointed, the survivor's blanks are
filled from it, and the husk is archived.

`Patient.phone` is required and has no unique constraint and no index. The
booking flow now creates patients inline
([`appointments.ts:104-106`](../src/lib/actions/appointments.ts)), which makes
"Arta Krasniqi" existing twice much more likely — once from the front desk, once
from a hurried booking.

A hard `@unique` is too strict (families share a number). An index plus a
"a patient with this number already exists — did you mean…?" check in the
create path is the right shape.

---

## 3. Scale and performance

Everything here is invisible at 10 patients and painful at 3 000. Worth knowing
where the cliffs are before the clinic finds them.

### 3.1 🟡 The entire patient list is sent to the browser on every booking screen

**Fixed.** `searchPatients` + `PatientPicker` replaced the select, and `/patients`
itself is now paged — it was still loading every row with two sub-counts and a
reliability score each.

`getPatientOptions()` returns **every** patient, and the result is passed as a
prop to `AppointmentFormDialog`, which is a client component. It runs on the
dashboard, the appointments page and the patient detail page — and on the
dashboard it is handed to the free-time card as well. At 3 000 patients that is
a few hundred KB of names serialised into every one of those pages, on every
navigation, for a `<select>` most visits never open.

**Fix.** A typeahead: a small server action taking a query string, returning the
top 20 matches. The dialog already has a "new patient" path, so it is used to
not finding someone.

### 3.2 🟡 Missing indexes on the columns that are actually sorted and filtered

| Query | Missing index |
| --- | --- |
| `patient.findMany({ orderBy: [lastName, firstName] })` — every patient list | `@@index([lastName, firstName])` |
| `findConflicts` / `findFreeGaps` filter `date` **and** `status` | `@@index([date, status])` (only `date` exists) |
| `reorder.ts` groups movements by `itemId` within a date window | `@@index([itemId, createdAt])` (two single-column indexes exist) |
| `WaitlistEntry` joins to `Patient` | `@@index([patientId])` — absent, while `resolvedAt` is indexed |

### 3.3 🟡 The recalls page runs its heaviest query twice

`getRecalls()` and `getFollowUps()` each call `loadCandidates()`, which loads
every recall-eligible patient with two nested sub-selects. The recalls page calls
both in a `Promise.all`, so the query runs twice per render.

`getCurrentUser` already demonstrates the fix in this codebase — wrap
`loadCandidates` in React's `cache()` and both callers share one query per
request.

### 3.4 🟡 No caching anywhere, and a cache flush on every write

Every page carries `export const dynamic = 'force-dynamic'`, and every action
ends with `revalidatePath('/', 'layout')`. Together those mean: nothing is ever
cached, and the invalidation is a no-op paid for on every mutation.

That is a defensible choice for a clinic where data changes constantly and
staleness is dangerous — but it is currently implicit. The catalog pages
(services, stock, prescription templates) change rarely and would benefit from
tagged caching (`revalidateTag('services')`) if page time ever becomes an issue.

### 3.5 🟡 Search is unindexable, and inconsistent with the app's own helper

[`patients/page.tsx:38-51`](../src/app/[locale]/(app)/patients/page.tsx) searches
with `contains` + `mode: 'insensitive'` → `ILIKE '%q%'`, which no B-tree index
can serve.

More interesting: the new `matches()` helper in
[`utils.ts`](../src/lib/utils.ts) folds diacritics ("typing *cesh* has to find
*Çështje*") for in-memory filtering — but the server-side patient search does
**not**. So the same query behaves differently depending on which screen you
type it into, and Albanian names with ë/ç are exactly the case where it matters.

**Fix.** Either fold on write (an `unaccent`ed, lowercased `searchKey` column
with a `pg_trgm` GIN index, which also fixes the index problem), or use
Postgres's `unaccent()` in the query. Pick one and use it on both sides.

---

## 4. Operational

### 4.1 ⚪ No migration history

There is no `prisma/migrations/` directory; the workflow is `db push`. That is
fine while the schema is molten, but it means:

- no record of how production got to its current shape,
- no rollback,
- no way to apply a change to a running clinic database without Prisma deciding
  the diff at deploy time.

Before this runs anywhere real, run `prisma migrate dev --name init` once to
baseline, and switch to `migrate deploy` in the release step. Several of the
changes above (enums, added columns) need data migrations, not just schema ones.

### 4.2 ⚪ Backup has no restore, and quietly truncates

[`/api/backup`](../src/app/api/backup/route.ts) is a good piece of work — full
export, optional AES-256-GCM with PBKDF2 at 210 000 iterations, PIN hashes
excluded on purpose. Three gaps:

- **No import path exists.** An untested backup is a hope, not a backup. Even a
  script that reads the JSON and replays it into an empty database would turn
  this from a gesture into a guarantee.
- `auditLog` is capped at `take: 5000` with no note in the payload. A busy year
  exceeds that, and the export gives no indication that it was truncated — add a
  `truncated: true` flag, or page through it.
- The `note` field tells the reader that files are excluded, which is good — but
  nothing in the app verifies anyone is actually copying `storage/`.

### 4.3 ⚪ The audit log grows without bound

Append-only, with no retention policy. Nearly every mutation writes a row, and
so does every login, logout and refused permission check — it will be the
largest table in the database within a couple of years. Worth deciding now:
retain N years then archive to a file, or partition by month.

### 4.4 ⚪ There are no tests

No test files, no test runner in `package.json`. The pure logic in this codebase
is unusually easy to test and unusually consequential:

- `findFreeGaps` — merging, boundaries, the `after` cutoff
- `getRecalls` — the snooze/cooldown/booked suppression rules
- `getReorderSuggestions` — the burn-rate arithmetic
- `verifyConfirmationToken` — tampering, wrong length, wrong separator
- `toWhatsappNumber` — the Albanian prefix normalisation
- `summarise` in `reliability.ts` — the classification thresholds

None of them need a database. Six files of `node:test` would cover the parts of
the app where a silent wrong answer does real damage.

### 4.5 ⚪ Analytics mixes two time horizons on one page

Five panels use a 6-month window; the appointment-status donut and the
"completion rate" stat use `groupBy` over **all time**
([analytics/page.tsx:63](../src/app/[locale]/(app)/analytics/page.tsx)). A
reader comparing "visits this half-year" against "completion rate" is comparing
different periods without being told.

Either window the `groupBy` the same way, or label the donut "all time".

### 4.6 ⚪ Document access is not scoped to a patient

`/api/documents/[id]` checks `document.view` and nothing else — any signed-in
user holding that permission can fetch any document by id. For a four-person
clinic where the alternative is a shared folder on a desktop, that is a
reasonable call. Worth writing down as a decision rather than leaving it as an
implicit one, in case the app ever serves two practices.

---

## Suggested order

| # | Item | Why first |
| --- | --- | --- |
| 1 | §1.1 orphaned files | Data protection, ~10 lines |
| 2 | §1.2 / §1.3 stock races | Corrupts the ledger the reorder logic trusts |
| 3 | §1.5 un-cancelling | Causes a real double-booking, no one is told |
| 4 | §1.4 local-vs-UTC time | Breaks silently on the first non-local deploy |
| 5 | §4.1 baseline migration | Everything below needs it |
| 6 | §4.4 tests for the pure logic | Makes the rest safe to change |
| 7 | §2.1 service ids | The largest correctness win in the data model |
| 8 | §2.2 enums, §3.2 indexes | Cheap, mechanical, ride along with 7 |
| 9 | §3.1 patient typeahead | The first thing to hurt as the practice grows |
| 10 | §2.3 real timestamps | The right end state; do it deliberately, not under pressure |
