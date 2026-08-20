import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { routing } from '@/i18n/routing';
import { clinicDisplayName, getClinicProfile } from '@/lib/queries';
import { poppins } from '../fonts';
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
    <html lang={locale} className={poppins.variable}>
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
