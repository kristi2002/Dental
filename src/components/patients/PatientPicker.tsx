'use client';

import { Search, UserPlus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { searchPatients } from '@/lib/actions/patients';
import { NEW_PATIENT_VALUE } from '@/lib/booking';
import type { PatientOption } from '@/components/appointments/AppointmentFormDialog';

/** Long enough that typing a name does not fire a query per keystroke. */
const DEBOUNCE_MS = 200;

/**
 * Find one person, without shipping everybody.
 *
 * Replaces a `<select>` that carried the whole patient list into the browser on
 * every page that could open a booking. At forty patients the select was the
 * better control and this is a fair trade; at three thousand it was a few
 * hundred KB per navigation for a dropdown most visits never open.
 *
 * Deliberately not a combobox with a floating listbox: the results are plain
 * buttons under the input, so they reach by Tab, work without pointer
 * precision, and cannot end up positioned off-screen inside a dialog.
 */
export function PatientPicker({
  name,
  label,
  defaultPatient,
  allowNew = false,
  onNewChange,
  onPick,
  required = false,
}: {
  /** Form field the chosen id is submitted under. */
  name: string;
  label: string;
  /** Pre-selected person, when the screen already knows who this is about. */
  defaultPatient?: PatientOption;
  /** Offer "+ New patient", for the front desk booking somebody unknown. */
  allowNew?: boolean;
  /** Told when the new-patient option is picked or cleared. */
  onNewChange?: (adding: boolean) => void;
  /**
   * Told who was chosen, and `null` when the choice is cleared. For the forms
   * that copy details off the record rather than only pointing at it — the works
   * register writes the name and number onto its own row. See `Work.patientName`.
   */
  onPick?: (patient: PatientOption | null) => void;
  required?: boolean;
}) {
  const t = useTranslations('patients');
  const ta = useTranslations('appointments');
  const tc = useTranslations('common');
  const uid = useId();

  const [chosen, setChosen] = useState<PatientOption | null>(defaultPatient ?? null);
  const [addingNew, setAddingNew] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PatientOption[]>([]);
  const [searched, setSearched] = useState(false);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const text = query.trim();
    if (text.length === 0) {
      setResults([]);
      setSearched(false);
      return;
    }

    const timer = setTimeout(() => {
      startTransition(async () => {
        setResults(await searchPatients(text));
        setSearched(true);
      });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);

  function pick(patient: PatientOption) {
    setChosen(patient);
    setAddingNew(false);
    onNewChange?.(false);
    onPick?.(patient);
    setQuery('');
    setResults([]);
    setSearched(false);
  }

  function pickNew() {
    setChosen(null);
    setAddingNew(true);
    onNewChange?.(true);
    onPick?.(null);
    setQuery('');
    setResults([]);
    setSearched(false);
  }

  function clear() {
    setChosen(null);
    setAddingNew(false);
    onNewChange?.(false);
    onPick?.(null);
    // Focus lands back where the next thing to do is.
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  // The value the form submits: a real id, the new-patient sentinel, or nothing
  // — in which case `required` stops the submit rather than saving a blank.
  const value = addingNew ? NEW_PATIENT_VALUE : (chosen?.id ?? '');

  return (
    <div className="field">
      <label className="field-label" htmlFor={`${uid}-search`}>
        {label}
        {required ? null : <span className="field-optional">{tc('optional')}</span>}
      </label>

      {/* Not a disabled input: a disabled field is skipped by the form, and this
          value is the whole point of the control. */}
      <input type="hidden" name={name} value={value} required={required} />

      {chosen || addingNew ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border-2 border-brand bg-brand-soft px-3.5 py-2.5">
          <span className="min-w-0 flex-1 text-[1.05rem] font-bold text-brand-deep">
            {addingNew ? ta('newPatientTitle') : chosen?.name}
            {!addingNew && chosen?.phone ? (
              <span className="ml-2 font-normal text-ink-soft tabular-nums">{chosen.phone}</span>
            ) : null}
          </span>
          <button type="button" onClick={clear} className="btn btn-ghost btn-sm">
            <X size={17} aria-hidden />
            {tc('edit')}
          </button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search
              size={18}
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint"
            />
            <input
              id={`${uid}-search`}
              ref={inputRef}
              type="search"
              autoComplete="off"
              className="field-input pl-10"
              placeholder={t('searchPlaceholder')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                // Enter inside a dialog would otherwise submit the whole form
                // with no patient chosen.
                if (event.key === 'Enter') {
                  event.preventDefault();
                  if (results.length > 0) pick(results[0]);
                }
              }}
            />
          </div>

          {allowNew ? (
            <button type="button" onClick={pickNew} className="btn btn-secondary btn-sm mt-2">
              <UserPlus size={17} aria-hidden />
              {ta('newPatientOption')}
            </button>
          ) : null}

          {results.length > 0 ? (
            <ul className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-line-strong">
              {results.map((patient) => (
                <li key={patient.id} className="border-b border-line last:border-b-0">
                  <button
                    type="button"
                    onClick={() => pick(patient)}
                    className="flex w-full items-baseline gap-3 px-3.5 py-2.5 text-left hover:bg-paper"
                  >
                    <span className="min-w-0 flex-1 text-[1.02rem] font-semibold text-ink">
                      {patient.name}
                    </span>
                    {patient.phone ? (
                      <span className="text-[0.92rem] text-ink-soft tabular-nums">
                        {patient.phone}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {/* Only once a search has actually come back — "nothing found" while
              the query is still in flight is a lie that flickers. */}
          {searched && !pending && results.length === 0 ? (
            <p className="mt-2 text-[0.95rem] text-ink-soft">
              {t('emptySearch', { query: query.trim() })}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
