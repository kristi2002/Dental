/**
 * Shared result shape for every server action. `ts` lets client forms tell one
 * successful submit from the next, so a dialog closes each time it should.
 */
export type ActionState =
  | { status: 'idle' }
  | { status: 'ok'; ts: number }
  | { status: 'error'; message: string; ts: number };

export const IDLE_STATE: ActionState = { status: 'idle' };

export function actionOk(): ActionState {
  return { status: 'ok', ts: Date.now() };
}

export function actionError(message: string): ActionState {
  return { status: 'error', message, ts: Date.now() };
}
