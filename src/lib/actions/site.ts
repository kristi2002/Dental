'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/prisma';
import { clientKey, rateLimit } from '@/lib/rate-limit';
import { isRequestTopic, REQUEST_LIMITS } from '@/lib/site-content';
import { optionalString, requiredString } from '@/lib/utils';
import { actionError, actionOk, type ActionState } from './types';

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
 *  1. **It cannot reach anything.** The action writes one row into
 *     `AppointmentRequest` and reads nothing at all. There is no patient lookup,
 *     no "do we know this number", no branch whose timing could answer a
 *     question about who is already on file. A stranger's only observable
 *     outcome is "accepted" or "try again later".
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

  await prisma.appointmentRequest.create({
    data: {
      name,
      phone,
      email: optionalString(formData.get('email')),
      message: optionalString(formData.get('message')),
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
