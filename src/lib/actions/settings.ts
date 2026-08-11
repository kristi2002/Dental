'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { ToothNumbering } from '@/generated/prisma/enums';
import { authorize, recordAudit } from '@/lib/auth/guard';
import { DEFAULT_WEEK, rangesFor } from '@/lib/clinic-hours';
import { toDateKey } from '@/lib/dates';
import { prisma } from '@/lib/prisma';
import { optionalString, requiredString } from '@/lib/utils';
import { actionError, actionOk, type ActionState } from './types';

function revalidateAll() {
  revalidatePath('/', 'layout');
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

  if (!reason || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return actionError(t('fillRequired'));
  }

  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T00:00:00.000Z`);
  if (toDate < fromDate) return actionError(t('rangeBackwards'));

  const id = optionalString(formData.get('id'));
  // Empty means the whole practice; a staff id makes it one person's leave.
  const data = {
    from: fromDate,
    to: toDate,
    reason,
    staffUserId: optionalString(formData.get('staffUserId')),
  };

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

  try {
    await prisma.clinicProfile.upsert({
      where: { id: 'clinic' },
      create: { name, toothNumbering },
      update: { name, toothNumbering },
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
