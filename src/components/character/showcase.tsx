'use client';

import { useEffect, useRef, useState } from 'react';
import { BlemiStage } from '@/components/blemi/blemi-stage';
import type { ChatState } from '@/components/blemi/chat-types';
import { nowMs } from '@/components/blemi/clock';
import { IDLE_SIGNALS, type ScreenSignals } from '@/components/blemi/screen-state';
import { Card } from '@/components/ui';
import { drawFace, type Mood } from './face';
import { CharacterStage } from './stage';

const MOODS: Mood[] = ['idle', 'listening', 'thinking', 'working', 'talking', 'approval', 'done', 'error'];

/** Blemi's screen situations, driven the same way the dock drives them. */
const BLEMI_STATES: Array<{ label: string; signals: Partial<ScreenSignals> }> = [
  { label: 'idle', signals: { state: 'idle' } },
  { label: 'listening', signals: { state: 'listening', voice: true } },
  { label: 'thinking', signals: { state: 'thinking' } },
  { label: 'searching', signals: { state: 'working', activeTool: 'search_knowledge' } },
  { label: 'reading', signals: { state: 'working', activeTool: 'read_conversation' } },
  { label: 'talking', signals: { state: 'done', talkingUntil: Number.MAX_SAFE_INTEGER } },
  { label: 'approval', signals: { state: 'approval' } },
  { label: 'done', signals: { state: 'done' } },
  { label: 'error', signals: { state: 'error' as ChatState } },
];

function Face({ mood }: { mood: Mood }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = (ms: number) => {
      const ctx = ref.current?.getContext('2d');
      if (ctx) drawFace(ctx, 120, mood, ms / 1000, mood === 'talking' ? 0.3 + 0.3 * Math.sin(ms / 90) : 0);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mood]);
  return <canvas ref={ref} width={120} height={120} className="aspect-square h-auto w-full max-w-[96px]" />;
}

export function CharacterShowcase() {
  const [mood, setMood] = useState<Mood>('idle');
  const levels = useRef({ mic: 0, speaker: 0 });
  const [blemi, setBlemi] = useState(0);
  const signals = useRef<ScreenSignals>(IDLE_SIGNALS);
  useEffect(() => {
    signals.current = { ...IDLE_SIGNALS, ...BLEMI_STATES[blemi].signals, lastReceiptAt: 0 };
    if (BLEMI_STATES[blemi].label === 'talking') signals.current.talkingUntil = nowMs() + 600_000;
  }, [blemi]);

  return (
    <div className="mt-6 space-y-10">
      <section>
        <h2 className="font-display text-xl font-semibold">Blemi</h2>
        <p className="text-sm text-muted">El robot de Blemia (GLB con rig, pantallas pixel en cabeza y pecho). Es el personaje del asistente.</p>
        <div className="mt-4 grid gap-6 md:grid-cols-[1fr_1fr]">
          <Card className="relative h-[420px] overflow-hidden">
            <BlemiStage label="Blemi" mode="assembled" focus="blemi" signals={signals} className="relative h-full w-full" />
          </Card>
          <div className="flex flex-wrap content-start gap-2">
            {BLEMI_STATES.map((s, i) => (
              <button key={s.label} onClick={() => setBlemi(i)} className={`rounded-full border px-3 py-1.5 text-sm ${i === blemi ? 'border-gold bg-gold-soft/60' : 'border-line bg-paper'}`}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section>
        <h2 className="font-display text-xl font-semibold">Anfi</h2>
        <p className="text-sm text-muted">Alternativa procedural (NEXT_PUBLIC_CHARACTER=anfi).</p>
        <div className="mt-4 grid gap-6 md:grid-cols-[1fr_1fr]">
          <Card className="h-[380px] overflow-hidden">
            <CharacterStage mood={mood} levels={levels} className="h-full w-full" />
          </Card>
          <div className="grid grid-cols-4 gap-3">
            {MOODS.map((m) => (
              <button key={m} onClick={() => setMood(m)} className={`flex flex-col items-center gap-1 rounded-2xl border p-2 text-xs ${m === mood ? 'border-gold bg-gold-soft/50' : 'border-line bg-paper'}`}>
                <Face mood={m} />
                {m}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
