'use client';

import dynamic from 'next/dynamic';
import { Component, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import type { Mood } from './face';
import { CharacterPoster } from './poster';
import type { Levels } from './scene';

const AnfiScene = dynamic(() => import('./scene'), { ssr: false, loading: () => <CharacterPoster className="h-full w-full p-6" /> });

/** WebGL only when the device can afford it and the user allows motion (as in Blemia's stage). */
function canRender3D(): boolean {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
  if (nav.connection?.saveData || (nav.deviceMemory ?? 8) <= 2) return false;
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

let cached: boolean | null = null;
const subscribe = () => () => {};
const snapshot = () => (cached ??= canRender3D());

class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function CharacterStage({ mood, levels, className }: { mood: Mood; levels: RefObject<Levels>; className?: string }) {
  const webgl = useSyncExternalStore(subscribe, snapshot, () => false);
  const poster = <CharacterPoster className="h-full w-full p-6" />;
  return (
    <div className={className} aria-label={`Anfi: ${mood}`}>
      {webgl ? (
        <Boundary fallback={poster}>
          <AnfiScene mood={mood} levels={levels} />
        </Boundary>
      ) : (
        poster
      )}
    </div>
  );
}
