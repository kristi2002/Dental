'use client';

import { useTranslations } from 'next-intl';
import { useId, useState, type ReactNode } from 'react';
import type { OperatoryOption, StaffOption } from '@/components/appointments/AppointmentFormDialog';
import { SelectField, TextField } from '@/components/ui/Field';
import { FormDialog } from '@/components/ui/FormDialog';
import { bookPlanSteps } from '@/lib/actions/plans';
import { toDateKey, today } from '@/lib/dates';

/** The intervals a course of treatment is actually spaced at, in days. */
const INTERVALS = [7, 14, 21, 28] as const;

/**
 * Put the next few steps of a plan in the diary in one go.
 *
 * The booking form could only ever take one appointment. A six-visit course was
 * therefore six trips through it, with the interval held in somebody's head and
 * the patient standing at the desk for about ninety seconds — which is the real
 * reason courses of treatment get booked one visit at a time and then forgotten
 * about after the second.
 *
 * The form asks for the four things a run needs and nothing else: when it
 * starts, how far apart, how many, and whose chair. Each visit is bound to its
 * own step, in plan order, and takes its length from the catalogue entry behind
 * that step rather than from a guess — which is the other half of what
 * `TreatmentStep.serviceId` bought.
 *
 * Where a day does not fit, the visit walks forward to the next one that does.
 * If some still find nowhere to go, the action says so rather than reporting a
 * quiet success: six asked for and four booked is a fact for the person at the
 * desk, not a line in the audit trail.
 */
export function SeriesBookingDialog({
  planId,
  pending,
  staff = [],
  operatories = [],
  trigger,
  triggerClassName = 'btn btn-secondary btn-sm',
}: {
  planId: string;
  /** How many steps are still outstanding and unbooked — the ceiling on `count`. */
  pending: number;
  staff?: StaffOption[];
  operatories?: OperatoryOption[];
  trigger: ReactNode;
  triggerClassName?: string;
}) {
  const t = useTranslations('plans');
  const tc = useTranslations('common');
  const ta = useTranslations('appointments');
  const uid = useId();

  const [count, setCount] = useState(Math.min(pending, 4));

  return (
    <FormDialog
      action={bookPlanSteps}
      resetOnSuccess={false}
      title={t('bookSeries')}
      submitLabel={t('bookSeriesSubmit', { count })}
      pendingLabel={tc('saving')}
      cancelLabel={tc('cancel')}
      closeLabel={tc('close')}
      triggerTitle={t('bookSeries')}
      triggerClassName={triggerClassName}
      trigger={trigger}
    >
      <input type="hidden" name="planId" value={planId} />

      <p className="text-body text-ink-soft">{t('bookSeriesHint')}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id={`${uid}-date`}
          name="date"
          type="date"
          label={tc('date')}
          required
          defaultValue={toDateKey(today())}
        />
        <TextField
          id={`${uid}-time`}
          name="startTime"
          type="time"
          label={tc('time')}
          required
          step={900}
          defaultValue="09:00"
        />

        <SelectField id={`${uid}-every`} name="everyDays" label={t('everyDays')} defaultValue={7}>
          {INTERVALS.map((days) => (
            <option key={days} value={days}>
              {t('everyDaysOption', { days })}
            </option>
          ))}
        </SelectField>

        <SelectField
          id={`${uid}-count`}
          name="count"
          label={t('howManyVisits')}
          value={count}
          onChange={(event) => setCount(Number(event.target.value))}
        >
          {Array.from({ length: pending }, (_, index) => index + 1).map((option) => (
            <option key={option} value={option}>
              {t('stepCount', { count: option })}
            </option>
          ))}
        </SelectField>
      </div>

      {/* Both optional, exactly as they are on the booking form: a single-chair
          practice never fills them in, and the conflict check then treats the
          whole clinic as one resource. */}
      {staff.length > 0 ? (
        <SelectField id={`${uid}-staff`} name="staffUserId" label={ta('provider')} defaultValue="">
          <option value="">{ta('selectProvider')}</option>
          {staff.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </SelectField>
      ) : null}

      {operatories.length > 0 ? (
        <SelectField
          id={`${uid}-operatory`}
          name="operatoryId"
          label={ta('operatory')}
          defaultValue=""
        >
          <option value="">{ta('selectOperatory')}</option>
          {operatories.map((room) => (
            <option key={room.id} value={room.id}>
              {room.name}
            </option>
          ))}
        </SelectField>
      ) : null}
    </FormDialog>
  );
}
