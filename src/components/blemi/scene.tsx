'use client';
/* eslint-disable react-hooks/immutability, react-hooks/refs -- Blemia's scene as shipped: R3F mutates three.js
   objects and reads per-frame refs inside useFrame by design. */

import { Suspense, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Environment, Lightformer, PerformanceMonitor, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { captureEnabled, captureHooks } from './capture';
import { advanceClock, nowMs } from './clock';
import { frameCamera } from './framing';
import type { StageLayout } from './layout';
import { CHEST_GRID, HEAD_GRID } from './pixel-art';
import { LETTER_NAMES, MODEL_URL, OFFSET_X, RIG, STORY_POP_FRAME, type BlemiMode, type ClipName } from './rig';
import { applyFrame, createScreenMaterial, type ScreenMaterial } from './screen-material';
import { IDLE_SIGNALS, pickScreens, type ScreenSignals, type Situation } from './screen-state';
import { Sparks, type SparksHandle } from './sparks';

export type BlemiFocus = 'wordmark' | 'blemi';

export type BlemiSceneProps = {
  mode: BlemiMode;
  focus?: BlemiFocus;
  /** What the screens show, read every frame. */
  signals?: RefObject<ScreenSignals>;
  /** Where the chat panel starts, read every frame. */
  layout?: RefObject<StageLayout>;
  onReady?: () => void;
  onBlemiClick?: () => void;
};

const FPS = RIG.fps;
/** Seconds for the camera to zoom between the wordmark and Blemi. */
const ZOOM_SECONDS = 0.9;
const LETTER_POP = 0.35;
const LETTER_STAGGER = 0.06;
const BACK = 1.70158;
const backIn = (t: number) => (BACK + 1) * t ** 3 - BACK * t ** 2;
const backOut = (t: number) => 1 + (BACK + 1) * (t - 1) ** 3 + BACK * (t - 1) ** 2;
const smooth = (t: number) => t * t * (3 - 2 * t);
const STORY_LANDED_AT = 1.5;
const BUSY = new Set<Situation>(['thinking', 'searching', 'reading', 'wallet', 'receipts', 'tool', 'paying']);
const loopFor = (s: Situation): ClipName => (BUSY.has(s) ? 'working' : 'idle');
/** Blemi waves when a run finishes or a payment lands. */
const CHEERS = new Set<Situation>(['done', 'paid']);

const MATERIAL_TUNING: Record<string, Partial<THREE.MeshPhysicalMaterial>> = {
  BlemiEmerald: { roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06 },
  BlemiRoyal: { roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06 },
  BlemiWhite: { roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.1 },
  BlemiSilver: { metalness: 1, roughness: 0.22, clearcoat: 0 },
  BlemiSocket: { metalness: 0.6, roughness: 0.45, clearcoat: 0 },
  BlemiMint: { emissiveIntensity: 2.2, clearcoat: 0.4 },
};

function isBlemiPart(object: THREE.Object3D | null): boolean {
  for (let o = object; o; o = o.parent) if (o.name === 'Blemi') return true;
  return false;
}

function useWindowPointer(target: RefObject<HTMLElement | null>) {
  const pointer = useRef(new THREE.Vector2());
  useEffect(() => {
    if (captureEnabled()) return;
    const move = (e: PointerEvent) => {
      const el = target.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      pointer.current.set(
        THREE.MathUtils.clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1.5, 1.5),
        THREE.MathUtils.clamp(-(((e.clientY - r.top) / r.height) * 2 - 1), -1.5, 1.5),
      );
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => window.removeEventListener('pointermove', move);
  }, [target]);
  return pointer;
}

function Blemi({ mode, focus = 'wordmark', signals, layout, onReady, onBlemiClick, pointer }: BlemiSceneProps & { pointer: RefObject<THREE.Vector2> }) {
  const gltf = useGLTF(MODEL_URL, false, true);
  const { camera, size } = useThree();
  const sparks = useRef<SparksHandle>(null);

  const rig = useMemo(() => {
    const scene = gltf.scene;
    // The glTF scene is cached and shared, so reuse a screen material that is already installed.
    const screenOn = (name: string, grid: { w: number; h: number }) => {
      const mesh = scene.getObjectByName(name) as THREE.Mesh;
      if (!(mesh.material as THREE.ShaderMaterial).isShaderMaterial) mesh.material = createScreenMaterial(grid);
      mesh.castShadow = false;
      return { material: mesh.material as ScreenMaterial, key: '' };
    };
    const screens = { head: screenOn('Screen', HEAD_GRID), chest: screenOn('ChestScreen', CHEST_GRID) };
    let emerald: THREE.Material | null = null;
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || mesh.name === 'Screen' || mesh.name === 'ChestScreen') return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const m = mesh.material as THREE.MeshPhysicalMaterial;
      const tuning = MATERIAL_TUNING[m.name];
      if (tuning) Object.assign(m, tuning);
      if (m.name === 'BlemiEmerald') emerald = m;
    });
    const mixer = new THREE.AnimationMixer(scene);
    const timeline = new THREE.AnimationClip('timeline', -1, gltf.animations.flatMap((c) => c.tracks));
    const actions = Object.fromEntries(
      (Object.entries(RIG.clips) as [ClipName, number[]][]).map(([name, [start, end]]) => [
        name,
        mixer.clipAction(THREE.AnimationUtils.subclip(timeline, name, start, end + 1, FPS)),
      ]),
    ) as Record<ClipName, THREE.AnimationAction>;
    const hips = scene.getObjectByName('Hips');
    const head = scene.getObjectByName('HeadGroup');
    // Letters shrink and grow about the middle of their base, so they pop in place.
    scene.updateMatrixWorld(true);
    const letters = LETTER_NAMES.map((name) => {
      const object = scene.getObjectByName(name)!;
      const box = new THREE.Box3().setFromObject(object);
      const pivot = object.parent!.worldToLocal(new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2));
      return { object, pivot, offset: object.position.clone().sub(pivot), scale: object.scale.clone() };
    });
    return {
      scene,
      screens,
      emerald: emerald ?? new THREE.MeshPhysicalMaterial({ color: '#10B981' }),
      mixer,
      actions,
      hips,
      head,
      letters,
      // Clips only carry tracks for nodes they move, so the cursor yaw is applied on top of these each frame.
      hipsRest: hips?.quaternion.clone() ?? new THREE.Quaternion(),
      headRest: head?.quaternion.clone() ?? new THREE.Quaternion(),
    };
  }, [gltf]);

  const live = useRef({ mode });
  live.current = { mode };
  const director = useRef({ name: '' as ClipName | '', popped: false, hovered: false, headFollow: 0, situation: 'idle' as Situation });
  const fx = useMemo(
    () => ({
      look: new THREE.Vector2(),
      q: new THREE.Quaternion(),
      e: new THREE.Euler(),
      target: new THREE.Vector3(),
      zoom: focus === 'blemi' ? 1 : 0,
      lettersOut: focus === 'blemi',
      lettersT: 10,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- focus only sets where the zoom starts
    [],
  );

  const play = (name: ClipName, once: boolean) => {
    const next = rig.actions[name];
    const prev = director.current.name ? rig.actions[director.current.name] : null;
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.play();
    if (prev && prev !== next) next.crossFadeFrom(prev, 0.25, false);
    director.current.name = name;
    if (name === 'story') director.current.popped = false;
  };

  useEffect(() => {
    const onFinished = () => {
      const name = director.current.name;
      if (name === 'story') play('logo_idle', false);
      else if (name === 'reassemble') play('wave', true);
      else if (name === 'wave') play(loopFor(director.current.situation), false);
    };
    const d = director.current;
    rig.mixer.addEventListener('finished', onFinished);
    play(live.current.mode === 'logo' ? 'story' : 'idle', live.current.mode === 'logo');
    onReady?.();
    if (captureEnabled()) captureHooks.ready = true;
    return () => {
      rig.mixer.removeEventListener('finished', onFinished);
      rig.mixer.stopAllAction();
      d.name = '';
      captureHooks.ready = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per loaded model
  }, [rig]);

  useEffect(() => {
    const name = director.current.name;
    const inLogo = name === 'story' || name === 'logo_idle';
    if (mode === 'logo' && !inLogo) play('story', true);
    if (mode === 'assembled' && inLogo) {
      sparks.current?.release();
      play('reassemble', true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts to mode only
  }, [mode]);

  const step = (dt: number) => {
    const d = director.current;
    rig.hips?.quaternion.copy(rig.hipsRest);
    rig.head?.quaternion.copy(rig.headRest);
    rig.mixer.update(dt);

    const story = rig.actions.story;
    if (d.name === 'story' && !d.popped && story.time >= STORY_POP_FRAME / FPS) {
      d.popped = true;
      sparks.current?.burst(new THREE.Vector3(RIG.slots.i, RIG.neckHeight, 0));
    }

    fx.look.lerp(pointer.current, Math.min(1, dt * 6));
    const headOn = d.name === 'idle' || d.name === 'wave' || d.name === 'working' || (d.name === 'story' && !d.popped);
    d.headFollow += ((headOn ? 1 : 0) - d.headFollow) * Math.min(1, dt * 5);
    const yaw = THREE.MathUtils.clamp(fx.look.x, -1, 1) * 0.32;
    const pitch = -THREE.MathUtils.clamp(fx.look.y, -1, 1) * 0.12;
    rig.hips?.quaternion.multiply(fx.q.setFromEuler(fx.e.set(0, yaw * 0.45, 0)));
    if (rig.head && d.headFollow > 0.01) {
      rig.head.quaternion.multiply(fx.q.setFromEuler(fx.e.set(pitch * d.headFollow, yaw * d.headFollow, 0)));
    }

    // While the head is away being the "a", the chest screen is Blemi's face.
    const flying = d.name === 'story' && d.popped && story.time < STORY_LANDED_AT;
    const headAway = d.name === 'logo_idle' || (d.name === 'story' && d.popped) || (d.name === 'reassemble' && rig.actions.reassemble.time < 1);
    const now = nowMs();
    const screens = pickScreens(signals?.current ?? IDLE_SIGNALS, now, { look: fx.look, headAway, flying, hovered: d.hovered });
    for (const [screen, frame, glitch] of [
      [rig.screens.head, screens.head, flying ? 0.6 : 0],
      [rig.screens.chest, screens.chest, 0],
    ] as const) {
      const u = screen.material.uniforms;
      if (frame.key !== screen.key) {
        screen.key = frame.key;
        u.uGlitch.value = 1;
      }
      u.uGlitch.value = Math.max(glitch, u.uGlitch.value - dt * 4);
      u.uTime.value = now / 1000;
      applyFrame(screen.material, frame);
    }

    // The body follows what is going on: busy loop while working, a wave when something lands.
    const situation = screens.situation;
    const changed = situation !== d.situation;
    d.situation = situation;
    if (live.current.mode === 'assembled' && (d.name === 'idle' || d.name === 'working')) {
      if (changed && CHEERS.has(situation)) play('wave', true);
      else if (loopFor(situation) !== d.name) play(loopFor(situation), false);
    }

    // Blemi alone: the letters pop out (B first) and back in (m first).
    const onBlemi = focus === 'blemi';
    if (onBlemi !== fx.lettersOut) {
      fx.lettersOut = onBlemi;
      fx.lettersT = 0;
    }
    fx.lettersT += dt;
    rig.letters.forEach((letter, i) => {
      const order = onBlemi ? i : rig.letters.length - 1 - i;
      const p = THREE.MathUtils.clamp((fx.lettersT - order * LETTER_STAGGER) / LETTER_POP, 0, 1);
      const k = Math.max(0, onBlemi ? 1 - backIn(p) : backOut(p));
      letter.object.scale.copy(letter.scale).multiplyScalar(k);
      letter.object.position.copy(letter.pivot).addScaledVector(letter.offset, k);
      letter.object.visible = k > 0.002;
    });

    // Both framings follow the panel edge every frame; the zoom blends between them.
    fx.zoom = THREE.MathUtils.clamp(fx.zoom + (onBlemi ? dt : -dt) / ZOOM_SECONDS, 0, 1);
    const z = smooth(fx.zoom);
    const cam = camera as THREE.PerspectiveCamera;
    const aspect = size.width / Math.max(size.height, 1);
    const freeRight = layout?.current.freeRight ?? 1;
    const wide = frameCamera('wordmark', aspect, freeRight, cam.fov);
    const close = frameCamera('blemi', aspect, freeRight, cam.fov);
    cam.position.lerpVectors(wide.position, close.position, z);
    fx.target.lerpVectors(wide.target, close.target, z);
    cam.position.x += fx.look.x * 0.12 * (1 - 0.75 * z);
    cam.lookAt(fx.target);
  };

  useFrame((_, dt) => step(Math.min(dt, 1 / 20)));

  const hover = (on: boolean) => (e: ThreeEvent<PointerEvent>) => {
    if (on && !isBlemiPart(e.object)) return;
    director.current.hovered = on;
    document.body.style.cursor = on && onBlemiClick ? 'pointer' : '';
  };

  return (
    <group position={[OFFSET_X, 0, 0]}>
      <primitive
        object={rig.scene}
        onPointerOver={hover(true)}
        onPointerOut={hover(false)}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          if (!isBlemiPart(e.object)) return;
          e.stopPropagation();
          onBlemiClick?.();
        }}
      />
      <Sparks ref={sparks} dotMaterial={rig.emerald} />
    </group>
  );
}

function Studio() {
  return (
    <>
      <directionalLight
        position={[-3, 6, 5]}
        intensity={2.4}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-3.4}
        shadow-camera-right={3.4}
        shadow-camera-top={2.6}
        shadow-camera-bottom={-2.6}
        shadow-camera-near={1}
        shadow-camera-far={20}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-radius={5}
      />
      <directionalLight position={[5, 3, 4]} intensity={0.7} />
      <directionalLight position={[0, 4, -6]} intensity={1.1} />
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={2.4} position={[0, 6, 2]} rotation-x={Math.PI / 2} scale={[12, 6, 1]} />
        <Lightformer form="rect" intensity={1.4} position={[-6, 2, 3]} rotation-y={Math.PI / 2} scale={[8, 3, 1]} />
        <Lightformer form="rect" intensity={1.1} position={[6, 2, 3]} rotation-y={-Math.PI / 2} scale={[8, 3, 1]} />
        <Lightformer form="ring" intensity={0.8} position={[0, 2, 9]} scale={3} />
        <Lightformer form="rect" color="#e2e8f0" intensity={0.5} position={[0, -3, 0]} rotation-x={-Math.PI / 2} scale={[20, 20, 1]} />
      </Environment>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[24, 12]} />
        <shadowMaterial opacity={0.13} />
      </mesh>
    </>
  );
}

