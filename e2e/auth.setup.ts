/**
 * Signs in once, and writes the session cookie every other spec replays.
 *
 * Deliberately drives the real number pad rather than posting to the action or
 * forging a cookie. The pad is a client component whose digits live in React
 * state and reach the server through a hidden input — so if the login screen
 * ever stops hydrating, this file fails first and fails clearly, instead of
 * forty specs failing somewhere else. That is not hypothetical: a staff page
 * that did not hydrate is what stopped **Run now** from ever being
 * click-verified (`docs/GAPS-PASS-3.md`, Batch 3).
 */
import { test as setup, expect } from '@playwright/test';
import { OWNER, OWNER_STATE_PATH } from './env';
import { signIn } from './helpers';

setup('sign in as the owner', async ({ page }) => {
  await signIn(page, OWNER);

  // The dashboard, not the login screen — `signIn` waits for the redirect, and
  // this asserts the destination rather than merely that navigation happened.
  await expect(page).toHaveURL(/\/en\/?$/);
  await expect(page.getByRole('navigation')).toBeVisible();

  await page.context().storageState({ path: OWNER_STATE_PATH });
});
