/**
 * @file Arena terrain — the action battlefield as real 3D ground.
 *
 * The action arena used to be one flat square: `renderActionTiles` baked a
 * uniform grass canvas and CSS stretched it under a single rotateX. Nothing was
 * extruded, nothing blocked, and the elevation grids in arena-templates.js were
 * read only by the turn-based tactical board — `getCellElevation` had no callers
 * at all. So "high ground" was a comment, not a rule.
 *
 * This module gives the arena the SAME ground language the Delve walks on: an
 * ASCII grid baked by `bakeEstate` into a tile-art plane, with `attachTerrain`
 * folding real vertical faces off it. On top of that it publishes the fields
 * combat needs — height, passability, climbability and sight-blocking — so a
 * ledge is somewhere you actually stand, a boulder is something you actually
 * hide behind, and a bow actually reaches further from up there.
 *
 * Grid language (9x9, one char per cell):
 *   '.'  open ground, height 0
 *   '^'  ledge — walkable TOP at height 1; reachable only by a climb cell
 *   'L'  ladder — climb link between the ground and an adjacent ledge
 *   'v'  vine   — the same, dressed differently
 *   'r'  boulder — impassable, and it breaks line of sight
 *
 * Heights are whole steps of BLOCK_H px, matching the delve's raised blocks, so
 * a fighter lifted onto a ledge lands exactly on the drawn surface.
 */
import { bakeEstate, attachTerrain, BLOCK_H } from '../guild/delve.js';

/** One elevation step, in plane pixels. Re-exported so the renderer can lift a
 *  standee by exactly the height of the surface it is standing on. */
export const STEP_PX = BLOCK_H;
/** Fraction of normal speed while on a ladder or vine — climbing costs time. */
export const CLIMB_SPEED = 0.4;
/** Height a climber renders at while on the rungs: visibly between the levels. */
const CLIMB_LIFT = 0.5;
/** Extra tiles of reach per step of height advantage. */
export const HIGH_GROUND_RANGE = 1.5;
/** Accuracy bonus for shooting downhill. */
export const HIGH_GROUND_TOHIT = 2;

/**
 * The battlefields. Every one keeps the two spawn corners (1.5,7.5 and 7.5,1.5)
 * open and leaves a ground-level path between them, so the walk-toward AI can
 * never be sealed out however the terrain is arranged.
 */
export const ARENA_FIELDS = [
  {
    name: 'Broken Ridge',
    // A shelf across the middle with a ladder at one end and a vine at the
    // other. Corridors down both flanks keep the ground route open.
    grid: [
      '.........',
      '.....r...',
      '.........',
      '..^^^^^..',
      '..L...v..',
      '.........',
      '.r.......',
      '.........',
      '.........',
    ],
  },
  {
    name: 'The Cairns',
    // Cover country: boulders everywhere, one small perch worth taking.
    grid: [
      '.........',
      '..r...r..',
      '.....^^..',
      '.r...L...',
      '.........',
      '...r...r.',
      '..^^.....',
      '..L....r.',
      '.........',
    ],
  },
  {
    name: 'Twin Terraces',
    // Two facing perches — a sniper duel if both fighters commit to the climb.
    grid: [
      '.^^^.....',
      '.L.......',
      '.........',
      '....r....',
      '.........',
      '....r....',
      '.........',
      '.......L.',
      '.....^^^.',
    ],
  },
  {
    name: 'Open Field',
    // The honest one: almost nothing but ground and two rocks to duck behind.
    grid: [
      '.........',
      '.........',
      '......r..',
      '.........',
      '...r.....',
      '.........',
      '..r......',
      '.........',
      '.........',
    ],
  },
];

const LEDGE = '^', LADDER = 'L', VINE = 'v', BOULDER = 'r';
const isClimbCh = (ch) => ch === LADDER || ch === VINE;

/**
 * Turn a battlefield into the fields the arena needs.
 * `bakeGrid` is what bakeEstate sees: ledges become the delve's low raised
 * blocks ('b'), which already draw a lifted top plus side panels — exactly a
 * shelf. Boulders and climb cells stay ground in the bake and are dressed with
 * sprites on top, so the ground art stays continuous under them.
 */
