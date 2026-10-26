/**
 * Anfi's screen face, drawn on a 2D canvas each frame (also used as the 3D screen texture).
 * The expression follows the assistant state; the mouth follows the voice level.
 */
export type Mood = 'idle' | 'listening' | 'thinking' | 'working' | 'talking' | 'approval' | 'done' | 'error';

const SCREEN_BG = '#1f2a2e';
const GLOW = '#9fe3c2';
const AMBER = '#f2c46d';
const RED = '#f08c6b';

export function drawFace(ctx: CanvasRenderingContext2D, size: number, mood: Mood, t: number, level = 0) {
  const s = size;
  ctx.clearRect(0, 0, s, s);
  ctx.fillStyle = SCREEN_BG;
  roundRect(ctx, 0, 0, s, s, s * 0.18);
  ctx.fill();

  const color = mood === 'approval' ? AMBER : mood === 'error' ? RED : GLOW;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineWidth = s * 0.05;
  ctx.shadowColor = color;
  ctx.shadowBlur = s * 0.06;

  // Eyes
  const blink = Math.sin(t * 0.9) > 0.985 ? 0.15 : 1;
  const lookX = mood === 'thinking' ? s * 0.05 : 0;
  const lookY = mood === 'thinking' ? -s * 0.05 : 0;
  const eyeR = s * (mood === 'listening' ? 0.085 : 0.07);
  for (const x of [0.33, 0.67]) {
    const cx = s * x + lookX;
    const cy = s * 0.42 + lookY;
    if (mood === 'done') {
      ctx.beginPath();
      ctx.arc(cx, cy + s * 0.03, eyeR, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.ellipse(cx, cy, eyeR, eyeR * blink, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Mouth
  const my = s * 0.7;
  ctx.beginPath();
  if (mood === 'talking' || level > 0.04) {
    const open = Math.min(1, level * 2.2 + 0.15 + Math.abs(Math.sin(t * 9)) * (level > 0.04 ? 0 : 0.25));
    ctx.ellipse(s * 0.5, my, s * 0.11, s * 0.02 + s * 0.08 * open, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (mood === 'thinking' || mood === 'working') {
    for (let i = 0; i < 3; i++) {
      const a = 0.35 + 0.65 * Math.max(0, Math.sin(t * 5 - i * 0.9));
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(s * (0.4 + i * 0.1), my, s * 0.025, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else if (mood === 'error') {
    ctx.moveTo(s * 0.38, my + s * 0.02);
    ctx.quadraticCurveTo(s * 0.5, my - s * 0.05, s * 0.62, my + s * 0.02);
    ctx.stroke();
  } else if (mood === 'approval') {
    ctx.moveTo(s * 0.4, my);
    ctx.lineTo(s * 0.6, my);
    ctx.stroke();
    ctx.font = `bold ${s * 0.16}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('!', s * 0.86, s * 0.25);
  } else {
    ctx.moveTo(s * 0.37, my - s * 0.02);
    ctx.quadraticCurveTo(s * 0.5, my + s * (mood === 'done' ? 0.09 : 0.06), s * 0.63, my - s * 0.02);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;

  if (mood === 'listening') {
    ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t * 4);
    ctx.lineWidth = s * 0.02;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(s * 0.5 + side * s * 0.36, s * 0.42, s * 0.06, side < 0 ? Math.PI * 0.6 : -Math.PI * 0.4, side < 0 ? Math.PI * 1.4 : Math.PI * 0.4);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
