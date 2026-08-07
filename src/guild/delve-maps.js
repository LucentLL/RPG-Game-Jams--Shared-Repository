import { buildCampusMap } from './campus.js';
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

/** Tile-coordinate tables into cliffs.png (units: 48px tiles on the sheet). */
/**
 * How a place is LIT — read only by the first-person view, which is the only
 * one that has a horizon to lose things over.
 *
 * `dark` is a torch: you carry the light, it falls off fast into black, and
 * what you cannot reach with it is not there. `open` is daylight haze: nothing
 * near you is dim at all, and distance washes pale rather than going out. `lit`
 * is a room someone else has already put lamps in.
 *
 * The distinction is not decoration. A meadow lit by torchlight reads as a cave
 * with grass in it, and a mine lit by daylight has nowhere for anything to be.
 * @typedef {{rgb:[number,number,number], near:number, far:number, ambient:number, sprite:number}} Light
 */
export const LIGHTS = {
  // Underground: a lamp's worth of world, and black past it.
  dark: { rgb: [6, 6, 10], near: 1.2, far: 5.2, sprite: 0.78 },
  // Open air: pale distance rather than black — and a real VISTA now, not
  // weather pressing on your face. The haze starts far enough out that the
  // whole meadow reads clear, and what it takes it takes at the horizon, where
  // the sky band is painted in the same colour — so the far cull is the
  // atmosphere arriving, not the world stopping. It must still CLOSE by the
  // edge of what the renderer builds; the first-person view derives its build
  // radius from these numbers, so they move together by construction.
  // `lite` is the same weather on a phone: the build radius a coarse-pointer
  // device can afford is smaller, so the haze has to arrive sooner or the
  // world stops at a hard edge of unfogged grass (the rule VIEW_CAP and
  // FOG_CULL have always lived by).
  // `sky` means no ceiling is built at all: the background IS the sky, and the
  // haze runs up into it. A meadow with a roof on it is a cave with grass in it.
  // The vista opened right out on 2026-08-03, once merged ground blocks and
  // merged wall runs made a radius affordable (@see CHUNK in delve-fp.js).
  //
  // THE SHAPE OF THE PAIR CHANGED, not just the size. 7/16 and 4.5/10 were a
  // short view spent almost entirely INSIDE the haze; these are a wide CLEAR
  // DISC with the weather arriving late. That is the N64 open-world shape — see
  // a long way, then let the last of it go — and it is also what the renderer
  // needs, because ground and walls may only merge where the fog is FLAT, so
  // `near` is quite literally the radius inside which a vista is affordable.
  //
  // Both pairs still obey the standing rule: the haze must reach FOG_CULL just
  // INSIDE the build radius, or the world ends at an edge instead of in weather.
  // Desktop 22 + 0.96·8 = 29.7 against a cap of 30; phone 14 + 0.90·6 = 19.4
  // against 20.
  open: { rgb: [150, 168, 186], near: 22, far: 30, sprite: 0.95, sky: true, lite: { near: 14, far: 20 } },
  // Somebody else's lamps — dim at the edges, warmer than a cave.
  lit: { rgb: [16, 14, 20], near: 2.2, far: 6.6, sprite: 0.86 },
};

