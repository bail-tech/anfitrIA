/** POST /api/conversations/:id/reply { text, draft_id?, learn_category? } — the host replies (text). */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sendHostReply } from '@/lib/concierge/host';
import { fail, sameOrigin, withSession } from '@/lib/http';

const Body = z.object({ text: z.string().trim().min(1).max(4000), draft_id: z.number().int().optional(), learn_category: z.string().max(64).optional() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return fail(403, 'unexpected origin');
  const conversationId = Number((await params).id);
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !Number.isInteger(conversationId)) return fail(400, 'invalid body');
  return withSession(async ({ db, profile }) => {
    let learn: { category: string; question: string } | null = null;
    if (parsed.data.learn_category && parsed.data.draft_id) {
      const { data: draft } = await db.from('drafts').select('inbound_message_id').eq('id', parsed.data.draft_id).single<{ inbound_message_id: number }>();
      const { data: msg } = draft ? await db.from('messages').select('text').eq('id', draft.inbound_message_id).single<{ text: string }>() : { data: null };
      if (msg) learn = { category: parsed.data.learn_category, question: msg.text };
    }
    await sendHostReply(db, profile, { conversationId, text: parsed.data.text, draftId: parsed.data.draft_id ?? null, learn });
    return NextResponse.json({ ok: true });
  });
}
