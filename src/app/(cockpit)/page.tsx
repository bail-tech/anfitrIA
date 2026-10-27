import { BedDouble, CalendarCheck, CheckSquare, Euro, Percent, Sparkles, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { todayOverview } from '@/lib/assistant/tools';
import { todayIn } from '@/lib/concierge/stay';
import { CLAUDE_MODEL, CLAUDE_MODEL_NAME, features } from '@/lib/env';
import { loadOverview } from '@/lib/metrics';
import { requireSession } from '@/lib/supabase/server';
import type { AgentKey, AgentRun } from '@/lib/types';
import { eur, pct, relativeTime } from '@/lib/utils';
import { Badge, Bars, Card, Dot, PageHeader, Sparkline, StatTile } from '@/components/ui';

export const metadata = { title: 'Resumen' };

const AGENT_COLOR: Record<AgentKey, string> = { guest: '#8467c9', operations: '#d0693f', pricing: '#c79a3c', analytics: '#5f9e80', marketing: '#4e8fc4' };
const AGENTS: AgentKey[] = ['guest', 'operations', 'pricing', 'analytics', 'marketing'];

const dayOffset = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

function delta(now: number, before: number, fmt: (n: number) => string) {
  if (!before && !now) return null;
  const diff = now - before;
  return { text: `${diff >= 0 ? '+' : ''}${fmt(diff)}`, up: diff >= 0 };
}

export default async function OverviewPage() {
  const { db } = await requireSession();
  const t = await getTranslations('overview');
  const ta = await getTranslations('agents');
  const th = await getTranslations('health');
  const ti = await getTranslations('inbox');
  const locale = await getLocale();
  const today = todayIn();
  const [o, day, { data: settings }, { data: runs }, { data: activity }, { data: tasks }, { data: proposals }, { data: audit7 }] = await Promise.all([
    loadOverview(db, today),
    todayOverview(db),
    db.from('agent_settings').select('agent, enabled'),
    db.from('agent_runs').select('*').order('started_at', { ascending: false }).limit(30),
    db.from('audit_logs').select('id, actor, action, detail, created_at, conversation_id').order('created_at', { ascending: false }).limit(12),
    db.from('tasks').select('id, status, created_at'),
    db.from('proposals').select('agent, status, created_at'),
    db.from('audit_logs').select('action, created_at').in('action', ['auto_answered', 'escalated']).gte('created_at', `${dayOffset(today, -7)}T00:00:00Z`),
  ]);
  const enabled = new Map((settings ?? []).map((s) => [s.agent as AgentKey, s.enabled as boolean]));
  const lastRun = (a: AgentKey) => ((runs ?? []) as AgentRun[]).find((r) => r.agent === a);
  const perDay = (rows: Array<{ created_at: string }>) =>
    Array.from({ length: 7 }, (_, i) => {
      const d = dayOffset(today, i - 6);
      return rows.filter((r) => r.created_at.slice(0, 10) === d).length;
    });
  const agentWork: Record<AgentKey, { count: number; spark: number[]; last: string }> = {
    guest: { count: o.ai.auto + o.ai.escalated, spark: perDay(audit7 ?? []), last: o.ai.auto ? `${o.ai.auto} respuestas automáticas · ${o.ai.escalated} escaladas` : ta('guestDesc') },
    operations: { count: tasks?.length ?? 0, spark: perDay(tasks ?? []), last: lastRun('operations')?.summary ?? ta('operationsDesc') },
    pricing: { count: (proposals ?? []).filter((p) => p.agent === 'pricing').length, spark: perDay((proposals ?? []).filter((p) => p.agent === 'pricing')), last: lastRun('pricing')?.summary ?? ta('pricingDesc') },
    analytics: { count: (runs ?? []).filter((r) => r.agent === 'analytics').length, spark: perDay(((runs ?? []) as AgentRun[]).filter((r) => r.agent === 'analytics').map((r) => ({ created_at: r.started_at }))), last: lastRun('analytics')?.summary ?? ta('analyticsDesc') },
    marketing: { count: (proposals ?? []).filter((p) => p.agent === 'marketing').length, spark: perDay((proposals ?? []).filter((p) => p.agent === 'marketing')), last: lastRun('marketing')?.summary ?? ta('marketingDesc') },
  };
  const pendingTotal = o.pending.drafts + o.pending.proposals + o.pending.tasks;
  const loc = locale === 'en' ? 'en-GB' : 'es-ES';
  const names = (l: Array<{ guest: string; property?: string }>) => (l.length ? l.map((x) => `${x.guest} · ${x.property}`).join(', ') : t('nothing'));

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle', { count: o.propertyCount })} />

      <div data-anfi="kpis" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label={t('revenueMtd')} value={o.hasPrices ? eur(o.month.revenue, loc) : '—'} icon={<Euro className="size-4" />} delta={o.hasPrices ? delta(o.month.revenue, o.lastMonth.revenue, (n) => eur(n, loc)) : null} hint={o.hasPrices ? undefined : t('connectPms')} />
        <StatTile label={t('activeBookings')} value={String(o.activeBookings)} icon={<CalendarCheck className="size-4" />} />
        <StatTile label={t('occupancy')} value={pct(o.month.occupancy)} icon={<Percent className="size-4" />} delta={delta(o.month.occupancy, o.lastMonth.occupancy, (n) => pct(n))} />
        <StatTile label={t('adr')} value={o.hasPrices ? eur(o.month.adr, loc) : '—'} icon={<TrendingUp className="size-4" />} delta={o.hasPrices ? delta(o.month.adr, o.lastMonth.adr, (n) => eur(n, loc)) : null} />
        <StatTile label={t('aiResolved')} value={o.ai.auto + o.ai.escalated ? pct(o.ai.rate) : '—'} icon={<Sparkles className="size-4" />} hint={`${o.ai.auto} / ${o.ai.auto + o.ai.escalated}`} />
        <StatTile label={t('pending')} value={String(pendingTotal)} icon={<CheckSquare className="size-4" />} hint={`${o.pending.drafts} ${ti('pending').toLowerCase()} · ${o.pending.proposals} ${ta('proposals')} · ${o.pending.tasks} ${ta('tasks')}`} />
      </div>

      <div data-anfi="trends" className="mt-4 grid gap-3 md:grid-cols-3">
        <Card className="p-4">
          <div className="mb-3 text-xs text-muted">{t('revenue7')}</div>
          <Bars values={o.week.map((d) => d.revenue)} color="#c79a3c" labels={o.week.map((d) => d.day)} />
        </Card>
        <Card className="p-4">
          <div className="mb-3 text-xs text-muted">{t('occupancy7')}</div>
          <Bars values={o.week.map((d) => d.occupancy)} color="#5f9e80" labels={o.week.map((d) => d.day)} />
        </Card>
        <Card className="p-4">
          <div className="mb-3 text-xs text-muted">{t('adr7')}</div>
          <Bars values={o.week.map((d) => d.adr)} color="#7cc4a4" labels={o.week.map((d) => d.day)} />
        </Card>
      </div>

      <Card data-anfi="today" className="mt-4 grid gap-4 p-4 md:grid-cols-3">
        {(
          [
            ['arrivals', day.arrivals_today],
            ['departures', day.departures_today],
            ['inHouse', day.in_house],
          ] as const
        ).map(([key, list]) => (
          <div key={key} className="flex items-start gap-3">
            <BedDouble className="mt-0.5 size-4 text-gold" />
            <div>
              <div className="text-xs text-muted">
                {t('today')} · {t(key)}
              </div>
              <div className="text-sm">{names(list)}</div>
            </div>
          </div>
        ))}
      </Card>

      <div data-anfi="agents" className="mt-6 grid gap-4 xl:grid-cols-[1fr_280px]">
        <div>
          <div className="mb-2 flex items-center justify-between text-sm text-muted">
            <span>{t('agentStatus')}</span>
            <span>
              {[...enabled.values()].filter(Boolean).length}/5 {ta('enabled').toLowerCase()}
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {AGENTS.map((a) => (
              <Link key={a} href={a === 'guest' ? '/bandeja' : a === 'operations' ? '/operaciones' : `/agentes#${a}`}>
                <Card className="h-full border-t-2 p-4 transition-shadow hover:shadow-lg" >
                  <div className="flex items-center gap-2 text-sm font-medium" style={{ color: AGENT_COLOR[a] }}>
                    <Dot tone={enabled.get(a) ? 'sage' : 'muted'} pulse={lastRun(a)?.status === 'running'} />
                    <span className="text-ink">{ta(a)}</span>
                  </div>
                  <p className="mt-2 line-clamp-2 min-h-10 text-xs text-muted">{agentWork[a].last}</p>
                  <div className="mt-3 flex items-end justify-between">
                    <Sparkline values={agentWork[a].spark} color={AGENT_COLOR[a]} />
                    <div className="text-right">
                      <div className="font-display text-2xl font-semibold" style={{ color: AGENT_COLOR[a] }}>
                        {agentWork[a].count}
                      </div>
                      <div className="text-[10px] uppercase tracking-wider text-muted">{ta('tasks')}</div>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>

          <Card className="mt-4 p-4">
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="font-medium">⚡ {t('activity')}</span>
              <Badge tone="sage">● Live</Badge>
            </div>
            <ul className="divide-y divide-line text-sm">
              {(activity ?? []).map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="flex items-center gap-2">
                    <Badge tone={a.actor === 'ai' ? 'violet' : 'gold'}>{a.actor === 'ai' ? 'IA' : 'Host'}</Badge>
                    <span>{a.action.replace(/_/g, ' ')}</span>
                    {a.detail && <span className="hidden truncate text-xs text-muted md:inline">· {a.detail}</span>}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-muted">{relativeTime(a.created_at, locale)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <Card data-anfi="health" className="h-fit p-4">
          <div className="text-xs font-medium uppercase tracking-wider text-gold">● {t('health')}</div>
          <div className="mt-3 font-display text-xl font-semibold">{features.claude() ? CLAUDE_MODEL_NAME : th('mock')}</div>
          <div className="font-mono text-xs text-muted">{features.claude() ? CLAUDE_MODEL : 'mock · sin ANTHROPIC_API_KEY'}</div>
          <ul className="mt-4 space-y-2 text-sm">
            {(
              [
                ['database', true],
                ['claude', features.claude()],
                ['whatsapp', features.whatsapp()],
                ['voice', features.openai()],
                ['agents', features.managedAgents()],
              ] as const
            ).map(([k, on]) => (
              <li key={k} className="flex items-center justify-between">
                <span>{th(k)}</span>
                <span className="flex items-center gap-1.5 text-xs text-muted">
                  <Dot tone={on ? 'sage' : 'gold'} /> {on ? th('on') : th('off')}
                </span>
              </li>
            ))}
          </ul>
          {o.pending.drafts > 0 && (
            <Link href="/bandeja" className="mt-4 block rounded-xl bg-terra-soft px-3 py-2 text-sm text-[#9a4220]">
              {o.pending.drafts} {t('escalations').toLowerCase()} → {t('openInbox')}
            </Link>
          )}
        </Card>
      </div>
    </>
  );
}
