import { isAllowedMimeType } from './file-constants';

/**
 * Where a material's photograph is fetched from, and what counts as one.
 *
 * No Node imports, deliberately: the catalogue's upload tile is a client
 * component and must not drag `node:fs` into the browser bundle. The bytes
 * themselves are stored and read by `files.ts`, which is server-only.
 */

/** Whose photograph it is — the exact box, or the product all its variants share. */
export type PhotoOwner = 'item' | 'product';

export function isPhotoOwner(value: string): value is PhotoOwner {
  return value === 'item' || value === 'product';
}

/**
 * A photograph is looked at, so it has to be an image. A PDF here would render
 * as a grey rectangle in the one cell of the catalogue that exists to *be* the
 * picture — see `saveIdDocument`, which refuses one for the same reason.
 */
export function isPhotoMimeType(value: string): boolean {
  return value.startsWith('image/') && isAllowedMimeType(value);
}

/**
 * The URL the catalogue points an `<img>` at.
 *
 * Carries a token off the storage key, which is a fresh uuid for every upload:
 * replacing a photo therefore changes the URL, and the browser fetches the new
 * one instead of showing the old one out of cache. That is what lets
 * `/api/stock/photo` mark these immutable and cache them for a year — sixty
 * boxes on one screen is sixty requests every load otherwise.
 *
 * Only the first characters of the key, because the whole thing is a filename on
 * disk and a URL has no business quoting one.
 */
export function photoUrl(kind: PhotoOwner, id: string, storageKey: string): string {
  return `/api/stock/photo/${kind}/${id}?v=${storageKey.slice(0, 8)}`;
}
