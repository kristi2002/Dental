/**
 * Retiring a catalogue row, and getting it back.
 *
 * Four tables gained an `archivedAt` at once — treatments, suppliers, standard
 * wording and kinds of laboratory work — because every one of them was
 * hard-delete only while every historical record naming them was `SetNull`.
 * Deleting a treatment the practice had stopped offering used to unlink every
 * visit that ever performed it. See `Service.archivedAt`.
 *
 * That shipped with four new `restore…` actions, which is exactly the shape of
 * thing this suite exists to catch: `verbs.spec.ts` opens with two server
 * actions that were "written, permission-guarded, audited, correct, and
 * unreachable from any screen for their entire life". Four more restore verbs
 * with no browser behind them would be four more candidates.
 *
 * The second thing checked here is the one a unit test cannot reach at all.
 * Filtering retired rows out of the pickers is correct — and a `<select>` whose
 * value matches none of its options falls back to the **first** one, which on
 * every one of these forms means "none". So retiring a supplier made *opening a
 * material to change its minimum and pressing save* detach it from whoever the
 * practice buys it from, silently, on a screen nobody was suspicious of.
 *
 * That rule is asserted once, on the material form, because it is the same rule
 * everywhere and that is the screen it can be read off directly. The booking
 * dialog has the identical guard and is deliberately **not** tested here: the
 * only way to it is three clicks through a calendar grid, and a test that
 * fragile fails for reasons that have nothing to do with the rule — which in a
 * suite whose whole value is trust costs more than the coverage is worth.
 *
 * In `en`, and serial, for the reasons `verbs.spec.ts` gives: these mutate
 * shared rows, and the run re-seeds its own schema before it starts.
 */
import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

/** `ActionForm` guards a delete with `window.confirm`, which Playwright dismisses. */
async function acceptConfirms(page: Page): Promise<void> {
  page.on('dialog', (dialog) => dialog.accept());
}

/**
 * Land on a screen and wait for it to actually be there.
 *
 * The first assertion of a test used to double as the wait, against the default
 * ten seconds — which is fine until a preceding test ends on a server action and
 * the next navigation queues behind it. That failed once on a row the failure
 * screenshot showed present, which is the least useful kind of red.
 */
async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 20_000 });
}

/**
 * The row of a list naming this text, and the danger button inside it.
 *
 * `:visible` is load-bearing, not decoration. The reminder board is rendered
 * into every screen shut, and its lines quote the things they are about — so a
 * low-stock warning naming a supplier is an `li` containing that supplier's
 * name, sitting hidden at the top of the DOM, and `.first()` finds it before it
 * finds the row a person can see. That is what this locator matched for three
 * runs while the failure screenshot showed the real row present.
 */
function rowFor(page: Page, name: string) {
  return page.locator('li:visible', { hasText: name }).first();
}

/**
 * The fold-away section at the foot of a catalogue screen.
 *
 * Opened before anything is asserted about it, and that is not politeness. A
 * shut `<details>` keeps its contents out of the accessibility tree entirely,
 * so `getByRole` finds nothing inside one — the first version of this file
 * asserted a Restore button into existence against a section it had never
 * opened, and read the app's correct behaviour as a failure.
 */
async function openRetired(page: Page, title: string) {
  const section = page.locator('details', { hasText: title }).first();
  await expect(section).toHaveCount(1, { timeout: 20_000 });
  await section.locator('summary').click();
  return section;
}

/**
 * The row moved, rather than having been removed or left where it was.
 *
 * Two assertions because either alone is satisfiable by the wrong thing: the
 * retired section holding the name rules out a hard delete, and the name
 * appearing exactly *once* across the page rules out its still sitting in the
 * catalogue above. A row that never moved would make that count two.
 */
async function expectRetired(page: Page, sectionTitle: string, name: string) {
  const retired = await openRetired(page, sectionTitle);
  await expect(retired.getByText(name, { exact: false }).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('li:visible', { hasText: name })).toHaveCount(1);
  return retired;
}

test('a treatment that history names is retired rather than deleted, and comes back', async ({
  page,
}) => {
  await acceptConfirms(page);

  // Seeded plan steps point at this one by id, so it is guaranteed to be
  // referenced — which is what makes the delete archive instead of remove.
  const treatment = 'Mbushje kompozite';

  await open(page, '/en/services');
  await expect(rowFor(page, treatment)).toBeVisible({ timeout: 20_000 });

  await rowFor(page, treatment).getByRole('button', { name: 'Delete' }).click();

  // Still on file, which is the whole distinction: a row that vanished outright
  // would mean the delete had taken the plan steps naming it with it.
  const retired = await expectRetired(page, 'Retired treatments', treatment);

  await retired.getByRole('button', { name: 'Restore' }).first().click();
  await expect(rowFor(page, treatment)).toBeVisible({ timeout: 20_000 });
});

