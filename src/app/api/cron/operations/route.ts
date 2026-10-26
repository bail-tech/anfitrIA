/** Daily (Vercel cron): plan turnovers for every organisation with the operations agent on. */
import { runOperations } from '@/lib/agents/operations';
import { cronAuthorized } from '@/lib/http';
import { createAdminSupabase } from '@/lib/supabase/server';

export const maxDuration = 300;

export async function GET(request: Request) {
  if (!cronAuthorized(request)) return new Response('unauthorized', { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return new Response('service role not configured', { status: 503 });
  const db = createAdminSupabase();
  const { data: orgs } = await db.from('agent_settings').select('org_id').eq('agent', 'operations').eq('enabled', true);
  const results: Record<number, unknown> = {};
  for (const { org_id } of orgs ?? []) {
    try {
      results[org_id] = await runOperations(db, org_id);
    } catch (e) {
      results[org_id] = { error: e instanceof Error ? e.message : String(e) };
    }
  }
  return Response.json({ results });
}
