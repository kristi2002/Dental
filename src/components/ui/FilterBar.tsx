import { SlidersHorizontal, X } from 'lucide-react';
import { Link } from '@/i18n/navigation';

export type FilterOption = { value: string; label: string };

/** A row of one-tap toggles. Exactly one is active; the empty value means "no filter". */
export type FilterChipGroup = {
  name: string;
  label: string;
  options: FilterOption[];
};

/** A dropdown for keys with too many values to spend a row of chips on. */
export type FilterSelectGroup = {
  name: string;
  label: string;
  /** The first option, the one that clears this key — "All categories". */
  anyLabel: string;
  /**
   * What that first option posts. Empty by default, which is what "no filter"
   * means for most keys.
   *
   * A page whose default is *not* "everything" needs a word for everything —
   * the works register opens on the current month, so its widest view is a
   * choice (`all`) rather than the absence of one. Giving it a value keeps
   * every state of the dropdown a real option, which is what lets the browser
   * select the committed one instead of falling back to the first.
   */
  anyValue?: string;
  options: FilterOption[];
};

export type FilterSearchGroup = {
  name: string;
  label: string;
  placeholder?: string;
};

/**
 * A pair of `YYYY-MM-DD` inputs bounding a range, both optional.
 *
 * Added for the activity log, which is the first list in the app that is read
 * *backwards in time* rather than filtered down to a category: it is kept for
 * good, so "the last hundred entries" and a set of chips cannot reach 2021 at
 * all, and paging there a hundred rows at a time is not reaching it either.
 *
 * Two open-ended dates rather than a month select, unlike the works register:
 * that register is read a month at a time because it is billed a month at a
 * time, and a trail is read across whatever span the question happens to cover
 * — the week somebody was on leave, the day a record was disputed.
 */
export type FilterDateGroup = {
  /** Query key for the inclusive lower bound. */
  fromName: string;
  /** Query key for the inclusive upper bound. */
  toName: string;
  label: string;
  fromLabel: string;
  toLabel: string;
};

/**
 * The filter panel shared by the catalog pages.
 *
 * Every control writes to the query string and the page re-reads it on the
 * server, so a filtered list is a real URL — it survives a reload, a bookmark
 * and a link sent to a colleague, and it works with JavaScript switched off.
 *
 * The two halves navigate differently and each has to carry the other's state:
 * the chips are links, so their hrefs re-encode whatever the form has already
 * committed; the form replaces the whole query string on submit, so the keys it
 * has no control over ride along as hidden inputs.
 */
export function FilterBar({
  basePath,
  values,
  label,
  search,
  selects = [],
  dates,
  chips,
  submitLabel,
  clearLabel,
  summary,
  filtered,
}: {
  /** Locale-less path of the page being filtered, e.g. `/services`. */
  basePath: string;
  /** The committed filter state, straight from `searchParams`. */
  values: Record<string, string>;
  label: string;
  search?: FilterSearchGroup;
  selects?: FilterSelectGroup[];
  /** An inclusive date range. See `FilterDateGroup`. */
  dates?: FilterDateGroup;
  chips?: FilterChipGroup;
  submitLabel: string;
  clearLabel: string;
  /** Result count — only worth showing once something is actually filtered. */
  summary?: string;
  /**
   * Whether anything is actually narrowed, when the page knows better than the
   * query string does.
   *
   * A committed value is normally the same thing as a filter, and the default
   * below says so. It stops being true on a page with a default view of its
   * own: the works register always carries a month, so by that reading it is
   * permanently filtered and would wear a Clear button that clears nothing.
   */
  filtered?: boolean;
}) {
  const isFiltered = filtered ?? Object.values(values).some(Boolean);

  const hrefWith = (overrides: Record<string, string>) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...values, ...overrides })) {
      if (value) query.set(key, value);
    }
    const queryString = query.toString();
    return queryString ? `${basePath}?${queryString}` : basePath;
  };

  // Keys the form itself posts. Everything else in the query string has to ride
  // along as a hidden input or submitting would drop it — the dates included,
  // which is why they are named here rather than only where they are rendered.
  const owned = new Set([
    search?.name,
    ...selects.map((select) => select.name),
    dates?.fromName,
    dates?.toName,
  ]);
  const carried = Object.entries(values).filter(([key, value]) => value && !owned.has(key));

  return (
    <section aria-label={label} className="card mb-6 p-4" data-print-hide>
      {chips ? (
        <nav aria-label={chips.label} className="mb-4">
          <div className="segmented">
            {chips.options.map((option) => {
              const selected = (values[chips.name] ?? '') === option.value;

              return (
                <Link
                  key={option.value || 'all'}
                  href={hrefWith({ [chips.name]: option.value })}
                  aria-current={selected ? 'true' : undefined}
                  className="segment"
                >
                  {option.label}
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}

      <form method="get" role="search" className="flex flex-wrap items-end gap-3">
        {carried.map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}

        {search ? (
          <div className="min-w-56 flex-1">
            <label className="field-label" htmlFor={`filter-${search.name}`}>
              {search.label}
            </label>
            <input
              id={`filter-${search.name}`}
              type="search"
              name={search.name}
              defaultValue={values[search.name] ?? ''}
              placeholder={search.placeholder}
              className="field-input"
            />
          </div>
        ) : null}

        {selects.map((select) => (
          <div key={select.name} className="min-w-44 flex-1">
            <label className="field-label" htmlFor={`filter-${select.name}`}>
              {select.label}
            </label>
            <select
              id={`filter-${select.name}`}
              name={select.name}
              defaultValue={values[select.name] ?? ''}
              className="field-input"
            >
              <option value={select.anyValue ?? ''}>{select.anyLabel}</option>
              {select.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ))}

        {dates ? (
          <fieldset className="flex min-w-64 flex-1 items-end gap-2 border-0 p-0">
            <legend className="sr-only">{dates.label}</legend>
            <div className="min-w-32 flex-1">
              <label className="field-label" htmlFor={`filter-${dates.fromName}`}>
                {dates.fromLabel}
              </label>
              <input
                id={`filter-${dates.fromName}`}
                type="date"
                name={dates.fromName}
                defaultValue={values[dates.fromName] ?? ''}
                className="field-input"
              />
            </div>
            <div className="min-w-32 flex-1">
              <label className="field-label" htmlFor={`filter-${dates.toName}`}>
                {dates.toLabel}
              </label>
              <input
                id={`filter-${dates.toName}`}
                type="date"
                name={dates.toName}
                defaultValue={values[dates.toName] ?? ''}
                className="field-input"
              />
            </div>
          </fieldset>
        ) : null}

        <div className="flex items-center gap-2">
          <button type="submit" className="btn btn-secondary">
            <SlidersHorizontal size={18} aria-hidden />
            {submitLabel}
          </button>
          {isFiltered ? (
            <Link href={basePath} className="btn btn-ghost">
              <X size={18} aria-hidden />
              {clearLabel}
            </Link>
          ) : null}
        </div>
      </form>

      {isFiltered && summary ? (
        <p aria-live="polite" className="mt-3 text-[0.95rem] text-ink-soft">
          {summary}
        </p>
      ) : null}
    </section>
  );
}
