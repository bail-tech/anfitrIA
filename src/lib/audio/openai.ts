/**
 * Voice notes: transcribe what guests send, and speak approved text in the assistant's voice.
 * TTS returns OGG/Opus, which WhatsApp shows as a voice note.
 */
import 'server-only';
import OpenAI, { toFile } from 'openai';

export const TTS_MODEL = 'gpt-4o-mini-tts';
export const TTS_VOICE = 'coral';
export const TRANSCRIBE_MODEL = 'gpt-4o-transcribe';
/** WhatsApp caps audio at 16 MB; voice notes are far smaller, keep a sane limit. */
export const MAX_AUDIO_BYTES = 16 * 1024 * 1024;

let client: OpenAI | null = null;
const openai = () => (client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY?.trim() }));

const EXT: Record<string, string> = { 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/amr': 'amr', 'audio/webm': 'webm', 'audio/wav': 'wav' };
export const extensionFor = (mime: string) => EXT[mime.split(';')[0].trim()] ?? 'ogg';

export async function transcribe(data: Uint8Array, mime: string): Promise<string> {
  const file = await toFile(Buffer.from(data), `note.${extensionFor(mime)}`, { type: mime.split(';')[0] });
  const result = await openai().audio.transcriptions.create({ file, model: TRANSCRIBE_MODEL });
  return result.text.trim();
}

/** Speak `text` (already approved by the host) as an OGG/Opus voice note. */
export async function speak(text: string, language: string): Promise<Uint8Array> {
  const response = await openai().audio.speech.create({
    model: TTS_MODEL,
    voice: TTS_VOICE,
    input: text.slice(0, 4000),
    response_format: 'opus',
    instructions: `Speak warmly and clearly, like a friendly holiday-rental host, in the language of the text (${language}).`,
  });
  return new Uint8Array(await response.arrayBuffer());
}
