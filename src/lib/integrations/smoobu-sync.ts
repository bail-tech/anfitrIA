/**
 * Smoobu → AnfitrIA. Apartments become properties, bookings become reservations, and each
 * booking's messages become a "smoobu" conversation; replies go back through Smoobu (the guest
 * gets them on Airbnb, Booking.com…). Everything is matched by external ids, so re-running is safe.
 * History is imported as-is; only new guest messages from the webhook go through the AI pipeline.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getBooking, listApartments, listBookings, listMessages, sourceOf, type SmoobuBooking, type SmoobuCredentials, type SmoobuMessage } from '@/lib/channels/smoobu';
import { detectLanguage } from '@/lib/concierge/language';
import type { Conversation, Property } from '@/lib/types';

export const PROVIDER = 'smoobu';
/** How far back bookings (and their messages) are imported on a full sync. */
const HISTORY_DAYS = 120;
/** Keeps a full sync inside the function time limit; the daily cron continues where it left off. */
const MAX_MESSAGE_FETCHES = 150;

export interface SmoobuIntegration {
  id: number;
  org_id: number;
  config: { apiKey?: string } | null;
  webhook_token: string | null;
  last_sync_at: string | null;
}

export const bookingRef = (id: number) => `smoobu:${id}`;
export const bookingIdOf = (ref: string) => (ref.startsWith('smoobu:') ? Number(ref.slice(7)) : NaN);

export async function smoobuCredentials(admin: SupabaseClient, integration: SmoobuIntegration): Promise<SmoobuCredentials | null> {
  if (!integration.config?.apiKey) return null;
  const { data: secret } = await admin.rpc('integration_get_secret', { p_integration: integration.id });
  return secret ? { apiKey: integration.config.apiKey, secret: secret as string } : null;
}

async function ensureProperties(admin: SupabaseClient, orgId: number, apartments: Array<{ id: number; name: string }>): Promise<Map<number, Property>> {
  const { data: existing } = await admin.from('properties').select('*').eq('org_id', orgId).like('external_ref', 'smoobu:%');
  const byApartment = new Map(((existing ?? []) as Property[]).map((p) => [Number(p.external_ref!.slice(7)), p]));
  for (const a of apartments) {
    if (byApartment.has(a.id)) continue;
    const { data } = await admin.from('properties').insert({ org_id: orgId, name: a.name.slice(0, 120), external_ref: `smoobu:${a.id}` }).select('*').single<Property>();
    if (data) byApartment.set(a.id, data);
  }
  return byApartment;
}

/** Upserts one booking; returns the reservation id (or null for blocked dates / unknown apartments). */
export async function upsertBooking(admin: SupabaseClient, properties: Map<number, Property>, b: SmoobuBooking): Promise<{ reservationId: number; property: Property } | null> {
  if (b['is-blocked-booking']) return null;
  const property = properties.get(b.apartment.id);
  if (!property) return null;
  const guests = (b.adults ?? 0) + (b.children ?? 0);
  const row = {
    property_id: property.id,
    code: bookingRef(b.id),
    guest_name: (b['guest-name'] || 'Huésped').slice(0, 120),
    // A phone number links this booking to the guest's WhatsApp chat too.
    guest_ref: b.phone?.replace(/[^\d+]/g, '') || bookingRef(b.id),
    check_in: b.arrival,
    check_out: b.departure,
    source: sourceOf(b.channel?.name),
    guests: guests || null,
    total_amount: b.price ?? null,
    nightly_rate: b.price && b.arrival && b.departure ? Math.round((b.price / Math.max(1, (Date.parse(b.departure) - Date.parse(b.arrival)) / 86_400_000)) * 100) / 100 : null,
    status: b.type === 'cancellation' ? 'cancelled' : b.departure < new Date().toISOString().slice(0, 10) ? 'past' : 'upcoming',
  };
  const { data } = await admin.from('reservations').upsert(row, { onConflict: 'property_id,code' }).select('id').single<{ id: number }>();
  return data ? { reservationId: data.id, property } : null;
}

async function conversationFor(admin: SupabaseClient, property: Property, bookingId: number, reservationId: number): Promise<Conversation> {
  const ref = bookingRef(bookingId);
  const { data: found } = await admin.from('conversations').select('*').eq('property_id', property.id).eq('guest_ref', ref).eq('channel', PROVIDER).maybeSingle<Conversation>();
  if (found) return found;
  const { data, error } = await admin.from('conversations').insert({ property_id: property.id, guest_ref: ref, channel: PROVIDER, reservation_id: reservationId }).select('*').single<Conversation>();
  if (error || !data) throw new Error(`conversation: ${error?.message}`);
  return data;
}

