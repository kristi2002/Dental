'use client';

import { RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { Link } from '@/i18n/navigation';

/**
 * What the app shows when a screen throws.
 *
 * Until this existed, the answer was Next's own error page: English, unstyled,
 * "Application error: a server-side exception has occurred", and no way back.
 * In an application whose whole brief is large type, high contrast and every
 * screen doing one obvious thing, that was the single screen nobody had
 * designed — and the one most likely to be met by somebody already having a bad
 * morning.
 *
 * It covers every route in the `(app)` group, so the masthead and the sidebar
 * stay put and only the page area is replaced. Somebody who lands here is still
 * signed in and one tap from anywhere else.
 *
 * The wording does the work that matters. A clinician who sees a crash mid-note
 * needs one question answered before anything else — *did I just lose it, and
 * did it half-happen?* Every write in this app goes through a server action that
 * either completes or does not, so the honest answer is no on both counts, and
 * saying so is more use than any apology.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errors');

  useEffect(() => {
    // The clinic runs one process on one machine with no error reporting
    // service, so the container log is where this has to land. `digest` is the
    // only thing tying the log line to what the person on the screen can read
    // out, which is why it is shown to them.
    console.error('[error boundary]', error.digest ?? '(no digest)', error);
  }, [error]);

  return (
    <div className="card mx-auto max-w-lg p-8 text-center">
      <h1 className="text-3xl font-bold text-ink">{t('crashed')}</h1>
      <p className="mt-2 text-[1.05rem] text-ink-soft">{t('crashedText')}</p>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {/* Re-renders the segment rather than reloading the tab, so the attempt
            costs nothing if it fails again. */}
        <button type="button" onClick={reset} className="btn btn-primary">
          <RotateCcw size={20} aria-hidden />
          {t('crashedRetry')}
        </button>
        <Link href="/dashboard" className="btn">
          {t('backHome')}
        </Link>
      </div>

      {error.digest ? (
        <p className="mt-6 text-sm text-ink-faint">
          <code>{t('crashedReference', { digest: error.digest })}</code>
          <span className="mt-1 block">{t('crashedReferenceHint')}</span>
        </p>
      ) : null}
    </div>
  );
}
