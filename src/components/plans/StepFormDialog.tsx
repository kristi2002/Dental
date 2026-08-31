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
  /** The catalogue entry behind the title, when there is one. */
  serviceId: string | null;
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
  /** Full class list for the trigger — `menu-item` when it sits in an overflow. */
  triggerClassName?: string;
}) {
  const t = useTranslations('plans');
  const tc = useTranslations('common');
  const tt = useTranslations('teeth');
  const uid = useId();
  const editing = Boolean(step);

  const [title, setTitle] = useState(step?.title ?? '');
  const [toothNum, setToothNum] = useState<number | null>(step?.toothNum ?? null);
  // Which catalogue entry this step plans, when it came from one. Tracked
  // separately from the title because the title stays editable — "composite
  // filling, deep" is still that treatment — and it is the id, not the wording,
  // that tells a booking how long to leave in the diary.
  const [serviceId, setServiceId] = useState<string | null>(step?.serviceId ?? null);

  return (
    <FormDialog
      key={step?.id ?? 'new'}
      action={saveStep}
      resetOnSuccess={!editing}
      onClose={() => {
        setTitle(step?.title ?? '');
        setToothNum(step?.toothNum ?? null);
        setServiceId(step?.serviceId ?? null);
      }}
      title={editing ? t('editStep') : t('addStep')}
      submitLabel={tc('save')}
      pendingLabel={tc('saving')}
      cancelLabel={tc('cancel')}
      discardMessage={tc('discardUnsaved')}
      closeLabel={tc('close')}
      triggerTitle={editing ? t('editStep') : t('addStep')}
      triggerClassName={triggerClassName}
      trigger={
        editing ? (
          <>
            <Pencil size={16} aria-hidden />
            <span className={triggerClassName === 'menu-item' ? '' : 'sr-only'}>
              {t('editStep')}
            </span>
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
      <input type="hidden" name="serviceId" value={serviceId ?? ''} />

      <TextField
        id={`${uid}-title`}
        name="title"
        label={t('stepTitle')}
        required
        value={title}
        onChange={(event) => {
          setTitle(event.target.value);
          // Typed over rather than picked: whatever chip was tapped no longer
          // describes this step, and a stale id would hand the booking form the
          // wrong length.
          if (event.target.value !== step?.title) setServiceId(null);
        }}
      />

      {/* One tap fills the field above. It stays editable, because "composite
          filling, deep" is a legitimate thing to write and the catalogue cannot
          hold every variation of every treatment. */}
      {services.length > 0 ? (
        <div className="space-y-2.5">
          {byDepartment(services).map(({ department, items }) => (
            <div key={department || 'none'}>
              <p className="mb-1 text-caption font-bold tracking-wide text-ink-faint uppercase">
                {department || tc('category')}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {items.map((service) => (
                  <button
                    key={service.id}
                    type="button"
                    aria-pressed={serviceId === service.id}
                    onClick={() => {
                      setTitle(service.name);
                      setServiceId(service.id);
                    }}
                    className={
                      serviceId === service.id
                        ? 'rounded-full border border-brand-dark bg-brand-dark px-3 py-1.5 text-meta font-semibold text-white'
                        : 'rounded-full border border-line-strong bg-surface px-3 py-1.5 text-meta font-semibold text-ink-soft transition-colors hover:border-brand-dark hover:bg-brand-soft hover:text-brand-deep'
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