test('a supplier the shelf names is retired, and the material it supplies keeps it', async ({
  page,
}) => {
  await acceptConfirms(page);

  // The seed deals the two suppliers out by index, so the first material takes
  // the first supplier — a pairing with a unique name on both sides.
  const supplier = 'DentalMed Shpk';
  const material = 'Anestezi Lidokainë 2%';

  await open(page, '/en/stock/suppliers');
  await expect(rowFor(page, supplier)).toBeVisible({ timeout: 20_000 });
  await rowFor(page, supplier).getByRole('button', { name: 'Delete' }).click();
  await expectRetired(page, 'Retired suppliers', supplier);

  // The material's own edit page still offers it. This is the assertion the
  // file header is about, on the screen it reads off most directly: without the
  // fix the select falls back to "None", and saving anything at all on this
  // form detaches the material from whoever the practice buys it from.
  await open(page, '/en/stock');
  const href = await page
    .locator('li:visible', { hasText: material })
    .first()
    .locator('a[href*="/edit"]')
    .first()
    .getAttribute('href');
  expect(href, 'the stock list should link to this material').toBeTruthy();
  await page.goto(href!);
  await expect(page.locator('select[name="supplierId"]')).toHaveValue(/.+/);
  await expect(
    page.locator('select[name="supplierId"] option:checked'),
  ).toHaveText(supplier);

  await open(page, '/en/stock/suppliers');
  const again = await openRetired(page, 'Retired suppliers');
  await again.getByRole('button', { name: 'Restore' }).first().click();
  await expect(rowFor(page, supplier)).toBeVisible({ timeout: 20_000 });
});

test('a piece of standard wording that has been issued is retired, and comes back', async ({
  page,
}) => {
  await acceptConfirms(page);

  // The seed issues one prescription from this template, so it has history
  // behind it; the other two do not and would be genuinely deleted.
  const wording = 'Antibiotik pas ekstraksionit';

  await open(page, '/en/prescriptions');
  await expect(rowFor(page, wording)).toBeVisible({ timeout: 20_000 });
  await rowFor(page, wording).getByRole('button', { name: 'Delete' }).click();
  const retired = await expectRetired(page, 'Retired wording', wording);

  await retired.getByRole('button', { name: 'Restore' }).first().click();
  await expect(rowFor(page, wording)).toBeVisible({ timeout: 20_000 });
});

test('a kind of laboratory work is retired once a case names it, and comes back', async ({
  page,
}) => {
  await acceptConfirms(page);

  // Nothing seeds the works register, so this builds its own history: name a
  // kind of work, send a case out using it, then retire it. That chain is also
  // the only browser coverage of `WorkLine.procedureId` — the id added so the
  // register counts crowns rather than spellings of "crown".
  const kind = `Kurorë provë ${String(Date.now()).slice(-5)}`;

  await open(page, '/en/works/procedures/new');
  // By field name and exact button label: this form has a search box above it
  // and two submits below it ("Save" and "Save and add another"), so both
  //  guesses were coin flips.
  await page.locator('input[name="name"]').fill(kind);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  // Waited on rather than navigated past. Pressing save starts a server action
  // that ends in a redirect, and going somewhere else in the same breath
  // cancels it — which is why the row kept not existing.
  await page.waitForURL('**/en/works/procedures', { timeout: 20_000 });
  await expect(rowFor(page, kind)).toBeVisible({ timeout: 20_000 });

  // A case naming it. Without one the delete below is a real delete, which is
  // the other half of the rule and not the half this test is about.
  await open(page, '/en/works/new');
  await page.getByRole('textbox', { name: 'Patient' }).first().fill('Provë Laboratori');
  await page.getByRole('textbox', { name: 'Phone', exact: true }).first().fill('069 00 00 111');
  await page.locator('select').filter({ hasText: kind }).first().selectOption({ label: kind });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForURL('**/en/works**', { timeout: 20_000 });

  await open(page, '/en/works/procedures');
  await rowFor(page, kind).getByRole('button', { name: 'Delete' }).click();
  const retired = await expectRetired(page, 'Retired kinds of work', kind);

  await retired.getByRole('button', { name: 'Restore' }).first().click();
  await expect(rowFor(page, kind)).toBeVisible({ timeout: 20_000 });
});

test("a patient's sex is recorded on the form and shown on the record", async ({ page }) => {
  const surname = `Gjinia${String(Date.now()).slice(-6)}`;

  await open(page, '/en/patients/new');
  await page.getByRole('textbox', { name: 'First name' }).fill('Provë');
  await page.getByRole('textbox', { name: 'Last name' }).fill(surname);
  await page.getByRole('textbox', { name: 'Phone', exact: true }).fill('069 00 11 333');
  await page.getByLabel('Sex').selectOption('FEMALE');
  await page.getByRole('button', { name: 'Save' }).click();

  await page.waitForURL(/\/en\/patients\/(?!new)[\w-]+/, { timeout: 15_000 });

  // Read back from the record rather than from the form that wrote it: the
  // column is new, and "the select posted something" is not the same claim as
  // "the record kept it and the page prints it".
  // Visible, because the edit dialog on this page carries a whole `<select>`
  // of sexes and its chosen `<option>` also reads "Female" — matching that
  // would assert the form remembered what was typed, not that the record kept
  // it. The same hidden-element trap as the reminder board in `rowFor`.
  await expect(page.locator(':text-is("Female"):visible').first()).toBeVisible({
    timeout: 20_000,
  });
});
