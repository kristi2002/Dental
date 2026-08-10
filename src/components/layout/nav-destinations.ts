import type { Permission } from '@/lib/auth/permissions';

/**
 * The main nav, and the permission each destination needs. A role that cannot
 * open a screen never sees it advertised — the page guard still refuses if the
 * URL is typed by hand.
 *
 * The two administrative screens (staff, activity) deliberately live in the user
 * menu instead, so the daily bar stays the same short list for everyone.
 */
export const NAV_DESTINATIONS: ReadonlyArray<{
  href: string;
  key: string;
  /** `null` means every signed-in person. */
  permission: Permission | null;
}> = [
  { href: '/', key: 'dashboard', permission: null },
  { href: '/digest', key: 'digest', permission: null },
  { href: '/appointments', key: 'appointments', permission: 'appointment.view' },
  { href: '/patients', key: 'patients', permission: 'patient.view' },
  { href: '/recalls', key: 'recalls', permission: 'recall.view' },
  { href: '/services', key: 'services', permission: 'service.view' },
  { href: '/stock', key: 'stock', permission: 'stock.view' },
  { href: '/analytics', key: 'analytics', permission: 'analytics.view' },
];
