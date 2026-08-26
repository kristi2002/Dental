# A third pass — logic, automation, buttons, screens

August 2026. `GAPS-2026-08.md` worked the build, the deploy and the seam between
the logic and the query, and worked them down. This pass looks at a different
question: with all of that closed, **where does the app still make somebody do
something by hand, tell them something untrue, or refuse to let them undo a
press?**

The clinical model remains in good shape and nothing here is a rewrite. What
follows is nineteen findings from a phased read of the repository at `dcc6212`,
every one of them checked against the code rather than inferred from a document.

**How the search ran.** Five passes, each with its own question:

| Phase | Question | Method |
| --- | --- | --- |
| 1 | Which loops still do not close? | read every module whose job is a decision — `recalls`, `stock-alerts`, `outbox`, `scheduling`, `confirmations` — against the queries that feed it |
| 2 | What runs on its own, and who can see that it did? | jobs registry, sidecar crontab, `JobRun`, the outbox, the mailer |
| 3 | Which verbs exist in the code and on no screen? | every exported server action cross-referenced against every `.tsx`; every route cross-referenced against inbound links; every permission against its call sites |
| 4 | What does the domain imply that nothing implements? | schema relations read back against the screens that should show them |
| 5 | Where does the app lose work, or say nothing? | dialog and form plumbing, `ActionForm` vs `ReportingActionForm`, translation coverage, viewport and manifest |

**Legend** — 🔴 wrong now · 🟠 silently wrong · 🟡 friction · ⚪ operational

---

## Status

| § | Gap | Closed by |
| --- | --- | --- |
| L-01 | The recall cooldown read one of its two memories | `lastChasedAt` — the newest `RECALL`/`FOLLOW_UP` contact, taken against `lastRecallAt` |
| L-02 | `expectedAt` was compared to a date by nothing | `orderOverdue` / `orderLateBy`, read by the board, the reorder panel and the storage room |
| L-03 | A fourth hand-spelled occupancy filter | `OCCUPIES_A_SLOT` in `recalls.ts` |
| B-01 | `restoreStockAlert` had no caller, and nothing listed what was waved away | `alertQuietened` and the folded undo list at the foot of the board |
| B-02 | `unlinkBarcode` had no caller, and no screen showed a material's codes | `BarcodeList` on `/stock/[id]/edit` |
| L-04 | Confirming from the patient link un-arrived them | the status write dropped from `respondToAppointment` |
| A-01 | `JobRun` was written by the runner and read by nothing | `job-status.ts`, `jobs/board.ts`, and the **Scheduled jobs** card on `/staff` |
| L-05 | The evening reminder run could not see an evening booking | a second trigger at 07:00, in the sidecar and in both deployment paths |

Batch 1 is covered by pure tests and, where the bug lived in a `where`, by
assertions in `tests/query-layer.test.ts` — each checked by reintroducing the
bug it guards, which is the standard §8 of the last document set. Batch 2 is
covered by tests where it is a rule (`alertQuietened`) and by exercising the
running app where it is a button, which is the only place a missing caller can
be shown to exist.

Two of the three Batch 2 items were verbs the app already had. That is worth
saying plainly, because it is the finding rather than the fix: `unlinkBarcode`
and `restoreStockAlert` were both written, guarded, audited and correct, and
both had been unreachable since the day they were added — one of them with a
comment claiming the reversibility it did not provide. A test suite cannot see
this and a typecheck cannot either. Cross-referencing exported actions against
components can, which is why phase 3 of the search exists.

Batch 3 is covered by `tests/job-status.test.ts` for the decision and by the
running app for the screen. One thing it is **not** covered by, and the reason
is worth recording: the **Run now** button cannot be click-verified here.
`document.visibilityState` stays `hidden` in this browser pane even when the tab
is fronted, so React defers hydration indefinitely and a form whose action is a
server action posts natively — which Next then refuses, because a native post
from this pane carries `origin: null`. Every server action in the app is
unreachable from this environment. The work the button triggers was exercised
through `/api/jobs/<name>`, which is the same `runJob`.

Everything below **Batch 3** in the plan is still open.

---

## 1. Logic gaps

### L-01 🔴 The recall list does not learn from the message you just sent

