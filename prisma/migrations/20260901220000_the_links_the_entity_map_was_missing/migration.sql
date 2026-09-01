-- The edges the schema argued for and never drew, plus the three things it
-- said about itself that were not true.
--
-- Every change here follows an argument already written down in
-- `schema.prisma`; none of them introduces a new idea. They are grouped by what
-- they close.
--
--  1. **Visit provenance.** `ToothRecord`, `ToothFinding`, `PerioExam`,
--     `ChartExam` and `StockMovement` can each name the visit they happened at.
--     `PatientDocument`, `Prescription` and `Work` could not — so "what happened
--     at this visit" accounted for the teeth and the boxes and then went silent
--     about the radiograph, the prescription and the case that went to the lab.
--
--  2. **Catalogue ids.** `WorkLine.procedure` was text while `WorkLine.lab`,
--     directly beside it, had already been given an id for the identical stated
--     reason. `AppointmentRequest` had no way to say who a stranger turned out
--     to be. `Contact` and the `ScheduledMessage` that produced it were written
--     in one transaction and could not name each other.
--
--  3. **Retirement.** Four lookup tables were hard-delete only while every row
--     that named them was `SetNull` — so removing a treatment, a supplier, a
--     wording or a kind of work silently unlinked history from it.
--
--  4. **Three claims that were false.** `Patient_searchKey_idx` was a B-tree
--     answering `LIKE '%x%'`, which it cannot do, so every patient search was
--     the sequential scan the column was added to avoid. `ToothFinding.status`
--     was an unconstrained string under a unique key, so a bad value made a
--     second finding instead of an error. And four foreign keys to `StaffUser`
--     were indexed against a rule the rest of the file follows.
--
--  5. **Dead columns.** `StockItem.unit`, `packSize` and `category` have been
--     documented as dead for three releases, each kept because "dropping a
--     populated column is a decision, not a tidy-up". This is the decision.
--
--  6. **One field the record was missing.** `Patient.sex`.

-- ---------------------------------------------------------------------------
-- 0. The extension the search index needs.
-- ---------------------------------------------------------------------------
--
-- `pg_trgm` has been a *trusted* extension since PostgreSQL 13, which means the
-- database owner may install it without being a superuser — that is what makes
-- this safe to put in a migration the deploy replays unattended. If it fails,
-- it fails loudly here rather than leaving the index quietly absent and the
-- search quietly scanning, which is the state this whole section is fixing.
--
-- **An extension is installed once per database, into one schema.** That is the
-- trap, and this project walks straight into it: the end-to-end suite replays
-- these same migrations into a schema of its own (`e2e`) inside the *same*
-- database the app uses, precisely so it can prove the deploy works. So the
-- second schema to run this finds `IF NOT EXISTS` already satisfied — by an
-- extension living somewhere its own `search_path` does not reach — and
-- `gin_trgm_ops` fails to resolve. See `e2e/env.ts`, and `src/lib/db-url.ts`
-- for the wider version of the same hazard.
--
-- The index is therefore built with the operator class qualified by wherever
-- the extension actually is, looked up rather than assumed. Hard-coding
-- `public` would work today and be wrong the first time somebody installs the
-- extension anywhere else.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- 1. Visit provenance
-- ---------------------------------------------------------------------------

ALTER TABLE "PatientDocument" ADD COLUMN "visitRecordId" TEXT;
ALTER TABLE "Prescription"    ADD COLUMN "visitRecordId" TEXT;
ALTER TABLE "Work"            ADD COLUMN "visitRecordId" TEXT;

ALTER TABLE "PatientDocument" ADD CONSTRAINT "PatientDocument_visitRecordId_fkey"
    FOREIGN KEY ("visitRecordId") REFERENCES "VisitRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_visitRecordId_fkey"
    FOREIGN KEY ("visitRecordId") REFERENCES "VisitRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Work" ADD CONSTRAINT "Work_visitRecordId_fkey"
    FOREIGN KEY ("visitRecordId") REFERENCES "VisitRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "PatientDocument_visitRecordId_idx" ON "PatientDocument"("visitRecordId");
CREATE INDEX "Prescription_visitRecordId_idx"    ON "Prescription"("visitRecordId");
CREATE INDEX "Work_visitRecordId_idx"            ON "Work"("visitRecordId");

-- Backfill, by the same rule the application will apply from now on and one
-- notch more careful than it.
--
-- `sameDayVisitId` attributes a chart edit to that day's visit, on the argument
-- that "a change made on the same day as a visit belongs to that visit far more
-- often than it belongs to nothing", and takes the newest where there are two.
-- Reaching back over history nobody is watching, ambiguity is left alone
-- instead: a day with exactly one write-up is linked, a day with two is not.
-- A wrong link here is a radiograph filed under the wrong treatment, and there
-- is nobody at the screen to notice it happen.
UPDATE "PatientDocument" d
SET "visitRecordId" = v."id"
FROM "VisitRecord" v
WHERE d."visitRecordId" IS NULL
  AND v."patientId" = d."patientId"
  AND v."visitDate" = date_trunc('day', d."createdAt" AT TIME ZONE 'UTC')
  AND (
    SELECT count(*) FROM "VisitRecord" c
    WHERE c."patientId" = d."patientId" AND c."visitDate" = v."visitDate"
  ) = 1;

