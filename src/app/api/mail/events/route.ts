import { NextResponse } from 'next/server';
import { secretMatches } from '@/lib/constant-time';
import { recordDeliveryEvent } from '@/lib/messages/delivery';
import { readDeliveryEvents } from '@/lib/messages/events';

export const dynamic = 'force-dynamic';

/**
 * Where the provider tells us what became of a message it had already accepted.
 *
 * The third door in this app that the outside world knocks on, and the sibling
 * of `/api/mail/inbound` in every respect that matters — same secret, same
 * fail-closed posture, same rule about always answering 200 once the secret is
 * right, because a webhook that returns 500 is a webhook the provider retries
 * for ever.
 *
 * **Why it exists at all.** Sending was one-way and blind. `sendMail` reported
 * success on a 200, which means the provider queued the message, and nothing
 * afterwards could ever contradict it — so an address that stopped working two
 * years ago was written to every recall cycle, each send logged as a `Contact`,
 * each one reported to the front desk as done. The practice believed a patient
 * had been told. This is the only way to find out otherwise.
 *
 * **The same secret as the inbound hook, deliberately.** They are one
 * permission by any honest reading — "this request came from the mail provider"
 * — and a second variable is a second thing to set, a second thing to rotate,
 * and a second thing to leave unset. Both endpoints are configured on the same
 * provider dashboard by the same person on the same afternoon.
 *
 * The events themselves are parsed by `events.ts`, which is pure and tested
 * against hostile payloads; the writes are `delivery.ts`. Nothing is decided
 * here.
 */

/** A batch of delivery events is small. Anything larger is somebody trying it on. */
const MAX_BODY_BYTES = 512 * 1024;

function authorised(request: Request): boolean {
  const secret = process.env.MAIL_INBOUND_SECRET;

  if (!secret || secret.length < 16) {
    console.error('[mail] MAIL_INBOUND_SECRET is missing or too short — refusing every event.');
    return false;
  }

  const provided =
    request.headers.get('x-mail-secret') ??
    new URL(request.url).searchParams.get('key') ??
    '';

  return secretMatches(provided, secret);
}

export async function POST(request: Request) {
  if (!authorised(request)) {
    // 404 rather than 401, as the other two unauthenticated endpoints do:
    // whether this URL exists is not something an unproven caller learns here.
    return new NextResponse(null, { status: 404 });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ status: 'too-large' }, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ status: 'unreadable' });
  }

  const events = readDeliveryEvents(payload);
  if (events.length === 0) return NextResponse.json({ status: 'nothing-usable' });

  let matched = 0;
  let withdrawn = 0;
  let optedOut = 0;

  for (const event of events) {
    // One at a time, and each one guarded. A batch arriving after an outage is
    // exactly when a single malformed entry must not cost us the other nine.
    try {
      const report = await recordDeliveryEvent(event);
      if (report.patients > 0) matched += 1;
      withdrawn += report.withdrawn;
      if (report.consentClosed && report.patients > 0) optedOut += 1;
    } catch (error) {
      console.error('[mail] could not record a delivery event', event.outcome, error);
    }
  }

  return NextResponse.json(
    { status: 'ok', received: events.length, matched, optedOut, withdrawn },
    { headers: { 'cache-control': 'no-store' } },
  );
}
