/**
 * WhatsApp Cloud API: send text and audio, upload and download media, verify webhooks.
 * https://developers.facebook.com/docs/whatsapp/cloud-api
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const GRAPH = () => `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION ?? 'v21.0'}`;
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

interface WebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        metadata?: { phone_number_id?: string };
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
