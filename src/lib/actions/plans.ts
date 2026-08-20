'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import {
  AppointmentStatus,
  TreatmentPlanStatus,
  TreatmentStepStatus,
} from '@/generated/prisma/enums';
import { authorize, recordAudit } from '@/lib/auth/guard';
import { addDays, fromDateKey, timeToMinutes, toDateKey, today } from '@/lib/dates';
import { syncPlanStatus } from '@/lib/plan-sync';
import { positionWrites } from '@/lib/plan-steps';
import { prisma } from '@/lib/prisma';
import { getDaySchedule } from '@/lib/queries';
import { findConflicts } from '@/lib/scheduling';
import { isValidTooth } from '@/lib/teeth';
import { optionalString, requiredString, toInt } from '@/lib/utils';
import { actionError, actionOk, type ActionState } from './types';

/**
 * The four screens a course of treatment is read on, and nothing else.
 *
 * This used to be `revalidatePath('/', 'layout')` — the whole application,
 * every route, for every plan mutation. Harmless once, and the reason
 * reordering a plan was slow: each of the old one-position swaps threw away the
 * render of the patient record it was being done on, which is the largest page
 * in the app. The route patterns carry their `[locale]` segment literally,
 * which is how one call covers all three languages.
 */
function revalidatePlans() {
  revalidatePath('/[locale]/plans', 'page');
  revalidatePath('/[locale]/plans/new', 'page');
  revalidatePath('/[locale]/plans/[id]/print', 'page');
  revalidatePath('/[locale]/patients/[id]', 'page');
}

/**
 * The above, plus the diary. Only booking needs it — an appointment lands on
 * the calendar, the dashboard and the day sheet, none of which know a plan
 * exists.
 */
function revalidateWithDiary() {
  revalidatePath('/', 'layout');
}

function toStepStatus(value: string): TreatmentStepStatus {
  return value in TreatmentStepStatus
    ? (value as TreatmentStepStatus)
    : TreatmentStepStatus.PENDING;
}

/**
 * An FDI tooth, or null for work that is not about one specific tooth.
 *
 * Set membership, not a range: FDI is not contiguous — 19 and 29 are not teeth,
 * and 33–48 sit above the old Universal ceiling of 32. Validating `1..32` here
 * silently dropped every step written for a lower-left or lower-right tooth,
 * and accepted numbers that mean a different tooth to the chart than to whoever
 * typed them.
 */
function toToothNum(value: FormDataEntryValue | null): number | null {
  const parsed = toInt(value, 0);
  return isValidTooth(parsed) ? parsed : null;
}

/**
 * A catalogue id posted by a form, kept only if it still names a treatment.
 *
 * The step's own title stays the snapshot that gets printed; this is the link
 * that lets a booking know how long to leave in the diary. A stale id from a
 * service deleted while the form was open is dropped rather than refused —
 * the step is still a perfectly good step, it just no longer has a catalogue
 * entry behind it.
 */
async function toServiceId(value: FormDataEntryValue | null): Promise<string | null> {
  const id = optionalString(value);
  if (!id) return null;
  const service = await prisma.service.findUnique({ where: { id }, select: { id: true } });
  return service?.id ?? null;
}

/**
 * A list of step ids as the reorder form posts it.
 *
 * Malformed input yields an empty list, which `positionWrites` treats as "no
 * order was named" and leaves the plan exactly as it found it.
 */
function parseOrder(raw: string): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * The opening steps a new plan is created with, as posted by the builder.
 *
 * Anything malformed is dropped rather than guessed at, and the list is capped:
 * a plan is a course of treatment, not an import format, and thirty steps is
 * already more than any real one has.
 */
function parseDraftSteps(
  raw: string,
): Array<{ title: string; toothNum: number | null; serviceId: string | null }> {
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const steps: Array<{ title: string; toothNum: number | null; serviceId: string | null }> = [];
  for (const entry of parsed) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { title, toothNum, serviceId } = entry as {
      title?: unknown;
      toothNum?: unknown;
      serviceId?: unknown;
    };
    if (typeof title !== 'string') continue;

    const clean = title.trim().slice(0, 180);
    if (!clean) continue;

    steps.push({
      title: clean,
      toothNum: typeof toothNum === 'number' && isValidTooth(toothNum) ? toothNum : null,
      serviceId: typeof serviceId === 'string' && serviceId ? serviceId : null,
    });
    if (steps.length === 30) break;
  }
  return steps;
}

