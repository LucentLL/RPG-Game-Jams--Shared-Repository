import { buildCampusMap } from './campus.js';
import { PROP_VOL } from './prop-volume.js';
import { ART } from './art.js';
import { packOfKind } from './map-pack.js';
/**
 * @file Delve maps — authored 2.5D explorable locales (data only; delve.js runs them).
 *
 * The look is Octopath-style "2D sprites in a 3D world": plateau tops live on
 * a perspective-tilted plane, real vertical rock walls hang off every edge,
 * and near-black chasm yawns everywhere the ground fell away (delve.js builds
 * the geometry; the walls are textured with the kit's face tiles). All the art
 * comes from ONE pre-baked kit — `public/assets/tiles/cliffs.png` (zcliffs_3,
 * 48px tiles) — which ships the same plateau twice: sandy-tan (the mine) and
 * grass (the near country). A THEME below is just the tile-coordinate table
 * for one of those palettes, so every future biome is a new table, not code.
 *
 * Maps are ASCII grids (one string per row, all equal length):
 *   #  chasm / void            .  walkable floor
 *   s  entry stairs (floor; the 3×3 stair-mouth decal centers here; exit zone)
 *   w  wagon exit (floor; the guild wagon standee; exit zone — meadow maps)
 *   o  ore node   (floor, blocks movement, COLLECTIBLE — bump it to mine it)
 *   r  boulder    (floor, impassable)      t  stalagmite / tree (impassable)
 *   =  minecart rail run (floor, passable) m  minecart (floor, impassable)
 *   B  raised block (floor base, impassable — rendered as a true 3D cube;
 *      interior theme: a room-height bookshelf wall)
 *   b  low block (impassable, half height — interior aisle stacks seen over)
 *   f  furnishing (impassable, NO box geometry — a `props` standee stands here)
 *   d  doorway exit (floor; exit zone, no decal — the wall gap is the door)
 *   +  interior door (walkable; a `portals` entry carries you to another map)
 *   ^  LEDGE — walkable floor ONE STEP UP (BLOCK_H). Drawn as the low block it
 *      already is, but you stand on top of it, and you can only get up there
 *      across a climb cell — so a shelf is a place you reach, not a place you
 *      wander onto. Standees on it ride up by exactly the drawn height.
 *   2 · 3  TERRACE — walkable floor two / three steps up. The same law as the
 *      ledge, one rung per climb: a tower is terraced by construction
 *      (. → climb → ^ → climb → 2 → climb → 3), never scaled in one stride.
 *   ,  SUNKEN floor — one step DOWN (a trench, a creek bed, the pit the vine
 *      hangs into). You may always walk off the edge and drop; climbing back
 *      out is what the vine is for.
 *
 * WATER IS NOT A GRID CHAR. It is a `water` array of [x, y] cells on the chart
 * (below), because a liquid is not a KIND of ground — it is something lying on
 * top of whatever ground is already there. Spelling it as a char would force
 * the two facts into one slot and lose the second: a creek bed is ',' (one
 * step down, with a vine to climb out) and it is also full of water, and a
 * '~' that had to mean both would have to pick. Overlaid, water composes with
 * every height in the vocabulary — a flooded terrace, a pond at grade, a
 * drowned trench you climb out of — and adds exactly one rule of its own:
 * crossing it costs time (WADE_SPEED).
 *   L  ladder · v  vine — the climb link. Ground you walk onto, dressed with
 *      the thing you climb, and the ONLY cell a change of level is legal across.
 *      Put one directly south of the ledge it serves so it leans on its face.
 *   D  DOOR — a wall that opens. Shut it blocks and draws as a door face in
 *      the wall run; walk into it and it opens (for the session — opened
 *      doors ride the same ledger as worked seams, across portals and view
 *      swaps). A door listed in the chart's `locks` array is LOCKED: it opens
 *      only by spending a key. Its floor level derives from the ground around
 *      it, so a door can stand in a terrace wall as honestly as at grade.
 *   K  KEY — a floor cell with a key waiting on it. Walk over it to take it;
 *      each key spends on one locked door. Collected keys ride the ledger.
 *   S  STAIRS — a climb link at FULL walk speed, drawn as real steps. Same
 *      one-rung law as the ladder; what stairs buy is pace and dignity.
 *   u  TUNNEL · n  BRIDGE — TWO walkable surfaces in one cell: the low ground
 *      runs under, a deck runs over, and which one you are on is decided by
 *      the level you arrive at (the thing Doom itself never could). The deck's
 *      height and the ground beneath are DERIVED from the neighbours — a 'u'
 *      through a '2' terrace bores at ground 0 under a rock deck at 2; an 'n'
 *      between terraces hangs planks at their level. The passage below exists
 *      only with real headroom (two steps); a bridge over a ',' creek is
 *      deck-only, with the water still under it. A deck may NOT border the
 *      '#' void — the abyss keeps its bottomlessness (validateMap and the
 *      editor lint both refuse it; span a trench or open ground instead).
 *
 * Interiors may also carry:
 *   name    the room's title, shown in the HUD (and on arrival)
 *   water   [[x, y], …] the cells under water — see wetCells(). Composes with
 *           whatever the grid says that cell already is: put it in a ',' bed
 *           and you get a creek you wade and climb out of; put it on '.' and
 *           you get a ford. It never changes a height or a passability.
 *   props   [{art, x, y, w}] upright art.js standees (x centre, y base, px wide)
 *           `w` is the ONE SIZE FACT every lens draws from — and it is NOT
 *           free-authored: w = h × (art.w/art.h) × 48, where h is the prop's
 *           ladder height in prop-volume.js (a multiple of PLAYER_H). A width
 *           picked for "readability" is how an anvil came to stand eye-high
 *           (playtest 2026-08-06); dev/check-volumes.mjs fails on any drift.
 *   portals [{x, y, to, at}] walk within 0.8 tiles of (x,y) → map `to` at `at`
 *
 * Creature spawns are explicit `{prey, x, y}` (tile coords; delve.js centers
 * them) so terrain and population balance independently. Every prey id must
 * exist in locales.js PREY — the delve pays real hunt spoils through hall.js.
 */

