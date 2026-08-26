/**
 * Every screen, opened once, in the language the practice actually uses.
 *
 * The cheapest test in the suite and the one most likely to earn its place. A
 * server component that throws renders an error boundary and still returns 200,
 * so "the build succeeded" says nothing about whether a page opens — and
 * forty-odd screens is more than anybody clicks through by hand before a deploy.
 *
 * Assertions stay shallow: status, a heading, a clean console. Anything about
 * *wording* belongs in `npm test`, which answers in eleven seconds and needs no
 * browser to do it.
 *
 * **The console assertion runs on `sq` deliberately.** Chromium ships no
 * Albanian locale data — `Intl.DateTimeFormat.supportedLocalesOf(['sq'])` comes
 * back empty — so for as long as any client component asked the browser to name
 * a weekday, every Albanian screen carrying a date reported a React hydration
 * mismatch. That was a real bug, not a harness artefact: real Chrome behaves the
 * same way, and the practice's own language was being replaced with English
 * after hydration. It is fixed (`docs/GAPS-PASS-4.md` §H-01, `lib/date-names.ts`)
 * and this is the check that holds it fixed. Moving these assertions to a locale
 * Chromium *does* have would quietly stop testing the thing that broke.
 */
import { expect, test } from '@playwright/test';
import { collectConsoleErrors, heading, STATIC_ROUTES } from './helpers';

// Explicitly *not* serial. These cases share nothing but the seed, and a smoke
// pass whose first failure hides the other forty-three answers the wrong
// question: "is anything broken" is worth less than "what is broken".
test.describe.configure({ mode: 'default' });

test.describe('every screen opens', () => {
  for (const route of STATIC_ROUTES) {
    test(route, async ({ page }) => {
      const errors = collectConsoleErrors(page);
      const response = await page.goto(`/sq${route === '/' ? '' : route}`);

      // The page itself, not a redirect to the login screen — a guard that
      // wrongly refuses the Owner would otherwise read as a pass.
      expect(response?.status(), `${route} returned ${response?.status()}`).toBe(200);
      expect(page.url(), `${route} redirected to ${page.url()}`).not.toContain('/login');

      // Next renders its error boundary with a 200, so the status above cannot
      // see a server component that threw. The heading can.
      await expect(heading(page), `${route} has no heading`).toBeVisible();
      await expect(heading(page)).not.toBeEmpty();

      // What `global-error.tsx` puts on screen when a render crashes.
      await expect(page.getByText('Something went wrong', { exact: false })).toHaveCount(0);

      // Hydration is asynchronous; React reports a mismatch shortly after the
      // document settles rather than during navigation.
      await page.waitForLoadState('networkidle');
      expect(errors, `${route} logged console errors`).toEqual([]);
    });
  }
});

/**
 * The other two locales, over the screens most likely to break in one and not
 * the others: the dashboard, a list, a form, and settings.
 *
 * Not all forty-four in all three. Three full passes would treble the slowest
 * part of the suite to catch a class of bug — a locale file missing a key — that
 * shows up on the first screen reading that namespace anyway.
 */
for (const locale of ['en', 'it'] as const) {
  test(`${locale} renders the sampled screens`, async ({ page }) => {
    const errors = collectConsoleErrors(page);

    for (const route of ['/', '/patients', '/patients/new', '/stock', '/settings']) {
      const response = await page.goto(`/${locale}${route === '/' ? '' : route}`);
      expect(response?.status(), `${locale}${route}`).toBe(200);
      await expect(heading(page), `${locale}${route} has no heading`).toBeVisible();
    }

    await page.waitForLoadState('networkidle');
    expect(errors).toEqual([]);
  });
}

/**
 * The calendar in Albanian, named rather than left to the sweep above.
 *
 * `/appointments` is where §H-01 was found and the week grid is what showed it,
 * so the fix gets an assertion that says what it is protecting instead of one
 * that only says "no console errors". `hën` is Albanian for Monday; a browser
 * without the locale data writes `Mon` here.
 */
test('the calendar names its days in Albanian, not the browser’s English', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto('/sq/appointments?view=week');
  await page.waitForLoadState('networkidle');

  const header = page.getByText('hën', { exact: true }).first();
  await expect(header, 'the week grid is not naming days in Albanian').toBeVisible();
  await expect(page.getByText('Mon', { exact: true })).toHaveCount(0);

  expect(errors, 'the calendar hydrated with errors').toEqual([]);
});

/**
 * The health endpoint, which the container's own healthcheck and the
 * deployment's monitor both watch. Unauthenticated by design, so this is also
 * the one case here that does not depend on the stored session.
 */
test('the health endpoint reports the database', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ status: 'ok', database: 'ok' });
});
