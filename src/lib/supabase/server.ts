import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Profile } from '@/lib/types';

/** Request-scoped client: acts as the signed-in host, so RLS limits it to their organisation. */
export async function createServerSupabase() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Called from a Server Component; the proxy refreshes the session instead.
        }
      },
    },
  });
}

/** Bypasses RLS: only for the webhook, crons and agents, which always filter by org themselves. */
export function createAdminSupabase(): SupabaseClient {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface Session {
  db: SupabaseClient;
  profile: Profile;
}

/** The signed-in host and their profile, or null. */
export async function getSession(): Promise<Session | null> {
  const db = await createServerSupabase();
  const { data } = await db.auth.getUser();
  if (!data.user) return null;
  const { data: profile } = await db.from('profiles').select('*').eq('id', data.user.id).single();
  if (!profile) return null;
  return { db, profile: profile as Profile };
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect('/login');
  return session;
}
