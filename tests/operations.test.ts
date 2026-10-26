import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { planTurnovers } from '@/lib/agents/turnovers';
import { inServiceWindow, parseWebhook, validSignature } from '@/lib/channels/whatsapp';
import { dailySeries, nightsIn, periodStats } from '@/lib/metrics';

const prop = { id: 1, name: 'Hab 1', check_in_time: '15:00:00', check_out_time: '11:00:00', cleaning_minutes: 180 };
const r = (id: number, check_in: string, check_out: string, extra = {}) => ({
  id,
  property_id: 1,
  check_in,
  check_out,
  status: 'upcoming' as const,
  guests: 2,
  total_amount: null as number | null,
  nightly_rate: 100 as number | null,
  ...extra,
});

describe('turnover planning', () => {
  it('creates one task per check-out with the window to the next arrival', () => {
    const plan = planTurnovers([r(1, '2026-10-24', '2026-10-28'), r(2, '2026-10-28', '2026-10-30')], [prop], [{ id: 's1', role: 'cleaning' }], '2026-10-26');
    expect(plan).toHaveLength(2);
    expect(plan[0]).toMatchObject({ dedupe_key: 'turnover:1:2026-10-28', window_minutes: 240, staff_id: 's1', conflict: false });
    expect(plan[0].notes).toContain('2 huésped');
    expect(plan[1].window_minutes).toBe(540); // no arrival: until 20:00
  });
  it('flags windows shorter than the cleaning time', () => {
    const plan = planTurnovers([r(1, '2026-10-24', '2026-10-28'), r(2, '2026-10-28', '2026-10-30')], [{ ...prop, cleaning_minutes: 300 }], [], '2026-10-26');
    expect(plan[0].conflict).toBe(true);
    expect(plan[0].staff_id).toBeNull();
  });
  it('ignores cancelled stays and stays outside the horizon', () => {
    const plan = planTurnovers([r(1, '2026-10-20', '2026-10-25'), r(2, '2026-12-01', '2026-12-05'), r(3, '2026-10-26', '2026-10-27', { status: 'cancelled' })], [prop], [], '2026-10-26');
    expect(plan).toHaveLength(0);
  });
});

describe('metrics', () => {
  it('counts nights inside a period with check-out exclusive', () => {
    expect(nightsIn(r(1, '2026-10-30', '2026-11-02'), '2026-11-01', '2026-12-01')).toEqual([{ day: '2026-11-01', revenue: 100 }]);
  });
  it('computes occupancy and ADR', () => {
    const s = periodStats([r(1, '2026-10-01', '2026-10-06'), r(2, '2026-10-10', '2026-10-11', { nightly_rate: null, total_amount: 150 })], 2, '2026-10-01', '2026-10-11');
    expect(s).toMatchObject({ nights: 6, revenue: 650, bookings: 2 });
    expect(s.occupancy).toBeCloseTo(0.3);
    expect(s.adr).toBeCloseTo(108.33, 1);
  });
  it('builds a daily series', () => {
    const series = dailySeries([r(1, '2026-10-01', '2026-10-03')], 1, '2026-10-01', 3);
    expect(series.map((d) => d.occupancy)).toEqual([1, 1, 0]);
  });
});

describe('whatsapp', () => {
  it('verifies the HMAC signature', () => {
    const body = '{"entry":[]}';
    const sig = `sha256=${createHmac('sha256', 'secret').update(body).digest('hex')}`;
    expect(validSignature('secret', body, sig)).toBe(true);
    expect(validSignature('secret', body, 'sha256=00')).toBe(false);
    expect(validSignature(undefined, body, sig)).toBe(false);
  });
  it('parses text and audio messages', () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: 'PN1' },
                messages: [
                  { from: '346', id: 'm1', type: 'text', text: { body: 'hola' } },
                  { from: '346', id: 'm2', type: 'audio', audio: { id: 'a1', mime_type: 'audio/ogg; codecs=opus' } },
                  { id: 'bad' },
                ],
              },
            },
          ],
        },
      ],
    };
    expect(parseWebhook(payload)).toEqual([
      { phoneNumberId: 'PN1', from: '346', id: 'm1', type: 'text', text: 'hola', audioId: undefined, audioMime: undefined },
      { phoneNumberId: 'PN1', from: '346', id: 'm2', type: 'audio', text: undefined, audioId: 'a1', audioMime: 'audio/ogg; codecs=opus' },
    ]);
    expect(parseWebhook(null)).toEqual([]);
  });
  it('knows the 24-hour service window', () => {
    const now = Date.parse('2026-10-26T12:00:00Z');
    expect(inServiceWindow('2026-10-26T00:00:00Z', now)).toBe(true);
    expect(inServiceWindow('2026-10-25T11:00:00Z', now)).toBe(false);
    expect(inServiceWindow(null, now)).toBe(false);
  });
});
