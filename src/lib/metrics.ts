/** Portfolio KPIs from reservations, conversations and agent activity. Pure functions + one loader. */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Reservation } from '@/lib/types';

const DAY = 86_400_000;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const nightsOf = (r: Pick<Reservation, 'check_in' | 'check_out'>) => Math.max(0, Math.round((Date.parse(r.check_out) - Date.parse(r.check_in)) / DAY));

/** Each booked night (check-in inclusive, check-out exclusive) with its nightly revenue. */
export function nightsIn(r: Pick<Reservation, 'check_in' | 'check_out' | 'total_amount' | 'nightly_rate'>, from: string, to: string) {
  const n = nightsOf(r);
  const rate = r.nightly_rate ?? (r.total_amount && n ? r.total_amount / n : 0);
  const out: Array<{ day: string; revenue: number }> = [];
  for (let d = r.check_in; d < r.check_out; d = addDays(d, 1)) if (d >= from && d < to) out.push({ day: d, revenue: Number(rate) || 0 });
  return out;
}

export interface PeriodStats {
  revenue: number;
  nights: number;
  occupancy: number;
  adr: number;
  bookings: number;
}

export function periodStats(
  reservations: Array<Pick<Reservation, 'check_in' | 'check_out' | 'total_amount' | 'nightly_rate' | 'status'>>,
  propertyCount: number,
  from: string,
  to: string,
): PeriodStats {
  const live = reservations.filter((r) => r.status !== 'cancelled');
  let revenue = 0;
  let nights = 0;
  for (const r of live) for (const n of nightsIn(r, from, to)) {
    nights++;
    revenue += n.revenue;
  }
  const days = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / DAY));
  return {
    revenue,
    nights,
    occupancy: propertyCount ? nights / (propertyCount * days) : 0,
    adr: nights ? revenue / nights : 0,
    bookings: live.filter((r) => r.check_in >= from && r.check_in < to).length,
  };
}

export function dailySeries(
  reservations: Array<Pick<Reservation, 'check_in' | 'check_out' | 'total_amount' | 'nightly_rate' | 'status'>>,
  propertyCount: number,
  from: string,
  days: number,
) {
  return Array.from({ length: days }, (_, i) => {
    const day = addDays(from, i);
    const s = periodStats(reservations, propertyCount, day, addDays(day, 1));
    return { day, revenue: s.revenue, occupancy: s.occupancy, adr: s.adr };
  });
}

export interface Overview {
  today: string;
  propertyCount: number;
  month: PeriodStats;
  lastMonth: PeriodStats;
  activeBookings: number;
  week: ReturnType<typeof dailySeries>;
  ai: { auto: number; escalated: number; rate: number; pendingDrafts: number };
  pending: { drafts: number; proposals: number; tasks: number };
  hasPrices: boolean;
}

export async function loadOverview(db: SupabaseClient, today: string): Promise<Overview> {
  const monthStart = `${today.slice(0, 8)}01`;
  const lastMonthStart = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1)).toISOString().slice(0, 10);
  const dayOfMonth = Number(today.slice(8, 10));
  const [{ data: props }, { data: res }, { data: audits }, { count: pendingDrafts }, { count: pendingProposals }, { count: openTasks }] = await Promise.all([
    db.from('properties').select('id'),
    db.from('reservations').select('check_in, check_out, total_amount, nightly_rate, status'),
    db.from('audit_logs').select('action').in('action', ['auto_answered', 'escalated']),
    db.from('drafts').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    db.from('proposals').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    db.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'open'),
  ]);
  const reservations = (res ?? []) as Reservation[];
  const propertyCount = props?.length ?? 0;
  const auto = (audits ?? []).filter((a) => a.action === 'auto_answered').length;
  const escalated = (audits ?? []).filter((a) => a.action === 'escalated').length;
  return {
    today,
    propertyCount,
    month: periodStats(reservations, propertyCount, monthStart, addDays(today, 1)),
    // Same number of days last month, so the comparison is fair.
    lastMonth: periodStats(reservations, propertyCount, lastMonthStart, addDays(lastMonthStart, dayOfMonth)),
    activeBookings: reservations.filter((r) => r.status !== 'cancelled' && r.check_out >= today).length,
    week: dailySeries(reservations, propertyCount, addDays(today, -6), 7),
    ai: { auto, escalated, rate: auto + escalated ? auto / (auto + escalated) : 0, pendingDrafts: pendingDrafts ?? 0 },
    pending: { drafts: pendingDrafts ?? 0, proposals: pendingProposals ?? 0, tasks: openTasks ?? 0 },
    hasPrices: reservations.some((r) => r.total_amount !== null || r.nightly_rate !== null),
  };
}
