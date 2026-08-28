'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { AppointmentStatus, ToothNumbering } from '@/generated/prisma/enums';
import { authorize, recordAudit, requireUser } from '@/lib/auth/guard';
import { DEFAULT_WEEK, rangesFor } from '@/lib/clinic-hours';
import { isDateKey, timeToMinutes, toDateKey, today } from '@/lib/dates';
import { prisma } from '@/lib/prisma';
import { SITE_CACHE_TAG } from '@/lib/site';
import { optionalString, requiredString } from '@/lib/utils';
import { actionError, actionOk, type ActionState } from './types';

/**
 * Everything this screen can change, dropped from every cache that holds it.
 *
 * The path revalidation covers the app's own rendered pages. The tag is the
 * public storefront, whose opening hours, closures and telephone number are held
 * for five minutes by `unstable_cache` — and `revalidatePath` does not touch
 * those, because they are keyed by tag rather than by route. Without this line a
 * practice that corrects its Saturday hours would watch its own front page go on
 * quoting the old ones, reload twice, and reasonably conclude the site is
 * broken.
 *
 * `updateTag` rather than `revalidateTag`, which in Next 16 are no longer the
 * same gesture: `revalidateTag` marks an entry stale and lets the next request
 * be served the old value while a fresh one is fetched behind it, which is the
 * wrong half of the trade here. `updateTag` expires it outright and makes the
 * next request wait — read-your-own-writes, which is exactly what somebody who
 * has just pressed Save is entitled to. It is only callable from a Server
 * Action, and every caller in this file is one.
 *
 * Called by every action in this file rather than only by the two that touch
 * hours and the profile. Which settings feed the front page is not something the
 * next person editing this file should have to know.
 */
function revalidateAll() {
  revalidatePath('/', 'layout');
  updateTag(SITE_CACHE_TAG);
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** `"8:00"` → `"08:00"`, anything unparseable → null. */
function normaliseTime(value: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const padded = `${match[1].padStart(2, '0')}:${match[2]}`;
  return TIME_PATTERN.test(padded) ? padded : null;
}

/**
 * All seven weekdays at once. The form always submits the whole week, so this
 * is an upsert per row rather than a diff — seven writes, and no way to end up
 * with a half-configured week.
 */
export async function saveClinicHours(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations('errors');

  const user = await authorize('settings.edit');
  if (!user) return actionError(t('forbidden'));

  const rows = DEFAULT_WEEK.map((fallback) => {
    const weekday = fallback.weekday;
    const openTime = normaliseTime(optionalString(formData.get(`openTime-${weekday}`)));
    const closeTime = normaliseTime(optionalString(formData.get(`closeTime-${weekday}`)));
    const breakStart = normaliseTime(optionalString(formData.get(`breakStart-${weekday}`)));
    const breakEnd = normaliseTime(optionalString(formData.get(`breakEnd-${weekday}`)));

    return {
      weekday,
      open: formData.get(`open-${weekday}`) === '1',
      openTime: openTime ?? fallback.openTime,
      closeTime: closeTime ?? fallback.closeTime,
      // A half-filled break is no break — keeping one side would silently shut
      // the practice from midday to closing.
      breakStart: breakStart && breakEnd ? breakStart : null,
      breakEnd: breakStart && breakEnd ? breakEnd : null,
    };
  });

  // An open day that yields no open minutes is a typo, not a configuration —
  // refuse it here rather than let every free-slot search quietly return empty.
  const broken = rows.find((row) => row.open && rangesFor(row).length === 0);
  if (broken) return actionError(t('hoursInvalid'));

  // Narrowing the week over appointments that already exist.
  //
  // Closing Saturday, or pulling the evening in by two hours, does not move the
  // people already booked into that time — it just stops the calendar drawing
  // the hours they sit in. Same treatment as a closure: said out loud once, and
  // overridable, because shrinking the week before rebooking is a normal order
  // to work in.
  if (requiredString(formData.get('force')) !== '1') {
    const byWeekday = new Map(rows.map((row) => [row.weekday, row]));

    const upcoming = await prisma.appointment.findMany({
      where: {
        date: { gte: today() },
        status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.ARRIVED] },
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      select: {
        date: true,
        startTime: true,
        durationMin: true,
        patient: { select: { firstName: true, lastName: true } },
      },
    });

    const stranded = upcoming.filter((appointment) => {
      const row = byWeekday.get(appointment.date.getUTCDay());
      if (!row) return false;
      if (!row.open) return true;

      const start = timeToMinutes(appointment.startTime);
      const end = start + appointment.durationMin;
      // Inside *some* open stretch, in full. A booking straddling the new lunch
      // break is as stranded as one outside the day entirely.
      return !rangesFor(row).some((range) => start >= range.start && end <= range.end);
    });

    if (stranded.length > 0) {
      const list = stranded
        .slice(0, 5)
        .map(
          (a) =>
            `${toDateKey(a.date)} ${a.startTime} ${a.patient.lastName} ${a.patient.firstName}`,
        )
        .join(', ');
      return actionError(
        t('hoursClash', { count: stranded.length, list }),
        'bookedOver',
      );
    }
  }

  try {
    await prisma.$transaction(
      rows.map((row) =>
        prisma.clinicHours.upsert({
          where: { weekday: row.weekday },
          create: row,
          update: row,
        }),
      ),
    );
  } catch {
    return actionError(t('generic'));
  }

  await recordAudit(user, {
    action: 'update',
    entity: 'settings',
    summary: `Opening hours · ${rows.filter((row) => row.open).length}/7 days open`,
  });

  revalidateAll();
  return actionOk();
}

