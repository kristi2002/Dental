'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useRef, useState } from 'react';
import { MAX_WORK_LINES, type DraftLine } from '@/lib/works';

export type LineDraft = DraftLine & { key: string };

/**
 * The work itself: rows inside the case, not columns beside it.
 *
 * A case is hardly ever one thing — a bridge on 14–16 and a crown on 24 travel
 * on the same impression — so this is the one field on the form that is a small
 * table. Three columns, the same three the register prints: which teeth, what is
 * being made, and which laboratory is making it.
 *
 * The whole set posts as one JSON field rather than as repeated inputs. That is
 * what lets a row be removed from the middle without renumbering anything, and
 * it is the same trick the plan builder uses for its steps.
 */
export function WorkLinesField({
  value,
  onChange,
  labs = [],
}: {
  value: LineDraft[];
  onChange: (lines: LineDraft[]) => void;
  /** Laboratories already named on other cases, so the spelling repeats. */
  labs?: string[];
}) {
  const t = useTranslations('works');
  const tc = useTranslations('common');
  const uid = useId();

  // A ref, not state: two rows added in one React batch would otherwise read the
  // same rendered counter and be given the same key.
  const seq = useRef(value.length);

  function addLine() {
    if (value.length >= MAX_WORK_LINES) return;
    seq.current += 1;
    onChange([...value, { key: `${uid}-${seq.current}`, elements: '', procedure: '', lab: '' }]);
  }

  function patch(key: string, field: keyof DraftLine, next: string) {
    onChange(value.map((line) => (line.key === key ? { ...line, [field]: next } : line)));
  }

  return (
    <div>
      {/* The value the form actually submits. Keys are display-only and are
          stripped here — the server numbers the rows by their order. */}
      <input
        type="hidden"
        name="lines"
        value={JSON.stringify(
          value.map(({ elements, procedure, lab }) => ({ elements, procedure, lab })),
        )}
      />

      {value.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line-strong px-3.5 py-4 text-center text-[0.95rem] text-ink-faint">
          {t('noLinesYet')}
        </p>
      ) : (
        <ul className="space-y-2">
          {value.map((line, index) => (
            <li
              key={line.key}
              className="rounded-lg border border-line-strong bg-surface px-3 py-2.5"
            >
              <div className="flex items-start gap-2">
                <span
                  aria-hidden
                  className="mt-2 grid size-6 shrink-0 place-items-center rounded-full bg-brand-soft text-[0.78rem] font-bold text-brand-deep"
                >
                  {index + 1}
                </span>

                <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,7rem)_minmax(0,1fr)_minmax(0,9rem)]">
                  <div>
                    <label className="field-label sr-only" htmlFor={`${line.key}-elements`}>
                      {t('elements')}
                    </label>
                    <input
                      id={`${line.key}-elements`}
                      className="field-input"
                      placeholder={t('elementsPlaceholder')}
                      value={line.elements}
                      onChange={(event) => patch(line.key, 'elements', event.target.value)}
                    />
                  </div>

                  <div>
                    <label className="field-label sr-only" htmlFor={`${line.key}-procedure`}>
                      {t('procedure')}
                    </label>
                    <input
                      id={`${line.key}-procedure`}
                      className="field-input"
                      placeholder={t('procedurePlaceholder')}
                      value={line.procedure}
                      onChange={(event) => patch(line.key, 'procedure', event.target.value)}
                    />
                  </div>

                  <div>
                    <label className="field-label sr-only" htmlFor={`${line.key}-lab`}>
                      {t('lab')}
                    </label>
                    <input
                      id={`${line.key}-lab`}
                      className="field-input"
                      placeholder={t('labPlaceholder')}
                      list={`${uid}-labs`}
                      value={line.lab}
                      onChange={(event) => patch(line.key, 'lab', event.target.value)}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn-ghost btn-sm mt-1 text-danger"
                  title={tc('delete')}
                  onClick={() => onChange(value.filter((row) => row.key !== line.key))}
                >
                  <Trash2 size={16} aria-hidden />
                  <span className="sr-only">{tc('delete')}</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <datalist id={`${uid}-labs`}>
        {labs.map((lab) => (
          <option key={lab} value={lab} />
        ))}
      </datalist>

      <button
        type="button"
        className="btn btn-secondary btn-sm mt-2"
        onClick={addLine}
        disabled={value.length >= MAX_WORK_LINES}
      >
        <Plus size={17} aria-hidden />
        {t('addLine')}
      </button>
    </div>
  );
}

/** Column headings for the rows above — shown once, over the list. */
export function WorkLinesHeader() {
  const t = useTranslations('works');

  return (
    <div className="hidden pl-8 sm:grid sm:grid-cols-[minmax(0,7rem)_minmax(0,1fr)_minmax(0,9rem)_2.5rem] sm:gap-2">
      {[t('elements'), t('procedure'), t('lab')].map((heading) => (
        <span
          key={heading}
          aria-hidden
          className="text-[0.78rem] font-bold tracking-wide text-ink-faint uppercase"
        >
          {heading}
        </span>
      ))}
    </div>
  );
}
