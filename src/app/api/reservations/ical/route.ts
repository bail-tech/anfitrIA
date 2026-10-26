/** POST /api/reservations/ical (multipart: file | url, property_id) — import Booking/Airbnb calendars. */
import { NextResponse } from 'next/server';
import { parseIcs } from '@/lib/concierge/ical';
import { fail, sameOrigin, withSession } from '@/lib/http';

export const maxDuration = 30;
const MAX_BYTES = 2 * 1024 * 1024;

/** Only public calendar URLs over HTTPS from the usual providers; no internal addresses. */
function allowedUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    const ok = /(^|\.)(airbnb\.[a-z.]+|booking\.com|vrbo\.com|expedia\.[a-z.]+|google\.com|icloud\.com|outlook\.(com|live\.com))$/.test(host);
    return u.protocol === 'https:' && ok ? u : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail(403, 'unexpected origin');
  const form = await request.formData().catch(() => null);
  const propertyId = Number(form?.get('property_id'));
  if (!form || !Number.isInteger(propertyId)) return fail(400, 'property_id required');

  let text: string;
  const file = form.get('file');
  const url = String(form.get('url') ?? '').trim();
  if (file instanceof File && file.size) {
    if (file.size > MAX_BYTES) return fail(413, 'file too large');
    text = await file.text();
  } else if (url) {
    const u = allowedUrl(url);
    if (!u) return fail(400, 'Use the HTTPS iCal link from Airbnb, Booking.com, Vrbo or Google Calendar');
    const res = await fetch(u, { redirect: 'error', signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return fail(502, `calendar download failed (${res.status})`);
    text = (await res.text()).slice(0, MAX_BYTES);
  } else return fail(400, 'file or url required');

  return withSession(async ({ db }) => {
    const { data: property } = await db.from('properties').select('id').eq('id', propertyId).maybeSingle();
    if (!property) return fail(404, 'property not found');
    const { source, reservations } = parseIcs(text);
    const { data: existing } = await db.from('reservations').select('code, check_in, check_out').eq('property_id', propertyId);
    const seen = new Set((existing ?? []).map((r) => r.code ?? `${r.check_in}/${r.check_out}`));
    let created = 0;
    for (const r of reservations) {
      const key = r.code ?? `${r.check_in}/${r.check_out}`;
      if (seen.has(key)) continue;
      const { error } = await db.from('reservations').insert({
        property_id: propertyId,
        guest_name: r.guest_name,
        guest_ref: `ical:${key}`.slice(0, 64),
        check_in: r.check_in,
        check_out: r.check_out,
        code: r.code,
        source,
        status: 'upcoming',
      });
      if (!error) {
        created++;
        seen.add(key);
      }
    }
    return NextResponse.json({ source, found: reservations.length, created, note: 'iCal has no phone numbers or prices: add them to link WhatsApp chats and see revenue.' });
  });
}
