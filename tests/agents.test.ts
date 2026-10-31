import { describe, expect, it } from 'vitest';
import { stageOf } from '@/lib/agents/journey-defaults';
import { exchanges } from '@/lib/agents/learn';
import { applies, dueAt, isDue, LATE_MS, renderTemplate, SEND_WINDOW_MS } from '@/lib/agents/lifecycle';
import { issueRunToken, RUN_TOKEN_TTL_SECONDS, verifyRunToken } from '@/lib/mcp/token';
import { SHARED_RULES, SKILLS } from '@/lib/skills/generated';
import { systemPrompt } from '@/lib/assistant/run';

describe('MCP run tokens', () => {
  const now = Date.parse('2026-10-26T12:00:00Z');
  it('round-trips org and run', () => {
    const token = issueRunToken(7, 'run-uuid', 'secret', now);
    expect(verifyRunToken(token, 'secret', now)).toEqual({ orgId: 7, runId: 'run-uuid' });
  });
  it('rejects tampering, other secrets and expired tokens', () => {
    const token = issueRunToken(7, 'run-uuid', 'secret', now);
    expect(verifyRunToken(token.replace('.7.', '.8.'), 'secret', now)).toBeNull();
    expect(verifyRunToken(token, 'other', now)).toBeNull();
    expect(verifyRunToken(token, 'secret', now + (RUN_TOKEN_TTL_SECONDS + 1) * 1000)).toBeNull();
    expect(verifyRunToken('garbage', 'secret', now)).toBeNull();
  });
});

describe('lifecycle messages', () => {
  const r = { guest_name: 'María García', check_in: '2026-10-30', check_out: '2026-11-03' };
  const p = { name: 'Hab 1', check_in_time: '15:00:00', check_out_time: '11:00:00' };
  it('fills only known placeholders', () => {
    expect(renderTemplate('Hola {guest_name}, check-in {check_in} a las {check_in_time} en {property_name} {other}', r, p)).toBe(
      'Hola María, check-in 2026-10-30 a las 15:00 en Hab 1 {other}',
    );
  });
  it('schedules pre-arrival 24 h before check-in and check-out at 08:00 on the day', () => {
    expect(new Date(dueAt({ kind: 'pre_arrival', send_offset_hours: -24 }, r, p)).toISOString()).toBe('2026-10-29T15:00:00.000Z');
    expect(new Date(dueAt({ kind: 'checkout', send_offset_hours: null }, r, p)).toISOString()).toBe('2026-11-03T08:00:00.000Z');
  });
  it('anchors booking messages to when the booking was made, in local time', () => {
    const due = dueAt({ kind: 'booking_confirmed', anchor: 'booking', send_offset_hours: 0 }, { ...r, created_at: '2026-10-01T10:30:00Z' }, { ...p, timezone: 'Europe/Madrid' });
    expect(new Date(due).toISOString()).toBe('2026-10-01T12:30:00.000Z');
  });
  it('sends from 12 h before until 24 h after the due time, so a daily run never misses one', () => {
    const due = Date.parse('2026-10-29T15:00:00Z');
    expect(isDue(due, due - SEND_WINDOW_MS - 1)).toBe(false);
    expect(isDue(due, due - SEND_WINDOW_MS)).toBe(true);
    expect(isDue(due, due + LATE_MS - 1)).toBe(true);
    expect(isDue(due, due + LATE_MS)).toBe(false);
  });
  it('applies minimum-night conditions', () => {
    expect(applies({ min_nights: 3 }, r)).toBe(true);
    expect(applies({ min_nights: 5 }, r)).toBe(false);
    expect(applies({ min_nights: null }, r)).toBe(true);
  });
  it('places messages on the board by when they fire', () => {
    expect(stageOf('booking', 0)).toBe('booked');
    expect(stageOf('check_in', -24)).toBe('before');
    expect(stageOf('check_in', 22)).toBe('during');
    expect(stageOf('check_out', -3)).toBe('checkout');
    expect(stageOf('check_out', 6)).toBe('after');
  });
});

describe('skills bundle', () => {
  it('ships all hosting skills with the shared rules', () => {
    expect(Object.keys(SKILLS)).toHaveLength(14);
    expect(SHARED_RULES).toContain('[CHECK');
    for (const s of Object.values(SKILLS)) expect(s.description.length).toBeGreaterThan(40);
  });
  it('tells the assistant it can never send by itself', () => {
    const prompt = systemPrompt('Marcos', 'es');
    expect(prompt).toContain('You cannot send anything yourself');
    expect(prompt).toContain('## Skill: house-manual');
  });
});

describe('model choice', () => {
  it('defaults to Haiku and only sends refusal fallbacks to models that accept them', async () => {
    const { CLAUDE_MODEL, fallbackParams } = await import('@/lib/env');
    expect(CLAUDE_MODEL).toBe('claude-haiku-5-5');
    expect(fallbackParams('claude-haiku-5-5')).toEqual({});
    expect(fallbackParams('claude-opus-5-5')).toEqual({ betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
    expect(fallbackParams('claude-sonnet-5-5')).toHaveProperty('fallbacks', 'default');
  });
});

describe('learning from history', () => {
  const m = (conversation_id: number, direction: 'in' | 'out', text: string) => ({ conversation_id, direction, text, transcript: null });
  it('pairs each guest question with the host answer that follows, per conversation', () => {
    const pairs = exchanges([
      m(1, 'in', '¿Cuál es el wifi?'),
      m(2, 'in', 'Hello'),
      m(1, 'in', 'Y el parking'),
      m(1, 'out', 'Wifi Casa123, parking en la calle F'),
      m(1, 'out', '¡Buen viaje!'),
      m(2, 'out', 'Hi!'),
    ]);
    expect(pairs).toEqual([
      { guest: '¿Cuál es el wifi? Y el parking', host: 'Wifi Casa123, parking en la calle F' },
      { guest: 'Hello', host: 'Hi!' },
    ]);
  });
});
