'use client';

import { Pencil, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import type { ServiceOption } from '@/components/appointments/AppointmentFormDialog';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { FormDialog } from '@/components/ui/FormDialog';
import { savePrescriptionTemplate } from '@/lib/actions/prescriptions';
import { byDepartment } from '@/lib/catalog';
import { cn } from '@/lib/utils';

export type TemplateDefaults = {
  id: string;
  name: string;
  category: string;
  body: string;
  /** Treatments this wording follows. */
  serviceIds: string[];
};

export function TemplateFormDialog({
  template,
  categories,
  services = [],
}: {
  template?: TemplateDefaults;
  categories: string[];
  /** The catalogue, so the wording can be tied to the work it follows. */
  services?: ServiceOption[];
}) {
  const t = useTranslations('prescriptions');
  const tc = useTranslations('common');
  const uid = useId();
  const editing = Boolean(template);

  const [linked, setLinked] = useState<string[]>(template?.serviceIds ?? []);

  return (
    <FormDialog
      key={template?.id ?? 'new'}
      action={savePrescriptionTemplate}
      resetOnSuccess={!editing}
      onClose={() => setLinked(template?.serviceIds ?? [])}
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
      {linked.map((serviceId) => (
        <input key={serviceId} type="hidden" name="serviceIds" value={serviceId} />
      ))}

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

      {/* The edge that makes the template list worth having: after this
          treatment, offer this wording first. */}
      {services.length > 0 ? (
        <fieldset>
          <legend className="field-label">{t('afterTreatment')}</legend>
          <p className="mb-1.5 text-[0.9rem] text-ink-soft">{t('afterTreatmentHint')}</p>
          <div className="max-h-56 space-y-2.5 overflow-y-auto">
            {byDepartment(services).map(({ department, items }) => (
              <div key={department || 'none'}>
                <p className="mb-1 text-[0.78rem] font-bold tracking-wide text-ink-faint uppercase">
                  {department || tc('category')}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((service) => {
                    const on = linked.includes(service.id);
                    return (
                      <button
                        key={service.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          setLinked((current) =>
                            on
                              ? current.filter((value) => value !== service.id)
                              : [...current, service.id],
                          )
                        }
                        className={cn(
                          'rounded-full border px-3 py-1.5 text-[0.88rem] font-semibold transition-colors',
                          on
                            ? 'border-brand-dark bg-brand-dark text-white'
                            : 'border-line-strong bg-surface text-ink-soft hover:border-ink hover:text-ink',
                        )}
                      >
                        {service.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </fieldset>
      ) : null}

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
