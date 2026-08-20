'use client';

/* Two things in here take a click on an element the linter reads as unable to
   answer a keyboard: the `<dialog>` itself, whose click handler is the backdrop
   (a `<dialog>` closes on Escape natively — that *is* the keyboard half, and the
   linter has no way to see it), and the result rows, which are `role="option"`
   inside a listbox. An option is not what receives the keys in that pattern —
   the input does, and it moves the highlight and opens the row, which is the
   whole point of the rewrite below. */
/* eslint-disable jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */

import { ArrowRight, ListFilter, Loader2, Search, User } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { KeyboardEvent, ReactNode } from 'react';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { useRouter } from '@/i18n/navigation';
import { searchPatients } from '@/lib/actions/patients';
import type { PatientOption } from '@/components/appointments/AppointmentFormDialog';
import { rankMatches } from '@/lib/search-match';

/** Long enough that typing a name does not fire a query per keystroke. */
const DEBOUNCE_MS = 180;

/** Below this a patient search is noise — every Ana in the building. */
const MIN_QUERY = 2;

export type PaletteDestination = { href: string; label: string };

type Row =
  | { key: string; href: string; kind: 'screen' | 'list'; label: string }
  | { key: string; href: string; kind: 'patient'; person: PatientOption };

/**
 * One box that finds anything.
 *
 * Every screen in this app can be reached from the rail, and every patient can
 * be found — on the patients page, once you are on it. So the single most
 * repeated act in the building, *look somebody up*, cost a navigation before it
 * could even begin, and the answer to "is Arta booked in?" was three screens
 * away from wherever you were standing.
 *
 * Deliberately grouped rather than one ranked list: a screen and a person are
 * different kinds of answer, and burying "Stock" under four Kristinas would make
 * the fast half of this slower. Patients are searched on the server — the same
 * `searchPatients` the booking dialog uses, which is why this needs no index of
 * its own — while the destinations are a fixed handful ranked in the browser.
 *
 * Three things it did not do, and now does:
 *
 * - **It answers the keyboard.** It opened on Ctrl+K and then asked for the
 *   mouse: the only way to a patient was to click one, or to Tab down past
 *   every screen above them. Arrows move a highlight through every row and
 *   Enter opens it, which is what makes the shortcut worth pressing.
 * - **It ranks.** `matches()` is one substring test over the whole label, so
 *   "stock lab" found nothing at all — the `·` sits in the middle of it — and
 *   whatever did survive came back in rail order however badly it matched. See
 *   `scoreMatch`.
 * - **It hands the words on.** When nobody is called what you typed, what you
 *   are usually holding is a material or a treatment. The last group carries
 *   the same query into the list that *does* search those, rather than leaving
 *   "no patient matches composite" as the last word on it.
 */
