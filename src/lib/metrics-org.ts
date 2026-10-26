import type { SupabaseClient } from '@supabase/supabase-js';
import { todayIn } from '@/lib/concierge/stay';
import { periodStats } from '@/lib/metrics';
import type { Reservation } from '@/lib/types';

/** KPIs for one organisation when running with the service role (no RLS to scope it). */
export async function loadOverviewForOrg(db: SupabaseClient, orgId: number) {
  const today = todayIn();
  const { data: props } = await db.from('properties').select('id').eq('org_id', orgId);
  const ids = (props ?? []).map((p) => p.id as number);
  const { data } = ids.length ? await db.from('reservations').select('check_in, check_out, total_amount, nightly_rate, status').in('property_id', ids) : { data: [] };
  const res = (data ?? []) as Reservation[];
  const monthStart = `${today.slice(0, 8)}01`;
  const next30 = new Date(Date.parse(`${today}T00:00:00Z`) + 30 * 86_400_000).toISOString().slice(0, 10);
  return {
    month_to_date: periodStats(res, ids.length, monthStart, today),
    next_30_days: periodStats(res, ids.length, today, next30),
    has_prices: res.some((r) => r.total_amount !== null || r.nightly_rate !== null),
  };
}
