'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { DocumentKind } from '@/generated/prisma/enums';
import { authorize, recordAudit } from '@/lib/auth/guard';
import { isAllowedMimeType, MAX_FILE_BYTES } from '@/lib/file-constants';
import { deleteStoredFile, storeFile } from '@/lib/files';
import { prisma } from '@/lib/prisma';
import { isValidTooth } from '@/lib/teeth';
import { optionalString, requiredString, toInt } from '@/lib/utils';
import { actionError, actionOk, type ActionState } from './types';

function revalidateAll() {
  revalidatePath('/', 'layout');
}

function toKind(value: string): DocumentKind {
  return value in DocumentKind ? (value as DocumentKind) : DocumentKind.OTHER;
}

export async function uploadDocument(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations('errors');
  const td = await getTranslations('documents');

  const user = await authorize('document.edit');
  if (!user) return actionError(t('forbidden'));

  const patientId = requiredString(formData.get('patientId'));
  const file = formData.get('file');
  if (!patientId || !(file instanceof File) || file.size === 0) {
    return actionError(td('errorNoFile'));
  }

  if (file.size > MAX_FILE_BYTES) {
    return actionError(td('errorTooLarge', { max: Math.floor(MAX_FILE_BYTES / (1024 * 1024)) }));
  }
  if (!isAllowedMimeType(file.type)) {
    return actionError(td('errorType'));
  }

  const toothRaw = toInt(formData.get('toothNum'), 0);

  let storageKey: string;
  try {
    storageKey = await storeFile(new Uint8Array(await file.arrayBuffer()), file.type);
  } catch (error) {
    console.error('[documents] could not store upload', error);
    return actionError(t('generic'));
  }

  try {
    const document = await prisma.patientDocument.create({
      data: {
        patientId,
        kind: toKind(requiredString(formData.get('kind'))),
        // Kept only for display and download; the path on disk is the generated key.
        fileName: file.name.slice(0, 180),
        mimeType: file.type,
        sizeBytes: file.size,
        storageKey,
        toothNum: isValidTooth(toothRaw) ? toothRaw : null,
        notes: optionalString(formData.get('notes')),
        uploadedById: user.id,
      },
      select: { id: true },
    });

    await recordAudit(user, {
      action: 'create',
      entity: 'document',
      entityId: document.id,
      summary: file.name,
    });
  } catch (error) {
    // Do not leave an orphan on disk that no row points at.
    await deleteStoredFile(storageKey);
    console.error('[documents] could not record upload', error);
    return actionError(t('generic'));
  }

  revalidateAll();
  return actionOk();
}

/**
 * The front or the back of an identity card, as one slot rather than as an
 * upload.
 *
 * An ID has exactly two faces and a patient has exactly one ID, so the ordinary
 * upload — which appends — is the wrong verb: photographing the front twice
 * should leave one front, not two. This replaces whatever occupies the slot,
 * bytes included, and is why the details screen can show a card with two sides
 * instead of a file list somebody has to interpret.
 */
export async function saveIdDocument(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations('errors');
  const td = await getTranslations('documents');

  const user = await authorize('document.edit');
  if (!user) return actionError(t('forbidden'));

  const patientId = requiredString(formData.get('patientId'));
  const side = requiredString(formData.get('side'));
  const kind = side === 'BACK' ? DocumentKind.ID_BACK : DocumentKind.ID_FRONT;

  const file = formData.get('file');
  if (!patientId || !(file instanceof File) || file.size === 0) {
    return actionError(td('errorNoFile'));
  }
  if (file.size > MAX_FILE_BYTES) {
    return actionError(td('errorTooLarge', { max: Math.floor(MAX_FILE_BYTES / (1024 * 1024)) }));
  }
  // An ID is looked at, so it has to be an image — a PDF here would render as a
  // grey box in the slot that is meant to *be* the picture.
  if (!file.type.startsWith('image/') || !isAllowedMimeType(file.type)) {
    return actionError(td('errorImageOnly'));
  }

  const previous = await prisma.patientDocument.findMany({
    where: { patientId, kind },
    select: { id: true, storageKey: true },
  });

  let storageKey: string;
  try {
    storageKey = await storeFile(new Uint8Array(await file.arrayBuffer()), file.type);
  } catch (error) {
    console.error('[documents] could not store ID', error);
    return actionError(t('generic'));
  }

  try {
    await prisma.patientDocument.create({
      data: {
        patientId,
        kind,
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
    console.error('[documents] could not record ID', error);
    return actionError(t('generic'));
  }

  // Only once the replacement is safely in: an ID deleted before its successor
  // is stored is an ID the practice no longer holds.
  if (previous.length > 0) {
    await prisma.patientDocument.deleteMany({
      where: { id: { in: previous.map((row) => row.id) } },
    });
    await Promise.all(previous.map((row) => deleteStoredFile(row.storageKey)));
  }

  await recordAudit(user, {
    action: previous.length > 0 ? 'update' : 'create',
    entity: 'document',
    entityId: patientId,
    summary: kind,
  });

  revalidateAll();
  return actionOk();
}

export async function deleteDocument(formData: FormData): Promise<void> {
  const user = await authorize('document.delete');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  if (!id) return;

  const document = await prisma.patientDocument.findUnique({
    where: { id },
    select: { fileName: true, storageKey: true },
  });
  if (!document) return;

  await prisma.patientDocument.delete({ where: { id } });
  await deleteStoredFile(document.storageKey);

  await recordAudit(user, {
    action: 'delete',
    entity: 'document',
    entityId: id,
    summary: document.fileName,
  });
  revalidateAll();
}
