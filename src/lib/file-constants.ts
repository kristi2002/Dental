/**
 * Limits and formatting shared by the upload form (client) and the storage
 * helpers (server). Kept apart from `files.ts` so a client component never
 * pulls `node:fs` into the browser bundle.
 */

/** A radiograph is a few MB; anything far past that is a mistake, not an X-ray. */
export const MAX_FILE_BYTES = 12 * 1024 * 1024;

/**
 * How many files the public booking form takes in one request, and how much they
 * may weigh between them.
 *
 * Separate numbers from `MAX_FILE_BYTES` above, because the two forms are not
 * the same risk. That cap governs a member of staff uploading one radiograph to
 * a chart they are signed in to; these govern **an unauthenticated stranger
 * writing to the practice's disk**, and the honest limit for that is not "as
 * much as a dentist may store" but "as much as one enquiry can possibly need".
 *
 * Five is what an enquiry needs: an OPG, a couple of intra-oral photographs and
 * a report from the clinic they are leaving. Somebody with more than that has a
 * case the desk should be discussing on the telephone anyway.
 *
 * The total is the binding limit rather than a per-file one, and it is
 * deliberately no larger than the single-file cap the staff screens allow: five
 * X-rays that together weigh less than one document the practice itself would
 * store is a bound nobody has to think about twice. `requestAppointment` counts
 * the bytes it actually received, and `serverActions.bodySizeLimit` in
 * `next.config.ts` sits a little above this so the framework's own refusal is
 * never what a visitor meets first.
 */
export const MAX_REQUEST_FILES = 5;

export const MAX_REQUEST_UPLOAD_BYTES = 12 * 1024 * 1024;

/**
 * What a dental practice actually attaches. An allowlist rather than a
 * blocklist — the failure mode of guessing wrong is storing an executable.
 */
export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
] as const;

export function isAllowedMimeType(value: string): boolean {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(value);
}

export const FILE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'application/pdf': '.pdf',
};

/** Human-readable size for the document list. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
