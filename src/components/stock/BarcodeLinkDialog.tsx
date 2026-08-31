'use client';

import { Link2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { SelectField, TextField } from '@/components/ui/Field';
import { FormDialog } from '@/components/ui/FormDialog';
import { linkBarcode } from '@/lib/actions/scan';
import type { ScanResolution } from '@/lib/actions/scan';

export type LinkableItem = { id: string; name: string };
export type LinkableCategory = { id: string; name: string };

/**
 * Teaching the app what an unrecognised code is.
 *
 * Offered from the scan that failed, not from a settings screen: the person who
 * knows what the code means is the one holding the carton, and they know it for
 * about as long as they are holding it. Every other placement of this form ends
 * with a drawer of products the scanner refuses to read.
 *
 * Two answers, because the first scan of a product is as likely to be something
 * the practice has stocked for years as something new on the shelf. Picking an
 * existing material is the common one and comes first; naming a new one creates
 * it here rather than sending anyone to another form.
 */
export function BarcodeLinkDialog({
  scan,
  items,
  categories,
  onLinked,
}: {
  scan: ScanResolution;
  /** The cupboard, to attach this code to something already in it. */
  items: LinkableItem[];
  categories: LinkableCategory[];
  /**
   * The code has been linked. The console then asks the database what it now
   * resolves to, rather than being handed it — see `recheck` in `ScanConsole`.
   */
  onLinked?: () => void;
}) {
  const t = useTranslations('scan');
  const ts = useTranslations('stock');
  const tc = useTranslations('common');
  const uid = useId();

  // Which of the two answers is being given. A select and a name field both
  // filled in is an ambiguous instruction, so only one is ever on screen.
  const [creating, setCreating] = useState(items.length === 0);

  return (
    <FormDialog
      action={linkBarcode}
      onSuccess={onLinked}
      title={t('linkTitle')}
      submitLabel={t('linkSubmit')}
      pendingLabel={tc('saving')}
      cancelLabel={tc('cancel')}
      closeLabel={tc('close')}
      triggerClassName="btn btn-primary btn-sm"
      trigger={
        <>
          <Link2 size={17} aria-hidden />
          {t('linkAction')}
        </>
      }
    >
      <input type="hidden" name="raw" value={scan.raw} />

      <p className="rounded-lg border border-line bg-surface-soft px-3 py-2.5 text-body text-ink-soft">
        {t('linkIntro')}
        <span className="mt-1 block font-mono text-meta font-bold break-all text-ink">
          {scan.key}
        </span>
      </p>

      {/* A switch between two halves of this dialog, not a second Save — which is
          what the chosen one used to look like, sitting a few rows above the
          real one in the same teal. */}
      {items.length > 0 ? (
        <div className="segmented">
          <button
            type="button"
            aria-pressed={!creating}
            onClick={() => setCreating(false)}
            className="segment"
          >
            {t('linkExisting')}
          </button>
          <button
            type="button"
            aria-pressed={creating}
            onClick={() => setCreating(true)}
            className="segment"
          >
            {t('linkNew')}
          </button>
        </div>
      ) : null}

      {creating ? (
        <>
          <TextField
            id={`${uid}-name`}
            name="newName"
            label={ts('name')}
            hint={t('linkNewHint')}
            required
          />
          <div className="grid gap-4">
            <SelectField
              id={`${uid}-category`}
              name="categoryId"
              label={ts('category')}
              optional={tc('optional')}
              defaultValue=""
            >
              <option value="">{ts('uncategorized')}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </SelectField>
          </div>
        </>
      ) : (
        <SelectField id={`${uid}-item`} name="itemId" label={t('linkItem')} required defaultValue="">
          <option value="" disabled>
            {t('linkItemPlaceholder')}
          </option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </SelectField>
      )}

      {/* The field that stops a pallet being counted as one glove. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id={`${uid}-pack`}
          name="packQty"
          type="number"
          min={1}
          step={1}
          label={t('linkPackQty')}
          hint={t('linkPackQtyHint')}
          defaultValue={scan.packQty}
        />
        <TextField
          id={`${uid}-label`}
          name="label"
          label={t('linkLabel')}
          optional={tc('optional')}
          placeholder={t('linkLabelPlaceholder')}
        />
      </div>
    </FormDialog>
  );
}
