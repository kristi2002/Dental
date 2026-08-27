'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { saveRequestNote } from '@/lib/actions/requests';
import { IDLE_STATE } from '@/lib/actions/types';

/**
 * What the desk wrote after ringing back.
 *
 * Deliberately open on the card rather than folded behind an "add note" button.
 * The note is written at the moment the telephone is put down, one-handed, while
 * the next patient is waiting — a control that has to be found first is a note
 * that does not get written, and "rang, no answer, try after six" is exactly the
 * line whose absence makes somebody ring twice.
 */
export function RequestNote({ id, note }: { id: string; note: string | null }) {
  const t = useTranslations('requests');
  const [state, formAction] = useActionState(saveRequestNote, IDLE_STATE);

  return (
    <form action={formAction} className="mt-4">
      <label htmlFor={`note-${id}`} className="field-label">
        {t('note')}
      </label>
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap items-end gap-2">
        <textarea
          id={`note-${id}`}
          name="staffNote"
          rows={2}
          defaultValue={note ?? ''}
          placeholder={t('notePlaceholder')}
          className="field-input min-w-0 flex-1 resize-y"
        />
        <SubmitButton
          label={t('saveNote')}
          pendingLabel={t('savingNote')}
          variant="secondary"
          className="btn-sm"
        />
      </div>

      {state.status === 'error' ? (
        <p role="alert" className="mt-2 font-semibold text-danger">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
