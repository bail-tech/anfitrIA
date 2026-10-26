import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { Badge, Card, Empty, PageHeader } from '@/components/ui';
import { requireSession } from '@/lib/supabase/server';
import type { Conversation, Draft, Message } from '@/lib/types';
import { cn, relativeTime } from '@/lib/utils';

export const metadata = { title: 'Bandeja' };

type Filter = 'pending' | 'live' | 'all';

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { db } = await requireSession();
  const t = await getTranslations('inbox');
  const locale = await getLocale();
  const filter: Filter = ((await searchParams).f as Filter) ?? 'pending';

  const [{ data: convs }, { data: props }, { data: reservations }] = await Promise.all([
    db.from('conversations').select('*').order('created_at', { ascending: false }).limit(200),
    db.from('properties').select('id, name'),
    db.from('reservations').select('id, guest_name'),
  ]);
  const conversations = (convs ?? []) as Conversation[];
  const ids = conversations.map((c) => c.id);
  const { data: msgs } = ids.length ? await db.from('messages').select('id, conversation_id, direction, text, kind, created_at').in('conversation_id', ids).order('id', { ascending: false }).limit(1000) : { data: [] };
  const messages = (msgs ?? []) as Message[];
  const inboundIds = messages.filter((m) => m.direction === 'in').map((m) => m.id);
  const { data: drafts } = inboundIds.length ? await db.from('drafts').select('inbound_message_id, reason, status').in('inbound_message_id', inboundIds).eq('status', 'pending') : { data: [] };
  const pendingByMsg = new Map(((drafts ?? []) as Draft[]).map((d) => [d.inbound_message_id, d]));
  const pname = new Map((props ?? []).map((p) => [p.id, p.name]));
  const gname = new Map((reservations ?? []).map((r) => [r.id, r.guest_name]));

  const rows = conversations
    .map((c) => {
      const mine = messages.filter((m) => m.conversation_id === c.id);
      const last = mine[0];
      const pending = mine.map((m) => pendingByMsg.get(m.id)).find(Boolean) ?? null;
      return { c, last, pending };
    })
    .filter((r) => (filter === 'pending' ? r.pending : filter === 'live' ? r.c.handoff : true))
    .sort((a, b) => Number(Boolean(b.pending)) - Number(Boolean(a.pending)) || (b.last?.created_at ?? '').localeCompare(a.last?.created_at ?? ''));

  const tabs: Filter[] = ['pending', 'live', 'all'];
  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <div className="mb-4 flex gap-2">
        {tabs.map((f) => (
          <Link key={f} href={`/bandeja?f=${f}`} className={cn('rounded-full border px-3 py-1 text-sm', f === filter ? 'border-ink bg-ink text-cream' : 'border-line bg-paper')}>
            {t(f)}
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <Empty title={t('empty')} />
      ) : (
        <Card className="divide-y divide-line">
          {rows.map(({ c, last, pending }) => (
            <Link key={c.id} href={`/bandeja/${c.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-sand/40">
              <div className={cn('size-2.5 shrink-0 rounded-full', pending ? (pending.reason === 'urgente' ? 'bg-terra' : 'bg-gold') : c.handoff ? 'bg-violet' : 'bg-sage')} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{c.reservation_id ? gname.get(c.reservation_id) : c.guest_ref}</span>
                  <span className="text-muted">· {pname.get(c.property_id)}</span>
                  <Badge tone={c.channel === 'whatsapp' ? 'sage' : 'neutral'}>{t(c.channel === 'whatsapp' ? 'whatsapp' : 'sim')}</Badge>
                  {pending && <Badge tone={pending.reason === 'urgente' ? 'terra' : 'gold'}>{t(`reason_${pending.reason ?? 'sin_info'}` as 'reason_auto')}</Badge>}
                  {c.handoff && <Badge tone="violet">{t('live')}</Badge>}
                </div>
                <p className="truncate text-sm text-muted">
                  {last?.direction === 'out' ? '↩ ' : ''}
                  {last?.kind === 'audio' ? `🎙️ ${t('voiceNote')}: ` : ''}
                  {last?.text}
                </p>
              </div>
              <span className="shrink-0 font-mono text-xs text-muted">{last ? relativeTime(last.created_at, locale) : ''}</span>
            </Link>
          ))}
        </Card>
      )}
    </>
  );
}
