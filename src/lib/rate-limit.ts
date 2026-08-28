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
 * How many proxies sit in front of this app and may be believed.
 *
 * One by default, which is the deployment this ships in: Coolify's Traefik
 * terminates TLS and forwards. Raise it only if you actually add a hop — a CDN
 * in front of the proxy makes it two — because every hop counted here is a hop
 * whose word is taken on trust.
 */
const TRUSTED_PROXY_HOPS = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS) || 1);

/**
 * Best-effort client address, read from the *trusted* end of the chain.
 *
 * `x-forwarded-for` is a list that each proxy appends to, so it reads
 * `client, proxy1, proxy2` — and only the entries a proxy we trust wrote are
 * worth anything. Everything to the left of those was supplied by the caller
 * and can say whatever the caller likes.
 *
 * This used to take `split(',')[0]`, the leftmost entry, on the reasoning that
 * the first hop is the client. That is true only when no client sent the header
 * itself — and Traefik *appends* rather than replaces, so anybody who sent
 * `X-Forwarded-For: <anything>` had their own value land in first position and
 * be read as their address. A fresh value per request meant a fresh bucket per
 * request, which is no throttle at all: the confirmation-token and
 * calendar-token limits this module exists for could both be walked at full
 * speed, and the sign-in limiter was left leaning entirely on the per-account
 * lockout ladder.
 *
 * Counting `TRUSTED_PROXY_HOPS` back from the right gives the address our own
 * proxy observed, which is the last entry a caller cannot forge. A short header
 * — no proxy in front, or fewer hops than configured — falls back to the
 * leftmost entry we have; that is the direct-connection case, where there is no
 * proxy to have written anything and nothing is gained by refusing to answer.
 */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const hops = forwarded
      .split(',')
      .map((hop) => hop.trim())
      .filter(Boolean);
    const address = hops.at(-TRUSTED_PROXY_HOPS) ?? hops[0];
    if (address) return address;
  }
  // Traefik sets this to the address it observed, so it is the same claim as
  // above and not a second, weaker one. Direct, there is no header at all and
  // every request shares one bucket — stricter, not looser, so it fails safe.
  return headers.get('x-real-ip')?.trim() || 'unknown';
}

/**
 * The confirmation link's budget, and the bucket both halves of it count against.
 *
 * Named here rather than written out at each use because there *are* two uses
 * and they are the same surface: opening `/confirm/<token>` and answering it.
 * The page had the limiter and the action did not, which made the limiter
 * bypassable by anybody willing to skip the page — a server action is a POST
 * addressable on its own, and the action id sits in the public confirm page's
 * bundle. Guessing at tokens would have gone straight at the action and never
 * touched the budget written to stop it.
 *
 * One shared bucket rather than two, so the total a guesser gets is twelve a
 * minute across both doors rather than twelve at each. A patient opening the
 * link and tapping an answer spends two.
 *
 * The signature is 128 bits, so this was never the thing standing between a
 * stranger and somebody's appointment — it is the cheap bound that means nobody
 * gets to try, and a bound only one of two doors honoured was not that.
 */
export const CONFIRM_RATE = { limit: 12, windowMs: 60_000 } as const;

export function confirmBucket(headers: Headers): string {
  return `confirm:${clientKey(headers)}`;
}
