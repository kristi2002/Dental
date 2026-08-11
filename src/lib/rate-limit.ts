/**
 * A small in-memory throttle for the confirmation link.
 *
 * `/confirm/[token]` is the only unauthenticated surface in the app. The token
 * is derived from the appointment id rather than stored, which means a leaked
 * row reveals nothing — but it also means nothing stops somebody working
 * through guesses. This bounds that to a rate no guesser can use.
 *
 * In memory on purpose: this app runs as one process on one machine in one
 * clinic. A shared store would be the right answer behind several instances,
 * and the wrong amount of machinery here.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Keeps the map from growing without bound on a long-lived process. */
function sweep(now: number): void {
  if (buckets.size < 512) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = {
  allowed: boolean;
  /** Seconds until the window resets — for `Retry-After`. */
  retryAfter: number;
};

export function rateLimit(
  key: string,
  { limit = 10, windowMs = 60_000 }: { limit?: number; windowMs?: number } = {},
): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }

  bucket.count += 1;
  return {
    allowed: bucket.count <= limit,
    retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

/**
 * Best-effort client address. Behind a reverse proxy the first hop in
 * `x-forwarded-for` is the client; direct, there is no header and every request
 * shares one bucket — which is stricter, not looser, so it fails safe.
 */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return headers.get('x-real-ip') ?? 'unknown';
}
