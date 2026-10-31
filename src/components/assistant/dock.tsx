'use client';

import { Bot, CircleAlert, Loader2, MessageCircle, Mic, MicOff, Send, Wrench, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { BlemiStage } from '@/components/blemi/blemi-stage';
import { useScreenSignals } from '@/components/blemi/use-screen-signals';
import { CharacterStage } from '@/components/character/stage';
import type { Mood } from '@/components/character/face';
import { cn } from '@/lib/utils';
import { ProposalCard } from './proposal-card';
import { appTour } from '@/lib/assistant/app-tour';
import { ASK_EVENT } from './ask-anfi';
import { APP_TOUR_EVENT } from './welcome-tour';
import { AnfiSettings, type AnfiPrefs } from './settings';
import { Spotlight } from './spotlight';
import { useAnfiUi } from './use-anfi-ui';
import { useAssistant, type AssistantState } from './use-assistant';
import { useVoice } from './use-voice';

/** Blemi (rigged GLB from Blemia, pixel screens) by default; NEXT_PUBLIC_CHARACTER=anfi for the procedural house. */
const CHARACTER = process.env.NEXT_PUBLIC_CHARACTER === 'anfi' ? 'anfi' : 'blemi';

const DOT: Record<AssistantState, string> = {
  idle: 'bg-muted/40',
  thinking: 'bg-sage animate-pulse-dot',
  working: 'bg-sage animate-pulse-dot',
  approval: 'bg-brand',
  done: 'bg-sage',
  error: 'bg-terra',
};

/** The last "Ask Anfi" press handled, so remounting the dock (mobile sheet) doesn't act on it twice. */
let handledAsk = 0;
let handledTour = 0;

function DockBody({ onClose, onMinimize, prefs: initialPrefs, ask = 0, tour = 0, hostName }: { onClose?: () => void; onMinimize?: () => void; prefs: AnfiPrefs; ask?: number; tour?: number; hostName: string }) {
  const t = useTranslations('assistant');
  const locale = useLocale();
  const say = useRef<(text: string) => void>(() => undefined);
  const narrate = useCallback((text: string) => say.current(text), []);
  // Tour narration without a live call: Anfi reads each stop aloud in the host's chosen voice.
  const narration = useRef<{ audio: HTMLAudioElement | null; abort: AbortController | null }>({ audio: null, abort: null });
  const stopNarration = useCallback(() => {
    narration.current.abort?.abort();
    narration.current.audio?.pause();
    narration.current = { audio: null, abort: null };
  }, []);
  const readAloud = useCallback(
    (text: string) => {
      stopNarration();
      const abort = new AbortController();
      narration.current.abort = abort;
      fetch('/api/voice/say', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, lang: locale === 'en' ? 'en' : 'es' }), signal: abort.signal })
        .then((res) => (res.ok ? res.blob() : null))
        .then((blob) => {
          if (!blob || abort.signal.aborted) return;
          const audio = new Audio(URL.createObjectURL(blob));
          narration.current.audio = audio;
          void audio.play().catch(() => undefined);
        })
        .catch(() => undefined);
    },
    [locale, stopNarration],
  );
  const ui = useAnfiUi({ onNarrate: narrate, onStopNarration: stopNarration, onMinimize, prefilledLabel: t('prefilled') });
  const assistant = useAssistant(t('welcome'), locale, ui.run);
  const voice = useVoice({ assistant, locale, intercept: ui.command });
  useEffect(() => {
    // In a live call Anfi narrates through the call; otherwise it reads aloud (when voice is set up).
    say.current = voice.active ? voice.say : voice.supported ? readAloud : () => undefined;
  });

  useEffect(() => stopNarration, [stopNarration]);

  // "Ask Anfi" from a page header: start talking (or type when voice isn't available).
  useEffect(() => {
    if (!ask || ask === handledAsk) return;
    handledAsk = ask;
    if (voice.supported && !voice.active) voice.toggle();
    else input.current?.focus();
  }, [ask, voice]);

  // The welcome tour (after sign-up, or "Hazme el tour"): the whole app, page by page.
  useEffect(() => {
    if (!tour || tour === handledTour) return;
    handledTour = tour;
    const { title, steps } = appTour(locale, hostName);
    ui.run({ kind: 'tour', path: '/', title, steps });
  }, [tour, ui, locale, hostName]);
  const signals = useScreenSignals(assistant, voice);
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const [prefs, setPrefs] = useState(initialPrefs);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' });
  }, [assistant.items.length]);

  const mood: Mood =
    assistant.state === 'working' ? 'working'
    : assistant.state === 'thinking' ? 'thinking'
    : assistant.state === 'approval' ? 'approval'
    : assistant.state === 'error' ? 'error'
    : voice.active ? 'listening'
    : assistant.state === 'done' ? 'done'
    : 'idle';

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!ui.command(text)) void assistant.send(text);
    setText('');
  }

  const stateLabel = voice.active && assistant.state === 'idle' ? t('state_listening') : t(`state_${assistant.state === 'done' ? 'idle' : assistant.state}`);

  return (
    <div className="flex h-full flex-col">
      <Spotlight ui={ui} />
      <div className="relative shrink-0 border-b border-line bg-gradient-to-b from-sand/60 to-paper">
        {CHARACTER === 'anfi' ? (
          <CharacterStage mood={mood} levels={voice.levels} className="mx-auto h-44 w-full max-w-[280px]" />
        ) : (
          <BlemiStage label="Blemi" mode="assembled" focus="blemi" signals={signals} className="relative mx-auto h-52 w-full" />
        )}
        <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-paper/80 px-2.5 py-1 text-xs backdrop-blur">
          <span className={cn('size-2 rounded-full', DOT[assistant.state])} />
          <span className="font-medium">{t('title')}</span>
          <span className="text-muted">· {stateLabel}</span>
        </div>
        <div className="absolute right-3 top-3 flex items-center gap-1.5">
          <AnfiSettings
            prefs={prefs}
            voiceActive={voice.active}
            onSaved={(next) => {
              const changed = next.voice !== prefs.voice || next.voice_custom_id !== prefs.voice_custom_id || next.assistant_language !== prefs.assistant_language;
              setPrefs(next);
              if (changed) voice.restart();
            }}
          />
          {onClose && (
            <button onClick={onClose} aria-label={t('close')} className="rounded-full bg-paper/80 p-1.5">
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      <div ref={list} className="flex-1 space-y-3 overflow-y-auto px-3 py-3 text-sm" aria-live="polite">
        {assistant.items.map((item) => {
          if (item.kind === 'user') return <div key={item.id} className="ml-8 rounded-2xl rounded-br-md bg-ink px-3 py-2 text-cream">{item.text}</div>;
          if (item.kind === 'assistant')
            return (
              <div key={item.id} className="mr-6 flex gap-2">
                <Bot className="mt-1 size-4 shrink-0 text-brand" />
                <div className="whitespace-pre-wrap rounded-2xl rounded-tl-md border border-line bg-paper px-3 py-2">{item.text}</div>
              </div>
            );
          if (item.kind === 'tool')
            return (
              <div key={item.id} className="flex items-center gap-2 pl-6 text-xs text-muted">
                {item.status === 'running' ? <Loader2 className="size-3 animate-spin" /> : item.status === 'error' ? <CircleAlert className="size-3 text-terra" /> : <Wrench className="size-3" />}
                {item.name.replace(/_/g, ' ')}
                {item.detail && <span className="text-terra">· {item.detail}</span>}
              </div>
            );
          if (item.kind === 'ui') return <div key={item.id} className="pl-6 text-xs text-brand-ink">{item.text}</div>;
          if (item.kind === 'proposal') return <ProposalCard key={item.id} proposal={item.proposal} onDecide={assistant.decide} />;
          return (
            <div key={item.id} className={cn('rounded-xl px-3 py-2 text-xs', item.tone === 'error' ? 'bg-terra-soft text-terra' : 'bg-sand text-muted')}>
              {item.text}
            </div>
          );
        })}
        {assistant.items.length <= 1 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {t('suggestions')
              .split('|')
              .map((s) => (
                <button key={s} onClick={() => void assistant.send(s)} className="rounded-full border border-line bg-paper px-3 py-1 text-xs hover:bg-sand">
                  {s}
                </button>
              ))}
          </div>
        )}
      </div>

      {voice.error && (
        <p className="shrink-0 border-t border-line bg-terra-soft px-3 py-2 text-xs text-terra-ink" role="alert">
          {t(['mic', 'openai_auth', 'openai_quota', 'openai_model'].includes(voice.error) ? `voiceErr_${voice.error as 'mic'}` : 'voiceErr_other')}
        </p>
      )}
      <form onSubmit={submit} className="flex shrink-0 items-center gap-2 border-t border-line p-3">
        <button
          type="button"
          onClick={voice.toggle}
          disabled={!voice.supported}
          title={voice.supported ? (voice.active ? t('voiceOff') : t('voiceOn')) : t('voiceUnavailable')}
          className={cn('grid size-10 shrink-0 place-items-center rounded-xl border transition-colors', voice.active ? 'border-terra bg-terra text-white' : 'border-line bg-paper hover:bg-sand', !voice.supported && 'opacity-40')}
        >
          {voice.active ? <MicOff className="size-4" /> : <Mic className="size-4" />}
        </button>
        <input ref={input} value={text} onChange={(e) => setText(e.target.value)} placeholder={ask ? t('askPlaceholder') : t('placeholder')} className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-paper px-3 text-sm outline-none focus:border-brand" />
        <button disabled={!text.trim() || assistant.busy} aria-label={t('send')} className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand text-ink disabled:opacity-40">
          {assistant.busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </button>
      </form>
    </div>
  );
}

/** Desktop: a column beside the page. Mobile: a floating button that opens a bottom sheet. */
const DESKTOP = '(min-width: 1280px)';
const subscribeDesktop = (cb: () => void) => {
  const mq = window.matchMedia(DESKTOP);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};

export function AssistantDock({ prefs, hostName }: { prefs: AnfiPrefs; hostName: string }) {
  const t = useTranslations('assistant');
  const [sheet, setSheet] = useState<'closed' | 'open' | 'mini'>('closed');
  const minimize = useCallback(() => setSheet((s) => (s === 'open' ? 'mini' : s)), []);
  const [ask, setAsk] = useState(0);
  const [tour, setTour] = useState(0);
  useEffect(() => {
    const onTour = () => {
      setTour((n) => n + 1);
      // On a phone the sheet shrinks to its bar, so the page being explained stays visible.
      if (!window.matchMedia(DESKTOP).matches) setSheet('mini');
    };
    window.addEventListener(APP_TOUR_EVENT, onTour);
    return () => window.removeEventListener(APP_TOUR_EVENT, onTour);
  }, []);
  useEffect(() => {
    const onAsk = () => {
      setAsk((n) => n + 1);
      if (!window.matchMedia(DESKTOP).matches) setSheet('open');
    };
    window.addEventListener(ASK_EVENT, onAsk);
    return () => window.removeEventListener(ASK_EVENT, onAsk);
  }, []);
  // Mount one dock only, so a hidden one never keeps a 3D canvas or a voice session alive.
  const desktop = useSyncExternalStore(subscribeDesktop, () => window.matchMedia(DESKTOP).matches, () => false);
  if (desktop) {
    return (
      <aside className="sticky top-0 h-screen w-[360px] shrink-0 border-l border-line bg-paper/95 print:hidden">
        <DockBody prefs={prefs} ask={ask} tour={tour} hostName={hostName} />
      </aside>
    );
  }
  return (
    <>
      <button onClick={() => setSheet('open')} className="fixed bottom-5 right-5 z-30 flex items-center gap-2 rounded-full bg-brand print:hidden px-4 py-3 text-sm font-semibold text-ink shadow-lg" aria-label={t('open')}>
        <MessageCircle className="size-4" /> {t('title')}
      </button>
      {sheet !== 'closed' && (
        <div className={cn('fixed inset-0 z-40', sheet === 'open' ? 'bg-ink/30' : 'pointer-events-none')} onClick={() => setSheet('closed')}>
          <div
            className={cn(
              'pointer-events-auto absolute inset-x-0 bottom-0 h-[85vh] overflow-hidden rounded-t-3xl bg-paper shadow-2xl motion-safe:transition-transform',
              sheet === 'mini' && 'translate-y-[calc(85vh-3.5rem)]',
            )}
            onClickCapture={(e) => {
              if (sheet !== 'mini') return;
              e.stopPropagation();
              setSheet('open');
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <DockBody prefs={prefs} ask={ask} tour={tour} hostName={hostName} onClose={() => setSheet('closed')} onMinimize={minimize} />
          </div>
        </div>
      )}
    </>
  );
}
