import { NextResponse } from 'next/server';
import { runJob } from '@/lib/jobs/run';

export const dynamic = 'force-dynamic';

/**
 * The one door a clock knocks on.
 *
 * The jobs sidecar is a timer and nothing else — it holds no database driver,
 * no Prisma client and no copy of the app's code. It calls this, and the work
 * happens *inside the app*, where the schema, the translations and every helper
 * already are. See `docker/jobs/`.
 *
 * **This is reachable from the internet.** The app's port is not published, but
 * Coolify routes the practice's domain to it, so `/api/jobs/sweep-orphan-files`
 * is a public URL in exactly the way `/api/health` is. The shared secret is
 * therefore the whole of the authority, and the checks below are written as if
 * somebody is guessing at it — because eventually somebody will be.
 *
 * POST rather than GET: this changes things, and a URL that deletes files must
 * not be something a crawler, a link preview or a browser prefetch can trip.
 */

const encoder = new TextEncoder();

/**
 * Constant-time comparison.
 *
 * `a === b` on strings returns as soon as two bytes differ, which leaks the
 * length of the matching prefix to anybody willing to measure — the same reason
 * `verifyConfirmationToken` compares the way it does.
 */
function matches(provided: string, expected: string): boolean {
  const a = encoder.encode(provided);
  const b = encoder.encode(expected);
  if (a.length !== b.length) return false;

  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= a[i] ^ b[i];
  return difference === 0;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const secret = process.env.JOBS_SECRET;

  // Unset means nothing may run. Not "everything may run" — an unconfigured
  // deployment must fail closed, and a missing environment variable is the most
  // ordinary way for a deployment to be unconfigured.
  if (!secret || secret.length < 16) {
    console.error('[jobs] JOBS_SECRET is missing or too short — refusing every trigger.');
    return new NextResponse(null, { status: 404 });
  }

  const provided = request.headers.get('x-jobs-secret') ?? '';
  if (!matches(provided, secret)) {
    // 404, not 401: whether this endpoint exists is not something an unproven
    // caller needs to learn, and the route's own name reveals what it does.
    return new NextResponse(null, { status: 404 });
  }

  const { name } = await params;
  const result = await runJob(name);

  switch (result.status) {
    case 'ok':
      return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } });
    case 'busy':
      // 409, and the sidecar treats it as ordinary: a job still running when the
      // next tick arrives is a schedule to widen, not an error to page anybody
      // about.
      return NextResponse.json({ status: 'busy' }, { status: 409 });
    case 'unknown':
      return NextResponse.json({ status: 'unknown', name }, { status: 404 });
    case 'failed':
      return NextResponse.json(result, { status: 500 });
  }
}
