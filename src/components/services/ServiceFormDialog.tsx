'use client';

import { Package, Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import {
  CatalogueFields,
  DurationField,
  MaterialsField,
  NameField,
  type ServiceDefaults,
  type StockOption,
} from '@/components/services/ServiceFields';
import { FormDialog } from '@/components/ui/FormDialog';
import { saveService } from '@/lib/actions/services';
import type { ServiceCategoryOption } from '@/lib/queries';

export type { ServiceDefaults, StockOption };

/**
 * Correcting a treatment you are already looking at.
 *
 * Adding one is a page — `/services/new` — because building the catalogue is a
 * form to be worked through, a dozen treatments at a sitting. This is the
 * opposite errand: the duration was wrong, or a material was missed, fixed from
 * the row it is wrong on without losing your place in the list.
 */
export function ServiceFormDialog({
  service,
  categories,
  stockItems,
  triggerClassName,
  compact = false,
}: {
  service: ServiceDefaults;
  /** Every heading the practice has named, departments and subcategories alike. */
  categories: ServiceCategoryOption[];
  /** The cupboard, for building this treatment's bill of materials. */
  stockItems: StockOption[];
  triggerClassName?: string;
  compact?: boolean;
}) {
  const t = useTranslations('services');
  const tc = useTranslations('common');
  const uid = useId();

  return (
    <FormDialog
      key={service.id}
      action={saveService}
      resetOnSuccess={false}
      title={t('edit')}
      submitLabel={tc('save')}
      pendingLabel={tc('saving')}
      cancelLabel={tc('cancel')}
      closeLabel={tc('close')}
      triggerTitle={t('edit')}
      triggerClassName={triggerClassName ?? 'btn btn-secondary btn-sm'}
      trigger={
        <>
          <Pencil size={18} aria-hidden />
          {compact ? <span className="sr-only">{t('edit')}</span> : tc('edit')}
        </>
      }
    >
      <input type="hidden" name="id" value={service.id} />

      <NameField uid={uid} service={service} />

      <div className="grid gap-4 sm:grid-cols-2">
        <CatalogueFields uid={uid} service={service} categories={categories} />
      </div>

      <DurationField uid={uid} service={service} />

      <fieldset>
        <legend className="field-label flex items-center gap-2">
          <Package size={17} aria-hidden className="text-brand" />
          {t('materials')}
        </legend>
        <MaterialsField service={service} stockItems={stockItems} />
      </fieldset>
    </FormDialog>
  );
}
