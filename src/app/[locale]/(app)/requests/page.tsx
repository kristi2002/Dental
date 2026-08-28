import { CalendarClock, CalendarPlus, Inbox, Languages, Mail, MessageCircle, Phone } from 'lucide-react';
import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { RequestAttachments } from '@/components/requests/RequestAttachments';
import { RequestNote } from '@/components/requests/RequestNote';
import { ActionForm } from '@/components/ui/ActionForm';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { AppointmentRequestStatus } from '@/generated/prisma/enums';
import { Link } from '@/i18n/navigation';
import { localeLabels, type Locale } from '@/i18n/routing';
import { setRequestStatus } from '@/lib/actions/requests';
import { requirePermission } from '@/lib/auth/guard';
import { prisma } from '@/lib/prisma';
import { isRequestTopic } from '@/lib/site-content';
import { telLink, whatsappChatLink } from '@/lib/reminders';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'requests' });
  return { title: t('title') };
}

/**
 * What came in through the practice's public page.
 *
 * The screen that makes the request form honest. A page that invites strangers
 * to leave their telephone number and drops it into a table nobody opens is
 * worse than a page with no form at all — it is a promise the practice does not
 * know it has made. So this is a first-class screen in the rail, it carries a
 * count when anything is waiting, and the dashboard says so too.
 *
 * **Oldest first**, which is the reverse of every other list in this app. A
 * request that has been sitting for two days is the one that is about to become
 * a bad review; the one that arrived ten minutes ago can wait ten more.
 *
 * The language a request was written in is a badge on the row rather than a
 * detail buried in it. This practice works in three, roughly half of these will
 * come from people choosing between clinics in three countries, and the single
 * most useful thing to know before dialling is which language to open in.
 */
