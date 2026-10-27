import { Lock, Trash2 } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { addKnowledgeItem, deleteKnowledgeItem } from '@/app/(cockpit)/actions';
import { Badge, buttonClass, inputClass } from '@/components/ui';
import type { KnowledgeItem } from '@/lib/types';

/** Knowledge items with inline add/delete; private items never show their value in lists. */
export async function KnowledgeList({ items, target, back, shared }: { items: KnowledgeItem[]; target: { propertyId?: number; buildingId?: number }; back: string; shared?: KnowledgeItem[] }) {
  const t = await getTranslations('properties');
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-line">
        {items.map((k) => (
          <li key={k.id} className="flex items-start gap-3 py-2 text-sm">
            <Badge tone={k.is_private ? 'terra' : 'gold'}>
              {k.is_private && <Lock className="size-3" />}
              {k.category}
            </Badge>
            <span className="flex-1">{k.is_private ? '•••• (privado)' : k.content}</span>
            <form action={deleteKnowledgeItem}>
              <input type="hidden" name="id" value={k.id} />
              <input type="hidden" name="back" value={back} />
              <button className="text-muted hover:text-terra" aria-label={t('delete')}>
                <Trash2 className="size-4" />
              </button>
            </form>
          </li>
        ))}
        {shared?.map((k) => (
          <li key={`b${k.id}`} className="flex items-start gap-3 py-2 text-sm opacity-80">
            <Badge tone="sage">{k.category}</Badge>
            <span className="flex-1">{k.is_private ? '•••• (privado)' : k.content}</span>
            <span className="text-xs text-muted">{t('shared')}</span>
          </li>
        ))}
      </ul>
      <form action={addKnowledgeItem} data-anfi-form="knowledge" className="grid gap-2 rounded-xl bg-sand/40 p-3 md:grid-cols-[140px_1fr_auto]">
        {target.propertyId && <input type="hidden" name="property_id" value={target.propertyId} />}
        {target.buildingId && <input type="hidden" name="building_id" value={target.buildingId} />}
        <input type="hidden" name="back" value={back} />
        <input name="category" placeholder={t('category')} className={inputClass} />
        <input name="content" required placeholder={t('content')} className={inputClass} />
        <button className={buttonClass('primary')}>{t('addItem')}</button>
        <label className="flex items-center gap-2 text-xs text-muted md:col-span-3">
          <input type="checkbox" name="is_private" /> {t('private')} — {t('privateHint')}
        </label>
      </form>
    </div>
  );
}
