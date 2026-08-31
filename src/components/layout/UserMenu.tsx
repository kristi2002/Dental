'use client';

import { CalendarClock, ChevronDown, LogOut, ScrollText, UserCog } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { ChangePinDialog } from '@/components/auth/ChangePinDialog';
import { Appearance } from './Appearance';
import { Link } from '@/i18n/navigation';
import type { Role } from '@/generated/prisma/enums';
import { signOut } from '@/lib/actions/auth';
import { cn, initials } from '@/lib/utils';

/**
 * Who is signed in, and the three screens that belong to running the practice
 * rather than doing the day's work. Kept out of the rail so it stays the same
 * short list of daily destinations for everyone.
 */
export function UserMenu({
  firstName,
  lastName,
  role,
  canManageStaff,
  canViewAudit,
  canViewSettings,
  placement = 'bottom',
  compact = false,
}: {
  firstName: string;
  lastName: string;
  role: Role;
  canManageStaff: boolean;
  canViewAudit: boolean;
  canViewSettings: boolean;
  /** `top` for the rail foot, where there is nothing below to open into. */
  placement?: 'top' | 'bottom';
  /** The pinched rail: the avatar alone, no name and no chevron. */
  compact?: boolean;
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
        className={cn(
          'on-brand-control flex items-center rounded-lg focus-visible:outline-white',
          compact ? 'justify-center p-1.5' : 'gap-2 py-1.5 pr-2 pl-1.5',
          // Fills the rail foot; in the phone bar it must not take the width the
          // wordmark beside it is using.
          placement === 'top' && !compact && 'w-full',
        )}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={compact ? `${firstName} ${lastName}` : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-full bg-white/20 text-meta font-bold text-white"
        >
          {initials(firstName, lastName)}
        </span>
        {compact ? null : (
          <>
            {/* On a phone bar the name is the first thing to go — the initials
                in the circle already say whose session this is. */}
            <span className="hidden min-w-0 flex-1 text-left sm:block">
              <span className="block truncate text-meta leading-tight font-bold text-white">
                {firstName} {lastName}
              </span>
              <span className="block truncate text-caption leading-tight text-white/85">
                {tr(role)}
              </span>
            </span>
            <ChevronDown size={16} aria-hidden className="shrink-0 text-white/85" />
          </>
        )}
      </button>

      {open ? (
        <div
          role="menu"
          className={cn(
            'absolute z-40 w-68 overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface py-1 shadow-pop',
            // From the rail foot it opens upward and to the right, so a pinched
            // rail does not have to be wide enough to hold its own menu.
            placement === 'top' ? 'bottom-full left-0 mb-2' : 'right-0 mt-2',
          )}
        >
          {/* Wherever the button could not carry the name, the menu does. */}
          <p
            className={cn(
              'border-b border-line px-4 py-2.5 text-meta text-ink-soft',
              !compact && 'sm:hidden',
            )}
          >
            <span className="block font-bold text-ink">
              {firstName} {lastName}
            </span>
            {tr(role)}
          </p>

          {canViewSettings ? (
            <Link
              href="/settings"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-body font-semibold text-ink no-underline hover:bg-brand-soft"
            >
              <CalendarClock size={19} aria-hidden className="text-brand" />
              {t('settings')}
            </Link>
          ) : null}

          {canManageStaff ? (
            <Link
              href="/staff"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-body font-semibold text-ink no-underline hover:bg-brand-soft"
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
              className="flex items-center gap-2.5 px-4 py-2.5 text-body font-semibold text-ink no-underline hover:bg-brand-soft"
            >
              <ScrollText size={19} aria-hidden className="text-brand" />
              {t('activity')}
            </Link>
          ) : null}

          {/* Above the way out and below the three destinations, because it is
              neither: the others navigate, this one acts. It is the only item in
              this menu that is unambiguously about *you* rather than about the
              practice, which is why it lives here and not under Settings.

              No permission branch — everybody has exactly one PIN and it is
              their own. See `changeOwnPin`, which never takes an id. */}
          <div className="border-t border-line">
            <ChangePinDialog triggerClassName="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-body font-semibold text-ink hover:bg-brand-soft" />
          </div>

          {/* Below the account's own settings and above the way out, because it
              is the one thing in this menu that changes nothing anybody else
              will ever see: it is a property of this screen in this room, and
              it is stored on the machine rather than against the person. See
              `Appearance` for why that distinction is the whole design. */}
          <Appearance />

          <form action={signOut} className="border-t border-line">
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-body font-semibold text-danger hover:bg-danger-soft"
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
