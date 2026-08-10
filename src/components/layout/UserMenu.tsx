'use client';

import { ChevronDown, LogOut, ScrollText, UserCog } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Link } from '@/i18n/navigation';
import type { Role } from '@/generated/prisma/enums';
import { signOut } from '@/lib/actions/auth';
import { initials } from '@/lib/utils';

/**
 * Who is signed in, and the two screens that belong to running the practice
 * rather than doing the day's work. Kept out of the main nav so the bar stays
 * the same short list of daily destinations for everyone.
 */
export function UserMenu({
  firstName,
  lastName,
  role,
  canManageStaff,
  canViewAudit,
}: {
  firstName: string;
  lastName: string;
  role: Role;
  canManageStaff: boolean;
  canViewAudit: boolean;
}) {
  const t = useTranslations('auth');
  const tr = useTranslations('roles');
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={wrapper} className="relative">
      <button
        type="button"
        className="on-brand-control flex items-center gap-2 py-1.5 pr-2 pl-1.5"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-full bg-white/20 text-[0.85rem] font-bold text-white"
        >
          {initials(firstName, lastName)}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block text-[0.92rem] leading-tight font-bold text-white">
            {firstName} {lastName}
          </span>
          <span className="block text-[0.78rem] leading-tight text-white/85">{tr(role)}</span>
        </span>
        <ChevronDown size={16} aria-hidden className="text-white/85" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-60 overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface py-1 shadow-pop"
        >
          <p className="border-b border-line px-4 py-2.5 text-[0.9rem] text-ink-soft sm:hidden">
            <span className="block font-bold text-ink">
              {firstName} {lastName}
            </span>
            {tr(role)}
          </p>

          {canManageStaff ? (
            <Link
              href="/staff"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-[1rem] font-semibold text-ink no-underline hover:bg-brand-soft"
            >
              <UserCog size={19} aria-hidden className="text-brand" />
              {t('manageStaff')}
            </Link>
          ) : null}

          {canViewAudit ? (
            <Link
              href="/activity"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-[1rem] font-semibold text-ink no-underline hover:bg-brand-soft"
            >
              <ScrollText size={19} aria-hidden className="text-brand" />
              {t('activity')}
            </Link>
          ) : null}

          <form action={signOut} className="border-t border-line">
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[1rem] font-semibold text-danger hover:bg-danger-soft"
            >
              <LogOut size={19} aria-hidden />
              {t('signOut')}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
