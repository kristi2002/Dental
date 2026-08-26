'use client';

import { Link2, Link2Off, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';
import { PatientPicker } from '@/components/patients/PatientPicker';
import { ActionForm } from '@/components/ui/ActionForm';
import { linkThreadToPatient } from '@/lib/actions/inbox';

/**
 * Say which patient a thread is about.
 *
 * The commonest job in the inbox after reading it. A stranger writes from an
 * address nobody had on file — a new patient, a spouse using their own mailbox,
 * somebody who changed provider — and until the thread is attached it is not on
 * anybody's record.
 *
 * **It attaches the thread and does not touch the patient.** The obvious extra
 * kindness would be writing the address onto `Patient.email` while we are here,
 * and it is the wrong thing to do from this screen: the record has an editor,
 * that editor asks about consent and preferred channel alongside the address,
 * and a thread view quietly overwriting a contact detail is exactly the sort of
 * invisible edit somebody later cannot account for.
 */
export function LinkThreadDialog({
  threadId,
  linked,
}: {
  threadId: string;
  /** Who it is already attached to, when it is attached to anybody. */
  linked: { id: string; name: string } | null;
}) {
  const t = useTranslations('inbox');
  const tc = useTranslations('common');
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => dialogRef.current?.showModal()}
      >
        <Link2 size={17} aria-hidden />
        {t(linked ? 'relink' : 'link')}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={`link-${threadId}`}
        className="m-auto w-[min(92vw,32rem)] overflow-visible rounded-[var(--radius-card)] border border-line bg-surface p-0 text-ink shadow-pop"
      >
        <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
          <h2 id={`link-${threadId}`} className="text-xl font-bold">
            {t('linkTitle')}
          </h2>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-label={tc('close')}
            onClick={() => dialogRef.current?.close()}
          >
            <X size={20} aria-hidden />
          </button>
        </header>

        <form action={linkThreadToPatient} className="space-y-4 px-5 py-5">
          <input type="hidden" name="threadId" value={threadId} />
          <p className="text-[0.98rem] text-ink-soft">{t('linkHint')}</p>
          <PatientPicker name="patientId" label={t('linkPatient')} required />

          <footer className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => dialogRef.current?.close()}
            >
              {tc('cancel')}
            </button>
            <button type="submit" className="btn btn-primary">
              <Link2 size={18} aria-hidden />
              {t('linkConfirm')}
            </button>
          </footer>
        </form>

        {/* The undo, and it lives here rather than on the page because
            detaching is rare and putting it in the header would give a
            destructive verb the same weight as reading. An empty `patientId`
            is what the action reads as "take it off". */}
        {linked ? (
          <div className="border-t border-line px-5 py-4">
            <ActionForm
              action={linkThreadToPatient}
              values={{ threadId, patientId: '' }}
              confirmMessage={t('unlinkConfirm', { name: linked.name })}
            >
              <button type="submit" className="btn btn-ghost btn-sm">
                <Link2Off size={17} aria-hidden />
                {t('unlink', { name: linked.name })}
              </button>
            </ActionForm>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
