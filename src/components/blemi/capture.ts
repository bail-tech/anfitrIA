'use client';

import type { ChatPreview } from './chat-types';

/**
 * Lockstep capture mode (?capture=1) for scripts/visual/capture.mjs: no frame loop of its own,
 * synthesized time, input frozen, and named shots that put the hero into a known state.
 */
export function captureEnabled(): boolean {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('capture');
}

export interface VoiceShot {
  active: boolean;
  mic: number;
  speaker: number;
}

interface Shot {
  /** What a reviewer judges in this frame. */
  doc: string;
  preview: ChatPreview | null;
  voice?: VoiceShot;
  /** Open the phone chat sheet. */
  sheet?: boolean;
}

const SILENT: VoiceShot = { active: false, mic: 0, speaker: 0 };

export const SHOTS: Record<string, Shot> = {
  'wordmark-logo': { doc: 'Logo story landed: all letters in, the head is the "a", the chest screen is the face.', preview: null },
  'blemi-idle': { doc: 'Engaged and idle: letters gone, Blemi alone just left of the wide panel; open eyes, smile, heart.', preview: 'idle' },
  'blemi-thinking': { doc: 'Thinking: eyes up, wavy mouth, thought dots on the chest.', preview: 'thinking' },
  'blemi-searching': { doc: 'Finding services: focused eyes, magnifier over results on the chest.', preview: 'searching' },
  'blemi-reading': { doc: 'Fetching a page: focused eyes, page icon on the chest.', preview: 'reading' },
  'blemi-paying': { doc: 'Paying: euro eyes, o mouth, euro coin flipping on the chest.', preview: 'paying' },
  'blemi-paid': { doc: 'Receipt arrived: happy eyes, big smile, check on the chest, screens brighter.', preview: 'paid' },
  'blemi-approval': { doc: 'Waiting for approval: question eyes, question mark on the chest.', preview: 'approval' },
  'blemi-talking': { doc: 'Reply streaming: talking mouth, speech bars on the chest.', preview: 'talking' },
  'blemi-listening': { doc: 'Voice on, visitor speaking: wide eyes, mic and level bars on the chest.', preview: 'idle', voice: { active: true, mic: 0.7, speaker: 0 } },
  'blemi-error': { doc: 'Run failed: X eyes, warning sign on the chest.', preview: 'error' },
  'blemi-out-of-credit': { doc: 'Out of credit: sad eyes, frown, "€0" on the chest.', preview: 'out_of_credit' },
  'mobile-blemi': { doc: 'Phone with the chat sheet open: Blemi centred and alone above the sheet. Capture at 390x844.', preview: 'talking', sheet: true },
};

/** Filled in by the chat, voice and canvas while capture mode is on. */
export const captureHooks: {
  preview?: (preview: ChatPreview | null) => void;
  voice?: (voice: VoiceShot) => void;
  pump?: (frames: number) => void;
  renderInfo?: () => { calls: number; tris: number; programs: number; textures: number; geometries: number; dpr: number; regions: Record<string, unknown> };
  ready?: boolean;
} = {};

/** Frames to finish the reassemble, wave and zoom before a shot's moment starts. */
const WARMUP_FRAMES = 150;

const nextPaint = () => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));
/** Lets React commit and run effects after a state change made outside it. */
const settle = async () => {
  await new Promise((done) => setTimeout(done, 30));
  await nextPaint();
};

export function installCapture() {
  const w = window as unknown as Record<string, unknown>;
  document.documentElement.dataset.capture = '';
  w.__SHOTS__ = Object.fromEntries(Object.entries(SHOTS).map(([name, shot]) => [name, { doc: shot.doc }]));
  w.__PUMP__ = (n: number) => captureHooks.pump?.(n);
  w.__PRESENT__ = async (n = 2) => {
    for (let i = 0; i < n; i++) await nextPaint();
  };
  w.__APPLY_SHOT__ = async (name: string) => {
    const shot = SHOTS[name];
    if (!shot) return { error: `unknown shot ${name}` };
    if (shot.preview) {
      // Engage first and let the transitions finish, so the shot's moment starts from rest.
      captureHooks.preview?.('idle');
      await settle();
      captureHooks.pump?.(WARMUP_FRAMES);
    } else {
      captureHooks.pump?.(WARMUP_FRAMES);
    }
    captureHooks.voice?.(shot.voice ?? SILENT);
    captureHooks.preview?.(shot.preview);
    if (shot.sheet) document.querySelector<HTMLButtonElement>('[data-chat-open]')?.click();
    await settle();
    return { name };
  };
  Object.defineProperty(w, '__READY__', { configurable: true, get: () => captureHooks.ready === true });
  Object.defineProperty(w, '__RENDER_INFO__', { configurable: true, get: () => captureHooks.renderInfo?.() ?? null });
}
