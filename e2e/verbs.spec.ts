/**
 * The verbs: press the button, then check the thing it claims to do happened.
 *
 * This is the file the suite exists for. `npm test` already proves what
 * `runJob`, `createPatient` and `markOrdered` decide — what it cannot prove is
 * that a person sitting at the front desk can reach them. Two server actions in
 * this repository were written, permission-guarded, audited, correct, and
 * unreachable from any screen for their entire life (`docs/GAPS-PASS-3.md`,
 * §B-01 and §B-02); one carried a comment promising the reversibility it did
 * not provide. Nothing but a browser finds that.
 *
 * So every case here is shaped the same way: navigate as a real user would,
 * press a real control, and assert against **state that outlives the click** —
 * a row on a list, a changed count, a recorded run. A test that only asserts a
 * toast appeared proves the toast works.
 *
 * In `en`, deliberately. The assertions read as English sentences and the
 * screens are identical in all three languages; `routes.spec.ts` is what covers
 * the practice's own locale.
 */
import { expect, test } from '@playwright/test';

// These mutate shared rows, so they run in declaration order and stop at the
// first failure rather than reporting a cascade of consequences.
test.describe.configure({ mode: 'serial' });

/**
 * A surname no seed row uses, different on every run — so the assertion cannot
 * pass on somebody else's data, and a second run against a schema that was not
 * re-seeded does not collide with the first.
 */
const RUN_ID = String(Date.now()).slice(-6);

test('a new patient is created and then findable by name', async ({ page }) => {
  const surname = `Testi${RUN_ID}`;

  await page.goto('/en/patients/new');
  await page.getByRole('textbox', { name: 'First name' }).fill('Provë');
  await page.getByRole('textbox', { name: 'Last name' }).fill(surname);
  // Exact: the guardian block further down the form has a "Their phone" field.
  await page.getByRole('textbox', { name: 'Phone', exact: true }).fill('069 00 11 222');
  await page.getByRole('button', { name: 'Save' }).click();

  // The form redirects to the record it just wrote. Landing back on the form
  // with an error is the failure this waits out rather than races.
  await page.waitForURL(/\/en\/patients\/(?!new)[\w-]+/, { timeout: 15_000 });
  await expect(page.locator('h1')).toContainText(surname);

  // The real proof: a separate request, through the list's own search, finds
  // the row. That exercises the write, the query and the search key together —
  // `patient-search.test.ts` covers the key's shape, not whether it was filled.
  await page.goto(`/en/patients?q=${surname}`);
  await expect(page.getByText(surname).first()).toBeVisible();
});

test('a scheduled job can be run from the staff page', async ({ page }) => {
  await page.goto('/en/staff');

  const card = page.locator('section', { has: page.getByRole('heading', { name: 'Scheduled jobs' }) });
  await expect(card).toBeVisible();

  // The file sweep specifically: of the three, it is the one whose work leaves
  // nothing behind for a later test to trip over. This is the control
  // `docs/GAPS-PASS-3.md` records as never having been click-verified — the
  // staff page did not hydrate on that attempt, so the form posted natively and
  // Next refused it for a null origin. Which makes the click itself the
  // assertion: if this page ever stops hydrating, this line fails.
  const row = card.locator('li', { hasText: 'Tidy up unused files' });
  await expect(row).toHaveCount(1);
  await row.getByRole('button', { name: 'Run now' }).click();

  // A run writes a `JobRun` row and the card reads it back, so the board must
  // stop saying "Never" *for this job* — the other two are untouched and will
  // go on saying it.
  await expect(row.getByText('Never', { exact: true })).toHaveCount(0, { timeout: 20_000 });
});

test('the reorder panel marks a suggested order as placed', async ({ page }) => {
  await page.goto('/en/stock');

  const markOrdered = page.getByRole('button', { name: /^Mark \d+ ordered$/ }).first();
  await expect(markOrdered).toBeVisible();

  // The label carries the count, so the label *is* the assertion: after the
  // press, that exact button must be gone. `stock-alerts.test.ts` proves the
  // rule; this proves the panel applies it to real rows.
  const before = (await markOrdered.textContent())?.trim() ?? '';
  await markOrdered.click();

  await expect(page.getByRole('button', { name: before, exact: true })).toHaveCount(0, {
    timeout: 20_000,
  });
});
