import type { ReactNode } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { Ambience } from '@/components/site/Ambience';
import { BookFab } from '@/components/site/BookFab';
import { SiteFooter } from '@/components/site/SiteFooter';
import { SiteHeader } from '@/components/site/SiteHeader';
import { TopicProvider } from '@/components/site/TopicChoice';
import { getSiteContact, getSiteHours } from '@/lib/site';
import { prata } from '../../fonts';

/**
 * The practice's front door — everything a person who is not staff can open.
 *
 * A sibling of `(app)`, not a child of it, and that is the whole reason this
 * group exists: `(app)/layout.tsx` opens with `requireUser()`, so anything
 * underneath it redirects a stranger to the sign-in pad. The two groups both
 * render at `/[locale]`, which is why the dashboard moved to `/dashboard` when
 * this landed — the root belongs to the practice's patients, and the software is
 * the thing filed at a path.
 *
 * `prata.variable` goes on a wrapper rather than on `<html>` because the
 * document is rendered one level up, in `[locale]/layout.tsx`, where the locale
 * is known and the storefront is not. A CSS variable cascades perfectly well
 * from a div, so `--font-display` resolves inside this subtree and nowhere else
 * — which is exactly the intent: no signed-in screen should download a serif it
 * never sets a word in.
 */
export default async function SiteLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Read once here and handed down, rather than fetched again in the header and
  // the footer. `getSiteContact` is `cache`d per request so a second call would
  // be free, but passing it makes it obvious that the chrome and the page are
  // quoting one answer.
  const [contact, hours] = await Promise.all([getSiteContact(), getSiteHours()]);

  return (
    // `site-display` has to sit on the *same* element as `prata.variable`, not
    // merely inside it — see the note in `globals.css`.
    //
    // This element's `bg-bone` is now the ground for the *whole* storefront
    // rather than a default nobody saw: every cream section below is
    // transparent and this is what shows through them. See the backdrop note
    // immediately below.
    <div className={`${prata.variable} site-display bg-bone`}>
      {/*
       * One light, for the entire page.
       *
       * Each cream section used to own its own copy of this, clipped to its own
       * box — which lit them, and in doing so drew a line under every one of
       * them. Six sections each with a light of its own is six lit rooms, and
       * the reader was being told at every boundary that they had entered
       * another. That is the opposite of what the layer was added for.
       *
       * So: `fixed`, one instance, behind everything. The light does not scroll
       * — the page travels through it. Two consequences, both wanted. The cream
       * genuinely is one continuous sheet from the hero to the footer, because
       * nothing interrupts it any more. And the gradients stay viewport-sized
       * rather than being stretched over a fourteen-thousand-pixel document,
       * which is what an `absolute` version of this would do and why it is not
       * one: a 40rem radial on a page that tall is a dot.
       *
       * `-z-10` puts it above this element's own `bg-bone` and below every piece
       * of content — a negative-z child paints between a parent's background and
       * its in-flow children, which is exactly the slot this needs. Nothing
       * above here establishes a containing block, so `fixed` resolves against
       * the viewport as intended; a `transform` or a `filter` added to any
       * ancestor later would silently break that, which is worth knowing before
       * anyone puts one there.
       *
       * The navy sections are opaque and simply cover it. They keep their own
       * `Ambience`, in the cold blue and bronze that a dark ground needs.
       */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <Ambience tone="bone" />
      </div>

      {/* The one value two distant client components share — which treatment
          the reader said they are asking about. Wrapping here rather than in
          the page because `children` arrives already rendered on the server, so
          nothing inside this boundary becomes a client component. See
          `TopicChoice`. */}
      <TopicProvider>
        <SiteHeader contact={contact} />
        <main id="main">{children}</main>
        <SiteFooter contact={contact} hours={hours} />

        {/* Fixed, and only below `sm` — the masthead's own booking button covers
            every wider screen. It lived on the front page while that was the
            only page there was; it belongs to the whole storefront now, and a
            reader four screens into the treatments page needs the way to the
            booking page at least as badly as one on the front page did.

            There was a `BookDrawer` beside it until booking became a route of
            its own: a `<dialog>` that caught every click on a link ending in
            `#request` and slid the form in over whatever was on screen. It went
            for the three reasons written up in `(site)/book/page.tsx` — a panel
            has no address to print on a card, no room for a month grid, and it
            treats booking as an interruption to the page rather than as the
            thing the page is for. */}
        <BookFab />
      </TopicProvider>
    </div>
  );
}
