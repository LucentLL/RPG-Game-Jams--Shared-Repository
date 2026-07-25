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
  //             0123456789012345678
  library: {
    id: 'library', theme: 'interior', name: 'The Library',
    grid: [
      '##################', //  0
      '#BBBBBBBBBBBBBBBB#', //  1  ← the back wall of the stacks
      '#B..............B#', //  2
      '#B.bbbbb..bbbbb.B#', //  3  ← aisle stacks (waist-high, seen over)
      '#B..............B#', //  4
      '#B.bbbbb..bbbbb.B#', //  5
      '#B..............B#', //  6
      '#B.bbbbb..bbbbb.B#', //  7
      '#B..............B#', //  8
      '#B..............B#', //  9
      '#BBBBBBBBdBBBBBBB#', // 10  ← south wall; the gap is the door out
      '##################', // 11
    ],
    entry: [9.5, 9.3],
    spawns: [],
  },

  // ── The grounds ──────────────────────────────────────────────────────────
  // The hub the Guildmaster walks. Every building stands on its own footprint
  // ('f' cells, impassable) with a '+' doorway cut into its south wall; step
  // onto that and you are inside. Its door puts you back on this spot.
  // Generated rather than drawn: each building declares its facade sprite, how
  // wide to render it, which row its base sits on, and where its door falls
  // across its width — the grid, the footprint it blocks and the threshold cell
  // are derived, so a door can never drift off its own doorway. Bases are set
  // ~13 rows apart because these facades are TALL (the cathedral is eleven
  // tiles) and a near building would otherwise swallow the one behind it.
  campus: (() => {
    const W = 28, H = 46;
    const g = Array.from({ length: H }, () => Array(W).fill('.'));
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) if (x < 2 || x >= W - 2 || y < 1 || y >= H - 1) g[y][x] = '#';
    }
    const PLAN = [
      { to: 'library',   art: 'bldgLibrary',   name: 'Library',    x: 3,  px: 238, base: 13, frac: 0.50 },
      { to: 'guildhall', art: 'bldgGuildhall', name: 'Great Hall', x: 11, px: 240, base: 13, frac: 0.50 },
      { to: 'kitchen',   art: 'bldgKitchen',   name: 'Kitchen',    x: 19, px: 285, base: 13, frac: 0.45 },
      { to: 'forge',     art: 'bldgForge',     name: 'Forge',      x: 3,  px: 285, base: 27, frac: 0.45 },
      { to: 'classroom', art: 'bldgAcademy',   name: 'Academy',    x: 11, px: 238, base: 27, frac: 0.50 },
      { to: 'armory',    art: 'bldgArmory',    name: 'Armory',     x: 19, px: 288, base: 27, frac: 0.27 },
      { to: 'dormitory', art: 'bldgDormitory', name: 'Dormitory',  x: 4,  px: 267, base: 40, frac: 0.50 },
      { to: 'arena',     art: 'bldgArena',     name: 'Arena',      x: 16, px: 228, base: 40, frac: 0.50 },
    ];
    const buildings = PLAN.map((b) => {
      const w = Math.max(1, Math.round(b.px / 48));
      for (let y = b.base - 2; y < b.base; y++) {
        for (let x = b.x; x < b.x + w; x++) if (g[y] && g[y][x] === '.') g[y][x] = 'f';
      }
      const dx = b.x + Math.min(w - 1, Math.floor(w * b.frac));
      g[b.base - 1][dx] = '+'; // the threshold: walk onto it and you're inside
      return { to: b.to, art: b.art, name: b.name, x: b.x, y: b.base - 2, w, h: 2, px: b.px, door: [dx, b.base - 1] };
    });
    g[H - 3][13] = 'w'; // the gate — the way back to the desk
    return {
      id: 'campus', theme: 'meadow', name: 'The Grounds',
      grid: g.map((r) => r.join('')),
      entry: [13.5, H - 4.7],
      buildings,
      props: [
        { art: 'statue', x: 13.5, y: 20, w: 90 },
        { art: 'lampPost', x: 9.5, y: 20, w: 58 }, { art: 'lampPost', x: 17.5, y: 20, w: 58 },
        { art: 'lampPost', x: 9.5, y: 34, w: 58 }, { art: 'lampPost', x: 17.5, y: 34, w: 58 },
        { art: 'trainDummy', x: 22.5, y: 38, w: 50 }, { art: 'trainDummy', x: 23.5, y: 39, w: 50 },
        { art: 'gateArch', x: 13.5, y: 44, w: 144 },
        { art: 'treeTall', x: 3.5, y: 20, w: 80 }, { art: 'treeTall', x: 24.5, y: 20, w: 80 },
        { art: 'treeTall', x: 3.5, y: 34, w: 80 }, { art: 'treeTall', x: 24.5, y: 44, w: 80 },
      ],
    };
  })(),

  //             0123456789012345678
  arena: {
    id: 'arena', theme: 'arena', name: 'The Sparring Ring',
    grid: [
      '###################', //  0
      '#BBBBBBBBBBBBBBBBB#', //  1
      '#B...............B#', //  2
      '#B..f.........f..B#', //  3  ← the pells
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
  //             0123456789012345678
  kitchen: {
    id: 'kitchen', theme: 'kitchen', name: 'The Kitchen',
    grid: [
      '###################', //  0
      '#BBBBBBBBBBBBBBBBB#', //  1
      '#B..f........f...B#', //  2  ← the two stone ovens, against the wall
      '#B.bbbb.....bbbb.B#', //  3  ← counter runs
      '#B...............B#', //  4
      '#B.bb.......bb...B#', //  5  ← prep tables
      '#B...............B#', //  6
      '#BBBBBBB...BBBBBBB#', //  7  ← the pantry door
      '#B..f...........fB#', //  8  ← sacks of grain
      '#B.bbb.....bbb...B#', //  9  ← provision shelves
      '#B...............B#', // 10
      '#BBBBBBBBdBBBBBBBB#', // 11  ← out to the yard
      '###################', // 12
    ],
    entry: [9.5, 10.3],
    props: [
      { art: 'stoneOven', x: 4.5, y: 3, w: 48 }, { art: 'kitchenStove', x: 13.5, y: 3, w: 48 },
      { art: 'hangingHerbs', x: 8, y: 2.02, w: 96 }, { art: 'hangingMeat', x: 10.6, y: 2.02, w: 52 },
      { art: 'hangingPot', x: 15.6, y: 2.02, w: 40 },
      { art: 'breadPile', x: 3.5, y: 6, w: 44 }, { art: 'floppyfish', x: 11.5, y: 6, w: 22 },
      { art: 'sackPile', x: 4.5, y: 9, w: 78 }, { art: 'provisionBarrel', x: 16.5, y: 9, w: 42 },
    ],
  },
  //             0123456789012345678
  forge: {
    id: 'forge', theme: 'forge', name: 'The Forge',
    grid: [
      '###################', //  0
      '#BBBBBBBBBBBBBBBBB#', //  1
      '#B...............B#', //  2
      '#B..f...f...f....B#', //  3  ← three anvils on their stumps
      '#B...............B#', //  4
      '#B.f...........f.B#', //  5  ← quench barrel · tool bench
      '#B...............B#', //  6
      '#BBBBBB....BBBBBBB#', //  7  ← through to the coal store
      '#B...............B#', //  8
      '#B.bbb......f....B#', //  9  ← coal bins · the stock rack
      '#B...............B#', // 10
      '#BBBBBBBBdBBBBBBBB#', // 11
      '###################', // 12
    ],
    entry: [9.5, 10.3],
    props: [
      { art: 'anvilWork', x: 4.5, y: 4, w: 84 }, { art: 'anvilFront', x: 8.5, y: 4, w: 48 },
      { art: 'anvilWork', x: 12.5, y: 4, w: 84 },
      { art: 'forgeFurnace', x: 3.6, y: 6, w: 90 }, { art: 'quenchBarrel', x: 15.5, y: 6, w: 36 },
      { art: 'forgeTwin', x: 12.5, y: 10, w: 96 }, { art: 'tools', x: 8, y: 2.02, w: 44 },
    ],
  },
  //             0123456789012345678
  armory: {
    id: 'armory', theme: 'armory', name: 'The Armory',
    grid: [
      '###################', //  0
      '#BBBBBBBBBBBBBBBBB#', //  1
      '#B...............B#', //  2
      '#B.bbbbb...bbbbb.B#', //  3  ← the racks along both walls
      '#B...............B#', //  4
      '#B...............B#', //  5
      '#B.ff..........f.B#', //  6  ← the issue counter (two cells) · armour stand
      '#BBBBBBB...BBBBBBB#', //  7  ← through to the vault
      '#B...............B#', //  8
      '#B..bb..f..bb..f.B#', //  9  ← crated stock
      '#B...............B#', // 10
      '#BBBBBBBBdBBBBBBBB#', // 11
      '###################', // 12
    ],
    entry: [9.5, 10.3],
    props: [
      { art: 'issueCounter', x: 4.0, y: 7, w: 130 }, { art: 'armorPlate', x: 15.5, y: 7, w: 39 },
      { art: 'armorKnight', x: 9.5, y: 2.02, w: 45 }, { art: 'armorSteel', x: 7, y: 2.02, w: 45 },
      { art: 'practiceTarget', x: 12, y: 2.02, w: 39 },
      { art: 'footlocker', x: 8.5, y: 10, w: 57 }, { art: 'storeBarrel', x: 15.5, y: 10, w: 36 },
      { art: 'gearCubbies', x: 3.6, y: 11.02, w: 132 },
    ],
  },
  //             0123456789012345678
  dormitory: {
    id: 'dormitory', theme: 'dormitory', name: 'The Dormitory',
    grid: [
      '###################', //  0
      '#BBBBBBBBBBBBBBBBB#', //  1
      '#B...............B#', //  2
      '#B.f.f.f...f.f.f.B#', //  3  ← the bunks, two rows of three
      '#B...............B#', //  4
      '#BBBBBB.....BBBBBB#', //  5  ← through to the second bunkroom
      '#B...............B#', //  6
      '#B.f.f.f...f.f.f.B#', //  7
      '#B...............B#', //  8
      '#BBBBBBBBdBBBBBBBB#', //  9
      '###################', // 10
    ],
    entry: [9.5, 8.3],
    props: [
      { art: 'bed', x: 3.5, y: 4, w: 44 }, { art: 'bunkIron', x: 5.5, y: 4, w: 44 }, { art: 'bed', x: 7.5, y: 4, w: 44 },
      { art: 'bunkPosted', x: 11.5, y: 4, w: 48 }, { art: 'bunkIron', x: 13.5, y: 4, w: 44 }, { art: 'bed', x: 15.5, y: 4, w: 44 },
      { art: 'bunkIron', x: 3.5, y: 8, w: 44 }, { art: 'bed', x: 5.5, y: 8, w: 44 }, { art: 'bunkPosted', x: 7.5, y: 8, w: 48 },
      { art: 'bed', x: 11.5, y: 8, w: 44 }, { art: 'bunkIron', x: 13.5, y: 8, w: 44 }, { art: 'bed', x: 15.5, y: 8, w: 44 },
      { art: 'wardrobe', x: 9.5, y: 2.02, w: 90 }, { art: 'washstand', x: 4.5, y: 6.02, w: 90 },
      { art: 'footlocker', x: 4.5, y: 2.02, w: 52 }, { art: 'bedCandle', x: 14.5, y: 6.02, w: 20 },
    ],
  },
  //             0123456789012345678
  classroom: {
    id: 'classroom', theme: 'classroom', name: 'The Classroom',
    grid: [
      '###################', //  0
      '#BBBBBBBBBBBBBBBBB#', //  1
      '#B......ff.......B#', //  2  ← the lectern
      '#B...............B#', //  3
      '#B.ff..ff..ff....B#', //  4  ← rows of desks
      '#B...............B#', //  5
      '#B.ff..ff..ff....B#', //  6
      '#B...............B#', //  7
      '#BBBBBBB...BBBBBBB#', //  8  ← through to the study nook
      '#B...............B#', //  9
      '#B.ff........f...B#', // 10  ← the master's desk (two cells) · the abacus
      '#BBBBBBBBdBBBBBBBB#', // 11
      '###################', // 12
    ],
    entry: [9.5, 10.3],
    props: [
      { art: 'lectern', x: 9, y: 3, w: 110 },
      { art: 'lessonBoard', x: 5, y: 2.02, w: 96 }, { art: 'globe', x: 12.5, y: 2.02, w: 42 },
      { art: 'classDesk', x: 3.5, y: 5, w: 48 }, { art: 'classDesk', x: 4.5, y: 5, w: 48 },
      { art: 'classDesk', x: 7.5, y: 5, w: 48 }, { art: 'classDesk', x: 8.5, y: 5, w: 48 },
      { art: 'classDesk', x: 11.5, y: 5, w: 48 }, { art: 'classDesk', x: 12.5, y: 5, w: 48 },
      { art: 'classDesk', x: 3.5, y: 7, w: 48 }, { art: 'classDesk', x: 4.5, y: 7, w: 48 },
      { art: 'classDesk', x: 7.5, y: 7, w: 48 }, { art: 'classDesk', x: 8.5, y: 7, w: 48 },
      { art: 'classDesk', x: 11.5, y: 7, w: 48 }, { art: 'classDesk', x: 12.5, y: 7, w: 48 },
      { art: 'teacherDesk', x: 4, y: 11, w: 120 }, { art: 'abacus', x: 13.5, y: 11, w: 48 },
      { art: 'classBench', x: 15.5, y: 10.02, w: 60 },
    ],
  },
  //             0123456789012345678
  guildhall: {
    id: 'guildhall', theme: 'guildhall', name: 'The Great Hall',
    grid: [
      '###################', //  0
      '#BBBBBBBB+BBBBBBBB#', //  1  ← the stair up to the Guildmaster's study
      '#B...............B#', //  2
      '#B.bb.......bb...B#', //  3  ← the long tables
      '#B...............B#', //  4
      '#B.bb.......bb...B#', //  5
      '#B...............B#', //  6
      '#B.f...........f.B#', //  7  ← the hearth · the notice board
      '#B...............B#', //  8
      '#BBBBBBBBdBBBBBBBB#', //  9
      '###################', // 10
    ],
    entry: [9.5, 8.3],
    props: [
      { art: 'gmBanner', x: 3.5, y: 8, w: 45 }, { art: 'gmBookshelf', x: 15.5, y: 8, w: 100 },
      { art: 'gmPortrait', x: 6.5, y: 2.02, w: 78 }, { art: 'gmPortrait', x: 12.5, y: 2.02, w: 78 },
      { art: 'gmBust', x: 4.5, y: 2.02, w: 36 }, { art: 'gmBust', x: 14.5, y: 2.02, w: 36 },
    ],
    portals: [{ x: 9.5, y: 1.5, to: 'guildmaster', at: [9.5, 8.3] }],
  },
  //             0123456789012345678
  guildmaster: {
    id: 'guildmaster', theme: 'guildmaster', name: "The Guildmaster's Study",
    grid: [
      '###################', //  0
      '#BBBBBBBBBBBBBBBBB#', //  1
      '#B...............B#', //  2
      '#B.ff..ff...ff...B#', //  3  ← shelved walls flanking the great desk
      '#B...............B#', //  4
      '#B......f........B#', //  5  ← the chair
      '#B...............B#', //  6
      '#B.f...........f.B#', //  7  ← the strongbox · the banner
      '#B...............B#', //  8
      '#BBBBBdBB+BBBBBBBB#', //  9  ← out · and the stair back down
      '###################', // 10
    ],
    entry: [6.5, 8.3],
    props: [
      { art: 'gmBookshelf', x: 4, y: 4, w: 96 }, { art: 'gmBookshelf', x: 13, y: 4, w: 96 },
      { art: 'gmDesk', x: 8, y: 4, w: 130 }, { art: 'gmLedgers', x: 7.2, y: 4.12, w: 40 },
      { art: 'gmThrone', x: 8.5, y: 6, w: 36 },
      { art: 'gmStrongbox', x: 3.5, y: 8, w: 66 }, { art: 'gmBanner', x: 15.5, y: 8, w: 45 },
      { art: 'gmPortrait', x: 11.5, y: 2.02, w: 78 }, { art: 'gmBust', x: 5.5, y: 2.02, w: 36 },
    ],
    portals: [{ x: 9.5, y: 9.5, to: 'guildhall', at: [9.5, 2.3] }],
  },
};

/** The walkable chart for a locale, or null (most locales are still unmapped). */
export function mapForLocale(localeId) { return DELVE_MAPS[localeId] || null; }

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
    if (!ch || ch === '#' || 'Bbfrtmo'.includes(ch)) console.warn(`delve map ${map.id}: portal at ${p.x},${p.y} sits on '${ch}' — unreachable`);
    if (!DELVE_MAPS[p.to]) console.warn(`delve map ${map.id}: portal leads to unknown map '${p.to}'`);
  }
  return true;
}
