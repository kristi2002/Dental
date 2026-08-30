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
 *
 * That write now carries **files**, which raises the stakes of the same
 * question: an attachment that silently fails to arrive is invisible from both
 * ends. The visitor saw a confirmation and believes the practice has their
 * X-ray; the desk sees an enquiry that mentions one and rings back to ask for a
 * file that was already sent. So the request below attaches two, and the case at
 * the foot checks they are on the desk's screen and that the bytes come back out
 * of the session-gated route — not merely that a row exists.
 */
import { expect, test } from '@playwright/test';
import { collectConsoleErrors } from './helpers';

// A name this run owns, so the assertions downstream cannot match a row some
// other spec or the seed put there.
const CALLER = `E2E Storefront ${Date.now()}`;
const CALLER_PHONE = '069 555 0142';

/**
 * The two things a patient actually attaches, built here rather than kept as
 * fixture files on disk.
 *
 * The first bytes are the whole point: `requestAppointment` reads the type off
 * them and refuses anything it does not recognise, so a fixture of the wrong
 * shape would fail this test for a reason that has nothing to do with the form.
 * A one-pixel PNG and a stub PDF are the smallest things that are honestly
 * those two formats.
 */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<< >>\nendobj\ntrailer\n<< >>\n%%EOF\n', 'utf8');

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
    // The panel at the foot of the visiting section, which is where the request
    // form used to be and where the door to it now is.
    expect(html).toContain('Zgjidhni një ditë');
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

    // The whole point of the context, and it now has to survive a **route
    // change**: the topic is held on the storefront layout, which sits above
    // both the front page and the booking page, so a client-side navigation
    // re-renders what is inside it and leaves the answer alone. This assertion
    // is the one that would catch the provider being moved down into a page.
    await expect(page).toHaveURL(/\/en\/book$/);
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
   * would cover a composition built to fit one screen exactly, and on the
   * booking page it would float over the form it points at.
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

    // And it takes you to the booking page rather than jumping down a document.
    await fab.click();
    await expect(page).toHaveURL(/\/en\/book$/);
    await expect(fab, 'the button is floating over the page it points at').toBeHidden();

    await context.close();
  });

  /**
   * Booking is a route, and this is the test that says so.
   *
   * It was a drawer: a `<dialog>` that a delegated listener opened when any link
   * ending in `#request` was clicked, so that a reader four screens into the
   * gallery kept their place. The panel had no address to print on a card, no
   * room for a calendar, and it treated the one errand the whole site exists for
   * as an interruption to the page. What replaced it is an ordinary link, which
   * is why this asserts a URL rather than a dialog.
   */
  test('the masthead button goes to the booking page', async ({ page }) => {
    await page.goto('/en');

    await expect(page.locator('dialog#book-drawer'), 'the drawer came back').toHaveCount(0);

    await page.getByRole('link', { name: 'Book a visit' }).first().click();
    await expect(page).toHaveURL(/\/en\/book$/);

    // The form is on it, and the calendar beside it.
    await expect(page.locator('#request-name')).toBeVisible();
    await expect(page.locator('.book-plate')).toBeVisible();

    // And the bar says you are standing on it, which is the one thing a
    // permanently visible call to action can get wrong.
    await expect(page.locator('.masthead-cta')).toHaveAttribute('aria-current', 'page');
  });

  /**
   * The calendar is the reason booking became a page, and the property worth
   * asserting is not that it renders — it is that it is drawn from the
   * practice's own week. A Sunday the surgery is shut may not be choosable, and
   * the day chosen has to survive as a real form field.
   */
  test('the calendar offers only days the practice is open', async ({ page }) => {
    await page.goto('/en/book');

    const grid = page.locator('.book-plate');
    await expect(grid).toBeVisible();

    // Shut days are drawn rather than omitted — a grid with holes where the
    // Sundays should be is not a calendar — and they carry no input at all, so
    // there is nothing to choose.
    //
    // Asserted on the month *after* this one, deliberately. The window starts
    // today, so the current month can be down to its last day or two, and on the
    // wrong afternoon of the wrong month it holds no Sunday at all — a green run
    // that says nothing, or a red one that means nothing. The next month is
    // always whole and always inside the eight weeks.
    await page.getByRole('button', { name: 'Next month' }).click();
    const shut = grid.locator('.day[data-state="closed"]');
    await expect(shut.first()).toBeVisible();
    await expect(shut.first().locator('input')).toHaveCount(0);
    await page.getByRole('button', { name: 'Previous month' }).click();

    // Nothing is chosen until somebody chooses, and the plaque says so rather
    // than appearing from nowhere under the grid.
    await expect(page.locator('.book-chosen')).toContainText('No particular day');

    const open = grid.locator('.day[data-state="open"] input');
    await open.first().check();

    await expect(page.locator('.day[data-state="chosen"]')).toHaveCount(1);
    await expect(page.locator('.book-chosen')).toContainText('We are open');

    // The half-day chips are dead until a day exists to have halves.
    await expect(page.locator('.half input').first()).toBeEnabled();
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
   * The three pages the masthead links to, and the two that are public
   * without being in it.
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
  for (const path of ['/treatments', '/practice', '/visit', '/abroad', '/book']) {
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
    // A way to book, somewhere in the page's own body — not in a named section.
    // This asserted `#visit` until that section stopped being on this route, and
    // an id is the wrong thing to pin here anyway: what has to stay true is that
    // a reader who reached the contact page can get to the form from it, not
    // which component happens to be carrying the button this month.
    await expect(
      page.locator('main').getByRole('link', { name: 'Book a visit' }).first(),
    ).toBeVisible();
  });

  /**
   * "Ask about this", from a treatment page two routes away from the form.
   *
   * The control is a client component rather than an anchor for exactly one
   * reason — it sets the topic on the way — and that hand-off now has to cross a
   * navigation. React runs the link's own `onClick` before the router's, and the
   * context holding the answer lives on the storefront layout above both routes,
   * so the value is set before the form on the other side mounts to read it.
   * Nothing about that is obvious from either file, which is why it is asserted.
   */
  test('carries the treatment from its own page to the booking form', async ({ page }) => {
    await page.goto('/en/treatments');

    await page.locator('#t-implants').scrollIntoViewIfNeeded();
    await page.locator('#t-implants').getByRole('link', { name: 'Ask about this' }).click();

    await expect(page).toHaveURL(/\/en\/book$/);
    await expect(page.locator('#request-topic')).toHaveValue('implants');
  });

  /**
   * The wall is the one interactive idea the folded-in gallery brought with it,
   * and its filter is the kind of thing that keeps rendering while quietly
   * filtering nothing.
   */
  test('the photo wall filters to a group and says how many are left', async ({ page }) => {
    await page.goto('/en/practice');

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

  /**
   * `/visit` and `/abroad` were one route, and the split is the kind of thing
   * that half-lands.
   *
   * The failure it guards is a section rendering on both pages or on neither:
   * the three that moved read their words from `pages.abroad.*` now, and a key
   * left behind under `pages.visit.*` prints the key path rather than throwing.
   * So this asserts the headings themselves, on both routes, in both
   * directions — and that the way across is on the page a local lands on.
   */
  test('the journey lives on one page and the address on the other', async ({ page }) => {
    await page.goto('/en/abroad');
    await expect(page.getByRole('heading', { name: 'Three ways into Vlorë.' })).toBeVisible();
    await expect(page.locator('#trip')).toBeVisible();
    await expect(page.locator('#aftercare')).toBeVisible();
    // The wording comes from keys that were under `pages.visit` until the split.
    await expect(page.locator('body')).not.toContainText('pages.');

    await page.goto('/en/visit');
    await expect(page.getByRole('heading', { name: 'Three ways into Vlorë.' })).toHaveCount(0);
    await expect(page.locator('#trip')).toHaveCount(0);
    // The week, not the map: `ClinicMap` renders null without an address and
    // the seeded practice has none, so `#map` would be asserting the fixture
    // rather than the split.
    await expect(page.locator('#hours')).toBeVisible();

    // And a reader who wanted the other half is told where it went. Scoped to
    // `main`, or this picks the masthead and the footer, which lead there from
    // every page and would pass whether the line on this one exists or not.
    await page.locator('main').getByRole('link', { name: 'From abroad' }).click();
    await expect(page).toHaveURL(/\/en\/abroad$/);
  });

  /**
   * `/gallery` was a page and is now a redirect to the one that absorbed it.
   *
   * It was in the sitemap and allowed by `robots.ts` for as long as it existed,
   * so it is a URL that has been handed out — and the way this breaks is silent:
   * the rule is written against the unprefixed path, every real request arrives
   * with a locale in front of it, and nobody notices until a bookmark 404s. Both
   * shapes are asserted for that reason.
   */
  test('the retired gallery route still lands on the practice page', async ({ page }) => {
    for (const from of ['/en/gallery', '/gallery']) {
      const response = await page.goto(from);
      expect(response?.status(), `${from} did not resolve`).toBe(200);
      await expect(page, `${from} did not land on the practice page`).toHaveURL(
        /\/(sq|en|it)\/practice$/,
      );
    }

    // And the photographs it was a page of are on the page it now points at.
    await expect(page.locator('#wall-panel').locator('li')).toHaveCount(9);
  });

  /**
   * A visitor who mistypes still has somewhere to go.
   *
   * This is the case no unit test can reach and the one that used to be worst.
   * `(site)` had no `not-found.tsx`, so a bad slug fell through to the *root*
   * one — a card written for a request that never met the locale middleware. It
   * rendered its own document, so the masthead, the four pages, the telephone
   * number and the booking button all went with it, and it answered in three
   * languages at once because at that level it cannot know which is wanted.
   *
   * So the assertions are about what survives rather than about wording: the
   * status is still 404, the masthead is still there, and there is more than one
   * way out of the page. The old behaviour passed none of them.
   */
  test('a mistyped treatment keeps the masthead and a way onward', async ({ page }) => {
    const response = await page.goto('/sq/treatments/nuk-ekziston');
    expect(response?.status(), 'a missing page must still be a 404').toBe(404);

    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByRole('contentinfo')).toBeVisible();

    // Every storefront page, named on the page itself rather than only in the
    // bar — somebody who has just been told they are nowhere should be able to
    // see everywhere from where they are standing.
    for (const path of ['/sq/treatments', '/sq/practice', '/sq/visit', '/sq/abroad']) {
      await expect(page.locator(`main a[href="${path}"]`)).toHaveCount(1);
    }
    await expect(page.locator('main a[href="/sq/book"]')).not.toHaveCount(0);

    // And it is the practice's own language, not all three at once.
    await expect(page.locator('body')).not.toContainText('This page does not exist');
  });

  test('takes an appointment request and puts it in front of the desk', async ({ page }) => {
    await page.goto('/sq/book');

    const form = page.locator('#request');

    // The day, from the practice's own week, and the half of it that suits.
    // Both are ordinary named form fields, which is what lets the whole
    // submission happen without JavaScript on the path.
    await form.locator('.day[data-state="open"] input').first().check();
    await form.locator('.half').filter({ hasText: 'Paradite' }).locator('input').check();

    await form.getByLabel('Emri juaj').fill(CALLER);
    await form.getByLabel('Numri i telefonit').fill(CALLER_PHONE);
    await form.getByLabel('Doni të shtoni diçka?').fill('Dhëmbi i poshtëm majtas më dhemb.');

    // --- The X-ray they already have -----------------------------------
    //
    // Two files, attached in two goes on purpose. A bare `<input multiple>`
    // *replaces* its selection on the second pick, so one call would pass
    // whether or not the enhancement in `RequestFiles` works — and adding a
    // second file to a request is the thing that enhancement exists for.
    const files = form.locator('input[name="files"]');
    await files.setInputFiles({ name: 'opg.png', mimeType: 'image/png', buffer: PNG });
    await files.setInputFiles({
      name: 'referral.pdf',
      mimeType: 'application/pdf',
      buffer: PDF,
    });
    await expect(form.locator('.req-file')).toHaveCount(2);

    // And one comes back off again, which a bare input cannot do at all.
    await form.locator('.req-file-remove').last().click();
    await expect(form.locator('.req-file')).toHaveCount(1);
    await files.setInputFiles({
      name: 'referral.pdf',
      mimeType: 'application/pdf',
      buffer: PDF,
    });
    await expect(form.locator('.req-file')).toHaveCount(2);

    await form.getByRole('button', { name: 'Dërgo kërkesën' }).click();

    // The panel swaps to a confirmation in place. It also says, deliberately,
    // that nothing has been booked — a form that reads as a booking and is not
    // one is how somebody misses an appointment they thought they had, and a
    // calendar makes that misreading easier rather than harder.
    await expect(page.getByRole('heading', { name: 'E morëm kërkesën tuaj.' })).toBeVisible();
    // What they asked for, read back. This is the last chance to correct the
    // one thing this form can get wrong without anybody noticing.
    await expect(page.locator('.book-sent')).toContainText('Paradite');

    // The files included: the receipt for an upload is the only way somebody
    // ever finds out one did not arrive. On the word rather than on the digit —
    // the confirmation prints a date, and a date is full of digits.
    await expect(page.locator('.book-sent')).toContainText('2 skedar');
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

  // And the two questions the desk used to have to ring back and ask. A
  // preference rather than a booking — nothing is held — but it is what the
  // call opens with.
  await expect(row, 'the day they asked for never reached the desk').toContainText('Asked for');
  await expect(row).toContainText('Morning');

  // --- And what they sent with it ----------------------------------------
  //
  // The filenames are the sender's own, kept for display. The type beside them
  // is not: `requestAppointment` reads that off the bytes.
  await expect(row, 'the files never reached the desk').toContainText('opg.png');
  await expect(row).toContainText('referral.pdf');

  // The bytes, not just the row. These live outside `public/` and are handed out
  // only by `/api/request-files/[id]`, so this is also the assertion that the
  // route the desk's own thumbnails use actually serves them.
  const href = await row.locator('a[href*="/api/request-files/"]').first().getAttribute('href');
  expect(href, 'the desk rendered no link to the file').toBeTruthy();

  /**
   * Fetched **from inside the page**, and that is not a stylistic choice.
   *
   * `page.request` is a separate HTTP client living in Node that borrows the
   * browser's cookie jar, and `dent_session` is a `Secure` cookie. Chromium
   * treats `127.0.0.1` as a trustworthy origin and sends it over plain HTTP
   * anyway — which is why every navigation in this suite is signed in — but the
   * Node client applies the plain rule and drops it. Asking through
   * `page.request` therefore tests the route while signed *out*, and gets the
   * 404 it is supposed to get for a stranger. That is a real answer to a
   * question nobody meant to ask.
   */
  const seen = await page.evaluate(async (url) => {
    const response = await fetch(url, { credentials: 'same-origin' });
    return { status: response.status, type: response.headers.get('content-type') };
  }, href!);

  expect(seen.status, 'the file did not come back').toBe(200);
  // The type the *bytes* are. The upload declared `image/png` too, but that is
  // not what was stored — `requestAppointment` sniffed it.
  expect(seen.type).toBe('image/png');

  // And the id on its own is not a way in. The route refuses a file that is not
  // on the request named in the query, so walking ids gets a walker nothing
  // unless they already hold the row that goes with each one.
  const walked = href!.replace(/\?request=.*/, '?request=00000000-0000-0000-0000-000000000000');
  const refused = await page.evaluate(
    (url) => fetch(url, { credentials: 'same-origin' }).then((response) => response.status),
    walked,
  );
  expect(refused, 'a walked id was served').toBe(404);
});
