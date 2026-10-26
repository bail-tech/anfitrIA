'use client';

import { Loader2, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { buttonClass, inputClass } from '@/components/ui';

/** Generic multipart upload to an API route (knowledge import, iCal import). */
export function UploadForm({ action, fields, accept, label, withUrl, urlPlaceholder }: { action: string; fields: Record<string, string>; accept: string; label: string; withUrl?: boolean; urlPlaceholder?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    for (const [k, v] of Object.entries(fields)) form.set(k, v);
    setBusy(true);
    const res = await fetch(action, { method: 'POST', body: form });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    setBusy(false);
    setResult(res.ok ? Object.entries(data).map(([k, v]) => `${k}: ${String(v)}`).join(' · ') : String(data.error ?? res.status));
    if (res.ok) router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input type="file" name="file" accept={accept} className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-sand file:px-3 file:py-1.5" />
        {withUrl && <input name="url" placeholder={urlPlaceholder} className={inputClass + ' max-w-sm'} />}
        <button disabled={busy} className={buttonClass('ghost')}>
          {busy ? <Loader2 className="animate-spin" /> : <Upload />} {label}
        </button>
      </div>
      {result && <p className="text-xs text-muted">{result}</p>}
    </form>
  );
}
