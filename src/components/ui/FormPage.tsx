'use client';

import type { ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import type { ActionState } from '@/lib/actions/types';
import { SubmitButton } from './SubmitButton';

/**
 * The furniture every "add a new one" screen is built from.
 *
 * Creating a record is a page in this app, not a dialog, wherever the record is
 * one the practice sets up rather than one it fills in daily — the catalogue,
 * the shelves, the rooms, the people, a course of treatment. A page has room to
 * say what a field is *for*, can be left and come back to, survives a stray
 * press of Escape, and can be linked to from anywhere. Editing stays a dialog:
 * that is a correction to a row you are already looking at, not a form you work
 * through.
 *
 * These four pieces are what keep those screens looking like one another rather
 * than like eight separate attempts.
 */

/** A card with a heading that says what the group of fields is for. */
export function FormSection({
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
  /** Replaces the default padded stack — for sections that lay their fields out in a grid. */
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
 * The form's column, and beside it the record being built.
 *
 * The preview is hidden below `xl` rather than stacked: on a narrow screen it
 * would sit under the save bar, where nobody would ever scroll to find it.
 */
export function FormLayout({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div
      className={
        aside
          ? 'grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]'
          : 'grid items-start gap-5'
      }
    >
      <div className="space-y-5">{children}</div>
      {aside}
    </div>
  );
}

/** What the row will look like once saved, kept in step as the form is typed. */
export function FormPreview({ title, children }: { title: string; children: ReactNode }) {
  return (
    <aside className="card sticky top-6 hidden p-5 xl:block">
      <h2 className="mb-3 text-[0.9rem] font-bold tracking-wide text-ink-faint uppercase">
        {title}
      </h2>
      {children}
    </aside>
  );
}

/**
 * Sticky, because these forms are longer than a screen and whoever is filling
 * one in is standing at the desk or in the storage room with something in hand.
 * Everything that decides whether the save will work lives in this one bar.
 */
export function FormActions({
  state,
  cancelHref,
  cancelLabel,
  saveLabel,
  pendingLabel,
  belowError,
  secondary,
}: {
  state: ActionState;
  /** Where cancelling goes — the list this record is being added to. */
  cancelHref: string;
  cancelLabel: string;
  saveLabel: string;
  pendingLabel: string;
  /** Shown under the refusal, for the errors a form can offer to work around. */
  belowError?: ReactNode;
  /** An extra action left of save — "save and add another", on the setup screens. */
  secondary?: ReactNode;
}) {
  return (
    <div className="sticky bottom-0 z-10 mt-5 rounded-xl border border-line bg-surface px-5 py-4 shadow-pop">
      {state.status === 'error' ? (
        <div className="mb-3 space-y-3">
          <p
            role="alert"
            className="rounded-lg border border-danger bg-danger-soft px-3 py-2 font-semibold text-danger"
          >
            {state.message}
          </p>
          {belowError}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Link href={cancelHref} className="btn btn-secondary">
          {cancelLabel}
        </Link>
        {secondary}
        <SubmitButton label={saveLabel} pendingLabel={pendingLabel} />
      </div>
    </div>
  );
}
