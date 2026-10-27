'use client';

import { Loader2, Play, Settings2, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRef, useState, useTransition, type FormEvent } from 'react';
import { setLocale } from '@/app/(cockpit)/actions';
import { cn } from '@/lib/utils';
import { ASSISTANT_LANGUAGES, CUSTOM_VOICE_ID, LIVE_VOICES, TTS_VOICES, type AssistantLanguage } from '@/lib/voice/voices';

export interface AnfiPrefs {
  assistant_language: AssistantLanguage;
  voice: string;
  voice_custom_id: string | null;
}

/** Language names in their own language, so the host can find theirs whatever the panel shows. */
const NATIVE: Record<Exclude<AssistantLanguage, 'auto'>, string> = { es: 'Español', en: 'English', fr: 'Français', de: 'Deutsch', it: 'Italiano' };

const field = 'h-9 w-full rounded-xl border border-line bg-paper px-3 text-sm outline-none focus:border-gold';

/** The ⚙ pill in the dock header and its modal: Anfi's language, the panel language and Anfi's voice. */
export function AnfiSettings({ prefs, onSaved, voiceActive }: { prefs: AnfiPrefs; onSaved: (p: AnfiPrefs) => void; voiceActive: boolean }) {
  const t = useTranslations('assistant');
  const locale = useLocale();
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(prefs);
  const [panel, setPanel] = useState(locale);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, startSaving] = useTransition();

  function open() {
    setDraft(prefs);
    setPanel(locale);
    setError(null);
    dialog.current?.showModal();
  }

  const close = () => dialog.current?.close();

  function preview() {
    const lang = draft.assistant_language === 'auto' ? locale : draft.assistant_language;
    const audio = new Audio(`/api/voice/preview?voice=${draft.voice}&lang=${lang}`);
    setPreviewing(true);
    audio.addEventListener('ended', () => setPreviewing(false));
    audio.addEventListener('error', () => {
      setPreviewing(false);
      setError(t('settingsPreviewFailed'));
    });
    void audio.play().catch(() => setPreviewing(false));
  }

  function save(e: FormEvent) {
    e.preventDefault();
    const custom = draft.voice_custom_id?.trim() || null;
    if (custom && !CUSTOM_VOICE_ID.test(custom)) return setError(t('settingsCustomInvalid'));
    startSaving(async () => {
      const res = await fetch('/api/me/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, voice_custom_id: custom ?? '' }),
      });
      if (!res.ok) return setError(t('settingsSaveFailed'));
      const { preferences } = (await res.json()) as { preferences: AnfiPrefs };
      onSaved(preferences);
      if (panel !== locale) {
        const form = new FormData();
        form.set('locale', panel);
        await setLocale(form);
      }
      close();
    });
  }

  const canPreview = TTS_VOICES.includes(draft.voice as (typeof TTS_VOICES)[number]) && !draft.voice_custom_id?.trim();

  return (
    <>
      <button onClick={open} className="flex items-center gap-1 rounded-full bg-paper/80 px-2.5 py-1 text-xs font-medium backdrop-blur hover:bg-paper" aria-haspopup="dialog">
        <Settings2 className="size-3.5" /> {t('settings')}
      </button>
      <dialog
        ref={dialog}
        onClick={(e) => e.target === e.currentTarget && close()}
        className="m-auto w-[min(92vw,420px)] rounded-2xl border border-line bg-paper p-0 text-ink shadow-2xl backdrop:bg-ink/40"
        aria-labelledby="anfi-settings-title"
      >
        <form onSubmit={save} className="space-y-4 p-5 text-sm">
          <div className="flex items-center justify-between">
            <h2 id="anfi-settings-title" className="text-base font-semibold">{t('settingsTitle')}</h2>
            <button type="button" onClick={close} aria-label={t('close')} className="rounded-full p-1 hover:bg-sand">
              <X className="size-4" />
            </button>
          </div>

          <label className="block space-y-1">
            <span className="font-medium">{t('settingsAnfiLang')}</span>
            <select value={draft.assistant_language} onChange={(e) => setDraft({ ...draft, assistant_language: e.target.value as AssistantLanguage })} className={field}>
              {ASSISTANT_LANGUAGES.map((l) => (
                <option key={l} value={l}>{l === 'auto' ? t('settingsAuto') : NATIVE[l]}</option>
              ))}
            </select>
            <span className="block text-xs text-muted">{t('settingsAnfiLangHint')}</span>
          </label>

          <label className="block space-y-1">
            <span className="font-medium">{t('settingsPanelLang')}</span>
            <select value={panel} onChange={(e) => setPanel(e.target.value)} className={field}>
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
          </label>

          <div className="space-y-1">
            <label htmlFor="anfi-voice" className="font-medium">{t('settingsVoice')}</label>
            <div className="flex gap-2">
              <select id="anfi-voice" value={draft.voice} onChange={(e) => setDraft({ ...draft, voice: e.target.value })} className={field}>
                {LIVE_VOICES.map((v) => (
                  <option key={v} value={v}>{v[0].toUpperCase() + v.slice(1)}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={preview}
                disabled={!canPreview || previewing}
                title={canPreview ? t('settingsPreview') : t('settingsNoPreview')}
                aria-label={t('settingsPreview')}
                className="grid size-9 shrink-0 place-items-center rounded-xl border border-line hover:bg-sand disabled:opacity-40"
              >
                {previewing ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              </button>
            </div>
            {!canPreview && <span className="block text-xs text-muted">{t('settingsNoPreview')}</span>}
          </div>

          <label className="block space-y-1">
            <span className="font-medium">{t('settingsCustomVoice')}</span>
            <input
              value={draft.voice_custom_id ?? ''}
              onChange={(e) => setDraft({ ...draft, voice_custom_id: e.target.value })}
              placeholder="voice_…"
              className={cn(field, 'font-mono')}
              autoComplete="off"
              spellCheck={false}
            />
            <span className="block text-xs text-muted">{t('settingsCustomHint')}</span>
          </label>

          {voiceActive && <p className="rounded-xl bg-gold-soft/60 px-3 py-2 text-xs text-[#8a6418]">{t('settingsRestartNote')}</p>}
          {error && <p className="rounded-xl bg-terra-soft px-3 py-2 text-xs text-[#9a4220]" role="alert">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={close} className="rounded-xl border border-line px-3 py-2 hover:bg-sand">{t('settingsCancel')}</button>
            <button disabled={saving} className="flex items-center gap-2 rounded-xl bg-ink px-4 py-2 text-cream disabled:opacity-50">
              {saving && <Loader2 className="size-4 animate-spin" />} {t('settingsSave')}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
