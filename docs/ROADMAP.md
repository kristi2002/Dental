# What is missing, and in what order to add it

`IMPROVEMENTS.md` lists what is wrong with the code that exists. This document
lists what **does not exist yet** — entities the domain needs, logic the app
implies but never implements, and the operational surface a clinic actually
runs on.

Ordered so that each phase stands on its own: every one of them is shippable
without the ones after it, and none of them requires a rewrite of the one
before.

**Legend** — 🔵 domain entity · 🟣 logic · ⚪ operational

---

## Phase 1 — The clinic has no opening hours 🔵🟣

**Status: implemented.**

[dates.ts:105](../src/lib/dates.ts) hardcodes `DAY_START_HOUR = 8` and
`DAY_END_HOUR = 20`, applied identically to all seven days of the week. So
`findFreeGaps` offers Sunday 08:00, offers the lunch hour, and has no way to
know about a public holiday or the August shutdown.

```prisma
model ClinicHours { weekday Int @id  open Boolean  openTime  closeTime  breakStart?  breakEnd? }
model Closure     { from DateTime  to DateTime  reason String }
```

Everything downstream of "when is the practice open" changes with it: free-gap
search, the day grid's bounds, the waitlist's slot offers, and the recall
screen's suggestion of when to call someone back.

This phase also fixes [IMPROVEMENTS §1.4](IMPROVEMENTS.md) — `nextSlotTime()`
read `getHours()` (server-local) in an app that is UTC everywhere else. Clinic
hours are meaningless if "now" is wrong, so the two belong in one change. The
clinic's wall clock now comes from a single `CLINIC_TIME_ZONE`.

---

## Phase 2 — Appointments belong to nobody 🔵

**Status: implemented.** The conflict rule now lives in `collides()`
([scheduling.ts](../src/lib/scheduling.ts)): two overlapping bookings clash when
they share a dentist or a chair, and also when nothing on either side proves
them apart — so a practice that records neither keeps exactly the behaviour it
had before. `Closure.staffUserId` turns a closure into one person's leave.

`Appointment` has no `staffUserId` and no room. Every booking belongs to "the
practice", which means:

- `findConflicts` blocks the whole clinic when two dentists could work in
  parallel — correct only for a solo, single-chair practice;
- there is no per-dentist day view, and no way to ask "how full is Thursday for
  Dr B";
- `VisitRecord.staffUserId` is *who typed the note*, which diverges from *who
  did the treatment* the moment an assistant writes up the dentist's work.

```prisma
model Operatory { id  name  active Boolean }
// Appointment gains: staffUserId String?  operatoryId String?
// VisitRecord gains: performedById String?   (recordedBy stays as-is)
```

The conflict check becomes per-resource: two appointments overlap only if they
share a dentist **or** share a chair. That is a change to one function and a
much better answer.

Staff leave rides along here — `Closure.staffUserId` (null = whole practice)
means nothing until there is a provider to be absent.

---

## Phase 3 — Nothing remembers that a message was sent 🟣

**Status: implemented.** Opening a reminder writes a `Contact` row, reminders are
composed in the patient’s own language (`reminder-messages.ts`), and consent is
tri-state so “nobody asked” stays distinct from “they said no”.

[reminders.ts](../src/lib/reminders.ts) builds a `wa.me` / `mailto:` link and
that is where it ends. Nothing records that anyone was contacted. So the day
view can't say "reminded 2 days ago", two people can remind the same patient
twice, `lastRecallAt` is a single timestamp rather than a history, and when a
patient says "nobody told me" there is no answer.

```prisma
model Contact { patientId  appointmentId?  channel  purpose  body  actorId  createdAt }
enum ContactChannel { WHATSAPP EMAIL PHONE IN_PERSON }
enum ContactPurpose { REMINDER RECALL CONFIRMATION FOLLOW_UP OTHER }
```

Cheap to wire — the click that opens WhatsApp writes the row.

Two things ride along:

- **Contact consent.** Sending reminders to EU patients needs a recorded lawful
  basis. `Patient.contactConsent` + preferred channel + opt-out.
