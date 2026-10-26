/** AnfitrIA remote MCP server for the scheduled agents (Streamable HTTP, stateless, per-run bearer tokens). */
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createAnfitriaMcp } from '@/lib/mcp/server';
import { verifyRunToken } from '@/lib/mcp/token';
import { createAdminSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const unauthorized = (description: string) =>
  Response.json(
    { jsonrpc: '2.0', error: { code: -32001, message: description }, id: null },
    { status: 401, headers: { 'WWW-Authenticate': `Bearer error="invalid_token", error_description="${description}"` } },
  );

async function handle(request: Request): Promise<Response> {
  const secret = process.env.MCP_TOKEN_SECRET;
  if (!secret || !process.env.SUPABASE_SERVICE_ROLE_KEY) return Response.json({ error: 'MCP server not configured' }, { status: 503 });
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const claims = token ? verifyRunToken(token, secret) : null;
  if (!claims) return unauthorized('A valid AnfitrIA run token is required');

  const db = createAdminSupabase();
  const { data: run } = await db.from('agent_runs').select('id, agent, status').eq('id', claims.runId).eq('org_id', claims.orgId).maybeSingle();
  if (!run || run.status !== 'running') return unauthorized('The run has ended');

  const server = createAnfitriaMcp(db, claims.orgId, run.agent, run.id);
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
