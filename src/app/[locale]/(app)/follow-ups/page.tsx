import { AlarmClock, CalendarClock, CalendarDays, CircleCheck, History } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { FollowUpBoardList } from '@/components/follow-ups/FollowUpBoardList';
import { FollowUpFormDialog } from '@/components/follow-ups/FollowUpFormDialog';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterBar } from '@/components/ui/FilterBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { requirePermission } from '@/lib/auth/guard';
import { addDays, toDateKey, today } from '@/lib/dates';
import { followUpStatus, sortFollowUps } from '@/lib/follow-ups';
import { getAssignableStaff, getFollowUpBoard, type BoardFollowUp } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'followUps' });
  return { title: t('title') };
}

/**
 * The board, with room to work down.
 *
 * The bell in the layout is not going anywhere and is not being duplicated here:
 * it exists so a line cannot be missed, and it is right that it follows you onto
 * every screen. What it cannot do is hold a note with a checklist in it, a
 * filter by whose job something is, or the lines somebody ticked off last week —
 * a popover four hundred pixels wide is the wrong shape for all three.
 *
 * So the two are split by what they are for. The bell is *awareness*; this is
 * *work*. Nothing about the bell changed except that a line's title now leads
 * here.
 *
 * Grouped by when rather than listed flat, because "late", "today" and "this
 * week" are three different conversations — the first is an apology, the second
 * is a plan, and the third is only worth reading once the first two are empty.
 */
export default async function FollowUpsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requirePermission('followup.view');
  const canEdit = user.permissions.includes('followup.edit');

  const t = await getTranslations('followUps');
  const tc = await getTranslations('common');

  const query = await searchParams;
  const one = (key: string) => {
    const value = query[key];
    return (Array.isArray(value) ? value[0] : value) ?? '';
  };

  const filters = { status: one('status'), assignee: one('assignee'), q: one('q') };

  const [items, staff] = await Promise.all([getFollowUpBoard(filters), getAssignableStaff()]);

  const day = today();
  const dayKey = toDateKey(day);
  const weekEnd = addDays(day, 7).getTime();

  const sorted = sortFollowUps(items, day);

  /**
   * Four buckets, and a line falls in exactly one. "This week" is the next seven
   * days rather than the calendar week: on a Friday, a calendar week would show
   * nothing at all and hide Monday's, which is the day it is most useful to see.
   */
  const buckets: Array<{ key: string; icon: React.ReactNode; rows: BoardFollowUp[] }> = [
    { key: 'overdue', icon: <History size={22} aria-hidden />, rows: [] },
    { key: 'today', icon: <CalendarClock size={22} aria-hidden />, rows: [] },
    { key: 'week', icon: <CalendarDays size={22} aria-hidden />, rows: [] },
    { key: 'later', icon: <AlarmClock size={22} aria-hidden />, rows: [] },
  ];
  const done: BoardFollowUp[] = [];

  for (const item of sorted) {
    const status = followUpStatus(item, day);
    if (status === 'done') {
      done.push(item);
    } else if (status === 'overdue') {
      buckets[0].rows.push(item);
    } else if (status === 'today') {
      buckets[1].rows.push(item);
    } else if (item.dueAt.getTime() <= weekEnd) {
      buckets[2].rows.push(item);
    } else {
      buckets[3].rows.push(item);
    }
  }

  const showingDone = filters.status === 'done' || filters.status === 'all';
  const visible = buckets.filter((bucket) => bucket.rows.length > 0);
  const nothing = visible.length === 0 && done.length === 0;

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        trail={[{ label: t('title') }]}
        actions={
          canEdit ? <FollowUpFormDialog staff={staff} today={dayKey} /> : undefined
        }
      />

      <FilterBar
        basePath="/follow-ups"
        values={filters}
        label={tc('filters')}
        search={{ name: 'q', label: tc('search'), placeholder: t('searchPlaceholder') }}
        selects={[
          {
            name: 'assignee',
            label: t('fieldAssignee'),
            anyLabel: t('anyone'),
            options: [
              { value: 'none', label: t('unassigned') },
              ...staff.map((person) => ({ value: person.id, label: person.name })),
            ],
          },
        ]}
        chips={{
          name: 'status',
          label: tc('filters'),
          options: [
            { value: '', label: t('statusOpen') },
            { value: 'done', label: t('statusDone') },
            { value: 'all', label: t('statusAll') },
          ],
        }}
        submitLabel={tc('filter')}
        clearLabel={tc('clearFilters')}
        summary={t('resultCount', { count: items.length })}
      />

      {nothing ? (
        <Card>
          <EmptyState icon={<CircleCheck size={40} aria-hidden />} title={t('empty')} />
        </Card>
      ) : (
        <div className="space-y-6">
          {visible.map((bucket) => (
            <Card key={bucket.key}>
              <CardHeader
                title={t(`bucket_${bucket.key}`)}
                subtitle={t('bucketCount', { count: bucket.rows.length })}
                icon={bucket.icon}
              />
              <FollowUpBoardList items={bucket.rows} canEdit={canEdit} />
            </Card>
          ))}

          {showingDone && done.length > 0 ? (
            <Card>
              <CardHeader
                title={t('bucket_done')}
                subtitle={t('bucketCount', { count: done.length })}
                icon={<CircleCheck size={22} aria-hidden />}
              />
              <FollowUpBoardList items={done} canEdit={canEdit} />
            </Card>
          ) : null}
        </div>
      )}
    </>
  );
}
