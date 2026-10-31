'use client';

/**
 * Anfi sells AnfitrIA on the landing page. One controller drives everything he does here:
 * the guided pitch (scroll to each section, outline it, say it aloud, move on when he's done) and
 * answers to visitors' questions. Audio is optional: without it, each line stays on screen for
 * as long as it takes to read.
 */
import { ArrowRight, Loader2, Pause, Play, Send, SkipForward, Sparkles, Volume2, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { Lang } from '@/lib/marketing/content';
import { PITCH } from '@/lib/marketing/pitch';
import { cn } from '@/lib/utils';

type Mode = 'idle' | 'pitch' | 'answer';
type Status = 'speaking' | 'paused' | 'thinking' | 'done';

interface Guide {
  lang: Lang;
  mode: Mode;
  status: Status;
  text: string;
  step: number;
  total: number;
  start: () => void;
  ask: (question: string) => void;
  pause: () => void;
  resume: () => void;
  next: () => void;
  stop: () => void;
}

const Ctx = createContext<Guide | null>(null);
const useGuide = () => useContext(Ctx)!;

/** Short, stable fingerprint of a line, so cached audio refreshes when the copy changes. */
const fingerprint = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

const readingMs = (text: string) => Math.max(3500, text.length * 60);

export function AnfiGuideProvider({ lang, voice, children }: { lang: Lang; voice: boolean; children: ReactNode }) {
  const p = PITCH[lang];
  const keys = useMemo(() => ['hero', ...p.sections.map((s) => s.id)], [p]);
  const lineOf = useCallback((key: string) => (key === 'hero' ? p.hero.say : p.sections.find((s) => s.id === key)!.say), [p]);

  const [mode, setMode] = useState<Mode>('idle');
  const [status, setStatus] = useState<Status>('done');
  const [text, setText] = useState('');
  const [step, setStep] = useState(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const timer = useRef<number | null>(null);
  const stepRef = useRef(0);
  const modeRef = useRef<Mode>('idle');
  const history = useRef<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const playStep = useRef<(i: number) => void>(() => undefined);

  const clear = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    audio.current?.pause();
    audio.current = null;
    document.querySelectorAll('.pitch-focus').forEach((el) => el.classList.remove('pitch-focus'));
  }, []);

  /** Plays audio when there is some; otherwise waits a reading time. Then calls `after`. */
  const speak = useCallback(
    (src: string | null, line: string, after: () => void) => {
      const fallback = () => {
        timer.current = window.setTimeout(after, readingMs(line));
      };
      if (!src || !voice) return fallback();
      const a = new Audio(src);
      audio.current = a;
      a.addEventListener('ended', () => {
        timer.current = window.setTimeout(after, 500);
      });
      a.addEventListener('error', () => audio.current === a && fallback());
      a.play().catch(() => audio.current === a && fallback());
    },
    [voice],
  );

  // The step player reads the latest state each render, so it's refreshed after every render.
  useEffect(() => {
    playStep.current = (i: number) => {
      clear();
      if (i >= keys.length) {
        setStatus('done');
        setText(p.guide.done);
        return;
      }
      const key = keys[i];
      stepRef.current = i;
      setStep(i);
      setStatus('speaking');
      const line = lineOf(key);
      setText(line);
      const target = key === 'hero' ? null : document.querySelector<HTMLElement>(`[data-pitch="${key}"]`);
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (target) {
        // On phones Anfi's card covers the bottom of the screen, so the section goes to the top.
        target.style.scrollMarginTop = '72px';
        target.scrollIntoView({ block: window.innerWidth < 768 ? 'start' : 'center', behavior: reduced ? 'auto' : 'smooth' });
        target.classList.add('pitch-focus');
      } else window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
      speak(`/api/pitch/voice?lang=${lang}&key=${key}&v=${fingerprint(line)}`, line, () => modeRef.current === 'pitch' && playStep.current(stepRef.current + 1));
    };
  });

  const start = useCallback(() => {
    modeRef.current = 'pitch';
    setMode('pitch');
    playStep.current(0);
  }, []);

  const stop = useCallback(() => {
    clear();
    modeRef.current = 'idle';
    setMode('idle');
    setStatus('done');
  }, [clear]);

  const pause = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    audio.current?.pause();
    setStatus('paused');
  }, []);

  const resume = useCallback(() => {
    if (modeRef.current !== 'pitch') return;
    if (audio.current) {
      setStatus('speaking');
      void audio.current.play().catch(() => playStep.current(stepRef.current + 1));
    } else playStep.current(stepRef.current);
  }, []);

  const next = useCallback(() => {
    if (modeRef.current === 'pitch') playStep.current(stepRef.current + 1);
  }, []);

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim().slice(0, 300);
      if (!q) return;
      clear();
      modeRef.current = 'answer';
      setMode('answer');
      setStatus('thinking');
      setText(q);
      try {
        const res = await fetch('/api/pitch/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: q, history: history.current.slice(-6), lang, voice }),
        });
        if (res.status === 429) throw new Error('limit');
        if (!res.ok) throw new Error('error');
        const data = (await res.json()) as { answer: string; audio?: string };
        if (modeRef.current !== 'answer') return;
        history.current.push({ role: 'user', content: q }, { role: 'assistant', content: data.answer });
        setText(data.answer);
        setStatus('speaking');
        speak(data.audio ? `data:audio/ogg;base64,${data.audio}` : null, data.answer, () => setStatus('done'));
      } catch (e) {
        setText(e instanceof Error && e.message === 'limit' ? p.guide.limit : p.guide.error);
        setStatus('done');
      }
    },
    [clear, lang, p, speak, voice],
  );

  useEffect(() => clear, [clear]);

  const value = useMemo<Guide>(() => ({ lang, mode, status, text, step, total: keys.length, start, ask, pause, resume, next, stop }), [lang, mode, status, text, step, keys.length, start, ask, pause, resume, next, stop]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <FloatingAnfi />
    </Ctx.Provider>
  );
}

