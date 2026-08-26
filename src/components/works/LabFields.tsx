'use client';

import { useTranslations } from 'next-intl';
import { TextAreaField, TextField } from '@/components/ui/Field';

export type LabDefaults = {
  id?: string;
  name: string;
  phone: string;
  email: string;
  notes: string;
};

/**
 * The four questions a laboratory is worth asking, written once.
 *
 * Shared by the page that names a new one and the dialog that corrects an
 * existing one, exactly as `StaffFields` and `ServiceFields` are — the questions
 * do not change between the two, so neither should their wording or their order.
 *
 * The telephone number is the reason this table exists at all, so it sits
 * directly under the name rather than in a second group: everything else here is
 * useful, and that one is the point.
 */
export function LabFields({ uid, lab }: { uid: string; lab?: LabDefaults }) {
  const t = useTranslations('labs');
  const tc = useTranslations('common');

  return (
    <>
      <TextField
        id={`${uid}-name`}
        name="name"
        label={tc('name')}
        hint={t('nameHint')}
        placeholder={t('namePlaceholder')}
        required
        defaultValue={lab?.name}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {/* What the follow-up board dials. Optional, because a laboratory can be
            named before anybody has looked up the number — but the hint says
            plainly what is lost by leaving it, since a row with no number cannot
            do the one thing this list was added for. */}
        <TextField
          id={`${uid}-phone`}
          name="phone"
          type="tel"
          label={t('phone')}
          hint={t('phoneHint')}
          optional={tc('optional')}
          defaultValue={lab?.phone}
        />

        <TextField
          id={`${uid}-email`}
          name="email"
          type="email"
          label={t('email')}
          optional={tc('optional')}
          defaultValue={lab?.email}
        />
      </div>

      {/* Whatever the practice needs beside the number — whose name to ask for,
          which days they collect, what they are slow at. Free text on purpose:
          this is the margin of the address book, and a form that tried to
          structure it would be asking questions nobody has answers to. */}
      <TextAreaField
        id={`${uid}-notes`}
        name="notes"
        label={tc('notes')}
        hint={t('notesHint')}
        optional={tc('optional')}
        rows={3}
        defaultValue={lab?.notes}
      />
    </>
  );
}
