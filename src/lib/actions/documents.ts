'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { DocumentKind } from '@/generated/prisma/enums';
import { authorize, recordAudit } from '@/lib/auth/guard';
import { isAllowedMimeType, MAX_FILE_BYTES } from '@/lib/file-constants';
import { deleteStoredFile, storeFile } from '@/lib/files';
import { prisma } from '@/lib/prisma';
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
        toothNum: toothRaw >= 1 && toothRaw <= 32 ? toothRaw : null,
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
