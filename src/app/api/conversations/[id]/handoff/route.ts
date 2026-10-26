/** POST /api/conversations/:id/handoff { take_over: boolean } */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { setHandoff } from '@/lib/concierge/host';
import { fail, sameOrigin, withSession } from '@/lib/http';

const Body = z.object({ take_over: z.boolean() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return fail(403, 'unexpected origin');
  const conversationId = Number((await params).id);
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !Number.isInteger(conversationId)) return fail(400, 'invalid body');
  return withSession(async ({ db, profile }) => {
    await setHandoff(db, profile, conversationId, parsed.data.take_over);
    return NextResponse.json({ ok: true });
  });
}
