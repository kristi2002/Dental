'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { FollowUpPriority } from '@/generated/prisma/enums';
import { authorize, recordAudit } from '@/lib/auth/guard';
import { fromDateKey, today } from '@/lib/dates';
import { isAllowedMimeType, MAX_FILE_BYTES } from '@/lib/file-constants';
import { deleteStoredFile, storeFile } from '@/lib/files';
import { clampNotes, clampTitle, snoozeUntil } from '@/lib/follow-ups';
import { prisma } from '@/lib/prisma';
import { optionalString, requiredString, toInt } from '@/lib/utils';
import { actionError, actionOk, type ActionState } from './types';

/**
 * The whole app, because the bell lives in the layout.
 *
 * Every other register can get away with revalidating its own path; this one
 * cannot. A follow-up written on the works screen changes a count that is drawn
 * on every page, so the layout is what has to be rebuilt — which is also how the
 * badge stays honest without polling anything.
 */
function revalidateAll() {
  revalidatePath('/', 'layout');
}

/**
 * Confirm the record a line says it is about actually exists.
 *
 * The same guard `saveWork` puts on its patient link, for the same reason: the
 * id arrives in a hidden field, and a stale one would otherwise be written
 * straight into a foreign key and fail the insert with a database error instead
 * of a sentence somebody can read.
 */
async function resolveLinks(formData: FormData) {
  const patientId = optionalString(formData.get('patientId'));
  const workId = optionalString(formData.get('workId'));
  const stockItemId = optionalString(formData.get('stockItemId'));

  const [patient, work, stockItem] = await Promise.all([
    patientId
      ? prisma.patient.findUnique({ where: { id: patientId }, select: { id: true } })
      : null,
    workId ? prisma.work.findUnique({ where: { id: workId }, select: { id: true } }) : null,
    stockItemId
      ? prisma.stockItem.findUnique({ where: { id: stockItemId }, select: { id: true } })
      : null,
  ]);

  return {
    patientId: patient?.id ?? null,
    workId: work?.id ?? null,
    stockItemId: stockItem?.id ?? null,
  };
}

/** Write or correct one line of the board. */
export async function saveFollowUp(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations('errors');

  const user = await authorize('followup.edit');
  if (!user) return actionError(t('forbidden'));

  const id = optionalString(formData.get('id'));
  const title = clampTitle(requiredString(formData.get('title')));
  if (!title) return actionError(t('fillRequired'));

  // Whose job it is. Checked like the links are, and quietly dropped if the
  // person has since been deactivated — an unassigned line is still a line, and
  // refusing the save would strand it.
  const assignedToId = optionalString(formData.get('assignedToId'));
  const assignee = assignedToId
    ? await prisma.staffUser.findFirst({
        where: { id: assignedToId, active: true },
        select: { id: true },
      })
    : null;

  const links = await resolveLinks(formData);

  const data = {
    title,
    notes: clampNotes(optionalString(formData.get('notes'))),
    // An empty date box means today: a follow-up somebody is typing right now is
    // nearly always about right now, and a blank that silently became "never"
    // would drop the line out of every list that exists to surface it.
    dueAt: fromDateKey(optionalString(formData.get('dueAt'))),
    priority:
      formData.get('priority') === FollowUpPriority.URGENT
        ? FollowUpPriority.URGENT
        : FollowUpPriority.NORMAL,
    assignedToId: assignee?.id ?? null,
    ...links,
  };

  let savedId = id;
  try {
    if (id) {
      // The links are not rewritten on an edit: what a line is about is decided
      // when it is written, from the screen it was written on. Re-pointing one
      // at a different record is a different errand, and a new line.
      await prisma.followUp.update({
        where: { id },
        data: {
          title: data.title,
          notes: data.notes,
          dueAt: data.dueAt,
          priority: data.priority,
          assignedToId: data.assignedToId,
        },
      });
    } else {
      savedId = (
        await prisma.followUp.create({
          data: { ...data, createdById: user.id },
          select: { id: true },
        })
      ).id;
    }
  } catch {
    return actionError(t('generic'));
  }

  await recordAudit(user, {
    action: id ? 'update' : 'create',
    entity: 'followup',
    entityId: savedId,
    summary: title,
  });

  revalidateAll();
  return actionOk();
}

/**
 * Tick a line off, or put it back.
 *
 * One verb for both directions, and the direction is read from the row rather
 * than posted with the form — two people clearing the board at once should agree
 * on the result instead of undoing each other.
 */
export async function toggleFollowUpDone(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const te = await getTranslations('errors');

  const user = await authorize('followup.edit');
  if (!user) return actionError(te('forbidden'));

  const id = requiredString(formData.get('id'));
  if (!id) return actionError(te('generic'));

  const item = await prisma.followUp.findUnique({
    where: { id },
    select: { title: true, doneAt: true },
  });
  // Gone since the board was drawn — somebody else deleted it. Said out loud
  // rather than returned in silence: this board is worked by four people at
  // once, and a press that reports nothing is a press somebody makes twice.
  if (!item) return actionError(te('gone'));

  const done = item.doneAt === null;

  await prisma.followUp.update({
    where: { id },
    data: { doneAt: done ? new Date() : null, doneById: done ? user.id : null },
  });

  await recordAudit(user, {
    action: 'update',
    entity: 'followup',
    entityId: id,
    summary: `${item.title} — ${done ? 'done' : 'reopened'}`,
  });

  revalidateAll();
  return actionOk();
}

