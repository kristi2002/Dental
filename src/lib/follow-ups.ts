/**
 * The follow-up board, minus the database and the screen.
 *
 * A follow-up is the practice's note to itself with a day attached: ring the lab
 * about a bridge, chase a referral, order more articaine before Friday. The app
 * was full of things that chase a *patient* — a recall, an appointment reminder,
 * a confirmation link — and had nothing at all that chases the practice, so that
 * job lived on the monitor bezel in biro.
 *
 * Everything here is pure so it can be tested without a database: what state a
 * line is in, what order a list of them reads in, what the bell should say, and
 * where a line points when it is pressed.
 */

import { addDays, addMonths, toDay, today } from './dates';

/** Long enough for a real errand, short enough to read in the bell's width. */
export const MAX_TITLE_LENGTH = 160;

/**
 * Room for a note that is now allowed to have structure.
 *
 * Was 1000, which was the right size for the two lines a textarea invited. Once
 * a note can carry a checklist, a supplier's address and the three things to
 * ask on the phone, that ceiling starts truncating mid-sentence — and silently,
 * because `clampNotes` cuts rather than refuses. Four thousand is still far
 * short of "this is a document"; it is about a screenful of prose.
 */
export const MAX_NOTES_LENGTH = 4000;

/**
 * What "later" is allowed to mean.
 *
 * Three choices, not a date picker, because snoozing happens with a phone in the
 * other hand — and a line pushed by an exact date is being rescheduled, which is
 * what editing it is for.
 */
export const SNOOZE_DAYS = [1, 3, 7] as const;

/**
 * Mirrors `FollowUpPriority` in the schema, written out rather than imported so
 * this module stays free of the generated client and can be run by the tests
 * directly. Prisma generates string enums, so the two are the same values.
 */
export type Priority = 'NORMAL' | 'URGENT';

/**
 * Mirrors `FollowUpRepeat` in the schema, written out for the reason `Priority`
 * is: this module is run directly by the tests and stays free of the generated
 * client.
 */
export type Repeat = 'WEEKLY' | 'FORTNIGHTLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';

/** Offered in this order, shortest first. The form's whole vocabulary. */
export const REPEATS = ['WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'] as const;

/**
 * When a repeating errand comes back.
 *
 * Counted **from the day it was due, not from the day it was ticked**, and that
 * is the whole design. A monthly stock order done three days late is still a
 * monthly stock order; measuring from the tick would walk the date forward by
 * however late the practice ran that month, and a year of small delays turns a
 * job due on the 1st into one due on the 20th. Anchoring to `dueAt` means the
 * schedule is a property of the errand rather than a record of how busy
 * everybody was.
 *
 * Which leaves the errand ticked off *weeks* late — where anchoring alone would
 * produce a next date already in the past, and a board that spawns something
 * overdue at the moment you clear it. So the interval is applied again until it
 * lands in the future: a stock order forgotten for two months comes back next
 * month, not twice this morning.
 */
export function nextDueAt(dueAt: Date, repeat: Repeat, on: Date = today()): Date {
  const step = (from: Date): Date => {
    switch (repeat) {
      case 'WEEKLY':
        return addDays(from, 7);
      case 'FORTNIGHTLY':
        return addDays(from, 14);
      case 'MONTHLY':
        return addMonths(from, 1);
      case 'QUARTERLY':
        return addMonths(from, 3);
      case 'YEARLY':
        return addMonths(from, 12);
    }
  };

  const floor = toDay(on).getTime();
  let next = step(toDay(dueAt));

  // Bounded: even a line a decade stale converges in a few hundred steps, and
  // the cap is here so a value that somehow cannot advance cannot hang a server
  // action either.
  for (let i = 0; next.getTime() <= floor && i < 500; i += 1) {
    next = step(next);
  }

  return next;
}

export type FollowUpStatus = 'done' | 'overdue' | 'today' | 'upcoming';

export type FollowUpLike = {
  dueAt: Date;
  doneAt: Date | null;
  priority: Priority;
  createdAt: Date;
  /** Null for a line left with the practice rather than with a person. */
  assignedToId: string | null;
};

export function followUpStatus(
  item: Pick<FollowUpLike, 'dueAt' | 'doneAt'>,
  on: Date = today(),
): FollowUpStatus {
  if (item.doneAt) return 'done';

  const due = toDay(item.dueAt).getTime();
  const day = toDay(on).getTime();

  if (due < day) return 'overdue';
  if (due === day) return 'today';
  return 'upcoming';
}

/**
 * Whole days past the day it was due, or 0 for anything not overdue.
 *
 * The board prints this rather than the date it has gone past: "5 days late" is
 * a fact somebody acts on, and "due 11 August" is a fact somebody has to do
 * arithmetic on first.
 */
export function daysOverdue(
  item: Pick<FollowUpLike, 'dueAt' | 'doneAt'>,
  on: Date = today(),
): number {
  if (item.doneAt) return 0;
  const diff = toDay(on).getTime() - toDay(item.dueAt).getTime();
  return diff > 0 ? Math.round(diff / 86_400_000) : 0;
}

/** Sort key. `done` last, because a ticked line is not work any more. */
const RANK: Record<FollowUpStatus, number> = { overdue: 0, today: 1, upcoming: 2, done: 3 };

