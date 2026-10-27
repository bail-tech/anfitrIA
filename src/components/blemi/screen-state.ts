import { CHEST_GRID, HEAD_GRID, SPRITES, type SpriteName } from './pixel-art';
import type { ChatState } from './chat-types';

/** Everything the screens react to. Written by the chat and voice hooks, read by the scene every frame. */
export interface ScreenSignals {
  state: ChatState;
  /** Name of the tool currently running, null between tools. */
  activeTool: string | null;
  /** When the last payment receipt arrived (ms on the `nowMs` clock), 0 for never. */
  lastReceiptAt: number;
  /** Blemi is "speaking" a reply until this time (ms). */
  talkingUntil: number;
  micLevel: number;
  speakerLevel: number;
  voice: boolean;
}

export const IDLE_SIGNALS: ScreenSignals = { state: 'idle', activeTool: null, lastReceiptAt: 0, talkingUntil: 0, micLevel: 0, speakerLevel: 0, voice: false };

export type Situation =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'searching'
  | 'reading'
  | 'wallet'
  | 'receipts'
  | 'tool'
  | 'paying'
  | 'paid'
  | 'approval'
  | 'talking'
  | 'done'
  | 'error'
  | 'out_of_credit';

/** How long the "paid" celebration lasts after a receipt. */
export const PAID_MS = 2500;
const SPEAKING = 0.06;

export const TOOL_SITUATION: Record<string, Situation> = {
  blemia_find_services: 'searching',
  web_search: 'searching',
  web_fetch: 'reading',
  blemia_wallet: 'wallet',
  blemia_receipts: 'receipts',
  blemia_pay: 'paying',
  // AnfitrIA assistant tools
  search_knowledge: 'searching',
  find_reservations: 'searching',
  list_properties: 'searching',
  today_overview: 'reading',
  list_escalations: 'reading',
  read_conversation: 'reading',
  plan_turnovers: 'tool',
  create_task: 'tool',
  set_handoff: 'tool',
  propose_guest_reply: 'tool',
  propose_knowledge: 'tool',
};

export function situationOf(s: ScreenSignals, now: number): Situation {
  if (s.state === 'approval') return 'approval';
  if (s.state === 'out_of_credit') return 'out_of_credit';
  if (s.state === 'error') return 'error';
  if (s.lastReceiptAt > 0 && now - s.lastReceiptAt < PAID_MS) return 'paid';
  if (s.activeTool === 'blemia_pay' || s.state === 'paying') return 'paying';
  if (s.activeTool) return TOOL_SITUATION[s.activeTool] ?? 'tool';
  if (now < s.talkingUntil || (s.voice && s.speakerLevel > SPEAKING)) return 'talking';
  if (s.state === 'thinking' || s.state === 'working') return 'thinking';
  if (s.voice || s.state === 'listening') return 'listening';
  if (s.state === 'done') return 'done';
  return 'idle';
}

export interface Layer {
  sprite: SpriteName;
  /** Top-left dot of the sprite on the screen grid (y down). */
  x: number;
  y: number;
  flip?: boolean;
  intensity?: number;
}

export interface Bars {
  /** Top-left dot and size of the bar area; bars sit on even columns. */
  x: number;
  y: number;
  w: number;
  h: number;
  mode: 'center' | 'bottom';
  levels: number[];
}

export interface ScreenFrame {
  /** Changes whenever the drawing changes meaning; the screen glitches briefly on change. */
  key: string;
  layers: Layer[];
  bars: Bars | null;
  /** Extra brightness 0..1. */
  pulse: number;
}

export interface ScreenContext {
  /** Cursor direction, -1..1 each axis, y up. */
  look: { x: number; y: number };
  /** The head is away being the "a" of the wordmark. */
  headAway: boolean;
  /** The head is mid-air in the logo story. */
  flying: boolean;
  hovered: boolean;
}

export const MAX_LAYERS = 3;
export const MAX_BARS = 8;

