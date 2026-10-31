'use client';

import { Check, Copy, KeyRound, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { buttonClass, inputClass } from '@/components/ui';

/** Creates a personal MCP key and shows it once, with how to connect it. */
export function NewApiKey({ mcpUrl }: { mcpUrl: string }) {
  const t = useTranslations('settings');
  const router = useRouter();
  const [name, setName] = useState('');
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch('/api/me/api-keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    const data = (await res.json().catch(() => ({}))) as { key?: string; error?: string };
    setBusy(false);
    if (!res.ok || !data.key) return setError(data.error ?? t('keyError'));
    setKey(data.key);
    setName('');
    router.refresh();
  }

  const copy = async (label: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  const claudeCode = key ? `claude mcp add --transport http anfitria ${mcpUrl} --header "Authorization: Bearer ${key}"` : '';

  return (
    <div className="space-y-3">
      {key ? (
        <div className="space-y-2 rounded-xl border border-brand/40 bg-brand-soft/40 p-3 text-sm">
          <p className="font-medium text-brand-ink">{t('keyOnce')}</p>
          {[
            ['key', key],
            ['url', mcpUrl],
            ['claude', claudeCode],
          ].map(([label, value]) => (
            <div key={label}>
              <div className="mb-1 text-xs text-muted">{t(`keyField_${label}`)}</div>
              <div className="flex gap-2">
                <input readOnly value={value} className={inputClass + ' h-9 py-1 font-mono text-xs'} onFocus={(e) => e.currentTarget.select()} />
                <button type="button" onClick={() => copy(label, value)} className={buttonClass('ghost', 'sm')} aria-label={t('copy')}>
                  {copied === label ? <Check className="size-4" /> : <Copy className="size-4" />}
                </button>
              </div>
            </div>
          ))}
          <p className="text-xs text-muted">{t('keyChatgpt')}</p>
          <button type="button" onClick={() => setKey(null)} className="text-xs underline">{t('keyDone')}</button>
        </div>
      ) : (
        <form onSubmit={create} className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} placeholder={t('keyNamePh')} aria-label={t('keyName')} className={inputClass} />
          <button disabled={busy} className={buttonClass('primary', 'sm') + ' shrink-0'}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />} {t('keyCreate')}
          </button>
        </form>
      )}
      {error && <p className="text-xs text-terra-ink" role="alert">{error}</p>}
    </div>
  );
}
