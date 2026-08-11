import { SlidersHorizontal, X } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

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
  options: FilterOption[];
};

export type FilterSearchGroup = {
  name: string;
  label: string;
  placeholder?: string;
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
  chips,
  submitLabel,
  clearLabel,
  summary,
}: {
  /** Locale-less path of the page being filtered, e.g. `/services`. */
  basePath: string;
  /** The committed filter state, straight from `searchParams`. */
  values: Record<string, string>;
  label: string;
  search?: FilterSearchGroup;
  selects?: FilterSelectGroup[];
  chips?: FilterChipGroup;
  submitLabel: string;
  clearLabel: string;
  /** Result count — only worth showing once something is actually filtered. */
  summary?: string;
}) {
  const isFiltered = Object.values(values).some(Boolean);

  const hrefWith = (overrides: Record<string, string>) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...values, ...overrides })) {
      if (value) query.set(key, value);
    }
    const queryString = query.toString();
    return queryString ? `${basePath}?${queryString}` : basePath;
  };

  const owned = new Set([search?.name, ...selects.map((select) => select.name)]);
  const carried = Object.entries(values).filter(([key, value]) => value && !owned.has(key));

  return (
    <section aria-label={label} className="card mb-6 p-4" data-print-hide>
      {chips ? (
        <nav aria-label={chips.label} className="mb-4 flex flex-wrap gap-2">
          {chips.options.map((option) => {
            const selected = (values[chips.name] ?? '') === option.value;

            return (
              <Link
                key={option.value || 'all'}
                href={hrefWith({ [chips.name]: option.value })}
                aria-current={selected ? 'true' : undefined}
                className={cn('btn btn-sm', selected ? 'btn-primary' : 'btn-secondary')}
              >
                {option.label}
              </Link>
            );
          })}
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
              <option value="">{select.anyLabel}</option>
              {select.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ))}

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
