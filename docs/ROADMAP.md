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

### 3b — The messages only went one way 🟣

**Status: implemented.** Three gaps, and the third was the one nobody could see.

- **Nothing could simply *write* to a patient.** The app could remind and it
  could chase, and had no way to say "your crown is back" or "we are shut on
  Friday". Those went out through somebody's personal WhatsApp, unlogged.
  `MessageDialog` + `composeTemplates` — six starting points, composed in the
  patient's language, editable before they go, logged as a `Contact` either way.

- **Nothing came back.** A reminder set `Reply-To` and then lost track: the
  patient's answer landed in somebody's Outlook and the record showed a message
  sent into silence. `EmailThread` / `EmailMessage`, filled by a Brevo inbound
  webhook at `/api/mail/inbound`, worked at `/inbox`. This is the app's one
  deliberate departure from "derive, don't store" — argued in §1.2 of the
  blueprint rather than smuggled in under a migration name.

- **The contact links did nothing on a desktop.** `tel:` and `mailto:` are
  hand-offs to whatever the *workstation* has registered, and a browser-only
  front desk has nothing registered — so every phone number and every address in
  the app was a link that silently did nothing, and had been for as long as they
  had existed. Nobody could have known: a link that does nothing looks exactly
  like a link nobody clicked. Every one of them now sits beside a route that
  cannot fail — a `wa.me` link, a send the server performs, or copy.

Riding along: `Patient.preferredChannel` is finally *read* by something (it had
been collected by the edit form and used by nothing), and a telephone call can
be logged from the patient record, which is the one channel where the practice
really knows the message arrived.

---

## Phase 4 — Allergies are a regex over prose 🔵

**Status: implemented.** `PatientAlert` rows drive the header badges and are
checked against prescription text at issue time (`matchingAllergies`), with an
override. The regex stays as the safety net for notes not yet promoted to rows —
and those sentences are fed into the check too, not just the header.

The check is no longer only a string comparison. [drugs.ts](../src/lib/drugs.ts)
resolves both the prescription and the allergy record to drug families, which
closes the hole that mattered: "Amoxicillin 875 mg" shares no useful substring
with "Penicilinë", and is the antibiotic actually prescribed. Same-family and
cross-reactive hits are worded differently, and the cross-reactivity list is one
edge — penicillin/cephalosporin — because an alarm on clindamycin or
azithromycin would fire on exactly the drugs a penicillin allergy calls for.

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
recorded allergies at issue time, the banner renders on the day view before the
patient sits down, and `patient.medical.view` gates something concrete.

`Prescription.body` stays free text, deliberately. A structured drug field would
be one more box to fill at the fastest moment of the appointment, and a box that
gets skipped protects nobody — the family check reads the wording that is
already there instead.

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

## Phase 6 — Lab cases ⚫

**Status: removed.** The practice does not send work out through this app, so
the `LabCase` models, the `/lab` screens, the patient tab and the `lab.*`
permissions were deleted rather than left as dead weight in every list, every
backup and every permission table.

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

---

## Phase 11 — The screens were right and the work was slow 🟣⚪

**Status: implemented.**

Everything above is about what the app could not *represent*. This phase is
about what it could represent and still made somebody do by hand — the gap
between a correct data model and a fast front desk. Nothing here is a new
concept; all of it is an act the practice already performs, performed in fewer
presses.

**Finding a slot.** `findFreeGaps` took exactly one date, so *"when is your first
free hour?"* — the question asked over the counter more than any other — was
answered by paging the diary a day at a time. `findNextGaps` walks forward
across days on one query for the bookings and none for the hours (the week and
the closures are request-cached), and `SlotFinder` puts the answer inside the
booking dialog, asked *after* the treatment is chosen because the duration is
what decides whether a gap is a fit.

**Booking.** An empty hour on the day grid now books itself, instead of being
read off the screen and typed back into a field. `Ctrl+K` opens one box that
finds a patient or a screen from anywhere, over the same `searchPatients` the
booking dialog already used. A course of treatment can be booked as a course —
same slot, every N weeks — with the dates that fall on a closure or a clash left
unbooked rather than double-booked, which is said on the form before the press
and in the audit line after it.

**Moving.** `Appointment.rescheduledFromId` had carried a comment promising
"moved three times" visibility since it was added, with nothing writing it.
A move is now two rows: the original is called off as a **clinic** cancellation —
`reliability.ts` reads that column, and a patient who rings ahead to move an
appointment has done the opposite of missing it — and the new booking points back
at it and carries a mark. The plan step follows the slot that fulfils it.

**Waiting.** `ARRIVED` said somebody was waiting and never since when.
`arrivedAt` is stamped on the way in, kept through `COMPLETED`, and wound back on
any status that means they are not in the room.

**The next appointment.** Booked from the chair, inside the visit form, defaulted
to the patient's own recall interval — the moment a follow-up actually gets made
is while they are still sitting there. It cannot fail the write-up: a clash is
booked over rather than costing somebody their clinical note.

