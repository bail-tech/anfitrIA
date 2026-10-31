/** Suggested guest-journey messages. They start unapproved: nothing goes out until the host approves each one. */
import type { TemplateAnchor, TemplateKind } from '@/lib/types';

export interface JourneyDefault {
  kind: Exclude<TemplateKind, 'saved_reply'>;
  anchor: TemplateAnchor;
  send_offset_hours: number;
  min_nights?: number;
  positive_only?: boolean;
  title: string;
  body: string;
}

export const JOURNEY_DEFAULTS: Record<'es' | 'en', JourneyDefault[]> = {
  es: [
    {
      kind: 'booking_confirmed', anchor: 'booking', send_offset_hours: 0, title: 'Reserva confirmada',
      body: '¡Hola {guest_name}! Gracias por reservar {property_name} del {check_in} al {check_out}. Para agilizar tu llegada, completa el registro de viajeros (obligatorio en España): {checkin_link}',
    },
    {
      kind: 'pre_arrival', anchor: 'check_in', send_offset_hours: -24, title: 'Antes de llegar',
      body: '¡Hola {guest_name}! Mañana te esperamos en {property_name}. El check-in es a partir de las {check_in_time}. Si aún no lo has hecho, completa el registro de viajeros: {checkin_link}',
    },
    {
      kind: 'check_in', anchor: 'check_in', send_offset_hours: -8, title: 'Día de llegada',
      body: '¡Hoy es el día, {guest_name}! Te esperamos a partir de las {check_in_time}. Escríbeme si necesitas algo para llegar.',
    },
    {
      kind: 'during_stay', anchor: 'check_in', send_offset_hours: 22, min_nights: 3, title: '¿Todo bien?',
      body: 'Hola {guest_name}, ¿qué tal la primera noche en {property_name}? Si necesitas cualquier cosa, aquí estoy.',
    },
    {
      kind: 'checkout', anchor: 'check_out', send_offset_hours: -15, title: 'Recordatorio de salida',
      body: 'Hola {guest_name}, te recuerdo que mañana la salida es a las {check_out_time}. ¡Esperamos que hayas disfrutado!',
    },
    {
      kind: 'post_stay', anchor: 'check_out', send_offset_hours: 6, positive_only: true, title: 'Pedir reseña',
      body: '¡Gracias por tu estancia, {guest_name}! Si todo fue bien, nos ayudaría mucho una reseña de 5 estrellas. ¡Vuelve cuando quieras!',
    },
  ],
  en: [
    {
      kind: 'booking_confirmed', anchor: 'booking', send_offset_hours: 0, title: 'Booking confirmed',
      body: 'Hi {guest_name}! Thanks for booking {property_name} from {check_in} to {check_out}. To speed up your arrival, please complete the guest registration (required in Spain): {checkin_link}',
    },
    {
      kind: 'pre_arrival', anchor: 'check_in', send_offset_hours: -24, title: 'Before arrival',
      body: 'Hi {guest_name}! We look forward to welcoming you at {property_name} tomorrow. Check-in is from {check_in_time}. If you haven’t yet, please complete the guest registration: {checkin_link}',
    },
    {
      kind: 'check_in', anchor: 'check_in', send_offset_hours: -8, title: 'Arrival day',
      body: 'Today’s the day, {guest_name}! Check-in is from {check_in_time}. Message me if you need anything to get here.',
    },
    {
      kind: 'during_stay', anchor: 'check_in', send_offset_hours: 22, min_nights: 3, title: 'All good?',
      body: 'Hi {guest_name}, how was your first night at {property_name}? If you need anything, I’m here.',
    },
    {
      kind: 'checkout', anchor: 'check_out', send_offset_hours: -15, title: 'Check-out reminder',
      body: 'Hi {guest_name}, a reminder that check-out is tomorrow at {check_out_time}. We hope you enjoyed your stay!',
    },
    {
      kind: 'post_stay', anchor: 'check_out', send_offset_hours: 6, positive_only: true, title: 'Ask for a review',
      body: 'Thanks for staying with us, {guest_name}! If everything went well, a 5-star review would mean a lot. Come back any time!',
    },
  ],
};

export type Stage = 'booked' | 'before' | 'during' | 'checkout' | 'after';
export const STAGES: Stage[] = ['booked', 'before', 'during', 'checkout', 'after'];

/** Which column of the board a message sits in, from when it fires. */
export function stageOf(anchor: TemplateAnchor, offsetHours: number): Stage {
  if (anchor === 'booking') return 'booked';
  if (anchor === 'check_in') return offsetHours < 0 ? 'before' : 'during';
  return offsetHours <= 0 ? 'checkout' : 'after';
}
