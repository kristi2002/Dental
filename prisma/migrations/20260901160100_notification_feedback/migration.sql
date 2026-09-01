-- What the outbox could not previously say, in five columns.
--
-- Three of them are about a send that was *tried*. Until now a refusal from the
-- mail provider wrote a sentence into `note` and left the row PENDING — correct,
-- and indistinguishable from a row nobody had got to, because `note` is also how
-- a skip explains itself. `attempts` separates the two, and `sendAfter` finally
-- does the job its own doc comment reserved for it: a refused row steps forward
-- a few minutes instead of offering the same broken button to the next person
-- who opens the screen.
--
-- The other two are the feedback loop the sending half never had. `SENT` has
-- always meant "the provider accepted it", which is a claim about the provider
-- and not about the patient; a dead address bounced into silence for ever. The
-- delivery-event webhook writes here, and the queue's rules read a bounced
-- address as no address at all.

-- The case at the laboratory a WORK_READY row is about. Nullable, cascading:
-- a deleted case has nothing left to tell anybody about, exactly as a deleted
-- appointment has not.
ALTER TABLE "ScheduledMessage"
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastAttemptAt" TIMESTAMP(3),
  ADD COLUMN "workId" TEXT;

ALTER TABLE "ScheduledMessage"
  ADD CONSTRAINT "ScheduledMessage_workId_fkey"
  FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "ScheduledMessage_workId_idx" ON "ScheduledMessage"("workId");

-- How a provider says an address did not work. Four values because each has a
-- different person doing something about it — see the enum's doc comment.
CREATE TYPE "EmailBounceKind" AS ENUM ('HARD', 'SOFT', 'BLOCKED', 'SPAM');

ALTER TABLE "Patient"
  ADD COLUMN "emailBouncedAt" TIMESTAMP(3),
  ADD COLUMN "emailBounceKind" "EmailBounceKind";