export function readField(field) {
  const rows = field.grid.length, cols = field.grid[0].length;
  const at = (x, y) => (x < 0 || y < 0 || x >= cols || y >= rows) ? BOULDER : field.grid[y][x];
  const height = [], pass = [], climb = [], blocksSight = [];
  const bakeGrid = [];
  const props = [];
  for (let y = 0; y < rows; y++) {
    height.push([]); pass.push([]); climb.push([]); blocksSight.push([]);
    let bake = '';
    for (let x = 0; x < cols; x++) {
      const ch = at(x, y);
      height[y].push(ch === LEDGE ? 1 : 0);
      pass[y].push(ch !== BOULDER);
      climb[y].push(isClimbCh(ch));
      // A boulder stops an arrow. A ledge does NOT block by itself — whether it
      // interrupts a shot depends on the shooter's and target's own heights, so
      // that test lives in hasLineOfSight where both are known.
      blocksSight[y].push(ch === BOULDER);
      bake += ch === LEDGE ? 'b' : '.';
      if (ch === BOULDER) props.push({ kind: 'boulder', x, y });
      else if (ch === LADDER) props.push({ kind: 'ladder', x, y });
      else if (ch === VINE) props.push({ kind: 'vine', x, y });
    }
    bakeGrid.push(bake);
  }
  return { name: field.name, cols, rows, height, pass, climb, blocksSight, bakeGrid, props };
}

/** Height of the surface under a point, in whole steps (0 outside the grid). */
export function heightAt(T, x, y) {
  if (!T) return 0;
  const tx = Math.floor(x), ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= T.cols || ty >= T.rows) return 0;
  return T.height[ty][tx];
}
/** Is this point on a ladder or a vine? */
export function onClimb(T, x, y) {
  if (!T) return false;
  const tx = Math.floor(x), ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= T.cols || ty >= T.rows) return false;
  return T.climb[ty][tx];
}
/** What a standee at this point should be lifted by, in plane px. */
export function liftAt(T, x, y) {
  if (!T) return 0;
  return (onClimb(T, x, y) ? CLIMB_LIFT : heightAt(T, x, y)) * STEP_PX;
}

const BODY = 0.3; // half-width of a fighter's feet box, in tiles

/**
 * Can a fighter stand centred here? Their feet box must clear every boulder and
 * the arena edge, and the surface must be all one level — you step UP or DOWN a
 * level only through a climb cell.
 */
export function canStandAt(T, x, y, fromX, fromY) {
  if (!T) return x >= 0.5 && x <= 8.5 && y >= 0.5 && y <= 8.5;
  if (x < BODY || y < BODY || x > T.cols - BODY || y > T.rows - BODY) return false;
  const corners = [[-BODY, -BODY], [BODY, -BODY], [-BODY, BODY], [BODY, BODY]];
  for (const [dx, dy] of corners) {
    const tx = Math.floor(x + dx), ty = Math.floor(y + dy);
    if (tx < 0 || ty < 0 || tx >= T.cols || ty >= T.rows) return false;
    if (!T.pass[ty][tx]) return false;
  }
  // CLIMBING is what needs a ladder. DROPPING never did.
  //
  // This used to refuse any change of level without a climb cell, in either
  // direction — which meant the first shelf you climbed onto was a shelf you
  // could not leave. Every step off it, on all four sides, was silently
  // rejected: you walked, nothing happened, and in first person the eye stayed
  // a full step up while the ground you thought you were crossing went by. The
  // player's words were "twice the height of the other character, and it stays
  // that way after moving off", which is exactly what being quietly refused
  // looks like from inside the fighter.
  //
  // A ledge is one step. You can always take a drop.
  if (fromX != null) {
    const hFrom = heightAt(T, fromX, fromY), hTo = heightAt(T, x, y);
    if (hTo > hFrom && !onClimb(T, fromX, fromY) && !onClimb(T, x, y)) return false;
  }
  return true;
}

/**
 * Axis-separated step so a fighter slides along a rock instead of sticking to
 * it. Mutates {ax, ay}. Returns whether anything moved.
 */
export function slideMove(T, f, dx, dy) {
  let moved = false;
  if (dx && canStandAt(T, f.ax + dx, f.ay, f.ax, f.ay)) { f.ax += dx; moved = true; }
  if (dy && canStandAt(T, f.ax, f.ay + dy, f.ax, f.ay)) { f.ay += dy; moved = true; }
  return moved;
}

/**
 * Can the attacker SEE the defender? Walks the cells between them and stops on
 * anything that would eat the shot: a boulder always, and a ledge only when it
 * stands above BOTH parties (shooting across a shelf from ground level is
 * blocked; shooting from on top of it is not).
 */
export function hasLineOfSight(T, ax, ay, bx, by) {
  if (!T) return true;
  const hA = heightAt(T, ax, ay), hB = heightAt(T, bx, by);
  const eye = Math.max(hA, hB);
  const dist = Math.hypot(bx - ax, by - ay);
  const steps = Math.ceil(dist * 4);
  if (steps <= 1) return true;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
    const tx = Math.floor(x), ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= T.cols || ty >= T.rows) continue;
    // Don't let the shooter's own cell or the target's cell block the shot.
    if ((tx === Math.floor(ax) && ty === Math.floor(ay)) || (tx === Math.floor(bx) && ty === Math.floor(by))) continue;
    if (T.blocksSight[ty][tx]) return false;
    if (T.height[ty][tx] > eye) return false;
  }
  return true;
}

