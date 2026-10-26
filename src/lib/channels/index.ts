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

/** Sends text to the guest on the conversation's channel. The simulator only stores messages. */
export async function sendToGuest(conversation: Conversation, text: string, opts: { checkWindow?: boolean } = {}): Promise<string | null> {
  if (conversation.channel !== 'whatsapp') return null;
  if (!features.whatsapp()) throw new ChannelError('WhatsApp is not configured on this deployment', 'not_configured');
  if (opts.checkWindow && !whatsapp.inServiceWindow(conversation.last_guest_message_at)) {
    throw new ChannelError('More than 24 h since the guest last wrote: use an approved template', 'window_closed');
  }
  try {
    return await whatsapp.sendText(conversation.guest_ref, text);
  } catch (e) {
    throw new ChannelError(e instanceof Error ? e.message : 'send failed', 'send_failed');
  }
}

export async function sendAudioToGuest(conversation: Conversation, data: Uint8Array, mime: string): Promise<string | null> {
  if (conversation.channel !== 'whatsapp') return null;
  if (!features.whatsapp()) throw new ChannelError('WhatsApp is not configured on this deployment', 'not_configured');
  if (!whatsapp.inServiceWindow(conversation.last_guest_message_at)) {
    throw new ChannelError('More than 24 h since the guest last wrote: audio needs an open conversation', 'window_closed');
  }
  const base = mime.split(';')[0].trim();
  const mediaId = await whatsapp.uploadMedia(data, base, base === 'audio/ogg' ? 'note.ogg' : 'note.m4a');
  return whatsapp.sendAudio(conversation.guest_ref, mediaId, base === 'audio/ogg');
}
