import { defineRouting } from 'next-intl/routing';

export const locales = ['sq', 'en', 'it'] as const;
export type Locale = (typeof locales)[number];

/** Shown in the language switcher — endonyms, so each reader recognises their own. */
export const localeLabels: Record<Locale, string> = {
  sq: 'Shqip',
  en: 'English',
  it: 'Italiano',
};

/** The same three, for phone-width mastheads where the endonyms don't fit. */
export const localeShortLabels: Record<Locale, string> = {
  sq: 'SQ',
  en: 'EN',
  it: 'IT',
};

export const routing = defineRouting({
  locales,
  defaultLocale: 'sq',
  localePrefix: 'always',
});
