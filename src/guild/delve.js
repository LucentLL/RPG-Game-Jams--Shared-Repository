/**
 * @file The Delve — walk a guild member through a 2.5D explorable locale.
 *
 * Opened from the Wilds room (hall.js). One member marches in on foot: WASD /
 * arrows (or the touch stick) drive them across a baked tile map in the
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
import { THEMES, DECALS, ORE_KINDS, mapForLocale, validateMap } from './delve-maps.js';
import { artSprite } from './art.js';

const TILE = 48;
const TILT = 52;               // plane tilt in degrees — matches the ranch's diorama
const DEPTH = 96;              // cliff drop in px (2 tiles of face art)
const BLOCK_H = 48;            // raised-block height in px (1 tile of face art)
const PLAYER_SPEED = 3.4;      // tiles/sec — brisk but catchable by nothing
const BODY_R = 0.28;           // collision half-width around the feet point
const WALK_FRAMES = [0, 1, 2, 1];

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

const _imgCache = {};
function loadImg(url) {
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

const BLOCKING = { '#': 1, o: 1, r: 1, t: 1, m: 1, B: 1, b: 1, f: 1 };
// Well-mixed 2D hash — naive xor-of-primes checkerboards on % 2 variant picks.
const hash2 = (x, y) => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = ((h ^ (h >>> 13)) * 1274126177) | 0;
  return (h ^ (h >>> 16)) >>> 0;
};

/** Where each sheet key lives. THEMES and DECALS name sheets by these keys. */
const SHEET_URLS = {
  cliffs: TILES_BASE + 'cliffs.png',
  stairs: TILES_BASE + 'stairs.png',
  ores: TILES_BASE + 'ores.png',
  rocks: TILES_BASE + 'rocks.png',
  rails: TILES_BASE + 'rails.png',
  floors: TILES_BASE + 'floors.png',
  stonewall: TILES_BASE + 'stonewall.png',
  woodwall: TILES_BASE + 'woodwall.png',
  shelves: ART_BASE + 'bookshelf_3x.png',
  mansion: ART_BASE + 'mansion_3x.png',
};

/** Load exactly what this map needs: the cliff kit (rim art is always cut from
 *  it), the theme's floor and wall sheets, and a prop sheet only if the grid
 *  actually uses that prop. Interiors never pay for the mine's rails. */
