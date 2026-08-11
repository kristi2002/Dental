'use client';

import { Pencil, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { SelectField, TextField } from '@/components/ui/Field';
import { FormDialog } from '@/components/ui/FormDialog';
import { saveClosure } from '@/lib/actions/settings';

export type ClosureDefaults = {
  id: string;
  from: string;
  to: string;
  reason: string;
  staffUserId: string;
};

export function ClosureFormDialog({
  closure,
  staff = [],
}: {
  closure?: ClosureDefaults;
  /** Dentists who can be away individually. Empty hides the choice entirely. */
  staff?: Array<{ id: string; name: string }>;
}) {
  const t = useTranslations('settings');
  const tc = useTranslations('common');
  const uid = useId();
  const editing = Boolean(closure);

  return (
    <FormDialog
      key={closure?.id ?? 'new'}
      action={saveClosure}
      resetOnSuccess={!editing}
      title={editing ? t('closureEdit') : t('closureNew')}
      submitLabel={tc('save')}
      pendingLabel={tc('saving')}
      cancelLabel={tc('cancel')}
      closeLabel={tc('close')}
      triggerTitle={editing ? t('closureEdit') : t('closureNew')}
      triggerClassName={editing ? 'btn btn-secondary btn-sm' : 'btn btn-primary btn-sm'}
      trigger={
        editing ? (
          <>
            <Pencil size={18} aria-hidden />
            <span className="sr-only">{t('closureEdit')}</span>
          </>
        ) : (
          <>
            <Plus size={20} aria-hidden />
            {t('closureNew')}
          </>
        )
      }
    >
      {closure ? <input type="hidden" name="id" value={closure.id} /> : null}

      <TextField
        id={`${uid}-reason`}
        name="reason"
        label={t('closureReason')}
        hint={t('closureReasonHint')}
        required
        defaultValue={closure?.reason}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id={`${uid}-from`}
          name="from"
          type="date"
          label={t('closureFrom')}
          required
          defaultValue={closure?.from}
        />
        {/* Left blank, a closure is one day — the common case is a single
            public holiday, not a fortnight. */}
        <TextField
          id={`${uid}-to`}
          name="to"
          type="date"
          label={t('closureTo')}
          optional={tc('optional')}
          defaultValue={closure?.to}
        />
      </div>

      {/* The difference between "we are shut" and "one of us is away" — the
          second must not empty the other dentists' calendars. */}
      {staff.length > 1 ? (
        <SelectField
          id={`${uid}-staff`}
          name="staffUserId"
          label={t('closureWho')}
          hint={t('closureWhoHint')}
          defaultValue={closure?.staffUserId ?? ''}
        >
          <option value="">{t('closureWholePractice')}</option>
          {staff.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </SelectField>
      ) : null}
    </FormDialog>
  );
}
