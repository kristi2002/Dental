-- The day a stranger said would suit them.
--
-- `AppointmentRequest` shipped as a name, a number and a sentence, and the desk
-- rang back to ask two questions: which day, and morning or afternoon. Those two
-- are now asked on the page itself — the booking route carries a calendar drawn
-- from the practice's own `ClinicHours` and `Closure` rows, so the days it
-- offers are days the door is actually open.
--
-- **Still not an appointment, and these columns are named so that nobody reads
-- them as one.** Nothing is held, no slot is taken, and the table has no link to
-- `Appointment` for the same reason it has no link to `Patient`: a request is
-- something the desk reads and places, and a public form that wrote into the
-- book would let anybody with a browser fill a working day. What this buys is
-- that the call back opens with "Thursday morning still good?" instead of "when
-- are you free?".
--
-- Both nullable, and no backfill. The calendar is optional on the form — a
-- visitor with no JavaScript, or one who simply has no preference, sends exactly
-- the request this table already took, and every row written before today is
-- that request. NULL is the honest value for "they did not say", and inventing a
-- date for a hundred old rows would be inventing evidence.
ALTER TABLE "AppointmentRequest"
  ADD COLUMN "preferredDate" TIMESTAMP(3),
  ADD COLUMN "preferredTime" TEXT;
