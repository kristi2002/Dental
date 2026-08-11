import { Check, FlaskConical, Trash2 } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import { ActionForm } from '@/components/ui/ActionForm';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { deleteLabCase, markLabCaseReceived } from '@/lib/actions/lab';
import { today } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { LabCaseFormDialog } from './LabCaseFormDialog';

export type LabCaseView = {
  id: string;
  labName: string;
  kind: string;
  teeth: string;
  status: string;
  /** `YYYY-MM-DD` */
  sentAt: string;
  dueAt: string;
  receivedAt: string;
  notes: string;
  /** Only set on the dashboard list, where several patients are mixed together. */
  patientName?: string;
  patientId?: string;
};

const STATUS_TONE: Record<string, 'brand' | 'ok' | 'neutral' | 'warn'> = {
  SENT: 'brand',
  RECEIVED: 'ok',
  FITTED: 'neutral',
  CANCELLED: 'neutral',
};

export async function LabCaseList({
  cases,
  patientId,
  labNames,
  canEdit,
  canDelete,
}: {
  cases: LabCaseView[];
  /** Set on a patient's own tab, where the edit dialog knows whose it is. */
  patientId?: string;
  labNames: string[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const t = await getTranslations('lab');
  const tc = await getTranslations('common');
  const format = await getFormatter();

  if (cases.length === 0) {
    return <EmptyState icon={<FlaskConical size={40} aria-hidden />} title={t('empty')} />;
  }

  const now = today();
  const day = (value: string) =>
    format.dateTime(new Date(`${value}T00:00:00.000Z`), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  return (
    <ul className="divide-y divide-line">
      {cases.map((labCase) => {
        // Late only matters while it is still outstanding — a case that came
        // back a day after it was promised is not a problem any more.
        const overdue =
          labCase.status === 'SENT' &&
          labCase.dueAt !== '' &&
          new Date(`${labCase.dueAt}T00:00:00.000Z`) < now;

        return (
          <li
            key={labCase.id}
            className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 py-3.5"
          >
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2">
                <span className="text-[1.08rem] font-bold text-ink">{labCase.kind}</span>
                {labCase.teeth ? (
                  <span className="text-[0.95rem] text-ink-soft tabular-nums">
                    {t('teethShort', { teeth: labCase.teeth })}
                  </span>
                ) : null}
                <Badge tone={STATUS_TONE[labCase.status] ?? 'neutral'}>
                  {t(`status_${labCase.status}`)}
                </Badge>
                {overdue ? <Badge tone="danger">{t('overdue')}</Badge> : null}
              </p>

              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[0.93rem] text-ink-soft">
                {labCase.patientName ? (
                  <span className="font-semibold text-ink">{labCase.patientName}</span>
                ) : null}
                <span>{labCase.labName}</span>
                <span className={cn('tabular-nums', overdue && 'font-bold text-danger')}>
                  {labCase.receivedAt
                    ? t('receivedOn', { date: day(labCase.receivedAt) })
                    : labCase.dueAt
                      ? t('dueOn', { date: day(labCase.dueAt) })
                      : t('sentOn', { date: day(labCase.sentAt) })}
                </span>
              </p>

              {labCase.notes ? (
                <p className="mt-0.5 text-[0.93rem] text-ink-faint">{labCase.notes}</p>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              {canEdit && labCase.status === 'SENT' ? (
                <ActionForm action={markLabCaseReceived} values={{ id: labCase.id }}>
                  <button type="submit" className="btn btn-secondary btn-sm" title={t('markReceived')}>
                    <Check size={17} aria-hidden />
                    {t('markReceived')}
                  </button>
                </ActionForm>
              ) : null}

              {canEdit && (patientId ?? labCase.patientId) ? (
                <LabCaseFormDialog
                  patientId={(patientId ?? labCase.patientId)!}
                  labNames={labNames}
                  today={labCase.sentAt}
                  labCase={{
                    id: labCase.id,
                    labName: labCase.labName,
                    kind: labCase.kind,
                    teeth: labCase.teeth,
                    status: labCase.status,
                    sentAt: labCase.sentAt,
                    dueAt: labCase.dueAt,
                    notes: labCase.notes,
                  }}
                />
              ) : null}

              {canDelete ? (
                <ActionForm
                  action={deleteLabCase}
                  values={{ id: labCase.id }}
                  confirmMessage={tc('confirmDelete')}
                >
                  <button type="submit" className="btn btn-danger btn-sm" title={tc('delete')}>
                    <Trash2 size={17} aria-hidden />
                    <span className="sr-only">{tc('delete')}</span>
                  </button>
                </ActionForm>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
