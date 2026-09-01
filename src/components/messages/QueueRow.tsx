import {
  BellRing,
  CalendarClock,
  Check,
  Clock3,
  FlaskConical,
  HeartPulse,
  ListChecks,
  Mail,
  MailWarning,
  Phone,
  RotateCcw,
  Undo2,
} from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import { QueueSendLinks } from '@/components/messages/QueueSendLinks';
import { ReportingActionForm } from '@/components/ui/ActionForm';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Link } from '@/i18n/navigation';
import {
  emailQueuedMessage,
  markQueuedMessageCalled,
  reopenQueuedMessage,
  setQueuedMessageAside,
} from '@/lib/actions/messages';
import type { QueuedMessage } from '@/lib/messages/board';
import { composeForQueued } from '@/lib/messages/compose';
import { noteKey } from '@/lib/messages/outbox';

const STATUS_TONE: Record<string, BadgeTone> = {
  SENT: 'ok',
  CANCELLED: 'neutral',
  SKIPPED: 'warn',
  PENDING: 'brand',
};

/**
 * One picture per kind, borrowed from the screen each kind belongs to.
 *
 * The appointment reminder has none on purpose: it is four rows in five, and a
 * badge that appears on everything is a badge nobody reads. The other four are
 * the exceptions, and looking like exceptions is the point.
 */
const KIND_ICONS = {
  RECALL_DUE: BellRing,
  POST_OP_CHECK: HeartPulse,
  WORK_READY: FlaskConical,
  PLAN_NEXT_STEP: ListChecks,
} as const;

/**
 * One line of the send queue.
 *
 * A server component because the message has to be, and that is the whole
 * arrangement in one sentence: composing needs the patient's locale and the
 * translation catalogue for it, neither of which a browser has. So the wording
 * is built here, at the moment the row is drawn, and the client half receives
 * two finished hrefs and a body to log.
 *
 * That is also why `ScheduledMessage` has no text column. Composing at draw time
 * means a slot that moved from 09:00 to 09:30 this morning produces the right
 * sentence this afternoon, with nothing having had to notice — and it means the
 * four kinds that are about something other than a booking quote the *live*
 * fact: how long since the visit, which case came back, which plan stopped.
 */
