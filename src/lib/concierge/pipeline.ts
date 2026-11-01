/**
 * Inbound guest message -> grounded reply or escalation. Port of the Python app's
 * `handle_inbound`, plus private details, calendar timing and urgency.
 *
 * Works with either a request-scoped client (simulator: RLS applies) or the service-role
 * client (WhatsApp webhook), so every write sets `org_id` explicitly.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Conversation, Draft, EscalationReason, KnowledgeItem, Message, Property, Reservation } from '@/lib/types';
import type { GuestAI } from './ai';
import { embed, isZero, toVector } from './embeddings';
import { detectLanguage, holdingMessage } from './language';
import { fillPrivate, forModel, privateWindowOpen } from './privacy';
import { phoneTail, samePhone } from '@/lib/channels/whatsapp-routing';
import { proposeUpsells } from '@/lib/upsells';
import { buildStayContext, pickReservation, todayIn } from './stay';
import { computeTiming, describeTiming, looksLikeTimingRequest } from './timing';

/** Global auto-answer threshold when the property has none. */
export const DEFAULT_THRESHOLD = 0.55;
const HISTORY = 6;

export type Channel = 'sim' | 'whatsapp' | 'smoobu';

export interface InboundInput {
  property: Property;
  guestRef: string;
  text: string;
  channel: Channel;
  externalId?: string | null;
  /** Voice notes: the stored audio and its transcript (`text` is the transcript). */
  audio?: { path: string; transcript: string } | null;
  /** The booking the channel already matched this message to (shared WhatsApp number). */
  reservationId?: number | null;
}

export interface PipelineDeps {
  db: SupabaseClient;
  ai: GuestAI;
  /** Deliver a message to the guest on the conversation's channel; returns the channel's message id. */
  send: (conversation: Conversation, text: string) => Promise<string | null>;
  now?: Date;
}

export interface InboundOutcome {
  conversation: Conversation;
  inbound: Message;
  draft: Draft | null;
  answered: boolean;
  reason: EscalationReason | null;
  duplicate: boolean;
}

function must<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error || result.data === null) throw new Error(`${what}: ${result.error?.message ?? 'no data'}`);
  return result.data;
}

export function decide(
  reply: { confidence: number; canAnswer: boolean; urgent: boolean },
  property: Pick<Property, 'auto_answer' | 'auto_answer_threshold'>,
  hasKnowledge: boolean,
): { answered: boolean; reason: EscalationReason } {
  const threshold = property.auto_answer_threshold ?? DEFAULT_THRESHOLD;
  if (reply.urgent) return { answered: false, reason: 'urgente' };
  if (!property.auto_answer) return { answered: false, reason: 'manual' };
  if (reply.canAnswer && reply.confidence >= threshold) return { answered: true, reason: 'auto' };
  return { answered: false, reason: hasKnowledge ? 'poca_confianza' : 'sin_info' };
}

