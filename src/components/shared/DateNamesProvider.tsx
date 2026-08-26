'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  renderCount,
  renderDate,
  type DateNames,
  type DateShape,
} from '@/lib/date-names';

/**
 * Carries the server's locale names into the browser, so no client component
 * ever asks `Intl` for a word.
 *
 * The rule this enforces: **`useFormatter().dateTime` is not safe in a client
 * component when the value it renders is language-shaped.** Chrome ships no
 * Albanian locale data, so a weekday it formats on `/sq` comes back English
 * while the server's is Albanian — a visibly wrong page and a hydration
 * mismatch. `docs/GAPS-PASS-4.md` §H-01 has the measurements.
 *
 * `useFormatter` stays perfectly fine for digits — a numeric day, a year, a
 * 24-hour time — which render identically with or without the locale's data.
 * Nothing here replaces it wholesale.
 */
const DateNamesContext = createContext<DateNames | null>(null);

export function DateNamesProvider({
  names,
  children,
}: {
  names: DateNames;
  children: ReactNode;
}) {
  return <DateNamesContext.Provider value={names}>{children}</DateNamesContext.Provider>;
}

export type DateFormatters = {
  /** One date, in one of the shapes `SHAPE_OPTIONS` names. */
  date: (value: Date, shape: DateShape) => string;
  /** A whole number with the locale's thousands mark. */
  count: (value: number) => string;
};

export function useDateNames(): DateFormatters {
  const names = useContext(DateNamesContext);
  if (!names) {
    // A hard failure rather than a fallback to `Intl`. Falling back is exactly
    // the behaviour this module exists to remove, and it would fail on the one
    // language the practice actually uses while looking fine in review.
    throw new Error(
      'useDateNames() outside DateNamesProvider — mount it in src/app/[locale]/layout.tsx.',
    );
  }

  return useMemo(
    () => ({
      date: (value, shape) => renderDate(names, shape, value),
      count: (value) => renderCount(names, value),
    }),
    [names],
  );
}
