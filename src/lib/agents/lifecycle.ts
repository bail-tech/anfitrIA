/**
 * The guest journey: scheduled guest messages from templates the host approved once, each
 * anchored to the booking, the check-in or the check-out, with optional conditions.
 * Runs daily (Vercel Hobby crons are daily). A message goes out in the first run from 12 h before
 * it is due until 24 h after; the audit log makes sure it goes out once. If the channel cannot
 * send right now it leaves a card for the host instead. Outside WhatsApp's 24-hour window the
 * text goes inside the approved update template; a voice note cannot, so it becomes a card.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { ChannelError, sendAudioToGuest, sendToGuest } from '@/lib/channels';
import { inServiceWindow } from '@/lib/channels/whatsapp';
import { ensureRegistration } from '@/lib/compliance/registrations';
import { appUrl, features } from '@/lib/env';
import { ttsVoiceFor } from '@/lib/voice/voices';
import type { Conversation, MessageTemplate, Property, Reservation, TemplateAnchor, TemplateKind } from '@/lib/types';

/** Half the cron period: with a daily run, a due time is caught by the run before or after it. */
export const SEND_WINDOW_MS = 12 * 3_600_000;
/** How late a message may still go out (e.g. a booking made right after the daily run). */
export const LATE_MS = 24 * 3_600_000;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Where each kind sits in the stay, and its default timing. */
export const JOURNEY: Record<Exclude<TemplateKind, 'saved_reply'>, { anchor: TemplateAnchor; offset: number }> = {
  booking_confirmed: { anchor: 'booking', offset: 0 },
  pre_arrival: { anchor: 'check_in', offset: -24 },
  check_in: { anchor: 'check_in', offset: -8 },
  during_stay: { anchor: 'check_in', offset: 22 },
  checkout: { anchor: 'check_out', offset: -3 },
  post_stay: { anchor: 'check_out', offset: 6 },
};

const PLACEHOLDER = /\{(guest_name|check_in|check_out|check_in_time|check_out_time|property_name|checkin_link)\}/g;

export function renderTemplate(
  body: string,
  r: Pick<Reservation, 'guest_name' | 'check_in' | 'check_out'>,
  p: Pick<Property, 'name' | 'check_in_time' | 'check_out_time'>,
  extra: { checkin_link?: string } = {},
): string {
  const values: Record<string, string> = {
    guest_name: r.guest_name.split(' ')[0],
    check_in: r.check_in,
    check_out: r.check_out,
    check_in_time: p.check_in_time.slice(0, 5),
    check_out_time: p.check_out_time.slice(0, 5),
    property_name: p.name,
    checkin_link: extra.checkin_link ?? '',
  };
  return body.replace(PLACEHOLDER, (_, k: string) => values[k]);
}

export const anchorOf = (t: Pick<MessageTemplate, 'kind' | 'anchor'>): TemplateAnchor =>
  t.anchor ?? (t.kind === 'saved_reply' ? 'check_in' : JOURNEY[t.kind].anchor);

export const offsetOf = (t: Pick<MessageTemplate, 'kind' | 'send_offset_hours'>): number =>
  t.send_offset_hours ?? (t.kind === 'saved_reply' ? 0 : JOURNEY[t.kind].offset);

/** Local wall-clock time of the property expressed as a UTC-naive timestamp (matches dueAt). */
export function localNaive(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const get = (t: string) => parts.find((x) => x.type === t)?.value ?? '00';
  return Date.parse(`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:00Z`);
}

/** When a template is due for a reservation, as UTC-naive local time of the property. */
export function dueAt(
  t: Pick<MessageTemplate, 'kind' | 'send_offset_hours'> & Partial<Pick<MessageTemplate, 'anchor'>>,
  r: Pick<Reservation, 'check_in' | 'check_out'> & { created_at?: string },
  p: Pick<Property, 'check_in_time' | 'check_out_time'> & { timezone?: string },
): number {
  const anchor = anchorOf({ kind: t.kind, anchor: t.anchor ?? null });
  const base =
    anchor === 'booking' ? localNaive(p.timezone ?? 'Europe/Madrid', new Date(r.created_at ?? Date.now()))
    : anchor === 'check_in' ? Date.parse(`${r.check_in}T${p.check_in_time.slice(0, 5)}:00Z`)
    : Date.parse(`${r.check_out}T${p.check_out_time.slice(0, 5)}:00Z`);
  return base + offsetOf(t) * HOUR;
}

export const isDue = (due: number, now: number) => now >= due - SEND_WINDOW_MS && now < due + LATE_MS;

export const nights = (r: Pick<Reservation, 'check_in' | 'check_out'>) => Math.round((Date.parse(r.check_out) - Date.parse(r.check_in)) / DAY);

/** Whether a template applies to this stay at all (conditions), regardless of timing. */
export function applies(t: Pick<MessageTemplate, 'min_nights'>, r: Pick<Reservation, 'check_in' | 'check_out'>): boolean {
  return !t.min_nights || nights(r) >= t.min_nights;
}

