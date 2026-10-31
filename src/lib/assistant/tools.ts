/**
 * The host assistant's tools. Reads run directly with the host's own client (RLS).
 * Anything that reaches a guest, staff or the knowledge becomes a proposal: the host
 * approves it with a tap in the chat. The assistant can never send on its own.
 */
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { learnFromHistory } from '@/lib/agents/learn';
import { draftReviewReply } from '@/lib/agents/review-reply';
import { runOperations } from '@/lib/agents/operations';
import { embed, isZero, toVector } from '@/lib/concierge/embeddings';
import { forModel } from '@/lib/concierge/privacy';
import { todayIn } from '@/lib/concierge/stay';
import { loadOverview } from '@/lib/metrics';
import type { Draft, KnowledgeItem, Message, Profile, Proposal, Reservation } from '@/lib/types';
import type { UiAction } from './ui-tools';

export type AssistantEvent =
  | { type: 'text'; text: string }
  | { type: 'tool'; id: string; name: string; status: 'running' | 'ok' | 'error'; detail?: string }
  | { type: 'proposal'; proposal: Proposal }
  | { type: 'ui'; action: UiAction }
  | { type: 'notice'; key: 'no_claude' | 'error' | 'refused'; text: string }
  | { type: 'done' };

export interface ToolContext {
  db: SupabaseClient;
  profile: Profile;
  emit: (e: AssistantEvent) => void;
}

const json = (v: unknown) => JSON.stringify(v, null, 1);
let seq = 0;

/** Wraps a tool body with running/ok/error events for the chat dock and the character's screens. */
function step<T>(ctx: ToolContext, name: string, fn: () => Promise<T>): Promise<T> {
  const id = `t${++seq}`;
  ctx.emit({ type: 'tool', id, name, status: 'running' });
  return fn().then(
    (v) => {
      ctx.emit({ type: 'tool', id, name, status: 'ok' });
      return v;
    },
    (e: unknown) => {
      ctx.emit({ type: 'tool', id, name, status: 'error', detail: e instanceof Error ? e.message : String(e) });
      throw e;
    },
  );
}

async function propose(ctx: ToolContext, row: Omit<Proposal, 'id' | 'org_id' | 'status' | 'created_at'>): Promise<Proposal> {
  const { data, error } = await ctx.db
    .from('proposals')
    .insert({ ...row, org_id: ctx.profile.org_id })
    .select('*')
    .single<Proposal>();
  if (error || !data) throw new Error(`proposal: ${error?.message}`);
  ctx.emit({ type: 'proposal', proposal: data });
  return data;
}

export async function todayOverview(db: SupabaseClient) {
  const today = todayIn();
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const [overview, { data: res }, { data: props }, { data: tasks }] = await Promise.all([
    loadOverview(db, today),
    db.from('reservations').select('id, property_id, guest_name, check_in, check_out, source, guests, status').neq('status', 'cancelled').lte('check_in', tomorrow).gte('check_out', today),
    db.from('properties').select('id, name'),
    db.from('tasks').select('title, due_at, status, kind').eq('status', 'open').lte('due_at', `${tomorrow}T23:59:59`).order('due_at'),
  ]);
  const name = new Map((props ?? []).map((p) => [p.id, p.name]));
  const rows = (res ?? []) as Reservation[];
  const label = (r: Reservation) => ({ guest: r.guest_name, property: name.get(r.property_id), source: r.source, guests: r.guests, check_in: r.check_in, check_out: r.check_out });
  return {
    today,
    arrivals_today: rows.filter((r) => r.check_in === today).map(label),
    departures_today: rows.filter((r) => r.check_out === today).map(label),
    arrivals_tomorrow: rows.filter((r) => r.check_in === tomorrow).map(label),
    in_house: rows.filter((r) => r.check_in < today && r.check_out > today).map(label),
    open_tasks: tasks ?? [],
    pending: overview.pending,
    month: overview.hasPrices ? overview.month : 'no prices recorded (connect a PMS or add amounts)',
    ai_resolution_rate: Math.round(overview.ai.rate * 100),
  };
}

export async function listEscalations(db: SupabaseClient) {
  const { data: drafts } = await db.from('drafts').select('id, inbound_message_id, text, reason, confidence, created_at').eq('status', 'pending').order('created_at', { ascending: false }).limit(20);
  const list = (drafts ?? []) as Draft[];
  if (!list.length) return [];
  const { data: msgs } = await db.from('messages').select('id, conversation_id, text, language').in('id', list.map((d) => d.inbound_message_id));
  const byId = new Map(((msgs ?? []) as Message[]).map((m) => [m.id, m]));
  const convIds = [...new Set(((msgs ?? []) as Message[]).map((m) => m.conversation_id))];
  const { data: convs } = await db.from('conversations').select('id, property_id, guest_ref, reservation_id').in('id', convIds);
  const { data: props } = await db.from('properties').select('id, name');
  const pname = new Map((props ?? []).map((p) => [p.id, p.name]));
  const conv = new Map((convs ?? []).map((c) => [c.id, c]));
  return list.map((d) => {
    const m = byId.get(d.inbound_message_id);
    const c = m ? conv.get(m.conversation_id) : undefined;
    return {
      draft_id: d.id,
      conversation_id: m?.conversation_id,
      property: c ? pname.get(c.property_id) : null,
      guest_message: m?.text,
      language: m?.language,
      why_escalated: d.reason,
      ai_draft: d.text,
      since: d.created_at,
    };
  });
}