async function loadSheets(map, theme) {
  const keys = new Set(['cliffs', theme.sheet, theme.rimSheet, theme.walls && theme.walls.sheet].filter(Boolean));
  const chars = map.grid.join('');
  if (chars.includes('s')) keys.add('stairs');
  if (chars.includes('o')) keys.add('ores');
  if (/[rt]/.test(chars)) keys.add('rocks');
  if (/[=m]/.test(chars)) keys.add('rails');
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
 */
function paintGround(g, grid, theme, sheets) {
  const { rows, cols, isFloor, isVoid } = gridFns(grid);
  const fillImg = sheets[theme.sheet || 'cliffs'];
  const rimImg = sheets[theme.rimSheet || theme.sheet || 'cliffs'];
  const src = theme.src || TILE;
  const tile = (t, dx, dy) => g.drawImage(fillImg, t[0] * src, t[1] * src, src, src, dx * TILE, dy * TILE, TILE, TILE);
  // A sub-rect of a rim tile, drawn at the same offset inside the destination cell.
  const part = (t, ox, oy, w, h, dx, dy) =>
    g.drawImage(rimImg, t[0] * TILE + ox, t[1] * TILE + oy, w, h, dx * TILE + ox, dy * TILE + oy, w, h);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!isFloor(x, y)) continue;
      tile(theme.fill[hash2(x, y) % theme.fill.length], x, y);
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
  const faceS = texCv(TILE, DEPTH, (cg) => { sheetTile(cg, theme.faceTop.m, 0, 0); sheetTile(cg, theme.faceBot.m, 0, TILE); });
  const faceSideE = texCv(DEPTH, TILE, (cg) => { cg.translate(0, TILE); cg.rotate(-Math.PI / 2); cg.drawImage(faceS, 0, 0); });
  const faceSideW = texCv(DEPTH, TILE, (cg) => { cg.translate(DEPTH, 0); cg.scale(-1, 1); cg.drawImage(faceSideE, 0, 0); });

  let block;
  if (theme.walls) {
    const w = sheets[theme.walls.sheet];
    const H = theme.wallH || 96;
    // A rect either STRETCHES to fill the texture (a whole shelf face) or TILES
    // at 48px cells (a 16px brick/plank that must repeat, not smear).
    const cut = (rect, dw, dh) => texCv(dw, dh, (cg) => {
      if (!theme.walls.tileFill) { cg.drawImage(w, rect[0], rect[1], rect[2], rect[3], 0, 0, dw, dh); return; }
      for (let ty = 0; ty < Math.ceil(dh / TILE); ty++) {
        for (let tx = 0; tx < Math.ceil(dw / TILE); tx++) {
          cg.drawImage(w, rect[0], rect[1], rect[2], rect[3], tx * TILE, ty * TILE, TILE, TILE);
        }
      }
    });
    const tall = cut(theme.walls.tall, TILE, H);
    const low = cut(theme.walls.low, TILE, BLOCK_H);
    const top = cut(theme.walls.crown, TILE, TILE);          // crown wood, stretched — the shelf's top
    block = {
      B: { face: tall.toDataURL(), top: top.toDataURL(), h: H },
      b: { face: low.toDataURL(), top: top.toDataURL(), h: BLOCK_H },
    };
  } else {
    const bFace = texCv(TILE, BLOCK_H, (cg) => sheetTile(cg, theme.faceTop.m, 0, 0));
    const bTop = texCv(TILE, TILE, (cg) => {
      sheetTile(cg, theme.fill[0], 0, 0);
      const strip = (t, ox, oy, w2, h2) => cg.drawImage(cliffs, t[0] * TILE + ox, t[1] * TILE + oy, w2, h2, ox, oy, w2, h2);
      strip(theme.rim.n, 0, 0, TILE, 24); strip(theme.rim.s, 0, 24, TILE, 24);
      strip(theme.rim.w, 0, 0, 24, TILE); strip(theme.rim.e, 24, 0, 24, TILE);
      strip(theme.rim.nw, 0, 0, 24, 24); strip(theme.rim.ne, 24, 0, 24, 24);
      strip(theme.rim.sw, 0, 24, 24, 24); strip(theme.rim.se, 24, 24, 24, 24);
    });
    const one = { face: bFace.toDataURL(), top: bTop.toDataURL(), h: BLOCK_H };
    block = { B: one, b: one };
  }
  return {
    faceS: faceS.toDataURL(), faceSideE: faceSideE.toDataURL(), faceSideW: faceSideW.toDataURL(),
    block,
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
function extractGeometry(grid) {
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
      if (ch === 'B' || ch === 'b') blocks.push({ x, y, kind: ch });
    }
  }
  return { faces, blocks };
}

/**
 * Bake a delve map: ground plane data-URI, passability, wall textures and
 * geometry, plus the delve's flat floor decals (stair mouths, rails).
 */
