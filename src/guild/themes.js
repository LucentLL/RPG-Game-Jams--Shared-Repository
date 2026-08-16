/**
 * THE LIGHT AND SURFACE TABLES.
 *
 * Lifted verbatim out of delve-maps.js (2026-08-15) for ONE reason: the map
 * pack validator needs THEMES, and delve-maps.js now BUILDS its charts from
 * the pack — so leaving the tables there made the import graph a cycle
 * (delve-maps → map-pack → map-pack-validate → delve-maps), and a cycle read
 * during module evaluation hands you a THEMES that is still in its temporal
 * dead zone. Nothing about the tables changed; delve-maps.js re-exports both
 * names, so every existing importer is untouched.
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
