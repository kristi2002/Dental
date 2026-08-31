import { NotebookPen, Package, Pill, Stethoscope, Trash2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { ToothDefs } from '@/components/dental/ToothDefsProvider';
import { ToothGlyph } from '@/components/dental/ToothGlyph';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ActionForm } from '@/components/ui/ActionForm';
import { deleteVisit } from '@/lib/actions/patients';
import {
  DEFAULT_TOOTH_STATUS,
  isToothStatus,
  parseSurfaces,
  toothLabel as toothLabelFor,
  type ToothNumbering,
  type ToothStatus,
} from '@/lib/teeth';
import { cn, initials } from '@/lib/utils';

/**
 * What happened, when, and what it cost the practice — as a timeline rather
 * than as a stack of paragraphs.
 *
 * Every one of the extra facts here was already in the database and none of it
 * was on this screen. `ToothRecord.visitRecordId` said which teeth were charted
 * during a visit; `StockMovement.visitRecordId` said what was consumed by it;
 * `VisitService` said which catalogue treatments were performed, as rows, while
 * the timeline rendered the free-text sentence beside them. A visit that read
 * "filling, upper left" now shows the tooth it was on, drawn in the state it was
 * left in, the composite that came off the shelf for it, and the prescription
 * written on the way out.
 */

export type VisitToothView = {
  toothNum: number;
  status: string;
  surfaces: string;
  notes: string;
};

export type VisitView = {
  id: string;
  /** ISO date string — formatted here with the active locale. */
  visitDate: string;
  notes: string;
  /** The sentence as typed. Used only where there are no catalogue rows. */
  services: string;
  /** The treatments performed, as rows. Empty for visits predating them. */
  performed: Array<{ id: string; name: string; fromCatalog: boolean }>;
  /** Teeth charted during this visit. */
  teeth: VisitToothView[];
  /** What the visit consumed, already aggregated per material. */
  materials: Array<{ name: string; quantity: number }>;
  /** Prescriptions written the same day. */
  prescriptions: Array<{ id: string; body: string }>;
  /** Who wrote it. Empty for visits recorded before staff accounts existed. */
  recordedBy: string;
  /** Who did the treatment. Only shown when it differs from who wrote it. */
  performedBy: string;
};

function statusOf(value: string): ToothStatus {
  return isToothStatus(value) ? value : 'HEALTHY';
}

