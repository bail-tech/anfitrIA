'use client';

import { Loader2, Send } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { Badge, buttonClass, Card, Field, inputClass } from '@/components/ui';
import type { Message } from '@/lib/types';
import { cn } from '@/lib/utils';

const EXAMPLES = ['¿Cuál es la contraseña del wifi?', 'What time is check-out?', 'Où puis-je garer la voiture ?', '¿Puedo hacer el check-out más tarde?', 'Hay una fuga de agua en el baño!'];

export function Simulator({ properties, guests }: { properties: Array<{ id: number; name: string }>; guests: Array<{ property_id: number; guest_ref: string; guest_name: string }> }) {
  const t = useTranslations('simulator');
  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? 0);
  const [guestRef, setGuestRef] = useState(guests.find((g) => g.property_id === properties[0]?.id)?.guest_ref ?? '+34600000000');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [thread, setThread] = useState<Message[]>([]);
  const [last, setLast] = useState<{ answered: boolean; reason: string | null; conversation_id: number } | null>(null);

  async function send(e?: FormEvent, value?: string) {
    e?.preventDefault();
    const body = (value ?? text).trim();
    if (!body) return;
    setBusy(true);
    const res = await fetch('/api/simulator', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ property_id: propertyId, guest_ref: guestRef, text: body }) });
    const data = (await res.json()) as { messages?: Message[]; answered: boolean; reason: string | null; conversation_id: number; error?: string };
    setBusy(false);
    if (res.ok) {
      setThread(data.messages ?? []);
      setLast({ answered: data.answered, reason: data.reason, conversation_id: data.conversation_id });
      setText('');
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <Card className="h-fit space-y-3 p-4">
        <Field label={t('property')}>
          <select
            value={propertyId}
            onChange={(e) => {
              const id = Number(e.target.value);
              setPropertyId(id);
              setThread([]);
              setGuestRef(guests.find((g) => g.property_id === id)?.guest_ref ?? '+34600000000');
            }}
            className={inputClass}
          >
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('phone')}>
          <input value={guestRef} onChange={(e) => setGuestRef(e.target.value)} list="sim-guests" className={inputClass} />
          <datalist id="sim-guests">
            {guests
              .filter((g) => g.property_id === propertyId)
              .map((g) => (
                <option key={g.guest_ref} value={g.guest_ref}>
                  {g.guest_name}
                </option>
              ))}
          </datalist>
        </Field>
        <div className="text-xs text-muted">{t('try')}</div>
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button key={ex} onClick={() => void send(undefined, ex)} className="rounded-full border border-line bg-paper px-2.5 py-1 text-left text-xs hover:bg-sand">
              {ex}
            </button>
          ))}
        </div>
      </Card>
      <Card className="flex min-h-[420px] flex-col p-4">
        <div className="flex-1 space-y-2 rounded-2xl bg-[#e9e2d3]/50 p-3">
          {thread.map((m) => (
            <div key={m.id} className={cn('flex', m.direction === 'in' ? 'justify-end' : 'justify-start')}>
              <div className={cn('max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm', m.direction === 'in' ? 'rounded-br-md bg-[#d9f5c9]' : 'rounded-bl-md bg-paper')}>{m.text}</div>
            </div>
          ))}
        </div>
        {last && (
          <div className="mt-3 flex items-center gap-2 text-sm">
            <Badge tone={last.answered ? 'sage' : last.reason === 'urgente' ? 'terra' : 'gold'}>{last.answered ? t('answered') : `${t('escalated')} · ${last.reason}`}</Badge>
            {!last.answered && (
              <Link href={`/bandeja/${last.conversation_id}`} className="text-xs underline">
                {t('openInInbox')}
              </Link>
            )}
          </div>
        )}
        <form onSubmit={send} className="mt-3 flex gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('placeholder')} className={inputClass} />
          <button disabled={busy || !text.trim()} className={buttonClass('primary')}>
            {busy ? <Loader2 className="animate-spin" /> : <Send />} {t('send')}
          </button>
        </form>
      </Card>
    </div>
  );
}
