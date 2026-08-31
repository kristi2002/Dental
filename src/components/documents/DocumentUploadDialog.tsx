'use client';

import { Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { ToothPicker, type ChartedTeeth } from '@/components/dental/ToothPicker';
import { SelectField, TextAreaField } from '@/components/ui/Field';
import { FormDialog } from '@/components/ui/FormDialog';
import { DocumentKind } from '@/generated/prisma/enums';
import { uploadDocument } from '@/lib/actions/documents';
import { ALLOWED_MIME_TYPES, MAX_FILE_BYTES } from '@/lib/file-constants';
import type { ToothNumbering } from '@/lib/teeth';

const KINDS = [
  DocumentKind.XRAY,
  DocumentKind.PHOTO,
  DocumentKind.CONSENT,
  DocumentKind.OTHER,
] as const;

export function DocumentUploadDialog({
  patientId,
  charted = {},
  numbering = 'FDI',
}: {
  patientId: string;
  /** The patient's chart, so the x-ray is filed against a tooth by pointing. */
  charted?: ChartedTeeth;
  numbering?: ToothNumbering;
}) {
  const t = useTranslations('documents');
  const tc = useTranslations('common');
  const tt = useTranslations('teeth');
  const uid = useId();
  const [toothNum, setToothNum] = useState<number | null>(null);

  return (
    <FormDialog
      action={uploadDocument}
      onClose={() => setToothNum(null)}
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
        <p className="mb-1.5 text-meta text-ink-soft">
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

      {/* Was a number box bounded 1–32, which is the *Universal* range: every
          lower-arch FDI number a European practice actually writes — 31 to 48 —
          was either rejected or silently meant a different tooth. Pointing at it
          cannot be wrong in that way. */}
      <input type="hidden" name="toothNum" value={toothNum ?? ''} />
      <fieldset>
        <legend className="field-label">
          {tt('title')}
          <span className="ml-1.5 font-normal text-ink-faint">({tc('optional')})</span>
        </legend>
        <ToothPicker
          value={toothNum}
          onChange={setToothNum}
          charted={charted}
          numbering={numbering}
        />
      </fieldset>

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