// The light and surface tables (LIGHTS, THEMES) live in themes.js so the pack
// validator can read THEMES without importing this module back — delve-maps
// builds its charts FROM the pack now, and that made the graph a cycle.
// Re-exported here because a dozen call sites already ask delve-maps.js.
export { LIGHTS, THEMES } from './themes.js';
import { THEMES } from './themes.js';

/** Pixel-rect decals on the prop sheets (px units; sheets are 3x/48px scale). */
export const DECALS = {
  // stairs.png — boulder-framed stair mouths, 3×3-tile blocks with padding.
  // The gray mouth waits for a grayProps map with an 's' entrance (the shipped
  // meadow enters by wagon).
  stairsDown:     { sheet: 'stairs', x: 0,   y: 0, w: 144, h: 144 },
  stairsDownGray: { sheet: 'stairs', x: 288, y: 0, w: 144, h: 144 },
  // ores.png — big clusters (one tile each)
  oreIron:   { sheet: 'ores', x: 144, y: 0,  w: 48, h: 48 },
  oreSilver: { sheet: 'ores', x: 240, y: 0,  w: 48, h: 48 },
  oreCopper: { sheet: 'ores', x: 336, y: 0,  w: 48, h: 48 },
  oreCrystal:{ sheet: 'ores', x: 48,  y: 96, w: 48, h: 48 },
  // rocks.png — boulders + stalagmites
  boulder:      { sheet: 'rocks', x: 0,   y: 0,  w: 48, h: 48 },
  boulderGray:  { sheet: 'rocks', x: 288, y: 0,  w: 48, h: 48 },
  stalag:       { sheet: 'rocks', x: 0,   y: 96, w: 48, h: 48 },
  stalagTall:   { sheet: 'rocks', x: 48,  y: 96, w: 48, h: 96 },
  // rails.png — one horizontal tie segment + the side-view cart
  railH: { sheet: 'rails', x: 312, y: 52,  w: 48, h: 56 },
  cart:  { sheet: 'rails', x: 108, y: 306, w: 84, h: 78 },
};

/** What an ore node pays when mined (bump to collect). `mat` is a MATERIALS id
 *  — real forge/alchemy stock where one exists, gold otherwise. Gold values sit
 *  below the mats' market prices so mining supplements, not supplants, trade. */
