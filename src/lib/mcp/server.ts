/**
 * AnfitrIA MCP server for the scheduled agents (pricing, analytics, marketing).
 * Read tools return the organisation's data; write tools only create proposals the host
 * approves in the cockpit. Every query is filtered by the run's organisation.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { todayIn } from '@/lib/concierge/stay';
import { loadOverviewForOrg } from '@/lib/metrics-org';

const text = (v: unknown) => ({ content: [{ type: 'text' as const, text: typeof v === 'string' ? v : JSON.stringify(v, null, 1) }] });

export function createAnfitriaMcp(db: SupabaseClient, orgId: number, agent: string, runId: string) {
  const server = new McpServer({ name: 'anfitria', version: '2.0.0' });
  const propertyIds = async () => ((await db.from('properties').select('id').eq('org_id', orgId)).data ?? []).map((p) => p.id as number);

  server.registerTool(
    'get_portfolio',
    { description: 'Properties (id, name, address, check-in/out times, building) and this month vs last month KPIs.' },
    async () => {
      const { data: properties } = await db.from('properties').select('id, name, address, building_id, check_in_time, check_out_time, default_language').eq('org_id', orgId);
      return text({ today: todayIn(), properties, kpis: await loadOverviewForOrg(db, orgId) });
    },
  );

  server.registerTool(
    'get_calendar',
    {
      description: 'Booked and free nights per property between two dates (YYYY-MM-DD, end exclusive), with nightly rates when known.',
      inputSchema: { from: z.string(), to: z.string() },
    },
    async ({ from, to }) => {
      const ids = await propertyIds();
      const { data } = ids.length
        ? await db.from('reservations').select('property_id, check_in, check_out, nightly_rate, total_amount, source, guests, status').in('property_id', ids).neq('status', 'cancelled').lt('check_in', to).gt('check_out', from)
        : { data: [] };
      return text({ from, to, reservations: data });
    },
  );

  server.registerTool(
    'get_guest_signals',
    { description: 'Last 30 days: escalations by reason, AI auto-answer rate, and the most common guest questions (anonymised).', inputSchema: {} },
    async () => {
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const ids = await propertyIds();
      const { data: convs } = ids.length ? await db.from('conversations').select('id').in('property_id', ids) : { data: [] };
      const cids = (convs ?? []).map((c) => c.id as number);
      const { data: msgs } = cids.length ? await db.from('messages').select('id, text').in('conversation_id', cids).eq('direction', 'in').gte('created_at', since).limit(300) : { data: [] };
      const mids = (msgs ?? []).map((m) => m.id as number);
      const { data: drafts } = mids.length ? await db.from('drafts').select('reason').in('inbound_message_id', mids) : { data: [] };
      const reasons: Record<string, number> = {};
      for (const d of drafts ?? []) reasons[d.reason ?? 'unknown'] = (reasons[d.reason ?? 'unknown'] ?? 0) + 1;
      return text({ messages: msgs?.length ?? 0, by_reason: reasons, sample_questions: (msgs ?? []).slice(0, 60).map((m) => m.text) });
    },
  );

  const propose = (kind: string, title: string, payload: Record<string, unknown>, propertyId: number | null) =>
    db.from('proposals').insert({ org_id: orgId, agent, kind, title, payload: { ...payload, run_id: runId }, property_id: propertyId }).select('id').single();

  server.registerTool(
    'propose_price',
    {
      description: 'Propose a nightly price change for a date range. Creates an approval card; it does NOT change any price.',
      inputSchema: {
        property_id: z.number().int(),
        from: z.string(),
        to: z.string(),
        current_price: z.number().optional(),
        suggested_price: z.number(),
        evidence: z.string().describe('Comparables and reasoning, 1-3 sentences.'),
        confidence: z.number().min(0).max(1),
      },
    },
    async (a) => {
      if (!(await propertyIds()).includes(a.property_id)) return text('Unknown property.');
      const { error } = await propose('price', `Precio ${a.from} → ${a.to}: ${a.suggested_price} €`, a, a.property_id);
      return text(error ? `Failed: ${error.message}` : 'Proposal created for the host.');
    },
  );

  server.registerTool(
    'propose_task',
    { description: 'Propose a task (a fix, a purchase, missing information) for the host.', inputSchema: { title: z.string(), property_id: z.number().int().optional(), notes: z.string().optional() } },
    async (a) => {
      const { error } = await propose('task', a.title, a, a.property_id ?? null);
      return text(error ? `Failed: ${error.message}` : 'Proposal created for the host.');
    },
  );

  server.registerTool(
    'propose_listing_copy',
    { description: 'Propose listing text (title, opening or description) for a property.', inputSchema: { property_id: z.number().int(), field: z.enum(['title', 'opening', 'description']), text: z.string() } },
    async (a) => {
      if (!(await propertyIds()).includes(a.property_id)) return text('Unknown property.');
      const { error } = await propose('listing_copy', `Texto del anuncio (${a.field})`, a, a.property_id);
      return text(error ? `Failed: ${error.message}` : 'Proposal created for the host.');
    },
  );

  server.registerTool(
    'finish_run',
    { description: 'Record the run summary for the host (2-4 sentences). Call once at the end.', inputSchema: { summary: z.string().max(2000) } },
    async ({ summary }) => {
      await db.from('agent_runs').update({ status: 'completed', summary, finished_at: new Date().toISOString() }).eq('id', runId).eq('org_id', orgId);
      return text('Saved.');
    },
  );

  return server;
}
