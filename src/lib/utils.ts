/** Tiny class-name joiner — keeps conditional Tailwind strings readable. */
export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

/** Trim a form value, returning `null` for empty strings so optional DB columns stay NULL. */
export function optionalString(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Trim a required form value. */
export function requiredString(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function toInt(value: FormDataEntryValue | null, fallback = 0): number {
  const parsed = Number.parseInt(typeof value === 'string' ? value : '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function initials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

/**
 * Lowercase and strip diacritics, so "Çështje" and "cesh" are comparable and
 * "Penicilinë" and "penicillin" are nearly so.
 *
 * Shared, because three different places had grown their own copy: the row
 * filter here, the allergy cross-check in `medical.ts`, and the drug catalogue
 * in `drugs.ts`. The last two have to fold text *the same way* or a stem stops
 * matching the word it was written for.
 */
export function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase()
    .trim();
}

/**
 * Case- and accent-insensitive substring test, for filtering a list in memory.
 * Typing "cesh" has to find "Çështje" — nobody reaches for the diacritics when
 * they are hunting for a row.
 */
export function matches(haystack: string, needle: string): boolean {
  return fold(haystack).includes(fold(needle));
}

/** Visit records store services as a comma-separated list (per the schema comment). */
export function parseServiceList(services: string): string[] {
  return services
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
