/**
 * Feature switches. Everything that needs a secret degrades to a working, key-less
 * fallback, so a fresh deploy is usable before any key is added.
 */
const has = (name: string) => Boolean(process.env[name]?.trim());

export const features = {
  /** Claude for guest replies, the assistant and agents; otherwise the rule-based mock. */
  claude: () => has('ANTHROPIC_API_KEY'),
  /** Webhook, crons and agents run without a user session and need the service role. */
  serviceRole: () => has('SUPABASE_SERVICE_ROLE_KEY'),
  /** GPT-Live voice, transcription and TTS. */
  openai: () => has('OPENAI_API_KEY'),
  whatsapp: () => has('WHATSAPP_ACCESS_TOKEN') && has('WHATSAPP_PHONE_NUMBER_ID'),
  managedAgents: () => has('ANTHROPIC_API_KEY') && has('ANTHROPIC_ENVIRONMENT_ID'),
};

/** The app's model (guest replies and Anfi). Override with CLAUDE_MODEL, e.g. claude-opus-5-5 or claude-sonnet-5-5. */
export const CLAUDE_MODEL = process.env.CLAUDE_MODEL?.trim() || 'claude-haiku-5-5';

const MODEL_NAMES: Record<string, string> = {
  'claude-haiku-5-5': 'Claude Haiku 5.5',
  'claude-sonnet-5-5': 'Claude Sonnet 5.5',
  'claude-opus-5-5': 'Claude Opus 5.5',
};
export const CLAUDE_MODEL_NAME = MODEL_NAMES[CLAUDE_MODEL] ?? CLAUDE_MODEL;

/**
 * Server-side refusal fallback (`fallbacks: 'default'`) exists on the Opus, Sonnet 5.5 and Fable
 * models but not on Haiku; send it only where it is accepted.
 */
export function fallbackParams(model = CLAUDE_MODEL): { betas: string[]; fallbacks: 'default' } | Record<string, never> {
  return /^claude-(opus|sonnet-5-5|fable)/.test(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {};
}
