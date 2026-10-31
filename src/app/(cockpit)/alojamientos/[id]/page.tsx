import { ArrowLeft, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { KnowledgeList } from '@/components/cockpit/knowledge-list';
import { UploadForm } from '@/components/cockpit/upload-form';
import { buttonClass, Card, Empty, Field, inputClass, PageHeader } from '@/components/ui';
import { requireSession } from '@/lib/supabase/server';
import type { Building, KnowledgeItem, Property } from '@/lib/types';
import { deleteProperty, learnForProperty, updateProperty } from '../../actions';

export const metadata = { title: 'Alojamiento' };

export default async function PropertyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ learn?: string }> }) {
  const { db, profile } = await requireSession();
  const t = await getTranslations('properties');
  const id = Number((await params).id);
  const { data: p } = await db.from('properties').select('*').eq('id', id).maybeSingle<Property>();
  if (!p) notFound();
  const [{ data: own }, { data: shared }, { data: blds }] = await Promise.all([
    db.from('knowledge_items').select('*').eq('property_id', id).order('category'),
    p.building_id ? db.from('knowledge_items').select('*').eq('building_id', p.building_id).order('category') : Promise.resolve({ data: [] }),
    db.from('buildings').select('id, name'),
  ]);
  const items = (own ?? []) as KnowledgeItem[];
  const back = `/alojamientos/${id}`;
  const learn = (await searchParams).learn;

  return (
    <>
      <Link href="/alojamientos" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> {t('title')}
      </Link>
      <PageHeader title={p.name} subtitle={p.address ?? undefined} />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card data-anfi="knowledge" className="p-4">
          <h2 className="mb-3 font-medium">{t('knowledge')}</h2>
          {items.length === 0 && !(shared ?? []).length && <Empty title={t('missing')} />}
          <KnowledgeList items={items} shared={(shared ?? []) as KnowledgeItem[]} target={{ propertyId: id }} back={back} />
          <div className="mt-4 border-t border-line pt-4">
            <form action={learnForProperty} className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-brand-soft/50 p-3">
              <input type="hidden" name="id" value={id} />
              <p className="text-xs text-brand-ink">{t('learnHint')}</p>
              <button className={buttonClass('gold', 'sm')}>
                <Sparkles className="size-4" /> {t('learn')}
              </button>
            </form>
            {learn && (
              <p className={`mb-3 rounded-xl px-3 py-2 text-xs ${learn.startsWith('ok') ? 'bg-sage-soft text-[#0b5e44]' : 'bg-sand text-muted'}`} role="status">
                {learn.startsWith('ok') ? t.rich('learn_ok', { link: (c) => <Link href="/agentes" className="underline">{c}</Link> }) : t(`learn_${learn as 'error'}`)}
              </p>
            )}
            <p className="mb-2 text-xs text-muted">{t('importHint')}</p>
            <UploadForm action="/api/knowledge/import" fields={{ property_id: String(id) }} accept=".csv,.pdf,text/csv,application/pdf" label={t('import')} />
          </div>
        </Card>
        <Card data-anfi="settings" className="h-fit p-4">
          <h2 className="mb-3 font-medium">{t('settings')}</h2>
          <form action={updateProperty} className="space-y-3">
            <input type="hidden" name="id" value={p.id} />
            <Field label={t('name')}>
              <input name="name" defaultValue={p.name} required className={inputClass} />
            </Field>
            <Field label={t('address')}>
              <input name="address" defaultValue={p.address ?? ''} className={inputClass} />
            </Field>
            <Field label={t('building')}>
              <select name="building_id" defaultValue={p.building_id ?? ''} className={inputClass}>
                <option value="">{t('noBuilding')}</option>
                {((blds ?? []) as Building[]).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="auto_answer" defaultChecked={p.auto_answer} /> {t('autoAnswer')}
            </label>
            <Field label={t('threshold')} hint="0.55 por defecto · más alto = escala más">
              <input name="auto_answer_threshold" type="number" step="0.05" min="0.05" max="0.99" defaultValue={p.auto_answer_threshold ?? ''} placeholder="0.55" className={inputClass} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label={t('checkIn')}>
                <input name="check_in_time" type="time" defaultValue={p.check_in_time.slice(0, 5)} className={inputClass} />
              </Field>
              <Field label={t('checkOut')}>
                <input name="check_out_time" type="time" defaultValue={p.check_out_time.slice(0, 5)} className={inputClass} />
              </Field>
            </div>
            <Field label={t('cleaning')}>
              <input name="cleaning_minutes" type="number" min="30" step="15" defaultValue={p.cleaning_minutes} className={inputClass} />
            </Field>
            <Field label={t('language')}>
              <select name="default_language" defaultValue={p.default_language} className={inputClass}>
                {['es', 'en', 'fr', 'de', 'it'].map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('whatsappNumber')}>
              <input name="whatsapp_phone_number_id" defaultValue={p.whatsapp_phone_number_id ?? ''} className={inputClass} />
            </Field>
            <Field label={t('sesCode')} hint={t('sesCodeHint')}>
              <input name="ses_establishment_code" defaultValue={p.ses_establishment_code ?? ''} maxLength={10} pattern="[A-Za-z0-9]{1,10}" className={inputClass} />
            </Field>
            <button className={buttonClass('primary') + ' w-full'}>{t('save')}</button>
          </form>
          {profile.role === 'owner' && (
            <form action={deleteProperty} className="mt-3">
              <input type="hidden" name="id" value={p.id} />
              <button className={buttonClass('danger', 'sm') + ' w-full'}>{t('delete')}</button>
            </form>
          )}
        </Card>
      </div>
    </>
  );
}
