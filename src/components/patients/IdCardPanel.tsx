'use client';

import { Camera, IdCard, RefreshCw, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useId, useRef } from 'react';
import { deleteDocument, saveIdDocument } from '@/lib/actions/documents';
import { IDLE_STATE } from '@/lib/actions/types';
import { cn } from '@/lib/utils';

/**
 * The patient's identity card, shown as an identity card.
 *
 * The two faces were reachable before only as two rows in the file list, named
 * whatever the phone called them — `IMG_4471.jpg` — which is not something
 * anybody can check a name and a date of birth against. So they are lifted out
 * and drawn at the real proportions of an ID (85.6 × 54 mm), front beside back,
 * and the empty state is the same shape as the filled one: a slot, not a form.
 *
 * Choosing a file submits it. There is no second press, because there is no
 * second decision to make — the slot says which side it is, and the file is the
 * whole answer.
 */
export type IdSide = {
  /** Set when this face has been captured. */
  documentId?: string;
  mimeType?: string;
};

export function IdCardPanel({
  patientId,
  front,
  back,
  canEdit,
  canDelete,
}: {
  patientId: string;
  front?: IdSide;
  back?: IdSide;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const t = useTranslations('documents');

  return (
    <div className="grid gap-4 p-5 sm:grid-cols-2">
      <IdSlot
        patientId={patientId}
        side="FRONT"
        label={t('idFront')}
        captured={front}
        canEdit={canEdit}
        canDelete={canDelete}
      />
      <IdSlot
        patientId={patientId}
        side="BACK"
        label={t('idBack')}
        captured={back}
        canEdit={canEdit}
        canDelete={canDelete}
      />
    </div>
  );
}

function IdSlot({
  patientId,
  side,
  label,
  captured,
  canEdit,
  canDelete,
}: {
  patientId: string;
  side: 'FRONT' | 'BACK';
  label: string;
  captured?: IdSide;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const t = useTranslations('documents');
  const tc = useTranslations('common');
  const uid = useId();

  const [state, formAction] = useActionState(saveIdDocument, IDLE_STATE);
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const handledTs = useRef<number | undefined>(undefined);

  // A refused upload leaves the file in the input, so choosing the *same*
  // corrected file again would not fire `change`. Clearing it makes the retry
  // work the way the person expects it to.
  useEffect(() => {
    if (state.status !== 'error' || state.ts === handledTs.current) return;
    handledTs.current = state.ts;
    if (inputRef.current) inputRef.current.value = '';
  }, [state]);

  const href = captured?.documentId ? `/api/documents/${captured.documentId}` : null;

  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-[0.85rem] font-bold tracking-wide text-ink-faint uppercase">
        <IdCard size={15} aria-hidden />
        {label}
      </p>

      <div
        className={cn(
          'group relative overflow-hidden rounded-xl border-2 bg-paper',
          // The real proportions of an ID-1 card. A square slot with a card in
          // it reads as a photo of a card; this reads as the card.
          'aspect-[1.586/1]',
          href ? 'border-line-strong' : 'border-dashed border-line-strong',
        )}
      >
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="block h-full w-full">
            {/* eslint-disable-next-line @next/next/no-img-element -- authenticated
                route, not a static asset: the optimiser cannot fetch it. */}
            <img src={href} alt={label} className="h-full w-full object-cover" />
          </a>
        ) : (
          <label
            htmlFor={`${uid}-file`}
            className={cn(
              'flex h-full w-full flex-col items-center justify-center gap-2 text-ink-faint',
              canEdit ? 'cursor-pointer hover:bg-brand-soft/50 hover:text-brand-deep' : '',
            )}
          >
            <Camera size={30} aria-hidden />
            <span className="text-[0.95rem] font-semibold">
              {canEdit ? t('idAdd') : t('idMissing')}
            </span>
          </label>
        )}

        {canEdit && href ? (
          // Only over the picture, and only on hover or focus — the card is the
          // content, and two buttons parked on top of it permanently would be
          // the loudest thing in the panel.
          <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1.5 bg-gradient-to-t from-ink/70 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <label
              htmlFor={`${uid}-file`}
              title={t('idReplace')}
              className="btn btn-secondary btn-sm cursor-pointer"
            >
              <RefreshCw size={15} aria-hidden />
              <span className="sr-only">{t('idReplace')}</span>
            </label>

            {canDelete ? (
              <form action={deleteDocument}>
                <input type="hidden" name="id" value={captured!.documentId} />
                <button type="submit" className="btn btn-danger btn-sm" title={tc('delete')}>
                  <Trash2 size={15} aria-hidden />
                  <span className="sr-only">{tc('delete')}</span>
                </button>
              </form>
            ) : null}
          </div>
        ) : null}
      </div>

      {canEdit ? (
        <form ref={formRef} action={formAction}>
          <input type="hidden" name="patientId" value={patientId} />
          <input type="hidden" name="side" value={side} />
          <input
            ref={inputRef}
            id={`${uid}-file`}
            name="file"
            type="file"
            // Images only, and the phone offers its camera alongside the
            // gallery — the ID is usually on the desk, but sometimes it was
            // already photographed.
            accept="image/*"
            className="sr-only"
            onChange={(event) => {
              if (event.currentTarget.files?.length) formRef.current?.requestSubmit();
            }}
          />
        </form>
      ) : null}

      {state.status === 'error' ? (
        <p role="alert" className="mt-1.5 text-[0.9rem] font-semibold text-danger">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
