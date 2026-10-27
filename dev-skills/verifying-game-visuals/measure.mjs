#!/usr/bin/env node
/**
 * Turn "does it look good?" into numbers, and "did I change anything?" into a
 * gate. Adapt the REGIONS map to your framing — that part is project-specific.
 *
 *   node measure.mjs stats shots/base
 *   node measure.mjs stats shots/base --regions=sky,ground
 *   node measure.mjs diff --a=shots/base --b=shots/opt [--tol=1] [--write-diff]
 *
 * Needs pngjs:  npm i -D pngjs
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';

// Resolve pngjs from the PROJECT, not from this script. A bare `import 'pngjs'`
// resolves relative to this file, so running the tool in place from a skills
// directory fails with ERR_MODULE_NOT_FOUND even though the project has pngjs.
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

/**
 * Named regions as fractions of the frame, so they survive resolution changes.
 * Pick them off a real capture, and name them for what they mean, not where they
 * are — "shade" and "sunlit" let you assert a lighting ratio; "topLeft" doesn't.
 */
const REGIONS = {
  sky: [0.40, 0.03, 0.60, 0.13],
  horizon: [0.42, 0.20, 0.58, 0.30],
  ground: [0.40, 0.72, 0.55, 0.82],
  leftWall: [0.05, 0.40, 0.18, 0.60],
  rightWall: [0.82, 0.30, 0.95, 0.50],
  centre: [0.42, 0.42, 0.58, 0.58],
};

function regionMean(png, [x0, y0, x1, y1]) {
  const { width: W, height: H, data } = png;
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = Math.floor(y0 * H); y < Math.floor(y1 * H); y++) {
    for (let x = Math.floor(x0 * W); x < Math.floor(x1 * W); x++) {
      const i = (y * W + x) * 4;
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    }
  }
  return n ? { r: r / n, g: g / n, b: b / n } : { r: 0, g: 0, b: 0 };
}

function stats(dir) {
  const names = readdirSync(dir).filter((f) => f.endsWith('.png') && !f.includes('.diff.')).sort();
  if (!names.length) { console.error(`no PNGs in ${dir}`); process.exit(1); }

  const wanted = args.regions
    ? String(args.regions).split(',').map((s) => s.trim()).filter((k) => REGIONS[k])
    : Object.keys(REGIONS);

  for (const name of names) {
    const png = PNG.sync.read(readFileSync(join(dir, name)));
    const { width: W, height: H, data } = png;
    const hist = new Uint32Array(256);
    let n = 0, sr = 0, sg = 0, sb = 0, maxL = 0, satSum = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const L = lum(r, g, b);
      hist[Math.min(255, Math.round(L))]++;
      n++; sr += r; sg += g; sb += b;
      if (L > maxL) maxL = L;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      satSum += mx > 0 ? (mx - mn) / mx : 0;
    }

    // Percentiles, not just the mean. A mean cannot tell a flat grey frame from
    // a well-exposed one with real range in it.
    const pct = (p) => { let c = 0, t = n * p; for (let i = 0; i < 256; i++) { c += hist[i]; if (c >= t) return i; } return 255; };
    let clipHigh = 0, crushLow = 0;
    for (let i = 250; i < 256; i++) clipHigh += hist[i];
    for (let i = 0; i < 12; i++) crushLow += hist[i];

    console.log(
      `${name.replace('.png', '').padEnd(12)} ` +
      `mean=${(sr / n).toFixed(0)}/${(sg / n).toFixed(0)}/${(sb / n).toFixed(0)} ` +
      `L=${lum(sr / n, sg / n, sb / n).toFixed(1)} sat=${(100 * satSum / n).toFixed(1)}% ` +
      `p1=${pct(0.01)} p50=${pct(0.5)} p99=${pct(0.99)} max=${maxL.toFixed(0)} ` +
      `clipped=${(100 * clipHigh / n).toFixed(3)}% crushed=${(100 * crushLow / n).toFixed(2)}%`,
    );

    const parts = wanted.map((k) => {
      const c = regionMean(png, REGIONS[k]);
      // B-R is a cheap colour-temperature read: positive = cool, negative = warm.
      return `${k}=L${lum(c.r, c.g, c.b).toFixed(0)}(B-R${(c.b - c.r).toFixed(0)})`;
    });
    console.log(`             ${parts.join(' ')}`);

    // Lighting ratio in stops, if both regions were requested. This is the
    // number that says whether the scene is actually lit or just uniformly grey.
    if (wanted.includes('leftWall') && wanted.includes('sky')) {
      const a = regionMean(png, REGIONS.sky), b = regionMean(png, REGIONS.leftWall);
      const stops = Math.log2(Math.max(lum(a.r, a.g, a.b), 1e-6) / Math.max(lum(b.r, b.g, b.b), 1e-6));
      console.log(`             sky:wall = ${stops.toFixed(2)} stops`);
    }
  }
}