Two memories of one event, and this is the pair that actually costs a phone
call. [ReminderLinks](../src/components/appointments/ReminderLinks.tsx) writes a
`Contact` row when a recall message is opened — that is its documented purpose,
"the closest thing to *a message was sent* this app can honestly record".
[selectRecalls](../src/lib/recalls.ts) suppresses a row on one thing and one
thing only:

```ts
if (patient.lastRecallAt && daysBetween(patient.lastRecallAt, now) < CONTACT_COOLDOWN_DAYS) continue;
```

`lastRecallAt` is written by exactly one function —
[`markRecallContacted`](../src/lib/actions/patients.ts) — which is the separate
**Contacted** button, and which writes no `Contact` row in return. So:

- WhatsApp a patient from the recall list → the contact log records it, the
  recall list does not, and they are still on it tomorrow, and the day after.
- Press **Contacted** → the list goes quiet for thirty days, and the patient's
  own contact history shows nothing.

`selectFollowUps` reads the same column, so the two-day "how is the tooth"
call has the same hole. This is **G-32**, still open, and it is the reason a
recall list stops being trusted: it asks twice.

**Fix.** Derive, as the app does everywhere else. Load the newest `Contact` with
purpose `RECALL` / `FOLLOW_UP` alongside the candidates and take the cooldown
from `max(lastRecallAt, lastContactAt)`. `lastRecallAt` then survives as what it
honestly is — the manual tick — rather than as the only memory. A pure-function
test on `selectRecalls` already exists to extend.

### L-02 🟠 An order that never arrives silences the shelf for ever

[`alertVisible`](../src/lib/stock-alerts.ts) has three ways to be quiet, and the
second has no exit:

```ts
if (item.orderedAt !== null) return false;
```

`StockItem.expectedAt` is collected by `markOrdered`, stored, and rendered as a
badge — and **nothing in the repository ever compares it to a date.** Grep it:
every site is a write, a select, or a `format.dateTime`.

So: mark the gloves ordered on the 3rd, expected the 10th, supplier never
delivers. On the 11th the material is not on the reminder board, is not in the
dashboard's low-stock count, and the reorder panel shows a calm blue **On
order**. The alarm is switched off by the act of promising to fix it, and there
is no clock to switch it back on.

The app already does this arithmetic correctly one module away —
[`workStatus` / `daysLate`](../src/lib/works.ts) turn a lab case's promised date
into `overdue` / `dueToday` / `dueSoon`, and the dashboard has a panel for it.
The storage room has the same column and none of the reading.

**Fix.** `orderOverdue(item, today)` beside `isLow`, a third severity on the
board — *ordered 12 days ago, expected the 10th* — and its own count. Pure, so
it lands in `tests/stock-alerts.test.ts` with the rest.

### L-03 🟠 One occupancy check still spells the status list by hand

`GAPS-2026-08` §8.2 found `ARRIVED` missing from three inline status arrays and
replaced them with [`OCCUPIES_A_SLOT`](../src/lib/scheduling.ts), whose comment
says three inline arrays is how one came to disagree with the other twelve.
There is a fourth, and the sweep missed it:

```ts
// recalls.ts — "anyone already booked is not overdue"
appointments: { where: { date: { gte: now }, status: AppointmentStatus.SCHEDULED } },
```

Mark a patient **Arrived** and their appointment stops counting as a booking. If
they are also past their recall interval and outside the cooldown — a patient
who has not been in for eight months, which is precisely who is sitting there —
they surface on the recall list while they are in the chair. Same class of bug,
same silent direction, one line.

### L-04 🟡 Confirming from the patient's own link un-arrives them

[`respondToAppointment`](../src/lib/actions/confirmations.ts) is carefully
guarded — COMPLETED, NO_SHOW, CANCELLED, `declinedAt`, and any date in the past
are all refused, each with its reasoning written out. `ARRIVED` is not among
them, and the "yes" branch writes `status: SCHEDULED` unconditionally.

A patient in the waiting room who opens yesterday's WhatsApp and taps **yes** is
written back to SCHEDULED with `arrivedAt` still stamped at 09:02. The day list
drops them out of the queue the dentist is working; the record disagrees with
itself.

**Fix.** Either add ARRIVED to the terminal list, or — better, since the answer
is not *wrong*, only late — stamp `confirmedAt` and leave `status` alone.

### L-05 🟡 The evening job cannot see an evening booking