UPDATE "Prescription" p
SET "visitRecordId" = v."id"
FROM "VisitRecord" v
WHERE p."visitRecordId" IS NULL
  AND v."patientId" = p."patientId"
  AND v."visitDate" = date_trunc('day', p."createdAt" AT TIME ZONE 'UTC')
  AND (
    SELECT count(*) FROM "VisitRecord" c
    WHERE c."patientId" = p."patientId" AND c."visitDate" = v."visitDate"
  ) = 1;

-- The register's own date, not `createdAt`: `sentAt` is the day the case went
-- out and `createdAt` is the day somebody typed it up, which is the distinction
-- `Work.sentAt` exists to draw and would be thrown away by matching on the
-- wrong one.
UPDATE "Work" w
SET "visitRecordId" = v."id"
FROM "VisitRecord" v
WHERE w."visitRecordId" IS NULL
  AND w."patientId" IS NOT NULL
  AND v."patientId" = w."patientId"
  AND v."visitDate" = w."sentAt"
  AND (
    SELECT count(*) FROM "VisitRecord" c
    WHERE c."patientId" = w."patientId" AND c."visitDate" = w."sentAt"
  ) = 1;

-- ---------------------------------------------------------------------------
-- 2. Catalogue ids
-- ---------------------------------------------------------------------------

-- 2a. `WorkLine.procedure` gets the id its neighbour `lab` already has.
ALTER TABLE "WorkLine" ADD COLUMN "procedureId" TEXT;
ALTER TABLE "WorkLine" ADD CONSTRAINT "WorkLine_procedureId_fkey"
    FOREIGN KEY ("procedureId") REFERENCES "WorkProcedure"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "WorkLine_procedureId_idx" ON "WorkLine"("procedureId");

-- Point every line at the catalogue entry its own text already names, folded
-- case-insensitively — the same comparison `saveWorkProcedure` makes, and the
-- resolution `20260826000001_laboratories` used for the identical problem on
-- `lab`. A spelling nobody catalogued keeps its text and stays unlinked, which
-- is what `getProcedureSuggestions` is for.
UPDATE "WorkLine" wl
SET "procedureId" = p."id"
FROM "WorkProcedure" p
WHERE wl."procedureId" IS NULL
  AND lower(btrim(p."name")) = lower(btrim(wl."procedure"));

-- 2b. A request finally gets to say who it turned out to be.
--
-- No backfill, deliberately, and this is the one place in this migration where
-- an obvious one is refused. Requests carry a telephone number and so do
-- patients, so a match is a single join away — and a household shares a number.
-- Attaching a stranger's enquiry to a named patient's record on that evidence
-- is a data-protection failure, not a tidy-up, and the column is one the desk
-- fills in when it registers somebody.
ALTER TABLE "AppointmentRequest" ADD COLUMN "patientId" TEXT;
ALTER TABLE "AppointmentRequest" ADD CONSTRAINT "AppointmentRequest_patientId_fkey"
    FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "AppointmentRequest_patientId_idx" ON "AppointmentRequest"("patientId");

-- 2c. The queue row and the contact it produced.
ALTER TABLE "Contact" ADD COLUMN "scheduledMessageId" TEXT;
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_scheduledMessageId_fkey"
    FOREIGN KEY ("scheduledMessageId") REFERENCES "ScheduledMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Contact_scheduledMessageId_key" ON "Contact"("scheduledMessageId");

-- ---------------------------------------------------------------------------
-- 3. Retirement, for the four lookups every historical row points at
-- ---------------------------------------------------------------------------

ALTER TABLE "Service"              ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "Supplier"             ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "PrescriptionTemplate" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "WorkProcedure"        ADD COLUMN "archivedAt" TIMESTAMP(3);

-- ---------------------------------------------------------------------------
-- 4. The three claims that were false
-- ---------------------------------------------------------------------------

-- 4a. The patient search index, rebuilt as the kind that can answer the query.
--
-- `patient-search.ts` issues `contains`, which is `LIKE '%bekim%'`, and a
-- leading wildcard is the one shape a B-tree cannot start from. The old index
-- was written on every patient save and read never.
DROP INDEX "Patient_searchKey_idx";

DO $$
DECLARE ext_schema text;
BEGIN
    SELECT n.nspname INTO ext_schema
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'pg_trgm';

    IF ext_schema IS NULL THEN
        RAISE EXCEPTION 'pg_trgm is not installed; the patient search index cannot be built';
    END IF;

    -- Qualified only here, at creation. An index stores the operator class it
    -- was built with by OID, so nothing that *reads* it afterwards depends on
    -- a search path — which is why the schema declares the class unqualified
    -- and `prisma migrate diff` still reports no drift.
    EXECUTE format(
        'CREATE INDEX "Patient_searchKey_idx" ON "Patient" USING GIN ("searchKey" %I.gin_trgm_ops)',
        ext_schema
    );
