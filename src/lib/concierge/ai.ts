/**
 * Guest reply generation. Claude when ANTHROPIC_API_KEY is set; otherwise a deterministic,
 * key-less mock (the same behaviour as the Python app's), so the product works out of the box.
 * Either way the pipeline decides answer-vs-escalate from the returned confidence.
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { CLAUDE_MODEL, fallbackParams, features } from '@/lib/env';
import { SHARED_RULES, SKILLS } from '@/lib/skills/generated';
import { detectLanguage } from './language';

export interface GuestAIContext {
  guestText: string;
  propertyName: string;
  /** Best retrieved knowledge (most relevant first); the mock answers from the top one. */
  knowledge: string[];
  /** All property + building knowledge as the model may see it (private items as placeholders). */
  allKnowledge: string[];
  defaultLanguage: string;
  retrievalScore: number;
  stayContext: string | null;
  /** Calendar-computed early check-in / late check-out facts, when the message asks for them. */
  timing: string | null;
  /** Last messages of the thread, oldest first. */
  history: Array<{ direction: 'in' | 'out'; text: string }>;
}

export interface GuestAIReply {
  text: string;
  language: string;
  confidence: number;
  canAnswer: boolean;
  urgent: boolean;
  model: string;
}

export interface GuestAI {
  reply(ctx: GuestAIContext): Promise<GuestAIReply>;
}

// ---------------------------------------------------------------------------
// Mock (no key)
// ---------------------------------------------------------------------------

const LEAD: Record<string, string> = {
  es: '¡Hola! Aquí tienes la información: ',
  en: "Hi! Here's what you need: ",
  fr: "Bonjour ! Voici l'information : ",
  de: 'Hallo! Hier die Info: ',
  it: "Ciao! Ecco l'informazione: ",
};
const WAIT: Record<string, string> = {
  es: 'Gracias por escribir a {name}. Lo confirmo y te respondo enseguida.',
  en: "Thanks for reaching out to {name}. I'll check this and get back to you shortly.",
  fr: "Merci d'avoir contacté {name}. Je vérifie et je vous réponds très vite.",
  de: 'Danke für deine Nachricht an {name}. Ich prüfe das und melde mich gleich.',
  it: 'Grazie per aver scritto a {name}. Verifico e ti rispondo subito.',
};
const URGENT = /(urgen|emergenc|fuga|inund|no puedo entrar|me he quedado fuera|sin luz|sin agua|olor a gas|locked out|flood|leak|no water|no power|gas smell|fire|fuego|incendio|police|polic)/i;

export const mockAI: GuestAI = {
  async reply(ctx) {
    const language = detectLanguage(ctx.guestText, ctx.defaultLanguage);
    const lead = LEAD[language] ?? LEAD.es;
    if (URGENT.test(ctx.guestText)) {
      return { text: (WAIT[language] ?? WAIT.es).replace('{name}', ctx.propertyName), language, confidence: 0.1, canAnswer: false, urgent: true, model: 'mock' };
    }
    if (ctx.timing) {
      return { text: `${lead}${ctx.timing}`, language, confidence: 0.5, canAnswer: false, urgent: false, model: 'mock' };
    }
    if (ctx.knowledge.length) {
      const confidence = Math.min(0.6 + 0.4 * ctx.retrievalScore, 0.97);
      return { text: `${lead}${ctx.knowledge[0]}`, language, confidence, canAnswer: true, urgent: false, model: 'mock' };
    }
    if (ctx.stayContext) {
      return { text: `${lead}${ctx.stayContext}`, language, confidence: 0.7, canAnswer: true, urgent: false, model: 'mock' };
    }
    return { text: (WAIT[language] ?? WAIT.es).replace('{name}', ctx.propertyName), language, confidence: 0.3, canAnswer: false, urgent: false, model: 'mock' };
  },
};

// ---------------------------------------------------------------------------
// Claude
// ---------------------------------------------------------------------------

const ReplySchema = z.object({
  can_answer: z.boolean().describe('True only if the knowledge or reservation facts fully answer the guest.'),
  urgent: z.boolean().describe('Safety, locked out, utilities failure or an angry complaint.'),
  confidence: z.number().describe('Probability 0-1 that the reply is correct and complete.'),
  language: z.string().describe('ISO 639-1 code of the guest message, e.g. es, en, fr, de, it.'),
  reply: z.string().describe("The message for the guest, in the guest's language."),
});

const SYSTEM = `${SKILLS['guest-reply'].body}\n\n${SHARED_RULES}`;

export function buildGuestPrompt(ctx: GuestAIContext): string {
  const kb = ctx.allKnowledge.length ? ctx.allKnowledge.map((k) => `- ${k}`).join('\n') : '(no information recorded)';
  const history = ctx.history.length
    ? ctx.history.map((m) => `${m.direction === 'in' ? 'Guest' : 'Host'}: ${m.text}`).join('\n')
    : '(first message)';
  return [
    `<property name>${ctx.propertyName}</property name>`,
    `<knowledge>\n${kb}\n</knowledge>`,
    ctx.stayContext ? `<reservation>\n${ctx.stayContext}\n</reservation>` : '<reservation>none found for this guest</reservation>',
    ctx.timing ? `<computed_timing>\n${ctx.timing}\n</computed_timing>` : '',
    `<recent_thread>\n${history}\n</recent_thread>`,
    `<guest_message>\n${ctx.guestText}\n</guest_message>`,
    `The property's default language is ${ctx.defaultLanguage}.`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

let client: Anthropic | null = null;

export const claudeAI: GuestAI = {
  async reply(ctx) {
    const fallbackLanguage = detectLanguage(ctx.guestText, ctx.defaultLanguage);
    try {
      const response = await (client ??= new Anthropic()).beta.messages.parse({
        model: CLAUDE_MODEL,
        max_tokens: 4000,
        ...fallbackParams(),
        cache_control: { type: 'ephemeral' },
        output_config: { effort: 'low', format: betaZodOutputFormat(ReplySchema) },
        system: SYSTEM,
        messages: [{ role: 'user', content: buildGuestPrompt(ctx) }],
      });
      const out = response.parsed_output;
      if (response.stop_reason === 'refusal' || !out || !out.reply.trim()) throw new Error(`no usable reply (${response.stop_reason})`);
      const confidence = Math.min(Math.max(out.confidence, 0), 1);
      return {
        text: out.reply.trim(),
        language: out.language || fallbackLanguage,
        // A "can't answer" reply never clears the auto-answer threshold.
        confidence: out.can_answer && !out.urgent ? confidence : Math.min(confidence, 0.2),
        canAnswer: out.can_answer,
        urgent: out.urgent,
        model: response.model,
      };
    } catch (error) {
      if (error instanceof Anthropic.APIError) console.error('Claude guest reply failed', error.status);
      else console.error('Claude guest reply failed', error);
      // Safe degradation: escalate instead of breaking the conversation.
      const reply = await mockAI.reply({ ...ctx, knowledge: [], stayContext: null, timing: null });
      return { ...reply, confidence: 0.2, canAnswer: false, model: 'claude-error' };
    }
  },
};

export const guestAI = (): GuestAI => (features.claude() ? claudeAI : mockAI);
