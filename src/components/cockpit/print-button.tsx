'use client';

import { Printer } from 'lucide-react';
import { buttonClass } from '@/components/ui';

/** Prints the page (or saves it as PDF from the print dialog). */
export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={buttonClass('ghost', 'sm')}>
      <Printer className="size-4" /> {label}
    </button>
  );
}
