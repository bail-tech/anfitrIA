/**
 * Early check-in / late check-out: the free time is computed here, from the calendar,
 * and the model only phrases the answer. It never decides availability itself.
 */

export interface TimingInput {
  checkIn: string;
  checkOut: string;
  /** Previous guest's check-out date and next guest's check-in date at this property, if any. */
  previousCheckOut: string | null;
  nextCheckIn: string | null;
  checkInTime: string; // HH:MM
  checkOutTime: string; // HH:MM
  cleaningMinutes: number;
}

export interface TimingAnswer {
  earlyCheckIn: { possible: boolean; earliest: string; reason: string };
  lateCheckOut: { possible: boolean; latest: string; reason: string };
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};
const toHHMM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** Earliest arrival when nobody leaves that morning, latest departure when nobody arrives. */
const FREE_EARLIEST = 9 * 60;
const FREE_LATEST = 18 * 60;

/** Housekeeping needs the flat between check-out and check-in on turnover days. */
export function computeTiming(t: TimingInput): TimingAnswer {
  const out = toMin(t.checkOutTime);
  const inn = toMin(t.checkInTime);

  const sameDayBefore = t.previousCheckOut === t.checkIn;
  const earliest = sameDayBefore ? out + t.cleaningMinutes : FREE_EARLIEST;
  const sameDayAfter = t.nextCheckIn === t.checkOut;
  const latest = sameDayAfter ? inn - t.cleaningMinutes : FREE_LATEST;

  return {
    earlyCheckIn: {
      possible: earliest < inn,
      earliest: toHHMM(Math.min(earliest, inn)),
      reason: sameDayBefore ? 'Otro huésped sale ese mismo día; hace falta el tiempo de limpieza.' : 'No hay salida ese día antes de la llegada.',
    },
    lateCheckOut: {
      possible: latest > out,
      latest: toHHMM(Math.max(latest, out)),
      reason: sameDayAfter ? 'Llega otro huésped ese mismo día; hace falta el tiempo de limpieza.' : 'No hay llegada ese día después de la salida.',
    },
  };
}

const TIMING_WORDS = /(early|late|antes|temprano|tarde|plus t[oô]t|plus tard|früher|später|prima|più tardi)/i;
const CHECK_WORDS = /(check[\s-]?(in|out)|llegar|llegada|salir|salida|arriv|départ|ankunft|abreise|arrivo|partenza)/i;

/** Cheap pre-filter: only compute timing for messages that look like such a request. */
export function looksLikeTimingRequest(text: string): boolean {
  return TIMING_WORDS.test(text) && CHECK_WORDS.test(text);
}

export function describeTiming(a: TimingAnswer): string {
  const e = a.earlyCheckIn.possible ? `Llegada anticipada posible desde las ${a.earlyCheckIn.earliest}.` : `Llegada anticipada no posible (${a.earlyCheckIn.reason})`;
  const l = a.lateCheckOut.possible ? `Salida tardía posible hasta las ${a.lateCheckOut.latest}.` : `Salida tardía no posible (${a.lateCheckOut.reason})`;
  return `${e} ${l} (Calculado del calendario; confirma siempre con el anfitrión si el huésped lo acepta.)`;
}
