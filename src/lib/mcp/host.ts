/**
 * AnfitrIA MCP server for hosts, opened with a personal API key from Claude, ChatGPT or any MCP
 * client. It runs with the service role, so every query is filtered by the key's organisation.
 * Same rule as Anfi: nothing reaches a guest without the host's tap — replies become approval
 * cards in the cockpit.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { embed, isZero, toVector } from '@/lib/concierge/embeddings';
import { todayIn } from '@/lib/concierge/stay';
import { appUrl } from '@/lib/env';
import { loadOverviewForOrg } from '@/lib/metrics-org';
import type { Property, Reservation } from '@/lib/types';

const text = (v: unknown) => ({ content: [{ type: 'text' as const, text: typeof v === 'string' ? v : JSON.stringify(v, null, 1) }] });

export function createHostMcp(db: SupabaseClient, orgId: number, profileId: string) {
  const server = new McpServer({ name: 'anfitria', version: '2.1.0' });
  const properties = async () => ((await db.from('properties').select('id, name, address, check_in_time, check_out_time, default_language, auto_answer').eq('org_id', orgId).order('name')).data ?? []) as Property[];
  const ownsProperty = async (id: number) => (await properties()).some((p) => p.id === id);
  /** The conversation, only if it belongs to one of the organisation's properties. */
  const ownConversation = async (id: number) => {
    const { data } = await db.from('conversations').select('id, property_id, guest_ref, channel, reservation_id, handoff').eq('id', id).maybeSingle();
    return data && (await ownsProperty(data.property_id)) ? data : null;
  };

  server.registerTool(
    'today_overview',
    { description: "The host's day: arrivals, departures, guests in house, open tasks, pending approvals and this month's numbers." },
    async () => {
      const today = todayIn();
      const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
      const props = await properties();
      const name = new Map(props.map((p) => [p.id, p.name]));
      const ids = props.map((p) => p.id);
      const [{ data: res }, { data: tasks }, kpis] = await Promise.all([
        ids.length ? db.from('reservations').select('guest_name, property_id, check_in, check_out, source, guests').in('property_id', ids).neq('status', 'cancelled').lte('check_in', tomorrow).gte('check_out', today) : Promise.resolve({ data: [] }),
        db.from('tasks').select('title, due_at, kind').eq('org_id', orgId).eq('status', 'open').lte('due_at', `${tomorrow}T23:59:59`).order('due_at'),
        loadOverviewForOrg(db, orgId),
      ]);
      const rows = (res ?? []) as Reservation[];
      const label = (r: Reservation) => ({ guest: r.guest_name, property: name.get(r.property_id), check_in: r.check_in, check_out: r.check_out, source: r.source, guests: r.guests });
      return text({
        today,
        arrivals_today: rows.filter((r) => r.check_in === today).map(label),
        departures_today: rows.filter((r) => r.check_out === today).map(label),
        arrivals_tomorrow: rows.filter((r) => r.check_in === tomorrow).map(label),
        in_house: rows.filter((r) => r.check_in < today && r.check_out > today).map(label),
        open_tasks: tasks ?? [],
        kpis,
        cockpit: appUrl(),
      });
    },
  );

  server.registerTool(
    'list_properties',
    { description: 'The properties (id, name, address, check-in/out times, language, whether the AI auto-answers).' },
    async () => text(await properties()),
  );

  server.registerTool(
    'check_availability',
    {
      description: 'Free and booked nights per property between two dates (YYYY-MM-DD, end exclusive). Use it to answer "is X free from … to …?".',
      inputSchema: { from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), property_id: z.number().int().optional() },
    },
    async ({ from, to, property_id }) => {
      const props = (await properties()).filter((p) => !property_id || p.id === property_id);
      if (!props.length) return text('Unknown property.');
      const { data } = await db.from('reservations').select('property_id, guest_name, check_in, check_out, nightly_rate').in('property_id', props.map((p) => p.id)).neq('status', 'cancelled').lt('check_in', to).gt('check_out', from);
      const bookings = (data ?? []) as Reservation[];
      return text(
        props.map((p) => {
          const overlapping = bookings.filter((b) => b.property_id === p.id);
          return { property_id: p.id, property: p.name, free: overlapping.length === 0, bookings: overlapping.map((b) => ({ guest: b.guest_name, check_in: b.check_in, check_out: b.check_out, nightly_rate: b.nightly_rate })) };
        }),
      );
    },
  );

  server.registerTool(
    'find_reservations',
    {
      description: 'Search bookings by guest name and/or dates (YYYY-MM-DD).',
      inputSchema: { guest: z.string().optional(), from: z.string().optional(), to: z.string().optional(), property_id: z.number().int().optional() },
    },
    async ({ guest, from, to, property_id }) => {
      const ids = (await properties()).map((p) => p.id).filter((id) => !property_id || id === property_id);
      if (!ids.length) return text([]);
      let q = db.from('reservations').select('id, property_id, guest_name, check_in, check_out, source, guests, total_amount, status').in('property_id', ids).order('check_in').limit(25);
      if (guest) q = q.ilike('guest_name', `%${guest.replace(/[%_]/g, '')}%`);
      if (from) q = q.gte('check_out', from);
      if (to) q = q.lte('check_in', to);
      return text((await q).data ?? []);
    },
  );

  server.registerTool(
    'list_escalations',
    { description: 'Guest messages the AI escalated and that wait for the host, with the AI draft and why.' },
    async () => {
      const ids = (await properties()).map((p) => p.id);
      const { data: convs } = ids.length ? await db.from('conversations').select('id, property_id').in('property_id', ids) : { data: [] };
      const convIds = (convs ?? []).map((c) => c.id as number);
      if (!convIds.length) return text([]);
      const { data: msgs } = await db.from('messages').select('id, conversation_id, text').in('conversation_id', convIds).eq('direction', 'in').order('id', { ascending: false }).limit(300);
      const byId = new Map((msgs ?? []).map((m) => [m.id as number, m]));
      const { data: drafts } = byId.size ? await db.from('drafts').select('id, inbound_message_id, text, reason, created_at').eq('status', 'pending').in('inbound_message_id', [...byId.keys()]).order('created_at', { ascending: false }).limit(20) : { data: [] };
      return text(
        (drafts ?? []).map((d) => {
          const m = byId.get(d.inbound_message_id);
          return { conversation_id: m?.conversation_id, guest_message: m?.text, why_escalated: d.reason, ai_draft: d.text, since: d.created_at };
        }),
      );
    },
  );

  server.registerTool(
    'read_conversation',
    { description: 'The last messages of a guest conversation, with its property and booking.', inputSchema: { conversation_id: z.number().int() } },
    async ({ conversation_id }) => {
      const conv = await ownConversation(conversation_id);
      if (!conv) return text('Unknown conversation.');
      const [{ data: msgs }, { data: res }] = await Promise.all([
        db.from('messages').select('direction, text, created_at').eq('conversation_id', conversation_id).order('id', { ascending: false }).limit(20),
        conv.reservation_id ? db.from('reservations').select('guest_name, check_in, check_out, guests').eq('id', conv.reservation_id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      return text({ channel: conv.channel, live_handoff: conv.handoff, reservation: res, messages: (msgs ?? []).reverse() });
    },
  );

  server.registerTool(
    'search_knowledge',
    { description: "What the AI knows about a property (wifi, access, rules…), matched to a question.", inputSchema: { property_id: z.number().int(), query: z.string() } },
    async ({ property_id, query }) => {
      if (!(await ownsProperty(property_id))) return text('Unknown property.');
      const v = embed(query);
      if (isZero(v)) return text([]);
      const { data } = await db.rpc('match_knowledge', { p_property: property_id, p_embedding: toVector(v), p_k: 6, p_threshold: 0.1 });
      // Private items (door codes) are only ever sent to guests during their stay, never here.
      return text(((data ?? []) as Array<{ category: string; content: string; is_private: boolean }>).map((k) => (k.is_private ? { category: k.category, content: '(private)' } : { category: k.category, content: k.content })));
    },
  );

  server.registerTool(
    'propose_guest_reply',
    {
      description: 'Prepare a reply to a guest. It does NOT send: it creates an approval card the host taps in the AnfitrIA cockpit. Say so to the user.',
      inputSchema: { conversation_id: z.number().int(), text: z.string().min(1).max(2000), as_voice_note: z.boolean().optional() },
    },
    async ({ conversation_id, text: reply, as_voice_note }) => {
      const conv = await ownConversation(conversation_id);
      if (!conv) return text('Unknown conversation.');
      const { error } = await db.from('proposals').insert({
        org_id: orgId,
        agent: 'assistant',
        kind: 'guest_message',
        conversation_id,
        property_id: conv.property_id,
        title: 'Respuesta preparada desde tu asistente (MCP)',
        payload: { text: reply, draft_id: null, as_voice: Boolean(as_voice_note), learn_category: null, via: 'mcp', profile_id: profileId },
      });
      return text(error ? `Failed: ${error.message}` : `Card created. The host approves it in ${appUrl()}/agentes — nothing was sent yet.`);
    },
  );

  server.registerTool(
    'create_task',
    { description: 'Create an internal task (maintenance, missing info, other) for a property.', inputSchema: { title: z.string().max(200), property_id: z.number().int().optional(), due_at: z.string().optional(), notes: z.string().max(1000).optional() } },
    async (a) => {
      if (a.property_id && !(await ownsProperty(a.property_id))) return text('Unknown property.');
      const { error } = await db.from('tasks').insert({ org_id: orgId, title: a.title, property_id: a.property_id ?? null, due_at: a.due_at ?? null, notes: a.notes ?? null, kind: 'other', source: 'ai' });
      return text(error ? `Failed: ${error.message}` : 'Task created.');
    },
  );

  return server;
}
