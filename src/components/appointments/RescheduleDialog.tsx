'use client';

import { CalendarSync, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { TextField } from '@/components/ui/Field';
import { FormDialog } from '@/components/ui/FormDialog';
import { rescheduleAppointment } from '@/lib/actions/appointments';
import { SlotFinder } from './SlotFinder';

/**
 * Move an appointment, as its own act rather than as an edit.
 *
 * Editing the date on a booking rewrites the row: the slot that was promised
 * stops having existed, and the fourth time somebody asks to move the same
 * appointment nothing on the screen says it is the fourth. This writes the move
 * as what it is — one slot called off, one slot created pointing back at it —
 * and the row it creates carries a "moved" mark for the next person to read.
 *
 * The fields are only the ones a move actually changes. Treatment, dentist,
 * chair and notes travel across untouched; changing those is what editing is
 * for, and asking about them again here would be four more chances to lose one.
 */
export function RescheduleDialog({
  appointment,
  triggerClassName,
  compact = false,
}: {
  appointment: {
    id: string;
    /** `YYYY-MM-DD` */
    date: string;
    startTime: string;
    durationMin: number;
    staffUserId: string;
  };
  triggerClassName?: string;
  compact?: boolean;
}) {
  const t = useTranslations('appointments');
  const tc = useTranslations('common');
  const uid = useId();

  const [date, setDate] = useState(appointment.date);
  const [startTime, setStartTime] = useState(appointment.startTime);
  const [duration, setDuration] = useState(appointment.durationMin);
  const [force, setForce] = useState(false);

  return (
    <FormDialog
      action={rescheduleAppointment}
      resetOnSuccess={false}
      onClose={() => {
        setDate(appointment.date);
        setStartTime(appointment.startTime);
        setDuration(appointment.durationMin);
        setForce(false);
      }}
      title={t('move')}
      submitLabel={t('moveConfirm')}
      pendingLabel={tc('saving')}
      cancelLabel={tc('cancel')}
      closeLabel={tc('close')}
      triggerTitle={t('move')}
      triggerClassName={triggerClassName ?? 'btn btn-secondary btn-sm'}
      trigger={
        <>
          <CalendarSync size={18} aria-hidden />
          {compact ? <span className="sr-only">{t('move')}</span> : t('move')}
        </>
      }
    >
      {(state) => (
        <>
          <input type="hidden" name="id" value={appointment.id} />
          {force ? <input type="hidden" name="force" value="1" /> : null}

          <p className="rounded-lg border border-line bg-surface-soft px-3 py-2 text-[0.95rem] text-ink-soft">
            {t('moveFrom', { date: appointment.date, time: appointment.startTime })}
          </p>

          <div className="grid gap-4 sm:grid-cols-3">
            <TextField
              id={`${uid}-date`}
              name="date"
              type="date"
              label={t('date')}
              required
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
            <TextField
              id={`${uid}-startTime`}
              name="startTime"
              type="time"
              label={t('startTime')}
              required
              step={300}
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
            />
            <TextField
              id={`${uid}-duration`}
              name="durationMin"
              type="number"
              min={5}
              step={5}
              label={`${t('duration')} (${tc('minutes')})`}
              required
              value={duration}
              onChange={(event) => setDuration(Number(event.target.value))}
            />
          </div>

          <SlotFinder
            minutes={duration}
            staffUserId={appointment.staffUserId}
            fromDate={date}
            onPick={(pickedDate, pickedTime) => {
              setDate(pickedDate);
              setStartTime(pickedTime);
            }}
          />

          {/* Why it moved, in the words somebody would say on the phone. Stored
              on the slot being vacated, which is the one that needs explaining. */}
          <TextField
            id={`${uid}-reason`}
            name="reason"
            label={t('moveReason')}
            optional={tc('optional')}
            maxLength={120}
          />

          {state.status === 'error' && state.code === 'overlap' ? (
            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-warn bg-warn-soft px-3 py-2.5 font-semibold text-warn">
              <input
                type="checkbox"
                checked={force}
                onChange={(event) => setForce(event.target.checked)}
                className="mt-1 size-4 shrink-0 accent-current"
              />
              <span className="flex items-start gap-1.5">
                <TriangleAlert size={18} aria-hidden className="mt-0.5 shrink-0" />
                {t('bookAnyway')}
              </span>
            </label>
          ) : null}
        </>
      )}
    </FormDialog>
  );
}