export const THEMES = {
  mine: {
    light: 'dark',
    fill: [[8, 3], [8, 4]],
    rim: { nw: [9, 2], n: [10, 2], ne: [11, 2], w: [9, 3], e: [11, 3], sw: [9, 4], s: [10, 4], se: [11, 4] },
    bandN: { w: [9, 1], m: [10, 1], e: [11, 1] },
    bandW: [[8, 1], [8, 2]],
    bandE: [[12, 1], [12, 2]],
    faceTop: { l: [9, 5], m: [10, 5], r: [11, 5] },
    faceBot: { l: [9, 6], m: [10, 6], r: [11, 6] },
    // px point on cliffs.png inside a chasm hole — bake samples the void color here
    voidSample: [312, 166],
    grayProps: false, // warm-orange stairs/boulders
  },
  meadow: {
    light: 'open',
    fill: [[1, 3], [1, 4], [5, 3], [5, 4]],
    rim: { nw: [2, 2], n: [3, 2], ne: [4, 2], w: [2, 3], e: [4, 3], sw: [2, 4], s: [3, 4], se: [4, 4] },
    bandN: { w: [2, 1], m: [3, 1], e: [4, 1] },
    bandW: [[1, 1], [1, 2]],
    bandE: [[5, 1], [5, 2]],
    faceTop: { l: [2, 5], m: [3, 5], r: [4, 5] },
    faceBot: { l: [2, 6], m: [3, 6], r: [4, 6] },
    voidSample: [312, 166],
    grayProps: true, // gray stone reads better against grass
  },
  // Room interiors — parquet floor (floors.png, 16px source tiles) on a rock
  // foundation (cliff rim/faces at the island edge), with WALLS OF BOOKSHELVES:
  // 'B' cells are room-height shelf walls, 'b' cells waist-high aisle stacks
  // you see over. Wall textures are cut from the wired bookshelf_3x sheet.
  interior: {
    light: 'lit',
    sheet: 'floors', src: 16,
    fill: [[0, 4], [1, 4], [2, 4], [3, 4]],
    rimSheet: 'cliffs',
    rim: { nw: [9, 2], n: [10, 2], ne: [11, 2], w: [9, 3], e: [11, 3], sw: [9, 4], s: [10, 4], se: [11, 4] },
    faceTop: { l: [9, 5], m: [10, 5], r: [11, 5] },
    faceBot: { l: [9, 6], m: [10, 6], r: [11, 6] },
    voidSample: [312, 166],
    grayProps: false,
    walls: { sheet: 'shelves', tall: [222, 40, 48, 96], low: [222, 88, 48, 48], crown: [222, 40, 48, 18] },
    wallH: 96,
  },
  // ── The guild's working rooms ────────────────────────────────────────────
  // Each is the same contract: a floor sheet, and a WALL cut from an RPG-Maker
  // A4 wall sheet (`stonewall.png` / `woodwall.png`) whose bands map 1:1 onto
  // it — y 0..48 is the wall's top, y 48..144 its 96px face. A palette is just
  // an x offset (stone: grey 96, green-grey 192, dark blue-grey 288, blue 384,
  // tan/gold 480, orange-brown 576, teal 672); the +24 lands the 48px repeat
  // inside a stone course so the seam disappears. Rooms differ by palette and
  // furniture, never by code.
  ...(() => {
    const rock = {
      rimSheet: 'cliffs',
      rim: { nw: [9, 2], n: [10, 2], ne: [11, 2], w: [9, 3], e: [11, 3], sw: [9, 4], s: [10, 4], se: [11, 4] },
      faceTop: { l: [9, 5], m: [10, 5], r: [11, 5] },
      faceBot: { l: [9, 6], m: [10, 6], r: [11, 6] },
      voidSample: [312, 166],
      grayProps: false,
      wallH: 96,
    };
    /** A room theme: floor tiles + one wall palette off an A4 wall sheet.
     *  Lit by someone's lamps — without a light they fell back to cave-dark,
     *  and every room walked in first person read as a torch-lit mine. */
    const room = (sheet, src, fill, wallSheet, wx) => ({
      ...rock, light: 'lit', sheet, src, fill,
      walls: { sheet: wallSheet, tileFill: true, tall: [wx, 48, 48, 96], low: [wx, 96, 48, 48], crown: [wx, 0, 48, 48] },
    });
    return {
      // limestone slabs · tan-gold ashlar
      guildhall: room('floors', 16, [[0, 3], [1, 3], [2, 3], [3, 3]], 'stonewall', 504),
      // scrubbed limestone · teal-grey ashlar
      kitchen: room('floors', 16, [[4, 2], [5, 2], [6, 2], [7, 2]], 'stonewall', 696),
      // the darkest floor in the sheet · sooty blue-grey stone
      forge: room('floors', 16, [[4, 1], [5, 1], [6, 1], [7, 1]], 'stonewall', 312),
      // herb-cellar green flagstone under warm tan stone — the one wall palette
      // on the sheet nothing else had claimed
      apothecary: room('floors', 16, [[0, 6], [1, 6], [2, 6], [3, 6]], 'stonewall', 600),
      // warm brown brick · keep-grey ashlar
      armory: room('floors', 16, [[2, 1], [3, 1]], 'stonewall', 120),
      // plank floor AND plank walls off the one wood A4 sheet
      dormitory: room('woodwall', 48, [[3, 0]], 'woodwall', 24),
      // tan flagstone · pale green-grey ashlar
      classroom: room('floors', 16, [[0, 3], [1, 3], [2, 3], [3, 3]], 'stonewall', 216),
      // red damask carpet AND gold damask wall covering, off the mansion sheet
      guildmaster: room('mansion', 48, [[12, 7], [13, 7]], 'mansion', 384),
      /**
       * SAND under blue-grey ashlar tiers.
       *
       * This said "raked sand" for a year and laid the KITCHEN'S limestone —
       * `floors` [[4,2]…] is byte-identical to what the kitchen uses, which
       * the editor's Surfaces palette exposed the moment it started grouping
       * floors by what they actually are rather than by which room owns them.
       * The description was the only sand in the building.
       *
       * `sandramps_3` out of the 2019 bundle carries real sand. The fill is
       * its two flat tiles, and they are a PAIR by construction: tile (1,2)'s
       * right edge is byte-identical to (2,2)'s left, so the sheet already
       * means them to continue each other, and every cross-seam between them
       * measures at or below the tile's own internal grain. Nothing to blend.
       */
      arena: room('sand', 48, [[1, 2], [2, 2]], 'stonewall', 408),
    };
  })(),
};
// The Sparring Ring is OUTDOORS — raked sand under open sky, ringed by its
// stone tiers. Daylight, not lamplight, and the first-person view builds no
// ceiling over it (LIGHTS.open.sky).
THEMES.arena.light = 'open';
// Two rooms don't use the A4 wall strips:
// The study hangs gold damask (a plain 48px tile that repeats down the face)
// over its red damask carpet, both off the mansion sheet.
THEMES.guildmaster.walls = {
  sheet: 'mansion', src: 48, tileFill: true,
  tall: [384, 336, 48, 48], low: [384, 336, 48, 48], crown: [20, 268, 48, 16],
};
// The kitchen takes grey-blue ashlar off its own sheet, crowned with the pale
// limestone counter top — so its waist-high runs read as scrubbed stone
// counters rather than as walls that happen to be short.
THEMES.kitchen.walls = {
  sheet: 'kitchen', src: 48, tileFill: true,
  tall: [24, 48, 48, 96], low: [24, 96, 48, 48], crown: [156, 64, 48, 18],
};

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

