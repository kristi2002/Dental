'use client';

import { Tags } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { TextField } from '@/components/ui/Field';
import { FormActions, FormLayout, FormSection } from '@/components/ui/FormPage';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { saveStockCategory } from '@/lib/actions/stock';
import { useRecoveredForm } from '@/lib/form-recovery';

/**
 * Naming a shelf, as a screen rather than as a dialog.
 *
 * A shelf is a name and nothing else, which is exactly why the dialog was the
 * wrong shape for it: naming the shelves is done once, before a single material
 * is counted in, and then done another eight times in the same sitting. A modal
 * that has to be reopened per shelf turns a two-minute job into forty clicks.
 * This page stays put, clears itself, and keeps the list of what has been named
 * so far in view — so the storage room gets described in one pass.
 *
 * Editing stays a dialog — that is a rename on a row you are already looking at.
 */
export function NewCategoryForm({ existing }: { existing: string[] }) {
  const t = useTranslations('stockCategories');
  const tc = useTranslations('common');
  const uid = useId();

  const { state, formAction, formRef } = useRecoveredForm(saveStockCategory);
  const [name, setName] = useState('');

  return (
    <form ref={formRef} action={formAction}>
      <FormLayout>
        <FormSection
          title={t('sectionNaming')}
          subtitle={t('sectionNamingHint')}
          icon={<Tags size={22} aria-hidden />}
        >
          <TextField
            id={`${uid}-name`}
            name="name"
            label={tc('name')}
            hint={t('nameHint')}
            required
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
          />

          {/* What has been named already. On the second and third pass through
              this form that is the only thing stopping "Anestezi" being typed
              again beside "Anestezia" — and the list it would collide with is
              otherwise a navigation away. */}
          {existing.length > 0 ? (
            <div>
              <p className="field-label">{t('alreadyNamed')}</p>
              <ul className="flex flex-wrap gap-1.5">
                {existing.map((shelf) => (
                  <li
                    key={shelf}
                    className="rounded-full border border-line-strong bg-surface px-3 py-1 text-[0.9rem] font-semibold text-ink-soft"
                  >
                    {shelf}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </FormSection>
      </FormLayout>

      <FormActions
        state={state}
        cancelHref="/stock/categories"
        cancelLabel={tc('cancel')}
        saveLabel={tc('save')}
        pendingLabel={tc('saving')}
        secondary={
          <SubmitButton
            name="again"
            value="1"
            variant="secondary"
            label={tc('saveAndAddAnother')}
            pendingLabel={tc('saving')}
          />
        }
      />
    </form>
  );
}
