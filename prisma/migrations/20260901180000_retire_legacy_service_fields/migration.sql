-- Two loose ends left over from the service catalogue's build-out, closed
-- together because both were only waiting on the deploy being able to run
-- reviewed SQL rather than `db push` (see `deploy-replays-migrations`).
--
-- 1. `Service.category` (the Prisma field was named `legacyCategory`) is the
--    free-text box `categoryId` replaced. `getServiceCategories` has been
--    adopting it opportunistically on every read since — turning each
--    distinct spelling into a top-level `ServiceCategory` and clearing the
--    column — so this repeats that pass once, in SQL, for anything no
--    request happened to touch, then drops the column outright.
--
--    Distinct spellings are folded case-insensitively, same as the running
--    adoption code; unlike it, the spelling kept is the one used most often
--    (ties broken alphabetically) rather than whichever row a query returned
--    first — the same resolution `20260826000001_laboratories` used for the
--    identical problem on `WorkLine.lab`.
--
-- 2. `ServiceMaterial` — the bill-of-materials table — was replaced by
--    scanning the product itself and has been dead weight since. `db push`
--    could not drop a populated table, which is why
--    `prisma/drop-service-materials.ts` existed as a manual step between two
--    releases; `migrate deploy` can empty and drop it in one statement, so
--    the table goes here and the script goes with it.

-- Backfill: one category per distinct legacy spelling not already on file.
INSERT INTO "ServiceCategory" ("id", "name", "parentId", "createdAt")
SELECT gen_random_uuid(), "picked"."name", NULL, CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT ON (lower("spelling")) "spelling" AS "name"
    FROM (
        SELECT btrim("category") AS "spelling", count(*) AS "uses"
        FROM "Service"
        WHERE "categoryId" IS NULL AND "category" IS NOT NULL AND btrim("category") <> ''
        GROUP BY btrim("category")
    ) AS "counted"
    ORDER BY lower("spelling"), "uses" DESC, "spelling" ASC
) AS "picked"
WHERE NOT EXISTS (
    SELECT 1 FROM "ServiceCategory" existing
    WHERE existing."parentId" IS NULL
      AND lower(existing."name") = lower("picked"."name")
);

-- Point every still-unfiled treatment at the row its own text now names.
UPDATE "Service" s
SET "categoryId" = c."id"
FROM "ServiceCategory" c
WHERE s."categoryId" IS NULL
  AND s."category" IS NOT NULL
  AND btrim(s."category") <> ''
  AND c."parentId" IS NULL
  AND lower(c."name") = lower(btrim(s."category"));

-- AlterTable
ALTER TABLE "Service" DROP COLUMN "category";

-- DropTable
DROP TABLE "ServiceMaterial";
