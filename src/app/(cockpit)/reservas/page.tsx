import { getLocale, getTranslations } from 'next-intl/server';
import { UploadForm } from '@/components/cockpit/upload-form';
import { Badge, buttonClass, Card, Empty, Field, inputClass, PageHeader } from '@/components/ui';
import { stayPhase, todayIn } from '@/lib/concierge/stay';
import { requireSession } from '@/lib/supabase/server';
import type { Property, Reservation } from '@/lib/types';
import { eur } from '@/lib/utils';
import { cancelReservation, createReservation } from '../actions';

export const metadata = { title: 'Reservas' };

const SOURCE_TONE = { booking: 'violet', airbnb: 'terra', direct: 'sage', other: 'neutral' } as const;
const PHASE_TONE = { pre_llegada: 'gold', durante: 'sage', pasada: 'neutral' } as const;

export default async function ReservationsPage() {
  const { db } = await requireSession();
  const t = await getTranslations('reservations');
  const locale = await getLocale();
  const [{ data: res }, { data: props }] = await Promise.all([db.from('reservations').select('*').neq('status', 'cancelled').order('check_in', { ascending: false }), db.from('properties').select('id, name').order('name')]);
  const reservations = (res ?? []) as Reservation[];
  const properties = (props ?? []) as Pick<Property, 'id' | 'name'>[];
  const pname = new Map(properties.map((p) => [p.id, p.name]));
  const today = todayIn();

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card data-anfi="list" className="overflow-x-auto">
          {reservations.length === 0 ? (
            <div className="p-4">
              <Empty title={t('empty')} />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">{t('guest')}</th>
                  <th className="px-4 py-2 font-medium">{t('dates')}</th>
                  <th className="px-4 py-2 font-medium">{t('source')}</th>
                  <th className="px-4 py-2 font-medium">{t('phase')}</th>
                  <th className="px-4 py-2 text-right font-medium">{t('amount')}</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {reservations.map((r) => {
                  const phase = stayPhase(r.check_in, r.check_out, today);
                  return (
                    <tr key={r.id}>
                      <td className="px-4 py-2">
                        <div className="font-medium">{r.guest_name}</div>
                        <div className="text-xs text-muted">
                          {pname.get(r.property_id)} · {r.guests ?? '—'} 👤
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">
                        {r.check_in} → {r.check_out}
                      </td>
                      <td className="px-4 py-2">
                        <Badge tone={SOURCE_TONE[r.source] ?? 'neutral'}>{r.source}</Badge>
                      </td>
                      <td className="px-4 py-2">
                        <Badge tone={PHASE_TONE[phase]}>{t(`phase_${phase}`)}</Badge>
                      </td>
                      <td className="px-4 py-2 text-right">{r.total_amount !== null ? eur(Number(r.total_amount), locale === 'en' ? 'en-GB' : 'es-ES') : '—'}</td>
                      <td className="px-2 py-2">
                        <form action={cancelReservation}>
                          <input type="hidden" name="id" value={r.id} />
                          <button className="text-xs text-muted hover:text-terra">✕</button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
        <div className="space-y-4">
          <Card data-anfi="new" className="p-4">
            <h2 className="mb-3 font-medium">{t('new')}</h2>
            <form action={createReservation} data-anfi-form="reservation" className="space-y-2">
              <Field label={t('property')}>
                <select name="property_id" required className={inputClass}>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
              <input name="guest_name" required placeholder={t('guest')} className={inputClass} />
              <input name="guest_ref" placeholder={t('phone')} className={inputClass} />
              <div className="grid grid-cols-2 gap-2">
                <Field label={t('checkIn')}>
                  <input name="check_in" type="date" required className={inputClass} />
                </Field>
                <Field label={t('checkOut')}>
                  <input name="check_out" type="date" required className={inputClass} />
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <select name="source" className={inputClass}>
                  {['direct', 'booking', 'airbnb', 'other'].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                <input name="guests" type="number" min="1" placeholder={t('guests')} className={inputClass} />
                <input name="nightly_rate" type="number" min="0" step="1" placeholder="€/noche" className={inputClass} />
              </div>
              <label className="flex items-center gap-2 text-xs text-muted">
                <input type="checkbox" name="consent" /> {t('consent')}
              </label>
              <button className={buttonClass('primary') + ' w-full'}>{t('create')}</button>
            </form>
          </Card>
          <Card data-anfi="ical" className="p-4">
            <h2 className="mb-1 font-medium">{t('ical')}</h2>
            <p className="mb-3 text-xs text-muted">{t('icalHint')}</p>
            {properties[0] && <IcalPicker properties={properties} label={t('import')} />}
          </Card>
        </div>
      </div>
    </>
  );
}

function IcalPicker({ properties, label }: { properties: Pick<Property, 'id' | 'name'>[]; label: string }) {
  return (
    <div className="space-y-3">
      {properties.map((p) => (
        <div key={p.id}>
          <div className="mb-1 text-xs font-medium">{p.name}</div>
          <UploadForm action="/api/reservations/ical" fields={{ property_id: String(p.id) }} accept=".ics,text/calendar" label={label} withUrl urlPlaceholder="https://www.airbnb.com/calendar/ical/…" />
        </div>
      ))}
    </div>
  );
}
