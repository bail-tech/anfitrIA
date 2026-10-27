/**
 * GET /api/voice/preview?voice=coral&lang=es — a ~3 s sample of a voice (TTS, OGG/Opus).
 * Only voices TTS supports can be previewed; GPT-Live-only voices answer 404.
 */
import { speak } from '@/lib/audio/openai';
import { features } from '@/lib/env';
import { fail } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';
import { getSession } from '@/lib/supabase/server';
import { TTS_VOICES } from '@/lib/voice/voices';

const SAMPLE: Record<string, string> = {
  es: '¡Hola! Soy Anfi. ¿Qué tienes hoy en tus alojamientos?',
  en: "Hi! I'm Anfi. What's on today at your properties?",
  fr: "Bonjour ! Je suis Anfi. Qu'avez-vous aujourd'hui ?",
  de: 'Hallo! Ich bin Anfi. Was steht heute an?',
  it: 'Ciao! Sono Anfi. Cosa hai oggi?',
};

export async function GET(request: Request) {
  if (!features.openai()) return fail(503, 'Voice previews need OPENAI_API_KEY', 'not_configured');
  const session = await getSession();
  if (!session) return fail(401, 'unauthorized');
  const url = new URL(request.url);
  const voice = url.searchParams.get('voice') ?? '';
  const lang = url.searchParams.get('lang') ?? 'es';
  if (!TTS_VOICES.includes(voice as (typeof TTS_VOICES)[number])) return fail(404, 'No preview for this voice', 'no_preview');
  if (!rateLimit(`preview:${session.profile.id}`, 40, 3600)) return fail(429, 'Too many previews');
  const audio = await speak(SAMPLE[lang] ?? SAMPLE.es, lang, voice);
  return new Response(new Uint8Array(audio), {
    headers: { 'Content-Type': 'audio/ogg', 'Cache-Control': 'private, max-age=86400' },
  });
}
