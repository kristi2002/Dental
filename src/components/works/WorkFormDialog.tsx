'use client';

import { Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { FormDialog } from '@/components/ui/FormDialog';
import { UrgentToggle } from '@/components/ui/UrgentToggle';
import { WorkLinesField, type LineDraft } from '@/components/works/WorkLinesField';
import { saveWork } from '@/lib/actions/works';

export type WorkDefaults = {
  id: string;
  labSerial: string;
  patientId: string;
  patientName: string;
  phone: string;
  diagnosis: string;
  notes: string;
  /** `YYYY-MM-DD`, for the date input. */
  sentAt: string;
  /** `YYYY-MM-DD`, or empty for a case with no promise attached. */
  dueAt: string;
  /** `YYYY-MM-DD`, or empty while the case is still out. */
  receivedAt: string;
  urgent: boolean;
  lines: Array<{
    elements: number;
    procedure: string;
    lab: string;
    /** Empty on a line written before laboratories were rows. */
    labId: string;
    teeth: string;
  }>;
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
export function WorkFormDialog({
  work,
  labs = [],
  procedures = [],
  triggerClassName = 'btn btn-secondary btn-sm',
  compact = false,
}: {
  work: WorkDefaults;
  /** The catalogue of laboratories the line picker offers. */
  labs?: Array<{ id: string; name: string }>;
  procedures?: string[];
  triggerClassName?: string;
  /** Icon-only trigger, for a row that has no width to spare for the word. */
  compact?: boolean;
}) {
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
      triggerClassName={triggerClassName}
      trigger={
        <>
          <Pencil size={17} aria-hidden className="shrink-0" />
          <span className={compact ? 'sr-only' : undefined}>{tc('edit')}</span>
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

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id={`${uid}-labSerial`}
          name="labSerial"
          label={t('labSerial')}
          optional={tc('optional')}
          defaultValue={work.labSerial}
        />
        <TextField
          id={`${uid}-sentAt`}
          name="sentAt"
          type="date"
          label={t('sentAt')}
          required
          defaultValue={work.sentAt}
        />
      </div>

      {/* Only on a case written before the chart existed. Shown rather than
          edited, and deliberately not posted back: the span is picked per row
          now, and this is the one copy of what the old text box was told. It
          stays on the row until somebody presses the teeth for these lines. */}
      {work.diagnosis ? (
        <div>
          <p className="field-label">{t('teethLegacy')}</p>
          <p className="rounded-lg border border-line bg-paper px-3.5 py-2 text-[1rem] text-ink tabular-nums">
            {work.diagnosis}
          </p>
        </div>
      ) : null}

      {/* The two dates the register is chased on. Both optional and both
          meaningful when empty: no promise from the laboratory, and not back
          yet. The row's own tick button is the usual way the second one gets
          filled — this is here for the case that came back last Tuesday and
          nobody marked. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id={`${uid}-dueAt`}
          name="dueAt"
          type="date"
          label={t('dueAt')}
          hint={t('dueAtHint')}
          optional={tc('optional')}
          defaultValue={work.dueAt}
        />
        <TextField
          id={`${uid}-receivedAt`}
          name="receivedAt"
          type="date"
          label={t('receivedAt')}
          hint={t('receivedAtHint')}
          optional={tc('optional')}
          defaultValue={work.receivedAt}
        />
      </div>

      <UrgentToggle
        name="urgent"
        defaultChecked={work.urgent}
        label={t('urgent')}
        hint={t('urgentHint')}
      />

      <fieldset>
        <legend className="field-label">{t('lines')}</legend>
        <WorkLinesField value={lines} onChange={setLines} labs={labs} procedures={procedures} />
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
