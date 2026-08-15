'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { SelectField, TextField } from '@/components/ui/Field';
import type { ServiceCategoryOption } from '@/lib/queries';

export type ServiceDefaults = {
  id: string;
  name: string;
  /** The department, whether this treatment is filed against it or a child of it. */
  departmentId: string;
  /** The subcategory inside that department, or empty. */
  subcategoryId: string;
  durationMin: number;
};

/**
 * The fields a treatment is made of, shared by the page that adds one to the
 * catalogue and the dialog that corrects one — so the two can never drift into
 * asking different questions about the same treatment.
 */

export function NameField({
  uid,
  service,
  onChange,
}: {
  uid: string;
  service?: ServiceDefaults;
  onChange?: (value: string) => void;
}) {
  const t = useTranslations('services');

  return (
    <TextField
      id={`${uid}-name`}
      name="name"
      label={t('name')}
      required
      defaultValue={service?.name}
      onChange={(event) => onChange?.(event.target.value)}
    />
  );
}

/**
 * Where the treatment is filed, in two levels.
 *
 * A closed list, not a text box. Typing the department per treatment is what
 * produced three spellings of one heading, and five screens group the catalogue
 * by it — so a typo splits a department in two. The hint carries the only thing
 * a select cannot: where new ones come from, said just once, when there are
 * none yet.
 */
export function CatalogueFields({
  uid,
  service,
  categories,
  onChange,
}: {
  uid: string;
  service?: ServiceDefaults;
  /** Every heading the practice has named, departments and subcategories alike. */
  categories: ServiceCategoryOption[];
  /** Told which headings are chosen, for the page's preview card. */
  onChange?: (chosen: { departmentId: string; subcategoryId: string }) => void;
}) {
  const t = useTranslations('services');
  const tc = useTranslations('common');

  // The second select is a function of the first, so the department is state
  // rather than an uncontrolled default: picking Kirurgji has to replace the
  // subcategories of whatever was selected before it.
  const [departmentId, setDepartmentId] = useState(service?.departmentId ?? '');
  const [subcategoryId, setSubcategoryId] = useState(service?.subcategoryId ?? '');

  const departments = categories.filter((category) => category.parentId === null);
  const subcategories = categories.filter((category) => category.parentId === departmentId);

  return (
    <>
      <SelectField
        id={`${uid}-category`}
        name="categoryId"
        label={t('department')}
        hint={departments.length === 0 ? t('categoryEmptyHint') : undefined}
        optional={tc('optional')}
        value={departmentId}
        onChange={(event) => {
          const next = event.target.value;
          setDepartmentId(next);
          // The old subcategory belongs to the old department.
          setSubcategoryId('');
          onChange?.({ departmentId: next, subcategoryId: '' });
        }}
      >
        <option value="">{t('uncategorized')}</option>
        {departments.map((department) => (
          <option key={department.id} value={department.id}>
            {department.name}
          </option>
        ))}
      </SelectField>

      {/* Only once the chosen department has been subdivided — an empty second
          select on every treatment would read as a question left unanswered. */}
      {subcategories.length > 0 ? (
        <SelectField
          id={`${uid}-subcategory`}
          name="subcategoryId"
          label={t('subcategory')}
          optional={tc('optional')}
          value={subcategoryId}
          onChange={(event) => {
            const next = event.target.value;
            setSubcategoryId(next);
            onChange?.({ departmentId, subcategoryId: next });
          }}
        >
          <option value="">{t('wholeDepartment')}</option>
          {subcategories.map((subcategory) => (
            <option key={subcategory.id} value={subcategory.id}>
              {subcategory.name}
            </option>
          ))}
        </SelectField>
      ) : null}
    </>
  );
}

export function DurationField({
  uid,
  service,
  onChange,
}: {
  uid: string;
  service?: ServiceDefaults;
  onChange?: (value: string) => void;
}) {
  const t = useTranslations('services');
  const tc = useTranslations('common');

  return (
    <TextField
      id={`${uid}-duration`}
      name="durationMin"
      type="number"
      min={5}
      step={5}
      label={`${t('duration')} (${tc('minutes')})`}
      required
      defaultValue={service?.durationMin ?? 30}
      onChange={(event) => onChange?.(event.target.value)}
    />
  );
}
