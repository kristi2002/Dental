-- The outbox gains the three kinds it was built for.
--
-- `dedupeKey`'s own doc comment reserved the shape from the beginning — a
-- namespace prefix and a period, so a kind that recurs for the same subject can
-- say which occurrence it is — and for two releases the table had two tenants.
-- Each of these three already had a screen somebody had to remember to open,
-- which is exactly the state the recall was in before it was queued:
--
--   POST_OP_CHECK   `selectFollowUps` already decides who; the window is four
--                   days wide and nothing put it in front of anybody.
--   WORK_READY      the register has known since `receivedAt`; the patient
--                   found out when somebody remembered to ring.
--   PLAN_NEXT_STEP  `summarisePlan` already calls a plan stalled; the tab
--                   waited to be opened.
--
-- Alone in its own migration, as `20260826000002_recall_message_kind` is, and
-- for the reason that one gives implicitly: Postgres will add a value to an enum
-- inside a transaction but will not let the same transaction use it, and Prisma
-- wraps one migration file in one transaction. The columns that go with this
-- release are in the migration after it.
ALTER TYPE "MessageKind" ADD VALUE IF NOT EXISTS 'POST_OP_CHECK';
ALTER TYPE "MessageKind" ADD VALUE IF NOT EXISTS 'WORK_READY';
ALTER TYPE "MessageKind" ADD VALUE IF NOT EXISTS 'PLAN_NEXT_STEP';
