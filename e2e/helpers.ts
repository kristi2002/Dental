/**
 * The handful of things every spec needs, and nothing else.
 *
 * Kept small on purpose. A page-object layer over fifty screens would be a
 * second app to maintain and would hide exactly the thing this suite is for —
 * whether the real control is on the real page.
 */
import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Every *signed-in* screen the smoke pass walks, with no parameter to fill in.
 *
 * The practice's public page is deliberately not on this list. It lives at `/`,
 * it has no session behind it, and a pass that opened it while carrying the
 * owner's cookie would prove nothing about the thing that matters — that a
 * stranger can read it. `storefront.spec.ts` opens it signed out instead.
 */
export const STATIC_ROUTES: readonly string[] = [
  '/dashboard',
  '/appointments',
  '/day-sheet',
  '/patients',
  '/patients/new',
  '/patients/import',
  '/plans',
  '/plans/new',
  '/works',
  '/works/new',
  '/works/labs',
  '/works/labs/new',
  '/works/procedures',
  '/works/procedures/new',
  '/recalls',
  '/reminders',
  '/inbox',
  '/requests',
  '/follow-ups',
  '/services',
  '/services/new',
  '/services/categories',
  '/services/categories/new',
  '/services/import',
  '/prescriptions',
  '/prescriptions/issued',
  '/prescriptions/templates/new',
  '/stock',
  '/stock/new',
  '/stock/catalog',
  '/stock/labels',
  '/stock/categories',
  '/stock/categories/new',
  '/stock/suppliers',
  '/stock/suppliers/new',
  '/stock/import',
  '/stock/scan',
  '/stock/stocktake',
  '/stock/expiry',
  '/analytics',
  '/staff',
  '/staff/new',
  '/activity',
  '/settings',
  '/settings/operatories/new',
];

/**
 * Signs in through the number pad.
 *
 * `en` rather than the default `sq`, because every assertion downstream reads
 * better in the language this repository is written in. The locale is a URL
 * prefix, so this exercises the same code path either way.
 */
export async function signIn(
  page: Page,
  who: { firstName: string; lastName: string; pin: string },
  locale = 'en',
): Promise<void> {
  await page.goto(`/${locale}/login`);

  // The picker comes first; the pad only exists once somebody is chosen.
  await page.getByRole('button', { name: `${who.firstName} ${who.lastName}` }).click();
  // Exact: the screen's own subtitle also contains the phrase.
  await expect(page.getByText('Enter your PIN', { exact: true })).toBeVisible();

  for (const digit of who.pin) {
    await page.getByRole('button', { name: digit, exact: true }).click();
  }

  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  // The dashboard, which lives at `/dashboard` rather than at the locale root —
  // the root is the practice's public page and signing in never lands there.
  await page.waitForURL(`**/${locale}/dashboard`, { timeout: 15_000 });
}

/**
 * Console errors worth failing a test over.
 *
 * Returns a live array; assert on it after the navigation you care about.
 * Filtered rather than raw: a browser logs things the application did not
 * cause, and a smoke pass that fails on a favicon 404 gets switched off.
 */
export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];

  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (IGNORED_CONSOLE.some((pattern) => pattern.test(text))) return;
    errors.push(text);
  });

  page.on('pageerror', (error) => {
    errors.push(`uncaught: ${error.message}`);
  });

  return errors;
}

const IGNORED_CONSOLE: readonly RegExp[] = [
  // Chrome logs these for any non-2xx subresource; the response assertions in
  // the spec are the real check on those.
  /Failed to load resource/i,
  // Next's own dev-time noise, in case someone points the suite at `next dev`.
  /Download the React DevTools/i,
];

/** The main heading of a screen, however the layout spells it. */
export function heading(page: Page): Locator {
  return page.locator('h1').first();
}