/**
 * Stores the booking's messages we haven't seen. Our own replies come back from Smoobu without
 * the id we sent them with, so an outgoing message whose text matches one we sent is adopted
 * instead of duplicated. Returns the guest messages that are new.
 */
export async function importMessages(admin: SupabaseClient, conversation: Conversation, property: Property, messages: SmoobuMessage[]): Promise<SmoobuMessage[]> {
  const { data: known } = await admin.from('messages').select('id, external_id, direction, text').eq('conversation_id', conversation.id);
  const seen = new Set((known ?? []).map((m) => m.external_id).filter(Boolean));
  const unmatchedOut = (known ?? []).filter((m) => m.direction === 'out' && !m.external_id);
  const fresh: SmoobuMessage[] = [];
  for (const m of messages) {
    const externalId = `smoobu-msg:${m.id}`;
    if (seen.has(externalId)) continue;
    const text = (m.message ?? '').trim();
    if (!text) continue;
    if (m.type === 2) {
      const mine = unmatchedOut.find((o) => o.text.trim() === text);
      if (mine) {
        await admin.from('messages').update({ external_id: externalId }).eq('id', mine.id);
        unmatchedOut.splice(unmatchedOut.indexOf(mine), 1);
        continue;
      }
    }
    if (m.type === 1) {
      fresh.push(m);
      continue; // inserted by the caller (history) or by the pipeline (live)
    }
    await admin.from('messages').insert({ conversation_id: conversation.id, direction: 'out', text: text.slice(0, 4000), language: detectLanguage(text, property.default_language), external_id: externalId });
  }
  return fresh;
}

async function storeGuestMessages(admin: SupabaseClient, conversation: Conversation, property: Property, messages: SmoobuMessage[]) {
  if (!messages.length) return;
  await admin.from('messages').insert(
    messages.map((m) => ({ conversation_id: conversation.id, direction: 'in', text: m.message.trim().slice(0, 4000), language: detectLanguage(m.message, property.default_language), external_id: `smoobu-msg:${m.id}` })),
  );
  await admin.from('conversations').update({ last_guest_message_at: new Date().toISOString() }).eq('id', conversation.id);
}

export interface SyncResult {
  properties: number;
  bookings: number;
  conversations: number;
  messages: number;
}

/** Full import (first connection, daily cron). Historical guest messages are stored, not answered. */
export async function syncSmoobu(admin: SupabaseClient, integration: SmoobuIntegration, creds: SmoobuCredentials): Promise<SyncResult> {
  const orgId = integration.org_id;
  const properties = await ensureProperties(admin, orgId, await listApartments(creds));
  const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString().slice(0, 10);
  const bookings = await listBookings(creds, integration.last_sync_at ? { modifiedFrom: integration.last_sync_at.slice(0, 10) } : { departureFrom: since });
  const result: SyncResult = { properties: properties.size, bookings: 0, conversations: 0, messages: 0 };
  let fetches = 0;
  for (const b of bookings) {
    const saved = await upsertBooking(admin, properties, b);
    if (!saved) continue;
    result.bookings++;
    if (b.type === 'cancellation' || fetches >= MAX_MESSAGE_FETCHES) continue;
    fetches++;
    const messages = await listMessages(creds, b.id);
    if (!messages.length) continue;
    const conversation = await conversationFor(admin, saved.property, b.id, saved.reservationId);
    result.conversations++;
    const guest = await importMessages(admin, conversation, saved.property, messages);
    await storeGuestMessages(admin, conversation, saved.property, guest);
    result.messages += messages.length;
  }
  await admin.from('integrations').update({ last_sync_at: new Date().toISOString(), last_error: null, status: 'connected' }).eq('id', integration.id);
  return result;
}

/** Webhook: one booking changed or got a message. Returns new guest messages to answer. */
export async function syncBooking(admin: SupabaseClient, integration: SmoobuIntegration, creds: SmoobuCredentials, bookingId: number) {
  const { data: props } = await admin.from('properties').select('*').eq('org_id', integration.org_id).like('external_ref', 'smoobu:%');
  const properties = new Map(((props ?? []) as Property[]).map((p) => [Number(p.external_ref!.slice(7)), p]));
  const booking = await getBooking(creds, bookingId);
  if (!properties.has(booking.apartment.id)) {
    for (const [k, v] of await ensureProperties(admin, integration.org_id, [booking.apartment])) properties.set(k, v);
  }
  const saved = await upsertBooking(admin, properties, booking);
  if (!saved) return null;
  const conversation = await conversationFor(admin, saved.property, bookingId, saved.reservationId);
  const guest = await importMessages(admin, conversation, saved.property, await listMessages(creds, bookingId));
  return { property: saved.property, conversation, guest };
}
