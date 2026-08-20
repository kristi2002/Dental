/**
 * Shared result shape for every server action. `ts` lets client forms tell one
 * successful submit from the next, so a dialog closes each time it should.
 */
export type ActionState =
  | { status: 'idle' }
  | { status: 'ok'; ts: number }
  | { status: 'error'; message: string; ts: number; code?: ActionErrorCode };

/**
 * Machine-readable reason, for the few errors a form can offer to work around.
 * Every one is "the app thinks this is wrong, and you may still be right":
 * `overlap` is a clashing appointment, `labPending` a slot booked before the lab
 * has promised the work back, `duplicate` a second record for one phone number,
 * `bookedOver` a closure or narrowed week that strands existing appointments,
 * and `allergy` a prescription naming something the patient reacts to.
 */
export type ActionErrorCode =
  | 'overlap'
  | 'labPending'
  | 'duplicate'
  | 'bookedOver'
  | 'allergy';

export const IDLE_STATE: ActionState = { status: 'idle' };

export function actionOk(): ActionState {
  return { status: 'ok', ts: Date.now() };
}

export function actionError(message: string, code?: ActionErrorCode): ActionState {
  return { status: 'error', message, ts: Date.now(), code };
}

/**
 * Prisma's "unique constraint failed".
 *
 * Read off the code rather than by importing Prisma's error class, which is a
 * generated type the action files have no other reason to know about.
 *
 * Lives here rather than beside its first caller because there is more than one
 * now: every duplicate check in the app races with itself, and the ones whose
 * column carries a real index can turn that race into the same sentence the
 * check would have produced instead of a shrug.
 */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
  );
}
