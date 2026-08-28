'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { AppointmentRequestStatus } from '@/generated/prisma/enums';
import { authorize, recordAudit } from '@/lib/auth/guard';
import { deleteStoredFile } from '@/lib/files';
import { prisma } from '@/lib/prisma';
import { optionalString, requiredString } from '@/lib/utils';
import { actionError, actionOk, type ActionState } from './types';

/**
 * The desk's half of the public request form.
 *
 * Kept in its own file, away from `actions/site.ts`, on purpose. That one is the
 * single unauthenticated write in the application and it opens with a rate limit
 * where every other action opens with `authorize`; putting a guarded action
 * beside it invites somebody to copy the wrong neighbour. One file is public and
 * says so at the top, this one is not.
 *
 * `request.edit` rather than `appointment.edit`: reading a stranger's name,
 * number and description of what is wrong with them is correspondence, not
 * scheduling, and the permission matrix should be able to tell the two apart
 * even though today the same three roles hold both.
 */

function revalidateAll() {
  revalidatePath('/', 'layout');
}

/** Picked up, dealt with, or put back — the three moves the list supports. */
export async function setRequestStatus(formData: FormData): Promise<void> {
  const user = await authorize('request.edit');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  const status = requiredString(formData.get('status'));
  if (!id || !(status in AppointmentRequestStatus)) return;

  const next = status as AppointmentRequestStatus;

  const request = await prisma.appointmentRequest.update({
    where: { id },
    data: {
      status: next,
      // Who dealt with it and when, cleared if it goes back on the list. A name
      // left against a request that is open again would say somebody had
      // answered it when nobody has.
      handledAt: next === AppointmentRequestStatus.NEW ? null : new Date(),
      handledById: next === AppointmentRequestStatus.NEW ? null : user.id,
    },
    select: { name: true },
  });

  await recordAudit(user, {
    action: 'update',
    entity: 'appointmentRequest',
    entityId: id,
    summary: `${request.name} → ${next.toLowerCase()}`,
  });
  revalidateAll();
}

/** What the desk wrote after ringing back. */
export async function saveRequestNote(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations('errors');

  const user = await authorize('request.edit');
  if (!user) return actionError(t('forbidden'));

  const id = requiredString(formData.get('id'));
  if (!id) return actionError(t('fillRequired'));

  const request = await prisma.appointmentRequest.update({
    where: { id },
    data: { staffNote: optionalString(formData.get('staffNote')) },
    select: { name: true },
  });

  await recordAudit(user, {
    action: 'update',
    entity: 'appointmentRequest',
    entityId: id,
    // Deliberately not the note itself. The trail records that somebody wrote
    // one; what they wrote is on the record, where it can be corrected.
    summary: `${request.name} · note`,
  });
  revalidateAll();
  return actionOk();
}

/**
 * Remove a file a stranger attached, once the desk is finished with it.
 *
 * The only lever the practice has over bytes it did not upload, and the reason
 * it exists: `AppointmentRequestAttachment` is the one table here written by
 * somebody with no account, so without this the storage directory only ever
 * grows and nothing but a database console can prune it.
 *
 * `request.edit` rather than `document.delete`. This is not a medical record —
 * it is what somebody emailed in, in effect, before they were a patient. If the
 * practice wants to keep it, it goes on a chart as a `PatientDocument` with a
 * name against the decision, and *that* copy is the one the stricter permission
 * guards.
 *
 * The bytes go with the row, and in that order: a row deleted without its file
 * leaves an orphan for the weekly sweeper, where a file deleted without its row
 * leaves the desk a link that 404s.
 */
export async function deleteRequestAttachment(formData: FormData): Promise<void> {
  const user = await authorize('request.edit');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  if (!id) return;

  const attachment = await prisma.appointmentRequestAttachment.findUnique({
    where: { id },
    select: { fileName: true, storageKey: true, requestId: true },
  });
  if (!attachment) return;

  await prisma.appointmentRequestAttachment.delete({ where: { id } });
  await deleteStoredFile(attachment.storageKey);

  await recordAudit(user, {
    action: 'delete',
    entity: 'appointmentRequest',
    entityId: attachment.requestId,
    summary: `Deleted the file ${attachment.fileName}`,
  });
  revalidateAll();
}
