'use client';

import { BarChart3, Bot, Building2, CalendarDays, ClipboardList, Cog, Inbox, LayoutGrid, LogOut, Megaphone, Menu, MessageSquareText, Sparkles, TrendingUp, Wrench, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Dot } from '@/components/ui';
import type { AgentKey } from '@/lib/types';
import { cn } from '@/lib/utils';

interface Props {
  agents: Partial<Record<AgentKey, boolean>>;
  pending: number;
  model: string;
  signOut: () => Promise<void>;
}

function NavLink({ href, icon: Icon, label, right, onNavigate }: { href: string; icon: typeof Inbox; label: string; right?: React.ReactNode; onNavigate?: () => void }) {
  const path = usePathname();
  const active = href === '/' ? path === '/' : path.startsWith(href.split('#')[0]) && !href.includes('#');
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn('flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors', active ? 'bg-gold-soft/70 font-medium text-ink' : 'text-ink/75 hover:bg-sand/70')}
    >
      <Icon className={cn('size-4', active ? 'text-gold' : 'text-muted')} />
      <span className="flex-1">{label}</span>
      {right}
    </Link>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">{title}</div>
      {children}
    </div>
  );
}

function Nav({ agents, pending, model, signOut, onNavigate }: Props & { onNavigate?: () => void }) {
  const t = useTranslations('nav');
  const ta = useTranslations('agents');
  const dot = (k: AgentKey) => <Dot tone={agents[k] ? 'sage' : 'muted'} />;
  return (
    <div className="flex h-full flex-col">
      <Link href="/" onClick={onNavigate} className="flex items-center gap-3 px-5 py-6">
        <span className="grid size-9 place-items-center rounded-xl bg-ink font-display text-lg text-cream">A</span>
        <span>
          <span className="block font-display text-lg font-semibold leading-none">AnfitrIA</span>
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted">Cockpit</span>
        </span>
      </Link>
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        <Group title={t('command')}>
          <NavLink href="/" icon={LayoutGrid} label={t('overview')} onNavigate={onNavigate} />
          <NavLink href="/agentes" icon={Bot} label={t('agents')} onNavigate={onNavigate} />
          <NavLink
            href="/bandeja"
            icon={Inbox}
            label={t('inbox')}
            onNavigate={onNavigate}
            right={pending ? <span className="rounded-full bg-terra px-1.5 text-[10px] font-semibold text-white">{pending}</span> : null}
          />
        </Group>
        <Group title={t('agentsGroup')}>
          <NavLink href="/bandeja" icon={MessageSquareText} label={ta('guest')} right={dot('guest')} onNavigate={onNavigate} />
          <NavLink href="/operaciones" icon={Wrench} label={ta('operations')} right={dot('operations')} onNavigate={onNavigate} />
          <NavLink href="/agentes#pricing" icon={TrendingUp} label={ta('pricing')} right={dot('pricing')} onNavigate={onNavigate} />
          <NavLink href="/agentes#analytics" icon={BarChart3} label={ta('analytics')} right={dot('analytics')} onNavigate={onNavigate} />
          <NavLink href="/agentes#marketing" icon={Megaphone} label={ta('marketing')} right={dot('marketing')} onNavigate={onNavigate} />
        </Group>
        <Group title={t('automation')}>
          <NavLink href="/alojamientos" icon={Building2} label={t('properties')} onNavigate={onNavigate} />
          <NavLink href="/reservas" icon={CalendarDays} label={t('reservations')} onNavigate={onNavigate} />
          <NavLink href="/simulador" icon={Sparkles} label={t('simulator')} onNavigate={onNavigate} />
          <NavLink href="/auditoria" icon={ClipboardList} label={t('audit')} onNavigate={onNavigate} />
          <NavLink href="/ajustes" icon={Cog} label={t('settings')} onNavigate={onNavigate} />
        </Group>
      </nav>
      <div className="border-t border-line px-5 py-4 text-xs text-muted">
        <form action={signOut}>
          <button className="mb-3 flex items-center gap-2 text-ink/75 hover:text-ink">
            <LogOut className="size-4" /> {t('logout')}
          </button>
        </form>
        <div className="flex items-center gap-2">
          <Dot tone="sage" /> {t('operational')}
        </div>
        <div className="mt-1 font-mono text-[10px]">v2.0 · {model}</div>
      </div>
    </div>
  );
}

export function Sidebar(props: Props) {
  const t = useTranslations('nav');
  const [open, setOpen] = useState(false);
  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-line bg-paper/80 backdrop-blur lg:block">
        <Nav {...props} />
      </aside>
      <button onClick={() => setOpen(true)} className="fixed left-3 top-3 z-30 rounded-xl border border-line bg-paper p-2 lg:hidden" aria-label={t('menu')}>
        <Menu className="size-5" />
      </button>
      {open && (
        <div className="fixed inset-0 z-40 bg-ink/30 lg:hidden" onClick={() => setOpen(false)}>
          <div className="h-full w-72 bg-paper shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setOpen(false)} className="absolute left-60 top-4 rounded-full bg-paper p-1.5" aria-label="close">
              <X className="size-4" />
            </button>
            <Nav {...props} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
