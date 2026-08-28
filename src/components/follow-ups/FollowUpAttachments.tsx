import { FileText, Paperclip, Trash2 } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import { ActionForm } from '@/components/ui/ActionForm';
import { deleteFollowUpAttachment } from '@/lib/actions/follow-ups';
import { formatBytes } from '@/lib/file-constants';
import type { FollowUpDetail } from '@/lib/queries';
import { FollowUpUploadDialog } from './FollowUpUploadDialog';

/**
 * What is pinned to one follow-up.
 *
 * Images are shown, everything else is named — the photograph of a cracked
 * casting is the whole reason somebody attached it, and making them open it to
 * find out which one it was defeats the point. PDFs and the rest get a row with
 * a filename and a size, because there is nothing to show until it is opened.
 *
 * Every thumbnail is the authenticated route, not a public path: see
 * `/api/follow-up-files/[id]`. There is no cheaper URL that works, which is
 * deliberate.
 */
export async function FollowUpAttachments({
  followUpId,
  attachments,
  canEdit,
}: {
  followUpId: string;
  attachments: FollowUpDetail['attachments'];
  canEdit: boolean;
}) {
  const t = await getTranslations('followUps');
  const tc = await getTranslations('common');
  const format = await getFormatter();

  return (
    <section aria-labelledby="follow-up-files">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2
          id="follow-up-files"
          className="flex items-center gap-2 text-lg font-bold text-ink"
        >
          <Paperclip size={19} aria-hidden />
          {t('attachments')}
          {attachments.length > 0 ? (
            <span className="text-ink-faint tabular-nums">{attachments.length}</span>
          ) : null}
        </h2>
        {canEdit ? <FollowUpUploadDialog followUpId={followUpId} /> : null}
      </div>

      {attachments.length === 0 ? (
        <p className="text-[0.95rem] text-ink-soft">{t('attachmentsEmpty')}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {attachments.map((file) => {
            // The follow-up rides along: the route refuses a file that is not
            // pinned to the one named, so an id on its own is not a way in.
            const href = `/api/follow-up-files/${file.id}?followUp=${followUpId}`;
            const isImage = file.mimeType.startsWith('image/');

            return (
              <li key={file.id} className="card overflow-hidden p-0">
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                  title={file.fileName}
                >
                  {isImage ? (
                    // The route is session-gated and streams from a private
                    // volume, which the image optimiser cannot reach — the same
                    // reason `DocumentGallery` renders a bare `img`.
                    // eslint-disable-next-line next/no-img-element, @next/next/no-img-element
                    <img
                      src={href}
                      alt={file.fileName}
                      className="aspect-4/3 w-full bg-surface-sunken object-cover"
                    />
                  ) : (
                    <span className="grid aspect-4/3 w-full place-items-center bg-surface-sunken text-ink-faint">
                      <FileText size={38} aria-hidden />
                    </span>
                  )}
                </a>

                <div className="flex items-start gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink" title={file.fileName}>
                      {file.fileName}
                    </p>
                    <p className="text-[0.85rem] text-ink-faint">
                      {formatBytes(file.sizeBytes)}
                      <span aria-hidden> · </span>
                      {format.dateTime(file.createdAt, { day: 'numeric', month: 'short' })}
                      {file.uploadedBy ? (
                        <>
                          <span aria-hidden> · </span>
                          {file.uploadedBy.firstName}
                        </>
                      ) : null}
                    </p>
                  </div>

                  {canEdit ? (
                    <ActionForm
                      action={deleteFollowUpAttachment}
                      values={{ id: file.id }}
                      confirmMessage={tc('confirmDelete')}
                    >
                      <button
                        type="submit"
                        className="btn btn-ghost btn-sm"
                        title={tc('delete')}
                      >
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
      )}
    </section>
  );
}
