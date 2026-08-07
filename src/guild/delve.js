/**
 * @file The Delve — walk a guild member through a 2.5D explorable locale.
 *
 * Opened from the Wilds room (hall.js). One member marches in on foot: WASD /
 * arrows, a controller's left stick or d-pad, or (on a touch device, and only
 * there) the on-screen stick drive them across a baked tile map in the
 * top-down cliff style — plateau tops, rubble lips, rock faces over chasm.
 * Creatures from the locale's food chain roam the ground; closing with one
 * hands off to the REAL battle engine (hall's `fight` hook → battle-bridge
 * playHuntBout) and a win banks real hunt spoils on the spot (hall's `onKill`
 * hook). Ore nodes are mined by bumping them. Losing a bout ends the delve.
 *
 * Rendering follows the ranch's CSS-3D contract (DESIGN.md "2D sprites in a
 * 3D world", Octopath-style): the ground is baked ONCE to a data-URI (real
 * tiles from public/assets/tiles/ — see delve-maps.js THEMES) and lives on a
 * perspective-tilted plane (rotateX under perspective); every plateau edge
 * grows REAL vertical cliff-face geometry (strips folded 90° off the plane,
 * textured with the kit's rock faces), raised blocks are true boxes, and all
 * sprites are paper standees counter-rotated upright about their feet. The
 * camera composes rotate·z-lift·scale·translate on the field and follows the
 * walker. The single rAF loop self-stops whenever #delveScreen loses .active
 * (battles borrow the screen; we resume on return). The member is a real
 * Elements-compositor actor via window.__ranchGfx; creatures are plain
 * RPG-Maker 3×4 walk sheets from public/assets/art/.
 */
import { TILES_BASE, ART_BASE } from '../config/assets.js';
import { preyById } from './locales.js';
import { THEMES, DECALS, ORE_KINDS, oreKindAt, mapForLocale, validateMap, makeLevelModel, CLIMB_CH, DECK_CH, FLOOR_LV, wetCells, waterDepths } from './delve-maps.js';
import { waterFrames, waterStripUrl, WADE_SPEED, submergeFor, isSwimming } from './water.js';
import { artSprite } from './art.js';
import { propVolume } from './prop-volume.js';
import { readPad, padReset, touchPrimary, onTouchPrimary, PAD } from '../platform/input.js';
import { claimPad } from '../platform/ui-pad.js';

const TILE = 48;
const TILT = 52;               // plane tilt in degrees — matches the ranch's diorama
const DEPTH = 96;              // cliff drop in px (2 tiles of face art)
export const BLOCK_H = 48;     // raised-block height in px (1 tile of face art)
const PLAYER_SPEED = 3.4;      // tiles/sec — brisk but catchable by nothing
const BODY_R = 0.28;           // collision half-width around the feet point
const WALK_FRAMES = [0, 1, 2, 1];
/**
 * An upright prop is a paper standee: the ART is tall, but the thing itself
 * only stands on a SHALLOW slice of floor at its base. Blocking the whole cell
 * is what held a walker a full tile off an anvil approached from behind while
 * letting them press right against the same anvil from the front — the art's
 * base and the cell's south edge coincide, so only one side ever read right.
 * Prop cells therefore block this deep, measured UP from the art's feet.
 */
const SOLID_DEPTH = 0.55;
/**
 * Walls are full height. A walker pressed against one has their standee drawn
 * straight up its face, which reads as standing inside the stone, so hold them
 * a little further off — but ONLY from the south, the one side where the
 * sprite climbs the wall. Doorways run north–south, so this never narrows one.
 */
const WALL_BACK = 0.34;
/** How close the feet must come before a workable prop offers itself. */
const USE_RANGE = 1.5;

/**
 * Painter's depth for anything STANDING on the plane (a walker, a creature, a
 * furnishing). Rows sort back to front, and whatever stands in a row draws
 * ABOVE that row's own geometry — RPG Maker's rule. That is what keeps a
 * member walking up to a counter in front of it instead of sinking into it,
 * and what lets a shelf keep its end panels without swallowing anyone beside
 * it. The fractional term orders two bodies within the same row.
 */
const standZ = (y) => 10 + (Math.floor(y) + 1) * TILE + 2 + Math.round((y - Math.floor(y)) * 3);

/**
 * How many GROUND ROWS a thing `px` tall hides behind itself.
 *
 * A standee is upright while the ground recedes at cos(TILT), so one tile of
 * floor is only TILE·cos(52°) ≈ 30px of screen height. That is the whole reason
 * tall scenery swallows people: a 96px shelf wall covers three rows of floor
 * behind it, and a ten-tile facade covers sixteen — far more ground than the
 * two-row footprint it actually stands on.
 */
const rowsHidden = (px) => px / (TILE * Math.cos(TILT * Math.PI / 180));
/** Sideways slack on the hide test, so the fade starts before a shoulder is eaten. */
const XRAY_PAD = 0.4;

/** @type {?Object} the active session (null when no delve is running) */
let D = null;
/** Synchronous latch for openDelve's async window — set before the first await
 *  so a double-click (or a second locale's Walk) can never interleave sessions. */
let opening = false;

export function hasDelveMap(localeId) { return !!mapForLocale(localeId); }
/** Is a delve open or mid-open? hall.js gates the Walk handler on this. */
export function isDelveOpen() { return !!D || opening; }

// ---------------------------------------------------------------------------
// Screen + image plumbing
// ---------------------------------------------------------------------------

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}
const screenActive = () => {
  const el = document.getElementById('delveScreen');
  return !!el && el.classList.contains('active');
};

// While the walk is live the controller is walking someone, not a menu. Every
// clause earns its place: `screenActive` rather than "a delve exists", because
// an encounter hands the SCREEN to the arena (which claims the pad itself); and
// `!ended` / `!working` because the end-of-day summary and the work chooser are
// plain DOM cards with no pad binding of their own — releasing the claim is
// what makes them navigable at all.
claimPad(() => !!D && screenActive() && !D.ended && !D.working && !D.fighting);

const _imgCache = {};
/** Shared with the first-person view (delve-fp.js), which needs the same sheets. */
export function loadImg(url) {
  if (!_imgCache[url]) {
    _imgCache[url] = new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      // Evict on failure so a transient 404/network blip doesn't poison every
      // later delve this session (the rejected promise would be cached forever).
      im.onerror = () => { delete _imgCache[url]; reject(new Error('delve: failed to load ' + url)); };
      im.src = url;
    });
  }
  return _imgCache[url];
}

// ---------------------------------------------------------------------------
// The bake — ASCII grid → one ground image + passability
// ---------------------------------------------------------------------------

/** Full-height cells: chasm, veins, raised blocks, and a building's footprint.
 *  Nothing stands in these, and a walker is held clear of them (WALL_BACK).
 *  'D' is a door — a wall until it opens; mountScene unblocks the ones this
 *  session has already opened, exactly as it clears worked seams. */
const BLOCKING = { '#': 1, o: 1, B: 1, b: 1, F: 1, D: 1 };
/**
 * A LEDGE — walkable ground one step up. It bakes as the low raised block it
 * already is ('b': a lifted top plus side panels, exactly a shelf), but unlike
 * 'b' you stand ON it, and you can only get up there through a climb cell.
 */
const LEDGE = '^';
/** Climb links that get a DRESSING standee (a drawn ladder/vine leaning on the
 *  face they serve). Stairs are not here: their steps are real geometry. The
 *  RULES for all climbs live in the shared level model (delve-maps.js). */
const CLIMB = { L: 'ladder', v: 'vine' };
/**
 * What the BAKER should see for an authored cell. A ledge is drawn as its
 * block; terraces pass through (extractGeometry raises them); climbs, stairs
 * and deck cells are drawn as the GROUND under them — plain floor, or the
 * sunken ',' when the model says their ground runs below grade — so floor art
 * runs continuously underneath, and the pit under a bridge stays a pit.
 */
const bakeChar = (ch, x, y, model) => {
  if (ch === LEDGE) return 'b';
  if (FLOOR_LV[ch] != null) return ch;   // terraces 2-6 and the sunken ','
  // A door or a key cell paints as the ground beneath it: the door itself is
  // live geometry (it has to be able to OPEN), the key a standee.
  if (CLIMB_CH[ch] || DECK_CH[ch] || ch === 'D' || ch === 'K') {
    const f = model ? model.floorAt(x, y) : 0;
    return (f != null && f < 0) ? ',' : '.';
  }
  return ch;
};
/** Fraction of walking speed while on the rungs — a climb costs time. */
const CLIMB_SPEED = 0.42;
/** Where a climber renders while between levels: visibly on the way up. */
const CLIMB_LIFT = 0.5;
/** Upright props — boulders, stalagmites, the cart, furniture. These block only
 *  the shallow floor slice their art actually rests on (SOLID_DEPTH), so you can
 *  step in behind one and have it sort in front of you. */
const FOOTED = { r: 1, t: 1, m: 1, f: 1 };
/**
 * How many swaying standees a map may have before the wind drops. Each one is a
 * compositor animation and therefore its own GPU layer for as long as the map
 * is up — the exact currency the renderer rewrite went looking for
 * (reference-css3d-mobile-budget). The shipped meadow has six trees; forty is
 * comfortably clear of it and comfortably short of a forest.
 */
const SWAY_CAP = 40;
/**
 * How many rippling water cells a map may have. Each is an element, though a
 * far cheaper one than a swaying standee (no transform animation, so no layer
 * promotion — just a small repaint the browser schedules itself). Ferncreek's
 * creek is 28; four hundred is a generous lake and still an order of magnitude
 * under the counts that hurt.
 */
const WATER_CELL_CAP = 400;
/** Has the player asked their OS for less motion? Read live rather than cached:
 *  the setting can change under a running tab. The water's own animation is a
 *  CSS keyframe and honours the query itself (delve.css). */
const reducedMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
// Well-mixed 2D hash — naive xor-of-primes checkerboards on % 2 variant picks.
const hash2 = (x, y) => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = ((h ^ (h >>> 13)) * 1274126177) | 0;
  return (h ^ (h >>> 16)) >>> 0;
};

/** Where each sheet key lives. THEMES and DECALS name sheets by these keys. */
export const SHEET_URLS = {
  cliffs: TILES_BASE + 'cliffs.png',
  stairs: TILES_BASE + 'stairs.png',
  ores: TILES_BASE + 'ores.png',
  rocks: TILES_BASE + 'rocks.png',
  rails: TILES_BASE + 'rails.png',
  floors: TILES_BASE + 'floors.png',
  // The Sparring Ring's ground — sandramps_3 out of the shared library, used
  // for its two flat fill tiles alone (the ramps are autotile bookkeeping).
  sand: TILES_BASE + 'sand.png',
  stonewall: TILES_BASE + 'stonewall.png',
  woodwall: TILES_BASE + 'woodwall.png',
  shelves: ART_BASE + 'bookshelf_3x.png',
  mansion: ART_BASE + 'mansion_3x.png',
  kitchen: ART_BASE + 'kitchen_3x.png',
};

/** Load exactly what this map needs: the cliff kit (rim art is always cut from
 *  it), the theme's floor and wall sheets, and a prop sheet only if the grid
 *  actually uses that prop. Interiors never pay for the mine's rails. */
async function loadSheets(map, theme) {
  const keys = new Set(['cliffs', theme.sheet, theme.rimSheet, theme.walls && theme.walls.sheet].filter(Boolean));
  // Every theme standing on this plane, not just its base — a campus with rooms
  // carved into it needs the parquet and the shelf faces of all of them.
  for (const r of (map.regions || [])) {
    const t = THEMES[r.theme];
    if (!t) continue;
    for (const k of [t.sheet, t.rimSheet, t.walls && t.walls.sheet]) if (k) keys.add(k);
  }
  // Painted surfaces need only their FILL sheet — paint is dressing, not rooms.
  for (const r of (map.paint || [])) {
    const t = THEMES[r.theme];
    if (t && t.sheet) keys.add(t.sheet);
  }
  const chars = map.grid.join('');
  // 's' locale exits, upper-floor 'd' stairwells, and climbing portals all
  // paint stair mouths — any of them means the sheet must ride along.
  if (chars.includes('s') || map.exitStairs || (map.portals || []).some((p) => p.stairs)) keys.add('stairs');
  if (chars.includes('o')) keys.add('ores');
  if (/[rt]/.test(chars)) keys.add('rocks');
  if (/[=m]/.test(chars)) keys.add('rails');
  if (chars.includes('n')) keys.add('woodwall');   // bridge decks are planked
  const sheets = {};
  for (const k of keys) sheets[k] = await loadImg(SHEET_URLS[k] || (TILES_BASE + k + '.png'));
  return sheets;
}

/** Bounds-safe accessors over an ASCII grid (outside counts as chasm). */
function gridFns(grid) {
  const rows = grid.length, cols = grid[0].length;
  const at = (x, y) => (x < 0 || y < 0 || x >= cols || y >= rows) ? '#' : grid[y][x];
  return { rows, cols, at, isFloor: (x, y) => at(x, y) !== '#', isVoid: (x, y) => at(x, y) === '#' };
}

/** The chasm color, sampled off the cliff sheet's own holes so it always matches. */
function sampleVoidColor(cliffs, theme) {
  const probe = document.createElement('canvas');
  probe.width = 1; probe.height = 1;
  const pg = probe.getContext('2d', { willReadFrequently: true });
  pg.drawImage(cliffs, theme.voidSample[0], theme.voidSample[1], 1, 1, 0, 0, 1, 1);
  const px = pg.getImageData(0, 0, 1, 1).data;
  return `rgb(${px[0]},${px[1]},${px[2]})`;
}

/**
 * Paint the walkable ground onto ctx: fill per floor cell + the dark ragged
 * rim on chasm-facing edges (the lip you see from above). The vertical rock
 * is real geometry (attachTerrain), so void cells stay TRANSPARENT. The fill
 * may come from a different sheet than the rim (interiors lay 16px parquet
 * on a 48px rock foundation — theme.src scales the fill source).
 *
 * `water` is the liquid channel: a `{ at(x,y), tile }` pair, where `tile` is
 * one 48px water frame. It paints INSTEAD of the theme fill, so the still bake
 * already shows a lake — the animator on top of it (mountScene's overlay) is
 * then a luxury rather than a load-bearing part, and a frame it never gets to
 * draw costs nothing but the motion.
 */
function paintGround(g, grid, theme, sheets, themeAt, water) {
  const { rows, cols, at, isFloor: isFloorRaw, isVoid: isVoidRaw } = gridFns(grid);
  // A SUNKEN cell (',') is a hole in the painted plane: its floor is real but
  // lives a step down, drawn by the pit geometry — so the painter treats it
  // exactly as void (transparent cell, ragged rim lips on the neighbours) and
  // the sunken top quad shows through where the canvas keeps no pixels.
  const isVoid = (x, y) => isVoidRaw(x, y) || at(x, y) === ',';
  const isFloor = (x, y) => isFloorRaw(x, y) && at(x, y) !== ',';
  const rimImg = sheets[theme.rimSheet || theme.sheet || 'cliffs'];
  // A sub-rect of a rim tile, drawn at the same offset inside the destination cell.
  // The RIM always comes from the base theme: a rim only exists where the plane
  // meets its own void, which is the map's outer edge, never a room inside it.
  const part = (t, ox, oy, w, h, dx, dy) =>
    g.drawImage(rimImg, t[0] * TILE + ox, t[1] * TILE + oy, w, h, dx * TILE + ox, dy * TILE + oy, w, h);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!isFloor(x, y)) continue;
      // The FILL is per cell, so one plane can carry a meadow and the parquet of
      // nine rooms standing in it (see `regions`).
      if (water && water.at(x, y)) {
        g.drawImage(water.tile, x * TILE, y * TILE);
      } else {
        const t = themeAt ? themeAt(x, y) : theme;
        const fillImg = sheets[t.sheet || 'cliffs'], src = t.src || TILE;
        const f = t.fill[hash2(x, y) % t.fill.length];
        g.drawImage(fillImg, f[0] * src, f[1] * src, src, src, x * TILE, y * TILE, TILE, TILE);
      }
      const vN = isVoid(x, y - 1), vS = isVoid(x, y + 1), vW = isVoid(x - 1, y), vE = isVoid(x + 1, y);
      if (vN) part(theme.rim.n, 0, 0, TILE, 24, x, y);
      if (vS) part(theme.rim.s, 0, 24, TILE, 24, x, y);
      if (vW) part(theme.rim.w, 0, 0, 24, TILE, x, y);
      if (vE) part(theme.rim.e, 24, 0, 24, TILE, x, y);
      if (vN && vW) part(theme.rim.nw, 0, 0, 24, 24, x, y);
      if (vN && vE) part(theme.rim.ne, 24, 0, 24, 24, x, y);
      if (vS && vW) part(theme.rim.sw, 0, 24, 24, 24, x, y);
      if (vS && vE) part(theme.rim.se, 24, 24, 24, 24, x, y);
      // Diagonal-only void: a small rubble nub keeps the rim's corner honest.
      if (!vN && !vW && isVoid(x - 1, y - 1)) part(theme.rim.nw, 0, 0, 14, 14, x, y);
      if (!vN && !vE && isVoid(x + 1, y - 1)) part(theme.rim.ne, 34, 0, 14, 14, x, y);
      if (!vS && !vW && isVoid(x - 1, y + 1)) part(theme.rim.sw, 0, 34, 14, 14, x, y);
      if (!vS && !vE && isVoid(x + 1, y + 1)) part(theme.rim.se, 34, 34, 14, 14, x, y);
    }
  }
}

