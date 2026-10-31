/**
 * POST /api/pitch/chat { question, history?, lang, voice? } — Anfi answers a landing visitor.
 * Public, so it is small and guarded: grounded only in what AnfitrIA does, short answers,
 * rate-limited per IP, the question treated as data. With `voice`, the answer comes back spoken.
 */
import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { speak } from '@/lib/audio/openai';
import { CLAUDE_MODEL, fallbackParams, features } from '@/lib/env';
import { fail, sameOrigin } from '@/lib/http';
import { pitchSystemPrompt } from '@/lib/marketing/pitch';
import { rateLimit } from '@/lib/rate-limit';
import { DEFAULT_VOICE, ttsVoiceFor } from '@/lib/voice/voices';

export const maxDuration = 30;

const Body = z.object({
  question: z.string().trim().min(1).max(300),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(1200) })).max(6).default([]),
  lang: z.enum(['es', 'en']).default('es'),
  voice: z.boolean().default(false),
});


const FALLBACK = {
  es: 'Me encantaría contártelo con detalle, pero ahora mismo no puedo responder aquí. Empieza gratis y te lo enseño dentro, con tu alojamiento.',
  en: 'I’d love to tell you all about it, but I can’t answer here right now. Start free and I’ll show you inside, with your own property.',
};

let client: Anthropic | null = null;

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail(403, 'unexpected origin');
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, 'invalid body');
  const { question, history, lang, voice } = parsed.data;
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!rateLimit(`pitch-chat:${ip}`, 15, 3600) || !rateLimit(`pitch-chat-burst:${ip}`, 4, 60)) return fail(429, 'too many questions');

  let answer = FALLBACK[lang];
  if (features.claude()) {
    try {
      const response = await (client ??= new Anthropic()).messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 300,
        ...fallbackParams(),
        system: pitchSystemPrompt(lang),
        messages: [...history, { role: 'user' as const, content: question }],
      });
      const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join(' ').trim();
      if (text && response.stop_reason !== 'refusal') answer = text.slice(0, 700);
    } catch (e) {
      console.error('pitch chat failed', e instanceof Anthropic.APIError ? e.status : e);
    }
  }

  let audio: string | undefined;
  if (voice && features.openai()) {
    try {
      audio = Buffer.from(await speak(answer, lang, ttsVoiceFor(DEFAULT_VOICE))).toString('base64');
    } catch (e) {
      console.error('pitch voice failed', e);
    }
  }
  return NextResponse.json({ answer, audio });
}