/**
 * A step toward the goal that respects terrain — breadth-first over the cell
 * grid, so the AI walks around a boulder instead of pressing into it forever.
 * Returns a unit-ish {dx,dy} in tile space, or null when already there.
 */
export function stepToward(T, fromX, fromY, goalX, goalY) {
  if (!T) return null;
  const sx = Math.floor(fromX), sy = Math.floor(fromY);
  const gx = Math.floor(goalX), gy = Math.floor(goalY);
  if (sx === gx && sy === gy) return null;
  const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]];
  const seen = new Set([sx + ',' + sy]);
  const queue = [{ x: sx, y: sy, fx: 0, fy: 0 }];
  const legal = (fx, fy, tx, ty) => {
    if (tx < 0 || ty < 0 || tx >= T.cols || ty >= T.rows) return false;
    if (!T.pass[ty][tx]) return false;
    const hF = T.height[fy][fx], hT = T.height[ty][tx];
    if (hF !== hT && !T.climb[fy][fx] && !T.climb[ty][tx]) return false;
    return true;
  };
  while (queue.length) {
    const cur = queue.shift();
    for (const [dx, dy] of DIRS) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (!legal(cur.x, cur.y, nx, ny)) continue;
      const fx = cur.fx || dx, fy = cur.fy || dy;
      if (nx === gx && ny === gy) return { dx: fx, dy: fy };
      const k = nx + ',' + ny;
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push({ x: nx, y: ny, fx, fy });
    }
  }
  return null;
}

/** Pick a battlefield at random — or the one pinned by __arenaPin (dev probe). */
export function pickField() {
  if (typeof window !== 'undefined' && window.__arenaPin != null) {
    const p = ARENA_FIELDS.find((f) => f.name === window.__arenaPin) || ARENA_FIELDS[window.__arenaPin];
    if (p) return p;
  }
  return ARENA_FIELDS[Math.floor(Math.random() * ARENA_FIELDS.length)];
}

// ─── Mounting the real geometry ──────────────────────────────────────────────

/** Boulder / ladder / vine sprites, cut from the shipped 48px kits. */
const DRESS = {
  boulder: { sheet: 'rocks', x: 0, y: 0, w: 48, h: 48, lift: 0 },
  // The ladder and vine are drawn UPRIGHT against the shelf they serve, so they
  // read as something you climb rather than something lying on the floor.
  ladder: { css: 'at-ladder' },
  vine: { css: 'at-vine' },
};

let _rocksImg = null;
function loadRocks(base) {
  if (_rocksImg) return _rocksImg;
  _rocksImg = new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => { _rocksImg = null; rej(new Error('arena: rocks.png failed')); };
    im.src = base + 'rocks.png';
  });
  return _rocksImg;
}

/**
 * Bake `field` and hang its geometry + dressing on the arena element.
 * Async (the cliff kit loads over the network); the caller keeps its instant
 * procedural grass until this resolves, exactly as the ranch does.
 * @param {HTMLElement} arena  #actionArena
 * @param {object} T           a readField() result
 * @param {string} tilesBase   TILES_BASE
 */
export async function mountArenaTerrain(arena, T, tilesBase) {
  const baked = await bakeEstate(T.bakeGrid, 'meadow');
  if (!arena || !arena.isConnected) return null;
  arena.style.backgroundImage = `url(${baked.canvas.toDataURL('image/png')})`;
  arena.querySelectorAll('.dv-face, .dv-block-top, .at-prop').forEach((e) => e.remove());
  attachTerrain(arena, baked, { zMode: 'y' });

  let rocks = null;
  try { rocks = await loadRocks(tilesBase); } catch (e) { /* boulders just go undressed */ }
  if (!arena.isConnected) return baked;
  const TILE = 48;
  for (const p of T.props) {
    const el = document.createElement('div');
    el.className = 'at-prop ' + (DRESS[p.kind].css || 'at-rock');
    el.style.left = ((p.x + 0.5) / T.cols * 100) + '%';
    el.style.top = ((p.y + 1) / T.rows * 100) + '%';
    el.style.zIndex = String(10 + (p.y + 1) * TILE + 2);
    if (p.kind === 'boulder' && rocks) {
      const d = DRESS.boulder;
      const cv = document.createElement('canvas');
      cv.width = d.w; cv.height = d.h;
      const g = cv.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(rocks, d.x, d.y, d.w, d.h, 0, 0, d.w, d.h);
      el.appendChild(cv);
    }
    arena.appendChild(el);
  }
  return baked;
}
