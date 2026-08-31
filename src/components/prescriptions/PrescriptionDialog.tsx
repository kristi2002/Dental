'use client';

import { Check, Pill, Sparkles, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { FormDialog } from '@/components/ui/FormDialog';
import { issuePrescription } from '@/lib/actions/prescriptions';
import { cn } from '@/lib/utils';

export type TemplateOption = {
  id: string;
  name: string;
  category: string;
  body: string;
  /** Treatments this wording follows. Drives the suggestions at the top. */
  serviceIds: string[];
};

/** What the practice has just done for this patient, as ids and as names. */
export type RecentWork = { serviceIds: string[]; serviceNames: string[] };

/**
 * Fill in the two things a template can know without being asked. Kept
 * deliberately tiny: anything more and the templates become a language the
 * practice has to learn, when what they need is wording they can edit.
 */
function fill(body: string, patientName: string, todayLabel: string): string {
  return body.replaceAll('{patient}', patientName).replaceAll('{date}', todayLabel);
}

/**
 * Writing a prescription, starting from what was just done.
 *
 * The templates already existed and were already reusable — but they were
 * offered as one flat `<select>` of everything the practice had ever saved, with
 * no connection to the treatment that prompted the prescription. So after a
 * surgical extraction the dentist read a list containing whitening aftercare to
 * find the antibiotic.
 *
 * Three things changed. Templates now know which treatments they follow, so the
 * ones that apply to today's work come first and are one press. They are shown
 * as cards with their wording visible, because the wording *is* the thing being
 * chosen. And what gets written can be saved back as a template without leaving
 * the dialog — which is how the suggestion list gets good, one prescription at a
 * time.
 */
export function PrescriptionDialog({
  patientId,
  patientName,
  templates,
  recent = { serviceIds: [], serviceNames: [] },
  todayLabel,
  canManageTemplates = false,
}: {
  patientId: string;
  patientName: string;
  templates: TemplateOption[];
  /** Treatments recorded for this patient recently. */
  recent?: RecentWork;
  /** Today, already formatted in the reader's locale, for `{date}`. */
  todayLabel: string;
  /** Owners and dentists may add to the practice's standard wording. */
  canManageTemplates?: boolean;
}) {
  const t = useTranslations('prescriptions');
  const tc = useTranslations('common');
  const uid = useId();

  const [templateId, setTemplateId] = useState('');
  const [body, setBody] = useState('');
  const [saveAs, setSaveAs] = useState(false);
  // Set only after the server reports a recorded allergy in the wording, and
  // cleared when the dialog closes: overriding it is a decision, never a default.
  const [force, setForce] = useState(false);

  const suggested = templates.filter((template) =>
    template.serviceIds.some((serviceId) => recent.serviceIds.includes(serviceId)),
  );
  const rest = templates.filter((template) => !suggested.includes(template));

  function choose(template: TemplateOption) {
    // Picking the chosen one again clears it — the way back to a blank sheet is
    // the same press, not a "Blank" row hiding at the top of a list.
    if (templateId === template.id) {
      setTemplateId('');
      setBody('');
      return;
    }
    setTemplateId(template.id);
    setBody(fill(template.body, patientName, todayLabel));
  }

  const card = (template: TemplateOption, tone: 'suggested' | 'plain') => {
    const chosen = templateId === template.id;
    return (
      <button
        key={template.id}
        type="button"
        aria-pressed={chosen}
        onClick={() => choose(template)}
        className={cn(
          'flex w-full flex-col gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors',
          chosen
            ? 'border-brand-dark bg-brand-soft'
            : tone === 'suggested'
              ? 'border-accent bg-accent-soft hover:border-accent-dark'
              : 'border-line-strong bg-surface hover:border-ink',
        )}
      >
        <span className="flex items-center gap-1.5">
          {chosen ? <Check size={15} aria-hidden className="text-brand-deep" /> : null}
          <span className="text-body font-bold text-ink">{template.name}</span>
          {template.category ? (
            <span className="text-caption text-ink-faint">{template.category}</span>
          ) : null}
        </span>
        {/* Two lines of the actual wording. A template chosen by name alone is a
            template read after it has already been issued. */}
        <span className="line-clamp-2 text-meta whitespace-pre-line text-ink-soft">
          {template.body}
        </span>
      </button>
    );
  };

  return (
    <FormDialog
      action={issuePrescription}
      wide
      onClose={() => {
        setTemplateId('');
        setBody('');
        setForce(false);
        setSaveAs(false);
      }}
      title={t('new')}
      submitLabel={t('issue')}
      pendingLabel={tc('saving')}
      cancelLabel={tc('cancel')}
      discardMessage={tc('discardUnsaved')}
      closeLabel={tc('close')}
      triggerClassName="btn btn-primary btn-sm"
      trigger={
        <>
          <Pill size={18} aria-hidden />
          {t('new')}
        </>
      }
    >
      {(state) => (
        <>
          <input type="hidden" name="patientId" value={patientId} />
          <input type="hidden" name="templateId" value={templateId} />
          {force ? <input type="hidden" name="force" value="1" /> : null}

          <p className="text-body text-ink-soft">{t('forPatient', { name: patientName })}</p>

          {/* What was just done, and the wording that normally follows it. */}
          {suggested.length > 0 ? (
            <fieldset>
              <legend className="field-label flex items-center gap-1.5">
                <Sparkles size={16} aria-hidden className="text-accent-dark" />
                {t('suggestedFor', { work: recent.serviceNames.join(', ') })}
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {suggested.map((template) => card(template, 'suggested'))}
              </div>
            </fieldset>
          ) : null}

          {rest.length > 0 ? (
            <fieldset>
              <legend className="field-label">
                {suggested.length > 0 ? t('otherTemplates') : t('template')}
              </legend>
              <div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
                {rest.map((template) => card(template, 'plain'))}
              </div>
            </fieldset>
          ) : null}

          <TextAreaField
            id={`${uid}-body`}
            name="body"
            label={t('body')}
            hint={templates.length > 0 ? t('bodyHint') : undefined}
            required
            rows={9}
            value={body}
            onChange={(event) => {
              setBody(event.target.value);
              // Once the wording has been edited it is no longer that template's
              // wording, and recording it as if it were would make the template's
              // own history a lie.
              if (templateId) setTemplateId('');
            }}
          />

          {/* The list of suggestions only gets good if adding to it is cheaper
              than not adding to it. This is that path: one checkbox, at the
              moment the wording is already written and already correct. */}
          {canManageTemplates ? (
            <div className="rounded-lg border border-line bg-paper px-3.5 py-3">
              <label className="flex cursor-pointer items-start gap-2.5 font-semibold text-ink">
                <input
                  type="checkbox"
                  name="saveAsTemplate"
                  value="1"
                  checked={saveAs}
                  onChange={(event) => setSaveAs(event.target.checked)}
                  className="mt-1 size-4 shrink-0 accent-brand-dark"
                />
                {t('saveAsTemplate')}
              </label>

              {saveAs ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <TextField
                    id={`${uid}-templateName`}
                    name="templateName"
                    label={t('templateName')}
                    required
                  />
                  <TextField
                    id={`${uid}-templateCategory`}
                    name="templateCategory"
                    label={tc('category')}
                    optional={tc('optional')}
                  />
                  {/* Tying it to what was just done is what makes it a
                      suggestion next time rather than one more row in a list. */}
                  {recent.serviceIds.length > 0 ? (
                    <label className="flex cursor-pointer items-start gap-2.5 text-body font-semibold text-ink sm:col-span-2">
                      <input
                        type="checkbox"
                        name="templateServiceIds"
                        value={recent.serviceIds.join(',')}
                        defaultChecked
                        className="mt-1 size-4 shrink-0 accent-brand-dark"
                      />
                      {t('linkToWork', { work: recent.serviceNames.join(', ') })}
                    </label>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {state.status === 'error' && state.code === 'allergy' ? (
            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border-2 border-danger bg-danger-soft px-3 py-2.5 font-semibold text-danger">
              <input
                type="checkbox"
                checked={force}
                onChange={(event) => setForce(event.target.checked)}
                className="mt-1 size-4 shrink-0 accent-current"
              />
              <span className="flex items-start gap-1.5">
                <TriangleAlert size={18} aria-hidden className="mt-0.5 shrink-0" />
                {t('issueAnyway')}
              </span>
            </label>
          ) : null}
        </>
      )}
    </FormDialog>
  );
}
