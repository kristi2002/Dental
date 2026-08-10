import { CalendarClock, Check, Clock3, Mail, MessageCircle } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { ActionForm } from '@/components/ui/ActionForm';
import { Badge } from '@/components/ui/Badge';
import { Link } from '@/i18n/navigation';
import { markRecallContacted, snoozeRecall } from '@/lib/actions/patients';
import { mailtoLink, whatsappLink } from '@/lib/reminders';

/** How long "not now" hides someone for. Long enough to matter, short enough to return. */
const SNOOZE_DAYS = 30;

/**
 * One person the clinic should contact. The two message buttons open a draft;
 * "contacted" and "later" are what actually take the row off the list, and both
 * are recorded, so nobody wonders whether the call was made.
 */
export function RecallCard({
  id,
  firstName,
  lastName,
  phone,
  email,
  lastVisit,
  detail,
  tone,
  message,
  emailSubject,
  emailBody,
  canSend,
}: {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  /** `YYYY-MM-DD`, or null when never seen. */
  lastVisit: string | null;
  /** The "8 months overdue" / "3 days ago" line. */
  detail: string;
  tone: 'warn' | 'danger' | 'brand';
  message: string;
  emailSubject: string;
  emailBody: string;
  canSend: boolean;
}) {
  const t = useTranslations('recalls');
  const tc = useTranslations('common');
  const format = useFormatter();

  const whatsapp = phone ? whatsappLink(phone, message) : null;
  const mail = email ? mailtoLink(email, emailSubject, emailBody) : null;

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/patients/${id}`}
            className="truncate text-[1.12rem] font-bold text-ink no-underline hover:text-brand-deep"
          >
            {lastName} {firstName}
          </Link>
          <Badge tone={tone}>{detail}</Badge>
        </div>

        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.93rem] text-ink-soft">
          <span className="flex items-center gap-1.5">
            <CalendarClock size={15} aria-hidden />
            {lastVisit
              ? format.dateTime(new Date(`${lastVisit}T00:00:00.000Z`), {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })
              : t('neverVisited')}
          </span>
          <span>{phone || t('noPhone')}</span>
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {whatsapp ? (
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary btn-sm"
          >
            <MessageCircle size={17} aria-hidden />
            WhatsApp
          </a>
        ) : null}

        {mail ? (
          <a href={mail} className="btn btn-secondary btn-sm">
            <Mail size={17} aria-hidden />
            Email
          </a>
        ) : null}

        {canSend ? (
          <>
            <ActionForm action={markRecallContacted} values={{ id }}>
              <button type="submit" className="btn btn-primary btn-sm" title={t('markContacted')}>
                <Check size={17} aria-hidden />
                {t('markContacted')}
              </button>
            </ActionForm>

            <ActionForm action={snoozeRecall} values={{ id, days: SNOOZE_DAYS }}>
              <button
                type="submit"
                className="btn btn-ghost btn-sm"
                title={t('snoozeTitle', { days: SNOOZE_DAYS })}
              >
                <Clock3 size={17} aria-hidden />
                <span className="sr-only">{t('snoozeTitle', { days: SNOOZE_DAYS })}</span>
              </button>
            </ActionForm>
          </>
        ) : (
          <span className="text-[0.9rem] text-ink-faint">{tc('viewOnly')}</span>
        )}
      </div>
    </li>
  );
}
