import { CalendarClock, Plus, Sparkles, Trash2 } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Badge, buttonClass, Card, Empty, inputClass, PageHeader } from '@/components/ui';
import { anchorOf, offsetOf } from '@/lib/agents/lifecycle';
import { STAGES, stageOf, type Stage } from '@/lib/agents/journey-defaults';
import { requireSession } from '@/lib/supabase/server';
import type { MessageTemplate } from '@/lib/types';
import { deleteTemplate, saveTemplate, seedJourney } from '../actions';

export const metadata = { title: 'Viaje del huésped' };

const PLACEHOLDERS = '{guest_name} {property_name} {check_in} {check_out} {check_in_time} {check_out_time} {checkin_link}';

export default async function JourneyPage() {
  const { db } = await requireSession();
  const t = await getTranslations('journey');
  const [{ data: rows }, { data: props }] = await Promise.all([
    db.from('message_templates').select('*').neq('kind', 'saved_reply').order('send_offset_hours'),
    db.from('properties').select('id, name').order('name'),
  ]);
  const templates = (rows ?? []) as MessageTemplate[];
  const byStage = new Map<Stage, MessageTemplate[]>(STAGES.map((s) => [s, []]));
  for (const tpl of templates) byStage.get(stageOf(anchorOf(tpl), offsetOf(tpl)))!.push(tpl);

  const when = (tpl: MessageTemplate) => {
    const h = offsetOf(tpl);
    const anchor = t(`anchor_${anchorOf(tpl)}`);
    if (h === 0) return t('atAnchor', { anchor });
    return t(h < 0 ? 'before' : 'after', { hours: Math.abs(h), anchor });
  };

  const templateForm = (tpl?: MessageTemplate) => (
    <form action={saveTemplate} data-anfi-form={tpl ? undefined : 'journey'} className="space-y-2 text-sm">
      {tpl && <input type="hidden" name="id" value={tpl.id} />}
      {tpl && <input type="hidden" name="kind" value={tpl.kind} />}
      <input name="title" defaultValue={tpl?.title} placeholder={t('titlePh')} className={inputClass} />
      <textarea name="body" defaultValue={tpl?.body} rows={4} required placeholder={t('bodyPh')} className={inputClass} />
      <div className="grid grid-cols-[80px_1fr] gap-2">
        <input name="offset" type="number" step="1" defaultValue={tpl ? offsetOf(tpl) : -24} aria-label={t('offset')} className={inputClass} />
        <select name="anchor" defaultValue={tpl ? anchorOf(tpl) : 'check_in'} className={inputClass} aria-label={t('anchor')}>
          <option value="booking">{t('h_from_booking')}</option>
          <option value="check_in">{t('h_from_check_in')}</option>
          <option value="check_out">{t('h_from_check_out')}</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select name="property_id" defaultValue={tpl?.property_id ?? ''} className={inputClass} aria-label={t('scope')}>
          <option value="">{t('allProperties')}</option>
          {(props ?? []).map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <input name="min_nights" type="number" min="1" defaultValue={tpl?.min_nights ?? ''} placeholder={t('minNights')} className={inputClass} />
      </div>
      <label className="flex items-center gap-2 text-xs text-muted">
        <input type="checkbox" name="positive_only" defaultChecked={tpl?.positive_only} /> {t('positiveOnly')}
      </label>
      <label className="flex items-center gap-2 text-xs text-muted">
        <input type="checkbox" name="as_voice" defaultChecked={tpl?.as_voice} /> {t('asVoice')}
      </label>
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 font-medium">
          <input type="checkbox" name="approved" defaultChecked={tpl?.approved} /> {t('approve')}
        </label>
        <button className={buttonClass('primary', 'sm')}>{tpl ? t('save') : t('add')}</button>
      </div>
    </form>
  );

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          templates.length === 0 ? (
            <form action={seedJourney}>
              <button className={buttonClass('primary')}>
                <Sparkles className="size-4" /> {t('seed')}
              </button>
            </form>
          ) : null
        }
      />
      <p className="-mt-3 mb-5 text-xs text-muted">{t('hint')} · <span className="font-mono">{PLACEHOLDERS}</span></p>

      {templates.length === 0 && <Empty title={t('empty')}>{t('emptyHint')}</Empty>}

      <div data-anfi="board" className="grid gap-3 overflow-x-auto pb-2 md:grid-cols-5">
        {STAGES.map((stage) => (
          <section key={stage} className="min-w-64 space-y-3">
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-ink">
              <CalendarClock className="size-3.5" /> {t(`stage_${stage}`)}
            </h2>
            {byStage.get(stage)!.map((tpl) => (
              <Card key={tpl.id} className="space-y-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">{tpl.title || t(`stage_${stage}`)}</div>
                    <div className="text-xs text-muted">{when(tpl)}</div>
                  </div>
                  <Badge tone={tpl.approved ? 'sage' : 'neutral'}>{tpl.approved ? t('on') : t('off')}</Badge>
                </div>
                <div className="flex flex-wrap gap-1">
                  {tpl.min_nights && <Badge>{t('nightsBadge', { n: tpl.min_nights })}</Badge>}
                  {tpl.positive_only && <Badge tone="gold">{t('positiveBadge')}</Badge>}
                  {tpl.as_voice && <Badge tone="violet">{t('voiceBadge')}</Badge>}
                </div>
                <details>
                  <summary className="cursor-pointer text-xs text-muted hover:text-ink">{t('edit')}</summary>
                  <div className="mt-2 space-y-2">
                    {templateForm(tpl)}
                    <form action={deleteTemplate}>
                      <input type="hidden" name="id" value={tpl.id} />
                      <button className={buttonClass('ghost', 'sm') + ' text-terra-ink'}>
                        <Trash2 className="size-3.5" /> {t('delete')}
                      </button>
                    </form>
                  </div>
                </details>
              </Card>
            ))}
          </section>
        ))}
      </div>

      <Card data-anfi="new" className="mt-6 max-w-xl p-4">
        <h2 className="mb-3 flex items-center gap-2 font-medium">
          <Plus className="size-4" /> {t('new')}
        </h2>
        {templateForm()}
      </Card>
    </>
  );
}