/**
 * The gate that enforces "no visual change" during optimisation or refactoring.
 * An optimisation may only land if every shot is pixel-identical to the
 * pre-change baseline, or within an epsilon you can justify out loud.
 */
function diff() {
  const A = resolve(args.a), B = resolve(args.b);
  const TOL = Number(args.tol ?? 0);
  const names = readdirSync(A).filter((f) => f.endsWith('.png') && !f.includes('.diff.')).sort();
  const rows = [];
  let worst = null;

  for (const n of names) {
    const pb = join(B, n);
    if (!existsSync(pb)) { rows.push({ shot: n, status: 'MISSING_IN_B' }); continue; }
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
      const d = Math.max(
        Math.abs(a.data[i] - b.data[i]),
        Math.abs(a.data[i + 1] - b.data[i + 1]),
        Math.abs(a.data[i + 2] - b.data[i + 2]),
      );
      sum += d;
      if (d > maxD) maxD = d;
      const changed = d > TOL;
      if (changed) diffPx++;
      if (out) {
        // Changed pixels hot magenta over a dimmed original, so the eye finds
        // them instantly instead of hunting a subtractive diff.
        out.data[i] = changed ? 255 : a.data[i] >> 2;
        out.data[i + 1] = changed ? 0 : a.data[i + 1] >> 2;
        out.data[i + 2] = changed ? 255 : a.data[i + 2] >> 2;
        out.data[i + 3] = 255;
      }
    }
    if (out) writeFileSync(join(B, n.replace('.png', '.diff.png')), PNG.sync.write(out));

    const pct = (diffPx / total) * 100;
    // changedPx as well as the percentage: one pixel in 1920x1080 is 0.0000482%,
    // which toFixed(4) renders as 0.0000, so a percentage-derived `identical`
    // flag reports TRUE for a frame that demonstrably changed. Count, not ratio.
    const row = { shot: n, changedPx: diffPx, changedPct: +pct.toFixed(4), maxDelta: maxD, meanDelta: +(sum / total).toFixed(3) };
    rows.push(row);
    if (!worst || pct > worst.changedPct) worst = row;
  }

  // From the raw count, not the rounded percentage. A row that failed to compare
  // at all has no changedPx, so `undefined === 0` is false and it cannot pass.
  const identical = rows.every((r) => r.changedPx === 0);
  const clean = rows.every((r) => (r.changedPct ?? 100) < 0.05 && (r.maxDelta ?? 255) <= Math.max(2, TOL));
  console.log(JSON.stringify({ a: A, b: B, tol: TOL, identical, withinEpsilon: clean, worst, rows }, null, 2));
  process.exit(clean ? 0 : 1);
}

if (mode === 'stats') stats(resolve(positional[0] ?? args.dir ?? 'shots/latest'));
else if (mode === 'diff') diff();
else {
  console.error('usage: measure.mjs stats <dir> [--regions=a,b] | measure.mjs diff --a=<dir> --b=<dir> [--tol=N] [--write-diff]');
  process.exit(2);
}