/**
 * Cut the wall textures once. Cliff faces always come from the kit's rock
 * tiles (south walls read the art upright; side walls rotated so the top
 * edge lies along the boundary, W mirror-flipped). Raised-block textures are
 * per KIND — 'B' tall, 'b' low — and a theme with `walls` (interiors) cuts
 * them from its own sheet instead (bookshelf faces, crown-wood tops/sides).
 */
function cutWallTex(sheets, theme) {
  const cliffs = sheets.cliffs; // rock rim/face art always comes from the cliff kit
  const texCv = (w, h, draw) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const cg = c.getContext('2d');
    cg.imageSmoothingEnabled = false;
    draw(cg);
    return c;
  };
  const sheetTile = (cg, t, dx, dy) => cg.drawImage(cliffs, t[0] * TILE, t[1] * TILE, TILE, TILE, dx, dy, TILE, TILE);
  // A south-facing texture (TILE wide × h tall) turned into the east/west pair:
  // the element is laid out flat and then folded about a vertical edge, so its
  // art has to be rotated a quarter turn to end up standing upright.
  const sidePair = (face, h) => {
    const e = texCv(h, TILE, (cg) => { cg.translate(0, TILE); cg.rotate(-Math.PI / 2); cg.drawImage(face, 0, 0); });
    const w2 = texCv(h, TILE, (cg) => { cg.translate(h, 0); cg.scale(-1, 1); cg.drawImage(e, 0, 0); });
    return [e.toDataURL(), w2.toDataURL()];
  };
  const faceS = texCv(TILE, DEPTH, (cg) => { sheetTile(cg, theme.faceTop.m, 0, 0); sheetTile(cg, theme.faceBot.m, 0, TILE); });
  const [faceSideE, faceSideW] = sidePair(faceS, DEPTH);

  let block;
  if (theme.walls) {
    const w = sheets[theme.walls.sheet];
    const H = theme.wallH || 96;
    // A rect either STRETCHES to fill the texture (one whole shelf face), or
    // REPEATS at world scale — the rect is drawn at its own size times
    // TILE/walls.src, so a 48px source lands 1:1 (no squashing) and a 16px
    // brick is blown up to a 48px course before it tiles. Getting this wrong
    // silently halves the height of every stone course.
    const scale = TILE / (theme.walls.src || TILE);
    const cut = (rect, dw, dh) => texCv(dw, dh, (cg) => {
      if (!theme.walls.tileFill) { cg.drawImage(w, rect[0], rect[1], rect[2], rect[3], 0, 0, dw, dh); return; }
      const tw = Math.max(1, Math.round(rect[2] * scale)), th = Math.max(1, Math.round(rect[3] * scale));
      for (let y = 0; y < dh; y += th) {
        for (let x = 0; x < dw; x += tw) cg.drawImage(w, rect[0], rect[1], rect[2], rect[3], x, y, tw, th);
      }
    });
    const tall = cut(theme.walls.tall, TILE, H);
    const low = cut(theme.walls.low, TILE, BLOCK_H);
    const top = cut(theme.walls.crown, TILE, TILE);          // crown wood, stretched — the shelf's top
    const [tallE, tallW] = sidePair(tall, H);
    const [lowE, lowW] = sidePair(low, BLOCK_H);
    // Terraces in a walled theme tile the same wall cut to their own height —
    // six rungs now: a keep is six steps of masonry, not three.
    block = {
      B: { face: tall.toDataURL(), sideE: tallE, sideW: tallW, top: top.toDataURL(), h: H },
      b: { face: low.toDataURL(), sideE: lowE, sideW: lowW, top: top.toDataURL(), h: BLOCK_H },
    };
    for (let n = 2; n <= 6; n++) {
      const tn = cut(theme.walls.tall, TILE, n * BLOCK_H);
      const [tE, tW] = sidePair(tn, n * BLOCK_H);
      block[n] = { face: tn.toDataURL(), sideE: tE, sideW: tW, top: top.toDataURL(), h: n * BLOCK_H };
    }
  } else {
    const bFace = texCv(TILE, BLOCK_H, (cg) => sheetTile(cg, theme.faceTop.m, 0, 0));
    const [bE, bW] = sidePair(bFace, BLOCK_H);
    const bTop = texCv(TILE, TILE, (cg) => {
      sheetTile(cg, theme.fill[0], 0, 0);
      const strip = (t, ox, oy, w2, h2) => cg.drawImage(cliffs, t[0] * TILE + ox, t[1] * TILE + oy, w2, h2, ox, oy, w2, h2);
      strip(theme.rim.n, 0, 0, TILE, 24); strip(theme.rim.s, 0, 24, TILE, 24);
      strip(theme.rim.w, 0, 0, 24, TILE); strip(theme.rim.e, 24, 0, 24, TILE);
      strip(theme.rim.nw, 0, 0, 24, 24); strip(theme.rim.ne, 24, 0, 24, 24);
      strip(theme.rim.sw, 0, 24, 24, 24); strip(theme.rim.se, 24, 24, 24, 24);
    });
    const one = { face: bFace.toDataURL(), sideE: bE, sideW: bW, top: bTop.toDataURL(), h: BLOCK_H };
    // Terrace faces stack the kit's own courses: the lipped top course first,
    // plain rock beneath it — exactly how the chasm's 2-tall face is built.
    const stack = (n) => texCv(TILE, n * BLOCK_H, (cg) => {
      sheetTile(cg, theme.faceTop.m, 0, 0);
      for (let i = 1; i < n; i++) sheetTile(cg, theme.faceBot.m, 0, i * TILE);
    });
    block = { B: one, b: one };
    for (let n = 2; n <= 6; n++) {
      const fn2 = stack(n);
      const [fE, fW] = sidePair(fn2, n * BLOCK_H);
      block[n] = { face: fn2.toDataURL(), sideE: fE, sideW: fW, top: bTop.toDataURL(), h: n * BLOCK_H };
    }
  }
  // The pit floor wears the theme's own ground fill (a step down is still this
  // place); a bridge deck wears planks when the wood sheet rode along, and a
  // tunnel's rock deck wears the terrace top.
  const fillSheet = sheets[theme.sheet || 'cliffs'] || cliffs;
  const fsrc = theme.src || TILE;
  const f0 = theme.fill[0];
  const pitTop = texCv(TILE, TILE, (cg) =>
    cg.drawImage(fillSheet, f0[0] * fsrc, f0[1] * fsrc, fsrc, fsrc, 0, 0, TILE, TILE));
  const plank = sheets.woodwall ? texCv(TILE, TILE, (cg) =>
    cg.drawImage(sheets.woodwall, 3 * TILE, 0, TILE, TILE, 0, 0, TILE, TILE)) : null;
  return {
    faceS: faceS.toDataURL(), faceSideE, faceSideW, block,
    pitTop: pitTop.toDataURL(), plank: plank && plank.toDataURL(),
  };
}

/**
 * Extract maximal wall runs along floor/chasm boundaries, INCLUDING the
 * grid's outer boundary (the virtual outside is chasm — a full-bleed estate
 * grows rock sides at its rim).
 * kind 's': wall faces south (+y), hangs off a plateau's south edge.
 * kind 'e': wall faces east (+x), boundary at the void cell's west edge.
 * kind 'w': wall faces west (−x), boundary at the void cell's east edge.
 */
function extractGeometry(grid, themeNameAt, extras) {
  const { rows, cols, at, isFloor, isVoid } = gridFns(grid);
  const faces = [];
  for (let y = 0; y <= rows; y++) {
    for (let x = 0; x < cols;) {
      if (isVoid(x, y) && isFloor(x, y - 1)) {
        const x0 = x;
        while (x < cols && isVoid(x, y) && isFloor(x, y - 1)) x++;
        faces.push({ kind: 's', x: x0, y, len: x - x0 });
      } else x++;
    }
  }
  for (let x = -1; x <= cols; x++) {
    for (let y = 0; y < rows;) {
      if (isVoid(x, y) && isFloor(x - 1, y)) {
        const y0 = y;
        while (y < rows && isVoid(x, y) && isFloor(x - 1, y)) y++;
        faces.push({ kind: 'e', x, y: y0, len: y - y0 });
      } else y++;
    }
    for (let y = 0; y < rows;) {
      if (isVoid(x, y) && isFloor(x + 1, y)) {
        const y0 = y;
        while (y < rows && isVoid(x, y) && isFloor(x + 1, y)) y++;
        faces.push({ kind: 'w', x: x + 1, y: y0, len: y - y0 });
      } else y++;
    }
  }
  const blocks = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const ch = at(x, y);
      // A block carries the NAME of the theme whose wall it is, so a room's
      // shelves and the estate's rock can stand on one plane. Terraces ('2',
      // '3') are blocks you STAND on — same geometry, more courses of face.
      if (ch === 'B' || ch === 'b' || '23456'.includes(ch)) {
        blocks.push({ x, y, kind: ch, theme: themeNameAt ? themeNameAt(x, y) : null });
      }
    }
  }
  // The height vocabulary past the ledge needs the level model and the
  // AUTHORED grid (the render grid has already translated it away). Without
  // them (bakeEstate's bare planes) these lists stay empty, harmlessly.
  const pits = [], stairs = [], decks = [], doors = [];
  const model = extras && extras.model, agrid = extras && extras.agrid;
  if (model && agrid) {
    const aat = (x, y) => (x < 0 || y < 0 || x >= cols || y >= rows) ? '#' : agrid[y][x];
    const ORTH = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const ch = aat(x, y);
        const lv = model.floorAt(x, y);
        // A sunken floor: its top quad, and an inner face on every side where
        // higher ground (or standing masonry) looks down into it. A deck cell
        // whose ground runs below grade keeps its creek bed — the planks are
        // drawn separately, above it.
        if (lv != null && lv < 0) {
          const walls = ORTH.map(([dx, dy]) => {
            const nch = aat(x + dx, y + dy);
            if (nch === '#') return false;              // the void owns its own faces
            const nf = model.floorAt(x + dx, y + dy);
            return nf == null ? true : nf > lv;         // masonry, or just higher ground
          });
          // A standee sunk below the plane projects its feet DOWN-SCREEN over
          // the ground south of the pit (the baked canvas is the bottom of
          // the stacking order and can occlude nothing) — so a pit whose
          // south neighbour is higher ground gets a LIP: that neighbour's own
          // patch of baked ground re-drawn as a quad that sorts over the
          // sunken body but under anyone standing on the lip itself.
          const sf = model.floorAt(x, y + 1);
          pits.push({ x, y, lv, walls, lip: sf != null && sf > lv });
        }
        if (CLIMB_CH[ch] === 'stairs') {
          // Steps ascend toward the neighbour one level up that they serve.
          const dir = ORTH.find(([dx, dy]) => model.surfacesAt(x + dx, y + dy).includes((lv || 0) + 1));
          if (dir) stairs.push({ x, y, lv: lv || 0, dx: dir[0], dy: dir[1] });
        }
        if (DECK_CH[ch]) {
          const d = model.deckAt(x, y);
          if (d == null) continue;                      // degenerate span — plain floor already
          // Edges where the deck ENDS (the neighbour offers no surface at deck
          // level) get a slab lip so the crossing reads as a built thing.
          const lips = ORTH.map(([dx, dy]) => !model.surfacesAt(x + dx, y + dy).includes(d));
          decks.push({ x, y, ch, lv: d, under: lv, lips });
        }
        if (ch === 'D') doors.push({ x, y, lv: lv || 0 });
      }
    }
  }
  return { faces, blocks, pits, stairs, decks, doors };
}

/**
 * Bake a delve map: ground plane data-URI, passability, wall textures and
 * geometry, plus the delve's flat floor decals (stair mouths, rails).
 */
async function bakeMap(map, theme) {
  const sheets = await loadSheets(map, theme);
  // The one height fact every lens shares — levels, climbs, decks (ONE RULES
  // FACT). Computed here so the bake, the geometry and the walk all read it.
  const model = makeLevelModel(map.grid);
  // Two grids from here on. The AUTHORED one answers every gameplay question —
  // what blocks, what is a step up, what you can climb. The RENDER one is what
  // the baker and the geometry extractor see, with the height vocabulary
  // translated into the block language they already speak.
  const rgrid = map.grid.map((row, y) => Array.from(row, (ch, x) => bakeChar(ch, x, y, model)).join(''));
  const { rows, cols, at } = gridFns(map.grid);
  // REGIONS are rooms standing on this plane with a floor and walls of their
  // own — the campus carries one per building. A cell inside a region is painted
  // and walled in that region's theme; everything else is the map's base theme.
  const regions = map.regions || [];
  const themeNameAt = (x, y) => {
    for (const r of regions) if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return r.theme;
    return null;
  };
  // PAINT is the Surfaces palette's channel: ground-fill dressing ONLY, never
  // rooms. A region is a room (walls, a ceiling indoors or out — the campus's
  // stamped buildings); a paint rect swaps which sheet the floor fill comes
  // from and touches nothing else, which is why the two must never share a key.
  const paints = map.paint || [];
  // BACKWARD: the editor draws later rects on top and erases the topmost, so
  // the last rect painted must be the one the ground actually wears.
  const paintNameAt = (x, y) => {
    for (let i = paints.length - 1; i >= 0; i--) {
      const r = paints[i];
      if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h && THEMES[r.theme]) return r.theme;
    }
    return null;
  };
  const themeAt = (x, y) => THEMES[paintNameAt(x, y)] || THEMES[themeNameAt(x, y)] || theme;
  // The liquid channel — an overlay on the chart, not a grid char (@see
  // wetCells), so it is asked separately from everything the rgrid answers.
  // A dry map never loads the sheet.
  const wetSet = wetCells(map);
  const wet = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      // Water over the void is water over nothing: the painter keeps no pixels
      // there and the walk has no floor, so a stray cell is dropped rather
      // than drawn hanging in the chasm.
      if (wetSet.has(x + ',' + y) && at(x, y) !== '#') wet.push([x, y]);
    }
  }
  let wframes = null;
  if (wet.length) {
    try { wframes = await waterFrames(); }
    catch (e) { console.warn('delve: water sheet missing — fords stay dry ground', e); }
  }
  const drawn = new Set(wet.map(([x, y]) => x + ',' + y));
  const water = wframes ? { at: (x, y) => drawn.has(x + ',' + y), tile: wframes[0] } : null;
  const cv = document.createElement('canvas');
  cv.width = cols * TILE; cv.height = rows * TILE;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  paintGround(g, rgrid, theme, sheets, (regions.length || paints.length) ? themeAt : null, water);

  // Flat floor decals that belong ON the plane (holes and track). Boulders,
  // stalagmites and the cart are upright standees — see openDelve.
  const decal = (name, dx, dy) => {
    const d = DECALS[name];
    g.drawImage(sheets[d.sheet], d.x, d.y, d.w, d.h, dx, dy, d.w, d.h);
  };
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const ch = at(x, y);
      if (ch === '=') decal('railH', x * TILE, y * TILE - 4);
      else if (ch === 's') decal(theme.grayProps ? 'stairsDownGray' : 'stairsDown', (x - 1) * TILE, (y - 1) * TILE);
      // Upper floors: the 'd' that pops you back DOWN is a stairwell, not a
      // street door — an unmarked doorway between floors read as a mystery.
      else if (ch === 'd' && map.exitStairs) decal('stairsDownGray', (x - 1) * TILE, (y - 1) * TILE);
    }
  }
  // Portals that climb (the back-wall stairs to lofts, upper forms, the
  // study) paint a stair mouth at their cell for the same reason.
  for (const p of (map.portals || [])) {
    if (p.stairs) decal('stairsDownGray', (Math.floor(p.x) - 1) * TILE, (Math.floor(p.y) - 1) * TILE);
  }

  // Passability comes in two grains. `pass`/`tall` are the full-height cells;
  // `solids` are the shallow rectangles an upright prop really stands on.
  // Passability comes in three grains now. `pass`/`tall` are the full-height
  // cells; `solids` the shallow rectangles an upright prop rests on; `height`
  // and `climb` say which LEVEL a cell's floor is and where you may change it.
  //
  // ONE COLLISION FACT (CLAUDE.md): a furnishing blocks the space its ART
  // occupies. The 'f' slab used to span its whole tile, which matched the art
  // only while chart widths were authored generously; with widths derived from
  // the ladder heights a barrel is a third of a tile wide, and a full-tile slab
  // would be two-thirds invisible wall. So an 'f' slab takes its own prop's
  // drawn width, centred where the art stands. 'r'/'t'/'m' decals keep the full
  // tile their near-tile-wide art actually covers.
  const fw = new Map();
  for (const p of (map.props || [])) {
    const cx = Math.floor(p.x), cy = Number.isInteger(p.y) ? p.y - 1 : Math.floor(p.y);
    // Only a prop that OWNS an 'f' cell may narrow it — wall-hung art and
    // floor dressing land on plain floor and must not leave stray entries a
    // later chart could collide with a real furnishing's.
    if (at(cx, cy) !== 'f') continue;
    fw.set(cx + ',' + cy, { x: p.x, half: Math.max(0.12, Math.min(0.5, (p.w || 48) / 96)) });
  }
  const pass = [], tall = [], solids = [];
  for (let y = 0; y < rows; y++) {
    pass.push([]); tall.push([]);
    for (let x = 0; x < cols; x++) {
      const ch = at(x, y);
      pass[y].push(!BLOCKING[ch]);
      // A ledge is deliberately NOT tall: it is floor, one step up, and holding
      // a walker off it the way WALL_BACK holds them off a wall would put a
      // gap between their feet and the surface they are standing on. Terraces,
      // trenches and decks are all floor for the same reason — the LEVEL law
      // (baked.model) is what actually rules a step, not a wall test.
      tall[y].push(ch === '#' || ch === 'B' || ch === 'b' || ch === 'F' || ch === 'D');
      if (FOOTED[ch]) {
        const f = ch === 'f' ? fw.get(x + ',' + y) : null;
        const cx = f ? f.x : x + 0.5, half = f ? f.half : 0.5;
        solids.push({
          x0: cx - half, x1: cx + half, y0: y + 1 - SOLID_DEPTH, y1: y + 1,
          lv: model.surfacesAt(x, y)[0] || 0,   // the ground it stands on
        });
      }
    }
  }
  // One texture set per theme on the plane. attachTerrain picks by the name each
  // block carries; the cliff faces stay the base theme's, since a face only ever
  // hangs off the map's own rim.
  const tex = cutWallTex(sheets, theme);
  tex.byTheme = {};
  for (const name of new Set(regions.map((r) => r.theme))) {
    if (THEMES[name]) tex.byTheme[name] = cutWallTex(sheets, THEMES[name]).block;
  }
  return {
    url: cv.toDataURL('image/png'), pass, tall, solids, model, cols, rows, sheets,
    voidColor: sampleVoidColor(sheets.cliffs, theme),
    tex, wet, wframes,
    ...extractGeometry(rgrid, regions.length ? themeNameAt : null, { model, agrid: map.grid }),
  };
}