function AskForm({ compact = false }: { compact?: boolean }) {
  const g = useGuide();
  const p = PITCH[g.lang];
  const [q, setQ] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    g.ask(q);
    setQ('');
  };
  return (
    <form onSubmit={submit} className={cn('flex gap-2', compact ? '' : 'rounded-2xl border border-line bg-paper p-1.5 shadow-sm')}>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        maxLength={300}
        placeholder={compact ? p.guide.askAgain : p.hero.askPh}
        aria-label={p.hero.ask}
        className={cn('min-w-0 flex-1 bg-transparent px-3 text-sm outline-none', compact ? 'h-9 rounded-xl border border-line' : 'h-10')}
      />
      <button disabled={!q.trim() || g.status === 'thinking'} aria-label={p.hero.ask} className="grid size-10 shrink-0 place-items-center rounded-xl bg-ink text-cream disabled:opacity-40">
        {g.status === 'thinking' ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
      </button>
    </form>
  );
}

/** The hero: Anfi, his greeting, "listen to me" and the question box. */
export function AnfiHero() {
  const g = useGuide();
  const p = PITCH[g.lang];
  const talking = g.mode !== 'idle' && g.status === 'speaking' && g.step === 0;
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-6 md:grid-cols-[1.05fr_1fr]">
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-brand-ink">{p.hero.eyebrow}</p>
        <h1 className="font-display text-4xl font-semibold leading-[1.08] md:text-6xl">{p.hero.title}</h1>
        <p className="mt-5 max-w-xl text-lg text-muted">{p.hero.subtitle}</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <button onClick={g.start} className="flex items-center gap-2 rounded-xl bg-brand px-5 py-3 font-semibold text-ink shadow-sm">
            <Play className="size-4 fill-current" /> {p.hero.listen}
          </button>
          <Link href="/signup" className="flex items-center gap-2 rounded-xl border border-line bg-paper px-5 py-3 font-medium">
            {p.hero.cta} <ArrowRight className="size-4" />
          </Link>
        </div>
        <div className="mt-6 max-w-xl">
          <AskForm />
        </div>
      </div>
      <div className="relative mx-auto w-full max-w-md">
        <div aria-hidden className="absolute inset-x-4 bottom-0 top-14 rounded-full bg-[radial-gradient(circle_at_50%_45%,rgb(213_245_233)_0%,rgb(213_245_233/0.6)_45%,transparent_70%)]" />
        <div className="absolute -top-2 left-0 right-6 z-10 rounded-2xl rounded-bl-md border border-line bg-paper px-4 py-3 text-sm shadow-lg md:-left-8">
          <Sparkles className="mr-1.5 inline size-4 text-brand" />
          {p.hero.greeting}
        </div>
        <Image src="/brand/anfitria-mark.webp" alt="Anfi" width={1254} height={1254} priority className={cn('relative mt-12 w-full mix-blend-multiply', talking ? 'animate-talk' : 'animate-bob')} />
      </div>
    </section>
  );
}

