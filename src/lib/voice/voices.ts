/** Voices Anfi can use. GPT-Live has its own built-in set; TTS (guest voice notes) a smaller one. */

export const LIVE_VOICES = [
  'alloy', 'ash', 'ballad', 'beacon', 'bossa', 'cedar', 'cinder', 'coral', 'delta', 'echo', 'gleam', 'marin',
  'meridian', 'quartz', 'ripple', 'sage', 'shida', 'shimmer', 'stone', 'tempo', 'verse', 'vesper', 'willow',
] as const;
export type LiveVoice = (typeof LIVE_VOICES)[number];

export const TTS_VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse', 'marin', 'cedar', 'fable', 'onyx', 'nova'] as const;

export const DEFAULT_VOICE: LiveVoice = 'bossa';

export const ASSISTANT_LANGUAGES = ['auto', 'es', 'en', 'fr', 'de', 'it'] as const;
export type AssistantLanguage = (typeof ASSISTANT_LANGUAGES)[number];

export const LANGUAGE_NAMES: Record<Exclude<AssistantLanguage, 'auto'>, string> = { es: 'Spanish', en: 'English', fr: 'French', de: 'German', it: 'Italian' };

export const isLiveVoice = (v: string | null | undefined): v is LiveVoice => LIVE_VOICES.includes(v as LiveVoice);
export const isAssistantLanguage = (v: string | null | undefined): v is AssistantLanguage => ASSISTANT_LANGUAGES.includes(v as AssistantLanguage);
export const CUSTOM_VOICE_ID = /^[A-Za-z0-9_-]{4,64}$/;

/** The voice GPT-Live should use: a custom voice id wins over the built-in choice. */
export function liveVoiceFor(p: { voice?: string | null; voice_custom_id?: string | null }): string | { id: string } {
  if (p.voice_custom_id && CUSTOM_VOICE_ID.test(p.voice_custom_id)) return { id: p.voice_custom_id };
  return isLiveVoice(p.voice) ? p.voice : DEFAULT_VOICE;
}

/** TTS (voice notes, previews) supports fewer voices: same name when possible, otherwise coral. */
export function ttsVoiceFor(voice: string | null | undefined): string {
  return TTS_VOICES.includes(voice as (typeof TTS_VOICES)[number]) ? (voice as string) : 'coral';
}
