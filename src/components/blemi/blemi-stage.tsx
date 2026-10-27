'use client';

import { Component, useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { captureEnabled } from './capture';
import type { StageLayout } from './layout';
import type { BlemiMode } from './rig';
import type { BlemiFocus } from './scene';
import type { ScreenSignals } from './screen-state';

const BlemiScene = dynamic(() => import('./scene'), { ssr: false });

type Support = 'pending' | 'webgl' | 'video' | 'poster';

let detected: Support | null = null;
const subscribe = () => () => {};

function detectSupport(): Support {
  if (detected) return detected;
  detected = probe();
  return detected;
}

function probe(): Support {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'poster';
  const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
  if (nav.connection?.saveData) return 'poster';
  if ((nav.deviceMemory ?? 8) <= 2 || (navigator.hardwareConcurrency ?? 8) <= 2) return 'video';
  try {
    const canvas = document.createElement('canvas');
    return canvas.getContext('webgl2') || canvas.getContext('webgl') ? 'webgl' : 'video';
  } catch {
    return 'video';
  }
}

class SceneBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export type BlemiStageProps = {
  label: string;
  mode: BlemiMode;
  focus?: BlemiFocus;
  /** What Blemi's screens show, read every frame. */
  signals?: RefObject<ScreenSignals>;
  /** Where the chat panel starts; the scene keeps its subject in the space left of it. */
  layout?: RefObject<StageLayout>;
  onBlemiClick?: () => void;
  className?: string;
  /** Insets the poster and video into the free area beside the panel. */
  posterClassName?: string;
};

/**
 * The 3D Blemia wordmark with Blemi. Shows a poster until the WebGL scene is ready; reduced-motion and
 * data-saver visitors keep the poster, and devices without WebGL (or too little power) get the logo video.
 */
export function BlemiStage({ label, mode, focus, signals, layout, onBlemiClick, className = 'relative', posterClassName = '' }: BlemiStageProps) {
  const ref = useRef<HTMLDivElement>(null);
  const detectedSupport = useSyncExternalStore(subscribe, detectSupport, () => 'pending' as const);
  const [failed, setFailed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [ready, setReady] = useState(false);
  const support: Support = failed ? 'video' : detectedSupport;

  useEffect(() => {
    const el = ref.current;
    if (support !== 'webgl' || !el) return;
    if (captureEnabled()) {
      const id = window.setTimeout(() => setMounted(true), 0);
      return () => window.clearTimeout(id);
    }
    // Phones mount the scene on the first touch, scroll or key press, so it never competes with page load.
    if (window.matchMedia('(pointer: coarse)').matches) {
      const events = ['pointerdown', 'touchstart', 'scroll', 'keydown'] as const;
      const mount = () => {
        events.forEach((type) => window.removeEventListener(type, mount));
        setMounted(true);
      };
      events.forEach((type) => window.addEventListener(type, mount, { once: true, passive: true }));
      return () => events.forEach((type) => window.removeEventListener(type, mount));
    }
    const idle = (cb: () => void) =>
      typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(cb, { timeout: 1500 }) : window.setTimeout(cb, 300);
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        idle(() => setMounted(true));
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [support]);

  return (
    <div ref={ref} role="img" aria-label={label} className={`overflow-hidden ${className}`}>
      <div className={`absolute inset-0 ${posterClassName}`}>
        {support === 'video' ? (
          <video
            className="absolute inset-0 h-full w-full object-contain mix-blend-multiply"
            src="/brand/blemia-logo.mp4"
            poster="/brand/blemia-logo-poster.jpg"
            autoPlay
            muted
            loop
            playsInline
            aria-hidden
          />
        ) : (
          <Image
            src="/brand/blemia-logo-3d.webp"
            alt=""
            fill
            priority
            sizes="(min-width: 1280px) 800px, 100vw"
            className={`object-contain px-[6%] py-[8%] transition-opacity duration-700 ${ready ? 'opacity-0' : 'opacity-100'}`}
          />
        )}
      </div>
      {support === 'webgl' && mounted && (
        <SceneBoundary onError={() => setFailed(true)}>
          <div className={`absolute inset-0 transition-opacity duration-700 ${ready ? 'opacity-100' : 'opacity-0'}`}>
            <BlemiScene mode={mode} focus={focus} signals={signals} layout={layout} onBlemiClick={onBlemiClick} onReady={() => setReady(true)} />
          </div>
        </SceneBoundary>
      )}
    </div>
  );
}
