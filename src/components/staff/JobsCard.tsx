import { AlarmClock, AlarmClockOff, Play } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { ReportingActionForm } from '@/components/ui/ActionForm';
import { runJobNow } from '@/lib/actions/jobs';
import type { JobBoardRow } from '@/lib/jobs/board';
import type { JobSeverity } from '@/lib/job-status';
import { worstJobSeverity } from '@/lib/job-status';
import { cn } from '@/lib/utils';

/**
 * What the clock has actually been doing.
 *
 * Filed beside the backup cards, and for the identical reason: both are things
 * that happen without anybody present, and a thing that happens without anybody
 * present needs a screen or it stops happening quietly. The backup learned this
 * lesson first and grew a status file; the jobs had a whole table — `JobRun` —
 * whose own comment claimed these rows were "read by the same pages everything
 * else is", and nothing read them.
 *
 * The consequence is worth naming, because it is not "an unhelpful gap": a
 * `queue-appointment-reminders` throwing every evening since March presents to
 * the practice as an **empty outbox**, and that screen documents an empty outbox
 * as the good state — "yesterday evening's was worked". The broken system and
 * the working one looked the same from every screen in the app.
 *
 * Every job in the registry gets a row whether or not it has ever run, which is
 * the half a table-driven list could not do: never having run is the single most
 * likely thing to be wrong — a sidecar that was never wired, a `JOBS_SECRET`
 * that does not match — and it is invisible to anything that lists rows.
 */

/** The same mapping the backup card uses, so two cards on one page agree. */
const TONES: Record<JobSeverity, BadgeTone> = {
  ok: 'ok',
  late: 'warn',
  critical: 'danger',
  unknown: 'neutral',
};

export async function JobsCard({ jobs }: { jobs: ReadonlyArray<JobBoardRow> }) {
  const t = await getTranslations('jobs');
  const format = await getFormatter();

  const worst = worstJobSeverity(jobs.map((job) => job.health));

  return (
    <Card>
      <CardHeader
        title={t('title')}
        subtitle={t('subtitle')}
        icon={
          worst === 'ok' ? (
            <AlarmClock size={22} aria-hidden />
          ) : (
            <AlarmClockOff size={22} aria-hidden className="text-warn" />
          )
        }
      />

      <ul className="divide-y-2 divide-line">
        {jobs.map((job) => {
          const { severity, reason, staleHours } = job.health;
          const failure = job.latest?.error;

          return (
            <li key={job.name} className="px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="text-body font-bold text-ink">{t(`name.${job.name}`)}</span>
                    <Badge tone={TONES[severity]}>{t(`reason.${reason}`)}</Badge>
                  </p>
                  {/* What it is for, and how often it is meant to happen. The
                      cadence is on the row rather than in a heading because it
                      is what makes "four days ago" readable — four days is
                      nothing for the weekly sweep and four missed runs for the
                      nightly queue. */}
                  <p className="mt-0.5 text-meta text-ink-soft">
                    {t(`hint.${job.name}`)} · {t('cadence', { hours: job.everyHours })}
                  </p>
                </div>

                {/* A verb, because a card that reports a dead clock and offers
                    nothing leaves the reader where it found them. Pressing it
                    separates the two possible faults in one step: the summary
                    changes and the clock is at fault, or the error changes and
                    the job is. */}
                <ReportingActionForm action={runJobNow} values={{ name: job.name }}>
                  <button type="submit" className="btn btn-secondary btn-sm">
                    <Play size={16} aria-hidden />
                    {t('runNow')}
                  </button>
                </ReportingActionForm>
              </div>

              <dl className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                {/* The number that matters, and the one a naive card would leave
                    out. A job failing nightly is running perfectly and achieving
                    nothing — its *last attempt* is minutes old and its last
                    success may be from March. */}
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <dt className="text-meta text-ink-soft">{t('lastSuccess')}</dt>
                  <dd
                    className={cn(
                      'text-body font-semibold',
                      staleHours === null ? 'text-danger' : 'text-ink',
                    )}
                  >
                    {job.lastSuccessAt ? format.relativeTime(job.lastSuccessAt) : t('never')}
                  </dd>
                </div>

                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <dt className="text-meta text-ink-soft">{t('lastAttempt')}</dt>
                  <dd className="text-body font-semibold text-ink">
                    {job.latest
                      ? format.dateTime(job.latest.startedAt, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })
                      : t('never')}
                  </dd>
                </div>
              </dl>

              {/* The line the job wrote about itself. This is the whole reason
                  `JobRun.summary` exists — "9 orphans, 765 B" accumulating over
                  a fortnight is what turns switching the sweep to delete from a
                  hopeful act into an informed one. */}
              {job.latest?.summary ? (
                <p className="mt-2 rounded-lg bg-paper px-3 py-2 font-mono text-meta break-words text-ink-soft">
                  {job.latest.summary}
                </p>
              ) : null}

              {failure ? (
                <p className="mt-2 rounded-lg border border-danger bg-danger-soft px-3 py-2 font-mono text-meta break-words text-danger">
                  {failure}
                </p>
              ) : null}

              {/* Said out loud rather than left as a blank row. A job that has
                  never run is not a job with no news — it is the clock not
                  reaching the app, which is the failure this card was built for
                  and the one nothing else in the deployment reports. */}
              {reason === 'never' ? (
                <p className="mt-2 text-meta font-semibold text-warn">{t('neverHint')}</p>
              ) : null}
            </li>
          );
        })}
      </ul>

      {/* Where the clock actually lives, because the commonest cause of every
          bad state above is outside this app entirely — a sidecar that was
          never started, or a secret that does not match. */}
      <p className="border-t border-line px-5 py-3 text-meta text-ink-faint">
        {t('footnote')}
      </p>
    </Card>
  );
}