export async function saveClosure(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getTranslations('errors');

  const user = await authorize('settings.edit');
  if (!user) return actionError(t('forbidden'));

  const reason = requiredString(formData.get('reason'));
  const from = requiredString(formData.get('from'));
  const to = optionalString(formData.get('to')) ?? from;

  if (!reason || !isDateKey(from) || !isDateKey(to)) {
    return actionError(t('fillRequired'));
  }

  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T00:00:00.000Z`);
  if (toDate < fromDate) return actionError(t('rangeBackwards'));

  const id = optionalString(formData.get('id'));
  // Empty means the whole practice; a staff id makes it one person's leave.
  const staffUserId = optionalString(formData.get('staffUserId'));
  const data = { from: fromDate, to: toDate, reason, staffUserId };

  // Somebody is already booked in the days being closed.
  //
  // The closure used to be accepted in silence, and those appointments became
  // invisible-but-real: the calendar draws the day as shut, free-gap search
  // returns nothing, and the patients still turn up. Reported rather than
  // refused — declaring the August shutdown before moving the bookings is a
  // perfectly normal order to do things in — but it must be said out loud.
  if (requiredString(formData.get('force')) !== '1') {
    const clashes = await prisma.appointment.findMany({
      where: {
        date: { gte: fromDate, lte: toDate },
        status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.ARRIVED] },
        // One person's leave only clashes with that person's own list.
        ...(staffUserId ? { staffUserId } : {}),
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      take: 5,
      select: {
        date: true,
        startTime: true,
        patient: { select: { firstName: true, lastName: true } },
      },
    });

    if (clashes.length > 0) {
      const list = clashes
        .map(
          (a) =>
            `${toDateKey(a.date)} ${a.startTime} ${a.patient.lastName} ${a.patient.firstName}`,
        )
        .join(', ');
      return actionError(t('closureClash', { list }), 'bookedOver');
    }
  }

  try {
    if (id) {
      await prisma.closure.update({ where: { id }, data });
    } else {
      await prisma.closure.create({ data });
    }
  } catch {
    return actionError(t('generic'));
  }

  await recordAudit(user, {
    action: id ? 'update' : 'create',
    entity: 'settings',
    entityId: id,
    summary: `${reason} · ${from}${from === to ? '' : ` → ${to}`}`,
  });

  revalidateAll();
  return actionOk();
}

export async function saveOperatory(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getTranslations('errors');

  const user = await authorize('settings.edit');
  if (!user) return actionError(t('forbidden'));

  const id = optionalString(formData.get('id'));
  const name = requiredString(formData.get('name'));
  if (!name) return actionError(t('fillRequired'));

  try {
    if (id) {
      await prisma.operatory.update({ where: { id }, data: { name } });
    } else {
      await prisma.operatory.create({ data: { name } });
    }
  } catch {
    return actionError(t('generic'));
  }

  await recordAudit(user, {
    action: id ? 'update' : 'create',
    entity: 'settings',
    entityId: id,
    summary: `Chair · ${name}`,
  });

  revalidateAll();

  // Naming a chair is done on a page of its own, so there is nowhere for the
  // form to return to — and "save and add another" comes straight back here,
  // because the chairs are named in one sitting. A rename is submitted from a
  // dialog on the settings screen, so it stays put.
  if (!id) {
    const again = requiredString(formData.get('again')) === '1';
    redirect({
      href: again ? '/settings/operatories/new' : '/settings',
      locale: await getLocale(),
    });
  }

  return actionOk();
}

/**
 * Chairs are retired, never deleted — appointments point at them, and a room
 * that stops existing would take last year's schedule with it.
 */
export async function setOperatoryActive(formData: FormData): Promise<void> {
  const user = await authorize('settings.edit');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  if (!id) return;

  const active = requiredString(formData.get('active')) === '1';
  const operatory = await prisma.operatory.update({ where: { id }, data: { active } });

  await recordAudit(user, {
    action: 'update',
    entity: 'settings',
    entityId: id,
    summary: `Chair · ${operatory.name} → ${active ? 'active' : 'retired'}`,
  });
  revalidateAll();
}

export async function deleteClosure(formData: FormData): Promise<void> {
  const user = await authorize('settings.edit');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  if (!id) return;

  const closure = await prisma.closure.findUnique({ where: { id } });
  if (!closure) return;

  await prisma.closure.delete({ where: { id } });
  await recordAudit(user, {
    action: 'delete',
    entity: 'settings',
    entityId: id,
    summary: `${closure.reason} · ${toDateKey(closure.from)}`,
  });
  revalidateAll();
}

/**
 * Which numbering the chart shows. Storage is always FDI — this only changes
 * the labels, so switching it can never renumber a patient's teeth.
 */
export async function saveClinicProfile(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations('errors');

  const user = await authorize('settings.edit');
  if (!user) return actionError(t('forbidden'));

  const raw = requiredString(formData.get('toothNumbering'));
  const toothNumbering = raw in ToothNumbering ? (raw as ToothNumbering) : ToothNumbering.FDI;
  const name = optionalString(formData.get('name')) ?? '';

  // Three letters is the whole of ISO 4217, and `Intl.NumberFormat` throws on
  // anything else — a typo here would take down every page that shows a price.
  const rawCurrency = (optionalString(formData.get('currency')) ?? '').toUpperCase();
  if (rawCurrency && !/^[A-Z]{3}$/.test(rawCurrency)) return actionError(t('invalidCurrency'));
  const currency = rawCurrency || 'ALL';

  // The letterhead. Unvalidated on purpose beyond being trimmed to null: this is
  // what the practice wants printed at the top of its own paper, and a phone
  // number in this country is written half a dozen defensible ways. `null`
  // rather than `''` so a cleared field is omitted from the header rather than
  // printing an empty separator — see `SheetHead`.
  const phone = optionalString(formData.get('phone')) ?? null;
  const email = optionalString(formData.get('email')) ?? null;
  const address = optionalString(formData.get('address')) ?? null;

  try {
    await prisma.clinicProfile.upsert({
      where: { id: 'clinic' },
      create: { name, toothNumbering, currency, phone, email, address },
      update: { name, toothNumbering, currency, phone, email, address },
    });
  } catch {
    return actionError(t('generic'));
  }

  await recordAudit(user, {
    action: 'update',
    entity: 'settings',
    summary: `Chart numbering → ${toothNumbering}`,
  });

  revalidateAll();
  return actionOk();
}

/**
 * Cut every calendar subscription this person has ever handed out.
 *
 * The feed URL is the one credential in the app that leaves the building and
 * stays out: it sits in a phone's settings for years, it carries no session, and
 * anyone holding it can read that dentist's diary. Until now the only way to
 * take one back was rotating `AUTH_SECRET`, which signs out the whole practice
 * and kills every outstanding confirmation link as well — a remedy so blunt
 * nobody would reach for it, which in effect meant a leaked link was permanent.
 *
 * Deliberately self-service and ungated beyond being signed in. It is *your*
 * diary and *your* lost phone, and a receptionist should not have to find the
 * owner to close their own link. Nobody can revoke anyone else's: the id comes
 * from the session, never from the form.
 */
export async function regenerateCalendarFeed(): Promise<void> {
  const user = await requireUser();

  await prisma.staffUser.update({
    where: { id: user.id },
    data: { calendarFeedVersion: { increment: 1 } },
  });

  await recordAudit(user, {
    action: 'update',
    entity: 'settings',
    entityId: user.id,
    summary: 'Calendar feed link regenerated — every previous link revoked',
  });

  revalidateAll();
}
