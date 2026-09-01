'use client';

import { Eye, EyeOff, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { setHiddenNav } from '@/lib/actions/preferences';
import { serialiseHidden, type Hideable } from '@/lib/nav-visibility';
import { cn } from '@/lib/utils';

/**
 * The menu that takes rows *out* of the menu.
 *
 * Next to the question mark, in the same corner, because they are two halves of
 * the same offer: this is a large application, here is what each screen is for,
 * and here is how to put away the ones this practice does not use. A dentist who
 * has just read that the works register is for cases sent to a laboratory, and
 * who does not send cases to a laboratory, should be able to act on that in the
 * next click rather than filing a request.
 *
 * What it is not: a permissions screen. Nothing here grants anybody anything or
 * takes anything away — see the note in `lib/nav-visibility.ts`. It hides rows
 * for this one person, wherever they sign in, and the panel says so in as many
 * words: a control that looked like it were revoking a colleague's access while
 * quietly doing nothing of the kind would be the worst thing in the building.
 *
 * The choices apply on the way out rather than on every press. A rail that
 * re-rendered under the panel on each tick would jump the page around while
 * somebody is halfway down a list of fourteen switches; closing is the moment
 * they are finished, and it is one round trip instead of fourteen.
 */
export function TailorMenu({
  items,
  hidden: initialHidden,
  tone = 'surface',
}: {
  /** What this person may switch off — permission-filtered on the server. */
  items: ReadonlyArray<Hideable & { label: string }>;
  /** What is off already, from the account, so first paint is right. */
  hidden: readonly string[];
  /** `brand` on the phone's teal bar, `surface` on the pale row. As the bell. */
  tone?: 'surface' | 'brand';
}) {
  const t = useTranslations('tailor');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set(initialHidden));
  const [, startTransition] = useTransition();

  // What the server was last told. The rail is only worth re-rendering when the
  // answer has actually changed — opening the panel and closing it again should
  // cost nothing.
  const written = useRef(serialiseHidden(initialHidden));

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;

    const onClick = (event: MouseEvent) => {
      if (event.target === dialog) setOpen(false);
    };

    dialog.addEventListener('click', onClick);
    return () => dialog.removeEventListener('click', onClick);
  }, [open]);

  /**
   * Send the choice to the account, once, on the way out.
   *
   * The action revalidates the layout, so the rail redraws from its response —
   * no separate refresh, and no request at all when somebody opened the panel,
   * looked, and closed it again unchanged.
   */
  function commit(next: ReadonlySet<string>) {
    const value = serialiseHidden(next);
    if (value === written.current) return;
    written.current = value;
    startTransition(() => {
      void setHiddenNav([...next]);
    });
  }

  function toggle(key: string) {
    setHidden((was) => {
      const next = new Set(was);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  const groups = ['admin', 'start', 'care', 'contact', 'practice'] as const;
  const shownCount = items.length - items.filter(({ key }) => hidden.has(key)).length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t('button')}
        title={t('button')}
        className={cn(
          'relative flex min-h-11 min-w-11 shrink-0 items-center justify-center',
          tone === 'brand'
            ? 'on-brand-control rounded-lg focus-visible:outline-white'
            : 'rounded-xl border border-line-strong bg-surface text-ink-soft transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand-deep focus-visible:outline focus-visible:outline-offset-2',
        )}
      >
        <SlidersHorizontal size={20} aria-hidden />

        {/* A dot, not a number: "you have put some things away" is the whole
            message, and it exists so nobody spends a morning hunting for a
            screen they themselves switched off last Tuesday. */}
        {hidden.size > 0 ? (
          <span
            aria-hidden
            className={cn(
              'absolute -top-1 -right-1 size-2.5 rounded-full bg-brand ring-2',
              tone === 'brand' ? 'ring-brand-deep' : 'ring-surface',
            )}
          />
        ) : null}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClose={() => {
          setOpen(false);
          commit(hidden);
        }}
        className={cn(
          'm-auto max-h-[min(88vh,48rem)] w-[min(94vw,36rem)] overflow-visible',
          'rounded-[var(--radius-card)] border border-line bg-surface p-0 text-ink shadow-pop',
        )}
      >
        <div className="flex max-h-[min(88vh,48rem)] flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div className="flex min-w-0 items-start gap-3">
              <span
                aria-hidden
                className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-deep"
              >
                <SlidersHorizontal size={22} />
              </span>
              <div className="min-w-0">
                <h2 id={titleId} className="text-title leading-tight font-bold text-ink">
                  {t('title')}
                </h2>
                <p className="mt-0.5 text-meta text-ink-soft">{t('subtitle')}</p>
              </div>
            </div>

            <button
              type="button"
              className="btn btn-ghost btn-sm shrink-0"
              aria-label={t('close')}
              onClick={() => setOpen(false)}
            >
              <X size={20} aria-hidden />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {/* Said before the switches rather than after them. Somebody about
                to hide "Staff and roles" is entitled to know, first, that they
                are tidying their own menu and not removing a colleague's
                access. */}
            <p className="border-b border-line bg-brand-soft px-5 py-3 text-meta leading-relaxed text-ink">
              {t('note')}
            </p>

            {groups.map((group) => {
              const rows = items.filter((item) => item.group === group);
              if (rows.length === 0) return null;

              return (
                <section key={group} className="border-b border-line last:border-b-0">
                  <h3 className="px-5 pt-4 pb-1 text-caption font-bold tracking-wide text-ink-faint uppercase">
                    {t(`group.${group}`)}
                  </h3>
                  <ul>
                    {rows.map((item) => {
                      const off = hidden.has(item.key);
                      return (
                        <li key={item.key}>
                          <button
                            type="button"
                            onClick={() => toggle(item.key)}
                            aria-pressed={!off}
                            className={cn(
                              'relative flex min-h-12 w-full items-center gap-3 px-5 py-2 text-left transition-colors hover:bg-paper',
                              // Indented off a hairline, exactly as the rail
                              // indents them, so a row called "Categories"
                              // cannot be mistaken for the one two sections
                              // down that is also called Categories.
                              //
                              // Padding and a drawn rule rather than a margin:
                              // the row is `w-full`, so a left margin pushed it
                              // that far past the right edge of the panel and
                              // took its switch with it.
                              item.under &&
                                'pl-13 before:absolute before:inset-y-0 before:left-8 before:w-px before:bg-line',
                            )}
                          >
                            <span
                              aria-hidden
                              className={cn(
                                'grid shrink-0 place-items-center rounded-lg transition-colors',
                                item.under ? 'size-7' : 'size-8',
                                off
                                  ? 'bg-paper text-ink-faint'
                                  : 'bg-brand-soft text-brand-deep',
                              )}
                            >
                              {off ? <EyeOff size={17} /> : <Eye size={17} />}
                            </span>
                            <span
                              className={cn(
                                'min-w-0 flex-1 truncate',
                                item.under
                                  ? 'text-meta font-medium'
                                  : 'text-body font-semibold',
                                off ? 'text-ink-faint line-through' : 'text-ink',
                              )}
                            >
                              {item.label}
                            </span>
                            <span className="shrink-0 text-caption font-bold text-ink-soft">
                              {off ? t('hidden') : t('shown')}
                            </span>
                            {/* A switch, drawn rather than an <input>: the whole
                                row is the target, and a checkbox inside a button
                                would be a control inside a control. `aria-
                                pressed` on the button is what is announced. */}
                            <span
                              aria-hidden
                              className={cn(
                                'block h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors',
                                off ? 'bg-line-strong' : 'bg-brand-dark',
                              )}
                            >
                              <span
                                className={cn(
                                  'block size-5 rounded-full bg-surface shadow-card transition-transform',
                                  off ? 'translate-x-0' : 'translate-x-5',
                                )}
                              />
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>

          <footer className="flex items-center justify-between gap-3 border-t border-line px-5 py-4">
            <p className="min-w-0 text-meta text-ink-soft">
              {t('count', { shown: shownCount, total: items.length })}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={hidden.size === 0}
                onClick={() => setHidden(new Set())}
              >
                <RotateCcw size={17} aria-hidden />
                {t('reset')}
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setOpen(false)}
              >
                {t('done')}
              </button>
            </div>
          </footer>
        </div>
      </dialog>
    </>
  );
}
