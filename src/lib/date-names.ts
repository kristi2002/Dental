/**
 * Weekday and month names, worked out on the server and carried to the browser.
 *
 * **Why this exists.** `Intl.DateTimeFormat` is not a language library, it is a
 * lookup into whatever locale data the *runtime* was built with — and Chrome is
 * not built with Albanian. On the development machine, Chrome 151 answers
 * `Intl.DateTimeFormat.supportedLocalesOf(['sq'])` with `[]` and formats a
 * Monday as `Mon`; Node and Edge, which ship full ICU, both say `hën`. The
 * result on `/sq/appointments` was a week grid the server rendered in Albanian
 * and the browser re-rendered in English, with a React hydration mismatch in
 * between. See `docs/GAPS-PASS-4.md` §H-01.
 *
 * So no client component may ask the browser for a name. The server — which is
 * Node, and does have the data — works out the seven weekday names, the twelve
 * month names, and the *shape* each rendered date takes, and hands all of it
 * down through `DateNamesProvider`. The browser only substitutes.
 *
 * **What is deliberately not hardcoded.** The order of the parts and the marks
 * between them stay the locale's business, exactly as they do in
 * `paddedDateFormat`. `shapes` is not a set of format strings somebody wrote —
 * it is `formatToParts` run once per shape on the server, kept as tokens. Add a
 * fourth language and it is described correctly without anybody writing a
 * pattern for it.
 *
 * **UTC throughout**, because `src/i18n/request.ts` sets `timeZone: 'UTC'` and
 * every calendar day this app stores is stored at UTC midnight. Reading the
 * UTC components here is what keeps this agreeing with the `format.dateTime`
 * calls that remain elsewhere.
 */

/** The date shapes the app actually renders. Nothing speculative. */
export type DateShape =
  | 'weekdayLong'
  | 'weekdayShort'
  | 'monthShort'
  | 'monthYearLong'
  | 'dayMonthShort'
  | 'dayMonthShortYear'
  | 'weekdayShortDayMonthShort'
  | 'weekdayLongDayMonthLongYear'
  | 'dateLong';

/**
 * The options each shape stands for — the single source of truth for both the
 * server that measures them and the test that checks the measurement.
 */
export const SHAPE_OPTIONS: Record<DateShape, Intl.DateTimeFormatOptions> = {
  weekdayLong: { weekday: 'long' },
  weekdayShort: { weekday: 'short' },
  monthShort: { month: 'short' },
  monthYearLong: { month: 'long', year: 'numeric' },
  dayMonthShort: { day: 'numeric', month: 'short' },
  dayMonthShortYear: { day: 'numeric', month: 'short', year: 'numeric' },
  weekdayShortDayMonthShort: { weekday: 'short', day: 'numeric', month: 'short' },
  weekdayLongDayMonthLongYear: {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  },
  dateLong: { dateStyle: 'long' },
};

/**
 * One piece of a rendered date.
 *
 * Short keys because every one of these crosses the wire in the RSC payload,
 * nine shapes' worth, on every page load.
 */
export type DateToken =
  | { t: 'lit'; v: string }
  | { t: 'wdL' }
  | { t: 'wdS' }
  | { t: 'moL' }
  | { t: 'moS' }
  | { t: 'day'; pad?: true }
  | { t: 'year'; short?: true };

export type DateNames = {
  /** Indexed by `getUTCDay()` — 0 is Sunday. */
  weekdayLong: readonly string[];
  weekdayShort: readonly string[];
  /** Indexed by `getUTCMonth()` — 0 is January. */
  monthLong: readonly string[];
  monthShort: readonly string[];
  shapes: Record<DateShape, readonly DateToken[]>;
  /** The thousands mark, so a count does not have to ask the browser either. */
  group: string;
  /**
   * Whether a four-digit number is grouped at all.
   *
   * CLDR's `minimumGroupingDigits` is 2 for both Albanian and Italian, so they
   * write `1000` and `10 000` — grouping only from five digits up. English
   * writes `1,000`. Carried as a measurement rather than a rule, for the same
   * reason the shapes are.
   */
  groupsAtFourDigits: boolean;
};

/** A week that starts on a Sunday, for naming the days in `getUTCDay()` order. */
const WEEK_FROM_SUNDAY = Date.UTC(2026, 0, 4);

/** Mid-month, so no timezone rounding can move it into a neighbour. */
const MID_MONTH_DAY = 15;

/**
 * Measure a locale. Server-side only in practice — it is the whole point that
 * the runtime doing this is the one with the locale data.
 */
export function buildDateNames(locale: string): DateNames {
  const named = (options: Intl.DateTimeFormatOptions, at: number): string =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(at);

  const weekdayLong: string[] = [];
  const weekdayShort: string[] = [];
  for (let day = 0; day < 7; day++) {
    const at = WEEK_FROM_SUNDAY + day * 86_400_000;
    weekdayLong.push(named({ weekday: 'long' }, at));
    weekdayShort.push(named({ weekday: 'short' }, at));
  }

  const monthLong: string[] = [];
  const monthShort: string[] = [];
  for (let month = 0; month < 12; month++) {
    const at = Date.UTC(2026, month, MID_MONTH_DAY);
    monthLong.push(named({ month: 'long' }, at));
    monthShort.push(named({ month: 'short' }, at));
  }

  const shapes = {} as Record<DateShape, readonly DateToken[]>;
  for (const shape of Object.keys(SHAPE_OPTIONS) as DateShape[]) {
    shapes[shape] = measureShape(locale, SHAPE_OPTIONS[shape], {
      weekdayLong,
      weekdayShort,
      monthLong,
      monthShort,
    });
  }

  const numbers = new Intl.NumberFormat(locale);
  const group =
    numbers.formatToParts(1_234_567).find((part) => part.type === 'group')?.value ?? ',';

  return {
    weekdayLong,
    weekdayShort,
    monthLong,
    monthShort,
    shapes,
    group,
    groupsAtFourDigits: numbers.format(1000).includes(group),
  };
}

