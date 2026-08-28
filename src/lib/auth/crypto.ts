import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { PIN_MAX_LENGTH } from './pin-constants';

const scrypt = promisify(scryptCallback);

const KEY_LENGTH = 32;

export { isValidPinFormat, PIN_MAX_LENGTH, PIN_MIN_LENGTH } from './pin-constants';

/**
 * A PIN has very little entropy, so the stretching does the work: scrypt at the
 * default cost turns an exhaustive 4-digit sweep into something slow enough that
 * the account lockout wins first.
 */
export async function hashPin(pin: string): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scrypt(pin, salt, KEY_LENGTH)) as Buffer;
  return { hash: derived.toString('hex'), salt };
}

export async function verifyPin(pin: string, hash: string, salt: string): Promise<boolean> {
  let expected: Buffer;
  try {
    expected = Buffer.from(hash, 'hex');
  } catch {
    return false;
  }
  if (expected.length !== KEY_LENGTH) return false;

  const derived = (await scrypt(pin, salt, KEY_LENGTH)) as Buffer;
  return timingSafeEqual(derived, expected);
}

/**
 * Random numeric PIN, used when the owner resets someone's access.
 *
 * Drawn by rejection rather than by `byte % 10`. A byte holds 0–255, which is
 * not a whole number of tens: folding it means 0–5 come up 26 times in 256 and
 * 6–9 only 25, so every digit of a PIN generated that way leaked about four per
 * cent of a bias towards the low half. Small, and exactly the kind of small that
 * is free to remove — 250 is the largest multiple of ten a byte can hold, so
 * anything at or above it is simply drawn again.
 */
export function generatePin(length = PIN_MAX_LENGTH): string {
  /** The largest multiple of ten a byte can hold. Above this, draw again. */
  const UNBIASED_CEILING = 250;

  let pin = '';
  while (pin.length < length) {
    // A fresh block per pass rather than one byte at a time: the odds of needing
    // a second pass at all are (6/256) per digit, so this almost always runs once.
    for (const byte of randomBytes(length)) {
      if (byte >= UNBIASED_CEILING) continue;
      pin += String(byte % 10);
      if (pin.length === length) break;
    }
  }

  return pin;
}
