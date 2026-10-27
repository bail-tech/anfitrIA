#!/usr/bin/env node
/**
 * Numbers for the hero captures, adapted from the verifying-game-visuals skill.
 * Regions come from report.json (projected by the page), so they follow the real framing.
 *
 *   node scripts/visual/measure.mjs stats design/visual/latest/desktop [--budget=calls:150,tris:300000]
 *   node scripts/visual/measure.mjs diff --a=design/visual/baseline/desktop --b=design/visual/latest/desktop [--tol=1] [--write-diff]
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';

const projectRequire = createRequire(resolve(process.cwd(), 'package.json'));
let PNG;
try {
  ({ PNG } = projectRequire('pngjs'));
} catch {
  console.error(`pngjs not resolvable from ${process.cwd()} — run: npm i -D pngjs`);
  process.exit(2);
}

const [mode, ...rest] = process.argv.slice(2);
const args = Object.fromEntries(
  rest.map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  }),
);
const positional = rest.filter((a) => !a.startsWith('--'));
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Pixels of a screen region: mean luminance, share of lit green LEDs, and how green the light is. */
function screenStats(png, rect) {
  if (!rect) return null;
  const { width: W, height: H, data } = png;
  // Inset so the bezel and the rounded corners do not count.
  const ix = (rect.x1 - rect.x0) * 0.12;
  const iy = (rect.y1 - rect.y0) * 0.12;
  let n = 0, sum = 0, lit = 0, gr = 0, gb = 0;
  for (let y = Math.max(0, Math.floor(rect.y0 + iy)); y < Math.min(H, Math.ceil(rect.y1 - iy)); y++) {
    for (let x = Math.max(0, Math.floor(rect.x0 + ix)); x < Math.min(W, Math.ceil(rect.x1 - ix)); x++) {
      const i = (y * W + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      sum += lum(r, g, b);
      n++;
      if (g > 120 && g > r + 40 && g > b + 20) {
        lit++;
        gr += g - r;
        gb += g - b;
      }
    }
  }
  return n ? { px: n, L: +(sum / n).toFixed(1), litPct: +((100 * lit) / n).toFixed(1), greenOverRed: lit ? +(gr / lit).toFixed(0) : 0, greenOverBlue: lit ? +(gb / lit).toFixed(0) : 0 } : null;
}

function stats(dir) {
  const names = readdirSync(dir).filter((f) => f.endsWith('.png') && !f.includes('.diff.')).sort();
  if (!names.length) {
    console.error(`no PNGs in ${dir}`);
    process.exit(1);
  }
  const reportPath = join(dir, 'report.json');
  const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : { shots: [] };
  const budget = Object.fromEntries(
    String(args.budget ?? 'calls:150,tris:300000')
      .split(',')
      .map((kv) => kv.split(':'))
      .map(([k, v]) => [k, Number(v)]),
  );
  let failed = false;

  for (const name of names) {
    const shot = name.replace('.png', '');
    const png = PNG.sync.read(readFileSync(join(dir, name)));
    const { width: W, data } = png;
    const hist = new Uint32Array(256);
    let n = 0, sr = 0, sg = 0, sb = 0;
    for (let i = 0; i < data.length; i += 4) {
      const L = lum(data[i], data[i + 1], data[i + 2]);
      hist[Math.min(255, Math.round(L))]++;
      n++;
      sr += data[i];
      sg += data[i + 1];
      sb += data[i + 2];
    }
    const pct = (p) => {
      let c = 0;
      const t = n * p;
      for (let i = 0; i < 256; i++) if ((c += hist[i]) >= t) return i;
      return 255;
    };
    let clipped = 0;
    for (let i = 250; i < 256; i++) clipped += hist[i];
    console.log(`${shot.padEnd(22)} L=${lum(sr / n, sg / n, sb / n).toFixed(1)} p1=${pct(0.01)} p50=${pct(0.5)} p99=${pct(0.99)} clipped=${((100 * clipped) / n).toFixed(2)}%`);

    const info = report.shots.find((s) => s.shot === shot)?.info;
    if (!info) continue;
    const r = info.regions ?? {};
    const head = screenStats(png, r.head);
    const chest = screenStats(png, r.chest);
    const fmt = (s) => (s ? `L${s.L} lit=${s.litPct}% G-R=${s.greenOverRed} G-B=${s.greenOverBlue}` : 'not visible');
    console.log(`${''.padEnd(22)} head: ${fmt(head)} | chest: ${fmt(chest)}`);
    const letters = Object.entries(r.letters ?? {}).filter(([, rect]) => rect).map(([k]) => k);
    const parts = [`letters visible: ${letters.length ? letters.join(' ') : 'none'}`];
    if (r.blemi) {
      parts.push(`blemi ${r.blemi.x1 - r.blemi.x0}x${r.blemi.y1 - r.blemi.y0}px (${((100 * (r.blemi.y1 - r.blemi.y0)) / (r.stage.y1 - r.stage.y0)).toFixed(0)}% of stage height)`);
      if (r.panel && r.panel.x0 > r.stage.x0 + 1) parts.push(`gap to panel ${((100 * (r.panel.x0 - r.blemi.x1)) / W).toFixed(1)}% of width`);
      else parts.push(`centre offset ${((100 * ((r.blemi.x0 + r.blemi.x1) / 2 - (r.stage.x0 + r.stage.x1) / 2)) / W).toFixed(1)}% of width`);
    }
    const over = Object.entries(budget).filter(([k, v]) => Number.isFinite(v) && info[k] > v);
    if (over.length) failed = true;
    parts.push(`calls=${info.calls} tris=${info.tris} programs=${info.programs}${over.length ? ` OVER BUDGET (${over.map(([k, v]) => `${k}>${v}`).join(', ')})` : ''}`);
    console.log(`${''.padEnd(22)} ${parts.join(' | ')}`);
  }
  if (failed) process.exit(1);
}

/** The gate for "no visual change": every shot pixel-identical, or within an epsilon you can justify. */
function diff() {
  const A = resolve(args.a), B = resolve(args.b);
  const TOL = Number(args.tol ?? 0);
  const names = readdirSync(A).filter((f) => f.endsWith('.png') && !f.includes('.diff.')).sort();
  const rows = [];
  let worst = null;
  for (const n of names) {
    const pb = join(B, n);
    if (!existsSync(pb)) {
      rows.push({ shot: n, status: 'MISSING_IN_B' });
      continue;
    }
    const a = PNG.sync.read(readFileSync(join(A, n)));
    const b = PNG.sync.read(readFileSync(pb));
    if (a.width !== b.width || a.height !== b.height) {
      rows.push({ shot: n, status: 'SIZE_MISMATCH', a: `${a.width}x${a.height}`, b: `${b.width}x${b.height}` });
      continue;
    }
    let diffPx = 0, sum = 0, maxD = 0;
    const total = a.width * a.height;
    const out = args['write-diff'] ? new PNG({ width: a.width, height: a.height }) : null;
    for (let i = 0; i < a.data.length; i += 4) {
      const d = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2]));
      sum += d;
      if (d > maxD) maxD = d;
      const changed = d > TOL;
      if (changed) diffPx++;
      if (out) {
        out.data[i] = changed ? 255 : a.data[i] >> 2;
        out.data[i + 1] = changed ? 0 : a.data[i + 1] >> 2;
        out.data[i + 2] = changed ? 255 : a.data[i + 2] >> 2;
        out.data[i + 3] = 255;
      }
    }
    if (out) writeFileSync(join(B, n.replace('.png', '.diff.png')), PNG.sync.write(out));
    const row = { shot: n, changedPx: diffPx, changedPct: +((diffPx / total) * 100).toFixed(4), maxDelta: maxD, meanDelta: +(sum / total).toFixed(3) };
    rows.push(row);
    if (!worst || row.changedPct > worst.changedPct) worst = row;
  }
  // From the raw count, not the rounded percentage; a row that failed to compare has no changedPx.
  const identical = rows.every((r) => r.changedPx === 0);
  const clean = rows.every((r) => (r.changedPct ?? 100) < 0.05 && (r.maxDelta ?? 255) <= Math.max(2, TOL));
  console.log(JSON.stringify({ a: A, b: B, tol: TOL, identical, withinEpsilon: clean, worst, rows }, null, 2));
  process.exit(clean ? 0 : 1);
}

if (mode === 'stats') stats(resolve(positional[0] ?? args.dir ?? 'design/visual/latest'));
else if (mode === 'diff') diff();
else {
  console.error('usage: measure.mjs stats <dir> [--budget=calls:150,tris:300000] | measure.mjs diff --a=<dir> --b=<dir> [--tol=N] [--write-diff]');
  process.exit(2);
}
