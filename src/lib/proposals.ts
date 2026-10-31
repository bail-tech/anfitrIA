/**
 * Approving or rejecting what the assistant and the agents propose. This is the only place
 * where their output reaches guests, staff or the knowledge, and only on the host's tap.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { speak } from '@/lib/audio/openai';
import { ttsVoiceFor } from '@/lib/voice/voices';
import { features } from '@/lib/env';
import { sendText } from '@/lib/channels/whatsapp';
import { addKnowledge, loadConversation, resolvePrivate, sendHostAudio, sendHostReply } from '@/lib/concierge/host';
import type { Profile, Proposal } from '@/lib/types';

export type Decision = 'approve' | 'reject';

interface GuestMessagePayload {
  text: string;
  draft_id: number | null;
  as_voice: boolean;
  learn_category: string | null;
  upsell?: { item_id: string; name: string; price: number; currency: string; reservation_id: number | null };
}

export async function decideProposal(db: SupabaseClient, profile: Profile, id: string, decision: Decision, editedText?: string): Promise<Proposal> {
  const { data: p } = await db.from('proposals').select('*').eq('id', id).single<Proposal>();
  if (!p) throw new Error('proposal not found');
  if (p.status !== 'pending') throw new Error(`proposal already ${p.status}`);
  const finish = async (status: Proposal['status'], extra: Record<string, unknown> = {}) => {
    const { data } = await db
      .from('proposals')
      .update({ status, decided_at: new Date().toISOString(), decided_by: profile.id, payload: { ...p.payload, ...extra } })
      .eq('id', id)
      .select('*')
      .single<Proposal>();
    await db.from('audit_logs').insert({ org_id: profile.org_id, actor: 'host', actor_profile: profile.id, action: `proposal_${status}`, detail: `${p.kind}: ${p.title}`, conversation_id: p.conversation_id });
    return data ?? p;
  };

  if (decision === 'reject') return finish('rejected');

  try {
    switch (p.kind) {
      case 'guest_message': {
        const payload = p.payload as unknown as GuestMessagePayload;
        const text = (editedText ?? payload.text).trim();
        if (!p.conversation_id) throw new Error('no conversation');
        if (payload.as_voice && features.openai()) {
          const ctx = await loadConversation(db, p.conversation_id);
          const spoken = await resolvePrivate(db, ctx, text, 'es');
          const audio = await speak(spoken, 'es', ttsVoiceFor(profile.voice));
          await sendHostAudio(db, profile, { conversationId: p.conversation_id, data: audio, mime: 'audio/ogg', transcript: spoken, mode: 'assistant_voice', draftId: payload.draft_id });
        } else {
          // "Learn" pairs the guest's original question with the approved answer.
          let learn: { category: string; question: string } | null = null;
          if (payload.learn_category && payload.draft_id) {
            const { data: draft } = await db.from('drafts').select('inbound_message_id').eq('id', payload.draft_id).single<{ inbound_message_id: number }>();
            const { data: msg } = draft ? await db.from('messages').select('text').eq('id', draft.inbound_message_id).single<{ text: string }>() : { data: null };
            if (msg) learn = { category: payload.learn_category, question: msg.text };
          }
          await sendHostReply(db, profile, { conversationId: p.conversation_id, text, draftId: payload.draft_id, learn });
        }
        // An extra offered to the guest: tracked until the host marks it accepted or declined.
        if (payload.upsell) {
          const u = payload.upsell;
          await db.from('upsell_offers').insert({ org_id: profile.org_id, item_id: u.item_id, conversation_id: p.conversation_id, reservation_id: u.reservation_id, name: u.name, price: u.price, currency: u.currency });
        }
        return finish('applied', { sent_text: text });
      }
      case 'knowledge': {
        const payload = p.payload as { property_id: number | null; building_id: number | null; items: Array<{ category: string; content: string; is_private?: boolean }> };
        for (const item of payload.items) await addKnowledge(db, { propertyId: payload.property_id, buildingId: payload.building_id }, item.category, item.content, Boolean(item.is_private));
        return finish('applied');
      }
      case 'staff_message': {
        const payload = p.payload as { phone: string | null; text: string };
        const text = editedText ?? payload.text;
        // Staff messages are business-initiated: outside a conversation window WhatsApp needs a template,
        // so without WhatsApp configured the host sends it themselves and we just record the approval.
        if (features.whatsapp() && payload.phone) {
          await sendText(payload.phone.replace(/\D/g, ''), text);
          return finish('applied', { sent_text: text });
        }
        return finish('approved', { sent_text: text, note: 'manual_send' });
      }
      case 'task': {
        const payload = p.payload as { title: string; property_id?: number; due_at?: string; notes?: string };
        await db.from('tasks').insert({ org_id: profile.org_id, title: payload.title, property_id: payload.property_id ?? null, due_at: payload.due_at ?? null, notes: payload.notes ?? null, source: 'ai' });
        return finish('applied');
      }
      default:
        // price, listing_copy, review_reply: recorded as approved; applying them needs a channel/PMS integration.
        return finish('approved');
    }
  } catch (e) {
    await finish('failed', { error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

/** For the voice layer: what the character may say about a proposal card. */
export function proposalSpeech(p: Pick<Proposal, 'kind' | 'title'>): string {
  return `There is a card ready to approve: ${p.title}. Ask the host to tap Approve or Reject in the chat; nothing is sent until they do.`;
}

export { resolvePrivate };