export async function QueueRow({
  message,
  mode,
  locale,
  canSend,
  canEmail,
}: {
  message: QueuedMessage;
  /**
   * `send` is a row to work; `held` is one the mail provider refused, which is
   * still workable — by telephone, by WhatsApp, or by pressing send again once
   * it comes back; `passed` is one whose moment has gone, offered only a
   * dismissal; `handled` is the record of one already dealt with.
   */
  mode: 'send' | 'held' | 'passed' | 'handled';
  locale: string;
  canSend: boolean;
  /**
   * Whether a mail provider is configured. Worked out once for the whole page
   * rather than per row — it is one read of `process.env` either way, but a
   * component that answers "is this practice set up for email" for every line of
   * a list is a component that will one day answer it differently on two of them.
   */
  canEmail: boolean;
}) {
  const t = await getTranslations('outbox');
  const tc = await getTranslations('common');
  const format = await getFormatter();

  const { patient, appointment } = message;
  const patientName = `${patient.lastName} ${patient.firstName}`.trim();

  // Composed even for a row nobody will send: the `handled` list shows what was
  // said, and the `passed` list is easier to judge with the sentence in view
  // than without it. The cost is a translation lookup per row.
  //
  // The same function the send action calls, so what is shown on the button and
  // what actually goes out cannot drift apart.
  const reminder = await composeForQueued(message, locale);

  const key = noteKey(message.note);
  // A key we recognise is translated; anything else is shown as written, which
  // is what a row from a newer version of the rules will be. See `noteKey`.
  const note = key ? t(`note.${key}`) : message.note;

  const KindIcon = KIND_ICONS[message.kind as keyof typeof KIND_ICONS];
  const workable = mode === 'send' || mode === 'held';

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/patients/${patient.id}`}
            className="truncate text-lead font-bold text-ink no-underline hover:text-brand-deep"
          >
            {patientName}
          </Link>

          {/* Which of the five this is. Only ever shown for the four that are
              not an appointment reminder — see `KIND_ICONS`. */}
          {KindIcon ? (
            <Badge tone="neutral">
              <KindIcon size={13} aria-hidden />
              {t(`kind_${message.kind}`)}
            </Badge>
          ) : null}

          {mode === 'handled' ? (
            <Badge tone={STATUS_TONE[message.status] ?? 'neutral'}>
              {t(`status_${message.status}`)}
            </Badge>
          ) : null}

          {mode === 'passed' ? <Badge tone="warn">{t('passedBadge')}</Badge> : null}

          {/* Only when it differs from the screen's own language. An Albanian
              receptionist sending Albanian to an Albanian patient does not need
              telling; sending Italian is exactly what they want to know. */}
          {reminder && reminder.locale !== locale ? (
            <Badge tone="neutral">{reminder.locale.toUpperCase()}</Badge>
          ) : null}
        </div>

        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-ink-soft">
          {appointment ? (
            <span className="flex items-center gap-1.5">
              <CalendarClock size={15} aria-hidden />
              {format.dateTime(new Date(`${appointment.date}T00:00:00.000Z`), {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
              {' · '}
              <span className="font-semibold tabular-nums">{appointment.startTime}</span>
            </span>
          ) : null}

          {appointment?.serviceName ? <span>{appointment.serviceName}</span> : null}

          {/* What each kind is actually about, in the same words the message
              quotes back to the patient — so the reader and the recipient are
              looking at one fact rather than two descriptions of it. */}
          {message.kind === 'RECALL_DUE' ? (
            <span>
              {message.lastVisit
                ? t('lastSeen', {
                    date: format.dateTime(new Date(`${message.lastVisit}T00:00:00.000Z`), {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    }),
                  })
                : t('neverSeen')}
            </span>
          ) : null}

          {message.kind === 'POST_OP_CHECK' && message.lastVisit ? (
            <span>
              {t('treatedOn', {
                date: format.dateTime(new Date(`${message.lastVisit}T00:00:00.000Z`), {
                  day: 'numeric',
                  month: 'long',
                }),
              })}
              {message.lastVisitServices ? ` · ${message.lastVisitServices}` : ''}
            </span>
          ) : null}

          {message.kind === 'WORK_READY' && message.work ? (
            <span>{t('workBack', { work: message.work.label })}</span>
          ) : null}

          {message.kind === 'PLAN_NEXT_STEP' && message.plan ? (
            <span>
              {message.plan.title}
              {message.plan.nextStep ? ` · ${message.plan.nextStep}` : ''}
            </span>
          ) : null}

          <span className="tabular-nums">{patient.phone || t('noPhone')}</span>

          {/* The channel this patient asked for, on the one screen built for
              sending things. The patient record has honoured `preferredChannel`
              since it was collected; the queue was choosing WhatsApp for
              everybody, including the people who had said not to. */}
          {workable && patient.preferredChannel ? (
            <span className="font-semibold text-ink-soft">
              {t(`prefers_${patient.preferredChannel}`)}
            </span>
          ) : null}
        </p>

        {/* Tried, refused, and coming back. The count is what separates this
            from a row nobody has got to, which is the whole reason the section
            exists. */}
        {mode === 'held' ? (
          <p className="mt-1 flex items-center gap-1.5 text-meta font-semibold text-warn">
            <RotateCcw size={14} aria-hidden />
            {t('triedTimes', { count: message.attempts })}
            {' · '}
            {t('backAt', {
              time: format.dateTime(message.sendAfter, { hour: '2-digit', minute: '2-digit' }),
            })}
          </p>
        ) : null}

        {/* The address is on the record and the practice cannot use it. Said
            out loud, because "why is the email button greyed out?" is otherwise
            answered by nothing at all. */}
        {workable && patient.emailBounced ? (
          <p className="mt-1 flex items-center gap-1.5 text-meta text-ink-faint">
            <MailWarning size={14} aria-hidden />
            {t('emailBounced')}
          </p>
        ) : null}

        {note ? (
          <p className="mt-1 text-meta text-ink-faint">
            {note}
            {message.resolvedBy ? ` — ${message.resolvedBy}` : ''}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {!canSend ? (
          <span className="text-meta text-ink-faint">{tc('viewOnly')}</span>
        ) : workable && reminder ? (
          <>
            <QueueSendLinks
              messageId={message.id}
              whatsapp={reminder.whatsapp}
              mail={reminder.mail}
              body={reminder.body}
              consent={patient.contactConsent}
              preferred={patient.preferredChannel}
              emailBounced={patient.emailBounced}
              emailAction={
                canEmail && patient.email ? (
                  /* Reporting rather than fire-and-forget, because this one can
                     genuinely refuse — an unverified sender domain, a used-up
                     daily allowance — and a button that fails silently on a
                     screen whose whole job is telling patients things would be
                     the worst possible place for it. */
                  <ReportingActionForm action={emailQueuedMessage} values={{ id: message.id }}>
                    <button type="submit" className="btn btn-secondary btn-sm" title={t('sendEmail')}>
                      <Mail size={17} aria-hidden />
                      {t('sendEmail')}
                    </button>
                  </ReportingActionForm>
                ) : undefined
              }
            />

            {/* The channel the practice actually knows arrived. A reminder
                given over the telephone is the most reliable one there is and
                had nowhere to be recorded from this screen without it. */}
            <ReportingActionForm
              action={markQueuedMessageCalled}
              values={{ id: message.id, body: reminder.body }}
            >
              <button type="submit" className="btn btn-secondary btn-sm" title={t('called')}>
                <Phone size={17} aria-hidden />
                {t('called')}
              </button>
            </ReportingActionForm>

            <ReportingActionForm action={setQueuedMessageAside} values={{ id: message.id }}>
              <button type="submit" className="btn btn-ghost btn-sm" title={t('setAside')}>
                <Clock3 size={17} aria-hidden />
                <span className="sr-only">{t('setAside')}</span>
              </button>
            </ReportingActionForm>
          </>
        ) : mode === 'passed' ? (
          <ReportingActionForm action={setQueuedMessageAside} values={{ id: message.id }}>
            <button type="submit" className="btn btn-secondary btn-sm" title={t('dismiss')}>
              <Check size={17} aria-hidden />
              {t('dismiss')}
            </button>
          </ReportingActionForm>
        ) : message.resolvedBy ? (
          /* Put back — the undo for a mis-press, and offered only on a row a
             person resolved. A row the clock withdrew was withdrawn because
             what it described stopped being true, and reopening it would send
             somebody a reminder for an appointment that moved. */
          <ReportingActionForm action={reopenQueuedMessage} values={{ id: message.id }}>
            <button type="submit" className="btn btn-ghost btn-sm" title={t('putBack')}>
              <Undo2 size={17} aria-hidden />
              {t('putBack')}
            </button>
          </ReportingActionForm>
        ) : null}
      </div>
    </li>
  );
}
