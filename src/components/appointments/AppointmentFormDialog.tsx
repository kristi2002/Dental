'use client';

import { CalendarPlus, Pencil, TriangleAlert, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { FormDialog } from '@/components/ui/FormDialog';
import { PatientPicker } from '@/components/patients/PatientPicker';
import { saveAppointment } from '@/lib/actions/appointments';
import { byDepartment } from '@/lib/catalog';
import { SlotFinder } from './SlotFinder';

export type PatientOption = {
  id: string;
  name: string;
  /** Shown beside the name, because two people in a small town share one. */
  phone?: string;
};
export type ServiceOption = {
  id: string;
  name: string;
  /** Department this treatment belongs to. Empty when it has not been filed. */
  category: string;
  durationMin: number;
};

export type StaffOption = { id: string; name: string };
export type OperatoryOption = { id: string; name: string };

export type AppointmentDefaults = {
  id: string;
  patientId: string;
  /** `YYYY-MM-DD` */
  date: string;
  startTime: string;
  durationMin: number;
  status: string;
  serviceName: string;
  notes: string;
  staffUserId: string;
  operatoryId: string;
};

/** A stretch of free time this booking is meant to fill. */
export type BookingSlot = { startTime: string; endTime: string; minutes: number };

const STATUSES = ['SCHEDULED', 'ARRIVED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] as const;

export function AppointmentFormDialog({
  defaultPatient,
  services,
  staff = [],
  operatories = [],
  appointment,
  defaultDate,
  defaultStartTime,
  defaultStaffUserId,
  slot,
  planStepId,
  canCreatePatient = false,
  triggerClassName,
  triggerLabel,
  compact = false,
}: {
  /**
   * Who this booking is for, when the screen already knows. Left out, the
   * picker searches — see `PatientPicker` for why this is no longer a list.
   */
  defaultPatient?: PatientOption;
  services: ServiceOption[];
  /** Dentists this can be booked with. Empty in a single-dentist practice. */
  staff?: StaffOption[];
  /** Chairs. Empty until the practice defines more than one. */
  operatories?: OperatoryOption[];
  appointment?: AppointmentDefaults;
  /** Pre-selected dentist, e.g. when booking from a filtered calendar. */
  defaultStaffUserId?: string;
  /** `YYYY-MM-DD` used when creating from a specific calendar day. */
  defaultDate?: string;
  /** `HH:MM` used when creating from a specific slot in the day. */
  defaultStartTime?: string;
  /** When booking into a known gap: bounds the time field and shows what is left. */
  slot?: BookingSlot;
  /**
   * The treatment-plan step this booking fulfils. Saving binds the two, so
   * completing the appointment ticks the step off without anybody saying so
   * twice on two different screens.
   */
  planStepId?: string;
  /** Offer "new patient" inline. Requires the person to be allowed to add patients. */
  canCreatePatient?: boolean;
  triggerClassName?: string;
  /** Overrides the trigger's text, for rows where "New appointment" is too long. */
  triggerLabel?: string;
  compact?: boolean;
}) {
  const t = useTranslations('appointments');
  const tp = useTranslations('patients');
  const ts = useTranslations('services');
  const tc = useTranslations('common');
  const editing = Boolean(appointment);
  const uid = useId();

  // A new booking starts at half an hour, or at whatever a tight gap allows.
  const initialDuration = appointment?.durationMin ?? Math.min(30, slot?.minutes ?? 30);
  const initialDate = appointment?.date ?? defaultDate ?? '';
  const initialStartTime = appointment?.startTime ?? defaultStartTime ?? '09:00';
  const initialStaff = appointment?.staffUserId ?? defaultStaffUserId ?? '';

  // Picking a service pre-fills the duration — the dentist can still override it.
  const [duration, setDuration] = useState(initialDuration);
  // Day, time and dentist are held here rather than left to the DOM because the
  // slot finder writes into all three: choosing "Tue 19th, 09:00" from a list
  // has to land in the fields the form actually submits.
  const [date, setDate] = useState(initialDate);
  const [startTime, setStartTime] = useState(initialStartTime);
  const [staffUserId, setStaffUserId] = useState(initialStaff);

  // Follow the screen when the screen moves.
  //
  // These three used to be uncontrolled with a `defaultValue`, which a browser
  // re-reads while the field is untouched — so stepping the calendar to tomorrow
  // moved the date the button would book. Holding them in state bought the slot
  // finder somewhere to write, and would have quietly cost that: the dialog on
  // Thursday's page would still offer to book Tuesday. This is React's
  // adjust-state-during-render pattern, and it is deliberately keyed on the
  // *incoming* defaults rather than run in an effect, so the fields are already
  // right on the first paint rather than corrected after it.
  const [lastDefaults, setLastDefaults] = useState({
    date: initialDate,
    startTime: initialStartTime,
    staff: initialStaff,
  });
  if (
    lastDefaults.date !== initialDate ||
    lastDefaults.startTime !== initialStartTime ||
    lastDefaults.staff !== initialStaff
  ) {
    setLastDefaults({ date: initialDate, startTime: initialStartTime, staff: initialStaff });
    setDate(initialDate);
    setStartTime(initialStartTime);
    setStaffUserId(initialStaff);
  }
  // Seeded by matching the stored name, so an appointment booked before the id
  // existed acquires one the next time it is saved. A name that matches nothing
  // — a service since renamed or removed — resolves to no id and keeps the name.
  const [serviceId, setServiceId] = useState(
    () => services.find((s) => s.name === appointment?.serviceName)?.id ?? '',
  );
  // Set only after the server reports a clash, and cleared as soon as the dialog
  // closes: overriding a double-booking should be a decision, never a default.
  const [force, setForce] = useState(false);
  // Days between the appointments of a run — 0 for the ordinary single booking.
  const [repeat, setRepeat] = useState(0);
  const [repeatCount, setRepeatCount] = useState(4);
  // The patient select mirrors itself into state so the inline fields can appear.
  // It stays uncontrolled so that FormDialog can put values back after a refusal.
  const [addingPatient, setAddingPatient] = useState(false);

  // The whole point of showing a gap: booking into it leaves the rest bookable.
  const remaining = slot ? slot.minutes - duration : 0;

  return (
    <FormDialog
      key={appointment?.id ?? 'new'}
      action={saveAppointment}
      resetOnSuccess={!editing}
      onClose={() => {
        setDuration(initialDuration);
        setDate(initialDate);
        setStartTime(initialStartTime);
        setStaffUserId(initialStaff);
        setServiceId(services.find((s) => s.name === appointment?.serviceName)?.id ?? '');
        setForce(false);
        setAddingPatient(false);
        setRepeat(0);
      }}
      title={editing ? t('edit') : t('new')}
      submitLabel={tc('save')}
      pendingLabel={tc('saving')}
      cancelLabel={tc('cancel')}
      closeLabel={tc('close')}
      // The tooltip follows the label rather than restating the default: a
      // button that reads "Book" and hovers "New appointment" is two names for
      // one control, and assistive technology takes the one the eye cannot see.
      triggerTitle={editing ? t('edit') : (triggerLabel ?? t('new'))}
      triggerClassName={triggerClassName ?? (editing ? 'btn btn-secondary' : 'btn btn-primary')}
      trigger={
        editing ? (
          <>
            <Pencil size={19} aria-hidden />
            {compact ? <span className="sr-only">{t('edit')}</span> : tc('edit')}
          </>
        ) : (
          <>
            <CalendarPlus size={20} aria-hidden />
            {triggerLabel ?? t('new')}
          </>
        )
      }
    >
      {(state) => (
        <>
          {appointment ? <input type="hidden" name="id" value={appointment.id} /> : null}
          {force ? <input type="hidden" name="force" value="1" /> : null}
          {planStepId ? <input type="hidden" name="planStepId" value={planStepId} /> : null}

          {slot ? (
            <p className="rounded-lg border border-brand/30 bg-brand-soft px-3 py-2 font-semibold text-brand-deep">
              {t('slotHint', {
                from: slot.startTime,
                to: slot.endTime,
                minutes: slot.minutes,
              })}
            </p>
          ) : null}

          <PatientPicker
            name="patientId"
            label={t('patient')}
            required
            defaultPatient={defaultPatient}
            // Booking someone who has never been here is the common case at the
            // front desk, so it is offered inline rather than on another screen.
            allowNew={canCreatePatient && !editing}
            onNewChange={setAddingPatient}
          />

          {addingPatient ? (
            <fieldset className="space-y-4 rounded-lg border border-brand/40 bg-brand-soft/40 p-3.5">
              <legend className="flex items-center gap-2 px-1 font-bold text-brand-deep">
                <UserPlus size={18} aria-hidden />
                {t('newPatientTitle')}
              </legend>
              <p className="text-[0.9rem] text-ink-soft">{t('newPatientHint')}</p>

              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  id={`${uid}-newFirstName`}
                  name="newPatientFirstName"
                  label={tp('firstName')}
                  required
                  autoComplete="off"
                />
                <TextField
                  id={`${uid}-newLastName`}
                  name="newPatientLastName"
                  label={tp('lastName')}
                  required
                  autoComplete="off"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  id={`${uid}-newPhone`}
                  name="newPatientPhone"
                  type="tel"
                  inputMode="tel"
                  label={tp('phone')}
                  required
                  placeholder="069 12 34 567"
                />
                <TextField
                  id={`${uid}-newDateOfBirth`}
                  name="newPatientDateOfBirth"
                  type="date"
                  label={tp('dateOfBirth')}
                  optional={tc('optional')}
                />
              </div>

              <TextField
                id={`${uid}-newEmail`}
                name="newPatientEmail"
                type="email"
                label={tp('email')}
                optional={tc('optional')}
              />
            </fieldset>
          ) : null}

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
              min={slot?.startTime}
              max={slot?.endTime}
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

          {/* Offered only when the slot is not already decided: booking into a
              gap somebody picked off the free-time card has its answer. */}
          {slot ? null : (
            <SlotFinder
              minutes={duration}
              staffUserId={staffUserId}
              fromDate={date}
              onPick={(pickedDate, pickedTime) => {
                setDate(pickedDate);
                setStartTime(pickedTime);
              }}
            />
          )}

          {/* The arithmetic the receptionist would otherwise do in their head:
              an hour free, a half-hour treatment, half an hour still to sell. */}
          {slot ? (
            <p
              className={
                remaining < 0
                  ? 'rounded-lg border border-warn bg-warn-soft px-3 py-2 font-semibold text-warn'
                  : 'text-[0.95rem] font-semibold text-ink-soft'
              }
            >
              {remaining > 0
                ? t('slotRemaining', { used: duration, left: remaining })
                : remaining === 0
                  ? t('slotExact')
                  : t('slotOverruns', { over: -remaining })}
            </p>
          ) : null}

          {/* The catalogue id travels beside the name.

              The select still submits the name, because the name is the
              snapshot the row prints and a service renamed later must not
              rewrite what the diary says. The id is what anything counting
              groups by — and it is resolved here, from the same list the option
              came from, rather than matched back from text on the server. */}
          <input type="hidden" name="serviceId" value={serviceId} />

          <SelectField
            id={`${uid}-service`}
            name="serviceName"
            label={t('service')}
            optional={tc('optional')}
            defaultValue={appointment?.serviceName ?? ''}
            onChange={(event) => {
              const match = services.find((s) => s.name === event.target.value);
              setServiceId(match?.id ?? '');
              if (match) setDuration(match.durationMin);
            }}
          >
            <option value="">{t('selectService')}</option>
            {byDepartment(services).map(({ department, items }) => (
              <optgroup key={department || 'none'} label={department || ts('uncategorized')}>
                {items.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name} · {s.durationMin} {tc('minutes')}
                  </option>
                ))}
              </optgroup>
            ))}
          </SelectField>

          {/* Only worth asking once there is a choice: a solo dentist with one
              room would be answering the same question forever. */}
          {staff.length > 1 || operatories.length > 1 ? (
            <div
              className={
                staff.length > 1 && operatories.length > 1
                  ? 'grid gap-4 sm:grid-cols-2'
                  : undefined
              }
            >
              {staff.length > 1 ? (
                <SelectField
                  id={`${uid}-staff`}
                  name="staffUserId"
                  label={t('provider')}
                  optional={tc('optional')}
                  value={staffUserId}
                  onChange={(event) => setStaffUserId(event.target.value)}
                >
                  <option value="">{t('selectProvider')}</option>
                  {staff.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </SelectField>
              ) : null}

              {operatories.length > 1 ? (
                <SelectField
                  id={`${uid}-operatory`}
                  name="operatoryId"
                  label={t('operatory')}
                  optional={tc('optional')}
                  defaultValue={appointment?.operatoryId ?? ''}
                >
                  <option value="">{t('selectOperatory')}</option>
                  {operatories.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name}
                    </option>
                  ))}
                </SelectField>
              ) : null}
            </div>
          ) : null}

          <SelectField
            id={`${uid}-status`}
            name="status"
            label={t('status')}
            defaultValue={appointment?.status ?? 'SCHEDULED'}
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(`status_${status}`)}
              </option>
            ))}
          </SelectField>

          <TextAreaField
            id={`${uid}-notes`}
            name="notes"
            label={t('notes')}
            optional={tc('optional')}
            rows={3}
            defaultValue={appointment?.notes}
          />

          {/* A course of treatment booked as a course.
              Only when creating: turning one existing appointment into eight is
              not an edit, and a run already booked is changed one slot at a
              time. Hidden behind a select set to "no" so the ordinary single
              booking is unchanged by its existence. */}
          {editing ? null : (
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                id={`${uid}-repeat`}
                name="repeatEveryDays"
                label={t('repeat')}
                value={repeat}
                onChange={(event) => setRepeat(Number(event.target.value))}
              >
                <option value={0}>{t('repeatNone')}</option>
                {[7, 14, 21, 28, 42, 56, 84].map((days) => (
                  <option key={days} value={days}>
                    {t('repeatEvery', { weeks: days / 7 })}
                  </option>
                ))}
              </SelectField>

              {repeat > 0 ? (
                <TextField
                  id={`${uid}-repeatCount`}
                  name="repeatCount"
                  type="number"
                  min={2}
                  max={24}
                  label={t('repeatCount')}
                  value={repeatCount}
                  onChange={(event) => setRepeatCount(Number(event.target.value))}
                />
              ) : null}
            </div>
          )}

          {/* Said before the press, not discovered afterwards: a run at a fixed
              interval will land on a closed day or somebody else's slot sooner
              or later, and those dates are left unbooked rather than
              double-booked. */}
          {repeat > 0 ? (
            <p className="text-[0.92rem] text-ink-soft">{t('repeatHint')}</p>
          ) : null}

          {/* Both warnings are reported, not enforced, and both are overridden
              the same way — one deliberate tap. Squeezing in an emergency is a
              real decision a dentist makes, and so is fitting a crown the lab
              says it will deliver early. The message above says which it is. */}
          {state.status === 'error' &&
          (state.code === 'overlap' || state.code === 'labPending') ? (
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
