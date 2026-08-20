/**
 * Find — and optionally remove — patient files on disk that no row points at.
 *
 * Deleting a patient used to cascade the `PatientDocument` rows away while
 * leaving the bytes behind, so every radiograph of every deleted patient stayed
 * on disk forever with nothing referencing it. That path now unlinks its own
 * files; this exists to clear what it already leaked, and to stay useful
 * afterwards as a safety net — a crash between the row delete and the unlink
 * leaves exactly the same orphan.
 *
 *     npx tsx --env-file=.env prisma/sweep-orphan-files.ts          # dry run
 *     npx tsx --env-file=.env prisma/sweep-orphan-files.ts --apply
 *
 * Errs heavily toward keeping things: a file younger than an hour is left alone,
 * because it may belong to an upload that is still in flight, and anything the
 * database still references is never touched.
 *
 * "Still references" means every column that can name a file — documents, stock
 * photographs and follow-up attachments all live in this one directory. That
 * list is `STORAGE_KEY_SOURCES` in `src/lib/storage-keys.ts`, and a test fails
 * if the schema grows a fifth one without it being added there. A sweeper that
 * misses a column does not under-report; it deletes that column's files.
 */
import { readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { referencedStorageKeys } from '../src/lib/storage-keys';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const APPLY = process.argv.includes('--apply');
const STORAGE_DIR =
  process.env.FILE_STORAGE_DIR ?? path.join(process.cwd(), 'storage', 'patient-files');

/** An upload in flight is not an orphan. */
const MIN_AGE_MS = 60 * 60 * 1000;

function human(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

async function main() {
  console.log(`Storage: ${STORAGE_DIR}`);

  let files: string[];
  try {
    files = await readdir(STORAGE_DIR);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.log('Directory does not exist — nothing to sweep.');
      await prisma.$disconnect();
      return;
    }
    throw error;
  }

  // Every column in the schema that names a file, not just the documents —
  // see `storage-keys.ts`. This asked `PatientDocument` alone until stock
  // photographs and follow-up attachments started sharing the directory, at
  // which point a dry run under-reported and `--apply` would have deleted them.
  const referenced = await referencedStorageKeys(prisma);
  console.log(`${files.length} files on disk, ${referenced.size} referenced by a record.\n`);

  const now = Date.now();
  let orphans = 0;
  let bytes = 0;
  let tooYoung = 0;

  for (const name of files) {
    if (referenced.has(name)) continue;

    const info = await stat(path.join(STORAGE_DIR, name));
    if (!info.isFile()) continue;

    if (now - info.mtimeMs < MIN_AGE_MS) {
      tooYoung += 1;
      continue;
    }

    orphans += 1;
    bytes += info.size;
    console.log(`  orphan  ${name}  ${human(info.size)}`);
    if (APPLY) await unlink(path.join(STORAGE_DIR, name));
  }

  console.log(`\n${orphans} orphaned files, ${human(bytes)}.`);
  if (tooYoung > 0) {
    console.log(`${tooYoung} skipped as too recent to judge.`);
  }
  console.log(APPLY ? 'Removed.' : 'Dry run — nothing removed. Re-run with --apply.');

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
