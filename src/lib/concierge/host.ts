/**
 * What the host does to a conversation: reply (text or voice note), approve the AI draft,
 * take over / hand back, and teach the AI by saving an answer to the knowledge.
 * Runs with the host's own client, so RLS keeps it inside their organisation.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { sendAudioToGuest, sendToGuest } from '@/lib/channels';
import type { Conversation, KnowledgeItem, Profile, Property, Reservation } from '@/lib/types';
import { embed, toVector } from './embeddings';
import { fillPrivate, privateWindowOpen } from './privacy';
import { todayIn } from './stay';

export interface ConversationContext {
  conversation: Conversation;
  property: Property;
  reservation: Reservation | null;
}

export async function loadConversation(db: SupabaseClient, conversationId: number): Promise<ConversationContext> {
  const { data: conversation, error } = await db.from('conversations').select('*').eq('id', conversationId).single<Conversation>();
  if (error || !conversation) throw new Error('conversation not found');
  const { data: property } = await db.from('properties').select('*').eq('id', conversation.property_id).single<Property>();
  if (!property) throw new Error('property not found');
  const { data: reservation } = conversation.reservation_id
    ? await db.from('reservations').select('*').eq('id', conversation.reservation_id).maybeSingle<Reservation>()
    : { data: null };
  return { conversation, property, reservation: reservation ?? null };
}

/** Fill private placeholders for this guest (only within their stay window). */
export async function resolvePrivate(db: SupabaseClient, ctx: ConversationContext, text: string, language: string): Promise<string> {
  if (!text.includes('{{private:')) return text;
  const { data } = await db.from('knowledge_items').select('id, content').eq('is_private', true);
  const values = new Map(((data ?? []) as Pick<KnowledgeItem, 'id' | 'content'>[]).map((k) => [k.id, k.content]));
  const today = todayIn(ctx.property.timezone);
  return fillPrivate(text, values, privateWindowOpen(ctx.reservation?.check_in ?? null, ctx.reservation?.check_out ?? null, today), language);
}

export async function addKnowledge(
  db: SupabaseClient,
  target: { propertyId?: number | null; buildingId?: number | null },
  category: string,
  content: string,
  isPrivate = false,
) {
  return db
    .from('knowledge_items')
    .insert({
      property_id: target.propertyId ?? null,
      building_id: target.buildingId ?? null,
      category: category.slice(0, 64) || 'general',
      content: content.slice(0, 4000),
      is_private: isPrivate,
      embedding: toVector(embed(`${category} ${content}`)),
    })
    .select('*')
    .single<KnowledgeItem>();
}

export interface HostReplyInput {
  conversationId: number;
  text: string;
  /** The pending AI draft this reply answers (approved as-is or edited). */
  draftId?: number | null;
  /** "Save to the property's knowledge": the AI answers it alone next time. */
  learn?: { category: string; question: string } | null;
}

export async function sendHostReply(db: SupabaseClient, profile: Profile, input: HostReplyInput) {
  const ctx = await loadConversation(db, input.conversationId);
  const language = 'es';
  const outgoing = await resolvePrivate(db, ctx, input.text, language);
  const externalId = await sendToGuest(ctx.conversation, outgoing, { checkWindow: true });
  await db.from('messages').insert({ conversation_id: ctx.conversation.id, direction: 'out', text: outgoing, external_id: externalId, sent_by: profile.id });

  if (input.draftId) {
    const { data: draft } = await db.from('drafts').select('text').eq('id', input.draftId).single<{ text: string }>();
    const edited = draft ? draft.text.trim() !== input.text.trim() : true;
    await db.from('drafts').update({ status: 'sent', text: input.text, approved_by: profile.id }).eq('id', input.draftId);
    await db.from('audit_logs').insert({
      org_id: profile.org_id,
      actor: 'host',
      actor_profile: profile.id,
      action: edited ? 'draft_edited_sent' : 'draft_approved',
      conversation_id: ctx.conversation.id,
    });
  } else {
    await db.from('audit_logs').insert({ org_id: profile.org_id, actor: 'host', actor_profile: profile.id, action: 'host_replied', conversation_id: ctx.conversation.id });
  }

  if (input.learn) {
    await addKnowledge(db, { propertyId: ctx.property.id }, input.learn.category, `${input.learn.question} → ${input.text}`);
    await db.from('audit_logs').insert({ org_id: profile.org_id, actor: 'host', actor_profile: profile.id, action: 'knowledge_learned', conversation_id: ctx.conversation.id });
  }
  await db.from('notifications').update({ read: true }).eq('conversation_id', ctx.conversation.id);
}

export async function sendHostAudio(
  db: SupabaseClient,
  profile: Profile,
  input: { conversationId: number; data: Uint8Array; mime: string; transcript: string; mode: 'my_voice' | 'assistant_voice'; draftId?: number | null },
) {
  const ctx = await loadConversation(db, input.conversationId);
  const base = input.mime.split(';')[0].trim();
  const path = `${profile.org_id}/${ctx.conversation.id}/${randomUUID()}.${base === 'audio/ogg' ? 'ogg' : base === 'audio/webm' ? 'webm' : 'm4a'}`;
  const upload = await db.storage.from('voice-notes').upload(path, input.data, { contentType: base });
  if (upload.error) throw new Error(`storage: ${upload.error.message}`);
  const externalId = await sendAudioToGuest(ctx.conversation, input.data, base);
  await db.from('messages').insert({
    conversation_id: ctx.conversation.id,
    direction: 'out',
    text: input.transcript || '(nota de voz)',
    transcript: input.transcript || null,
    kind: 'audio',
    media_path: path,
    external_id: externalId,
    sent_by: profile.id,
  });
  if (input.draftId) await db.from('drafts').update({ status: 'sent', approved_by: profile.id }).eq('id', input.draftId);
  await db.from('audit_logs').insert({
    org_id: profile.org_id,
    actor: 'host',
    actor_profile: profile.id,
    action: input.mode === 'my_voice' ? 'host_voice_note' : 'assistant_voice_note',
    conversation_id: ctx.conversation.id,
    detail: `${base} ${input.data.length} bytes`,
  });
}

export async function setHandoff(db: SupabaseClient, profile: Profile, conversationId: number, on: boolean) {
  await db.from('conversations').update({ handoff: on, assigned_profile: on ? profile.id : null }).eq('id', conversationId);
  await db.from('audit_logs').insert({
    org_id: profile.org_id,
    actor: 'host',
    actor_profile: profile.id,
    action: on ? 'handoff_taken' : 'handoff_released',
    conversation_id: conversationId,
  });
}