END $$;

-- 4b. `ToothFinding.status` becomes the enum the column always described.
--
-- Converted in place with `USING`, never dropped and re-added: the unique key
-- is `[patientId, toothNum, status]`, so this column *is* half of a finding's
-- identity and rewriting it would not migrate the chart, it would erase it.
--
-- Anything the enum cannot hold is removed first. In practice that is nothing —
-- `isToothStatus` has guarded the only write path since the table existed — but
-- `HEALTHY` is storable today and means "no finding", so a row carrying it is a
-- row that says a tooth is fine by asserting something about it, and the cast
-- would fail on it and take the deploy down rather than the row.
CREATE TYPE "ToothFindingStatus" AS ENUM (
    'CARIES', 'FILLED', 'CROWN', 'ROOT_CANAL', 'EXTRACTED', 'IMPLANT', 'MISSING',
    'SEALANT', 'FRACTURE', 'VENEER', 'BRIDGE',
    'IMPACTED', 'RETAINED_ROOT', 'PERIAPICAL', 'TEMPORARY', 'WATCH'
);

DELETE FROM "ToothFinding"
WHERE "status" NOT IN (
    'CARIES', 'FILLED', 'CROWN', 'ROOT_CANAL', 'EXTRACTED', 'IMPLANT', 'MISSING',
    'SEALANT', 'FRACTURE', 'VENEER', 'BRIDGE',
    'IMPACTED', 'RETAINED_ROOT', 'PERIAPICAL', 'TEMPORARY', 'WATCH'
);

ALTER TABLE "ToothFinding"
    ALTER COLUMN "status" TYPE "ToothFindingStatus" USING "status"::"ToothFindingStatus";

-- 4c. Four foreign keys to `StaffUser` that were indexed against the rule the
--     rest of the file follows — see the note on `Prescription`. No query
--     filters on any of them and no action can delete a staff account, so each
--     was a write on every insert to a busy table in exchange for nothing.
DROP INDEX "StockMovement_staffUserId_idx";
DROP INDEX "FollowUp_assignedToId_idx";
DROP INDEX "StockAlertDismissal_dismissedById_idx";
DROP INDEX "ToothFinding_recordedById_idx";

-- 4d. A patient's appointments are always read newest-first, and the index
--     stopped at the filter.
DROP INDEX "Appointment_patientId_idx";
CREATE INDEX "Appointment_patientId_date_idx" ON "Appointment"("patientId", "date");

-- ---------------------------------------------------------------------------
-- 5. The dead columns on `StockItem`
-- ---------------------------------------------------------------------------
--
-- `unit` and `packSize` were superseded when the storage room settled on
-- counting boxes and saying so in one word; `category` is the free-text box
-- `categoryId` replaced, and `getStockCategories` has been adopting it
-- opportunistically on every read ever since. That pass is repeated once here
-- for anything no request happened to touch, exactly as
-- `20260901180000_retire_legacy_service_fields` did for the identical column on
-- `Service`, before the column goes.
INSERT INTO "StockCategory" ("id", "name", "createdAt")
SELECT gen_random_uuid(), "picked"."name", CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT ON (lower("spelling")) "spelling" AS "name"
    FROM (
        SELECT btrim("category") AS "spelling", count(*) AS "uses"
        FROM "StockItem"
        WHERE "categoryId" IS NULL AND "category" IS NOT NULL AND btrim("category") <> ''
        GROUP BY btrim("category")
    ) AS "counted"
    ORDER BY lower("spelling"), "uses" DESC, "spelling" ASC
) AS "picked"
WHERE NOT EXISTS (
    SELECT 1 FROM "StockCategory" existing
    WHERE lower(existing."name") = lower("picked"."name")
);

UPDATE "StockItem" s
SET "categoryId" = c."id"
FROM "StockCategory" c
WHERE s."categoryId" IS NULL
  AND s."category" IS NOT NULL
  AND btrim(s."category") <> ''
  AND lower(c."name") = lower(btrim(s."category"));

ALTER TABLE "StockItem" DROP COLUMN "category";
ALTER TABLE "StockItem" DROP COLUMN "packSize";
ALTER TABLE "StockItem" DROP COLUMN "unit";

-- ---------------------------------------------------------------------------
-- 6. The field the clinical record was missing
-- ---------------------------------------------------------------------------
--
-- Nullable, and no backfill: null means nobody has asked, which is the true
-- state of every record written before this column. Guessing from a first name
-- would put an inference into a medical record and be wrong across three
-- languages before it was wrong anywhere else.
CREATE TYPE "PatientSex" AS ENUM ('FEMALE', 'MALE', 'OTHER');
ALTER TABLE "Patient" ADD COLUMN "sex" "PatientSex";
