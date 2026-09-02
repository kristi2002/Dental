# The systems this application is made of

**Eighteen systems, in four families.** This document draws the borders, scores
each system against a common rubric, and lists what would raise it.

**Pass 1, 2026-09-02 — the platform reads 86%: production-solid.** The scores are
in [§6](#6-the-audit-rubric), what the pass actually read in [§6.1](#61-what-this-pass-actually-read),
and the gaps in [§7](#7-the-gaps-by-system).

The pass found one real defect — a double-booking race across four write paths —
and **it is fixed**; The Book went 76 → 83 for it. What still holds that system
back is the schema underneath it: appointment times are strings, so the overlap
rule cannot be a database constraint. Everything else outstanding is content or
configuration, not code.

Companion documents:

| Document | Answers |
| --- | --- |
| [APP-BLUEPRINT.md](APP-BLUEPRINT.md) | What every *screen* is and how the screens are wired |
| [DATA-MODEL.md](DATA-MODEL.md) | What the *tables* are and how they relate |
| [IMPROVEMENTS.md](IMPROVEMENTS.md) | What is wrong with the code that exists |
| [ROADMAP.md](ROADMAP.md) | What did not exist yet (phases 1–10, all now implemented) |
| **This document** | What the *systems* are, where each begins and ends, and how ready each one is |

**Why the borders are drawn where they are.** Not by folder — `src/lib/` is one
flat drawer of ninety files and `src/lib/actions/` another of thirty-two. Not by
route either, because one system can own eleven screens and another can own
none. A system here is **a set of tables, the logic that maintains them, and the
screens that show them, which could in principle be lifted out whole**. Where a
file genuinely serves two, it is listed under both and the overlap is named.

---

## 1. The map

```
┌─ THE CHAIR ──────────────────┐  ┌─ THE PRACTICE ────────────────┐
│  1  Patient Records          │  │  6  The Book (scheduling)     │
│  2  Clinical Charting        │  │  7  Services & Catalogue      │
│  3  Treatment Planning       │  │  8  Stock & Inventory         │
│  4  Prescribing              │  │  9  Analytics & the Day Sheet │
│  5  Lab Works                │  │                               │
└──────────────────────────────┘  └───────────────────────────────┘

┌─ THE VOICE ──────────────────┐  ┌─ THE FOUNDATION ─────────────┐
│ 10  Correspondence (mailbox) │  │ 14  Identity, Access & Audit │
│ 11  Nudges (recalls, queue)  │  │ 15  Documents & File Vault   │
│ 12  The Board (follow-ups)   │  │ 16  Automation & Jobs        │
│ 13  Storefront & Intake      │  │ 17  Backup & Continuity      │
└──────────────────────────────┘  │ 18  Platform Shell           │
                                  └──────────────────────────────┘
```

### At a glance

Weight is lines of TypeScript owned by the system — libs, server actions,
components and its own routes. It measures surface to audit, not quality. The
whole application is ~104,000 lines of hand-written source over ~2,970 lines of
Prisma schema, plus ~12,500 lines of translation and ~14,000 lines of test.

| # | System | Family | Weight | Owns (tables) | Ready? |
| --- | --- | --- | ---: | --- | --- |
| 1 | Patient Records | Chair | 8.8k | `Patient`, `PatientAlert` | **87%** |
| 2 | Clinical Charting | Chair | 8.9k | `VisitRecord`, `ToothRecord`, `ToothFinding`, `ChartExam`, `PerioExam` | **86%** |
| 3 | Treatment Planning | Chair | 5.1k | `TreatmentPlan`, `TreatmentStep` | **86%** |
| 4 | Prescribing | Chair | 2.9k | `Prescription`, `PrescriptionTemplate` | **87%** |
| 5 | Lab Works | Chair | 5.8k | `Work`, `WorkLine`, `Lab`, `WorkProcedure` | **84%** |
| 6 | The Book | Practice | 7.1k | `Appointment`, `ClinicHours`, `Closure`, `Operatory`, `WaitlistEntry` | **83%** |
| 7 | Services & Catalogue | Practice | 2.3k | `Service`, `ServiceCategory`, `VisitService` | **85%** |
| 8 | Stock & Inventory | Practice | 13.5k | `StockItem`, `StockBatch`, `StockMovement`, `Supplier`, `PurchaseOrder`, `ProductBarcode`, … | **89%** |
| 9 | Analytics & Day Sheet | Practice | 1.3k | `PracticeDigest` | **85%** |
| 10 | Correspondence | Voice | 6.4k | `EmailThread`, `EmailMessage`, `EmailAttachment`, `Contact` | **85%** |
| 11 | Nudges | Voice | 1.6k | `ScheduledMessage` | **87%** |
| 12 | The Board | Voice | 2.1k | `FollowUp`, `FollowUpAttachment` | **86%** |
| 13 | Storefront & Intake | Voice | 15.4k | `AppointmentRequest`, `AppointmentRequestAttachment` | **83%** |
| 14 | Identity, Access & Audit | Foundation | 5.6k | `StaffUser`, `AuditLog` | **88%** |
| 15 | Documents & File Vault | Foundation | 1.1k | `PatientDocument` | **88%** |
| 16 | Automation & Jobs | Foundation | 0.8k | `JobRun` | **86%** |
| 17 | Backup & Continuity | Foundation | 1.0k | *(none — reads everything)* | **90%** |
| 18 | Platform Shell | Foundation | 11.6k | `ClinicProfile` | **87%** |

**`Ready?` is the pass-1 audit score** — the working in [§6](#6-the-audit-rubric),
the gaps in [§7](#7-the-gaps-by-system). Whole platform: **86%**.

---

## 2. The Chair — what happens to a patient

### 1 · Patient Records

> Who the practice knows, how to reach them, and what would hurt them.

The root of the graph. Almost every other table hangs off `Patient.id`.

- **Tables** — `Patient`, `PatientAlert` (allergies, conditions, severities),
  `PatientSex`, `MedicalAlertKind`, `AlertSeverity`
- **Logic** — [patients.ts](../src/lib/actions/patients.ts) (55KB, the largest
  action file in the repo), [patient-search.ts](../src/lib/patient-search.ts),
  [search-match.ts](../src/lib/search-match.ts) (accent-tolerant matching for
  Albanian names), [medical.ts](../src/lib/medical.ts),
  [reliability.ts](../src/lib/reliability.ts) (no-show pattern from history),
  [patients-import.ts](../src/lib/patients-import.ts) /
  [patients-export.ts](../src/lib/patients-export.ts)
- **Screens** — `/patients`, `/patients/[id]` (the tabbed record), `/patients/new`,
  `/patients/import`, `/patients/[id]/print`
- **Boundary** — it owns identity and the medical flags. It does *not* own the
  chart (→ 2), the files (→ 15), or the contact log (→ 10). `patient.medical.view`
  is a separate permission from `patient.view` on purpose: the front desk gets a
  number and a slot, not a diagnosis.

### 2 · Clinical Charting

> The mouth, and what was done to it on a given day.

The densest domain logic in the project. [teeth.ts](../src/lib/teeth.ts) alone is
38KB.

- **Tables** — `VisitRecord`, `ToothRecord`, `ToothFinding`, `ToothFindingStatus`,
  `ChartExam`, `PerioExam`, `ToothNumbering`
- **Logic** — [teeth.ts](../src/lib/teeth.ts) (FDI / Universal / Palmer numbering,
  surfaces, glyphs), [perio.ts](../src/lib/perio.ts) (pocket depths, bleeding,
  recession, indices), [tooth-chart.ts](../src/lib/tooth-chart.ts),
  [tooth-span.ts](../src/lib/tooth-span.ts) (bridges across teeth),
  [visit-link.ts](../src/lib/visit-link.ts) — which visit today's work belongs to,
  the seam six tables share
- **Screens** — the chart and perio tabs inside `/patients/[id]`; 10 components,
  7,100 lines, in [src/components/dental](../src/components/dental)
- **Boundary** — a finding is clinical fact. Turning it into planned work is → 3;
  turning it into a crown order is → 5; the boxes it consumed are → 8.

### 3 · Treatment Planning

> A course of treatment over several visits, and how far along it is.

- **Tables** — `TreatmentPlan`, `TreatmentStep`, `TreatmentPlanStatus`,
  `TreatmentStepStatus`
- **Logic** — [plans.ts](../src/lib/actions/plans.ts) (33KB),
  [plan-progress.ts](../src/lib/plan-progress.ts) ("3 of 5 done", stalled
  detection), [plan-steps.ts](../src/lib/plan-steps.ts),
  [plan-sync.ts](../src/lib/plan-sync.ts) (step ⇄ appointment, both directions),
  [plan-filter.ts](../src/lib/plan-filter.ts),
  [plans-export.ts](../src/lib/plans-export.ts)
- **Screens** — `/plans` (every course across all patients, stalled first),
  `/plans/new`, `/plans/[id]`, `/plans/[id]/print`
- **Boundary** — it is a *promise* about the future. The 60-day-quiet rule that
  turns a stalled plan into a telephone call is here; the message that results
  is → 11.

### 4 · Prescribing

> The dentist's signature on a piece of paper.

- **Tables** — `Prescription` (issued text kept verbatim, never re-rendered),
  `PrescriptionTemplate`, `PrescriptionTemplateService`
- **Logic** — [prescriptions.ts](../src/lib/actions/prescriptions.ts),
  [drugs.ts](../src/lib/drugs.ts) (13KB drug reference),
  [pdf.ts](../src/lib/pdf.ts) (18KB — the one-page printable sheet, `pdf-lib`)
- **Screens** — `/prescriptions` (templates), `/prescriptions/templates/new`,
  `/prescriptions/issued`, `/prescriptions/[id]`
- **Boundary** — the one clinical act withheld from `ASSISTANT`. Allergy
  cross-checks read → 1's alerts, but the alerts are not owned here.

### 5 · Lab Works

> Crowns, bridges and dentures: what left the building and whether it came back.

- **Tables** — `Work`, `WorkLine`, `Lab`, `WorkProcedure`
- **Logic** — [works.ts](../src/lib/works.ts) (20KB),
  [labs.ts](../src/lib/labs.ts),
  [work-procedures.ts](../src/lib/work-procedures.ts),
  [works-sheet.ts](../src/lib/works-sheet.ts),
  [pdf-docket.ts](../src/lib/pdf-docket.ts) (17KB — the docket that travels with
  the case), [pdf-sheet.ts](../src/lib/pdf-sheet.ts)
- **Screens** — `/works`, `/works/new`, `/works/[id]`, `/works/[id]/print`,
  `/works/labs`, `/works/procedures`; API `/api/works/[id]/docket`,
  `/api/works/export`
- **Boundary** — replaced the removed `LabCase` model (see the blueprint's note).
  "Your crown is back" as a *message* is → 11; the register only knows
  `receivedAt`.

---

## 3. The Practice — running the place

### 6 · The Book

> When the practice is open, who is coming, and which chair they sit in.

Everything downstream of "when are we open" lives here, which is why it is the
system with the most edges out.

- **Tables** — `Appointment`, `AppointmentStatus`, `CancelledBy`, `ClinicHours`,
  `Closure`, `Operatory`, `WaitlistEntry`
- **Logic** — [scheduling.ts](../src/lib/scheduling.ts) (14KB — `collides()`, the
  double-booking rule; free-gap search), [dates.ts](../src/lib/dates.ts) and
  [clinic-hours.ts](../src/lib/clinic-hours.ts) (one `CLINIC_TIME_ZONE` wall
  clock), [date-names.ts](../src/lib/date-names.ts) (three languages),
  [calendar-feed.ts](../src/lib/calendar-feed.ts) (signed iCal at
  `/api/calendar/[token]`), [confirmations.ts](../src/lib/confirmations.ts) +
  [signed-links.ts](../src/lib/signed-links.ts) (patient confirms with no login;
  a decline frees the slot), [waitlist.ts](../src/lib/waitlist.ts),
  [appointments.ts](../src/lib/actions/appointments.ts) (27KB)
- **Screens** — `/appointments` (Day / Week / List), `/day-sheet`,
  `/confirm/[token]` (public)
- **Boundary** — it owns *time*. The service that sets a duration is → 7; "you
  have an appointment tomorrow" is → 11; the public opening-hours block on the
  storefront reads these same rows (→ 13) rather than a second copy.

### 7 · Services & Catalogue

> What the practice does, how long each takes, and what it eats.

- **Tables** — `Service`, `ServiceCategory`, `VisitService` (the bridge from a
  visit to what was actually done)
- **Logic** — [services.ts](../src/lib/actions/services.ts),
  [catalog.ts](../src/lib/catalog.ts),
  [catalogue-import.ts](../src/lib/catalogue-import.ts) (11KB, CSV),
  [money.ts](../src/lib/money.ts)
- **Screens** — `/services`, `/services/new`, `/services/categories`,
  `/services/import`
- **Boundary** — the smallest system in the Practice family and the most
  load-bearing: it feeds appointment duration (→ 6), plan steps (→ 3), automatic
  stock deduction (→ 8) and the statistics (→ 9). **Nothing is charged** — there
  is no billing anywhere in this application, by design.

### 8 · Stock & Inventory

> The storage room. The largest system in the codebase.

- **Tables** — `StockItem`, `StockProduct`, `StockCategory`, `StockBatch`,
  `StockMovement`, `Supplier`, `PurchaseOrder`, `PurchaseOrderLine`,
  `ProductBarcode`, `StockAlertDismissal`
- **Logic** — [stock.ts](../src/lib/actions/stock.ts) (59KB, the largest file in
  the repo), [stock-ledger.ts](../src/lib/stock-ledger.ts),
  [batch-allocation.ts](../src/lib/batch-allocation.ts) (oldest-expiry-first
  draw-down), [expiry.ts](../src/lib/expiry.ts),
  [stock-consumption.ts](../src/lib/stock-consumption.ts) (automatic deduction
  from a visit's services), [reorder.ts](../src/lib/reorder.ts) (a suggested
  order from real consumption),
  [purchase-orders.ts](../src/lib/purchase-orders.ts),
  [stock-costs.ts](../src/lib/stock-costs.ts),
  [stock-alerts.ts](../src/lib/stock-alerts.ts),
  [barcode.ts](../src/lib/barcode.ts) + [qr.ts](../src/lib/qr.ts) (22KB) +
  [use-scanner.ts](../src/lib/use-scanner.ts) +
  [scan-index.ts](../src/lib/scan-index.ts) (the whole symbol table shipped to
  the browser, so a beep needs no round trip)
- **Screens** — sixteen of them: `/stock`, `/stock/new`, `/stock/[id]`,
  `/stock/[id]/edit`, `/stock/catalog`, `/stock/categories`, `/stock/suppliers`,
  `/stock/orders`, `/stock/expiry`, `/stock/labels`, `/stock/scan`,
  `/stock/stocktake`, `/stock/import`, plus the QR landing at
  `/stock/q/[kind]/[id]`
- **Boundary** — it owns quantities and cost-in, never money-out. It is driven by
  → 7 (a service declares its materials) and reports into → 9 and → 11.

### 9 · Analytics & the Day Sheet

> The practice looking at itself.

The thinnest system by weight because it is almost entirely *derived* — it stores
one table and computes the rest at read time.

- **Tables** — `PracticeDigest` (ten integers and a date; the sentence is composed
  when somebody looks, in the reader's language)
- **Logic** — [utilisation.ts](../src/lib/utilisation.ts) (chair time sold, not
  appointments counted), [digest.ts](../src/lib/digest.ts) +
  [jobs/digest.ts](../src/lib/jobs/digest.ts), plus the aggregate queries in
  [queries.ts](../src/lib/queries.ts)
- **Screens** — `/analytics`, `/day-sheet` (the morning brief, printable)
- **Boundary** — read-only over every other system. It writes nothing except the
  digest row, and even that row is never sent anywhere.

---

## 4. The Voice — reaching people

The four systems here share one design line, stated in
[jobs/registry.ts](../src/lib/jobs/registry.ts): **nudge, don't send.** Nothing
in this application messages a patient on its own. Every one of these fills a
queue a person works down.

### 10 · Correspondence

> The practice's mailbox: real email, in and out, threaded.

- **Tables** — `EmailThread`, `EmailMessage`, `EmailAttachment`, `EmailDirection`,
  `EmailBounceKind`, and `Contact` (the log of what was said to whom, on which
  channel, for what purpose)
- **Logic** — the whole of [src/lib/messages/](../src/lib/messages):
  [mailer.ts](../src/lib/messages/mailer.ts) (Brevo over HTTPS, not SMTP),
  [inbound.ts](../src/lib/messages/inbound.ts) (webhook parse + thread matching),
  [delivery.ts](../src/lib/messages/delivery.ts) (bounces, opens, complaints),
  [threads.ts](../src/lib/messages/threads.ts),
  [compose.ts](../src/lib/messages/compose.ts),
  [templates.ts](../src/lib/messages/templates.ts),
  [outbox.ts](../src/lib/messages/outbox.ts),
  [correspondence.ts](../src/lib/messages/correspondence.ts),
  [opt-out.ts](../src/lib/opt-out.ts)
- **Screens** — `/inbox`, `/inbox/[id]`, `/unsubscribe/[token]` (public); API
  `/api/mail/inbound`, `/api/mail/events`, `/api/mail/original/[id]`,
  `/api/mail/attachments/[id]`
- **Boundary** — it owns the *transport* and the archive. What to say and when is
  → 11. `message.view` is split from `recall.send` because a thread can hold a
  complaint about the dentist.

### 11 · Nudges

> Who to chase, why, and the words to chase them with.

- **Tables** — `ScheduledMessage` (with `dedupeKey`, so a clock can run twice
  safely), `MessageKind`, `MessageStatus`
- **The five kinds** — `APPOINTMENT_REMINDER`, `RECALL_DUE`, `POST_OP_CHECK`,
  `WORK_READY`, `PLAN_NEXT_STEP` — one per upstream system (→ 6, → 1, → 2, → 5, → 3)
- **Logic** — [recalls.ts](../src/lib/recalls.ts) (14KB — who is overdue),
  [reminder-messages.ts](../src/lib/reminder-messages.ts) (the wording, three
  languages), [reminders.ts](../src/lib/reminders.ts),
  [messages/queue.ts](../src/lib/messages/queue.ts) (the five `queue*` functions
  the jobs call), [board-elsewhere.ts](../src/lib/board-elsewhere.ts) (the other
  five piles, pulled onto one board),
  [board-new.ts](../src/lib/board-new.ts)
- **Screens** — `/recalls`, `/reminders` (the board — "everything waiting on the
  practice, in one place")
- **Boundary** — it decides *who and why*; → 10 carries it. WhatsApp and SMS are
  `wa.me` / `mailto:` links the dentist reviews and sends by hand, deliberately.

### 12 · The Board

> The practice's own errands, with attachments, priorities and repeats.

- **Tables** — `FollowUp`, `FollowUpAttachment`, `FollowUpPriority`,
  `FollowUpRepeat`
- **Logic** — [follow-ups.ts](../src/lib/follow-ups.ts),
  [actions/follow-ups.ts](../src/lib/actions/follow-ups.ts)
- **Screens** — `/follow-ups`, `/follow-ups/[id]`; API `/api/follow-up-files/[id]`
- **Boundary** — the only system whose subject need not be a patient. `followup.*`
  is granted to every role including the front desk, because chasing a lab is
  exactly the errand this exists for.

### 13 · Storefront & Intake

> The public face, and the only door strangers can knock on.

By weight the second-largest system — 60 components, 10,400 lines of them.

- **Tables** — `AppointmentRequest`, `AppointmentRequestAttachment`,
  `AppointmentRequestStatus`
- **Logic** — [site-content.ts](../src/lib/site-content.ts) (35KB),
  [site.ts](../src/lib/site.ts) (18KB),
  [site-paths.ts](../src/lib/site-paths.ts) (the single list `robots.ts` and
  `sitemap.ts` both read), [site-open.ts](../src/lib/site-open.ts) (live hours
  from → 6), [site-jsonld.ts](../src/lib/site-jsonld.ts),
  [site-meta.ts](../src/lib/site-meta.ts),
  [request-alert.ts](../src/lib/request-alert.ts)
- **Screens** — `/{locale}`, `/treatments`, `/treatments/[treatment]`,
  `/practice`, `/visit`, `/abroad`, `/book`; and internally `/requests` (oldest
  first, the reverse of every other list); API `/api/request-files/[id]`
- **Boundary** — the only unauthenticated write path in the application. File
  types are read off the bytes, not off the upload's claim
  ([file-signature.ts](../src/lib/file-signature.ts)). It holds **no second copy**
  of anything: hours from → 6, address and phone from `ClinicProfile` (→ 18),
  editorial copy from `messages/*.json`.

---

## 5. The Foundation — what holds it up

### 14 · Identity, Access & Audit

> Who is signed in, what they may do, and what they did.

- **Tables** — `StaffUser` (PIN sign-in, `hiddenNav` preference), `Role`,
  `AuditLog`
- **Logic** — [src/lib/auth/](../src/lib/auth):
  [permissions.ts](../src/lib/auth/permissions.ts) (40 permissions × 4 roles in
  one readable matrix — nothing else in the app decides who may do what),
  [guard.ts](../src/lib/auth/guard.ts), [session.ts](../src/lib/auth/session.ts),
  [token.ts](../src/lib/auth/token.ts), [lockout.ts](../src/lib/auth/lockout.ts),
  [crypto.ts](../src/lib/auth/crypto.ts); plus
  [rate-limit.ts](../src/lib/rate-limit.ts),
  [constant-time.ts](../src/lib/constant-time.ts),
  [audit-links.ts](../src/lib/audit-links.ts),
  [audit-retention.ts](../src/lib/audit-retention.ts)
- **Screens** — `/login`, `/setup`, `/staff`, `/staff/new`, `/settings`,
  `/settings/operatories`, `/activity`
- **Boundary** — deletion is owner-only across every system. The audit log is
  append-only and **nothing automated ever trims it** — a retention decision the
  job registry explicitly refuses to make.

### 15 · Documents & File Vault

> Bytes on disk, and the rules for handing them back.

- **Tables** — `PatientDocument`, `DocumentKind` (plus the attachment tables owned
  by → 10, → 12 and → 13, which all use this machinery)
- **Logic** — [files.ts](../src/lib/files.ts),
  [storage-keys.ts](../src/lib/storage-keys.ts) (the one place that knows what a
  live key looks like), [file-signature.ts](../src/lib/file-signature.ts),
  [file-constants.ts](../src/lib/file-constants.ts),
  [cascade-files.ts](../src/lib/cascade-files.ts) (what happens to the bytes when
  the row goes)
- **Screens** — the Files tab inside `/patients/[id]`; API `/api/documents/[id]`,
  `/api/stock/photo/[kind]/[id]`
- **Boundary** — storage lives outside the web root; **nothing is served by
  path**, only through a route that checks a session and the row's owner.

### 16 · Automation & Jobs

> The things a clock is allowed to do, and proof they ran.

- **Tables** — `JobRun`
- **Logic** — [jobs/registry.ts](../src/lib/jobs/registry.ts) (seven jobs, each
  declaring `everyHours` = *how often it must have worked*, not how often the
  clock fires), [jobs/run.ts](../src/lib/jobs/run.ts),
  [job-status.ts](../src/lib/job-status.ts) (has anything gone quiet?)
- **Screens** — surfaced on `/settings`; API `/api/jobs/[name]`; the schedule
  itself lives in `docker/jobs/entrypoint.sh`
- **Boundary** — the registry's own doc comment is a list of what deliberately is
  *not* here: recall due-ness, expiry, reorder urgency, log pruning, and
  auto-marking no-shows. Everything derivable is derived at read time, where it
  cannot go stale.

### 17 · Backup & Continuity

> Getting the practice back after the worst day.

- **Tables** — none. It reads everything.
- **Logic** — [backup-status.ts](../src/lib/backup-status.ts) (11KB),
  [backup-inspect.ts](../src/lib/backup-inspect.ts),
  [actions/backup-check.ts](../src/lib/actions/backup-check.ts);
  `prisma/restore-backup.ts`, `scripts/backup-pull.ps1`,
  [RESTORE.md](RESTORE.md)
- **Screens** — `/settings` (status, plus the owner-only export); API
  `/api/backup`
- **Boundary** — records *and* uploaded files, twice a day, encrypted, with a
  weekly automated restore drill. The only system whose failure is invisible
  until it matters, which is why status is a first-class screen.

### 18 · Platform Shell

> The frame every other system is hung in.

- **Tables** — `ClinicProfile` (the single source for name, address, phone,
  letterhead, tooth-numbering convention)
- **Logic** — [queries.ts](../src/lib/queries.ts) (36KB — the shared read layer),
  [prisma.ts](../src/lib/prisma.ts) + [db-url.ts](../src/lib/db-url.ts),
  [src/i18n/](../src/i18n) (`sq` default, `en`, `it`, always prefixed),
  [nav-visibility.ts](../src/lib/nav-visibility.ts) + `nav-destinations.ts`,
  [help/topics.ts](../src/lib/help/topics.ts),
  [markdown.ts](../src/lib/markdown.ts), [csv.ts](../src/lib/csv.ts) /
  [csv-parse.ts](../src/lib/csv-parse.ts),
  [form-recovery.ts](../src/lib/form-recovery.ts) +
  [form-dirty.ts](../src/lib/form-dirty.ts), [src/proxy.ts](../src/proxy.ts), and
  the 20-component UI kit
- **Screens** — none of its own; it is the shell, the command palette, the help
  sheet and the 12,500 lines of translation under `messages/`
- **Boundary** — if it has no domain meaning, it is here. Deployment
  (`Dockerfile`, `docker-compose.prod.yml`, Coolify) belongs to this system too.

---

## 6. The audit rubric

Each system gets scored on six axes, then rolled up. The same rubric for all
eighteen, so the percentages are comparable to each other rather than to a
private standard per system.

| Axis | Weight | The question |
| --- | ---: | --- |
| **Correctness** | 25% | Does the logic hold at the edges — time zones, empty sets, concurrent writes, partial failures? Are the invariants enforced in the schema, not just in a form? |
| **Completeness** | 20% | Are the loops closed? For every state the model can be in, is there a screen that reaches it and a way out of it? |
| **Data integrity** | 20% | Constraints, cascades, orphans, dedupe keys, migrations that replay cleanly. Can this system lose or double anything? |
| **Access & safety** | 15% | Is every read and write behind the right permission? Any unauthenticated path? Anything served by raw path? Audit coverage of destructive acts? |
| **Test coverage** | 10% | Do the tests that exist pin the *rules*, or only the happy path? Which invariant would survive a rewrite? |
| **Operability** | 10% | Error, empty and loading states; i18n complete across all three languages; print output; and whether a failure is visible to a human. |

**Scoring bands** — a number without a band is noise:

| Band | Means |
| --- | --- |
| **90–100%** | State of the art. Would survive an external audit and a rewrite. |
| **75–89%** | Production-solid. Known gaps are named and deliberate. |
| **60–74%** | Works, ships, has real sharp edges an operator will meet. |
| **40–59%** | Functional skeleton. Loops open, states unreachable. |
| **< 40%** | Present, but not to be relied on. |

**Rules for the audit, so the numbers stay honest:**

1. **Deliberate omissions do not count as gaps.** [§8](#8-the-deliberate-omissions)
   is the list, with the reasoning and where it is written down. A system is not
   penalised for something it chose not to be. The one exception is the
   *deferral* at the end of that section, which is a real weakness wearing a
   decision's clothes.
2. **Score the code, not the document.** `APP-BLUEPRINT.md` says a thing is ✅;
   the audit checks.
3. **One system at a time, and read it whole** — schema, lib, actions,
   components, routes, tests. A percentage from a skim is worthless.
4. **Every deduction names a file and a line.** A score with no evidence behind
   it gets thrown out.
5. **Cross-system seams are scored on the owning side.** Stock deduction from a
   visit is judged under → 8 (it owns `StockMovement`), not under → 2.

### Worksheet — pass 1, 2026-09-02

`Σ` is the weighted roll-up. **Method and its limits** in
[§6.1](#61-what-this-pass-actually-read).

| # | System | Correct. | Complete. | Integrity | Access | Tests | Ops | **Σ** | Band |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | Patient Records | 88 | 90 | 90 | 92 | 68 | 88 | **87** | Production-solid |
| 2 | Clinical Charting | 90 | 84 | 90 | 90 | 82 | 78 | **86** | Production-solid |
| 3 | Treatment Planning | 87 | 88 | 88 | 90 | 70 | 85 | **86** | Production-solid |
| 4 | Prescribing | 88 | 90 | 88 | 95 | 65 | 85 | **87** | Production-solid |
| 5 | Lab Works | 85 | 82 | 86 | 90 | 78 | 78 | **84** | Production-solid |
| 6 | **The Book** | 84 | 90 | **62** | 88 | 86 | 88 | **83** | Production-solid |
| 7 | Services & Catalogue | 88 | 88 | 88 | 90 | 62 | 85 | **85** | Production-solid |
| 8 | **Stock & Inventory** | 90 | 92 | 90 | 88 | 85 | 88 | **89** | Production-solid *(top)* |
| 9 | Analytics & Day Sheet | 88 | 88 | 90 | 92 | 55 | 85 | **85** | Production-solid |
| 10 | Correspondence | 87 | 88 | 86 | 90 | 85 | **65** | **85** | Production-solid |
| 11 | Nudges | 88 | 84 | 88 | 90 | 82 | 85 | **87** | Production-solid |
| 12 | The Board | 87 | 88 | 88 | 88 | 75 | 85 | **86** | Production-solid |
| 13 | Storefront & Intake | 88 | 88 | 88 | 80 | 82 | **60** | **83** | Production-solid |
| 14 | Identity, Access & Audit | 90 | 90 | 92 | 85 | 72 | 88 | **88** | Production-solid |
| 15 | Documents & File Vault | 88 | 88 | 92 | 95 | 70 | 85 | **88** | Production-solid |
| 16 | Automation & Jobs | 88 | 85 | 88 | 88 | 70 | 88 | **86** | Production-solid |
| 17 | **Backup & Continuity** | 90 | 90 | 90 | 92 | 85 | 90 | **90** | **State of the art** |
| 18 | Platform Shell | 88 | 88 | 88 | 85 | 80 | 92 | **87** | Production-solid |
| | **Whole platform** | | | | | | | **86** | **Production-solid** |

The platform figure is not the mean of eighteen. It is weighted by how much of
the practice's day each system carries — The Book 15%, Patient Records and
Charting 12% each, Stock 10%, down to 1% for Jobs, Backup and the Shell — and
floored by the weakest foundation system. No floor applies this pass: the five
foundation systems score 86–90. **The Book at 76 is what holds the number down**,
and it is the single highest-leverage repair in the application.

**Two things this pass did not find, which is itself a result.** No unguarded
server action, and no missing cascade rule. Both were checked exhaustively
rather than sampled — see below.

### 6.1 What this pass actually read

Honest scoping, because rule 3 asks for a whole read and this was one pass over
104,000 lines.

**Checked exhaustively (every occurrence, not a sample):**

- **Authorization** — all 138 exported server actions across
  [src/lib/actions/](../src/lib/actions) against their guard calls. Every one is
  gated. The five that looked unguarded are correct: `signIn` / `createFirstOwner`
  are the unauthenticated door, `unlockSession` re-checks the PIN through the same
  throttle bucket as sign-in ([auth.ts:306](../src/lib/actions/auth.ts)),
  `confirmations`/`opt-out` are signed-token public paths, and
  `regenerateCalendarFeed` calls `requireUser()`
  ([settings.ts:401](../src/lib/actions/settings.ts)).
- **Cascade rules** — all 95 `@relation` declarations. 34 Cascade, 50 SetNull,
  1 Restrict; the 10 without a rule are array back-references and two
  self-relations, which cannot take one.
- **Build health** — `tsc --noEmit` clean; `next build` succeeds; `oxlint` exits
  0 with **179 warnings and no errors** — mostly `unicorn` style notes
  (`toSorted` over `sort`) spread across `src/`, `tests/` and `prisma/seed.ts`.
  Tests: 1154 across 232 suites, 0 failures, run against a real Postgres.

  *Corrected after pass 1 first reported "15 warnings": that came from reading
  the tail of the output rather than counting it, and is the kind of number this
  document should not carry uncited. The count now comes from
  `oxlint | grep -cE '^[^ ].*: warning '`, and the working tree is at the same
  179 the baseline had.*
- **Schema shape** — 20 unique constraints, 91 indexes, 33 migrations.

**Sampled with targeted probes** — each system's highest-risk claim, read in
full: the booking transaction, `applyStockChange`, the document route, the
mailer gate, `ToothFinding`, `collides`, the CI workflow, the backup verifier.

**Not done, and it would change numbers:** no line-by-line read of the four
largest files ([stock.ts](../src/lib/actions/stock.ts) 59KB,
[patients.ts](../src/lib/actions/patients.ts) 55KB,
[teeth.ts](../src/lib/teeth.ts) 38KB,
[queries.ts](../src/lib/queries.ts) 36KB); no e2e run; no manual UI pass, so
Operability is scored from code and CI rather than from use.

**The gap register in [APP-BLUEPRINT.md §8](APP-BLUEPRINT.md) is stale.** Of the
eight gaps it still shows open, seven are closed in code — G-28 (document
scoping, [route.ts:44](../src/app/api/documents/[id]/route.ts)), G-30
([ContactHistory.tsx:32](../src/components/patients/ContactHistory.tsx)), G-32
([recalls.ts:121](../src/lib/recalls.ts)), G-35 (`Lab.phone` exists), G-46
([analytics/page.tsx:375](../src/app/[locale]/(app)/analytics/page.tsx)), G-51
(`verify-restore.sh` collects every storage key), and G-34 is moot with the lab
removed. Only **G-24** is genuinely open. Scores below come from the code.

---

## 7. The gaps, by system

Ranked within each system by what it costs. 🔴 correctness · 🟠 an open loop ·
🟡 scale or coverage · ⚪ operational.

### 6 · The Book — was 76, now 83

- ✅ **The double-booking race — fixed 2026-09-02.** `findConflicts` ran outside
  the transaction and nothing re-checked inside it, so two people booking the
  same chair in the same second both passed and both committed. Four write paths
  had the hole: `saveAppointment`, `rescheduleAppointment`, the calendar
  drag-move (which had no transaction at all), and `bookPlanSeries`.

  Each now takes `pg_advisory_xact_lock` on the affected day(s) as its first act
  inside the transaction, then asks `findConflicts` again against `tx`
  ([`lockDiaryDays`](../src/lib/scheduling.ts)). A re-check alone would not have
  been enough — Postgres runs `READ COMMITTED`, so both transactions would still
  read the state before the other started. The day is the exact right
  granularity: `findConflicts` filters on `date` first, so two bookings that
  *could* collide are on the same day by construction, and every other day keeps
  booking in parallel. Locks are taken in sorted order, because a series holds
  several days and two series in opposite order is the textbook deadlock.

  Pinned by two tests in [query-layer.test.ts](../tests/query-layer.test.ts):
  one asserts that of two concurrent bookings exactly one is refused, and its
  twin runs the same race *without* the lock and asserts both get in — so the
  first test cannot quietly stop proving anything.
- 🔴 **Time is still not a time.** `Appointment` carries `date DateTime` +
  `startTime String` + `durationMin Int`
  ([schema.prisma:373](../prisma/schema.prisma)). Postgres cannot compare two
  bookings, so no `EXCLUDE USING gist` constraint is possible and every overlap
  question is answered in application code over a day's worth of rows. The lock
  above closes the race; it does not make the overlap rule enforceable by the
  database, and a future write path that forgets to take it is a new hole. *Fix:
  `startsAt`/`endsAt` timestamp columns plus a `btree_gist` exclusion constraint
  on (staff, range) and (operatory, range) — see §8.5. This converts a class of
  bug into an impossible state, and the lock is what buys the time to do it
  calmly.*

### 13 · Storefront & Intake — 83, held back by content not code

- ⚪ **All 34 photographs are still free-licence stock.**
  [photos.ts](../src/components/site/photos.ts) carries a `source:` URL on every
  one, which the README says to clear when the practice's own images arrive.
  The page is production-grade and currently advertises somebody else's clinic.
- ⚪ **`NEXT_PUBLIC_APP_URL` is a build variable.** Without it the canonical URL,
  `hreflang` alternates, sitemap and social card are simply absent — and being a
  build var, setting it at runtime does nothing.
- 🟡 **Rate limiting is in-process memory** ([rate-limit.ts:9](../src/lib/rate-limit.ts)).
  Correct for one container, and this is the only surface a stranger can reach.
  A second app replica silently doubles every limit.

### 10 · Correspondence — 85, correct but unproven

- ⚪ **Not configured against a real domain.** `BREVO_API_KEY` is absent from
  `.env`; `MAIL_PROVIDER` and `MAIL_FROM` are set. So 145 tests pin the rules and
  nothing has proven a send, a bounce or an inbound webhook end to end. SPF, DKIM
  and DMARC on the sending domain, and the MX record for inbound, are the
  remaining work. `mailerStatus()` reports this honestly rather than pretending.
- 🟡 **`inboundConfigured()` gates on secret length alone** — sixteen characters,
  fails closed. Right shape; untested against a live webhook.

### 9 · Analytics — 85, the thinnest test coverage in the app

- 🟡 **16 tests, all on the digest.** The aggregate queries behind
  `/analytics` — utilisation, top services, per-provider no-show rates — have no
  test at all. They are read-only, so a wrong number misleads rather than
  corrupts, but the owner makes decisions on this screen. *Fix: extend
  `query-layer.test.ts`, which already has the Postgres harness.*

### 7 · Services & Catalogue — 85, under-tested for its blast radius

- 🟡 **28 tests, 25 of which are the CSV importer.** The catalogue feeds
  appointment duration, plan steps, stock deduction and every statistic. Three
  tests for the catalogue itself is thin for something four systems read.

### 2 · Clinical Charting — 86

- 🟠 **G-24 — recording a visit does not say when the next recall falls.** The
  only gap from the register that is genuinely still open. The computation exists
  in [recalls.ts](../src/lib/recalls.ts); it is not surfaced at the moment of the
  write, which is when it is useful.
- ⚪ **The newest schema in the application.** `ToothFinding` landed
  2026-09-01 and multiple-findings-per-tooth is five commits old. The logic is
  well-argued and well-tested (134 tests); it has had the least time in front of
  a real patient list.

### 5 · Lab Works — 84

- 🟠 **G-34 — a work cannot be tied to a plan step.** A crown is almost always a
  plan step, and the two registers do not know about each other. The blueprint
  files this against the removed `LabCase`, but it applies unchanged to `Work`.
- ⚪ **Second-newest system**, built 2026-08-26 → 09-01.

### 1, 3, 4, 11, 12, 14, 15, 16, 18 — the common shortfall

One finding, and it is the same one everywhere: **no server action has a unit
test.** All 1141 pure tests sit below the actions, and the only thing exercising
the 138 actions themselves is 39 Playwright tests. That is what holds Test
Coverage to 62–82 across nine otherwise-strong systems, and it caps each of them
around 88.

The pattern to copy already exists:
[query-layer.test.ts](../tests/query-layer.test.ts) runs against a real Postgres
and skips cleanly without one — and its own doc comment records that **four live
bugs sat in the repository with 800 pure tests passing over the top of them**,
all in the seam where worked-out logic becomes a Prisma `where`. Actions are the
next layer of that same seam.

Smaller, per system:

| System | Gap |
| --- | --- |
| 1 · Patients | 🟡 `patients.ts` is 55KB / 14 actions with no direct test |
| 3 · Plans | 🟡 `plans.ts` is 33KB / 11 actions with no direct test |
| 4 · Prescribing | 🟡 65 on tests — `drugs.ts` (13KB of clinical reference) is covered only incidentally by `clinical.test.ts` |
| 11 · Nudges | 🟠 G-24 again, from the other end: the queue knows the next recall date the visit form does not print |
| 14 · Access | 🟡 In-memory rate limiting is the one thing between the app and a distributed deploy |
| 16 · Jobs | ⚪ The app cannot read the sidecar's crontab, by design — so `everyHours` drifting from the real schedule is undetectable from inside |
| 18 · Shell | 🟡 `queries.ts` is 36KB behind 14 DB tests |

### What is already state of the art

Worth naming, because the audit is not a list of complaints.

- **17 · Backup — 90.** Encrypted twice daily, a weekly automated restore drill,
  a restore path that *refuses a non-empty database*, and an inspector that
  decrypts an owner's hand-kept file and reports it table by table without
  writing anything. CI stands up the whole compose stack and proves a real backup
  succeeds and the app can read its status back.
- **8 · Stock — 89.** The best concurrency handling in the repository:
  `applyStockChange` ([stock.ts:433](../src/lib/actions/stock.ts)) is a
  conditional `updateMany` with a `gte` floor inside a transaction, so an
  over-draw writes *nothing* rather than half-applying. FEFO batch draw-down,
  expired lots excluded from stock, 159 tests.
- **15 · File Vault — access 95.** Files outside the web root, served only
  through a route that requires a session, `document.view`, *and* the patient id
  the caller claims — a walked id 404s, indistinguishable from a missing row, and
  the view is audited before the bytes go out.
- **The CI.** Lockfile integrity, schema-vs-migration drift against a real
  Postgres, migrations replayed into an empty database, the production image
  booted and required to serve and to *refuse* an un-baselined database, the full
  compose stack with a live backup, then Playwright. This is the reason so many
  systems score 85+ on Operability.

### The five repairs, in order

| | Repair | System | Moves |
| --- | --- | --- | :-: |
| ~~1~~ | ~~Re-check conflicts inside the booking transaction~~ | 6 | ✅ 76 → 83 |
| 2 | Real photographs + `NEXT_PUBLIC_APP_URL` | 13 | 83 → ~90 |
| 3 | Configure and prove the mail domain (SPF/DKIM/DMARC + MX) | 10 | 85 → ~91 |
| 4 | Extend `query-layer.test.ts` over the action layer | 1,3,4,7,9 | +3–6 each |
| 5 | `startsAt`/`endsAt` + `btree_gist` exclusion constraint | 6 | 83 → ~90 |

Repair 1 is done. 2 and 3 are content and DNS rather than code. Repair 5 is the
large one, and with the race closed it can now be done calmly rather than under
pressure — which is what the blueprint asked for when it deferred it.

---

## 8. The deliberate omissions

Everything an audit might otherwise write down as a gap, with the reason and the
file the reason is written in. Four kinds, and they are not equally binding.

### 8.1 Scope — categories that do not exist

| Not built | Why, and where it says so |
| --- | --- |
| **Billing, payments, cash register, fiscalization** | Out of scope for the product. README, first screen. Follows through to **no price column** on a service ([blueprint §4.9](APP-BLUEPRINT.md), the one explicit 🔒) |
| **An SMS or WhatsApp gateway** | → 11 produces `wa.me` and `mailto:` links a person reviews and sends. The rule is *a human reads every message before it goes*, and [blueprint §1](APP-BLUEPRINT.md) amends it explicitly when `emailQueuedMessage` arrives: the transport changed, the gate did not |
| **A restore button** | [backup-inspect.ts](../src/lib/backup-inspect.ts) — `restore-backup.ts` refuses a non-empty database, because merging a backup into a live practice collides ids and strands the half that fails. The app is by definition connected to the live database, so an in-app restore is a wipe-and-replay of live medical records mid-session. It inspects the file instead: decrypts, checks shape, reports table by table, writes nothing |
| **A bin for email threads** | [actions/inbox.ts](../src/lib/actions/inbox.ts) — what arrives is the only copy, and *"I do not want to look at this"* is a different statement from *"this should stop existing"*. Archive only |
| **A `WAITLIST_OFFER` message kind** | [ROADMAP.md](ROADMAP.md), Phase 12 — it would have to decide *whom* to offer a freed slot to. The waitlist panel gives that judgement to a person; a queue would either invent a matching policy or write to five patients about one chair |
| **The laboratory module (`LabCase`)** | Removed from the product; → 5 replaced it. Gaps G-01 / G-04 / G-10 / G-12 / G-33 / G-34 / G-35 describe a feature that is gone |
| **Multi-tenancy** | One practice, one database. Nothing is scoped by clinic |

### 8.2 Automation — what a clock is not allowed to do

The whole argument is in [jobs/registry.ts](../src/lib/jobs/registry.ts): the app
is *"nudge, don't send"* and *"derive, don't store"*.

| Not automated | Why |
| --- | --- |
| **Recall due-ness, snooze expiry, work overdue-ness, batch expiry, reorder urgency** | All five are comparisons made when somebody looks, so they can never be stale. Putting them on a clock would be *inventing a way for them to go wrong* |
| **Pruning the activity log** | [audit-retention.ts](../src/lib/audit-retention.ts) — dental records carry a long statutory retention, and a trail kept for less time than the records it describes leaves those records outliving the only account of who touched them. Seven years is **a floor, not an expiry**; a trim is a deliberate act by hand, and the deploy never removes an entry. The registry refuses to overturn a medical-record retention decision |
| **Closing yesterday's open appointments (auto `NO_SHOW`)** | *"Marking a patient absent is an accusation; it should have a person behind it."* Surfaced on the dashboard instead, which drops it from a job to a query |
| **Sending anything to a patient on a schedule** | Every job fills a queue a person works down. Even the morning digest writes a row whose `sentAt` stays null |

### 8.3 Privacy — data the app declines to hold or hand over

| Not recorded / not exported | Why |
| --- | --- |
| **`medicalNotes` in the patient CSV** | [patients-export.ts](../src/lib/patients-export.ts) — a spreadsheet gets emailed, copied to a laptop and kept in a downloads folder for a decade. Making the column appear or vanish by permission would mean two files with the same name and different shapes, which is worse than one honest file. The export is the *directory*; the clinical record stays behind the login |
| **`opened`, `click`, `proxy_open` delivery events** | [messages/events.ts](../src/lib/messages/events.ts) — *"surveillance of a patient reading their own post, which this practice has no business recording."* (`request` and `deferred` are dropped separately, as just being in flight) |
| **A portrait on the storefront** | README — a stock face under a real dentist's name is a fabricated person |
| **An audit row for menu preferences** | [actions/preferences.ts](../src/lib/actions/preferences.ts) — the activity log is worth reading because everything in it is a change to the practice's record. Somebody hiding a link from their own menu is not, and a log with a hundred of them is a log nobody scrolls |

### 8.4 Small refusals worth not "fixing"

Each of these looks like an oversight at a glance and is argued for in place.

- **Confirming does not write the appointment status** —
  [actions/confirmations.ts](../src/lib/actions/confirmations.ts). Writing
  `SCHEDULED` un-arrives a patient standing at the desk. `confirmedAt` is where
  the fact lives.
- **The public form offers half-days, never times** —
  [site-content.ts](../src/lib/site-content.ts). Offering 09:20 on a public form
  is a promise nobody has checked, and the desk would ring back to take it away.
- **`TEMPORARY` and `WATCH` take surfaces** — [teeth.ts](../src/lib/teeth.ts).
  A dressing sits in a specific cavity; what is watched is a particular fissure.
- **`export` is not a "changing action"** —
  [auth/permissions.ts](../src/lib/auth/permissions.ts). Taking a copy is a read,
  however consequential, and the banner it drives is about editability.
- **`contactConsent` stays null on import** —
  [actions/patient-import.ts](../src/lib/actions/patient-import.ts). Tri-state:
  nobody has asked these people.
- **The day sheet prints from the browser** — [blueprint §4.4](APP-BLUEPRINT.md).
  No PDF pipeline for one page of text.
- **Rate limiting is in memory** — [rate-limit.ts](../src/lib/rate-limit.ts).
  One process, one machine, one clinic.

### 8.5 The one deferral — *not* an omission

`Appointment.startsAt` / `endsAt` are **strings, not timestamps**, with no
`btree_gist` exclusion constraint
([IMPROVEMENTS §2.3](IMPROVEMENTS.md), blueprint Stage 7). The blueprint calls
this *"deferred by choice"* and says it is the right end state and the root cause
behind several smaller items — deferred because it is a large change that should
not be made under pressure.

**The audit scores this as a real defect against → 6**, not as a design decision.
Scheduling correctness lives outside the database as long as it stands. It is
listed here only so it is not mistaken for one of the four kinds above.

---

## 9. What is not a system

Things that exist in the codebase but are not systems in the sense this document
uses — distinct from [§8](#8-the-deliberate-omissions), which lists things that
do not exist at all.

| | Why not |
| --- | --- |
| **A design system** | The 20-component UI kit in → 18 is a kit, not a system with rules of its own. |
| **Tenancy / clinic scoping** | One practice, one database. There is no boundary to audit. |
| **The `docs/` gap registers** | G-numbers cut across systems. The audit reads them as evidence, not as a scope. |

---

## 10. The seams to watch

Where two systems meet is where an audit finds most of what it finds. The five
that carry the most traffic:

| Seam | Between | Carried by |
| --- | --- | --- |
| **A visit consumes materials** | 2 ⇄ 7 ⇄ 8 | `VisitService` → [stock-consumption.ts](../src/lib/stock-consumption.ts) → `StockMovement` |
| **Which visit does this belong to** | 2 ⇄ 4 ⇄ 5 ⇄ 8 | [visit-link.ts](../src/lib/visit-link.ts) — six tables carry `visitRecordId`, exactly one is written with it to hand |
| **A plan step is an appointment** | 3 ⇄ 6 | [plan-sync.ts](../src/lib/plan-sync.ts), both directions |
| **Something is owed to a patient** | 1, 3, 5, 6 → 11 → 10 | `ScheduledMessage.dedupeKey`, then `Contact` |
| **The public page tells the truth** | 6 ⇄ 18 → 13 | `ClinicHours` + `Closure` + `ClinicProfile`, read live — never copied |
