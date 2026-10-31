import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Badge, buttonClass, Card, Dot, inputClass, PageHeader } from '@/components/ui';
import { appUrl, features } from '@/lib/env';
import { requireSession } from '@/lib/supabase/server';
import type { Profile } from '@/lib/types';
import { NewApiKey } from '@/components/cockpit/api-keys';
import { inviteMember, revokeApiKey, saveSesSettings, saveSmoobuSettings } from '../actions';

export const metadata = { title: 'Ajustes' };

export default async function SettingsPage() {
  const { db, profile } = await requireSession();
  const t = await getTranslations('settings');
  const [{ data: members }, { data: invites }, { data: connections }] = await Promise.all([
    db.from('profiles').select('*').order('created_at'),
    profile.role === 'owner' ? db.from('invitations').select('*').is('accepted_at', null) : Promise.resolve({ data: [] }),
    db.from('integrations').select('provider, status, config, last_error, last_sync_at').in('provider', ['ses', 'smoobu']),
  ]);
  const { data: keys } = await db.from('api_keys').select('id, name, prefix, created_at, last_used_at').is('revoked_at', null).order('created_at', { ascending: false });
  type Connection = { provider: string; status: string; config: Record<string, string> | null; last_error: string | null; last_sync_at: string | null };
  const conn = (provider: string) => ((connections ?? []) as Connection[]).find((c) => c.provider === provider);
  const ses = conn('ses');
  const smoobu = conn('smoobu');
  const owner = profile.role === 'owner';

  const integrations = [
    { name: 'Claude (Anthropic)', on: features.claude(), env: 'ANTHROPIC_API_KEY' },
    { name: 'WhatsApp Cloud API', on: features.whatsapp(), env: 'WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN' },
    { name: 'Voz y notas de voz (OpenAI)', on: features.openai(), env: 'OPENAI_API_KEY + NEXT_PUBLIC_VOICE=true' },
    { name: 'Webhook, crons y agentes (Supabase service role)', on: features.serviceRole(), env: 'SUPABASE_SERVICE_ROLE_KEY' },
    { name: 'Agentes programados (Managed Agents)', on: features.managedAgents(), env: 'ANTHROPIC_ENVIRONMENT_ID, ANTHROPIC_AGENT_*_ID, MCP_TOKEN_SECRET' },
    { name: 'Comparables (StayingAPI)', on: Boolean(process.env.STAYINGAPI_KEY), env: 'STAYINGAPI_KEY' },
  ];

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card data-anfi="team" className="p-4">
          <h2 className="mb-3 font-medium">{t('team')}</h2>
          <ul className="mb-3 divide-y divide-line text-sm">
            {((members ?? []) as Profile[]).map((m) => (
              <li key={m.id} className="flex items-center justify-between py-2">
                <span>
                  {m.name} <span className="text-xs text-muted">· {m.email}</span>
                </span>
                <Badge tone={m.role === 'owner' ? 'gold' : 'neutral'}>{t(m.role)}</Badge>
              </li>
            ))}
          </ul>
          {profile.role === 'owner' && (
            <>
              {(invites ?? []).length > 0 && (
                <div className="mb-3 text-xs text-muted">
                  {t('invited')}: {(invites ?? []).map((i) => i.email).join(', ')}
                </div>
              )}
              <form action={inviteMember} className="flex gap-2">
                <input name="email" type="email" required placeholder={t('email')} className={inputClass} />
                <select name="role" className={inputClass + ' w-36'}>
                  <option value="member">{t('member')}</option>
                  <option value="owner">{t('owner')}</option>
                </select>
                <button className={buttonClass('primary')}>{t('invite')}</button>
              </form>
            </>
          )}
        </Card>

        <Card data-anfi="integrations" className="p-4">
          <h2 className="mb-1 font-medium">{t('integrations')}</h2>
          <p className="mb-3 text-xs text-muted">{t('envHint')}</p>
          <ul className="space-y-2 text-sm">
            {integrations.map((i) => (
              <li key={i.name} className="flex items-start justify-between gap-3">
                <span>
                  {i.name}
                  <span className="block font-mono text-[10px] text-muted">{i.env}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
                  <Dot tone={i.on ? 'sage' : 'gold'} /> {i.on ? t('configured') : t('notConfigured')}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card data-anfi="connections" id="ses" className="space-y-4 p-4 lg:col-span-2">
          <h2 className="font-medium">{t('connections')}</h2>
          <form action={saveSesSettings} className="space-y-3 rounded-xl bg-sand/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-medium">SES.Hospedajes</div>
                <p className="text-xs text-muted">{t('sesHint')}</p>
              </div>
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <Dot tone={ses?.status === 'connected' ? 'sage' : ses?.status === 'error' ? 'terra' : 'muted'} /> {t(`conn_${ses?.status ?? 'none'}`)}
              </span>
            </div>
            {ses?.last_error && <p className="text-xs text-terra-ink">{ses.last_error}</p>}
            <fieldset disabled={!owner} className="grid gap-2 sm:grid-cols-4">
              <input name="arrendador" defaultValue={ses?.config?.arrendador ?? ''} required maxLength={10} placeholder={t('sesArrendador')} aria-label={t('sesArrendador')} className={inputClass} />
              <input name="usuario" defaultValue={ses?.config?.usuario ?? ''} required maxLength={50} placeholder={t('sesUser')} aria-label={t('sesUser')} autoComplete="off" className={inputClass} />
              <input name="password" type="password" placeholder={ses ? t('sesPasswordKeep') : t('sesPassword')} aria-label={t('sesPassword')} autoComplete="new-password" required={!ses} className={inputClass} />
              <select name="env" defaultValue={ses?.config?.env ?? 'pre'} aria-label={t('sesEnv')} className={inputClass}>
                <option value="pre">{t('sesPre')}</option>
                <option value="prod">{t('sesProd')}</option>
              </select>
            </fieldset>
            {owner ? <button className={buttonClass('primary', 'sm')}>{t('saveAndTest')}</button> : <p className="text-xs text-muted">{t('ownerOnly')}</p>}
          </form>

          <form action={saveSmoobuSettings} id="smoobu" className="space-y-3 rounded-xl bg-sand/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-medium">Smoobu (PMS)</div>
                <p className="text-xs text-muted">{t('smoobuHint')}</p>
              </div>
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <Dot tone={smoobu?.status === 'connected' ? 'sage' : smoobu?.status === 'error' ? 'terra' : smoobu?.status === 'syncing' ? 'gold' : 'muted'} pulse={smoobu?.status === 'syncing'} />
                {t(`conn_${smoobu?.status ?? 'none'}`)}
                {smoobu?.last_sync_at && smoobu.status === 'connected' && <span>· {t('lastSync', { when: smoobu.last_sync_at.slice(0, 16).replace('T', ' ') })}</span>}
              </span>
            </div>
            {smoobu?.last_error && <p className="text-xs text-terra-ink">{smoobu.last_error}</p>}
            <fieldset disabled={!owner} className="grid gap-2 sm:grid-cols-2">
              <input name="api_key" defaultValue={smoobu?.config?.apiKey ?? ''} required placeholder={t('smoobuKey')} aria-label={t('smoobuKey')} autoComplete="off" className={inputClass + ' font-mono'} />
              <input name="api_secret" type="password" placeholder={smoobu ? t('sesPasswordKeep') : t('smoobuSecret')} aria-label={t('smoobuSecret')} autoComplete="new-password" required={!smoobu} className={inputClass} />
            </fieldset>
            {owner ? <button className={buttonClass('primary', 'sm')}>{t('connectAndImport')}</button> : <p className="text-xs text-muted">{t('ownerOnly')}</p>}
          </form>
        </Card>

        <Card data-anfi="mcp" className="space-y-3 p-4 lg:col-span-2">
          <div>
            <h2 className="font-medium">{t('mcpTitle')}</h2>
            <p className="text-xs text-muted">{t('mcpHint')}</p>
          </div>
          {(keys ?? []).length > 0 && (
            <ul className="divide-y divide-line text-sm">
              {(keys ?? []).map((k) => (
                <li key={k.id} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    {k.name} <span className="font-mono text-xs text-muted">{k.prefix}…</span>
                    <span className="block text-xs text-muted">{k.last_used_at ? t('keyUsed', { when: k.last_used_at.slice(0, 16).replace('T', ' ') }) : t('keyNeverUsed')}</span>
                  </span>
                  <form action={revokeApiKey}>
                    <input type="hidden" name="id" value={k.id} />
                    <button className={buttonClass('ghost', 'sm') + ' text-terra-ink'}>{t('keyRevoke')}</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <NewApiKey mcpUrl={`${appUrl()}/api/mcp`} />
        </Card>

        <Card data-anfi="templates" className="flex flex-wrap items-center justify-between gap-3 p-4 lg:col-span-2">
          <div>
            <h2 className="mb-1 font-medium">{t('templates')}</h2>
            <p className="text-xs text-muted">{t('templatesMoved')}</p>
          </div>
          <Link href="/viaje" className={buttonClass('ghost', 'sm')}>
            {t('openJourney')}
          </Link>
        </Card>
      </div>
    </>
  );
}