/**
 * Bake a bare estate plane for OTHER scenes (the ranch campus): zcliffs
 * ground + rim + wall geometry for an arbitrary grid, meadow palette. The
 * caller may draw its own landmarks onto `canvas` (ponds, paths) before
 * reading it out, then hand faces/blocks/tex to attachTerrain.
 */
export async function bakeEstate(grid, themeName = 'meadow') {
  const sheets = { cliffs: await loadImg(TILES_BASE + 'cliffs.png') };
  const theme = THEMES[themeName];
  const { rows, cols } = gridFns(grid);
  const canvas = document.createElement('canvas');
  canvas.width = cols * TILE; canvas.height = rows * TILE;
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = false;
  paintGround(g, grid, theme, sheets);
  return {
    canvas, cols, rows,
    voidColor: sampleVoidColor(sheets.cliffs, theme),
    tex: cutWallTex(sheets, theme),
    ...extractGeometry(grid),
  };
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

/**
 * Open a delve. `member` is a guild Person; `hooks` keep guild mutations in
 * hall.js: { locale, fight(preyId)→Promise<bout|null>, onKill(preyId)→{txt},
 * onOre(kind)→{txt}, onEnd(summary) }. Resolves true only if the delve
 * actually took the screen — hall charges the march's stamina on that signal.
 */
/** Bake a map and preload its creature sheets — everything slow, done up front
 *  so the scene build itself is synchronous and can't interleave. */
const _bakeCache = {};
/**
 * Drop a map's cached bake. The cache assumes "every other map is a constant"
 * (below) — the map EDITOR broke that assumption: a re-saved draft must bake
 * fresh or the next walk crosses the OLD floor plan under the new props.
 */
export function invalidateBake(mapId) { delete _bakeCache[mapId]; }

async function prepMap(mapId) {
  const map = mapForLocale(mapId);
  if (!map) throw new Error('delve: no map ' + mapId);
  validateMap(map);
  const theme = THEMES[map.theme];
  // Bake once per map per session — walking back through a door shouldn't
  // re-rasterise a plane and re-cut its wall textures. Everything cached is
  // immutable except `pass`, which movement mutates, so hand out a copy.
  // The campus is never cached: it is DERIVED from a layout the player edits, so
  // a bake kept from before a building moved would draw the estate they used to
  // have. Every other map is a constant.
  let baked = map.id === 'campus' ? null : _bakeCache[map.id];
  if (!baked) {
    baked = await bakeMap(map, theme);
    if (map.id !== 'campus') _bakeCache[map.id] = baked;
  }
  baked = { ...baked, pass: baked.pass.map((row) => row.slice()) };
  const spawns = [];
  for (const s of (map.spawns || [])) {
    const prey = preyById(s.prey);
    if (!prey) continue;
    try { spawns.push({ prey, s, img: await loadImg(ART_BASE + prey.art + '.png') }); }
    catch (e) { console.warn('delve: creature sheet missing for', s.prey, e); }
  }
  return { map, theme, baked, spawns };
}

/** A door face, drawn: planked wood under iron bands, with a ring to pull —
 *  and a keyhole plate on the locked variant. Drawn rather than cropped
 *  because no owned sheet carries a bare 1×2 door tile (the kits paint doors
 *  INTO facades); per the art law, that fact is stated here. Cached per state. */
const _doorUrls = {};
export function doorTexture(locked) {
  const key = locked ? 'locked' : 'plain';
  if (_doorUrls[key]) return _doorUrls[key];
  const cv = document.createElement('canvas');
  cv.width = 48; cv.height = 96;
  const g = cv.getContext('2d');
  g.fillStyle = '#4a3320';
  g.fillRect(0, 0, 48, 96);
  for (let i = 0; i < 4; i++) {                       // planks and their seams
    g.fillStyle = i % 2 ? '#553b25' : '#4e3622';
    g.fillRect(i * 12, 0, 12, 96);
    g.fillStyle = '#33241a';
    g.fillRect(i * 12, 0, 1, 96);
  }
  g.fillStyle = '#2b2f36';                            // iron bands
  g.fillRect(0, 14, 48, 7);
  g.fillRect(0, 74, 48, 7);
  g.fillStyle = '#4a505c';                            // studs
  for (let x = 5; x < 48; x += 12) { g.fillRect(x, 16, 3, 3); g.fillRect(x, 76, 3, 3); }
  g.strokeStyle = '#20242c'; g.lineWidth = 3;         // the pull ring
  g.beginPath(); g.arc(36, 52, 5, 0, 7); g.stroke();
  if (locked) {                                       // the keyhole plate
    g.fillStyle = '#8a8f9a';
    g.fillRect(8, 44, 12, 16);
    g.fillStyle = '#1c202a';
    g.beginPath(); g.arc(14, 50, 2.4, 0, 7); g.fill();
    g.fillRect(13, 50, 2.5, 6);
  }
  return (_doorUrls[key] = cv.toDataURL());
}

/** The key itself, drawn small and gold — a pickup must read at 18px. */
let _keyUrl = null;
export function keyTexture() {
  if (_keyUrl) return _keyUrl;
  const cv = document.createElement('canvas');
  cv.width = 24; cv.height = 24;
  const g = cv.getContext('2d');
  g.strokeStyle = '#d8a83c'; g.lineWidth = 3;
  g.beginPath(); g.arc(8, 8, 4.5, 0, 7); g.stroke();   // the bow
  g.fillStyle = '#d8a83c';
  g.fillRect(11, 7, 10, 3);                             // the shaft
  g.fillRect(17, 10, 3, 4); g.fillRect(13, 10, 3, 3);   // the wards
  g.fillStyle = '#f2d27a';
  g.fillRect(11, 7, 10, 1);                             // a glint along the top
  return (_keyUrl = cv.toDataURL());
}

/** Shingles for the gabled roofs — drawn, cached, tiled at 48px. */
let _shingleUrl = null;
function shingleUrl() {
  if (_shingleUrl) return _shingleUrl;
  const cv = document.createElement('canvas');
  cv.width = 48; cv.height = 48;
  const g = cv.getContext('2d');
  for (let row = 0; row < 6; row++) {
    const y = row * 8;
    g.fillStyle = '#8a4a3a';
    g.fillRect(0, y, 48, 8);
    g.fillStyle = '#a05a44';
    g.fillRect(0, y, 48, 2);
    g.fillStyle = '#5a2c22';
    g.fillRect(0, y + 7, 48, 1);
    for (let x = (row % 2) * 12; x < 48; x += 24) g.fillRect(x, y + 2, 1, 5);
  }
  return (_shingleUrl = cv.toDataURL());
}

/** Campus turf for the apron outside interior walls — cached, tiled at 96px. */
let _apronUrl = null;
function apronTileUrl(cliffs) {
  if (_apronUrl) return _apronUrl;
  const fills = (THEMES.meadow && THEMES.meadow.fill) || [[1, 3], [1, 4], [5, 3], [5, 4]];
  const cv = document.createElement('canvas');
  cv.width = 96; cv.height = 96;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  [[0, 0], [48, 0], [0, 48], [48, 48]].forEach(([dx, dy], i) => {
    const f = fills[i % fills.length];
    g.drawImage(cliffs, f[0] * TILE, f[1] * TILE, TILE, TILE, dx, dy, TILE, TILE);
  });
  return (_apronUrl = cv.toDataURL());
}

/**
 * A REAL roof for a stamped room: two shingled slopes meeting at a ridge and
 * a gable triangle closing each end — folded off the plane with the same
 * transform grammar the walls use, seated on the ring's 96px top. The old
 * flat cap read as a painted lid (and at worst wore interior art like a
 * decal); a pitch is what says "building" from a 52° camera.
 */
const ROOF_RISE = 54;
function gableRoof(b) {
  const x = b.x * TILE, y = b.y * TILE, w = b.w * TILE, h = b.h * TILE;
  const z = standZ(b.y + b.h) - 1;
  const els = [];
  const mk = (css, cls = 'dv-roofq') => {
    const d = document.createElement('div');
    d.className = cls;
    d.style.cssText = css + `;z-index:${z}`;
    D.field.appendChild(d);
    els.push(d);
    return d;
  };
  const shingles = `background-image:url(${shingleUrl()})`;
  if (w >= h) {
    // Ridge east–west: slopes face north/south, gables cap east/west.
    const d2 = h / 2, L = Math.hypot(d2, ROOF_RISE), deg = (Math.atan2(ROOF_RISE, d2) * 180 / Math.PI).toFixed(2);
    mk(`left:${x}px;top:${y}px;width:${w}px;height:${L}px;transform-origin:50% 0;transform:translateZ(96px) rotateX(${deg}deg);${shingles}`);
    mk(`left:${x}px;top:${y + h - L}px;width:${w}px;height:${L}px;transform-origin:50% 100%;transform:translateZ(96px) rotateX(-${deg}deg);${shingles}`);
    mk(`left:${x - ROOF_RISE}px;top:${y}px;width:${ROOF_RISE}px;height:${h}px;transform-origin:100% 50%;transform:translateZ(96px) rotateY(90deg);clip-path:polygon(100% 0,0 50%,100% 100%)`, 'dv-roofq dv-gable');
    mk(`left:${x + w}px;top:${y}px;width:${ROOF_RISE}px;height:${h}px;transform-origin:0 50%;transform:translateZ(96px) rotateY(-90deg);clip-path:polygon(0 0,100% 50%,0 100%)`, 'dv-roofq dv-gable');
  } else {
    // Ridge north–south: slopes face east/west, gables cap north/south.
    const d2 = w / 2, L = Math.hypot(d2, ROOF_RISE), deg = (Math.atan2(ROOF_RISE, d2) * 180 / Math.PI).toFixed(2);
    mk(`left:${x}px;top:${y}px;width:${L}px;height:${h}px;transform-origin:0 50%;transform:translateZ(96px) rotateY(-${deg}deg);${shingles}`);
    mk(`left:${x + w - L}px;top:${y}px;width:${L}px;height:${h}px;transform-origin:100% 50%;transform:translateZ(96px) rotateY(${deg}deg);${shingles}`);
    mk(`left:${x}px;top:${y - ROOF_RISE}px;width:${w}px;height:${ROOF_RISE}px;transform-origin:50% 100%;transform:translateZ(96px) rotateX(-90deg);clip-path:polygon(0 100%,50% 0,100% 100%)`, 'dv-roofq dv-gable');
    mk(`left:${x}px;top:${y + h}px;width:${w}px;height:${ROOF_RISE}px;transform-origin:50% 0;transform:translateZ(96px) rotateX(90deg);clip-path:polygon(0 0,50% 100%,100% 0)`, 'dv-roofq dv-gable');
  }
  return els;
}

/**
 * Build (or rebuild) the scene for one map inside the session's stage: sizes
 * the plane, attaches the terrain, and creates the walker, props, ores and
 * creatures. Called on open AND on every door the member walks through, so
 * the session (haul, hooks, input, the actor's own animation state) survives
 * moving from room to room.
 */
function mountScene(prep, entry) {
  const { map, theme, baked, spawns } = prep;
  const W = baked.cols * TILE, H = baked.rows * TILE;
  // ONE LENS PER MAP. `perspective` is a fixed distance in px, so the 1150px the
  // 13-row rooms were tuned at is a wide-angle lens on a 46-row estate: the camera
  // centres the walker, which puts half the plane's ~3100px of projected depth in
  // FRONT of the eye point. Measured on the grounds with the walker at row 11 —
  // row 27's tile drew 649px wide and rows 40/44 drew NEGATIVE, folded through the
  // eye. A building standing there is a ten-tile billboard, so it smeared across
  // the view and slid over ground moving at a different rate: bases pinned, the
  // whole storey above them shifting. Scale the lens with the plane's own depth and
  // every map gets the rooms' proportions, whatever its size. The 1.3 is that
  // calibration — it reproduces 1150px exactly at 13 rows — and the floor keeps
  // every shipped interior pixel-identical.
  const depth = baked.rows * TILE * D.zoom * Math.sin(TILT * Math.PI / 180);
  D.host.style.setProperty('--dvpersp', Math.round(Math.max(1150, depth * 1.3)) + 'px');
  const stage = D.host.querySelector('.delve-stage');
  stage.style.background = baked.voidColor;
  const field = document.createElement('div');
  field.className = 'delve-field';
  field.style.cssText = `width:${W}px;height:${H}px;margin-left:${-W / 2}px;margin-top:${-H / 2}px;background-image:url(${baked.url})`;
  stage.innerHTML = '';
  stage.appendChild(field);
  // The world beyond the walls. An interior used to float in a void the
  // colour of cave-rock; four turf strips extend the plane past the map so a
  // room reads as standing on the campus it was built on. Strips, not one
  // slab — a slab child would cover the baked ground, which is the field's
  // own background. (Walled themes are exactly the indoor maps.)
  if (theme.walls) {
    const M = 6 * TILE, turf = apronTileUrl(baked.sheets.cliffs);
    for (const [al, at2, aw, ah] of [[-M, -M, W + 2 * M, M], [-M, H, W + 2 * M, M], [-M, 0, M, H], [W, 0, M, H]]) {
      const ap = document.createElement('div');
      ap.className = 'dv-apron';
      ap.style.cssText = `left:${al}px;top:${at2}px;width:${aw}px;height:${ah}px;background-image:url(${turf})`;
      field.appendChild(ap);
    }
    stage.style.background = '#2e4724';   // past the apron: far lawn, not cave
  }

  D.map = map; D.theme = theme; D.field = field;
  // Only the cells the bake actually accepted as wet (water over the void is
  // dropped there) — so what slows a walker is exactly what they can see.
  D.wet = new Set((baked.wet || []).map(([x, y]) => x + ',' + y));
  // How deep each wet cell is, flooded once per map (@see waterDepths).
  D.depths = waterDepths(baked.model, D.wet);
  D.pass = baked.pass; D.tall = baked.tall; D.cols = baked.cols; D.rows = baked.rows;
  D.model = baked.model; // the height law — levels, climbs, decks (ONE RULES FACT)
  // Fresh per scene: prop footprints are rebaked with the map, and the props
  // you can work at are re-registered as they are placed below.
  D.solids = baked.solids.slice();
  D.occluders = []; // rebuilt below as the room's tall scenery is placed
  D.uses = []; D.useNear = null; D.working = false;
  D.creatures = []; D.ores = [];
  D.exit = null; D.exitArmed = false;
  D.portals = []; D.portalArmed = false;
  D.cam.snap = true;
  // Arriving in a room must not carry the walk that brought you here: drop held
  // input (as a bout does) and ignore movement for a beat, so a key still down
  // from stepping through the door can't march you straight back out.
  D.keys = {}; D.joy = null; D.pad = null;
  D.settleUntil = performance.now() + 350;

  // Raised blocks over a tile high hide people too — a room-height shelf wall
  // ('B', 96px) covers three rows of floor behind it. A 'b' aisle stack is
  // exactly one tile and covers nothing, so counters stay solid. WALKABLE
  // tops ('2'/'3' terraces, decks) carry their level: the fade must never
  // fire for the walker standing ON them, only for one hidden BEHIND or
  // BENEATH — updateXray reads topLv/deck against the walker's committed lv.
  D.decks = []; D.doors = []; D.keyCells = [];
  // Which way each stair cell rises — liftFor tracks feet along the treads.
  D.stairDirs = new Map((baked.stairs || []).map((s) => [s.x + ',' + s.y, [s.dx, s.dy]]));
  for (const b of attachTerrain(field, baked, { zMode: 'y' })) {
    if (b.deck) {
      D.decks.push({ x: b.x, y: b.y, lv: b.deck.lv, els: b.els, on: 0 });
      continue;
    }
    if (b.doorAt) {
      // Doors wired to the session's ledger: locked by the chart, re-opened
      // if this session already opened them (a portal must not shut them).
      const key = map.id + ':' + b.x + ',' + b.y;
      const rec = {
        x: b.x, y: b.y, lv: b.doorAt.lv, els: b.els, key, open: false, warned: 0,
        locked: (map.locks || []).some(([lx, ly]) => lx === b.x && ly === b.y),
      };
      if (rec.locked) b.els[0].style.backgroundImage = `url(${doorTexture(true)})`;
      D.doors.push(rec);
      if (D.opened.has(key)) openDoorCell(rec);
      continue;
    }
    if (b.h <= TILE) continue;
    const kind = (map.grid[b.y] || '')[b.x];
    const topLv = '23456'.includes(kind) ? +kind : 99;
    D.occluders.push({ els: b.els, x0: b.x, x1: b.x + 1, y: b.y + 1, rows: rowsHidden(b.h), on: 0, topLv });
  }

  // --- the walker: a fresh element per scene, the SAME actor across rooms ---
  const actor = D.player ? D.player.actor : D.gfx.makeActor(D.member);
  const pWrap = document.createElement('div');
  pWrap.className = 'dv-actor dv-player';
  pWrap.innerHTML = '<div class="dv-shadow"></div><div class="dv-up"></div>';
  const pcv = document.createElement('canvas');
  pcv.width = 96; pcv.height = 96;
  pWrap.querySelector('.dv-up').appendChild(pcv);
  if (_heroFootPct != null) pcv.style.setProperty('--footpct', _heroFootPct.toFixed(2) + '%');
  field.appendChild(pWrap);
  const at = entry || map.entry;
  // A fresh arrival commits to the GROUND surface of its cell (a deck-top
  // start is a view-swap carry's business — see openDelve's carry.lev).
  const lv0 = (baked.model.surfacesAt(Math.floor(at[0]), Math.floor(at[1]))[0]) || 0;
  D.player = { actor, cv: pcv, el: pWrap, x: at[0], y: at[1], lv: lv0, moving: false, grounded: _heroFootPct != null };
  // The reused actor may still be mid-stride from the last room; moving:false
  // above would otherwise never fire movePlayer's stop branch.
  D.gfx.setAnim(actor, 'idle');

  mountWater(field, baked, map);

  // Does the wind blow HERE? A composited sway promotes its standee to its own
  // GPU layer, so it is a budget, not a free effect — counted once, before the
  // loop, so the whole grove agrees. Half a stand swaying reads far worse than
  // none of it, which is why this is a map-wide yes or no and never a per-tree
  // cutoff. (The rasterised first-person path has no such limit: it shears the
  // crowns in a buffer it rebuilds anyway.)
  const treeCount = map.theme === 'meadow' ? (map.grid.join('').match(/t/g) || []).length : 0;
  const windy = treeCount > 0 && treeCount <= SWAY_CAP && !reducedMotion();

  // --- exits, portals and interactables from the grid ---
  for (let y = 0; y < D.rows; y++) {
    for (let x = 0; x < D.cols; x++) {
      const ch = map.grid[y][x];
      if (ch === 's' || ch === 'w' || ch === 'd') D.exit = { x: x + 0.5, y: y + 0.5, lv: (baked.model.surfacesAt(x, y)[0] || 0) };
      // The thing you climb, standing against the face of the ledge it serves.
      if (CLIMB[ch]) addProp(`<span class="dv-${CLIMB[ch]}"></span>`, x + 0.5, y + 1, 30);
      // A key still waiting to be taken (a taken one stays taken — the ledger).
      if (ch === 'K' && !D.keysTaken.has(map.id + ':' + x + ',' + y)) {
        const el = addProp(`<img src="${keyTexture()}" style="width:100%;image-rendering:pixelated" alt="">`, x + 0.5, y + 0.9, 18);
        D.keyCells.push({ x, y, el, key: map.id + ':' + x + ',' + y, taken: false });
      }
      if (ch === 'w') addProp(artSprite('wagon', 'dv-wagon'), x + 0.5, y + 1, 82);
      else if (ch === 't' && map.theme === 'meadow') {
        // The crown stirs — see delve.css dvSway. The negative delay is this
        // tree's own phase, so a stand of them never sways in unison; `windy`
        // is the budget gate (a compositor animation promotes its element to a
        // layer, and a forest of them is the failure this renderer was rebuilt
        // to avoid — reference-css3d-mobile-budget).
        const cls = windy ? 'dv-tree dv-sway' : 'dv-tree';
        const style = windy ? `animation-delay:${(-(x * 0.7 + y * 1.3) % 5).toFixed(2)}s` : '';
        addProp(artSprite('treeTall', cls, style), x + 0.5, y + 1, 96);
      }
      else if (ch === 't') addPropCanvas('stalag', baked.sheets, x + 0.5, y + 0.97);
      else if (ch === 'r') addPropCanvas(theme.grayProps ? 'boulderGray' : 'boulder', baked.sheets, x + 0.5, y + 0.97);
      else if (ch === 'm') addPropCanvas('cart', baked.sheets, x + 0.5, y + 1);
      // A vein already worked this delve stays worked, even if you leave the
      // room and come back through the door.
      else if (ch === 'o' && !D.mined.has(map.id + ':' + x + ',' + y)) addOre(x, y, baked.sheets.ores);
      else if (ch === 'o') D.pass[y][x] = true;
    }
  }
  // Authored furnishings — upright art.js standees (beds, anvils, counters…).
  // A prop with `use` is WORKABLE: walk into reach and it offers itself.
  for (const p of (map.props || [])) {
    // `cls` lets a furnishing carry its own behaviour — the apothecary's
    // cauldron uses it to step through the sheet's four boiling frames.
    const el = addProp(artSprite(p.art, 'dv-furn ' + (p.cls || '')), p.x, p.y, p.w || 48);
    // A hung thing HANGS. The volume table's `mid` is its centre height on the
    // wall — the fact the FP lens has always drawn — and the lift is the same
    // translateZ a ledge rides. Without it the art bottom-anchors on the floor
    // line, which passed unnoticed only while widths were authored generously:
    // the ladder-cut portrait drew twenty pixels tall on the skirting.
    const vol = propVolume(p.art);
    if (vol && vol.form === 'wall') {
      el.style.setProperty('--dvlift', (liftAt(p.x, p.y) + (vol.mid - vol.h / 2) * TILE) + 'px');
      const sh = el.querySelector('.dv-shadow');
      if (sh) sh.style.display = 'none';   // nothing hung casts a contact shadow
    }
    if (p.use) D.uses.push({ id: p.use, label: p.label || 'Use', x: p.x, y: p.y, art: p.art, el });
  }
  // Facades on the grounds. A facade is a STANDEE over the room it contains —
  // not a door: the room is part of this plane, so walking in is just walking,
  // and the see-through rule takes the facade away the moment you step under
  // it. That is the cutaway, and it costs nothing extra: the town was never
  // left. The PROP BOX spans the whole room (the occluder rect must), but the
  // ART inside is capped at its authored width — stretched to room width its
  // aspect-ratio stretched the height too, and every door grew to three
  // characters tall. A stamped room is also an open-topped ring of wall until
  // something caps it: seen from the lanes it read as a fenced yard, so each
  // roomed building gets a flat ROOF quad at wall height that fades (and, when
  // you are inside, vanishes) together with its facade.
  for (const b of (map.facades || [])) {
    const artW = Math.min(b.w * TILE, b.px || b.w * TILE);
    // A roomed building is its WALLS and a REAL ROOF now, with only the
    // nameplate standing at the door. Drawing the facade sprite as well put a
    // whole hut peeking out of a tile box — two vocabularies for one
    // building, and the playtest read it as "structures hidden behind a wall
    // of tiles". Un-roomed landmarks keep their standee art; they have no
    // stamped ring to fight. (The sign stays a .dv-up standee because the
    // occluder's lazy height measure reads els[0].)
    const inner = b.roomed
      ? `<span class="dv-bldg dv-bldg-sign"><span class="bl-name">${b.name}</span></span>`
      : `<span class="dv-bldg">${artSprite(b.art, '', `width:${artW}px;margin:0 auto`)}<span class="bl-name">${b.name}</span></span>`;
    const propEl = addProp(inner, b.x + b.w / 2, b.y + b.h, b.w * TILE,
      b.roomed ? { x0: b.x, x1: b.x + b.w, y0: b.y, y1: b.y + b.h } : null);
    if (b.roomed) {
      // One occluder group: addProp just pushed the sign's entry; the roof
      // quads join its els so the building fades as one thing, and so does
      // the contact shadow — a detached ellipse over the doorway reads as a
      // hole in the grass. Append, never prepend: els[0] stays the .dv-up.
      const els = gableRoof(b);
      const occ = D.occluders[D.occluders.length - 1];
      for (const e of els) occ.els.push(e);
      const sh = propEl.querySelector('.dv-shadow');
      if (sh) occ.els.push(sh);
      // A stair can re-mount the estate with the walker already indoors. Born
      // gone — a class present before first style resolution skips the 0.14s
      // transition — or the first frame paints an opaque roof over their head
      // and then fades it out.
      if (at[0] >= b.x && at[0] < b.x + b.w && at[1] >= b.y && at[1] < b.y + b.h) {
        occ.on = 2;
        for (const el of occ.els) el.classList.add('dv-gone');
      }
    }
  }
  // Doors to other maps (the wall gap is the doorway; this is just the trigger).
  for (const p of (map.portals || [])) {
    D.portals.push({
      x: p.x, y: p.y, to: p.to, at: p.at, enter: p.enter,
      lv: (baked.model.surfacesAt(Math.floor(p.x), Math.floor(p.y))[0] || 0),
    });
  }

  for (const sp of spawns) spawnCreature(sp.prey, sp.img, sp.s.x + 0.5, sp.s.y + 0.5);

  // The room's own people — whoever the caller says works here, going about
  // their business. They wander, they don't fight, and they don't block.
  D.companions = [];
  for (const person of (D.hooks.companions ? D.hooks.companions(map.id) : [])) {
    if (!person || person.id === D.member.id) continue;
    const spot = randomFloor();
    if (!spot) break;
    spawnCompanion(person, spot.x, spot.y);
  }

  const title = D.host.querySelector('.dv-title');
  if (title) title.textContent = `${D.hooks.locale.glyph || ''} ${map.name || D.hooks.locale.name}`.trim();
}

export async function openDelve(localeId, member, hooks, carry) {
  const gfx = window.__ranchGfx;
  if (!mapForLocale(localeId) || !member || !gfx || D || opening) return false;
  opening = true;
  try {
    const prep = await prepMap(carry && carry.mapId ? carry.mapId : localeId);
    // The bake took real time (network, on a first load). Re-validate the
    // launch context: if the guild screen is no longer up — a played bout took
    // the screen, or the player left for the title — opening now would steal
    // the screen mid-scene and orphan its promise. Walk away instead; hall
    // hasn't charged any stamina yet. A view SWAP is the one exception: the
    // first-person screen is the active one then, and the session it carries
    // is the licence to take over from it.
    const guildUp = document.getElementById('guildScreen');
    if (D || (!(carry && carry.swap) && (!guildUp || !guildUp.classList.contains('active')))) return false;

    const host = document.getElementById('delveScreen');
    host.style.setProperty('--dvtilt', TILT + 'deg');
    host.innerHTML = `
    <div class="delve-stage"></div>
    <div class="delve-hud">
      <button class="dv-leave" onclick="__delve.leave()">&larr; Leave</button>
      <span class="dv-title"></span>
      <span class="dv-haul"></span>
      <button class="dv-leave dv-view" title="See it through their eyes" onclick="__delve.view()">1st person</button>
      <button class="dv-leave" title="Camera settings" onclick="__viewPanel()">Camera</button>
    </div>
    <div class="delve-toasts"></div>
    <button class="dv-use" hidden onclick="__delve.use()"></button>`;

    if (carry && !carry.swap) carry = null;   // only a live swap may carry state
    D = {
      map: null, theme: null, hooks, member, gfx, field: null, host,
      pass: null, tall: null, solids: [], uses: [], useNear: null, working: false,
      cols: 0, rows: 0, occluders: [],
      keys: {}, joy: null, joyEl: null,
      cam: { x: 0, y: 0, snap: true }, zoom: window.innerHeight < 520 ? 1.4 : 1.8,
      last: 0, raf: 0, ended: false, fighting: false, grace: false, transiting: false,
      haul: { kills: {}, gold: 0, mats: {}, field: 0, bouts: 0 },
      player: null, creatures: [], ores: [], portals: [], companions: [],
      exit: null, exitArmed: false, portalArmed: false, settleUntil: 0,
      mined: new Set(),
      // The doors this session has opened, the keys it has lifted and still
      // carries — the same ledger shape as `mined`, and it crosses portals
      // and view swaps the same way.
      opened: new Set(), keysTaken: new Set(), keyCount: 0,
      // Where the way out leads. Walking into a building pushes the spot you
      // stepped in from, so its door puts you back on the grounds instead of
      // ending the walk. Empty = the exit really is the way home.
      stack: [],
    };
    // A swap brings the session's ledger across — the walk continues, it does
    // not restart, so the haul, the doors behind you and the veins already
    // worked all survive the change of camera.
    if (carry) {
      D.stack = (carry.stack || []).slice();
      D.mined = new Set(carry.mined || []);
      D.opened = new Set(carry.opened || []);
      D.keysTaken = new Set(carry.keysTaken || []);
      D.keyCount = carry.keyCount || 0;
      if (carry.haul) D.haul = carry.haul;
    }
    // From here the session object exists, so a throw would leave a half-built
    // scene latched as "a delve is open" and lock the feature out for the rest
    // of the page. Tear it down and let the caller report the failure.
    try {
      mountScene(prep, carry ? carry.at : null);
      // A live swap carries the SURFACE too (a body on a bridge must arrive on
      // it, not under it) — validated against what the cell actually offers.
      if (carry && carry.lev != null && D && D.player
        && prep.baked.model.surfacesAt(Math.floor(D.player.x), Math.floor(D.player.y)).includes(carry.lev)) {
        D.player.lv = carry.lev;
      }
      // Arriving FROM first person: stand looking where the crawler looked.
      if (carry && carry.dir != null && D && D.player) D.player.actor.facing = carry.dir * Math.PI / 4;
      wireInput();
      updateHaul();
      showScreen('delveScreen');
      startLoop();
    } catch (e) {
      if (D && D.raf) cancelAnimationFrame(D.raf);
      D = null;
      host.innerHTML = '';
      showScreen('guildScreen');
      throw e;
    }
    if (!carry) toast(`${member.name.split(' ')[0]} enters ${prep.map.name || hooks.locale.name}.`);
    return true;
  } finally {
    opening = false;
  }
}

/** Walk through a door into another map, keeping the session alive. */
async function usePortal(portal) {
  if (!D || D.transiting || D.ended) return;
  const S = D; // this transition belongs to THIS session, not whatever follows it
  // No need to park the loop: usePortal only ever runs from inside tick, whose
  // tail re-arms it, and the sim is gated on D.transiting while we bake.
  S.transiting = true;
  try {
    const prep = await prepMap(portal.to);
    if (D !== S || S.ended) return; // left (or a new delve began) during the bake
    // Stepping through a building's door remembers the doorstep you left, so
    // its own door can bring you back. Pushed only after a successful bake.
    if (portal.enter) S.stack.push({ to: S.map.id, at: [S.player.x, S.player.y] });
    mountScene(prep, portal.at);
    toast(prep.map.name || 'Onward');
  } catch (e) {
    console.warn('delve: door failed', e);
    if (D === S && !S.ended) {
      // Retire the broken door rather than retrying it every frame; any later
      // mount rebuilds the list from the map data anyway.
      S.portals = S.portals.filter((q) => q !== portal);
      toast('That door is stuck.');
    }
  } finally {
    if (D === S) S.transiting = false;
  }
}

/**
 * Attach the extruded terrain (cliff walls + raised blocks) to a plane
 * element. Positions and sizes are PERCENT of the plane, so the same
 * geometry works on the delve's native-px field AND the ranch's responsive
 * one. zMode 'y' interleaves walls with y-sorted standees (delve interiors);
 * 'under' pins them below everything (estate rims, where sprites never
 * stand outside the walls). Raised blocks lift by px (translateZ has no
 * percent) — use them only on native-px planes like the delve's.
 */
export function attachTerrain(parent, baked, opts = {}) {
  const { cols, rows, tex } = baked;
  const zMode = opts.zMode || 'under';
  const dW = DEPTH / TILE; // wall drop in tile units
  const el = (cls, css) => {
    const d = document.createElement('div');
    d.className = cls;
    d.style.cssText = css;
    parent.appendChild(d);
    return d;
  };
  /** The quads of each raised block, so a caller can fade a whole block at once
   *  when someone walks behind it (see trackOccluder). Faces are not listed —
   *  a cliff hangs BELOW the plane and can never cover anyone standing on it. */
  const blocks = [];
  for (const f of baked.faces) {
    const z = zMode === 'under' ? 1 : (f.kind === 's' ? 10 + f.y * TILE - 1 : 10 + (f.y + f.len) * TILE - 1);
    if (f.kind === 's') {
      el('dv-face', `left:${f.x / cols * 100}%;top:${f.y / rows * 100}%;width:${f.len / cols * 100}%;height:${dW / rows * 100}%;` +
        `background-image:url(${tex.faceS});background-size:${100 / f.len}% 100%;` +
        `transform-origin:50% 0;transform:rotateX(-90deg);z-index:${z};`);
    } else if (f.kind === 'e') {
      el('dv-face', `left:${f.x / cols * 100}%;top:${f.y / rows * 100}%;width:${dW / cols * 100}%;height:${f.len / rows * 100}%;` +
        `background-image:url(${tex.faceSideE});background-size:100% ${100 / f.len}%;` +
        `transform-origin:0 50%;transform:rotateY(90deg);z-index:${z};`);
    } else { // 'w'
      el('dv-face', `left:${(f.x - dW) / cols * 100}%;top:${f.y / rows * 100}%;width:${dW / cols * 100}%;height:${f.len / rows * 100}%;` +
        `background-image:url(${tex.faceSideW});background-size:100% ${100 / f.len}%;` +
        `transform-origin:100% 50%;transform:rotateY(-90deg);z-index:${z};`);
    }
  }
  // Faces BETWEEN two blocks stay inside the joined wall — skip them so a run
  // of cells reads as one continuous shelf/rock wall with no seams poking out.
  /** The texture set for a block: its own region's, else the plane's base. */
  const setFor = (b) => (b.theme && tex.byTheme && tex.byTheme[b.theme]) || tex.block;
  const bBlock = new Map(baked.blocks.map((b) => [b.x + ',' + b.y, b]));
  const hOf = (x, y) => {
    const q = bBlock.get(x + ',' + y);
    if (!q) return 0;
    const S = setFor(q);
    return (S[q.kind] || S.B).h;
  };
  for (const b of baked.blocks) {
    const S = setFor(b);
    const K = S[b.kind] || S.B;
    const h = K.h, hT = h / TILE; // height in px and in tile units
    // Painter's depth = the block's NEAR (south) edge, kept strictly BELOW a
    // character standing at that edge (whose z is 10 + y*TILE). A positive
    // bonus here is what made a shelf's top surface paint over the head of
    // someone standing in front of it — reading as "walked into the bookcase".
    const base = 10 + (b.y + 1) * TILE;
    const zTop = zMode === 'under' ? 2 : base - 6;
    const zFace = zMode === 'under' ? 1 : base - 2;
    const els = [el('dv-block-top', `left:${b.x / cols * 100}%;top:${b.y / rows * 100}%;width:${100 / cols}%;height:${100 / rows}%;` +
      `background-image:url(${K.top});background-size:100% 100%;transform:translateZ(${h}px);z-index:${zTop};`)];
    if (hOf(b.x, b.y + 1) < h) { // a block to the south hides this face
      els.push(el('dv-face', `left:${b.x / cols * 100}%;top:${(b.y + 1) / rows * 100}%;width:${100 / cols}%;height:${hT / rows * 100}%;` +
        `background-image:url(${K.face});background-size:100% 100%;` +
        `transform-origin:50% 0;transform:translateZ(${h}px) rotateX(-90deg);z-index:${zFace};`));
    }
    // End panels, so a run doesn't read as a hollow cutout from the side. They
    // are safe now that anyone standing in this row sorts above them (standZ).
    if (hOf(b.x + 1, b.y) < h) {
      els.push(el('dv-face', `left:${(b.x + 1) / cols * 100}%;top:${b.y / rows * 100}%;width:${hT / cols * 100}%;height:${100 / rows}%;` +
        `background-image:url(${K.sideE});background-size:100% 100%;` +
        `transform-origin:0 50%;transform:translateZ(${h}px) rotateY(90deg);z-index:${zFace};`));
    }
    if (hOf(b.x - 1, b.y) < h) {
      els.push(el('dv-face', `left:${(b.x - hT) / cols * 100}%;top:${b.y / rows * 100}%;width:${hT / cols * 100}%;height:${100 / rows}%;` +
        `background-image:url(${K.sideW});background-size:100% 100%;` +
        `transform-origin:100% 50%;transform:translateZ(${h}px) rotateY(-90deg);z-index:${zFace};`));
    }
    blocks.push({ x: b.x, y: b.y, h, els });
  }

  // ── The height vocabulary past the ledge ─────────────────────────────────
  const cell = (x, y, w, h2) =>
    `left:${x / cols * 100}%;top:${y / rows * 100}%;width:${w / cols * 100}%;height:${h2 / rows * 100}%;`;
  // Sunken floors: the painted plane keeps no pixels there, so the pit is a
  // real top quad a step down plus inner faces hanging off the higher ground.
  // The south inner wall faces away from the camera and is never drawn.
  for (const p of (baked.pits || [])) {
    const drop = p.lv * BLOCK_H;                       // negative px
    const hT = -p.lv * BLOCK_H / TILE;                 // wall drop in tile units
    const base = 10 + (p.y + 1) * TILE;
    const zTop = zMode === 'under' ? 1 : base - 8;
    const zFace = zMode === 'under' ? 1 : base - 4;
    const K = tex.block.b;
    el('dv-block-top', cell(p.x, p.y, 1, 1) +
      `background-image:url(${tex.pitTop});background-size:100% 100%;transform:translateZ(${drop}px);z-index:${zTop};`);
    const [wN, , wW, wE] = p.walls;
    if (wN) {
      el('dv-face', cell(p.x, p.y, 1, hT) +
        `background-image:url(${K.face});background-size:100% 100%;` +
        `transform-origin:50% 0;transform:rotateX(-90deg);z-index:${zFace};`);
    }
    if (wW) {
      el('dv-face', cell(p.x, p.y, hT, 1) +
        `background-image:url(${K.sideE});background-size:100% 100%;` +
        `transform-origin:0 50%;transform:rotateY(90deg);z-index:${zFace};`);
    }
    if (wE) {
      el('dv-face', cell(p.x + 1 - hT, p.y, hT, 1) +
        `background-image:url(${K.sideW});background-size:100% 100%;` +
        `transform-origin:100% 50%;transform:rotateY(-90deg);z-index:${zFace};`);
    }
    // The south lip: the neighbour row's own baked ground, re-drawn as a quad
    // that sorts over a body sunk in the pit and under a body standing on it.
    if (p.lip && baked.url) {
      el('dv-lip', cell(p.x, p.y + 1, 1, 1) +
        `background-image:url(${baked.url});background-size:${cols * TILE}px ${rows * TILE}px;` +
        `background-position:${-p.x * TILE}px ${-(p.y + 1) * TILE}px;` +
        `z-index:${10 + (p.y + 2) * TILE - 4};`);
    }
  }
  // Stairs: four real treads rising to the level they serve, each a quarter
  // tile deep, the last flush with the landing — Doom steps, not a decal.
  for (const s of (baked.stairs || [])) {
    const base = 10 + (s.y + 1) * TILE;
    const K = tex.block[2] || tex.block.b;
    for (let i = 0; i < 4; i++) {
      const zTread = (s.lv + (i + 1) / 4) * BLOCK_H;
      let rx = s.x, ry = s.y, rw = 1, rh = 0.25;
      if (s.dy === -1) ry = s.y + (3 - i) / 4;         // rising north
      else if (s.dy === 1) ry = s.y + i / 4;           // rising south
      else { rw = 0.25; rh = 1; rx = s.dx === -1 ? s.x + (3 - i) / 4 : s.x + i / 4; }
      el('dv-block-top', cell(rx, ry, rw, rh) +
        `background-image:url(${K.top});background-size:${rw === 1 ? 100 : 400}% ${rh === 1 ? 100 : 400}%;` +
        `transform:translateZ(${zTread}px);z-index:${zMode === 'under' ? 2 : base - 6};`);
      // The faces the tilted camera actually sees. Rising NORTH: each tread
      // shows a quarter-block lip at its own south edge. Rising EAST/WEST:
      // every quarter-tile strip runs the cell's full depth, so its SOUTH
      // edge stands the strip's whole height over the grade floor — a lip
      // alone left four shelves floating on a band of nothing (review).
      // Rising SOUTH needs no face: its risers face away and the top tread
      // lands flush against the higher ground.
      if (s.dy === -1) {
        el('dv-face', cell(s.x, ry + 0.25, 1, BLOCK_H / 4 / TILE) +
          `background-image:url(${K.face});background-size:100% 400%;` +
          `transform-origin:50% 0;transform:translateZ(${zTread}px) rotateX(-90deg);z-index:${zMode === 'under' ? 1 : base - 2};`);
      } else if (s.dx) {
        const hT2 = ((i + 1) / 4) * BLOCK_H / TILE;    // full strip height, in tile units
        el('dv-face', cell(rx, s.y + 1, 0.25, hT2) +
          `background-image:url(${K.face});background-size:400% 100%;` +
          `transform-origin:50% 0;transform:translateZ(${zTread}px) rotateX(-90deg);z-index:${zMode === 'under' ? 1 : base - 2};`);
      }
    }
  }
  // Decks — the two-surface cells. The top is a real quad at deck height with
  // a slab lip on every side the crossing ends at. Its z is FIXED just above
  // everything standing in its own row: a body UNDER the deck keeps its plain
  // standZ (below the planks), a body ON it takes the on-deck z from place()
  // (above them) — so both sides of the crossing sort right at once, and the
  // near-edge painter law for ordinary blocks is never touched.
  const SLAB = 12;
  for (const d of (baked.decks || [])) {
    const zTop = d.lv * BLOCK_H;
    const zDeck = 10 + (d.y + 1) * TILE + 8;
    const topTex = d.ch === 'n' && tex.plank ? tex.plank : (tex.block[2] || tex.block.b).top;
    const els = [el('dv-block-top', cell(d.x, d.y, 1, 1) +
      `background-image:url(${topTex});background-size:100% 100%;transform:translateZ(${zTop}px);z-index:${zDeck};`)];
    const [, lipS, lipW, lipE] = d.lips;
    const lipT = SLAB / TILE;
    if (lipS) {
      els.push(el('dv-face', cell(d.x, d.y + 1, 1, lipT) +
        `background-image:url(${topTex});background-size:100% ${TILE / SLAB * 100}%;` +
        `transform-origin:50% 0;transform:translateZ(${zTop}px) rotateX(-90deg);z-index:${zDeck};`));
    }
    if (lipW) {
      els.push(el('dv-face', cell(d.x, d.y, lipT, 1) +
        `background-image:url(${topTex});background-size:100% 100%;` +
        `transform-origin:0 50%;transform:translateZ(${zTop}px) rotateY(90deg);z-index:${zDeck};`));
    }
    if (lipE) {
      els.push(el('dv-face', cell(d.x + 1 - lipT, d.y, lipT, 1) +
        `background-image:url(${topTex});background-size:100% 100%;` +
        `transform-origin:100% 50%;transform:translateZ(${zTop}px) rotateY(-90deg);z-index:${zDeck};`));
    }
    blocks.push({ x: d.x, y: d.y, h: d.lv * BLOCK_H, els, deck: { lv: d.lv, under: d.under } });
  }
  // Doors — walls that will open. Each is a tall slab wearing the drawn door
  // face (FIRST el — mountScene swaps it for the locked variant), standing at
  // its derived floor. State is mountScene's business; this only builds wood.
  for (const d of (baked.doors || [])) {
    const hD = (tex.block.B || tex.block.b).h;
    const lift = d.lv * BLOCK_H;
    const zDoor = 10 + (d.y + 1) * TILE - 2;
    const els = [
      el('dv-face dv-door', cell(d.x, d.y + 1, 1, hD / TILE) +
        `background-image:url(${doorTexture(false)});background-size:100% 100%;` +
        `transform-origin:50% 0;transform:translateZ(${lift + hD}px) rotateX(-90deg);z-index:${zDoor};`),
      el('dv-block-top', cell(d.x, d.y, 1, 1) +
        `background-image:url(${(tex.block.B || tex.block.b).top});background-size:100% 100%;` +
        `transform:translateZ(${lift + hD}px);z-index:${zDoor - 4};`),
    ];
    blocks.push({ x: d.x, y: d.y, h: hD, els, doorAt: { lv: d.lv } });
  }
  return blocks;
}

/**
 * Register a standee as a SEE-THROUGH OCCLUDER if it is tall enough to hide a
 * person. Anything over a tile high can; below that it cannot, so counters,
 * aisle stacks and low furniture stay solid and keep their weight.
 *
 * The height is measured after the element is in the document on purpose —
 * art.js sprites carry only an aspect-ratio and a width, so their height does
 * not exist until the layout does.
 *
 * The fade is put on `.dv-up`, never on `.dv-prop`: opacity below 1 forces
 * `transform-style: flat`, and flattening the wrapper would collapse the
 * counter-rotation and squash the standee back into the floor. `.dv-up` already
 * flattens its own children, so it has nothing left to lose.
 */
function trackOccluder(el, x, y, w, room) {
  const up = el.querySelector('.dv-up');
  if (!up) return;
  // `rows: 0` means NOT YET MEASURED. Height cannot be taken here: mountScene
  // runs while #delveScreen is still hidden — showScreen comes after it — so
  // offsetHeight is 0 for every prop, and art.js sprites carry only an
  // aspect-ratio, so there is no number to compute from either. updateXray
  // resolves each one on the first frame its layout exists, and drops the ones
  // that turn out to be a tile or less.
  // `room` (optional) is the tile rect of a stamped interior this occluder
  // covers: standing IN that rect is a stronger condition than standing behind
  // the occluder, and gets a stronger answer (gone, not ghosted).
  D.occluders.push({ els: [up], x0: x - w / TILE / 2, x1: x + w / TILE / 2, y, rows: 0, on: 0, room: room || null });
}

/** Fade whatever the walker has stepped behind, and un-fade whatever they left.
 *  Only the walker counts — creatures and companions are a tile tall and hide
 *  nobody, and fading for them would set the whole room blinking.
 *  Three states, not two: 0 solid, 1 ghosted (behind it), 2 gone — the walker
 *  is INSIDE the room this occluder covers, and a 36% ghost of a whole facade
 *  laid over the room you are standing in obscures everything in it. */
function updateXray() {
  const p = D.player;
  for (let i = D.occluders.length - 1; i >= 0; i--) {
    const o = D.occluders[i];
    if (!o.rows) {                                  // a standee awaiting its first layout
      const h = o.els[0].offsetHeight;
      if (!h) continue;                             // screen still hidden — try next frame
      // Too short to hide anyone — UNLESS it fronts a room. A roomed group's
      // standee is only the NAMEPLATE now (the walls and roof are the
      // building), and dropping the group for the sign's 22px threw away the
      // roof fade with it: you walked into a building and saw nothing inside.
      if (h <= TILE && !o.room) { D.occluders.splice(i, 1); continue; }
      o.rows = rowsHidden(h);
      // A roomed group also fades a ROOF spanning the whole room plus the
      // up-screen projection of its ridge — 150px now: the 96px ring plus the
      // gable's rise — or the roof paints over walkers in the lane behind it
      // with nothing ever triggering the fade. XRAY_PAD absorbs the difference
      // between this orthographic estimate and the stage's real perspective.
      if (o.room) {
        o.rows = Math.max(o.rows,
          (o.y - o.room.y0) + (150 / TILE) * Math.tan(TILT * Math.PI / 180) + XRAY_PAD);
      }
    }
    const inside = o.room && p.x >= o.room.x0 && p.x < o.room.x1
      && p.y >= o.room.y0 && p.y < o.room.y1;
    // A walkable-topped block ('2'/'3' terrace) hides only someone BELOW its
    // top — never the walker standing on it, whose own ground would ghost.
    const hides = !inside && p.y < o.y && (o.y - p.y) <= o.rows
      && p.x > o.x0 - XRAY_PAD && p.x < o.x1 + XRAY_PAD
      && (p.lv || 0) < (o.topLv != null ? o.topLv : 99);
    const state = inside ? 2 : hides ? 1 : 0;
    if (state === o.on) continue;
    o.on = state;
    for (const el of o.els) {
      el.classList.toggle('dv-xray', state === 1);
      el.classList.toggle('dv-gone', state === 2);
    }
  }
  // Decks ghost while the walker is beneath them — otherwise the planks are
  // the last thing they ever see. Each quad is flat, so per-element fade is
  // safe (the .dv-up flattening trap only bites 3D assemblies).
  for (const d of (D.decks || [])) {
    const under = Math.floor(p.x) === d.x && Math.floor(p.y) === d.y && (p.lv || 0) < d.lv;
    const state = under ? 1 : 0;
    if (state === d.on) continue;
    d.on = state;
    for (const el of d.els) el.classList.toggle('dv-xray', state === 1);
  }
}

function addProp(html, x, y, w, room) {
  const el = document.createElement('div');
  el.className = 'dv-prop';
  el.innerHTML = `<div class="dv-shadow"></div><div class="dv-up">${html}</div>`;
  el.style.left = (x * TILE) + 'px';
  el.style.top = (y * TILE) + 'px';
  el.style.width = w + 'px';
  el.style.zIndex = standZ(y);
  el.style.setProperty('--dvlift', liftAt(x, y) + 'px'); // a prop on a ledge rides on it
  D.field.appendChild(el);
  trackOccluder(el, x, y, w, room);
  return el;
}

/** Ground a decal cutout the same way sprites are grounded — a 48px cell crop
 *  usually has empty rows under the object. Measured once per decal. */
function groundDecal(name, cv, h) {
  if (_padCache[name] == null) {
    const low = lowestOpaqueRow(cv);
    _padCache[name] = low < 0 ? 0 : (h - 1 - low) / h * 100;
  }
  if (_padCache[name] > 0) cv.style.setProperty('--footpct', _padCache[name].toFixed(2) + '%');
}

/** An upright standee cut from a prop sheet (boulders, stalagmites, the cart). */
function addPropCanvas(decalName, sheets, x, y) {
  const d = DECALS[decalName];
  const cv = document.createElement('canvas');
  cv.width = d.w; cv.height = d.h;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(sheets[d.sheet], d.x, d.y, d.w, d.h, 0, 0, d.w, d.h);
  groundDecal('decal:' + decalName, cv, d.h);
  const el = document.createElement('div');
  el.className = 'dv-prop';
  el.innerHTML = '<div class="dv-shadow"></div><div class="dv-up"></div>';
  el.querySelector('.dv-up').appendChild(cv);
  el.style.left = (x * TILE) + 'px';
  el.style.top = (y * TILE) + 'px';
  el.style.width = d.w + 'px';
  el.style.zIndex = standZ(y);
  el.style.setProperty('--dvlift', liftAt(x, y) + 'px');
  D.field.appendChild(el);
  trackOccluder(el, x, y, d.w);
}

function addOre(x, y, oresImg) {
  const kind = oreKindAt(x, y);
  const d = DECALS[ORE_KINDS[kind].decal];
  const cv = document.createElement('canvas');
  cv.width = d.w; cv.height = d.h;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(oresImg, d.x, d.y, d.w, d.h, 0, 0, d.w, d.h);
  groundDecal('ore:' + kind, cv, d.h);
  const el = document.createElement('div');
  el.className = 'dv-ore';
  el.innerHTML = '<div class="dv-shadow"></div><div class="dv-up"></div>';
  el.querySelector('.dv-up').appendChild(cv);
  el.style.left = ((x + 0.5) * TILE) + 'px';
  el.style.top = ((y + 1) * TILE - 2) + 'px';
  el.style.zIndex = standZ(y + 1);
  el.style.setProperty('--dvlift', liftAt(x + 0.5, y + 0.5) + 'px'); // a vein in an upper gallery
  D.field.appendChild(el);
  D.ores.push({ x, y, kind, el });
}

/** The lowest opaque row of a canvas, or -1 while it's still blank. */
function lowestOpaqueRow(cv) {
  let data;
  try { data = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, cv.width, cv.height).data; }
  catch (e) { return -1; } // tainted (never here — every sheet loads same-origin)
  for (let y = cv.height - 1; y >= 0; y--) {
    for (let x = 0; x < cv.width; x++) if (data[(y * cv.width + x) * 4 + 3] > 10) return y;
  }
  return -1;
}

