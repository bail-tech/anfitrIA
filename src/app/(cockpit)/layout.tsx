import { Bell } from 'lucide-react';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { AssistantDock } from '@/components/assistant/dock';
import { Sidebar } from '@/components/cockpit/sidebar';
import { CLAUDE_MODEL, features } from '@/lib/env';
import { requireSession } from '@/lib/supabase/server';
import type { AgentKey, AgentSetting } from '@/lib/types';
import { setLocale, signOut } from './actions';

export default async function CockpitLayout({ children }: { children: React.ReactNode }) {
  const { db, profile } = await requireSession();
  const t = await getTranslations('nav');
  const locale = await getLocale();
  const [{ data: settings }, { count: unread }, { count: pendingDrafts }, { data: org }] = await Promise.all([
    db.from('agent_settings').select('agent, enabled'),
    db.from('notifications').select('id', { count: 'exact', head: true }).eq('read', false),
    db.from('drafts').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    db.from('organizations').select('name').single(),
  ]);
  const agents = Object.fromEntries(((settings ?? []) as Pick<AgentSetting, 'agent' | 'enabled'>[]).map((s) => [s.agent, s.enabled])) as Partial<Record<AgentKey, boolean>>;
  const activeAgents = Object.values(agents).filter(Boolean).length;
  const now = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(new Date());

  return (
    <div className="flex min-h-screen">
      <Sidebar agents={agents} pending={pendingDrafts ?? 0} model={features.claude() ? CLAUDE_MODEL : 'mock'} signOut={signOut} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-end gap-3 border-b border-line bg-cream/85 px-4 backdrop-blur lg:justify-between lg:px-8">
          <div className="hidden text-sm lg:block">
            <span className="font-medium">{org?.name ?? 'AnfitrIA'}</span>
            <span className="text-muted"> · {profile.name}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="hidden font-mono text-muted sm:inline">{now}</span>
            <Link href="/agentes" className="rounded-full border border-gold/40 bg-gold-soft/60 px-2.5 py-1 font-medium text-[#8a6418]">
              ● {activeAgents}/5 {t('agents').toLowerCase()}
            </Link>
            <Link href="/bandeja" className="relative rounded-xl border border-line bg-paper p-2" aria-label="notifications">
              <Bell className="size-4" />
              {unread ? <span className="absolute -right-1.5 -top-1.5 rounded-full bg-terra px-1.5 text-[10px] font-semibold text-white">{unread}</span> : null}
            </Link>
            <form action={setLocale}>
              <input type="hidden" name="locale" value={locale === 'es' ? 'en' : 'es'} />
              <button className="rounded-xl border border-line bg-paper px-2 py-1.5 font-medium uppercase">{locale === 'es' ? 'EN' : 'ES'}</button>
            </form>
            <span className="grid size-8 place-items-center rounded-full bg-gold-soft font-semibold text-[#8a6418]">{profile.name.slice(0, 1).toUpperCase()}</span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 lg:px-8">{children}</main>
      </div>
      <AssistantDock />
    </div>
  );
}
