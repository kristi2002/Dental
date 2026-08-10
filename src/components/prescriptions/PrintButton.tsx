'use client';

import { Printer } from 'lucide-react';

/** The one line of client JavaScript the print sheet needs. */
export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" className="btn btn-primary" onClick={() => window.print()}>
      <Printer size={19} aria-hidden />
      {label}
    </button>
  );
}
