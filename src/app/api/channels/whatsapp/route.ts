/**
 * WhatsApp Cloud API webhook.
 *   GET  verification (hub.challenge)
 *   POST messages: HMAC-checked, answered 200 at once; the work runs after the response.
 * Text goes through the concierge pipeline; voice notes are stored, transcribed, then the same.
 * One number serves every property: messages are routed by the guest's booking.
 * Calls: Anfi answers by voice (GPT-Live) and the call is logged in the guest's conversation.
 */
import { after } from 'next/server';
import { randomUUID } from 'node:crypto';
import { transcribe } from '@/lib/audio/openai';
import { guestAI } from '@/lib/concierge/ai';
import { ASK_BOOKING, detectLanguage, NON_TEXT_REPLY } from '@/lib/concierge/language';
import { handleInbound } from '@/lib/concierge/pipeline';
import { callAction, downloadMedia, parseCalls, parseWebhook, sendText, validSignature, type InboundWhatsApp } from '@/lib/channels/whatsapp';
import { routeWhatsApp } from '@/lib/channels/whatsapp-routing';
import { todayIn } from '@/lib/concierge/stay';
import { features } from '@/lib/env';
import { createAdminSupabase } from '@/lib/supabase/server';
import { answerGuestCall, logGuestCall } from '@/lib/voice/guest-call';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const verify = process.env.WHATSAPP_VERIFY_TOKEN;
  if (url.searchParams.get('hub.mode') === 'subscribe' && verify && url.searchParams.get('hub.verify_token') === verify) {
    return new Response(url.searchParams.get('hub.challenge') ?? '', { headers: { 'Content-Type': 'text/plain' } });
  }
  return new Response('Verification failed', { status: 403 });
}

async function handleMessage(message: InboundWhatsApp) {
  const db = createAdminSupabase();
  const { data: seen } = await db.from('messages').select('id').eq('external_id', message.id).maybeSingle();
  if (seen) return; // Meta retries: already handled

  // One number can serve every property: find the guest's booking, else ask for it.
  const route = await routeWhatsApp(db, { phoneNumberId: message.phoneNumberId, from: message.from, text: message.text ?? '', today: todayIn() });
  if (!route) {
    const lang = message.text ? detectLanguage(message.text, 'es') : 'es';
    await sendText(message.from, ASK_BOOKING[lang] ?? ASK_BOOKING.es).catch(() => undefined);
    return;
  }
  const { property, reservationId } = route;

  const deps = { db, ai: guestAI(), send: async (_: unknown, text: string) => sendText(message.from, text) };

  if (message.type === 'text' && message.text) {
    await handleInbound({ property, guestRef: message.from, text: message.text.slice(0, 4000), channel: 'whatsapp', externalId: message.id, reservationId }, deps);
    return;
  }

  if (message.type === 'audio' && message.audioId) {
    const media = await downloadMedia(message.audioId);
    const ext = media.mime.includes('ogg') ? 'ogg' : media.mime.includes('mpeg') ? 'mp3' : 'm4a';
    const path = `${property.org_id}/inbound/${randomUUID()}.${ext}`;
    await db.storage.from('voice-notes').upload(path, media.data, { contentType: media.mime.split(';')[0] });
    const transcript = features.openai() ? await transcribe(media.data, media.mime).catch(() => '') : '';
    await handleInbound(
      {
        property,
        guestRef: message.from,
        // Without a transcript the message escalates: the host listens to it in the inbox.
        text: transcript || '[Nota de voz sin transcribir]',
        channel: 'whatsapp',
        externalId: message.id,
        audio: { path, transcript },
        reservationId,
      },
      deps,
    );
    return;
  }

  await sendText(message.from, NON_TEXT_REPLY[property.default_language] ?? NON_TEXT_REPLY.es).catch(() => undefined);
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (!validSignature(process.env.WHATSAPP_APP_SECRET, raw, request.headers.get('x-hub-signature-256'))) {
    return new Response('Invalid signature', { status: 403 });
  }
  if (!features.serviceRole() || !features.whatsapp()) return new Response('WhatsApp not configured', { status: 503 });
  let payload: unknown;
  try {
    payload = JSON.parse(raw || '{}');
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }
  const messages = parseWebhook(payload);
  const calls = parseCalls(payload);
  // Reply to Meta at once; the AI work runs after the response is sent.
  after(async () => {
    for (const c of calls) {
      try {
        if (c.event === 'terminate') await logGuestCall(createAdminSupabase(), c);
        else if (c.sdp && features.openai()) await answerGuestCall(createAdminSupabase(), c);
        else await callAction(c.id, 'reject');
      } catch (e) {
        console.error('whatsapp call failed', c.id, c.event, e);
        if (c.event === 'connect') await callAction(c.id, 'reject').catch(() => undefined);
      }
    }
    for (const m of messages) {
      try {
        await handleMessage(m);
      } catch (e) {
        console.error('whatsapp message failed', m.id, e);
      }
    }
  });
  return Response.json({ status: 'ok' });
}
