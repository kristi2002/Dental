import type { ReactNode } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { BookDrawer } from '@/components/site/BookDrawer';
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
    <div className={`${prata.variable} site-display bg-bone`}>
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
            every wider screen. Both of these lived on the front page while it was
            the only page there was; they belong to the whole storefront now, and
            a reader four screens into the treatments page needs the way back to
            a form at least as badly as one on the front page did. */}
        <BookFab />

        {/* Last in the layout and deliberately so: it is a `<dialog>`, so it
            paints in the top layer wherever it sits, and having it after the
            page means the no-JavaScript link above it is the one the browser
            resolves. It intercepts clicks on every link ending in `#request` —
            see `BookDrawer`. */}
        <BookDrawer />
      </TopicProvider>
    </div>
  );
}