async function bakeMap(map, theme) {
  const sheets = await loadSheets(map, theme);
  const { rows, cols, at } = gridFns(map.grid);
  const cv = document.createElement('canvas');
  cv.width = cols * TILE; cv.height = rows * TILE;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  paintGround(g, map.grid, theme, sheets);

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
    }
  }

  const pass = [];
  for (let y = 0; y < rows; y++) {
    pass.push([]);
    for (let x = 0; x < cols; x++) pass[y].push(!BLOCKING[at(x, y)]);
  }
  return {
    url: cv.toDataURL('image/png'), pass, cols, rows, sheets,
    voidColor: sampleVoidColor(sheets.cliffs, theme),
    tex: cutWallTex(sheets, theme),
    ...extractGeometry(map.grid),
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
async function prepMap(mapId) {
  const map = mapForLocale(mapId);
  if (!map) throw new Error('delve: no map ' + mapId);
  validateMap(map);
  const theme = THEMES[map.theme];
  const baked = await bakeMap(map, theme);
  const spawns = [];
  for (const s of (map.spawns || [])) {
    const prey = preyById(s.prey);
    if (!prey) continue;
    try { spawns.push({ prey, s, img: await loadImg(ART_BASE + prey.art + '.png') }); }
    catch (e) { console.warn('delve: creature sheet missing for', s.prey, e); }
  }
  return { map, theme, baked, spawns };
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
  const stage = D.host.querySelector('.delve-stage');
  stage.style.background = baked.voidColor;
  const field = document.createElement('div');
  field.className = 'delve-field';
  field.style.cssText = `width:${W}px;height:${H}px;margin-left:${-W / 2}px;margin-top:${-H / 2}px;background-image:url(${baked.url})`;
  stage.innerHTML = '';
  stage.appendChild(field);

  D.map = map; D.theme = theme; D.field = field;
  D.pass = baked.pass; D.cols = baked.cols; D.rows = baked.rows;
  D.creatures = []; D.ores = [];
  D.exit = null; D.exitArmed = false;
  D.portals = []; D.portalArmed = false;
  D.cam.snap = true;

  attachTerrain(field, baked, { zMode: 'y' });

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
  D.player = { actor, cv: pcv, el: pWrap, x: at[0], y: at[1], moving: false, grounded: _heroFootPct != null };

  // --- exits, portals and interactables from the grid ---
  for (let y = 0; y < D.rows; y++) {
    for (let x = 0; x < D.cols; x++) {
      const ch = map.grid[y][x];
      if (ch === 's' || ch === 'w' || ch === 'd') D.exit = { x: x + 0.5, y: y + 0.5 };
      if (ch === 'w') addProp(artSprite('wagon', 'dv-wagon'), x + 0.5, y + 1, 82);
      else if (ch === 't' && map.theme === 'meadow') addProp(artSprite('treeTall', 'dv-tree'), x + 0.5, y + 1, 86);
      else if (ch === 't') addPropCanvas('stalag', baked.sheets, x + 0.5, y + 0.97);
      else if (ch === 'r') addPropCanvas(theme.grayProps ? 'boulderGray' : 'boulder', baked.sheets, x + 0.5, y + 0.97);
      else if (ch === 'm') addPropCanvas('cart', baked.sheets, x + 0.5, y + 1);
      else if (ch === 'o') addOre(x, y, baked.sheets.ores);
    }
  }
  // Authored furnishings — upright art.js standees (beds, anvils, counters…).
  for (const p of (map.props || [])) addProp(artSprite(p.art, 'dv-furn'), p.x, p.y, p.w || 48);
  // Doors to other maps (the wall gap is the doorway; this is just the trigger).
  for (const p of (map.portals || [])) D.portals.push({ x: p.x, y: p.y, to: p.to, at: p.at });

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
  if (title) title.textContent = `${D.hooks.locale.glyph} ${map.name || D.hooks.locale.name}`;
}

export async function openDelve(localeId, member, hooks) {
  const gfx = window.__ranchGfx;
  if (!mapForLocale(localeId) || !member || !gfx || D || opening) return false;
  opening = true;
  try {
    const prep = await prepMap(localeId);
    // The bake took real time (network, on a first load). Re-validate the
    // launch context: if the guild screen is no longer up — a played bout took
    // the screen, or the player left for the title — opening now would steal
    // the screen mid-scene and orphan its promise. Walk away instead; hall
    // hasn't charged any stamina yet.
    const guildUp = document.getElementById('guildScreen');
    if (D || !guildUp || !guildUp.classList.contains('active')) return false;

    const host = document.getElementById('delveScreen');
    host.style.setProperty('--dvtilt', TILT + 'deg');
    host.innerHTML = `
    <div class="delve-stage"></div>
    <div class="delve-hud">
      <button class="dv-leave" onclick="__delve.leave()">⬅ Leave</button>
      <span class="dv-title"></span>
      <span class="dv-haul"></span>
    </div>
    <div class="delve-toasts"></div>`;

    D = {
      map: null, theme: null, hooks, member, gfx, field: null, host,
      pass: null, cols: 0, rows: 0,
      keys: {}, joy: null, joyEl: null,
      cam: { x: 0, y: 0, snap: true }, zoom: window.innerHeight < 520 ? 1.4 : 1.8,
      last: 0, raf: 0, ended: false, fighting: false, grace: false, transiting: false,
      haul: { kills: {}, gold: 0, mats: {}, field: 0, bouts: 0 },
      player: null, creatures: [], ores: [], portals: [], companions: [],
      exit: null, exitArmed: false, portalArmed: false,
    };
    mountScene(prep, null);

    wireInput();
    updateHaul();
    showScreen('delveScreen');
    startLoop();
    toast(`${member.name.split(' ')[0]} enters ${prep.map.name || hooks.locale.name}.`);
    return true;
  } finally {
    opening = false;
  }
}

/** Walk through a door into another map, keeping the session alive. */
async function usePortal(portal) {
  if (!D || D.transiting || D.ended) return;
  D.transiting = true;
  if (D.raf) { cancelAnimationFrame(D.raf); D.raf = 0; }
  try {
    const prep = await prepMap(portal.to);
    if (!D || D.ended) return;
    mountScene(prep, portal.at);
    toast(`${prep.map.name || 'Onward'}`);
    startLoop();
  } catch (e) {
    console.warn('delve: door failed', e);
    if (D) toast('That door is stuck.');
  } finally {
    if (D) D.transiting = false;
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
  };
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
  const bKind = new Map(baked.blocks.map((b) => [b.x + ',' + b.y, b.kind]));
  const hOf = (x, y) => {
    const k = bKind.get(x + ',' + y);
    return k ? (tex.block[k] || tex.block.B).h : 0;
  };
  for (const b of baked.blocks) {
    const K = tex.block[b.kind] || tex.block.B;
    const h = K.h, hT = h / TILE; // height in px and in tile units
    // Painter's depth = the block's NEAR (south) edge, kept strictly BELOW a
    // character standing at that edge (whose z is 10 + y*TILE). A positive
    // bonus here is what made a shelf's top surface paint over the head of
    // someone standing in front of it — reading as "walked into the bookcase".
    const base = 10 + (b.y + 1) * TILE;
    const zTop = zMode === 'under' ? 2 : base - 6;
    const zFace = zMode === 'under' ? 1 : base - 2;
    el('dv-block-top', `left:${b.x / cols * 100}%;top:${b.y / rows * 100}%;width:${100 / cols}%;height:${100 / rows}%;` +
      `background-image:url(${K.top});background-size:100% 100%;transform:translateZ(${h}px);z-index:${zTop};`);
    if (hOf(b.x, b.y + 1) < h) { // a block to the south hides this face
      el('dv-face', `left:${b.x / cols * 100}%;top:${(b.y + 1) / rows * 100}%;width:${100 / cols}%;height:${hT / rows * 100}%;` +
        `background-image:url(${K.face});background-size:100% 100%;` +
        `transform-origin:50% 0;transform:translateZ(${h}px) rotateX(-90deg);z-index:${zFace};`);
    }
    // NO east/west end caps on blocks. The camera only tilts about X, so those
    // planes are edge-on slivers that contribute almost nothing — but they are
    // tall, and any z-index that made them visible also made them swallow
    // members standing beside a shelf run. Cliff faces keep theirs: they ring
    // wide chasms where perspective flares them into view and nobody stands.
  }
}

function addProp(html, x, y, w) {
  const el = document.createElement('div');
  el.className = 'dv-prop';
  el.innerHTML = `<div class="dv-shadow"></div><div class="dv-up">${html}</div>`;
  el.style.left = (x * TILE) + 'px';
  el.style.top = (y * TILE) + 'px';
  el.style.width = w + 'px';
  el.style.zIndex = 10 + Math.round(y * TILE);
  D.field.appendChild(el);
}

/** An upright standee cut from a prop sheet (boulders, stalagmites, the cart). */
function addPropCanvas(decalName, sheets, x, y) {
  const d = DECALS[decalName];
  const cv = document.createElement('canvas');
  cv.width = d.w; cv.height = d.h;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(sheets[d.sheet], d.x, d.y, d.w, d.h, 0, 0, d.w, d.h);
  const el = document.createElement('div');
  el.className = 'dv-prop';
  el.innerHTML = '<div class="dv-shadow"></div><div class="dv-up"></div>';
  el.querySelector('.dv-up').appendChild(cv);
  el.style.left = (x * TILE) + 'px';
  el.style.top = (y * TILE) + 'px';
  el.style.width = d.w + 'px';
  el.style.zIndex = 10 + Math.round(y * TILE);
  D.field.appendChild(el);
}

function addOre(x, y, oresImg) {
  const kinds = Object.keys(ORE_KINDS);
  const kind = kinds[hash2(x, y) % kinds.length];
  const d = DECALS[ORE_KINDS[kind].decal];
  const cv = document.createElement('canvas');
  cv.width = d.w; cv.height = d.h;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(oresImg, d.x, d.y, d.w, d.h, 0, 0, d.w, d.h);
  const el = document.createElement('div');
  el.className = 'dv-ore';
  el.innerHTML = '<div class="dv-shadow"></div><div class="dv-up"></div>';
  el.querySelector('.dv-up').appendChild(cv);
  el.style.left = ((x + 0.5) * TILE) + 'px';
  el.style.top = ((y + 1) * TILE - 2) + 'px';
  el.style.zIndex = 10 + Math.round((y + 1) * TILE) - 6;
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
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(k)) {
      D.keys[k] = true;
      e.preventDefault();
    }
  };
  D.onKeyUp = (e) => { if (D) D.keys[e.key.toLowerCase()] = false; };
  window.addEventListener('keydown', D.onKeyDown);
  window.addEventListener('keyup', D.onKeyUp);

  // Touch stick — appears under the thumb anywhere on the lower-left half.
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
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
}

