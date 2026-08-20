'use client';

import { Pencil, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import type { ServiceOption } from '@/components/appointments/AppointmentFormDialog';
import { ToothPicker, type ChartedTeeth } from '@/components/dental/ToothPicker';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { FormDialog } from '@/components/ui/FormDialog';
import { saveStep } from '@/lib/actions/plans';
import { byDepartment } from '@/lib/catalog';
import type { ToothNumbering } from '@/lib/teeth';

export type StepDefaults = {
  id: string;
  title: string;
  toothNum: number | null;
  notes: string;
};

export function StepFormDialog({
  planId,
  step,
  services = [],
  charted = {},
  numbering = 'FDI',
  triggerClassName = 'btn btn-ghost btn-sm',
}: {
  planId: string;
  step?: StepDefaults;
  /** The catalogue, so the usual answer is a tap rather than a sentence. */
  services?: ServiceOption[];
  charted?: ChartedTeeth;
  numbering?: ToothNumbering;
  /**
   * How the trigger is dressed. Ghost inside a plan's own step list, where it
   * sits under the steps and should not compete with them; solid on the
   * practice-wide list, where it is one of only two controls on the card.
   */
  triggerClassName?: string;
}) {
  const t = useTranslations('plans');
  const tc = useTranslations('common');
  const tt = useTranslations('teeth');
  const uid = useId();
  const editing = Boolean(step);

  const [title, setTitle] = useState(step?.title ?? '');
  const [toothNum, setToothNum] = useState<number | null>(step?.toothNum ?? null);

  return (
    <FormDialog
      key={step?.id ?? 'new'}
      action={saveStep}
      resetOnSuccess={!editing}
      onClose={() => {
        setTitle(step?.title ?? '');
        setToothNum(step?.toothNum ?? null);
      }}
      title={editing ? t('editStep') : t('addStep')}
      submitLabel={tc('save')}
      pendingLabel={tc('saving')}
      cancelLabel={tc('cancel')}
      closeLabel={tc('close')}
      triggerTitle={editing ? t('editStep') : t('addStep')}
      triggerClassName={triggerClassName}
      trigger={
        editing ? (
          <>
            <Pencil size={16} aria-hidden />
            <span className="sr-only">{t('editStep')}</span>
          </>
        ) : (
          <>
            <Plus size={17} aria-hidden />
            {t('addStep')}
          </>
        )
      }
    >
      <input type="hidden" name="planId" value={planId} />
      {step ? <input type="hidden" name="id" value={step.id} /> : null}
      <input type="hidden" name="toothNum" value={toothNum ?? ''} />

      <TextField
        id={`${uid}-title`}
        name="title"
        label={t('stepTitle')}
        required
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />

      {/* One tap fills the field above. It stays editable, because "composite
          filling, deep" is a legitimate thing to write and the catalogue cannot
          hold every variation of every treatment. */}
      {services.length > 0 ? (
        <div className="space-y-2.5">
          {byDepartment(services).map(({ department, items }) => (
            <div key={department || 'none'}>
              <p className="mb-1 text-[0.78rem] font-bold tracking-wide text-ink-faint uppercase">
                {department || tc('category')}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {items.map((service) => (
                  <button
                    key={service.id}
                    type="button"
                    aria-pressed={title === service.name}
                    onClick={() => setTitle(service.name)}
                    className={
                      title === service.name
                        ? 'rounded-full border border-brand-dark bg-brand-dark px-3 py-1.5 text-[0.88rem] font-semibold text-white'
                        : 'rounded-full border border-line-strong bg-surface px-3 py-1.5 text-[0.88rem] font-semibold text-ink-soft transition-colors hover:border-brand-dark hover:bg-brand-soft hover:text-brand-deep'
                    }
                  >
                    {service.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

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
        rows={3}
        defaultValue={step?.notes}
      />
    </FormDialog>
  );
}
