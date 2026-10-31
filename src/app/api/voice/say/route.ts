/**
 * POST /api/voice/say { text, lang } — Anfi reads a short text aloud in the host's chosen voice
 * (TTS, OGG/Opus). Used to narrate the welcome tour when no live voice call is open.
 */
import { z } from 'zod';
import { speak } from '@/lib/audio/openai';
import { features } from '@/lib/env';
import { fail, sameOrigin, withSession } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';
import { ttsVoiceFor } from '@/lib/voice/voices';

const Body = z.object({ text: z.string().trim().min(1).max(600), lang: z.enum(['es', 'en']).default('es') });

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail(403, 'unexpected origin');
  if (!features.openai()) return fail(503, 'Voice needs OPENAI_API_KEY', 'not_configured');
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, 'invalid body');
  return withSession(async ({ profile }) => {
    if (!rateLimit(`say:${profile.id}`, 120, 3600)) return fail(429, 'Too many requests');
    const audio = await speak(parsed.data.text, parsed.data.lang, ttsVoiceFor(profile.voice));
    return new Response(new Uint8Array(audio), { headers: { 'Content-Type': 'audio/ogg', 'Cache-Control': 'private, max-age=3600' } });
  });
}
