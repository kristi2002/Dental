'use client';

import { useEffect } from 'react';
import { ClinicLogo } from '@/components/brand/ClinicLogo';
import { bodyFont } from './fonts';
import { routing } from '@/i18n/routing';
import './globals.css';

/**
 * The last boundary: a throw in the root layout itself, before any locale has
 * been resolved.
 *
 * It replaces the whole document, so — like `not-found.tsx` beside it — it has
 * to bring its own `<html>` and `<body>`, and it cannot use `next-intl`: the
 * provider it would read from is part of what failed. Hence all three languages
 * on one line, the same answer the root 404 gives.
 *
 * Almost nothing reaches this. `(app)/error.tsx` catches everything inside the
 * signed-in app, which is every screen a clinic actually uses. This is here so
 * that the remaining sliver — a broken font import, a bad root layout deploy —
 * is a legible sentence rather than a white page.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[global error boundary]', error.digest ?? '(no digest)', error);
  }, [error]);

  return (
    <html lang={routing.defaultLocale} className={bodyFont.variable}>
      <body>
        <div className="flex min-h-screen items-center justify-center p-8">
          <div className="card max-w-lg p-8 text-center">
            {/* The one screen that cannot read a name out of anywhere — no
                locale, no provider, and quite possibly no database. A static
                file the server can still hand over is exactly the right thing
                to be recognised by. */}
            <ClinicLogo variant="brand" alt="" className="mx-auto mb-6 h-14 w-auto max-w-full" />
            <p className="mt-2 text-body text-ink-soft">
              Diçka shkoi keq · Something went wrong · Qualcosa è andato storto
            </p>
            <p className="mt-2 text-body text-ink-soft">
              Asgjë nuk humbi · Nothing was lost · Nulla è andato perso
            </p>
            <button type="button" onClick={reset} className="btn btn-primary mt-6">
              Provo sërish · Try again · Riprova
            </button>
            {error.digest ? (
              <p className="mt-6 text-sm text-ink-faint">
                <code>{error.digest}</code>
              </p>
            ) : null}
          </div>
        </div>
      </body>
    </html>
  );
}
