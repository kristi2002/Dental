import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { locales, type Locale } from '@/i18n/routing';
import { TEMPLATE_IDS, type ComposedTemplates, type TemplateId } from './template-constants';

export type { ComposedTemplate, ComposedTemplates, TemplateId } from './template-constants';
export { MAX_MESSAGE_LENGTH, TEMPLATE_IDS } from './template-constants';

/**
 * Composing the templates, which is the half that needs a server.
 *
 * The list itself, its type and the length limit live in `template-constants.ts`
 * and are re-exported here so a server caller has one import. The split is not
 * cosmetic: this module reaches for `next-intl/server`, the composer that
 * renders the result is a client component, and a client component importing
 * *this* file drags the server half into the browser bundle. `file-constants.ts`
 * exists for exactly the same reason and says so.
 */

/** The ones that are about a specific slot, and are therefore not always offered. */
const NEEDS_APPOINTMENT: ReadonlySet<TemplateId> = new Set<TemplateId>(['CONFIRM', 'RUNNING_LATE']);

function isLocale(value: string | null | undefined): value is Locale {
  return Boolean(value) && (locales as readonly string[]).includes(value!);
}

/**
 * Every template this patient could be sent, composed ahead of the dialog opening.
 *
 * All of them at once, rather than one per request as the picker moves. Six
 * short strings cost nothing to build and the alternative is a round trip
 * between choosing a template and seeing it, which is exactly the latency that
 * makes somebody give up and type it themselves. It also keeps the composition
 * on the server, which is not a detail — `getTranslations({ locale })` is how
 * the message ends up in the patient's language rather than the receptionist's,
 * and there is no client-side equivalent.
 */
export async function composeTemplates({
  patientName,
  patientLocale,
  clinicName,
  clinicPhone,
  appointment,
}: {
  patientName: string;
  /** The patient's own language. Falls back to the reader's when unset. */
  patientLocale?: string | null;
  clinicName: string;
  clinicPhone: string;
  /** Their next booking, when they have one. `date` is `YYYY-MM-DD`. */
  appointment?: { date: string; startTime: string } | null;
}): Promise<ComposedTemplates> {
  const locale = isLocale(patientLocale) ? patientLocale : await getLocale();

  const [t, reader, format] = await Promise.all([
    // Theirs, for the words that leave the building…
    getTranslations({ locale, namespace: 'messageTemplates' }),
    // …and the reader's, for the words that stay in it.
    getTranslations('messageTemplates'),
    getFormatter({ locale }),
  ]);

  // Built rather than interpolated, because both halves of it are optional and
  // a template carrying `{clinic}` and `{phone}` directly would sign off "Kind
  // regards," followed by a blank line on any practice that has not filled in
  // Settings — and "call us on ." on one that has no number. Six bodies would
  // each have had to solve that; the signature solves it once.
  const clinic = clinicName.trim() || t('theClinic');
  const signature = clinicPhone.trim()
    ? t('signatureWithPhone', { clinic, phone: clinicPhone.trim() })
    : t('signature', { clinic });

  const values = {
    name: patientName,
    clinic,
    signature,
    date: appointment
      ? format.dateTime(new Date(`${appointment.date}T00:00:00.000Z`), {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })
      : '',
    time: appointment?.startTime ?? '',
  };

  const templates = TEMPLATE_IDS.filter((id) => appointment || !NEEDS_APPOINTMENT.has(id)).map(
    (id) => ({
      id,
      label: reader(`label_${id}`),
      // The blank one is blank on purpose: a "free text" template that arrives
      // pre-filled with a greeting is a template, and the reason to reach for it
      // is that none of the others fit.
      subject: id === 'FREE' ? '' : t(`subject_${id}`, values),
      body: id === 'FREE' ? '' : t(`body_${id}`, values),
    }),
  );

  return { locale, templates };
}
