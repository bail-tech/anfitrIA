import { getLocale, getTranslations } from 'next-intl/server';
import { ProposalQueue, RunAgentButton } from '@/components/cockpit/agent-controls';
import { Badge, Card, Dot, Empty, PageHeader } from '@/components/ui';
import { features } from '@/lib/env';
import { requireSession } from '@/lib/supabase/server';
import type { AgentKey, AgentRun, Proposal } from '@/lib/types';
import { relativeTime } from '@/lib/utils';
import { toggleAgent } from '../actions';

export const metadata = { title: 'Agentes' };

const AGENTS: Array<{ key: AgentKey; managed: boolean; skills: string[] }> = [
  { key: 'guest', managed: false, skills: ['guest-reply', 'guest-lifecycle'] },
  { key: 'operations', managed: false, skills: ['turnover-planning'] },
  { key: 'pricing', managed: true, skills: ['pricing-review'] },
  { key: 'analytics', managed: true, skills: ['weekly-market-report', 'stay-improvements'] },
  { key: 'marketing', managed: true, skills: ['listing-audit', 'listing-copy', 'reviews', 'repeat-guests'] },
];

export default async function AgentsPage() {
  const { db } = await requireSession();
  const t = await getTranslations('agents');
  const locale = await getLocale();
  const [{ data: settings }, { data: runs }, { data: proposals }] = await Promise.all([
    db.from('agent_settings').select('agent, enabled'),
    db.from('agent_runs').select('*').order('started_at', { ascending: false }).limit(40),
    db.from('proposals').select('*').eq('status', 'pending').order('created_at', { ascending: false }).limit(30),
  ]);
  const enabled = new Map((settings ?? []).map((s) => [s.agent as AgentKey, s.enabled as boolean]));
  const runList = (runs ?? []) as AgentRun[];

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <h2 data-anfi="approvals" className="mb-3 font-display text-lg font-semibold">
        {t('pendingApprovals')} ({proposals?.length ?? 0})
      </h2>
      {proposals?.length ? <ProposalQueue proposals={proposals as Proposal[]} /> : <Empty title={t('noPending')} />}

      <div data-anfi="agents" className="mt-8 grid gap-4 md:grid-cols-2">
        {AGENTS.map(({ key, managed, skills }) => {
          const on = enabled.get(key) ?? false;
          const mine = runList.filter((r) => r.agent === key).slice(0, 4);
          const ready = managed ? features.managedAgents() : true;
          return (
            <Card key={key} className="scroll-mt-20 p-4">
              <div id={key} className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 font-medium">
                    <Dot tone={on ? 'sage' : 'muted'} pulse={mine[0]?.status === 'running'} /> {t(key)}
                  </div>
                  <p className="mt-1 text-sm text-muted">{t(`${key}Desc`)}</p>
                </div>
                <form action={toggleAgent}>
                  <input type="hidden" name="agent" value={key} />
                  <input type="hidden" name="enabled" value={String(!on)} />
                  <button className={`rounded-full px-3 py-1 text-xs font-medium ${on ? 'bg-sage-soft text-[#2f6b4f]' : 'bg-sand text-muted'}`}>{on ? t('enabled') : t('disabled')}</button>
                </form>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {skills.map((s) => (
                  <Badge key={s} tone="neutral">
                    {s}
                  </Badge>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted">{managed ? t('managedNote') : t('codeNote')}</p>
              {!ready && <Badge tone="gold" className="mt-2">{t('notConfigured')}</Badge>}
              <div className="mt-3 border-t border-line pt-3">
                <div className="mb-2 flex items-center justify-between text-xs text-muted">
                  <span>
                    {t('lastRun')}: {mine[0] ? relativeTime(mine[0].started_at, locale) : t('never')}
                  </span>
                  {key !== 'guest' && <RunAgentButton agent={key} disabled={!ready} />}
                </div>
                <ul className="space-y-1 text-xs">
                  {mine.map((r) => (
                    <li key={r.id} className="flex items-start gap-2">
                      <Badge tone={r.status === 'completed' ? 'sage' : r.status === 'failed' ? 'terra' : 'gold'}>{r.status}</Badge>
                      <span className="flex-1 text-muted">{r.summary ?? r.error ?? ''}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
