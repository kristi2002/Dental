'use client';

import {
  CalendarDays,
  ChartColumn,
  LayoutDashboard,
  Package,
  Stethoscope,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

const ITEMS: Array<{ href: string; key: string; Icon: LucideIcon }> = [
  { href: '/', key: 'dashboard', Icon: LayoutDashboard },
  { href: '/appointments', key: 'appointments', Icon: CalendarDays },
  { href: '/patients', key: 'patients', Icon: Users },
  { href: '/services', key: 'services', Icon: Stethoscope },
  { href: '/stock', key: 'stock', Icon: Package },
  { href: '/analytics', key: 'analytics', Icon: ChartColumn },
];

export function Nav() {
  const t = useTranslations('nav');
  const pathname = usePathname();

  return (
    <nav aria-label={t('menu')} className="lg:flex-1">
      <ul className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:gap-1.5 lg:overflow-visible lg:px-3 lg:pb-0">
        {ITEMS.map(({ href, key, Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);

          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-12 items-center gap-2.5 rounded-lg border-2 px-3.5 py-2 text-[1rem] font-semibold whitespace-nowrap transition-colors',
                  active
                    ? 'border-brand-dark bg-brand text-white'
                    : 'border-transparent text-ink-soft hover:border-line-strong hover:bg-paper hover:text-ink',
                )}
              >
                <Icon size={21} aria-hidden />
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
