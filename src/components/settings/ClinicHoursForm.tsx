'use client';

import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useId, useState } from 'react';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { saveClinicHours } from '@/lib/actions/settings';
import { IDLE_STATE } from '@/lib/actions/types';
import { WEEKDAY_ORDER, type DayHours } from '@/lib/clinic-hours';
import { cn } from '@/lib/utils';

/**
 * The week, as seven rows of "open / from / to / break". Editable in place
 * rather than one dialog per day: the thing a dentist wants to check is the
 * shape of the whole week, and seven dialogs to set it up would be seven
 * chances to leave one day wrong.
 */
export function ClinicHoursForm({
  week,
  canEdit,
  weekdayNames,
}: {
  week: DayHours[];
  canEdit: boolean;
  /**
   * Weekday label per index, rendered on the server.
   *
   * Formatting them here instead made this component the one place in the app
   * where a date string was produced in the browser, and Node's ICU and the
   * browser's do not always agree on how an Albanian weekday is capitalised —
   * which surfaced as a hydration mismatch on every load of this page.
   */
  weekdayNames: Record<number, string>;
}) {
  const t = useTranslations('settings');
  const tc = useTranslations('common');
  const uid = useId();

  const [state, formAction] = useActionState(saveClinicHours, IDLE_STATE);
  // Cleared whenever the form reports something new, so an override never
  // carries silently into the next save.
  const [force, setForce] = useState(false);
  const [open, setOpen] = useState<Record<number, boolean>>(
    Object.fromEntries(week.map((day) => [day.weekday, day.open])),
  );

  const byWeekday = new Map(week.map((day) => [day.weekday, day]));

  return (
    <form action={formAction}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[38rem] border-collapse text-left">
          <thead>
            <tr className="border-b-2 border-line">
              <th className="px-5 py-3 text-meta font-bold tracking-wide text-ink-faint uppercase">
                {t('day')}
              </th>
              <th className="px-3 py-3 text-meta font-bold tracking-wide text-ink-faint uppercase">
                {t('openFrom')}
              </th>
              <th className="px-3 py-3 text-meta font-bold tracking-wide text-ink-faint uppercase">
                {t('openTo')}
              </th>
              <th className="px-3 py-3 text-meta font-bold tracking-wide text-ink-faint uppercase">
                {t('breakColumn')}
              </th>
            </tr>
          </thead>
          <tbody>
            {WEEKDAY_ORDER.map((weekday) => {
              const day = byWeekday.get(weekday);
              if (!day) return null;

              const isOpen = open[weekday] ?? day.open;
              const rowId = `${uid}-${weekday}`;

              return (
                <tr
                  key={weekday}
                  className={cn('border-b border-line last:border-b-0', !isOpen && 'bg-paper')}
                >
                  <td className="px-5 py-2.5">
                    <label className="flex items-center gap-2.5 font-semibold text-ink">
                      <input
                        type="checkbox"
                        name={`open-${weekday}`}
                        value="1"
                        defaultChecked={day.open}
                        disabled={!canEdit}
                        onChange={(event) =>
                          setOpen((current) => ({ ...current, [weekday]: event.target.checked }))
                        }
                        className="size-5 accent-[var(--brand)]"
                      />
                      {weekdayNames[weekday]}
                    </label>
                  </td>

                  <td className="px-3 py-2.5">
                    <input
                      id={`${rowId}-open`}
                      name={`openTime-${weekday}`}
                      type="time"
                      defaultValue={day.openTime}
                      disabled={!canEdit || !isOpen}
                      aria-label={t('openFrom')}
                      className="field-input w-32 py-1.5 tabular-nums disabled:opacity-45"
                    />
                  </td>

                  <td className="px-3 py-2.5">
                    <input
                      id={`${rowId}-close`}
                      name={`closeTime-${weekday}`}
                      type="time"
                      defaultValue={day.closeTime}
                      disabled={!canEdit || !isOpen}
                      aria-label={t('openTo')}
                      className="field-input w-32 py-1.5 tabular-nums disabled:opacity-45"
                    />
                  </td>

                  {/* Both halves or neither — a break with one end typed is
                      discarded on save rather than half-applied. */}
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <input
                        id={`${rowId}-break-start`}
                        name={`breakStart-${weekday}`}
                        type="time"
                        defaultValue={day.breakStart ?? ''}
                        disabled={!canEdit || !isOpen}
                        aria-label={t('breakFrom')}
                        className="field-input w-32 py-1.5 tabular-nums disabled:opacity-45"
                      />
                      <span aria-hidden className="text-ink-faint">
                        –
                      </span>
                      <input
                        id={`${rowId}-break-end`}
                        name={`breakEnd-${weekday}`}
                        type="time"
                        defaultValue={day.breakEnd ?? ''}
                        disabled={!canEdit || !isOpen}
                        aria-label={t('breakTo')}
                        className="field-input w-32 py-1.5 tabular-nums disabled:opacity-45"
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {canEdit ? (
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line px-5 py-4">
          {force ? <input type="hidden" name="force" value="1" /> : null}

          {state.status === 'error' ? (
            <p role="alert" className="mr-auto font-semibold text-danger">
              {state.message}
            </p>
          ) : null}

          {/* Narrowing the week does not move the people already booked into
              the hours being removed — it only stops the calendar drawing them.
              Overridable, because shrinking the week and then rebooking is a
              normal order to work in. */}
          {state.status === 'error' && state.code === 'bookedOver' ? (
            <label className="flex w-full cursor-pointer items-start gap-2.5 rounded-lg border border-warn bg-warn-soft px-3 py-2.5 font-semibold text-warn">
              <input
                type="checkbox"
                checked={force}
                onChange={(event) => setForce(event.target.checked)}
                className="mt-1 size-4 shrink-0 accent-current"
              />
              <span className="flex items-start gap-1.5">
                <TriangleAlert size={18} aria-hidden className="mt-0.5 shrink-0" />
                {tc('saveAnyway')}
              </span>
            </label>
          ) : null}
          {state.status === 'ok' ? (
            <p role="status" className="mr-auto font-semibold text-ok">
              {t('saved')}
            </p>
          ) : null}
          <SubmitButton label={tc('save')} pendingLabel={tc('saving')} />
        </div>
      ) : null}
    </form>
  );
}
