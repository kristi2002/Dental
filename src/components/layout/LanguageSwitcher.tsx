'use client';

import { Languages } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { localeLabels, localeShortLabels, locales, type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

export function LanguageSwitcher({
  compact = false,
  tone = 'brand',
}: {
  /** Endonyms cost ~230px; in a narrow bar the three codes have to do instead. */
  compact?: boolean;
  /**
   * Which ground this is sitting on.
   *
   * `brand` is the teal masthead the signed-out screens wear. `menu` is the
   * account menu's white surface, where it is drawn with the same `.segmented`
   * control as the theme and the density beside it — the three of them are one
   * question ("how does this look to me") and should not read as three
   * different kinds of switch.
   */
  tone?: 'brand' | 'menu';
} = {}) {
  const t = useTranslations('nav');
  const active = useLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function switchTo(locale: Locale) {
    if (locale === active) return;
    const query = searchParams.toString();
    startTransition(() => {
      router.replace(`${pathname}${query ? `?${query}` : ''}`, { locale });
    });
  }

  if (tone === 'menu') {
    return (
      <div className="segmented w-full" role="group" aria-label={t('language')}>
        {locales.map((locale) => (
          <button
            key={locale}
            type="button"
            lang={locale}
            disabled={pending}
            className="segment flex-1"
            aria-pressed={locale === active}
            title={localeLabels[locale]}
            onClick={() => switchTo(locale)}
          >
            <span aria-hidden className="text-meta font-bold">
              {localeShortLabels[locale]}
            </span>
            <span className="sr-only">{localeLabels[locale]}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      <Languages size={18} aria-hidden className="hidden text-white sm:block" />
      <div
        role="group"
        aria-label={t('language')}
        // white/65 on the masthead's teal, for the same reason as
        // `.on-brand-control`: a control's boundary has to clear 3:1.
        className="flex w-full gap-0.5 rounded-lg border border-white/65 p-0.5"
      >
        {locales.map((locale) => (
          <button
            key={locale}
            type="button"
            lang={locale}
            disabled={pending}
            aria-pressed={locale === active}
            onClick={() => switchTo(locale)}
            className={cn(
              // Sitting on teal, so focus is ringed in white rather than in the
              // brand colour it would otherwise disappear into.
              'min-h-9 rounded-md px-2 text-meta font-bold transition-colors focus-visible:outline-white',
              compact ? 'flex-1' : 'md:px-2.5',
              // Full white when it is not the chosen one — dimmed type on teal
              // is what put the rail below AA. See `.app-rail` in `globals.css`.
              locale === active ? 'bg-white text-brand-deep' : 'text-white hover:bg-white/15',
            )}
          >
            {/* Three endonyms are ~230px wide — more than a phone masthead or a
                15rem rail has to give once everything else is in it. */}
            <span aria-hidden className={cn(!compact && 'md:hidden')}>
              {localeShortLabels[locale]}
            </span>
            <span className={cn('sr-only', !compact && 'md:not-sr-only')}>
              {localeLabels[locale]}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
