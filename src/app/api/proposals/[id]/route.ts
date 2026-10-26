/** POST /api/proposals/:id { decision: 'approve' | 'reject', text? } — the host's tap on an approval card. */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { fail, sameOrigin, withSession } from '@/lib/http';
import { decideProposal } from '@/lib/proposals';

export const maxDuration = 60;

const Body = z.object({ decision: z.enum(['approve', 'reject']), text: z.string().max(4000).optional() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return fail(403, 'unexpected origin');
  const { id } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, 'invalid body');
  return withSession(async ({ db, profile }) => {
    const proposal = await decideProposal(db, profile, id, parsed.data.decision, parsed.data.text);
    return NextResponse.json({ proposal });
  });
}
