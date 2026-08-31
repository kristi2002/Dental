'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { ServiceOption } from '@/components/appointments/AppointmentFormDialog';
import { TextAreaField, TextField } from '@/components/ui/Field';
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

/**
 * The fields a standard wording is made of, shared by the page that writes one
 * and the dialog that corrects one.
 */

export function NamingFields({
  uid,
  template,
  categories,
  onChange,
}: {
  uid: string;
  template?: TemplateDefaults;
  /** Groupings already used, offered as autocomplete so they stay a short list. */
  categories: string[];
  onChange?: (field: 'name' | 'category', value: string) => void;
}) {
  const t = useTranslations('prescriptions');
  const tc = useTranslations('common');

  return (
    <>
      <TextField
        id={`${uid}-name`}
        name="name"
        label={t('templateName')}
        required
        defaultValue={template?.name}
        onChange={(event) => onChange?.('name', event.target.value)}
      />
      <TextField
        id={`${uid}-category`}
        name="category"
        label={tc('category')}
        optional={tc('optional')}
        list={`${uid}-categories`}
        defaultValue={template?.category}
        onChange={(event) => onChange?.('category', event.target.value)}
      />
      <datalist id={`${uid}-categories`}>
        {categories.map((category) => (
          <option key={category} value={category} />
        ))}
      </datalist>
    </>
  );
}

/**
 * The edge that makes the template list worth having: after this treatment,
 * offer this wording first.
 */
export function AfterTreatmentField({
  template,
  services,
  scroll = true,
  onChange,
}: {
  template?: TemplateDefaults;
  /** The catalogue, so the wording can be tied to the work it follows. */
  services: ServiceOption[];
  /** Cap the height — right inside a dialog, wrong on a page with room. */
  scroll?: boolean;
  onChange?: (count: number) => void;
}) {
  const t = useTranslations('prescriptions');
  const tc = useTranslations('common');

  const [linked, setLinked] = useState<string[]>(template?.serviceIds ?? []);

  if (services.length === 0) return null;

  return (
    <fieldset>
      {linked.map((serviceId) => (
        <input key={serviceId} type="hidden" name="serviceIds" value={serviceId} />
      ))}

      <p className="mb-1.5 text-meta text-ink-soft">{t('afterTreatmentHint')}</p>

      <div className={cn('space-y-2.5', scroll && 'max-h-56 overflow-y-auto')}>
        {byDepartment(services).map(({ department, items }) => (
          <div key={department || 'none'}>
            <p className="mb-1 text-caption font-bold tracking-wide text-ink-faint uppercase">
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
                      setLinked((current) => {
                        const next = on
                          ? current.filter((value) => value !== service.id)
                          : [...current, service.id];
                        onChange?.(next.length);
                        return next;
                      })
                    }
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-meta font-semibold transition-colors',
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
  );
}

export function BodyField({
  uid,
  template,
  rows = 8,
  labelHidden = false,
  onChange,
}: {
  uid: string;
  template?: TemplateDefaults;
  rows?: number;
  /** For the page, whose section heading already says the same word. */
  labelHidden?: boolean;
  onChange?: (value: string) => void;
}) {
  const t = useTranslations('prescriptions');

  return (
    <TextAreaField
      id={`${uid}-body`}
      name="body"
      label={t('body')}
      labelHidden={labelHidden}
      hint={t('templateBodyHint')}
      required
      rows={rows}
      defaultValue={template?.body}
      onChange={(event) => onChange?.(event.target.value)}
    />
  );
}
