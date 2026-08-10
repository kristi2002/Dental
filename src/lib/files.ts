import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FILE_EXTENSIONS } from './file-constants';

/**
 * Storage for X-rays, photos and signed forms.
 *
 * Deliberately **not** under `public/`: anything in there is served to the whole
 * internet by filename, and a radiograph is medical data. Files live outside the
 * web root and are handed out only by `/api/documents/[id]`, which checks the
 * session first.
 *
 * Server-only. The limits and formatting the upload form needs live in
 * `file-constants.ts`, which carries no Node imports.
 */

const STORAGE_DIR =
  process.env.FILE_STORAGE_DIR ?? path.join(process.cwd(), 'storage', 'patient-files');

/**
 * Store the bytes and return the opaque key to record against the patient.
 *
 * The key is generated, never derived from the upload: the original filename is
 * user input and has no business steering a filesystem path.
 */
export async function storeFile(bytes: Uint8Array, mimeType: string): Promise<string> {
  await mkdir(STORAGE_DIR, { recursive: true });

  const storageKey = `${randomUUID()}${FILE_EXTENSIONS[mimeType] ?? ''}`;
  await writeFile(path.join(STORAGE_DIR, storageKey), bytes);

  return storageKey;
}

/** Reject any key that is not a bare filename — no traversal, no absolute paths. */
function resolveKey(storageKey: string): string {
  if (storageKey !== path.basename(storageKey)) {
    throw new Error(`Refusing to resolve suspicious storage key: ${storageKey}`);
  }
  return path.join(STORAGE_DIR, storageKey);
}

export async function readStoredFile(storageKey: string): Promise<Buffer> {
  return readFile(resolveKey(storageKey));
}

/** Best-effort: a missing file must not block deleting the record that names it. */
export async function deleteStoredFile(storageKey: string): Promise<void> {
  try {
    await unlink(resolveKey(storageKey));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('[files] could not delete', storageKey, error);
    }
  }
}
