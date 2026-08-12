'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { LabCaseStatus } from '@/generated/prisma/enums';
import { authorize, recordAudit } from '@/lib/auth/guard';
import { prisma } from '@/lib/prisma';
import { optionalString, requiredString } from '@/lib/utils';
import { actionError, actionOk, type ActionState } from './types';

function revalidateAll() {
  revalidatePath('/', 'layout');
}

function toStatus(value: string): LabCaseStatus {
  return value in LabCaseStatus ? (value as LabCaseStatus) : LabCaseStatus.SENT;
}

/** `YYYY-MM-DD` → UTC midnight, matching every other calendar day in the app. */
function toDay(value: string | null): Date | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : null;
}

/** `HH:mm` on the clinic's own clock, as `ClinicHours` stores its times. */
function toTime(value: string | null): string | null {
  return value && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : null;
}

export async function saveLabCase(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getTranslations('errors');

  const user = await authorize('plan.edit');
  if (!user) return actionError(t('forbidden'));

  const id = optionalString(formData.get('id'));
  const patientId = requiredString(formData.get('patientId'));
  const labName = requiredString(formData.get('labName'));
  const kind = requiredString(formData.get('kind'));
  if (!patientId || !labName || !kind) return actionError(t('fillRequired'));

  const sentAt = toDay(optionalString(formData.get('sentAt')));
  const dueAt = toDay(optionalString(formData.get('dueAt')));
  if (sentAt && dueAt && dueAt < sentAt) return actionError(t('rangeBackwards'));

  const status = toStatus(requiredString(formData.get('status')));

  const data = {
    patientId,
    labName,
    kind,
    teeth: optionalString(formData.get('teeth')),
    notes: optionalString(formData.get('notes')),
    status,
    ...(sentAt ? { sentAt } : {}),
    dueAt,
    // "Received" without a date is the common case — the box is on the desk.
    // Stamping it here means the waiting-on list empties on the same click.
    receivedAt:
      status === LabCaseStatus.RECEIVED || status === LabCaseStatus.FITTED
        ? (toDay(optionalString(formData.get('receivedAt'))) ?? new Date())
        : null,
  };

  try {
    if (id) {
      await prisma.labCase.update({ where: { id }, data });
    } else {
      await prisma.labCase.create({ data: { ...data, createdById: user.id } });
    }
  } catch {
    return actionError(t('generic'));
  }

  await recordAudit(user, {
    action: id ? 'update' : 'create',
    entity: 'lab',
    entityId: id ?? patientId,
    summary: `${kind} · ${labName} → ${status}`,
  });

  revalidateAll();
  return actionOk();
}

/**
 * The order sheet's own save — everything the case knows, from one form.
 *
 * Kept apart from `saveLabCase` rather than folded into it: the dialog creates a
 * case from a patient's tab and only asks the four things needed to get the work
 * out of the door, while this edits one that exists and may set none of them.
 * One action serving both would have to guess which absent field means "leave
 * it" and which means "clear it".
 */
