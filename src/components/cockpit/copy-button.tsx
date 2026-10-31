'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { buttonClass } from '@/components/ui';

/** Copies the text of the field with the given id (so edits are copied too). */
export function CopyButton({ targetId, label }: { targetId: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        const el = document.getElementById(targetId) as HTMLTextAreaElement | null;
        if (!el) return;
        await navigator.clipboard.writeText(el.value);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className={buttonClass('ghost', 'sm')}
    >
      {done ? <Check className="size-4" /> : <Copy className="size-4" />} {label}
    </button>
  );
}
