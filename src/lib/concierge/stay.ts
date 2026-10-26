import type { Reservation } from '@/lib/types';

export type StayPhase = 'pre_llegada' | 'durante' | 'pasada';

/** The phase comes from the dates (the source of truth), not from the stored status. */
export function stayPhase(checkIn: string, checkOut: string, today: string): StayPhase {
  if (today < checkIn) return 'pre_llegada';
  if (today <= checkOut) return 'durante';
  return 'pasada';
}

/** The guest's relevant reservation: the current or next one; otherwise the last past one. */
export function pickReservation<R extends Pick<Reservation, 'check_in' | 'check_out' | 'status'>>(rows: R[], today: string): R | null {
  const valid = rows.filter((r) => r.status !== 'cancelled').sort((a, b) => a.check_in.localeCompare(b.check_in));
  if (!valid.length) return null;
  return valid.find((r) => r.check_out >= today) ?? valid[valid.length - 1];
}

/** Facts sentence (Spanish) the AI uses and translates to the guest's language. */
export function buildStayContext(
  r: Pick<Reservation, 'guest_name' | 'check_in' | 'check_out' | 'code'>,
  today: string,
  times?: { checkIn: string; checkOut: string },
): string {
  const fase = { pre_llegada: 'aún no ha llegado (pre-llegada)', durante: 'está alojado ahora mismo', pasada: 'la estancia ya terminó' }[
    stayPhase(r.check_in, r.check_out, today)
  ];
  const hours = times ? ` Hora de check-in: ${times.checkIn.slice(0, 5)}. Hora de check-out: ${times.checkOut.slice(0, 5)}.` : '';
  const code = r.code ? ` Código de reserva: ${r.code}.` : '';
  return `Reserva de ${r.guest_name}. Entrada (check-in): ${r.check_in}. Salida (check-out): ${r.check_out}. Estado hoy: ${fase}.${hours}${code}`;
}

/** Today's date (YYYY-MM-DD) in the property's time zone. */
export function todayIn(timeZone = 'Europe/Madrid', now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
