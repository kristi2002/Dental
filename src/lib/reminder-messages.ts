import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { locales, type Locale } from '@/i18n/routing';
import { optOutToken, optOutUrl } from '@/lib/opt-out';
import { mailtoLink, whatsappLink } from '@/lib/reminders';

/**
 * The text of everything the practice sends a patient on purpose, composed in
 * **the patient's** language.
 *
 * The app is trilingual, and a message written in whichever language the person
 * at the front desk happened to be using is how an Albanian receptionist sends
 * Albanian to an Italian patient. So the wording is built on the server, where a
 * locale can be asked for explicitly, rather than in the component that renders
 * the button.
 *
 * Five kinds share one shape, and the shape is the point. Each of them differs
 * only in which three strings it reaches for and which facts it interpolates;
 * everything else — the patient's language, the WhatsApp link, the `mailto:`
 * fallback, the opt-out line at the bottom — is identical, and identical is what
 * it has to stay. The one thing that must never vary between kinds is the way
 * out, and a per-kind composer is how that starts varying.
 */
export type ReminderMessage = {
  /** `wa.me` URL, or null when there is no phone number. */
  whatsapp: string | null;
  /** `mailto:` URL, or null when there is no address. */
  mail: string | null;
  /**
   * The short form — what goes to WhatsApp, and what the contact log keeps.
   *
   * Short because it is read on a lock screen. The log stores this one rather
   * than the email because it is the wording somebody at the desk can scan when
   * a patient rings back saying "what was that message about?".
   */
  body: string;
  /**
   * The long form, signed off, which is what actually leaves over the mail
   * provider.
   *
   * Split from `body` because until it existed the two disagreed: the `mailto:`
   * draft carried the email wording while the provider send carried the
   * WhatsApp wording, so the same button produced a different letter depending
   * on whether the practice had configured a mailer. This is also the only one
   * of the two that carries the opt-out link, for the reason `optOutAsk` gives.
   */
  emailBody: string;
  subject: string;
  /** Which language it ended up in — shown when it is not the UI's. */
  locale: string;
};

function isLocale(value: string | null | undefined): value is Locale {
  return Boolean(value) && (locales as readonly string[]).includes(value!);
}

/** Everything every kind needs about the person being written to. */
type Recipient = {
  patientId: string;
  patientName: string;
  phone: string;
  email: string;
  /** The patient's own language. Falls back to the reader's when unset. */
  patientLocale?: string | null;
};

/**
 * The last line of a message the patient did not ask for.
 *
 * **Not on appointment reminders.** A reminder is about a slot the patient
 * chose, agreed to and is expected at; offering to stop sending those is
 * offering to let somebody miss their own appointment, and it is not the kind of
 * mail an unsubscribe requirement was ever written about. Every other kind here
 * is the practice deciding to get in touch, and all four carry it.
 *
 * **Email only.** The link is a way out of the *mailing*, and a WhatsApp message
 * already has one that works better than anything this app could offer: the
 * patient replies, or blocks the number, and either way a human sees it. A
 * signed URL pasted into the middle of a WhatsApp message is also the single
 * most phishing-shaped thing this practice could send anybody.
 */
async function optOutLine(
  patientId: string,
  locale: string,
  t: Awaited<ReturnType<typeof getTranslations>>,
): Promise<string> {
  const link = optOutUrl(locale, await optOutToken(patientId));
  return `\n\n${t('optOutAsk', { link })}`;
}

type Wording = {
  /** Translation keys for the three strings this kind needs. */
  short: string;
  subject: string;
  long: string;
  /** Interpolated into all three. */
  values: Record<string, string | number>;
  /** Appended to both bodies — today, only the confirmation link. */
  postscript?: string;
  /** Whether the email carries the way out. See `optOutLine`. */
  optOut: boolean;
};

async function compose(recipient: Recipient, build: (t: Awaited<ReturnType<typeof getTranslations>>, format: Awaited<ReturnType<typeof getFormatter>>) => Wording | Promise<Wording>): Promise<ReminderMessage> {
  const locale = isLocale(recipient.patientLocale) ? recipient.patientLocale : await getLocale();

  const [t, format] = await Promise.all([
    getTranslations({ locale, namespace: 'reminders' }),
    getFormatter({ locale }),
  ]);

  const wording = await build(t, format);
  const postscript = wording.postscript ?? '';

  const body = `${t(wording.short, wording.values)}${postscript}`;
  const subject = t(wording.subject, wording.values);
  const emailBody =
    `${t(wording.long, wording.values)}${postscript}` +
    (wording.optOut ? await optOutLine(recipient.patientId, locale, t) : '');

  return {
    whatsapp: recipient.phone ? whatsappLink(recipient.phone, body, locale) : null,
    mail: recipient.email ? mailtoLink(recipient.email, subject, emailBody) : null,
    body,
    emailBody,
    subject,
    locale,
  };
}

