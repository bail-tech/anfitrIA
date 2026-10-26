import { NextResponse } from 'next/server';
import { getSession, type Session } from '@/lib/supabase/server';
import { ChannelError } from '@/lib/channels';

export const fail = (status: number, error: string, code?: string) => NextResponse.json({ error, code }, { status });

/** Runs a route body for the signed-in host, mapping known errors to clean responses. */
export async function withSession(fn: (s: Session) => Promise<Response>): Promise<Response> {
  const session = await getSession();
  if (!session) return fail(401, 'unauthorized');
  try {
    return await fn(session);
  } catch (e) {
    if (e instanceof ChannelError) return fail(e.code === 'send_failed' ? 502 : 409, e.message, e.code);
    console.error(e);
    return fail(500, e instanceof Error ? e.message : 'internal error');
  }
}

/** Same-origin check for state-changing requests made by the cockpit. */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  return !origin || new URL(origin).host === new URL(request.url).host;
}

/** Vercel cron sends `Authorization: Bearer $CRON_SECRET`. */
export function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get('authorization') === `Bearer ${secret}`;
}
