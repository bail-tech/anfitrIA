import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { Badge, Card, PageHeader } from '@/components/ui';
import { requireSession } from '@/lib/supabase/server';
import { relativeTime } from '@/lib/utils';

export const metadata = { title: 'Auditoría' };

export default async function AuditPage() {
  const { db } = await requireSession();
  const t = await getTranslations('audit');
  const locale = await getLocale();
  const [{ data: logs }, { data: people }] = await Promise.all([
    db.from('audit_logs').select('id, actor, actor_profile, action, detail, conversation_id, created_at').order('created_at', { ascending: false }).limit(200),
    db.from('profiles').select('id, name'),
  ]);
  const who = new Map((people ?? []).map((p) => [p.id, p.name]));
  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-xs text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">{t('when')}</th>
              <th className="px-4 py-2 font-medium">{t('actor')}</th>
              <th className="px-4 py-2 font-medium">{t('action')}</th>
              <th className="px-4 py-2 font-medium">{t('detail')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {(logs ?? []).map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-muted">{relativeTime(l.created_at, locale)}</td>
                <td className="px-4 py-2">
                  <Badge tone={l.actor === 'ai' ? 'violet' : 'gold'}>{l.actor === 'ai' ? 'IA' : (who.get(l.actor_profile) ?? 'Host')}</Badge>
                </td>
                <td className="px-4 py-2">
                  {l.conversation_id ? (
                    <Link href={`/bandeja/${l.conversation_id}`} className="underline-offset-2 hover:underline">
                      {l.action.replace(/_/g, ' ')}
                    </Link>
                  ) : (
                    l.action.replace(/_/g, ' ')
                  )}
                </td>
                <td className="max-w-md truncate px-4 py-2 text-xs text-muted">{l.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
