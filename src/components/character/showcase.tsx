'use client';

import { useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui';
import { drawFace, type Mood } from './face';
import { CharacterStage } from './stage';

const MOODS: Mood[] = ['idle', 'listening', 'thinking', 'working', 'talking', 'approval', 'done', 'error'];

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
  return (
    <div className="mt-6 grid gap-6 md:grid-cols-[1fr_1fr]">
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
  );
}