/** Lockstep frames for scripts/visual/capture.mjs: synthesized 1/30 s steps, never the wall clock. */
function CaptureBridge() {
  const advance = useThree((s) => s.advance);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    /** Where an object lands on screen, in viewport pixels; null when it has no visible extent. */
    const rectOf = (name: string) => {
      const object = scene.getObjectByName(name);
      if (!object) return null;
      const box = new THREE.Box3();
      object.traverseVisible((o) => {
        if ((o as THREE.Mesh).isMesh) box.expandByObject(o, false);
      });
      if (box.isEmpty() || box.getSize(new THREE.Vector3()).length() < 1e-4) return null;
      const r = gl.domElement.getBoundingClientRect();
      const xs: number[] = [];
      const ys: number[] = [];
      for (const x of [box.min.x, box.max.x])
        for (const y of [box.min.y, box.max.y])
          for (const z of [box.min.z, box.max.z]) {
            const p = new THREE.Vector3(x, y, z).project(camera);
            xs.push(r.left + ((p.x + 1) / 2) * r.width);
            ys.push(r.top + ((1 - p.y) / 2) * r.height);
          }
      return { x0: Math.round(Math.min(...xs)), y0: Math.round(Math.min(...ys)), x1: Math.round(Math.max(...xs)), y1: Math.round(Math.max(...ys)) };
    };
    let frame = 0;
    captureHooks.pump = (n) => {
      for (let i = 0; i < n; i++) {
        frame += 1;
        advanceClock(1000 / 30);
        advance(frame / 30);
      }
    };
    captureHooks.renderInfo = () => ({
      calls: gl.info.render.calls,
      tris: gl.info.render.triangles,
      programs: gl.info.programs?.length ?? 0,
      textures: gl.info.memory.textures,
      geometries: gl.info.memory.geometries,
      dpr: gl.getPixelRatio(),
      regions: {
        head: rectOf('Screen'),
        chest: rectOf('ChestScreen'),
        blemi: rectOf('Blemi'),
        letters: Object.fromEntries(LETTER_NAMES.map((name) => [name, rectOf(name)])),
        stage: (() => {
          const r = gl.domElement.getBoundingClientRect();
          return { x0: Math.round(r.left), y0: Math.round(r.top), x1: Math.round(r.right), y1: Math.round(r.bottom) };
        })(),
        panel: (() => {
          const panel = [...document.querySelectorAll<HTMLElement>('[data-chat-panel]')].find((el) => el.offsetParent !== null);
          const r = panel?.getBoundingClientRect();
          return r ? { x0: Math.round(r.left), y0: Math.round(r.top), x1: Math.round(r.right), y1: Math.round(r.bottom) } : null;
        })(),
      },
    });
    return () => {
      captureHooks.pump = undefined;
      captureHooks.renderInfo = undefined;
    };
  }, [advance, gl, scene, camera]);
  return null;
}

/** The live 3D wordmark: Blemi plays the logo story, follows the cursor and shows the agent state on its TV face. */
export default function BlemiScene(props: BlemiSceneProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const pointer = useWindowPointer(wrap);
  const [capture] = useState(captureEnabled);
  const [visible, setVisible] = useState(true);
  const [dpr, setDpr] = useState(() => (window.matchMedia('(pointer: coarse)').matches ? 1.5 : 1.75));

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: '100px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={wrap} className="absolute inset-0">
      <Canvas
        frameloop={capture || !visible ? 'never' : 'always'}
        dpr={[1, dpr]}
        shadows="percentage"
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance', toneMapping: THREE.NeutralToneMapping, toneMappingExposure: 1 }}
        camera={{ fov: 26, near: 0.1, far: 60, position: [0, 1.2, 10] }}
        aria-hidden
      >
        {capture ? <CaptureBridge /> : <PerformanceMonitor onDecline={() => setDpr(1)} />}
        <Suspense fallback={null}>
          <Studio />
          <Blemi {...props} pointer={pointer} />
        </Suspense>
      </Canvas>
    </div>
  );
}

useGLTF.preload(MODEL_URL, false, true);
