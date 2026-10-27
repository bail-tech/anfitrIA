/**
 * Blemi's screens are green dot-matrix displays. Every drawing is string art:
 * `#` is a lit dot, `+` a dim dot, `.` an unlit one. Sprites are packed into one
 * R8 atlas, rows top to bottom.
 */

/** Dot grids, sized so the dots come out square on the 0.42 x 0.30 head and 0.22 x 0.155 chest screens. */
export const HEAD_GRID = { w: 24, h: 17 } as const;
export const CHEST_GRID = { w: 16, h: 11 } as const;

const mirror = (rows: string[]) => rows.map((r) => [...r].reverse().join(''));

/** Two eyes 16 dots wide; asymmetric eyes are mirrored so the face stays symmetric. */
function pair(eye: string[], mirrored = true): string[] {
  const right = mirrored ? mirror(eye) : eye;
  const gap = '.'.repeat(16 - 2 * eye[0].length);
  return eye.map((row, i) => row + gap + right[i]);
}

/** Draws `top` over `base` at (x, y); lit dots of `top` win. */
function stamp(base: string[], top: string[], x: number, y: number): string[] {
  return base.map((row, r) =>
    [...row].map((ch, c) => (top[r - y]?.[c - x] === '#' ? '#' : ch)).join(''),
  );
}

const EURO = ['..###', '.#...', '####.', '.#...', '####.', '.#...', '..###'];
const COIN = ['..#####..', '.#+++++#.', '#+++++++#', '#+++++++#', '#+++++++#', '#+++++++#', '#+++++++#', '.#+++++#.', '..#####..'];
const WALLET = ['.########.', '#........#', '#....#####', '#....#..##', '#....#####', '#........#', '.########.'];

