/** PATCH /api/me/preferences { assistant_language?, voice?, voice_custom_id? } — the host's own Anfi settings. */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { fail, sameOrigin, withSession } from '@/lib/http';
import { ASSISTANT_LANGUAGES, CUSTOM_VOICE_ID, LIVE_VOICES } from '@/lib/voice/voices';

const Body = z.object({
  assistant_language: z.enum(ASSISTANT_LANGUAGES).optional(),
  voice: z.enum(LIVE_VOICES).optional(),
  voice_custom_id: z.union([z.string().regex(CUSTOM_VOICE_ID), z.literal(''), z.null()]).optional(),
});

export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return fail(403, 'unexpected origin');
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, 'invalid preferences');
  return withSession(async ({ db, profile }) => {
    const patch = { ...parsed.data, ...(parsed.data.voice_custom_id === '' ? { voice_custom_id: null } : {}) };
    const { data, error } = await db.from('profiles').update(patch).eq('id', profile.id).select('assistant_language, voice, voice_custom_id').single();
    if (error) return fail(400, error.message);
    return NextResponse.json({ preferences: data });
  });
}
