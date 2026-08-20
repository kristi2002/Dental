/**
 * The practice's courses of treatment as a spreadsheet.
 *
 * `/plans` answers "what did we start and never finish" on screen, one tab at a
 * time and capped — sixty rows on the archives, three hundred on the open tabs,
 * because a browser has to draw them. The question the screen cannot answer is
 * the one asked once a quarter and across the whole thing: which treatments were
 * planned and never delivered, whose plans stall, how long a course actually
 * takes from first step to last. That is spreadsheet work.
 *
 * **One row per step**, with the plan's columns repeated down it — the same
 * shape, and for the same reason, as the works register's export. A plan on
 * screen is one row with its steps stacked inside it, which reads well and
 * sorts, filters and sums not at all. A plan with no steps still exports one
 * row, with the step columns blank, so the file never quietly holds fewer plans
 * than the screen.
 */

import { TreatmentStepStatus } from '@/generated/prisma/enums';

/** Column titles, translated by the caller. */
export type PlanHeaders = {
  patient: string;
  plan: string;
  status: string;
  created: string;
  done: string;
  steps: string;
  lastContacted: string;
  followUpOn: string;
  position: string;
  stepTitle: string;
  tooth: string;
  stepStatus: string;
  booked: string;
};

export type ExportableStep = {
  position: number;
  title: string;
  toothNum: number | null;
  status: TreatmentStepStatus;
  completedAt: Date | null;
  appointment: { date: Date; startTime: string } | null;
};

export type ExportablePlan = {
  title: string;
  status: string;
  createdAt: Date;
  lastContactedAt: Date | null;
  followUpOn: Date | null;
  patient: { firstName: string; lastName: string };
  steps: ReadonlyArray<ExportableStep>;
};

/**
 * How far along the plan is, as two numbers rather than a percentage.
 *
 * Skipped steps are left out of the denominator, exactly as `planProgress` does
 * for the screen and the printed sheet: a step nobody is going to do is not work
 * outstanding, and counting it would make every plan look further behind than it
 * is. The two figures are written into separate columns so the spreadsheet can
 * do arithmetic on them — a single "3/5" cell is text.
 */
function progressOf(steps: ReadonlyArray<ExportableStep>): { done: number; relevant: number } {
  return {
    done: steps.filter((step) => step.status === TreatmentStepStatus.DONE).length,
    relevant: steps.filter((step) => step.status !== TreatmentStepStatus.SKIPPED).length,
  };
}

export function plansToRows(
  plans: ReadonlyArray<ExportablePlan>,
  headers: PlanHeaders,
  formatDate: (value: Date) => string,
  /** Translates a plan's and a step's status; the caller owns the wording. */
  label: { planStatus: (status: string) => string; stepStatus: (status: string) => string },
  /** FDI or Universal, per the practice's setting — see `toothLabel`. */
  toothLabel: (toothNum: number) => string,
): Array<Array<string | number>> {
  const rows: Array<Array<string | number>> = [
    [
      headers.patient,
      headers.plan,
      headers.status,
      headers.created,
      headers.done,
      headers.steps,
      headers.lastContacted,
      headers.followUpOn,
      headers.position,
      headers.stepTitle,
      headers.tooth,
      headers.stepStatus,
      headers.booked,
    ],
  ];

  for (const plan of plans) {
    const { done, relevant } = progressOf(plan.steps);

    const head: Array<string | number> = [
      `${plan.patient.lastName} ${plan.patient.firstName}`,
      plan.title,
      label.planStatus(plan.status),
      formatDate(plan.createdAt),
      done,
      relevant,
      plan.lastContactedAt ? formatDate(plan.lastContactedAt) : '',
      plan.followUpOn ? formatDate(plan.followUpOn) : '',
    ];

    if (plan.steps.length === 0) {
      rows.push([...head, '', '', '', '', '']);
      continue;
    }

    for (const step of plan.steps) {
      rows.push([
        ...head,
        step.position,
        step.title,
        step.toothNum ? toothLabel(step.toothNum) : '',
        label.stepStatus(step.status),
        // The date the step is answered by: when it was done, or when it is
        // booked for. One column rather than two, because a step is never both
        // and a pair of half-empty columns is harder to read than one that
        // always says something.
        step.completedAt
          ? formatDate(step.completedAt)
          : step.appointment
            ? `${formatDate(step.appointment.date)} ${step.appointment.startTime}`
            : '',
      ]);
    }
  }

  return rows;
}