- **Patient language.** The app is trilingual but composes reminders in the
  *staff member's* UI locale, so an Albanian receptionist sends an Albanian
  message to an Italian patient. `Patient.locale` fixes it.

---

## Phase 4 — Allergies are a regex over prose 🔵

**Status: implemented.** `PatientAlert` rows drive the header badges and are
checked against prescription text at issue time (`matchingAllergies`), with an
override. The regex stays as the safety net for notes not yet promoted to rows.

[medical.ts](../src/lib/medical.ts) scans free-text notes for `/al+erg/i`. As a
safety net over data that is already unstructured it is a good idea; as the
*only* representation of a contraindication it is not.

```prisma
model PatientAlert { patientId  kind  substance?  severity  notes?  createdAt }
enum MedicalAlertKind {
  ALLERGY ANTICOAGULANT PREGNANCY DIABETES CARDIAC_PROPHYLAXIS LATEX PACEMAKER BISPHOSPHONATE
}
```

Once alerts are rows: the prescription form can cross-check the drug against
recorded allergies at issue time (today `Prescription.body` is free text with no
drug field and no check at all), the banner renders on the day view before the
patient sits down, and `patient.medical.view` gates something concrete.

The regex stays as a migration aid — it can flag notes whose allergy has not
been promoted to a row yet.

---

## Phase 5 — The tooth chart doesn't fit its own market 🔵

**Status: implemented.** Charts are stored in FDI with primary teeth (51–85)
and per-surface detail; Universal survives as a display setting. Existing rows
were converted by `prisma/migrate-teeth-fdi.ts` — the two systems overlap, so
they cannot be told apart at read time and a migration is the only clean path.

[teeth.ts](../src/lib/teeth.ts) uses **Universal numbering 1–32** — the American
system — in an app shipping in `en` / `it` / `sq`. Italy and Albania both use
**FDI** (11–18, 21–28, 31–38, 41–48). "Tooth 14" means different teeth to
different readers.

Three separate gaps, in order of clinical weight:

1. **No deciduous teeth** (FDI 51–85). A child cannot be charted at all.
2. **No surfaces.** "CARIES on 14" versus "CARIES, distal-occlusal, 14" — without
   surfaces the chart cannot say what was filled.
3. **No history.** `ToothRecord` is `@@unique([patientId, toothNum])` with
   `updatedAt`: current state only. Adding `visitRecordId` and keeping rows
   append-only turns a snapshot into a clinical timeline.

Storage stays `Int`; the numbering system is a display mapping plus a clinic
setting.

---

## Phase 6 — Lab cases 🔵

**Status: implemented.** `LabCase`, plus a patient tab and a dashboard
“waiting on the lab” card sorted by what was promised soonest.

Crowns, bridges, dentures and aligners go to an outside lab and come back.
Nothing in the schema knows this, so it lives on a whiteboard.

```prisma
model LabCase { patientId  teeth  labName  kind  sentAt  dueAt?  receivedAt?  status  notes? }
```

It connects to what already exists: a treatment-plan step cannot be booked for
fitting until its case is back, and the dashboard gains a real "waiting on"
list. This is the most dental-specific thing the schema does not have.

---

## Phase 7 — Stock is missing what makes it regulatory 🔵

**Status: implemented.** Deliveries are recorded as lots with a number and an
expiry date, which is also the restock path: the count goes up, the ledger gets
its movement and the order flag clears on one press. The stock page warns on
expired and expiring stock separately from low stock, because they are separate
ways for the cupboard to be wrong. Marking something ordered stops the reorder
list asking for it again and drops it off the order form, while leaving it
visible so nobody forgets it is still not on the shelf.

- **Lot and expiry.** Anaesthetics and composites expire and carry batch numbers
  that may need tracing to a patient. Today an expired box counts as stock.
  `StockBatch { itemId, lotNumber, expiryDate, quantity }` gives expiring-soon
  warnings beside low-stock, and oldest-first consumption.
