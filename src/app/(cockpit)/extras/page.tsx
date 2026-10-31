import { Check, Plus, Sparkles, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { Badge, buttonClass, Card, Empty, inputClass, PageHeader } from '@/components/ui';
import { todayIn } from '@/lib/concierge/stay';
import { requireSession } from '@/lib/supabase/server';
import { formatPrice, type UpsellItem } from '@/lib/upsells';
import { deleteUpsellItem, saveUpsellItem, seedUpsells, setOfferStatus } from '../actions';

export const metadata = { title: 'Extras' };

interface Offer {
  id: string;
  name: string;
  price: number;
  currency: string;
  status: 'offered' | 'accepted' | 'declined';
  conversation_id: number | null;
  created_at: string;
}

const TONE = { offered: 'gold', accepted: 'sage', declined: 'neutral' } as const;

export default async function ExtrasPage() {
  const { db } = await requireSession();
  const t = await getTranslations('extras');
  const lang = (await getLocale()) === 'en' ? 'en' : 'es';
  const [{ data: rows }, { data: offerRows }, { data: props }] = await Promise.all([
    db.from('upsell_items').select('*').order('name'),
    db.from('upsell_offers').select('*').order('created_at', { ascending: false }).limit(50),
    db.from('properties').select('id, name').order('name'),
  ]);
  const items = (rows ?? []) as UpsellItem[];
  const offers = (offerRows ?? []) as Offer[];
  const month = todayIn().slice(0, 7);
  const accepted = offers.filter((o) => o.status === 'accepted' && o.created_at.startsWith(month));
  const revenue = accepted.reduce((s, o) => s + Number(o.price), 0);

  const itemForm = (item?: UpsellItem) => (
    <form action={saveUpsellItem} className="grid gap-2 text-sm sm:grid-cols-[1fr_90px_1fr]">
      {item && <input type="hidden" name="id" value={item.id} />}
      <input name="name" defaultValue={item?.name} required maxLength={80} placeholder={t('namePh')} aria-label={t('name')} className={inputClass} />
      <input name="price" defaultValue={item ? Number(item.price) : ''} required inputMode="decimal" placeholder="€" aria-label={t('price')} className={inputClass} />
      <select name="property_id" defaultValue={item?.property_id ?? ''} aria-label={t('scope')} className={inputClass}>
        <option value="">{t('allProperties')}</option>
        {(props ?? []).map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      <input name="keywords" defaultValue={item?.keywords.join(', ')} placeholder={t('keywordsPh')} aria-label={t('keywords')} className={inputClass + ' sm:col-span-2'} />
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" name="active" defaultChecked={item?.active ?? true} /> {t('active')}
        </label>
        <button className={buttonClass('primary', 'sm')}>{item ? t('save') : <><Plus className="size-4" /> {t('add')}</>}</button>
      </div>
    </form>
  );

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          items.length === 0 ? (
            <form action={seedUpsells}>
              <button className={buttonClass('primary')}>
                <Sparkles className="size-4" /> {t('seed')}
              </button>
            </form>
          ) : null
        }
      />
      <p className="-mt-3 mb-5 text-xs text-muted">{t('how')}</p>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card data-anfi="catalog" className="space-y-4 p-4">
          <h2 className="font-medium">{t('catalog')}</h2>
          {items.length === 0 && <Empty title={t('empty')} />}
          {items.map((item) => (
            <div key={item.id} className="space-y-2 rounded-xl bg-sand/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium">
                  {item.name} · {formatPrice(Number(item.price), item.currency, lang)} {!item.active && <Badge>{t('paused')}</Badge>}
                </div>
                <form action={deleteUpsellItem}>
                  <input type="hidden" name="id" value={item.id} />
                  <button className="text-muted hover:text-terra-ink" aria-label={t('delete')}>
                    <Trash2 className="size-4" />
                  </button>
                </form>
              </div>
              <details>
                <summary className="cursor-pointer text-xs text-muted">{t('edit')}</summary>
                <div className="mt-2">{itemForm(item)}</div>
              </details>
            </div>
          ))}
          <div className="border-t border-line pt-4">
            <h3 className="mb-2 text-sm font-medium">{t('new')}</h3>
            {itemForm()}
          </div>
        </Card>

        <Card data-anfi="offers" className="h-fit space-y-3 p-4">
          <div>
            <h2 className="font-medium">{t('offers')}</h2>
            <p className="text-xs text-muted">{t('monthTotal', { n: accepted.length, total: formatPrice(revenue, 'EUR', lang) })}</p>
          </div>
          {offers.length === 0 && <p className="text-sm text-muted">{t('noOffers')}</p>}
          <ul className="divide-y divide-line text-sm">
            {offers.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2 py-2">
                <span>
                  {o.conversation_id ? <Link href={`/bandeja/${o.conversation_id}`} className="hover:underline">{o.name}</Link> : o.name}
                  <span className="text-muted"> · {formatPrice(Number(o.price), o.currency, lang)}</span>
                  <span className="block text-xs text-muted">{o.created_at.slice(0, 10)}</span>
                </span>
                {o.status === 'offered' ? (
                  <span className="flex gap-1">
                    {(['accepted', 'declined'] as const).map((s) => (
                      <form key={s} action={setOfferStatus}>
                        <input type="hidden" name="id" value={o.id} />
                        <input type="hidden" name="status" value={s} />
                        <button className={buttonClass('ghost', 'sm')} title={t(s)} aria-label={t(s)}>
                          {s === 'accepted' ? <Check className="size-4" /> : <X className="size-4" />}
                        </button>
                      </form>
                    ))}
                  </span>
                ) : (
                  <Badge tone={TONE[o.status]}>{t(o.status)}</Badge>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
