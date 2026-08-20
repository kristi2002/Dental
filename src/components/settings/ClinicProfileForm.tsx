'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useId } from 'react';
import { SelectField, TextField } from '@/components/ui/Field';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { saveClinicProfile } from '@/lib/actions/settings';
import { IDLE_STATE } from '@/lib/actions/types';

/**
 * Practice name and tooth numbering.
 *
 * Switching the numbering is safe by construction: charts are stored in FDI
 * whichever way this is set, so it changes the labels on the buttons and
 * nothing else. Worth saying out loud on the form, because "change how teeth
 * are numbered" sounds like it should renumber teeth.
 */
export function ClinicProfileForm({
  name,
  toothNumbering,
  currency,
  phone,
  email,
  address,
  canEdit,
}: {
  name: string;
  toothNumbering: string;
  /** ISO 4217 code every price in the app is written in. */
  currency: string;
  /** The letterhead — printed under the logo on every sheet. See `SheetHead`. */
  phone: string;
  email: string;
  address: string;
  canEdit: boolean;
}) {
  const t = useTranslations('settings');
  const tc = useTranslations('common');
  const uid = useId();
  const [state, formAction] = useActionState(saveClinicProfile, IDLE_STATE);

  return (
    <form action={formAction}>
      <div className="grid gap-4 px-5 py-5 sm:grid-cols-2">
        <TextField
          id={`${uid}-name`}
          name="name"
          label={t('clinicName')}
          optional={tc('optional')}
          defaultValue={name}
          disabled={!canEdit}
        />

        <SelectField
          id={`${uid}-numbering`}
          name="toothNumbering"
          label={t('numbering')}
          hint={t('numberingHint')}
          defaultValue={toothNumbering}
          disabled={!canEdit}
        >
          <option value="FDI">{t('numbering_FDI')}</option>
          <option value="UNIVERSAL">{t('numbering_UNIVERSAL')}</option>
        </SelectField>

        {/* The practice buys in one currency, so this is asked once here rather
            than beside every price. Three letters, because that is what
            `Intl.NumberFormat` reads — it renders the symbol itself.

            Not styled uppercase: the class lands on the wrapper and shouts the
            label and the hint along with the value. `saveClinicProfile`
            uppercases what is typed, so "eur" is already accepted. */}
        <TextField
          id={`${uid}-currency`}
          name="currency"
          label={t('currency')}
          hint={t('currencyHint')}
          defaultValue={currency}
          maxLength={3}
          disabled={!canEdit}
        />
      </div>

      {/* The letterhead, kept apart from the three settings above by a rule and
          a heading. Those change how the *app* behaves — how teeth are numbered,
          what a price is denominated in. These change nothing on any screen and
          only ever appear on paper that leaves the building, which is worth
          saying before somebody wonders why filling them in did nothing
          visible. */}
      <div className="border-t border-line px-5 py-5">
        <h3 className="text-[1.05rem] font-bold text-ink">{t('letterheadTitle')}</h3>
        <p className="mt-1 text-[0.95rem] text-ink-soft">{t('letterheadHint')}</p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <TextField
            id={`${uid}-phone`}
            name="phone"
            label={t('clinicPhone')}
            optional={tc('optional')}
            defaultValue={phone}
            disabled={!canEdit}
          />

          <TextField
            id={`${uid}-email`}
            name="email"
            type="email"
            label={t('clinicEmail')}
            optional={tc('optional')}
            defaultValue={email}
            disabled={!canEdit}
          />

          <TextField
            id={`${uid}-address`}
            name="address"
            label={t('clinicAddress')}
            optional={tc('optional')}
            defaultValue={address}
            disabled={!canEdit}
            className="sm:col-span-2"
          />
        </div>
      </div>

      {canEdit ? (
        <div className="flex items-center justify-end gap-3 border-t border-line px-5 py-4">
          {state.status === 'error' ? (
            <p role="alert" className="mr-auto font-semibold text-danger">
              {state.message}
            </p>
          ) : null}
          {state.status === 'ok' ? (
            <p role="status" className="mr-auto font-semibold text-ok">
              {t('saved')}
            </p>
          ) : null}
          <SubmitButton label={tc('save')} pendingLabel={tc('saving')} />
        </div>
      ) : null}
    </form>
  );
}