export const ORE_KINDS = {
  iron:    { decal: 'oreIron',    name: 'Iron ore',      gold: 7,  mat: 'iron_ore' },
  copper:  { decal: 'oreCopper',  name: 'Copper ore',    gold: 22, mat: null },
  silver:  { decal: 'oreSilver',  name: 'Silver ore',    gold: 10, mat: 'steel_ore' },
  crystal: { decal: 'oreCrystal', name: 'Vein crystal',  gold: 40, mat: 'emberroot' },
};

/**
 * Which ore a given cell is made of. Lives HERE, not in either renderer, because
 * both views draw the same seam: the top-down walk paints a node on the floor and
 * the first-person one bakes the vein into the wall you break, and a cell that
 * pays emberroot in one view must not read as iron in the other.
 * @param {number} x @param {number} y @returns {string} an ORE_KINDS key
 */
export function oreKindAt(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = ((h ^ (h >>> 13)) * 1274126177) | 0;
  h = (h ^ (h >>> 16)) >>> 0;
  const kinds = Object.keys(ORE_KINDS);
  return kinds[h % kinds.length];
}

// ---------------------------------------------------------------------------
// THE LEVEL MODEL — one height fact for every lens (ONE RULES FACT, CLAUDE.md)
// ---------------------------------------------------------------------------

/** Authored floor levels, in whole steps of BLOCK_H/STEP_PX. Every other
 *  walkable char stands at 0. Signed on purpose: the pit is a level too. */
export const FLOOR_LV = { '^': 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, ',': -1 };
/** Two-surface cells: a deck runs over the low ground. 'u' dresses the deck as
 *  the terrain it bores through, 'n' as planks. */
export const DECK_CH = { u: 1, n: 1 };
/** Climb links — the only cells a step UP is legal across. 'S' walks at full
 *  speed; rungs cost time. */
export const CLIMB_CH = { L: 'ladder', v: 'vine', S: 'stairs' };
/**
 * A chart's wet cells, as the lookup every lens actually wants.
 *
 * Deliberately NOT part of the level model below — water is not a height and
 * not a blocker, so nothing about the step law, the flood or the deck rule
 * changes because a cell is under water. What it changes is the dressing and
 * the price of the crossing, and those are the only two things any caller asks.
 *
 * One function rather than three inlined `.some()` loops, so a second liquid
 * (lava, a tar pit) is a change here and not a grep across three renderers.
 * @param {{water?: [number,number][]}} map
 */
export function wetCells(map) {
  const s = new Set();
  for (const c of (map && map.water) || []) {
    if (Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1])) s.add(c[0] + ',' + c[1]);
  }
  return s;
}

/** Steps of water a body can stand in and still keep its head up. Past this a
 *  walker is swimming, not wading — the pose stops being a stride. */
export const SWIM_DEPTH = 1;
/** How far a shallow ford still comes up the leg, in steps. Water lying on
 *  ground with no basin under it is not zero deep; it is ankle-to-shin. */
export const FORD_DEPTH = 0.35;

/**
 * HOW DEEP THE WATER LIES, per wet cell, in steps.
 *
 * Water finds its own level, so a body of it stands at the BRIM of the basin
 * that holds it — the highest ground it touches — and every cell of that body
 * shares one surface. A creek cut one step into the meadow is therefore a step
 * deep along its whole length, including the middle cells that touch no bank
 * at all; a puddle on flat ground is a ford, and the walker's shins get wet.
 *
 * Flooded per connected body rather than read per cell for exactly that
 * reason: asking a cell about its own neighbours gives the right answer at the
 * edge of a lake and zero in the middle of it, which would leave a walker
 * wading at the bank and strolling across the deep end.
 *
 * @returns {Map<string, number>} cell key → depth in steps (>= FORD_DEPTH)
 */
