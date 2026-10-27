import * as THREE from 'three';
import { ATLAS, SPRITES } from './pixel-art';
import { MAX_BARS, MAX_LAYERS, type ScreenFrame } from './screen-state';

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = vec2(uv.x, 1.0 - uv.y); // glTF UVs start at the top
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = /* glsl */ `
uniform sampler2D uAtlas;
uniform vec2 uGrid;
uniform vec4 uRect[${MAX_LAYERS}];
uniform vec4 uPlace[${MAX_LAYERS}];
uniform vec4 uBars;
uniform float uBarMode;
uniform float uBarLevel[${MAX_BARS}];
uniform float uTime;
uniform float uGlitch;
uniform float uPulse;
uniform vec3 uInk;
uniform vec3 uBase;
varying vec2 vUv;

float hash(float n) { return fract(sin(n) * 43758.5453); }

// Brightness 0..1 of one dot of the grid (x right, y down).
float dotValue(vec2 c) {
  if (c.x < 0.0 || c.y < 0.0 || c.x >= uGrid.x || c.y >= uGrid.y) return 0.0;
  float v = 0.0;
  for (int i = 0; i < ${MAX_LAYERS}; i++) {
    vec4 r = uRect[i];
    if (r.z < 0.5) continue;
    vec2 l = c - uPlace[i].xy;
    if (l.x < 0.0 || l.y < 0.0 || l.x >= r.z || l.y >= r.w) continue;
    if (uPlace[i].z > 0.5) l.x = r.z - 1.0 - l.x;
    v = max(v, texelFetch(uAtlas, ivec2(r.xy + l), 0).r * uPlace[i].w);
  }
  if (uBarMode > 0.5) {
    vec2 l = c - uBars.xy;
    if (l.x >= 0.0 && l.y >= 0.0 && l.x < uBars.z && l.y < uBars.w && mod(l.x, 2.0) < 0.5) {
      float level = uBarLevel[int(clamp(l.x * 0.5, 0.0, ${MAX_BARS - 1}.0))];
      if (uBarMode < 1.5) {
        float mid = (uBars.w - 1.0) * 0.5;
        if (abs(l.y - mid) <= floor(level * mid + 0.5)) v = 1.0;
      } else if (l.y >= uBars.w - max(1.0, floor(level * uBars.w + 0.5))) {
        v = 1.0;
      }
    }
  }
  return v;
}

void main() {
  vec2 g = vec2(vUv.x, 1.0 - vUv.y) * uGrid;
  float row = floor(g.y);
  float glitch = uGlitch * step(0.55, hash(row + floor(uTime * 20.0)));
  g.x += floor((hash(row * 3.1 + floor(uTime * 24.0)) - 0.5) * 6.0) * glitch;
  vec2 c = floor(g);
  vec2 f = fract(g) - 0.5;

  float v = dotValue(c);
  float glow = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y));
      vec2 d = f - o;
      glow += dotValue(c + o) * exp(-dot(d, d) * 1.8);
    }
  }

  // Round LEDs when they are big enough to see, plain squares when a dot is only a pixel or two.
  float perDot = 1.0 / max(fwidth(g.x), 1e-4);
  float resolve = smoothstep(2.0, 5.0, perDot);
  float r = length(f);
  float aa = max(fwidth(r), 1e-4);
  float led = 1.0 - smoothstep(0.37 - aa, 0.37 + aa, r);
  float lit = v * mix(1.0, led, resolve);

  float flicker = 0.965 + 0.035 * sin(uTime * 47.0 + row * 1.7);
  float vig = smoothstep(0.85, 0.2, length((vUv - 0.5) * vec2(1.0, 1.2)));
  vec3 col = uBase * (0.7 + 0.5 * vig);
  col += uInk * 0.045 * led * resolve;
  col += uInk * (lit * (1.5 + uPulse * 1.1) + glow * 0.16 * (1.0 + uPulse)) * flicker;
  col += uInk * 0.25 * glitch;
  float sheen = smoothstep(0.035, 0.0, abs(vUv.x - vUv.y * 0.55 - 0.12));
  col += vec3(0.04) * sheen;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

let atlas: THREE.DataTexture | null = null;
function atlasTexture() {
  if (atlas) return atlas;
  atlas = new THREE.DataTexture(ATLAS.data, ATLAS.width, ATLAS.height, THREE.RedFormat, THREE.UnsignedByteType);
  atlas.magFilter = THREE.NearestFilter;
  atlas.minFilter = THREE.NearestFilter;
  atlas.generateMipmaps = false;
  atlas.colorSpace = THREE.NoColorSpace;
  atlas.needsUpdate = true;
  return atlas;
}

export type ScreenUniforms = {
  uGrid: { value: THREE.Vector2 };
  uRect: { value: THREE.Vector4[] };
  uPlace: { value: THREE.Vector4[] };
  uBars: { value: THREE.Vector4 };
  uBarMode: { value: number };
  uBarLevel: { value: number[] };
  uTime: { value: number };
  uGlitch: { value: number };
  uPulse: { value: number };
};

export type ScreenMaterial = THREE.ShaderMaterial & { uniforms: ScreenUniforms };

export function createScreenMaterial(grid: { w: number; h: number }): ScreenMaterial {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uAtlas: { value: atlasTexture() },
      uGrid: { value: new THREE.Vector2(grid.w, grid.h) },
      uRect: { value: Array.from({ length: MAX_LAYERS }, () => new THREE.Vector4()) },
      uPlace: { value: Array.from({ length: MAX_LAYERS }, () => new THREE.Vector4()) },
      uBars: { value: new THREE.Vector4() },
      uBarMode: { value: 0 },
      uBarLevel: { value: new Array(MAX_BARS).fill(0) },
      uTime: { value: 0 },
      uGlitch: { value: 0 },
      uPulse: { value: 0 },
      uInk: { value: new THREE.Color('#4ADE80') },
      uBase: { value: new THREE.Color('#04140C') },
    },
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
  });
  return material as ScreenMaterial;
}

/** Uploads one screen frame from pickScreens into the material. */
export function applyFrame(material: ScreenMaterial, frame: ScreenFrame) {
  const u = material.uniforms;
  for (let i = 0; i < MAX_LAYERS; i++) {
    const layer = frame.layers[i];
    if (!layer) {
      u.uRect.value[i].set(0, 0, 0, 0);
      continue;
    }
    const r = SPRITES[layer.sprite];
    u.uRect.value[i].set(r.x, r.y, r.w, r.h);
    u.uPlace.value[i].set(layer.x, layer.y, layer.flip ? 1 : 0, layer.intensity ?? 1);
  }
  const bars = frame.bars;
  u.uBarMode.value = bars ? (bars.mode === 'center' ? 1 : 2) : 0;
  if (bars) {
    u.uBars.value.set(bars.x, bars.y, bars.w, bars.h);
    for (let i = 0; i < MAX_BARS; i++) u.uBarLevel.value[i] = bars.levels[i] ?? 0;
  }
  u.uPulse.value = frame.pulse;
}
