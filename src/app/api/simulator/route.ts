/** POST /api/simulator { property_id, guest_ref, text } — a guest message through the real pipeline (sim channel). */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guestAI } from '@/lib/concierge/ai';
import { handleInbound } from '@/lib/concierge/pipeline';
import { fail, sameOrigin, withSession } from '@/lib/http';
import type { Property } from '@/lib/types';

export const maxDuration = 60;

const Body = z.object({ property_id: z.number().int(), guest_ref: z.string().trim().min(1).max(64), text: z.string().trim().min(1).max(2000) });

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail(403, 'unexpected origin');
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, 'invalid body');
  return withSession(async ({ db }) => {
    const { data: property } = await db.from('properties').select('*').eq('id', parsed.data.property_id).single<Property>();
    if (!property) return fail(404, 'property not found');
    const outcome = await handleInbound(
      { property, guestRef: parsed.data.guest_ref, text: parsed.data.text, channel: 'sim' },
      { db, ai: guestAI(), send: async () => null },
    );
    const { data: messages } = await db.from('messages').select('*').eq('conversation_id', outcome.conversation.id).order('id');
    return NextResponse.json({ conversation_id: outcome.conversation.id, answered: outcome.answered, reason: outcome.reason, draft: outcome.draft, messages });
  });
}
