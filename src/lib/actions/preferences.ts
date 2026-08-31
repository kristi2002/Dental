'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth/session';
import { HIDEABLE, serialiseHidden } from '@/lib/nav-visibility';
import { prisma } from '@/lib/prisma';

/**
 * The two things a person may decide about their own copy of this application:
 * which parts of the menu they want, and whether they have been shown where the
 * help is.
 *
 * Neither is audited, and that is on purpose rather than an oversight. The
 * activity log is worth reading because everything in it is a change to the
 * practice's record — a booking moved, a count corrected, a PIN rotated. A row
 * saying somebody hid the statistics link from their own menu is not that, and
 * a log with a hundred of them in it is a log nobody scrolls to the bottom of.
 *
 * Neither takes a staff id either, for the reason `changeOwnPin` does not: these
 * are properties of whoever is signed in, and an action that could name somebody
 * else would need an authorisation model to say who may. There is nothing here
 * worth building one for.
 */

/** The layout, because what these change is the chrome on every screen. */
function revalidateAll() {
  revalidatePath('/', 'layout');
}

/**
 * Put part of the menu away, or bring it back.
 *
 * The keys are filtered against `HIDEABLE` rather than stored as sent. Nothing
 * dangerous could arrive here — the column feeds a `Set.has` on a menu and
 * nothing else — but a column that accepts arbitrary strings from a browser is
 * a column that will one day contain a hundred kilobytes of them, and this is
 * one line to prevent.
 *
 * Not permission-filtered, though. Somebody who cannot open the stock screens
 * has no way to send `stock` from the panel, and if a stale tab did, hiding a
 * row that is not drawn for them anyway changes nothing.
 */
export async function setHiddenNav(keys: readonly string[]): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const known = new Set(HIDEABLE.map((item) => item.key));
  const hiddenNav = serialiseHidden(keys.filter((key) => known.has(key)));

  await prisma.staffUser.update({ where: { id: user.id }, data: { hiddenNav } });
  revalidateAll();
}

/**
 * Remember that this person has been shown the question mark in the corner.
 *
 * Written the moment the pointer is dismissed *or* acted on, because both mean
 * the same thing — they know it is there. A stamp rather than a flag, so a
 * decision to point at it again after a year of new screens is one the data can
 * still answer; see the column's note.
 */
export async function markHelpSeen(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  await prisma.staffUser.update({
    where: { id: user.id },
    data: { helpSeenAt: new Date() },
  });
  revalidateAll();
}
