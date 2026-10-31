/** Daily (Vercel cron): sync connected PMSs, then plan turnovers for every organisation with the operations agent on. */
import { runOperations } from '@/lib/agents/operations';
import { cronAuthorized } from '@/lib/http';
import { PROVIDER, smoobuCredentials, syncSmoobu, type SmoobuIntegration } from '@/lib/integrations/smoobu-sync';
import { createAdminSupabase } from '@/lib/supabase/server';

export const maxDuration = 300;

export async function GET(request: Request) {
  if (!cronAuthorized(request)) return new Response('unauthorized', { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return new Response('service role not configured', { status: 503 });
  const db = createAdminSupabase();
  const results: Record<string, unknown> = {};

  // PMS first, so turnovers are planned from the latest bookings. The webhook keeps it live;
  // this catches anything a webhook missed.
  const { data: pms } = await db.from('integrations').select('id, org_id, config, webhook_token, last_sync_at').eq('provider', PROVIDER).in('status', ['connected', 'error', 'syncing']);
  for (const integration of (pms ?? []) as SmoobuIntegration[]) {
    try {
      const creds = await smoobuCredentials(db, integration);
      results[`smoobu:${integration.org_id}`] = creds ? await syncSmoobu(db, integration, creds) : 'no credentials';
    } catch (e) {
      results[`smoobu:${integration.org_id}`] = { error: e instanceof Error ? e.message : String(e) };
      await db.from('integrations').update({ status: 'error', last_error: e instanceof Error ? e.message.slice(0, 300) : 'sync failed' }).eq('id', integration.id);
    }
  }

  const { data: orgs } = await db.from('agent_settings').select('org_id').eq('agent', 'operations').eq('enabled', true);
  for (const { org_id } of orgs ?? []) {
    try {
      results[org_id] = await runOperations(db, org_id);
    } catch (e) {
      results[org_id] = { error: e instanceof Error ? e.message : String(e) };
    }
  }
  return Response.json({ results });
}
