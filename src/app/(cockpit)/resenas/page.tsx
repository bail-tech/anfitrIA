import { RefreshCw, Star, Trash2 } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { CopyButton } from '@/components/cockpit/copy-button';
import { Badge, buttonClass, Card, Empty, inputClass, PageHeader } from '@/components/ui';
import { requireSession } from '@/lib/supabase/server';
import { addReview, deleteReview, redraftReview, saveReviewReply } from '../actions';

export const metadata = { title: 'Reseñas' };

interface Review {
  id: string;
  property_id: number;
  platform: string;
  rating: number | null;
  guest_name: string | null;
  text: string;
  reply: string | null;
  status: 'draft' | 'replied';
  created_at: string;
}

export default async function ReviewsPage() {
  const { db } = await requireSession();
  const t = await getTranslations('reviews');
  const [{ data: rows }, { data: props }] = await Promise.all([
    db.from('reviews').select('*').order('created_at', { ascending: false }).limit(50),
    db.from('properties').select('id, name').order('name'),
  ]);
  const reviews = (rows ?? []) as Review[];
  const pname = new Map((props ?? []).map((p) => [p.id, p.name]));

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card data-anfi="new" className="h-fit p-4">
          <h2 className="mb-3 font-medium">{t('new')}</h2>
          <form action={addReview} className="space-y-2 text-sm">
            <select name="property_id" required className={inputClass} aria-label={t('property')}>
              {(props ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <div className="grid grid-cols-3 gap-2">
              <select name="platform" className={inputClass} aria-label={t('platform')}>
                {['airbnb', 'booking', 'vrbo', 'google', 'other'].map((p) => (
                  <option key={p} value={p}>{t(`platform_${p}`)}</option>
                ))}
              </select>
              <select name="rating" defaultValue="5" className={inputClass} aria-label={t('rating')}>
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>{'★'.repeat(n)}</option>
                ))}
              </select>
              <input name="guest_name" placeholder={t('guestPh')} aria-label={t('guest')} className={inputClass} />
            </div>
            <textarea name="text" required rows={6} maxLength={5000} placeholder={t('textPh')} aria-label={t('text')} className={inputClass} />
            <button className={buttonClass('primary') + ' w-full'}>{t('draft')}</button>
          </form>
          <p className="mt-3 text-xs text-muted">{t('hint')}</p>
        </Card>

        <div data-anfi="list" className="space-y-3">
          {reviews.length === 0 && <Empty title={t('empty')} />}
          {reviews.map((r) => (
            <Card key={r.id} className="space-y-3 p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex text-brand">
                  {Array.from({ length: r.rating ?? 0 }, (_, i) => (
                    <Star key={i} className="size-3.5 fill-current" />
                  ))}
                </span>
                <span className="font-medium">{r.guest_name ?? t('anonymous')}</span>
                <span className="text-muted">· {pname.get(r.property_id)} · {t(`platform_${r.platform}`)} · {r.created_at.slice(0, 10)}</span>
                <Badge tone={r.status === 'replied' ? 'sage' : 'gold'}>{t(`status_${r.status}`)}</Badge>
              </div>
              <blockquote className="border-l-2 border-line pl-3 text-ink/80">{r.text}</blockquote>
              <form action={saveReviewReply} className="space-y-2">
                <input type="hidden" name="id" value={r.id} />
                <textarea id={`reply-${r.id}`} name="reply" defaultValue={r.reply ?? ''} rows={4} aria-label={t('reply')} className={inputClass} />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" name="replied" defaultChecked={r.status === 'replied'} /> {t('postedIt')}
                  </label>
                  <div className="flex gap-2">
                    <CopyButton targetId={`reply-${r.id}`} label={t('copy')} />
                    <button className={buttonClass('primary', 'sm')}>{t('save')}</button>
                  </div>
                </div>
              </form>
              <div className="flex gap-3 text-xs text-muted">
                <form action={redraftReview}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="flex items-center gap-1 hover:text-ink">
                    <RefreshCw className="size-3.5" /> {t('redraft')}
                  </button>
                </form>
                <form action={deleteReview}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="flex items-center gap-1 hover:text-terra-ink">
                    <Trash2 className="size-3.5" /> {t('delete')}
                  </button>
                </form>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
