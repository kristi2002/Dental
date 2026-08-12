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