/** Drop catalogue ids that no longer name anything, in one query rather than n. */
async function keepRealServices<T extends { serviceId: string | null }>(rows: T[]): Promise<T[]> {
  const wanted = [...new Set(rows.map((row) => row.serviceId).filter((id): id is string => !!id))];
  if (wanted.length === 0) return rows;

  const found = new Set(
    (
      await prisma.service.findMany({ where: { id: { in: wanted } }, select: { id: true } })
    ).map((service) => service.id),
  );
  return rows.map((row) => (row.serviceId && found.has(row.serviceId) ? row : { ...row, serviceId: null }));
}

export async function savePlan(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getTranslations('errors');

  const user = await authorize('plan.edit');
  if (!user) return actionError(t('forbidden'));

  const id = optionalString(formData.get('id'));
  const patientId = requiredString(formData.get('patientId'));
  const title = requiredString(formData.get('title'));
  if (!patientId || !title) return actionError(t('fillRequired'));

  // Deliberately without a status.
  //
  // Finished is derived — `syncPlanStatus` decides it from the steps — and this
  // form used to offer it as a free choice, which meant a plan with three
  // outstanding steps could be filed under Finished and sit in the archive with
  // work still on it, until somebody touched a step and it silently reopened.
  // Abandoning a plan is the one judgement the steps cannot make, and it has its
  // own verb: `setPlanStatus`.
  const data = {
    title,
    notes: optionalString(formData.get('notes')),
  };

  // A brand-new plan is built in one go, so the form posts its whole opening
  // sequence rather than making the dentist save and then add steps one dialog
  // at a time. Each carries its tooth and, where it came from the catalogue, the
  // treatment it plans.
  const initialSteps = await keepRealServices(
    parseDraftSteps(requiredString(formData.get('steps'))),
  );

  let savedId = id;
  try {
    if (id) {
      await prisma.treatmentPlan.update({ where: { id }, data });
    } else {
      savedId = (
        await prisma.treatmentPlan.create({
          data: {
            ...data,
            patientId,
            steps: {
              create: initialSteps.map((step, index) => ({
                position: index + 1,
                title: step.title,
                toothNum: step.toothNum,
                serviceId: step.serviceId,
              })),
            },
          },
          select: { id: true },
        })
      ).id;
    }
  } catch {
    return actionError(t('generic'));
  }

  // A plan saved with no steps at all has nothing outstanding, and a plan whose
  // steps are all done is finished. Asked of the steps rather than taken from
  // the form, which is the whole point of dropping the status select.
  if (savedId) await syncPlanStatus(savedId);

  await recordAudit(user, {
    action: id ? 'update' : 'create',
    entity: 'plan',
    entityId: savedId,
    summary: title,
  });

  revalidatePlans();

  // Writing a plan is done on a page of its own, and the thing you do next is
  // always to the patient it was written for — book the first step, look at the
  // chart it came from. An edit is submitted from a dialog on the plan itself,
  // so it stays put.
  if (!id) {
    redirect({ href: `/patients/${patientId}?tab=plans`, locale: await getLocale() });
  }

  return actionOk();
}

/**
 * Write the same course of treatment again, for whoever needs it next.
 *
 * A practice repeats itself: "Upper right quadrant restoration" is the same five
 * steps in the same order every time it is written. The app already suggested
 * the *name* — a datalist of titles on the form — and then made somebody rebuild
 * the steps underneath it by hand, which is how one plan becomes four differently
 * ordered versions of itself.
 *
 * Only the plan is copied, never its history: every step comes back PENDING,
 * unbooked and uncompleted, because what is being reused is the intention and
 * not the record of somebody else's treatment.
 */
