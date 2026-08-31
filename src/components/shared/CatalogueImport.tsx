'use client';

import { CircleAlert, FileSpreadsheet, TriangleAlert, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useId, useState, useTransition, type ReactNode } from 'react';
import { SubmitButton } from '@/components/ui/SubmitButton';
import {
  commitServiceImport,
  commitStockImport,
  findTakenServiceNames,
  findTakenStockKeys,
  type CatalogueOutcome,
} from '@/lib/actions/catalogue-import';
import { IDLE_STATE } from '@/lib/actions/types';
import {
  isCatalogueImportable,
  readServices,
  readStockItems,
  type CatalogueProblem,
  type CatalogueRow,
  type ServiceDraft,
  type StockDraft,
} from '@/lib/catalogue-import';
import { parseCsv } from '@/lib/csv-parse';
import { IMPORT_LIMIT } from '@/lib/patients-import';
import { cn } from '@/lib/utils';

/**
 * Bringing a price list or a storage-room list in.
 *
 * One screen for both, because they are the same screen: choose a file, read
 * every row of it, see what is wrong with each, then press a button that counts
 * what it is about to create. Only the columns differ, and those are described
 * by the `kind` rather than by a second copy of this file.
 *
 * The reasoning behind reading the file in the browser, and behind previewing
 * every row rather than a sample, is the same as `PatientImport` — which this
 * deliberately does not try to share code with. That screen has a duplicate
 * check that turns on phone numbers and a set of problems of its own; folding
 * three importers into one component would mean a component parameterised by
 * everything and readable by nobody.
 */

type Draft = ServiceDraft | StockDraft;

type Stage =
  | { at: 'empty' }
  | { at: 'reading' }
  | { at: 'ready'; name: string; rows: CatalogueRow<Draft>[]; missing: string[] }
  | { at: 'failed'; message: string };

export type CatalogueKind = 'services' | 'stock';

