import { ShieldAlert, Trash2, TriangleAlert } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { ActionForm } from '@/components/ui/ActionForm';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { deleteAlert } from '@/lib/actions/alerts';
import { cn } from '@/lib/utils';
import { AlertFormDialog } from './AlertFormDialog';

export type AlertView = {
  id: string;
  kind: string;
  substance: string;
  severity: string;
  notes: string;
};

const SEVERITY_STYLE: Record<string, string> = {
  CRITICAL: 'border-danger bg-danger-soft',
  IMPORTANT: 'border-warn bg-warn-soft',
  INFO: 'border-line-strong bg-paper',
};

const SEVERITY_TONE: Record<string, 'danger' | 'warn' | 'neutral'> = {
  CRITICAL: 'danger',
  IMPORTANT: 'warn',
  INFO: 'neutral',
};

/** One line per alert, loudest first — a list nobody has to read in order. */
export async function PatientAlerts({
  patientId,
  alerts,
  canEdit,
}: {
  patientId: string;
  alerts: AlertView[];
  canEdit: boolean;
}) {
  const t = await getTranslations('alerts');
  const tc = await getTranslations('common');

  if (alerts.length === 0) {
    return <EmptyState icon={<ShieldAlert size={40} aria-hidden />} title={t('empty')} />;
  }

  return (
    <ul className="space-y-2 p-4">
      {alerts.map((alert) => (
        <li
          key={alert.id}
          className={cn(
            'flex flex-wrap items-start justify-between gap-x-4 gap-y-2 rounded-lg border px-3.5 py-3',
            SEVERITY_STYLE[alert.severity] ?? SEVERITY_STYLE.INFO,
          )}
        >
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2">
              {alert.severity === 'CRITICAL' ? (
                <TriangleAlert size={18} aria-hidden className="text-danger" />
              ) : null}
              <span className="text-body font-bold text-ink">
                {t(`kind_${alert.kind}`)}
                {alert.substance ? `: ${alert.substance}` : ''}
              </span>
              <Badge tone={SEVERITY_TONE[alert.severity] ?? 'neutral'}>
                {t(`severity_${alert.severity}`)}
              </Badge>
            </p>
            {alert.notes ? (
              <p className="mt-0.5 text-body text-ink-soft">{alert.notes}</p>
            ) : null}
          </div>

          {canEdit ? (
            <div className="flex items-center gap-2">
              <AlertFormDialog patientId={patientId} alert={alert} />
              <ActionForm
                action={deleteAlert}
                values={{ id: alert.id }}
                confirmMessage={tc('confirmDelete')}
              >
                <button type="submit" className="btn btn-danger btn-sm" title={tc('delete')}>
                  <Trash2 size={17} aria-hidden />
                  <span className="sr-only">{tc('delete')}</span>
                </button>
              </ActionForm>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
