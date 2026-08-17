'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useRef } from 'react';
import { ToothSpanPicker } from '@/components/works/ToothSpanPicker';
import { Link } from '@/i18n/navigation';
import { spanElements } from '@/lib/tooth-span';
import { MAX_ELEMENTS, MAX_WORK_LINES, elementsOf, type DraftLine } from '@/lib/works';

export type LineDraft = DraftLine & { key: string };

/**
 * The work itself: rows inside the case, not columns beside it.
 *
 * A case is hardly ever one thing — a bridge and a crown travel on the same
 * impression — so this is the one field on the form that is a small table of its
 * own. Each row answers the three questions the docket asks in its three
 * columns: what is being made, for which teeth, and by which laboratory.
 *
 * It was three text boxes in a row, and it was the part of this form people got
 * lost in. Two changes fixed that and both remove a decision rather than
 * explaining one:
 *
 *  - **The work is chosen, not typed.** One entry per kind of work, from the
 *    catalogue at `/works/procedures`. A month of "Zirkon", "zirkon" and "Kurorë
 *    zirkoni" could not be added up, which is what the register is for.
 *  - **The teeth are pressed on a chart, and the element count follows.** The
 *    count used to be typed next to a span typed as free text, so the two could
 *    disagree — and the count is the number the invoice is checked against. Now
 *    it is only typed when no teeth are named at all, which is a denture or a
 *    repair.
 *
 * The whole set posts as one JSON field rather than as repeated inputs. That is
 * what lets a row be removed from the middle without renumbering anything, and
 * it is the same trick the plan builder uses for its steps.
 */
export function WorkLinesField({
  value,
  onChange,
  labs = [],
  procedures = [],
}: {
  value: LineDraft[];
  onChange: (lines: LineDraft[]) => void;
  /** Laboratories already named on other cases, so the spelling repeats. */
  labs?: string[];
  /** The catalogue every row picks its work from. */
  procedures?: string[];
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
    // One element is what a new row nearly always is — a single crown. Starting
    // at zero would mean typing a 1 on most rows of most cases.
    onChange([
      ...value,
      { key: `${uid}-${seq.current}`, elements: 1, procedure: '', lab: '', teeth: '' },
    ]);
  }

  function patch(key: string, fields: Partial<DraftLine>) {
    onChange(value.map((line) => (line.key === key ? { ...line, ...fields } : line)));
  }

  return (
    <div>
      {/* The value the form actually submits. Keys are display-only and are
          stripped here — the server numbers the rows by their order. */}
      <input
        type="hidden"
        name="lines"
        value={JSON.stringify(
          value.map(({ elements, procedure, lab, teeth }) => ({ elements, procedure, lab, teeth })),
        )}
      />

      {value.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line-strong px-3.5 py-4 text-center text-[0.95rem] text-ink-faint">
          {t('noLinesYet')}
        </p>
      ) : (
        <ul className="space-y-3">
          {value.map((line, index) => {
            // Everything the row offers, plus whatever this row already says.
            // A case written before the catalogue existed keeps its wording
            // instead of being silently blanked the first time it is edited.
            const options =
              line.procedure && !procedures.includes(line.procedure)
                ? [line.procedure, ...procedures]
                : procedures;

            return (
              <li
                key={line.key}
                className="rounded-lg border border-line-strong bg-surface px-3.5 py-3"
              >
                <div className="mb-2.5 flex items-center gap-2">
                  <span
                    aria-hidden
                    className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-soft text-[0.78rem] font-bold text-brand-deep"
                  >
                    {index + 1}
                  </span>
                  {/* The row says what it is as soon as the work is chosen,
                      which is what a case with three rows on it needs to be
                      readable while it is being written. */}
                  <span className="min-w-0 truncate text-[0.95rem] font-semibold text-ink">
                    {line.procedure || <span className="text-ink-faint">{t('procedureChoose')}</span>}
                  </span>

                  <button
                    type="button"
                    className="btn btn-ghost btn-sm ml-auto text-danger"
                    title={tc('delete')}
                    onClick={() => onChange(value.filter((row) => row.key !== line.key))}
                  >
                    <Trash2 size={16} aria-hidden />
                    <span className="sr-only">{tc('delete')}</span>
                  </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="field-label" htmlFor={`${line.key}-procedure`}>
                      {t('procedure')}
                    </label>
                    <select
                      id={`${line.key}-procedure`}
                      className="field-input"
                      value={line.procedure}
                      onChange={(event) => patch(line.key, { procedure: event.target.value })}
                    >
                      <option value="">{t('procedureChoose')}</option>
                      {options.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>

                    {/* Only when there is nothing to pick. A form whose one
                        control is an empty list has to say where the list comes
                        from, or it is a dead end. */}
                    {options.length === 0 ? (
                      <p className="mt-1.5 text-[0.9rem] text-ink-soft">
                        {t('procedureNone')}{' '}
                        <Link href="/works/procedures" className="font-semibold underline">
                          {t('procedureManage')}
                        </Link>
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <label className="field-label" htmlFor={`${line.key}-lab`}>
                      {t('lab')}
                    </label>
                    <input
                      id={`${line.key}-lab`}
                      className="field-input"
                      placeholder={t('labPlaceholder')}
                      list={`${uid}-labs`}
                      value={line.lab}
                      onChange={(event) => patch(line.key, { lab: event.target.value })}
                    />
                  </div>
                </div>

                <div className="mt-3">
                  <p className="field-label" id={`${line.key}-teeth`}>
                    {t('teeth')}
                  </p>
                  <ToothSpanPicker
                    value={line.teeth}
                    labelledBy={`${line.key}-teeth`}
                    // The count is a fact about the span once there is one, so it
                    // is written here rather than left for somebody to work out
                    // and type. The server derives it the same way and does not
                    // take the client's word for it — see `parseDraftLines`.
                    onChange={(teeth) =>
                      patch(line.key, {
                        teeth,
                        elements: teeth ? spanElements(teeth) : line.elements,
                      })
                    }
                  />
                </div>

                {/* Only for the work that names no teeth — a full denture, a
                    repair, a bite splint. Anything with a span has already been
                    counted by the chart above. */}
                {line.teeth ? null : (
                  <div className="mt-3 max-w-40">
                    <label className="field-label" htmlFor={`${line.key}-elements`}>
                      {t('elements')}
                    </label>
                    <input
                      id={`${line.key}-elements`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={MAX_ELEMENTS}
                      step={1}
                      className="field-input text-right tabular-nums"
                      value={line.elements}
                      onChange={(event) =>
                        // Kept as typed while the box is being worked in — an
                        // emptied field that snapped back to 0 could not be
                        // retyped without selecting the 0 first.
                        patch(line.key, {
                          elements: event.target.value === '' ? 0 : Number(event.target.value),
                        })
                      }
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <datalist id={`${uid}-labs`}>
        {labs.map((lab) => (
          <option key={lab} value={lab} />
        ))}
      </datalist>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={addLine}
          disabled={value.length >= MAX_WORK_LINES}
        >
          <Plus size={17} aria-hidden />
          {t('addLine')}
        </button>

        {/* The figure the invoice gets checked against, kept in step as the case
            is written rather than added up afterwards. */}
        <p aria-live="polite" className="text-[0.95rem] text-ink-soft">
          {t('elementsTotal')}{' '}
          <span className="text-[1.15rem] font-bold text-ink tabular-nums">
            {elementsOf({ lines: value })}
          </span>
        </p>
      </div>
    </div>
  );
}
