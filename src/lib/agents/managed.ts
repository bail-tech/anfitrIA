/**
 * Scheduled agents (pricing, analytics, marketing) on Claude Managed Agents.
 * The agents themselves are defined in agents/<name>/ and created with `ant apply`; this
 * starts one session per run with a vault holding a short-lived AnfitrIA MCP token (and the
 * StayingAPI key for comparables, when configured). Results come back as proposals via MCP.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { features, appUrl } from '@/lib/env';
import { issueRunToken } from '@/lib/mcp/token';

export const MANAGED_AGENTS = {
  pricing: { env: 'ANTHROPIC_AGENT_PRICING_ID', task: 'Run the daily pricing review for this host (skill pricing-review). Use get_portfolio and get_calendar, compare with comparables, propose only the changes that matter, then call finish_run.' },
  analytics: { env: 'ANTHROPIC_AGENT_ANALYTICS_ID', task: 'Produce this week\'s market and performance report (skill weekly-market-report), plus stay improvements (skill stay-improvements) as task proposals. Then call finish_run with the 3-bullet headline.' },
  marketing: { env: 'ANTHROPIC_AGENT_MARKETING_ID', task: 'Audit the listings (skills listing-audit and listing-copy) and propose copy changes and tasks. Then call finish_run.' },
} as const;
export type ManagedAgentKey = keyof typeof MANAGED_AGENTS;

/** Hard cap per run, in USD (Managed Agents session budget). */
const RUN_BUDGET_USD = '3.00';


export class AgentNotConfigured extends Error {}

export async function startManagedRun(db: SupabaseClient, orgId: number, agent: ManagedAgentKey): Promise<{ runId: string; sessionId: string }> {
  const agentId = process.env[MANAGED_AGENTS[agent].env];
  const environmentId = process.env.ANTHROPIC_ENVIRONMENT_ID;
  const secret = process.env.MCP_TOKEN_SECRET;
  if (!features.managedAgents() || !agentId || !environmentId || !secret) {
    throw new AgentNotConfigured(`The ${agent} agent needs ANTHROPIC_API_KEY, ANTHROPIC_ENVIRONMENT_ID, ${MANAGED_AGENTS[agent].env} and MCP_TOKEN_SECRET`);
  }

  const { data: run, error } = await db.from('agent_runs').insert({ org_id: orgId, agent }).select('id').single<{ id: string }>();
  if (error || !run) throw new Error(`agent run: ${error?.message}`);

  const client = new Anthropic();
  const vault = await client.beta.vaults.create({ display_name: `AnfitrIA ${agent} run ${run.id}`, metadata: { run_id: run.id, org_id: String(orgId) } });
  try {
    await client.beta.vaults.credentials.create(vault.id, {
      auth: { type: 'static_bearer', token: issueRunToken(orgId, run.id, secret), mcp_server_url: `${appUrl()}/api/mcp` },
      display_name: 'AnfitrIA run token',
    });
    if (process.env.STAYINGAPI_KEY) {
      await client.beta.vaults.credentials.create(vault.id, {
        auth: { type: 'static_bearer', token: process.env.STAYINGAPI_KEY, mcp_server_url: 'https://api.stayingapi.com/mcp' },
        display_name: 'StayingAPI (comparables)',
      });
    }
    const session = await client.beta.sessions.create({
      agent: agentId,
      environment_id: environmentId,
      vault_ids: [vault.id],
      budget: { type: 'limit', max_list_cost: { amount: RUN_BUDGET_USD, currency: 'USD' } },
      initial_events: [{ type: 'user.message', content: [{ type: 'text', text: MANAGED_AGENTS[agent].task }] }],
      title: `AnfitrIA ${agent} · org ${orgId}`,
      metadata: { run_id: run.id, org_id: String(orgId) },
    });
    await db.from('agent_runs').update({ summary: `Sesión ${session.id} en curso` }).eq('id', run.id);
    return { runId: run.id, sessionId: session.id };
  } catch (e) {
    await client.beta.vaults.delete(vault.id).catch(() => undefined);
    await db.from('agent_runs').update({ status: 'failed', error: e instanceof Error ? e.message : String(e), finished_at: new Date().toISOString() }).eq('id', run.id);
    throw e;
  }
}
