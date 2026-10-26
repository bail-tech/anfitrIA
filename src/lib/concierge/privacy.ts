/**
 * Private knowledge (door codes, Wi-Fi passwords...) never reaches a model. The model sees a
 * placeholder like {{private:12}}; code fills in the real value only when sending to a guest
 * whose stay is current or about to start.
 */
import type { KnowledgeItem } from '@/lib/types';

const TOKEN = /\{\{private:(\d+)\}\}/g;

export const placeholder = (id: number) => `{{private:${id}}}`;

/** What the model may read for a knowledge item. */
export function forModel(item: Pick<KnowledgeItem, 'id' | 'category' | 'content' | 'is_private'>): string {
  return item.is_private
    ? `${item.category}: ${placeholder(item.id)} (dato privado: escribe el marcador tal cual, se rellena al enviar)`
    : item.content;
}

export function hasPlaceholders(text: string): boolean {
  return new RegExp(TOKEN.source).test(text);
}

/**
 * Replace placeholders with the real values. Outside the allowed window, or for unknown ids,
 * the placeholder becomes a neutral note instead of leaking anything.
 */
export function fillPrivate(text: string, items: Map<number, string>, allowed: boolean, lang = 'es'): string {
  const withheld = lang === 'es' ? '(te lo enviamos el día de tu llegada)' : '(we will send it on your arrival day)';
  return text.replace(TOKEN, (_, id: string) => (allowed && items.has(Number(id)) ? items.get(Number(id))! : withheld));
}

/** Private details go out from the day before check-in until check-out. */
export function privateWindowOpen(checkIn: string | null, checkOut: string | null, today: string): boolean {
  if (!checkIn || !checkOut) return false;
  const dayBefore = new Date(Date.parse(`${checkIn}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  return today >= dayBefore && today <= checkOut;
}
