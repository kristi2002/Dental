'use client';

import { Languages } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { localeLabels, locales, type Locale } from '@/i18n/routing';
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
    <div className="px-3 pb-3 lg:pb-4">
      <p className="mb-1.5 flex items-center gap-1.5 text-[0.85rem] font-semibold text-ink-faint">
        <Languages size={16} aria-hidden />
        {t('language')}
      </p>
      <div
        role="group"
        aria-label={t('language')}
        className="grid grid-cols-3 gap-1 rounded-lg border-2 border-line-strong p-1"
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
              'min-h-10 rounded-md px-1 text-[0.9rem] font-bold transition-colors',
              locale === active
                ? 'bg-ink text-white'
                : 'text-ink-soft hover:bg-paper hover:text-ink',
            )}
          >
            {localeLabels[locale]}
          </button>
        ))}
      </div>
    </div>
  );
}
