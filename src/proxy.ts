import createMiddleware from 'next-intl/middleware';
import type { NextRequest } from 'next/server';
import { routing } from './i18n/routing';
import {
  refreshSession,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  verifySession,
} from './lib/auth/token';

// Next 16 renamed the `middleware` convention to `proxy`; next-intl's locale
// negotiation plugs in unchanged.
const handleLocale = createMiddleware(routing);

/**
 * Locale negotiation, plus the sliding half of the idle timeout.
 *
 * The session cookie is written with a short `maxAge`, so it lapses on its own
 * unless something keeps handing it back. Every navigation is that something:
 * a person working through the app never notices, and a machine left alone on a
 * patient's chart stops being signed in a quarter of an hour later without the
 * page having to co-operate.
 *
 * Only re-signed, never re-dated — `refreshSession` copies the absolute expiry
 * across, so this extends the idle window and not the 12-hour cap.
 *
 * Verification here is a signature check against a secret, not a database read;
 * this runs on the edge, and `token.ts` is built on Web Crypto for that reason.
 */
export default async function proxy(request: NextRequest) {
  const response = handleLocale(request);

  const payload = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (payload) {
    response.cookies.set(SESSION_COOKIE, await refreshSession(payload), SESSION_COOKIE_OPTIONS);
  }

  return response;
}

export const config = {
  // Everything except API routes, Next internals and files with an extension.
  matcher: '/((?!api|_next|_vercel|.*\\..*).*)',
};
