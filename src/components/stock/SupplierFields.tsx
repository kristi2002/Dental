'use client';

import { useTranslations } from 'next-intl';
import { TextAreaField, TextField } from '@/components/ui/Field';

export type SupplierDefaults = {
  id: string;
  name: string;
  phone: string;
  email: string;
  notes: string;
};

/**
 * Enough to place an order and no more. There is no purchasing or invoicing in
 * this app by design, so a supplier is a name and a way to reach them.
 *
 * Shared by the page that adds one and the dialog that corrects one, so the two
 * can never drift into asking different questions about the same company.
 */

export function NameField({
  uid,
  supplier,
  onChange,
}: {
  uid: string;
  supplier?: SupplierDefaults;
  onChange?: (value: string) => void;
}) {
  const tc = useTranslations('common');

  return (
    <TextField
      id={`${uid}-name`}
      name="name"
      label={tc('name')}
      required
      defaultValue={supplier?.name}
      onChange={(event) => onChange?.(event.target.value)}
    />
  );
}

export function ContactFields({
  uid,
  supplier,
  onChange,
}: {
  uid: string;
  supplier?: SupplierDefaults;
  onChange?: (field: 'phone' | 'email', value: string) => void;
}) {
  const t = useTranslations('suppliers');
  const tc = useTranslations('common');

  return (
    <>
      <TextField
        id={`${uid}-phone`}
        name="phone"
        type="tel"
        inputMode="tel"
        label={t('phone')}
        optional={tc('optional')}
        defaultValue={supplier?.phone}
        onChange={(event) => onChange?.('phone', event.target.value)}
      />
      <TextField
        id={`${uid}-email`}
        name="email"
        type="email"
        label={t('email')}
        optional={tc('optional')}
        defaultValue={supplier?.email}
        onChange={(event) => onChange?.('email', event.target.value)}
      />
    </>
  );
}

export function NotesField({ uid, supplier }: { uid: string; supplier?: SupplierDefaults }) {
  const tc = useTranslations('common');

  return (
    <TextAreaField
      id={`${uid}-notes`}
      name="notes"
      label={tc('notes')}
      optional={tc('optional')}
      rows={3}
      defaultValue={supplier?.notes}
    />
  );
}
