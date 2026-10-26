/**
 * Operations agent, deterministic part: every check-out becomes a turnover task with a
 * cleaning window that ends at the next arrival. Claude (skill `turnover-planning`) is
 * only asked about the conflicts this cannot resolve.
 */
import type { Property, Reservation, Staff } from '@/lib/types';

export interface PlannedTurnover {
  dedupe_key: string;
  property_id: number;
  reservation_id: number;
  title: string;
  notes: string;
  due_at: string; // ISO, start of the window (check-out time, property local time as UTC-naive)
  window_minutes: number;
  staff_id: string | null;
  conflict: boolean;
}

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};

/** Window end when nobody arrives the same day: end of the working day. */
const DAY_END = 20 * 60;

export function planTurnovers(
  reservations: Array<Pick<Reservation, 'id' | 'property_id' | 'check_in' | 'check_out' | 'status' | 'guests'>>,
  properties: Array<Pick<Property, 'id' | 'name' | 'check_in_time' | 'check_out_time' | 'cleaning_minutes'>>,
  staff: Array<Pick<Staff, 'id' | 'role'>>,
  today: string,
  horizonDays = 14,
): PlannedTurnover[] {
  const horizon = new Date(Date.parse(`${today}T00:00:00Z`) + horizonDays * 86_400_000).toISOString().slice(0, 10);
  const cleaners = staff.filter((s) => s.role === 'cleaning');
  const props = new Map(properties.map((p) => [p.id, p]));
  const active = reservations.filter((r) => r.status !== 'cancelled');
  const out: PlannedTurnover[] = [];
  let next = 0;

  for (const r of active.filter((x) => x.check_out >= today && x.check_out <= horizon).sort((a, b) => a.check_out.localeCompare(b.check_out))) {
    const p = props.get(r.property_id);
    if (!p) continue;
    const arriving = active.find((x) => x.property_id === r.property_id && x.check_in === r.check_out && x.id !== r.id);
    const start = minutes(p.check_out_time);
    const end = arriving ? minutes(p.check_in_time) : DAY_END;
    const window = end - start;
    const conflict = window < p.cleaning_minutes;
    const linen = arriving?.guests ? `Ropa de cama para ${arriving.guests} huésped(es). ` : '';
    out.push({
      dedupe_key: `turnover:${p.id}:${r.check_out}`,
      property_id: p.id,
      reservation_id: r.id,
      title: `Limpieza ${p.name} · ${r.check_out}`,
      notes:
        `${linen}${arriving ? `Llega otro huésped a las ${p.check_in_time.slice(0, 5)}.` : 'Sin llegada ese día.'}` +
        (conflict ? ` ⚠ Ventana de ${window} min, menos que los ${p.cleaning_minutes} min de limpieza.` : ''),
      due_at: `${r.check_out}T${p.check_out_time.slice(0, 5)}:00`,
      window_minutes: Math.max(window, 0),
      staff_id: cleaners.length ? cleaners[next++ % cleaners.length].id : null,
      conflict,
    });
  }
  return out;
}

export function staffMessage(t: PlannedTurnover, staffName: string): string {
  return `Hola ${staffName.split(' ')[0]}: limpieza el ${t.due_at.slice(0, 10)} a partir de las ${t.due_at.slice(11, 16)} (${t.title.split(' · ')[0].replace('Limpieza ', '')}). ${t.notes} ¡Gracias!`;
}
