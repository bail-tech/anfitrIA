/** POST /api/agents/:agent/run — run an agent now for the host's organisation. */
import { NextResponse } from 'next/server';
import { runOperations } from '@/lib/agents/operations';
import { AgentNotConfigured, MANAGED_AGENTS, startManagedRun, type ManagedAgentKey } from '@/lib/agents/managed';
import { fail, sameOrigin, withSession } from '@/lib/http';
import { createAdminSupabase } from '@/lib/supabase/server';

export const maxDuration = 60;

export async function POST(request: Request, { params }: { params: Promise<{ agent: string }> }) {
  if (!sameOrigin(request)) return fail(403, 'unexpected origin');
  const { agent } = await params;
  return withSession(async ({ db, profile }) => {
    if (agent === 'operations') return NextResponse.json({ result: await runOperations(db, profile.org_id) });
    if (!(agent in MANAGED_AGENTS)) return fail(404, 'unknown agent');
    try {
      // The session row is written with the host's client; the MCP server later reads it with the service role.
      const result = await startManagedRun(process.env.SUPABASE_SERVICE_ROLE_KEY ? createAdminSupabase() : db, profile.org_id, agent as ManagedAgentKey);
      return NextResponse.json({ result });
    } catch (e) {
      if (e instanceof AgentNotConfigured) return fail(503, e.message, 'not_configured');
      throw e;
    }
  });
}
