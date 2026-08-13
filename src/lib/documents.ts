import { DocumentKind } from '@/generated/prisma/enums';

/**
 * The two document kinds the patient's details tab owns, so the file gallery can
 * leave them out of its grid rather than showing the ID twice.
 *
 * Deliberately here and not beside `IdCardPanel`: that file is `'use client'`,
 * and every export of a client module is a *client reference* on the server —
 * importing this array from there gave the page a proxy whose `.includes` is not
 * a function, which fails at render rather than at build.
 */
export const ID_KINDS: readonly DocumentKind[] = [DocumentKind.ID_FRONT, DocumentKind.ID_BACK];
