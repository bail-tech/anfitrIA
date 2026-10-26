import type { SupabaseClient } from '@supabase/supabase-js';
import { todayIn } from '@/lib/concierge/stay';
import type { Property, Reservation, Staff } from '@/lib/types';
import { planTurnovers, staffMessage } from './turnovers';

export interface OperationsResult {
  planned: number;
  created: number;
  conflicts: number;
  proposals: number;
}

/**
 * Plans turnovers for one organisation and records the run. New tasks get a staff-message
 * proposal (the host approves sending it); conflicts are flagged on the task.
 * `db` is the host's client (RLS) or the service role from the cron (then orgId filters).
 */
export async function runOperations(db: SupabaseClient, orgId: number): Promise<OperationsResult> {
  const { data: run } = await db.from('agent_runs').insert({ org_id: orgId, agent: 'operations' }).select('id').single<{ id: string }>();
  try {
    const { data: props } = await db.from('properties').select('id, name, check_in_time, check_out_time, cleaning_minutes, timezone').eq('org_id', orgId);
    const properties = (props ?? []) as Array<Property>;
    const ids = properties.map((p) => p.id);
    const { data: res } = ids.length
      ? await db.from('reservations').select('id, property_id, check_in, check_out, status, guests').in('property_id', ids)
      : { data: [] };
    const { data: staffRows } = await db.from('staff').select('id, name, role').eq('org_id', orgId);
    const staff = (staffRows ?? []) as Staff[];
    const today = todayIn(properties[0]?.timezone ?? 'Europe/Madrid');
    const plan = planTurnovers((res ?? []) as Reservation[], properties, staff, today);

    let created = 0;
    let proposals = 0;
    for (const t of plan) {
      const { data: inserted } = await db
        .from('tasks')
        .upsert(
          {
            org_id: orgId,
            property_id: t.property_id,
            reservation_id: t.reservation_id,
            kind: 'turnover',
            title: t.title,
            notes: t.notes,
            due_at: t.due_at,
            window_minutes: t.window_minutes,
            staff_id: t.staff_id,
            source: 'system',
            dedupe_key: t.dedupe_key,
          },
          { onConflict: 'org_id,dedupe_key', ignoreDuplicates: true },
        )
        .select('id');
      if (!inserted?.length) continue;
      created++;
      const person = staff.find((s) => s.id === t.staff_id);
      if (person) {
        await db.from('proposals').insert({
          org_id: orgId,
          agent: 'operations',
          kind: 'staff_message',
          property_id: t.property_id,
          title: `Avisar a ${person.name}: ${t.title}`,
          payload: { staff_id: person.id, phone: person.phone, text: staffMessage(t, person.name), task_id: inserted[0].id, conflict: t.conflict },
        });
        proposals++;
      }
    }
    const conflicts = plan.filter((t) => t.conflict).length;
    const summary = `${plan.length} limpiezas en 14 días · ${created} nuevas · ${conflicts} con conflicto`;
    if (run) await db.from('agent_runs').update({ status: 'completed', summary, finished_at: new Date().toISOString() }).eq('id', run.id);
    return { planned: plan.length, created, conflicts, proposals };
  } catch (e) {
    if (run) await db.from('agent_runs').update({ status: 'failed', error: e instanceof Error ? e.message : String(e), finished_at: new Date().toISOString() }).eq('id', run.id);
    throw e;
  }
}
