import { describe, expect, it } from 'vitest';
import { codeCandidates, phonesIn, phoneTail, samePhone } from '@/lib/channels/whatsapp-routing';

describe('shared WhatsApp number routing', () => {
  it('matches the same phone written different ways', () => {
    expect(samePhone('34612345678', '+34612345678')).toBe(true);
    expect(samePhone('34612345678', '612345678')).toBe(true);
    expect(samePhone('34612345678', '+34 612 345 678')).toBe(true);
    expect(samePhone('34612345678', '34612345679')).toBe(false);
    expect(samePhone('34612345678', '345678')).toBe(false);
  });
  it('ignores references that are not phones', () => {
    expect(phoneTail('ical:abc123456789')).toBeNull();
    expect(phoneTail('smoobu:12345678')).toBeNull();
    expect(phoneTail('+34 612 345 678')).toBe('12345678');
  });
  it('finds booking codes and phones in a message', () => {
    expect(codeCandidates('Hola, mi reserva es HMABCD1234, gracias')).toEqual(['HMABCD1234']);
    expect(codeCandidates('hola qué tal')).toEqual([]);
    expect(phonesIn('Reservé con el +34 612 345 678')).toEqual(['+34612345678']);
    expect(phonesIn('llego a las 15:00')).toEqual([]);
  });
});
