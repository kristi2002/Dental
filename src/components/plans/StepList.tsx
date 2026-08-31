'use client';

import {
  ArrowDownToLine,
  ArrowUpToLine,
  CalendarCheck,
  Check,
  ChevronDown,
  ChevronUp,
  GripVertical,
  RotateCcw,
  SkipForward,
  Trash2,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState, useTransition, type ReactNode } from 'react';
import type { ServiceOption } from '@/components/appointments/AppointmentFormDialog';
import type { ChartedTeeth } from '@/components/dental/ToothPicker';
import { useDateNames } from '@/components/shared/DateNamesProvider';
import { ReportingActionForm } from '@/components/ui/ActionForm';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { TreatmentStepStatus } from '@/generated/prisma/enums';
import { Link } from '@/i18n/navigation';
import { deleteStep, reorderSteps, setStepStatus } from '@/lib/actions/plans';
import { IDLE_STATE } from '@/lib/actions/types';
import { toDateKey } from '@/lib/dates';
import { moveInList, targetIndex, type StepMove } from '@/lib/plan-steps';
import { toothLabel, type ToothNumbering } from '@/lib/teeth';
import { cn } from '@/lib/utils';
import { StepFormDialog } from './StepFormDialog';

/** One step, as any screen that lists them needs to show and move it. */
export type StepView = {
  id: string;
  title: string;
  toothNum: number | null;
  notes: string;
  status: TreatmentStepStatus;
  /** The catalogue entry, so editing the step opens on the right chip. */
  serviceId: string | null;
  /**
   * A slot is bound to this step at all. `TreatmentStep.appointmentId` is
   * unique, so a second booking would have nothing to bind itself to — the
   * button has to disappear on the strength of the link existing, not on the
   * strength of the slot still being a promise.
   */
  linked: boolean;
  /** That slot, when it is still ahead and still standing. */
  booked: { date: Date; startTime: string } | null;
};

/**
 * The steps of one plan, in order, with the order editable.
 *
 * Reordering was a pair of arrows posting a neighbour swap: one request per
 * position, each one revalidating the whole application and re-rendering the
 * page underneath, so the row slid out from under the button between the first
 * press and the second. Moving a step four places meant four presses and four
 * chances to hit the wrong one.
 *
 * Here the list moves in the browser and the finished order is saved once — a
 * drag of any distance costs one request. Three ways in, because a plan is
 * reordered on a desk, on a tablet at the chair and by whoever cannot use a
 * mouse at all:
 *
 *  - drag the handle;
 *  - focus it and press Space, then the arrow keys, then Space again;
 *  - or use the four *move* rows in each step's own menu, which need neither a
 *    pointer nor a held key and are the only ones that work under a finger.
 *
 * Shared by the patient's plans tab and the expanded row on the practice-wide
 * list, because two implementations of "which step comes next" is the kind of
 * disagreement nobody reports and everybody stops trusting.
 */