export async function duplicatePlan(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getTranslations('errors');

  const user = await authorize('plan.edit');
  if (!user) return actionError(t('forbidden'));

  const sourceId = requiredString(formData.get('sourceId'));
  const patientId = requiredString(formData.get('patientId'));
  if (!sourceId || !patientId) return actionError(t('fillRequired'));

  const source = await prisma.treatmentPlan.findUnique({
    where: { id: sourceId },
    select: {
      title: true,
      notes: true,
      steps: {
        orderBy: { position: 'asc' },
        // Skipped steps are not copied: they are a record of what this patient
        // did not need, which says nothing about the next one.
        where: { status: { not: TreatmentStepStatus.SKIPPED } },
        select: { title: true, toothNum: true, notes: true, serviceId: true },
      },
    },
  });
  if (!source) return actionError(t('notFound'));

  const title = optionalString(formData.get('title')) ?? source.title;

  let created: string;
  try {
    created = (
      await prisma.treatmentPlan.create({
        data: {
          patientId,
          title,
          notes: source.notes,
          steps: {
            create: source.steps.map((step, index) => ({
              position: index + 1,
              title: step.title,
              // The tooth is deliberately dropped when the plan moves to
              // somebody else: decay on 46 is a fact about one mouth, and
              // carrying it across is how a plan ends up naming a tooth nobody
              // has looked at.
              toothNum: null,
              notes: step.notes,
              serviceId: step.serviceId,
              status: TreatmentStepStatus.PENDING,
            })),
          },
        },
        select: { id: true },
      })
    ).id;
  } catch {
    return actionError(t('generic'));
  }

  await syncPlanStatus(created);
  await recordAudit(user, {
    action: 'create',
    entity: 'plan',
    entityId: created,
    summary: `${title} · copied`,
  });

  revalidatePlans();
  redirect({ href: `/patients/${patientId}?tab=plans#plan-${created}`, locale: await getLocale() });
}

export async function deletePlan(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getTranslations('errors');

  // Deleting a course of treatment is a records decision, not a scheduling one.
  const user = await authorize('patient.delete');
  if (!user) return actionError(t('forbidden'));

  const id = requiredString(formData.get('id'));
  if (!id) return actionError(t('fillRequired'));

  const plan = await prisma.treatmentPlan.findUnique({
    where: { id },
    select: { title: true },
  });
  if (!plan) return actionError(t('notFound'));

  try {
    await prisma.treatmentPlan.delete({ where: { id } });
  } catch {
    return actionError(t('generic'));
  }

  await recordAudit(user, {
    action: 'delete',
    entity: 'plan',
    entityId: id,
    summary: plan.title,
  });
  revalidatePlans();
  return actionOk();
}

export async function saveStep(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getTranslations('errors');

  const user = await authorize('plan.edit');
  if (!user) return actionError(t('forbidden'));

  const id = optionalString(formData.get('id'));
  const planId = requiredString(formData.get('planId'));
  const title = requiredString(formData.get('title'));
  if (!planId || !title) return actionError(t('fillRequired'));

  const data = {
    title,
    toothNum: toToothNum(formData.get('toothNum')),
    notes: optionalString(formData.get('notes')),
    serviceId: await toServiceId(formData.get('serviceId')),
  };

  try {
    if (id) {
      await prisma.treatmentStep.update({ where: { id }, data });
    } else {
      const last = await prisma.treatmentStep.findFirst({
        where: { planId },
        orderBy: { position: 'desc' },
        select: { position: true },
      });

      await prisma.treatmentStep.create({
        data: { ...data, planId, position: (last?.position ?? 0) + 1 },
      });
      // New work on a plan that had none left reopens it. Otherwise a finished
      // plan would sit in the archive with an outstanding step on it, which is
      // the exact disagreement `syncPlanStatus` exists to prevent.
      await syncPlanStatus(planId);
    }
  } catch {
    return actionError(t('generic'));
  }

  await recordAudit(user, {
    action: id ? 'update' : 'create',
    entity: 'plan',
    entityId: planId,
    summary: title,
  });

  revalidatePlans();
  return actionOk();
}

