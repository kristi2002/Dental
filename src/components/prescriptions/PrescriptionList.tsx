import { Pill, Printer, Trash2 } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { ActionForm } from '@/components/ui/ActionForm';
import { EmptyState } from '@/components/ui/EmptyState';
import { deletePrescription } from '@/lib/actions/prescriptions';
import { PrescriptionDialog, type TemplateOption } from './PrescriptionDialog';

export type PrescriptionView = {
  id: string;
  body: string;
  issuedBy: string;
  createdAt: string;
};

export function PrescriptionList({
  patientId,
  patientName,
  prescriptions,
  templates,
  canIssue,
  canDelete,
}: {
  patientId: string;
  patientName: string;
  prescriptions: PrescriptionView[];
  templates: TemplateOption[];
  canIssue: boolean;
  canDelete: boolean;
}) {
  const t = useTranslations('prescriptions');
  const tc = useTranslations('common');
  const format = useFormatter();
  // A plain anchor, not next-intl's Link: the sheet opens in its own tab so the
  // print dialog does not take over the record the dentist is working in.
  const locale = useLocale();

  if (prescriptions.length === 0) {
    return (
      <EmptyState
        icon={<Pill size={40} aria-hidden />}
        title={t('empty')}
        action={
          canIssue ? (
            <PrescriptionDialog
              patientId={patientId}
              patientName={patientName}
              templates={templates}
            />
          ) : undefined
        }
      />
    );
  }

  return (
    <ul className="divide-y-2 divide-line">
      {prescriptions.map((prescription) => (
        <li key={prescription.id} className="px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="text-[0.95rem] text-ink-soft">
              {format.dateTime(new Date(prescription.createdAt), {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
              {prescription.issuedBy ? ` · ${prescription.issuedBy}` : ''}
            </p>

            <div className="flex items-center gap-2">
              {/* The browser's own print dialog — the prescription sheet is the
                  page, so there is nothing to generate server-side. */}
              <a
                href={`/${locale}/prescriptions/${prescription.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary btn-sm"
              >
                <Printer size={16} aria-hidden />
                {t('print')}
              </a>

              {canDelete ? (
                <ActionForm
                  action={deletePrescription}
                  values={{ id: prescription.id }}
                  confirmMessage={tc('confirmDelete')}
                >
                  <button type="submit" className="btn btn-danger btn-sm" title={tc('delete')}>
                    <Trash2 size={16} aria-hidden />
                    <span className="sr-only">{tc('delete')}</span>
                  </button>
                </ActionForm>
              ) : null}
            </div>
          </div>

          <p className="mt-2 rounded-lg border border-line bg-surface-soft px-3.5 py-3 text-[1.02rem] whitespace-pre-line text-ink">
            {prescription.body}
          </p>
        </li>
      ))}
    </ul>
  );
}
