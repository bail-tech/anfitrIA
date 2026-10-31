/**
 * Public replies to guest reviews, drafted with the `reviews` skill and the property's facts.
 * Always a draft: the host edits it and posts it on the platform themselves.
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { detectLanguage } from '@/lib/concierge/language';
import { CLAUDE_MODEL, fallbackParams, features } from '@/lib/env';
import { SHARED_RULES, SKILLS } from '@/lib/skills/generated';

export interface ReviewInput {
  property_id: number;
  rating: number | null;
  guest_name: string | null;
  text: string;
}

const Reply = z.object({ reply: z.string().describe('The public reply, ready to post.') });

/** Without Claude: a short, safe reply the host completes. */
export function templateReply(review: ReviewInput, propertyName: string): string {
  const es = detectLanguage(review.text, 'es') === 'es';
  const name = review.guest_name?.split(' ')[0];
  const low = review.rating !== null && review.rating <= 3;
  if (es) {
    return low
      ? `${name ? `Hola ${name}, ` : ''}gracias por tu reseña y por contarnos lo que no estuvo a la altura. [CHECK: qué has cambiado]. Esperamos recibirte de nuevo en ${propertyName}.`
      : `¡Gracias${name ? `, ${name}` : ''}! Nos alegra mucho que disfrutaras de ${propertyName}. ¡Te esperamos pronto!`;
  }
  return low
    ? `${name ? `Hi ${name}, ` : ''}thank you for your review and for telling us what fell short. [CHECK: what you've changed]. We hope to welcome you back to ${propertyName}.`
    : `Thank you${name ? `, ${name}` : ''}! We're so glad you enjoyed ${propertyName}. Hope to see you again soon!`;
}

let client: Anthropic | null = null;

export async function draftReviewReply(db: SupabaseClient, review: ReviewInput): Promise<string> {
  const { data: property } = await db.from('properties').select('name').eq('id', review.property_id).single<{ name: string }>();
  const name = property?.name ?? '';
  if (!features.claude()) return templateReply(review, name);
  const { data: facts } = await db.from('knowledge_items').select('category, content').eq('property_id', review.property_id).eq('is_private', false).limit(40);
  const skill = SKILLS.reviews;
  try {
    const response = await (client ??= new Anthropic()).beta.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 1500,
      ...fallbackParams(),
      output_config: { effort: 'low', format: betaZodOutputFormat(Reply) },
      system: `You write the host's public reply to a guest review of a holiday rental.\n\n${SHARED_RULES}\n\n## Skill: reviews\n${skill.body}`,
      messages: [
        {
          role: 'user',
          content: `Property: ${name}\nKnown facts:\n${(facts ?? []).map((f) => `- [${f.category}] ${f.content}`).join('\n') || '(none)'}\n\nReview (${review.rating ?? '?'}/5${review.guest_name ? ` by ${review.guest_name}` : ''}):\n<review>\n${review.text}\n</review>`,
        },
      ],
    });
    const reply = response.parsed_output?.reply?.trim();
    return reply || templateReply(review, name);
  } catch (e) {
    console.error('review reply failed', e);
    return templateReply(review, name);
  }
}
