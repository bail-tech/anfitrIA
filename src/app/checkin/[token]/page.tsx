import { CheckCircle2 } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { CheckinForm, type CheckinLabels } from '@/components/checkin/checkin-form';
import { countryOptions } from '@/lib/compliance/countries';
import { features } from '@/lib/env';
import { createAdminSupabase } from '@/lib/supabase/server';

export const metadata = { title: 'Registro de viajeros', robots: { index: false, follow: false } };

/** The guest's registration form, opened from the link Anfi sends. No account needed. */
export default async function CheckinPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ lang?: string }> }) {
  const token = (await params).token;
  if (!/^[0-9a-f]{36}$/.test(token) || !features.serviceRole()) notFound();
  const lang = (await searchParams).lang === 'en' ? 'en' : 'es';
  const t = await getTranslations({ locale: lang, namespace: 'checkin' });

  const db = createAdminSupabase();
  const { data: reg } = await db.from('guest_registrations').select('id, status, reservation_id').eq('token', token).maybeSingle();
  if (!reg) notFound();
  const { data: r } = await db.from('reservations').select('guest_name, check_in, check_out, guests, property_id').eq('id', reg.reservation_id).single();
  const { data: p } = await db.from('properties').select('name').eq('id', r!.property_id).single();
  const done = reg.status === 'ready' || reg.status === 'sent' || reg.status === 'accepted';
  const locked = reg.status === 'sent' || reg.status === 'accepted';

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Image src="/brand/anfitria-wordmark-480.webp" alt="AnfitrIA" width={480} height={178} className="h-auto w-36 mix-blend-multiply" priority />
        <Link href={`?lang=${lang === 'es' ? 'en' : 'es'}`} className="rounded-xl border border-line bg-paper px-2.5 py-1.5 text-xs font-medium uppercase">
          {lang === 'es' ? 'EN' : 'ES'}
        </Link>
      </div>
      <h1 className="font-display text-2xl font-semibold">{t('title')}</h1>
      <p className="mt-1 text-sm text-muted">
        {p?.name} · {r!.check_in} → {r!.check_out}
      </p>
      <p className="mt-4 rounded-2xl bg-brand-soft/60 px-4 py-3 text-sm text-brand-ink">{t('why')}</p>

      {locked ? (
        <p className="mt-6 flex items-center gap-2 rounded-2xl bg-sage-soft px-4 py-3 text-sm text-[#0b5e44]">
          <CheckCircle2 className="size-5" /> {t('filed')}
        </p>
      ) : (
        <>
          {done && <p className="mt-6 rounded-2xl bg-sage-soft px-4 py-3 text-sm text-[#0b5e44]">{t('alreadyDone')}</p>}
          <CheckinForm
            token={token}
            checkIn={r!.check_in}
            initialCount={Math.max(1, Math.min(r!.guests ?? 1, 20))}
            countries={countryOptions(lang)}
            labels={t.raw('form') as CheckinLabels}
          />
        </>
      )}
      <p className="mt-8 text-xs text-muted">{t('privacy')}</p>
    </main>
  );
}
