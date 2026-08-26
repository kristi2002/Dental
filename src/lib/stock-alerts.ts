/**
 * Low stock, as something the practice is *told* rather than something it has to
 * go and look at.
 *
 * The storage room already knew every one of these facts. It knew them on the
 * stock page, behind a filter, on a screen somebody has to decide to open — and
 * the decision to open it is exactly what does not happen on the morning the
 * gloves run out. `StockAlerts` and the reorder panel are both answers to a
 * question, and nobody was asking the question.
 *
 * So the same facts move to the one surface people do check: the reminder board.
 * Nothing new is measured here. This is the storage room's own arithmetic —
 * usable boxes against the minimum — reshaped into the two verbs a reminder
 * needs, "deal with it" and "not now".
 *
 * Pure, so it can be tested without a database. What is low, in what order it
 * reads, and whether a dismissal still stands.
 */

/**
 * Empty is not merely low, and the board must not say it is.
 *
 * `out` is a material that cannot be used at all this morning — the appointment
 * that needs it is already in trouble. `low` is one that will run out, which is
 * a purchasing decision with a week in hand. Colouring them the same is how a
 * board teaches people that red means nothing.
 */
export type StockAlertSeverity = 'out' | 'low';

export type StockAlertLike = {
  /** Boxes that can actually be used — expired lots already taken off. */
  usable: number;
  minLimit: number;
  /** Set when an order has gone out. An alert already answered is not an alert. */
  orderedAt: Date | null;
  /** The day the supplier promised it, when they promised one. */
  expectedAt: Date | null;
};

/**
 * How long an order with no promised date is left alone.
 *
 * Plenty of orders go out without a date attached, and inventing one would make
 * every such row look late the moment it was placed — the same argument
 * `Work.dueAt` makes for staying optional. But an undated order cannot be
 * allowed to silence the shelf for ever either, because that is precisely the
 * order nobody is tracking. A fortnight is long enough that a normal delivery
 * never trips it and short enough that a forgotten one does.
 */
export const ORDER_GRACE_DAYS = 14;

