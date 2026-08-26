'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { authorize, recordAudit } from '@/lib/auth/guard';
import { runJob } from '@/lib/jobs/run';
import { isJobName } from '@/lib/jobs/registry';
import { actionError, actionOk, type ActionState } from './types';

function revalidateAll() {
  revalidatePath('/', 'layout');
}

/**
 * Running a scheduled job by hand, from the screen that reports on it.
 *
 * The point is not convenience. A card that says "this has not run since March"
 * and offers nothing to do about it leaves the reader exactly where they were —
 * and the first thing anybody wants, on finding that out, is to know whether the
 * job still *works*. Pressing this answers that in one step: either the summary
 * line changes and the problem is the clock, or the error changes and the
 * problem is the job.
 *
 * It calls the same `runJob` the HTTP endpoint does, so everything that path
 * guarantees holds here too — a `JobRun` row opened before the work and closed
 * in a `finally`, the refusal to start a job already in flight, and the failure
 * recorded rather than thrown away. Nothing about a manual trigger is a special
 * case, which is the only way the row this writes stays comparable with the rows
 * the clock writes.
 *
 * Neither registered job sends anything or deletes anything by default —
 * `queue-appointment-reminders` fills a queue a person works down, and
 * `sweep-orphan-files` reports and only deletes behind `JOBS_SWEEP_APPLY`. That
 * is what makes this safe to put behind a button at all, and it is a property of
 * the registry rather than of this action: a job that did send would need this
 * reconsidered, which is written here so the next person adding one reads it.
 */
export async function runJobNow(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getTranslations('jobs');

  const user = await authorize('staff.manage');
  if (!user) return actionError(t('errorDenied'));

  const name = String(formData.get('name') ?? '');
  if (!isJobName(name)) return actionError(t('errorUnknown'));

  const result = await runJob(name);

  // Audited either way, and before the branch: "who set the sweep going" is
  // exactly the sort of question the activity log exists for, and a run that
  // failed is more worth recording than one that worked.
  await recordAudit(user, {
    action: 'update',
    entity: 'job',
    entityId: name,
    summary:
      result.status === 'ok'
        ? `${name} — ${result.summary}`
        : `${name} — ${result.status}`,
  });

  revalidateAll();

  switch (result.status) {
    case 'ok':
      return actionOk();
    case 'busy':
      // Not an error in the deployment's terms — the sidecar treats a 409 as
      // ordinary — but it is one from here, because the person pressed a button
      // and the thing they asked for did not happen.
      return actionError(t('errorBusy'));
    case 'unknown':
      return actionError(t('errorUnknown'));
    case 'failed':
      // The job's own message, not a generic one. This screen exists to make an
      // invisible failure legible, and swallowing the reason at the last step
      // would be the same mistake one layer up.
      return actionError(t('errorFailed', { message: result.error }));
  }
}
