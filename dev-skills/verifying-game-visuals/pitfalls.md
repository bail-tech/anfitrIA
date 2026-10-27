# Pitfalls

Failures that are invisible to reasoning and expensive to diagnose. Each was found
by measurement, not by thinking harder.

## Determinism

### The page's own frame loop
`requestAnimationFrame` is throttled to zero when the window is hidden or
backgrounded. A headless capture can advance **no frames at all** between your
commands, so state you set never takes effect and reads come back stale. With a
live loop, `page.evaluate` round trips and the screenshot land on unpredictable
frame numbers. Never run a loop during capture; pump frames by hand.

Symptom: a value you just wrote reads back unchanged; a keypress appears to do
nothing; the same capture differs run to run.

### Synthesised time, not wall-clock
`__PUMP__` must hand the engine a computed timestamp (`frame * FIXED_DT`), not
`performance.now()`. A real delta reintroduces exactly the nondeterminism the pump
exists to remove.

### Page reuse leaks state forward
One page for many shots leaks particle age, decal ring buffers, animation phase
and auto-exposure adaptation into every subsequent shot. Two runs then agree on the
first shot and differ on all the rest. Fresh page per shot whenever you intend to
byte-compare.

### Hot module reload
A file saved mid-run — by you, a watcher, or a concurrent agent — reloads the page
and destroys the JS context. Every later `page.evaluate` fails with a confusing
"execution context was destroyed". Disable HMR in the capture environment.

### The compositor lags the renderer
Screenshotting immediately after the last pumped frame can capture the *previous*
frame. Yield two rAFs with the simulation frozen (`__PRESENT__(2)`) before the
shutter.

### Temporal accumulators need an explicit reset
TAA history and exposure adaptation carry across shots. Expose a reset hook and
call it after applying a shot, before pumping, so accumulation always converges
from the same phase.

### Colour and scale must be pinned
Without `--force-color-profile=srgb` and `--force-device-scale-factor=1`, captures
are not comparable across machines or even across display configurations.

### Software vs hardware WebGL
SwiftShader changes timing by an order of magnitude and, on some drivers,
filtering. Any duration-based assertion becomes a benchmark of the host. Prefer a
real GPU for capture; if you cannot have one, assert on state and pumped frame
counts only, never elapsed time.

## Input driven from tests

### Writing simulated state the engine overwrites
If the simulation assigns a field from input every tick — `player.yaw = input.yaw`
— then writing `player.yaw` from a test is overwritten within one frame. The test
may still pass for an unrelated reason, which makes it worse than a failure.

Check what the tick actually assigns. Drive the input layer, or choose an initial
condition that produces the state you want. Targeting by **position** rather than
orientation is often robust: derive a location where the intended target is the
only one satisfying the game's own selection rule, then assert the selection
matches before proceeding.

### Presses racing the tick
Edge-triggered actions are consumed once per tick. Dispatching several in one
turn, or reading state in the same turn you dispatched, races the simulation. Pump
frames between presses and assert the resulting state before the next press.

### Actions dropped by an early return
A tick that handles one action and returns will silently discard others queued in
the same frame. If two keys land in one tick and only the first takes effect,
that is usually correct behaviour, not a bug — press them in separate frames.

## Assertions that cannot fail

### A group's bounding box is not evidence its geometry is visible
Shrinking two spheres to radius 0 leaves the parent group's bounding box spanning
the gap between them. A group-level volume check reads healthy while nothing is
there. Assert per-child extents.

### Coordinates and camera parameters, asserted separately
Geometry inside the right volume, plus a camera with the right FOV, does not imply
the geometry is on screen. Both can be individually correct and mutually
contradictory. Project through the real camera and assert on NDC.

### In-frame is not the same as visible
Sub-pixel geometry passes a frustum check and is invisible. Add a screen-extent
floor — a few percent of the viewport.

### Fully-contained is the wrong bar
Requiring every bounding-box corner in frame forces a FOV so wide it stops being a
zoom. Assert the centre is inside with margin, plus a size floor.

### Text assertions that check what the code already emits
Asserting the HUD contains a string it demonstrably contains proves nothing about
whether the player has enough information to decide. For each failure mode the
player must detect, name the thing they read to detect it, then assert *that* is
rendered.

## Three.js specifics

### `updateProjectionMatrix()` after changing FOV
Three caches the projection. Without the call, `camera.fov` reads correctly and
the rendered image never changes. Assert on `projectionMatrix.elements`, because a
FOV assertion passes with the call removed.

### Visible point-light count is a shader permutation key
Three bakes the number of **visible** point lights into every material's program
cache key. One lamp crossing its cull radius therefore recompiles every lit
material in the scene — measured at +33 to +36 programs and 640–900 ms on a single
frame. Keep the visible count constant: drive `intensity` to 0 and leave
`visible` true, or park zero-intensity ballast lights and top up to a fixed slot
budget. A light whose colour × intensity is exactly 0 adds `0.0` to the irradiance
accumulator, so extra lit slots cannot move a pixel.

### Shadow passes with `overrideMaterial` ignore `castShadow`
If cascades draw with `scene.overrideMaterial`, `mesh.castShadow` is never
consulted. Use one explicit opt-out flag and honour it during collection.

### Pre-warming compiles the wrong variant
`renderer.compileAsync(scene, camera)` reaches only the forward lit variant — not
the shadow depth pass, the prepass, or the post chain. Worse, `outputColorSpace`
and `toneMapping` are part of the cache key and are read off the *currently bound*
render target, so compiling with the canvas bound warms a variant the game never
uses. Bind the real target while compiling.

### A disposed material is still a usable object outside a browser
"Does not throw" cannot detect that a shared material was freed. `THREE.Material`
extends `EventDispatcher` and `dispose()` emits a `'dispose'` event, so listen for
it. Always pair such a test with one asserting the per-object resource **is**
disposed, or the guard is satisfied by disposing nothing at all.

## Performance

### Frame-time percentiles, on known hardware
Median alone hides stalls. Report median and p95 over a few hundred frames after a
warm-up, at fixed resolutions, plus draw calls and triangle count. Draw calls and
triangles are the most sensitive cheap regression signal — they change before
anything is visible to the eye.

### Capture-based tests cannot detect "10× slower"
A state-waiting harness deliberately ignores wall-clock time, so it cannot see the
game becoming much slower. That needs a separate benchmark on known hardware. Know
which of your gates covers which failure, and say so.

### Unbounded catch-up after a stall is a death spiral
Capping simulation steps per frame and discarding the backlog makes the game run
*slow* rather than *stuttery* under load. That is a deliberate trade — anyone
retuning the cap should know which failure mode they are choosing.