function unwireInput() {
  window.removeEventListener('keydown', D.onKeyDown);
  window.removeEventListener('keyup', D.onKeyUp);
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

const passAt = (x, y) => {
  const tx = Math.floor(x), ty = Math.floor(y);
  return tx >= 0 && ty >= 0 && tx < D.cols && ty < D.rows && D.pass[ty][tx];
};
const canStand = (x, y) =>
  passAt(x - BODY_R, y - BODY_R) && passAt(x + BODY_R, y - BODY_R) &&
  passAt(x - BODY_R, y + BODY_R) && passAt(x + BODY_R, y + BODY_R);

/** Axis-separated move: slide along walls instead of sticking. Returns moved? */
function tryMove(e, dx, dy) {
  let moved = false;
  if (dx && canStand(e.x + dx, e.y)) { e.x += dx; moved = true; }
  if (dy && canStand(e.x, e.y + dy)) { e.y += dy; moved = true; }
  return moved;
}

function movePlayer(dt) {
  const p = D.player;
  let ux = (D.keys.d || D.keys.arrowright ? 1 : 0) - (D.keys.a || D.keys.arrowleft ? 1 : 0);
  let uy = (D.keys.s || D.keys.arrowdown ? 1 : 0) - (D.keys.w || D.keys.arrowup ? 1 : 0);
  if (D.joy) { ux += D.joy.x; uy += D.joy.y; }
  const m = Math.hypot(ux, uy);
  if (m > 0.01) {
    ux /= Math.max(1, m); uy /= Math.max(1, m);
    tryMove(p, ux * PLAYER_SPEED * dt, uy * PLAYER_SPEED * dt);
    p.actor.facing = Math.atan2(ux, -uy);
    if (!p.moving) { D.gfx.setAnim(p.actor, 'move'); p.moving = true; }
  } else if (p.moving) {
    D.gfx.setAnim(p.actor, 'idle'); p.moving = false;
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
    } else if (rank >= 3 && dist < 3.4) {
      // Predators and the restless dead close in.
      c.mode = 'chase'; c.tx = p.x; c.ty = p.y;
      speed = rank >= 4 ? 1.7 : 1.35;
    } else if (c.mode === 'chase' || c.mode === 'flee') {
      c.mode = 'idle'; c.t = 0.6;
    }
    if (c.mode === 'idle') {
      c.t -= dt;
      if (c.t <= 0) {
        // Wander a fresh patch near home.
        for (let i = 0; i < 6; i++) {
          const nx = c.home.x + (Math.random() * 6 - 3), ny = c.home.y + (Math.random() * 6 - 3);
          if (canStand(nx, ny)) { c.tx = nx; c.ty = ny; c.mode = 'walk'; break; }
        }
        if (c.mode !== 'walk') c.t = 1.5;
      }
      continue;
    }
    const dx = c.tx - c.x, dy = c.ty - c.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.15) { c.mode = 'idle'; c.t = 1 + Math.random() * 2.2; continue; }
    const step = Math.min(d, speed * dt);
    const moved = tryMove(c, dx / d * step, dy / d * step);
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
    const step = Math.min(d, 1.15 * dt);
    if (!tryMove(c, dx / d * step, dy / d * step)) { c.mode = 'idle'; c.t = 1 + Math.random() * 2; continue; }
    c.actor.facing = Math.atan2(dx / d, -dy / d);
    if (!c.moving) { D.gfx.setAnim(c.actor, 'move'); c.moving = true; }
  }
}

