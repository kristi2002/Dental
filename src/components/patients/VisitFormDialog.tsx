'use client';

import { NotebookPen } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import type {
  ServiceOption,
  StaffOption,
} from '@/components/appointments/AppointmentFormDialog';
import { MaterialSuggestions } from '@/components/patients/MaterialSuggestions';
import { SlotFinder } from '@/components/appointments/SlotFinder';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { FormDialog } from '@/components/ui/FormDialog';
import { saveVisit } from '@/lib/actions/patients';
import { byDepartment } from '@/lib/catalog';
import { cn, parseServiceList } from '@/lib/utils';

export function VisitFormDialog({
  patientId,
  services: catalog,
  staff = [],
  currentUserId,
  today,
  followUpDefault,
  canBook = false,
  canSpendStock = false,
  triggerClassName,
}: {
  patientId: string;
  /** Service catalog, offered as one-tap chips. */
  services: ServiceOption[];
  /** Dentists who could have done the work. Empty hides the question. */
  staff?: StaffOption[];
  /** Defaults the "treated by" answer to whoever is writing it up. */
  currentUserId?: string;
  /** `YYYY-MM-DD` default for the visit date. */
  today: string;
  /**
   * `YYYY-MM-DD` this patient is next due, from their own recall interval. The
   * whole point of asking here is that the answer is already known.
   */
  followUpDefault?: string;
  /** Whether this person may book. Without it the follow-up is not offered. */
  canBook?: boolean;
  /** Whether this person may take things off the shelf. */
  canSpendStock?: boolean;
  /** Lets a row render it as a small secondary button rather than a primary one. */
  triggerClassName?: string;
}) {
  const t = useTranslations('patients');
  const ta = useTranslations('appointments');
  const ts = useTranslations('services');
  const tc = useTranslations('common');
  const uid = useId();
  const [services, setServices] = useState('');

  // The next appointment, booked from the chair rather than remembered.
  //
  // The moment a follow-up actually gets booked is while the patient is still
  // sitting there — and nothing asked, so it fell through to the recall list
  // months later, by which time it is a phone call instead of a sentence. Off by
  // default: plenty of treatments finish a course, and a form that assumes
  // otherwise trains people to untick it.
  // `itemId:quantity` pairs — what will come off the shelf when this saves.
  const [materials, setMaterials] = useState('');
  const [booking, setBooking] = useState(false);
  const [followUpDate, setFollowUpDate] = useState(followUpDefault ?? '');
  const [followUpTime, setFollowUpTime] = useState('09:00');
  const [followUpMinutes, setFollowUpMinutes] = useState(30);

  const selected = parseServiceList(services);

  // Ids of the chips that are on, matched back from the text field so a name
  // typed by hand simply has no id — and stays out of the catalogue's figures.
  const selectedIds = catalog.filter((s) => selected.includes(s.name)).map((s) => s.id);

  function toggleService(name: string) {
    const next = selected.includes(name)
      ? selected.filter((s) => s !== name)
      : [...selected, name];
    setServices(next.join(', '));
  }

  return (
    <FormDialog
      action={saveVisit}
      onClose={() => {
        setServices('');
        setMaterials('');
        setBooking(false);
        setFollowUpDate(followUpDefault ?? '');
        setFollowUpTime('09:00');
        setFollowUpMinutes(30);
      }}
      title={t('addVisit')}
      submitLabel={tc('save')}
      pendingLabel={tc('saving')}
      cancelLabel={tc('cancel')}
      discardMessage={tc('discardUnsaved')}
      closeLabel={tc('close')}
      triggerClassName={triggerClassName}
      trigger={
        <>
          <NotebookPen size={20} aria-hidden />
          {t('addVisit')}
        </>
      }
    >
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="serviceIds" value={selectedIds.join(',')} />
      <input type="hidden" name="materials" value={materials} />

      <div className={staff.length > 1 ? 'grid gap-4 sm:grid-cols-2' : undefined}>
        <TextField
          id={`${uid}-date`}
          name="visitDate"
          type="date"
          label={t('visitDate')}
          required
          defaultValue={today}
        />

        {/* Recorded-by is stamped from the session; this is the separate question
            of who held the handpiece, which an assistant writing up the dentist's
            work would otherwise answer wrongly by omission. */}
        {staff.length > 1 ? (
          <SelectField
            id={`${uid}-performedBy`}
            name="performedById"
            label={t('performedBy')}
            defaultValue={currentUserId ?? ''}
          >
            {staff.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </SelectField>
        ) : null}
      </div>

      <TextAreaField
        id={`${uid}-notes`}
        name="notes"
        label={t('visitNotes')}
        required
        rows={4}
        defaultValue=""
      />

      <div>
        <TextField
          id={`${uid}-services`}
          name="services"
          label={t('visitServices')}
          hint={t('visitServicesHint')}
          value={services}
          onChange={(event) => setServices(event.target.value)}
        />

        {/* Split by department: a dentist recording a root canal looks under
            Endodontics, not down an alphabetical run of everything on offer. */}
        {catalog.length > 0 ? (
          <div className="mt-2.5 space-y-3">
            {byDepartment(catalog).map(({ department, items }) => (
              <div key={department || 'none'}>
                <p className="mb-1.5 text-[0.8rem] font-bold tracking-wide text-ink-faint uppercase">
                  {department || ts('uncategorized')}
                </p>
                <div className="flex flex-wrap gap-2">
                  {items.map((service) => {
                    const active = selected.includes(service.name);
                    return (
                      <button
                        key={service.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleService(service.name)}
                        className={cn(
                          'rounded-full border px-3 py-1.5 text-[0.9rem] font-semibold transition-colors',
                          active
                            ? 'border-brand-dark bg-brand-dark text-white'
                            : 'border-line-strong bg-surface text-ink-soft hover:border-ink hover:text-ink',
                        )}
                      >
                        {service.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* Appears only once a treatment is ticked, because it is an answer *about*
          the treatment — and vanishes again if the ticks are cleared. */}
      {canSpendStock ? (
        <MaterialSuggestions
          serviceIds={selectedIds}
          value={materials}
          onChange={setMaterials}
        />
      ) : null}

      {canBook ? (
        <div className="rounded-lg border border-line bg-surface-soft p-3.5">
          <label className="flex cursor-pointer items-center gap-2.5 font-bold text-ink">
            <input
              type="checkbox"
              checked={booking}
              onChange={(event) => setBooking(event.target.checked)}
              className="size-4 shrink-0 accent-brand-dark"
            />
            {t('bookFollowUp')}
          </label>

          {booking ? (
            <div className="mt-3 space-y-3.5">
              {/* Submitted only while the box is ticked: an unticked follow-up
                  must leave no field behind for the server to act on. */}
              <div className="grid gap-4 sm:grid-cols-3">
                <TextField
                  id={`${uid}-followUpDate`}
                  name="followUpDate"
                  type="date"
                  label={ta('date')}
                  required
                  value={followUpDate}
                  onChange={(event) => setFollowUpDate(event.target.value)}
                />
                <TextField
                  id={`${uid}-followUpTime`}
                  name="followUpStartTime"
                  type="time"
                  label={ta('startTime')}
                  required
                  step={300}
                  value={followUpTime}
                  onChange={(event) => setFollowUpTime(event.target.value)}
                />
                <TextField
                  id={`${uid}-followUpMinutes`}
                  name="followUpDurationMin"
                  type="number"
                  min={5}
                  step={5}
                  label={`${ta('duration')} (${tc('minutes')})`}
                  required
                  value={followUpMinutes}
                  onChange={(event) => setFollowUpMinutes(Number(event.target.value))}
                />
              </div>

              <SlotFinder
                minutes={followUpMinutes}
                fromDate={followUpDate || undefined}
                onPick={(pickedDate, pickedTime) => {
                  setFollowUpDate(pickedDate);
                  setFollowUpTime(pickedTime);
                }}
              />

              {/* A clash here is reported and then ignored: the note being
                  written up is the important half of this form, and refusing to
                  record a treatment because the follow-up slot was busy would
                  lose the wrong thing. See `saveVisit`. */}
              <p className="text-[0.9rem] text-ink-soft">{t('bookFollowUpHint')}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </FormDialog>
  );
}
