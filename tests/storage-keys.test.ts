import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  referencedStorageKeys,
  STORAGE_KEY_SOURCES,
  type StorageKeyReader,
} from '../src/lib/storage-keys';

/**
 * The sweeper deletes files. That is the whole reason this file exists.
 *
 * `prisma/sweep-orphan-files.ts` walks `FILE_STORAGE_DIR` and removes anything
 * no row points at. A sweeper that does not know about one of the columns
 * holding a storage key does not merely under-report — it treats that column's
 * files as orphans and unlinks them. It knew only about `PatientDocument` for
 * as long as that was the only table storing a file, and stayed that way while
 * stock photographs and then follow-up attachments joined the same directory.
 *
 * So the list is read off `schema.prisma` rather than trusted, the same way
 * `backup.test.ts` checks the export against the schema — which is the check
 * that caught `FollowUpAttachment` missing from the backup on the day it was
 * added.
 */
const SCHEMA = path.join(process.cwd(), 'prisma', 'schema.prisma');

/**
 * Columns that hold a name in the storage directory.
 *
 * Matched on the column name rather than on a comment, because the naming is
 * consistent and a comment is not: `storageKey` is the documents' word and
 * `photoKey` the storage room's. A new column called `somethingKey` that holds
 * a filename would be missed — which is why the source list also carries the
 * model, so a mismatch in either direction shows up below.
 */
function storageColumnsInSchema(schema: string): Array<{ model: string; column: string }> {
  const found: Array<{ model: string; column: string }> = [];
  let model: string | null = null;

  for (const line of schema.split('\n')) {
    const modelStart = /^model (\w+)/.exec(line);
    if (modelStart) {
      model = modelStart[1];
      continue;
    }
    if (line.startsWith('}')) {
      model = null;
      continue;
    }
    if (!model) continue;

    const field = /^\s+(storageKey|photoKey)\s+String/.exec(line);
    if (field) found.push({ model, column: field[1] });
  }

  return found;
}

describe('storage keys — every file the database still points at', () => {
  it('covers every storage-key column in the schema', async () => {
    const schema = await readFile(SCHEMA, 'utf8');
    const inSchema = storageColumnsInSchema(schema);

    assert.ok(
      inSchema.length >= 4,
      `expected to find the storage-key columns, saw ${inSchema.length}`,
    );

    const covered = new Set(STORAGE_KEY_SOURCES.map((s) => `${s.model}.${s.column}`));
    const missing = inSchema
      .map((c) => `${c.model}.${c.column}`)
      .filter((key) => !covered.has(key));

    assert.deepEqual(
      missing,
      [],
      `these columns name a file on disk but nothing in storage-keys.ts reads them, ` +
        `so the sweeper would DELETE their files: ${missing.join(', ')}`,
    );
  });

  it('names no column the schema does not have', async () => {
    const schema = await readFile(SCHEMA, 'utf8');
    const inSchema = new Set(
      storageColumnsInSchema(schema).map((c) => `${c.model}.${c.column}`),
    );

    const stale = STORAGE_KEY_SOURCES.map((s) => `${s.model}.${s.column}`).filter(
      (key) => !inSchema.has(key),
    );

    assert.deepEqual(stale, [], `named in storage-keys.ts but gone from the schema: ${stale}`);
  });

  it('is read by the sweeper rather than reimplemented in it', async () => {
    const sweeper = await readFile(
      path.join(process.cwd(), 'prisma', 'sweep-orphan-files.ts'),
      'utf8',
    );

    assert.match(
      sweeper,
      /referencedStorageKeys/,
      'the sweeper must use referencedStorageKeys, or the coverage test above guards nothing',
    );
    assert.doesNotMatch(
      sweeper,
      /patientDocument\.findMany/,
      'the sweeper is reading one table directly again — that is the bug this file exists for',
    );
  });
});

describe('referencedStorageKeys — gathering the five sources', () => {
  const reader = (rows: {
    documents?: string[];
    attachments?: string[];
    mail?: string[];
    items?: Array<string | null>;
    products?: Array<string | null>;
  }): StorageKeyReader => ({
    patientDocument: {
      findMany: async () => (rows.documents ?? []).map((storageKey) => ({ storageKey })),
    },
    followUpAttachment: {
      findMany: async () => (rows.attachments ?? []).map((storageKey) => ({ storageKey })),
    },
    emailAttachment: {
      findMany: async () => (rows.mail ?? []).map((storageKey) => ({ storageKey })),
    },
    stockItem: { findMany: async () => (rows.items ?? []).map((photoKey) => ({ photoKey })) },
    stockProduct: {
      findMany: async () => (rows.products ?? []).map((photoKey) => ({ photoKey })),
    },
  });

  it('gathers all five into one set', async () => {
    const keys = await referencedStorageKeys(
      reader({
        documents: ['a.jpg'],
        attachments: ['b.png'],
        mail: ['e.pdf'],
        items: ['c.webp'],
        products: ['d.jpg'],
      }),
    );
    assert.deepEqual([...keys].toSorted(), ['a.jpg', 'b.png', 'c.webp', 'd.jpg', 'e.pdf']);
  });

  it('keeps a file somebody emailed the practice', async () => {
    // The case the coverage test above caught the day `EmailAttachment` was
    // added: without this source the sweeper treats every inbound X-ray as an
    // orphan and deletes it an hour after it arrives.
    const keys = await referencedStorageKeys(reader({ mail: ['xray.jpg'] }));
    assert.deepEqual([...keys], ['xray.jpg']);
  });

  it('drops the nulls, because most materials have no photograph', async () => {
    const keys = await referencedStorageKeys(reader({ items: [null, 'c.webp', null] }));
    assert.deepEqual([...keys], ['c.webp']);
  });

  it('dedupes a key two rows happen to share', async () => {
    const keys = await referencedStorageKeys(
      reader({ items: ['same.jpg'], products: ['same.jpg'] }),
    );
    assert.equal(keys.size, 1);
  });

  it('is empty for an empty database, and does not throw', async () => {
    assert.equal((await referencedStorageKeys(reader({}))).size, 0);
  });
});
