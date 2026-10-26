import { getTranslations } from 'next-intl/server';
import { Badge, buttonClass, Card, Dot, inputClass, PageHeader } from '@/components/ui';
import { features } from '@/lib/env';
import { requireSession } from '@/lib/supabase/server';
import type { MessageTemplate, Profile } from '@/lib/types';
import { inviteMember, saveTemplate } from '../actions';

export const metadata = { title: 'Ajustes' };

export default async function SettingsPage() {
  const { db, profile } = await requireSession();
  const t = await getTranslations('settings');
  const [{ data: members }, { data: invites }, { data: templates }] = await Promise.all([
    db.from('profiles').select('*').order('created_at'),
    profile.role === 'owner' ? db.from('invitations').select('*').is('accepted_at', null) : Promise.resolve({ data: [] }),
    db.from('message_templates').select('*').order('kind'),
  ]);

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
        <Card className="p-4">
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

        <Card className="p-4">
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

        <Card className="p-4 lg:col-span-2">
          <h2 className="mb-1 font-medium">{t('templates')}</h2>
          <p className="mb-3 text-xs text-muted">{t('templatesHint')} · {'{guest_name} {check_in} {check_out} {check_in_time} {check_out_time} {property_name}'}</p>
          <div className="grid gap-3 md:grid-cols-2">
            {((templates ?? []) as MessageTemplate[]).map((tpl) => (
              <form key={tpl.id} action={saveTemplate} className="space-y-2 rounded-xl bg-sand/40 p-3">
                <input type="hidden" name="id" value={tpl.id} />
                <div className="flex items-center justify-between text-sm font-medium">
                  {t(`kind_${tpl.kind}`)}
                  {tpl.approved && <Badge tone="sage">{t('approved')}</Badge>}
                </div>
                <textarea name="body" defaultValue={tpl.body} rows={4} className={inputClass} />
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="approved" defaultChecked={tpl.approved} /> {t('approve')}
                  </label>
                  <button className={buttonClass('primary', 'sm')}>{t('save')}</button>
                </div>
              </form>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
