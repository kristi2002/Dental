import { FileText, Paperclip, Trash2 } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { ActionForm } from '@/components/ui/ActionForm';
import { deleteRequestAttachment } from '@/lib/actions/requests';
import { formatBytes } from '@/lib/file-constants';

export type RequestAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

/**
 * What a stranger sent with their enquiry.
 *
 * The twin of `FollowUpAttachments`, and it renders the same way for the same
 * reason: images are shown and everything else is named. Somebody who attached
 * an OPG attached it *because it is the thing they want looked at*, and making
 * the desk open three files to find out which one is the panoramic defeats the
 * point of having taken them at all.
 *
 * Every thumbnail goes through `/api/request-files/[id]`, which checks the
 * session and refuses a file that is not on the request named in the query.
 * There is no cheaper URL that works — these live outside `public/` like every
 * other upload in this application, and a radiograph a stranger sent is not less
 * private for having arrived through a public form.
 *
 * **The row says what the file is, not what the sender called it.** `mimeType`
 * is read off the bytes when the request is taken, so a `.pdf` that is really a
 * JPEG shows here as a photograph. The name is still printed — it is often the
 * only clue about which tooth or which clinic it came from — but it is not what
 * anything is decided on.
 */
export async function RequestAttachments({
  requestId,
  attachments,
  canEdit,
}: {
  requestId: string;
  attachments: readonly RequestAttachment[];
  canEdit: boolean;
}) {
  const t = await getTranslations('requests');
  const tc = await getTranslations('common');

  if (attachments.length === 0) return null;

  return (
    <section className="mt-4" aria-labelledby={`files-${requestId}`}>
      <h3
        id={`files-${requestId}`}
        className="flex items-center gap-2 text-[0.95rem] font-bold text-ink"
      >
        <Paperclip size={17} aria-hidden />
        {t('attachments')}
        <span className="text-ink-faint tabular-nums">{attachments.length}</span>
      </h3>

      <ul className="mt-2.5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {attachments.map((file) => {
          // The request rides along: the route refuses a file that is not
          // attached to the one named, so an id on its own is not a way in.
          const href = `/api/request-files/${file.id}?request=${requestId}`;
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
                    <FileText size={34} aria-hidden />
                  </span>
                )}
              </a>

              <div className="flex items-start gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink" title={file.fileName}>
                    {file.fileName}
                  </p>
                  <p className="text-[0.85rem] text-ink-faint">{formatBytes(file.sizeBytes)}</p>
                </div>

                {canEdit ? (
                  <ActionForm
                    action={deleteRequestAttachment}
                    values={{ id: file.id }}
                    confirmMessage={tc('confirmDelete')}
                  >
                    <button type="submit" className="btn btn-ghost btn-sm" title={tc('delete')}>
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
    </section>
  );
}
