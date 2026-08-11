'use client';

import { Languages } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { localeLabels, localeShortLabels, locales, type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

export function LanguageSwitcher() {
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

  return (
    <div className="flex shrink-0 items-center gap-2">
      <Languages size={18} aria-hidden className="hidden text-white/85 sm:block" />
      <div
        role="group"
        aria-label={t('language')}
        className="flex gap-0.5 rounded-lg border border-white/35 p-0.5"
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
              'min-h-9 rounded-md px-2 text-[0.85rem] font-bold transition-colors focus-visible:outline-white md:px-2.5',
              locale === active
                ? 'bg-white text-brand-deep'
                : 'text-white/85 hover:bg-white/15 hover:text-white',
            )}
          >
            {/* Three endonyms are ~230px wide — more than a phone masthead has
                to give once the wordmark and the account button are in it. */}
            <span aria-hidden className="md:hidden">{localeShortLabels[locale]}</span>
            <span className="sr-only md:not-sr-only">{localeLabels[locale]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
