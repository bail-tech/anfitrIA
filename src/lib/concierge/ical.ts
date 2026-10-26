/** iCal (.ics) import: how hosts connect Booking.com and Airbnb calendars. */
import type { ReservationSource } from '@/lib/types';

export const MAX_EVENTS = 500;

export interface ParsedReservation {
  guest_name: string;
  check_in: string;
  check_out: string;
  code: string | null;
}

export function detectSource(text: string): ReservationSource {
  const low = text.toLowerCase();
  if (low.includes('booking')) return 'booking';
  if (low.includes('airbnb')) return 'airbnb';
  return 'other';
}

function unfold(data: string): string[] {
  const lines: string[] = [];
  for (const raw of data.replace(/\r\n/g, '\n').split('\n')) {
    if ((raw.startsWith(' ') || raw.startsWith('\t')) && lines.length) lines[lines.length - 1] += raw.slice(1);
    else lines.push(raw);
  }
  return lines;
}

function parseDate(value: string): string | null {
  const d = value.replace(/\D/g, '').slice(0, 8);
  if (d.length !== 8) return null;
  const iso = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== iso ? null : iso;
}

export function parseIcs(text: string): { source: ReservationSource; reservations: ParsedReservation[] } {
  const clean = text.replace(/^﻿/, '');
  const source = detectSource(clean);
  const out: Array<Partial<ParsedReservation>> = [];
  let cur: Partial<ParsedReservation> | null = null;
  for (const line of unfold(clean)) {
    if (line.startsWith('BEGIN:VEVENT')) cur = {};
    else if (line.startsWith('END:VEVENT')) {
      if (cur?.check_in && cur.check_out) out.push(cur);
      cur = null;
    } else if (cur) {
      const idx = line.indexOf(':');
      const key = (idx === -1 ? line : line.slice(0, idx)).split(';')[0].toUpperCase();
      const value = idx === -1 ? '' : line.slice(idx + 1);
      if (key === 'DTSTART') cur.check_in = parseDate(value) ?? undefined;
      else if (key === 'DTEND') cur.check_out = parseDate(value) ?? undefined; // DTEND is exclusive: the check-out day
      else if (key === 'SUMMARY') cur.guest_name = value.trim().slice(0, 160);
      else if (key === 'UID') cur.code = value.trim().slice(0, 32);
    }
    if (out.length >= MAX_EVENTS) break;
  }
  const fallback = source === 'booking' ? 'Reserva Booking' : source === 'airbnb' ? 'Reserva Airbnb' : 'Reserva';
  const blocks = ['closed', 'not available', 'reserved', 'blocked'];
  return {
    source,
    reservations: out.map((r) => {
      const name = r.guest_name ?? '';
      return {
        // Generic blocks ("CLOSED", "Not available", "Reserved") are not names.
        guest_name: !name || blocks.some((b) => name.toLowerCase().includes(b)) ? fallback : name,
        check_in: r.check_in!,
        check_out: r.check_out!,
        code: r.code ?? null,
      };
    }),
  };
}