/** A stay "went well" when nothing in its conversation was escalated as urgent. */
async function stayWentWell(db: SupabaseClient, conversationId: number): Promise<boolean> {
  const { data } = await db.from('messages').select('id, drafts!inner(reason)').eq('conversation_id', conversationId).eq('drafts.reason', 'urgente').limit(1);
  return !data?.length;
}

/** The guest's conversation: WhatsApp first, then the booking channel (PMS), then any. */
async function findConversation(db: SupabaseClient, p: Property, r: Reservation): Promise<Conversation | null> {
  const { data } = await db.from('conversations').select('*').eq('property_id', p.id).or(`reservation_id.eq.${r.id},guest_ref.eq.${r.guest_ref}`);
  const list = (data ?? []) as Conversation[];
  return list.find((c) => c.channel === 'whatsapp') ?? list.find((c) => c.channel !== 'sim') ?? list[0] ?? null;
}

/** A journey message as a WhatsApp voice note in the account owner's chosen voice (stored like the host's own). */
async function sendVoiceNote(db: SupabaseClient, orgId: number, conv: Conversation, text: string, language: string) {
  if (!inServiceWindow(conv.last_guest_message_at)) throw new ChannelError('More than 24 h since the guest last wrote: audio needs an open conversation', 'window_closed');
  // Loaded lazily: TTS is server-only, and tests import this module.
  const { speak } = await import('@/lib/audio/openai');
  const { data: owner } = await db.from('profiles').select('voice').eq('org_id', orgId).eq('role', 'owner').order('created_at').limit(1).maybeSingle<{ voice: string }>();
  const audio = await speak(text, language, ttsVoiceFor(owner?.voice));
  const path = `${orgId}/${conv.id}/${randomUUID()}.ogg`;
  const upload = await db.storage.from('voice-notes').upload(path, audio, { contentType: 'audio/ogg' });
  if (upload.error) throw new Error(`storage: ${upload.error.message}`);
  const externalId = await sendAudioToGuest(conv, audio, 'audio/ogg');
  await db.from('messages').insert({ conversation_id: conv.id, direction: 'out', text, transcript: text, kind: 'audio', media_path: path, external_id: externalId });
}

export async function runLifecycle(db: SupabaseClient, orgId: number, now = new Date()): Promise<{ sent: number; carded: number }> {
  const { data: templates } = await db.from('message_templates').select('*').eq('org_id', orgId).eq('approved', true).neq('kind', 'saved_reply');
  if (!templates?.length) return { sent: 0, carded: 0 };
  const { data: props } = await db.from('properties').select('*').eq('org_id', orgId);
  let sent = 0;
  let carded = 0;
  for (const p of (props ?? []) as Property[]) {
    const local = localNaive(p.timezone, now);
    const { data: res } = await db.from('reservations').select('*').eq('property_id', p.id).neq('status', 'cancelled').gte('check_out', new Date(now.getTime() - 3 * DAY).toISOString().slice(0, 10));
    for (const r of (res ?? []) as Reservation[]) {
      for (const t of (templates as MessageTemplate[]).filter((x) => x.property_id === null || x.property_id === p.id)) {
        if (!applies(t, r) || !isDue(dueAt(t, r, p), local)) continue;
        const key = `lifecycle:${t.id}:${r.id}`;
        const { data: done } = await db.from('audit_logs').select('id').eq('org_id', orgId).eq('action', 'lifecycle_message').eq('detail', key).maybeSingle();
        if (done) continue;
        const conv = await findConversation(db, p, r);
        if (!conv) continue; // no conversation with this guest yet
        if (t.positive_only && !(await stayWentWell(db, conv.id))) continue;
        // The guest's registration link: created the first time a message needs it.
        const reg = t.body.includes('{checkin_link}') ? await ensureRegistration(db, r, orgId) : null;
        const text = renderTemplate(t.body, r, p, { checkin_link: reg ? `${appUrl()}/checkin/${reg.token}` : '' });
        const voice = t.as_voice && conv.channel === 'whatsapp' && features.openai();
        try {
          if (voice) await sendVoiceNote(db, orgId, conv, text, t.language);
          else {
            const externalId = await sendToGuest(conv, text, { checkWindow: true, template: { guestName: r.guest_name, propertyName: p.name, language: t.language } });
            await db.from('messages').insert({ conversation_id: conv.id, direction: 'out', text, external_id: externalId });
          }
          sent++;
        } catch (e) {
          if (!(e instanceof ChannelError)) throw e;
          // Approving the card sends it the same way (as a voice note if the message asks for one).
          await db.from('proposals').insert({ org_id: orgId, agent: 'guest', kind: 'guest_message', conversation_id: conv.id, title: `${t.title || t.kind} para ${r.guest_name}`, payload: { text, draft_id: null, as_voice: Boolean(voice), learn_category: null, reason: e.code } });
          carded++;
        }
        await db.from('audit_logs').insert({ org_id: orgId, actor: 'ai', action: 'lifecycle_message', detail: key, conversation_id: conv.id });
      }
    }
  }
  return { sent, carded };
}
