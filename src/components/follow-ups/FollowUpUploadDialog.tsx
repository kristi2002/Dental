'use client';

import { Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { FormDialog } from '@/components/ui/FormDialog';
import { uploadFollowUpAttachment } from '@/lib/actions/follow-ups';
import { ALLOWED_MIME_TYPES, MAX_FILE_BYTES } from '@/lib/file-constants';

/**
 * Pinning a file to a follow-up.
 *
 * Shorter than `DocumentUploadDialog` by everything that makes a document a
 * medical record — no kind, no tooth, no notes of its own. A file here is
 * evidence for the errand in the note above it, and the note is where anything
 * worth saying about it goes.
 */
export function FollowUpUploadDialog({ followUpId }: { followUpId: string }) {
  const t = useTranslations('followUps');
  const td = useTranslations('documents');
  const tc = useTranslations('common');
  const uid = useId();

  return (
    <FormDialog
      action={uploadFollowUpAttachment}
      title={t('attach')}
      submitLabel={td('upload')}
      pendingLabel={td('uploading')}
      cancelLabel={tc('cancel')}
      closeLabel={tc('close')}
      triggerClassName="btn btn-secondary btn-sm"
      trigger={
        <>
          <Upload size={17} aria-hidden />
          {t('attach')}
        </>
      }
    >
      <input type="hidden" name="followUpId" value={followUpId} />

      <div>
        <label className="field-label" htmlFor={`${uid}-file`}>
          {td('file')}
        </label>
        <p className="mb-1.5 text-[0.9rem] text-ink-soft">
          {td('fileHint', { max: Math.floor(MAX_FILE_BYTES / (1024 * 1024)) })}
        </p>
        <input
          id={`${uid}-file`}
          name="file"
          type="file"
          required
          accept={ALLOWED_MIME_TYPES.join(',')}
          className="field-input file:mr-3 file:rounded-md file:border-0 file:bg-brand-soft file:px-3 file:py-1.5 file:font-semibold file:text-brand-deep"
        />
      </div>
    </FormDialog>
  );
}
