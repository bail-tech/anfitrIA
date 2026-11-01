/**
 * WhatsApp Cloud API: send text and audio, upload and download media, verify webhooks.
 * https://developers.facebook.com/docs/whatsapp/cloud-api
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const GRAPH = () => `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION ?? 'v26.0'}`;
const token = () => process.env.WHATSAPP_ACCESS_TOKEN ?? '';
const phoneId = () => process.env.WHATSAPP_PHONE_NUMBER_ID ?? '';

/** Free-form messages (text or audio) are only allowed within 24 h of the guest's last message. */
export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function inServiceWindow(lastGuestMessageAt: string | null, now = Date.now()): boolean {
  return lastGuestMessageAt !== null && now - Date.parse(lastGuestMessageAt) < SERVICE_WINDOW_MS;
}

export function validSignature(appSecret: string | undefined, rawBody: string, header: string | null): boolean {
  if (!appSecret || !header) return false;
  const expected = Buffer.from(`sha256=${createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')}`);
  const given = Buffer.from(header);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

async function graph<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${GRAPH()}${path}`, { ...init, headers: { Authorization: `Bearer ${token()}`, ...(init.headers ?? {}) } });
  if (!res.ok) throw new Error(`WhatsApp ${path} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

export async function sendText(to: string, body: string): Promise<string | null> {
  const r = await graph<{ messages?: Array<{ id: string }> }>(`/${phoneId()}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: body.slice(0, 4096) } }),
  });
  return r.messages?.[0]?.id ?? null;
}

/**
 * Outside the 24-hour window only Meta-approved templates go out. `anfi_update` wraps any
 * message: "Hi {{1}}, a message about your stay at {{2}}: {{3}} …", created in each language.
 */
export const UPDATE_TEMPLATE = 'anfi_update';
export const TEMPLATE_LANGUAGES = ['es', 'en', 'fr', 'de', 'it'] as const;

/** Template parameters may not contain new lines, tabs or more than four spaces in a row. */
export function templateParam(text: string, max = 900): string {
  const flat = text.replace(/\s*\n\s*/g, ' · ').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export async function sendTemplate(to: string, name: string, language: string, params: string[]): Promise<string | null> {
  const lang = (TEMPLATE_LANGUAGES as readonly string[]).includes(language) ? language : 'es';
  const r = await graph<{ messages?: Array<{ id: string }> }>(`/${phoneId()}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: { name, language: { code: lang }, components: [{ type: 'body', parameters: params.map((p) => ({ type: 'text', text: templateParam(p) })) }] },
    }),
  });
  return r.messages?.[0]?.id ?? null;
}

/** OGG/Opus shows as a voice note; other accepted formats (AAC, MP4, MPEG, AMR) show as audio files. */
export async function uploadMedia(data: Uint8Array, mime: string, filename: string): Promise<string> {
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', mime);
  form.append('file', new Blob([new Uint8Array(data)], { type: mime }), filename);
  const r = await graph<{ id: string }>(`/${phoneId()}/media`, { method: 'POST', body: form });
  return r.id;
}

export async function sendAudio(to: string, mediaId: string, voice: boolean): Promise<string | null> {
  const r = await graph<{ messages?: Array<{ id: string }> }>(`/${phoneId()}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'audio', audio: voice ? { id: mediaId, voice: true } : { id: mediaId } }),
  });
  return r.messages?.[0]?.id ?? null;
}

/** Two steps: the media id resolves to a short-lived URL, which needs the same bearer token. */
export async function downloadMedia(mediaId: string): Promise<{ data: Uint8Array; mime: string }> {
  const meta = await graph<{ url: string; mime_type: string }>(`/${mediaId}`, { method: 'GET' });
  const res = await fetch(meta.url, { headers: { Authorization: `Bearer ${token()}` } });
  if (!res.ok) throw new Error(`WhatsApp media download ${res.status}`);
  return { data: new Uint8Array(await res.arrayBuffer()), mime: meta.mime_type };
}

/**
 * Calling API: answer a guest's WhatsApp call. `pre_accept` then `accept` carry the same SDP
 * answer; media must only start after accept returns.
 */
export async function callAction(callId: string, action: 'pre_accept' | 'accept' | 'reject' | 'terminate', sdp?: string, callbackData?: string): Promise<void> {
  await graph<{ success?: boolean }>(`/${phoneId()}/calls`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      call_id: callId,
      action,
      ...(sdp ? { session: { sdp_type: 'answer', sdp } } : {}),
      ...(callbackData ? { biz_opaque_callback_data: callbackData.slice(0, 512) } : {}),
    }),
  });
}

// ---------------------------------------------------------------------------
// Webhook payload
// ---------------------------------------------------------------------------

export interface InboundWhatsApp {
  phoneNumberId: string;
  from: string;
  id: string;
  type: string;
  text?: string;
  audioId?: string;
  audioMime?: string;
}

export interface WhatsAppCall {
  phoneNumberId: string;
  id: string;
  from: string;
  event: 'connect' | 'terminate';
  /** connect: the guest's SDP offer. */
  sdp?: string;
  /** terminate: seconds talked, when the call was answered. */
  duration?: number;
  status?: string;
  callbackData?: string;
}

interface WebhookPayload {
  entry?: Array<{
    changes?: Array<{
      field?: string;
      value?: {
        metadata?: { phone_number_id?: string };
        calls?: Array<{ id?: string; from?: string; event?: string; status?: string; duration?: number; biz_opaque_callback_data?: string; session?: { sdp_type?: string; sdp?: string } }>;
        messages?: Array<{ from?: string; id?: string; type?: string; text?: { body?: string }; audio?: { id?: string; mime_type?: string } }>;
      };
    }>;
  }>;
}

export function parseWebhook(payload: unknown): InboundWhatsApp[] {
  const out: InboundWhatsApp[] = [];
  for (const entry of (payload as WebhookPayload)?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const phoneNumberId = change.value?.metadata?.phone_number_id;
      if (!phoneNumberId) continue;
      for (const m of change.value?.messages ?? []) {
        if (!m.from || !m.id || !m.type) continue;
        out.push({ phoneNumberId, from: m.from, id: m.id, type: m.type, text: m.text?.body, audioId: m.audio?.id, audioMime: m.audio?.mime_type });
      }
    }
  }
  return out;
}

export function parseCalls(payload: unknown): WhatsAppCall[] {
  const out: WhatsAppCall[] = [];
  for (const entry of (payload as WebhookPayload)?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const phoneNumberId = change.value?.metadata?.phone_number_id;
      if (!phoneNumberId) continue;
      for (const c of change.value?.calls ?? []) {
        if (!c.id || !c.from || (c.event !== 'connect' && c.event !== 'terminate')) continue;
        out.push({
          phoneNumberId,
          id: c.id,
          from: c.from,
          event: c.event,
          sdp: c.session?.sdp_type === 'offer' ? c.session.sdp : undefined,
          duration: c.duration,
          status: c.status,
          callbackData: c.biz_opaque_callback_data,
        });
      }
    }
  }
  return out;
}
