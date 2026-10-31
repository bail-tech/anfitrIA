/** Daily at 07:00 UTC (Vercel cron): scheduled guest messages, plus the daily pricing and weekly analytics agents. */
import { runLifecycle } from '@/lib/agents/lifecycle';
import { refreshLotes } from '@/lib/compliance/registrations';
import { startManagedRun, type ManagedAgentKey } from '@/lib/agents/managed';
import { features } from '@/lib/env';
import { cronAuthorized } from '@/lib/http';
import { createAdminSupabase } from '@/lib/supabase/server';

export const maxDuration = 300;

export async function GET(request: Request) {
  if (!cronAuthorized(request)) return new Response('unauthorized', { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return new Response('service role not configured', { status: 503 });
  const db = createAdminSupabase();
  const now = new Date();
  const results: Record<string, unknown> = {};

  const { data: orgs } = await db.from('message_templates').select('org_id').eq('approved', true);
  for (const org of [...new Set((orgs ?? []).map((o) => o.org_id as number))]) {
    try {
      results[`lifecycle:${org}`] = await runLifecycle(db, org, now);
    } catch (e) {
      results[`lifecycle:${org}`] = { error: e instanceof Error ? e.message : String(e) };
    }
  }

  // SES.Hospedajes: check filed guest registrations until the Ministry answers.
  const { data: filed } = await db.from('guest_registrations').select('org_id').eq('status', 'sent');
  for (const org of [...new Set((filed ?? []).map((r) => r.org_id as number))]) {
    try {
      results[`ses:${org}`] = await refreshLotes(db, db, org);
    } catch (e) {
      results[`ses:${org}`] = { error: e instanceof Error ? e.message : String(e) };
    }
  }

  // Managed agents: pricing every day, analytics on Mondays (this cron runs at 07:00 UTC).
  if (features.managedAgents()) {
    const due: ManagedAgentKey[] = now.getUTCDay() === 1 ? ['pricing', 'analytics'] : ['pricing'];
    const { data: settings } = await db.from('agent_settings').select('org_id, agent').eq('enabled', true).in('agent', due);
    for (const s of settings ?? []) {
      try {
        results[`${s.agent}:${s.org_id}`] = await startManagedRun(db, s.org_id, s.agent as ManagedAgentKey);
      } catch (e) {
        results[`${s.agent}:${s.org_id}`] = { error: e instanceof Error ? e.message : String(e) };
      }
    }
  }
  return Response.json({ results });
}
