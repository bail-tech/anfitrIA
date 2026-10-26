import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { ThreadActions } from '@/components/inbox/thread-actions';
import { Badge, Card } from '@/components/ui';
import { inServiceWindow } from '@/lib/channels/whatsapp';
import { stayPhase, todayIn } from '@/lib/concierge/stay';
import { features } from '@/lib/env';
import { requireSession } from '@/lib/supabase/server';
import type { Conversation, Draft, Message, Property, Reservation } from '@/lib/types';
import { cn, relativeTime } from '@/lib/utils';

export const metadata = { title: 'Conversación' };

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { db } = await requireSession();
  const t = await getTranslations('inbox');
  const tr = await getTranslations('reservations');
  const locale = await getLocale();
  const id = Number((await params).id);
  const { data: conv } = await db.from('conversations').select('*').eq('id', id).maybeSingle<Conversation>();
  if (!conv) notFound();
  const [{ data: property }, { data: msgs }, { data: reservation }] = await Promise.all([
    db.from('properties').select('*').eq('id', conv.property_id).single<Property>(),
    db.from('messages').select('*').eq('conversation_id', id).order('id'),
    conv.reservation_id ? db.from('reservations').select('*').eq('id', conv.reservation_id).maybeSingle<Reservation>() : Promise.resolve({ data: null }),
  ]);
  const messages = (msgs ?? []) as Message[];
  const { data: drafts } = messages.length ? await db.from('drafts').select('*').in('inbound_message_id', messages.map((m) => m.id)) : { data: [] };
  const draftByMsg = new Map(((drafts ?? []) as Draft[]).map((d) => [d.inbound_message_id, d]));
  const pending = ((drafts ?? []) as Draft[]).filter((d) => d.status === 'pending').sort((a, b) => b.id - a.id)[0] ?? null;
  const pendingQuestion = pending ? messages.find((m) => m.id === pending.inbound_message_id)?.text ?? '' : '';

  // Signed URLs for voice notes (private bucket, 1 h).
  const audio = new Map<number, string>();
  for (const m of messages.filter((x) => x.media_path)) {
    const { data } = await db.storage.from('voice-notes').createSignedUrl(m.media_path!, 3600);
    if (data?.signedUrl) audio.set(m.id, data.signedUrl);
  }
  const windowOpen = conv.channel !== 'whatsapp' || inServiceWindow(conv.last_guest_message_at);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
      <div>
        <Link href="/bandeja" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
          <ArrowLeft className="size-4" /> {t('title')}
        </Link>
        <Card className="p-4">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <h1 className="font-display text-xl font-semibold">{reservation?.guest_name ?? conv.guest_ref}</h1>
            <span className="text-sm text-muted">· {property?.name}</span>
            <Badge tone={conv.channel === 'whatsapp' ? 'sage' : 'neutral'}>{t(conv.channel === 'whatsapp' ? 'whatsapp' : 'sim')}</Badge>
            {conv.handoff && <Badge tone="violet">{t('live')}</Badge>}
          </div>
          <div className="space-y-3">
            {messages.map((m) => {
              const d = draftByMsg.get(m.id);
              return (
                <div key={m.id} className={cn('flex flex-col', m.direction === 'out' ? 'items-end' : 'items-start')}>
                  <div className={cn('max-w-[85%] rounded-2xl px-3 py-2 text-sm', m.direction === 'out' ? 'rounded-br-md bg-ink text-cream' : 'rounded-bl-md border border-line bg-paper')}>
                    {m.kind === 'audio' && (
                      <div className="mb-1">
                        <div className="text-xs opacity-70">🎙️ {t('voiceNote')}</div>
                        {audio.get(m.id) && <audio controls src={audio.get(m.id)} className="mt-1 h-8 max-w-full" />}
                      </div>
                    )}
                    <p className="whitespace-pre-wrap">{m.kind === 'audio' && m.transcript ? `“${m.transcript}”` : m.text}</p>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-muted">
                    <span className="font-mono">{relativeTime(m.created_at, locale)}</span>
                    {d && d.reason && <span>· {t(`reason_${d.reason}` as 'reason_auto')} ({Math.round(d.confidence * 100)}%)</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
        <ThreadActions
          conversationId={conv.id}
          handoff={conv.handoff}
          windowOpen={windowOpen}
          ttsAvailable={features.openai()}
          draft={pending ? { id: pending.id, text: pending.text, confidence: pending.confidence, reason: pending.reason, question: pendingQuestion } : null}
        />
      </div>
      <Card className="h-fit space-y-3 p-4 text-sm">
        <div className="text-xs font-medium uppercase tracking-wider text-muted">{t('reservation')}</div>
        {reservation ? (
          <>
            <div className="font-medium">{reservation.guest_name}</div>
            <div>
              {reservation.check_in} → {reservation.check_out}
            </div>
            <div className="flex flex-wrap gap-1">
              <Badge tone="gold">{reservation.source}</Badge>
              <Badge tone="sage">{tr(`phase_${stayPhase(reservation.check_in, reservation.check_out, todayIn(property?.timezone))}` as 'phase_durante')}</Badge>
            </div>
            {reservation.code && <div className="font-mono text-xs text-muted">{reservation.code}</div>}
          </>
        ) : (
          <p className="text-muted">{t('noReservation')}</p>
        )}
        <div className="border-t border-line pt-3 font-mono text-xs text-muted">{conv.guest_ref}</div>
      </Card>
    </div>
  );
}
