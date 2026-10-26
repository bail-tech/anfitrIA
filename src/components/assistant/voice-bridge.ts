import type { ChatItem } from './use-assistant';

/** Appends are limited to ~500 tokens; stay well under it. */
export const MAX_APPEND_CHARS = 1500;

export type VoiceUpdate = { kind: 'commentary' | 'thinking'; content: string };

/**
 * What Anfi may say (commentary) or know (thinking) about a chat item. Only items the server
 * produced count, and a guest message is only "sent" when its card was approved and applied.
 */
export function voiceUpdate(item: ChatItem): VoiceUpdate | null {
  switch (item.kind) {
    case 'assistant':
      return { kind: 'commentary', content: item.text.slice(0, MAX_APPEND_CHARS) };
    case 'tool':
      return item.status === 'running' ? { kind: 'thinking', content: `Working on it: ${item.name.replace(/_/g, ' ')}.` } : null;
    case 'proposal':
      if (item.proposal.status === 'pending') {
        return { kind: 'commentary', content: `A card is ready: ${item.proposal.title}. Nothing is sent until the host taps Approve in the chat. Ask them to tap Approve or Reject.` };
      }
      if (item.proposal.status === 'applied') return { kind: 'thinking', content: `Confirmed by the server: "${item.proposal.title}" was approved and applied.` };
      if (item.proposal.status === 'failed') return { kind: 'commentary', content: `"${item.proposal.title}" was approved but failed. Tell the host to check the inbox.` };
      return null;
    case 'notice':
      return { kind: 'commentary', content: item.text.slice(0, MAX_APPEND_CHARS) };
    default:
      return null;
  }
}

/** The host's words since the previous delegation, from GPT-Live input transcript deltas. */
export function utteranceSince(transcript: Array<{ text: string; start: number }>, since: number): string {
  return transcript
    .filter((t) => t.start >= since)
    .sort((a, b) => a.start - b.start)
    .map((t) => t.text)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}