/** Empty rows under a walk sheet's feet as a PERCENT of frame height (cached
 *  per sheet) — fed to --footpct so soles, not the frame edge, touch the ground. */
const _padCache = {};
function footPctOf(art, img, fw, fh) {
  if (_padCache[art] != null) return _padCache[art];
  const c = document.createElement('canvas');
  c.width = fw; c.height = fh;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = false;
  g.drawImage(img, fw, 0, fw, fh, 0, 0, fw, fh); // front-idle frame (col 1, row 0)
  const low = lowestOpaqueRow(c);
  return (_padCache[art] = low < 0 ? 0 : (fh - 1 - low) / fh * 100);
}

/** The Elements compositor centres a 48px cell in the canvas, leaving a wide
 *  empty band under the feet (~31% — measured, not assumed). Same for every
 *  character, so measure the first composited frame once and reuse it. */
let _heroFootPct = null;
function groundHeroSprite(cv) {
  if (_heroFootPct != null) return _heroFootPct;
  const low = lowestOpaqueRow(cv);
  if (low < 0) return null; // sheets still loading — try again next frame
  return (_heroFootPct = (cv.height - 1 - low) / cv.height * 100);
}

/** A random walkable point, biased away from doorways. Null if the map is full. */
function randomFloor() {
  for (let i = 0; i < 80; i++) {
    const x = 1 + Math.random() * (D.cols - 2), y = 1 + Math.random() * (D.rows - 2);
    if (!canStand(x, y)) continue;
    if (D.exit && Math.hypot(D.exit.x - x, D.exit.y - y) < 2) continue;
    if (Math.hypot(D.player.x - x, D.player.y - y) < 1.5) continue;
    return { x, y };
  }
  return null;
}

