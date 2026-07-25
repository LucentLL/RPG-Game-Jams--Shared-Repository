/**
 * @file Delve maps — authored 2.5D explorable locales (data only; delve.js runs them).
 *
 * The look is the classic top-down "Zelda cliff" illusion: a walkable plateau
 * top, a rubble lip around its rim, a tall rock face hanging below every south
 * edge, and near-black chasm everywhere the ground fell away. All of it comes
 * from ONE pre-baked kit — `public/assets/tiles/cliffs.png` (zcliffs_3, 48px
 * tiles) — which ships the same plateau twice: sandy-tan (the mine) and grass
 * (the near country). A THEME below is just the tile-coordinate table for one
 * of those palettes, so every future biome is a new table, not new code.
 *
 * Maps are ASCII grids (one string per row, all equal length):
 *   #  chasm / void            .  walkable floor
 *   s  entry stairs (floor; the 3×3 stair-mouth decal centers here; exit zone)
 *   w  wagon exit (floor; the guild wagon standee; exit zone — meadow maps)
 *   o  ore node   (floor, blocks movement, COLLECTIBLE — bump it to mine it)
 *   r  boulder    (floor, impassable)      t  stalagmite / tree (impassable)
 *   =  minecart rail run (floor, passable) m  minecart (floor, impassable)
 *
 * Creature spawns are explicit `{prey, x, y}` (tile coords; delve.js centers
 * them) so terrain and population balance independently. Every prey id must
 * exist in locales.js PREY — the delve pays real hunt spoils through hall.js.
 */

/** Tile-coordinate tables into cliffs.png (units: 48px tiles on the sheet). */
export const THEMES = {
  mine: {
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
      '##......................##', //  7
      '##..t.................r.##', //  8
      '##........###########..###', //  9  ← east stair-shaft neck
      '#####..##############..###', // 10
      '#####..##############..###', // 11
      '#####..##############..###', // 12
      '##..........###.........##', // 13  ← entry floor · east chamber
      '##..s.......###.....r...##', // 14
      '##....====m..........o..##', // 15
      '##...o................t.##', // 16
      '##.r........###.........##', // 17
      '##..........###.........##', // 18
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
      '##....................##', //  2
      '##..t.......t.......t.##', //  3
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
};

/** The walkable chart for a locale, or null (most locales are still unmapped). */
export function mapForLocale(localeId) { return DELVE_MAPS[localeId] || null; }

/** Cheap authoring lint — ragged rows / off-floor spawns throw or warn early. */
export function validateMap(map) {
  const w = map.grid[0].length;
  for (const row of map.grid) if (row.length !== w) throw new Error(`delve map ${map.id}: ragged row (${row.length} vs ${w})`);
  for (const s of map.spawns) {
    const ch = (map.grid[s.y] || '')[s.x];
    if (!ch || ch === '#') console.warn(`delve map ${map.id}: spawn ${s.prey} at ${s.x},${s.y} is on void`);
  }
  return true;
}