/**
 * Push a line a few days out.
 *
 * Deliberately measured from today rather than from the date the line already
 * carries: something a week overdue that gets snoozed "for a day" is being asked
 * about tomorrow, not about six days ago. Adding to a stale date would leave it
 * overdue after the snooze, which reads as the button having done nothing.
 */
export async function snoozeFollowUp(formData: FormData): Promise<void> {
  const user = await authorize('followup.edit');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  const days = toInt(formData.get('days'), 1);
  if (!id) return;

  const item = await prisma.followUp.findUnique({ where: { id }, select: { title: true } });
  if (!item) return;

  const dueAt = snoozeUntil(days, today());

  await prisma.followUp.update({ where: { id }, data: { dueAt, doneAt: null, doneById: null } });
  await recordAudit(user, {
    action: 'update',
    entity: 'followup',
    entityId: id,
    summary: `${item.title} — snoozed ${days}d`,
  });

  revalidateAll();
}

export async function deleteFollowUp(formData: FormData): Promise<void> {
  const user = await authorize('followup.edit');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  if (!id) return;

  const item = await prisma.followUp.findUnique({
    where: { id },
    // The attachment rows cascade with the line; the bytes they name do not.
    // Read the keys before the delete takes the rows that carry them, or the
    // files are stranded in storage with nothing left pointing at them.
    select: { title: true, attachments: { select: { storageKey: true } } },
  });
  if (!item) return;

  await prisma.followUp.delete({ where: { id } });
  await Promise.all(item.attachments.map((file) => deleteStoredFile(file.storageKey)));

  await recordAudit(user, {
    action: 'delete',
    entity: 'followup',
    entityId: id,
    summary: item.title,
  });

  revalidateAll();
}

/**
 * Pin a photograph, a scan or a PDF to one follow-up.
 *
 * The same shape as `uploadDocument`, and deliberately so — same allowlist, same
 * size ceiling, same generated storage key, same "delete the bytes if the row
 * fails" ordering. What differs is only where it is filed and who may see it:
 * `followup.edit` rather than `document.edit`, because a working note is not a
 * medical record. See `FollowUpAttachment` in the schema for that argument.
 */
export async function uploadFollowUpAttachment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations('errors');
  const td = await getTranslations('documents');

  const user = await authorize('followup.edit');
  if (!user) return actionError(t('forbidden'));

  const followUpId = requiredString(formData.get('followUpId'));
  const file = formData.get('file');
  if (!followUpId || !(file instanceof File) || file.size === 0) {
    return actionError(td('errorNoFile'));
  }

  if (file.size > MAX_FILE_BYTES) {
    return actionError(td('errorTooLarge', { max: Math.floor(MAX_FILE_BYTES / (1024 * 1024)) }));
  }
  if (!isAllowedMimeType(file.type)) {
    return actionError(td('errorType'));
  }

  // Checked before anything is written to disk: an id from a stale page would
  // otherwise leave bytes in storage that no row will ever point at.
  const followUp = await prisma.followUp.findUnique({
    where: { id: followUpId },
    select: { id: true, title: true },
  });
  if (!followUp) return actionError(t('generic'));

  let storageKey: string;
  try {
    storageKey = await storeFile(new Uint8Array(await file.arrayBuffer()), file.type);
  } catch (error) {
    console.error('[follow-ups] could not store attachment', error);
    return actionError(t('generic'));
  }

  try {
    await prisma.followUpAttachment.create({
      data: {
        followUpId: followUp.id,
        fileName: file.name.slice(0, 180),
        mimeType: file.type,
        sizeBytes: file.size,
        storageKey,
        uploadedById: user.id,
      },
      select: { id: true },
    });
  } catch (error) {
    await deleteStoredFile(storageKey);
    console.error('[follow-ups] could not record attachment', error);
    return actionError(t('generic'));
  }

  await recordAudit(user, {
    action: 'create',
    entity: 'followup',
    entityId: followUp.id,
    summary: `${followUp.title} — attached ${file.name}`,
  });

  revalidateAll();
  return actionOk();
}

/**
 * Unpin a file, and take the bytes with it.
 *
 * The row goes first: an orphaned file on disk is a housekeeping problem that
 * `sweep-orphan-files.ts` already exists to mop up, while a row pointing at
 * bytes that are gone is a broken link on the screen every time somebody opens
 * the note.
 */
export async function deleteFollowUpAttachment(formData: FormData): Promise<void> {
  const user = await authorize('followup.edit');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  if (!id) return;

  const attachment = await prisma.followUpAttachment.findUnique({
    where: { id },
    select: { storageKey: true, fileName: true, followUpId: true },
  });
  if (!attachment) return;

  await prisma.followUpAttachment.delete({ where: { id } });
  await deleteStoredFile(attachment.storageKey);

  await recordAudit(user, {
    action: 'delete',
    entity: 'followup',
    entityId: attachment.followUpId,
    summary: `removed ${attachment.fileName}`,
  });

  revalidateAll();
}
