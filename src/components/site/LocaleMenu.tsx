'use client';

import { Check, ChevronDown } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { Flag } from '@/components/site/Flag';
import { usePathname, useRouter } from '@/i18n/navigation';
import { localeLabels, localeShortLabels, locales, type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * The language control, as the flag menu everybody already knows how to use.
 *
 * What was here before was a segmented control: three codes in a bordered
 * group, all visible at once, `aria-pressed` on the active one. It is the right
 * shape for a *setting* — it shows you the options and which is on — and the
 * wrong shape for the top-right corner of a clinic's front page, where the
 * reader is not choosing a preference so much as looking for their own
 * language and expecting the one widget every travel site, every airline and
 * every hotel has taught them. Three equal-weight buttons also read as
 * navigation, and a visitor who has just landed on `/sq` should not have to work
 * out that "SQ" is a state rather than a destination.
 *
 * So: the current flag and its endonym on a button, and the other two a click
 * away. It costs one interaction and it buys the whole corner back — which is
 * what let the masthead give its space to the practice's lockup instead.
 *
 * **The endonyms, not translations.** `Shqip`, `English`, `Italiano` — each
 * written in itself, because somebody who cannot read the current language
 * cannot read "Albanian" either. That was already right in the old control and
 * is the one thing carried over unchanged.
 *
 * Not the app's `LanguageSwitcher`, deliberately. That one lives in a 15rem
 * navigation rail that pinches to 4.5rem, and it is shaped by that constraint
 * down to the two label widths it swaps between. The two components share the
 * locale list and nothing else, and pretending otherwise would mean one widget
 * with four props serving two surfaces badly.
 */
export function LocaleMenu({ className }: { className?: string }) {
  const t = useTranslations('nav');
  const active = useLocale() as Locale;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const menuId = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  /**
   * The two ways out that a hand-rolled menu forgets.
   *
   * Escape returns focus to the button rather than dropping it on the body —
   * without that, a keyboard user who dismisses the menu is back at the top of
   * the document and has to tab through the whole masthead again. And a
   * `pointerdown` anywhere outside closes it, which is the behaviour a mouse
   * user expects from every menu they have ever used.
   *
   * `pointerdown` rather than `click`: a `click` listener fires after the
   * button's own handler, so pressing the trigger a second time would close the
   * menu here and immediately reopen it there.
   */
  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };

    const onPointerDown = (event: PointerEvent) => {
      if (wrapper.current?.contains(event.target as Node)) return;
      setOpen(false);
    };

    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  function switchTo(locale: Locale) {
    setOpen(false);
    if (locale === active) return;
    // The query survives the switch. Nothing on the storefront reads one today,
    // but a link somebody was sent — a campaign tag, an anchor with a parameter
    // on it — should not be quietly dropped because they changed language.
    const query = searchParams.toString();
    startTransition(() => {
      router.replace(`${pathname}${query ? `?${query}` : ''}`, { locale });
    });
  }

  return (
    <div ref={wrapper} className={cn('relative shrink-0', className)}>
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={pending}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        // The button shows a flag and a word; neither says what pressing it
        // does. Without this a screen reader announces "Shqip, menu button",
        // which is a fact and not an explanation.
        aria-label={t('language')}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/25 bg-navy/40 px-3 text-meta font-semibold text-white backdrop-blur-md transition-colors hover:bg-white/20 focus-visible:outline-white disabled:opacity-60 sm:px-3.5"
      >
        <Flag locale={active} className="h-4" />
        {/* The endonym where there is room for it, the two-letter code where
            there is not. On a 390px masthead the difference between "Italiano"
            and "IT" is the difference between a bar and a sideways scroll. */}
        <span aria-hidden className="hidden sm:inline">
          {localeLabels[active]}
        </span>
        <span aria-hidden className="sm:hidden">
          {localeShortLabels[active]}
        </span>
        <ChevronDown
          size={15}
          aria-hidden
          className={cn('transition-transform', open && 'rotate-180')}
        />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={t('language')}
          // Right-aligned, because it hangs off the right edge of the masthead
          // and a left-aligned menu would run off the screen on a phone.
          className="absolute right-0 z-50 mt-2 w-max min-w-[11rem] overflow-hidden rounded-xl border border-bone-deep bg-bone-soft py-1.5 shadow-pop"
        >
          {locales.map((locale) => {
            const current = locale === active;
            return (
              <button
                key={locale}
                type="button"
                role="menuitemradio"
                aria-checked={current}
                lang={locale}
                onClick={() => switchTo(locale)}
                className={cn(
                  'flex min-h-11 w-full items-center gap-3 px-3.5 text-left text-body transition-colors',
                  current
                    ? 'font-bold text-bone-ink'
                    : 'font-semibold text-bone-ink-soft hover:bg-gilt-soft hover:text-bone-ink',
                )}
              >
                <Flag locale={locale} className="h-4" />
                <span className="flex-1">{localeLabels[locale]}</span>
                {/* The tick is the only thing marking the current language, and
                    `aria-checked` above says the same thing to a reader who
                    cannot see it. */}
                <Check
                  size={16}
                  aria-hidden
                  className={cn('shrink-0 text-gilt-deep', !current && 'invisible')}
                />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
