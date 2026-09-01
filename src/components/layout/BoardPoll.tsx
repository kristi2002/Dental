'use client';

import { useEffect } from 'react';
import { useRouter } from '@/i18n/navigation';

/**
 * How often the board is allowed to go and look.
 *
 * Three minutes, and the number is a compromise between two failures. Too eager
 * and every open tab in the practice re-renders the whole layout — five counts,
 * each a query — for no news, on a machine that may be a nine-year-old
 * workstation. Too slow and it may as well not exist. Three minutes means a
 * booking request left at eleven is on somebody's screen by four minutes past,
 * which is the standard the request alert already sets by email.
 */
const POLL_MS = 3 * 60 * 1000;

/**
 * Making the bell notice things without somebody clicking first.
 *
 * The reminder board is headed *everything waiting on the practice, in one
 * place*, and until now it was everything waiting **as of the last time this
 * person navigated**. A front desk that opens the calendar at nine and works
 * from it all morning has a bell that was accurate at nine: the booking request
 * that arrived at eleven, the reply from a patient, the case marked back from
 * the laboratory — none of it appears until somebody happens to click something
 * else. The one queue where that was unacceptable already got its own email
 * (see `request-alert.ts`); this is the general answer.
 *
 * **A refresh, not a fetch.** `router.refresh()` re-runs the server render and
 * reconciles, which means every count on the page updates from the one source
 * that computes them — no second endpoint that has to agree with the first,
 * which is the failure mode this app has just spent a release removing from the
 * outbox. Client state, open dialogs and scroll position survive it.
 *
 * **Two things stop it.** A hidden tab polls nothing, because a practice leaves
 * six tabs open and only one of them is being looked at. And an open dialog
 * pauses it: a refresh under somebody typing a clinical note is exactly the
 * moment not to re-render the tree beneath them, and every dialog in this app
 * is a real `<dialog open>` — which makes that a one-line question rather than
 * a piece of global state to keep in step.
 */
export function BoardPoll() {
  const router = useRouter();

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (document.querySelector('dialog[open]')) return;
      router.refresh();
    }, POLL_MS);

    return () => window.clearInterval(timer);
  }, [router]);

  return null;
}