/** A fellow member at work in the room — a real compositor actor that strolls. */
function spawnCompanion(person, x, y) {
  const el = document.createElement('div');
  el.className = 'dv-actor dv-player dv-companion';
  el.innerHTML = '<div class="dv-shadow"></div><div class="dv-up"></div>';
  const cv = document.createElement('canvas');
  cv.width = 96; cv.height = 96;
  el.querySelector('.dv-up').appendChild(cv);
  if (_heroFootPct != null) cv.style.setProperty('--footpct', _heroFootPct.toFixed(2) + '%');
  D.field.appendChild(el);
  D.companions.push({
    actor: D.gfx.makeActor(person), cv, el, x, y, home: { x, y },
    mode: 'idle', tx: x, ty: y, t: 0.5 + Math.random() * 2.5, moving: false,
    grounded: _heroFootPct != null,
  });
}

function spawnCreature(prey, img, x, y) {
  const fw = Math.floor(img.naturalWidth / 3), fh = Math.floor(img.naturalHeight / 4);
  const el = document.createElement('div');
  el.className = 'dv-actor dv-creature';
  el.innerHTML = '<div class="dv-shadow"></div><div class="dv-up"></div>';
  const cv = document.createElement('canvas');
  cv.width = fw; cv.height = fh;
  el.querySelector('.dv-up').appendChild(cv);
  el.style.width = fw + 'px';
  cv.style.setProperty('--footpct', footPctOf(prey.art, img, fw, fh).toFixed(2) + '%');
  D.field.appendChild(el);
  D.creatures.push({
    prey, img, fw, fh, cv, el, x, y, home: { x, y },
    lv: (D.model ? (D.model.surfacesAt(Math.floor(x), Math.floor(y))[0] || 0) : 0),
    mode: 'idle', tx: x, ty: y, t: 1 + (hash2(x * 7, y * 13) % 20) / 10,
    row: 0, phase: hash2(x, y) % 997, _drawn: -1,
  });
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

function wireInput() {
  D.onKeyDown = (e) => {
    if (!screenActive() || D.fighting) return;
    const k = e.key.toLowerCase();
    if (k === 'escape') { leave(); return; }
    // The one action key. Only ever armed when a workable prop is in reach, so
    // it can't collide with anything else the walk does.
    if (k === 'e' || k === 'enter' || k === ' ') { e.preventDefault(); beginUse(); return; }
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(k)) {
      D.keys[k] = true;
      e.preventDefault();
    }
  };
  D.onKeyUp = (e) => { if (D) D.keys[e.key.toLowerCase()] = false; };
  window.addEventListener('keydown', D.onKeyDown);
  window.addEventListener('keyup', D.onKeyUp);

  // Touch stick — appears under the thumb anywhere on the lower-left half.
  //
  // Only where a thumb is the pointer. The old gate was touch CAPABILITY, which
  // every touchscreen laptop answers yes to, so a desktop player got a painted
  // stick over a field they were already walking with WASD. `touchPrimary` asks
  // which device is actually driving, and the subscription below puts the stick
  // back the moment somebody on a hybrid machine reaches for the glass.
  D.joyTouchOff = onTouchPrimary(() => { if (D && !D.joyEl) buildTouchStick(); });
  if (touchPrimary()) buildTouchStick();
}

