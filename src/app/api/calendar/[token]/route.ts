import { AppointmentStatus } from '@/generated/prisma/enums';
import { buildCalendar, verifyCalendarToken } from '@/lib/calendar-feed';
import { CLINIC_TIME_ZONE, addDays, today } from '@/lib/dates';
import { prisma } from '@/lib/prisma';
import { clientKey, rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/** A rolling window: enough history to look back, enough ahead to plan. */
const DAYS_BACK = 30;
const DAYS_AHEAD = 120;

/**
 * One dentist's schedule, as a calendar subscription.
 *
 * Unauthenticated in the session sense — a calendar client sends no cookies —
 * so the signed token in the path is the whole authority. It is read-only and
 * deliberately thin: names and times, never a diagnosis, because a subscription
 * URL ends up sitting in a phone's settings for years.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  // Same reasoning as the confirmation page: a signed token is not a reason to
  // let somebody try a million of them.
  const limit = rateLimit(`calendar:${clientKey(request.headers)}`, {
    limit: 30,
    windowMs: 60_000,
  });
  if (!limit.allowed) {
    return new Response('Too many requests', {
      status: 429,
      headers: { 'retry-after': String(limit.retryAfter) },
    });
  }

  const { token } = await params;
  const staffUserId = await verifyCalendarToken(token);
  if (!staffUserId) return new Response('Not found', { status: 404 });

  const staff = await prisma.staffUser.findUnique({
    where: { id: staffUserId },
    select: { firstName: true, lastName: true, active: true },
  });
  // A disabled account loses its feed along with everything else.
  if (!staff || !staff.active) return new Response('Not found', { status: 404 });

  const from = addDays(today(), -DAYS_BACK);
  const to = addDays(today(), DAYS_AHEAD);

  const appointments = await prisma.appointment.findMany({
    where: {
      staffUserId,
      date: { gte: from, lte: to },
      // A cancelled slot is free time, and showing it as a commitment on the
      // dentist's phone is worse than not showing it at all.
      status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.ARRIVED, AppointmentStatus.COMPLETED] },
    },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    select: {
      id: true,
      date: true,
      startTime: true,
      durationMin: true,
      serviceName: true,
      notes: true,
      patient: { select: { firstName: true, lastName: true, phone: true } },
      operatory: { select: { name: true } },
    },
  });

  const body = buildCalendar({
    name: `DentOrganizer — ${staff.firstName} ${staff.lastName}`,
    timeZone: CLINIC_TIME_ZONE,
    events: appointments.map((appointment) => ({
      id: appointment.id,
      date: appointment.date,
      startTime: appointment.startTime,
      durationMin: appointment.durationMin,
      summary: [
        `${appointment.patient.lastName} ${appointment.patient.firstName}`,
        appointment.serviceName,
      ]
        .filter(Boolean)
        .join(' — '),
      // The phone number is the one thing worth having in a calendar entry:
      // it is what you reach for when you are running late.
      description: [appointment.patient.phone, appointment.notes].filter(Boolean).join('\n'),
      location: appointment.operatory?.name ?? '',
    })),
  });

  return new Response(body, {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': 'inline; filename="dentorganizer.ics"',
      // Clients poll this on their own schedule; a stale copy is worse than a
      // cheap request.
      'cache-control': 'no-store',
    },
  });
}