export async function handleInbound(input: InboundInput, deps: PipelineDeps): Promise<InboundOutcome> {
  const { db } = deps;
  const { property, guestRef, text, channel } = input;
  const orgId = property.org_id;
  const now = deps.now ?? new Date();
  const today = todayIn(property.timezone, now);

  // Idempotency: a retried webhook must not answer twice.
  if (input.externalId) {
    const { data: existing } = await db.from('messages').select('*').eq('external_id', input.externalId).maybeSingle();
    if (existing) {
      const conversation = must(await db.from('conversations').select('*').eq('id', existing.conversation_id).single<Conversation>(), 'conversation');
      const { data: draft } = await db.from('drafts').select('*').eq('inbound_message_id', existing.id).maybeSingle<Draft>();
      return { conversation, inbound: existing, draft: draft ?? null, answered: false, reason: null, duplicate: true };
    }
  }

  // Conversation per (property, guest, channel).
  let { data: conversation } = await db
    .from('conversations')
    .select('*')
    .eq('property_id', property.id)
    .eq('guest_ref', guestRef)
    .eq('channel', channel)
    .maybeSingle<Conversation>();
  if (!conversation) {
    conversation = must(
      await db.from('conversations').insert({ property_id: property.id, guest_ref: guestRef, channel }).select('*').single<Conversation>(),
      'create conversation',
    );
  }

  const inbound = must(
    await db
      .from('messages')
      .insert({
        conversation_id: conversation.id,
        direction: 'in',
        text,
        language: detectLanguage(text, property.default_language),
        external_id: input.externalId ?? null,
        kind: input.audio ? 'audio' : 'text',
        media_path: input.audio?.path ?? null,
        transcript: input.audio?.transcript ?? null,
      })
      .select('*')
      .single<Message>(),
    'store inbound',
  );

  // Link the conversation to the guest's reservation.
  // Bookings may store the phone with "+", spaces or without the country code.
  const tail = phoneTail(guestRef);
  const { data: guestReservations } = tail
    ? await db.from('reservations').select('*').eq('property_id', property.id).like('guest_ref', `%${tail}`)
    : await db.from('reservations').select('*').eq('property_id', property.id).eq('guest_ref', guestRef);
  let reservation = pickReservation(((guestReservations ?? []) as Reservation[]).filter((r) => !tail || samePhone(r.guest_ref, guestRef)), today);
  // PMS conversations are keyed by booking, not phone: use the booking they were created for
  // (or the one the channel matched by booking code).
  const linkedId = input.reservationId ?? conversation.reservation_id;
  if (!reservation && linkedId) {
    const { data: linked } = await db.from('reservations').select('*').eq('id', linkedId).maybeSingle<Reservation>();
    reservation = linked ?? null;
  }
  const convPatch: Partial<Conversation> = { last_guest_message_at: now.toISOString() };
  if (reservation && conversation.reservation_id !== reservation.id) convPatch.reservation_id = reservation.id;
  await db.from('conversations').update(convPatch).eq('id', conversation.id);
  conversation = { ...conversation, ...convPatch };

  // Extras the guest asks for (early check-in, parking…) become priced offer cards for the host.
  try {
    await proposeUpsells(db, { orgId, propertyId: property.id, conversationId: conversation.id, reservationId: reservation?.id ?? null, guestName: reservation?.guest_name ?? null, language: inbound.language, text });
  } catch (e) {
    console.error('upsell detection failed', e);
  }

  // Live handoff: a person has taken over; the AI stays out and only notifies.
  if (conversation.handoff) {
    await db.from('audit_logs').insert({ org_id: orgId, actor: 'ai', action: 'handoff_inbound', conversation_id: conversation.id });
    await db.from('notifications').insert({ org_id: orgId, conversation_id: conversation.id, kind: 'handoff', message: `${property.name}: nuevo mensaje (atención en vivo)` });
    return { conversation, inbound, draft: null, answered: false, reason: null, duplicate: false };
  }

  // Knowledge: the property's own plus its building's shared items.
  let knowledgeQuery = db.from('knowledge_items').select('id, category, content, is_private, property_id, building_id');
  knowledgeQuery = property.building_id
    ? knowledgeQuery.or(`property_id.eq.${property.id},building_id.eq.${property.building_id}`)
    : knowledgeQuery.eq('property_id', property.id);
  const { data: knowledgeRows } = await knowledgeQuery;
  const knowledge = (knowledgeRows ?? []) as KnowledgeItem[];
  const privateValues = new Map(knowledge.filter((k) => k.is_private).map((k) => [k.id, k.content]));

  // Retrieval (pgvector) for the mock and as a confidence signal.
  const vector = embed(text);
  let retrieved: Array<{ id: number; score: number }> = [];
  if (!isZero(vector)) {
    const { data } = await db.rpc('match_knowledge', { p_property: property.id, p_embedding: toVector(vector), p_k: 3, p_threshold: 0.25 });
    retrieved = (data ?? []) as Array<{ id: number; score: number }>;
  }
  const byId = new Map(knowledge.map((k) => [k.id, k]));
  const retrievedText = retrieved.map((r) => byId.get(r.id)).filter((k): k is KnowledgeItem => Boolean(k)).map(forModel);

  // Early check-in / late check-out: computed from the calendar, phrased by the AI.
  let timing: string | null = null;
  if (reservation && looksLikeTimingRequest(text)) {
    const { data: others } = await db
      .from('reservations')
      .select('id, check_in, check_out, status')
      .eq('property_id', property.id)
      .neq('id', reservation.id)
      .neq('status', 'cancelled');
    const list = (others ?? []) as Array<Pick<Reservation, 'check_in' | 'check_out'>>;
    timing = describeTiming(
      computeTiming({
        checkIn: reservation.check_in,
        checkOut: reservation.check_out,
        previousCheckOut: list.find((r) => r.check_out === reservation.check_in)?.check_out ?? null,
        nextCheckIn: list.find((r) => r.check_in === reservation.check_out)?.check_in ?? null,
        checkInTime: property.check_in_time,
        checkOutTime: property.check_out_time,
        cleaningMinutes: property.cleaning_minutes,
      }),
    );
  }

  const { data: recent } = await db
    .from('messages')
    .select('direction, text')
    .eq('conversation_id', conversation.id)
    .neq('id', inbound.id)
    .order('id', { ascending: false })
    .limit(HISTORY);

  const reply = await deps.ai.reply({
    guestText: text,
    propertyName: property.name,
    knowledge: retrievedText,
    allKnowledge: knowledge.map(forModel),
    defaultLanguage: property.default_language,
    retrievalScore: retrieved[0]?.score ?? 0,
    stayContext: reservation ? buildStayContext(reservation, today, { checkIn: property.check_in_time, checkOut: property.check_out_time }) : null,
    timing,
    history: ((recent ?? []) as Array<{ direction: 'in' | 'out'; text: string }>).reverse(),
  });

  const { answered, reason } = decide(reply, property, knowledge.length > 0);

  const draft = must(
    await db
      .from('drafts')
      .insert({
        inbound_message_id: inbound.id,
        text: reply.text,
        language: reply.language,
        confidence: reply.confidence,
        model: reply.model,
        reason,
        status: 'pending',
      })
      .select('*')
      .single<Draft>(),
    'store draft',
  );
  await db.from('audit_logs').insert({
    org_id: orgId,
    actor: 'ai',
    action: 'draft_generated',
    conversation_id: conversation.id,
    detail: `confidence=${reply.confidence.toFixed(2)} model=${reply.model} reason=${reason}`,
  });

  if (answered) {
    const allowed = privateWindowOpen(reservation?.check_in ?? null, reservation?.check_out ?? null, today);
    const outgoing = fillPrivate(reply.text, privateValues, allowed, reply.language);
    const externalId = await deps.send(conversation, outgoing);
    await db.from('messages').insert({ conversation_id: conversation.id, direction: 'out', text: outgoing, language: reply.language, external_id: externalId });
    await db.from('drafts').update({ status: 'sent' }).eq('id', draft.id);
    await db.from('audit_logs').insert({ org_id: orgId, actor: 'ai', action: 'auto_answered', conversation_id: conversation.id });
    return { conversation, inbound, draft: { ...draft, status: 'sent' }, answered, reason, duplicate: false };
  }

  // Escalated: the guest gets a holding message at once; the draft waits for the host.
  const holding = holdingMessage(reply.language);
  const externalId = await deps.send(conversation, holding);
  await db.from('messages').insert({ conversation_id: conversation.id, direction: 'out', text: holding, language: reply.language, external_id: externalId });
  await db.from('audit_logs').insert({ org_id: orgId, actor: 'ai', action: 'escalated', conversation_id: conversation.id, detail: reason });
  if (!conversation.assigned_profile) {
    const { data: org } = await db.from('organizations').select('escalation_profile').eq('id', orgId).maybeSingle<{ escalation_profile: string | null }>();
    if (org?.escalation_profile) {
      await db.from('conversations').update({ assigned_profile: org.escalation_profile }).eq('id', conversation.id);
      conversation = { ...conversation, assigned_profile: org.escalation_profile };
    }
  }
  const preview = text.length <= 80 ? text : `${text.slice(0, 77)}…`;
  await db.from('notifications').insert({
    org_id: orgId,
    conversation_id: conversation.id,
    kind: reason === 'urgente' ? 'urgent' : 'escalation',
    message: `${property.name}: "${preview}"`,
  });
  return { conversation, inbound, draft, answered, reason, duplicate: false };
}
