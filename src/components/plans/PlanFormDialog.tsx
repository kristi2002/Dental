'use client';

import { GripVertical, ListChecks, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useRef, useState } from 'react';
import type { ServiceOption } from '@/components/appointments/AppointmentFormDialog';
import { ToothPicker, type ChartedTeeth } from '@/components/dental/ToothPicker';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { FormDialog } from '@/components/ui/FormDialog';
import { TreatmentPlanStatus } from '@/generated/prisma/enums';
import { savePlan } from '@/lib/actions/plans';
import { byDepartment } from '@/lib/catalog';
import {
  formatSurfaces,
  isToothStatus,
  toothLabel as toothLabelFor,
  type ToothNumbering,
} from '@/lib/teeth';
import { cn } from '@/lib/utils';

export type PlanDefaults = {
  id: string;
  title: string;
  notes: string;
  status: TreatmentPlanStatus;
};

const STATUSES = [
  TreatmentPlanStatus.ACTIVE,
  TreatmentPlanStatus.COMPLETED,
  TreatmentPlanStatus.CANCELLED,
] as const;

/** The statuses that are a reason to plan work. A healthy tooth is not. */
const NEEDS_WORK = new Set(['CARIES', 'FILLED', 'CROWN', 'ROOT_CANAL', 'IMPLANT']);

type DraftStep = { key: string; title: string; toothNum: number | null };

/**
 * A course of treatment, built rather than typed.
 *
 * The old dialog asked for the steps as a textarea, one per line, and the tooth
 * each step was for was not asked at all — it had to be added afterwards, one
 * dialog per step, as a number between 11 and 48. So the fastest path was to
 * type "Filling 16" as prose, which the plan then could not book, could not tie
 * to a tooth, and could not tell apart from any other filling.
 *
 * Now the steps come from two places the app already knows about: the treatments
 * this practice actually offers, and the findings already on this patient's
 * chart. A plan for the caries on 16 is one press, and it arrives with the tooth
 * attached.
 */
