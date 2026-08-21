import { Clock, TriangleAlert } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import type { JobSeverity, JobsStatus } from '@/lib/jobs/job-status';

/**
 * What the clock has been doing, on the one page that already answers "is this
 * deployment healthy" — beside the backup card, which is the same question
 * about the same kind of silence.
 *
 * The jobs sidecar has no screen and no log anybody reads. Its two jobs decide
 * whether tomorrow's patients get reminded and whether deleted radiographs
 * actually leave the disk, and both fail in the quietest way available: they
 * stop happening. `run.ts` has recorded every attempt since it was written;
 * this is the first thing to look.
 *
 * Reports rather than reassures, like its neighbour. The summary line each job
 * returns is shown verbatim — "9 orphans, 765 B — reported only" tells the
 * owner something a green tick does not, including the fact that the sweep is
 * still in report-only mode.
 */

const TONES: Record<JobSeverity, BadgeTone> = {
  ok: 'ok',
  late: 'warn',
  critical: 'danger',
  unknown: 'neutral',
};

export async function JobStatusCard({ status }: { status: JobsStatus }) {
  const t = await getTranslations('jobStatus');
  const format = await getFormatter();

  return (
    <Card>
      <CardHeader
        title={t('title')}
        icon={
          status.severity === 'ok' ? (
            <Clock size={22} aria-hidden />
          ) : (
            <TriangleAlert size={22} aria-hidden />
          )
        }
        action={<Badge tone={TONES[status.severity] ?? 'neutral'}>{t(`badge.${status.severity}`)}</Badge>}
      />

      <ul className="divide-y divide-line">
        {status.jobs.map((job) => (
          <li key={job.name} className="p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className="text-[1.02rem] font-semibold text-ink">{t(`name.${job.name}`)}</h3>
              <Badge tone={TONES[job.severity] ?? 'neutral'}>{t(`reason.${job.reason}`)}</Badge>
            </div>

            <p className="mt-1 text-[0.95rem] text-ink-soft">{job.description}</p>

            <dl className="mt-3 space-y-1 text-[0.95rem]">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                <dt className="text-ink-soft">{t('lastRun')}</dt>
                <dd className="font-semibold text-ink">
                  {job.startedAt
                    ? format.dateTime(job.startedAt, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })
                    : t('neverRan')}
                </dd>
              </div>

              {/* Only worth a line when it differs from the last run — on a
                  healthy job the two are the same moment and saying it twice
                  is noise. On a failing one it is the number that matters. */}
              {job.lastSuccessAt && job.ok === false ? (
                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <dt className="text-ink-soft">{t('lastSuccess')}</dt>
                  <dd className="font-semibold text-ink">
                    {format.dateTime(job.lastSuccessAt, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </dd>
                </div>
              ) : null}
            </dl>

            {/* The job's own words. `summary` is one line by construction and
                `error` is truncated by the runner, so neither can flood this. */}
            {job.error ? (
              <p className="mt-3 rounded-lg border border-danger bg-danger-soft px-3 py-2.5 text-[0.95rem] font-semibold text-danger">
                {job.error}
              </p>
            ) : job.summary ? (
              <p className="mt-3 rounded-lg bg-paper px-3 py-2.5 text-[0.95rem] text-ink-soft">
                {job.summary}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}
