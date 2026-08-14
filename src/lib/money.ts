import { Prisma } from '@/generated/prisma/client';

/**
 * Prices, for the one place the app holds any.
 *
 * Money is stored as `Decimal(12,2)` rather than a float, because a float
 * cannot hold 2214.28 and a cupboard valued by adding a few hundred of them
 * drifts by real money. It never becomes a `number` until the moment it is
 * formatted for display.
 *
 * Kept free of any database import beyond the Decimal type so the parsing rules
 * are testable on their own.
 */

export type Money = Prisma.Decimal;

/** Digits, then at most two decimal places. Anything else is not a price. */
const MONEY_PATTERN = /^\d+(?:\.\d{1,2})?$/;

/**
 * Read a price out of a form field.
 *
 * Accepts a comma as the decimal separator — every keyboard in the practice
 * writes `2214,28`, and refusing it would make the field feel broken. Thin
 * spaces and the ordinary kind are stripped for the same reason.
 *
 * Returns `null` for a blank field *and* for anything unparseable; the caller
 * decides which of those is an error, because on most forms a blank price is a
 * perfectly good answer and a mistyped one is not.
 */
export function parseMoney(raw: string | null): Money | null {
  if (raw === null) return null;

  const normalised = raw.replace(/[\s  ]/g, '').replace(',', '.');
  if (!MONEY_PATTERN.test(normalised)) return null;

  return new Prisma.Decimal(normalised);
}

/**
 * True when the field holds either nothing or a real price.
 *
 * A blank string counts as nothing, not as a mistyped price: `optionalString`
 * hands callers `null` for an empty field, but a caller reading the raw value
 * should not get a validation error for a field nobody filled in.
 */
export function isPrice(raw: string | null): boolean {
  return raw === null || raw.trim() === '' || parseMoney(raw) !== null;
}

/** What to put back in the form field. Blank when the material has no price. */
export function moneyToInput(value: Money | null): string {
  return value === null ? '' : value.toFixed(2);
}

/**
 * Across the server/client boundary, where a Decimal cannot go.
 *
 * Display is the only thing on the far side of that boundary, and display works
 * in `number` — the arithmetic has already happened by then.
 */
export function moneyToNumber(value: Money | null): number | null {
  return value === null ? null : value.toNumber();
}

/**
 * How every price in the app is written.
 *
 * Lek and yen carry no minor unit in CLDR, so the default rounds a price of
 * 2214.28 to `ALL 2,214` — a figure that does not match the invoice it was
 * copied from, rounded without a word. Raising the ceiling to two fixes that,
 * but on its own gives `ALL 2,300.5`, which reads like a price with a digit
 * missing rather than one with none.
 *
 * So the fraction is all or nothing: a price with decimals shows both of them,
 * a round one shows none, and a currency that always wants two still gets two
 * because its own floor is left alone.
 */
export function moneyFormat(currency: string, value: number) {
  // Returned unannotated on purpose: `Intl.NumberFormatOptions` widens `style`
  // to `string`, which next-intl's stricter option type will not accept.
  return {
    style: 'currency' as const,
    currency,
    // `undefined` means "whatever this currency's floor already is".
    minimumFractionDigits: Number.isInteger(value) ? undefined : 2,
    maximumFractionDigits: 2,
  };
}

export type ValuedLine = { quantity: number; unitPrice: Money | null };

/**
 * What the shelf is worth.
 *
 * An unpriced material contributes nothing and is *not* counted as free — the
 * caller is told how many were skipped so the total can say it is partial
 * rather than quietly understating what the room holds.
 */
export function stockValue(lines: readonly ValuedLine[]): {
  total: number;
  /** Materials on the shelf that nobody has priced. */
  unpriced: number;
} {
  let total = new Prisma.Decimal(0);
  let unpriced = 0;

  for (const line of lines) {
    if (line.unitPrice === null) {
      // Only worth mentioning for something actually in the room. An unpriced
      // material at zero stock is not a hole in the valuation.
      if (line.quantity > 0) unpriced += 1;
      continue;
    }
    total = total.add(line.unitPrice.mul(line.quantity));
  }

  return { total: total.toNumber(), unpriced };
}
