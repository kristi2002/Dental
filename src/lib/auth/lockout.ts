/**
 * How much a wrong PIN costs, and how fast that grows.
 *
 * A 4-digit PIN is guessable in 10 000 tries; five strikes makes that useless.
 * Five strikes *that reset every five minutes* did not, which is what this used
 * to be: on the fifth wrong PIN the account was locked for five minutes and the
 * counter was set back to zero, so when the lock lapsed the next guesser got
 * five fresh tries, and the one after that another five, for ever. Sixty guesses
 * an hour against 10 000 values is a median hit in about three and a half days
 * of quiet grinding.
 *
 * Two changes fix it, and both live here. The count survives the lockout — only
 * a correct PIN clears it — and each block of five costs more than the last.
 *
 * The shape of the ladder matters more than its numbers. Somebody who has
 * genuinely forgotten their own PIN meets only the first rung: five tries, then
 * five minutes, which is an inconvenience. Somebody on the twentieth wrong guess
 * is not that person, and meets a day at a time — about five guesses a day,
 * which no amount of patience turns into 10 000.
 *
 * Its own module rather than a constant beside the action, because
 * `actions/auth.ts` is `'use server'` and every export of one of those has to be
 * an async function — which would leave the one piece of arithmetic here
 * untestable.
 */

/** Wrong PINs allowed between one lockout and the next. */
export const ATTEMPTS_PER_LOCKOUT = 5;

/** How long the nth lockout lasts, in minutes. The last entry repeats for ever. */
export const LOCKOUT_LADDER_MINUTES = [5, 15, 60, 360, 1440] as const;

/**
 * Does this attempt tip the account into a lockout?
 *
 * Every fifth failure, rather than "five or more" — otherwise the first wrong
 * PIN after a lock lapsed would lock again immediately, and the five tries
 * between rungs that make this survivable for a forgetful dentist would not
 * exist.
 */
export function shouldLock(failedAttempts: number): boolean {
  return failedAttempts > 0 && failedAttempts % ATTEMPTS_PER_LOCKOUT === 0;
}

/** How long to lock for, given the total number of failures so far. */
export function lockoutMinutes(failedAttempts: number): number {
  const rung = Math.floor(failedAttempts / ATTEMPTS_PER_LOCKOUT) - 1;
  const index = Math.min(Math.max(rung, 0), LOCKOUT_LADDER_MINUTES.length - 1);
  return LOCKOUT_LADDER_MINUTES[index];
}

/** Tries left before the next lockout — the number the wrong-PIN message quotes. */
export function attemptsLeft(failedAttempts: number): number {
  return ATTEMPTS_PER_LOCKOUT - (failedAttempts % ATTEMPTS_PER_LOCKOUT);
}
