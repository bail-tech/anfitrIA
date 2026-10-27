import { Building2, ChevronRight, Home } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { KnowledgeList } from '@/components/cockpit/knowledge-list';
import { Badge, buttonClass, Card, Empty, inputClass, PageHeader } from '@/components/ui';
import { requireSession } from '@/lib/supabase/server';
import type { Building, KnowledgeItem, Property } from '@/lib/types';
import { createBuilding, createProperty } from '../actions';

export const metadata = { title: 'Alojamientos' };

export default async function PropertiesPage() {
  const { db } = await requireSession();
  const t = await getTranslations('properties');
  const [{ data: props }, { data: blds }, { data: knowledge }] = await Promise.all([
    db.from('properties').select('*').order('name'),
    db.from('buildings').select('*').order('name'),
    db.from('knowledge_items').select('id, property_id, building_id, category, content, is_private, created_at'),
  ]);
  const properties = (props ?? []) as Property[];
  const buildings = (blds ?? []) as Building[];
  const items = (knowledge ?? []) as KnowledgeItem[];
  const count = (pid: number) => items.filter((k) => k.property_id === pid).length;

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div data-anfi="list" className="space-y-3">
          {properties.length === 0 && <Empty title={t('missing')} />}
          {properties.map((p) => (
            <Link key={p.id} href={`/alojamientos/${p.id}`}>
              <Card className="flex items-center gap-4 p-4 transition-shadow hover:shadow-lg">
                <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand">
                  <Home className="size-5" />
                </span>
                <div className="flex-1">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-sm text-muted">{p.address ?? '—'}</div>
                </div>
                <Badge tone={count(p.id) ? 'sage' : 'terra'}>{t('knowledgeItems', { count: count(p.id) })}</Badge>
                <Badge tone={p.auto_answer ? 'violet' : 'neutral'}>{p.auto_answer ? 'auto' : 'manual'}</Badge>
                <ChevronRight className="size-4 text-muted" />
              </Card>
            </Link>
          ))}
        </div>
        <Card data-anfi="new" className="h-fit p-4">
          <h2 className="mb-3 font-medium">{t('new')}</h2>
          <form action={createProperty} className="space-y-2">
            <input name="name" required placeholder={t('name')} className={inputClass} />
            <input name="address" placeholder={t('address')} className={inputClass} />
            <select name="building_id" className={inputClass} defaultValue="">
              <option value="">{t('noBuilding')}</option>
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <button className={buttonClass('primary') + ' w-full'}>{t('create')}</button>
          </form>
        </Card>
      </div>

      <h2 data-anfi="buildings" className="mb-3 mt-8 flex items-center gap-2 font-display text-xl font-semibold">
        <Building2 className="size-5 text-brand" /> {t('buildings')}
      </h2>
      <div className="space-y-4">
        {buildings.map((b) => (
          <Card key={b.id} className="p-4">
            <div className="mb-2 font-medium">
              {b.name} <span className="text-sm font-normal text-muted">· {properties.filter((p) => p.building_id === b.id).map((p) => p.name).join(', ')}</span>
            </div>
            <KnowledgeList items={items.filter((k) => k.building_id === b.id)} target={{ buildingId: b.id }} back="/alojamientos" />
          </Card>
        ))}
        <form action={createBuilding} className="flex max-w-md gap-2">
          <input name="name" required placeholder={t('newBuilding')} className={inputClass} />
          <button className={buttonClass('ghost')}>{t('create')}</button>
        </form>
      </div>
    </>
  );
}