/** A sprite centred on (cx, cy), snapped to whole dots. */
function at(sprite: SpriteName, cx: number, cy: number, extra: Partial<Layer> = {}): Layer {
  const r = SPRITES[sprite];
  return { sprite, x: Math.round(cx - r.w / 2), y: Math.round(cy - r.h / 2), ...extra };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** Frame `i` of an animation running at `fps`. */
const frame = (t: number, fps: number, count: number) => Math.floor(t * fps) % count;

/** Two quick blinks every few seconds, from the clock alone. */
export function blinking(t: number): boolean {
  const cycle = 3.9;
  const n = Math.floor(t / cycle);
  const p = t - n * cycle;
  return p < 0.13 || (n % 3 === 2 && p > 0.28 && p < 0.4);
}

function levels(count: number, level: number, t: number, taper: boolean): number[] {
  return Array.from({ length: count }, (_, i) => {
    const wobble = 0.6 + 0.4 * Math.sin(t * 11 + i * 2.3) * Math.sin(t * 4.1 + i);
    const shape = taper ? 1 - (Math.abs(i - (count - 1) / 2) / count) * 0.9 : 1;
    return clamp(0.12 + level * wobble * shape, 0, 1);
  });
}

/** A voice-like loudness for text replies, so the mouth moves while the reply streams in. */
const textVoice = (t: number) => clamp(0.5 + 0.35 * Math.sin(t * 8.3) * Math.sin(t * 3.1 + 1), 0, 1);
const TALK_CYCLE = [1, 2, 3, 2, 1, 2, 0, 3, 2, 1];

const HEAD = { cx: HEAD_GRID.w / 2, eyes: 6, mouth: 12 };
const CHEST = { cx: CHEST_GRID.w / 2, cy: CHEST_GRID.h / 2 };

function head(situation: Situation, s: ScreenSignals, t: number, ctx: ScreenContext, talk: number): Layer[] {
  const lookX = Math.round(clamp(ctx.look.x, -1, 1) * 2);
  const lookY = -Math.round(clamp(ctx.look.y, -1, 1));
  const blink = blinking(t);
  const eyes = (sprite: SpriteName, dx = 0, dy = 0, mirrored = false) => at(sprite, HEAD.cx + dx, HEAD.eyes + dy, mirrored ? { flip: true } : {});
  const mouth = (sprite: SpriteName) => at(sprite, HEAD.cx, HEAD.mouth);
  switch (situation) {
    case 'listening':
      return [eyes(blink ? 'eyeBlink' : 'eyeWide', Math.round(lookX / 2), lookY), mouth('mouthSmile')];
    case 'thinking': {
      const side = frame(t, 0.8, 2) === 0 ? 1 : -1;
      return [eyes('eyeUp', side, -1), mouth('mouthWavy')];
    }
    case 'searching':
      return [eyes('eyeFocus', Math.round(Math.sin(t * 2.2) * 2)), mouth('mouthFlat')];
    case 'reading':
      return [eyes('eyeFocus', frame(t, 2.5, 4) - 1, 1), mouth('mouthFlat')];
    case 'wallet':
    case 'receipts':
    case 'tool':
      return [eyes('eyeFocus', 0, 1), mouth('mouthFlat')];
    case 'paying':
      return [eyes('eyeEuro'), mouth('mouthO')];
    case 'paid':
      return [eyes('eyeHappy'), mouth('mouthBig')];
    case 'approval':
      return [eyes('eyeQuestion', 0, 0, frame(t, 1.2, 2) === 1), mouth('mouthFlat')];
    case 'talking':
      return [eyes(blink ? 'eyeBlink' : 'eyeOpen', lookX, lookY), mouth(`talk${talk}` as SpriteName)];
    case 'done':
      return [eyes('eyeHappy'), mouth('mouthSmile')];
    case 'error':
      return [eyes('eyeX'), mouth('mouthWavy')];
    case 'out_of_credit':
      return [eyes('eyeSad', 0, 1), mouth('mouthFrown')];
    case 'idle':
    default:
      return [eyes(blink ? 'eyeBlink' : 'eyeOpen', lookX, lookY), mouth('mouthSmile')];
  }
}

function chest(situation: Situation, s: ScreenSignals, t: number, now: number): { layers: Layer[]; bars: Bars | null } {
  const { cx, cy } = CHEST;
  const one = (layer: Layer) => ({ layers: [layer], bars: null });
  switch (situation) {
    case 'listening':
      return { layers: [at('mic', 4, cy)], bars: { x: 8, y: 2, w: 7, h: 7, mode: 'bottom', levels: levels(4, s.micLevel, t, false) } };
    case 'talking': {
      const level = s.voice && s.speakerLevel > SPEAKING ? s.speakerLevel : textVoice(t);
      return { layers: [], bars: { x: 1, y: 1, w: 13, h: 9, mode: 'center', levels: levels(7, level, t, true) } };
    }
    case 'thinking': {
      const lift = frame(t, 3.3, 4);
      return { layers: [0, 1, 2].map((i) => at('dot', cx - 4 + i * 4, cy - (lift === i ? 1 : 0))), bars: null };
    }
    case 'searching':
      return { layers: [at('lines', cx, cy), at('lens', cx + Math.round(Math.sin(t * 2.2) * 3), cy - 1)], bars: null };
    case 'reading':
      return one(at(frame(t, 2.8, 2) ? 'page1' : 'page0', cx, cy));
    case 'wallet':
      return one(at('wallet', cx, cy - frame(t, 1.6, 2)));
    case 'receipts':
      return one(at('receipt', cx, cy - frame(t, 1.6, 2)));
    case 'tool':
      return one(at(frame(t, 5, 2) ? 'gearB' : 'gearA', cx, cy));
    case 'paying': {
      // The coin rests on its euro face, then flips over.
      const f = frame(t, 10, 8);
      const sprite = (['coinFace', 'coinFace', 'coinFace', 'coinFace', 'coinFace', 'coinTilt', 'coinEdge', 'coinTilt'] as const)[f];
      return one(at(sprite, cx, cy - (f === 6 ? 1 : 0)));
    }
    case 'paid':
      return one(at(now - s.lastReceiptAt < 140 ? 'checkSmall' : 'checkBig', cx, cy));
    case 'approval':
      return one(at('question', cx, cy, { intensity: (t * 1.2) % 1 < 0.7 ? 1 : 0.3 }));
    case 'done':
      return one(at('checkBig', cx, cy));
    case 'error':
      return one(at('warning', cx, cy));
    case 'out_of_credit':
      return one(at('euroZero', cx, cy, { intensity: frame(t, 1.2, 2) ? 0.55 : 1 }));
    case 'idle':
    default: {
      const p = t % 1.1;
      return one(at(p < 0.12 || (p > 0.22 && p < 0.32) ? 'heartBig' : 'heartSmall', cx, cy));
    }
  }
}

/** What both screens show right now. Pure: the same signals, time and context always give the same pictures. */
export function pickScreens(s: ScreenSignals, now: number, ctx: ScreenContext): { situation: Situation; head: ScreenFrame; chest: ScreenFrame } {
  const t = now / 1000;
  const situation = situationOf(s, now);
  const voiceTalk = s.voice && s.speakerLevel > SPEAKING;
  const talk = voiceTalk ? Math.min(3, Math.floor(s.speakerLevel * 8)) : TALK_CYCLE[frame(t, 10, TALK_CYCLE.length)];
  const sincePaid = now - s.lastReceiptAt;
  const pulse = situation === 'paid' ? (1 - sincePaid / PAID_MS) * (0.5 + 0.5 * Math.cos((sincePaid / 1000) * Math.PI * 3.2)) : 0;

  if (ctx.headAway) {
    const face: Layer[] = ctx.hovered
      ? [at('chestHappy', CHEST.cx, 4), at('chestSmile', CHEST.cx, 8)]
      : [at(blinking(t) ? 'chestBlink' : 'chestEyes', CHEST.cx, 4), at('chestSmile', CHEST.cx, 8)];
    return {
      situation,
      head: ctx.flying
        ? { key: 'flying', layers: [at('eyeWide', HEAD.cx, HEAD.eyes), at('mouthO', HEAD.cx, HEAD.mouth)], bars: null, pulse: 0 }
        : { key: 'logo', layers: [at('logoA', HEAD.cx, HEAD_GRID.h / 2)], bars: null, pulse: 0 },
      chest: { key: ctx.hovered ? 'face-happy' : 'face', layers: face, bars: null, pulse: 0 },
    };
  }

  const c = chest(situation, s, t, now);
  return {
    situation,
    head: { key: situation, layers: head(situation, s, t, ctx, talk), bars: null, pulse },
    chest: { key: situation, layers: c.layers, bars: c.bars, pulse },
  };
}