/** Anfi follows the visitor while he talks: bubble, controls, and a box to ask him more. */
function FloatingAnfi() {
  const g = useGuide();
  const p = PITCH[g.lang];
  if (g.mode === 'idle') return null;
  const talking = g.status === 'speaking';
  return (
    <div className="fixed inset-x-3 bottom-3 z-50 md:inset-x-auto md:bottom-6 md:right-6 md:w-[380px]" role="status" aria-live="polite">
      <div className="rounded-3xl border border-line bg-paper p-4 shadow-[0_24px_60px_-20px_rgba(22,48,42,0.45)]">
        <div className="flex items-start gap-3">
          <Image src="/brand/anfitria-mark.webp" alt="" width={1254} height={1254} className={cn('size-14 shrink-0 mix-blend-multiply', talking && 'animate-talk')} />
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2 text-xs text-muted">
              <span className="font-semibold text-ink">Anfi</span>
              {g.status === 'thinking' ? p.guide.thinking : g.mode === 'pitch' && g.status !== 'done' ? `${p.guide.listening} ${g.step + 1}/${g.total}` : null}
              {talking && <Volume2 className="size-3.5 text-brand" />}
            </div>
            <p className={cn('text-sm', g.status === 'thinking' && 'italic text-muted')}>{g.text}</p>
          </div>
          <button onClick={g.stop} aria-label={p.guide.stop} className="rounded-full p-1 text-muted hover:bg-sand hover:text-ink">
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {g.mode === 'pitch' && g.status !== 'done' && (
            <>
              {g.status === 'paused' ? (
                <button onClick={g.resume} className="flex items-center gap-1.5 rounded-xl border border-line px-3 py-1.5 text-xs"><Play className="size-3.5" /> {p.guide.resume}</button>
              ) : (
                <button onClick={g.pause} className="flex items-center gap-1.5 rounded-xl border border-line px-3 py-1.5 text-xs"><Pause className="size-3.5" /> {p.guide.pause}</button>
              )}
              <button onClick={g.next} className="flex items-center gap-1.5 rounded-xl border border-line px-3 py-1.5 text-xs"><SkipForward className="size-3.5" /> {p.guide.next}</button>
            </>
          )}
          <Link href="/signup" className="ml-auto flex items-center gap-1.5 rounded-xl bg-brand px-3 py-1.5 text-xs font-semibold text-ink">
            {p.hero.cta} <ArrowRight className="size-3.5" />
          </Link>
        </div>
        {(g.mode === 'answer' || g.status === 'done') && (
          <div className="mt-3">
            <AskForm compact />
          </div>
        )}
      </div>
    </div>
  );
}

/** Adds `is-visible` to each landing section as it scrolls into view, so its items rise in. */
export function RevealOnScroll() {
  useEffect(() => {
    const els = [...document.querySelectorAll('[data-reveal]')];
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('is-visible'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && (e.target.classList.add('is-visible'), io.unobserve(e.target))),
      { threshold: 0.15 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return null;
}
