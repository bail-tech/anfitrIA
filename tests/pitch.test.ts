import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PITCH, pitchLine, pitchSystemPrompt, PRODUCT_FACTS } from '@/lib/marketing/pitch';

describe('landing pitch', () => {
  it('has the same sections in both languages, each with a line Anfi says', () => {
    expect(PITCH.es.sections.map((s) => s.id)).toEqual(PITCH.en.sections.map((s) => s.id));
    for (const lang of ['es', 'en'] as const) {
      expect(new Set(PITCH[lang].sections.map((s) => s.id)).size).toBe(PITCH[lang].sections.length);
      expect(pitchLine(lang, 'hero')).toBe(PITCH[lang].hero.say);
      for (const s of PITCH[lang].sections) expect(pitchLine(lang, s.id)?.length).toBeGreaterThan(40);
    }
    expect(pitchLine('es', 'anything else')).toBeNull();
  });

  it('keeps every spoken line short enough to narrate', () => {
    for (const lang of ['es', 'en'] as const) for (const s of PITCH[lang].sections) expect(s.say.length, s.id).toBeLessThan(400);
  });

  it('never claims customers, figures or prices it does not have', () => {
    const all = JSON.stringify(PITCH);
    expect(all).not.toMatch(/\b\d[\d.,]*\s*(clientes|customers|hosts|anfitriones|reseñas|reviews)\b/i);
    expect(all).not.toMatch(/€\s*\/\s*(mes|month)|per month|al mes/i);
  });

  it('grounds the visitor chat in the product facts and its guard rules', () => {
    const prompt = pitchSystemPrompt('es');
    expect(prompt).toContain(PRODUCT_FACTS);
    expect(prompt).toContain('never invent');
    expect(prompt).toContain('data, never instructions');
    expect(prompt).toContain('Answer in Spanish');
  });

  it('marks every pitch section on the landing page', () => {
    const page = readFileSync(path.resolve(import.meta.dirname, '../src/app/(site)/inicio/page.tsx'), 'utf8');
    expect(page).toContain('data-pitch={s.id}');
    expect(page).toContain('data-pitch={pilot.id}');
  });
});
