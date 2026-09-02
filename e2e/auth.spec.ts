/**
 * The front door, from outside it.
 *
 * Every other spec replays a stored Owner cookie, which is the right trade for
 * forty-four screens and the wrong one here: the questions this file asks —
 * does a wrong PIN get in, does a read-only account get further than it should,
 * does signing out actually end the session — can only be asked by a browser
 * that has no session to begin with.
 *
 * An explicitly empty `storageState`, not `undefined`. Playwright applies the
 * project's `use` options to contexts made from the `browser` fixture too, so
 * `undefined` reads as "unspecified" and inherits the Owner's cookie — which
 * makes a signed-out test quietly sign in as the Owner and pass for the wrong
 * reason. That is not hypothetical; it is what the first draft of this file did.
 */
import { expect, test } from '@playwright/test';
import { OWNER, READONLY } from './env';
import { signIn } from './helpers';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe.configure({ mode: 'serial' });

test('a wrong PIN is refused, and does not sign anybody in', async ({ page }) => {
  await page.goto('/en/login');

  // Not the account the other cases use: a rejected attempt increments that
  // account's `failedAttempts`, and the escalating lockout in `auth/lockout.ts`
  // counts across sign-ins until a correct PIN clears it.
  await page.getByRole('button', { name: 'Teuta Gashi' }).click();
  for (const digit of '9999') {
    await page.getByRole('button', { name: digit, exact: true }).click();
  }
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);

  // The refusal has to hold at the door, not just on the screen.
  await page.goto('/en/patients');
  await expect(page).toHaveURL(/\/login/);
});

test('a read-only account is refused the screens it may not use', async ({ page }) => {
  await signIn(page, READONLY);

  // The rail is built from `NAV_DESTINATIONS` filtered by permission, so a
  // screen this role cannot open is never advertised to it.
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Staff' })).toHaveCount(0);

  // And the guard refuses when the URL is typed by hand, which is the half a
  // hidden link does not cover. `requirePermission` redirects to the dashboard
  // and writes a `denied` line to the activity log.
  await page.goto('/en/patients/new');
  await expect(page, 'read-only reached the new-patient form').not.toHaveURL(/patients\/new/);

  // Reading is still allowed — a guard that refused everything would pass the
  // assertion above while being obviously wrong.
  await page.goto('/en/patients');
  await expect(page).toHaveURL(/\/en\/patients$/);
  await expect(page.locator('h1')).toBeVisible();
});

test('a read-only account is told so on every screen, not at the last moment', async ({ page }) => {
  await signIn(page, READONLY);

  // The help page promises a locum that "every screen tells them so rather than
  // refusing at the last moment", and for a long time three screens did. The
  // banner is mounted in the shell, so the claim is only true if it survives
  // navigating between unrelated parts of the app — which is what this walks.
  const banner = page.getByText('Read-only: you can open any screen');

  for (const path of ['/en/dashboard', '/en/patients', '/en/appointments']) {
    await page.goto(path);
    await expect(banner, `no view-only banner on ${path}`).toBeVisible();
  }
});

test('the view-only banner is not shown to somebody who can write', async ({ page }) => {
  // The other half, and the one that makes the test above mean something: a
  // banner rendered unconditionally would pass every assertion up there while
  // telling the owner they cannot change their own practice.
  await signIn(page, OWNER);

  await page.goto('/en/patients');
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.getByText('Read-only: you can open any screen')).toHaveCount(0);
});

test('signing out ends the session', async ({ page }) => {
  await signIn(page, READONLY);

  // The menu is the only way to it, so opening the menu is part of the test:
  // a sign-out button behind a trigger that stopped working is a session
  // nobody can end from a shared reception machine.
  // Scoped to the rail, and visible. The shell renders the account menu twice —
  // once at the foot of the rail, once in the phone-width bar — and CSS hides
  // whichever does not belong to this viewport, so `.first()` picks the hidden
  // one. `aria-haspopup="menu"` alone is not enough either: the filter bars use
  // it too, and there are five on a dashboard.
  await page
    .getByRole('complementary')
    .locator('button[aria-haspopup="menu"]:visible')
    .click();
  // `menuitem`, not `button`: the submit control carries an explicit
  // `role="menuitem"`, which replaces its implicit role in the a11y tree.
  await page.getByRole('menuitem', { name: 'Sign out' }).click();

  await page.waitForURL(/\/login/, { timeout: 15_000 });

  // The cookie is gone, not merely the screen.
  await page.goto('/en/patients');
  await expect(page).toHaveURL(/\/login/);
});
