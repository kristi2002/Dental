import { FileText, Images, Trash2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { ActionForm } from '@/components/ui/ActionForm';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { DocumentKind } from '@/generated/prisma/enums';
import { deleteDocument } from '@/lib/actions/documents';
import { formatBytes } from '@/lib/file-constants';
import { DocumentUploadDialog } from './DocumentUploadDialog';

export type DocumentView = {
  id: string;
  kind: DocumentKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  toothNum: number | null;
  notes: string;
  uploadedBy: string;
  createdAt: string;
};

const KIND_TONES: Record<DocumentKind, BadgeTone> = {
  [DocumentKind.XRAY]: 'brand',
  [DocumentKind.PHOTO]: 'ok',
  [DocumentKind.CONSENT]: 'warn',
  // The two ID faces are normally owned by the details tab, so they reach this
  // grid only in the view that shows everything on file.
  [DocumentKind.ID_FRONT]: 'neutral',
  [DocumentKind.ID_BACK]: 'neutral',
  [DocumentKind.OTHER]: 'neutral',
};

export function DocumentGallery({
  patientId,
  documents,
  canUpload,
  canDelete,
}: {
  patientId: string;
  documents: DocumentView[];
  canUpload: boolean;
  canDelete: boolean;
}) {
  const t = useTranslations('documents');
  const tc = useTranslations('common');
  const tt = useTranslations('teeth');
  const format = useFormatter();

  if (documents.length === 0) {
    return (
      <EmptyState
        icon={<Images size={40} aria-hidden />}
        title={t('empty')}
        action={canUpload ? <DocumentUploadDialog patientId={patientId} /> : undefined}
      />
    );
  }

  return (
    <div className="p-5">
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {documents.map((document) => {
          const isImage = document.mimeType.startsWith('image/');
          // Always through the authenticated route — never a direct file path.
          // The patient rides along because the route checks the file belongs to
          // the record it is being asked for from (G-28), not merely that the
          // reader may see files.
          const href = `/api/documents/${document.id}?patient=${patientId}`;

          return (
            <li
              key={document.id}
              className="flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-line-strong bg-surface"
            >
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="grid h-40 place-items-center overflow-hidden bg-paper no-underline"
              >
                {isImage ? (
                  // An authenticated route, not a static asset: the optimiser
                  // cannot fetch it, so `next/image` has nothing to work with.
                  // eslint-disable-next-line next/no-img-element, @next/next/no-img-element
                  <img
                    src={href}
                    alt={document.notes || document.fileName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex flex-col items-center gap-2 text-ink-soft">
                    <FileText size={40} aria-hidden />
                    <span className="text-[0.9rem] font-semibold">PDF</span>
                  </span>
                )}
              </a>

              <div className="flex flex-1 flex-col gap-1.5 p-3">
                <p className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={KIND_TONES[document.kind]}>{t(`kind_${document.kind}`)}</Badge>
                  {document.toothNum ? (
                    <Badge>{tt('tooth', { num: document.toothNum })}</Badge>
                  ) : null}
                </p>

                <p className="truncate text-[1rem] font-bold text-ink" title={document.fileName}>
                  {document.fileName}
                </p>
                {document.notes ? (
                  <p className="text-[0.9rem] text-ink-soft">{document.notes}</p>
                ) : null}

                <p className="mt-auto text-[0.85rem] text-ink-faint">
                  {format.dateTime(new Date(document.createdAt), {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                  {' · '}
                  {formatBytes(document.sizeBytes)}
                  {document.uploadedBy ? ` · ${document.uploadedBy}` : ''}
                </p>

                {canDelete ? (
                  <ActionForm
                    action={deleteDocument}
                    values={{ id: document.id }}
                    confirmMessage={tc('confirmDelete')}
                    className="mt-1"
                  >
                    <button type="submit" className="btn btn-danger btn-sm" title={tc('delete')}>
                      <Trash2 size={16} aria-hidden />
                      <span className="sr-only">{tc('delete')}</span>
                    </button>
                  </ActionForm>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
