/**
 * A read-only calendar feed, so the dentist can see their day on the phone they
 * already carry instead of opening the app.
 *
 * Calendar clients do not send cookies, so the URL itself has to carry the
 * authority. The token is an HMAC of the staff id — the same trick as
 * `confirmations.ts`, with its own purpose string so one can never sign for the
 * other. There is no table to leak and nothing to clean up, and the feed is
 * read-only: the worst a leaked URL gives away is one dentist's schedule, which
 * is why it carries patient names and nothing clinical.
 */

const encoder = new TextEncoder();

/** Distinct from the session and confirmation keys. */
const PURPOSE = 'calendar-feed:v1';

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (secret && secret.length >= 16) return secret;

  if (process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SECRET is missing or too short — calendar feeds cannot be signed.');
  }
  return 'dev-only-insecure-secret-change-me';
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sign(staffUserId: string, version: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  // The version is inside the signed material, not merely alongside it —
  // otherwise a holder could edit the number in the URL and walk a revoked link
  // back to a version that still verifies.
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${PURPOSE}:${staffUserId}:${version}`),
  );

  // A subscription URL lives in a phone's settings for years, so this gets the
  // full 256 bits rather than the halved digest a WhatsApp link can afford.
  return base64Url(new Uint8Array(signature));
}

/** Same reasoning as `confirmations.ts`: a dot would look like a static file. */
const SEPARATOR = '~';

/**
 * `<staffUserId>~<version>~<mac>` — the whole path segment.
 *
 * The version comes from `StaffUser.calendarFeedVersion`; regenerating the link
 * bumps that column, which is what makes every link issued before the bump stop
 * resolving. See the field's comment in `schema.prisma`.
 */
export async function calendarToken(staffUserId: string, version: number): Promise<string> {
  return `${staffUserId}${SEPARATOR}${version}${SEPARATOR}${await sign(staffUserId, version)}`;
}

export type CalendarTokenClaim = { staffUserId: string; version: number };

/**
 * The id and version a token claims, when its signature checks out.
 *
 * Signature only — whether the version is still the current one is a question
 * for the caller, which has to read the staff row anyway to find out whether the
 * account is still active. Keeping the database out of here is what lets this
 * module stay a pure pair of functions the tests can exercise directly.
 *
 * A two-part token is read as version 1. Those are the links issued before this
 * column existed, and they keep working exactly until somebody regenerates —
 * at which point the stored version moves past 1 and they stop, which is the
 * behaviour that was wanted anyway.
 */
export async function verifyCalendarToken(token: string): Promise<CalendarTokenClaim | null> {
  const parts = token.split(SEPARATOR);
  if (parts.length !== 2 && parts.length !== 3) return null;

  const staffUserId = parts[0];
  const provided = parts.at(-1)!;
  if (!staffUserId) return null;

  const version = parts.length === 3 ? Number(parts[1]) : 1;
  if (!Number.isInteger(version) || version < 1) return null;

  const expected = await sign(staffUserId, version);

  if (provided.length !== expected.length) return null;
  let difference = 0;
  for (let i = 0; i < expected.length; i += 1) {
    difference |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }

  return difference === 0 ? { staffUserId, version } : null;
}

export function calendarUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  return `${base}/api/calendar/${token}`;
}

export type CalendarEvent = {
  id: string;
  /** UTC midnight of the appointment's day. */
  date: Date;
  /** `HH:MM`, clinic wall clock. */
  startTime: string;
  durationMin: number;
  summary: string;
  description: string;
  location: string;
};

/** `20260811T083000` — a local-time stamp, paired with a VTIMEZONE-less TZID. */
function stamp(date: Date, minutes: number): string {
  const day = date.toISOString().slice(0, 10).replace(/-/g, '');
  const h = String(Math.floor(minutes / 60) % 24).padStart(2, '0');
  const m = String(minutes % 60).padStart(2, '0');
  return `${day}T${h}${m}00`;
}

/**
 * Escapes the four characters iCalendar treats specially. Getting this wrong is
 * how a patient called "Smith, John" silently truncates every field after it.
 */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * RFC 5545 caps a line at 75 octets; longer ones are folded onto a continuation
 * line beginning with a space. Folded by code unit rather than octet, which is
 * conservative for the accented names this app is full of — a shorter line is
 * always legal, a longer one is not.
 */
function fold(line: string): string {
  if (line.length <= 73) return line;

  const parts: string[] = [line.slice(0, 73)];
  let rest = line.slice(73);
  while (rest.length > 72) {
    parts.push(` ${rest.slice(0, 72)}`);
    rest = rest.slice(72);
  }
  if (rest) parts.push(` ${rest}`);
  return parts.join('\r\n');
}

export function buildCalendar({
  events,
  name,
  timeZone,
}: {
  events: readonly CalendarEvent[];
  name: string;
  timeZone: string;
}): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Shehu Dental//Clinic Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name)}`,
    `X-WR-TIMEZONE:${timeZone}`,
  ];

  for (const event of events) {
    const start = timeToMinutes(event.startTime);

    lines.push(
      'BEGIN:VEVENT',
      // Stable across refreshes, so an edited appointment updates in place
      // rather than appearing twice in the dentist's calendar.
      `UID:${event.id}@dentorganizer`,
      `DTSTAMP:${stamp(event.date, start)}Z`,
      `DTSTART;TZID=${timeZone}:${stamp(event.date, start)}`,
      `DTEND;TZID=${timeZone}:${stamp(event.date, start + event.durationMin)}`,
      fold(`SUMMARY:${escapeText(event.summary)}`),
      fold(`DESCRIPTION:${escapeText(event.description)}`),
    );
    if (event.location) lines.push(fold(`LOCATION:${escapeText(event.location)}`));
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  // CRLF throughout — some clients are strict about it, none object.
  return `${lines.join('\r\n')}\r\n`;
}

function timeToMinutes(startTime: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(startTime.trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
}