/** The stick itself, split out so the touch latch can build it late. */
function buildTouchStick() {
  if (!D || !D.host) return;
  const joy = document.createElement('div');
  joy.className = 'delve-joy';
  joy.innerHTML = '<div class="dj-base"><div class="dj-knob"></div></div>';
  D.host.appendChild(joy);
  D.joyEl = joy;
  const base = joy.querySelector('.dj-base'), knob = joy.querySelector('.dj-knob');
  let pid = null, cx = 0, cy = 0;
  joy.addEventListener('pointerdown', (e) => {
    pid = e.pointerId; cx = e.clientX; cy = e.clientY;
    base.style.left = cx + 'px'; base.style.top = cy + 'px';
    base.classList.add('on');
    joy.setPointerCapture(pid);
  });
  joy.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pid) return;
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const m = Math.hypot(dx, dy);
    if (m > 42) { dx = dx / m * 42; dy = dy / m * 42; }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    D.joy = m > 8 ? { x: dx / 42, y: dy / 42 } : null;
  });
  const end = (e) => {
    if (e.pointerId !== pid) return;
    pid = null; D.joy = null;
    base.classList.remove('on');
    knob.style.transform = '';
  };
  joy.addEventListener('pointerup', end);
  joy.addEventListener('pointercancel', end);
}

function unwireInput() {
  window.removeEventListener('keydown', D.onKeyDown);
  window.removeEventListener('keyup', D.onKeyUp);
  if (D.joyTouchOff) { D.joyTouchOff(); D.joyTouchOff = null; }
  padReset();   // a button held as you leave is not a fresh press on the way back in
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

const passAt = (x, y) => {
  const tx = Math.floor(x), ty = Math.floor(y);
  return tx >= 0 && ty >= 0 && tx < D.cols && ty < D.rows && D.pass[ty][tx];
};
/** Is the cell under this point a full-height wall (as opposed to open floor
 *  or a prop's shallow footprint)? Outside the grid counts as wall. */
const tallAt = (x, y) => {
  const tx = Math.floor(x), ty = Math.floor(y);
  return tx < 0 || ty < 0 || tx >= D.cols || ty >= D.rows || D.tall[ty][tx];
};
/** Does the feet box clear every prop footprint? A body two or more levels
 *  off a prop's floor clears it entirely — the barrel under the bridge does
 *  not block the crossing above it (ONE COLLISION FACT, and the FP lens's
 *  propBlockers rule word for word). Furniture is level-0 by editor law, so
 *  a solid's own level is the ground of the cell it was baked in. */
const clearOfSolids = (x, y, lv) => {
  for (const s of D.solids) {
    if (lv != null && Math.abs(lv - (s.lv || 0)) >= 2) continue;
    if (x > s.x0 - BODY_R && x < s.x1 + BODY_R && y > s.y0 - BODY_R && y < s.y1 + BODY_R) return false;
  }
  return true;
};
/** The ground level under a point (lowest surface; 0 off the grid). Statics —
 *  props, ores, dressing — stand here; moving bodies carry a committed .lv. */
const groundAt = (x, y) => {
  const s = D.model.surfacesAt(Math.floor(x), Math.floor(y));
  return s.length ? s[0] : 0;
};
/** Is this point on a climb link (ladder, vine, or stairs)? */
const onClimb = (x, y) => D.model.climbAt(Math.floor(x), Math.floor(y));
const onStairs = (x, y) => D.model.stairAt(Math.floor(x), Math.floor(y));
/** Standing in a liquid. Water is an overlay on the chart, not a grid char, so
 *  this is a set lookup and not a character test (@see wetCells). */
const inWater = (x, y) => D.wet.has(Math.floor(x) + ',' + Math.floor(y));
/** How deep, in steps — 0 on dry land (@see waterDepths). */
const depthAt = (x, y) => D.depths.get(Math.floor(x) + ',' + Math.floor(y)) || 0;
/** Out of your depth here? Then the pose runs whether you are moving or not. */
const swimmingAt = (x, y) => isSwimming(depthAt(x, y));
/**
 * How far off the plane a STATIC standee here rides, in plane px — the ground
 * surface, or halfway between levels on a ladder's rungs. (Stairs are walked,
 * not hung from: liftFor interpolates a body across them instead.)
 */
const liftAt = (x, y) => (onClimb(x, y) && !onStairs(x, y)
  ? D.model.floorAt(Math.floor(x), Math.floor(y)) + CLIMB_LIFT
  : groundAt(x, y)) * BLOCK_H;
/**
 * The lift of a MOVING body: the surface it has committed to (.lv — which is
 * what tells a body ON a bridge from one under it), except across a climb
 * cell, where it rides between levels. Stairs interpolate by real progress
 * toward the higher end, so feet track the treads at full walk speed; rungs
 * keep the flat half-step (a climb is slow enough to read as climbing).
 */
function liftFor(e) {
  const cx = Math.floor(e.x), cy = Math.floor(e.y);
  if (D.model.climbAt(cx, cy)) {
    const base = D.model.floorAt(cx, cy);
    if (D.model.stairAt(cx, cy)) {
      const s = (D.stairDirs && D.stairDirs.get(cx + ',' + cy));
      const frac = !s ? 0.5
        : s[0] ? (s[0] > 0 ? e.x - cx : 1 - (e.x - cx))
          : (s[1] > 0 ? e.y - cy : 1 - (e.y - cy));
      return (base + Math.max(0, Math.min(1, frac))) * BLOCK_H;
    }
    return (base + CLIMB_LIFT) * BLOCK_H;
  }
  return (e.lv != null ? e.lv : groundAt(e.x, e.y)) * BLOCK_H;
}

/** The surface a body at level `lv` lands on stepping to (x,y) — or null.
 *  ONE RULES FACT: the shared model answers; this only translates coords. */
const stepSurface = (lv, fx, fy, x, y) =>
  fx == null
    ? (D.model.surfacesAt(Math.floor(x), Math.floor(y))[0] ?? null)
    : D.model.pickSurface(lv, Math.floor(fx), Math.floor(fy), Math.floor(x), Math.floor(y));

/** The surface the last successful canStand picked — consumed by tryMove. */
let _pick = null;
function canStand(x, y, fx, fy, lv, noUnder) {
  _pick = null;
  if (!(passAt(x - BODY_R, y - BODY_R) && passAt(x + BODY_R, y - BODY_R) &&
    passAt(x - BODY_R, y + BODY_R) && passAt(x + BODY_R, y + BODY_R) &&
    // The extra standoff from a wall to the NORTH — see WALL_BACK. Props are
    // exempt (they use `solids`), so you can still tuck in behind an anvil.
    !tallAt(x - BODY_R, y - BODY_R - WALL_BACK) && !tallAt(x + BODY_R, y - BODY_R - WALL_BACK) &&
    clearOfSolids(x, y, lv))) return false;
  const pick = stepSurface(lv, fx, fy, x, y);
  if (pick == null) return false;
  // A body too big for the passage refuses the under-surface of a deck —
  // tested HERE, per axis, because a pre-check on the combined target let a
  // slide leak a sovereign beneath the planks one axis at a time (review).
  if (noUnder) {
    const dk = D.model.deckAt(Math.floor(x), Math.floor(y));
    if (dk != null && pick < dk) return false;
  }
  _pick = pick;
  return true;
}

/** Axis-separated move: slide along walls instead of sticking. Returns moved?
 *  The step's ORIGIN is passed through so the level rule can see it — a move
 *  tested without one (a spawn, a wander target) is judged on footing alone.
 *  A successful axis commits the body to the surface the law picked. */
function tryMove(e, dx, dy, noUnder) {
  let moved = false;
  if (dx && canStand(e.x + dx, e.y, e.x, e.y, e.lv, noUnder)) { e.x += dx; e.lv = _pick; moved = true; }
  if (dy && canStand(e.x, e.y + dy, e.x, e.y, e.lv, noUnder)) { e.y += dy; e.lv = _pick; moved = true; }
  return moved;
}

function movePlayer(dt) {
  const p = D.player;
  let ux = (D.keys.d || D.keys.arrowright ? 1 : 0) - (D.keys.a || D.keys.arrowleft ? 1 : 0);
  let uy = (D.keys.s || D.keys.arrowdown ? 1 : 0) - (D.keys.w || D.keys.arrowup ? 1 : 0);
  if (D.joy) { ux += D.joy.x; uy += D.joy.y; }
  // The camera here has no yaw to steer (a fixed tilt, delve.js TILT), so a
  // controller only ever walks: left stick and d-pad both, in field space, the
  // same screen-relative axes the keys use.
  if (D.pad) { ux += D.pad.mx; uy += D.pad.my; }
  const m = Math.hypot(ux, uy);
  if (m > 0.01) {
    ux /= Math.max(1, m); uy /= Math.max(1, m);
    // Rungs cost time; STAIRS are the climb you take at a walk — full speed.
    // Water costs time too, and for the same reason: a crossing you can make
    // at a stroll is not a crossing. (Multiplied, not branched — a ladder that
    // stands in a flooded shaft is honestly both.)
    const speed = PLAYER_SPEED
      * (onClimb(p.x, p.y) && !onStairs(p.x, p.y) ? CLIMB_SPEED : 1)
      * (inWater(p.x, p.y) ? WADE_SPEED : 1);
    tryMove(p, ux * speed * dt, uy * speed * dt);
    p.actor.facing = Math.atan2(ux, -uy);
    /**
     * WADING WEARS THE CLIMB. The sheet has no swim cells, but it has a real
     * CLIMB cycle (sprite-tables ELEMENTS_ANIMS.climb, cols 20/21/20/19) — a
     * body hauling itself along with its arms — and that is much closer to
     * pushing through water than the walk cycle is. Reusing an authored pose
     * is not the same as faking one: no transform invents a frame here, the
     * sheet is simply asked for the cells it already draws.
     *
     * Compared by NAME rather than latched on a boolean, because the swap now
     * happens mid-stride — you walk into the creek without stopping, and a
     * `moving` flag that was already true would never fire the change.
     */
    const desired = inWater(p.x, p.y) ? 'climb' : 'move';
    if (p.actor.anim.name !== desired) D.gfx.setAnim(p.actor, desired);
    p.moving = true;
  } else {
    /**
     * OUT OF YOUR DEPTH, THE POSE KEEPS GOING. Treading water is something a
     * body DOES; the moment it stops it sinks. So past chest depth the cycle
     * runs whether or not you are travelling — and shallower than that it does
     * not, because standing on the bottom of a ford looks like standing.
     */
    const still = swimmingAt(p.x, p.y) ? 'climb' : 'idle';
    if (p.actor.anim.name !== still) D.gfx.setAnim(p.actor, still);
    p.moving = false;
  }
}

function moveCreatures(dt) {
  const p = D.player;
  for (const c of D.creatures) {
    const dist = Math.hypot(c.x - p.x, c.y - p.y);
    const rank = c.prey.rank || 1;
    let speed = 1.0;
    if (rank <= 1 && dist < 2.6) {
      // Skittish game bolts away from the hunter.
      c.mode = 'flee'; c.tx = c.x + (c.x - p.x) / (dist || 1) * 2; c.ty = c.y + (c.y - p.y) / (dist || 1) * 2;
      speed = 2.1;
    } else if (rank >= 3 && dist < 3.4 && Math.abs((c.lv || 0) - (p.lv || 0)) < 2) {
      // Predators and the restless dead close in — but a hunter two full
      // levels away is somewhere they cannot reach with no pathfinding, and
      // pacing under the bridge you stand on is a free kill for a bow
      // (project law: one reach, both ways). They lose interest instead.
      c.mode = 'chase'; c.tx = p.x; c.ty = p.y;
      speed = rank >= 4 ? 1.7 : 1.35;
    } else if (c.mode === 'chase' || c.mode === 'flee') {
      c.mode = 'idle'; c.t = 0.6;
    }
    if (c.mode === 'idle') {
      c.t -= dt;
      if (c.t <= 0) {
        // Wander a fresh patch near home — never casually off a rim, though:
        // an idle browse that drops into a trench it cannot climb out of
        // leaves the pit accumulating wildlife.
        for (let i = 0; i < 6; i++) {
          const nx = c.home.x + (Math.random() * 6 - 3), ny = c.home.y + (Math.random() * 6 - 3);
          if (canStand(nx, ny) && _pick >= (c.lv || 0)) { c.tx = nx; c.ty = ny; c.mode = 'walk'; break; }
        }
        if (c.mode !== 'walk') c.t = 1.5;
      }
      continue;
    }
    const dx = c.tx - c.x, dy = c.ty - c.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.15) { c.mode = 'idle'; c.t = 1 + Math.random() * 2.2; continue; }
    const step = Math.min(d, speed * dt);
    // A big body does not fit beneath a deck: rank 4-5 creatures stand taller
    // than the passage (ONE COLLISION FACT — you fit or you don't), so the
    // under-surface of a bridge simply is not ground to them. Enforced inside
    // the per-axis test — a combined-target pre-check let the slide leak one
    // axis at a time.
    const moved = tryMove(c, dx / d * step, dy / d * step, rank >= 4);
    if (!moved) { c.mode = 'idle'; c.t = 0.8 + Math.random() * 1.5; continue; }
    c.row = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 2 : 1) : (dy > 0 ? 0 : 3);
  }
}

