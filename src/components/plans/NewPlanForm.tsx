'use client';

import { GripVertical, ListChecks, Plus, Sparkles, StickyNote, Trash2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useRef, useState } from 'react';
import type { PatientOption, ServiceOption } from '@/components/appointments/AppointmentFormDialog';
import { ToothPicker, type ChartedTeeth } from '@/components/dental/ToothPicker';
import { PatientPicker } from '@/components/patients/PatientPicker';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { FormActions, FormLayout, FormPreview, FormSection } from '@/components/ui/FormPage';
import { savePlan } from '@/lib/actions/plans';
import { byDepartment } from '@/lib/catalog';
import { useRecoveredForm } from '@/lib/form-recovery';
import {
  formatSurfaces,
  isToothStatus,
  toothLabel as toothLabelFor,
  type ToothNumbering,
} from '@/lib/teeth';
import { cn } from '@/lib/utils';

/** The statuses that are a reason to plan work. A healthy tooth is not. */
const NEEDS_WORK = new Set(['CARIES', 'FILLED', 'CROWN', 'ROOT_CANAL', 'IMPLANT']);

type DraftStep = { key: string; title: string; toothNum: number | null };

/**
 * A course of treatment, built rather than typed — and as a screen rather than a
 * dialog.
 *
 * Writing a plan is the most deliberative thing anybody does in this app: the
 * chart is read, the catalogue is browsed, steps are added and reordered and
 * given teeth, and none of it exists anywhere until the save. A modal was the
 * wrong container for that — it scrolled its own little window inside the page,
 * put the chart's findings and the tooth picker into a column too narrow for
 * either, and threw the whole plan away if Escape was pressed. A page can be
 * left and come back to, and linked to from anywhere.
 *
 * Editing stays a dialog — that is a rename or a status change on a plan you are
 * already looking at, and the steps have their own controls on the plan itself.
 */
export function NewPlanForm({
  defaultPatient,
  services = [],
  charted = {},
  numbering = 'FDI',
  titles = [],
}: {
  /**
   * Who the plan is for, when the screen that sent you here already knew — the
   * patient's own plans tab. Left out, the form asks: the practice-wide plans
   * list is the screen somebody is on when they realise a course of treatment
   * was never written down, and sending them off to find the patient first is
   * how the thought gets lost on the way.
   */
  defaultPatient?: PatientOption;
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

  const { state, formAction, formRef } = useRecoveredForm(savePlan);

  const [steps, setSteps] = useState<DraftStep[]>([]);
  const [custom, setCustom] = useState('');
  const [openTooth, setOpenTooth] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  // A ref, not state: two chips tapped in the same React batch would both read
  // the same rendered counter and be given the same key, and every edit to one
  // of them — setting the tooth, removing it — would then hit both.
  const seq = useRef(0);

  function addStep(text: string, toothNum: number | null = null) {
    const clean = text.trim();
    if (!clean) return;
    seq.current += 1;
    setSteps((current) => [...current, { key: `${uid}-${seq.current}`, title: clean, toothNum }]);
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
    <form ref={formRef} action={formAction}>
      <input
        type="hidden"
        name="steps"
        value={JSON.stringify(steps.map((step) => ({ title: step.title, toothNum: step.toothNum })))}
      />

      <FormLayout
        aside={
          /* The plan as it stands. The step count is the number that decides
             whether this is worth saving yet — a plan with a name and no steps
             is the thing that gets written and then never worked. */
          <FormPreview title={t('previewTitle')}>
            <p className="text-[1.12rem] font-bold text-ink">
              {title.trim() || <span className="text-ink-faint">{t('new')}</span>}
            </p>
            <p className="mt-1 text-[0.95rem] text-ink-soft">
              {t('stepCount', { count: steps.length })}
            </p>

            {steps.length > 0 ? (
              <ol className="mt-3 space-y-1">
                {steps.map((step, index) => (
                  <li key={step.key} className="flex gap-2 text-[0.95rem] text-ink-soft">
                    <span aria-hidden className="shrink-0 font-bold tabular-nums text-ink-faint">
                      {index + 1}.
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {step.title}
                      {step.toothNum ? ` · ${tt('tooth', { num: label(step.toothNum) })}` : ''}
                    </span>
                  </li>
                ))}
              </ol>
            ) : null}
          </FormPreview>
        }
      >
        <FormSection
          title={t('sectionPlan')}
          subtitle={t('sectionPlanHint')}
          icon={<ListChecks size={22} aria-hidden />}
        >
          {defaultPatient ? (
            <input type="hidden" name="patientId" value={defaultPatient.id} />
          ) : (
            <PatientPicker name="patientId" label={t('forPatient')} required />
          )}

          <TextField
            id={`${uid}-title`}
            name="title"
            label={t('title_')}
            hint={t('titleHint')}
            required
            list={`${uid}-titles`}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <datalist id={`${uid}-titles`}>
            {titles.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </FormSection>

        <FormSection
          title={t('steps')}
          subtitle={t('sectionStepsHint')}
          icon={<Sparkles size={22} aria-hidden />}
        >
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
                  // Enter would otherwise submit the form and save a plan with
                  // the step still sitting in the box.
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
                        onClick={() => setOpenTooth((open) => (open === step.key ? null : step.key))}
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-[0.85rem] font-semibold transition-colors',
                          step.toothNum
                            ? 'border-brand-dark bg-brand-soft text-brand-deep'
                            : 'border-line-strong text-ink-soft hover:border-ink hover:text-ink',
                        )}
                      >
                        {step.toothNum ? tt('tooth', { num: label(step.toothNum) }) : t('pickTooth')}
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
        </FormSection>

        <FormSection
          title={tc('notes')}
          subtitle={t('sectionNotesHint')}
          icon={<StickyNote size={22} aria-hidden />}
        >
          <TextAreaField
            id={`${uid}-notes`}
            name="notes"
            label={tc('notes')}
            labelHidden
            optional={tc('optional')}
            rows={4}
          />
        </FormSection>
      </FormLayout>

      <FormActions
        state={state}
        cancelHref={defaultPatient ? `/patients/${defaultPatient.id}?tab=plans` : '/plans'}
        cancelLabel={tc('cancel')}
        saveLabel={tc('save')}
        pendingLabel={tc('saving')}
      />
    </form>
  );
}
