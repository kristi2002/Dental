'use client';

import { Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useCallback, useEffect, useRef, useState } from 'react';
import { PinPad } from '@/components/auth/PinPad';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { useRouter } from '@/i18n/navigation';
import { signOut, unlockSession } from '@/lib/actions/auth';
import { IDLE_STATE } from '@/lib/actions/types';
import { PIN_MIN_LENGTH } from '@/lib/auth/pin-constants';
import { initials } from '@/lib/utils';

/** Which events count as somebody being at the machine. */
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

/**
 * How often activity is allowed to reach the server. The point is to keep a long
 * read from expiring, not to narrate every keystroke to the network.
 */
const TOUCH_INTERVAL_MS = 4 * 60 * 1000;

export type LockedUser = { id: string; firstName: string; lastName: string };

/**
 * Locks the screen when the practice walks away from it.
 *
 * The clinic's real exposure is not somebody attacking the database — it is a
 * chart left open on a machine facing the waiting room while the person who
 * opened it is at the door. This covers that: after a quiet spell the page is
 * replaced by a PIN prompt, and the record behind it is off the glass.
 *
 * **This is the visible half of the timeout, not the enforcing half.** The
 * session cookie carries a short `maxAge` and is re-issued by the request proxy
 * on navigation, so an idle session lapses in the browser whether or not this
 * component is mounted, running, or has been picked out of the DOM. What this
 * adds is the part a cookie cannot do: covering the screen the moment it goes
 * quiet, and offering the way back in without losing the page underneath.
 *
 * Activity here also feeds the heartbeat, so somebody reading one chart for
 * twenty minutes is treated as present rather than absent.
 */
export function IdleLock({
  user,
  idleSeconds,
  warnSeconds = 60,
}: {
  user: LockedUser;
  idleSeconds: number;
  warnSeconds?: number;
}) {
  const t = useTranslations('auth');
  const router = useRouter();

  const [locked, setLocked] = useState(false);
  const [remaining, setRemaining] = useState(idleSeconds);
  const [pin, setPin] = useState('');
  const [state, formAction] = useActionState(unlockSession, IDLE_STATE);

  const lastActivity = useRef(Date.now());
  const lastTouch = useRef(Date.now());

  // Deliberately stable: re-registering four listeners on every tick of the
  // countdown would be the whole cost of this component, and the handler never
  // needs to change.
  const noteActivity = useCallback(() => {
    lastActivity.current = Date.now();

    if (Date.now() - lastTouch.current > TOUCH_INTERVAL_MS) {
      lastTouch.current = Date.now();
      // Fire and forget: a failed heartbeat means the session was already gone,
      // and the next navigation lands on the login screen, which is correct.
      void fetch('/api/session/touch', { method: 'POST' }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (locked) return;

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, noteActivity, { passive: true });
    }

    const timer = window.setInterval(() => {
      const idleFor = Math.floor((Date.now() - lastActivity.current) / 1000);
      const left = idleSeconds - idleFor;

      setRemaining(left);
      // A laptop that was asleep wakes up well past the deadline rather than one
      // second short of it, which is why this compares against the clock instead
      // of counting ticks down.
      if (left <= 0) setLocked(true);
    }, 1000);

    return () => {
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, noteActivity);
      window.clearInterval(timer);
    };
  }, [locked, idleSeconds, noteActivity]);

  // A rejected PIN clears itself — retyping is faster than deleting six digits.
  useEffect(() => {
    if (state.status === 'error') setPin('');
    if (state.status === 'ok') {
      setPin('');
      setLocked(false);
      lastActivity.current = Date.now();
      lastTouch.current = Date.now();
      setRemaining(idleSeconds);
      // The page behind the lock was rendered under the old session and may have
      // sat there for an hour. Re-fetch it rather than hand back a stale chart.
      router.refresh();
    }
  }, [state, idleSeconds, router]);

  if (!locked) {
    if (remaining > warnSeconds) return null;

    return (
      <div
        role="status"
        aria-live="polite"
        data-print-hide
        className="fixed inset-x-0 bottom-0 z-40 mx-auto mb-4 w-fit rounded-[var(--radius-card)] border border-warn bg-warn-soft px-4 py-2.5 font-semibold text-warn shadow-lg"
      >
        {t('idleWarning', { seconds: Math.max(0, remaining) })}
      </div>
    );
  }

  const complete = pin.length >= PIN_MIN_LENGTH;

  return (
    // Opaque, fixed and above everything: the point is that the record behind it
    // stops being readable, so a translucent scrim would defeat the exercise.
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="idle-lock-title"
      data-print-hide
      className="fixed inset-0 z-50 overflow-y-auto bg-paper px-4 py-8"
    >
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-6 text-center">
          <span
            aria-hidden
            className="mx-auto mb-3 grid size-14 place-items-center rounded-full bg-brand-soft text-brand-deep"
          >
            <Lock size={26} />
          </span>
          <h2 id="idle-lock-title" className="text-[1.35rem] font-bold text-ink">
            {t('lockedTitle')}
          </h2>
          <p className="mt-1 text-[0.95rem] text-ink-soft">{t('lockedBody')}</p>
        </div>

        <form action={formAction} className="space-y-5">
          <input type="hidden" name="staffId" value={user.id} />
          <input type="hidden" name="pin" value={pin} />

          <div className="flex items-center justify-center gap-3 rounded-[var(--radius-card)] border border-line-strong bg-surface px-3.5 py-3">
            <span
              aria-hidden
              className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-soft text-[1.05rem] font-bold text-brand-deep"
            >
              {initials(user.firstName, user.lastName)}
            </span>
            <span className="min-w-0 truncate text-[1.05rem] font-bold text-ink">
              {user.firstName} {user.lastName}
            </span>
          </div>

          <div>
            <p className="field-label">{t('enterPin')}</p>
            <PinPad pin={pin} onChange={setPin} />
          </div>

          {state.status === 'error' ? (
            <p
              role="alert"
              className="rounded-lg border border-danger bg-danger-soft px-3 py-2 font-semibold text-danger"
            >
              {state.message}
            </p>
          ) : null}

          <SubmitButton
            label={t('unlock')}
            pendingLabel={t('unlocking')}
            disabled={!complete}
            className="btn-lg w-full disabled:opacity-50"
          />
        </form>

        {/* The way out for the other case: not the same person coming back, but
            the next shift arriving at a machine somebody else left locked. */}
        <form action={signOut} className="mt-3">
          <button type="submit" className="btn btn-ghost btn-sm w-full">
            {t('lockedSignOut')}
          </button>
        </form>
      </div>
    </div>
  );
}
