import { describe, expect, it } from 'vitest';
import { monthRange, ownerStatement } from '@/lib/reports';

const r = (id: number, check_in: string, check_out: string, total: number, fee = 0, status: 'upcoming' | 'cancelled' = 'upcoming') => ({
  id, guest_name: `Guest ${id} Surname`, check_in, check_out, source: 'airbnb' as const, total_amount: total, nightly_rate: null, channel_fee: fee, status,
});

describe('owner statements', () => {
  it('handles month boundaries, including December', () => {
    expect(monthRange('2026-11')).toEqual({ from: '2026-11-01', to: '2026-12-01', prevFrom: '2026-10-01' });
    expect(monthRange('2026-12').to).toBe('2027-01-01');
    expect(monthRange('2026-01').prevFrom).toBe('2025-12-01');
  });

  it('splits a stay across months and prorates the channel fee', () => {
    // 4 nights at 100 €: 2 in October (30, 31), 2 in November (1, 2); fee 40 €.
    const s = ownerStatement([r(1, '2026-10-30', '2026-11-03', 400, 40)], '2026-11');
    expect(s.lines).toEqual([{ reservation_id: 1, guest: 'Guest', check_in: '2026-10-30', check_out: '2026-11-03', source: 'airbnb', nights: 2, revenue: 200, channel_fee: 20 }]);
    expect(s.cleanings).toBe(1);
    expect(s.previous.nights).toBe(2);
  });

  it('computes net after channel, management and cleaning costs, ignoring cancellations', () => {
    const s = ownerStatement([r(1, '2026-11-05', '2026-11-07', 300, 30), r(2, '2026-11-10', '2026-11-12', 999, 0, 'cancelled')], '2026-11', { managementFeePct: 20, cleaningCost: 25 });
    expect(s.gross).toBe(300);
    expect(s.channel_fees).toBe(30);
    expect(s.management_fee).toBe(54); // 20 % of (300 - 30)
    expect(s.cleaning_cost).toBe(25);
    expect(s.net).toBe(191);
    expect(s.stats.nights).toBe(2);
    expect(s.lines).toHaveLength(1);
  });
});
