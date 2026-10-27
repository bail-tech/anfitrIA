import * as THREE from 'three';
import { OFFSET_X, RIG, WORDMARK_BOUNDS } from './rig';

export const FOV = 26;
/** Camera height above its target, per unit of distance: a slight look down onto the letters. */
export const TILT = 0.14;
/** Gap between Blemi's right edge and the chat panel, as a fraction of the viewport width. */
export const BLEMI_GAP = 0.02;
/** Share of the viewport height Blemi fills when the camera is on him. */
export const BLEMI_HEIGHT = 0.72;
const FILL = 0.94;

export type FramingSubject = 'wordmark' | 'blemi';

export interface WorldBox {
  min: THREE.Vector3;
  max: THREE.Vector3;
}

const shifted = (b: { min: number[]; max: number[] }): WorldBox => ({
  min: new THREE.Vector3(b.min[0] + OFFSET_X, b.min[1], b.min[2]),
  max: new THREE.Vector3(b.max[0] + OFFSET_X, b.max[1], b.max[2]),
});

/** Blemi assembled, in scene space. */
export const BLEMI_BOX = shifted(RIG.bounds.blemi);
/** The whole wordmark including the head's pop arc in the logo story, in scene space. */
export const WORDMARK_BOX: WorldBox = {
  min: new THREE.Vector3(WORDMARK_BOUNDS.minX + OFFSET_X, -0.05, -0.2),
  max: new THREE.Vector3(WORDMARK_BOUNDS.maxX + OFFSET_X, 1.45, 0.2),
};
export const LETTER_BOXES = Object.fromEntries(Object.entries(RIG.bounds.letters).map(([name, b]) => [name, shifted(b)])) as Record<
  keyof typeof RIG.bounds.letters,
  WorldBox
>;

export function corners(b: WorldBox): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) out.push(new THREE.Vector3(x, y, z));
  return out;
}

/** Projected NDC extents of a box through `camera`. */
export function projectBox(b: WorldBox, camera: THREE.Camera) {
  const pts = corners(b).map((p) => p.project(camera));
  return {
    minX: Math.min(...pts.map((p) => p.x)),
    maxX: Math.max(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)),
    maxY: Math.max(...pts.map((p) => p.y)),
  };
}

export function placeCamera(camera: THREE.PerspectiveCamera, f: { position: THREE.Vector3; target: THREE.Vector3 }) {
  camera.position.copy(f.position);
  camera.lookAt(f.target);
  camera.updateMatrixWorld(true);
}

const scratch = new THREE.PerspectiveCamera(FOV, 1, 0.1, 60);

/**
 * Where the camera goes so `subject` fits the free area left of the chat panel.
 * `freeRight` is the panel's left edge as a fraction of the viewport width (1 with no panel).
 * The pan is corrected by projecting the subject's real corners, so the tilt is accounted for.
 */
export function frameCamera(subject: FramingSubject, aspect: number, freeRight: number, fov = FOV) {
  const camera = scratch;
  camera.fov = fov;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  const tan = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
  const free = THREE.MathUtils.clamp(freeRight, 0.2, 1);
  const box = subject === 'blemi' ? BLEMI_BOX : WORDMARK_BOX;
  const w = box.max.x - box.min.x;
  const h = box.max.y - box.min.y;

  const fitWidth = w / (2 * tan * aspect * free * FILL);
  let dist = subject === 'blemi' ? Math.max(h / (2 * tan * BLEMI_HEIGHT), fitWidth) : Math.max(h / (2 * tan * FILL), fitWidth);
  const panel = free < 0.999;
  const rightNdc = 2 * free - 1;
  // Blemi's right edge sits just left of the panel; the wordmark is centred in the free area.
  const wantX = subject === 'blemi' && panel ? rightNdc - 2 * BLEMI_GAP : (rightNdc - 1) / 2;

  const position = new THREE.Vector3();
  const target = new THREE.Vector3((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, 0);
  for (let i = 0; i < 6; i++) {
    position.set(target.x, target.y + dist * TILT, dist);
    placeCamera(camera, { position, target });
    const p = projectBox(box, camera);
    // The near face projects larger than the centre plane, so the distance is corrected from what is measured.
    const spanX = (p.maxX - p.minX) / (2 * free * FILL);
    const spanY = (p.maxY - p.minY) / 2;
    dist *= Math.max(spanX, subject === 'blemi' ? spanY / BLEMI_HEIGHT : spanY / FILL);
    const x = subject === 'blemi' && panel ? p.maxX : (p.minX + p.maxX) / 2;
    target.x += (x - wantX) * dist * tan * aspect;
    target.y += ((p.minY + p.maxY) / 2) * dist * tan;
  }
  position.set(target.x, target.y + dist * TILT, dist);
  return { position, target, dist };
}
