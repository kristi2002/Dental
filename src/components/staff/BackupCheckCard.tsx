'use client';

import { FileCheck2, Info, ShieldQuestion } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useId } from 'react';
import { useDateNames } from '@/components/shared/DateNamesProvider';
import { Card, CardHeader } from '@/components/ui/Card';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { checkBackup, type CheckState } from '@/lib/actions/backup-check';
import { IDLE_STATE } from '@/lib/actions/types';
import type { BackupNote } from '@/lib/backup-inspect';

/**
 * Opening a backup to see whether it is any good.
 *
 * Sits directly under the card that makes them, because it answers the question
 * that card leaves hanging: the file downloaded, and then what? The specific
 * failure this exists for is a passphrase typed once and misremembered later,
 * which is discovered — under every other arrangement — on the one day it
 * cannot be fixed.
 *
 * Deliberately not a restore. The reasoning is in `backup-inspect.ts`; the
 * short version is that the only safe restore is into an empty database, and
 * this app is by definition connected to a full one.
 */
export function BackupCheckCard() {
  const t = useTranslations('backup');
  const tc = useTranslations('common');
  // `toLocaleString()` with no argument formats in whatever locale the *browser*
  // defaults to, which on an Albanian page is usually not Albanian — and differs
  // from the locale Node used to render the same number on the server. See
  // `lib/date-names.ts`.
  const dates = useDateNames();
  const uid = useId();

  const [state, formAction] = useActionState<CheckState, FormData>(checkBackup, IDLE_STATE);
  const report = state.status === 'ok' ? state.report : undefined;

  return (
    <Card>
      <CardHeader title={t('checkTitle')} icon={<ShieldQuestion size={22} aria-hidden />} />

      <form action={formAction} className="space-y-4 p-5">
        <p className="text-body text-ink-soft">{t('checkDescription')}</p>

        <div className="max-w-md">
          <label className="field-label" htmlFor={`${uid}-file`}>
            {t('checkFile')}
          </label>
          <input
            id={`${uid}-file`}
            name="file"
            type="file"
            // Both shapes the export writes, and `*` besides: a file that has
            // been through a mail client arrives named anything at all, and the
            // action decides what it is from its bytes rather than its name.
            accept=".json,.enc,application/json,application/octet-stream,*"
            className="field-input"
          />
        </div>

        <div className="max-w-md">
          <label className="field-label" htmlFor={`${uid}-check-passphrase`}>
            {t('passphrase')}
            <span className="ml-1.5 font-normal text-ink-faint">({tc('optional')})</span>
          </label>
          <p className="mb-1.5 text-meta text-ink-soft">{t('checkPassphraseHint')}</p>
          <input
            id={`${uid}-check-passphrase`}
            name="passphrase"
            type="password"
            autoComplete="off"
            className="field-input"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton
            label={t('checkAction')}
            pendingLabel={t('checkRunning')}
            variant="secondary"
            icon={<FileCheck2 size={19} aria-hidden />}
          />
          {state.status === 'error' ? (
            <p role="alert" className="font-semibold text-danger">
              {state.message}
            </p>
          ) : null}
        </div>
      </form>

      {report ? (
        <div className="border-t border-line px-5 py-5">
          <p className="text-body font-bold text-ok">{t('checkGood')}</p>

          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body">
            <dt className="font-bold text-ink-faint">{t('checkTaken')}</dt>
            <dd className="text-ink tabular-nums">
              {/* As written in the file, not reformatted: this is the one fact
                  somebody is checking against their own memory of when they
                  last took a copy. */}
              {report.exportedAt?.replace('T', ' ').slice(0, 16) ?? '—'}
              {report.exportedBy ? ` · ${report.exportedBy}` : ''}
            </dd>

            <dt className="font-bold text-ink-faint">{t('checkEncrypted')}</dt>
            <dd className="text-ink">{report.encrypted ? tc('yes') : tc('no')}</dd>

            <dt className="font-bold text-ink-faint">{t('checkRows')}</dt>
            <dd className="text-ink tabular-nums">{dates.count(report.totalRows)}</dd>
          </dl>

          {/* Table by table, because "it decrypted" is not the same as "the
              practice is in it" — a backup taken against a fresh database
              decrypts perfectly and contains nobody. */}
          <ul className="mt-4 grid gap-x-6 gap-y-1 text-body sm:grid-cols-2">
            {report.tables
              .filter((row) => row.rows > 0)
              .map((row) => (
                <li key={row.table} className="flex justify-between gap-3 border-b border-line py-1">
                  <span className="text-ink-soft">{row.table}</span>
                  <span className="font-semibold text-ink tabular-nums">
                    {dates.count(row.rows)}
                  </span>
                </li>
              ))}
          </ul>

          {report.notes.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {report.notes.map((note) => (
                <li
                  key={note}
                  className="flex items-start gap-2.5 text-body text-ink-soft"
                >
                  <Info size={17} aria-hidden className="mt-0.5 shrink-0 text-ink-faint" />
                  {t(NOTE_LABEL[note])}
                </li>
              ))}
            </ul>
          ) : null}

          {/* Said here rather than left to be discovered: this screen proves a
              file, and the way back from it is a script and an empty database. */}
          <p className="mt-4 text-body text-ink-faint">{t('checkRestoreNote')}</p>
        </div>
      ) : null}
    </Card>
  );
}

const NOTE_LABEL: Record<BackupNote, string> = {
  noPatients: 'checkNoPatients',
  newerVersion: 'checkNewerVersion',
  auditTruncated: 'checkAuditTruncated',
  excludesPinsAndFiles: 'checkExcludes',
};
