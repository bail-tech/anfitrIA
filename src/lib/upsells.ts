/**
 * Upsells without payment: when a guest's message shows they want an extra from the catalogue,
 * the host gets a priced offer card. Approving it sends the offer; the host collects payment the
 * way they already do. Matching is by keywords, so it is predictable and needs no AI.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface UpsellItem {
  id: string;
  property_id: number | null;
  name: string;
  price: number;
  currency: string;
  keywords: string[];
  active: boolean;
}

/** Lower-case, no accents or punctuation, single spaces: "¿Check-in TEMPRANO?" → "check in temprano". */
export const normalise = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** The catalogue items the guest's message asks about (whole-word keyword match). */
export function matchUpsells(text: string, items: UpsellItem[], propertyId: number): UpsellItem[] {
  const msg = ` ${normalise(text)} `;
  return items.filter((i) => i.active && (i.property_id === null || i.property_id === propertyId) && i.keywords.some((k) => normalise(k) && msg.includes(` ${normalise(k)} `)));
}

export function formatPrice(price: number, currency: string, language: string): string {
  return new Intl.NumberFormat(language === 'es' ? 'es-ES' : 'en-GB', { style: 'currency', currency, maximumFractionDigits: price % 1 ? 2 : 0 }).format(price);
}

export function offerText(item: Pick<UpsellItem, 'name' | 'price' | 'currency'>, guestFirstName: string | null, language: string): string {
  const price = formatPrice(item.price, item.currency, language);
  const hi = guestFirstName ? (language === 'es' ? `¡Hola ${guestFirstName}! ` : `Hi ${guestFirstName}! `) : '';
  return language === 'es'
    ? `${hi}Podemos ofrecerte ${item.name.toLowerCase()} por ${price}. ¿Quieres que te lo reservemos?`
    : `${hi}We can offer you ${item.name.toLowerCase()} for ${price}. Would you like us to book it for you?`;
}

/** Suggested catalogue (inactive prices are the host's to set; these are typical). */
export const DEFAULT_UPSELLS: Record<'es' | 'en', Array<Pick<UpsellItem, 'name' | 'price' | 'keywords'>>> = {
  es: [
    { name: 'Entrada anticipada', price: 25, keywords: ['early check in', 'check in temprano', 'entrar antes', 'llegar antes', 'entrada anticipada', 'llegamos antes', 'llegaremos antes'] },
    { name: 'Salida tardía', price: 30, keywords: ['late check out', 'late checkout', 'salir mas tarde', 'salida tardia', 'quedarnos mas tiempo', 'check out tarde'] },
    { name: 'Parking', price: 12, keywords: ['parking', 'aparcar', 'aparcamiento', 'garaje', 'garage'] },
    { name: 'Cuna', price: 10, keywords: ['cuna', 'cot', 'crib', 'cama de bebe'] },
    { name: 'Limpieza extra', price: 45, keywords: ['limpieza extra', 'extra cleaning', 'limpieza adicional', 'mid stay cleaning'] },
  ],
  en: [
    { name: 'Early check-in', price: 25, keywords: ['early check in', 'check in early', 'arrive early', 'arrive earlier', 'come earlier', 'check in temprano', 'llegar antes'] },
    { name: 'Late check-out', price: 30, keywords: ['late check out', 'late checkout', 'check out later', 'leave later', 'stay longer', 'salida tardia'] },
    { name: 'Parking', price: 12, keywords: ['parking', 'park the car', 'garage', 'aparcar'] },
    { name: 'Cot', price: 10, keywords: ['cot', 'crib', 'baby bed', 'cuna'] },
    { name: 'Extra cleaning', price: 45, keywords: ['extra cleaning', 'mid stay cleaning', 'additional cleaning', 'limpieza extra'] },
  ],
};

/**
 * Called for each new guest message: one offer card per item and conversation, never twice.
 * Returns how many cards were created.
 */
export async function proposeUpsells(
  db: SupabaseClient,
  ctx: { orgId: number; propertyId: number; conversationId: number; reservationId: number | null; guestName: string | null; language: string; text: string },
): Promise<number> {
  const { data: items } = await db.from('upsell_items').select('*').eq('org_id', ctx.orgId).eq('active', true);
  const matches = matchUpsells(ctx.text, (items ?? []) as UpsellItem[], ctx.propertyId);
  let created = 0;
  for (const item of matches) {
    const { data: already } = await db.from('proposals').select('id').eq('org_id', ctx.orgId).eq('conversation_id', ctx.conversationId).eq('payload->upsell->>item_id', item.id).limit(1);
    if (already?.length) continue;
    const price = Number(item.price);
    await db.from('proposals').insert({
      org_id: ctx.orgId,
      agent: 'guest',
      kind: 'guest_message',
      conversation_id: ctx.conversationId,
      property_id: ctx.propertyId,
      title: `Extra: ${item.name} · ${formatPrice(price, item.currency, ctx.language)}`,
      payload: {
        text: offerText({ ...item, price }, ctx.guestName?.split(' ')[0] ?? null, ctx.language),
        draft_id: null,
        as_voice: false,
        learn_category: null,
        upsell: { item_id: item.id, name: item.name, price, currency: item.currency, reservation_id: ctx.reservationId },
      },
    });
    created++;
  }
  return created;
}
