'use client';

import { Pencil, Plus, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
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
  const [force, setForce] = useState(false);

  return (
    <FormDialog
      key={closure?.id ?? 'new'}
      action={saveClosure}
      resetOnSuccess={!editing}
      onClose={() => setForce(false)}
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
      {(state) => (
        <>
      {closure ? <input type="hidden" name="id" value={closure.id} /> : null}
      {force ? <input type="hidden" name="force" value="1" /> : null}

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

      {/* Reported, not enforced: declaring the shutdown before moving the
          bookings is a normal order to work in — but it has to be seen. */}
      {state.status === 'error' && state.code === 'bookedOver' ? (
        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-warn bg-warn-soft px-3 py-2.5 font-semibold text-warn">
          <input
            type="checkbox"
            checked={force}
            onChange={(event) => setForce(event.target.checked)}
            className="mt-1 size-4 shrink-0 accent-current"
          />
          <span className="flex items-start gap-1.5">
            <TriangleAlert size={18} aria-hidden className="mt-0.5 shrink-0" />
            {tc('saveAnyway')}
          </span>
        </label>
      ) : null}
        </>
      )}
    </FormDialog>
  );
}
