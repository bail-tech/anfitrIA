/**
 * GET /api/pitch/voice?lang=es&key=inbox&v=… — one line of Anfi's landing pitch, spoken (OGG).
 * Only the fixed script can be spoken, and responses are cached at the edge for a year (`v`
 * changes when the copy does), so each line is generated once, not per visitor.
 */
import { speak } from '@/lib/audio/openai';
import { features } from '@/lib/env';
import { fail } from '@/lib/http';
import { pitchLine } from '@/lib/marketing/pitch';
import { rateLimit } from '@/lib/rate-limit';
import { DEFAULT_VOICE, ttsVoiceFor } from '@/lib/voice/voices';

export async function GET(request: Request) {
  if (!features.openai()) return fail(503, 'voice not configured', 'not_configured');
  const url = new URL(request.url);
  const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'es';
  const line = pitchLine(lang, url.searchParams.get('key') ?? '');
  if (!line) return fail(404, 'unknown line');
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!rateLimit(`pitch-voice:${ip}`, 60, 3600)) return fail(429, 'too many requests');
  const audio = await speak(line, lang, ttsVoiceFor(DEFAULT_VOICE));
  return new Response(new Uint8Array(audio), {
    headers: { 'Content-Type': 'audio/ogg', 'Cache-Control': 'public, max-age=86400, s-maxage=31536000, immutable' },
  });
}
