'use client';

import { Phone, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { Link } from '@/i18n/navigation';
import { telLink } from '@/lib/reminders';

/**
 * What a visitor sees when a storefront page throws.
 *
 * The signed-in app has had one of these since the first pass; the public side
 * never did, so a throw here fell through to `app/global-error.tsx` — a
 * trilingual card that replaces the entire document, drops the masthead and the
 * footer with it, and leaves somebody who was two minutes from booking with a
 * logo and a **Try again** button.
 *
 * The difference from the app's boundary is who is reading. A member of staff
 * who meets a crash needs to know nothing was half-written to the record; a
 * stranger needs to know the practice is still there and still answerable, so
 * the telephone number is the point of this screen and the retry is secondary.
 * It is offered as a plain `tel:` on the page rather than left to the masthead,
 * because the masthead is exactly what a reader stops trusting the moment a page
 * has visibly failed.
 *
 * The number is not read from `getSiteContact` — this is a client component and
 * the database is a plausible reason to be here at all. `NEXT_PUBLIC_CLINIC_PHONE`
 * is baked in at build time, so it survives the failure that produced this page;
 * when it is unset the block is simply left out rather than offering a `tel:` to
 * nothing, which is the rule the rest of the storefront follows.
 */
export default function SiteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('site');
  const phone = process.env.NEXT_PUBLIC_CLINIC_PHONE?.trim() || '';
  const href = phone ? telLink(phone) : null;

  useEffect(() => {
    console.error('[site error boundary]', error.digest ?? '(no digest)', error);
  }, [error]);

  return (
    <section className="mx-auto w-full max-w-2xl px-5 pt-40 pb-28 text-center">
      <h1 className="font-display text-[2.1rem] leading-tight text-ink sm:text-[2.6rem]">
        {t('broke.title')}
      </h1>
      <p className="mt-4 text-lead leading-relaxed text-ink-soft">{t('broke.lede')}</p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button type="button" onClick={reset} className="btn btn-primary btn-lg">
          <RotateCcw size={20} aria-hidden />
          {t('broke.retry')}
        </button>
        <Link href="/" className="btn btn-secondary btn-lg">
          {t('broke.home')}
        </Link>
      </div>

      {href ? (
        <p className="mt-10 text-body text-ink-soft">
          {t('broke.callInstead')}{' '}
          <a href={href} className="font-bold text-ink">
            <Phone size={17} aria-hidden className="mr-1 inline align-[-2px]" />
            {phone}
          </a>
        </p>
      ) : null}
    </section>
  );
}
