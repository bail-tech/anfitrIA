/**
 * Starts a GPT-Live voice session for the signed-in host over WebRTC. The OpenAI key stays here:
 * the browser sends its SDP offer and gets the SDP answer back.
 *
 * POST /api/live/session { sdp, locale? } -> { session: { id }, transport: { type: 'webrtc', sdp } }
 */
import OpenAI from 'openai';
import { z } from 'zod';
import { features } from '@/lib/env';
import { fail, sameOrigin } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';
import { getSession } from '@/lib/supabase/server';
import { BROWSER_EVENTS, LIVE_MODEL, LIVE_VOICE, VOICE_SESSIONS_PER_HOUR, voiceInstructions } from '@/lib/voice/live';

const Body = z.object({ sdp: z.string().trim().min(1).max(20_000), locale: z.enum(['es', 'en']).default('es') });

let client: OpenAI | null = null;

export async function POST(request: Request) {
  if (!features.openai()) return fail(503, 'Voice is not enabled on this deployment', 'not_configured');
  if (!sameOrigin(request)) return fail(403, 'unexpected origin');
  const session = await getSession();
  if (!session) return fail(401, 'unauthorized');
  if (!rateLimit(`live:${session.profile.org_id}`, VOICE_SESSIONS_PER_HOUR, 3600)) return fail(429, 'Too many voice sessions this hour');
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, 'An SDP offer is required');

  try {
    // Trim: a stray newline or space pasted with the key makes OpenAI answer 401.
    const result = await (client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY!.trim() })).live.create({
      session: {
        model: LIVE_MODEL,
        instructions: voiceInstructions(parsed.data.locale, session.profile.name),
        delegation: { type: 'client' },
        audio: { output: { voice: LIVE_VOICE } },
        client: { data_channel: { allowed_client_events: BROWSER_EVENTS } },
        store: false,
      },
      transport: { type: 'webrtc', sdp: parsed.data.sdp },
    });
    return Response.json({ session: { id: result.session.id }, transport: result.transport }, { status: 201 });
  } catch (e) {
    if (e instanceof OpenAI.APIError) {
      console.error('Live session creation failed', e.status, e.message);
      if (e.status === 401 || e.status === 403) return fail(502, 'OpenAI rejected the API key (check OPENAI_API_KEY and its permissions)', 'openai_auth');
      if (e.status === 429) return fail(502, 'OpenAI quota or rate limit reached (check billing)', 'openai_quota');
      if (e.status === 404) return fail(502, 'This OpenAI account has no access to the voice model', 'openai_model');
    } else console.error('Live session creation failed', e);
    return fail(502, 'The voice session could not be started', 'voice_failed');
  }
}
