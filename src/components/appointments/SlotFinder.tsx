'use client';

import { CalendarSearch, Loader2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { findNextSlots } from '@/lib/actions/appointments';
import { fromDateKey } from '@/lib/dates';
import type { DatedGap } from '@/lib/scheduling';

/**
 * "When is your first free hour?" — answered in one press.
 *
 * The diary could only ever be asked about one day at a time, so the question
 * the front desk is actually asked over the counter was answered by paging the
 * calendar and reading each grid. For a practice booked three weeks out that is
 * twenty page loads to find one slot, which is why the honest answer usually
 * became "let me call you back".
 *
 * Deliberately asked *after* the treatment is chosen: the duration is what makes
 * a gap a fit or a waste of a phone call, and it is the field that changes when
 * somebody picks a different treatment. Answers are therefore fetched on demand
 * rather than rendered with the page.
 */
export function SlotFinder({
  minutes,
  staffUserId,
  fromDate,
  onPick,
}: {
  /** How long the booking needs. Nothing shorter is offered. */
  minutes: number;
  /** Whose diary to search. Empty searches the practice as a whole. */
  staffUserId?: string;
  /** `YYYY-MM-DD` to start from — the day being looked at, not necessarily today. */
  fromDate?: string;
  /** Told which slot was chosen, as `YYYY-MM-DD` and `HH:MM`. */
  onPick: (date: string, startTime: string) => void;
}) {
  const t = useTranslations('appointments');
  const tc = useTranslations('common');
  const format = useFormatter();

  const [slots, setSlots] = useState<DatedGap[] | null>(null);
  const [pending, startTransition] = useTransition();

  const search = () => {
    startTransition(async () => {
      setSlots(await findNextSlots({ minutes, staffUserId, fromDate }));
    });
  };

  return (
    <div className="rounded-lg border border-line bg-surface-soft p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={search} className="btn btn-secondary btn-sm" disabled={pending}>
          {pending ? (
            <Loader2 size={17} aria-hidden className="animate-spin" />
          ) : (
            <CalendarSearch size={17} aria-hidden />
          )}
          {t('findSlot')}
        </button>
        <span className="text-[0.9rem] text-ink-soft">
          {t('findSlotFor', { minutes })}
        </span>
      </div>

      {/* Only after a search: an empty list before one has run would read as
          "nothing free for a month", which is a different and much worse claim. */}
      {slots !== null ? (
        slots.length === 0 ? (
          <p className="mt-2.5 text-[0.92rem] font-semibold text-warn">{t('findSlotNone')}</p>
        ) : (
          <ul className="mt-2.5 flex flex-wrap gap-2">
            {slots.map((slot) => (
              <li key={`${slot.date}-${slot.startTime}`}>
                <button
                  type="button"
                  onClick={() => onPick(slot.date, slot.startTime)}
                  className="btn btn-secondary btn-sm tabular-nums"
                >
                  {format.dateTime(fromDateKey(slot.date), {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  })}
                  {' · '}
                  {slot.startTime}
                  <span className="font-normal text-ink-faint">
                    ({slot.minutes} {tc('minutes')})
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
