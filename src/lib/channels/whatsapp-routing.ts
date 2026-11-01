/**
 * One WhatsApp number can serve every property: an inbound message is routed by who wrote it,
 * not by which number received it. Order: a property with its own dedicated number, the
 * guest's booking (by phone), their last WhatsApp conversation, a booking code in the text.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { pickReservation } from '@/lib/concierge/stay';
import type { Property, Reservation } from '@/lib/types';

const TAIL = 8;

/** Last 8 digits of a phone reference, or null when it isn't a phone (ical:…, smoobu:…). */
export function phoneTail(ref: string): string | null {
  if (/[a-z]/i.test(ref)) return null;
  const digits = ref.replace(/\D/g, '');
  return digits.length >= TAIL ? digits.slice(-TAIL) : null;
}

/**
 * Same phone written two ways: "34612345678" from WhatsApp and "+34 612 345 678" or a local
 * "612345678" on a booking. The shorter one must be the tail of the longer, 8 digits at least.
 */
export function samePhone(a: string, b: string): boolean {
  if (!phoneTail(a) || !phoneTail(b)) return false;
  const [x, y] = [a.replace(/\D/g, ''), b.replace(/\D/g, '')].sort((p, q) => q.length - p.length);
  return x.endsWith(y);
}

/** Words in a message that could be a booking code (HMABCD1234, 5012345678…). */
export function codeCandidates(text: string): string[] {
  const words = text.toUpperCase().match(/[A-Z0-9-]{5,20}/g) ?? [];
  return [...new Set(words.filter((w) => /\d/.test(w)))].slice(0, 10);
}

/** Phone numbers written in a message ("+34 612 345 678", "612-345-678"). */
export function phonesIn(text: string): string[] {
  const found = text.match(/\+?\d[\d\s.-]{6,16}\d/g) ?? [];
  return [...new Set(found.map((p) => p.replace(/[^\d+]/g, '')))].filter((p) => phoneTail(p)).slice(0, 3);
}

export interface Route {
  property: Property;
  /** The booking the message was matched to, when the match was by booking. */
  reservationId: number | null;
}

/** Finds the property (and booking) an inbound WhatsApp message belongs to; null when unknown. */
export async function routeWhatsApp(db: SupabaseClient, input: { phoneNumberId: string; from: string; text: string; today: string }): Promise<Route | null> {
  const property = async (id: number) => (await db.from('properties').select('*').eq('id', id).maybeSingle<Property>()).data;

  const { data: dedicated } = await db.from('properties').select('*').eq('whatsapp_phone_number_id', input.phoneNumberId);
  if (dedicated?.length === 1) return { property: dedicated[0] as Property, reservationId: null };
  // Several properties on this number: only they are candidates. None: the shared number serves all.
  const scope = (dedicated ?? []).map((p) => (p as Property).id);
  const inScope = (propertyId: number) => !scope.length || scope.includes(propertyId);

  const tail = phoneTail(input.from);
  if (tail) {
    const { data } = await db.from('reservations').select('*').like('guest_ref', `%${tail}`).neq('status', 'cancelled');
    const mine = ((data ?? []) as Reservation[]).filter((r) => samePhone(r.guest_ref, input.from) && inScope(r.property_id));
    const booking = pickReservation(mine, input.today);
    const p = booking && (await property(booking.property_id));
    if (p) return { property: p, reservationId: booking.id };

    const { data: convs } = await db
      .from('conversations')
      .select('property_id, guest_ref')
      .eq('channel', 'whatsapp')
      .like('guest_ref', `%${tail}`)
      .order('last_guest_message_at', { ascending: false, nullsFirst: false })
      .limit(10);
    const last = (convs ?? []).find((c) => samePhone(c.guest_ref, input.from) && inScope(c.property_id));
    const q = last && (await property(last.property_id));
    if (q) return { property: q, reservationId: null };
  }

  // Not known by this number: the guest may have sent the phone they booked with, or the code.
  for (const phone of phonesIn(input.text)) {
    const { data } = await db.from('reservations').select('*').like('guest_ref', `%${phoneTail(phone)}`).neq('status', 'cancelled');
    const booking = pickReservation(((data ?? []) as Reservation[]).filter((r) => samePhone(r.guest_ref, phone) && inScope(r.property_id)), input.today);
    const p = booking && (await property(booking.property_id));
    if (p) return { property: p, reservationId: booking.id };
  }
  const codes = codeCandidates(input.text);
  if (codes.length) {
    const { data } = await db.from('reservations').select('*').in('code', codes).neq('status', 'cancelled');
    const booking = pickReservation(((data ?? []) as Reservation[]).filter((r) => inScope(r.property_id)), input.today);
    const p = booking && (await property(booking.property_id));
    if (p) return { property: p, reservationId: booking.id };
  }
  return null;
}
