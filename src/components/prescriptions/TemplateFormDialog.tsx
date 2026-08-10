'use client';

import { Pencil, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { FormDialog } from '@/components/ui/FormDialog';
import { savePrescriptionTemplate } from '@/lib/actions/prescriptions';

export type TemplateDefaults = {
  id: string;
  name: string;
  category: string;
  body: string;
};

export function TemplateFormDialog({
  template,
  categories,
}: {
  template?: TemplateDefaults;
  categories: string[];
}) {
  const t = useTranslations('prescriptions');
  const tc = useTranslations('common');
  const uid = useId();
  const editing = Boolean(template);

  return (
    <FormDialog
      key={template?.id ?? 'new'}
      action={savePrescriptionTemplate}
      resetOnSuccess={!editing}
      title={editing ? t('editTemplate') : t('newTemplate')}
      submitLabel={tc('save')}
      pendingLabel={tc('saving')}
      cancelLabel={tc('cancel')}
      closeLabel={tc('close')}
      triggerTitle={editing ? t('editTemplate') : t('newTemplate')}
      triggerClassName={editing ? 'btn btn-secondary btn-sm' : 'btn btn-primary btn-sm'}
      trigger={
        editing ? (
          <>
            <Pencil size={17} aria-hidden />
            <span className="sr-only">{t('editTemplate')}</span>
          </>
        ) : (
          <>
            <Plus size={18} aria-hidden />
            {t('newTemplate')}
          </>
        )
      }
    >
      {template ? <input type="hidden" name="id" value={template.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id={`${uid}-name`}
          name="name"
          label={t('templateName')}
          required
          defaultValue={template?.name}
        />
        <TextField
          id={`${uid}-category`}
          name="category"
          label={tc('category')}
          optional={tc('optional')}
          list={`${uid}-categories`}
          defaultValue={template?.category}
        />
      </div>
      <datalist id={`${uid}-categories`}>
        {categories.map((category) => (
          <option key={category} value={category} />
        ))}
      </datalist>

      <TextAreaField
        id={`${uid}-body`}
        name="body"
        label={t('body')}
        hint={t('templateBodyHint')}
        required
        rows={8}
        defaultValue={template?.body}
      />
    </FormDialog>
  );
}
