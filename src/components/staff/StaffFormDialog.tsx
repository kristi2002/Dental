'use client';

import { Pencil, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { SelectField, TextField } from '@/components/ui/Field';
import { FormDialog } from '@/components/ui/FormDialog';
import { Role } from '@/generated/prisma/enums';
import { saveStaff } from '@/lib/actions/staff';
import { PIN_MAX_LENGTH, PIN_MIN_LENGTH } from '@/lib/auth/pin-constants';
import { ROLE_ORDER, ROLE_PERMISSIONS } from '@/lib/auth/permissions';

export type StaffDefaults = {
  id: string;
  firstName: string;
  lastName: string;
  role: Role;
};

export function StaffFormDialog({ staff }: { staff?: StaffDefaults }) {
  const t = useTranslations('staff');
  const tc = useTranslations('common');
  const tr = useTranslations('roles');
  const tp = useTranslations('permissions');
  const uid = useId();
  const editing = Boolean(staff);

  const [role, setRole] = useState<Role>(staff?.role ?? Role.RECEPTIONIST);

  return (
    <FormDialog
      key={staff?.id ?? 'new'}
      action={saveStaff}
      resetOnSuccess={!editing}
      onClose={() => setRole(staff?.role ?? Role.RECEPTIONIST)}
      title={editing ? t('edit') : t('new')}
      submitLabel={tc('save')}
      pendingLabel={tc('saving')}
      cancelLabel={tc('cancel')}
      closeLabel={tc('close')}
      triggerTitle={editing ? t('edit') : t('new')}
      triggerClassName={editing ? 'btn btn-secondary btn-sm' : 'btn btn-primary'}
      trigger={
        editing ? (
          <>
            <Pencil size={17} aria-hidden />
            <span className="sr-only">{t('edit')}</span>
          </>
        ) : (
          <>
            <UserPlus size={20} aria-hidden />
            {t('new')}
          </>
        )
      }
    >
      {staff ? <input type="hidden" name="id" value={staff.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id={`${uid}-firstName`}
          name="firstName"
          label={t('firstName')}
          required
          defaultValue={staff?.firstName}
        />
        <TextField
          id={`${uid}-lastName`}
          name="lastName"
          label={t('lastName')}
          required
          defaultValue={staff?.lastName}
        />
      </div>

      <SelectField
        id={`${uid}-role`}
        name="role"
        label={t('role')}
        value={role}
        onChange={(event) => setRole(event.target.value as Role)}
      >
        {ROLE_ORDER.map((value) => (
          <option key={value} value={value}>
            {tr(value)}
          </option>
        ))}
      </SelectField>

      {/* What the choice actually means, spelled out — a role name alone is a
          guess, and this is the screen where guessing is expensive. */}
      <div className="rounded-lg border border-line bg-surface-soft px-3.5 py-3">
        <p className="mb-1.5 text-[0.9rem] font-bold tracking-wide text-ink-faint uppercase">
          {t('roleAllows')}
        </p>
        <ul className="grid gap-x-4 gap-y-1 text-[0.95rem] text-ink-soft sm:grid-cols-2">
          {ROLE_PERMISSIONS[role].map((permission) => (
            <li key={permission} className="flex items-start gap-1.5">
              <span aria-hidden className="mt-[3px] text-brand">
                ✓
              </span>
              {tp(permission)}
            </li>
          ))}
        </ul>
      </div>

      <TextField
        id={`${uid}-pin`}
        name="pin"
        label={t('pin')}
        hint={editing ? t('pinHintEdit') : t('pinHintNew', { min: PIN_MIN_LENGTH, max: PIN_MAX_LENGTH })}
        optional={editing ? tc('optional') : undefined}
        required={!editing}
        inputMode="numeric"
        autoComplete="off"
        pattern={`\\d{${PIN_MIN_LENGTH},${PIN_MAX_LENGTH}}`}
        maxLength={PIN_MAX_LENGTH}
      />
    </FormDialog>
  );
}