/** Companions potter about near where they started, pausing between errands. */
function moveCompanions(dt) {
  for (const c of D.companions) {
    if (c.mode === 'idle') {
      c.t -= dt;
      if (c.moving) { D.gfx.setAnim(c.actor, 'idle'); c.moving = false; }
      if (c.t <= 0) {
        for (let i = 0; i < 8; i++) {
          const nx = c.home.x + (Math.random() * 5 - 2.5), ny = c.home.y + (Math.random() * 5 - 2.5);
          if (canStand(nx, ny)) { c.tx = nx; c.ty = ny; c.mode = 'walk'; break; }
        }
        if (c.mode !== 'walk') c.t = 1.5;
      }
      continue;
    }
    const dx = c.tx - c.x, dy = c.ty - c.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.12) { c.mode = 'idle'; c.t = 1.5 + Math.random() * 4; continue; }
    // Water costs a creature the same as it costs the walker — a ford nothing
    // else has to slow for is scenery, not terrain (ONE RULES FACT).
    const wading = inWater(c.x, c.y);
    const step = Math.min(d, 1.15 * dt * (wading ? WADE_SPEED : 1));
    if (!tryMove(c, dx / d * step, dy / d * step)) { c.mode = 'idle'; c.t = 1 + Math.random() * 2; continue; }
    c.actor.facing = Math.atan2(dx / d, -dy / d);
    const want = wading ? 'climb' : 'move';
    if (c.actor.anim.name !== want) D.gfx.setAnim(c.actor, want);
    c.moving = true;
  }
}

/** Close on a vein and you work it — no menu, a vein is a resource, not a
 *  decision. The swing is what changed: it used to vanish on contact. */
function checkOres() {
  if (D.working) return;
  const p = D.player;
  for (const o of D.ores) {
    // A pick reaches a step up or down; it does not reach a vein two levels
    // under the deck you stand on.
    if (Math.abs((p.lv || 0) - (D.model.surfacesAt(o.x, o.y)[0] || 0)) > 1) continue;
    if (Math.hypot(o.x + 0.5 - p.x, o.y + 0.5 - p.y) < 0.95) { mineOre(o); return; }
  }
}

/** How many pickaxe strikes a vein takes. Richer rock is harder rock. */
const ORE_HITS = { iron: 3, silver: 3, copper: 4, crystal: 4 };

/**
 * Break a vein with the pickaxe. Freezes the walk (as a bout does), swings
 * until the rock gives, then runs the haul bookkeeping exactly as before —
 * the spoils, the toast and the `mined` latch are unchanged.
 */
async function mineOre(o) {
  const S = D;
  if (S.working || S.ores.indexOf(o) < 0) return;
  S.working = true;
  S.keys = {}; S.joy = null;
  try {
    await swingLoop({
      tool: 'Club', tx: o.x + 0.5, ty: o.y + 0.5, beats: ORE_HITS[o.kind] || 3,
      onStrike: () => {
        o.el.classList.add('hit');
        setTimeout(() => o.el.classList.remove('hit'), 150);
        sparkBurst(o.el, 'grit');
      },
    });
    if (D !== S || S.ended || S.ores.indexOf(o) < 0) return;
    S.ores.splice(S.ores.indexOf(o), 1);
    o.el.classList.add('broken');
    setTimeout(() => o.el.remove(), 380);
    S.pass[o.y][o.x] = true;
    S.mined.add(S.map.id + ':' + o.x + ',' + o.y);
    const kind = ORE_KINDS[o.kind];
    const r = S.hooks.onOre(o.kind);
    S.haul.gold += kind.gold;
    if (kind.mat) S.haul.mats[kind.mat] = (S.haul.mats[kind.mat] || 0) + 1;
    updateHaul();
    toast(r && r.txt ? r.txt : `⚒ ${kind.name} · +${kind.gold}g`);
  } finally {
    if (D === S) S.working = false;
  }
}

// ---------------------------------------------------------------------------
// Workable props — walk up to a thing and do the work at it
// ---------------------------------------------------------------------------

/** The nearest workable prop within reach of the feet, or null. Props are
 *  approached from the FRONT (south) or from behind; either counts. */
function nearestUse() {
  const p = D.player;
  let best = null, bestD = USE_RANGE;
  for (const u of D.uses) {
    if (Math.abs((p.lv || 0) - groundAt(u.x, u.y)) > 0.5) continue; // work at its own level
    const d = Math.hypot(u.x - p.x, u.y - 0.5 - p.y);
    if (d < bestD) { bestD = d; best = u; }
  }
  return best;
}

/** Show/hide the action button as the walker moves in and out of reach. */
function updateUsePrompt() {
  const btn = D.host.querySelector('.dv-use');
  if (!btn) return;
  const u = (D.working || D.fighting || D.transiting) ? null : nearestUse();
  D.useNear = u;
  if (!u) { btn.hidden = true; return; }
  btn.hidden = false;
  btn.textContent = `E · ${u.label}`;
}

/** Hand the station to the caller (hall.js), which decides what working it
 *  means. The sim is frozen for the duration, exactly as a bout freezes it. */