**Materials.** Consumption stayed scan-only, and a practice with no scanner in
the surgery had a cupboard whose count moved once a quarter. `suggestMaterials`
is not the retired bill of materials returning — it is the ledger read back: what
past visits *for this treatment* actually spent, in the amounts they spent,
offered as a figure somebody confirms. Same guarded take, same oldest-lot-first
allocation, same trace.

**Expiry.** Was a property of a material, which is the wrong unit to act on:
"composite: expired" says a shelf is wrong and not which box to take off it.
`/stock/expiry` is one row per lot with the one verb that answers it, and
`writeOffBatch` finally names the lot — `recordConsumption` has taken a preferred
batch since scanning existed and nothing in the storage room could offer one. The
reason is its own word, so binned stock does not read as consumption and drag the
reorder projection with it.

**Ordering.** The shopping list is placed per supplier and was only ever
answerable per material. `bySupplier` groups it, the message goes to the number
or address on the supplier's own record rather than to a share sheet, and one
press answers the whole order.

**Patients.** The list loaded every row with two sub-counts and a score each; it
is paged. Archiving finally applies to the record with the most history hanging
off it and the longest retention period — the rule staff and materials have lived
under all along — and hard deletion stays, owner-only, for an actual erasure
request. Duplicates were detected on the way in and unanswerable afterwards;
`mergePatients` repoints every child table, fills the survivor's blanks from the
loser (which is *why* two records exist — one has the email, the other the date
of birth), settles the one table that cannot simply be repointed (`ToothRecord`
is unique on patient-and-tooth, so the later examination wins), and archives the
husk.

**Paper and figures.** A plan prints for the patient. Statistics answer the two
questions an owner opens the page with and neither could be read off it: chair
use — booked minutes against the hours the practice was open, because eight
check-ups and three implants are the same *count* and nothing like the same day —
and missed appointments per dentist, which the per-patient score cannot see from
its end.

One bug fell out of the reading: `getReliabilityMap` did not exclude clinic
cancellations while `getReliability` did, so the badge on the patient list and
the badge on the patient's own screen were two different claims about the same
person.

---

## Phase 12 — The messages went out and nothing came back 🟣⚪

**Status: implemented.**

The outbox worked. What it could not do was *hear*, *stop*, or *cover the other
four things the practice needs to say* — and the bell above it was counting
something else entirely.

**The bell and the queue were two different questions.** The board counted
tomorrow's appointments with no reminder contact; the screen behind it held
pending messages, recalls included. So the badge read nought on a morning with a
dozen patients waiting to be rung, and read three where the screen showed nine.
Both now ask `countWaitingMessages`, which is the queue's own three questions —
pending, still worth sending, not held back from a refused attempt.

**"Sent" meant "the provider accepted it".** A 200 from Brevo is a claim about
Brevo: an address that died two years ago was written to every recall cycle,
each send logged as a contact and reported as done. `/api/mail/events` is the
other half — a hard bounce, a block or a complaint retires the address (the
patient keeps their telephone, so the queue keeps queueing them), and a
complaint or a followed opt-out link closes consent and withdraws what was
queued. Editing the address clears the flag, because a new address is a new
answer.

**`contactConsent` could only be moved by staff.** A patient who wanted to be
left alone had to ring up and ask somebody to tick a box, which is not consent
management. Every message they did not specifically ask for now carries a signed
opt-out link — the confirmation link's machinery under a purpose of its own, so
"yes, I am coming" can never also mean "never write to me again".

**Four lists, and only two of them were queued.** The post-operative check, the
case back from the laboratory and the plan that stopped halfway each had a screen
somebody had to remember to open — which is exactly where the recall was before
it was queued. All three are `MessageKind`s now, each reading the authority the
screen reads (`getFollowUps`, `receivedAt`, `summarisePlan`) rather than
deciding anything of its own.

**Nothing could see how much one patient was hearing.** Each list declined to be
the second message *of its own kind* and none could see the other three. One
ceiling now counts every channel from the `Contact` log — two in seven days,
appointment reminders exempt, because a reminder is about a slot they agreed to.

**A refused send looked exactly like one nobody had got to.** `note` explains a
skip and a failure identically, so an unverified sender domain produced a queue
of rows that each looked like work. `attempts` and a `sendAfter` that steps
forward give those rows a section of their own, with the count and the time they
come back.

Riding along: the queue reads `preferredChannel`, which the patient record has
honoured since the field was collected while the one screen built for sending
offered WhatsApp to everybody; the provider send uses the *email* wording rather
than the WhatsApp wording, which the `mailto:` draft had been using all along;
the morning digest is emailed to the practice on the day nobody opens the board;
a slot the patient gave back overnight is a pile on the bell instead of a
discovery; and the bell refreshes itself, so eleven o'clock's booking request no
longer waits for somebody to navigate.

**Deliberately not done.** A `WAITLIST_OFFER` kind, which would have to decide
*whom* to offer a freed slot to — the waitlist panel gives that judgement to a
person, and a queue that picked would either invent a matching policy or write to
five patients about one chair.
