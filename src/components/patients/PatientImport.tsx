'use client';

import { CircleAlert, FileSpreadsheet, TriangleAlert, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useId, useState, useTransition } from 'react';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { commitPatientImport, findTakenPhones } from '@/lib/actions/patient-import';
import { IDLE_STATE } from '@/lib/actions/types';
import { parseCsv } from '@/lib/csv-parse';
import { phoneKey } from '@/lib/patient-search';
import {
  IMPORT_LIMIT,
  isImportable,
  readPatients,
  type ImportField,
  type ImportProblem,
  type ImportRow,
} from '@/lib/patients-import';
import { cn } from '@/lib/utils';

/**
 * Bringing a list in, with a good look at it first.
 *
 * The file is read **in the browser**. `patients-import.ts` is pure and runs
 * either side, and a list the practice is only considering importing has no
 * business being uploaded to a server, written to a disk and then possibly
 * abandoned. What crosses the wire is the phone numbers, to ask which are
 * already known, and then — only when somebody presses the button — the drafts.
 *
 * The screen is built around one belief: **nobody should press Import without
 * having seen what it will do.** So the preview is not a sample, it is every
 * row; each row says what is wrong with it if anything; and the button counts
 * what it is about to create rather than saying "Import".
 */

/** Reading a 5 000-row file is fast; saying so beats an empty screen. */
type Stage =
  | { at: 'empty' }
  | { at: 'reading' }
  | { at: 'ready'; name: string; rows: ImportRow[]; missing: ImportField[] }
  | { at: 'failed'; message: string };