/** @type {Object.<string,DelveMap>} */
export const DELVE_MAPS = {
  //                       1111111111222222
  //             01234567890123456789012345
  hollowvein: {
    id: 'hollowvein', theme: 'mine',
    grid: [
      '##########################', //  0
      '##.o..o.##################', //  1  ← the Sovereign's island
      '##......#####..o.....t..##', //  2
      '##......#####.t.......o.##', //  3
      '###..########...........##', //  4  ← neck down to the west galleries
      '###..########....r......##', //  5
      '##........###.....o.....##', //  6  ← west galleries · north hall
      '##....BB..K.............##', //  7  ← the key, deep in the north hall
      '##..t.................r.##', //  8
      '##........###########..###', //  9  ← east stair-shaft neck
      '#####..##############..###', // 10
      '#####D###############D####', // 11  ← a door on each neck; the east one is LOCKED
      '#####..##############..###', // 12
      '##..........###....BB...##', // 13  ← entry floor · east chamber
      '##..s.......###.....r...##', // 14
      '##....====m..........o..##', // 15
      '##...o............^2^^t.##', // 16  ← the upper gallery — and its crow's nest, two up
      '##.r........###...^S^^..##', // 17  ← the stair cut into the gallery
      '##..........###....L....##', // 18  ← the ladder up to it
      '##########################', // 19
      '##########################', // 20
    ],
    entry: [4.5, 15.5],
    // The east neck's door spends a key; the west one only asks to be pushed.
    locks: [[21, 11]],
    spawns: [
      { prey: 'slime', x: 7, y: 15 }, { prey: 'slime', x: 3, y: 16 },
      { prey: 'beetle', x: 17, y: 14 }, { prey: 'beetle', x: 19, y: 4 },
      { prey: 'skeleton', x: 4, y: 7 }, { prey: 'skeleton', x: 16, y: 6 },
      { prey: 'ghost', x: 20, y: 3 }, { prey: 'ghost', x: 18, y: 16 },
      { prey: 'ghoul', x: 22, y: 15 },
      { prey: 'ratking', x: 22, y: 6 },
      { prey: 'slimeking', x: 4, y: 2 },
    ],
  },
  //                       11111111112222
  //             012345678901234567890123
  ferncreek: {
    id: 'ferncreek', theme: 'meadow',
    grid: [
      '########################', //  0
      '########################', //  1
      '##................^^^.##', //  2  ← the bluff — a ledge over the meadow
      '##..t.......t....L^^^.##', //  3  ← its ladder
      '##....................##', //  4
      '##.....r..........t...##', //  5
      '##....................##', //  6
      // The creek is a real BED now (',' — one step down, dry shingle), not a
      // bottomless ravine: drop in anywhere, and climb out only where a vine
      // hangs. The old west ford stays level ground; the east crossing is a
      // planked bridge AT GRADE over the water — one step of creek is no
      // headroom, so the bridge is deck-only and dams the bed in two, which
      // is why each half hangs its own vine. The east vine also serves the
      // bridge itself: haul out of the creek straight onto the planks.
      '########..,,,,,,nnv,,,##', //  7  ← the creek · the bridge · its vine
      '########..v,,,,,nn,,,,##', //  8  ← the west reach's vine, by the ford
      '########..,,,,,,nn,,,,##', //  9
      '##....................##', // 10
      '##...t..........r.....##', // 11
      '##.w..................##', // 12  ← the guild wagon (way home)
      '##....................##', // 13
      '########################', // 14
      '########################', // 15
    ],
    entry: [4.5, 12.5],
    // THE CREEK HAS WATER IN IT. Every ',' of the bed, and nothing else — the
    // grid above is untouched, so the bed is still a step down, the vines
    // still serve it, and the bridge still hangs at grade over it. That is the
    // whole argument for water being an overlay: this needed no new char, no
    // change to a shipped layout, and no climb went stale.
    // The 'v' cells (7,18 and 8,10) stay dry: a vine you haul out on is the
    // one foothold in a creek that should not be under water.
    water: [
      [10, 7], [11, 7], [12, 7], [13, 7], [14, 7], [15, 7], [19, 7], [20, 7], [21, 7],
      [11, 8], [12, 8], [13, 8], [14, 8], [15, 8], [18, 8], [19, 8], [20, 8], [21, 8],
      [10, 9], [11, 9], [12, 9], [13, 9], [14, 9], [15, 9], [18, 9], [19, 9], [20, 9], [21, 9],
    ],
    spawns: [
      { prey: 'squirrel', x: 5, y: 4 }, { prey: 'squirrel', x: 14, y: 5 }, { prey: 'squirrel', x: 18, y: 11 },
      { prey: 'opossum', x: 10, y: 3 }, { prey: 'opossum', x: 7, y: 12 },
      { prey: 'badger', x: 19, y: 12 },
    ],
  },
  // ── The buildings, cut to the size of the buildings ──────────────────────
  // Every room below stands on a plot the width of the facade that contains it,
  // give or take a tile — you no longer walk into a shed and find a hall. Where
  // that leaves too little floor for what a building does, the answer is a
  // STOREY, not a wider room: a tower is tall, so it gets stairs and stacks its
  // rooms up the way the art already implies. Template: 9 or 11 wide, five or
  // seven walkable columns, furniture on rows 3 and 5, row 7 kept clear so the
  // doorway is never blocked, '+' in a wall row is a stair.
  //             012345678
  library: {
    id: 'library', theme: 'interior', name: 'The Stacks',
    grid: [
      '#########', //  0
      '#BBB+BBB#', //  1  ← the stair up to the reading room
      '#B.....B#', //  2
      '#B.bbb.B#', //  3  ← aisle stacks (waist-high, seen over)
      '#B.....B#', //  4
      '#B.bbb.B#', //  5
      '#B.....B#', //  6
      '#B.....B#', //  7
      '#BBBdBBB#', //  8  ← the gap is the door out
      '#########', //  9
    ],
    entry: [4.5, 7.3],
    spawns: [],
    portals: [{ x: 4.5, y: 1.5, to: 'libraryLoft', at: [4.5, 7.3], stairs: true }],
  },
  //             012345678
  libraryLoft: {
    id: 'libraryLoft', theme: 'interior', name: 'The Reading Room', exitStairs: true,
    grid: [
      '#########', //  0
      '#BBBBBBB#', //  1
      '#B.....B#', //  2
      '#B.f.f.B#', //  3  ← the reading desks
      '#B.....B#', //  4
      '#B.bbb.B#', //  5  ← the shelved wall
      '#B.....B#', //  6
      '#B.....B#', //  7
      // 'd', not '+': DOWN is an EXIT. The floor below is not a map any more —
      // it is a room stamped into the estate — so the way back is to pop the
      // step you climbed from, which is exactly what an exit does.
      '#BBBdBBB#', //  8  ← the stair back down
      '#########', //  9
    ],
    entry: [4.5, 7.3],
    props: [
      { art: 'teacherDesk', x: 3.5, y: 4, w: 35 }, { art: 'globe', x: 5.5, y: 4, w: 21 },
      { art: 'gmPortrait', x: 4.5, y: 2.02, w: 22 },
    ],
  },

  // ── The grounds ──────────────────────────────────────────────────────────
  // NOT a constant. The campus is the one map the player can REBUILD, so its
  // layout lives on `guild.campus` and campus.js derives this shape from it —
  // see mapForLocale below, which swaps this placeholder for the live campus.
  // The derivation keeps the original invariant: each building declares only its
  // facade, its width and where its door falls, and the grid, the footprint it
  // blocks and the threshold cell are all computed, so a door can never drift
  // off its own doorway however the player rearranges the estate.
  campus: null,

  //             0123456789012345678
  arena: {
    id: 'arena', theme: 'arena', name: 'The Sparring Ring',
    grid: [
      '###################', //  0
      '#BBBBBBBBBBBBBBBBB#', //  1
      '#B.^^^^^^^^^^^^^.B#', //  2  ← the spectators' tier, one step up
      '#B.Lf.........fL.B#', //  3  ← the pells, and a ladder up at each end
      '#B...............B#', //  4
      '#B...............B#', //  5
      '#B.......f.......B#', //  6  ← the sword in the stone, centre ring
      '#B...............B#', //  7
      '#B...............B#', //  8
      '#B..f.........f..B#', //  9
      '#B...............B#', // 10
      '#BBBBBBBBdBBBBBBBB#', // 11
      '###################', // 12
    ],
    entry: [9.5, 10.3],
    props: [
      { art: 'trainDummy', x: 4.5, y: 4, w: 32 }, { art: 'trainDummy', x: 14.5, y: 4, w: 32 },
      { art: 'trainDummy', x: 4.5, y: 10, w: 32 }, { art: 'trainDummy', x: 14.5, y: 10, w: 32 },
      { art: 'statue', x: 9.5, y: 7, w: 30 },
    ],
  },

  // ── The working buildings ────────────────────────────────────────────────
  // Each is one building you walk THROUGH: an interior wall with a doorway
  // splits it into two rooms, so crossing the gap is crossing a threshold.
  // 19 tiles wide by convention: '#' margin, 'B' wall, 15 cells, 'B', '#'.
  //             01234567890
  kitchen: {
    id: 'kitchen', theme: 'kitchen', name: 'The Kitchen',
    grid: [
      '###########', //  0
      '#BBBBBBBBB#', //  1
      '#B.......B#', //  2
      '#B.f...f.B#', //  3  ← the stone oven · the stove
      '#B.......B#', //  4
      '#B.bbbbb.B#', //  5  ← the counter run
      '#B.......B#', //  6
      '#B.......B#', //  7
      '#BBBBdBBBB#', //  8  ← out to the yard
      '###########', //  9
    ],
    entry: [5.5, 7.3],
    props: [
      { art: 'stoneOven', x: 3.5, y: 4, w: 23 }, { art: 'kitchenStove', x: 7.5, y: 4, w: 22 },
      { art: 'hangingHerbs', x: 5.5, y: 2.02, w: 27 },
      { art: 'provisionBarrel', x: 2.6, y: 7, w: 20 }, { art: 'breadPile', x: 8.4, y: 7, w: 17 },
    ],
  },
  // ── A SCALE PROBE (2026-07-27) ───────────────────────────────────────────
  // Every other interior is ~19x12 inside a building whose facade is 5-6 tiles
  // wide: you walk into a shed and find a hall. The Forge is re-authored here at
  // BUILDING scale — an 11x10 grid, so a 9-tile plot with 7 walkable columns —
  // to answer the one question that decides how the rest are cut down: does a
  // room this size still feel like a room to work in? Nothing else changes yet;
  // it is still reached by its door on the grounds. If the size reads right, the
  // other eight follow and the plots can be carved into the campus itself.
  //             01234567890
  forge: {
    id: 'forge', theme: 'forge', name: 'The Forge',
    grid: [
      '###########', //  0
      '#BBBBBBBBB#', //  1
      '#B.......B#', //  2
      '#B.f...f.B#', //  3  ← the furnace · the quench barrel
      '#B.......B#', //  4
      '#B...f...B#', //  5  ← the anvil you work, centre of the floor
      '#B.......B#', //  6
      '#B.b...b.B#', //  7  ← the coal bins
      '#BBBBdBBBB#', //  8
      '###########', //  9
    ],
    entry: [5.5, 7.3],
    props: [
      // The anvil is bare-faced so the piece being refined can be laid on it,
      // and flagged `use` — walk into reach and it offers to be struck.
      { art: 'anvilBare', x: 5.5, y: 6, w: 35, use: 'anvil', label: 'Work the anvil' },
      { art: 'forgeFurnace', x: 3.5, y: 4, w: 32 }, { art: 'quenchBarrel', x: 7.5, y: 4, w: 14 },
      { art: 'tools', x: 5.5, y: 2.02, w: 18 },
    ],
  },
  //             012345678
  apothecary: {
    id: 'apothecary', theme: 'apothecary', name: 'The Apothecary',
    grid: [
      '#########', //  0
      '#BBBBBBB#', //  1
      '#B.....B#', //  2
      '#B.f.f.B#', //  3  ← the jar cabinet · the cauldron
      '#B.....B#', //  4
      '#B..f..B#', //  5  ← the sales counter (one cell — the ladder cut its art to ~1.4 tiles)
      '#B.....B#', //  6
      '#B.....B#', //  7
      '#BBBdBBB#', //  8
      '#########', //  9
    ],
    entry: [4.5, 7.3],
    props: [
      { art: 'jarCabinet', x: 3.5, y: 4, w: 20 },
      // The cauldron is the WORKABLE station: walk up and brew the week's
      // potion at it, the way the Forge's anvil takes a refine.
      { art: 'cauldronBoil', x: 5.5, y: 4, w: 32, cls: 'apoth-boil', use: 'cauldron', label: 'Work the cauldron' },
      { art: 'potionCounter', x: 4.5, y: 6, w: 67 },
      // Wall and floor dressing — no grid cell, so nothing here blocks a walk.
      { art: 'recipeBanner', x: 4.5, y: 2.04, w: 46 },
      { art: 'herbBasket', x: 2.6, y: 7, w: 11 }, { art: 'potionGreen', x: 6.4, y: 6.95, w: 8 },
    ],
  },
  //             01234567890
  armory: {
    id: 'armory', theme: 'armory', name: 'The Armory',
    grid: [
      '###########', //  0
      '#BBBBBBBBB#', //  1
      '#B.......B#', //  2
      '#B.f...f.B#', //  3  ← the armour stands
      '#B.......B#', //  4
      '#B.bbbbb.B#', //  5  ← the racks
      '#B.......B#', //  6
      '#B.......B#', //  7
      '#BBBdBBBBB#', //  8  ← 'd' under the shopfront art's own door (~27% across)
      '###########', //  9
    ],
    entry: [4.5, 7.3],
    props: [
      { art: 'armorKnight', x: 3.5, y: 4, w: 20 }, { art: 'armorSteel', x: 7.5, y: 4, w: 22 },
      { art: 'gearCubbies', x: 5.5, y: 2.02, w: 56 },
      { art: 'storeBarrel', x: 2.6, y: 7, w: 14 }, { art: 'footlocker', x: 8.4, y: 7, w: 11 },
    ],
  },
  //             01234567890
  dormitory: {
    id: 'dormitory', theme: 'dormitory', name: 'The Dormitory',
    grid: [
      '###########', //  0
      '#BBBBBBBBB#', //  1
      '#B.......B#', //  2
      '#B.f.f.f.B#', //  3  ← the bunks, two rows of three
      '#B.......B#', //  4
      '#B.f.f.f.B#', //  5
      '#B.......B#', //  6
      '#B.......B#', //  7
      '#BBBBdBBBB#', //  8
      '###########', //  9
    ],
    entry: [5.5, 7.3],
    props: [
      { art: 'bed', x: 3.5, y: 4, w: 32 }, { art: 'bunkIron', x: 5.5, y: 4, w: 32 }, { art: 'bed', x: 7.5, y: 4, w: 32 },
      { art: 'bunkPosted', x: 3.5, y: 6, w: 33 }, { art: 'bed', x: 5.5, y: 6, w: 32 }, { art: 'bunkIron', x: 7.5, y: 6, w: 32 },
      { art: 'wardrobe', x: 5.5, y: 2.02, w: 30 }, { art: 'bedCandle', x: 8.4, y: 7, w: 9 },
    ],
  },
  // THE ACADEMY IS A TOWER, so it is three rooms stacked, not one wide one —
  // the facade was always ten tiles tall on a five-tile base and the interior
  // never used the height. A storey per FORM: you climb as the students do, and
  // each floor is small because a class is small. The stair is a '+' in the wall
  // row, the same cell the Great Hall has always used for its back stair.
  //             012345678
  classroom: {
    id: 'classroom', theme: 'classroom', name: 'The Classroom · First Form',
    grid: [
      '#########', //  0
      '#BBB+BBB#', //  1  ← the stair up to the Second Form
      '#B.....B#', //  2
      '#B.f...B#', //  3  ← the lectern, clear of the stair's line
      '#B.....B#', //  4
      '#B.f.f.B#', //  5  ← the First Form's desks
      '#B.....B#', //  6
      '#B.....B#', //  7
      '#BBBdBBB#', //  8
      '#########', //  9
    ],
    entry: [4.5, 7.3],
    props: [
      { art: 'lectern', x: 3.5, y: 4, w: 47 },
      { art: 'classDesk', x: 3.5, y: 6, w: 18 }, { art: 'classDesk', x: 5.5, y: 6, w: 18 },
      { art: 'lessonBoard', x: 2.6, y: 2.02, w: 29 },
    ],
    portals: [{ x: 4.5, y: 1.5, to: 'classroom2', at: [4.5, 7.3], stairs: true }],
  },
  //             012345678
  classroom2: {
    id: 'classroom2', theme: 'classroom', name: 'The Classroom · Second Form', exitStairs: true,
    grid: [
      '#########', //  0
      '#BBB+BBB#', //  1  ← up to the Third Form
      '#B.....B#', //  2
      '#B.f...B#', //  3
      '#B.....B#', //  4
      '#B.f.f.B#', //  5
      '#B.....B#', //  6
      '#B.....B#', //  7
      '#BBBdBBB#', //  8  ← down to the First Form (an exit — pops the step up)
      '#########', //  9
    ],
    entry: [4.5, 7.3],
    props: [
      { art: 'lectern', x: 3.5, y: 4, w: 47 },
      { art: 'classDesk', x: 3.5, y: 6, w: 18 }, { art: 'classDesk', x: 5.5, y: 6, w: 18 },
      { art: 'globe', x: 6.4, y: 2.02, w: 21 },
    ],
    // `enter` so the Third Form remembers THIS floor to come back down to.
    portals: [{ x: 4.5, y: 1.5, to: 'classroom3', at: [4.5, 7.3], enter: true, stairs: true }],
  },
  //             012345678
  classroom3: {
    id: 'classroom3', theme: 'classroom', name: 'The Classroom · Third Form', exitStairs: true,
    grid: [
      '#########', //  0
      '#BBBBBBB#', //  1
      '#B.....B#', //  2
      '#B.f...B#', //  3  ← the master of the senior form
      '#B.....B#', //  4
      '#B.f.f.B#', //  5
      '#B.....B#', //  6
      '#B.....B#', //  7
      '#BBBdBBB#', //  8  ← down to the Second Form
      '#########', //  9
    ],
    entry: [4.5, 7.3],
    props: [
      { art: 'teacherDesk', x: 3.5, y: 4, w: 35 },
      { art: 'classDesk', x: 3.5, y: 6, w: 18 }, { art: 'classDesk', x: 5.5, y: 6, w: 18 },
      { art: 'abacus', x: 6.4, y: 7, w: 12 },
    ],
  },
  //             012345678
  guildhall: {
    id: 'guildhall', theme: 'guildhall', name: 'The Great Hall',
    grid: [
      '#########', //  0
      '#BBB+BBB#', //  1  ← the stair up to the Guildmaster's study
      '#B.....B#', //  2
      '#B.f.f.B#', //  3  ← the bookshelf · the banner
      '#B.....B#', //  4
      '#B..f..B#', //  5  ← the plans table
      '#B.....B#', //  6
      '#B.....B#', //  7
      '#BBBdBBB#', //  8
      '#########', //  9
    ],
    entry: [4.5, 7.3],
    props: [
      { art: 'gmBookshelf', x: 3.5, y: 4, w: 37 }, { art: 'gmBanner', x: 5.5, y: 4, w: 13 },
      // The plans table. Reading what is spread on it opens the Build tab — the
      // estate's only door, and the one place the drawing and the ground you
      // walk are the same object (hall.js readEstatePlan → campus.js).
      { art: 'gmDesk', x: 4.5, y: 6, w: 47, use: 'estatePlan', label: 'Read the estate plans' },
      // On the desk: inside its footprint in BOTH lenses (restOn stands them on
      // its top in FP; the top-down draws them over its face). The old anchor
      // (4.0, 6.12) was laid against the 110px desk and landed on the floor
      // once the ladder cut the desk to 47.
      { art: 'gmLedgers', x: 4.35, y: 5.8, w: 9 },
      { art: 'gmPortrait', x: 2.6, y: 2.02, w: 22 }, { art: 'gmBust', x: 6.4, y: 2.02, w: 23 },
    ],
    portals: [{ x: 4.5, y: 1.5, to: 'guildmaster', at: [4.5, 7.3], stairs: true }],
  },
  //             012345678
  guildmaster: {
    id: 'guildmaster', theme: 'guildmaster', name: "The Guildmaster's Study", exitStairs: true,
    grid: [
      '#########', //  0
      '#BBBBBBB#', //  1
      '#B.....B#', //  2
      '#B..f..B#', //  3  ← the great desk (one cell — the ladder cut its art to ~1 tile)
      '#B.....B#', //  4
      '#B.f...B#', //  5  ← the chair
      '#B.....B#', //  6
      '#B.....B#', //  7
      '#BBBdBBB#', //  8  ← the stair back down to the hall
      '#########', //  9
    ],
    entry: [4.5, 7.3],
    props: [
      // The great desk keeps its own copy of the plans — the study is his room,
      // and the hall's table should not be the only place he can think.
      { art: 'gmDesk', x: 4.5, y: 4, w: 47, use: 'estatePlan', label: 'Read the estate plans' },
      { art: 'gmLedgers', x: 4.25, y: 3.8, w: 9 },   // on the desk — same story as the hall's

      { art: 'gmThrone', x: 3.5, y: 6, w: 15 },
      { art: 'gmPortrait', x: 2.6, y: 2.02, w: 22 }, { art: 'gmBust', x: 6.4, y: 2.02, w: 23 },
    ],
  },
};

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