export function waterDepths(model, wet) {
  const out = new Map();
  if (!wet || !wet.size) return out;
  const ORTH = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  const seen = new Set();
  for (const key of wet) {
    if (seen.has(key)) continue;
    // Flood this body, collecting its cells and the highest ground on its rim.
    const body = [];
    const stack = [key];
    seen.add(key);
    let brim = null;
    while (stack.length) {
      const k = stack.pop();
      const [x, y] = k.split(',').map(Number);
      body.push([x, y, k]);
      const f = model.floorAt(x, y);
      if (f != null && (brim == null || f > brim)) brim = f;   // a fully enclosed pool brims at its own deepest rim
      for (const [dx, dy] of ORTH) {
        const nk = (x + dx) + ',' + (y + dy);
        if (wet.has(nk)) {
          if (!seen.has(nk)) { seen.add(nk); stack.push(nk); }
        } else {
          // Dry ground beside the water is the bank that holds it in.
          const nf = model.floorAt(x + dx, y + dy);
          if (nf != null && (brim == null || nf > brim)) brim = nf;
        }
      }
    }
    for (const [x, y, k] of body) {
      const f = model.floorAt(x, y);
      const d = (f == null || brim == null) ? 0 : brim - f;
      out.set(k, Math.max(FORD_DEPTH, d));
    }
  }
  return out;
}
/** Steps of headroom a body needs to pass beneath a deck. The player is ~1.77
 *  steps tall (760/900 tiles against a 430/900 step), so two is the least
 *  honest clearance — a deck any lower is a lid, not a bridge. */
export const MIN_CLEAR = 2;
/** Cells nothing stands ON at any level (walls, void, footprints).
 *  'f'/'r'/'t'/'m' ARE ground here: a boulder blocks a walk, not a level. So
 *  is 'o' — a vein is a wall until it is MINED, and the cell it opens into
 *  must already know its level or the step into the fresh space is refused
 *  (passability owns the block; the model owns only the height). */
const UNGROUND = { '#': 1, B: 1, b: 1, F: 1 };

/**
 * The height law of one grid, computed once and asked by every lens.
 *
 * Levels are per-CELL facts derived entirely from the chart:
 * - a plain floor char stands at FLOOR_LV[ch] || 0;
 * - a climb cell stands at the LOWEST adjacent ground (it is the way up from
 *   there — the Sparring Ring's ladders read level 0 exactly as they always
 *   have), resolved by flood so chained stairs land on the landing below them;
 * - a deck cell ('u'/'n') carries TWO surfaces: ground = the lowest
 *   neighbouring ground (the passage continues it), deck = the highest (the
 *   crossing continues it), both resolved by flood so a long span holds its
 *   height mid-air. The under-passage exists only with MIN_CLEAR of headroom.
 *
 * THE STEP LAW (pickSurface) is the shipped ledge law, generalized and
 * tightened to one rung: dropping any distance is always legal; climbing is
 * legal only across a climb cell and only ONE level per step. Multi-level
 * ground is therefore terraced by construction — exactly the grammar the
 * ledge shipped with, now tall enough to build a keep out of.
 */
