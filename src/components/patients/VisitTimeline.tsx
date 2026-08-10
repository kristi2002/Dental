import { NotebookPen, Trash2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ActionForm } from '@/components/ui/ActionForm';
import { deleteVisit } from '@/lib/actions/patients';
import { parseServiceList } from '@/lib/utils';

export type VisitView = {
  id: string;
  /** ISO date string — formatted here with the active locale. */
  visitDate: string;
  notes: string;
  services: string;
  /** Who wrote it. Empty for visits recorded before staff accounts existed. */
  recordedBy: string;
};

export function VisitTimeline({
  visits,
  canDelete = true,
}: {
  visits: VisitView[];
  canDelete?: boolean;
}) {
  const t = useTranslations('patients');
  const tc = useTranslations('common');
  const format = useFormatter();

  if (visits.length === 0) {
    return <EmptyState icon={<NotebookPen size={40} aria-hidden />} title={t('noVisits')} />;
  }

  return (
    <ol className="relative space-y-0">
      {visits.map((visit) => (
        <li
          key={visit.id}
          className="relative border-b border-line px-5 py-4 last:border-b-0"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[1.1rem] font-bold text-ink">
                {format.dateTime(new Date(visit.visitDate), {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
              {visit.recordedBy ? (
                <p className="text-[0.9rem] text-ink-faint">
                  {t('recordedBy', { name: visit.recordedBy })}
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
          </div>

          <p className="mt-1.5 whitespace-pre-line text-[1.02rem] text-ink">{visit.notes}</p>

          {visit.services ? (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {parseServiceList(visit.services).map((service) => (
                <Badge key={service} tone="brand">
                  {service}
                </Badge>
              ))}
            </div>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
