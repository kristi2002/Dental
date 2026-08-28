'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import { fromDateKey, isDateKey } from '@/lib/dates';
import { prisma } from '@/lib/prisma';
import { clientKey, rateLimit } from '@/lib/rate-limit';
import { getBookingWindow } from '@/lib/site';
import {
  isPreferredTime,
  isRequestTopic,
  MIDDAY_MINUTES,
  REQUEST_LIMITS,
} from '@/lib/site-content';
import { optionalString, requiredString } from '@/lib/utils';
import { actionError, actionOk, type ActionState } from './types';

/**
 * The day and the half-day, checked against the practice's own week.
 *
 * Both fields are optional, and "they did not say" is the commonest answer:
 * the calendar can be skipped, and a browser with no JavaScript reaches the
 * submit button without ever having paged it. So a missing value is a null and
 * never an error.
 *
 * **A value that is present is checked rather than trusted**, and not because
 * anybody expects a stranger to forge a date. The honest case is a tab left
 * open: somebody picks Friday, goes to dinner, and presses the button after
 * midnight on a page whose window no longer contains it — or after the practice
 * has entered a closure over that week. Writing the date anyway would put a day
 * the surgery is shut on the desk's list as though the visitor had asked for it,
 * and the desk would ring back to correct a mistake the page made. Saying "that
 * day has gone, pick another" is the version that keeps the form's own promise.
 *
 * The half-day is checked against the *chosen day's* real open stretches for the
 * same reason, and simply dropped rather than refused when it does not fit: a
 * morning that has stopped existing is a detail the desk can settle on the
 * telephone, where a day that has stopped existing is a wasted call. It is also
 * dropped when no day was given — "mornings, on no particular day" is not a
 * preference this practice can act on before it has spoken to somebody.
 */
async function readPreferredDay(
  formData: FormData,
): Promise<{ date: Date | null; half: string | null } | 'unavailable'> {
  const key = optionalString(formData.get('preferredDate'));
  if (!key) return { date: null, half: null };
  if (!isDateKey(key)) return 'unavailable';

  // Null when the database is unreachable. The request itself is still worth
  // taking — that is the whole point of a form whose only required fields are a
  // name and a number — so the day is dropped and the call back asks for it.
  const window = await getBookingWindow();
  if (!window) return { date: null, half: null };

  const day = window.days.find((entry) => entry.date === key);
  if (!day || !day.open) return 'unavailable';

  const wanted = optionalString(formData.get('preferredTime'));
  const half =
    wanted && isPreferredTime(wanted) &&
    day.ranges.some((range) =>
      wanted === 'morning' ? range.start < MIDDAY_MINUTES : range.end > MIDDAY_MINUTES,
    )
      ? wanted
      : null;

  return { date: fromDateKey(key), half };
}

/**
 * The one write on this app that nobody has to sign in to perform.
 *
 * Everything else in `lib/actions` opens with `authorize(...)` and refuses
 * whoever is not allowed. This cannot: it is the button on the practice's public
 * page that says "ring me back", and requiring an account to press it would
 * defeat the entire purpose of the page it sits on.
 *
 * So the guards are different in kind, and there are four of them:
 *
 *  1. **It cannot reach anything a stranger cannot already see.** The action
 *     writes one row into `AppointmentRequest`, and the only thing it reads is
 *     `getBookingWindow` — the practice's opening hours and its closures, which
 *     are printed on the page this form is on. There is no patient lookup, no
 *     "do we know this number", no branch whose timing could answer a question
 *     about who is already on file. A stranger's only observable outcome is
 *     "accepted", "pick another day", or "try again later".
 *  2. **It is throttled per address**, on the same in-memory bucket the
 *     confirmation link uses. Four an hour is far above what a person filling in
 *     a form needs and far below what makes a table worth spamming.
 *  3. **It carries a honeypot.** `website` is a real input, hidden from people
 *     and from screen readers, and left empty by every human being. Anything
 *     that fills it is told the request was accepted and nothing is written —
 *     a bot that is told it failed comes back and tries differently.
 *  4. **Every field is capped** before it reaches Postgres, so a megabyte of
 *     text is a sentence in the visitor's own language rather than a database
 *     error in the practice's log.
 *
 * There is no audit entry, deliberately. `recordAudit` records what a *member of
 * staff* did, and attributing this to nobody would put a row in the trail that
 * no account is answerable for. The request itself is the record.
 */
export async function requestAppointment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations('site');

  // Silently accepted, never stored. See (3) above.
  if (requiredString(formData.get('website'))) return actionOk();

  const limit = rateLimit(`request:${clientKey(await headers())}`, {
    limit: 4,
    windowMs: 60 * 60_000,
  });
  if (!limit.allowed) return actionError(t('form.tooMany'));

  const name = requiredString(formData.get('name'));
  const phone = requiredString(formData.get('phone'));
  if (!name || !phone) return actionError(t('form.missing'));

  if (
    name.length > REQUEST_LIMITS.name ||
    phone.length > REQUEST_LIMITS.phone ||
    (formData.get('email')?.toString().length ?? 0) > REQUEST_LIMITS.email ||
    (formData.get('message')?.toString().length ?? 0) > REQUEST_LIMITS.message
  ) {
    return actionError(t('form.tooLong'));
  }

  const topic = optionalString(formData.get('topic'));

  const preferred = await readPreferredDay(formData);
  if (preferred === 'unavailable') return actionError(t('book.dayGone'));

  await prisma.appointmentRequest.create({
    data: {
      name,
      phone,
      email: optionalString(formData.get('email')),
      message: optionalString(formData.get('message')),
      preferredDate: preferred.date,
      preferredTime: preferred.half,
      // Anything the form did not offer is dropped rather than stored: `topic`
      // is rendered back to the desk through `messages`, and a key with no
      // translation behind it would show up on their screen as the raw string
      // somebody posted.
      topic: topic && isRequestTopic(topic) ? topic : null,
      locale: await getLocale(),
    },
    select: { id: true },
  });

  // The desk's list, and the dashboard card that counts it. `layout` because the
  // count also rides in the navigation rail.
  revalidatePath('/', 'layout');
  return actionOk();
}
