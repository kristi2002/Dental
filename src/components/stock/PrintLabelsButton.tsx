'use client';

import { Printer } from 'lucide-react';

/**
 * The one control on the label sheet that cannot be a link.
 *
 * Its own component rather than a shared one with the prescription sheet's
 * button: that one is a page's single primary action, and this one sits in a row
 * of filters and carries a count, because "print" on a filtered list has to say
 * how many stickers are about to come out of the printer.
 */
export function PrintLabelsButton({ label }: { label: string }) {
  return (
    <button type="button" className="btn btn-primary" onClick={() => window.print()}>
      <Printer size={18} aria-hidden />
      {label}
    </button>
  );
}