export function PatientImport() {
  const t = useTranslations('patients');
  const tc = useTranslations('common');
  const uid = useId();

  const [stage, setStage] = useState<Stage>({ at: 'empty' });
  const [checking, startChecking] = useTransition();
  const [state, formAction] = useActionState(commitPatientImport, IDLE_STATE as never);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setStage({ at: 'reading' });

    let reading;
    try {
      // `File.text()` decodes as UTF-8, which is what this app writes and what
      // any modern Excel produces. A file saved in a legacy Windows codepage
      // arrives with its accents mangled rather than throwing — visibly, in the
      // preview, which is the point of having one.
      reading = readPatients(parseCsv(await file.text()));
    } catch {
      setStage({ at: 'failed', message: t('importUnreadable') });
      return;
    }

    if (reading.rows.length > IMPORT_LIMIT) {
      setStage({ at: 'failed', message: t('importTooMany', { limit: IMPORT_LIMIT }) });
      return;
    }

    // Nothing to check against the practice if the file has no phone column —
    // the rows are all unusable anyway, and the screen is about to say why.
    if (reading.missing.length > 0) {
      setStage({ at: 'ready', name: file.name, rows: reading.rows, missing: reading.missing });
      return;
    }

    startChecking(async () => {
      const phones = reading.rows.map((row) => row.draft.phone).filter(Boolean);
      let taken: Set<string>;
      try {
        taken = new Set(await findTakenPhones(phones));
      } catch {
        // A failed check must not block the import: the commit re-checks every
        // number inside its own transaction, so the worst case is a preview
        // that under-reports duplicates and a commit that skips them anyway.
        taken = new Set();
      }

      setStage({
        at: 'ready',
        name: file.name,
        missing: reading.missing,
        rows: reading.rows.map((row) => {
          const key = phoneKey(row.draft.phone ?? '');
          return key && taken.has(key)
            ? { ...row, problems: [...row.problems, 'alreadyHere' as ImportProblem] }
            : row;
        }),
      });
    });
  }

  const rows = stage.at === 'ready' ? stage.rows : [];
  const usable = rows.filter(isImportable);
  const done = state.status === 'ok';

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <label htmlFor={`${uid}-file`} className="block text-body font-bold text-ink">
          {t('importChoose')}
        </label>
        <p className="mt-1 mb-3 text-body text-ink-soft">{t('importChooseHint')}</p>

        <input
          id={`${uid}-file`}
          type="file"
          // `.txt` because "save as tab-delimited" is a real way people produce
          // these, and the parser sniffs tabs. `.xlsx` is deliberately absent —
          // it is a zip of XML, and Excel's own "Save as CSV" is one menu item.
          accept=".csv,.txt,text/csv,text/plain"
          className="field-input"
          onChange={(event) => void onFile(event.target.files?.[0])}
        />

        {stage.at === 'reading' || checking ? (
          <p className="mt-3 text-body text-ink-soft">{tc('loading')}</p>
        ) : null}

        {stage.at === 'failed' ? (
          <p role="alert" className="mt-3 font-semibold text-danger">
            {stage.message}
          </p>
        ) : null}
      </div>

      {stage.at === 'ready' && stage.missing.length > 0 ? (
        <p role="alert" className="card flex items-start gap-3 p-5 font-semibold text-danger">
          <CircleAlert size={22} aria-hidden className="mt-0.5 shrink-0" />
          {/* Named rather than "the file is invalid": the fix is to add a
              column, and somebody can only do that if they are told which. */}
          {t('importMissingColumns', {
            columns: stage.missing.map((field) => t(COLUMN_LABEL[field])).join(', '),
          })}
        </p>
      ) : null}

      {stage.at === 'ready' && rows.length > 0 ? (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <p className="flex items-center gap-2.5 text-body font-bold text-ink">
              <FileSpreadsheet size={20} aria-hidden className="shrink-0 text-ink-faint" />
              {stage.name}
            </p>
            <p className="text-body text-ink-soft tabular-nums">
              {t('importSummary', { usable: usable.length, total: rows.length })}
            </p>
          </div>

          {/* Every row, not a sample. Scrolled rather than paginated: the whole
              question this screen answers is "what is about to happen", and an
              answer spread over sixty pages is not one. */}
          <div className="max-h-[32rem] overflow-auto">
            <table className="w-full border-collapse text-left text-body">
              <thead className="sticky top-0 bg-surface-soft">
                <tr className="border-b border-line">
                  <Th className="w-12 text-right">#</Th>
                  <Th>{t('lastName')}</Th>
                  <Th>{t('firstName')}</Th>
                  <Th>{t('phone')}</Th>
                  <Th>{t('dateOfBirth')}</Th>
                  <Th>{t('importProblem')}</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const ok = isImportable(row);
                  return (
                    <tr
                      key={row.line}
                      className={cn('border-b border-line align-top', !ok && 'bg-danger-soft/40')}
                    >
                      <td className="px-3 py-2 text-right text-ink-faint tabular-nums">
                        {row.line}
                      </td>
                      <td className="px-3 py-2 font-semibold text-ink">{row.draft.lastName}</td>
                      <td className="px-3 py-2 text-ink">{row.draft.firstName}</td>
                      <td className="px-3 py-2 text-ink tabular-nums">{row.draft.phone}</td>
                      <td className="px-3 py-2 text-ink-soft tabular-nums">
                        {row.draft.dateOfBirth ?? ''}
                      </td>
                      <td className="px-3 py-2">
                        {row.problems.length > 0 ? (
                          <span
                            className={cn(
                              'flex items-start gap-1.5',
                              ok ? 'text-ink-soft' : 'font-semibold text-danger',
                            )}
                          >
                            <TriangleAlert size={15} aria-hidden className="mt-0.5 shrink-0" />
                            {row.problems.map((problem) => t(PROBLEM_LABEL[problem])).join(' · ')}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <form action={formAction} className="border-t border-line px-5 py-4">
            {/* The drafts as one field. Only the importable ones travel — there
                is no reason to post rows the screen has already ruled out, and
                the action re-checks whatever does arrive. */}
            <input type="hidden" name="rows" value={JSON.stringify(usable)} />

            <div className="flex flex-wrap items-center justify-end gap-3">
              {state.status === 'error' ? (
                <p role="alert" className="mr-auto font-semibold text-danger">
                  {state.message}
                </p>
              ) : null}

              {done ? (
                <p role="status" className="mr-auto font-semibold text-ok">
                  {t('importDone', {
                    created: state.created ?? 0,
                    skipped: state.skipped ?? 0,
                  })}
                </p>
              ) : null}

              {/* Counts what it is about to do. "Import" alone is a button
                  somebody presses without having read the table above it. */}
              {!done && usable.length > 0 ? (
                <SubmitButton
                  label={t('importAction', { count: usable.length })}
                  pendingLabel={t('importRunning')}
                  icon={<Upload size={19} aria-hidden />}
                />
              ) : null}
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        'px-3 py-2 text-caption font-bold tracking-wide text-ink-faint uppercase',
        className,
      )}
    >
      {children}
    </th>
  );
}

/** Column names, borrowed from the labels the patient form already uses. */
const COLUMN_LABEL: Record<ImportField, string> = {
  firstName: 'firstName',
  lastName: 'lastName',
  phone: 'phone',
  email: 'email',
  dateOfBirth: 'dateOfBirth',
  address: 'address',
  fiscalCode: 'fiscalCode',
  guardianName: 'guardianName',
  guardianPhone: 'guardianPhone',
  emergencyContact: 'emergencyContact',
  referralSource: 'referralSource',
};

const PROBLEM_LABEL: Record<ImportProblem, string> = {
  noName: 'importNoName',
  noPhone: 'importNoPhone',
  badDate: 'importBadDate',
  duplicateInFile: 'importDuplicateInFile',
  alreadyHere: 'importAlreadyHere',
};