/**
 * The board's reading order: late, then due today, then coming up.
 *
 * Urgency breaks ties *inside* a bucket rather than overriding it, which is the
 * whole argument for having both. Overdue is a fact — the day has passed — and
 * urgent is an opinion somebody typed. Letting the opinion outrank the fact
 * would push a note flagged urgent and due next Friday above a line that was
 * supposed to be done on Monday, and the board would start lying about what is
 * actually late.
 */
export function sortFollowUps<T extends FollowUpLike>(
  items: ReadonlyArray<T>,
  on: Date = today(),
): T[] {
  return items.slice().sort((a, b) => {
    const byStatus = RANK[followUpStatus(a, on)] - RANK[followUpStatus(b, on)];
    if (byStatus !== 0) return byStatus;

    if (a.priority !== b.priority) return a.priority === 'URGENT' ? -1 : 1;
    if (a.dueAt.getTime() !== b.dueAt.getTime()) return a.dueAt.getTime() - b.dueAt.getTime();

    // Two lines for the same day: the one written first was thought of first.
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

export type BellCounts = {
  /** Everything still open, whatever its date — the number on the badge. */
  open: number;
  overdue: number;
  /**
   * Due *on* the day being asked about, and no later.
   *
   * Split out because the board's middle card had been printing `open −
   * overdue`, which is today's errands *and* next Friday's under a heading that
   * says "Today". That was a rounding error while it was only a number to
   * glance at. It became a lie the moment the card turned into a control:
   * pressing something labelled Today and being shown next week is the board
   * teaching people not to believe its own headings.
   */
  today: number;
  /** Open and due after today. `overdue + today + later === open`, always. */
  later: number;
  /** Open *and* flagged urgent. Drives the badge's colour, not its number. */
  urgent: number;
  /**
   * Open and on the viewer's own plate.
   *
   * A follow-up may be left with anyone, and most are — the board is a shared
   * list and that is the point of it. But a shared list of twenty is one nobody
   * reads as *theirs*, and the one thing a person can always act on without
   * asking anybody is the line with their own name against it.
   *
   * Nought when nobody is asking, which is what the server-side callers that
   * have no viewer in hand get.
   */
  mine: number;
};

export function bellCounts(
  items: ReadonlyArray<Pick<FollowUpLike, 'dueAt' | 'doneAt' | 'priority' | 'assignedToId'>>,
  on: Date = today(),
  /** Whose "mine" this is. Omitted where nobody is asking — see `mine`. */
  viewerId?: string,
): BellCounts {
  let open = 0;
  let overdue = 0;
  let dueToday = 0;
  let later = 0;
  let urgent = 0;
  let mine = 0;

  for (const item of items) {
    const status = followUpStatus(item, on);
    if (status === 'done') continue;

    open += 1;
    if (status === 'overdue') overdue += 1;
    if (status === 'today') dueToday += 1;
    if (status === 'upcoming') later += 1;
    if (item.priority === 'URGENT') urgent += 1;
    if (viewerId && item.assignedToId === viewerId) mine += 1;
  }

  return { open, overdue, today: dueToday, later, urgent, mine };
}

/**
 * What a line is about, reduced to the one thing the button needs to know.
 *
 * Built from whichever of the three optional links is set. The row carries the
 * label rather than the screen looking it up again, because a follow-up in the
 * bell has to say *whose* crown it is about without a second query per line.
 */
export type FollowUpLink =
  | { kind: 'patient'; id: string; label: string }
  | { kind: 'work'; number: number; label: string }
  | { kind: 'stock'; name: string; label: string };

/**
 * Where pressing a line goes.
 *
 * Only patients have a screen of their own; a case and a material are both rows
 * in a register, so the link is the register filtered down to the one row. The
 * works register needs `month=all` on top of that — it opens on the current
 * month, and a case sent in March would otherwise be filtered out of the very
 * view that was supposed to be showing it.
 */
export function linkHref(link: FollowUpLink): string {
  switch (link.kind) {
    case 'patient':
      return `/patients/${link.id}`;
    case 'work':
      return `/works?q=${encodeURIComponent(String(link.number))}&month=all`;
    case 'stock':
      return `/stock?q=${encodeURIComponent(link.name)}`;
  }
}

/** The row as the database hands it back, with only the columns the link needs. */
export type LinkedRecords = {
  patient: { id: string; firstName: string; lastName: string } | null;
  work: { number: number; patientName: string } | null;
  stockItem: { name: string } | null;
};

/**
 * At most one link per line — the form only ever offers the record it was opened
 * from, so this is a question of which one was set rather than a priority order.
 */
export function followUpLink(item: LinkedRecords): FollowUpLink | null {
  if (item.patient) {
    return {
      kind: 'patient',
      id: item.patient.id,
      label: `${item.patient.lastName} ${item.patient.firstName}`.trim(),
    };
  }
  if (item.work) {
    return {
      kind: 'work',
      number: item.work.number,
      label: `#${item.work.number} ${item.work.patientName}`.trim(),
    };
  }
  if (item.stockItem) {
    return { kind: 'stock', name: item.stockItem.name, label: item.stockItem.name };
  }
  return null;
}

/** The day a snooze lands on, at UTC midnight like every other stored day. */
export function snoozeUntil(days: number, on: Date = today()): Date {
  return addDays(toDay(on), Math.max(1, Math.trunc(days)));
}

/** A title as it may be stored: trimmed, and cut to something a row can print. */
export function clampTitle(value: string): string {
  return value.trim().slice(0, MAX_TITLE_LENGTH);
}

export function clampNotes(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed ? trimmed.slice(0, MAX_NOTES_LENGTH) : null;
}
