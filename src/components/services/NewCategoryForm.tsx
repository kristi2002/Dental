'use client';

import { CornerDownRight, Tags } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { SelectField, TextField } from '@/components/ui/Field';
import { FormActions, FormLayout, FormPreview, FormSection } from '@/components/ui/FormPage';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { saveServiceCategory } from '@/lib/actions/services';
import { useRecoveredForm } from '@/lib/form-recovery';

/**
 * Naming a catalogue heading, as a screen rather than as a dialog.
 *
 * Naming the departments is a decision the practice makes once, before a single
 * treatment is entered — and then makes eight more times in the same sitting.
 * That is what the second button is for: a modal that has to be reopened per
 * heading turns a five-minute job into forty clicks, while a page that stays put
 * and clears itself is the same job typed straight through.
 *
 * Editing stays a dialog — that is a rename on a row you are already looking at.
 */
export function NewCategoryForm({
  departments,
  defaultParentId = '',
}: {
  /** Top-level categories only — a subcategory can never be a parent. */
  departments: Array<{ id: string; name: string }>;
  /** Preselected parent, so "add a subcategory" starts from the right row. */
  defaultParentId?: string;
}) {
  const t = useTranslations('serviceCategories');
  const tc = useTranslations('common');
  const uid = useId();

  const { state, formAction, formRef } = useRecoveredForm(saveServiceCategory);

  const [name, setName] = useState('');
  const [parentId, setParentId] = useState(defaultParentId);

  const parent = departments.find((option) => option.id === parentId);

  return (
    <form ref={formRef} action={formAction}>
      <FormLayout
        aside={
          /* Where this heading will sit. The catalogue is only two levels deep,
             so seeing the indent before saving is the whole check: a department
             typed while a parent is still selected becomes a subcategory, and
             nothing downstream ever says so. */
          <FormPreview title={t('previewTitle')}>
            {parent ? (
              <>
                <p className="text-body font-bold text-ink">{parent.name}</p>
                <p className="mt-1 flex items-center gap-1.5 border-l-2 border-line pl-3 text-body font-semibold text-ink-soft">
                  <CornerDownRight size={16} aria-hidden className="text-ink-faint" />
                  {name.trim() || <span className="text-ink-faint">{t('newChild')}</span>}
                </p>
              </>
            ) : (
              <>
                <p className="text-lead font-bold text-ink">
                  {name.trim() || <span className="text-ink-faint">{t('new')}</span>}
                </p>
                <p className="mt-1 text-body text-ink-soft">{t('topLevel')}</p>
              </>
            )}
          </FormPreview>
        }
      >
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

          {departments.length > 0 ? (
            <SelectField
              id={`${uid}-parent`}
              name="parentId"
              label={t('parent')}
              hint={t('parentHint')}
              optional={tc('optional')}
              value={parentId}
              onChange={(event) => setParentId(event.target.value)}
            >
              <option value="">{t('topLevel')}</option>
              {departments.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </SelectField>
          ) : (
            // Nothing to be filed under yet, so the question has no answers to
            // offer — but the value still has to be submitted.
            <input type="hidden" name="parentId" value="" />
          )}
        </FormSection>
      </FormLayout>

      <FormActions
        state={state}
        cancelHref="/services/categories"
        cancelLabel={tc('cancel')}
        discardMessage={tc('discardUnsaved')}
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
