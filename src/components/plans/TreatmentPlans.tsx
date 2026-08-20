import { CalendarPlus, ListChecks, Printer, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type {
  OperatoryOption,
  ServiceOption,
  StaffOption,
} from '@/components/appointments/AppointmentFormDialog';
import type { ChartedTeeth } from '@/components/dental/ToothPicker';
import { ReportingActionForm } from '@/components/ui/ActionForm';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Link } from '@/i18n/navigation';
import { TreatmentPlanStatus, TreatmentStepStatus } from '@/generated/prisma/enums';
import { deletePlan } from '@/lib/actions/plans';
import { planProgress } from '@/lib/plan-progress';
import type { ToothNumbering } from '@/lib/teeth';
import { PlanFormDialog } from './PlanFormDialog';
import { SeriesBookingDialog } from './SeriesBookingDialog';
import { StepFormDialog } from './StepFormDialog';
import { StepList, type StepView } from './StepList';

export type PlanView = {
  id: string;
  title: string;
  notes: string;
  status: TreatmentPlanStatus;
  steps: StepView[];
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
 *
 * The steps themselves are `StepList`, shared with the practice-wide plans page
 * — the two screens disagreeing about which step comes next, or about what a
 * tooth is called, is the kind of thing nobody reports and everybody stops
 * trusting. This screen keeps only what belongs to the plan as a whole.
 */
export function TreatmentPlans({
  patientId,
  plans,
  canEdit,
  canDelete,
  canBook,
  bookSlots,
  services = [],
  staff = [],
  operatories = [],
  charted = {},
  numbering = 'FDI',
  titles = [],
}: {
  patientId: string;
  plans: PlanView[];
  canEdit: boolean;
  canDelete: boolean;
  canBook?: boolean;
  /** The catalogue and the chart, so a step is picked rather than typed. */
  services?: ServiceOption[];
  staff?: StaffOption[];
  operatories?: OperatoryOption[];
  charted?: ChartedTeeth;
  numbering?: ToothNumbering;
  titles?: string[];
  /**
   * The booking dialog for each step, by step id, rendered on the server.
   *
   * Was a render prop, which cannot cross into the client component the step
   * list had to become to move a step without a round trip. Same reason as
   * before for it coming from outside at all: `AppointmentFormDialog` needs the
   * patient list, the catalogue, the providers and the chairs, and a plan should
   * not have to load four collections to reach a button.
   */
  bookSlots?: Record<string, ReactNode>;
}) {
  const t = useTranslations('plans');
  const tc = useTranslations('common');

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
        const bookable = plan.steps.filter(
          (step) => step.status === TreatmentStepStatus.PENDING && !step.linked,
        ).length;

        return (
          // Anchored and targetable: arriving from the practice-wide list used
          // to drop you at the top of a tab holding every plan this patient has,
          // with nothing saying which one you had just clicked.
          <section
            key={plan.id}
            id={`plan-${plan.id}`}
            className="scroll-mt-24 px-5 py-4 target:rounded-lg target:bg-brand-soft/50 target:ring-2 target:ring-brand"
          >
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
                    plan={{ id: plan.id, title: plan.title, notes: plan.notes }}
                  />
                ) : null}
                {canDelete ? (
                  <ReportingActionForm
                    action={deletePlan}
                    values={{ id: plan.id }}
                    confirmMessage={tc('confirmDelete')}
                  >
                    <button type="submit" className="btn btn-danger btn-sm" title={tc('delete')}>
                      <Trash2 size={16} aria-hidden />
                      <span className="sr-only">{tc('delete')}</span>
                    </button>
                  </ReportingActionForm>
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

            <div className="mt-3">
              <StepList
                planId={plan.id}
                steps={plan.steps}
                canEdit={canEdit}
                canDelete={canDelete}
                services={services}
                charted={charted}
                numbering={numbering}
                bookSlots={bookSlots}
              />
            </div>

            {canEdit || canBook ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {canEdit ? (
                  <StepFormDialog
                    planId={plan.id}
                    services={services}
                    charted={charted}
                    numbering={numbering}
                  />
                ) : null}

                {/* The whole run at once. A course of treatment is a sequence of
                    visits, and the diary could only ever be given one of them
                    per trip through the booking form — with the interval held in
                    somebody's head while the patient stood at the desk. */}
                {canBook && bookable > 1 ? (
                  <SeriesBookingDialog
                    planId={plan.id}
                    pending={bookable}
                    staff={staff}
                    operatories={operatories}
                    trigger={
                      <>
                        <CalendarPlus size={17} aria-hidden />
                        {t('bookSeries')}
                      </>
                    }
                  />
                ) : null}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