export function hostTools(ctx: ToolContext) {
  const { db } = ctx;
  return [
    betaZodTool({
      name: 'today_overview',
      description: "The host's day: arrivals, departures, guests in house, open tasks, pending approvals and this month's numbers.",
      inputSchema: z.object({}),
      run: () => step(ctx, 'today_overview', async () => json(await todayOverview(db))),
    }),
    betaZodTool({
      name: 'list_escalations',
      description: 'Guest messages the AI escalated and that wait for the host, with the AI draft and why it escalated.',
      inputSchema: z.object({}),
      run: () => step(ctx, 'list_escalations', async () => json(await listEscalations(db))),
    }),
    betaZodTool({
      name: 'read_conversation',
      description: 'The last messages of one guest conversation, its property and reservation.',
      inputSchema: z.object({ conversation_id: z.number().int() }),
      run: ({ conversation_id }) =>
        step(ctx, 'read_conversation', async () => {
          const { data: conv } = await db.from('conversations').select('*').eq('id', conversation_id).single();
          if (!conv) return 'Conversation not found.';
          const [{ data: msgs }, { data: prop }, { data: res }] = await Promise.all([
            db.from('messages').select('direction, text, kind, created_at').eq('conversation_id', conversation_id).order('id', { ascending: false }).limit(20),
            db.from('properties').select('id, name').eq('id', conv.property_id).single(),
            conv.reservation_id ? db.from('reservations').select('guest_name, check_in, check_out, source, guests').eq('id', conv.reservation_id).single() : Promise.resolve({ data: null }),
          ]);
          return json({ conversation_id, channel: conv.channel, handoff: conv.handoff, property: prop, reservation: res, messages: (msgs ?? []).reverse() });
        }),
    }),
    betaZodTool({
      name: 'find_reservations',
      description: 'Search reservations by guest name, booking code or a date (YYYY-MM-DD) that falls within the stay.',
      inputSchema: z.object({ query: z.string().optional(), date: z.string().optional() }),
      run: ({ query, date }) =>
        step(ctx, 'find_reservations', async () => {
          let q = db.from('reservations').select('id, property_id, guest_name, guest_ref, check_in, check_out, source, code, guests, total_amount, status').order('check_in').limit(20);
          if (query) q = q.or(`guest_name.ilike.%${query.replace(/[%,()]/g, '')}%,code.ilike.%${query.replace(/[%,()]/g, '')}%`);
          if (date) q = q.lte('check_in', date).gte('check_out', date);
          const { data } = await q;
          return json(data ?? []);
        }),
    }),
    betaZodTool({
      name: 'list_properties',
      description: 'The host’s properties with their settings (auto-answer, threshold, check-in/out times, building).',
      inputSchema: z.object({}),
      run: () =>
        step(ctx, 'list_properties', async () => {
          const { data } = await db.from('properties').select('id, name, address, building_id, auto_answer, auto_answer_threshold, check_in_time, check_out_time, cleaning_minutes, default_language');
          return json(data ?? []);
        }),
    }),
    betaZodTool({
      name: 'search_knowledge',
      description: "Search a property's knowledge (and its building's shared knowledge). Private items show as placeholders.",
      inputSchema: z.object({ property_id: z.number().int(), query: z.string() }),
      run: ({ property_id, query }) =>
        step(ctx, 'search_knowledge', async () => {
          const v = embed(query);
          if (isZero(v)) return '[]';
          const { data } = await db.rpc('match_knowledge', { p_property: property_id, p_embedding: toVector(v), p_k: 6, p_threshold: 0.1 });
          return json(((data ?? []) as Array<KnowledgeItem & { score: number }>).map((k) => ({ id: k.id, text: forModel(k), score: Math.round(k.score * 100) / 100 })));
        }),
    }),
    betaZodTool({
      name: 'propose_guest_reply',
      description:
        'Prepare a reply to a guest. It does NOT send: it shows an approval card and the host taps Send. Use draft_id when it answers an escalation. Set as_voice to offer it as a voice note in the assistant voice.',
      inputSchema: z.object({
        conversation_id: z.number().int(),
        text: z.string().min(1).max(2000),
        draft_id: z.number().int().optional(),
        as_voice: z.boolean().optional(),
        learn_category: z.string().optional().describe('If set, the host may also save this answer to the property knowledge under this category.'),
      }),
      run: (input) =>
        step(ctx, 'propose_guest_reply', async () => {
          const p = await propose(ctx, {
            agent: 'assistant',
            kind: 'guest_message',
            property_id: null,
            conversation_id: input.conversation_id,
            title: input.as_voice ? 'Responder con nota de voz' : 'Responder al huésped',
            payload: { text: input.text, draft_id: input.draft_id ?? null, as_voice: Boolean(input.as_voice), learn_category: input.learn_category ?? null },
          });
          return `Proposal ${p.id} created. Not sent yet: the host must tap Send on the card.`;
        }),
    }),
    betaZodTool({
      name: 'propose_knowledge',
      description: 'Propose new knowledge for a property or a building (one fact per item). The host approves it before the guest AI uses it.',
      inputSchema: z.object({
        property_id: z.number().int().optional(),
        building_id: z.number().int().optional(),
        items: z.array(z.object({ category: z.string(), content: z.string(), is_private: z.boolean().optional() })).min(1).max(20),
      }),
      run: (input) =>
        step(ctx, 'propose_knowledge', async () => {
          if (!input.property_id && !input.building_id) return 'Give a property_id or a building_id.';
          const p = await propose(ctx, {
            agent: 'assistant',
            kind: 'knowledge',
            property_id: input.property_id ?? null,
            conversation_id: null,
            title: `Añadir ${input.items.length} dato(s) a la ficha`,
            payload: { property_id: input.property_id ?? null, building_id: input.building_id ?? null, items: input.items },
          });
          return `Proposal ${p.id} created; waiting for the host's approval.`;
        }),
    }),
    betaZodTool({
      name: 'learn_from_history',
      description: "Read how the host has answered guests at a property and propose the property facts found there (wifi, access, rules, tips) as one knowledge card for the host to approve.",
      inputSchema: z.object({ property_id: z.number().int() }),
      run: ({ property_id }) =>
        step(ctx, 'learn_from_history', async () => {
          const r = await learnFromHistory(db, ctx.profile.org_id, property_id);
          if (!r.proposal) return `Nothing proposed (${r.reason}; ${r.exchanges} answered exchanges found).`;
          ctx.emit({ type: 'proposal', proposal: r.proposal });
          return `Card ${r.proposal.id} created from ${r.exchanges} past answers; waiting for the host's approval.`;
        }),
    }),
    betaZodTool({
      name: 'draft_review_reply',
      description: "Draft the host's public reply to a guest review and save it on the Reviews page for the host to edit and post. Never posts anything.",
      inputSchema: z.object({ property_id: z.number().int(), text: z.string().min(1).max(5000), rating: z.number().int().min(1).max(5).optional(), guest_name: z.string().optional(), platform: z.enum(['airbnb', 'booking', 'vrbo', 'google', 'other']).optional() }),
      run: (input) =>
        step(ctx, 'draft_review_reply', async () => {
          const review = { property_id: input.property_id, rating: input.rating ?? null, guest_name: input.guest_name ?? null, text: input.text };
          const reply = await draftReviewReply(db, review);
          const { error } = await db.from('reviews').insert({ ...review, org_id: ctx.profile.org_id, platform: input.platform ?? 'airbnb', reply });
          return error ? `Could not save: ${error.message}` : `Draft saved on the Reviews page. Reply:\n${reply}`;
        }),
    }),
    betaZodTool({
      name: 'set_handoff',
      description: 'Take over a conversation (the AI stops answering it) or hand it back to the AI.',
      inputSchema: z.object({ conversation_id: z.number().int(), take_over: z.boolean() }),
      run: ({ conversation_id, take_over }) =>
        step(ctx, 'set_handoff', async () => {
          await db.from('conversations').update({ handoff: take_over, assigned_profile: take_over ? ctx.profile.id : null }).eq('id', conversation_id);
          await db.from('audit_logs').insert({ org_id: ctx.profile.org_id, actor: 'host', actor_profile: ctx.profile.id, action: take_over ? 'handoff_taken' : 'handoff_released', conversation_id });
          return take_over ? 'Done: the AI no longer answers this conversation.' : 'Done: the AI answers this conversation again.';
        }),
    }),
    betaZodTool({
      name: 'create_task',
      description: 'Create an internal task (maintenance, missing info, other) for a property.',
      inputSchema: z.object({ title: z.string(), property_id: z.number().int().optional(), due_at: z.string().optional(), kind: z.enum(['maintenance', 'missing_info', 'other']).optional(), notes: z.string().optional() }),
      run: (input) =>
        step(ctx, 'create_task', async () => {
          const { error } = await db.from('tasks').insert({ org_id: ctx.profile.org_id, title: input.title, property_id: input.property_id ?? null, due_at: input.due_at ?? null, kind: input.kind ?? 'other', notes: input.notes ?? null, source: 'ai' });
          return error ? `Could not create the task: ${error.message}` : 'Task created.';
        }),
    }),
    betaZodTool({
      name: 'plan_turnovers',
      description: 'Plan cleanings for the next 14 days from the booking calendar. Creates tasks and staff-message proposals.',
      inputSchema: z.object({}),
      run: () => step(ctx, 'plan_turnovers', async () => json(await runOperations(db, ctx.profile.org_id))),
    }),
  ];
}
