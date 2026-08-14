'use client';

import { Cake, ClipboardList, MessageCircle, Phone, Stethoscope, UserRound, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState, type ReactNode } from 'react';
import {
  ContactFields,
  DuplicateOverride,
  GuardianFields,
  IdentityFields,
  MedicalField,
  RecordFields,
} from '@/components/patients/PatientFields';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import { savePatient } from '@/lib/actions/patients';
import { age } from '@/lib/dates';
import { useRecoveredForm } from '@/lib/form-recovery';
import { initials } from '@/lib/utils';

/** A card with a heading that says what the group of fields is for. */
function Section({
  title,
  subtitle,
  icon,
  children,
  className,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className="card overflow-hidden">
      <header className="flex items-start gap-3 border-b border-line bg-surface-soft px-5 py-4">
        <span className="mt-0.5 text-brand">{icon}</span>
        <div>
          <h2 className="text-[1.15rem] font-bold text-ink">{title}</h2>
          <p className="text-[0.95rem] text-ink-soft">{subtitle}</p>
        </div>
      </header>
      <div className={className ?? 'space-y-4 p-5'}>{children}</div>
    </section>
  );
}

/**
 * Registering somebody, as a screen rather than as a dialog.
 *
 * This is the longest form in the app and the one most often filled in with a
 * patient standing at the desk, so it was the wrong thing to keep behind a
 * modal: a modal has no room to explain a group of fields, scrolls its own
 * little window inside the page, and loses everything typed if it is dismissed
 * by accident. A page can be left and come back to, deep-linked from anywhere,
 * and read in one pass.
 *
 * Editing stays a dialog — that is a correction to one field on a record you are
 * already looking at, not a form you work through.
 */
export function NewPatientForm({
  referralSources,
  canEditMedical,
}: {
  referralSources: string[];
  canEditMedical: boolean;
}) {
  const t = useTranslations('patients');
  const tc = useTranslations('common');
  const uid = useId();

  const { state, formAction, formRef } = useRecoveredForm(savePatient);

  // Set only after the server reports somebody already using this number:
  // creating a second record for one person should be a decision, never a
  // default.
  const [force, setForce] = useState(false);

  // What the record will look like once saved, kept in step as it is typed. The
  // fields stay uncontrolled — this listens to the change events they bubble, so
  // the preview costs the form nothing and cannot fall out of sync with it.
  const [preview, setPreview] = useState({ firstName: '', lastName: '', phone: '', dateOfBirth: '' });

  const fullName = `${preview.lastName} ${preview.firstName}`.trim();
  const born = preview.dateOfBirth ? new Date(`${preview.dateOfBirth}T00:00:00.000Z`) : null;
  const years = born && !Number.isNaN(born.getTime()) ? age(born) : null;

  return (
    <form
      ref={formRef}
      action={formAction}
      onChange={(event) => {
        const field = event.target;
        if (!(field instanceof HTMLInputElement)) return;
        if (field.name in preview) {
          setPreview((current) => ({ ...current, [field.name]: field.value }));
        }
      }}
    >
      {force ? <input type="hidden" name="force" value="1" /> : null}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          <Section
            title={t('sectionIdentity')}
            subtitle={t('sectionIdentityHint')}
            icon={<UserRound size={22} aria-hidden />}
          >
            <IdentityFields uid={uid} />
          </Section>

          <Section
            title={t('contactTitle')}
            subtitle={t('contactHint')}
            icon={<MessageCircle size={22} aria-hidden />}
            className="grid gap-4 p-5 sm:grid-cols-3"
          >
            <ContactFields uid={uid} />
          </Section>

          <Section
            title={t('guardianTitle')}
            subtitle={t('guardianHint')}
            icon={<Users size={22} aria-hidden />}
            className="grid gap-4 p-5 sm:grid-cols-2"
          >
            <GuardianFields uid={uid} />
          </Section>

          <Section
            title={t('sectionRecords')}
            subtitle={t('sectionRecordsHint')}
            icon={<ClipboardList size={22} aria-hidden />}
          >
            <RecordFields uid={uid} referralSources={referralSources} />
          </Section>

          {canEditMedical ? (
            <Section
              title={t('medicalNotes')}
              subtitle={t('medicalNotesHint')}
              icon={<Stethoscope size={22} aria-hidden />}
            >
              <MedicalField uid={uid} labelled={false} />
            </Section>
          ) : null}
        </div>

        {/* The card this form is building, as it is built. It is the same shape
            the patient list shows, so what is being made is what will be seen —
            and a first name typed into the surname box is obvious here long
            before it is filed that way. */}
        <aside className="card sticky top-6 hidden p-5 xl:block">
          <h2 className="mb-3 text-[0.9rem] font-bold tracking-wide text-ink-faint uppercase">
            {t('previewTitle')}
          </h2>

          <div className="flex items-start gap-4">
            <span
              aria-hidden
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-line-strong bg-paper text-[1.05rem] font-bold text-ink-soft"
            >
              {initials(preview.firstName, preview.lastName) || '—'}
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-[1.15rem] font-bold text-ink">
                {fullName || <span className="text-ink-faint">{t('new')}</span>}
              </p>

              <p className="mt-1 flex items-center gap-1.5 text-[0.95rem] text-ink-soft">
                <Phone size={15} aria-hidden />
                <span className="truncate">
                  {preview.phone || <span className="text-ink-faint">{t('noPhone')}</span>}
                </span>
              </p>

              {years !== null ? (
                <p className="mt-0.5 flex items-center gap-1.5 text-[0.95rem] text-ink-faint">
                  <Cake size={15} aria-hidden />
                  {t('age', { age: years })}
                </p>
              ) : null}
            </div>
          </div>
        </aside>
      </div>

      {/* Sticky, because the form is longer than a screen and the person filling
          it in is standing at the desk with somebody waiting. Everything that
          decides whether the save will work lives in this one bar. */}
      <div className="sticky bottom-0 z-10 mt-5 rounded-xl border border-line bg-surface px-5 py-4 shadow-pop">
        {state.status === 'error' ? (
          <div className="mb-3 space-y-3">
            <p
              role="alert"
              className="rounded-lg border border-danger bg-danger-soft px-3 py-2 font-semibold text-danger"
            >
              {state.message}
            </p>
            {state.code === 'duplicate' ? (
              <DuplicateOverride checked={force} onChange={setForce} />
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-end gap-3">
          <Link href="/patients" className="btn btn-secondary">
            {tc('cancel')}
          </Link>
          <SubmitButton label={tc('save')} pendingLabel={tc('saving')} />
        </div>
      </div>
    </form>
  );
}
