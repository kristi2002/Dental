import { Mail, MessageCircle } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { mailtoLink, whatsappLink } from '@/lib/reminders';

/**
 * Reminders open WhatsApp / the mail client with the message pre-filled — the
 * dentist stays the sender and reviews every message before it leaves.
 */
export function ReminderLinks({
  patientName,
  phone,
  email,
  date,
  startTime,
  confirmLink,
  size = 'sm',
}: {
  patientName: string;
  phone: string;
  email: string;
  /** `YYYY-MM-DD` */
  date: string;
  startTime: string;
  /** When given, the message asks the patient to confirm and includes the link. */
  confirmLink?: string;
  size?: 'sm' | 'md';
}) {
  const t = useTranslations('appointments');
  const tr = useTranslations('reminders');
  const format = useFormatter();

  const readableDate = format.dateTime(new Date(`${date}T00:00:00.000Z`), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const values = { name: patientName, date: readableDate, time: startTime };
  // The ask is appended rather than woven in, so a clinic that never sets
  // NEXT_PUBLIC_APP_URL still sends a perfectly good plain reminder.
  const confirmAsk = confirmLink ? `\n\n${tr('confirmAsk', { link: confirmLink })}` : '';

  const whatsapp = phone
    ? whatsappLink(phone, `${tr('whatsappTemplate', values)}${confirmAsk}`)
    : null;
  const mail = email
    ? mailtoLink(email, tr('emailSubject', values), `${tr('emailBody', values)}${confirmAsk}`)
    : null;

  const buttonClass = size === 'sm' ? 'btn btn-secondary btn-sm' : 'btn btn-secondary';
  const iconSize = size === 'sm' ? 17 : 19;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {whatsapp ? (
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClass}
          title={t('remind')}
        >
          <MessageCircle size={iconSize} aria-hidden />
          {t('remindWhatsapp')}
        </a>
      ) : (
        <span className={`${buttonClass} opacity-55`} title={t('noPhoneForReminder')}>
          <MessageCircle size={iconSize} aria-hidden />
          {t('remindWhatsapp')}
        </span>
      )}

      {mail ? (
        <a href={mail} className={buttonClass} title={t('remind')}>
          <Mail size={iconSize} aria-hidden />
          {t('remindEmail')}
        </a>
      ) : (
        <span className={`${buttonClass} opacity-55`} title={t('noEmailForReminder')}>
          <Mail size={iconSize} aria-hidden />
          {t('remindEmail')}
        </span>
      )}
    </div>
  );
}
