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

export const CLAUDE_MODEL = 'claude-opus-5-5';