/** A date the way every one of these messages says it. */
function longDate(format: Awaited<ReturnType<typeof getFormatter>>, dateKey: string): string {
  return format.dateTime(new Date(`${dateKey}T00:00:00.000Z`), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export async function composeReminder({
  patientId,
  patientName,
  phone,
  email,
  date,
  startTime,
  patientLocale,
  confirmLink,
}: Recipient & {
  /** `YYYY-MM-DD` */
  date: string;
  startTime: string;
  /** When given, the message asks the patient to confirm and includes the link. */
  confirmLink?: string;
}): Promise<ReminderMessage> {
  return compose({ patientId, patientName, phone, email, patientLocale }, (t, format) => ({
    short: 'whatsappTemplate',
    subject: 'emailSubject',
    long: 'emailBody',
    values: { name: patientName, date: longDate(format, date), time: startTime },
    // Appended rather than woven in, so a clinic that never sets
    // NEXT_PUBLIC_APP_URL still sends a perfectly good plain reminder.
    postscript: confirmLink ? `\n\n${t('confirmAsk', { link: confirmLink })}` : '',
    optOut: false,
  }));
}

/**
 * "It has been eight months since we last saw you."
 *
 * Quotes how long it has been rather than a date and a time, which is the whole
 * difference between this and a reminder: one is about a slot the patient has
 * already agreed to, the other is about an absence they may not have noticed.
 */
export async function composeRecall({
  patientId,
  patientName,
  phone,
  email,
  monthsSince,
  lastVisit,
  patientLocale,
}: Recipient & {
  monthsSince: number;
  /** `YYYY-MM-DD`, or null for somebody who has never been in. */
  lastVisit: string | null;
}): Promise<ReminderMessage> {
  const never = await getTranslations({
    locale: isLocale(patientLocale) ? patientLocale : await getLocale(),
    namespace: 'recalls',
  });

  return compose({ patientId, patientName, phone, email, patientLocale }, (_t, format) => ({
    short: 'recallWhatsapp',
    subject: 'recallEmailSubject',
    long: 'recallEmailBody',
    values: {
      name: patientName,
      months: monthsSince,
      last: lastVisit
        ? format.dateTime(new Date(`${lastVisit}T00:00:00.000Z`), {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })
        : never('neverVisited'),
    },
    optOut: true,
  }));
}

/**
 * "How are you getting on, four days after we treated you?"
 *
 * The wording has existed since the recall screen was written; what it never had
 * was a queue. A courtesy whose window is four days wide, offered only on a
 * screen somebody has to remember to open, is a courtesy that happens on the
 * days the practice is quiet enough to think of it.
 */
export async function composeFollowUp({
  patientId,
  patientName,
  phone,
  email,
  daysSince,
  services,
  patientLocale,
}: Recipient & {
  daysSince: number;
  /** What was done, as the visit recorded it. Already a sentence. */
  services: string;
}): Promise<ReminderMessage> {
  return compose({ patientId, patientName, phone, email, patientLocale }, () => ({
    short: 'followUpWhatsapp',
    subject: 'followUpEmailSubject',
    long: 'followUpEmailBody',
    values: { name: patientName, days: daysSince, services },
    optOut: true,
  }));
}

/**
 * "Your crown is back from the laboratory."
 *
 * The one message on this list the patient is actively waiting for, and the one
 * the practice has always been worst at: the register has known the case was
 * back since `receivedAt` was stamped, and the patient found out when somebody
 * remembered to ring.
 */
export async function composeWorkReady({
  patientId,
  patientName,
  phone,
  email,
  work,
  patientLocale,
}: Recipient & {
  /** What came back, in the register's own words — "Crown, 26". */
  work: string;
}): Promise<ReminderMessage> {
  return compose({ patientId, patientName, phone, email, patientLocale }, () => ({
    short: 'workWhatsapp',
    subject: 'workEmailSubject',
    long: 'workEmailBody',
    values: { name: patientName, work },
    optOut: true,
  }));
}

/**
 * "There is a step of your treatment still to do."
 *
 * Quotes the plan and the next step by name, because the alternative — "you
 * have unfinished treatment" — is a sentence that alarms without informing, and
 * the patient very often stopped for a reason they can tell us.
 */
export async function composePlanNudge({
  patientId,
  patientName,
  phone,
  email,
  plan,
  step,
  patientLocale,
}: Recipient & {
  plan: string;
  /** The next step still pending, or an empty string when the plan has none. */
  step: string;
}): Promise<ReminderMessage> {
  return compose({ patientId, patientName, phone, email, patientLocale }, (t) => ({
    short: step ? 'planWhatsapp' : 'planWhatsappPlain',
    subject: 'planEmailSubject',
    long: step ? 'planEmailBody' : 'planEmailBodyPlain',
    values: { name: patientName, plan: plan || t('theTreatment'), step },
    optOut: true,
  }));
}
