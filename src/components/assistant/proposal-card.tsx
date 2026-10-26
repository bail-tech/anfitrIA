'use client';

import { Check, Loader2, Pencil, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Badge, buttonClass, inputClass } from '@/components/ui';
import type { Proposal } from '@/lib/types';

const KIND_TONE = { guest_message: 'violet', staff_message: 'sage', knowledge: 'gold', price: 'terra', listing_copy: 'violet', review_reply: 'violet', task: 'neutral' } as const;

/** An approval card: nothing reaches a guest, staff or the knowledge until the host taps here. */
export function ProposalCard({ proposal, onDecide }: { proposal: Proposal; onDecide: (id: string, d: 'approve' | 'reject', text?: string) => Promise<void> }) {
  const t = useTranslations('assistant');
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [editing, setEditing] = useState(false);
  const payload = proposal.payload as Record<string, unknown>;
  const text = typeof payload.text === 'string' ? payload.text : null;
  const [draft, setDraft] = useState(text ?? '');
  const items = Array.isArray(payload.items) ? (payload.items as Array<{ category: string; content: string; is_private?: boolean }>) : null;
  const pending = proposal.status === 'pending';

  async function decide(d: 'approve' | 'reject') {
    setBusy(d);
    await onDecide(proposal.id, d, editing && text !== null ? draft : undefined);
    setBusy(null);
    setEditing(false);
  }

  return (
    <div className="rounded-2xl border border-gold/40 bg-gold-soft/40 p-3 text-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-medium">{proposal.title}</span>
        <Badge tone={KIND_TONE[proposal.kind] ?? 'neutral'}>{proposal.kind.replace('_', ' ')}</Badge>
      </div>
      {text !== null &&
        (editing ? (
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} className={inputClass} />
        ) : (
          <p className="whitespace-pre-wrap rounded-xl bg-paper px-3 py-2 text-ink/90">{draft}</p>
        ))}
      {payload.as_voice === true && <p className="mt-1 text-xs text-muted">🎙️ {t('asVoice')}</p>}
      {items && (
        <ul className="space-y-1">
          {items.map((it, i) => (
            <li key={i} className="rounded-lg bg-paper px-2 py-1">
              <span className="text-xs text-muted">{it.category}{it.is_private ? ' 🔒' : ''}: </span>
              {it.is_private ? '••••' : it.content}
            </li>
          ))}
        </ul>
      )}
      {typeof payload.suggested_price === 'number' && (
        <p className="rounded-xl bg-paper px-3 py-2">
          {String(payload.from)} → {String(payload.to)}: <b>{payload.suggested_price} €</b>
          {typeof payload.current_price === 'number' && <span className="text-muted"> ({payload.current_price} € ahora)</span>}
          <br />
          <span className="text-xs text-muted">{String(payload.evidence ?? '')}</span>
        </p>
      )}
      {pending ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => decide('approve')} disabled={busy !== null} className={buttonClass('primary', 'sm')}>
            {busy === 'approve' ? <Loader2 className="animate-spin" /> : <Check />}
            {proposal.kind === 'guest_message' || proposal.kind === 'staff_message' ? t('approve') : t('approveOnly')}
          </button>
          {text !== null && !editing && (
            <button onClick={() => setEditing(true)} className={buttonClass('ghost', 'sm')}>
              <Pencil /> {t('edit')}
            </button>
          )}
          <button onClick={() => decide('reject')} disabled={busy !== null} className={buttonClass('ghost', 'sm')}>
            {busy === 'reject' ? <Loader2 className="animate-spin" /> : <X />} {t('reject')}
          </button>
        </div>
      ) : (
        <div className="mt-2">
          <Badge tone={proposal.status === 'failed' ? 'terra' : proposal.status === 'rejected' ? 'neutral' : 'sage'}>{t(proposal.status as 'applied')}</Badge>
        </div>
      )}
    </div>
  );
}
