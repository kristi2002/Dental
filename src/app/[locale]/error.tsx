'use client';

import { RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { ClinicLogo } from '@/components/brand/ClinicLogo';

/**
 * What the three screens outside the signed-in app show when they throw.
 *
 * `(app)/error.tsx` covers everything behind the sign-in, and covers it well.
 * But `login`, `setup` and `confirm/[token]` sit outside that group, so a throw
 * on any of them escaped all the way to `global-error.tsx` — which replaces the
 * entire document with an untranslated three-language card.
 *
 * Those are the three screens least able to afford it. The most likely
 * production failure in this deployment is Postgres being unreachable, and the
 * first place it surfaces is the sign-in query — so the practice's own way back
 * in is the page that had no designed failure state. `confirm/[token]` is worse
 * again: it is the only page in the app a *patient* ever opens, reached from a
 * link in a reminder, and its reader has no idea what a DentOrganizer is.
 *
 * Rendered inside `[locale]/layout.tsx`, so unlike `global-error.tsx` this one
 * still has the locale, the fonts and the practice's own language.
 */
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errors');

  useEffect(() => {
    console.error('[error boundary · locale]', error.digest ?? '(no digest)', error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <div className="card max-w-lg p-8 text-center">
        {/* No masthead out here, so the mark is what says whose building this
            is — the same job it does on the sign-in screen itself. */}
        <ClinicLogo variant="brand" alt="" className="mx-auto mb-6 h-14 w-auto max-w-full" />

        <h1 className="text-3xl font-bold text-ink">{t('crashed')}</h1>
        <p className="mt-2 text-[1.05rem] text-ink-soft">{t('crashedText')}</p>

        <button type="button" onClick={reset} className="btn btn-primary mt-6">
          <RotateCcw size={20} aria-hidden />
          {t('crashedRetry')}
        </button>

        {error.digest ? (
          <p className="mt-6 text-sm text-ink-faint">
            <code>{t('crashedReference', { digest: error.digest })}</code>
            <span className="mt-1 block">{t('crashedReferenceHint')}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