export function CatalogueImport({ kind }: { kind: CatalogueKind }) {
  const t = useTranslations(kind === 'services' ? 'services' : 'stock');
  const ti = useTranslations('imports');
  const tc = useTranslations('common');
  const uid = useId();

  const [stage, setStage] = useState<Stage>({ at: 'empty' });
  const [checking, startChecking] = useTransition();
  const [state, formAction] = useActionState<CatalogueOutcome, FormData>(
    kind === 'services' ? commitServiceImport : commitStockImport,
    IDLE_STATE,
  );

  async function onFile(file: File | undefined) {
    if (!file) return;
    setStage({ at: 'reading' });

    let reading;
    try {
      const grid = parseCsv(await file.text());
      reading = kind === 'services' ? readServices(grid) : readStockItems(grid);
    } catch {
      setStage({ at: 'failed', message: ti('unreadable') });
      return;
    }

    if (reading.rows.length > IMPORT_LIMIT) {
      setStage({ at: 'failed', message: ti('tooMany', { limit: IMPORT_LIMIT }) });
      return;
    }

    if (reading.missing.length > 0) {
      setStage({ at: 'ready', name: file.name, rows: reading.rows, missing: reading.missing });
      return;
    }

    startChecking(async () => {
      let taken: Set<string>;
      try {
        taken = new Set(
          kind === 'services' ? await findTakenServiceNames() : await findTakenStockKeys(),
        );
      } catch {
        // A failed check must not block the import — the commit re-checks every
        // name inside its own transaction and skips what it finds.
        taken = new Set();
      }

      setStage({
        at: 'ready',
        name: file.name,
        missing: reading.missing,
        rows: reading.rows.map((row) => {
          const draft = row.draft as StockDraft;
          const keys = [draft.name, draft.code].filter(Boolean).map((v) => v!.toLocaleLowerCase());
          return keys.some((key) => taken.has(key))
            ? { ...row, problems: [...row.problems, 'alreadyHere' as CatalogueProblem] }
            : row;
        }),
      });
    });
  }

  const rows = stage.at === 'ready' ? stage.rows : [];
  const usable = rows.filter(isCatalogueImportable);
  const done = state.status === 'ok';

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <label htmlFor={`${uid}-file`} className="block text-body font-bold text-ink">
          {ti('choose')}
        </label>
        <p className="mt-1 mb-3 text-body text-ink-soft">
          {kind === 'services' ? ti('chooseServices') : ti('chooseStock')}
        </p>

        <input
          id={`${uid}-file`}
          type="file"
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
          {ti('missingColumns', { columns: tc('name') })}
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
              {ti('summary', { usable: usable.length, total: rows.length })}
            </p>
          </div>

          <div className="max-h-[32rem] overflow-auto">
            <table className="w-full border-collapse text-left text-body">
              <thead className="sticky top-0 bg-surface-soft">
                <tr className="border-b border-line">
                  <Th className="w-12 text-right">#</Th>
                  <Th>{tc('name')}</Th>
                  {kind === 'services' ? (
                    <>
                      <Th>{tc('category')}</Th>
                      <Th className="text-right">{tc('minutes')}</Th>
                    </>
                  ) : (
                    <>
                      <Th>{t('code')}</Th>
                      <Th>{tc('category')}</Th>
                      <Th>{t('supplier')}</Th>
                    </>
                  )}
                  <Th>{ti('problem')}</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const ok = isCatalogueImportable(row);
                  const service = row.draft as ServiceDraft;
                  const item = row.draft as StockDraft;

                  return (
                    <tr
                      key={row.line}
                      className={cn('border-b border-line align-top', !ok && 'bg-danger-soft/40')}
                    >
                      <td className="px-3 py-2 text-right text-ink-faint tabular-nums">
                        {row.line}
                      </td>
                      <td className="px-3 py-2 font-semibold text-ink">{row.draft.name}</td>
                      {kind === 'services' ? (
                        <>
                          <td className="px-3 py-2 text-ink-soft">{service.category ?? ''}</td>
                          <td className="px-3 py-2 text-right text-ink tabular-nums">
                            {service.durationMin}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2 text-ink-soft tabular-nums">{item.code ?? ''}</td>
                          <td className="px-3 py-2 text-ink-soft">{item.category ?? ''}</td>
                          <td className="px-3 py-2 text-ink-soft">{item.supplier ?? ''}</td>
                        </>
                      )}
                      <td className="px-3 py-2">
                        {row.problems.length > 0 ? (
                          <span
                            className={cn(
                              'flex items-start gap-1.5',
                              ok ? 'text-ink-soft' : 'font-semibold text-danger',
                            )}
                          >
                            <TriangleAlert size={15} aria-hidden className="mt-0.5 shrink-0" />
                            {row.problems.map((problem) => ti(PROBLEM_LABEL[problem])).join(' · ')}
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
            <input type="hidden" name="rows" value={JSON.stringify(usable)} />

            <div className="flex flex-wrap items-center justify-end gap-3">
              {state.status === 'error' ? (
                <p role="alert" className="mr-auto font-semibold text-danger">
                  {state.message}
                </p>
              ) : null}

              {done ? (
                <p role="status" className="mr-auto font-semibold text-ok">
                  {ti('done', { created: state.created ?? 0, skipped: state.skipped ?? 0 })}
                </p>
              ) : null}

              {!done && usable.length > 0 ? (
                <SubmitButton
                  label={ti('action', { count: usable.length })}
                  pendingLabel={ti('running')}
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

function Th({ children, className }: { children: ReactNode; className?: string }) {
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

const PROBLEM_LABEL: Record<CatalogueProblem, string> = {
  noName: 'noName',
  badNumber: 'badNumber',
  duplicateInFile: 'duplicateInFile',
  alreadyHere: 'alreadyHere',
  badBarcode: 'badBarcode',
};
