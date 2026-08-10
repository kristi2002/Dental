import { Cake, Mail, Phone, Search, Users } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PatientFormDialog } from '@/components/patients/PatientFormDialog';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Link } from '@/i18n/navigation';
import { age } from '@/lib/dates';
import { prisma } from '@/lib/prisma';
import { initials } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function PatientsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('patients');
  const tc = await getTranslations('common');

  const { q } = await searchParams;
  const query = (q ?? '').trim();

  const patients = await prisma.patient.findMany({
    where: query
      ? {
          OR: [
            { firstName: { contains: query, mode: 'insensitive' } },
            { lastName: { contains: query, mode: 'insensitive' } },
            { phone: { contains: query } },
            { email: { contains: query, mode: 'insensitive' } },
          ],
        }
      : undefined,
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    include: { _count: { select: { visitRecords: true, appointments: true } } },
  });

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('count', { count: patients.length })}
        actions={<PatientFormDialog />}
      />

      <form className="mb-6 flex gap-2" role="search">
        <label className="sr-only" htmlFor="patient-search">
          {tc('search')}
        </label>
        <input
          id="patient-search"
          type="search"
          name="q"
          defaultValue={query}
          placeholder={t('searchPlaceholder')}
          className="field-input flex-1"
        />
        <button type="submit" className="btn btn-secondary">
          <Search size={20} aria-hidden />
          <span className="sr-only sm:not-sr-only">{tc('search')}</span>
        </button>
      </form>

      {patients.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Users size={40} aria-hidden />}
            title={query ? t('emptySearch', { query }) : t('empty')}
            action={query ? null : <PatientFormDialog />}
          />
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {patients.map((patient) => (
            <li key={patient.id}>
              <Link
                href={`/patients/${patient.id}`}
                className="card flex h-full items-start gap-4 p-4 no-underline transition-colors hover:border-brand"
              >
                <span
                  aria-hidden
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-line-strong bg-paper text-[1.05rem] font-bold text-ink-soft"
                >
                  {initials(patient.firstName, patient.lastName)}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[1.15rem] font-bold text-ink">
                    {patient.lastName} {patient.firstName}
                  </span>

                  <span className="mt-1 flex items-center gap-1.5 text-[0.95rem] text-ink-soft">
                    <Phone size={15} aria-hidden />
                    <span className="truncate">{patient.phone || t('noPhone')}</span>
                  </span>

                  {patient.email ? (
                    <span className="mt-0.5 flex items-center gap-1.5 text-[0.95rem] text-ink-soft">
                      <Mail size={15} aria-hidden />
                      <span className="truncate">{patient.email}</span>
                    </span>
                  ) : null}

                  {patient.dateOfBirth ? (
                    <span className="mt-0.5 flex items-center gap-1.5 text-[0.95rem] text-ink-faint">
                      <Cake size={15} aria-hidden />
                      {t('age', { age: age(patient.dateOfBirth) })}
                    </span>
                  ) : null}

                  <span className="mt-2 flex flex-wrap gap-1.5">
                    {patient.medicalNotes ? <Badge tone="warn">{t('medicalNotes')}</Badge> : null}
                    {patient._count.visitRecords > 0 ? (
                      <Badge>
                        {t('tabHistory')}: {patient._count.visitRecords}
                      </Badge>
                    ) : null}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
