'use client';

import { FlaskConical, StickyNote, User } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { PatientPicker } from '@/components/patients/PatientPicker';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { FormActions, FormLayout, FormPreview, FormSection } from '@/components/ui/FormPage';
import { ToothSpan } from '@/components/works/ToothSpan';
import { WorkLinesField, type LineDraft } from '@/components/works/WorkLinesField';
import { saveWork } from '@/lib/actions/works';
import { useRecoveredForm } from '@/lib/form-recovery';
import { elementsOf } from '@/lib/works';

/**
 * A new row of the works register, as a screen rather than a dialog.
 *
 * The same rule the rest of the app follows: a record the practice *sets up* is
 * a page, a correction to a row you are already looking at is a dialog. A case
 * is set up — it is copied off a docket with several pieces of work on it, and a
 * modal that throws all of that away on a stray Escape is the wrong container.
 *
 * Picking a patient fills the name and the number in rather than replacing them:
 * the register keeps its own copy of both, because the docket that went to the
 * lab has them printed on it. See `Work.patientName`.
 */
export function NewWorkForm({
  labs = [],
  procedures = [],
  today,
}: {
  /** The catalogue of laboratories the line picker offers. */
  labs?: Array<{ id: string; name: string }>;
  procedures?: Array<{ id: string; name: string }>;
  today: string;
}) {
  const t = useTranslations('works');
  const tc = useTranslations('common');
  const tt = useTranslations('teeth');
  const uid = useId();

  const { state, formAction, formRef } = useRecoveredForm(saveWork);

  const [lines, setLines] = useState<LineDraft[]>([
    // One row to start: the case is the reason this screen was opened, and making
    // the first act "press Add" is a step that teaches nothing.
    { key: 'line-1', elements: 1, procedure: '', procedureId: '', lab: '', labId: '', teeth: '' },
  ]);
  const [preview, setPreview] = useState({ patientName: '', phone: '', labSerial: '' });

  return (
    <form ref={formRef} action={formAction}>
      <FormLayout
        aside={
          <FormPreview title={t('previewTitle')}>
            <p className="text-lead font-bold text-ink">
              {preview.patientName.trim() || <span className="text-ink-faint">{t('new')}</span>}
            </p>
            <p className="mt-1 text-body text-ink-soft tabular-nums">
              {preview.phone.trim() || '—'}
            </p>
            {preview.labSerial.trim() ? (
              <p className="mt-1 text-body text-ink-soft">
                {t('labSerial')}: <span className="tabular-nums">{preview.labSerial}</span>
              </p>
            ) : null}

            {/* The element count, large, because it is the figure this whole
                register exists to be able to check an invoice against. */}
            <p className="mt-4 text-[2rem] leading-none font-bold text-ink tabular-nums">
              {elementsOf({ lines: lines.filter((line) => line.procedure.trim()) })}
            </p>
            <p className="text-meta font-semibold tracking-wide text-ink-faint uppercase">
              {t('elements')}
            </p>

            <p className="mt-3 text-body text-ink-soft">
              {t('lineCount', { count: lines.filter((line) => line.procedure.trim()).length })}
            </p>

            <ul className="mt-2 space-y-1.5">
              {lines
                .filter((line) => line.procedure.trim())
                .map((line) => (
                  <li key={line.key} className="text-body text-ink-soft">
                    <span className="block truncate">
                      {[`${line.elements}×`, line.procedure, line.lab].filter(Boolean).join(' · ')}
                    </span>
                    {/* The span as it will be printed on the register — the one
                        part of a row that is worth checking against the docket
                        before the case is saved. */}
                    <ToothSpan
                      value={line.teeth}
                      quadrantLabel={(quadrant) => tt(`quadrant_${quadrant}`)}
                      className="mt-0.5 text-meta"
                    />
                  </li>
                ))}
            </ul>
          </FormPreview>
        }
      >
        <FormSection
          title={t('sectionPatient')}
          subtitle={t('sectionPatientHint')}
          icon={<User size={22} aria-hidden />}
        >
          <PatientPicker
            name="patientId"
            label={t('linkPatient')}
            onPick={(patient) => {
              if (!patient) return;
              // Written straight into the fields, which stay editable: what goes
              // on the docket is whatever the practice writes here.
              const form = formRef.current;
              const name = form?.elements.namedItem('patientName');
              const phone = form?.elements.namedItem('phone');
              if (name instanceof HTMLInputElement) name.value = patient.name;
              if (phone instanceof HTMLInputElement) phone.value = patient.phone ?? '';
              setPreview((current) => ({
                ...current,
                patientName: patient.name,
                phone: patient.phone ?? '',
              }));
            }}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id={`${uid}-patientName`}
              name="patientName"
              label={t('patientName')}
              required
              autoComplete="off"
              defaultValue=""
              onChange={(event) =>
                setPreview((current) => ({ ...current, patientName: event.target.value }))
              }
            />
            <TextField
              id={`${uid}-phone`}
              name="phone"
              type="tel"
              label={t('phone')}
              required
              autoComplete="off"
              defaultValue=""
              onChange={(event) =>
                setPreview((current) => ({ ...current, phone: event.target.value }))
              }
            />
          </div>

        </FormSection>

        <FormSection
          title={t('sectionWork')}
          subtitle={t('sectionWorkHint')}
          icon={<FlaskConical size={22} aria-hidden />}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id={`${uid}-labSerial`}
              name="labSerial"
              label={t('labSerial')}
              hint={t('labSerialHint')}
              optional={tc('optional')}
              autoComplete="off"
              onChange={(event) =>
                setPreview((current) => ({ ...current, labSerial: event.target.value }))
              }
            />

            {/* Which month the case counts towards. Defaults to today, because a
                docket is nearly always written as the impression goes out — and
                stays editable, because "nearly always" is not always. */}
            <TextField
              id={`${uid}-sentAt`}
              name="sentAt"
              type="date"
              label={t('sentAt')}
              hint={t('sentAtHint')}
              defaultValue={today}
              required
            />
          </div>

          {/* When the laboratory said it would be back. Left empty deliberately
              rather than guessed at: a date the app invented would put the case
              on the chase list on a day nobody promised anything, and a chase
              list that cries wolf is one the practice stops opening. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id={`${uid}-dueAt`}
              name="dueAt"
              type="date"
              label={t('dueAt')}
              hint={t('dueAtHint')}
              optional={tc('optional')}
            />

            <label className="flex items-center gap-2.5 self-end pb-2 font-semibold text-ink">
              <input
                type="checkbox"
                name="urgent"
                className="size-5 accent-[var(--color-danger)]"
              />
              {t('urgent')}
            </label>
          </div>

          <div>
            <p className="field-label">{t('lines')}</p>
            <WorkLinesField
              value={lines}
              onChange={setLines}
              labs={labs}
              procedures={procedures}
            />
          </div>
        </FormSection>

        <FormSection
          title={tc('notes')}
          subtitle={t('sectionNotesHint')}
          icon={<StickyNote size={22} aria-hidden />}
        >
          <TextAreaField
            id={`${uid}-notes`}
            name="notes"
            label={tc('notes')}
            labelHidden
            optional={tc('optional')}
            rows={3}
          />
        </FormSection>
      </FormLayout>

      <FormActions
        state={state}
        cancelHref="/works"
        cancelLabel={tc('cancel')}
        discardMessage={tc('discardUnsaved')}
        saveLabel={tc('save')}
        pendingLabel={tc('saving')}
      />
    </form>
  );
}
