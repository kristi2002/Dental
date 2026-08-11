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
 * Case- and accent-insensitive substring test, for filtering a list in memory.
 * Typing "cesh" has to find "Çështje" — nobody reaches for the diacritics when
 * they are hunting for a row.
 */
export function matches(haystack: string, needle: string): boolean {
  const fold = (value: string) =>
    value
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLocaleLowerCase();

  return fold(haystack).includes(fold(needle));
}

/** Visit records store services as a comma-separated list (per the schema comment). */
export function parseServiceList(services: string): string[] {
  return services
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