export function makeLevelModel(grid) {
  const rows = grid.length, cols = grid[0].length;
  const at = (x, y) => (x < 0 || y < 0 || x >= cols || y >= rows) ? '#' : grid[y][x];
  const grounded = (x, y) => !UNGROUND[at(x, y)];
  const ORTH = [[0, -1], [0, 1], [-1, 0], [1, 0]];

  // Pass 1 — plain floors wear their authored level; climbs, decks and the
  // OPENABLE cells wait. A vein is rock continuous with the ground it stands
  // in — a flat 0 let a vein authored in a terrace flank open (when mined)
  // into a pit no lint could see — and a door or a key is the same story:
  // each derives like a climb, the lowest ground it touches.
  const DERIVED = { o: 1, D: 1, K: 1 };
  const floor = [], deck = [];
  for (let y = 0; y < rows; y++) {
    floor.push(new Array(cols).fill(null)); deck.push(new Array(cols).fill(null));
    for (let x = 0; x < cols; x++) {
      const ch = at(x, y);
      if (!grounded(x, y) || CLIMB_CH[ch] || DECK_CH[ch] || DERIVED[ch]) continue;
      floor[y][x] = FLOOR_LV[ch] || 0;
    }
  }
  // Pass 2 — flood the derived cells until nothing moves. A climb takes the
  // MIN of what it touches (it stands on the low ground it serves), a deck's
  // ground the MIN and its deck the MAX (passage and crossing each continue
  // the ground they came from). Bounded: each cell only ever tightens.
  let moved = true, guard = rows * cols + 4;
  while (moved && guard-- > 0) {
    moved = false;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const ch = at(x, y);
        const isClimb = !!CLIMB_CH[ch] || ch === 'o' || ch === 'D' || ch === 'K', isDeck = !!DECK_CH[ch];
        if (!isClimb && !isDeck) continue;
        let lo = null, hi = null;
        for (const [dx, dy] of ORTH) {
          // A CLIMB reads only real ground (and decks): chained through a
          // neighbouring climb it would inherit that climb's low end — a
          // stair on a gallery beside the gallery's own ladder read level 0
          // and refused the terrace it visibly stood against. Decks keep the
          // full chain; a long span holds its height through its own cells.
          if (isClimb && CLIMB_CH[at(x + dx, y + dy)]) continue;
          const nf = floor[y + dy] && floor[y + dy][x + dx];
          const nd = deck[y + dy] && deck[y + dy][x + dx];
          for (const v of [nf, nd]) {
            if (v == null) continue;
            lo = lo == null ? v : Math.min(lo, v);
            hi = hi == null ? v : Math.max(hi, v);
          }
        }
        if (lo == null) continue;
        if (floor[y][x] !== lo) { floor[y][x] = lo; moved = true; }
        if (isDeck && deck[y][x] !== hi) { deck[y][x] = hi; moved = true; }
      }
    }
  }
  // A derived cell nothing grounded touches (an authoring hole) stands at 0;
  // a deck no higher than its ground is just floor and drops the deck — and
  // if THAT degenerate stands against the void, it stands nowhere: the model
  // would otherwise manufacture ground at height over a chasm the painter
  // has no pixels for (validateMap already warns the author off this shape).
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const ch = at(x, y);
      if ((CLIMB_CH[ch] || DECK_CH[ch] || ch === 'o' || ch === 'D' || ch === 'K') && floor[y][x] == null) floor[y][x] = 0;
      if (DECK_CH[ch] && (deck[y][x] == null || deck[y][x] <= floor[y][x])) {
        deck[y][x] = null;
        if (ORTH.some(([dx, dy]) => at(x + dx, y + dy) === '#')) floor[y][x] = null;
      }
    }
  }

  const floorAt = (x, y) => (grounded(x, y) && floor[y] ? floor[y][x] : null);
  const deckAt = (x, y) => (deck[y] ? deck[y][x] : null) ?? null;
  /** May a body pass BENEATH this cell's deck? */
  const underOK = (x, y) => {
    const d = deckAt(x, y), f = floorAt(x, y);
    return d != null && f != null && d - f >= MIN_CLEAR;
  };
  /** Every level a body can stand at here, low to high. */
  const surfacesAt = (x, y) => {
    const f = floorAt(x, y);
    if (f == null) return [];
    const d = deckAt(x, y);
    if (d == null) return [f];
    return underOK(x, y) ? [f, d] : [d];
  };
  const climbAt = (x, y) => !!CLIMB_CH[at(x, y)];
  /** Stairs are climbs that walk at full speed and draw as steps — every
   *  OTHER climb behaviour (slow rungs, ladder dressing, climb pose) must
   *  keep testing L/v, which is why this is its own question. */
  const stairAt = (x, y) => CLIMB_CH[at(x, y)] === 'stairs';
  /**
   * THE STEP LAW. Which surface a body at `fromLv` lands on entering (x,y) —
   * or null: no legal footing, the step is refused. Down is always legal (the
   * ladder is the way up, never a fence); up is one rung, climb cells only.
   * With no origin (a spawn, a wander probe, a fresh entry) the LOW surface
   * answers — static things live on the ground.
   */
  const pickSurface = (fromLv, fx, fy, x, y) => {
    const s = surfacesAt(x, y);
    if (!s.length) return null;
    if (fromLv == null || fx == null) return s[0];
    const up = (climbAt(fx, fy) || climbAt(x, y)) ? 1 : 0;
    let best = null;
    for (const c of s) if (c <= fromLv + up && (best == null || c > best)) best = c;
    return best;
  };
  return { cols, rows, floorAt, deckAt, underOK, surfacesAt, climbAt, stairAt, pickSurface };
}

