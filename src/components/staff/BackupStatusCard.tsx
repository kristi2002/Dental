import { CloudOff, CloudUpload, HardDrive, ShieldAlert, ShieldCheck, TriangleAlert } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { type BackupStatus, formatBytes } from '@/lib/backup-status';

/**
 * What the automatic backup did last, stated plainly.
 *
 * The card sits directly above the manual export, and the pairing is the point:
 * the export is the copy somebody takes deliberately, this is the copy that
 * happens whether anybody remembers or not. Before the sidecar existed there
 * was only the former, and a clinic keeping seven years of medical records had
 * the backup discipline of whoever thought to click.
 *
 * It reports rather than reassures. Every number here is one the reader could
 * check, and the two that matter most — when the last good copy was taken, and
 * whether a restore has actually been rehearsed against it — are the two a
 * reassuring card would have left out.
 */

const TONES: Record<string, BadgeTone> = {
  ok: 'ok',
  late: 'warn',
  critical: 'danger',
  unknown: 'neutral',
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
      <dt className="text-[0.95rem] text-ink-soft">{label}</dt>
      <dd className="text-[1.02rem] font-semibold text-ink">{children}</dd>
    </div>
  );
}

export async function BackupStatusCard({ status }: { status: BackupStatus }) {
  const t = await getTranslations('backupStatus');
  const format = await getFormatter();

  // --- Nothing has ever run -------------------------------------------------
  // Development, or a stack deployed before the sidecar existed. Saying "not
  // set up" is the only honest answer; the dangerous version of this card is
  // the one that stays quiet and lets absence read as health.
  if (!status.configured || !status.run) {
    return (
      <Card>
        <CardHeader
          title={t('title')}
          icon={<CloudOff size={22} aria-hidden />}
          action={<Badge tone="neutral">{t('state.unknown')}</Badge>}
        />
        <div className="space-y-3 p-5">
          <p className="text-[1.02rem] text-ink-soft">{t('notConfigured')}</p>
          <p className="rounded-lg border border-warn bg-warn-soft px-3 py-2.5 text-[0.95rem] font-semibold text-warn">
            {t('notConfiguredHint')}
          </p>
        </div>
      </Card>
    );
  }

  const { run, verification, severity } = status;
  const tone = TONES[severity] ?? 'neutral';

  return (
    <Card>
      <CardHeader
        title={t('title')}
        icon={
          severity === 'ok' ? (
            <ShieldCheck size={22} aria-hidden />
          ) : (
            <ShieldAlert size={22} aria-hidden />
          )
        }
        action={<Badge tone={tone}>{t(`state.${severity}`)}</Badge>}
      />

      <div className="p-5">
        {run.state === 'failed' && run.message ? (
          <p className="mb-4 rounded-lg border border-danger bg-danger-soft px-3 py-2.5 text-[0.95rem] font-semibold text-danger">
            {t('lastRunFailed', { message: run.message })}
          </p>
        ) : null}

        <dl className="divide-y divide-line">
          <Row label={t('lastSuccess')}>
            {run.lastSuccessAt ? (
              <>
                {format.relativeTime(run.lastSuccessAt)}
                <span className="ml-2 font-normal text-ink-faint">
                  {format.dateTime(run.lastSuccessAt, { dateStyle: 'medium', timeStyle: 'short' })}
                </span>
              </>
            ) : (
              <span className="text-danger">{t('never')}</span>
            )}
          </Row>

          <Row label={t('databaseCopy')}>
            {run.dump.file ? formatBytes(run.dump.bytes) : t('none')}
          </Row>

          <Row label={t('patientFiles')}>
            {t('fileSummary', { count: run.files.count, size: formatBytes(run.files.bytes) })}
          </Row>

          {/* The distinction the whole system turns on. A copy on the server's
              own disk survives a mistake; only the offsite one survives the
              server. A green "backed up" that means neither is how clinics
              discover the difference too late. */}
          <Row label={t('offsite')}>
            {run.offsite.configured ? (
              <span className="inline-flex items-center gap-2">
                <CloudUpload size={18} className="text-ok" aria-hidden />
                {t('snapshots', { count: run.offsite.snapshotCount })}
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 text-danger">
                <HardDrive size={18} aria-hidden />
                {t('localOnly')}
              </span>
            )}
          </Row>

          {/* An untested backup is a hope. This row is where it stops being
              one — and when it is empty, that is worth reading too. */}
          <Row label={t('lastDrill')}>
            {verification?.checkedAt ? (
              <span
                className={
                  verification.state === 'ok'
                    ? 'text-ok'
                    : verification.state === 'warning'
                      ? 'text-warn'
                      : 'text-danger'
                }
              >
                {t(`drill.${verification.state}`)}
                <span className="ml-2 font-normal text-ink-faint">
                  {format.relativeTime(verification.checkedAt)}
                </span>
              </span>
            ) : (
              <span className="text-warn">{t('drill.never')}</span>
            )}
          </Row>

          {/* The check nobody thinks to run, reported whether or not it found
              anything: the radiographs and the records are backed up by
              different mechanisms and fail independently. */}
          {verification ? (
            <Row label={t('fileCheck')}>
              {verification.files.missing > 0 ? (
                <span className="text-danger">
                  {t('filesMissing', { count: verification.files.missing })}
                </span>
              ) : (
                <span className="text-ok">
                  {t('filesAllPresent', { count: verification.files.expected })}
                </span>
              )}
            </Row>
          ) : null}
        </dl>

        {verification && verification.files.missing > 0 ? (
          <div className="mt-4 rounded-lg border border-danger bg-danger-soft px-3 py-2.5">
            <p className="text-[0.95rem] font-semibold text-danger">
              <TriangleAlert size={17} className="mr-1.5 inline align-text-bottom" aria-hidden />
              {t('filesMissingHint')}
            </p>
            {verification.files.missingSamples.length > 0 ? (
              <ul className="mt-2 font-mono text-[0.85rem] break-all text-danger">
                {verification.files.missingSamples.map((key) => (
                  <li key={key}>{key}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
