/** POST /api/me/api-keys { name } — creates a personal MCP key. The key is returned once and never stored. */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { features } from '@/lib/env';
import { fail, sameOrigin, withSession } from '@/lib/http';
import { generateKey } from '@/lib/mcp/api-keys';
import { createAdminSupabase } from '@/lib/supabase/server';

const Body = z.object({ name: z.string().trim().min(1).max(60) });
const MAX_ACTIVE = 10;

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail(403, 'unexpected origin');
  if (!features.serviceRole()) return fail(503, 'not configured');
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, 'invalid name');
  return withSession(async ({ db, profile }) => {
    const { count } = await db.from('api_keys').select('id', { count: 'exact', head: true }).is('revoked_at', null);
    if ((count ?? 0) >= MAX_ACTIVE) return fail(409, `Up to ${MAX_ACTIVE} active keys`, 'too_many');
    const { key, prefix, hash } = generateKey();
    const { error } = await createAdminSupabase().from('api_keys').insert({ org_id: profile.org_id, profile_id: profile.id, name: parsed.data.name, prefix, key_hash: hash });
    if (error) return fail(400, error.message);
    return NextResponse.json({ key, prefix });
  });
}
