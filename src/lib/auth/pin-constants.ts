/**
 * Shared by the PIN pad (client) and the hashing helpers (server). Kept in its
 * own module so a client component never pulls `node:crypto` into the bundle.
 */

/** Long enough that a shoulder-surf is the realistic threat, not a guess. */
export const PIN_MIN_LENGTH = 4;
export const PIN_MAX_LENGTH = 6;

export function isValidPinFormat(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_MIN_LENGTH},${PIN_MAX_LENGTH}}$`).test(pin);
}
