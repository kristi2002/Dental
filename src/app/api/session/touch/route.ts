import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  refreshSession,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  verifySession,
} from '@/lib/auth/token';

/**
 * Keeps a session alive while somebody is reading rather than clicking.
 *
 * The proxy refreshes the cookie on navigation, which covers ordinary work but
 * not the case the idle timeout is most likely to interrupt unfairly: a dentist
 * with one chart open for twenty minutes. `IdleLock` calls this on real activity
 * — and only every few minutes — so that counts as being present.
 *
 * It grants nothing on its own. An expired or forged cookie gets a 401 and the
 * next page load lands on the login screen, exactly as if this route did not
 * exist.
 */
export async function POST() {
  const store = await cookies();

  const payload = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!payload) return new NextResponse(null, { status: 401 });

  store.set(SESSION_COOKIE, await refreshSession(payload), SESSION_COOKIE_OPTIONS);
  return new NextResponse(null, { status: 204 });
}
