import { describe, expect, it } from 'vitest';
import { DEFAULT_UPSELLS, matchUpsells, normalise, offerText, type UpsellItem } from '@/lib/upsells';

const catalog: UpsellItem[] = DEFAULT_UPSELLS.es.map((u, i) => ({ ...u, id: `i${i}`, property_id: null, currency: 'EUR', active: true }));
const names = (text: string, items = catalog, property = 1) => matchUpsells(text, items, property).map((i) => i.name);

describe('upsell detection', () => {
  it('normalises accents, case and punctuation', () => {
    expect(normalise('¿Check-in TEMPRANO? ¡Sí!')).toBe('check in temprano si');
  });

  it('spots extras in Spanish and English messages', () => {
    expect(names('Hola! Llegamos antes, sobre las 11. ¿Podemos hacer check-in temprano?')).toEqual(['Entrada anticipada']);
    expect(names('Is there parking nearby? And could we get a late checkout?')).toEqual(['Salida tardía', 'Parking']);
    expect(names('Viajamos con un bebé, ¿tenéis cuna?')).toEqual(['Cuna']);
  });

  it('matches whole words only, and skips paused or other-property items', () => {
    expect(names('The apartment looks cozy')).toEqual([]); // "cot" inside a word doesn't count
    expect(names('need parking', [{ ...catalog[2], active: false }])).toEqual([]);
    expect(names('need parking', [{ ...catalog[2], property_id: 2 }], 1)).toEqual([]);
    expect(names('need parking', [{ ...catalog[2], property_id: 2 }], 2)).toEqual(['Parking']);
  });

  it('writes the offer with the price in the guest language', () => {
    expect(offerText({ name: 'Entrada anticipada', price: 25, currency: 'EUR' }, 'María', 'es')).toBe('¡Hola María! Podemos ofrecerte entrada anticipada por 25 €. ¿Quieres que te lo reservemos?');
    expect(offerText({ name: 'Parking', price: 12.5, currency: 'EUR' }, null, 'en')).toBe('We can offer you parking for €12.50. Would you like us to book it for you?');
  });
});

describe('review replies without Claude', () => {
  it('thanks happy guests and flags what to fill in for unhappy ones, in their language', async () => {
    const { templateReply } = await import('@/lib/agents/review-reply');
    expect(templateReply({ property_id: 1, rating: 5, guest_name: 'Ana López', text: 'Todo perfecto, muy limpio y el anfitrión encantador' }, 'Hab 1')).toBe('¡Gracias, Ana! Nos alegra mucho que disfrutaras de Hab 1. ¡Te esperamos pronto!');
    const low = templateReply({ property_id: 1, rating: 2, guest_name: null, text: 'The wifi did not work and the flat was noisy' }, 'Hab 1');
    expect(low).toContain('[CHECK:');
    expect(low.startsWith('Thank you for your review')).toBe(false);
    expect(low).toContain('thank you for your review');
  });
});
