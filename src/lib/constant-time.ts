const encoder = new TextEncoder();

/**
 * Compare a secret somebody supplied against the one that would be right.
 *
 * `a === b` on strings returns as soon as two bytes differ, which leaks the
 * length of the matching prefix to anybody willing to measure. Over enough
 * requests that turns guessing a secret from an impossible problem into a
 * character-at-a-time one.
 *
 * Compared as **bytes** rather than as code units, because a shared secret is
 * pasted out of a password manager and there is no rule that it is ASCII — two
 * strings of the same length can be different numbers of bytes, and comparing
 * `charCodeAt` would silently disagree with the thing generating the secret.
 *
 * The early return on length is not a leak worth closing: the length of a secret
 * is not the secret, and every alternative involves hashing both sides, which
 * is a bigger dependency on getting the details right than this is.
 *
 * Extracted because there are now three of these — the jobs endpoint, the
 * confirmation link and the inbound mail webhook — and the third was the point
 * at which copying it a third time stopped being reasonable.
 */
export function secretMatches(provided: string, expected: string): boolean {
  const a = encoder.encode(provided);
  const b = encoder.encode(expected);
  if (a.length !== b.length) return false;

  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= a[i] ^ b[i];
  return difference === 0;
}
