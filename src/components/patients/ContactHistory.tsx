import { CalendarClock, Mail, MessageCircle, MessagesSquare, Phone, Users } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Link } from '@/i18n/navigation';
import { ContactBody } from './ContactBody';

export type ContactView = {
  id: string;
  channel: string;
  purpose: string;
  body: string;
  /** ISO timestamp. */
  createdAt: string;
  actorName: string;
  /** The appointment it was about, when it was about one. */
  appointment: { date: string; startTime: string } | null;
};

const CHANNEL_ICON: Record<string, typeof Mail> = {
  WHATSAPP: MessageCircle,
  EMAIL: Mail,
  PHONE: Phone,
  IN_PERSON: Users,
};

/**
 * What the clinic has actually put in front of this patient, and when.
 *
 * Deliberately worded as "opened" rather than "sent": the app hands the message
 * to WhatsApp or the mail client and the person presses send, so this records
 * what was composed, not what was delivered. Claiming more than that would make
 * the log worse than useless in the one argument it exists to settle.
 */
export async function ContactHistory({ contacts }: { contacts: ContactView[] }) {
  const t = await getTranslations('contacts');
  const format = await getFormatter();

  if (contacts.length === 0) {
    return <EmptyState icon={<MessagesSquare size={40} aria-hidden />} title={t('empty')} />;
  }

  return (
    <ol className="divide-y divide-line">
      {contacts.map((contact) => {
        const Icon = CHANNEL_ICON[contact.channel] ?? MessagesSquare;
        // The one row type with no actor: `confirmations.ts` writes it when
        // the patient themselves answers the link, and unlike every other
        // row here it is not a guess about what was put in front of them —
        // it is them replying. Worth a badge of its own rather than letting
        // it read as a row that is merely missing who handled it.
        const isPatientReply = !contact.actorName && contact.purpose === 'CONFIRMATION';

        return (
          <li key={contact.id} className="flex gap-3 px-5 py-3.5">
            <span aria-hidden className="mt-0.5 text-brand">
              <Icon size={19} />
            </span>

            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-ink">{t(`purpose_${contact.purpose}`)}</span>
                <Badge tone="neutral">{t(`channel_${contact.channel}`)}</Badge>
                {isPatientReply ? <Badge tone="ok">{t('patientReplied')}</Badge> : null}
                <span className="text-[0.9rem] text-ink-faint tabular-nums">
                  {format.dateTime(new Date(contact.createdAt), {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </p>

              {contact.actorName ? (
                <p className="text-[0.9rem] text-ink-faint">
                  {t('by', { name: contact.actorName })}
                </p>
              ) : null}

              {contact.appointment ? (
                <Link
                  href={`/appointments?view=day&date=${contact.appointment.date}`}
                  className="flex w-fit items-center gap-1.5 text-[0.9rem] font-semibold text-brand-deep no-underline hover:underline"
                >
                  <CalendarClock size={14} aria-hidden />
                  {t('forAppointment', {
                    date: format.dateTime(new Date(contact.appointment.date), {
                      day: 'numeric',
                      month: 'short',
                      timeZone: 'UTC',
                    }),
                    time: contact.appointment.startTime,
                  })}
                </Link>
              ) : null}

              <ContactBody body={contact.body} showMore={t('showMore')} showLess={t('showLess')} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
