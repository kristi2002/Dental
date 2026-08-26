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
};

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
 * already on order, or somebody has said "not now" and the shelf has not got
 * worse since.
 */
export function alertVisible(
  item: StockAlertLike,
  dismissal: DismissalLike | null,
): boolean {
  if (!isLow(item)) return false;
  if (item.orderedAt !== null) return false;
  return !dismissalHolds(item.usable, dismissal);
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
};

export function stockAlertCounts(
  alerts: ReadonlyArray<Pick<StockAlert, 'severity'>>,
): StockAlertCounts {
  let out = 0;
  for (const alert of alerts) if (alert.severity === 'out') out += 1;
  return { total: alerts.length, out, low: alerts.length - out };
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