export function VisitTimeline({
  visits,
  canDelete = true,
  numbering = 'FDI',
  /** Rendered on the server, so "3 months ago" is stable rather than drifting
   *  between the markup and the hydrated page. */
  now,
}: {
  visits: VisitView[];
  canDelete?: boolean;
  numbering?: ToothNumbering;
  now: string;
}) {
  const t = useTranslations('patients');
  const tc = useTranslations('common');
  const tt = useTranslations('teeth');
  const tp = useTranslations('prescriptions');
  // The shelf is counted in boxes; the word lives with the storage room's strings.
  const tstock = useTranslations('stock');
  const format = useFormatter();
  const reference = new Date(now);

  if (visits.length === 0) {
    return <EmptyState icon={<NotebookPen size={40} aria-hidden />} title={t('noVisits')} />;
  }

  return (
    <div className="p-5">
      <ToothDefs />
      <ol className="relative space-y-4">
        {visits.map((visit, index) => {
          const date = new Date(visit.visitDate);
          const last = index === visits.length - 1;

          return (
            <li key={visit.id} className="relative pl-16">
              {/* The rail. Stops at the last entry rather than running into the
                  padding, so the line reads as "and before that" and not as an
                  unfinished list. */}
              {last ? null : (
                <span
                  aria-hidden
                  className="absolute top-14 bottom-[-1rem] left-[1.65rem] w-0.5 bg-line"
                />
              )}

              {/* The date as a torn-off calendar leaf: the day is what somebody
                  scanning a history is matching against, so it is the biggest
                  thing in the node. */}
              <span
                aria-hidden
                className="absolute top-0 left-0 flex h-14 w-14 flex-col items-center justify-center rounded-xl border border-line-strong bg-surface shadow-card"
              >
                <span className="text-title leading-none font-bold text-ink tabular-nums">
                  {format.dateTime(date, { day: 'numeric' })}
                </span>
                <span className="text-micro font-bold tracking-wide text-ink-faint uppercase">
                  {format.dateTime(date, { month: 'short' })}
                </span>
              </span>

              <article className="rounded-[var(--radius-card)] border border-line bg-surface-soft px-4 py-3.5">
                <header className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-body font-bold text-ink">
                      {format.dateTime(date, {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                      <span className="ml-2 text-meta font-normal text-ink-faint">
                        {format.relativeTime(date, reference)}
                      </span>
                    </p>

                    {/* Naming both only when they differ: "recorded by X, treated
                        by X" is noise on every line of a solo practice's
                        history. The initials give the row a face at a glance. */}
                    {visit.performedBy || visit.recordedBy ? (
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-meta text-ink-soft">
                        <Initial name={visit.performedBy || visit.recordedBy} />
                        {visit.performedBy && visit.performedBy !== visit.recordedBy
                          ? t('treatedBy', { name: visit.performedBy })
                          : null}
                        {visit.recordedBy &&
                        (!visit.performedBy || visit.performedBy === visit.recordedBy)
                          ? t('recordedBy', { name: visit.recordedBy })
                          : null}
                        {visit.performedBy &&
                        visit.recordedBy &&
                        visit.performedBy !== visit.recordedBy
                          ? ` · ${t('recordedBy', { name: visit.recordedBy })}`
                          : null}
                      </p>
                    ) : null}
                  </div>

                  {canDelete ? (
                    <ActionForm
                      action={deleteVisit}
                      values={{ id: visit.id }}
                      confirmMessage={tc('confirmDelete')}
                    >
                      <button type="submit" className="btn btn-danger btn-sm" title={tc('delete')}>
                        <Trash2 size={17} aria-hidden />
                        <span className="sr-only">{tc('delete')}</span>
                      </button>
                    </ActionForm>
                  ) : null}
                </header>

                <p className="mt-2 text-body whitespace-pre-line text-ink">{visit.notes}</p>

                {visit.performed.length > 0 ? (
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <Stethoscope size={15} aria-hidden className="text-brand" />
                    {visit.performed.map((service) => (
                      <Badge key={service.id} tone={service.fromCatalog ? 'brand' : 'neutral'}>
                        {service.name}
                      </Badge>
                    ))}
                  </div>
                ) : null}

                {/* The teeth this visit actually changed, drawn as they were
                    left. This is the whole difference between a note and a
                    record: "filling on the upper left" versus the tooth. */}
                {visit.teeth.length > 0 ? (
                  <div className="mt-3 rounded-lg border border-line bg-surface px-3 py-2.5">
                    <p className="mb-1.5 text-caption font-bold tracking-wide text-ink-faint uppercase">
                      {t('visitTeeth')}
                    </p>
                    <ul className="flex flex-wrap gap-3">
                      {visit.teeth.map((tooth) => {
                        const status = statusOf(tooth.status);
                        return (
                          <li
                            key={tooth.toothNum}
                            className="flex w-14 flex-col items-center"
                            title={tooth.notes || undefined}
                          >
                            <span aria-hidden className="h-14 w-9">
                              {/* What this visit charted on the tooth, which
                                  is one finding per row here — the timeline
                                  lists them individually rather than showing
                                  the tooth's whole state at a moment. */}
                              <ToothGlyph
                                toothNum={tooth.toothNum}
                                findings={
                                  status === DEFAULT_TOOTH_STATUS
                                    ? []
                                    : [{ status, surfaces: tooth.surfaces ?? '' }]
                                }
                              />
                            </span>
                            <span className="text-center text-caption leading-tight font-bold text-ink tabular-nums">
                              {toothLabelFor(tooth.toothNum, numbering)}
                            </span>
                            <span className="text-center text-micro leading-tight text-ink-soft">
                              {tt(`status_${status}`)}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}

                {(visit.materials.length > 0 || visit.prescriptions.length > 0) && (
                  <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-2">
                    {visit.materials.length > 0 ? (
                      <p className="flex flex-wrap items-center gap-1.5 text-meta text-ink-soft">
                        <Package size={15} aria-hidden className="text-ink-faint" />
                        {visit.materials.map((material) => (
                          <span key={material.name} className="font-semibold">
                            {material.name} ×{material.quantity}{' '}
                            {tstock('boxes', { count: material.quantity })}
                          </span>
                        ))}
                      </p>
                    ) : null}

                    {/* Written on the way out, so it belongs to the visit even
                        though nothing in the schema ties the two together. */}
                    {visit.prescriptions.length > 0 ? (
                      <p className="flex items-center gap-1.5 text-meta text-ink-soft">
                        <Pill size={15} aria-hidden className="text-ink-faint" />
                        <span className="font-semibold">
                          {tp('issuedCount', { count: visit.prescriptions.length })}
                        </span>
                      </p>
                    ) : null}
                  </div>
                )}
              </article>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Initial({ name }: { name: string }) {
  const [first = '', last = ''] = name.split(' ');
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-6 shrink-0 place-items-center rounded-full',
        'bg-brand-soft text-micro font-bold text-brand-deep',
      )}
    >
      {initials(first, last)}
    </span>
  );
}
