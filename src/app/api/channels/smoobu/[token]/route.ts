/**
 * POST /api/channels/smoobu/:token — Smoobu webhook (bookings and guest messages).
 * Smoobu doesn't sign webhooks, so the URL carries a random per-account token. The event is
 * acknowledged at once and handled after the response: Smoobu only needs the 200.
 */
import { after } from 'next/server';
import { sendToGuest } from '@/lib/channels';
import { guestAI } from '@/lib/concierge/ai';
import { handleInbound } from '@/lib/concierge/pipeline';
import { features } from '@/lib/env';
import { bookingRef, PROVIDER, smoobuCredentials, syncBooking, type SmoobuIntegration } from '@/lib/integrations/smoobu-sync';
import { createAdminSupabase } from '@/lib/supabase/server';

export const maxDuration = 60;

interface SmoobuEvent {
  action: string;
  user?: number;
  data?: { id?: number; booking?: { id?: number } };
}

const BOOKING_EVENTS = ['newReservation', 'updateReservation', 'cancelReservation', 'deleteReservation'];

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!features.serviceRole()) return new Response('not configured', { status: 503 });
  const token = (await params).token;
  if (!/^[0-9a-f]{40}$/.test(token)) return new Response('not found', { status: 404 });
  const db = createAdminSupabase();
  const { data: integration } = await db.from('integrations').select('id, org_id, config, webhook_token, last_sync_at').eq('provider', PROVIDER).eq('webhook_token', token).maybeSingle<SmoobuIntegration>();
  if (!integration) return new Response('not found', { status: 404 });

  const event = (await request.json().catch(() => null)) as SmoobuEvent | null;
  const bookingId = event?.action === 'newMessage' ? event.data?.booking?.id : BOOKING_EVENTS.includes(event?.action ?? '') ? event?.data?.id : undefined;
  if (!bookingId) return Response.json({ ok: true, ignored: event?.action ?? 'invalid' });

  after(async () => {
    try {
      const creds = await smoobuCredentials(db, integration);
      if (!creds) return;
      const synced = await syncBooking(db, integration, creds, bookingId);
      if (!synced) return;
      // Only live guest messages are answered (or escalated) by the guest agent.
      const deps = { db, ai: guestAI(), send: (conversation: Parameters<typeof sendToGuest>[0], text: string) => sendToGuest(conversation, text) };
      for (const m of synced.guest) {
        await handleInbound({ property: synced.property, guestRef: bookingRef(bookingId), text: m.message.trim().slice(0, 4000), channel: 'smoobu', externalId: `smoobu-msg:${m.id}` }, deps);
      }
    } catch (e) {
      console.error('smoobu webhook failed', e);
      await db.from('integrations').update({ last_error: e instanceof Error ? e.message.slice(0, 300) : 'webhook failed' }).eq('id', integration.id);
    }
  });
  return Response.json({ ok: true });
}
