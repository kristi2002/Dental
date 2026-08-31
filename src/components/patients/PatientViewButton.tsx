'use client';

import { Presentation, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useRef } from 'react';

/**
 * Opens the patient-facing view over the whole screen.
 *
 * A modal rather than a route, and the gesture is the argument: this is what
 * the dentist reaches for when they turn the monitor round, and it has to come
 * back to exactly the chart they were working on when they turn it back. A
 * navigation loses the scroll position, the open tab and the chart's own state;
 * `Escape` loses nothing.
 *
 * It also means there is no second URL to protect. The content is rendered by
 * the page that already proved the viewer may see this patient, and arrives
 * here as `children` — so this file holds no patient data of its own and adds
 * no server surface. That is the reason for the `children` shape rather than
 * the obvious one of passing the records in and rendering them here: it keeps
 * `PatientView` a server component, off the client bundle, and keeps the
 * permission check in exactly one place.
 *
 * The idle lock still applies. It is mounted on the app layout rather than per
 * page, so a screen left facing the waiting room locks on the same timer as any
 * other — which matters more here than anywhere, this being the one screen
 * deliberately pointed away from staff.
 */
export function PatientViewButton({ children }: { children: ReactNode }) {
  const t = useTranslations('patients');
  const tc = useTranslations('common');
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => dialogRef.current?.showModal()}
      >
        <Presentation size={18} aria-hidden />
        {t('showToPatient')}
      </button>

      <dialog
        ref={dialogRef}
        aria-label={t('patientViewHeading')}
        // Native `<dialog>` sizes itself to its content and caps at roughly the
        // viewport less a margin; all four have to be unset for a full-bleed
        // panel. `overflow-y-auto` rather than `hidden`, because a mouth with a
        // dozen findings in it is taller than a laptop.
        className="h-full max-h-none w-full max-w-none overflow-y-auto border-0 bg-navy p-0 backdrop:bg-navy/80"
      >
        {/* Fixed rather than sticky: the panel scrolls, and a close control that
            scrolls away on the one screen being handed to somebody else is how
            a dentist ends up hunting for it in front of a patient. */}
        <button
          type="button"
          className="fixed top-4 right-4 z-10 grid size-11 place-items-center rounded-full border border-navy-line bg-navy/80 text-navy-ink-soft backdrop-blur-sm hover:text-navy-ink"
          aria-label={tc('close')}
          onClick={() => dialogRef.current?.close()}
        >
          <X size={22} aria-hidden />
        </button>

        {children}
      </dialog>
    </>
  );
}
