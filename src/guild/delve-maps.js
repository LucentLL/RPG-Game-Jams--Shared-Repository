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
 *   L  ladder · v  vine — the climb link. Ground you walk onto, dressed with
 *      the thing you climb, and the ONLY cell a change of level is legal across.
 *      Put one directly south of the ledge it serves so it leans on its face.
 *
 * Interiors may also carry:
 *   name    the room's title, shown in the HUD (and on arrival)
 *   props   [{art, x, y, w}] upright art.js standees (x centre, y base, px wide)
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
  // Open air: pale distance rather than black, and you see half again as far —
  // but it must still CLOSE, because the renderer only builds a few tiles
  // around you and a haze that has not arrived by the edge of that leaves the
  // world visibly stopping in mid-air. A meadow with weather in it, not a vista.
  // `sky` means no ceiling is built at all: the background IS the sky, and the
  // haze runs up into it. A meadow with a roof on it is a cave with grass in it.
  open: { rgb: [150, 168, 186], near: 2.6, far: 7.4, sprite: 0.92, sky: true },
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
    /** A room theme: floor tiles + one wall palette off an A4 wall sheet. */
    const room = (sheet, src, fill, wallSheet, wx) => ({
      ...rock, sheet, src, fill,
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
      // raked sand under blue-grey ashlar tiers
      arena: room('floors', 16, [[4, 2], [5, 2], [6, 2], [7, 2]], 'stonewall', 408),
    };
  })(),
};
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
      '##....BB................##', //  7
      '##..t.................r.##', //  8
      '##........###########..###', //  9  ← east stair-shaft neck
      '#####..##############..###', // 10
      '#####..##############..###', // 11
      '#####..##############..###', // 12
      '##..........###....BB...##', // 13  ← entry floor · east chamber
      '##..s.......###.....r...##', // 14
      '##....====m..........o..##', // 15
      '##...o............^^^^t.##', // 16  ← the upper gallery, one step up
      '##.r........###...^^^^..##', // 17
      '##..........###....L....##', // 18  ← the ladder up to it
      '##########################', // 19
      '##########################', // 20
    ],
    entry: [4.5, 15.5],
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
      '########..######..######', //  7  ← the creek ravine
      '########..######..######', //  8
      '########..######..######', //  9
      '##....................##', // 10
      '##...t..........r.....##', // 11
      '##.w..................##', // 12  ← the guild wagon (way home)
      '##....................##', // 13
      '########################', // 14
      '########################', // 15
    ],
    entry: [4.5, 12.5],
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
      { art: 'teacherDesk', x: 3.5, y: 4, w: 84 }, { art: 'globe', x: 5.5, y: 4, w: 36 },
      { art: 'gmPortrait', x: 4.5, y: 2.02, w: 64 },
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
      { art: 'trainDummy', x: 4.5, y: 4, w: 50 }, { art: 'trainDummy', x: 14.5, y: 4, w: 50 },
      { art: 'trainDummy', x: 4.5, y: 10, w: 50 }, { art: 'trainDummy', x: 14.5, y: 10, w: 50 },
      { art: 'statue', x: 9.5, y: 7, w: 84 },
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
      { art: 'stoneOven', x: 3.5, y: 4, w: 48 }, { art: 'kitchenStove', x: 7.5, y: 4, w: 48 },
      { art: 'hangingHerbs', x: 5.5, y: 2.02, w: 90 },
      { art: 'provisionBarrel', x: 2.6, y: 7, w: 40 }, { art: 'breadPile', x: 8.4, y: 7, w: 42 },
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
      { art: 'anvilBare', x: 5.5, y: 6, w: 84, use: 'anvil', label: 'Work the anvil' },
      { art: 'forgeFurnace', x: 3.5, y: 4, w: 90 }, { art: 'quenchBarrel', x: 7.5, y: 4, w: 36 },
      { art: 'tools', x: 5.5, y: 2.02, w: 44 },
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
      '#B.fff.B#', //  5  ← the sales counter
      '#B.....B#', //  6
      '#B.....B#', //  7
      '#BBBdBBB#', //  8
      '#########', //  9
    ],
    entry: [4.5, 7.3],
    props: [
      { art: 'jarCabinet', x: 3.5, y: 4, w: 72 },
      // The cauldron is the WORKABLE station: walk up and brew the week's
      // potion at it, the way the Forge's anvil takes a refine.
      { art: 'cauldronBoil', x: 5.5, y: 4, w: 60, cls: 'apoth-boil', use: 'cauldron', label: 'Work the cauldron' },
      { art: 'potionCounter', x: 4.5, y: 6, w: 126 },
      // Wall and floor dressing — no grid cell, so nothing here blocks a walk.
      { art: 'recipeBanner', x: 4.5, y: 2.04, w: 96 },
      { art: 'herbBasket', x: 2.6, y: 7, w: 36 }, { art: 'potionGreen', x: 6.4, y: 6.95, w: 20 },
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
      { art: 'armorKnight', x: 3.5, y: 4, w: 42 }, { art: 'armorSteel', x: 7.5, y: 4, w: 42 },
      { art: 'gearCubbies', x: 5.5, y: 2.02, w: 120 },
      { art: 'storeBarrel', x: 2.6, y: 7, w: 34 }, { art: 'footlocker', x: 8.4, y: 7, w: 50 },
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
      { art: 'bed', x: 3.5, y: 4, w: 42 }, { art: 'bunkIron', x: 5.5, y: 4, w: 42 }, { art: 'bed', x: 7.5, y: 4, w: 42 },
      { art: 'bunkPosted', x: 3.5, y: 6, w: 44 }, { art: 'bed', x: 5.5, y: 6, w: 42 }, { art: 'bunkIron', x: 7.5, y: 6, w: 42 },
      { art: 'wardrobe', x: 5.5, y: 2.02, w: 80 }, { art: 'bedCandle', x: 8.4, y: 7, w: 18 },
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
      { art: 'lectern', x: 3.5, y: 4, w: 78 },
      { art: 'classDesk', x: 3.5, y: 6, w: 42 }, { art: 'classDesk', x: 5.5, y: 6, w: 42 },
      { art: 'lessonBoard', x: 2.6, y: 2.02, w: 66 },
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
      { art: 'lectern', x: 3.5, y: 4, w: 78 },
      { art: 'classDesk', x: 3.5, y: 6, w: 42 }, { art: 'classDesk', x: 5.5, y: 6, w: 42 },
      { art: 'globe', x: 6.4, y: 2.02, w: 36 },
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
      { art: 'teacherDesk', x: 3.5, y: 4, w: 90 },
      { art: 'classDesk', x: 3.5, y: 6, w: 42 }, { art: 'classDesk', x: 5.5, y: 6, w: 42 },
      { art: 'abacus', x: 6.4, y: 7, w: 38 },
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
      { art: 'gmBookshelf', x: 3.5, y: 4, w: 84 }, { art: 'gmBanner', x: 5.5, y: 4, w: 40 },
      // The plans table. Reading what is spread on it opens the Build tab — the
      // estate's only door, and the one place the drawing and the ground you
      // walk are the same object (hall.js readEstatePlan → campus.js).
      { art: 'gmDesk', x: 4.5, y: 6, w: 110, use: 'estatePlan', label: 'Read the estate plans' },
      { art: 'gmLedgers', x: 4.0, y: 6.12, w: 34 },
      { art: 'gmPortrait', x: 2.6, y: 2.02, w: 60 }, { art: 'gmBust', x: 6.4, y: 2.02, w: 30 },
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
      '#B.fff.B#', //  3  ← the great desk
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
      { art: 'gmDesk', x: 4.5, y: 4, w: 120, use: 'estatePlan', label: 'Read the estate plans' },
      { art: 'gmLedgers', x: 3.7, y: 4.12, w: 34 },
      { art: 'gmThrone', x: 3.5, y: 6, w: 32 },
      { art: 'gmPortrait', x: 2.6, y: 2.02, w: 60 }, { art: 'gmBust', x: 6.4, y: 2.02, w: 30 },
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
  return true;
}
