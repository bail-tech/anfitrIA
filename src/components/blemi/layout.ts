'use client';

import { useEffect, useRef, type RefObject } from 'react';

/** Where the chat panel starts, as a fraction of the stage width (1 when there is no panel beside the stage). */
export interface StageLayout {
  freeRight: number;
}

/**
 * Tracks the panel's left edge while its width animates, so the scene can keep Blemi
 * standing right beside it. ResizeObserver fires on every frame of a CSS width transition.
 */
export function useStageLayout(row: RefObject<HTMLElement | null>, panel: RefObject<HTMLElement | null>) {
  const layout = useRef<StageLayout>({ freeRight: 1 });
  useEffect(() => {
    const update = () => {
      const r = row.current?.getBoundingClientRect();
      const p = panel.current?.getBoundingClientRect();
      layout.current.freeRight = r && p && p.width > 0 && r.width > 0 ? Math.min(1, Math.max(0, (p.left - r.left) / r.width)) : 1;
    };
    const observer = new ResizeObserver(update);
    if (row.current) observer.observe(row.current);
    if (panel.current) observer.observe(panel.current);
    update();
    return () => observer.disconnect();
  }, [row, panel]);
  return layout;
}
