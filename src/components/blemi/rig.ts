import rig from './blemi-rig.json';

/** `logo`: the head is the final "a" of the wordmark. `assembled`: the head is back on the neck. */
export type BlemiMode = 'logo' | 'assembled';

export type ClipName = keyof typeof rig.clips;

export const RIG = rig;
export const MODEL_URL = '/models/blemi.glb';

/** Frame (Blender, 30 fps) in the story clip where the head leaves the neck. */
export const STORY_POP_FRAME = 14;

/** Where the sparks gather into the dot of the "i", in model space (y up, z towards the camera). */
export const DOT_POSITION: [number, number, number] = [rig.slots.i, 0.86, 0];
export const DOT_RADIUS = 0.075;

/** Wordmark bounds used for camera framing, in model space. */
export const WORDMARK_BOUNDS = { minX: -0.05, maxX: rig.slots.wordmarkEnd + 0.05, minY: -0.05, maxY: 1.25 };

/** The model is shifted by this along x so the wordmark is centred on the origin. */
export const OFFSET_X = -(WORDMARK_BOUNDS.minX + WORDMARK_BOUNDS.maxX) / 2;

/** Letter nodes in the GLB, left to right. */
export const LETTER_NAMES = ['LetterB', 'LetterL', 'LetterEuro', 'LetterM'] as const;
