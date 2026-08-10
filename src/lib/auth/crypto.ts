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

/** Random numeric PIN, used when the owner resets someone's access. */
export function generatePin(length = PIN_MAX_LENGTH): string {
  const digits = randomBytes(length);
  return Array.from(digits, (byte) => String(byte % 10)).join('');
}
