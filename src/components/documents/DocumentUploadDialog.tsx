'use client';

import { Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { FormDialog } from '@/components/ui/FormDialog';
import { DocumentKind } from '@/generated/prisma/enums';
import { uploadDocument } from '@/lib/actions/documents';
import { ALLOWED_MIME_TYPES, MAX_FILE_BYTES } from '@/lib/file-constants';

const KINDS = [
  DocumentKind.XRAY,
  DocumentKind.PHOTO,
  DocumentKind.CONSENT,
  DocumentKind.OTHER,
] as const;

export function DocumentUploadDialog({ patientId }: { patientId: string }) {
  const t = useTranslations('documents');
  const tc = useTranslations('common');
  const tt = useTranslations('teeth');
  const uid = useId();

  return (
    <FormDialog
      action={uploadDocument}
      title={t('new')}
      submitLabel={t('upload')}
      pendingLabel={t('uploading')}
      cancelLabel={tc('cancel')}
      closeLabel={tc('close')}
      triggerClassName="btn btn-primary btn-sm"
      trigger={
        <>
          <Upload size={18} aria-hidden />
          {t('new')}
        </>
      }
    >
      <input type="hidden" name="patientId" value={patientId} />

      <div>
        <label className="field-label" htmlFor={`${uid}-file`}>
          {t('file')}
        </label>
        <p className="mb-1.5 text-[0.9rem] text-ink-soft">
          {t('fileHint', { max: Math.floor(MAX_FILE_BYTES / (1024 * 1024)) })}
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

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          id={`${uid}-kind`}
          name="kind"
          label={t('kind')}
          defaultValue={DocumentKind.XRAY}
        >
          {KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {t(`kind_${kind}`)}
            </option>
          ))}
        </SelectField>

        <TextField
          id={`${uid}-tooth`}
          name="toothNum"
          type="number"
          min={1}
          max={32}
          label={tt('title')}
          optional={tc('optional')}
        />
      </div>

      <TextAreaField
        id={`${uid}-notes`}
        name="notes"
        label={tc('notes')}
        optional={tc('optional')}
        rows={2}
        defaultValue=""
      />
    </FormDialog>
  );
}
