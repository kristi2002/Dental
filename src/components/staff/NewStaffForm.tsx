'use client';

import { KeyRound, ShieldCheck, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { RoleBadge } from '@/components/auth/RoleBadge';
import { NameFields, PinField, RoleField } from '@/components/staff/StaffFields';
import { FormActions, FormLayout, FormPreview, FormSection } from '@/components/ui/FormPage';
import { Role } from '@/generated/prisma/enums';
import { saveStaff } from '@/lib/actions/staff';
import { useRecoveredForm } from '@/lib/form-recovery';
import { initials } from '@/lib/utils';

/**
 * Giving somebody an account, as a screen rather than as a dialog.
 *
 * This is a setup errand: the practice's people are entered once, usually all in
 * one sitting on the first day, and the one field that matters most — the role —
 * needs its consequences spelled out beside it rather than crammed under a
 * select in a modal. Choosing wrong here is how the front desk ends up reading
 * medical notes, so the screen is worth the room.
 *
 * Editing stays a dialog — that is a surname corrected or a forgotten PIN reset
 * on a row you are already looking at.
 */
export function NewStaffForm() {
  const t = useTranslations('staff');
  const tc = useTranslations('common');
  const uid = useId();

  const { state, formAction, formRef } = useRecoveredForm(saveStaff);

  // What the row will look like once saved, kept in step as it is typed.
  const [preview, setPreview] = useState({
    firstName: '',
    lastName: '',
    role: Role.RECEPTIONIST as Role,
  });

  return (
    <form ref={formRef} action={formAction}>
      <FormLayout
        aside={
          <FormPreview title={t('previewTitle')}>
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-soft text-[1.05rem] font-bold text-brand-deep"
              >
                {initials(preview.firstName, preview.lastName) || '—'}
              </span>

              <div className="min-w-0">
                <p className="truncate text-[1.12rem] font-bold text-ink">
                  {`${preview.firstName} ${preview.lastName}`.trim() || (
                    <span className="text-ink-faint">{t('new')}</span>
                  )}
                </p>
                <p className="mt-1">
                  <RoleBadge role={preview.role} />
                </p>
              </div>
            </div>
          </FormPreview>
        }
      >
        <FormSection
          title={t('sectionIdentity')}
          subtitle={t('sectionIdentityHint')}
          icon={<UserRound size={22} aria-hidden />}
          className="grid gap-4 p-5 sm:grid-cols-2"
        >
          <NameFields
            uid={uid}
            onChange={(field, value) => setPreview((current) => ({ ...current, [field]: value }))}
          />
        </FormSection>

        <FormSection
          title={t('sectionRole')}
          subtitle={t('sectionRoleHint')}
          icon={<ShieldCheck size={22} aria-hidden />}
        >
          <RoleField
            uid={uid}
            onChange={(role) => setPreview((current) => ({ ...current, role }))}
          />
        </FormSection>

        <FormSection
          title={t('sectionPin')}
          subtitle={t('sectionPinHint')}
          icon={<KeyRound size={22} aria-hidden />}
        >
          <PinField uid={uid} />
        </FormSection>
      </FormLayout>

      <FormActions
        state={state}
        cancelHref="/staff"
        cancelLabel={tc('cancel')}
        saveLabel={tc('save')}
        pendingLabel={tc('saving')}
      />
    </form>
  );
}