/**
 * `buildDateNames` costs about forty `Intl` constructions and the answer never
 * changes, so each locale is measured once for the life of the process. Three
 * locales, three entries.
 */
const measured = new Map<string, DateNames>();

/** The memoised entry point. Use this rather than `buildDateNames` directly. */
export function dateNamesFor(locale: string): DateNames {
  let names = measured.get(locale);
  if (!names) {
    names = buildDateNames(locale);
    measured.set(locale, names);
  }
  return names;
}

/**
 * Turn one shape into tokens, by formatting reference dates and asking what the
 * parts were.
 *
 * **Parts are identified by value, not by `resolvedOptions()`.** The obvious
 * implementation asks the formatter whether it resolved `month` to `long` or
 * `short`, and it does not work: for `dateStyle` this Node returns an empty
 * object for every component field, so `dateLong` came out asking for a short
 * month and rendering `sht` where ICU had written `shtator`. Matching the part's
 * text against the name lists just built cannot be fooled that way — and where
 * a locale's long and short names are the same string, either answer renders
 * the same characters.
 */
function measureShape(
  locale: string,
  options: Intl.DateTimeFormatOptions,
  names: {
    weekdayLong: readonly string[];
    weekdayShort: readonly string[];
    monthLong: readonly string[];
    monthShort: readonly string[];
  },
): readonly DateToken[] {
  const formatter = new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' });

  // A two-digit day, a month that is not January, and a weekday no other
  // reference date here would give. If a part were ever mistaken for a literal,
  // this is the date most likely to show it.
  const reference = Date.UTC(2026, 8, 23);

  // A separate probe with a single-digit day and a two-digit-ambiguous year, to
  // learn the widths. The reference above cannot answer this: `23` is two
  // characters whether the locale asked for `numeric` or `2-digit`.
  const narrow = Date.UTC(2026, 0, 5);
  const dayIsPadded = partOf(formatter, narrow, 'day') === '05';
  const yearIsShort = (partOf(formatter, reference, 'year') ?? '').length === 2;

  return formatter.formatToParts(reference).map((part): DateToken => {
    switch (part.type) {
      case 'weekday':
        if (names.weekdayLong.includes(part.value)) return { t: 'wdL' };
        if (names.weekdayShort.includes(part.value)) return { t: 'wdS' };
        throw new Error(unknown(locale, options, 'weekday', part.value));
      case 'month':
        if (names.monthLong.includes(part.value)) return { t: 'moL' };
        if (names.monthShort.includes(part.value)) return { t: 'moS' };
        // A numeric month, which no shape in `SHAPE_OPTIONS` asks for. Loud
        // rather than silent: rendering it as a literal would freeze September
        // into every date the shape ever produced.
        throw new Error(unknown(locale, options, 'month', part.value));
      case 'day':
        return dayIsPadded ? { t: 'day', pad: true } : { t: 'day' };
      case 'year':
        return yearIsShort ? { t: 'year', short: true } : { t: 'year' };
      default:
        // `literal`, and anything else a locale slips in — an era, a calendar
        // marker. Kept verbatim: it is by definition the same for every date
        // this shape will ever be asked to render.
        return { t: 'lit', v: part.value };
    }
  });
}

function partOf(
  formatter: Intl.DateTimeFormat,
  at: number,
  type: Intl.DateTimeFormatPartTypes,
): string | undefined {
  return formatter.formatToParts(at).find((part) => part.type === type)?.value;
}

function unknown(
  locale: string,
  options: Intl.DateTimeFormatOptions,
  type: string,
  value: string,
): string {
  return (
    `date-names: ${locale} rendered a ${type} as "${value}", which is neither ` +
    `its long nor its short name (${JSON.stringify(options)}).\n` +
    'A shape asking for a numeric month or weekday cannot be tokenised — add it ' +
    'to DateToken, or format it on the server instead.'
  );
}

/** Render one date in one shape. Pure, and safe in a browser with no ICU data. */
export function renderDate(names: DateNames, shape: DateShape, value: Date): string {
  return names.shapes[shape]
    .map((token) => {
      switch (token.t) {
        case 'lit':
          return token.v;
        case 'wdL':
          return names.weekdayLong[value.getUTCDay()];
        case 'wdS':
          return names.weekdayShort[value.getUTCDay()];
        case 'moL':
          return names.monthLong[value.getUTCMonth()];
        case 'moS':
          return names.monthShort[value.getUTCMonth()];
        case 'day': {
          const day = String(value.getUTCDate());
          return token.pad ? day.padStart(2, '0') : day;
        }
        case 'year': {
          const year = value.getUTCFullYear();
          return token.short ? String(year % 100).padStart(2, '0') : String(year);
        }
      }
    })
    .join('');
}

/**
 * A whole number with the locale's thousands mark.
 *
 * Only grouping, because that is the only thing the app asks of a number that a
 * browser can get wrong for want of locale data — the digits themselves are the
 * same everywhere this ships. `groupsAtFourDigits` is what keeps Albanian's
 * `1000` from becoming `1 000`.
 */
export function renderCount(names: DateNames, value: number): string {
  const digits = String(Math.trunc(Math.abs(value)));
  const grouped =
    digits.length <= 3 || (digits.length === 4 && !names.groupsAtFourDigits)
      ? digits
      : digits.replace(/\B(?=(\d{3})+(?!\d))/g, names.group);
  return value < 0 ? `-${grouped}` : grouped;
}