/**
 * @typedef {Object} DelveMap
 * @property {string} id @property {string} theme  THEMES key
 * @property {string[]} grid  ASCII rows (equal length)
 * @property {[number,number]} entry  player start (tile coords, fractions ok)
 * @property {{prey:string,x:number,y:number}[]} spawns
 */

/**
 * THE PROP BENCH — one of everything, each on its own tile, GENERATED.
 *
 * A review map, and deliberately not a hand-written chart: the whole point is
 * to see every placeable object at once, and a list typed out by hand goes
 * stale the first time somebody adds a prop and forgets. Built from PROP_VOL
 * instead, so the bench always holds exactly what the game can place.
 *
 * Laid out for LOOKING at things. Three tiles of pitch, so you can walk right
 * round any piece and see its back, its sides and — the thing this exists for
 * — whether its drawn top folds into a real top or stands up as a face (@see
 * prop-volume `fold`). Open sky and meadow grass, because a dark room hides
 * exactly the silhouette being judged. The six wall-hung pieces get their own
 * masonry run along the north, since a hung thing with no wall is a bug rather
 * than a review.
 *
 * Reading order is PROP_VOL's own, eight to a row, left to right and top to
 * bottom — and the editor names whatever the cursor is over in its readout, so
 * identifying a piece is hovering it rather than counting.
 *
 * Widths come from the ladder by the same derivation everything else uses
 * (w = h × art aspect × 48). dev/check-volumes.mjs audits every chart in this
 * file, so a drift here fails the build rather than shipping a wrong size.
 */
function buildPropBench() {
  const free = [], hung = [];
  for (const art of Object.keys(PROP_VOL)) {
    if (!ART[art]) continue;
    (PROP_VOL[art].form === 'wall' ? hung : free).push(art);
  }
  const width = (art) => {
    const v = PROP_VOL[art], a = ART[art];
    return Math.round((v.form === 'lie' ? v.d : v.h) * (a.w / a.h) * 48);
  };
  const COLS = 8, PITCH = 3, X0 = 2, Y0 = 4;
  const W = X0 + COLS * PITCH;
  const rows = Math.ceil(free.length / COLS);
  const H = Y0 + rows * PITCH + 3;
  const props = [];
  const fCells = new Set();
  free.forEach((art, i) => {
    const x = X0 + (i % COLS) * PITCH, y = Y0 + Math.floor(i / COLS) * PITCH;
    // Integer y IS a foot line (propCell's reading), so the piece stands on
    // the bottom edge of row y — which is the cell it blocks.
    props.push({ art, x: x + 0.5, y: y + 1, w: width(art) });
    fCells.add(x + ',' + y);
  });
  // The hung row: a wall along row 2, its pieces a hair proud of row 3's north
  // edge — the charts' own convention for anything that hangs.
  const gap = Math.floor((W - 2) / hung.length);
  hung.forEach((art, i) => {
    props.push({ art, x: 1 + gap * i + gap / 2, y: 3.02, w: width(art) });
  });
  const grid = [];
  for (let y = 0; y < H; y++) {
    if (y === 0 || y === H - 1) { grid.push('#'.repeat(W)); continue; }
    if (y === 2) { grid.push('#' + 'B'.repeat(W - 2) + '#'); continue; }
    let row = '';
    for (let x = 0; x < W; x++) {
      row += (x === 0 || x === W - 1) ? '#'
        : fCells.has(x + ',' + y) ? 'f'
          : (x === 2 && y === H - 3) ? 'w'      // the way home
            : '.';
    }
    grid.push(row);
  }
  return {
    id: 'propbench', theme: 'meadow', name: 'The Prop Bench',
    grid, entry: [W / 2, H - 2.5], spawns: [], props, portals: [], paint: [], locks: [],
  };
}

