import { getTranslations } from 'next-intl/server';
import { Simulator } from '@/components/cockpit/simulator';
import { Empty, PageHeader } from '@/components/ui';
import { requireSession } from '@/lib/supabase/server';

export const metadata = { title: 'Simulador' };

export default async function SimulatorPage() {
  const { db } = await requireSession();
  const t = await getTranslations('simulator');
  const [{ data: props }, { data: res }] = await Promise.all([
    db.from('properties').select('id, name').order('name'),
    db.from('reservations').select('property_id, guest_ref, guest_name').neq('status', 'cancelled'),
  ]);
  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <div data-anfi="chat">{props?.length ? <Simulator properties={props} guests={res ?? []} /> : <Empty title="—" />}</div>
    </>
  );
}
