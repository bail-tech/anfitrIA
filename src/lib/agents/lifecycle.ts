/**
 * Scheduled guest messages (pre-arrival, check-out) from templates the host approved once.
 * Runs daily (Vercel Hobby crons are daily); each message goes out in the run nearest its due time. Inside WhatsApp's 24-hour window it sends; otherwise (WhatsApp needs a
 * Meta-approved template for business-initiated messages) it leaves a card for the host.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { features } from '@/lib/env';
import { inServiceWindow, sendText } from '@/lib/channels/whatsapp';
import type { Conversation, MessageTemplate, Property, Reservation } from '@/lib/types';

/** Half the cron period: with a daily run, every due time falls in exactly one run's window. */
export const SEND_WINDOW_MS = 12 * 3_600_000;

const PLACEHOLDER = /\{(guest_name|check_in|check_out|check_in_time|check_out_time|property_name)\}/g;

export function renderTemplate(body: string, r: Pick<Reservation, 'guest_name' | 'check_in' | 'check_out'>, p: Pick<Property, 'name' | 'check_in_time' | 'check_out_time'>): string {
  const values: Record<string, string> = {
    guest_name: r.guest_name.split(' ')[0],
    check_in: r.check_in,
    check_out: r.check_out,
    check_in_time: p.check_in_time.slice(0, 5),
    check_out_time: p.check_out_time.slice(0, 5),
    property_name: p.name,
  };
  return body.replace(PLACEHOLDER, (_, k: string) => values[k]);
}

/** When a template is due for a reservation (UTC-naive local time of the property). */
export function dueAt(t: Pick<MessageTemplate, 'kind' | 'send_offset_hours'>, r: Pick<Reservation, 'check_in' | 'check_out'>, p: Pick<Property, 'check_in_time' | 'check_out_time'>): number {
  const anchor = t.kind === 'pre_arrival' ? Date.parse(`${r.check_in}T${p.check_in_time.slice(0, 5)}:00Z`) : Date.parse(`${r.check_out}T${p.check_out_time.slice(0, 5)}:00Z`);
  return anchor + (t.send_offset_hours ?? (t.kind === 'pre_arrival' ? -24 : -3)) * 3_600_000;
}

/** Local wall-clock time of the property expressed as a UTC-naive timestamp (matches dueAt). */
function localNow(timeZone: string, now: Date): number {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (t: string) => parts.find((x) => x.type === t)?.value ?? '00';
  return Date.parse(`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:00Z`);
}

export async function runLifecycle(db: SupabaseClient, orgId: number, now = new Date()): Promise<{ sent: number; carded: number }> {
  const { data: templates } = await db.from('message_templates').select('*').eq('org_id', orgId).eq('approved', true).in('kind', ['pre_arrival', 'checkout']);
  if (!templates?.length) return { sent: 0, carded: 0 };
  const { data: props } = await db.from('properties').select('*').eq('org_id', orgId);
  const properties = (props ?? []) as Property[];
  let sent = 0;
  let carded = 0;
  for (const p of properties) {
    const local = localNow(p.timezone, now);
    const { data: res } = await db.from('reservations').select('*').eq('property_id', p.id).neq('status', 'cancelled');
    for (const r of (res ?? []) as Reservation[]) {
      for (const t of (templates as MessageTemplate[]).filter((x) => x.property_id === null || x.property_id === p.id)) {
        const due = dueAt(t, r, p);
        if (Math.abs(local - due) >= SEND_WINDOW_MS) continue; // daily cron: the run nearest the due time sends it
        const key = `lifecycle:${t.id}:${r.id}`;
        const { data: done } = await db.from('audit_logs').select('id').eq('org_id', orgId).eq('action', 'lifecycle_message').eq('detail', key).maybeSingle();
        if (done) continue;
        const text = renderTemplate(t.body, r, p);
        const { data: conv } = await db.from('conversations').select('*').eq('property_id', p.id).eq('guest_ref', r.guest_ref).eq('channel', 'whatsapp').maybeSingle<Conversation>();
        if (conv && features.whatsapp() && inServiceWindow(conv.last_guest_message_at, now.getTime())) {
          const externalId = await sendText(conv.guest_ref, text);
          await db.from('messages').insert({ conversation_id: conv.id, direction: 'out', text, external_id: externalId });
          sent++;
        } else if (conv) {
          await db.from('proposals').insert({ org_id: orgId, agent: 'guest', kind: 'guest_message', conversation_id: conv.id, title: `${t.title || t.kind} para ${r.guest_name}`, payload: { text, draft_id: null, as_voice: false, learn_category: null, reason: 'outside_24h_window' } });
          carded++;
        } else continue; // no WhatsApp chat with this guest yet
        await db.from('audit_logs').insert({ org_id: orgId, actor: 'ai', action: 'lifecycle_message', detail: key, conversation_id: conv.id });
      }
    }
  }
  return { sent, carded };
}
