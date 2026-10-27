'use client';

import { useEffect, useRef, type RefObject } from 'react';
import type { Assistant } from '@/components/assistant/use-assistant';
import { IDLE_SIGNALS, type ScreenSignals } from './screen-state';

interface VoiceLike {
  active: boolean;
  levels: RefObject<{ mic: number; speaker: number }>;
}

/** One ref Blemi's scene reads every frame: assistant fields after each commit, voice levels live. */
export function useScreenSignals(assistant: Assistant, voice: VoiceLike): RefObject<ScreenSignals> {
  const signals = useRef<ScreenSignals>(IDLE_SIGNALS);
  const { state, activeTool, talkingUntil } = assistant;
  const { active, levels } = voice;
  useEffect(() => {
    signals.current = {
      state,
      activeTool,
      lastReceiptAt: 0,
      talkingUntil,
      voice: active,
      get micLevel() {
        return levels.current?.mic ?? 0;
      },
      get speakerLevel() {
        return levels.current?.speaker ?? 0;
      },
    };
  }, [state, activeTool, talkingUntil, active, levels]);
  return signals;
}
