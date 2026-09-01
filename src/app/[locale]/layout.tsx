import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { DateNamesProvider } from '@/components/shared/DateNamesProvider';
import { routing } from '@/i18n/routing';
import { dateNamesFor } from '@/lib/date-names';
import { clinicDisplayName, getClinicProfile } from '@/lib/queries';
import { bodyFont } from '../fonts';
import { ThemeScript } from '@/components/layout/theme-script';
import '../globals.css';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * The colour a phone paints its own chrome with, matched to the top of the
 * navigation rail's gradient — so on Android the status bar above the app is
 * the same teal the app starts in rather than a white strip above it. The
 * literal is `--app-rail`'s first stop from `globals.css`; there is no way to
 * hand a browser a CSS variable here.
 */
export const viewport: Viewport = {
  themeColor: '#0b8f86',
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'app' });

  /**
   * The practice's name in the tab, not the product's.
   *
   * Every tab, every bookmark and every line of browser history is a place this
   * install says what it is, and "Patients · Shehu Dental" is the true answer —
   * the software is the practice's tool, not the other way round. The product's
   * own name is still what a practice that has not filled anything in gets.
   *
   * Guarded, because this runs for the sign-in screen and the appointment
   * confirmation link as well as for the app. A database that is down should
   * produce a page that says so, not a metadata function that throws before
   * any page has had the chance to.
   */
  let name = t('name');
  try {
    name = clinicDisplayName(await getClinicProfile()) || name;
  } catch {
    // Fall through to the product's name; the page below will report the real
    // failure far more usefully than a blank document would.
  }

  return {
    title: { default: name, template: `%s · ${name}` },
    description: t('tagline'),
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  // The signed-in chrome lives in `(app)/layout.tsx`; the login screen renders
  // inside this document without it.
  return (
    /* `suppressHydrationWarning`, on this element only, because `ThemeScript`
       below deliberately writes `data-theme` and `data-density` onto it before
       React has run. Hydration would otherwise find attributes in the DOM that
       its own tree has no record of, call that a mismatch, and *recover* by
       re-rendering this subtree from scratch — which strips the very attributes
       the script set, so the dim-surgery workstation flashes back to light on
       every load. The suppression tells React the DOM is right and its own
       output for this element is not. It reaches one level deep: everything
       inside `<body>` is still checked as strictly as before. */
    <html lang={locale} className={bodyFont.variable} suppressHydrationWarning>
      <head>
        {/* Before anything is painted. A theme applied by React arrives a frame
            late, and on a dim surgery screen that frame is a white flash — the
            exact thing somebody turned the evening theme on to stop. */}
        <ThemeScript />
      </head>
      <body>
        <NextIntlClientProvider>
          {/* Measured here, on Node, because Chrome has no Albanian locale data
              and every client component that renders a weekday would otherwise
              disagree with the server. See `lib/date-names.ts`. */}
          <DateNamesProvider names={dateNamesFor(locale)}>{children}</DateNamesProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
