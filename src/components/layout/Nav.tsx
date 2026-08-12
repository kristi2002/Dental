'use client';

import {
  BellRing,
  CalendarDays,
  ChartColumn,
  FlaskConical,
  LayoutDashboard,
  Package,
  Stethoscope,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/** Every destination the bar can show, in order. What a given person sees is
 *  decided on the server — see `NAV_DESTINATIONS` in `nav-destinations.ts`. */
const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  appointments: CalendarDays,
  patients: Users,
  recalls: BellRing,
  services: Stethoscope,
  lab: FlaskConical,
  stock: Package,
  analytics: ChartColumn,
};

export function Nav({ items }: { items: Array<{ href: string; key: string }> }) {
  const t = useTranslations('nav');
  const pathname = usePathname();

  return (
    <nav aria-label={t('menu')}>
      <ul className="-mx-0.5 flex gap-0.5 overflow-x-auto">
        {items.map(({ href, key }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          const Icon = ICONS[key] ?? LayoutDashboard;

          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  // The teal underbar, not just teal text — the current page has
                  // to be findable without relying on colour alone.
                  'relative flex min-h-14 items-center gap-2 px-2.5 py-2 text-[0.92rem] font-semibold whitespace-nowrap no-underline transition-colors',
                  // The scroll container below would clip an outset focus ring,
                  // so this one is drawn inside the item instead.
                  'focus-visible:outline-offset-[-3px]',
                  'after:absolute after:inset-x-2 after:bottom-0 after:h-[3px] after:rounded-t-full after:transition-colors',
                  active
                    ? 'text-brand-deep after:bg-brand'
                    : 'text-ink-soft after:bg-transparent hover:text-ink',
                )}
              >
                <Icon size={18} aria-hidden className={active ? undefined : 'text-brand'} />
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
