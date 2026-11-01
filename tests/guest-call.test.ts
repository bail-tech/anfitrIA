import { describe, expect, it } from 'vitest';
import { parseCalls } from '@/lib/channels/whatsapp';
import { callFacts, guestCallInstructions, languageForPhone } from '@/lib/voice/guest-call';

const connect = {
  entry: [
    {
      changes: [
        {
          field: 'calls',
          value: {
            metadata: { phone_number_id: '111' },
            calls: [{ id: 'wacid.1', from: '59892339174', event: 'connect', direction: 'USER_INITIATED', session: { sdp_type: 'offer', sdp: 'v=0\r\n' } }],
          },
        },
      ],
    },
  ],
};

describe('WhatsApp calls', () => {
  it('reads connect and terminate events', () => {
    expect(parseCalls(connect)).toEqual([{ phoneNumberId: '111', id: 'wacid.1', from: '59892339174', event: 'connect', sdp: 'v=0\r\n', duration: undefined, status: undefined, callbackData: undefined }]);
    const end = structuredClone(connect);
    Object.assign(end.entry[0].changes[0].value.calls[0], { event: 'terminate', status: 'COMPLETED', duration: 95, session: undefined });
    expect(parseCalls(end)[0]).toMatchObject({ event: 'terminate', status: 'COMPLETED', duration: 95, sdp: undefined });
    expect(parseCalls({ entry: [{ changes: [{ value: { metadata: { phone_number_id: '1' }, messages: [] } }] }] })).toEqual([]);
  });
  it('starts in the caller’s language', () => {
    expect(languageForPhone('59892339174', 'es')).toBe('es');
    expect(languageForPhone('447700900123', 'es')).toBe('en');
    expect(languageForPhone('33612345678', 'es')).toBe('fr');
    expect(languageForPhone('81312345678', 'es')).toBe('es');
  });
  it('never puts private details in the voice prompt', () => {
    const facts = callFacts([
      { category: 'wifi', content: 'Red TioPepe, clave bienvenido2026', is_private: true },
      { category: 'parking', content: 'Parking gratis en la calle', is_private: false },
    ]);
    expect(facts).not.toContain('bienvenido2026');
    expect(facts).toContain('Parking gratis en la calle');
    const prompt = guestCallInstructions({ property: { name: 'Tio Pepe Hab 1', check_in_time: '15:00:00', check_out_time: '11:00:00' }, language: 'en', stay: null, facts });
    expect(prompt).toContain('Tio Pepe Hab 1');
    expect(prompt).toContain('Start in English');
    expect(prompt).not.toContain('bienvenido2026');
  });
});
