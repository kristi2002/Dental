import {
  AlarmClock,
  BellRing,
  CalendarClock,
  CalendarDays,
  FlaskConical,
  ListChecks,
  NotebookPen,
  Package,
  PhoneIncoming,
  ShieldAlert,
  TriangleAlert,
  UserPlus,
  Users,
} from 'lucide-react';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { AppointmentFormDialog } from '@/components/appointments/AppointmentFormDialog';
import { AppointmentRow } from '@/components/appointments/AppointmentRow';
import { FollowUpFormDialog } from '@/components/follow-ups/FollowUpFormDialog';
import { FollowUpList } from '@/components/follow-ups/FollowUpList';
import { FreeTimeCard } from '@/components/appointments/FreeTimeCard';
import { WaitlistFormDialog } from '@/components/appointments/WaitlistFormDialog';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Link } from '@/i18n/navigation';
import { AlertSeverity, AppointmentRequestStatus, AppointmentStatus } from '@/generated/prisma/enums';
import { requireUser } from '@/lib/auth/guard';
import { endOfWeek, startOfWeek, toDateKey, today } from '@/lib/dates';
import { ACTIVE_PATIENTS } from '@/lib/patient-search';
import { prisma } from '@/lib/prisma';
import {
  countOpenPastAppointments,
  getAppointmentsBetween,
  getAssignableStaff,
  getLowStockItems,
  getOpenFollowUps,
  getOpenPastAppointments,
  getOpenWaitlist,
  getOperatoryOptions,
  getProviderOptions,
  getServiceOptions,
  getUnrecordedToday,
  getUnremindedTomorrow as getUnreminded,
  getWorksToChase,
} from '@/lib/queries';
import { followUpStatus } from '@/lib/follow-ups';
import { daysLate, workStatus } from '@/lib/works';
import { getRecalls } from '@/lib/recalls';
import { assignGaps, findFreeGaps, nextSlotTime, type FreeGap } from '@/lib/scheduling';
import { VisitFormDialog } from '@/components/patients/VisitFormDialog';

