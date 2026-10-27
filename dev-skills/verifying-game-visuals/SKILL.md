---
name: verifying-game-visuals
description: Use when a change to a browser game or canvas/WebGL app is only verifiable by looking at it — a mechanic the player must be able to notice, a HUD cue, camera framing, lighting or shader work, or a render optimisation that must not alter pixels. Also when the unit suite is green but nobody has confirmed the thing is actually on screen, when captured frames differ between runs, or when test-driven input races the simulation tick.
---

# Verifying Game Visuals

## Overview

A green test suite cannot see the screen. Every assertion checks something the code *does*; none asks whether the player can *see* what they need.

**Core principle: make the frame reproducible, then assert on the projection — never on the coordinates and constants that produce it.**

Two shipped failures, both with a fully green suite. An expiry mechanic was unjudgeable because the current day was never rendered. Three monster tells were invisible: the camera aimed 0.05 m above the passenger's head while a held card occluded the rest — anomaly positions were asserted against the body volume and FOV against a number, each correct alone, contradictory together. 400 tests passed; a human looking at the game found both.

## When to use

- A mechanic's point is that the player notices something
- A HUD element must be present **and** legible
- Camera, lighting, shader, material or post work
- Optimising or refactoring rendering, where pixels must not move
- Captured frames differ between runs, or test input races the tick

Not for pure logic — the unit suite is faster and stricter there.

## The iron rule: lockstep, or it is not a test

**During capture the page must not run its own frame loop.** Expose a pump and advance frames by hand.

`requestAnimationFrame` is throttled to zero when a window is hidden, so a headless capture may advance no frames between commands. With a live loop, `page.evaluate` round trips and the screenshot land on unpredictable frames, so the shutter fires at a different simulation state every run.

```js
// Capture mode only. Do NOT start the rAF loop.
// Synthesised timestamp, never performance.now() — a wall-clock delta
// reintroduces the nondeterminism the pump exists to remove.
window.__PUMP__ = (n) => { for (let i = 0; i < n; i++) engine.step(engine.time.frame * FIXED_DT); };
window.__PRESENT__ = (n) => new Promise((d) => {
  let i = 0; const t = () => (++i >= n ? d() : requestAnimationFrame(t)); requestAnimationFrame(t);
});
```

## Hooks the game must expose

Add once; every harness is then generic.

| Hook | Purpose |
|---|---|
| `window.__READY__` | `true` once boot finished and the first frame drew |
| `window.__SHOTS__` | Named framings, discoverable by a harness |
| `window.__APPLY_SHOT__(name)` | Pose camera and state; **freeze input** |
| `window.__PUMP__(n)` | Advance exactly `n` frames. No rAF loop in capture mode |
| `window.__PRESENT__(n)` | Yield `n` rAFs, sim frozen, so the compositor has the final frame |
| `window.__RESET_TEMPORAL__()` | Drop TAA history, snap exposure |
| `window.__RENDER_INFO__` | `{ calls, tris }` — cheap, sensitive regression signal |
| `window.__STATE__` | Live sim state, read-only, for waiting on conditions |

A *shot* is `{ pos, look, fov, time, apply(engine), doc }`. `doc` states what the shot is **for** ("close detail — texel density and grime"), so reviewers know what they are judging and the set stays comparable across iterations. Ad-hoc poses make two captures incomparable, which destroys the regression gate.

## Quick reference

| Need | Tool | Gate |
|---|---|---|
| Does it look right? | `capture.mjs` | Review the PNGs |
| Is it objectively lit and exposed? | `measure.mjs stats` | Percentiles, clipping %, region ratios in stops |
| Did an optimisation move pixels? | `measure.mjs diff` | Pixel-identical, or a justified epsilon; exits non-zero |
| Does the game still work? | Smoke playtest | Input moves the player, events fire, no NaN transforms |
| Is it fast? | Frame-time median and p95 | Fixed resolutions, after warm-up, known hardware |

`capture.mjs` and `measure.mjs` here are working tools — adapt, don't rewrite. Both resolve their deps from the project's `node_modules`, so they run in place. Use `--isolated` for anything you intend to byte-compare.

## Assert the projection, not the coordinates

The highest-value technique, and the one that catches the failure above. Never assert geometry sits in a volume and, separately, that the camera has some FOV — both can be right while disagreeing. Project through the real camera:

```js
framePassenger(camera, wagonIndex, seat, monocleRaised, SCENE_FOV);
camera.updateMatrixWorld(true);
const ndc = box.getCenter(new THREE.Vector3()).project(camera);

expect(Math.abs(ndc.x)).toBeLessThan(0.85);            // in frame, with margin
expect(Math.abs(ndc.y)).toBeLessThan(0.85);
expect(Math.max(spanX, spanY)).toBeGreaterThan(0.08);  // ≥4% of viewport
```

Both bars are necessary. **In-frame is not visible** — sub-pixel geometry passes a frustum check. **Fully-contained is the wrong bar** — a zoom crops by design, and demanding every corner be visible forces a FOV that stops being a zoom.

This runs in the unit suite under Node. Three.js computes the projection; never re-derive the matrix algebra by hand.

## Before claiming it works

Read `pitfalls.md` when any of these bite — each cost hours and none is reachable by reasoning: page reuse leaking exposure and particle state between shots, HMR destroying the JS context mid-run, simulated state the tick overwrites every frame, a group bounding box that looks healthy around invisible geometry, `updateProjectionMatrix()`, and why one lamp crossing its cull radius recompiles every material in the scene.

## Red flags

- About to say "verified" with no captured frame and no number
- Asking the user to check whether something looks right
- A visual assertion that would still pass if the geometry were invisible
- A harness with no pump, or `waitForTimeout` standing in for one
- An optimisation landing without a pixel diff against a pre-change baseline