function checkOres() {
  const p = D.player;
  for (let i = D.ores.length - 1; i >= 0; i--) {
    const o = D.ores[i];
    if (Math.hypot(o.x + 0.5 - p.x, o.y + 0.5 - p.y) < 0.95) {
      D.ores.splice(i, 1);
      o.el.remove();
      D.pass[o.y][o.x] = true;
      const kind = ORE_KINDS[o.kind];
      const r = D.hooks.onOre(o.kind);
      D.haul.gold += kind.gold;
      if (kind.mat) D.haul.mats[kind.mat] = (D.haul.mats[kind.mat] || 0) + 1;
      updateHaul();
      toast(r && r.txt ? r.txt : `⛏ ${kind.name} · +${kind.gold}g`);
    }
  }
}

function checkExit() {
  if (!D.exit) return;
  const p = D.player;
  const d = Math.hypot(D.exit.x - p.x, D.exit.y - p.y);
  // The entry point sits beside the way out — arm the exit only after the
  // walker has actually stepped clear of it, so one stray press at spawn
  // doesn't instantly end the delve.
  if (!D.exitArmed) { if (d > 1.35) D.exitArmed = true; return; }
  if (d < 0.8) endDelve('walked out with the haul');
}

/** Doors to other maps — armed the same way, so arriving in a room doesn't
 *  immediately bounce the walker back through the door they came in by. */
