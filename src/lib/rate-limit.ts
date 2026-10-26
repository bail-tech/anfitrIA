/**
 * In-memory sliding counter per serverless instance. Enough to stop accidental loops on the
 * paid endpoints (voice); swap for Upstash Redis (as in Blemia) for a global limit.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, max: number, windowSeconds: number, now = Date.now()): boolean {
  const b = buckets.get(key);
  if (!b || now > b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return true;
  }
  if (b.count >= max) return false;
  b.count++;
  return true;
}
