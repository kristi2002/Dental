import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { locales, type Locale } from '@/i18n/routing';
import { mailtoLink, whatsappLink } from '@/lib/reminders';

/**
 * The text of a reminder, composed in **the patient's** language.
 *
 * The app is trilingual, but until now a reminder was written in whichever
 * language the person at the front desk happened to be using — so an Albanian
 * receptionist sent Albanian to an Italian patient. The wording is therefore
 * built on the server, where a locale can be asked for explicitly, rather than
 * in the component that renders the button.
 */
export type ReminderMessage = {
  /** `wa.me` URL, or null when there is no phone number. */
  whatsapp: string | null;
  /** `mailto:` URL, or null when there is no address. */
  mail: string | null;
  /** The message itself, kept for the contact log. */
  body: string;
  subject: string;
  /** Which language it ended up in — shown when it is not the UI's. */
  locale: string;
};

function isLocale(value: string | null | undefined): value is Locale {
  return Boolean(value) && (locales as readonly string[]).includes(value!);
}

export async function composeReminder({
  patientName,
  phone,
  email,
  date,
  startTime,
  patientLocale,
  confirmLink,
}: {
  patientName: string;
  phone: string;
  email: string;
  /** `YYYY-MM-DD` */
  date: string;
  startTime: string;
  /** The patient's own language. Falls back to the reader's when unset. */
  patientLocale?: string | null;
  /** When given, the message asks the patient to confirm and includes the link. */
  confirmLink?: string;
}): Promise<ReminderMessage> {
  const locale = isLocale(patientLocale) ? patientLocale : await getLocale();

  const [t, format] = await Promise.all([
    getTranslations({ locale, namespace: 'reminders' }),
    getFormatter({ locale }),
  ]);

  const values = {
    name: patientName,
    date: format.dateTime(new Date(`${date}T00:00:00.000Z`), {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }),
    time: startTime,
  };

  // Appended rather than woven in, so a clinic that never sets NEXT_PUBLIC_APP_URL
  // still sends a perfectly good plain reminder.
  const confirmAsk = confirmLink ? `\n\n${t('confirmAsk', { link: confirmLink })}` : '';
  const body = `${t('whatsappTemplate', values)}${confirmAsk}`;
  const emailBody = `${t('emailBody', values)}${confirmAsk}`;
  const subject = t('emailSubject', values);

  return {
    whatsapp: phone ? whatsappLink(phone, body) : null,
    mail: email ? mailtoLink(email, subject, emailBody) : null,
    body,
    subject,
    locale,
  };
}