export function PlanFormDialog({
  patientId,
  plan,
  services = [],
  charted = {},
  numbering = 'FDI',
  titles = [],
}: {
  patientId: string;
  plan?: PlanDefaults;
  /** The catalogue, offered as one-tap steps. */
  services?: ServiceOption[];
  /** This patient's chart, for the suggested steps and the tooth picker. */
  charted?: ChartedTeeth;
  numbering?: ToothNumbering;
  /** Plan names already used, so a practice's own wording keeps repeating. */
  titles?: string[];
}) {
  const t = useTranslations('plans');
  const tc = useTranslations('common');
  const tt = useTranslations('teeth');
  const uid = useId();
  const editing = Boolean(plan);

  const [steps, setSteps] = useState<DraftStep[]>([]);
  const [custom, setCustom] = useState('');
  const [openTooth, setOpenTooth] = useState<string | null>(null);
  // A ref, not state: two chips tapped in the same React batch would both read
  // the same rendered counter and be given the same key, and every edit to one
  // of them — setting the tooth, removing it — would then hit both.
  const seq = useRef(0);

  function addStep(title: string, toothNum: number | null = null) {
    const clean = title.trim();
    if (!clean) return;
    seq.current += 1;
    const key = `${uid}-${seq.current}`;
    setSteps((current) => [...current, { key, title: clean, toothNum }]);
  }

  function reset() {
    setSteps([]);
    setCustom('');
    setOpenTooth(null);
    seq.current = 0;
  }

  // Every tooth on the chart that is not healthy, worst first by the order the
  // statuses are listed in. These are the reasons a plan gets written, so they
  // are offered before the catalogue is.
  const findings = Object.entries(charted)
    .map(([num, record]) => ({ toothNum: Number(num), ...record }))
    .filter((finding) => isToothStatus(finding.status) && NEEDS_WORK.has(finding.status))
    .sort((a, b) => a.toothNum - b.toothNum);

  const label = (toothNum: number) => toothLabelFor(toothNum, numbering);

  return (
    <FormDialog
      key={plan?.id ?? 'new'}
      action={savePlan}
      resetOnSuccess={!editing}
      onClose={reset}
      wide={!editing}
      title={editing ? t('edit') : t('new')}
      submitLabel={tc('save')}
      pendingLabel={tc('saving')}
      cancelLabel={tc('cancel')}
      closeLabel={tc('close')}
      triggerTitle={editing ? t('edit') : t('new')}
      triggerClassName={editing ? 'btn btn-secondary btn-sm' : 'btn btn-primary btn-sm'}
      trigger={
        editing ? (
          <>
            <Pencil size={17} aria-hidden />
            <span className="sr-only">{t('edit')}</span>
          </>
        ) : (
          <>
            <ListChecks size={18} aria-hidden />
            {t('new')}
          </>
        )
      }
    >
      <input type="hidden" name="patientId" value={patientId} />
      {plan ? <input type="hidden" name="id" value={plan.id} /> : null}
      {editing ? null : (
        <input
          type="hidden"
          name="steps"
          value={JSON.stringify(
            steps.map((step) => ({ title: step.title, toothNum: step.toothNum })),
          )}
        />
      )}

      <TextField
        id={`${uid}-title`}
        name="title"
        label={t('title_')}
        hint={t('titleHint')}
        required
        list={`${uid}-titles`}
        defaultValue={plan?.title}
      />
      <datalist id={`${uid}-titles`}>
        {titles.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>

      {editing ? (
        <SelectField
          id={`${uid}-status`}
          name="status"
          label={t('status')}
          defaultValue={plan?.status}
        >
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {t(`status_${status}`)}
            </option>
          ))}
        </SelectField>
      ) : (
        <>
          {/* What the chart already says is wrong. Tapping one writes the step
              *and* attaches the tooth and its surfaces, which is the part a
              typed list could never carry. */}
          {findings.length > 0 ? (
            <fieldset>
              <legend className="field-label flex items-center gap-1.5">
                <Sparkles size={16} aria-hidden className="text-accent-dark" />
                {t('fromChart')}
              </legend>
              <p className="mb-1.5 text-[0.9rem] text-ink-soft">{t('fromChartHint')}</p>
              <div className="flex flex-wrap gap-2">
                {findings.map((finding) => {
                  const surfaces = formatSurfaces(finding.surfaces);
                  return (
                    <button
                      key={finding.toothNum}
                      type="button"
                      onClick={() =>
                        addStep(
                          `${tt(`status_${finding.status}`)}${surfaces ? ` ${surfaces}` : ''}`,
                          finding.toothNum,
                        )
                      }
                      className="flex items-center gap-1.5 rounded-full border border-accent bg-accent-soft px-3 py-1.5 text-[0.9rem] font-semibold text-ink transition-colors hover:border-accent-dark hover:bg-accent"
                    >
                      <Plus size={15} aria-hidden />
                      {tt('tooth', { num: label(finding.toothNum) })} ·{' '}
                      {tt(`status_${finding.status}`)}
                      {surfaces ? ` ${surfaces}` : ''}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ) : null}

          {/* The catalogue, split by department — the same grouping the booking
              and visit forms use, so a treatment is always in the same place. */}
          {services.length > 0 ? (
            <fieldset>
              <legend className="field-label">{t('fromCatalog')}</legend>
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
                          onClick={() => addStep(service.name)}
                          className="rounded-full border border-line-strong bg-surface px-3 py-1.5 text-[0.88rem] font-semibold text-ink-soft transition-colors hover:border-brand-dark hover:bg-brand-soft hover:text-brand-deep"
                        >
                          {service.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </fieldset>
          ) : null}

          {/* Anything the catalogue does not cover. Still available, just no
              longer the only way in. */}
          <div>
            <label className="field-label" htmlFor={`${uid}-custom`}>
              {t('customStep')}
            </label>
            <div className="flex gap-2">
              <input
                id={`${uid}-custom`}
                className="field-input"
                value={custom}
                placeholder={t('customStepHint')}
                onChange={(event) => setCustom(event.target.value)}
                onKeyDown={(event) => {
                  // Enter inside a dialog would submit the whole form and save a
                  // plan with the step still sitting in the box.
                  if (event.key !== 'Enter') return;
                  event.preventDefault();
                  addStep(custom);
                  setCustom('');
                }}
              />
              <button
                type="button"
                className="btn btn-secondary shrink-0"
                onClick={() => {
                  addStep(custom);
                  setCustom('');
                }}
              >
                <Plus size={18} aria-hidden />
                {tc('add')}
              </button>
            </div>
          </div>

          {/* The plan as it stands. Order is the sequence of treatment, so the
              rows move rather than being re-typed. */}
          <div>
            <p className="field-label">{t('steps')}</p>
            {steps.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line-strong px-3.5 py-4 text-center text-[0.95rem] text-ink-faint">
                {t('noStepsYet')}
              </p>
            ) : (
              <ol className="space-y-1.5">
                {steps.map((step, index) => (
                  <li
                    key={step.key}
                    className="rounded-lg border border-line-strong bg-surface px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        aria-hidden
                        className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-soft text-[0.78rem] font-bold text-brand-deep"
                      >
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[1rem] font-semibold text-ink">
                        {step.title}
                      </span>

                      <button
                        type="button"
                        aria-expanded={openTooth === step.key}
                        onClick={() =>
                          setOpenTooth((open) => (open === step.key ? null : step.key))
                        }
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-[0.85rem] font-semibold transition-colors',
                          step.toothNum
                            ? 'border-brand-dark bg-brand-soft text-brand-deep'
                            : 'border-line-strong text-ink-soft hover:border-ink hover:text-ink',
                        )}
                      >
                        {step.toothNum
                          ? tt('tooth', { num: label(step.toothNum) })
                          : t('pickTooth')}
                      </button>

                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        title={t('moveUp')}
                        disabled={index === 0}
                        onClick={() =>
                          setSteps((current) => {
                            const next = [...current];
                            [next[index - 1], next[index]] = [next[index], next[index - 1]];
                            return next;
                          })
                        }
                      >
                        <GripVertical size={15} aria-hidden className="rotate-90" />
                        <span className="sr-only">{t('moveUp')}</span>
                      </button>

                      <button
                        type="button"
                        className="btn btn-ghost btn-sm text-danger"
                        title={tc('delete')}
                        onClick={() =>
                          setSteps((current) => current.filter((row) => row.key !== step.key))
                        }
                      >
                        <Trash2 size={15} aria-hidden />
                        <span className="sr-only">{tc('delete')}</span>
                      </button>
                    </div>

                    {openTooth === step.key ? (
                      <div className="mt-2 border-t border-line pt-2">
                        <ToothPicker
                          value={step.toothNum}
                          charted={charted}
                          numbering={numbering}
                          onChange={(toothNum) => {
                            setSteps((current) =>
                              current.map((row) =>
                                row.key === step.key ? { ...row, toothNum } : row,
                              ),
                            );
                            setOpenTooth(null);
                          }}
                        />
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm mt-1"
                          onClick={() => setOpenTooth(null)}
                        >
                          <X size={15} aria-hidden />
                          {tc('close')}
                        </button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </>
      )}

      <TextAreaField
        id={`${uid}-notes`}
        name="notes"
        label={tc('notes')}
        optional={tc('optional')}
        rows={3}
        defaultValue={plan?.notes}
      />
    </FormDialog>
  );
}