- **Supplier and an order state.** `reorder.ts` computes suggestions, but with no
  `Supplier` and no "ordered, awaiting delivery" the same suggestion nags every
  day until the box physically arrives.

---

## Phase 8 — The appointment lifecycle is too short 🟣

**Status: implemented.** `ARRIVED` is a real status with its own button, so
the day list becomes a queue. Cancellations record a reason and whether the
patient or the clinic called it off, and `reliability.ts` no longer scores a
clinic-cancelled slot against the patient — that was a live scoring bug.
`rescheduledFromId` exists in the schema but nothing writes it yet.

- **No `ARRIVED` status.** The front desk's most-pressed button does not exist,
  and the dentist has no waiting-room queue. `SCHEDULED → CONFIRMED → ARRIVED →
  COMPLETED`.
- **No cancellation reason or actor.** `reliability.ts` scores patients on
  no-shows, but a *clinic*-cancelled slot should not count against the patient.
  That is a live scoring bug, not a missing nicety.
- **No reschedule link.** `rescheduledFromId` makes "moved three times" visible.

---

## Phase 9 — Patient record gaps 🔵

**Status: implemented.** Guardian, address, fiscal code, emergency contact
and referral source, all on the form and the details tab.

| Field | Why |
| --- | --- |
| `guardianName` / `guardianPhone` | Booking creates patients inline; a child's phone is their parent's, and consent is signed by them |
| `address`, `fiscalCode` | Needed for any printed form or letter; `codice fiscale` is expected in Italy |
| `referralSource` | Analytics cannot answer "where do patients come from" — the one CRM question an owner asks |
| `emergencyContact` | Standard on any medical intake |

---

## Phase 10 — Operational ⚪

**Status: implemented.**

- **Printing.** Prescriptions already printed; the gap was the list that goes on
  the wall. `/day-sheet` prints the day as a table with a tick box per patient
  and any CRITICAL or IMPORTANT alert in bold — the reason the sheet is worth
  printing at all. `globals.css` repeats the table header across pages, avoids
  breaking a row in half, and forces the danger colour to black, because a
  monochrome printer renders it as mid-grey and a penicillin allergy stops
  standing out.
- **Calendar export.** `/api/calendar/<token>` serves one dentist's schedule as
  iCalendar. Calendar clients send no cookies, so the signed token in the path
  is the whole authority — an HMAC of the staff id with its own purpose string,
  the same trick as `confirmations.ts`. Read-only, thin by design (names, times,
  a phone number — never a diagnosis), and the URL is shown in Settings with the
  warning it deserves.
- **The public route is throttled.** Per-address, on both `/confirm/[token]` and
  the calendar feed.
- **Health.** `/api/health` answers yes or no and nothing about the practice.
- **"Everything is pull."** No scheduled job was added, and that is deliberate:
  the app never sends anything on its own, so a cron would have nothing to do.
  What was actually missing is that *reminding was invisible* — it happened only
  when somebody thought to work down the calendar. The Phase 3 contact log makes
  "who has not been told" answerable, so the dashboard now asks: tomorrow's
  appointments with no reminder sent, no answer from the patient, and no recorded
  refusal to be contacted.

Error reporting beyond the health endpoint is still nothing more than
`console.error`. Worth a real sink before this runs unattended.

- **Nothing prints.** No day sheet, no prescription printout, no treatment plan
  for the patient. A dentist hands over paper.
- **No calendar export.** An `.ics` feed the dentist subscribes to on their
  phone removes the need to open the app to see the day.
- **The public route is unthrottled.** `/confirm/[token]` is the only
  unauthenticated surface. [IMPROVEMENTS §1.5](IMPROVEMENTS.md) covers the
  un-cancelling bug but not enumeration — this needs a per-IP throttle.
- **Everything is pull.** A recall happens only when someone opens the recalls
  page. There is no scheduled job producing "tomorrow's six need reminding".
- **No health check, no error reporting.** On a clinic mini-PC, a silent failure
  is found by a receptionist rather than by you.
