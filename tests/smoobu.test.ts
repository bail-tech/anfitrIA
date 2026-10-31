import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalQuery, signRequest, sourceOf } from '@/lib/channels/smoobu';
import { bookingIdOf, bookingRef } from '@/lib/integrations/smoobu-sync';

describe('Smoobu HMAC signing', () => {
  const creds = { apiKey: 'key123', secret: 'shh' };

  it('sorts and RFC 3986-encodes the query', () => {
    expect(canonicalQuery({ to: '2026-04-10', from: '2026-04-01', skip: undefined })).toBe('from=2026-04-01&to=2026-04-10');
    expect(canonicalQuery({ 'ids[]': 'a b', q: "it's" })).toBe('ids%5B%5D=a%20b&q=it%27s');
  });

  it('signs METHOD, path, query, timestamp, nonce, body hash and key, newline-separated', () => {
    const body = '{"messageBody":"Hola"}';
    const headers = signRequest(creds, 'post', '/api/reservations/1/messages/send-message-to-guest', '', body, '2026-10-31T10:00:00.000Z', 'n-1');
    const canonical = ['POST', '/api/reservations/1/messages/send-message-to-guest', '', '2026-10-31T10:00:00.000Z', 'n-1', createHash('sha256').update(body).digest('hex'), 'key123'].join('\n');
    expect(headers).toEqual({
      'X-API-Key': 'key123',
      'X-Timestamp': '2026-10-31T10:00:00.000Z',
      'X-Nonce': 'n-1',
      'X-Signature': createHmac('sha256', 'shh').update(canonical).digest('base64'),
    });
  });

  it('hashes the empty body for GET', () => {
    const empty = createHash('sha256').update('').digest('hex');
    const a = signRequest(creds, 'GET', '/api/reservations', 'from=2026-04-01', '', 't', 'n');
    const b = createHmac('sha256', 'shh').update(['GET', '/api/reservations', 'from=2026-04-01', 't', 'n', empty, 'key123'].join('\n')).digest('base64');
    expect(a['X-Signature']).toBe(b);
  });
});

describe('Smoobu mapping', () => {
  it('maps channels to reservation sources', () => {
    expect(sourceOf('Airbnb')).toBe('airbnb');
    expect(sourceOf('Booking.com')).toBe('booking');
    expect(sourceOf('Direct booking')).toBe('direct');
    expect(sourceOf(null)).toBe('direct');
    expect(sourceOf('Vrbo')).toBe('other');
  });
  it('round-trips booking refs', () => {
    expect(bookingIdOf(bookingRef(4417))).toBe(4417);
    expect(bookingIdOf('+34600000000')).toBeNaN();
  });
});

describe('personal MCP keys', () => {
  it('generates prefixed keys that are recognised and hashed, never stored in clear', async () => {
    const { generateKey, hashKey, looksLikeKey } = await import('@/lib/mcp/api-keys');
    const { key, prefix, hash } = generateKey();
    expect(key).toMatch(/^anf_pk_[A-Za-z0-9_-]{32}$/);
    expect(looksLikeKey(key)).toBe(true);
    expect(looksLikeKey('anf1.1.run.123.sig')).toBe(false);
    expect(prefix).toBe(key.slice(0, 12));
    expect(hash).toBe(hashKey(key));
    expect(hash).not.toContain(key);
  });
});
