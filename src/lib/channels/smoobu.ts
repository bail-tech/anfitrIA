/**
 * Smoobu PMS API (https://docs.smoobu.com). Requests are signed with HMAC-SHA256: the legacy
 * Api-Key header stops working on 31 Oct 2026. Canonical string, newline-separated:
 * METHOD, path, sorted RFC 3986 query, X-Timestamp, X-Nonce, hex SHA-256 of the body, X-API-Key.
 */
import { createHash, createHmac, randomUUID } from 'node:crypto';

export const SMOOBU_BASE = 'https://login.smoobu.com';

export interface SmoobuCredentials {
  apiKey: string;
  secret: string;
}

export interface SmoobuBooking {
  id: number;
  'reference-id'?: string | null;
  type?: 'reservation' | 'modification' | 'cancellation' | string;
  arrival: string;
  departure: string;
  'created-at'?: string;
  apartment: { id: number; name: string };
  channel?: { id: number; name: string } | null;
  'guest-name'?: string | null;
  email?: string | null;
  phone?: string | null;
  adults?: number | null;
  children?: number | null;
  'check-in'?: string | null;
  'check-out'?: string | null;
  price?: number | null;
  language?: string | null;
  'is-blocked-booking'?: boolean;
}

export interface SmoobuMessage {
  id: number;
  subject?: string | null;
  message: string;
  /** 1 = from the guest (inbox), 2 = to the guest (outbox). */
  type: 1 | 2;
}

export class SmoobuError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const rfc3986 = (v: string) => encodeURIComponent(v).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export function canonicalQuery(params: Record<string, string | number | boolean | undefined>): string {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${rfc3986(k)}=${rfc3986(String(v))}`)
    .join('&');
}

/** The four auth headers for one request. Exported for tests. */
export function signRequest(creds: SmoobuCredentials, method: string, path: string, query: string, body: string, timestamp = new Date().toISOString(), nonce: string = randomUUID()) {
  const bodyHash = createHash('sha256').update(body).digest('hex');
  const canonical = [method.toUpperCase(), path, query, timestamp, nonce, bodyHash, creds.apiKey].join('\n');
  const signature = createHmac('sha256', creds.secret).update(canonical).digest('base64');
  return { 'X-API-Key': creds.apiKey, 'X-Timestamp': timestamp, 'X-Nonce': nonce, 'X-Signature': signature };
}

async function request<T>(creds: SmoobuCredentials, method: 'GET' | 'POST' | 'DELETE', path: string, params: Record<string, string | number | boolean | undefined> = {}, json?: unknown): Promise<T> {
  const query = canonicalQuery(params);
  const body = json === undefined ? '' : JSON.stringify(json);
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${SMOOBU_BASE}${path}${query ? `?${query}` : ''}`, {
      method,
      headers: { ...signRequest(creds, method, path, query, body), ...(body ? { 'Content-Type': 'application/json' } : {}), Accept: 'application/json' },
      body: body || undefined,
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 429 && attempt < 2) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    const text = await res.text();
    if (!res.ok) {
      const detail = (() => {
        try {
          const j = JSON.parse(text) as { detail?: string; title?: string };
          return j.detail ?? j.title;
        } catch {
          return null;
        }
      })();
      throw new SmoobuError(res.status === 401 ? 'Smoobu rechazó la clave o el secreto de la API' : `Smoobu ${res.status}: ${detail ?? text.slice(0, 200)}`, res.status);
    }
    return (text ? JSON.parse(text) : {}) as T;
  }
}

export async function listApartments(creds: SmoobuCredentials): Promise<Array<{ id: number; name: string }>> {
  const data = await request<{ apartments: Array<{ id: number; name: string }> }>(creds, 'GET', '/api/apartments');
  return data.apartments ?? [];
}

/** Every booking matching the filter, following pagination (100 per page). */
export async function listBookings(creds: SmoobuCredentials, filter: { departureFrom?: string; modifiedFrom?: string; apartmentId?: number } = {}): Promise<SmoobuBooking[]> {
  const out: SmoobuBooking[] = [];
  for (let page = 1; page <= 50; page++) {
    const data = await request<{ page_count: number; bookings: SmoobuBooking[] }>(creds, 'GET', '/api/reservations', {
      departureFrom: filter.departureFrom,
      modifiedFrom: filter.modifiedFrom,
      apartmentId: filter.apartmentId,
      excludeBlocked: true,
      showCancellation: true,
      pageSize: 100,
      page,
    });
    out.push(...(data.bookings ?? []));
    if (page >= (data.page_count ?? 1)) break;
  }
  return out;
}

export async function getBooking(creds: SmoobuCredentials, id: number): Promise<SmoobuBooking> {
  return request<SmoobuBooking>(creds, 'GET', `/api/reservations/${id}`);
}

/** All messages of a booking with the guest, oldest first. */
export async function listMessages(creds: SmoobuCredentials, bookingId: number): Promise<SmoobuMessage[]> {
  const out: SmoobuMessage[] = [];
  for (let page = 1; page <= 20; page++) {
    const data = await request<{ page_count: number; messages: SmoobuMessage[] }>(creds, 'GET', `/api/reservations/${bookingId}/messages`, { page });
    out.push(...(data.messages ?? []));
    if (page >= (data.page_count ?? 1)) break;
  }
  return out.sort((a, b) => a.id - b.id);
}

export async function sendMessage(creds: SmoobuCredentials, bookingId: number, text: string): Promise<void> {
  await request(creds, 'POST', `/api/reservations/${bookingId}/messages/send-message-to-guest`, {}, { messageBody: text });
}

export async function registerWebhook(creds: SmoobuCredentials, url: string): Promise<void> {
  const existing = await request<Array<{ id: number; webhookUrl: string }> | { webhooks?: Array<{ id: number; webhookUrl: string }> }>(creds, 'GET', '/api/users/webhooks');
  const list = Array.isArray(existing) ? existing : (existing.webhooks ?? []);
  if (list.some((w) => w.webhookUrl === url)) return;
  await request(creds, 'POST', '/api/users/webhooks', {}, { webhookUrl: url });
}

/** Smoobu channel names → our reservation sources. */
export function sourceOf(channel: string | null | undefined): 'airbnb' | 'booking' | 'direct' | 'other' {
  const c = (channel ?? '').toLowerCase();
  // "Direct booking" contains "booking", so direct comes first.
  if (!c || c.includes('direct') || c.includes('website') || c.includes('homepage')) return 'direct';
  if (c.includes('airbnb')) return 'airbnb';
  if (c.includes('booking')) return 'booking';
  return 'other';
}
