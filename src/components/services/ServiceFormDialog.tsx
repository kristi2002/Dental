'use client';

import { Pencil, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { TextField } from '@/components/ui/Field';
import { FormDialog } from '@/components/ui/FormDialog';
import { saveService } from '@/lib/actions/services';

export type ServiceDefaults = {
  id: string;
  name: string;
  category: string;
  durationMin: number;
};

export function ServiceFormDialog({
  service,
  categories,
  triggerClassName,
  compact = false,
}: {
  service?: ServiceDefaults;
  /** Existing categories, offered as autocomplete so spelling stays consistent. */
  categories: string[];
  triggerClassName?: string;
  compact?: boolean;
}) {
  const t = useTranslations('services');
  const tc = useTranslations('common');
  const editing = Boolean(service);
  const uid = useId();

  return (
    <FormDialog
      key={service?.id ?? 'new'}
      action={saveService}
      resetOnSuccess={!editing}
      title={editing ? t('edit') : t('new')}
      submitLabel={tc('save')}
      pendingLabel={tc('saving')}
      cancelLabel={tc('cancel')}
      closeLabel={tc('close')}
      triggerTitle={editing ? t('edit') : t('new')}
      triggerClassName={
        triggerClassName ?? (editing ? 'btn btn-secondary btn-sm' : 'btn btn-primary')
      }
      trigger={
        editing ? (
          <>
            <Pencil size={18} aria-hidden />
            {compact ? <span className="sr-only">{t('edit')}</span> : tc('edit')}
          </>
        ) : (
          <>
            <Plus size={20} aria-hidden />
            {t('new')}
          </>
        )
      }
    >
      {service ? <input type="hidden" name="id" value={service.id} /> : null}

      <TextField
        id={`${uid}-name`}
        name="name"
        label={t('name')}
        required
        defaultValue={service?.name}
      />

      <TextField
        id={`${uid}-category`}
        name="category"
        label={t('category')}
        optional={tc('optional')}
        list={`${uid}-categories`}
        defaultValue={service?.category}
      />
      <datalist id={`${uid}-categories`}>
        {categories.map((category) => (
          <option key={category} value={category} />
        ))}
      </datalist>

      <TextField
        id={`${uid}-duration`}
        name="durationMin"
        type="number"
        min={5}
        step={5}
        label={`${t('duration')} (${tc('minutes')})`}
        required
        defaultValue={service?.durationMin ?? 30}
      />
    </FormDialog>
  );
}
