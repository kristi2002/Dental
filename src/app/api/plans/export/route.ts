import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { NextResponse } from 'next/server';
import { routing } from '@/i18n/routing';
import { recordAudit } from '@/lib/auth/guard';
import { getCurrentUser } from '@/lib/auth/session';
import { csvResponse } from '@/lib/csv';
import { toDateKey, today } from '@/lib/dates';
import { planStatusFor, planWhere, toPlanFilter } from '@/lib/plan-filter';
import { summarisePlan } from '@/lib/plan-progress';
import { plansToRows } from '@/lib/plans-export';
import { prisma } from '@/lib/prisma';
import { getClinicProfile } from '@/lib/queries';
import { toothLabel } from '@/lib/teeth';

/**
 * The courses of treatment as a spreadsheet.
 *
 * Sibling of the works and patients exports: the tab and the search box travel
 * with it, so what downloads is what was on screen. The shape of the file is in
 * `plans-export.ts`; the filter is `plan-filter.ts`, shared with the page rather
 * than reimplemented here.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.permissions.includes('plan.view')) {
    return new NextResponse(null, { status: 404 });
  }

  const url = new URL(request.url);
  const query = (url.searchParams.get('q') ?? '').trim();
  const filter = toPlanFilter(url.searchParams.get('filter'));

  const requested = url.searchParams.get('locale');
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: 'plans' });
  const tt = await getTranslations({ locale, namespace: 'teeth' });
  const tp = await getTranslations({ locale, namespace: 'patients' });

  const [plans, profile] = await Promise.all([
    prisma.treatmentPlan.findMany({
      where: planWhere(planStatusFor(filter), query),
      // The screen's order. No cap, unlike the screen: the page stops at three
      // hundred because a browser has to draw them, and a file has no such
      // excuse — an export that quietly stopped at row three hundred would be
      // exactly the trap the page's own "showing N of M" line exists to avoid.
      orderBy: { updatedAt: 'desc' },
      select: {
        title: true,
        status: true,
        createdAt: true,
        lastContactedAt: true,
        followUpOn: true,
        patient: { select: { firstName: true, lastName: true } },
        steps: {
          orderBy: { position: 'asc' },
          select: {
            position: true,
            title: true,
            toothNum: true,
            status: true,
            completedAt: true,
            appointment: { select: { date: true, startTime: true, status: true } },
          },
        },
      },
    }),
    getClinicProfile(),
  ]);

  // `stalled` is not a status the database holds — it is "quiet for sixty days
  // with nothing booked", decided per plan by `summarisePlan`. So the tab is
  // asked for as open plans and narrowed here, by the same function the screen
  // narrows with, rather than by a second reading of the same rule.
  const now = today();
  const selected =
    filter === 'stalled' ? plans.filter((plan) => summarisePlan(plan, now).stalled) : plans;

  const rows = plansToRows(
    selected,
    {
      patient: tp('title'),
      plan: t('planTitle'),
      status: t('status'),
      created: t('exportCreated'),
      done: t('stepDone'),
      steps: t('exportStepCount'),
      lastContacted: t('exportLastContacted'),
      followUpOn: t('exportFollowUpOn'),
      position: '#',
      stepTitle: t('stepTitle'),
      tooth: tt('colTooth'),
      stepStatus: t('exportStepStatus'),
      booked: t('exportStepDate'),
    },
    toDateKey,
    {
      planStatus: (status) => t(`status_${status}`),
      stepStatus: (status) => t(`step_${status}`),
    },
    (toothNum) => toothLabel(toothNum, profile.toothNumbering),
  );

  await recordAudit(user, {
    action: 'export',
    entity: 'plan',
    summary: `${filter} · ${query || 'all'} · ${selected.length}`,
  });

  return csvResponse(`${t('exportFileName')}-${filter}-${toDateKey(new Date())}.csv`, rows);
}
