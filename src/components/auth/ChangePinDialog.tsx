'use client';

import { KeyRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { TextField } from '@/components/ui/Field';
import { FormDialog } from '@/components/ui/FormDialog';
import { changeOwnPin } from '@/lib/actions/auth';
import { PIN_MAX_LENGTH, PIN_MIN_LENGTH } from '@/lib/auth/pin-constants';

/**
 * Changing your own PIN, from the menu with your own name on it.
 *
 * `saveStaff` was the only path that wrote a PIN, and it needs `staff.manage` —
 * so this was owner-only, which had two consequences worth naming in a clinic of
 * four. A receptionist who thought somebody had watched them type had to go and
 * ask; and the owner necessarily knew every PIN in the practice, in an app whose
 * activity log attributes every line to one of them.
 *
 * A dialog rather than a screen, and in the account menu rather than under
 * Settings: this is about the person, not about the practice, and Settings is
 * where the practice's own answers live. It is also the only place in the app
 * that is unambiguously *yours* — the menu already carries your name and your
 * way out.
 *
 * Three boxes, and the first one is not ceremony. Somebody at an unlocked
 * machine could already read every chart in the app; what the current PIN stops
 * them doing is locking the real user out of their own account.
 */
export function ChangePinDialog({ triggerClassName }: { triggerClassName?: string }) {
  const t = useTranslations('auth');
  const tc = useTranslations('common');
  const uid = useId();

  /** Every box takes the same thing, so it is described once. */
  const pinProps = {
    type: 'password' as const,
    // `numeric`, not `tel`: a PIN is digits, and this is what puts the number
    // pad on a tablet without the telephone keypad's extra symbols.
    inputMode: 'numeric' as const,
    pattern: '[0-9]*',
    autoComplete: 'off',
    minLength: PIN_MIN_LENGTH,
    maxLength: PIN_MAX_LENGTH,
    required: true,
  };

  return (
    <FormDialog
      action={changeOwnPin}
      title={t('changePin')}
      submitLabel={t('changePin')}
      pendingLabel={tc('saving')}
      cancelLabel={tc('cancel')}
      closeLabel={tc('close')}
      // Guarded like the dialogs holding prose: a mistyped digit is cheap to
      // retype, but closing this by accident mid-change leaves somebody unsure
      // which PIN they now have, which is the one confusion worth a prompt.
      discardMessage={tc('discardUnsaved')}
      triggerClassName={triggerClassName ?? 'menu-item'}
      trigger={
        <>
          <KeyRound size={18} aria-hidden />
          {t('changePin')}
        </>
      }
    >
      <p className="text-body text-ink-soft">{t('changePinHint')}</p>

      <TextField
        id={`${uid}-current`}
        name="currentPin"
        label={t('currentPin')}
        {...pinProps}
        autoComplete="current-password"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField id={`${uid}-new`} name="newPin" label={t('newPin')} {...pinProps} />
        <TextField
          id={`${uid}-confirm`}
          name="confirmPin"
          label={t('confirmNewPin')}
          {...pinProps}
        />
      </div>
    </FormDialog>
  );
}