export const dynamic = 'force-dynamic';

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requireUser();
  const canAddPatient = user.permissions.includes('patient.edit');
  const canAddAppointment = user.permissions.includes('appointment.edit');
  const canEditMedical = user.permissions.includes('patient.medical.edit');
  const canSeeRecalls = user.permissions.includes('recall.view');
  const canSeeMedical = user.permissions.includes('patient.medical.view');
  const canSeeWaitlist = user.permissions.includes('waitlist.view');
  const canEditWaitlist = user.permissions.includes('waitlist.edit');
  const canSeeFollowUps = user.permissions.includes('followup.view');
  const canEditFollowUps = user.permissions.includes('followup.edit');
  const canSeeWorks = user.permissions.includes('work.view');
  const canSeeRequests = user.permissions.includes('request.view');

  const t = await getTranslations('dashboard');
  const ta = await getTranslations('appointments');
  const ts = await getTranslations('stock');
  const talerts = await getTranslations('alerts');
  const tw = await getTranslations('waitlist');
  const twk = await getTranslations('works');
  const tf = await getTranslations('followUps');
  const tp = await getTranslations('patients');
  const format = await getFormatter();

  const day = today();
  const dayKey = toDateKey(day);

  const [
    todayAppointments,
    weekCount,
    patientCount,
    lowStock,
    services,
    staff,
    operatories,
    recalls,
    freeGaps,
    toRemind,
    openPast,
    openPastTotal,
    todaysAlerts,
    expiredCount,
    unrecorded,
    waiting,
    openFollowUps,
    followUpStaff,
    lateWorks,
    waitingRequests,
  ] = await Promise.all([
      getAppointmentsBetween(day, day),
      prisma.appointment.count({
        where: { date: { gte: startOfWeek(day), lte: endOfWeek(day) } },
      }),
      // Active people only — an archived record is out of every list, and a
      // headline count that includes them contradicts the list under it.
      prisma.patient.count({ where: ACTIVE_PATIENTS }),
      getLowStockItems(),
      getServiceOptions(),
      getProviderOptions(),
      getOperatoryOptions(),
      canSeeRecalls ? getRecalls() : Promise.resolve([]),
      // Only what is still ahead: free time that has already passed is not an
      // opportunity, it is a regret.
      findFreeGaps({ date: day, after: nextSlotTime() }),
      canAddAppointment ? getUnreminded() : Promise.resolve([]),
      // Yesterday's loose ends. Nothing else in the app ever looks backwards, so
      // an appointment nobody closed simply ages out of sight — taking the
      // no-show score and the completion rate with it.
      canAddAppointment ? getOpenPastAppointments() : Promise.resolve([]),
      canAddAppointment ? countOpenPastAppointments() : Promise.resolve(0),
      // What must not be missed today. The printed day sheet has carried these
      // since it existed; the screen everybody actually reads did not, so an
      // anticoagulant was visible only to whoever walked past the printer.
      canSeeMedical
        ? prisma.patientAlert.findMany({
            where: {
              severity: { in: [AlertSeverity.CRITICAL, AlertSeverity.IMPORTANT] },
              patient: {
                appointments: {
                  some: {
                    date: day,
                    status: {
                      in: [AppointmentStatus.SCHEDULED, AppointmentStatus.ARRIVED],
                    },
                  },
                },
              },
            },
            include: { patient: { select: { id: true, firstName: true, lastName: true } } },
          })
        : Promise.resolve([]),
      // A second, independent way for the cupboard to be wrong: an expired box
      // counts as stock in every other check on this page.
      prisma.stockItem.count({
        where: { archivedAt: null, batches: { some: { expiryDate: { lt: day } } } },
      }),
      // Treated but not written up. Asked here because the end of the day is
      // exactly when nobody goes looking for it.
      canEditMedical ? getUnrecordedToday() : Promise.resolve([]),
      // Who would take a slot if one came free — which is what a cancellation
      // just did, and what nothing outside the calendar page ever said.
      canSeeWaitlist ? getOpenWaitlist() : Promise.resolve([]),
      // The practice's own board. The bell carries it on every screen; here it
      // is cut to what is actually late or due today, because the dashboard is
      // read once in the morning rather than worked through.
      canSeeFollowUps ? getOpenFollowUps() : Promise.resolve([]),
      canEditFollowUps ? getAssignableStaff() : Promise.resolve([]),
      // Cases the laboratory has not sent back. Derived rather than typed — a
      // promised date that has passed is a fact about the register, and nobody
      // should have to write themselves a note for it.
      canSeeWorks ? getWorksToChase() : Promise.resolve([]),
      // People who left a number on the practice's public page and have not been
      // rung back. Counted rather than listed: the names and numbers belong on
      // `/requests`, and a dashboard that reprints them is a second place for
      // somebody's telephone number to sit on a screen at reception.
      canSeeRequests
        ? prisma.appointmentRequest.count({ where: { status: AppointmentRequestStatus.NEW } })
        : Promise.resolve(0),
    ]);

  // Only what has actually come round. A board that shows next week's lines on
  // the morning dashboard is a board that gets scrolled past.
  const dueFollowUps = openFollowUps.filter(
    (item) => followUpStatus(item, day) !== 'upcoming',
  );

  // Who the rest of today can actually hold. The matching is the useful part: a
  // 60-minute root canal is not a candidate for a 20-minute hole, and offering
  // it as one wastes a phone call. Each person is given their own slice of the
  // free time, so the count under the heading is a count of slots that exist.
  const fitsToday = assignGaps(waiting, freeGaps)
    .filter((row): row is { entry: (typeof waiting)[number]; gap: FreeGap } => row.gap !== null)
    .slice(0, 5);

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={format.dateTime(day, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('statToday')} value={todayAppointments.length} Icon={CalendarDays} href="/appointments" />
        <StatCard label={t('statWeek')} value={weekCount} Icon={CalendarDays} href="/appointments?view=week" />
        {canSeeRecalls ? (
          <StatCard
            label={t('statRecalls')}
            value={recalls.length}
            Icon={BellRing}
            href="/recalls"
            tone={recalls.length > 0 ? 'warn' : 'neutral'}
          />
        ) : (
          <StatCard label={t('statPatients')} value={patientCount} Icon={Users} href="/patients" />
        )}
        <StatCard
          label={t('statLowStock')}
          value={lowStock.length}
          Icon={Package}
          href="/stock?filter=low"
          tone={lowStock.length > 0 ? 'warn' : 'neutral'}
        />
      </div>

      {canAddPatient || canAddAppointment ? (
        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          {canAddPatient ? (
            <Link href="/patients/new" className="btn btn-primary btn-lg w-full">
              <UserPlus size={22} aria-hidden />
              {tp('new')}
            </Link>
          ) : null}
          {canAddAppointment ? (
            <AppointmentFormDialog
              services={services}
              staff={staff}
              operatories={operatories}
              defaultDate={dayKey}
              canCreatePatient={canAddPatient}
              triggerClassName="btn btn-primary btn-lg w-full"
            />
          ) : null}
        </div>
      ) : null}

      {/* Somebody who found the practice on its own website, left a telephone
          number and has heard nothing back.
          
          Shown only when there is one, and it says the count rather than the
          names: the names, the numbers and what each person wrote belong on
          `/requests`, and a dashboard that reprints them puts a stranger's
          telephone number on a screen at reception all day. It sits below the
          medical alerts and above everything else — nothing outranks what
          changes the treatment, and this outranks every list of the practice's
          own errands, because the person on the other end of it is waiting. */}
      {canSeeRequests && waitingRequests > 0 ? (
        <Card className="mb-6 border-warn">
          <CardHeader
            title={t('requestsTitle')}
            subtitle={t('requestsWaiting', { count: waitingRequests })}
            icon={<PhoneIncoming size={22} aria-hidden className="text-warn" />}
            action={
              <Link href="/requests" className="btn btn-sm btn-primary">
                {t('requestsOpen')}
              </Link>
            }
          />
        </Card>
      ) : null}

      {/* Before anything else on the page, because it is the only thing here
          that changes what happens in the chair. One line per person, loudest
          severity first, and gone entirely on a day with nothing to flag. */}
      {todaysAlerts.length > 0 ? (
        <Card className="mb-6 border-danger">
          <CardHeader
            title={ta('todaysAlertsTitle')}
            subtitle={ta('todaysAlertsSubtitle')}
            icon={<ShieldAlert size={22} aria-hidden className="text-danger" />}
          />
          <ul className="divide-y divide-line">
            {[...todaysAlerts]
              .sort((a, b) =>
                a.severity === b.severity ? 0 : a.severity === 'CRITICAL' ? -1 : 1,
              )
              .map((alert) => (
                <li
                  key={alert.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3"
                >
                  <Link
                    href={`/patients/${alert.patient.id}`}
                    className="text-[1.05rem] font-bold text-ink"
                  >
                    {alert.patient.lastName} {alert.patient.firstName}
                  </Link>
                  <Badge tone={alert.severity === 'CRITICAL' ? 'alert' : 'warn'}>
                    <TriangleAlert size={15} aria-hidden />
                    {talerts(`kind_${alert.kind}`)}
                    {alert.substance ? `: ${alert.substance}` : ''}
                  </Badge>
                  {alert.notes ? (
                    <span className="text-[0.93rem] text-ink-soft">{alert.notes}</span>
                  ) : null}
                </li>
              ))}
          </ul>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        {/* The main column reads as "today, then the days that were never
            closed off" — both are the appointment list, so they belong in the
            same column rather than pushing today's schedule down the page. */}
        <div className="space-y-6">
          <Card>
            <CardHeader
              title={t('todaySchedule')}
              icon={<CalendarDays size={22} aria-hidden />}
              action={
                <Link href="/appointments" className="btn btn-secondary btn-sm">
                  {t('openCalendar')}
                </Link>
              }
            />
            {todayAppointments.length === 0 ? (
              <EmptyState
                icon={<CalendarDays size={40} aria-hidden />}
                title={t('noAppointmentsToday')}
              />
            ) : (
              <div className="space-y-3 p-3">
                {todayAppointments.map((appointment) => (
                  <AppointmentRow
                    key={appointment.id}
                    appointment={appointment}
                    services={services}
                  />
                ))}
              </div>
            )}
          </Card>

          {/* The only panel on this page about work that has already gone wrong
              rather than work still to do. It disappears the moment the last
              one is answered, so a practice that closes its days never sees
              it. */}
          {openPast.length > 0 ? (
            <Card className="border-warn">
              <CardHeader
                className="border-b-warn/30 bg-warn-soft"
                title={ta('openPastTitle')}
                subtitle={ta('openPastSubtitle', { count: openPastTotal })}
                icon={
                  <span className="grid size-9 place-items-center rounded-full bg-warn text-surface">
                    <TriangleAlert size={20} aria-hidden />
                  </span>
                }
              />
              <div className="space-y-3 p-3">
                {openPast.map((appointment) => (
                  <AppointmentRow
                    key={appointment.id}
                    appointment={appointment}
                    services={services}
                    showDate
                  />
                ))}
                {openPastTotal > openPast.length ? (
                  <p className="px-1 pb-1 text-[0.92rem] text-ink-soft">
                    {ta('openPastMore', { shown: openPast.length, total: openPastTotal })}
                  </p>
                ) : null}
              </div>
            </Card>
          ) : null}

          {/* The practice's own loose ends, in the column loose ends already
              live in. The bell above carries the same board on every screen;
              this is the copy somebody reads at nine in the morning without
              having to open anything. */}
          {canSeeFollowUps && dueFollowUps.length > 0 ? (
            <Card className="border-warn">
              <CardHeader
                title={tf('title')}
                subtitle={tf('dueCount', { count: dueFollowUps.length })}
                icon={<AlarmClock size={22} aria-hidden className="text-warn" />}
                action={
                  canEditFollowUps ? (
                    <FollowUpFormDialog
                      staff={followUpStaff}
                      today={dayKey}
                      triggerClassName="btn btn-secondary btn-sm"
                    />
                  ) : null
                }
              />
              <FollowUpList
                items={dueFollowUps}
                canEdit={canEditFollowUps}
                staff={followUpStaff}
                variant="card"
                dueOnly
              />
            </Card>
          ) : null}

          {/* What the laboratory owes us. Nobody wrote these down — they fall
              out of a promised date that has passed, which is the whole reason
              the register grew a column for one. */}
          {canSeeWorks && lateWorks.length > 0 ? (
            <Card className="border-warn">
              <CardHeader
                title={twk('chaseTitle')}
                subtitle={twk('chaseSubtitle', { count: lateWorks.length })}
                icon={<FlaskConical size={22} aria-hidden className="text-warn" />}
                action={
                  <Link href="/works?status=late" className="btn btn-secondary btn-sm">
                    {twk('title')}
                  </Link>
                }
              />
              <ul className="divide-y divide-line">
                {lateWorks.map((work) => {
                  const state = workStatus(work, day);
                  return (
                    <li
                      key={work.id}
                      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-5 py-3"
                    >
                      <span className="min-w-0">
                        <span className="text-[1.03rem] font-bold text-ink">
                          #{work.number}{' '}
                          {work.patientId ? (
                            <Link href={`/patients/${work.patientId}`}>{work.patientName}</Link>
                          ) : (
                            work.patientName
                          )}
                        </span>
                        {/* Who to ring, which is the laboratory and not the
                            patient. This row printed `work.phone` — the
                            patient's own number, snapshotted off the docket —
                            under a heading reading "waiting on the laboratory",
                            for as long as the panel has existed. There was
                            nowhere else for a number to come from until `Lab`
                            became a table.

                            A case can name more than one bench, so this is a
                            list; it is nearly always one. A laboratory carried
                            over from the old text column has a name and no
                            number yet, and says so rather than showing nothing —
                            "we sent this to Fier and cannot ring them" is the
                            more useful half of the truth, and it is a sentence
                            somebody can act on by filling the number in. */}
                        <span className="block text-[0.9rem] text-ink-soft">
                          {work.labs.length === 0 ? (
                            <span className="text-ink-faint italic">{twk('noLab')}</span>
                          ) : (
                            work.labs.map((lab, index) => (
                              <span key={lab.id ?? lab.name}>
                                {index > 0 ? ' · ' : ''}
                                <span className="font-semibold">{lab.name}</span>{' '}
                                {lab.phone ? (
                                  <a
                                    href={`tel:${lab.phone.replace(/\s/g, '')}`}
                                    className="tabular-nums"
                                  >
                                    {lab.phone}
                                  </a>
                                ) : (
                                  <Link
                                    href="/works/labs"
                                    className="text-warn underline"
                                  >
                                    {twk('noLabPhone')}
                                  </Link>
                                )}
                              </span>
                            ))
                          )}
                        </span>
                      </span>

                      <span className="flex items-center gap-2">
                        {work.urgent ? <Badge tone="alert">{twk('urgent')}</Badge> : null}
                        <Badge tone={state === 'overdue' ? 'danger' : 'warn'}>
                          {state === 'overdue'
                            ? twk('lateByDays', { days: daysLate(work, day) })
                            : state === 'dueToday'
                              ? twk('statusDueToday')
                              : twk('statusDueSoon')}
                        </Badge>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : null}
        </div>

        {/* The side column reads top-down as "what could still be filled, and
            what could still run out" — the two things worth acting on today. */}
        <div className="space-y-6">
          <FreeTimeCard
            gaps={freeGaps}
            date={dayKey}
            services={services}
            canBook={canAddAppointment}
            canCreatePatient={canAddPatient}
          />

          {/* Somebody who would take a slot, and a slot going spare. The
              calendar page has always matched the two; the dashboard is where
              anybody looks after a cancellation, and it said nothing.

              Shown whenever anyone is waiting rather than only when somebody
              fits, because a full day is exactly when the next caller joins the
              list — and a card that vanishes on those days takes the only way
              of adding them from here with it. */}
          {canSeeWaitlist && waiting.length > 0 ? (
            <Card>
              <CardHeader
                title={tw('title')}
                subtitle={
                  fitsToday.length > 0
                    ? tw('fitsTodayCount', { count: fitsToday.length })
                    : tw('subtitle', { count: waiting.length })
                }
                icon={<ListChecks size={22} aria-hidden />}
                action={
                  // Somebody phoning about a slot is the same conversation that
                  // puts the next person on the list, and this was the one place
                  // that showed the list without offering to add to it.
                  <div className="flex flex-wrap items-center gap-2">
                    {canEditWaitlist ? <WaitlistFormDialog services={services} /> : null}
                    <Link href="/appointments" className="btn btn-secondary btn-sm">
                      {t('openCalendar')}
                    </Link>
                  </div>
                }
              />
              {/* One quiet line rather than a full empty state: on a day that
                  cannot hold anybody there is nothing here to act on, and the
                  card is only still present so the list can be added to. */}
              {fitsToday.length === 0 ? (
                <p className="px-5 py-4 text-[0.95rem] text-ink-soft">{tw('noFitToday')}</p>
              ) : (
                <ul className="divide-y divide-line">
                  {fitsToday.map(({ entry, gap }) => (
                    <li
                      key={entry.id}
                      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-5 py-3"
                    >
                      <span className="min-w-0">
                        <Link
                          href={`/patients/${entry.patient.id}`}
                          className="text-[1.03rem] font-bold text-ink"
                        >
                          {entry.patient.lastName} {entry.patient.firstName}
                        </Link>
                        <span className="block text-[0.9rem] text-ink-soft">
                          {entry.serviceName ? `${entry.serviceName} · ` : ''}
                          {tw('fitsAt', { time: gap.startTime })}
                        </span>
                        {/* The note is the only place a preference like "mornings
                            only" can live, and this panel exists to start a phone
                            call. Dropping it here made the offer above look
                            certain when it was not. */}
                        {entry.note ? (
                          <span className="block text-[0.9rem] text-ink-soft">{entry.note}</span>
                        ) : null}
                      </span>
                      {entry.urgent ? <Badge tone="danger">{tw('urgent')}</Badge> : null}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}

          {/* Treated, but the note is still in somebody's head. */}
          {canEditMedical && unrecorded.length > 0 ? (
            <Card className="border-warn">
              <CardHeader
                title={ta('unrecordedTitle')}
                subtitle={ta('unrecordedSubtitle', { count: unrecorded.length })}
                icon={<NotebookPen size={22} aria-hidden />}
              />
              <ul className="divide-y divide-line">
                {unrecorded.map((appointment) => (
                  <li
                    key={appointment.id}
                    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-5 py-3"
                  >
                    <span className="min-w-0">
                      <Link
                        href={`/patients/${appointment.patient.id}?tab=history`}
                        className="text-[1.03rem] font-bold text-ink"
                      >
                        {appointment.patient.lastName} {appointment.patient.firstName}
                      </Link>
                      <span className="block text-[0.9rem] text-ink-soft tabular-nums">
                        {appointment.startTime}
                        {appointment.serviceName ? ` · ${appointment.serviceName}` : ''}
                      </span>
                    </span>
                    <VisitFormDialog
                      patientId={appointment.patient.id}
                      services={services}
                      staff={staff}
                      currentUserId={user.id}
                      today={dayKey}
                      canBook={canAddAppointment}
                      canSpendStock={user.permissions.includes('stock.edit')}
                      triggerClassName="btn btn-secondary btn-sm"
                    />
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {/* Reminding used to happen only when somebody thought to work down
              the calendar. The contact log makes "who has not been told"
              answerable, so the dashboard asks instead of waiting to be asked. */}
          {canAddAppointment && toRemind.length > 0 ? (
            <Card>
              <CardHeader
                title={t('toRemindTitle')}
                subtitle={t('toRemindSubtitle', { count: toRemind.length })}
                icon={<BellRing size={22} aria-hidden />}
              />
              <div className="space-y-3 p-3">
                {toRemind.map((appointment) => (
                  <AppointmentRow
                    key={appointment.id}
                    appointment={appointment}
                    services={services}
                    showDate
                  />
                ))}
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title={t('stockAlerts')}
              icon={<TriangleAlert size={22} aria-hidden />}
              action={
                <Link href="/stock" className="btn btn-secondary btn-sm">
                  {t('openStock')}
                </Link>
              }
            />
            {/* Expiry is the other way for the cupboard to be wrong, and the
                one the low-stock check cannot see: an expired box counts as
                stock everywhere else. */}
            {expiredCount > 0 ? (
              <p className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3 font-bold text-danger">
                <CalendarClock size={18} aria-hidden />
                {ts('expiredAlert', { count: expiredCount })}
                {user.permissions.includes('stock.edit') ? (
                  <Link href="/stock/expiry" className="btn btn-secondary btn-sm">
                    {ts('expiryTitle')}
                  </Link>
                ) : null}
              </p>
            ) : null}

            {lowStock.length === 0 ? (
              expiredCount > 0 ? null : (
                <EmptyState icon={<Package size={40} aria-hidden />} title={t('stockAllGood')} />
              )
            ) : (
              <ul>
                {lowStock.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5 last:border-b-0"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[1.05rem] font-bold text-ink">
                        {item.name}
                      </span>
                      <span className="block text-[0.9rem] text-ink-soft">
                        {ts('inStock', { qty: item.quantity })} ·{' '}
                        {ts('minShort', { min: item.minLimit })}
                      </span>
                    </span>
                    <Badge tone={item.quantity === 0 ? 'danger' : 'warn'}>
                      {item.quantity === 0 ? ts('out') : ts('low')}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
