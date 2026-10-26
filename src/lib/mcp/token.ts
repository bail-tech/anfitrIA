/**
 * Per-run bearer tokens for the AnfitrIA MCP server: `anf1.<orgId>.<runId>.<expiresAt>.<hmac>`.
 * Stateless (HMAC with MCP_TOKEN_SECRET); the server also checks the run is still running.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const PREFIX = 'anf1';
export const RUN_TOKEN_TTL_SECONDS = 2 * 60 * 60;

const sign = (payload: string, secret: string) => createHmac('sha256', secret).update(payload).digest('base64url');

export function issueRunToken(orgId: number, runId: string, secret: string, now = Date.now()): string {
  const payload = `${PREFIX}.${orgId}.${runId}.${Math.floor(now / 1000) + RUN_TOKEN_TTL_SECONDS}`;
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyRunToken(token: string, secret: string, now = Date.now()): { orgId: number; runId: string } | null {
  const parts = token.split('.');
  if (parts.length !== 5 || parts[0] !== PREFIX) return null;
  const payload = parts.slice(0, 4).join('.');
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(parts[4]);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (Number(parts[3]) * 1000 < now) return null;
  const orgId = Number(parts[1]);
  return Number.isInteger(orgId) ? { orgId, runId: parts[2] } : null;
}
