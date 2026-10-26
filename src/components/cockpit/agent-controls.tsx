'use client';

import { Loader2, Play } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ProposalCard } from '@/components/assistant/proposal-card';
import { buttonClass } from '@/components/ui';
import type { Proposal } from '@/lib/types';

export function RunAgentButton({ agent, disabled }: { agent: string; disabled?: boolean }) {
  const t = useTranslations('agents');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function run() {
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/agents/${agent}/run`, { method: 'POST' });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) setMsg(data.error ?? String(res.status));
    router.refresh();
  }
  return (
    <div>
      <button onClick={run} disabled={busy || disabled} className={buttonClass('ghost', 'sm')}>
        {busy ? <Loader2 className="animate-spin" /> : <Play />} {t('runNow')}
      </button>
      {msg && <p className="mt-1 max-w-xs text-xs text-terra">{msg}</p>}
    </div>
  );
}

export function ProposalQueue({ proposals }: { proposals: Proposal[] }) {
  const router = useRouter();
  const decide = async (id: string, decision: 'approve' | 'reject', text?: string) => {
    await fetch(`/api/proposals/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, text }) });
    router.refresh();
  };
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {proposals.map((p) => (
        <ProposalCard key={p.id} proposal={p} onDecide={decide} />
      ))}
    </div>
  );
}
