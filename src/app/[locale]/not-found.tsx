import { useTranslations } from 'next-intl';
import { ClinicLogo } from '@/components/brand/ClinicLogo';
import { Link } from '@/i18n/navigation';

/**
 * The 404 for a locale path that belongs to neither group.
 *
 * `(app)` and `(site)` each have one of their own, and each arrives inside its
 * own chrome. What was left over is the handful of routes that sit directly
 * under `[locale]` — the sign-in pad, the first-run setup screen, and the
 * confirmation link a patient opens out of a reminder — plus any URL under a
 * known locale that matched no route at all.
 *
 * All of those used to fall through to `app/not-found.tsx`, which is written for
 * a request that never reached the locale middleware: it renders its own
 * document and answers in all three languages at once because it has no way of
 * knowing which one is wanted. Here the locale is in the URL and known, so the
 * page can simply be in the reader's language — and that matters most for the
 * one of these routes a patient actually meets, where a stale or mistyped
 * confirmation link is the ordinary case rather than an odd one.
 *
 * It leads back to the practice's public page rather than to the dashboard: the
 * dashboard is behind a sign-in, and whoever is standing on one of these routes
 * is at least as likely to be a patient as a member of staff.
 */
export default function LocaleRootNotFound() {
  const t = useTranslations('errors');

  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <div className="card max-w-lg p-8 text-center">
        <ClinicLogo variant="brand" alt="" className="mx-auto mb-6 h-14 w-auto max-w-full" />
        <h1 className="text-3xl font-bold text-ink">{t('notFound')}</h1>
        <p className="mt-2 text-body text-ink-soft">{t('notFoundText')}</p>
        <Link href="/" className="btn btn-primary mt-6">
          {t('backToSite')}
        </Link>
      </div>
    </div>
  );
}
