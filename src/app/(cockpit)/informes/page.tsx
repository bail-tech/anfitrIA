import { getLocale, getTranslations } from 'next-intl/server';
import { PrintButton } from '@/components/cockpit/print-button';
import { buttonClass, Card, Empty, inputClass, PageHeader } from '@/components/ui';
import { todayIn } from '@/lib/concierge/stay';
import { monthRange, ownerStatement } from '@/lib/reports';
import { requireSession } from '@/lib/supabase/server';
import type { Property, Reservation } from '@/lib/types';
import { eur, pct } from '@/lib/utils';

export const metadata = { title: 'Informes' };

type Search = { property?: string; month?: string; fee?: string; cleaning?: string };

/** The last complete month: statements go out once a month is closed. */
function lastMonth(today: string): string {
  const [y, m] = today.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { db } = await requireSession();
  const t = await getTranslations('reports');
  const loc = (await getLocale()) === 'en' ? 'en-GB' : 'es-ES';
  const q = await searchParams;
  const { data: props } = await db.from('properties').select('*').order('name');
  const properties = (props ?? []) as Property[];
  const property = properties.find((p) => String(p.id) === q.property) ?? properties[0];
  const month = /^\d{4}-\d{2}$/.test(q.month ?? '') ? q.month! : lastMonth(todayIn());
  const fee = Math.min(Math.max(Number(q.fee) || 0, 0), 60);
  const cleaning = Math.min(Math.max(Number(q.cleaning) || 0, 0), 1000);

  if (!property) return (<><PageHeader title={t('title')} subtitle={t('subtitle')} /><Empty title={t('noProperties')} /></>);

  const { prevFrom, to } = monthRange(month);
  const { data: res } = await db.from('reservations').select('*').eq('property_id', property.id).lt('check_in', to).gt('check_out', prevFrom);
  const s = ownerStatement((res ?? []) as Reservation[], month, { managementFeePct: fee, cleaningCost: cleaning });
  const monthName = new Intl.DateTimeFormat(loc, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));
  const change = (now: number, before: number) => (before ? `${now >= before ? '+' : ''}${Math.round(((now - before) / before) * 100)} %` : '—');

  return (
    <>
      <div className="print:hidden">
        <PageHeader title={t('title')} subtitle={t('subtitle')} actions={<PrintButton label={t('print')} />} />
        <form data-anfi="filters" className="mb-5 grid gap-2 sm:grid-cols-[1fr_160px_120px_140px_auto]">
          <select name="property" defaultValue={property.id} className={inputClass} aria-label={t('property')}>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <input name="month" type="month" defaultValue={month} className={inputClass} aria-label={t('month')} />
          <input name="fee" type="number" min="0" max="60" step="0.5" defaultValue={fee || ''} placeholder={t('feePh')} className={inputClass} aria-label={t('fee')} />
          <input name="cleaning" type="number" min="0" step="1" defaultValue={cleaning || ''} placeholder={t('cleaningPh')} className={inputClass} aria-label={t('cleaning')} />
          <button className={buttonClass('primary')}>{t('show')}</button>
        </form>
      </div>

      <Card data-anfi="statement" className="space-y-5 p-6 print:border-0 print:shadow-none">
        <header className="flex flex-wrap items-end justify-between gap-2 border-b border-line pb-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted">{t('statement')}</div>
            <h2 className="font-display text-2xl font-semibold">{property.name}</h2>
            <div className="text-sm text-muted">{property.address}</div>
          </div>
          <div className="text-right text-lg font-medium capitalize">{monthName}</div>
        </header>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            [t('gross'), eur(s.gross, loc), change(s.stats.revenue, s.previous.revenue)],
            [t('occupancy'), pct(s.stats.occupancy), change(s.stats.occupancy, s.previous.occupancy)],
            [t('adr'), s.stats.nights ? eur(s.stats.adr, loc) : '—', change(s.stats.adr, s.previous.adr)],
            [t('nights'), String(s.stats.nights), change(s.stats.nights, s.previous.nights)],
          ].map(([label, value, delta]) => (
            <div key={label} className="rounded-xl bg-sand/50 p-3">
              <div className="text-xs text-muted">{label}</div>
              <div className="text-xl font-semibold">{value}</div>
              <div className="text-xs text-muted">{t('vsPrevious', { delta })}</div>
            </div>
          ))}
        </div>

        {s.lines.length ? (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-1.5 font-medium">{t('guest')}</th>
                <th className="font-medium">{t('dates')}</th>
                <th className="font-medium">{t('channel')}</th>
                <th className="text-right font-medium">{t('nightsInMonth')}</th>
                <th className="text-right font-medium">{t('revenue')}</th>
                <th className="text-right font-medium">{t('channelFee')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {s.lines.map((l) => (
                <tr key={l.reservation_id}>
                  <td className="py-1.5">{l.guest}</td>
                  <td className="font-mono text-xs">{l.check_in} → {l.check_out}</td>
                  <td className="capitalize">{l.source}</td>
                  <td className="text-right">{l.nights}</td>
                  <td className="text-right">{eur(l.revenue, loc)}</td>
                  <td className="text-right text-muted">{l.channel_fee ? `−${eur(l.channel_fee, loc)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty title={t('noBookings')} />
        )}

        <dl className="ml-auto max-w-sm space-y-1.5 border-t border-line pt-4 text-sm">
          {[
            [t('gross'), eur(s.gross, loc)],
            [t('channelFees'), `−${eur(s.channel_fees, loc)}`],
            [t('managementFee', { pct: fee }), `−${eur(s.management_fee, loc)}`],
            [t('cleanings', { n: s.cleanings }), `−${eur(s.cleaning_cost, loc)}`],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4">
              <dt className="text-muted">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-4 border-t border-line pt-2 text-base font-semibold">
            <dt>{t('net')}</dt>
            <dd>{eur(s.net, loc)}</dd>
          </div>
        </dl>
        <p className="text-xs text-muted">{t('footnote')}</p>
      </Card>
    </>
  );
}
