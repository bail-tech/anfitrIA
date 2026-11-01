import { features } from '@/lib/env';
import type { Conversation } from '@/lib/types';
import * as whatsapp from './whatsapp';

export class ChannelError extends Error {
  constructor(
    message: string,
    readonly code: 'not_configured' | 'window_closed' | 'send_failed',
  ) {
    super(message);
  }
}

/** Replies through the PMS, which delivers on the booking's channel (Airbnb, Booking.com…). */
async function sendViaSmoobu(conversation: Conversation, text: string): Promise<null> {
  // Loaded lazily: the admin client is server-only, and tests import this module.
  const [{ createAdminSupabase }, smoobu, sync] = await Promise.all([import('@/lib/supabase/server'), import('./smoobu'), import('@/lib/integrations/smoobu-sync')]);
  const bookingId = sync.bookingIdOf(conversation.guest_ref);
  if (!Number.isInteger(bookingId)) throw new ChannelError('This conversation is not linked to a Smoobu booking', 'send_failed');
  const admin = createAdminSupabase();
  const { data: property } = await admin.from('properties').select('org_id').eq('id', conversation.property_id).single<{ org_id: number }>();
  const { data: integration } = await admin.from('integrations').select('id, org_id, config, webhook_token, last_sync_at').eq('org_id', property?.org_id ?? -1).eq('provider', 'smoobu').maybeSingle();
  const creds = integration ? await sync.smoobuCredentials(admin, integration) : null;
  if (!creds) throw new ChannelError('Smoobu is not connected for this account', 'not_configured');
  try {
    await smoobu.sendMessage(creds, bookingId, text);
    return null; // Smoobu returns no message id; the webhook echo is matched by text
  } catch (e) {
    throw new ChannelError(e instanceof Error ? e.message : 'send failed', 'send_failed');
  }
}

/** What fills the update template when the 24-hour window is closed. */
export interface TemplateContext {
  guestName: string;
  propertyName: string;
  language: string;
}

/**
 * Sends text to the guest on the conversation's channel. The simulator only stores messages.
 * Outside WhatsApp's 24-hour window the text goes inside the approved update template when a
 * template context is given; otherwise it is refused.
 */
export async function sendToGuest(conversation: Conversation, text: string, opts: { checkWindow?: boolean; template?: TemplateContext } = {}): Promise<string | null> {
  if (conversation.channel === 'smoobu') return sendViaSmoobu(conversation, text);
  if (conversation.channel !== 'whatsapp') return null;
  if (!features.whatsapp()) throw new ChannelError('WhatsApp is not configured on this deployment', 'not_configured');
  const closed = opts.checkWindow && !whatsapp.inServiceWindow(conversation.last_guest_message_at);
  if (closed && !opts.template) {
    throw new ChannelError('More than 24 h since the guest last wrote: use an approved template', 'window_closed');
  }
  try {
    if (closed && opts.template) {
      const { guestName, propertyName, language } = opts.template;
      return await whatsapp.sendTemplate(conversation.guest_ref, whatsapp.UPDATE_TEMPLATE, language, [guestName.split(' ')[0] || '👋', propertyName, text]);
    }
    return await whatsapp.sendText(conversation.guest_ref, text);
  } catch (e) {
    throw new ChannelError(e instanceof Error ? e.message : 'send failed', 'send_failed');
  }
}

export async function sendAudioToGuest(conversation: Conversation, data: Uint8Array, mime: string): Promise<string | null> {
  if (conversation.channel === 'smoobu') throw new ChannelError('Voice notes can only be sent on WhatsApp', 'send_failed');
  if (conversation.channel !== 'whatsapp') return null;
  if (!features.whatsapp()) throw new ChannelError('WhatsApp is not configured on this deployment', 'not_configured');
  if (!whatsapp.inServiceWindow(conversation.last_guest_message_at)) {
    throw new ChannelError('More than 24 h since the guest last wrote: audio needs an open conversation', 'window_closed');
  }
  const base = mime.split(';')[0].trim();
  const mediaId = await whatsapp.uploadMedia(data, base, base === 'audio/ogg' ? 'note.ogg' : 'note.m4a');
  return whatsapp.sendAudio(conversation.guest_ref, mediaId, base === 'audio/ogg');
}
