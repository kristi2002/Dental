/**
 * Keep the activity log from becoming the largest table in the database.
 *
 * It is append-only and nearly every mutation writes a row — plus every login,
 * every logout and every refused permission check. Nothing in the app ever
 * removes one, so it grows without bound; on a clinic mini-PC that is a disk
 * that fills up quietly over a couple of years.
 *
 *     npx tsx --env-file=.env prisma/prune-audit.ts                    # dry run, 24 months
 *     npx tsx --env-file=.env prisma/prune-audit.ts --months 36
 *     npx tsx --env-file=.env prisma/prune-audit.ts --apply
 *     npx tsx --env-file=.env prisma/prune-audit.ts --apply --archive audit-2024.jsonl
 *
 * Archive first when the retention period is a policy rather than a preference:
 * the rows are written out as JSON lines before they are removed, so "who
 * changed this in 2024" is still answerable from a file even once it is no
 * longer answerable from the app.
 */
import { appendFile } from 'node:fs/promises';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const MONTHS = Number(args[args.indexOf('--months') + 1]) || 24;
const ARCHIVE = args.includes('--archive') ? args[args.indexOf('--archive') + 1] : null;

/** Written in batches so a decade of rows never has to fit in memory at once. */
const BATCH = 1000;

async function main() {
  const cutoff = new Date();
  cutoff.setUTCMonth(cutoff.getUTCMonth() - MONTHS);

  const total = await prisma.auditLog.count();
  const stale = await prisma.auditLog.count({ where: { createdAt: { lt: cutoff } } });

  console.log(`Audit log: ${total} rows, ${stale} older than ${MONTHS} months.`);
  console.log(`Cutoff: ${cutoff.toISOString().slice(0, 10)}`);

  if (stale === 0 || !APPLY) {
    console.log(APPLY ? '\nNothing to remove.' : '\nDry run — nothing written. Re-run with --apply.');
    await prisma.$disconnect();
    return;
  }

  if (ARCHIVE) {
    let written = 0;
    for (;;) {
      const rows = await prisma.auditLog.findMany({
        where: { createdAt: { lt: cutoff } },
        orderBy: { createdAt: 'asc' },
        skip: written,
        take: BATCH,
      });
      if (rows.length === 0) break;
      await appendFile(ARCHIVE, rows.map((row) => JSON.stringify(row)).join('\n') + '\n');
      written += rows.length;
      process.stdout.write(`\r  archived ${written}/${stale}`);
    }
    console.log(`\n  → ${ARCHIVE}`);
  }

  const { count } = await prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
  console.log(`\nRemoved ${count} rows.`);
  if (!ARCHIVE) {
    console.log('No archive was written — those entries are gone for good.');
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
