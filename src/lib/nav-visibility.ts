import { NAV_DESTINATIONS } from '@/components/layout/nav-destinations';
import type { Permission } from '@/lib/auth/permissions';

/**
 * Which parts of the menu somebody has switched off.
 *
 * A practice of four uses maybe half of this application. The receptionist
 * never opens the laboratory register; the hygienist never touches statistics;
 * a single-chair clinic that does no crown-and-bridge work has a whole section
 * in the rail that is furniture. None of that is a permissions question — the
 * roles are already right, and a receptionist who *may* see the works register
 * on the one afternoon it matters should keep the right to. It is a question
 * about a menu, asked by the person reading the menu.
 *
 * So this is a preference and not an authorisation, and the difference decides
 * everything about how it behaves:
 *
 *  - It **hides rows, it does not close doors.** Every screen switched off here
 *    is still reachable by URL, by link, and — deliberately — by the search box
 *    at the top of every page. The palette is the escape hatch, and a hidden
 *    screen that could not be searched for would be a trap rather than a
 *    tidy-up.
 *  - It is **per person**, on the account — `StaffUser.hiddenNav`. It began in a
 *    cookie beside the rail's collapse and fold, and that was the wrong shelf:
 *    a cookie makes it a property of the browser, so the same nurse switching
 *    the works register off at the surgery screen met it again at the front
 *    desk. The appearance settings genuinely are properties of the machine — a
 *    bright waiting room and a dim surgery want different themes — and this is
 *    not that. "I never open the laboratory register" is true of the person,
 *    wherever they sign in.
 *  - It is still **read on the server**, for the same reason the rail's shape
 *    is: a menu that paints fourteen rows and then drops five of them after
 *    hydration is a menu that flickers on every single page load. It rides on
 *    the session, which is one query that was already happening.
 */

/**
 * A thing that can be switched off, and where its name is written.
 *
 * `group` is the heading it sits under in the panel — the rail's own three
 * blocks, plus `admin` for the screens that live in the account menu rather
 * than the rail. Those three are the ones people actually ask about: a practice
 * where one person owns the diary does not want "Opening hours" in everybody's
 * menu, and a four-person clinic has no use for an activity log on the front
 * desk's screen.
 */
export type Hideable = {
  key: string;
  permission: Permission | null;
  /** Which message namespace holds the label — the rail's, or the account menu's. */
  labels: 'nav' | 'auth';
  labelKey: string;
  group: 'start' | 'care' | 'contact' | 'practice' | 'admin';
  /**
   * A sub-screen, listed under the section it is filed in.
   *
   * The panel used to offer the fourteen top-level rows and nothing else, so
   * the only way to be rid of the shelf-label sheet was to switch off the whole
   * cupboard — and the shelf-label sheet is exactly the kind of row people want
   * gone: printed once a year, and in the menu every day. The section's own
   * name, so a run of Categories and Imports can be told apart.
   */
  under?: string;
};

/**
 * The dashboard is not on this list, and that is the only deliberate omission.
 *
 * It is where every session starts and where a signed-in person lands with no
 * other destination in mind. A menu whose first row can be switched off is a
 * menu somebody can lock themselves out of the front of.
 *
 * Every other row is here, at both levels — the sections and the lists filed
 * under them. Switching a section off takes its whole list with it, because the
 * section is what carries the list; switching the last of a section's own
 * sub-rows off leaves the section as the plain link it was before it had any.
 * See `AppShell`, which does both.
 */
export const HIDEABLE: readonly Hideable[] = [
  ...NAV_DESTINATIONS.filter(({ key }) => key !== 'dashboard').flatMap(
    ({ key, permission, group, children }): Hideable[] => [
      {
        key,
        permission,
        labels: 'nav',
        labelKey: key,
        group: group ?? 'start',
      },
      // Directly under their section, in the rail's own order, so the panel
      // reads as the menu it is editing rather than as an alphabet of rows.
      ...(children ?? []).map(
        (child): Hideable => ({
          key: child.key,
          permission: child.permission,
          labels: 'nav',
          labelKey: child.key,
          group: group ?? 'start',
          under: key,
        }),
      ),
    ],
  ),
  // The three the account menu carries. Named here by the words that menu uses,
  // because "Opening hours" is what the reader is looking for — not "Settings",
  // which is what the route is called.
  { key: 'settings', permission: 'settings.view', labels: 'auth', labelKey: 'settings', group: 'admin' },
  { key: 'staff', permission: 'staff.manage', labels: 'auth', labelKey: 'manageStaff', group: 'admin' },
  { key: 'activity', permission: 'audit.view', labels: 'auth', labelKey: 'activity', group: 'admin' },
];

/** The cookie as a set. An absent or empty cookie means nothing is switched off. */
export function parseHidden(value: string | undefined): ReadonlySet<string> {
  return new Set((value ?? '').split('.').filter(Boolean));
}

/** Back to a cookie value. Sorted, so the same choice is always the same string. */
export function serialiseHidden(keys: Iterable<string>): string {
  return [...new Set(keys)].toSorted().join('.');
}