The cron is `0 18 * * *` for tomorrow, and `dedupeKey` is unique per
appointment, so a run is idempotent by construction — which is also why a second
run cannot fill a gap the first one left. A slot booked at 18:30 for nine the
next morning never gets a queue row at all.

Nobody would notice, because the dashboard's *to remind* panel is a live query
and shows them. That is the tell: the two surfaces disagree, and the one that is
incomplete is the queue somebody is told to work down.

**Fix.** A second trigger at, say, `0 7 * * *`. It costs one line of the sidecar
crontab and the dedupe makes it free.

### L-06 🟡 The dashboard's heaviest read is the one that was never paged

`getRecalls()` sits in the dashboard's `Promise.all`, and
[`loadCandidates`](../src/lib/recalls.ts) is `findMany` over **every active
patient**, each with their newest visit record and their future appointments,
filtered afterwards in JavaScript. The patients list was paged in the Phase 11
work; this was not, and it runs on the screen everyone opens first every
morning.

`cache()` stops it running twice per render. It does not stop it being the whole
table.

---

## 2. Automation and observability

### A-01 🟠 Nothing in the app can see whether the clock is running

`JobRun`'s own doc comment is the finding:

> A table rather than the status file the backup sidecar writes, and
> deliberately: … these run inside the app, against this database, **and are read
> by the same pages everything else is.**

They are read by nothing. Every reference to `prisma.jobRun` in the repository is
inside [`runJob`](../src/lib/jobs/run.ts) — one in-flight guard and two writes.
No page, no card, no query.