/** Midnight of whatever day this is, so the comparisons are day-to-day. */
function toDay(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

/**
 * Whether an order has gone past what was promised for it.
 *
 * The gap this closes was the sharpest thing about the storage room: `orderedAt`
 * switched the alarm off, `expectedAt` was collected, stored and printed as a
 * badge — and **nothing in the app ever compared it to a date.** So marking a
 * material ordered silenced it until the box physically arrived, and if the box
 * never arrived it stayed silenced. The act of promising to fix the problem was
 * what hid it.
 *
 * The comparison is the one [`workStatus`](./works.ts) already makes about a lab
 * case, deliberately: due today is not late, and a promise that has passed is.
 * A practice reads the two boards the same way and they should not disagree
 * about what "overdue" means.
 */
export function orderOverdue(
  item: Pick<StockAlertLike, 'orderedAt' | 'expectedAt'>,
  on: Date,
): boolean {
  return orderLateBy(item, on) > 0;
}

/**
 * Whole days past the promise, or 0 when nothing has been promised past.
 *
 * A number rather than a flag because the row has to print it: *ordered 12 days
 * ago, still not here* is a sentence somebody can ring a supplier with, and a
 * bare red dot is not.
 */
export function orderLateBy(
  item: Pick<StockAlertLike, 'orderedAt' | 'expectedAt'>,
  on: Date,
): number {
  if (!item.orderedAt) return 0;

  // With a promised date the deadline is that date. Without one it is the
  // grace period counted from when the order went out — see `ORDER_GRACE_DAYS`.
  const deadline = item.expectedAt
    ? toDay(item.expectedAt)
    : toDay(item.orderedAt) + ORDER_GRACE_DAYS * 86_400_000;

  const diff = toDay(on) - deadline;
  return diff > 0 ? Math.round(diff / 86_400_000) : 0;
}

/** The row as the board reads it, with the record it points back at. */
export type StockAlert = {
  /** The material's id — what the dismiss and order actions are keyed on. */
  id: string;
  name: string;
  /** The variant, when the material is one of several — "A2", "Size M". */
  variantName: string;
  usable: number;
  /** What is physically on the shelf, expired boxes included. */
  quantity: number;
  minLimit: number;
  severity: StockAlertSeverity;
  /** Empty for a material nobody has said where to buy. */
  supplierName: string;
  /** How many boxes to ask for, when the owner has stated a figure. */
  orderQty: number | null;
  /**
   * Whole days past the promised delivery, or 0.
   *
   * Non-zero is the only way a row with an order against it reaches the board at
   * all, so this doubles as "this row is here because the delivery is late"
   * rather than "because the shelf is low" — two different rows with two
   * different verbs, and the reader must not have to work out which is which.
   */
  orderLateDays: number;
  /** What the supplier promised, when they promised anything. For the row's wording. */
  expectedAt: Date | null;
  /**
   * When somebody said "not now", on a row that is being listed *because* they
   * did. Null on everything the board is actively asking about.
   */
  dismissedAt: Date | null;
  /** Who said it. Empty when the account has since been removed. */
  dismissedByName: string;
};

/** The board's two halves: what it is asking, and what it has been told to drop. */
export type StockAlertBoard = {
  active: StockAlert[];
  /** Low, and waved away. The undo list — see `alertQuietened`. */
  quietened: StockAlert[];
};

/**
 * Whether the shelf has anything left to say about this material.
 *
 * At or below the minimum, which is the same comparison the stock page's badge
 * and the dashboard's count already make. Deliberately the same and not
 * *nearly* the same: two screens disagreeing about how many materials are low
 * is how people stop believing either of them.
 */
export function isLow(item: Pick<StockAlertLike, 'usable' | 'minLimit'>): boolean {
  return item.usable <= item.minLimit;
}

export function severityOf(item: Pick<StockAlertLike, 'usable' | 'minLimit'>): StockAlertSeverity {
  return item.usable === 0 ? 'out' : 'low';
}

/**
 * A dismissal, as far as this module is concerned: the count the shelf held when
 * somebody said "not now".
 */
export type DismissalLike = { atQuantity: number };

/**
 * Does an answer already given still cover this material?
 *
 * A dismissal is about the situation as it stood, so it expires when the
 * situation gets worse. "We can live with three boxes" is a real answer to three
 * boxes and is not an answer to one — so the board asks again the moment the
 * count drops below what was waved away, and stays quiet while it holds.
 *
 * Restocking is the other way out, and it is not decided here: a material that
 * has climbed back above its minimum is not low at all, so it never reaches this
 * function. `getStockAlerts` clears the row on the way past.
 */
export function dismissalHolds(usable: number, dismissal: DismissalLike | null): boolean {
  if (!dismissal) return false;
  return usable >= dismissal.atQuantity;
}

/**
 * Should this material appear on the board?
 *
 * Three ways to be silent, and they are different silences: it is not low, it is
 * already on order *and still within its promise*, or somebody has said "not
 * now" and the shelf has not got worse since.
 *
 * The qualification on the second is the whole of L-02. An order used to be a
 * permanent answer — `orderedAt` set meant silence, full stop — which made the
 * one thing that could go wrong with an order the one thing the board could not
 * say. A promise that has passed is not an answer any more, so the row comes
 * back; what it says when it comes back is different, and `StockAlertList`
 * handles that.
 *
 * A dismissal still outranks an overdue order, and deliberately: "not now" is
 * somebody looking at this exact row and deciding, which is a more recent
 * judgement than the order was.
 */
export function alertVisible(
  item: StockAlertLike,
  dismissal: DismissalLike | null,
  on: Date,
): boolean {
  if (!worthSaying(item, on)) return false;
  return !dismissalHolds(item.usable, dismissal);
}

/**
 * Is this material one the board is *deliberately* not asking about?
 *
 * The other half of `alertVisible`, and the reason it exists as its own
 * function: a dismissal was the one press in this app with no way back.
 * `restoreStockAlert` was written the day dismissal was — guarded, audited,
 * race-safe, and documented as "the counterpart to every dismissal in this app
 * being reversible without a database client" — and nothing ever called it,
 * because nothing anywhere listed what had been waved away for a button to sit
 * beside.
 *
 * The only other way out was the shelf getting *worse* (`dismissalHolds`). For a
 * material bought once a year, that is the difference between a mis-aimed press
 * and running out.
 *
 * Deliberately the same first test as `alertVisible`: something that is not low,
 * or is on order and still within its promise, is not being quietened — it has
 * nothing to say in the first place, and listing it as suppressed would invent a
 * decision nobody took.
 */
export function alertQuietened(
  item: StockAlertLike,
  dismissal: DismissalLike | null,
  on: Date,
): boolean {
  if (!worthSaying(item, on)) return false;
  return dismissalHolds(item.usable, dismissal);
}

/** Whether the shelf has anything to say at all, before anyone's answer to it. */
function worthSaying(item: StockAlertLike, on: Date): boolean {
  if (!isLow(item)) return false;
  return item.orderedAt === null || orderOverdue(item, on);
}

/**
 * Reading order: empty first, then closest to empty, then alphabetical.
 *
 * "Closest to empty" is measured against the minimum rather than in bare boxes,
 * because two boxes of a material that wants twenty is a worse morning than two
 * of one that wants three. A material with a minimum of nought — somebody has
 * not set one — sorts on the raw count instead of dividing by zero.
 */
const shortfall = (alert: StockAlert) =>
  alert.minLimit > 0 ? alert.usable / alert.minLimit : alert.usable;

export function sortStockAlerts(alerts: ReadonlyArray<StockAlert>): StockAlert[] {
  return alerts.slice().sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'out' ? -1 : 1;

    const bySeverity = shortfall(a) - shortfall(b);
    if (bySeverity !== 0) return bySeverity;

    return a.name.localeCompare(b.name);
  });
}

export type StockAlertCounts = {
  /** Everything on the board — the number the badge adds to the follow-ups. */
  total: number;
  /** Nothing usable at all. Drives the colour, not the number. */
  out: number;
  low: number;
  /**
   * How many of those are here because a delivery is late rather than because
   * the shelf is low. Cuts across `out`/`low` rather than adding to them — a
   * material can easily be both — so it is not part of the total.
   */
  orderLate: number;
};

export function stockAlertCounts(
  alerts: ReadonlyArray<Pick<StockAlert, 'severity' | 'orderLateDays'>>,
): StockAlertCounts {
  let out = 0;
  let orderLate = 0;
  for (const alert of alerts) {
    if (alert.severity === 'out') out += 1;
    if (alert.orderLateDays > 0) orderLate += 1;
  }
  return { total: alerts.length, out, low: alerts.length - out, orderLate };
}

/** The material's full name, variant included, as one string a row can print. */
export function alertLabel(alert: Pick<StockAlert, 'name' | 'variantName'>): string {
  return alert.variantName ? `${alert.name} · ${alert.variantName}` : alert.name;
}

/**
 * Where pressing the row goes: the storage room, filtered to the one material.
 *
 * The same shape `linkHref` already builds for a follow-up about a material, and
 * deliberately the same — two ways to reach the same shelf from two rows of the
 * same board would be one way too many.
 */
export function alertHref(alert: Pick<StockAlert, 'name'>): string {
  return `/stock?q=${encodeURIComponent(alert.name)}`;
}
