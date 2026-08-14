'use client';

import { Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { FormDialog } from '@/components/ui/FormDialog';
import { WorkLinesField, WorkLinesHeader, type LineDraft } from '@/components/works/WorkLinesField';
import { saveWork } from '@/lib/actions/works';

export type WorkDefaults = {
  id: string;
  labSerial: string;
  patientId: string;
  patientName: string;
  phone: string;
  diagnosis: string;
  notes: string;
  lines: Array<{ elements: string; procedure: string; lab: string }>;
};

/**
 * Correcting a case you are already looking at.
 *
 * Writing one is a page — `/works/new` — because a case is copied off a docket
 * in one sitting. This is the opposite errand and the commonest one on this
 * screen: the lab's serial arrives a week after the impression went out, and it
 * gets typed onto the row it belongs to without losing your place in a register
 * that is hundreds of rows long.
 *
 * The patient link is carried through untouched — it is not shown, because the
 * name and number on this row are the row's own copy and are edited here as
 * text. Re-pointing a case at a different patient is a new case.
 */
export function WorkFormDialog({ work }: { work: WorkDefaults }) {
  const t = useTranslations('works');
  const tc = useTranslations('common');
  const uid = useId();

  const [lines, setLines] = useState<LineDraft[]>(
    work.lines.map((line, index) => ({ ...line, key: `${work.id}-${index}` })),
  );

  return (
    <FormDialog
      key={work.id}
      action={saveWork}
      resetOnSuccess={false}
      wide
      title={t('edit')}
      submitLabel={tc('save')}
      pendingLabel={tc('saving')}
      cancelLabel={tc('cancel')}
      closeLabel={tc('close')}
      triggerTitle={tc('edit')}
      triggerClassName="btn btn-secondary btn-sm"
      trigger={
        <>
          <Pencil size={17} aria-hidden />
          <span className="sr-only">{tc('edit')}</span>
        </>
      }
    >
      <input type="hidden" name="id" value={work.id} />
      <input type="hidden" name="patientId" value={work.patientId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id={`${uid}-patientName`}
          name="patientName"
          label={t('patientName')}
          required
          defaultValue={work.patientName}
        />
        <TextField
          id={`${uid}-phone`}
          name="phone"
          type="tel"
          label={t('phone')}
          required
          defaultValue={work.phone}
        />
      </div>

      <TextField
        id={`${uid}-labSerial`}
        name="labSerial"
        label={t('labSerial')}
        optional={tc('optional')}
        defaultValue={work.labSerial}
      />

      <TextAreaField
        id={`${uid}-diagnosis`}
        name="diagnosis"
        label={t('diagnosis')}
        optional={tc('optional')}
        rows={2}
        defaultValue={work.diagnosis}
      />

      <fieldset>
        <legend className="field-label">{t('lines')}</legend>
        <WorkLinesHeader />
        <WorkLinesField value={lines} onChange={setLines} />
      </fieldset>

      <TextAreaField
        id={`${uid}-notes`}
        name="notes"
        label={tc('notes')}
        optional={tc('optional')}
        rows={2}
        defaultValue={work.notes}
      />
    </FormDialog>
  );
}
