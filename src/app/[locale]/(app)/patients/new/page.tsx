import { ArrowLeft } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { NewPatientForm } from '@/components/patients/NewPatientForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { Link } from '@/i18n/navigation';
import { requirePermission } from '@/lib/auth/guard';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * A whole name as somebody typed it on a phone, split the way the desk would.
 *
 * The last word is the surname and everything before it is the rest. That is
 * the Albanian and Italian convention and it is what this form is filled in
 * against; a compound surname is the case it gets wrong, and the fix for that
 * is dragging one word across two boxes that are already filled in.
 *
 * Deliberately not clever. A name is the one field on this form the desk is
 * certain to read before saving — they are usually looking at the person — so a
 * good guess costs nothing and a wrong guess is visible.
 */
function splitName(whole: string): { firstName: string; lastName: string } {
  const parts = whole.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { firstName: parts[0] ?? '', lastName: '' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
}

/**
 * Registering a patient.
 *
 * Needs `patient.edit` rather than `patient.view`: there is nothing to read
 * here, so somebody without the permission would only be able to fill the form
 * in and be refused at the save.
 */
export default async function NewPatientPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ request?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requirePermission('patient.edit');

  /**
   * The enquiry this registration came out of, when the desk pressed "register"
   * on the requests screen.
   *
   * Two things fall out of carrying the id here, and the second is the reason
   * the column exists: the form opens with the name, number and address the
   * person already typed, and `savePatient` writes the link back so the
   * practice can count how many enquiries became patients.
   *
   * One field, not two — the public form asks for a whole name because somebody
   * typing on a phone should not be made to split it, so the desk splits it
   * here. `splitName` guesses at the last word, which is right for the great
   * majority of the names this practice sees and is one keystroke to correct
   * when it is not. Putting the whole string in the first-name box instead
   * would be right for nobody and would still have to be corrected.
   */
  const { request: requestId } = await searchParams;
  const request = requestId
    ? await prisma.appointmentRequest.findUnique({
        where: { id: requestId },
        select: { id: true, name: true, phone: true, email: true, locale: true },
      })
    : null;

  const t = await getTranslations('patients');
  const tc = await getTranslations('common');

  // The answers the practice has already given, offered as autocomplete — it is
  // what keeps "Instagram", "instagram" and "IG" from becoming three rows on the
  // referral chart.
  const referralRows = await prisma.patient.findMany({
    where: { referralSource: { not: null } },
    distinct: ['referralSource'],
    orderBy: { referralSource: 'asc' },
    select: { referralSource: true },
  });

  return (
    <>
      <PageHeader
        title={t('new')}
        subtitle={t('newSubtitle')}
        trail={[{ href: '/patients', label: t('title') }, { label: t('new') }]}
        actions={
          <Link href="/patients" className="btn btn-secondary">
            <ArrowLeft size={18} aria-hidden />
            {tc('back')}
          </Link>
        }
      />

      <NewPatientForm
        referralSources={referralRows
          .map((row) => row.referralSource)
          .filter((value): value is string => Boolean(value))}
        canEditMedical={user.permissions.includes('patient.medical.edit')}
        fromRequest={
          request
            ? {
                id: request.id,
                ...splitName(request.name),
                phone: request.phone,
                email: request.email ?? '',
                // Which language they read the page in, which is the most useful
                // thing the request holds and is exactly what `Patient.locale`
                // is for. See `AppointmentRequest.locale`.
                locale: request.locale,
              }
            : undefined
        }
      />
    </>
  );
}
