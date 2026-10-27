#!/usr/bin/env node
/**
 * Deterministic captures of the hero (Blemi, the wordmark and the chat panel), adapted from the
 * verifying-game-visuals skill for a Next app. Run `npm run build` first; this starts `next start`
 * unless something already listens on the port.
 *
 *   --isolated   a fresh page per shot. Slower, byte-comparable: use for baselines and diffs.
 *   (default)    one page for all shots. Fast; fine for eyeballing, not a regression gate.
 *
 * The page exposes (src/components/blemi/capture.ts):
 *   __READY__  __SHOTS__  __APPLY_SHOT__  __PUMP__  __PRESENT__  __RENDER_INFO__
 *
 *   node scripts/visual/capture.mjs --out=design/visual/latest/desktop --isolated
 *   node scripts/visual/capture.mjs --w=390 --h=844 --shots=mobile-blemi --out=design/visual/latest/mobile
 *   node scripts/visual/capture.mjs --list
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import net from 'node:net';
import { createRequire } from 'node:module';

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

const PORT = Number(args.port ?? 3100);
const W = Number(args.w ?? 1440);
const H = Number(args.h ?? 900);
// Frames pumped after a shot is applied. Short on purpose: "paid" only lasts 2.5 s and a
// streamed reply about 1.2 s, and __APPLY_SHOT__ already warms the transitions up.
const SETTLE = Number(args.settle ?? 24);
const OUTDIR = resolve(args.out ?? 'design/visual/latest');
const ROOT = resolve(args.root ?? process.cwd());
const PATH = String(args.path ?? '/en');
const TIMEOUT = Number(args.timeout ?? 90000);

// `localhost`, not 127.0.0.1: on macOS it resolves to ::1 first.
const portOpen = (p) =>
  new Promise((res) => {
    const s = net.connect({ port: p, host: 'localhost' }, () => (s.destroy(), res(true)));
    s.on('error', () => res(false));
    s.setTimeout(400, () => (s.destroy(), res(false)));
  });

const stop = (p) => {
  try {
    process.kill(-p.pid, 'SIGTERM');
  } catch {
    p.kill();
  }
};

/** Start the production server only if nothing is already listening. No HMR, so nothing reloads mid-run. */
async function ensureServer() {
  if (await portOpen(PORT)) return null;
  // Own process group: `next start` forks next-server, and only killing the group stops both.
  const p = spawn(resolve(ROOT, 'node_modules/.bin/next'), ['start', '--port', String(PORT)], { cwd: ROOT, stdio: 'ignore', env: process.env, detached: true });
  for (let i = 0; i < 240; i++) {
    await new Promise((r) => setTimeout(r, 250));
    if (await portOpen(PORT)) return p;
  }
  stop(p);
  throw new Error(`next start did not come up on ${PORT}`);
}

const server = await ensureServer();

// System Chrome: the network proxy blocks Playwright's own browser download.
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: [
    process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=gl',
    '--ignore-gpu-blocklist',
    '--enable-gpu-rasterization',
    '--disable-frame-rate-limit',
    '--force-color-profile=srgb',
    '--force-device-scale-factor=1',
    '--hide-scrollbars',
    '--mute-audio',
  ],
});

const url = (shot) => `http://localhost:${PORT}${PATH}?capture=1&lockstep=1${shot ? `&shot=${encodeURIComponent(shot)}` : ''}`;

async function openPage() {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
  const logs = [];
  page.on('console', (m) => m.type() !== 'debug' && logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  return { page, logs };
}

async function boot(page) {
  await page.goto(url(), { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  await page.waitForFunction('window.__READY__ === true', null, { timeout: TIMEOUT });
}

/** Capture one shot on an already-booted page. */
async function shoot(page, name) {
  const applied = await page.evaluate((s) => window.__APPLY_SHOT__(s), name);
  // LOCKSTEP: the page runs no frame loop, so the frame at the shutter is the same on every run.
  await page.evaluate((n) => window.__PUMP__(n), SETTLE);
  await page.evaluate(() => window.__PRESENT__?.(2));
  mkdirSync(OUTDIR, { recursive: true });
  await page.screenshot({ path: `${OUTDIR}/${name}.png`, type: 'png' });
  const info = await page.evaluate(() => window.__RENDER_INFO__ ?? null);
  return { shot: name, ok: !applied?.error, error: applied?.error, info };
}

const report = { ok: true, outDir: OUTDIR, size: `${W}x${H}`, settle: SETTLE, isolated: !!args.isolated, shots: [], errors: [] };
const problems = (logs) => logs.filter((l) => /pageerror|\[error\]/.test(l));

try {
  const { page: probe } = await openPage();
  await boot(probe);
  const all = await probe.evaluate(() => Object.keys(window.__SHOTS__ ?? {}));
  const docs = await probe.evaluate(() => window.__SHOTS__ ?? {});
  await probe.close();

  if (args.list) {
    console.log(JSON.stringify(docs, null, 2));
  } else {
    const wanted = args.shots ? String(args.shots).split(',').map((s) => s.trim()) : all;
    if (!wanted.length) throw new Error('no shots defined — expose window.__SHOTS__');

    if (args.isolated) {
      for (const name of wanted) {
        const { page, logs } = await openPage();
        try {
          await boot(page);
          report.shots.push({ ...(await shoot(page, name)), doc: docs[name]?.doc, logs: problems(logs) });
        } catch (e) {
          report.ok = false;
          report.shots.push({ shot: name, ok: false, error: e.message, logs });
        } finally {
          await page.close();
        }
      }
    } else {
      const { page, logs } = await openPage();
      await boot(page);
      for (const name of wanted) {
        try {
          report.shots.push({ ...(await shoot(page, name)), doc: docs[name]?.doc });
        } catch (e) {
          report.ok = false;
          report.shots.push({ shot: name, ok: false, error: e.message });
        }
      }
      report.errors.push(...problems(logs));
      await page.close();
    }
  }
} catch (e) {
  report.ok = false;
  report.errors.push(e.message);
} finally {
  await browser.close();
  if (server) stop(server);
}

report.errors.push(...report.shots.flatMap((s) => s.logs ?? []));
if (report.shots.some((s) => !s.ok)) report.ok = false;
if (!args.list) {
  mkdirSync(OUTDIR, { recursive: true });
  writeFileSync(`${OUTDIR}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: report.ok, outDir: report.outDir, size: report.size, shots: report.shots.map((s) => ({ shot: s.shot, ok: s.ok, error: s.error, calls: s.info?.calls, tris: s.info?.tris })), errors: report.errors }, null, 2));
}
if (!report.ok) process.exit(1);