export function CommandPalette({
  destinations,
  searches,
  label,
  placeholder,
  screensLabel,
  patientsLabel,
  emptyLabel,
}: {
  /** Screens this person may open, already permission-filtered on the server. */
  destinations: PaletteDestination[];
  /**
   * The lists that have a search box of their own, to hand the typed words to.
   * `href` is the list's own path; the query is appended as `?q=`, which is the
   * parameter each of those pages already reads. Permission-filtered too.
   */
  searches: PaletteDestination[];
  label: string;
  placeholder: string;
  screensLabel: string;
  patientsLabel: string;
  emptyLabel: string;
}) {
  const t = useTranslations('patients');
  const ta = useTranslations('app');
  const router = useRouter();
  const uid = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState('');
  // Which query the people below are the answer to, kept beside them rather
  // than in a second piece of state: it is the only way "nothing found" can be
  // stopped from being said about a search that has not come back yet.
  const [found, setFound] = useState<{ query: string; people: PatientOption[] }>({
    query: '',
    people: [],
  });
  const [active, setActive] = useState(0);
  const [pending, startTransition] = useTransition();
  const [isMac, setIsMac] = useState(false);
  // Which search is the current one. A slow answer for "kri" must not land on
  // top of a finished answer for "kristina" — one box, two flights, and nothing
  // promises they come back in the order they left.
  const flight = useRef(0);

  const text = query.trim();

  function openPalette() {
    dialogRef.current?.showModal();
    inputRef.current?.focus();
  }

  // Ctrl+K on Windows and Linux, ⌘K on a Mac — the shortcut every application
  // with a search box has trained people to reach for. `/` is deliberately not
  // bound: this app is full of text fields, and stealing a printable character
  // would break typing a note about tooth 46's mesial surface.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k' || !(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      const dialog = dialogRef.current;
      if (!dialog) return;
      if (dialog.open) dialog.close();
      else {
        dialog.showModal();
        inputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Which keycap to draw on the trigger. Read after mount on purpose: the server
  // has no idea what is under the desk, and rendering a guess would be a
  // hydration mismatch on every page in the app.
  useEffect(() => {
    const agent = navigator.userAgent;
    setIsMac(/mac/i.test(agent) && !/iphone|ipad/i.test(agent));
  }, []);

  useEffect(() => {
    const wanted = query.trim();
    if (wanted.length < MIN_QUERY) {
      flight.current += 1;
      setFound({ query: wanted, people: [] });
      return;
    }

    const timer = setTimeout(() => {
      const mine = (flight.current += 1);
      startTransition(async () => {
        const people = await searchPatients(wanted);
        if (flight.current === mine) setFound({ query: wanted, people });
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const screens = rankMatches(destinations, query, (destination) => destination.label);
  const people = found.people;
  // The people on screen are the answer to what is in the box — not to two
  // keystrokes ago. Until they are, nothing here says "nothing found".
  const settled = found.query === text;

  const sections: Array<{ id: string; heading: string; rows: Row[] }> = [];

  if (screens.length > 0) {
    sections.push({
      id: 'screens',
      heading: screensLabel,
      rows: screens.map((destination) => ({
        kind: 'screen',
        key: `screen:${destination.href}`,
        href: destination.href,
        label: destination.label,
      })),
    });
  }

  if (people.length > 0) {
    sections.push({
      id: 'patients',
      heading: patientsLabel,
      rows: people.map((person) => ({
        kind: 'patient',
        key: `patient:${person.id}`,
        href: `/patients/${person.id}`,
        person,
      })),
    });
  }

  // Only once there is something worth carrying across, and only into lists this
  // person is allowed to open.
  if (text.length >= MIN_QUERY && searches.length > 0) {
    sections.push({
      id: 'lists',
      heading: ta('paletteSearchIn', { query: text }),
      rows: searches.map((list) => ({
        kind: 'list',
        key: `list:${list.href}`,
        href: `${list.href}?q=${encodeURIComponent(text)}`,
        label: list.label,
      })),
    });
  }

  // Nothing was asked for that anybody in this building is called. Said out
  // loud, because a list that quietly offers four other places to look does not
  // answer the question that was typed.
  const nothingFound =
    text.length >= MIN_QUERY && settled && screens.length === 0 && people.length === 0;

  const rows = sections.flatMap((section) => section.rows);
  // Clamped rather than trusted: the list shrinks under a highlight that may be
  // pointing at a row that has just stopped existing.
  const cursor = rows.length > 0 ? Math.min(active, rows.length - 1) : -1;

  // A new list is a new first answer. Anything else, and the highlight sits on
  // whichever row happened to slide under it.
  useEffect(() => setActive(0), [query, found]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  function reset() {
    flight.current += 1;
    setQuery('');
    setFound({ query: '', people: [] });
    setActive(0);
  }

  const go = (href: string) => {
    dialogRef.current?.close();
    reset();
    router.push(href);
  };

  const move = (delta: number) => {
    if (rows.length === 0) return;
    // Read from the setter rather than from the render this handler was made
    // in: a held-down arrow key repeats faster than a render, and every press
    // in the same tick would otherwise move from the same starting row.
    setActive((current) => {
      const from = Math.min(current, rows.length - 1);
      // Wraps, both ways: the fastest route to the last row is one press up.
      return (from + delta + rows.length) % rows.length;
    });
  };

  const onInputKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(-1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const row = rows[cursor];
      if (row) go(row.href);
    }
    // Home and End are deliberately left alone. They belong to the caret in a
    // text field, and a long name typed with a typo in it is edited with them.
  };

  // Numbered across the whole flat list rather than per group: it is one
  // highlight travelling through every answer, and `aria-activedescendant`
  // needs the id of the row it is on.
  let index = -1;

  return (
    <>
      <button
        type="button"
        onClick={openPalette}
        className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-left text-ink-faint transition-colors hover:border-brand hover:text-ink-soft"
      >
        <Search size={18} aria-hidden />
        <span className="flex-1 truncate text-[0.95rem]">{label}</span>
        {/* Not shown on a phone, where there is no keyboard to press it with. */}
        <kbd className="hidden rounded border border-line-strong px-1.5 py-0.5 text-[0.75rem] font-semibold tabular-nums sm:inline">
          {isMac ? '⌘ K' : 'Ctrl K'}
        </kbd>
      </button>

      <dialog
        ref={dialogRef}
        onClose={reset}
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
          {/* `type="text"`, not `type="search"`: a search field swallows the
              first Escape to clear itself, and the first Escape in here belongs
              to the dialog. */}
          <input
            ref={inputRef}
            type="text"
            autoFocus
            autoComplete="off"
            role="combobox"
            aria-expanded={rows.length > 0}
            aria-controls={`${uid}-results`}
            aria-activedescendant={cursor >= 0 ? `${uid}-row-${cursor}` : undefined}
            aria-autocomplete="list"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onInputKey}
            placeholder={placeholder}
            aria-label={label}
            className="min-w-0 flex-1 bg-transparent text-[1.05rem] outline-none placeholder:text-ink-faint"
          />
          {pending ? (
            <Loader2 size={18} aria-hidden className="shrink-0 animate-spin text-ink-faint" />
          ) : null}
        </div>

        {/* Said out loud for somebody who cannot see the list change under the
            cursor — and only once the answer is the answer to what was typed. */}
        <p aria-live="polite" className="sr-only">
          {text.length >= MIN_QUERY && settled ? ta('paletteCount', { count: rows.length }) : ''}
        </p>

        <div
          ref={listRef}
          id={`${uid}-results`}
          role="listbox"
          aria-label={label}
          className="max-h-[60vh] overflow-y-auto p-2"
        >
          {/* Only once a search has actually run and come back with nothing —
              before that, an empty list is just an empty box. Above the groups
              rather than under them, and safely so: nothing can have been found
              for this to show at all, so the only group that can be below it is
              the one offering somewhere else to look. Which is the order it
              wants to be read in — nobody is called that, so: try there. */}
          {nothingFound ? (
            <p className="px-2.5 py-6 text-center text-ink-soft">
              {t('emptySearch', { query: text })}
            </p>
          ) : null}

          {sections.map((section) => (
            <div key={section.id} role="group" aria-labelledby={`${uid}-${section.id}`}>
              <p
                id={`${uid}-${section.id}`}
                className="px-2 pb-1 pt-2 text-[0.8rem] font-bold uppercase tracking-wide text-ink-faint"
              >
                {section.heading}
              </p>
              {section.rows.map((row) => {
                index += 1;
                const at = index;
                return (
                  <div
                    key={row.key}
                    id={`${uid}-row-${at}`}
                    role="option"
                    // Reachable by script, never by Tab: focus stays in the
                    // input for the whole life of this list, which is what
                    // `aria-activedescendant` above is for.
                    tabIndex={-1}
                    aria-selected={at === cursor}
                    data-active={at === cursor}
                    // Moved over, not entered: a list scrolling past a parked
                    // pointer must not take the highlight off the keyboard.
                    onMouseMove={() => setActive(at)}
                    onClick={() => go(row.href)}
                    className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left ${
                      at === cursor ? 'bg-brand-soft' : ''
                    }`}
                  >
                    {row.kind === 'patient' ? (
                      <>
                        <User size={17} aria-hidden className="shrink-0 text-ink-faint" />
                        <span className="min-w-0">
                          <span className="block truncate text-[1rem] font-semibold text-ink">
                            {row.person.name}
                          </span>
                          {row.person.phone ? (
                            <span className="block truncate text-[0.88rem] text-ink-soft">
                              {row.person.phone}
                            </span>
                          ) : null}
                        </span>
                      </>
                    ) : (
                      <>
                        {row.kind === 'list' ? (
                          <ListFilter size={17} aria-hidden className="shrink-0 text-ink-faint" />
                        ) : (
                          <ArrowRight size={17} aria-hidden className="shrink-0 text-ink-faint" />
                        )}
                        <span className="min-w-0 truncate text-[1rem] font-semibold text-ink">
                          {row.label}
                        </span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {text.length < MIN_QUERY ? (
            <p className="px-2.5 pb-2 pt-3 text-[0.88rem] text-ink-faint">{emptyLabel}</p>
          ) : null}
        </div>

        {/* The keys, where somebody who has never pressed them can read them.
            Not on a phone: there is no keyboard down there to press. */}
        <div className="hidden items-center gap-4 border-t border-line px-4 py-2 text-[0.78rem] text-ink-faint sm:flex">
          <span className="flex items-center gap-1.5">
            <Keycap>↑</Keycap>
            <Keycap>↓</Keycap>
            {ta('paletteMove')}
          </span>
          <span className="flex items-center gap-1.5">
            <Keycap>↵</Keycap>
            {ta('paletteOpen')}
          </span>
          <span className="flex items-center gap-1.5">
            <Keycap>Esc</Keycap>
            {ta('paletteClose')}
          </span>
        </div>
      </dialog>
    </>
  );
}

function Keycap({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-line-strong px-1 py-0.5 text-[0.72rem] font-semibold leading-none">
      {children}
    </kbd>
  );
}
