/**
 * Owner statements: what one property earned in a month, for the owner of a managed flat.
 * Pure: reservations in, statement out. Nights and revenue are counted per night inside the
 * month, so a stay across two months is split between both statements.
 */
import { nightsIn, periodStats, type PeriodStats } from '@/lib/metrics';
import type { Reservation } from '@/lib/types';

export interface StatementLine {
  reservation_id: number;
  guest: string;
  check_in: string;
  check_out: string;
  source: string;
  nights: number;
  revenue: number;
  channel_fee: number;
}

export interface OwnerStatement {
  month: string; // YYYY-MM
  from: string;
  to: string; // exclusive
  lines: StatementLine[];
  stats: PeriodStats;
  previous: PeriodStats;
  gross: number;
  channel_fees: number;
  management_fee: number;
  cleanings: number;
  cleaning_cost: number;
  net: number;
}

export function monthRange(month: string): { from: string; to: string; prevFrom: string } {
  const [y, m] = month.split('-').map(Number);
  const iso = (yy: number, mm: number) => `${yy}-${String(mm).padStart(2, '0')}-01`;
  const next = m === 12 ? iso(y + 1, 1) : iso(y, m + 1);
  const prev = m === 1 ? iso(y - 1, 12) : iso(y, m - 1);
  return { from: iso(y, m), to: next, prevFrom: prev };
}

const round = (n: number) => Math.round(n * 100) / 100;
const nightsOf = (r: Pick<Reservation, 'check_in' | 'check_out'>) => Math.max(1, Math.round((Date.parse(r.check_out) - Date.parse(r.check_in)) / 86_400_000));

export function ownerStatement(
  reservations: Array<Pick<Reservation, 'id' | 'guest_name' | 'check_in' | 'check_out' | 'source' | 'total_amount' | 'nightly_rate' | 'channel_fee' | 'status'>>,
  month: string,
  opts: { managementFeePct?: number; cleaningCost?: number } = {},
): OwnerStatement {
  const { from, to, prevFrom } = monthRange(month);
  const live = reservations.filter((r) => r.status !== 'cancelled');
  const lines: StatementLine[] = [];
  for (const r of live) {
    const nights = nightsIn(r, from, to);
    if (!nights.length) continue;
    const revenue = nights.reduce((s, n) => s + n.revenue, 0);
    // The channel's commission, in proportion to the nights that fall in this month.
    const fee = r.channel_fee ? (Number(r.channel_fee) * nights.length) / nightsOf(r) : 0;
    lines.push({ reservation_id: r.id, guest: r.guest_name.split(' ')[0], check_in: r.check_in, check_out: r.check_out, source: r.source, nights: nights.length, revenue: round(revenue), channel_fee: round(fee) });
  }
  lines.sort((a, b) => a.check_in.localeCompare(b.check_in));
  const gross = round(lines.reduce((s, l) => s + l.revenue, 0));
  const channel_fees = round(lines.reduce((s, l) => s + l.channel_fee, 0));
  const management_fee = round(((gross - channel_fees) * (opts.managementFeePct ?? 0)) / 100);
  const cleanings = live.filter((r) => r.check_out >= from && r.check_out < to).length;
  const cleaning_cost = round(cleanings * (opts.cleaningCost ?? 0));
  return {
    month,
    from,
    to,
    lines,
    stats: periodStats(live, 1, from, to),
    previous: periodStats(live, 1, prevFrom, from),
    gross,
    channel_fees,
    management_fee,
    cleanings,
    cleaning_cost,
    net: round(gross - channel_fees - management_fee - cleaning_cost),
  };
}
