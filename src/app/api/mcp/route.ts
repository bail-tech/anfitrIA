/**
 * AnfitrIA remote MCP server (Streamable HTTP, stateless). Two kinds of bearer:
 * - a host's personal key (`anf_pk_…`), for Claude, ChatGPT or any MCP client;
 * - a per-run token for the scheduled agents (pricing, analytics, marketing).
 */
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { hashKey, looksLikeKey } from '@/lib/mcp/api-keys';
import { createHostMcp } from '@/lib/mcp/host';
import { createAnfitriaMcp } from '@/lib/mcp/server';
import { verifyRunToken } from '@/lib/mcp/token';
import { rateLimit } from '@/lib/rate-limit';
import { createAdminSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const unauthorized = (description: string) =>
  Response.json(
    { jsonrpc: '2.0', error: { code: -32001, message: description }, id: null },
    { status: 401, headers: { 'WWW-Authenticate': `Bearer error="invalid_token", error_description="${description}"` } },
  );

/** Only refresh "last used" every few minutes; a chat makes many calls. */
const TOUCH_MS = 5 * 60_000;

async function serverFor(token: string): Promise<McpServer | Response> {
  const db = createAdminSupabase();
  if (looksLikeKey(token)) {
    const { data: key } = await db.from('api_keys').select('id, org_id, profile_id, last_used_at, revoked_at').eq('key_hash', hashKey(token)).maybeSingle();
    if (!key || key.revoked_at) return unauthorized('This AnfitrIA key is not valid or was revoked');
    if (!rateLimit(`mcp:${key.id}`, 300, 3600)) return Response.json({ error: 'too many requests' }, { status: 429 });
    if (!key.last_used_at || Date.now() - Date.parse(key.last_used_at) > TOUCH_MS) await db.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', key.id);
    return createHostMcp(db, key.org_id, key.profile_id);
  }

  const secret = process.env.MCP_TOKEN_SECRET;
  const claims = secret ? verifyRunToken(token, secret) : null;
  if (!claims) return unauthorized('A valid AnfitrIA key or run token is required');
  const { data: run } = await db.from('agent_runs').select('id, agent, status').eq('id', claims.runId).eq('org_id', claims.orgId).maybeSingle();
  if (!run || run.status !== 'running') return unauthorized('The run has ended');
  return createAnfitriaMcp(db, claims.orgId, run.agent, run.id);
}

async function handle(request: Request): Promise<Response> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return Response.json({ error: 'MCP server not configured' }, { status: 503 });
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return unauthorized('A valid AnfitrIA key or run token is required');
  const server = await serverFor(token);
  if (server instanceof Response) return server;
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    await server.close();
  }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
