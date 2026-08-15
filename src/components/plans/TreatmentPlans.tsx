import {
  CalendarCheck,
  ChevronDown,
  ChevronUp,
  ListChecks,
  Printer,
  RotateCcw,
  SkipForward,
  Trash2,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ServiceOption } from '@/components/appointments/AppointmentFormDialog';
import type { ChartedTeeth } from '@/components/dental/ToothPicker';
import { ActionForm } from '@/components/ui/ActionForm';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Link } from '@/i18n/navigation';
import { TreatmentPlanStatus, TreatmentStepStatus } from '@/generated/prisma/enums';
import { deletePlan, deleteStep, moveStep, setStepStatus } from '@/lib/actions/plans';
import { planProgress } from '@/lib/plan-progress';
import type { ToothNumbering } from '@/lib/teeth';
import { cn } from '@/lib/utils';
import { PlanFormDialog } from './PlanFormDialog';
import { StepFormDialog } from './StepFormDialog';

export type PlanStepView = {
  id: string;
  position: number;
  title: string;
  toothNum: number | null;
  notes: string;
  status: TreatmentStepStatus;
  /** `YYYY-MM-DD HH:MM` of the slot this step is booked into, when it is. */
  booked: string;
};

export type PlanView = {
  id: string;
  title: string;
  notes: string;
  status: TreatmentPlanStatus;
  steps: PlanStepView[];
};

const PLAN_TONES: Record<TreatmentPlanStatus, BadgeTone> = {
  [TreatmentPlanStatus.ACTIVE]: 'brand',
  [TreatmentPlanStatus.COMPLETED]: 'ok',
  [TreatmentPlanStatus.CANCELLED]: 'neutral',
};

/**
 * A course of treatment and where it has got to. The progress line is the
 * feature: the reason plans get abandoned is that nobody can see how far in
 * they are without reading every visit note.
 */
