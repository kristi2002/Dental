'use client';

import { ArrowRight, Loader2, Search, User } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from '@/i18n/navigation';
import { searchPatients } from '@/lib/actions/patients';
import type { PatientOption } from '@/components/appointments/AppointmentFormDialog';
import { matches } from '@/lib/utils';

/** Long enough that typing a name does not fire a query per keystroke. */
const DEBOUNCE_MS = 180;

export type PaletteDestination = { href: string; label: string };

/**
 * One box that finds anything.
 *
 * Every screen in this app can be reached from the rail, and every patient can
 * be found — on the patients page, once you are on it. So the single most
 * repeated act in the building, *look somebody up*, cost a navigation before it
 * could even begin, and the answer to "is Arta booked in?" was three screens
 * away from wherever you were standing.
 *
 * Deliberately two lists rather than one ranked one: a screen and a person are
 * different kinds of answer, and burying "Stock" under four Kristinas would make
 * the fast half of this slower. Patients are searched on the server — the same
 * `searchPatients` the booking dialog uses, which is why this needs no index of
 * its own — while the destinations are a fixed handful filtered in the browser.
 */
export function CommandPalette({
  destinations,
  label,
  placeholder,
  screensLabel,
  patientsLabel,
  emptyLabel,
}: {
  /** Screens this person may open, already permission-filtered on the server. */
  destinations: PaletteDestination[];
  label: string;
  placeholder: string;
  screensLabel: string;
  patientsLabel: string;
  emptyLabel: string;
}) {
  const t = useTranslations('patients');
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<PatientOption[]>([]);
  const [pending, startTransition] = useTransition();

  // Ctrl+K on Windows and Linux, ⌘K on a Mac — the shortcut every application
  // with a search box has trained people to reach for. `/` is deliberately not
  // bound: this app is full of text fields, and stealing a printable character
  // would break typing a note about tooth 46's mesial surface.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k' || !(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      const dialog = dialogRef.current;
      if (!dialog) return;
      if (dialog.open) dialog.close();
      else dialog.showModal();
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) {
      setPeople([]);
      return;
    }

    const timer = setTimeout(() => {
      startTransition(async () => setPeople(await searchPatients(text)));
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const screens = query.trim()
    ? destinations.filter((destination) => matches(destination.label, query))
    : destinations;

  const go = (href: string) => {
    dialogRef.current?.close();
    setQuery('');
    setPeople([]);
    router.push(href);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-left text-ink-faint transition-colors hover:border-brand hover:text-ink-soft"
      >
        <Search size={18} aria-hidden />
        <span className="flex-1 truncate text-[0.95rem]">{label}</span>
        {/* Not shown on a phone, where there is no keyboard to press it with. */}
        <kbd className="hidden rounded border border-line-strong px-1.5 py-0.5 text-[0.75rem] font-semibold tabular-nums sm:inline">
          Ctrl K
        </kbd>
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => {
          setQuery('');
          setPeople([]);
        }}
        // Clicking the backdrop is the same as pressing Escape. The check is on
        // the dialog itself rather than a wrapper: the backdrop is not an
        // element, so the only event it can produce is one targeting the dialog.
        onClick={(event) => {
          if (event.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="m-0 mx-auto mt-[8vh] w-[min(38rem,92vw)] rounded-[var(--radius-card)] border border-line-strong bg-surface p-0 text-ink shadow-card backdrop:bg-black/40"
      >
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <Search size={20} aria-hidden className="shrink-0 text-ink-faint" />
          <input
            ref={inputRef}
            type="search"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={placeholder}
            aria-label={label}
            className="min-w-0 flex-1 bg-transparent text-[1.05rem] outline-none placeholder:text-ink-faint"
          />
          {pending ? (
            <Loader2 size={18} aria-hidden className="shrink-0 animate-spin text-ink-faint" />
          ) : null}
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {screens.length > 0 ? (
            <>
              <p className="px-2 pb-1 pt-2 text-[0.8rem] font-bold uppercase tracking-wide text-ink-faint">
                {screensLabel}
              </p>
              <ul>
                {screens.map((destination) => (
                  <li key={destination.href}>
                    <button
                      type="button"
                      onClick={() => go(destination.href)}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[1rem] font-semibold text-ink hover:bg-paper"
                    >
                      <ArrowRight size={17} aria-hidden className="shrink-0 text-ink-faint" />
                      {destination.label}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {people.length > 0 ? (
            <>
              <p className="px-2 pb-1 pt-3 text-[0.8rem] font-bold uppercase tracking-wide text-ink-faint">
                {patientsLabel}
              </p>
              <ul>
                {people.map((person) => (
                  <li key={person.id}>
                    <button
                      type="button"
                      onClick={() => go(`/patients/${person.id}`)}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-paper"
                    >
                      <User size={17} aria-hidden className="shrink-0 text-ink-faint" />
                      <span className="min-w-0">
                        <span className="block truncate text-[1rem] font-semibold text-ink">
                          {person.name}
                        </span>
                        {person.phone ? (
                          <span className="block truncate text-[0.88rem] text-ink-soft">
                            {person.phone}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {/* Only once a search has actually run and come back with nothing —
              before that, an empty list is just an empty box. */}
          {screens.length === 0 && people.length === 0 && !pending && query.trim().length >= 2 ? (
            <p className="px-2.5 py-6 text-center text-ink-soft">
              {t('emptySearch', { query: query.trim() })}
            </p>
          ) : null}

          {query.trim().length < 2 ? (
            <p className="px-2.5 pb-2 pt-3 text-[0.88rem] text-ink-faint">{emptyLabel}</p>
          ) : null}
        </div>
      </dialog>
    </>
  );
}
