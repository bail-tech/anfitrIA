#!/usr/bin/env node
/**
 * Deterministic frame capture for a browser game. Adapt, don't rewrite.
 *
 * Two modes, and the difference matters:
 *
 *   --isolated   a fresh page per shot. Slower, byte-comparable. Use for
 *                baselines and pixel diffs. Reusing one page leaks particle
 *                age, decal buffers, animation phase and auto-exposure state
 *                forward, which is why re-runs differ on every shot but the
 *                first.
 *   (default)    one page for all shots. Fast; fine for eyeballing, useless
 *                for a regression gate.
 *
 * Requires these hooks on the page (see SKILL.md):
 *   __READY__  __SHOTS__  __APPLY_SHOT__  __PUMP__  __PRESENT__
 *   __RESET_TEMPORAL__ (optional)  __RENDER_INFO__ (optional)
 *
 *   node capture.mjs --out=shots/base --isolated
 *   node capture.mjs --shots=hero,detail --out=/tmp/look
 *   node capture.mjs --list
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import net from 'node:net';
import { createRequire } from 'node:module';

// Resolve playwright from the PROJECT, not from this script. A bare
// `import 'playwright'` resolves relative to this file, so running the tool in
// place from a skills directory fails even though the project has playwright.
const projectRequire = createRequire(resolve(process.cwd(), 'package.json'));
let chromium;
try {
  ({ chromium } = projectRequire('playwright'));
} catch {
  console.error(`playwright not resolvable from ${process.cwd()} — run: npm i -D playwright`);
  process.exit(2);
}

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  }),
);

const PORT = Number(args.port ?? 5173);
const W = Number(args.w ?? 1920);
const H = Number(args.h ?? 1080);
// Frames pumped before the shutter: lets temporal effects converge from a known
// phase. Too few and TAA is still dithering; too many just costs time.
const SETTLE = Number(args.settle ?? 90);
const OUTDIR = resolve(args.out ?? 'shots/latest');
const ROOT = resolve(args.root ?? process.cwd());
const DEV = args.dev ?? 'node_modules/.bin/vite';
const TIMEOUT = Number(args.timeout ?? 90000);

// `localhost`, not '127.0.0.1'. Vite binds to localhost, which on macOS resolves
// to IPv6 ::1 first — probing IPv4 gets ECONNREFUSED and the tool concludes the
// server never started, even though it is serving fine. Verified: ::1 OPEN,
// 127.0.0.1 ECONNREFUSED.
const portOpen = (p) =>
  new Promise((res) => {
    const s = net.connect({ port: p, host: 'localhost' }, () => (s.destroy(), res(true)));
    s.on('error', () => res(false));
    s.setTimeout(400, () => (s.destroy(), res(false)));
  });

/** Start the dev server only if nothing is already listening. */
async function ensureServer() {
  if (await portOpen(PORT)) return null;
  const p = spawn(resolve(ROOT, DEV), ['--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore',
    // HMR OFF. A file saved mid-run — by you or a concurrent agent — reloads the
    // page, and every later page.evaluate fails with a destroyed context.
    env: { ...process.env, NO_HMR: '1', VITE_NO_HMR: '1' },
  });
  for (let i = 0; i < 160; i++) {
    await new Promise((r) => setTimeout(r, 250));
    if (await portOpen(PORT)) return p;
  }
  p.kill();
  throw new Error(`dev server did not come up on ${PORT}`);
}

const server = await ensureServer();

const browser = await chromium.launch({
  headless: true,
  args: [
    // Real GPU, not SwiftShader: software WebGL changes both timing and, for
    // some drivers, filtering. Drop --use-angle on Linux/Windows.
    process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=gl',
    '--ignore-gpu-blocklist',
    '--enable-gpu-rasterization',
    '--disable-frame-rate-limit',
    // Colour and scale must be pinned or captures are not comparable at all.
    '--force-color-profile=srgb',
    '--force-device-scale-factor=1',
    '--hide-scrollbars',
    '--mute-audio',
  ],
});

const url = (shot) =>
  `http://localhost:${PORT}/?capture=1&lockstep=1${shot ? `&shot=${encodeURIComponent(shot)}` : ''}`;

async function openPage() {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const logs = [];
  page.on('console', (m) => m.type() !== 'debug' && logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  return { page, logs };
}

/** Capture one shot on an already-booted page. */
async function shoot(page, name) {
  const applied = await page.evaluate((s) => window.__APPLY_SHOT__(s), name);

  // Drop temporal history so accumulation starts from a known phase, otherwise
  // the previous shot's exposure and TAA state bleed into this one.
  await page.evaluate(() => window.__RESET_TEMPORAL__?.());

  // LOCKSTEP. The page runs no frame loop of its own, so nothing advances
  // during the round trips above or during the screenshot below. The frame
  // index at the shutter is therefore identical on every run and machine.
  await page.evaluate((n) => window.__PUMP__(n), SETTLE);

  // Yield rAFs with the simulation frozen, so the compositor has certainly
  // picked up the last rendered frame before the shutter.
  await page.evaluate(() => window.__PRESENT__?.(2));

  mkdirSync(OUTDIR, { recursive: true });
  await page.screenshot({ path: `${OUTDIR}/${name}.png`, type: 'png' });
  const info = await page.evaluate(() => window.__RENDER_INFO__ ?? null);
  return { shot: name, ok: !applied?.error, info };
}

const report = { ok: true, outDir: OUTDIR, size: `${W}x${H}`, settle: SETTLE, isolated: !!args.isolated, shots: [], errors: [] };

try {
  // Discover the shot list from a throwaway page.
  const { page: probe } = await openPage();
  await probe.goto(url(), { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  await probe.waitForFunction('window.__READY__ === true', null, { timeout: TIMEOUT });
  const all = await probe.evaluate(() => Object.keys(window.__SHOTS__ ?? {}));
  await probe.close();

  if (args.list) {
    console.log(JSON.stringify(all, null, 2));
  } else {
    const wanted = args.shots ? String(args.shots).split(',').map((s) => s.trim()) : all;
    if (!wanted.length) throw new Error('no shots defined — expose window.__SHOTS__');

    if (args.isolated) {
      for (const name of wanted) {
        const { page, logs } = await openPage();
        try {
          await page.goto(url(name), { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
          await page.waitForFunction('window.__READY__ === true', null, { timeout: TIMEOUT });
          report.shots.push({ ...(await shoot(page, name)), logs: logs.filter((l) => /pageerror|\[error\]/.test(l)) });
        } catch (e) {
          report.ok = false;
          report.shots.push({ shot: name, ok: false, error: e.message, logs });
        } finally {
          await page.close();
        }
      }
    } else {
      const { page, logs } = await openPage();
      await page.goto(url(), { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
      await page.waitForFunction('window.__READY__ === true', null, { timeout: TIMEOUT });
      for (const name of wanted) {
        try {
          report.shots.push(await shoot(page, name));
        } catch (e) {
          report.ok = false;
          report.shots.push({ shot: name, ok: false, error: e.message });
        }
      }
      report.errors.push(...logs.filter((l) => /pageerror|\[error\]/.test(l)));
      await page.close();
    }
  }
} catch (e) {
  report.ok = false;
  report.errors.push(e.message);
} finally {
  await browser.close();
  if (server) server.kill();
}

report.errors.push(...report.shots.flatMap((s) => s.logs ?? []));
if (!args.list) {
  mkdirSync(OUTDIR, { recursive: true });
  writeFileSync(`${OUTDIR}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
if (!report.ok) process.exit(1);