export async function saveLabCaseDetail(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations('errors');

  const user = await authorize('plan.edit');
  if (!user) return actionError(t('forbidden'));

  const id = requiredString(formData.get('id'));
  const labName = requiredString(formData.get('labName'));
  const kind = requiredString(formData.get('kind'));
  if (!id || !labName || !kind) return actionError(t('fillRequired'));

  const sentAt = toDay(optionalString(formData.get('sentAt')));
  const dueAt = toDay(optionalString(formData.get('dueAt')));
  const tryInAt = toDay(optionalString(formData.get('tryInAt')));
  if (sentAt && dueAt && dueAt < sentAt) return actionError(t('rangeBackwards'));
  // A try-in after the work is due is not a try-in — it is the fitting, and
  // booking it that way puts an unnecessary appointment in the diary.
  if (sentAt && tryInAt && tryInAt < sentAt) return actionError(t('rangeBackwards'));

  const deliveryFrom = toTime(optionalString(formData.get('deliveryFrom')));
  const deliveryTo = toTime(optionalString(formData.get('deliveryTo')));
  if (deliveryFrom && deliveryTo && deliveryTo < deliveryFrom) {
    return actionError(t('rangeBackwards'));
  }

  const status = toStatus(requiredString(formData.get('status')));

  // The docket arrives as four index-aligned lists — one entry per line the
  // sheet is showing. Editing lines in the browser and saving the set in one
  // go is what keeps the order sheet a single form; a line that lost its name
  // on the way is dropped rather than saved blank.
  const itemIds = formData.getAll('itemId').map((value) => String(value));
  const itemServiceIds = formData.getAll('itemServiceId').map((value) => String(value));
  const itemNotes = formData.getAll('itemNotes').map((value) => String(value));
  const items = formData
    .getAll('itemName')
    .map((value, index) => ({
      id: itemIds[index] || null,
      name: String(value).trim(),
      serviceId: itemServiceIds[index] || null,
      notes: itemNotes[index]?.trim() || null,
      position: index + 1,
    }))
    .filter((item) => item.name.length > 0);

  try {
    await prisma.$transaction([
      // Lines the sheet no longer shows are gone. Scoped to this case, so a
      // stray id in the form cannot reach another order's docket.
      prisma.labCaseItem.deleteMany({
        where: {
          labCaseId: id,
          id: { notIn: items.map((item) => item.id).filter((value) => value !== null) },
        },
      }),
      ...items.map((item) =>
        item.id
          ? // `updateMany` rather than `update`, for the `labCaseId` in the
            // filter: an id posted from another case's docket must match
            // nothing here rather than quietly rewrite that order's line.
            prisma.labCaseItem.updateMany({
              where: { id: item.id, labCaseId: id },
              data: {
                name: item.name,
                serviceId: item.serviceId,
                notes: item.notes,
                position: item.position,
              },
            })
          : prisma.labCaseItem.create({
              data: {
                labCaseId: id,
                name: item.name,
                serviceId: item.serviceId,
                notes: item.notes,
                position: item.position,
              },
            }),
      ),
    ]);

    await prisma.labCase.update({
      where: { id },
      data: {
        labName,
        kind,
        teeth: optionalString(formData.get('teeth')),
        notes: optionalString(formData.get('notes')),
        careInstructions: optionalString(formData.get('careInstructions')),
        status,
        ...(sentAt ? { sentAt } : {}),
        dueAt,
        tryInAt,
        // A window needs both ends; half of one tells the courier nothing.
        deliveryFrom: deliveryTo ? deliveryFrom : null,
        deliveryTo: deliveryFrom ? deliveryTo : null,
        receivedAt:
          status === LabCaseStatus.RECEIVED || status === LabCaseStatus.FITTED
            ? (toDay(optionalString(formData.get('receivedAt'))) ?? new Date())
            : null,
      },
    });
  } catch {
    return actionError(t('generic'));
  }

  await recordAudit(user, {
    action: 'update',
    entity: 'lab',
    entityId: id,
    summary: `${kind} · ${labName} → ${status}`,
  });

  revalidateAll();
  return actionOk();
}

/** One-tap "it came back", from the waiting-on list. */
export async function markLabCaseReceived(formData: FormData): Promise<void> {
  const user = await authorize('plan.edit');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  if (!id) return;

  const labCase = await prisma.labCase.update({
    where: { id },
    data: { status: LabCaseStatus.RECEIVED, receivedAt: new Date() },
    select: { kind: true, labName: true },
  });

  await recordAudit(user, {
    action: 'update',
    entity: 'lab',
    entityId: id,
    summary: `${labCase.kind} · ${labCase.labName} → RECEIVED`,
  });
  revalidateAll();
}

export async function deleteLabCase(formData: FormData): Promise<void> {
  const user = await authorize('patient.delete');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  if (!id) return;

  const labCase = await prisma.labCase.findUnique({
    where: { id },
    select: { kind: true, labName: true },
  });
  if (!labCase) return;

  await prisma.labCase.delete({ where: { id } });
  await recordAudit(user, {
    action: 'delete',
    entity: 'lab',
    entityId: id,
    summary: `${labCase.kind} · ${labCase.labName}`,
  });
  revalidateAll();
}
