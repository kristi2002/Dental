import { Compass } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { PageHero } from '@/components/site/PageHero';
import { SITE_PAGES } from '@/components/site/site-pages';
import { Link } from '@/i18n/navigation';

/**
 * The storefront's own 404.
 *
 * Until this existed, a mistyped treatment slug — or a link from a campaign that
 * has since been renamed — fell all the way through to `app/not-found.tsx`, the
 * root one. That page is written for a request the locale middleware never
 * matched, so it renders its own `<html>`, says "Kjo faqe nuk ekziston · This
 * page does not exist · Questa pagina non esiste" because it cannot know which
 * language to use, and carries exactly one link. On the storefront every part of
 * that is wrong: the locale *is* known, it is in the URL; and the page a
 * prospective patient lands on by accident is the last place to strip the
 * masthead, the treatments, the telephone number and the way to book.
 *
 * So this one sits inside the `(site)` group, which means it is wrapped in that
 * group's layout and arrives with the chrome already round it. What it adds is
 * the part a header cannot do: naming the four pages outright, because somebody
 * who has just been told they are nowhere should be able to see everywhere from
 * where they are standing.
 *
 * Deliberately not a redirect to the front page. A visitor who followed a link
 * to something specific has not asked to be sent to the top of the site, and
 * quietly landing them there tells them nothing about why what they wanted was
 * not here.
 */
export default function SiteNotFound() {
  const t = useTranslations('site');

  return (
    <>
      <PageHero eyebrow={t('gone.eyebrow')} title={t('gone.title')} lede={t('gone.lede')} />

      <section className="mx-auto w-full max-w-4xl px-5 pb-24">
        <ul className="grid gap-3 sm:grid-cols-2">
          {SITE_PAGES.map(({ href, key }) => (
            <li key={href}>
              <Link
                href={href}
                className="flex items-center gap-3 rounded-2xl border border-ink/10 bg-white/70 px-5 py-4
                  text-body font-semibold text-ink no-underline transition-colors hover:bg-white"
              >
                <Compass size={20} aria-hidden className="shrink-0 text-gilt-deep" />
                {t(`nav.${key}`)}
              </Link>
            </li>
          ))}
        </ul>

        {/* The one that is not a page but the errand. Full width under the four,
            because a reader who came looking for a treatment and did not find it
            still wants the appointment they were after. */}
        <Link href="/book" className="btn btn-primary btn-lg mt-4 w-full">
          {t('nav.book')}
        </Link>
      </section>
    </>
  );
}
