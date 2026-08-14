'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { SelectField, TextField } from '@/components/ui/Field';
import { Role } from '@/generated/prisma/enums';
import { PIN_MAX_LENGTH, PIN_MIN_LENGTH } from '@/lib/auth/pin-constants';
import { ROLE_ORDER, ROLE_PERMISSIONS } from '@/lib/auth/permissions';

export type StaffDefaults = {
  id: string;
  firstName: string;
  lastName: string;
  role: Role;
};

/**
 * The fields an account is made of, shared by the page that creates one and the
 * dialog that corrects one — so the two can never drift into asking different
 * questions about the same person.
 */

export function NameFields({
  uid,
  staff,
  onChange,
}: {
  uid: string;
  staff?: StaffDefaults;
  /** Told as the name is typed, for the page's preview card. */
  onChange?: (field: 'firstName' | 'lastName', value: string) => void;
}) {
  const t = useTranslations('staff');

  return (
    <>
      <TextField
        id={`${uid}-firstName`}
        name="firstName"
        label={t('firstName')}
        required
        defaultValue={staff?.firstName}
        onChange={(event) => onChange?.('firstName', event.target.value)}
      />
      <TextField
        id={`${uid}-lastName`}
        name="lastName"
        label={t('lastName')}
        required
        defaultValue={staff?.lastName}
        onChange={(event) => onChange?.('lastName', event.target.value)}
      />
    </>
  );
}

/**
 * The role, and what the role actually means.
 *
 * A role name on its own is a guess, and this is the screen where guessing is
 * expensive — so the permissions it grants are listed under it and change as the
 * select does.
 */
export function RoleField({
  uid,
  staff,
  onChange,
}: {
  uid: string;
  staff?: StaffDefaults;
  onChange?: (role: Role) => void;
}) {
  const t = useTranslations('staff');
  const tr = useTranslations('roles');
  const tp = useTranslations('permissions');

  const [role, setRole] = useState<Role>(staff?.role ?? Role.RECEPTIONIST);

  return (
    <>
      <SelectField
        id={`${uid}-role`}
        name="role"
        label={t('role')}
        value={role}
        onChange={(event) => {
          const next = event.target.value as Role;
          setRole(next);
          onChange?.(next);
        }}
      >
        {ROLE_ORDER.map((value) => (
          <option key={value} value={value}>
            {tr(value)}
          </option>
        ))}
      </SelectField>

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
    </>
  );
}

export function PinField({ uid, editing = false }: { uid: string; editing?: boolean }) {
  const t = useTranslations('staff');
  const tc = useTranslations('common');

  return (
    <TextField
      id={`${uid}-pin`}
      name="pin"
      label={t('pin')}
      hint={
        editing ? t('pinHintEdit') : t('pinHintNew', { min: PIN_MIN_LENGTH, max: PIN_MAX_LENGTH })
      }
      optional={editing ? tc('optional') : undefined}
      required={!editing}
      inputMode="numeric"
      autoComplete="off"
      pattern={`\\d{${PIN_MIN_LENGTH},${PIN_MAX_LENGTH}}`}
      maxLength={PIN_MAX_LENGTH}
    />
  );
}
