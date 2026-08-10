/**
 * Limits and formatting shared by the upload form (client) and the storage
 * helpers (server). Kept apart from `files.ts` so a client component never
 * pulls `node:fs` into the browser bundle.
 */

/** A radiograph is a few MB; anything far past that is a mistake, not an X-ray. */
export const MAX_FILE_BYTES = 12 * 1024 * 1024;

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
