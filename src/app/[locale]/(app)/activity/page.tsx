import { ScrollText } from 'lucide-react';
import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { RoleBadge } from '@/components/auth/RoleBadge';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Link } from '@/i18n/navigation';
import { requirePermission } from '@/lib/auth/guard';
import { prisma } from '@/lib/prisma';
import { initials } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** One page of history is plenty for a clinic; older entries stay in the table. */
const PAGE_SIZE = 100;

const ENTITIES = [
  'patient',
  'appointment',
  'visit',
  'tooth',
  'plan',
  'document',
  'prescription',
  'stock',
  'service',
  'staff',
  'recall',
  'waitlist',
  'backup',
  'session',
] as const;

const ACTION_TONES: Record<string, BadgeTone> = {
  create: 'ok',
  update: 'brand',
  delete: 'danger',
  // Reads are the quiet majority of the trail once views are recorded, so they
  // stay grey — the eye should still land on what was changed or taken out.
  view: 'neutral',
  export: 'warn',
  login: 'neutral',
  logout: 'neutral',
  denied: 'warn',
  confirmed: 'ok',
  declined: 'warn',
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'activity' });
  return { title: t('title') };
}

export default async function ActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ entity?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  await requirePermission('audit.view');

  const { entity } = await searchParams;
  const filter = ENTITIES.includes(entity as (typeof ENTITIES)[number]) ? entity : undefined;

  const t = await getTranslations('activity');
  const tc = await getTranslations('common');
  const format = await getFormatter();

  const entries = await prisma.auditLog.findMany({
    where: filter ? { entity: filter } : {},
    orderBy: { createdAt: 'desc' },
    take: PAGE_SIZE,
  });

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} trail={[{ label: t('title') }]} />

      <nav aria-label={t('filterLabel')} className="mb-5">
        <div className="segmented">
          <Link href="/activity" aria-current={filter ? undefined : 'true'} className="segment">
            {tc('all')}
          </Link>
          {ENTITIES.map((value) => (
            <Link
              key={value}
              href={`/activity?entity=${value}`}
              aria-current={filter === value ? 'true' : undefined}
              className="segment"
            >
              {t(`entity_${value}`)}
            </Link>
          ))}
        </div>
      </nav>

      <Card>
        <CardHeader
          title={t('recent', { count: entries.length })}
          icon={<ScrollText size={22} aria-hidden />}
        />

        {entries.length === 0 ? (
          <EmptyState icon={<ScrollText size={40} aria-hidden />} title={t('empty')} />
        ) : (
          <ul className="divide-y border-line">
            {entries.map((entry) => {
              const [firstName = '', lastName = ''] = entry.actorName.split(' ');

              return (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line px-5 py-3.5 last:border-b-0"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span
                      aria-hidden
                      className="grid size-9 shrink-0 place-items-center rounded-full bg-paper text-[0.82rem] font-bold text-ink-soft"
                    >
                      {initials(firstName, lastName || firstName)}
                    </span>

                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2">
                        <Badge tone={ACTION_TONES[entry.action] ?? 'neutral'}>
                          {t(`action_${entry.action}`)}
                        </Badge>
                        <span className="text-[1rem] font-semibold text-ink">
                          {t(`entity_${entry.entity}`)}
                        </span>
                        <span className="min-w-0 truncate text-[1rem] text-ink-soft">
                          {entry.summary}
                        </span>
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[0.9rem] text-ink-soft">
                        {entry.actorName}
                        {/* No role means the patient acted, not a member of staff. */}
                        {entry.actorRole ? (
                          <RoleBadge role={entry.actorRole} />
                        ) : (
                          <Badge tone="neutral">{t('actorPatient')}</Badge>
                        )}
                      </p>
                    </div>
                  </div>

                  <time
                    dateTime={entry.createdAt.toISOString()}
                    className="shrink-0 text-[0.9rem] whitespace-nowrap text-ink-faint"
                  >
                    {format.dateTime(entry.createdAt, {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
