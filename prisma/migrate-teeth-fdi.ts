/**
 * One-off: convert `ToothRecord.toothNum` from Universal (1–32) to FDI.
 *
 * The chart used to store the American numbering while shipping in Albanian and
 * Italian; see `src/lib/teeth.ts`. Existing rows must be converted, because the
 * two systems overlap — 11–32 are valid in both and mean different teeth — so
 * there is no way to tell them apart at read time. Run once, after `db:push`:
 *
 *     npx tsx --env-file=.env prisma/migrate-teeth-fdi.ts          # dry run
 *     npx tsx --env-file=.env prisma/migrate-teeth-fdi.ts --apply
 *
 * Safe to run twice: a table already holding FDI numbers has nothing outside
 * 1–32 to convert, and the script refuses rather than guessing when it finds a
 * mixture it cannot explain.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/** Universal 1–32 → FDI, in Universal's own order. */
const UNIVERSAL_TO_FDI = [
  18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28,
  38, 37, 36, 35, 34, 33, 32, 31, 41, 42, 43, 44, 45, 46, 47, 48,
];

const FDI_TEETH = new Set([
  ...UNIVERSAL_TO_FDI,
  ...[5, 6, 7, 8].flatMap((q) => [1, 2, 3, 4, 5].map((i) => q * 10 + i)),
]);

async function main() {
  const apply = process.argv.includes('--apply');
  const records = await prisma.toothRecord.findMany({
    select: { id: true, toothNum: true, patientId: true },
    orderBy: { toothNum: 'asc' },
  });

  if (records.length === 0) {
    console.log('No tooth records. Nothing to do.');
    return;
  }

  // 1–8 are Universal-only; 33+ are FDI-only. Both present means a half-run
  // migration or hand-edited data, and guessing would corrupt a chart.
  const universalOnly = records.filter((r) => r.toothNum >= 1 && r.toothNum <= 8);
  const fdiOnly = records.filter((r) => r.toothNum >= 33 && FDI_TEETH.has(r.toothNum));

  if (universalOnly.length > 0 && fdiOnly.length > 0) {
    throw new Error(
      `Refusing to run: found ${universalOnly.length} clearly-Universal and ${fdiOnly.length} ` +
        'clearly-FDI records in the same table. Sort this out by hand.',
    );
  }

  if (universalOnly.length === 0 && fdiOnly.length > 0) {
    console.log(`${records.length} records already look like FDI. Nothing to do.`);
    return;
  }

  const convertible = records.filter((r) => r.toothNum >= 1 && r.toothNum <= 32);
  const unknown = records.filter((r) => r.toothNum < 1 || r.toothNum > 32);

  console.log(`${records.length} tooth records`);
  console.log(`  ${convertible.length} to convert`);
  if (unknown.length > 0) {
    console.log(`  ${unknown.length} outside 1–32, left alone: ${unknown.map((r) => r.toothNum).join(', ')}`);
  }

  const sample = convertible.slice(0, 8);
  for (const record of sample) {
    console.log(`    ${record.toothNum} → ${UNIVERSAL_TO_FDI[record.toothNum - 1]}`);
  }

  if (!apply) {
    console.log('\nDry run. Re-run with --apply to write.');
    return;
  }

  // Two passes, because `@@unique([patientId, toothNum])` is checked per
  // statement and the two numberings overlap: rewriting Universal 11 to FDI 21
  // collides with the row still holding Universal 21, which has not been
  // converted yet. Parking everything in the negatives first sidesteps the
  // whole ordering problem — negatives are unique for the same reason the
  // originals were, and no real tooth number can be one.
  //
  // Both passes in one transaction: a chart half in each system, or half in the
  // negatives, is worse than either.
  await prisma.$transaction([
    ...convertible.map((record) =>
      prisma.toothRecord.update({
        where: { id: record.id },
        data: { toothNum: -record.toothNum },
      }),
    ),
    ...convertible.map((record) =>
      prisma.toothRecord.update({
        where: { id: record.id },
        data: { toothNum: UNIVERSAL_TO_FDI[record.toothNum - 1] },
      }),
    ),
  ]);

  console.log(`\nConverted ${convertible.length} records to FDI.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