export function TreatmentPlans({
  patientId,
  plans,
  canEdit,
  canDelete,
  bookStep,
  services = [],
  charted = {},
  numbering = 'FDI',
  titles = [],
}: {
  patientId: string;
  plans: PlanView[];
  canEdit: boolean;
  canDelete: boolean;
  /** The catalogue and the chart, so a step is picked rather than typed. */
  services?: ServiceOption[];
  charted?: ChartedTeeth;
  numbering?: ToothNumbering;
  titles?: string[];
  /**
   * Renders the booking dialog for one step. Passed in rather than imported:
   * `AppointmentFormDialog` needs the patient list, the catalogue, the providers
   * and the chairs, and threading four server-loaded collections through this
   * component to reach a button would make a plan list depend on the diary.
   */
  bookStep?: (step: PlanStepView) => React.ReactNode;
}) {
  const t = useTranslations('plans');
  const tc = useTranslations('common');
  const tt = useTranslations('teeth');

  if (plans.length === 0) {
    return (
      <EmptyState
        icon={<ListChecks size={40} aria-hidden />}
        title={t('empty')}
        action={
          canEdit ? (
            <Link href={`/plans/new?patient=${patientId}`} className="btn btn-primary btn-sm">
              <ListChecks size={18} aria-hidden />
              {t('new')}
            </Link>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="divide-y-2 divide-line">
      {plans.map((plan) => {
        // The same arithmetic the practice-wide list uses, from the same place —
        // two screens quoting different progress for one plan is the kind of
        // disagreement nobody reports and everybody stops trusting.
        const { done, relevant, percent } = planProgress(plan.steps);

        return (
          <section key={plan.id} className="px-5 py-4">
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="flex flex-wrap items-center gap-2 text-[1.12rem] font-bold text-ink">
                  {plan.title}
                  <Badge tone={PLAN_TONES[plan.status]}>{t(`status_${plan.status}`)}</Badge>
                </h3>
                {plan.notes ? (
                  <p className="mt-0.5 text-[0.95rem] whitespace-pre-line text-ink-soft">
                    {plan.notes}
                  </p>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                {/* The sheet the patient takes home — six visits and four teeth
                    is a conversation, and it was only ever a progress bar
                    behind a login. */}
                <Link
                  href={`/plans/${plan.id}/print`}
                  className="btn btn-ghost btn-sm"
                  title={t('print')}
                >
                  <Printer size={16} aria-hidden />
                  <span className="sr-only">{t('print')}</span>
                </Link>

                {canEdit ? (
                  <PlanFormDialog
                    patientId={patientId}
                    titles={titles}
                    plan={{
                      id: plan.id,
                      title: plan.title,
                      notes: plan.notes,
                      status: plan.status,
                    }}
                  />
                ) : null}
                {canDelete ? (
                  <ActionForm
                    action={deletePlan}
                    values={{ id: plan.id }}
                    confirmMessage={tc('confirmDelete')}
                  >
                    <button type="submit" className="btn btn-danger btn-sm" title={tc('delete')}>
                      <Trash2 size={16} aria-hidden />
                      <span className="sr-only">{tc('delete')}</span>
                    </button>
                  </ActionForm>
                ) : null}
              </div>
            </header>

            <div className="mt-3 flex items-center gap-3">
              <div
                className="h-2.5 flex-1 overflow-hidden rounded-full bg-paper"
                role="progressbar"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={t('progress', { done, total: relevant })}
              >
                <div
                  className="h-full rounded-full bg-brand transition-[width]"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <span className="shrink-0 text-[0.92rem] font-bold text-ink-soft tabular-nums">
                {t('progress', { done, total: relevant })}
              </span>
            </div>

            <ol className="mt-3 space-y-1.5">
              {plan.steps.map((step, index) => {
                const isDone = step.status === TreatmentStepStatus.DONE;
                const isSkipped = step.status === TreatmentStepStatus.SKIPPED;

                return (
                  <li
                    key={step.id}
                    className={cn(
                      'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2',
                      isDone
                        ? 'border-ok/30 bg-ok-soft'
                        : isSkipped
                          ? 'border-line bg-paper opacity-70'
                          : 'border-line-strong bg-surface',
                    )}
                  >
                    <span
                      aria-hidden
                      className="grid size-7 shrink-0 place-items-center rounded-full bg-surface text-[0.85rem] font-bold text-ink-soft"
                    >
                      {index + 1}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          'text-[1.02rem] font-semibold',
                          isDone ? 'text-ok' : isSkipped ? 'text-ink-faint line-through' : 'text-ink',
                        )}
                      >
                        {step.title}
                        {step.toothNum ? (
                          <span className="ml-2 text-[0.9rem] font-normal text-ink-soft">
                            {tt('tooth', { num: step.toothNum })}
                          </span>
                        ) : null}
                      </p>
                      {step.notes ? (
                        <p className="text-[0.9rem] text-ink-soft">{step.notes}</p>
                      ) : null}
                      {/* The slot it is booked into. Without it the plan and the
                          calendar are two accounts of the same treatment and
                          only one of them is ever open. */}
                      {step.booked ? (
                        <p className="flex items-center gap-1.5 text-[0.9rem] font-semibold text-brand-deep tabular-nums">
                          <CalendarCheck size={15} aria-hidden />
                          {step.booked}
                        </p>
                      ) : null}
                    </div>

                    {canEdit ? (
                      <div className="flex items-center gap-1">
                        {isDone || isSkipped ? (
                          <ActionForm
                            action={setStepStatus}
                            values={{ id: step.id, status: TreatmentStepStatus.PENDING }}
                          >
                            <button
                              type="submit"
                              className="btn btn-ghost btn-sm"
                              title={t('reopen')}
                            >
                              <RotateCcw size={16} aria-hidden />
                              <span className="sr-only">{t('reopen')}</span>
                            </button>
                          </ActionForm>
                        ) : (
                          <>
                            {/* Booking is offered only while the step is still
                                outstanding and not already in the diary — the
                                relation is one-to-one, so a second booking would
                                have nothing to bind itself to. */}
                            {bookStep && !step.booked ? bookStep(step) : null}

                            <ActionForm
                              action={setStepStatus}
                              values={{ id: step.id, status: TreatmentStepStatus.DONE }}
                            >
                              <button type="submit" className="btn btn-secondary btn-sm">
                                {t('markDone')}
                              </button>
                            </ActionForm>
                            <ActionForm
                              action={setStepStatus}
                              values={{ id: step.id, status: TreatmentStepStatus.SKIPPED }}
                            >
                              <button
                                type="submit"
                                className="btn btn-ghost btn-sm"
                                title={t('skip')}
                              >
                                <SkipForward size={16} aria-hidden />
                                <span className="sr-only">{t('skip')}</span>
                              </button>
                            </ActionForm>
                          </>
                        )}

                        <ActionForm action={moveStep} values={{ id: step.id, direction: 'up' }}>
                          <button
                            type="submit"
                            className="btn btn-ghost btn-sm"
                            title={t('moveUp')}
                            disabled={index === 0}
                          >
                            <ChevronUp size={16} aria-hidden />
                            <span className="sr-only">{t('moveUp')}</span>
                          </button>
                        </ActionForm>
                        <ActionForm action={moveStep} values={{ id: step.id, direction: 'down' }}>
                          <button
                            type="submit"
                            className="btn btn-ghost btn-sm"
                            title={t('moveDown')}
                            disabled={index === plan.steps.length - 1}
                          >
                            <ChevronDown size={16} aria-hidden />
                            <span className="sr-only">{t('moveDown')}</span>
                          </button>
                        </ActionForm>

                        <StepFormDialog
                          planId={plan.id}
                          services={services}
                          charted={charted}
                          numbering={numbering}
                          step={{
                            id: step.id,
                            title: step.title,
                            toothNum: step.toothNum,
                            notes: step.notes,
                          }}
                        />

                        <ActionForm
                          action={deleteStep}
                          values={{ id: step.id }}
                          confirmMessage={tc('confirmDelete')}
                        >
                          <button
                            type="submit"
                            className="btn btn-ghost btn-sm text-danger"
                            title={tc('delete')}
                          >
                            <Trash2 size={16} aria-hidden />
                            <span className="sr-only">{tc('delete')}</span>
                          </button>
                        </ActionForm>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ol>

            {canEdit ? (
              <div className="mt-2">
                <StepFormDialog
                  planId={plan.id}
                  services={services}
                  charted={charted}
                  numbering={numbering}
                />
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
