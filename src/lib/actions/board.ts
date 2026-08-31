'use server';

import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';

/**
 * Remember that this person has now seen the board.
 *
 * Called when the modal is **shut**, not when it is opened, and the difference
 * is the whole of it. Marking on open would clear the "new" marks in the same
 * breath as drawing them: the board stays open across a server action and is
 * re-rendered by the layout revalidation every tick produces, so the three fresh
 * lines somebody was working through would vanish out from under them halfway
 * down. Marking on close means the session you are in keeps its marks, and the
 * next time you look, "new" means *since you stopped looking*.
 *
 * **Nothing is revalidated, deliberately.** This writes one column that only the
 * next render of the bell reads, and calling `revalidatePath('/', 'layout')`
 * here would rebuild every page in the app every time somebody pressed Escape on
 * a panel they had just read. The stale badge lasts until the next navigation,
 * which is the next thing that happens anyway.
 *
 * No permission check beyond being signed in: this is a person recording that
 * they looked at their own bell, and there is no reading of it that is somebody
 * else's business. It also cannot fail usefully — a bell that refused to
 * remember would be a bug nobody could act on — so a lost write is swallowed
 * rather than surfaced. The cost of losing one is that "new" is measured from
 * slightly further back, which is the safe direction to be wrong in.
 */
export async function markBoardSeen(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  try {
    await prisma.staffUser.update({
      where: { id: user.id },
      data: { boardSeenAt: new Date() },
    });
  } catch {
    // See above: showing something as new for a second morning is a smaller
    // harm than an error toast on a panel somebody has just closed.
  }
}