export function StepList({
  planId,
  steps,
  canEdit,
  canDelete,
  services = [],
  charted = {},
  numbering = 'FDI',
  bookSlots,
  compact = false,
}: {
  planId: string;
  steps: StepView[];
  canEdit: boolean;
  canDelete: boolean;
  services?: ServiceOption[];
  charted?: ChartedTeeth;
  numbering?: ToothNumbering;
  /**
   * The booking dialog for each step, by step id, rendered on the server.
   *
   * A render prop would be simpler and cannot cross into a client component;
   * `AppointmentFormDialog` needs the patient list, the catalogue, the providers
   * and the chairs, and none of that belongs to a plan. So the server builds the
   * elements and this list only decides which of them to show.
   */
  bookSlots?: Record<string, ReactNode>;
  /** Tighter rows, for the practice-wide list where the plan is one of many. */
  compact?: boolean;
}) {
  const t = useTranslations('plans');
  const tc = useTranslations('common');
  const tt = useTranslations('teeth');
  // See `lib/date-names.ts`: a month name must not be asked of the browser.
  const dates = useDateNames();

  // The order as the browser has it, which is ahead of the server for as long as
  // a save is in flight. `sent` is what we last told the server; when the props
  // come back carrying a different set of steps — one added, one deleted,
  // somebody else's reorder — that is news rather than an echo, and it wins.
  const [order, setOrder] = useState(() => steps.map((step) => step.id));
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const sent = useRef<string | null>(null);

  const serverIds = steps.map((step) => step.id);
  const serverKey = serverIds.join(',');
  const [seenKey, setSeenKey] = useState(serverKey);

  // Adjusted during the render that notices, rather than in an effect: an effect
  // would paint the stale order once and then correct it, which on a list is a
  // visible jump. When the change is our own save coming back the two already
  // agree and there is nothing to do; anything else — a step added, one deleted,
  // somebody else's reorder — is news, and news wins over what this tab holds.
  if (serverKey !== seenKey) {
    setSeenKey(serverKey);
    if (serverKey !== sent.current) setOrder(serverIds);
  }

  const byId = new Map(steps.map((step) => [step.id, step]));
  // Anything the server knows about that our order has not heard of yet goes on
  // the end, so a step added in another tab is never invisible.
  const ordered = [
    ...order.map((id) => byId.get(id)).filter((step): step is StepView => Boolean(step)),
    ...steps.filter((step) => !order.includes(step.id)),
  ];

  /** What the screen reader is told after a move. Cleared once it has spoken. */
  const [announcement, setAnnouncement] = useState('');
  /** The step the keyboard is currently carrying, if any. */
  const [held, setHeld] = useState<string | null>(null);
  /** The step being dragged with a pointer, and the row it is hovering over. */
  const dragging = useRef<string | null>(null);

  function save(ids: string[]) {
    setError(null);
    sent.current = ids.join(',');

    const body = new FormData();
    body.set('planId', planId);
    body.set('order', JSON.stringify(ids));

    startSaving(async () => {
      const result = await reorderSteps(IDLE_STATE, body);
      if (result.status === 'error') {
        // Put it back the way the server has it. A list that keeps showing an
        // order the database refused is worse than one that snaps back.
        sent.current = null;
        setOrder(serverIds);
        setError(result.message);
      }
    });
  }

  function apply(id: string, move: StepMove) {
    const from = order.indexOf(id);
    if (from < 0) return;

    const to = targetIndex(from, move, order.length);
    if (to === from) return;

    const next = moveInList(order, from, to);
    setOrder(next);
    setAnnouncement(
      t('movedTo', {
        title: byId.get(id)?.title ?? '',
        position: to + 1,
        total: next.length,
      }),
    );
    save(next);
  }

  function dropOn(targetId: string) {
    const id = dragging.current;
    dragging.current = null;
    if (!id || id === targetId) return;

    const from = order.indexOf(id);
    const to = order.indexOf(targetId);
    if (from < 0 || to < 0) return;

    const next = moveInList(order, from, to);
    setOrder(next);
    setAnnouncement(
      t('movedTo', {
        title: byId.get(id)?.title ?? '',
        position: to + 1,
        total: next.length,
      }),
    );
    save(next);
  }

  function onHandleKeyDown(event: React.KeyboardEvent, id: string) {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      setHeld((current) => (current === id ? null : id));
      setAnnouncement(
        held === id
          ? t('dropped', { title: byId.get(id)?.title ?? '' })
          : t('grabbed', { title: byId.get(id)?.title ?? '' }),
      );
      return;
    }
    if (event.key === 'Escape' && held === id) {
      event.preventDefault();
      setHeld(null);
      return;
    }
    if (held !== id) return;

    // Only while the step is actually being carried, so a plain arrow key still
    // moves the focus down the list the way it does everywhere else.
    const move: StepMove | null =
      event.key === 'ArrowUp'
        ? event.metaKey || event.ctrlKey
          ? 'top'
          : 'up'
        : event.key === 'ArrowDown'
          ? event.metaKey || event.ctrlKey
            ? 'bottom'
            : 'down'
          : null;
    if (!move) return;

    event.preventDefault();
    apply(id, move);
  }

  const tooth = (num: number) => tt('tooth', { num: toothLabel(num, numbering) });

  return (
    <div>
      {/* Every move, said out loud once. Without this a reorder is a silent
          change of a list somebody cannot see. */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <ol className={cn('space-y-1.5', saving && 'opacity-70 transition-opacity')}>
        {ordered.map((step, index) => {
          const isDone = step.status === TreatmentStepStatus.DONE;
          const isSkipped = step.status === TreatmentStepStatus.SKIPPED;
          const isHeld = held === step.id;

          return (
            // The drop target is the `div`, not the `li`: a list item has a
            // non-interactive role, and hanging pointer handlers off one is the
            // pattern that leaves a feature mouse-only. The handle inside is the
            // interactive element, and it is a button.
            <li key={step.id}>
              <div
                onDragOver={(event) => {
                  if (dragging.current) event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  dropOn(step.id);
                }}
                className={cn(
                  'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3',
                  compact ? 'py-1.5' : 'py-2',
                  isDone
                    ? 'border-ok/30 bg-ok-soft'
                    : isSkipped
                      ? 'border-line bg-paper opacity-70'
                      : 'border-line-strong bg-surface',
                  // A carried step looks carried, for as long as it is being
                  // carried. Otherwise the arrow keys move something invisible.
                  isHeld && 'ring-2 ring-brand ring-offset-1',
                )}
              >
                {canEdit ? (
                  <button
                    type="button"
                    draggable
                    onDragStart={() => {
                      dragging.current = step.id;
                    }}
                    onDragEnd={() => {
                      dragging.current = null;
                    }}
                    onKeyDown={(event) => onHandleKeyDown(event, step.id)}
                    onBlur={() => setHeld((current) => (current === step.id ? null : current))}
                    aria-pressed={isHeld}
                    aria-describedby={`${planId}-reorder-help`}
                    title={t('reorderHandle')}
                    className={cn(
                      'shrink-0 cursor-grab rounded-md p-1 text-ink-faint',
                      'hover:bg-paper hover:text-ink focus-visible:bg-paper',
                      isHeld && 'cursor-grabbing text-brand-deep',
                    )}
                  >
                    <GripVertical size={16} aria-hidden />
                    <span className="sr-only">{t('reorderStep', { title: step.title })}</span>
                  </button>
                ) : null}

                <span
                  aria-hidden
                  className="grid size-7 shrink-0 place-items-center rounded-full bg-surface text-meta font-bold text-ink-soft"
                >
                  {index + 1}
                </span>

                <div className="min-w-0 flex-1 basis-48">
                  <p
                    className={cn(
                      'text-body font-semibold',
                      isDone ? 'text-ok' : isSkipped ? 'text-ink-faint line-through' : 'text-ink',
                    )}
                  >
                    {step.title}
                    {step.toothNum ? (
                      <span className="ml-2 text-meta font-normal text-ink-soft">
                        {tooth(step.toothNum)}
                      </span>
                    ) : null}
                  </p>
                  {step.notes && !compact ? (
                    <p className="text-meta text-ink-soft">{step.notes}</p>
                  ) : null}

                  {/* The slot it is booked into — as a link into the diary, not as
                    a printed string. The plan and the calendar are two accounts
                    of the same treatment and only one of them can be changed. */}
                  {step.booked ? (
                    <Link
                      href={`/appointments?view=day&date=${toDateKey(step.booked.date)}`}
                      className="flex items-center gap-1.5 text-meta font-semibold text-brand-deep no-underline tabular-nums hover:underline"
                    >
                      <CalendarCheck size={15} aria-hidden />
                      {t('bookedOn', {
                        date: dates.date(step.booked.date, 'dayMonthShort'),
                        time: step.booked.startTime,
                      })}
                    </Link>
                  ) : null}
                </div>

                {canEdit ? (
                  <div className="flex items-center gap-1">
                    {isDone || isSkipped ? (
                      <ReportingActionForm
                        action={setStepStatus}
                        values={{
                          id: step.id,
                          status: TreatmentStepStatus.PENDING,
                        }}
                      >
                        <button type="submit" className="btn btn-ghost btn-sm" title={t('reopen')}>
                          <RotateCcw size={16} aria-hidden />
                          <span className="sr-only">{t('reopen')}</span>
                        </button>
                      </ReportingActionForm>
                    ) : (
                      <>
                        {/* Booking is offered only while the step is still
                          outstanding and not already in the diary — the relation
                          is one-to-one, so a second booking would have nothing to
                          bind itself to. */}
                        {!step.linked ? bookSlots?.[step.id] : null}

                        <ReportingActionForm
                          action={setStepStatus}
                          values={{
                            id: step.id,
                            status: TreatmentStepStatus.DONE,
                          }}
                        >
                          <button type="submit" className="btn btn-secondary btn-sm">
                            <Check size={16} aria-hidden />
                            {t('markDone')}
                          </button>
                        </ReportingActionForm>

                        <ReportingActionForm
                          action={setStepStatus}
                          values={{
                            id: step.id,
                            status: TreatmentStepStatus.SKIPPED,
                          }}
                        >
                          <button type="submit" className="btn btn-ghost btn-sm" title={t('skip')}>
                            <SkipForward size={16} aria-hidden />
                            <span className="sr-only">{t('skip')}</span>
                          </button>
                        </ReportingActionForm>
                      </>
                    )}

                    {/* Seven buttons made every step look equally urgent. The two
                      pressed all day stay out here; moving, editing and deleting
                      — and the only reorder that works under a finger — come in
                      behind one. */}
                    <ActionMenu label={tc('moreActions')} triggerClassName="btn btn-ghost btn-sm">
                      <button
                        type="button"
                        role="menuitem"
                        className="menu-item"
                        disabled={index === 0}
                        onClick={() => apply(step.id, 'top')}
                      >
                        <ArrowUpToLine size={18} aria-hidden className="shrink-0" />
                        {t('moveTop')}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="menu-item"
                        disabled={index === 0}
                        onClick={() => apply(step.id, 'up')}
                      >
                        <ChevronUp size={18} aria-hidden className="shrink-0" />
                        {t('moveUp')}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="menu-item"
                        disabled={index === ordered.length - 1}
                        onClick={() => apply(step.id, 'down')}
                      >
                        <ChevronDown size={18} aria-hidden className="shrink-0" />
                        {t('moveDown')}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="menu-item"
                        disabled={index === ordered.length - 1}
                        onClick={() => apply(step.id, 'bottom')}
                      >
                        <ArrowDownToLine size={18} aria-hidden className="shrink-0" />
                        {t('moveBottom')}
                      </button>

                      <div className="border-t border-line">
                        <StepFormDialog
                          planId={planId}
                          services={services}
                          charted={charted}
                          numbering={numbering}
                          triggerClassName="menu-item"
                          step={{
                            id: step.id,
                            title: step.title,
                            toothNum: step.toothNum,
                            notes: step.notes,
                            serviceId: step.serviceId,
                          }}
                        />
                      </div>

                      {canDelete || step.status !== TreatmentStepStatus.DONE ? (
                        <ReportingActionForm
                          action={deleteStep}
                          values={{ id: step.id }}
                          confirmMessage={tc('confirmDelete')}
                          className="block border-t border-line"
                        >
                          <button
                            type="submit"
                            role="menuitem"
                            className="menu-item menu-item-danger"
                          >
                            <Trash2 size={18} aria-hidden className="shrink-0" />
                            {tc('delete')}
                          </button>
                        </ReportingActionForm>
                      ) : null}
                    </ActionMenu>
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      {canEdit ? (
        <p id={`${planId}-reorder-help`} className="mt-1.5 text-meta text-ink-faint">
          {t('reorderHint')}
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mt-2 rounded-lg border border-danger bg-danger-soft px-3 py-2 font-semibold text-danger"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