function checkPortals() {
  if (!D.portals.length) return;
  const p = D.player;
  const near = (q) => Math.hypot(q.x - p.x, q.y - p.y);
  if (!D.portalArmed) {
    if (D.portals.every((q) => near(q) > 1.35)) D.portalArmed = true;
    return;
  }
  for (const q of D.portals) if (near(q) < 0.8) { usePortal(q); return; }
}

function checkEncounters() {
  const p = D.player;
  for (const c of D.creatures) {
    const engageR = 0.5 + (c.fw / TILE) * 0.28;
    if (Math.hypot(c.x - p.x, c.y - p.y) < engageR) { engage(c); return; }
  }
}

async function engage(c) {
  if (D.fighting || D.ended) return;
  D.fighting = true;
  D.gfx.setAnim(D.player.actor, 'idle'); D.player.moving = false;
  D.keys = {}; D.joy = null;
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
  p.el.style.left = (p.x * TILE) + 'px';
  p.el.style.top = (p.y * TILE) + 'px';
  p.el.style.zIndex = 10 + Math.round(p.y * TILE);
  for (const c of D.creatures) {
    drawCreature(c, now);
    c.el.style.left = (c.x * TILE) + 'px';
    c.el.style.top = (c.y * TILE) + 'px';
    c.el.style.zIndex = 10 + Math.round(c.y * TILE);
  }
  for (const c of D.companions) {
    D.gfx.tickActor(c.actor, now);
    D.gfx.renderActor(c.cv, c.actor);
    if (_heroFootPct != null && !c.grounded) { c.cv.style.setProperty('--footpct', _heroFootPct.toFixed(2) + '%'); c.grounded = true; }
    c.el.style.left = (c.x * TILE) + 'px';
    c.el.style.top = (c.y * TILE) + 'px';
    c.el.style.zIndex = 10 + Math.round(c.y * TILE);
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
  D.field.style.transform =
    `rotateX(${TILT}deg) translateZ(-120px) scale(${D.zoom}) translate(${D.cam.x}px,${D.cam.y}px)`;
}

function tick(now) {
  if (!D || D.ended) return;
  if (!screenActive()) { D.raf = 0; return; } // a bout borrowed the screen — resumed on return
  const dt = Math.min(0.08, (now - (D.last || now)) / 1000);
  if (!D.fighting && !D.transiting) {
    movePlayer(dt);
    moveCreatures(dt);
    moveCompanions(dt);
    checkOres();
    checkExit();
    if (!D.ended) checkPortals();
    if (D.grace) {
      // Post-bout grace holds until every creature is back outside engage range.
      if (D.creatures.every((c) => Math.hypot(c.x - D.player.x, c.y - D.player.y) > 0.75 + (c.fw / TILE) * 0.28)) D.grace = false;
    } else if (!D.ended) checkEncounters();
  }
  if (!D || D.ended) return;
  render(now);
  D.last = now;
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
        <div class="ds-title">${beaten ? '🩸 Driven out' : '🏕 Back to daylight'}</div>
        <div class="ds-sub">${D.member.name.split(' ')[0]} ${reason}.</div>
        ${killLines}${matLines}
        ${h.gold ? `<div class="ds-line">🪙 +${h.gold} gold</div>` : ''}
        ${h.field ? `<div class="ds-line">📜 +${h.field} field insight</div>` : ''}
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

window.__delve = { leave, close };