The backup, which has the same failure mode, got three components
(`BackupCard`, `BackupStatusCard`, `BackupCheckCard`) and a banner. The jobs got
a table and no reader. So `queue-appointment-reminders` throwing every evening
since March presents to the practice as **an empty outbox** — and an empty
outbox is explicitly documented on that screen as the *good* state ("yesterday
evening's was worked"). The failure and the success look identical.

**Fix.** A card on `/staff` beside the backup ones: each registered job, its last
run, ok/failed/never-run, the summary line, and a **Run now** for
`staff.manage`. The runner already returns a typed `JobResult`; this is a query
and a table.

### A-02 ⚪ The queue carries one kind, and it is the least consequential one

`MessageKind` has a single value. `dedupeKey`'s doc writes out the two shapes it
does not yet carry, and says the key had to accommodate them or it was the wrong
key:

```
reminder:<appointmentId>        one booking, one reminder, ever
birthday:<patientId>:2026       once a year
recall:<patientId>:2026-08      once a cycle
```

So the appointment reminder — a courtesy about a slot the patient already agreed
to — has a clock, a queue, a dedupe, a skip-reason on every row it declines, and
a screen. The recall — a patient who has not been seen for eight months — has a
list somebody has to remember to open, no queue, no record of why anybody was
skipped, and (per L-01) a suppression rule that does not read the contact log.

The machinery is built. This is the second tenant it was designed for.

### A-03 ⚪ There is no web app manifest

`public/` holds the brand images and the zxing wasm. No `manifest.webmanifest`,
no `manifest` in the locale layout's metadata. So the front-desk tablet cannot
install the app to its home screen and every shift starts in a browser tab with
an address bar — on a screen whose entire design brief is large type and one
obvious thing per view. The icons and `themeColor` are already there.

---

## 3. Verbs that exist in the code and on no screen

Found by cross-referencing every exported server action against every component.
Two survived, and both are the same shape: a press made in a hurry, by the
person holding the object, with no way back.

### B-01 🟠 "Not now" on a stock alert cannot be undone

[`restoreStockAlert`](../src/lib/actions/stock.ts) is written, audited,
race-safe (`deleteMany`, so a second press is a no-op), and documented as:

> The counterpart to every dismissal in this app being reversible without a
> database client. Waving an alert away is one press on a board somebody is
> skimming, which makes it exactly the press that gets mis-aimed.

**No component calls it.** `StockAlertList` renders **Order it** and **Not now**
and nothing else, and no screen anywhere lists what has been dismissed.

The only other way out is `dismissalHolds` — the board asks again when the count
drops *below* what was waved away. For a material bought once a year that is the
difference between a mis-aimed press and running out.

### B-02 🟠 A barcode linked to the wrong material is permanent

Same shape, sharper consequence. `BarcodeLinkDialog` is offered from the failed
scan, deliberately: *"the person who knows what the code means is the one holding
the carton."* That is also the person most likely to pick the wrong row from a
list of eleven composites.

[`unlinkBarcode`](../src/lib/actions/scan.ts) has no caller, and **no screen in
the app shows what codes a material carries** — `/stock/[id]/edit` does not
mention barcodes at all. So a mislinked code makes every future scan of that
carton draw down the wrong shelf, silently, and the only visible symptom is a
stock count that drifts.

**Fix.** A barcodes block on the stock edit form: the `ProductBarcode` rows, and
an unlink button per row. The action is already written.

### B-03 🟡 Forty-six actions can refuse and say nothing

`if (!user) return;` appears 46 times across `src/lib/actions/`, and 57 of the
71 button forms rendered in the app are the plain `ActionForm`, whose own doc
says:

> That is fine for a verb whose result is obvious on the page a moment later and
> wrong for one whose result is that nothing happened.

`ReportingActionForm` exists for exactly this and is used 14 times. The gap is
the verbs whose effect is *not* visible a moment later — dismissing an alert
inside a modal, marking a material ordered, unlocking a member of staff, ticking
a follow-up done. A press denied for want of a permission, or one that lost a
race, flickers and returns an unchanged page.

Not a sweep of all 46 — a pass over the ones whose success is invisible.

---

## 4. What the domain implies and nothing implements

### F-01 🟠 The patient record cannot answer "is my crown back yet"

Eight tabs — details, chart, history, plans, documents, prescriptions,
appointments, contacts. `Work.patientId` and `FollowUp.patientId` are real
relations, and **the patient screen reads neither.**

That question is asked at the desk with the patient's record already on the
screen, and answering it means leaving the record, opening `/works`, and
searching for a name. The follow-up board has the same hole from the other end:
a line that says *ring Berisha about the bridge* is invisible on Berisha.

**Fix.** A **Works** tab (or a card on details when the count is non-zero) and
the patient's open follow-ups beside the alerts. Both are one relation each; the
list components already exist.

### F-02 🟡 There is no list of the prescriptions the practice has issued

`/prescriptions` is the **template** catalogue. An issued `Prescription` is
reachable only at `/prescriptions/<id>`, and the only path to that id is through
the patient who received it.

So "what did we prescribe this month", "who else got that antibiotic", and
"reprint Tuesday's script for the patient whose name I half-remember" are all
unanswerable, and the nav item labelled **Prescriptions** opens something the
dentist did not mean by the word.

### F-03 🟡 Nobody can change their own PIN

`saveStaff` is the only path that writes `pinHash`, and it is gated on
`staff.manage` — owner only. `UserMenu` offers Settings, Staff, Activity, Sign
out.

Two consequences. A receptionist who thinks somebody watched them type cannot do
anything about it without asking the owner. And the owner necessarily sets — and
therefore knows — every PIN in the practice, which is worth saying out loud in an
app whose audit trail attributes every chart opening to one of them.

### F-04 🟡 The calendar cannot be filtered by chair

`Operatory` exists, `Appointment.operatoryId` exists, the booking dialog offers
it once there is more than one, and [`collides()`](../src/lib/scheduling.ts)
treats a shared chair as a clash. The calendar's search params are
`view`, `date`, `staff`, `status`.

So the app can answer *how full is Thursday for Dr B* and not *what is chair 2
doing* — and the second is the question a two-chair practice asks when deciding
whether it can take a walk-in.

### F-05 ⚪ Statistics has one window and no way to change it

`MONTHS_TRACKED = 6`, a module constant. No period selector, no year-on-year, no
print and no export — on the one screen in the app that exists to be read by the
owner rather than worked by the desk. Every other list in the app grew a filter
bar; this one did not.

---

## 5. UX

### U-01 🟠 "Waiting on the laboratory" hands you the patient's phone number

The dashboard panel is headed *Waiting on the laboratory*, subtitled *N cases due
back now or within days*, and the only clickable thing on each row is:

```tsx
<a href={`tel:${work.phone.replace(/\s/g, '')}`}>{work.phone}</a>
```

`Work.phone` is documented in the schema as the patient's number, snapshotted
from the docket. The errand is to ring the lab. The number offered is the one
person who cannot help.

This is **G-35** — still open, and §6.1 of `GAPS-2026-08` argued the fix: a flat
`Lab { name, phone }`, the same shape `WorkProcedure` already took for the same
reason, with `WorkLine` keeping its text snapshot alongside the key. It also
stops `lab` drifting across three spellings, which the works page's own lab
filter is currently built from.

### U-02 🟡 A half-written clinical note dies on Escape

`FormDialog` is a native `<dialog>`. Escape closes it; there is no `cancel`
handler, no confirmation, and `beforeunload` appears nowhere in the repository.
`useRecoveredForm` puts typed values back after a **refusal** — it does nothing
for a close.

The longest free text anybody types into this app is a visit write-up, and it is
in one of these dialogs. So is a treatment plan. One stray Escape, or one
mis-aimed click on the backdrop, and it is gone with no prompt.

---

## The plan

Ordered so each batch stands alone and ships. Costs are rough and assume the
existing test conventions — pure logic gets a unit test, anything touching a
`where` gets a case in `tests/query-layer.test.ts`, which is what §8 of the last
document exists to teach.

### Batch 1 — the three that are silently wrong *(~1 day)*

The whole batch is small edits to decision modules, and every one of them fails
in the direction that looks healthy, which is why none has been noticed.

1. **L-01** — cooldown reads the contact log. Extend `PatientForRecall` with the
   newest RECALL/FOLLOW_UP contact; take `max()` in `selectRecalls` and
   `selectFollowUps`. Tests: contacted-by-message suppresses; contacted-by-tick
   suppresses; neither, after 30 days, returns.
2. **L-03** — `OCCUPIES_A_SLOT` in `recalls.ts`. One line, one query-layer
   assertion (an ARRIVED patient is not on the recall list).
3. **L-02** — `orderOverdue()` in `stock-alerts.ts`, a third board severity, a
   count on the stock page and the dashboard. Pure; tests beside `dismissalHolds`.

### Batch 2 — the doors that only open one way *(~half a day)*

4. **B-01** — a **Restore** button, and dismissed alerts shown (folded, at the
   foot of the board) so there is something to press it on.
5. **B-02** — a barcodes block on `/stock/[id]/edit` with unlink per row.
6. **L-04** — ARRIVED handled in `respondToAppointment`.

Both actions already exist, are already audited, and need only a caller.

### Batch 3 — make the clock visible *(~half a day)*

7. **A-01** — a jobs card on `/staff`: last run, outcome, summary, **Run now**.
   This is the batch that makes the other automation work trustworthy, so it goes
   before A-02 rather than after.
8. **L-05** — a second reminder trigger in the sidecar crontab.

### Batch 4 — close the loops around the patient *(~1–2 days)*

9. **U-01 + the `Lab` entity** — `Lab { name, phone, notes }`, `WorkLine.labId`
   beside the text snapshot, a migration that seeds one row per distinct existing
   spelling. Then the dashboard's chase row dials the laboratory, the works
   filter stops drifting, and "how much went to each lab this quarter" becomes
   answerable. This is the largest single item on the list and the one with the
   most downstream payoff.
10. **F-01** — works and open follow-ups on the patient record.
11. **F-02** — an issued-prescriptions list, `?q=` searchable, filed under the
    prescriptions section the way `/services/categories` is filed under services.

### Batch 5 — the rest, in the order they are worth doing

12. **B-03** — move the invisible-result verbs to `ReportingActionForm`.
13. **A-02** — `RECALL_DUE` in the outbox, a weekly `queue-recalls` job. Depends
    on L-01 being done first, or it queues the same people the list already
    double-chases.
14. **F-04** — an operatory filter on the calendar, beside the provider one.
15. **U-02** — guard the dialog: confirm on Escape/backdrop when the form is
    dirty.
16. **F-03** — a **Change my PIN** dialog in the user menu, current PIN required.
17. **F-05** — a period selector on statistics.
18. **L-06** — page or bound `loadCandidates`.
19. **A-03** — a web app manifest.

### What is deliberately not on this list

- **Billing.** `schema.prisma` line 2 rules it out in the first sentence of the
  file, and nothing found here argues with that.
- **Pruning the activity log on a timer.** The jobs registry states the case;
  retention is not a decision a cron gets to make.
- **Writing NO_SHOW automatically.** Same register, same reasoning — marking a
  patient absent is an accusation and should have a person behind it.
