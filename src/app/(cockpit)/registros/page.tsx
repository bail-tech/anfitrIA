import { FileDown, Link2, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Badge, buttonClass, Card, Empty, inputClass, PageHeader } from '@/components/ui';
import type { GuestRegistration } from '@/lib/compliance/registrations';
import { todayIn } from '@/lib/concierge/stay';
import { appUrl } from '@/lib/env';
import { requireSession } from '@/lib/supabase/server';
import type { Property, Reservation } from '@/lib/types';
import { createRegistration, refreshRegistrations, submitRegistrationAction } from '../actions';

export const metadata = { title: 'Registro de viajeros' };

const TONE = { pending: 'neutral', ready: 'gold', sent: 'violet', accepted: 'sage', error: 'terra', cancelled: 'neutral' } as const;

export default async function RegistrationsPage() {
  const { db } = await requireSession();
  const t = await getTranslations('registrations');
  const today = todayIn();
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - 2 * 86_400_000).toISOString().slice(0, 10);
  const [{ data: res }, { data: regs }, { data: props }, { data: ses }] = await Promise.all([
    db.from('reservations').select('*').neq('status', 'cancelled').gte('check_out', since).order('check_in').limit(100),
    db.from('guest_registrations').select('*'),
    db.from('properties').select('id, name, ses_establishment_code'),
    db.from('integrations').select('status, last_error').eq('provider', 'ses').maybeSingle<{ status: string; last_error: string | null }>(),
  ]);
  const { data: counts } = await db.from('travellers').select('registration_id');
  const travellers = new Map<string, number>();
  for (const c of counts ?? []) travellers.set(c.registration_id, (travellers.get(c.registration_id) ?? 0) + 1);
  const byReservation = new Map(((regs ?? []) as GuestRegistration[]).map((r) => [r.reservation_id, r]));
  const property = new Map(((props ?? []) as Pick<Property, 'id' | 'name' | 'ses_establishment_code'>[]).map((p) => [p.id, p]));
  const missingCodes = [...property.values()].filter((p) => !p.ses_establishment_code);
  const base = appUrl();

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <form action={refreshRegistrations}>
            <button className={buttonClass('ghost', 'sm')}>
              <RefreshCw className="size-4" /> {t('refresh')}
            </button>
          </form>
        }
      />

      <div data-anfi="setup" className="mb-4 space-y-2">
        {ses?.status !== 'connected' && (
          <p className="rounded-xl bg-terra-soft px-3 py-2 text-sm text-terra-ink">
            {ses?.status === 'error' ? t('sesError', { error: ses.last_error ?? '' }) : t('sesMissing')}{' '}
            <Link href="/ajustes#ses" className="underline">{t('configure')}</Link>
          </p>
        )}
        {missingCodes.length > 0 && (
          <p className="rounded-xl bg-sand px-3 py-2 text-sm text-muted">
            {t('missingCodes', { names: missingCodes.map((p) => p.name).join(', ') })}
          </p>
        )}
        {ses?.status === 'connected' && !missingCodes.length && (
          <p className="flex items-center gap-2 text-sm text-brand-ink">
            <ShieldCheck className="size-4" /> {t('allSet')}
          </p>
        )}
      </div>

      <Card data-anfi="list" className="divide-y divide-line">
        {!(res ?? []).length && <Empty title={t('empty')} />}
        {((res ?? []) as Reservation[]).map((r) => {
          const reg = byReservation.get(r.id);
          const overdue = reg && !['sent', 'accepted'].includes(reg.status) && r.check_in < today;
          const link = reg ? `${base}/checkin/${reg.token}` : null;
          return (
            <div key={r.id} className="grid gap-3 p-4 text-sm md:grid-cols-[1.2fr_1fr_1.6fr] md:items-center">
              <div>
                <div className="font-medium">{r.guest_name}</div>
                <div className="text-xs text-muted">
                  {property.get(r.property_id)?.name} · {r.check_in} → {r.check_out} · {t('guests', { n: r.guests ?? 1 })}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone={reg ? TONE[reg.status] : 'neutral'}>{t(`status_${reg?.status ?? 'none'}`)}</Badge>
                {reg && <span className="text-xs text-muted">{t('travellers', { n: travellers.get(reg.id) ?? 0 })}</span>}
                {overdue && <Badge tone="terra">{t('overdue')}</Badge>}
                {reg?.communication_code && <span className="font-mono text-[11px] text-muted">{reg.communication_code}</span>}
                {reg?.error && <p className="w-full text-xs text-terra-ink">{reg.error}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                {!reg ? (
                  <form action={createRegistration}>
                    <input type="hidden" name="reservation_id" value={r.id} />
                    <button className={buttonClass('ghost', 'sm')}>
                      <Link2 className="size-4" /> {t('createLink')}
                    </button>
                  </form>
                ) : (
                  <>
                    {!['sent', 'accepted'].includes(reg.status) && <input readOnly value={link!} aria-label={t('guestLink')} className={inputClass + ' h-8 max-w-56 py-1 font-mono text-[11px]'} />}
                    {(reg.status === 'ready' || reg.status === 'error') && (
                      <form action={submitRegistrationAction}>
                        <input type="hidden" name="id" value={reg.id} />
                        <button className={buttonClass('primary', 'sm')}>
                          <Send className="size-4" /> {t('file')}
                        </button>
                      </form>
                    )}
                    {(travellers.get(reg.id) ?? 0) > 0 && (
                      <a href={`/api/registrations/${reg.id}/xml`} className={buttonClass('ghost', 'sm')} title={t('xmlHint')}>
                        <FileDown className="size-4" /> XML
                      </a>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </Card>
      <p className="mt-3 text-xs text-muted">{t('footnote')}</p>
    </>
  );
}