export default async function RequestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ show?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requirePermission('request.view');

  const t = await getTranslations('requests');
  const ts = await getTranslations('site');
  const format = await getFormatter();

  const showAll = (await searchParams).show === 'all';

  const requests = await prisma.appointmentRequest.findMany({
    where: showAll ? {} : { status: { not: AppointmentRequestStatus.CLOSED } },
    orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      message: true,
      topic: true,
      preferredDate: true,
      preferredTime: true,
      locale: true,
      status: true,
      staffNote: true,
      createdAt: true,
      handledAt: true,
      handledBy: { select: { firstName: true, lastName: true } },
      // What they sent with it. Ordered oldest first, which is the order they
      // were attached in — somebody who sends an X-ray and then the report that
      // goes with it is telling the desk which is which by sending them in that
      // order.
      attachments: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, fileName: true, mimeType: true, sizeBytes: true },
      },
    },
  });

  const waiting = await prisma.appointmentRequest.count({
    where: { status: AppointmentRequestStatus.NEW },
  });

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <div className="segmented">
            <Link href="/requests" aria-current={!showAll} className="segment">
              {t('filterOpen')}
            </Link>
            <Link href="/requests?show=all" aria-current={showAll} className="segment">
              {t('filterAll')}
            </Link>
          </div>
        }
      />

      {requests.length === 0 ? (
        <EmptyState icon={<Inbox size={30} aria-hidden />} title={t('empty')} />
      ) : (
        <ul className="grid gap-4">
          {requests.map((request) => {
            const tel = telLink(request.phone);
            const chat = whatsappChatLink(request.phone);
            const language = localeLabels[request.locale as Locale] ?? request.locale;

            return (
              <li key={request.id} className="card p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-[1.2rem] font-bold text-ink">{request.name}</h2>
                    <p className="mt-0.5 text-[0.92rem] text-ink-faint">
                      {format.dateTime(request.createdAt, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Which language to open in, before anybody dials. */}
                    <Badge tone="brand">
                      <Languages size={15} aria-hidden />
                      {language}
                    </Badge>

                    {request.topic && isRequestTopic(request.topic) ? (
                      <Badge tone="neutral">{ts(`topics.${request.topic}`)}</Badge>
                    ) : null}

                    <Badge
                      tone={
                        request.status === AppointmentRequestStatus.NEW
                          ? 'warn'
                          : request.status === AppointmentRequestStatus.CONTACTED
                            ? 'ok'
                            : 'neutral'
                      }
                    >
                      {t(`status.${request.status}`)}
                    </Badge>
                  </div>
                </div>

                {/* The number leads, because ringing back is the whole errand.
                    WhatsApp first for the reason every other screen here offers
                    it first: it is an ordinary HTTPS link and works on a desk
                    machine that has nothing registered for `tel:`. */}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {chat ? (
                    <a href={chat} target="_blank" rel="noreferrer" className="btn btn-sm btn-secondary">
                      <MessageCircle size={17} aria-hidden />
                      {request.phone}
                    </a>
                  ) : null}
                  {tel ? (
                    <a href={tel} className="btn btn-sm btn-secondary">
                      <Phone size={17} aria-hidden />
                      {t('call')}
                    </a>
                  ) : null}
                  {request.email ? (
                    <a href={`mailto:${request.email}`} className="btn btn-sm btn-secondary">
                      <Mail size={17} aria-hidden />
                      {request.email}
                    </a>
                  ) : null}
                </div>

                {/* --- What day they asked for ------------------------------
                 *
                 * The two questions this screen used to have to ring back and
                 * ask. They are a preference and nothing more — no slot is held
                 * and the calendar knows nothing about this row — so they are
                 * set as a line of reference text rather than as anything that
                 * looks like a booking.
                 *
                 * `CalendarClock` rather than `CalendarCheck` for the same
                 * reason: a tick beside a date on a desk screen is how somebody
                 * comes to believe the appointment already exists.
                 */}
                {request.preferredDate ? (
                  <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[1rem] text-ink-soft">
                    <CalendarClock size={17} aria-hidden className="shrink-0 text-brand-dark" />
                    <span className="font-semibold text-ink">{t('preferredDay')}</span>
                    <span className="font-semibold text-ink first-letter:uppercase">
                      {format.dateTime(request.preferredDate, { dateStyle: 'full' })}
                    </span>
                    <span>
                      ·{' '}
                      {request.preferredTime === 'morning' || request.preferredTime === 'afternoon'
                        ? ts(`book.half.${request.preferredTime}`)
                        : ts('book.half.any')}
                    </span>
                  </p>
                ) : null}

                {request.message ? (
                  <p className="mt-4 rounded-lg bg-paper px-4 py-3 text-[1rem] whitespace-pre-line text-ink">
                    {request.message}
                  </p>
                ) : null}

                {/* What they attached — an X-ray from the clinic they are
                    leaving, a quotation, a photograph of the tooth. Renders
                    nothing when there is nothing, which is most requests. */}
                <RequestAttachments
                  requestId={request.id}
                  attachments={request.attachments}
                  canEdit={user.permissions.includes('request.edit')}
                />

                <RequestNote id={request.id} note={request.staffNote} />

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
                  {request.status !== AppointmentRequestStatus.CONTACTED ? (
                    <ActionForm
                      action={setRequestStatus}
                      values={{ id: request.id, status: AppointmentRequestStatus.CONTACTED }}
                    >
                      <button type="submit" className="btn btn-sm btn-primary">
                        {t('markContacted')}
                      </button>
                    </ActionForm>
                  ) : null}

                  {request.status !== AppointmentRequestStatus.CLOSED ? (
                    <ActionForm
                      action={setRequestStatus}
                      values={{ id: request.id, status: AppointmentRequestStatus.CLOSED }}
                    >
                      <button type="submit" className="btn btn-sm btn-secondary">
                        {t('markClosed')}
                      </button>
                    </ActionForm>
                  ) : (
                    <ActionForm
                      action={setRequestStatus}
                      values={{ id: request.id, status: AppointmentRequestStatus.NEW }}
                    >
                      <button type="submit" className="btn btn-sm btn-secondary">
                        {t('reopen')}
                      </button>
                    </ActionForm>
                  )}

                  {/* The point of the whole screen: turn this into a real
                      appointment, with a real patient record behind it. */}
                  <Link href="/patients/new" className="btn btn-sm btn-accent">
                    <CalendarPlus size={17} aria-hidden />
                    {t('createPatient')}
                  </Link>

                  {request.handledBy && request.handledAt ? (
                    <p className="ml-auto text-[0.9rem] text-ink-faint">
                      {t('handledBy', {
                        name: `${request.handledBy.firstName} ${request.handledBy.lastName}`,
                      })}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!showAll && waiting === 0 && requests.length > 0 ? (
        <p className="mt-6 text-[0.95rem] text-ink-soft">{t('allPickedUp')}</p>
      ) : null}
    </>
  );
}
