/**
 * The practice's public page, read the way a stranger reads it.
 *
 * Every other spec in this suite replays the Owner's cookie. This one throws it
 * away, and that is the whole point: the storefront's defining property is that
 * somebody with no account can open it, and a pass that visited it while
 * carrying a session would prove nothing about the case that matters. The
 * `storageState: undefined` below is load-bearing, not tidiness.
 *
 * It also covers the one write in this application that nobody has to sign in to
 * perform. A request form that quietly fails is worse than no form: the visitor
 * is told it worked, and the practice never learns anybody asked. So the test
 * fills it in as a person would, and the case at the foot of this file — which
 * keeps the Owner's session — confirms the row reached the screen that is
 * supposed to show it.
 */
import { expect, test } from '@playwright/test';
import { collectConsoleErrors } from './helpers';

// A name this run owns, so the assertions downstream cannot match a row some
// other spec or the seed put there.
const CALLER = `E2E Storefront ${Date.now()}`;
const CALLER_PHONE = '069 555 0142';

test.describe('the public page', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('opens for somebody with no account', async ({ page }) => {
    const errors = collectConsoleErrors(page);

    const response = await page.goto('/sq');
    expect(response?.status()).toBe(200);

    // Not the sign-in pad. This is the assertion that would have caught the
    // storefront being filed inside the authenticated route group.
    expect(page.url(), 'the public page redirected to the login screen').not.toContain('/login');

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // The hours block is read out of `ClinicHours`, so its presence is also the
    // check that the public page can reach the database it is allowed to reach.
    await expect(page.getByRole('table')).toBeVisible();

    await page.waitForLoadState('networkidle');
    expect(errors).toEqual([]);
  });

  /**
   * The content is in the HTML, not conjured by JavaScript once it arrives.
   *
   * This exists because the opposite shipped. The scroll reveals were a Motion
   * component whose `initial={{ opacity: 0 }}` was server-rendered as an inline
   * style, so every card below the hero left the server invisible and stayed
   * that way until React had booted and observed it — and for anybody with
   * `prefers-reduced-motion` set, permanently, because the reduced branch
   * swapped the element type and React reused the node without clearing the
   * style it had not written. A clinic's public page has to be readable on a bad
   * connection and with scripting off; an animation is a thing laid on top.
   *
   * Asserted against the raw markup rather than the rendered page on purpose. A
   * browser check would pass the moment hydration finished and would never see
   * the failure this is here to catch.
   */
  test('renders its content without waiting for JavaScript', async ({ request }) => {
    const response = await request.get('/sq');
    expect(response.status()).toBe(200);
    const html = await response.text();

    expect(html, 'something is server-rendered hidden').not.toContain('opacity:0');

    // The words themselves, not just the absence of a hidden style: the eighth
    // treatment card is the furthest thing down the page that a reveal wraps.
    expect(html).toContain('Zbardhim');
    expect(html).toContain('Kërkoni një takim');
  });

  test('stays readable for a reader who asked for less movement', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce', storageState: undefined });
    const page = await context.newPage();
    await page.goto('/sq');

    // Visible without scrolling and without waiting: the card is well below the
    // fold, and nothing should be gating it on having been seen.
    const card = page.locator('#treatments li').first();
    await expect(card).toHaveCSS('opacity', '1');

    // And the strip has genuinely stopped rather than merely slowed.
    const marquee = page.locator('.marquee-track').first();
    await expect(marquee).toHaveCSS('animation-name', 'none');

    await context.close();
  });

  test('is written in all three languages', async ({ page }) => {
    for (const [locale, phrase] of [
      ['sq', 'Buzëqeshja juaj'],
      ['en', 'Your smile'],
      ['it', 'Il tuo sorriso'],
    ] as const) {
      const response = await page.goto(`/${locale}`);
      expect(response?.status(), `/${locale}`).toBe(200);
      await expect(
        page.getByRole('heading', { level: 1 }),
        `/${locale} is not in its own language`,
      ).toContainText(phrase);
    }
  });

  /**
   * The picker is the page's way in for somebody who knows what is wrong but
   * not what it is called, and its second job is quieter: it fills in the topic
   * on a form four sections further down. That hand-off runs through a React
   * context spanning most of the page, which is exactly the sort of wiring that
   * survives a refactor visually and stops working.
   */
  test('the concern picker answers, and carries the answer to the form', async ({ page }) => {
    await page.goto('/en');

    const panel = page.locator('#concern-panel');
    // The first concern is chosen on the server, so the panel says something
    // before anybody presses anything.
    await expect(panel).toContainText('A gap changes how you bite');

    await page.getByRole('tab', { name: 'My teeth are crooked' }).click();
    await expect(panel).toContainText('Fixed braces or clear aligners');
    await expect(page.getByRole('tab', { name: 'My teeth are crooked' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await page.getByRole('tab', { name: 'A tooth is missing' }).click();
    await page.getByRole('link', { name: 'Ask about this' }).click();

    // The whole point of the context: the select at the bottom of the page is
    // already set to what they said at the top.
    await expect(page.locator('#request-topic')).toHaveValue('implants');
  });

  /**
   * The trip estimate is a number somebody buys a plane ticket against, so the
   * arithmetic is unit-tested in `tests/storefront.test.ts`. What this covers is
   * the wiring: that ticking a treatment reaches the figures at all, and that
   * the second-trip sentence appears for the treatment that needs one.
   */
  test('the trip planner answers in days and trips', async ({ page }) => {
    await page.goto('/en');

    const answer = page.locator('#trip [aria-live="polite"]');
    await expect(answer).toContainText('Tick a treatment');

    // The checkbox itself is `sr-only`; the label wrapping it is what anybody
    // actually presses.
    await page.locator('#trip label').filter({ hasText: /^Check-up and hygiene$/ }).click();
    await expect(answer).toContainText('One trip');

    await page.locator('#trip label').filter({ hasText: /^Implants$/ }).click();
    // Implants need healing time, so the answer becomes two trips whatever else
    // is ticked alongside them.
    await expect(answer).toContainText('Two trips');
    await expect(answer).toContainText('Days in Vlorë');
  });

  /**
   * The floating button exists because the masthead's own drops below 640px.
   * All three states matter and two of them are "not there": over the hero it
   * would cover a composition built to fit one screen exactly, and over the form
   * it would sit on top of the form's own submit button.
   */
  test('the booking button appears on a phone only where it is needed', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      storageState: undefined,
    });
    const page = await context.newPage();
    await page.goto('/en');

    const fab = page.locator('a.fab');
    await expect(fab, 'the button is over the hero').toBeHidden();

    await page.locator('#gallery').scrollIntoViewIfNeeded();
    await expect(fab, 'the button is missing in the middle of the page').toBeVisible();

    await page.locator('#request').scrollIntoViewIfNeeded();
    await expect(fab, 'the button is sitting on top of the form').toBeHidden();

    await context.close();
  });

  /**
   * The drawer is an enhancement over the anchors, so both halves matter: that
   * a booking link opens it instead of jumping the page, and that the link is
   * still an ordinary anchor to a real form underneath.
   */
  test('opens the booking form over the page instead of jumping to it', async ({ page }) => {
    await page.goto('/en');

    // By id rather than by `.drawer`: the phone navigation panel is the same
    // kind of thing and carries the same class, so the class alone matches two
    // dialogs and Playwright refuses an ambiguous locator outright.
    const drawer = page.locator('dialog#book-drawer');
    await expect(drawer).toBeHidden();

    const scrollBefore = await page.evaluate(() => window.scrollY);
    await page.getByRole('link', { name: 'Book a visit' }).first().click();

    await expect(drawer).toBeVisible();
    expect(
      await page.evaluate(() => window.scrollY),
      'the page scrolled instead of opening the drawer',
    ).toBe(scrollBefore);

    // Its fields are namespaced, or every label in the drawer would focus the
    // field in the section behind it.
    await expect(page.locator('#drawer-name')).toBeVisible();
    await expect(page.locator('#request-name')).toHaveCount(1);

    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
  });

  /**
   * The one image comparison on the page is a simulation, and the caption saying
   * so is not decoration — it is the reason the section is allowed to exist
   * before the practice has consented case photographs. See `BeforeAfter`.
   */
  test('says out loud that the before-and-after is a simulation', async ({ page }) => {
    await page.goto('/en');

    const compare = page.locator('#compare');
    await expect(compare).toContainText('A simulation, not a patient');

    const slider = compare.getByRole('slider');
    await slider.fill('20');
    await expect(compare.locator('img').nth(1)).toHaveCSS('clip-path', 'inset(0px 0px 0px 20%)');
  });


  /**
   * The four pages the masthead links to.
   *
   * They were fragments into one document until the storefront grew routes, and
   * the cheapest thing that can now go wrong is the most embarrassing: a link in
   * the bar that answers 404, or a page that renders its own error boundary and
   * still returns 200. This is the `routes.spec.ts` smoke pass applied to the
   * half of the application that has no sign-in in front of it.
   *
   * Console-clean is asserted on `sq` for the reason that spec sets out at
   * length: Chromium ships no Albanian locale data, so the practice's own
   * language is where a hydration mismatch shows up first.
   */
  for (const path of ['/treatments', '/practice', '/gallery', '/visit']) {
    test(`the public page at ${path} opens for a stranger`, async ({ page }) => {
      const errors = collectConsoleErrors(page);

      const response = await page.goto(`/sq${path}`);
      expect(response?.status(), `${path} returned ${response?.status()}`).toBe(200);
      expect(page.url(), `${path} redirected to ${page.url()}`).not.toContain('/login');

      // Exactly one, and not empty. Next renders a crashed server component
      // inside an error boundary with a 200, so the status above cannot see it
      // and the heading can.
      const h1 = page.getByRole('heading', { level: 1 });
      await expect(h1, `${path} has no heading`).toHaveCount(1);
      await expect(h1).not.toBeEmpty();
      await expect(page.getByText('Something went wrong', { exact: false })).toHaveCount(0);

      // A page whose translations are missing renders the key path where the
      // words should be, and `next-intl` reports it to a console nobody has
      // open rather than failing the build.
      await expect(page.locator('body')).not.toContainText('pages.');

      await page.waitForLoadState('networkidle');
      expect(errors, `${path} logged console errors`).toEqual([]);
    });
  }

  /**
   * The bar has to do the two things a bar on a multi-page site is for: reach
   * the other pages, and say which one you are on. The second half is the one
   * that rots silently — a highlight computed from a pathname keeps looking
   * plausible while matching nothing.
   */
  test('the masthead reaches the other pages and lights the one you are on', async ({ page }) => {
    await page.goto('/en');

    const bar = page.locator('header nav[aria-label]').first();
    await bar.getByRole('link', { name: 'Treatments' }).click();
    await expect(page).toHaveURL(/\/en\/treatments$/);
    await expect(bar.getByRole('link', { name: 'Treatments' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    // And only that one. Four links all claiming to be the current page is the
    // same bug as none of them claiming it.
    await expect(bar.locator('a[aria-current="page"]')).toHaveCount(1);

    await bar.getByRole('link', { name: 'Visit us' }).click();
    await expect(page).toHaveURL(/\/en\/visit$/);
    await expect(page.locator('#request')).toBeVisible();
  });

  /**
   * A booking link on a page that does not hold the form.
   *
   * This is the case the drawer's delegated listener nearly lost when the links
   * became routes: Next's own `Link` calls `preventDefault()` from a React
   * handler attached to the app root, so a bubble-phase listener on `document`
   * arrived to find the click already claimed and let the navigation happen.
   * Both halves are asserted — the panel opens, and the page underneath has not
   * moved.
   */
  test('books from a page that does not hold the form, without leaving it', async ({ page }) => {
    await page.goto('/en/treatments');

    const drawer = page.locator('dialog#book-drawer');
    await expect(drawer).toBeHidden();

    await page.locator('#t-implants').scrollIntoViewIfNeeded();
    await page.locator('#t-implants').getByRole('link', { name: 'Ask about this' }).click();

    await expect(drawer).toBeVisible();
    expect(page.url(), 'the drawer link navigated instead of opening the panel').toContain(
      '/en/treatments',
    );
    // And it carried the treatment with it, which is the whole reason the
    // control is a component rather than an anchor.
    await expect(page.locator('#drawer-topic')).toHaveValue('implants');
  });

  /**
   * The wall is the gallery page's one interactive idea, and its filter is the
   * kind of thing that keeps rendering while quietly filtering nothing.
   */
  test('the photo wall filters to a group and says how many are left', async ({ page }) => {
    await page.goto('/en/gallery');

    const wall = page.locator('#wall-panel');
    await expect(wall.locator('li')).toHaveCount(9);

    await page.getByRole('tab', { name: 'The rooms' }).click();
    await expect(wall.locator('li')).toHaveCount(3);
    await expect(page.locator('#wall')).toContainText('3 photographs');
    await expect(page.getByRole('tab', { name: 'The rooms' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await page.getByRole('tab', { name: 'Everything' }).click();
    await expect(wall.locator('li')).toHaveCount(9);
  });

  test('takes an appointment request and puts it in front of the desk', async ({ page }) => {
    await page.goto('/sq');

    // Scoped to the copy in the page flow. There are two on the page now — the
    // second lives inside `BookDrawer` — and they carry the same labels by
    // design, so an unscoped `getByLabel` matches both.
    const form = page.locator('#request');

    await form.getByLabel('Emri juaj').fill(CALLER);
    await form.getByLabel('Numri i telefonit').fill(CALLER_PHONE);
    await form.getByLabel('Doni të shtoni diçka?').fill('Dhëmbi i poshtëm majtas më dhemb.');
    await form.getByRole('button', { name: 'Dërgo kërkesën' }).click();

    // The panel swaps to a confirmation in place. It also says, deliberately,
    // that nothing has been booked — a form that reads as a booking and is not
    // one is how somebody misses an appointment they thought they had.
    await expect(page.getByRole('heading', { name: 'E morëm kërkesën tuaj.' })).toBeVisible();
  });
});

/**
 * Outside the `describe` above, and that is the point: this one keeps the
 * Owner's replayed cookie, because the question it asks is what the desk sees.
 * No `signIn` call — the chromium project already carries the session, and
 * signing in again would land on the dashboard and find no PIN pad.
 */
test('the request reaches the staff screen, in the language it was written in', async ({
  page,
}) => {
  await page.goto('/en/requests');

  const row = page.getByRole('listitem').filter({ hasText: CALLER });
  await expect(row, 'the request never reached /requests').toBeVisible();

  // The single most useful thing on the row: which language to open in before
  // anybody dials. Written in Albanian because the page was.
  await expect(row).toContainText('Shqip');
  await expect(row).toContainText(CALLER_PHONE);
});