const ART = {
  // Head: eyes (16 wide, centred on row 6) and mouths (centred on row 12).
  eyeOpen: pair(['.##.', '####', '####', '####', '.##.']),
  eyeBlink: pair(['....', '....', '####', '....', '....']),
  eyeWide: pair(['.###.', '#+###', '#####', '#####', '#####', '.###.']),
  eyeUp: pair(['.##.', '####', '####', '.##.', '....']),
  eyeFocus: pair(['###.', '....', '####', '####', '....']),
  eyeHappy: pair(['....', '.##.', '#..#', '#..#', '....']),
  eyeSad: pair(['....', '...#', '.###', '####', '.##.']),
  eyeX: pair(['#...#', '.#.#.', '..#..', '.#.#.', '#...#']),
  eyeEuro: pair(EURO, false),
  eyeQuestion: pair(['.###.', '#...#', '....#', '..##.', '..#..', '.....', '..#..'], false),
  mouthSmile: ['#......#', '.#....#.', '..####..'],
  mouthBig: ['########', '.######.', '..####..'],
  mouthFlat: ['######'],
  mouthFrown: ['..####..', '.#....#.', '#......#'],
  mouthO: ['.##.', '#..#', '#..#', '.##.'],
  mouthWavy: ['##..##..', '..##..##'],
  talk0: ['.####.'],
  talk1: ['######', '.####.'],
  talk2: ['######', '#....#', '.####.'],
  talk3: ['.####.', '#....#', '#....#', '.####.'],
  // The head as the final "a" of the wordmark.
  logoA: [
    '..#######..',
    '.#########.',
    '.##.....###',
    '........###',
    '..#########',
    '.##########',
    '###.....###',
    '###.....###',
    '###....####',
    '.##########',
    '..######.##',
  ],

  // Chest: one small icon for what is going on.
  heartBig: ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'],
  heartSmall: ['.#.#.', '#####', '#####', '.###.', '..#..'],
  dot: ['##', '##'],
  lens: ['.####...', '##..##..', '#....#..', '#....#..', '##..##..', '.#####..', '.....##.', '......##'],
  lines: ['+++++.++++++++', '..............', '++++++++.+++..', '..............', '+++.+++++++++.', '..............', '++++++.+++++..'],
  page0: ['######..', '#....##.', '#.....##', '#.###..#', '#......#', '#.####.#', '#......#', '#.###..#', '########'],
  page1: ['######..', '#....##.', '#.....##', '#......#', '#.####.#', '#......#', '#.###..#', '#......#', '########'],
  wallet: WALLET,
  receipt: ['#######', '#.....#', '#.###.#', '#.....#', '#.##..#', '#.....#', '#.###.#', '#.....#', '#.#.#.#'],
  gearA: ['...#...', '.#####.', '.#...#.', '##.#.##', '.#...#.', '.#####.', '...#...'],
  gearB: ['#.....#', '.#####.', '.#...#.', '.#.#.#.', '.#...#.', '.#####.', '#.....#'],
  coinFace: stamp(COIN, EURO, 2, 1),
  coinTilt: ['.###.', '#+++#', '#+++#', '#+++#', '#+++#', '#+++#', '#+++#', '#+++#', '.###.'],
  coinEdge: ['##', '##', '##', '##', '##', '##', '##', '##', '##'],
  checkSmall: ['......#', '.....#.', '#...#..', '.#.#...', '..#....'],
  checkBig: ['........#', '.......##', '......##.', '#....##..', '##..##...', '.####....', '..##.....'],
  question: ['.###.', '#...#', '....#', '...#.', '..#..', '..#..', '.....', '..#..'],
  warning: ['.....#.....', '....###....', '....#.#....', '...##.##...', '...##.##...', '..###.###..', '.#########.', '#####.#####', '###########'],
  euroZero: ['..###...##.', '.#.....#..#', '####...#..#', '.#.....#..#', '####...#..#', '.#.....#..#', '..###...##.'],
  mic: ['..###..', '.#####.', '.#####.', '.#####.', '#.###.#', '#.....#', '.#####.', '...#...', '.#####.'],
  // Chest face, for while the head is away being the "a".
  chestEyes: ['##....##', '##....##', '##....##'],
  chestBlink: ['........', '##....##', '........'],
  chestHappy: ['.#....#.', '#.#..#.#'],
  chestSmile: ['#....#', '.####.'],
} satisfies Record<string, string[]>;

export type SpriteName = keyof typeof ART;
export interface SpriteRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const SPRITE_ART: Record<SpriteName, string[]> = ART;
const LEVEL: Record<string, number> = { '#': 255, '+': 96, '.': 0 };
const ATLAS_WIDTH = 128;

function pack() {
  const rects = {} as Record<SpriteName, SpriteRect>;
  let x = 0;
  let y = 0;
  let shelf = 0;
  for (const [name, rows] of Object.entries(ART) as [SpriteName, string[]][]) {
    const w = rows[0].length;
    if (rows.some((r) => r.length !== w || /[^#+.]/.test(r))) throw new Error(`pixel-art: sprite ${name} is not rectangular string art`);
    // One unlit texel between sprites, so nothing bleeds when a layer is flipped.
    if (x + w > ATLAS_WIDTH) {
      x = 0;
      y += shelf + 1;
      shelf = 0;
    }
    rects[name] = { x, y, w, h: rows.length };
    x += w + 1;
    shelf = Math.max(shelf, rows.length);
  }
  const height = y + shelf;
  const data = new Uint8Array(ATLAS_WIDTH * height);
  for (const [name, r] of Object.entries(rects) as [SpriteName, SpriteRect][]) {
    ART[name].forEach((row, j) => [...row].forEach((ch, i) => (data[(r.y + j) * ATLAS_WIDTH + r.x + i] = LEVEL[ch])));
  }
  return { rects, atlas: { width: ATLAS_WIDTH, height, data } };
}

const packed = pack();
export const SPRITES = packed.rects;
export const ATLAS = packed.atlas;
