/**
 * POST /api/conversations/:id/audio (multipart)
 *   mode=my_voice, file=<recording>          the host's own voice note
 *   mode=assistant_voice, text=<approved>    the approved text spoken in the assistant's voice (TTS)
 * Optional: draft_id. WhatsApp only accepts audio within 24 h of the guest's last message.
 */
import { NextResponse } from 'next/server';
import { MAX_AUDIO_BYTES, speak, transcribe } from '@/lib/audio/openai';
import { loadConversation, resolvePrivate, sendHostAudio } from '@/lib/concierge/host';
import { features } from '@/lib/env';
import { fail, sameOrigin, withSession } from '@/lib/http';

export const maxDuration = 60;

const ACCEPTED = ['audio/ogg', 'audio/mp4', 'audio/aac', 'audio/mpeg', 'audio/webm'];

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return fail(403, 'unexpected origin');
  const conversationId = Number((await params).id);
  const form = await request.formData().catch(() => null);
  if (!form || !Number.isInteger(conversationId)) return fail(400, 'invalid body');
  const mode = form.get('mode') === 'assistant_voice' ? 'assistant_voice' : 'my_voice';
  const draftId = form.get('draft_id') ? Number(form.get('draft_id')) : null;

  return withSession(async ({ db, profile }) => {
    if (mode === 'assistant_voice') {
      if (!features.openai()) return fail(503, 'Voice notes in the assistant voice need OPENAI_API_KEY', 'not_configured');
      const text = String(form.get('text') ?? '').trim();
      if (!text) return fail(400, 'text required');
      const ctx = await loadConversation(db, conversationId);
      const spoken = await resolvePrivate(db, ctx, text, 'es');
      const audio = await speak(spoken, 'es');
      await sendHostAudio(db, profile, { conversationId, data: audio, mime: 'audio/ogg', transcript: spoken, mode, draftId });
      return NextResponse.json({ ok: true });
    }

    const file = form.get('file');
    if (!(file instanceof Blob) || file.size === 0) return fail(400, 'audio file required');
    if (file.size > MAX_AUDIO_BYTES) return fail(413, 'audio too large');
    const mime = (file.type || 'audio/ogg').split(';')[0];
    if (!ACCEPTED.includes(mime)) return fail(415, `unsupported audio type ${mime}`);
    const ctx = await loadConversation(db, conversationId);
    // WhatsApp rejects WebM (Chrome's recording format); the simulator accepts anything.
    if (ctx.conversation.channel === 'whatsapp' && mime === 'audio/webm') {
      return fail(415, 'This browser records WebM, which WhatsApp does not accept. Use the assistant voice, or record in Firefox/Safari.', 'webm_unsupported');
    }
    const data = new Uint8Array(await file.arrayBuffer());
    const transcript = features.openai() ? await transcribe(data, mime).catch(() => '') : '';
    await sendHostAudio(db, profile, { conversationId, data, mime, transcript, mode, draftId });
    return NextResponse.json({ ok: true, transcript });
  });
}
