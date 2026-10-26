/**
 * POST /api/assistant { messages: [{ role, content }] } -> text/event-stream of AssistantEvent.
 * The chat dock and the voice layer both go through here.
 */
import { z } from 'zod';
import { runAssistant } from '@/lib/assistant/run';
import type { AssistantEvent } from '@/lib/assistant/tools';
import { fail, sameOrigin } from '@/lib/http';
import { getSession } from '@/lib/supabase/server';

export const maxDuration = 120;

const Body = z.object({
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(8000) })).min(1).max(40),
  locale: z.enum(['es', 'en']).default('es'),
});

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail(403, 'unexpected origin');
  const session = await getSession();
  if (!session) return fail(401, 'unauthorized');
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, 'invalid body');

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (e: AssistantEvent) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      await runAssistant({ db: session.db, profile: session.profile, emit }, parsed.data.messages, session.profile.name, parsed.data.locale);
      controller.close();
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' } });
}
