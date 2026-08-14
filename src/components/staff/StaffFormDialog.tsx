'use client';

import { Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { NameFields, PinField, RoleField, type StaffDefaults } from '@/components/staff/StaffFields';
import { FormDialog } from '@/components/ui/FormDialog';
import { saveStaff } from '@/lib/actions/staff';

export type { StaffDefaults };

/**
 * Correcting an account you are already looking at.
 *
 * Creating one is a page — `/staff/new` — because the role and what it grants
 * deserve the room. This is the opposite errand: a misspelled surname, a
 * promotion, a forgotten PIN reset, fixed from the row it is wrong on.
 */
export function StaffFormDialog({ staff }: { staff: StaffDefaults }) {
  const t = useTranslations('staff');
  const tc = useTranslations('common');
  const uid = useId();

  return (
    <FormDialog
      key={staff.id}
      action={saveStaff}
      resetOnSuccess={false}
      title={t('edit')}
      submitLabel={tc('save')}
      pendingLabel={tc('saving')}
      cancelLabel={tc('cancel')}
      closeLabel={tc('close')}
      triggerTitle={t('edit')}
      triggerClassName="btn btn-secondary btn-sm"
      trigger={
        <>
          <Pencil size={17} aria-hidden />
          <span className="sr-only">{t('edit')}</span>
        </>
      }
    >
      <input type="hidden" name="id" value={staff.id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <NameFields uid={uid} staff={staff} />
      </div>

      <RoleField uid={uid} staff={staff} />

      <PinField uid={uid} editing />
    </FormDialog>
  );
}
