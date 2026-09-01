/**
 * Writing a prescription, from each of the three screens that offer to.
 *
 * The dialog itself is old and was reachable from exactly one place: the
 * patient's own record. That is the right place when the patient is who you are
 * holding — but the prescriptions section is where somebody stands who is
 * holding a *prescription*, and from there the only route back to the verb was
 * out through the patient search. Two headers now open the same dialog with
 * nobody named, and it asks.
 *
 * Which makes this the shape `verbs.spec.ts` opens by describing: a server
 * action that was written, guarded, audited and correct, and reachable from one
 * screen fewer than anybody thought. The three cases below are three routes to
 * `issuePrescription`, and each asserts against the row it leaves behind rather
 * than against the dialog closing.
 *
 * The fourth case is the one no unit test can reach at all. `patientId` arrives
 * from a hidden input, and a hidden input is barred from browser constraint
 * validation — so `required` on it does nothing and the form posts a blank. The
 * refusal has to come from the server, and "it is refused" is only half the
 * claim: the other half is that nothing was written, which is why that case
 * reloads and counts.
 *
 * In `en`, and serial, for the reasons `verbs.spec.ts` gives: these write to
 * shared list screens, and the run re-seeds its own schema before it starts.
 */
import { expect, test, type Page } from '@playwright/test';
import { READONLY } from './env';
import { signIn } from './helpers';

test.describe.configure({ mode: 'serial' });

/** Distinct per run, so an assertion cannot pass on a previous run's row. */
const RUN_ID = String(Date.now()).slice(-6);

/** Seeded, and deliberately not the one carrying a penicillin allergy. */
const PATIENT = 'Kola Elira';

/** The list rows on the issued page, which is what "it was written" means here. */
function issuedRows(page: Page) {
  return page.locator('main li');
}

/**
 * Put away the first-run pointer at the help button, which hangs from the top
 * right and covers the page header's own actions.
 *
 * Not incidental tidying: it is shown once per *account*, `PageHelp` renders it
 * on every signed-in screen, and the button these cases press is underneath it.
 * Whichever spec the Owner reaches first meets it, so a spec that clicks a
 * header control and does not handle it fails for a reason that has nothing to
 * do with what it is testing — which is exactly what happened when this file was
 * written. Dismissing writes the flag to the account, so this is a no-op from
 * the second call onwards.
 */
async function putAwayFirstRunHelp(page: Page): Promise<void> {
  const gotIt = page.getByRole('button', { name: 'Got it' });
  if (await gotIt.count()) await gotIt.first().click();
}

test('the issued list writes one, asking who it is for', async ({ page }) => {
  const body = `E2E issued ${RUN_ID}`;

  await page.goto('/en/prescriptions/issued');
  await putAwayFirstRunHelp(page);
  const before = await issuedRows(page).count();

  await page.getByRole('button', { name: 'Write prescription' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // A template first, then the patient — the harder order, because choosing a
  // template fills the wording in and picking somebody afterwards has to fill
  // the `{patient}` in that wording without overwriting anything typed by hand.
  const template = dialog.locator('button[aria-pressed]').first();
  await template.click();

  await dialog.getByRole('searchbox').fill('Kola');
  await dialog.getByRole('button', { name: new RegExp(PATIENT) }).click();
  await expect(dialog.getByText(PATIENT)).toBeVisible();

  // The suggestions are the reason the patient is asked for rather than typed:
  // they are computed from what this person has just had done, which means a
  // round trip that only happens once somebody real is chosen. The seeded
  // patient has recent visits, so the band must appear.
  await expect(dialog.getByText(/Usually written after/)).toBeVisible();

  await dialog.getByRole('textbox', { name: 'Prescription' }).fill(body);
  await dialog.getByRole('button', { name: 'Issue', exact: true }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText(body)).toBeVisible();
  await expect(issuedRows(page)).toHaveCount(before + 1);
});

test('the template catalogue writes one too', async ({ page }) => {
  const body = `E2E catalogue ${RUN_ID}`;

  await page.goto('/en/prescriptions');
  await putAwayFirstRunHelp(page);
  await page.getByRole('button', { name: 'Write prescription' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('searchbox').fill('Kola');
  await dialog.getByRole('button', { name: new RegExp(PATIENT) }).click();
  await dialog.getByRole('textbox', { name: 'Prescription' }).fill(body);
  await dialog.getByRole('button', { name: 'Issue', exact: true }).click();
  await expect(dialog).toBeHidden();

  // This page lists templates, not prescriptions, so it cannot show its own
  // result — which makes the separate request the only proof there is.
  await page.goto('/en/prescriptions/issued');
  await expect(page.getByText(body)).toBeVisible();
});

test('the patient record writes one without asking who', async ({ page }) => {
  const body = `E2E record ${RUN_ID}`;

  await page.goto(`/en/patients?q=Kola`);
  await page.getByRole('link', { name: new RegExp(PATIENT) }).first().click();
  await page.waitForURL(/\/en\/patients\/(?!new)[\w-]+/);
  await page.goto(`${page.url().split('?')[0]}?tab=prescriptions`);

  await putAwayFirstRunHelp(page);
  await page.getByRole('button', { name: 'Write prescription' }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // Named, not asked for. The search box appearing here would mean the screen
  // had forgotten whose record it is.
  await expect(dialog.getByText(`For ${PATIENT}`)).toBeVisible();
  await expect(dialog.getByRole('searchbox')).toHaveCount(0);

  await dialog.getByRole('textbox', { name: 'Prescription' }).fill(body);
  await dialog.getByRole('button', { name: 'Issue', exact: true }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText(body)).toBeVisible();
});

test('issuing with nobody chosen is refused, and writes nothing', async ({ page }) => {
  await page.goto('/en/prescriptions/issued');
  await putAwayFirstRunHelp(page);
  const before = await issuedRows(page).count();

  await page.getByRole('button', { name: 'Write prescription' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Prescription' }).fill(`E2E blank ${RUN_ID}`);
  await dialog.getByRole('button', { name: 'Issue', exact: true }).click();

  // Still open, carrying the refusal — `FormDialog` closes on success only.
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('alert')).toBeVisible();

  // `FormDialog` asks before discarding typing, and Playwright dismisses a
  // native confirm by default — which would leave the dialog open and the
  // reload below hanging on `beforeunload`.
  page.on('dialog', (confirm) => confirm.accept());
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  await page.reload();
  await expect(issuedRows(page)).toHaveCount(before);
});

test.describe('a read-only account', () => {
  // Explicitly empty rather than `undefined`, for the reason `auth.spec.ts`
  // documents: `undefined` inherits the Owner's cookie and the case passes for
  // the wrong reason.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('may read both lists and is offered neither button', async ({ page }) => {
    await signIn(page, READONLY);

    for (const path of ['/en/prescriptions', '/en/prescriptions/issued']) {
      await page.goto(path);
      // Reading is allowed — a guard that refused the page outright would pass
      // the assertion below while being obviously wrong.
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Write prescription' })).toHaveCount(0);
    }
  });
});