async function beginUse() {
  if (!D || D.working || D.fighting || D.transiting || D.ended) return;
  const u = D.useNear || nearestUse();
  if (!u || !D.hooks.use) return;
  const S = D;
  S.working = true;
  S.keys = {}; S.joy = null;
  D.gfx.setAnim(S.player.actor, 'idle'); S.player.moving = false;
  updateUsePrompt();
  try {
    await S.hooks.use(u.id, { member: S.member, toast, workAt, choose });
  } catch (e) {
    console.error('delve: work failed', e);
    if (D === S && !S.ended) toast('The work goes nowhere.');
  } finally {
    if (D === S) { S.working = false; updateUsePrompt(); }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * An in-world chooser: a card over the scene listing what the work could be
 * spent on. Resolves with the chosen value, or null if the walker backs out.
 * @param {{title:string, sub?:string, options:{value:string,label:string,desc?:string,note?:string,dim?:boolean}[]}} spec
 */
function choose(spec) {
  return new Promise((resolve) => {
    const S = D;
    const box = document.createElement('div');
    box.className = 'dv-choose';
    const rows = (spec.options || []).map((o, i) =>
      `<button class="dvc-opt ${o.dim ? 'dim' : ''}" data-i="${i}" ${o.dim ? 'disabled' : ''}>
         <span><span class="dvc-name">${o.label}</span>${o.desc ? `<span class="dvc-desc">${o.desc}</span>` : ''}</span>
         ${o.note ? `<span class="dvc-note">${o.note}</span>` : ''}</button>`).join('')
      || '<div class="dvc-empty">Nothing here to work on.</div>';
    box.innerHTML = `<div class="dvc-card">
        <div class="dvc-title">${spec.title}</div>
        ${spec.sub ? `<div class="dvc-sub">${spec.sub}</div>` : ''}
        <div class="dvc-list">${rows}</div>
        <button class="dvc-cancel">Step away</button>
      </div>`;
    S.host.appendChild(box);
    const done = (v) => { box.remove(); resolve(v); };
    box.querySelectorAll('.dvc-opt').forEach((b) => {
      b.onclick = () => done(spec.options[+b.dataset.i].value);
    });
    box.querySelector('.dvc-cancel').onclick = () => done(null);
  });
}

/** Debris off a struck face, in the plane's upright frame. `kind` picks the
 *  look: hot sparks off steel, cold grit off rock. */
function sparkBurst(el, kind = '') {
  const up = el.querySelector('.dv-up');
  if (!up) return;
  for (let i = 0; i < 7; i++) {
    const s = document.createElement('span');
    s.className = 'dv-spark ' + kind;
    s.style.setProperty('--sx', (Math.random() * 44 - 22).toFixed(1) + 'px');
    s.style.setProperty('--sy', (-14 - Math.random() * 20).toFixed(1) + 'px');
    s.style.animationDelay = (Math.random() * 40).toFixed(0) + 'ms';
    up.appendChild(s);
    setTimeout(() => s.remove(), 620);
  }
}

/**
 * The shared swing: take up a tool, square up to a point on the plane, and
 * strike it `beats` times, calling `onStrike(i, isLast)` at each contact.
 *
 * The tool is a real compositor weapon swapped into the actor's hand for the
 * duration ('Hammer' → hammer.png, 'Club' → pickaxe1.png). Those tool sheets
 * paint ONLY the Attack/Tool columns, and the compositor HIDES a weapon whose
 * passive cells are blank — so the tool appears on the swing and is gone again
 * afterwards without anything here having to hide it. The member's own weapon
 * is put back at the end.
 */
async function swingLoop({ tool, tx, ty, beats = 3, anim = 'slash', onStrike }) {
  const S = D, p = S.player;
  const gearWas = p.actor.gear, sheatheWas = p.actor.sheatheWhenIdle;
  // A tool goes in hand; a bare-handed trade (stirring a pot) empties them, so
  // a Ranger brewing doesn't wave a bow over the cauldron.
  p.actor.gear = tool ? { RHand: { type: tool, tier: 1 }, LHand: null } : { RHand: null, LHand: null };
  p.actor.sheatheWhenIdle = false;
  p.actor.facing = Math.atan2(tx - p.x, -(ty - p.y));
  await sleep(170);
  let out = null;
  for (let i = 0; i < beats && D === S && !S.ended; i++) {
    S.gfx.setAnim(p.actor, anim);
    await sleep(210);            // ≈60% through the 5×70ms swing — contact
    if (D !== S || S.ended) break;
    if (onStrike) { const v = onStrike(i, i === beats - 1); if (v !== undefined) out = v; }
    await sleep(330);            // the follow-through, then wind up again
  }
  if (D === S && !S.ended) {
    S.gfx.setAnim(p.actor, 'idle');
    p.actor.gear = gearWas; p.actor.sheatheWhenIdle = sheatheWas;
  }
  return out;
}

/**
 * Work a station: step in, turn to it, and swing a tool at it `beats` times.
 *
 * The tool is a real compositor weapon swapped into the actor's hand for the
 * duration (`Hammer` → hammer.png, `Club` → pickaxe1.png). Those tool sheets
 * paint ONLY the Attack/Tool columns, and the compositor hides a weapon whose
 * passive cells are blank — so the tool appears on the swing and vanishes
 * afterwards without any extra work here.
 *
 * `finish` fires on the LAST strike, so the outcome lands with the impact
 * rather than after it; its return value picks the flourish.
 * @param {string} useId
 * @param {{tool?:string, beats?:number, itemHTML?:string, struckArt?:string,
 *          finish?:function():{ok?:boolean, broke?:boolean, txt?:string}}} opts
 */
async function workAt(useId, opts = {}) {
  const S = D;
  const u = S.uses.find((q) => q.id === useId);
  if (!u) return null;
  const p = S.player;
  const restArt = u.art;

  // Lay the piece on the face before the first swing, so you SEE what is being
  // worked. It rides inside .dv-up, already counter-rotated upright with the
  // anvil, so it stays glued to the face at any camera angle.
  let piece = null;
  if (opts.itemHTML) {
    piece = document.createElement('span');
    piece.className = 'dv-onanvil';
    piece.innerHTML = opts.itemHTML;
    u.el.querySelector('.dv-up').appendChild(piece);
  }
  // Step in to the station and square up to it — and COMMIT the surface the
  // step-in lands on, like every other position write (the teleport crossed a
  // cell line with a stale lv and the standee rendered on the wrong floor).
  if (canStand(u.x, u.y + 0.58)) { p.x = u.x; p.y = u.y + 0.58; p.lv = _pick; }

  const result = await swingLoop({
    tool: opts.tool, tx: u.x, ty: u.y, beats: opts.beats || 3, anim: opts.anim,
    onStrike: (i, last) => {
      // The roll happens ON the last strike, so the outcome and the impact
      // land together instead of the result arriving after the animation.
      let r;
      if (last && opts.finish) { try { r = opts.finish(); } catch (e) { console.error('delve: finish threw', e); } }
      if (opts.struckArt) {
        u.el.querySelector('.px-art').outerHTML = artSprite(opts.struckArt, 'dv-furn');
        setTimeout(() => { if (D === S && !S.ended) u.el.querySelector('.px-art').outerHTML = artSprite(restArt, 'dv-furn'); }, 150);
      }
      sparkBurst(u.el);
      if (piece) { piece.classList.add('hit'); setTimeout(() => piece.classList.remove('hit'), 150); }
      return r;
    },
  });

  if (D === S && !S.ended) {
    if (piece) {
      if (result && result.broke) { piece.classList.add('shatter'); setTimeout(() => piece.remove(), 520); }
      else { piece.classList.add('lift'); setTimeout(() => piece.remove(), 420); }
    }
    if (result && result.txt) toast(result.txt);
  } else if (piece) piece.remove();
  return result;
}

function checkExit() {
  if (!D.exit) return;
  const p = D.player;
  const d = Math.hypot(D.exit.x - p.x, D.exit.y - p.y);
  // The entry point sits beside the way out — arm the exit only after the
  // walker has actually stepped clear of it, so one stray press at spawn
  // doesn't instantly end the delve.
  if (!D.exitArmed) { if (d > 1.35) D.exitArmed = true; return; }
  if (d >= 0.8) return;
  // Crossing a bridge OVER the doorway is not leaving (ONE RULES FACT: every
  // proximity trigger levels with its own ground now).
  if (Math.abs((p.lv || 0) - (D.exit.lv || 0)) > 0.5) return;
  // Inside a building? The door leads back out to where you came in.
  if (D.stack.length) { usePortal({ ...D.stack.pop(), popped: true }); return; }
  endDelve('walked out with the haul');
}

/** Doors to other maps — armed the same way, so arriving in a room doesn't
 *  immediately bounce the walker back through the door they came in by. */
function checkPortals() {
  if (!D.portals.length) return;
  const p = D.player;
  const level = (q) => Math.abs((p.lv || 0) - (q.lv || 0)) <= 0.5;
  const near = (q) => Math.hypot(q.x - p.x, q.y - p.y);
  if (!D.portalArmed) {
    if (D.portals.every((q) => near(q) > 1.35)) D.portalArmed = true;
    return;
  }
  for (const q of D.portals) if (near(q) < 0.8 && level(q)) { usePortal(q); return; }
}

/** Open a door NOW: the ledger, the way through, and the wood fading back.
 *  Passability and the tall standoff both open — a door is a wall until it
 *  is not one (per-session copies, so the bake cache never learns this). */
function openDoorCell(d) {
  d.open = true;
  D.opened.add(d.key);
  D.pass[d.y][d.x] = true;
  D.tall[d.y][d.x] = false;
  for (const el of d.els) el.classList.add('dv-gone');
}

/** Keys are taken by walking over them; doors open by walking up to them —
 *  the delve's grammar for both (a vein is bumped, a portal approached).
 *  Both level with the walker, and a locked door asks for a key ONCE per
 *  approach rather than nagging every frame. */
function checkDoorsAndKeys() {
  if (D.working || D.fighting || D.transiting || D.ended) return;
  const p = D.player;
  for (const k of D.keyCells) {
    if (k.taken) continue;
    if (Math.abs((p.lv || 0) - groundAt(k.x + 0.5, k.y + 0.5)) > 0.5) continue;
    if (Math.hypot(k.x + 0.5 - p.x, k.y + 0.5 - p.y) < 0.6) {
      k.taken = true; D.keysTaken.add(k.key); D.keyCount++;
      k.el.remove();
      toast(`A key — worn iron, still warm. (${D.keyCount} carried)`);
    }
  }
  for (const d of D.doors) {
    if (d.open) continue;
    const dist = Math.hypot(d.x + 0.5 - p.x, d.y + 0.5 - p.y);
    if (dist > 1.4) { d.warned = 0; continue; }
    if (dist > 0.95) continue;
    if (Math.abs((p.lv || 0) - d.lv) > 0.5) continue;
    if (d.locked && D.keyCount < 1) {
      if (!d.warned) { d.warned = 1; toast('Locked. Somewhere there is a key.'); }
      continue;
    }
    if (d.locked) { D.keyCount--; toast('The key turns — the lock gives.'); }
    else toast('The door swings open.');
    openDoorCell(d);
  }
}

function checkEncounters() {
  const p = D.player;
  for (const c of D.creatures) {
    // One step of height difference is a duel across a ledge; two is a
    // different floor — nothing engages through a bridge deck.
    if (Math.abs((c.lv || 0) - (p.lv || 0)) > 1) continue;
    const engageR = 0.5 + (c.fw / TILE) * 0.28;
    if (Math.hypot(c.x - p.x, c.y - p.y) < engageR) { engage(c); return; }
  }
}

async function engage(c) {
  if (D.fighting || D.ended) return;
  D.fighting = true;
  D.gfx.setAnim(D.player.actor, 'idle'); D.player.moving = false;
  D.keys = {}; D.joy = null; D.pad = null;
  let bout = null;
  try { bout = await D.hooks.fight(c.prey.id); }
  catch (e) { console.error('delve: bout failed', e); } // null bout → graceful end below
  if (!D || D.ended) return; // left while the bout wrapped up
  showScreen('delveScreen');
  D.haul.bouts++;
  if (bout && bout.won) {
    D.creatures = D.creatures.filter((x) => x !== c);
    c.el.remove();
    const r = D.hooks.onKill(c.prey.id);
    D.haul.kills[c.prey.id] = (D.haul.kills[c.prey.id] || 0) + 1;
    if (r) {
      D.haul.gold += r.gold || 0;
      D.haul.field += r.field || 0;
      if (r.meat) D.haul.mats.game_meat = (D.haul.mats.game_meat || 0) + r.meat;
      if (r.pelt) D.haul.mats.pelt = (D.haul.mats.pelt || 0) + r.pelt;
      if (r.loot) D.haul.mats[r.loot] = (D.haul.mats[r.loot] || 0) + 1;
      toast(`${c.prey.glyph} ${c.prey.name} felled! ${r.txt || ''}`);
    }
    updateHaul();
    // Grace: other creatures may have converged before the bout froze the sim —
    // hold encounters until everything is back outside engage range, so the
    // player never gets chain-fought with zero escape frames.
    D.grace = true;
    D.fighting = false;
    startLoop();
  } else {
    // Beaten (or fled) — the delve is over; keep whatever was already banked.
    D.fighting = false;
    endDelve(`driven out by the ${c.prey.name}`, true);
  }
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function drawCreature(c, now) {
  const moving = c.mode !== 'idle';
  const col = moving ? WALK_FRAMES[Math.floor((now + c.phase) / 170) % 4] : 1;
  const key = col + c.row * 10;
  if (key !== c._drawn) {
    c._drawn = key;
    const g = c.cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, c.fw, c.fh);
    g.drawImage(c.img, col * c.fw, c.row * c.fh, c.fw, c.fh, 0, 0, c.fw, c.fh);
  }
}

/** Put a moving standee on the plane: its ground point, its painter's depth, and
 *  the lift of whatever surface it is standing on. `--dvlift` is the same
 *  translateZ the ledge's own top is built with, so feet land exactly on it.
 *  On a deck cell the painter's depth splits by the body's committed level:
 *  the deck's own z sits just above its row (attachTerrain), so a body ON it
 *  must outrank that while a body UNDER it keeps the ordinary standZ. */
function place(el, e) {
  const { x, y } = e;
  el.style.left = (x * TILE) + 'px';
  el.style.top = (y * TILE) + 'px';
  let z = standZ(y);
  const dk = D.model.deckAt(Math.floor(x), Math.floor(y));
  if (dk != null && e.lv != null && e.lv >= dk) z = 10 + (Math.floor(y) + 1) * TILE + 10;
  el.style.zIndex = z;
  el.style.setProperty('--dvlift', liftFor(e).toFixed(1) + 'px');
  /**
   * IN the water, not on it. A standee sorts above the water quad — it has to,
   * or a walker crossing a ford would disappear under it — so the only honest
   * way to sink a body is to stop drawing the part that is under the surface.
   * That is occlusion, which is what water actually does to legs; nothing here
   * moves or invents a pixel.
   *
   * Guarded on the value like every other write in this loop: standing still
   * in a creek must not re-write a class sixty times a second.
   */
  const wet = !!(D.wet && D.wet.size && inWater(x, y));
  if (wet !== e._wet) { e._wet = wet; el.classList.toggle('dv-wading', wet); }
  if (wet) {
    // How far under depends on the BASIN, not on the fact of being wet: a
    // creek cut a step into the meadow takes a body to the chest, a puddle to
    // the shin. Quantised to twentieths and compared before writing — the
    // same discipline the fog dimming keeps, so crossing a ford is a handful
    // of style writes rather than one per frame.
    const keep = Math.round((1 - submergeFor(depthAt(x, y))) * 20) / 20;
    if (keep !== e._keep) { e._keep = keep; el.style.setProperty('--wade-keep', keep); }
  }
}

/**
 * THE WATER MOVES — one quad per wet cell, playing the sheet's three authored
 * frames off a strip.
 *
 * Overhead is the one angle where those frames ARE the animation: you are
 * looking straight down at the surface, so a swap reads exactly as it was
 * drawn to. (The first-person lens sees the same plane nearly edge-on, where
 * a swap is invisible and a scroll is everything — hence its shader. Same
 * fact, two cameras, @see water.js.)
 *
 * Per CELL rather than one clipped canvas over the plane, because water is not
 * always ON the plane: a creek bed is a quad a step down, and its top already
 * sorts per row against everything standing near it (@see the pit pass in
 * attachTerrain). A single flat overlay could never land inside that ordering
 * — it would have to be above every pit top and below every standee at once,
 * and those two ranges overlap. A quad at the cell's own level and the pit's
 * own z-index simply IS in the right place.
 *
 * It also costs nothing per frame. `background-position` on a steps() keyframe
 * is a small repaint the browser schedules itself; the render loop never
 * learns that this map has water in it at all.
 */
function mountWater(field, baked, map) {
  const wet = baked.wet || [];
  if (!wet.length) return;
  /**
   * BUDGETED. Each cell is an element, and a lake is not a puddle. Past the
   * cap the still water already baked into the ground plane (@see paintGround)
   * is what the map wears — a lake that does not ripple, rather than a
   * thousand elements on a phone. Sunken cells keep their quads regardless:
   * the bake has no pixels for them, so without one there is no water at all.
   */
  const still = wet.length > WATER_CELL_CAP;
  if (still) console.info(`delve: ${wet.length} water cells — over the ${WATER_CELL_CAP} cap, so only sunken water animates`);
  waterStripUrl().then((url) => {
    if (!D || D.field !== field) return;          // a portal beat us here
    for (const [x, y] of wet) {
      const lv = baked.model.floorAt(x, y) || 0;
      if (still && lv >= 0) continue;
      const d = document.createElement('div');
      d.className = 'dv-wet';
      // A cell at grade sorts just over the plane; a sunken one just over its
      // own pit top (which is `base - 8`), and both stay well under standZ.
      const z = lv < 0 ? 10 + (y + 1) * TILE - 7 : 2;
      /**
       * A HAIR ABOVE the bed, not level with it. `.delve-field` is a
       * `preserve-3d` context, so two coplanar quads at the same depth are
       * decided by z-index and then by luck — and a sunken water cell sits on
       * exactly the plane its pit top does. Three quarters of a pixel out
       * along the ground's own normal makes the ordering strict instead of
       * lucky, and at this scale it is invisible. (It is also honest: water
       * does lie on top of the bed.)
       */
      d.style.cssText = `left:${x * TILE}px;top:${y * TILE}px;z-index:${z};`
        + `background-image:url(${url});transform:translateZ(${lv * BLOCK_H + 0.75}px);`;
      field.appendChild(d);
    }
  }).catch((e) => console.warn('delve: water strip failed — the still bake stands', e));
}

function render(now) {
  const p = D.player;
  // Player — compositor actor, canvas anchored at the feet.
  D.gfx.tickActor(p.actor, now);
  D.gfx.renderActor(p.cv, p.actor);
  // First composited frame: measure the compositor's empty foot band, then
  // ground every hero-shaped sprite in the scene with it (companions spawn
  // before the measurement exists, so they collect it here).
  if (_heroFootPct == null) groundHeroSprite(p.cv);
  if (_heroFootPct != null && !p.grounded) { p.cv.style.setProperty('--footpct', _heroFootPct.toFixed(2) + '%'); p.grounded = true; }
  place(p.el, p);
  updateXray(); // the walker is placed — fade whatever they are standing behind
  for (const c of D.creatures) {
    drawCreature(c, now);
    place(c.el, c);
  }
  for (const c of D.companions) {
    D.gfx.tickActor(c.actor, now);
    D.gfx.renderActor(c.cv, c.actor);
    if (_heroFootPct != null && !c.grounded) { c.cv.style.setProperty('--footpct', _heroFootPct.toFixed(2) + '%'); c.grounded = true; }
    place(c.el, c);
  }
  // Camera: the innermost translate slides the PLANE (in plane px) so the
  // walker sits at its center, which the rotateX·translateZ·scale chain then
  // presents at the stage's perspective focus — the ranch's applyCamera
  // recipe, made to follow. Lerped for a drifting-crane feel.
  const tx = D.cols * TILE / 2 - p.x * TILE;
  const ty = D.rows * TILE / 2 - p.y * TILE;
  if (D.cam.snap) { D.cam.x = tx; D.cam.y = ty; D.cam.snap = false; }
  else {
    const k = Math.min(1, 8 * ((now - D.last) / 1000 || 0.016));
    D.cam.x += (tx - D.cam.x) * k;
    D.cam.y += (ty - D.cam.y) * k;
  }
  // scale3d, NOT scale. A 2D scale leaves Z alone, so it is not a similarity in
  // 3D — and it sits BETWEEN this plane's rotateX and every standee's counter-
  // rotateX, which means the counter-rotation can no longer cancel the tilt.
  // With scale(1.8) at TILT 52° every standee came out 25% too short and leaning
  // 17° back: characters read as sunk to the shins in the floor, and a "one tile
  // tall" raised block drew barely half a tile. Scaling Z with X and Y makes the
  // two rotations cancel exactly (standees perfectly upright, uniformly scaled)
  // and gives cliff DEPTH and BLOCK_H their authored size in tiles. The ground
  // plane is untouched by the third factor — its points have z = 0 — so framing
  // and perspective are identical either way. (The action arena gets this right
  // by putting its scale outside the rotate; here the pan has to stay inside.)
  D.field.style.transform =
    `rotateX(${TILT}deg) translateZ(-120px) scale3d(${D.zoom},${D.zoom},${D.zoom}) translate(${D.cam.x}px,${D.cam.y}px)`;
}

/** One simulation + render step. Split out of `tick` so a hidden window — which
 *  never fires rAF — can still be driven frame by frame (see __delve.step). */
function stepSim(now) {
  const dt = Math.min(0.08, (now - (D.last || now)) / 1000);
  // A freshly mounted room settles for a beat: the room lives (people potter
  // about) but the walker holds still, so input left over from the doorway
  // can't walk them back through it.
  const settling = now < D.settleUntil;
  // One controller read per frame, kept for this frame only — the edges in it
  // are spent by whoever looks first. Polled OUT here rather than in movePlayer
  // because A-to-work has to keep answering while the walk is frozen.
  D.pad = readPad();
  if (D.pad && !D.ended && !D.fighting && !D.transiting){
    if (D.pad.hit(PAD.A)) beginUse();          // the E / Enter / Space key
    if (D.pad.hit(PAD.SELECT)) swapToFp();     // the HUD's "1st person"
  }
  // `working` freezes the walk the same way a bout does — the work animation
  // owns the actor while it runs.
  if (!D.fighting && !D.transiting && !D.working) {
    if (!settling) movePlayer(dt);
    moveCreatures(dt);
    moveCompanions(dt);
    checkOres();
    checkDoorsAndKeys();
    if (!settling) checkExit();
    if (!settling && !D.ended) checkPortals();
    if (D.grace) {
      // Post-bout grace holds until every creature is back outside engage range.
      if (D.creatures.every((c) => Math.hypot(c.x - D.player.x, c.y - D.player.y) > 0.75 + (c.fw / TILE) * 0.28)) D.grace = false;
    } else if (!D.ended) checkEncounters();
  }
  if (!D || D.ended) return false;
  updateUsePrompt();
  render(now);
  D.last = now;
  return true;
}

function tick(now) {
  if (!D || D.ended) return;
  if (!screenActive()) { D.raf = 0; return; } // a bout borrowed the screen — resumed on return
  if (!stepSim(now)) return;
  D.raf = requestAnimationFrame(tick);
}

function startLoop() {
  if (!D || D.raf) return;
  D.last = 0;
  D.cam.snap = true;
  D.raf = requestAnimationFrame(tick);
}

// ---------------------------------------------------------------------------
// HUD, toasts, endings
// ---------------------------------------------------------------------------

function toast(txt) {
  const box = D.host.querySelector('.delve-toasts');
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'dv-toast';
  el.textContent = txt;
  box.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

function updateHaul() {
  const el = D.host.querySelector('.dv-haul');
  if (!el) return;
  const kills = Object.values(D.haul.kills).reduce((s, n) => s + n, 0);
  el.textContent = `☠ ${kills} · ${D.haul.gold}g`;
}

function leave() { if (D && !D.fighting && !D.ended) endDelve('called it a day'); }

function endDelve(reason, beaten = false) {
  if (!D || D.ended) return;
  D.ended = true;
  if (D.raf) cancelAnimationFrame(D.raf);
  unwireInput();
  const h = D.haul;
  const killLines = Object.keys(h.kills).map((pid) => {
    const p = preyById(pid);
    return `<div class="ds-line">${p.glyph} ${p.name} × ${h.kills[pid]}</div>`;
  }).join('') || '<div class="ds-line dim">No kills — the ground keeps its secrets.</div>';
  const matLines = Object.keys(h.mats).map((m) => `<div class="ds-line">▪ ${m.replace(/_/g, ' ')} × ${h.mats[m]}</div>`).join('');
  D.host.insertAdjacentHTML('beforeend', `
    <div class="delve-summary">
      <div class="ds-card">
        <div class="ds-title">${beaten ? 'Driven out' : 'Back to daylight'}</div>
        <div class="ds-sub">${D.member.name.split(' ')[0]} ${reason}.</div>
        ${killLines}${matLines}
        ${h.gold ? `<div class="ds-line">+${h.gold} gold</div>` : ''}
        ${h.field ? `<div class="ds-line">+${h.field} field insight</div>` : ''}
        <button class="dv-close" onclick="__delve.close()">Return to the Guild</button>
      </div>
    </div>`);
}

function close() {
  if (!D) return;
  const hooks = D.hooks, summary = D.haul;
  if (D.joyEl) D.joyEl.remove();
  D.host.innerHTML = '';
  D = null;
  hooks.onEnd(summary);
}

/**
 * End the walk at once, with no summary card, because a workable prop is handing
 * the player to another screen — the Great Hall's estate plans open the Build
 * tab, and you cannot stand in a room and rearrange the estate at the same time.
 * Tears down in `endDelve` order (park the loop, unwire input) before releasing
 * the session, then hands back through `onEnd` like any other ending.
 */
export function exitDelve() {
  if (!D) return;
  const hooks = D.hooks, summary = D.haul;
  D.ended = true;
  if (D.raf) cancelAnimationFrame(D.raf);
  unwireInput();
  if (D.joyEl) D.joyEl.remove();
  D.host.innerHTML = '';
  D = null;
  hooks.onEnd(summary);
}

/**
 * Hand this walk to the first-person view, mid-stride. The carry is the whole
 * session — where you stand, which map you are in, the doors behind you, the
 * veins worked and the haul so far — so the swap is a change of CAMERA, not a
 * re-entry: hall's swapView opens the twin on the same hooks and then calls
 * closeDelveSilent to retire this one without paying out.
 */
function swapToFp() {
  if (!D || D.ended || D.fighting || D.working || D.transiting) return;
  const hooks = D.hooks;
  if (!hooks.swapView) return;
  D.transiting = true;   // freeze the sim while the other view bakes
  const carry = {
    swap: true, mapId: D.map.id, at: [D.player.x, D.player.y], lev: D.player.lv,
    opened: [...D.opened], keysTaken: [...D.keysTaken], keyCount: D.keyCount,
    // The FACING crosses too — the lenses are 1:1 by decree, so the crawler
    // must open looking where the walker was looking, not down the openest run.
    dir: Math.round((((D.player.actor.facing * 180 / Math.PI) % 360) + 360) % 360 / 45) % 8,
    stack: D.stack.slice(), mined: [...D.mined], haul: D.haul,
  };
  hooks.swapView('fp', carry).then((ok) => { if (!ok && D) D.transiting = false; });
}

/** Retire the session with no ending — the view swap took it over. Everything
 *  endDelve tears down, nothing it pays out, and no onEnd (the walk goes on). */
export function closeDelveSilent() {
  if (!D) return;
  if (D.raf) cancelAnimationFrame(D.raf);
  unwireInput();
  D.host.innerHTML = '';
  D = null;
}

window.__delve = { leave, close, use: beginUse, view: swapToFp };

// Dev probe (headless verification: a hidden window never fires rAF — step the
// sim by hand). Mirrors rooms.js __roomDebug/__roomStep.
if (typeof window !== 'undefined') {
  window.__delveDebug = () => D && ({
    map: D.map && D.map.id, working: D.working, fighting: D.fighting,
    player: { x: +D.player.x.toFixed(3), y: +D.player.y.toFixed(3), anim: D.player.actor.anim.name, facing: +D.player.actor.facing.toFixed(2), gear: D.player.actor.gear },
    useNear: D.useNear && D.useNear.id, uses: D.uses.map((u) => ({ id: u.id, x: u.x, y: u.y })),
    solids: D.solids.length, ores: D.ores.length,
  });
  // Walk `steps` frames of `ms`, optionally holding keys ('w','a','s','d').
  window.__delveStep = (steps = 1, keys = '', ms = 16) => {
    if (!D || D.ended) return null;
    for (const k of keys) D.keys[k] = true;
    for (let i = 0; i < steps; i++) {
      if (!D || D.ended) break;
      stepSim((D.last || performance.now()) + ms);
    }
    for (const k of keys) D.keys[k] = false;
    return window.__delveDebug();
  };
}
