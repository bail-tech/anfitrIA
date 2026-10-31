/**
 * POST /api/checkin/:token { travellers: [...] } — the guest's own registration form (no account).
 * The random token is the only key, so this runs with the service role, scoped to that one
 * registration, rate-limited, and locked once the registration has been filed.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isAlpha3 } from '@/lib/compliance/countries';
import { travellerErrors } from '@/lib/compliance/ses';
import { DOCUMENT_TYPES, KINSHIPS, SEXES } from '@/lib/compliance/ses-codes';
import { features } from '@/lib/env';
import { fail } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';
import { createAdminSupabase } from '@/lib/supabase/server';

const text = (max: number) => z.string().trim().max(max);
const optional = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);

const Traveller = z.object({
  first_name: text(50).min(1),
  surname1: text(50).min(1),
  surname2: optional(50),
  document_type: z.enum(DOCUMENT_TYPES).optional().nullable(),
  document_number: optional(15),
  document_support: optional(9),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  nationality: z.string().refine(isAlpha3).optional().nullable(),
  sex: z.enum(SEXES).optional().nullable(),
  address: text(100).min(1),
  address_extra: optional(100),
  municipality_code: optional(5),
  municipality_name: optional(100),
  postal_code: text(20).min(1),
  country: z.string().refine(isAlpha3),
  phone: optional(20),
  email: optional(250),
  kinship: z.enum(KINSHIPS).optional().nullable(),
});

const Body = z.object({ travellers: z.array(Traveller).min(1).max(20) });

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!features.serviceRole()) return fail(503, 'not configured');
  const token = (await params).token;
  if (!/^[0-9a-f]{36}$/.test(token)) return fail(404, 'not found');
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!rateLimit(`checkin:${token}`, 20, 3600) || !rateLimit(`checkin-ip:${ip}`, 60, 3600)) return fail(429, 'too many attempts');

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid', issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) }, { status: 400 });

  const db = createAdminSupabase();
  const { data: reg } = await db.from('guest_registrations').select('id, status, reservation_id').eq('token', token).maybeSingle();
  if (!reg) return fail(404, 'not found');
  if (reg.status === 'sent' || reg.status === 'accepted' || reg.status === 'cancelled') return fail(409, 'already filed', 'locked');
  const { data: r } = await db.from('reservations').select('check_in').eq('id', reg.reservation_id).single();

  const travellers = parsed.data.travellers.map((t) => ({ ...t, document_number: t.document_number?.toUpperCase().replace(/[\s-]/g, '') ?? null }));
  const errors = travellers.map((t) => travellerErrors(t, r!.check_in));
  if (errors.some((e) => e.length)) return NextResponse.json({ error: 'incomplete', errors }, { status: 422 });

  await db.from('travellers').delete().eq('registration_id', reg.id);
  const { error } = await db.from('travellers').insert(travellers.map((t, i) => ({ ...t, registration_id: reg.id, position: i + 1 })));
  if (error) return fail(400, error.message);
  await db.from('guest_registrations').update({ status: 'ready', error: null, updated_at: new Date().toISOString() }).eq('id', reg.id);
  return NextResponse.json({ ok: true });
}