/** @type {Object.<string,DelveMap>} */
/**
 * EVERY WALKABLE CHART.
 *
 * The charts are NOT literals any more — they are , loaded
 * and validated by map-pack.js, and this table is built from them. That is the
 * whole point of the pack: one source of truth that the drafting table writes,
 * that I can edit as text, and that the Unity port reads through the same
 * file. Editing a chart means editing its JSON (or opening it in the editor),
 * never editing this module.
 *
 * PROP WIDTHS ARE NOT AUTHORED ANYWHERE. The pack carries no ; map-pack.js
 * derives it from the ladder rung and the art's aspect at load (ONE SIZE FACT,
 * CLAUDE.md). A width can therefore no longer drift from the ladder, because
 * there is nowhere left to write one down.
 *
 *  is the exception and stays generated: it is one of every
 * placeable object laid out one per tile, so it is a FUNCTION of PROP_VOL and
 * would go stale the moment a prop was added.
 * @type {Object.<string,DelveMap>}
 */
export const DELVE_MAPS = (() => {
  // Prototype-less, like the pack's own bags: a map id is a filename, and a
  // filename must never be able to reach Object.prototype.
  const out = Object.assign(Object.create(null), packOfKind('delve'));
  out.propbench = buildPropBench();
  return out;
})();
// GONE, deliberately: the old literal carried `campus: null` — a placeholder,
// never a chart, because mapForLocale() intercepts 'campus' below and DERIVES
// it from the live layout. A pack file cannot express "a key that is null", and
// it should not: the placeholder's only observable effect was forcing
// map-editor.js:674 to filter falsy entries out of its template list, and
// letting map-editor.js:1676 offer a null map as a portal target. Nothing reads
// it — map-editor.js:33 puts 'campus' in SHIPPED explicitly, not by reading
// this table. Verified against the deleted literals: 15/15 real charts
// identical, field for field and width for width.

/** The guild whose campus layout the grounds should be built from. hall.js sets
 *  this on load; without it the grounds fall back to the default estate. */
let _campusGuild = null;
export function setCampusGuild(g) { _campusGuild = g; }

/**
 * The walkable chart for a locale, or null (most locales are still unmapped).
 * 'campus' is the exception: it is DERIVED from the live layout every time it is
 * asked for, so walking the grounds always shows what the Build tab last did.
 */
export function mapForLocale(localeId) {
  if (localeId === 'campus') return buildCampusMap(_campusGuild || { campus: null });
  return DELVE_MAPS[localeId] || null;
}

/** Cheap authoring lint — ragged rows throw; misplaced spawns/portals warn. */
export function validateMap(map) {
  const w = map.grid[0].length;
  for (const row of map.grid) if (row.length !== w) throw new Error(`delve map ${map.id}: ragged row (${row.length} vs ${w})`);
  const at = (x, y) => (map.grid[Math.floor(y)] || '')[Math.floor(x)];
  for (const s of (map.spawns || [])) {
    const ch = at(s.x, s.y);
    if (!ch || ch === '#') console.warn(`delve map ${map.id}: spawn ${s.prey} at ${s.x},${s.y} is on void`);
  }
  for (const p of (map.portals || [])) {
    const ch = at(p.x, p.y);
    if (!ch || ch === '#' || 'BbFfrtmo'.includes(ch)) console.warn(`delve map ${map.id}: portal at ${p.x},${p.y} sits on '${ch}' — unreachable`);
    if (!DELVE_MAPS[p.to]) console.warn(`delve map ${map.id}: portal leads to unknown map '${p.to}'`);
  }
  // A lock must name a door: a `locks` entry off any 'D' cell is a latch on
  // nothing, silently unopenable content.
  for (const [lx, ly] of (map.locks || [])) {
    if (at(lx, ly) !== 'D') console.warn(`delve map ${map.id}: lock at ${lx},${ly} sits on '${at(lx, ly)}' — locks belong on 'D' doors`);
  }
  // A deck cell against the void has no honest answer for what runs beneath
  // it (the model would manufacture ground over the chasm) — span a ','
  // creek or open ground instead; the abyss keeps its bottomlessness.
  for (let y = 0; y < map.grid.length; y++) {
    for (let x = 0; x < w; x++) {
      if (!DECK_CH[map.grid[y][x]]) continue;
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        if ((at(x + dx, y + dy) || '#') === '#') {
          console.warn(`delve map ${map.id}: deck '${map.grid[y][x]}' at ${x},${y} borders the void — bridge a ',' trench or open ground instead`);
        }
      }
    }
  }
  return true;
}