/**
 * Turn a finding on the chart into work on the plan.
 *
 * Marking decay and planning the filling are one thought and were two screens:
 * the chart recorded "caries on 46" and then offered nothing, so the treatment
 * got remembered rather than written down. This is the other half of that click.
 *
 * The step joins the course of treatment already under way, and only starts a
 * new one when the patient has none — being asked *which plan* at the moment a
 * cavity is found is how an offer like this stops being taken up.
 */
export async function planStepForTooth(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations('errors');
  const tp = await getTranslations('plans');

  const user = await authorize('plan.edit');
  if (!user) return actionError(t('forbidden'));

  const patientId = requiredString(formData.get('patientId'));
  const title = requiredString(formData.get('title'));
  const toothNum = toToothNum(formData.get('toothNum'));
  // The tooth is the whole point here, so a step without one is a mistake rather
  // than the "not about one tooth" case the plans tab allows for.
  if (!patientId || !title || toothNum === null) return actionError(t('fillRequired'));

  let planId: string;
  try {
    const open = await prisma.treatmentPlan.findFirst({
      where: { patientId, status: TreatmentPlanStatus.ACTIVE },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    planId =
      open?.id ??
      (
        await prisma.treatmentPlan.create({
          data: { patientId, title: tp('chartPlanTitle') },
          select: { id: true },
        })
      ).id;

    const last = await prisma.treatmentStep.findFirst({
      where: { planId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });

    await prisma.treatmentStep.create({
      data: { planId, title, toothNum, position: (last?.position ?? 0) + 1 },
    });
  } catch {
    return actionError(t('generic'));
  }

  await syncPlanStatus(planId);

  await recordAudit(user, {
    action: 'create',
    entity: 'plan',
    entityId: planId,
    summary: `${title} · #${toothNum}`,
  });

  revalidatePlans();
  return actionOk();
}

/**
 * Tick a step off, or put it back. Completing the last outstanding step closes
 * the plan, because a plan whose steps are all done is a finished plan and
 * nobody should have to say so twice.
 */
export async function setStepStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getTranslations('errors');

  const user = await authorize('plan.edit');
  if (!user) return actionError(t('forbidden'));

  const id = requiredString(formData.get('id'));
  const status = toStepStatus(requiredString(formData.get('status')));
  if (!id) return actionError(t('fillRequired'));

  let step: { title: string; planId: string };
  try {
    step = await prisma.treatmentStep.update({
      where: { id },
      data: {
        status,
        completedAt: status === TreatmentStepStatus.DONE ? new Date() : null,
      },
      select: { title: true, planId: true },
    });
  } catch {
    return actionError(t('generic'));
  }

  await syncPlanStatus(step.planId);

  await recordAudit(user, {
    action: 'update',
    entity: 'plan',
    entityId: step.planId,
    summary: `${step.title} → ${status}`,
  });
  revalidatePlans();
  return actionOk();
}

export async function deleteStep(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getTranslations('errors');

  const id = requiredString(formData.get('id'));
  if (!id) return actionError(t('fillRequired'));

  const step = await prisma.treatmentStep.findUnique({
    where: { id },
    select: { title: true, planId: true, status: true },
  });
  if (!step) return actionError(t('notFound'));

  // A pending step is a plan; a completed one is a record of care. Removing the
  // second needs the same authority as deleting any other record.
  const permission = step.status === TreatmentStepStatus.DONE ? 'patient.delete' : 'plan.edit';
  const user = await authorize(permission);
  if (!user) return actionError(t('forbidden'));

  try {
    await prisma.treatmentStep.delete({ where: { id } });
  } catch {
    return actionError(t('generic'));
  }

  // Removing the last outstanding step finishes the plan, for the same reason
  // ticking it off would have.
  await syncPlanStatus(step.planId);

  await recordAudit(user, {
    action: 'delete',
    entity: 'plan',
    entityId: step.planId,
    summary: step.title,
  });
  revalidatePlans();
  return actionOk();
}

/**
 * Stop chasing a plan, or start chasing it again.
 *
 * The other two statuses are derived — `syncPlanStatus` decides between open and
 * finished from the steps themselves, and nobody should be able to declare a
 * course of treatment complete while work is still outstanding on it. Abandoning
 * one is the single judgement the steps cannot make, and until now the only ways
 * to clear a plan off the practice's list were to tick off work that never
 * happened or to delete the record of it.
 *
 * Reopening deliberately does not force it open: it hands the question straight
 * back to the steps, so a plan whose work turns out to be finished comes back as
 * finished rather than as an empty course of treatment nobody can close.
 */
export async function setPlanStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getTranslations('errors');

  const user = await authorize('plan.edit');
  if (!user) return actionError(t('forbidden'));

  const id = requiredString(formData.get('id'));
  if (!id) return actionError(t('fillRequired'));

  const cancelling = requiredString(formData.get('status')) === TreatmentPlanStatus.CANCELLED;

  const plan = await prisma.treatmentPlan.findUnique({
    where: { id },
    select: { title: true },
  });
  if (!plan) return actionError(t('notFound'));

  try {
    await prisma.treatmentPlan.update({
      where: { id },
      data: {
        status: cancelling ? TreatmentPlanStatus.CANCELLED : TreatmentPlanStatus.ACTIVE,
        // Reopening clears the promise to ring back: whatever was agreed, this
        // plan is being worked now.
        ...(cancelling ? {} : { followUpOn: null }),
      },
    });
  } catch {
    return actionError(t('generic'));
  }

  if (!cancelling) await syncPlanStatus(id);

  await recordAudit(user, {
    action: 'update',
    entity: 'plan',
    entityId: id,
    summary: `${plan.title} → ${cancelling ? TreatmentPlanStatus.CANCELLED : 'reopened'}`,
  });
  revalidatePlans();
  return actionOk();
}

/**
 * "Rang them — they will come back after the summer."
 *
 * The third exit from the stalled list, and the only honest one. Stalled is
 * derived from sixty quiet days with nothing booked, and the two exits the page
 * had were to tick off work nobody did or to cancel a course of treatment the
 * patient still intends to finish. So the list was either worked dishonestly or
 * not worked at all, and a plan chased this morning shouted exactly as loudly
 * this afternoon.
 *
 * Recording the call parks the plan until the day that was agreed. It stays
 * open, stays on the in-progress tab, and comes back by itself — see
 * `summarisePlan`, which is where the suppression actually happens.
 */
export async function chasePlan(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getTranslations('errors');

  const user = await authorize('plan.edit');
  if (!user) return actionError(t('forbidden'));

  const id = requiredString(formData.get('id'));
  if (!id) return actionError(t('fillRequired'));

  const plan = await prisma.treatmentPlan.findUnique({
    where: { id },
    select: { title: true },
  });
  if (!plan) return actionError(t('notFound'));

  // The day agreed on the phone, or none — "I rang, they did not answer" is a
  // real outcome and puts the plan straight back where it was. The dialog's
  // in-two-weeks buttons fill this same field rather than posting a number of
  // their own, so there is one thing to validate instead of two.
  //
  // A day already gone by is no promise at all, so it is refused rather than
  // stored as one and immediately expired.
  const picked = optionalString(formData.get('followUpOn'));
  const now = today();
  const followUpOn = picked ? fromDateKey(picked) : null;

  if (followUpOn && followUpOn < now) return actionError(t('rangeBackwards'));

  const note = optionalString(formData.get('note'));

  try {
    await prisma.treatmentPlan.update({
      where: { id },
      data: { lastContactedAt: new Date(), followUpOn },
    });
  } catch {
    return actionError(t('generic'));
  }

  await recordAudit(user, {
    action: 'update',
    entity: 'plan',
    entityId: id,
    summary: `${plan.title} · chased${followUpOn ? ` → ${toDateKey(followUpOn)}` : ''}${
      note ? ` · ${note}` : ''
    }`,
  });
  revalidatePlans();
  return actionOk();
}

/**
 * Put the plan's order right, in one write.
 *
 * What this replaces was a neighbour swap: one form post per position, each one
 * revalidating the entire application, each one moving the row out from under
 * the button that had just been pressed. Moving the last step of an eight-step
 * plan to the front cost seven of them.
 *
 * The browser now does the moving and posts the finished order, so a drag is one
 * request whatever distance it covered. `positionWrites` decides what actually
 * has to change — a dense `1..n`, minus the rows already sitting right — which
 * repairs the gaps the swap left behind as a side effect of every reorder.
 */
export async function reorderSteps(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getTranslations('errors');

  const user = await authorize('plan.edit');
  if (!user) return actionError(t('forbidden'));

  const planId = requiredString(formData.get('planId'));
  if (!planId) return actionError(t('fillRequired'));

  const plan = await prisma.treatmentPlan.findUnique({
    where: { id: planId },
    select: { title: true, steps: { select: { id: true, position: true } } },
  });
  if (!plan) return actionError(t('notFound'));

  const writes = positionWrites(parseOrder(requiredString(formData.get('order'))), plan.steps);
  // Nothing moved — a drag that ended where it started, or a stale tab posting
  // the order the plan is already in. Not an error, and not worth a write.
  if (writes.length === 0) return actionOk();

  try {
    await prisma.$transaction(
      writes.map((write) =>
        prisma.treatmentStep.update({ where: { id: write.id }, data: { position: write.position } }),
      ),
    );
  } catch {
    return actionError(t('generic'));
  }

  // Audited like every other change to a plan. The swap never was, so the one
  // thing the trail could not answer about a course of treatment was who
  // changed the order of the treatment.
  await recordAudit(user, {
    action: 'update',
    entity: 'plan',
    entityId: planId,
    summary: `${plan.title} · reordered`,
  });

  revalidatePlans();
  return actionOk();
}

/** How far past the ideal day a visit may be pushed before it is given up on. */
const SERIES_SEARCH_DAYS = 21;

/** Nothing in a plan is a fortnight of chair time; this is a guard, not a policy. */
const DEFAULT_STEP_MINUTES = 30;

/**
 * Book the next few steps as the course of treatment they already are.
 *
 * A plan is a sequence of visits and the app could only ever book one of them:
 * the dialog opened on today's date, was filled in, closed, and had to be opened
 * again for step two — so a six-visit course was six trips through the same form
 * with the interval held in somebody's head. The patient is at the desk with a
 * diary open for about ninety seconds, which is the whole reason courses of
 * treatment get booked one visit at a time and then forgotten.
 *
 * Each visit is bound to its own step, so "3 of 6 done" keeps meaning something,
 * and they share a `seriesId` exactly as a repeat appointment does — the diary
 * already knows how to say "this is 3 of 6, here are the rest".
 *
 * Where a day does not fit — the practice is shut, the chair is taken — the
 * visit walks forward to the next day that does, up to three weeks, rather than
 * being silently dropped the way the appointment form's own repeat does. Steps
 * that still find nowhere to go are left unbooked and said out loud, because six
 * requested and four booked is a fact the person at the desk has to hear while
 * the patient is still standing there.
 */
export async function bookPlanSteps(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getTranslations('errors');
  const tp = await getTranslations('plans');

  const user = await authorize('appointment.edit');
  if (!user) return actionError(t('forbidden'));

  const planId = requiredString(formData.get('planId'));
  const startDate = requiredString(formData.get('date'));
  const startTime = requiredString(formData.get('startTime'));
  if (!planId || !startDate || !startTime) return actionError(t('fillRequired'));

  const everyDays = Math.min(180, Math.max(1, toInt(formData.get('everyDays'), 7)));
  const wanted = Math.min(12, Math.max(1, toInt(formData.get('count'), 3)));
  const staffUserId = optionalString(formData.get('staffUserId'));
  const operatoryId = optionalString(formData.get('operatoryId'));

  const plan = await prisma.treatmentPlan.findUnique({
    where: { id: planId },
    select: {
      title: true,
      patientId: true,
      patient: { select: { firstName: true, lastName: true } },
      steps: {
        // Only what is still outstanding and not already in the diary: the
        // relation is one-to-one, so a step that has a slot has nothing left to
        // bind a second one to.
        where: { status: TreatmentStepStatus.PENDING, appointmentId: null },
        orderBy: { position: 'asc' },
        take: 12,
        select: { id: true, title: true, service: { select: { id: true, name: true, durationMin: true } } },
      },
    },
  });
  if (!plan) return actionError(t('notFound'));

  const queue = plan.steps.slice(0, wanted);
  if (queue.length === 0) return actionError(tp('nothingToBook'));

  const start = fromDateKey(startDate);
  const opens = timeToMinutes(startTime);

  /** Does this day take the appointment at the asked-for time? */
  const fits = async (day: Date, durationMin: number) => {
    const schedule = await getDaySchedule(day, staffUserId);
    if (schedule.closed) return false;
    // Inside the hours the practice is actually open, not merely on an open day:
    // a nine-o'clock series walking onto a day that opens at fourteen hundred is
    // a booking nobody will keep.
    const open = schedule.ranges.some(
      (range) => range.start <= opens && range.end >= opens + durationMin,
    );
    if (!open) return false;

    const clashes = await findConflicts({
      date: day,
      startTime,
      durationMin,
      staffUserId,
      operatoryId,
    });
    return clashes.length === 0;
  };

  const placed: Array<{ stepId: string; day: Date; durationMin: number; service: { id: string; name: string } | null }> = [];
  let ideal = start;

  for (const step of queue) {
    const durationMin = step.service?.durationMin ?? DEFAULT_STEP_MINUTES;

    let day: Date | null = null;
    for (let offset = 0; offset <= SERIES_SEARCH_DAYS; offset += 1) {
      const candidate = addDays(ideal, offset);
      // Two steps of one plan in one slot on one day is the clash the loop is
      // avoiding for everybody else; it has to avoid it for itself too, and the
      // conflict query cannot see bookings this run has not written yet.
      if (placed.some((booked) => toDateKey(booked.day) === toDateKey(candidate))) continue;
      if (await fits(candidate, durationMin)) {
        day = candidate;
        break;
      }
    }
    if (!day) continue;

    placed.push({
      stepId: step.id,
      day,
      durationMin,
      service: step.service ? { id: step.service.id, name: step.service.name } : null,
    });
    // The cadence carries on from where this visit actually landed, not from
    // where it was meant to: a fortnightly course pushed a day by a closure
    // stays fortnightly from then on rather than drifting back and bunching up.
    ideal = addDays(day, everyDays);
  }

  if (placed.length === 0) return actionError(tp('seriesNoRoom', { days: SERIES_SEARCH_DAYS }));

  const seriesId = placed.length > 1 ? randomUUID() : null;

  try {
    await prisma.$transaction(async (tx) => {
      for (const booking of placed) {
        const appointment = await tx.appointment.create({
          data: {
            patientId: plan.patientId,
            date: booking.day,
            startTime,
            durationMin: booking.durationMin,
            status: AppointmentStatus.SCHEDULED,
            serviceId: booking.service?.id ?? null,
            serviceName: booking.service?.name ?? null,
            staffUserId,
            operatoryId,
            seriesId,
          },
          select: { id: true },
        });

        // Scoped to a still-unbooked step for the same reason `saveAppointment`
        // scopes its own link: a step somebody else booked while this form was
        // open must not have its slot stolen.
        await tx.treatmentStep.updateMany({
          where: { id: booking.stepId, appointmentId: null },
          data: { appointmentId: appointment.id },
        });
      }
    });
  } catch {
    return actionError(t('generic'));
  }

  const patientName = `${plan.patient.lastName} ${plan.patient.firstName}`;
  await recordAudit(user, {
    action: 'create',
    entity: 'appointment',
    entityId: planId,
    summary: `${patientName} · ${plan.title} · ${placed.length}/${queue.length} visits · every ${everyDays}d`,
  });

  // The diary, not just the plan screens: these are appointments, and they land
  // on the calendar, the dashboard and tomorrow's day sheet.
  revalidateWithDiary();

  // Fewer booked than asked for is not a failure — the visits that fitted are
  // real and the row now shows exactly which steps are still open — but it is
  // not a silent success either.
  return placed.length < queue.length
    ? actionError(tp('seriesPartial', { booked: placed.length, asked: queue.length }))
    : actionOk();
}
