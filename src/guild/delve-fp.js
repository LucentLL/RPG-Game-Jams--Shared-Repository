/**
 * @file The Delve in FIRST PERSON — the same maps, stood inside instead of over.
 *
 * A PARALLEL MODE, not a replacement. It reads the very same ASCII charts
 * delve.js walks (delve-maps.js), takes the very same hooks object — locale,
 * fight, onKill, onOre, onEnd — and pays the same spoils through the same battle
 * bridge. hall.js can open either opener with one identical call, which is what
 * makes this a second VIEW of the delve rather than a second delve.
 *
 * The renderer is the top-down one turned to face the wall. delve.js already
 * proved the hard part: textured quads folded in real CSS 3D under a perspective,
 * backfaces hidden, painter's order by depth. A corridor is that machinery aimed
 * forward — wall panels at rotateY(±90°), a floor and a ceiling at rotateX(±90°),
 * and the WORLD counter-transformed about the walker instead of a camera moving
 * through it.
 *
 * Movement is grid-locked with 90° turns (Wizardry / Etrian, which is what a
 * handheld crawler is), but interpolated, so a step reads as a stride rather than
 * a jump cut. Geometry is rebuilt only when the walker changes CELL — never per
 * frame — so the loop does nothing but move a transform and a few billboards.
 *
 * Deliberately unhandled: `regions` (the campus's per-room themes). The estate is
 * a place you look at from above; the delve is a place you are inside.
 */
import { ART_BASE } from '../config/assets.js';
import { THEMES, DECALS, ORE_KINDS, oreKindAt, mapForLocale, validateMap } from './delve-maps.js';
import { preyById } from './locales.js';
import { loadImg, SHEET_URLS } from './delve.js';
import { ART, artSprite, gearIcon, PICK_ICON } from './art.js';

/**
 * World scale. These look arbitrary and are not: what a surface MEASURES on
 * screen is `size · d/(d + distance)`, so the apparent size of the dungeon is
 * set by the ratio of the tile to the perspective distance, while the FIELD OF
 * VIEW is set by that distance against the stage height. Both have to be chosen.
 *
 * d = 470 gives ~75° vertical on a 720px stage — a crawler's lens, not a
 * fisheye. A tile of 900 then puts the wall you are facing (half a tile off the
 * eye) at ~90% of the screen and a wall three cells out at ~26%, which is the
 * falloff a corridor needs to read as depth. The first cut used a 64px tile
 * against the same lens and drew that same far wall 39px tall on a 1280px
 * screen — geometrically perfect and completely unreadable.
 */
const T = 900;           // world px per tile
const WALL_H = 1260;     // full wall height — 1.4 tiles reads best
const LOW_H = 560;       // 'b' — waist-high, seen over
const EYE = 690;         // eye height above the floor
const STEP_PX = 430;     // one level of ledge, in world px
const STEP_MS = 200, TURN_MS = 160;
const VIEW_R = 8;        // tiles of geometry built around the walker
const REACH = 0.75;      // how close a creature must be to engage

/**
 * DEPTH. Without it the far end of the map is drawn as brightly as the wall you
 * are touching: the corridor reads flat, every surface in the chart is painted
 * at once, and the fill cost is the whole map every frame. The vignette darkens
 * the screen's EDGES, which is not the same thing and never was.
 *
 * Fog is a fraction of the way to FOG_RGB, by distance in tiles. Past FOG_CULL
 * a surface is indistinguishable from the stage's own background, so it is not
 * emitted at all — which is the draw distance, arrived at honestly rather than
 * as a hard circle you can see the edge of.
 */
const FOG_NEAR = 1.4, FOG_FAR = 6.4, FOG_CULL = 0.97;
/** The dark itself. Matches #delveFpScreen's own background, so a surface that
 *  has faded out entirely and one that was never drawn are the same colour. */
const fogRgba = (a) => `rgba(6,6,10,${a.toFixed(3)})`;

/**
 * How tall a creature STANDS, in world px, by rank — the one number that
 * decides whether the delve is inhabited or infested with specks.
 *
 * The old cut scaled the sheet frame by a flat 1.9, which made an Old Delver
 * (a 108px frame) 205px tall in a world whose ceiling is 1260 and whose eye is
 * at 690: a human skeleton came up to your ankle, and at two and a half tiles
 * measured 35px on a 720px stage. Sizing by rank instead of by sheet means the
 * art's own resolution stops deciding how big the monster is. 760 is your own
 * height (eye 690, so the top of your head is near there); a Slime Sovereign
 * at 1080 fills the corridor to the ceiling, which is what a sovereign is for.
 */
const CREATURE_H = { 1: 320, 2: 470, 3: 760, 4: 900, 5: 1080 };
/**
 * Standing scenery, in world px tall. Sized to the fact that in FIRST PERSON a
 * prop blocks its WHOLE cell (blocked() consults PROP), where the top-down walk
 * only blocks the shallow slice its art rests on — so a boulder here really is
 * the width of the passage, and drawing it knee-high would be a lie about what
 * you just walked into. Everything stays under WALL_H so nothing pierces the roof.
 */
const DECOR_H = { boulder: 700, boulderGray: 700, stalagTall: 1100, cart: 780, tree: 1150 };
/** One swing, and how far in front of you it reaches (tiles). */
const SWING_MS = 380, SWING_REACH = 1.9, SWING_CONE = 0.3;

/** Cells that are a full wall you cannot see over. 'o' is an ore face — a wall
 *  made of the thing you want, which is why you mine it by walking into it. */
const WALL = { '#': 1, B: 1, F: 1, o: 1 };
/** Waist-high: blocks the step, does not block the view. */
const LOW = { b: 1 };
/** Standing props — the floor stays open under them and they draw as billboards. */
const PROP = { r: 1, t: 1, m: 1, f: 1 };
/** Ways out of the map entirely. */
const EXIT = { s: 1, w: 1, d: 1 };

/** @type {?Object} the live session (null when no first-person delve is running) */
let F = null;
let opening = false;
/** Is the first-person delve open (or mid-open)? hall.js gates on this. */
export function isDelveFpOpen() { return !!F || opening; }

// ---------------------------------------------------------------------------
// Screen plumbing
// ---------------------------------------------------------------------------

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}
const screenActive = () => {
  const el = document.getElementById('delveFpScreen');
  return !!el && el.classList.contains('active');
};

// ---------------------------------------------------------------------------
// Textures — one panel per surface, cut from the theme the map already names
// ---------------------------------------------------------------------------

/**
 * Draw a source rect onto a canvas OF THE SOURCE'S OWN SIZE and hand back a
 * data URI. `dim` darkens it, which is how the ceiling is made out of the floor.
 *
 * Native size, deliberately. The first cut baked every surface out at WORLD
 * size — a 48×96 rock face blown up to 900×1260 — which buys nothing, because
 * the quads are `background-size: 100% 100%` under `image-rendering: pixelated`
 * and the browser does exactly the same nearest-neighbour upscale for free.
 * What it cost was 29.7MB of texture against 1.17MB for the identical pixels,
 * on a scene that is already several hundred composited 3D layers.
 */
function panel(img, sx, sy, sw, sh, dim) {
  const c = document.createElement('canvas');
  c.width = sw; c.height = sh;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  if (dim) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = `rgba(0,0,0,${dim})`; g.fillRect(0, 0, sw, sh); }
  return c.toDataURL();
}

/**
 * The four surfaces this theme needs, as data URIs.
 *
 * A theme with `walls` (the guild's rooms) already carries a head-on wall face —
 * that is exactly what a first-person panel is, so it is used as authored. A
 * theme without one (the mine, the meadow) has its cliff FACE tiles instead, and
 * those are head-on rock, which is the same thing by another name.
 */
/** Where the seams sit on an ore face: [across, down, size], as FRACTIONS of
 *  the face. Three clusters, off-centre, so no two faces line up. */
const VEIN = [[0.50, 0.50, 0.333], [0.23, 0.74, 0.222], [0.76, 0.28, 0.200]];
/** The light each ore throws — a seam has to be findable from down a corridor. */
const ORE_GLOW = { iron: '200,178,140', copper: '224,138,60', silver: '206,224,236', crystal: '110,231,200' };
/** The ore face is baked at 4× the rock's own resolution: an integer multiple,
 *  so the wall behind the seam stays pixel-identical to every other wall, while
 *  the vein and its glow have somewhere to live. */
const ORE_SCALE = 4;

/** One ore face: the wall, with the vein you are actually going to be paid for
 *  worked into it at a size the eye can find. The first cut pasted a single
 *  48px cluster onto a 900×1260 face — 0.2% of the wall, and invisible past a
 *  tile — and pasted the IRON cluster whatever the cell really paid. */
function bakeOreFace(wallCv, ores, kind) {
  const d = DECALS[ORE_KINDS[kind].decal];
  const W = wallCv.width * ORE_SCALE, H = wallCv.height * ORE_SCALE;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(wallCv, 0, 0, wallCv.width, wallCv.height, 0, 0, W, H);
  const glow = ORE_GLOW[kind] || ORE_GLOW.iron;
  for (const [fx, fy, fs] of VEIN) {
    const cx = fx * W, cy = fy * H, size = fs * W;
    g.save();
    g.globalCompositeOperation = 'lighter';
    const grd = g.createRadialGradient(cx, cy, 0, cx, cy, size);
    grd.addColorStop(0, `rgba(${glow},0.42)`);
    grd.addColorStop(1, `rgba(${glow},0)`);
    g.fillStyle = grd;
    g.fillRect(cx - size, cy - size, size * 2, size * 2);
    g.restore();
    g.drawImage(ores, d.x, d.y, d.w, d.h, cx - size / 2, cy - size / 2, size, size);
  }
  return cv.toDataURL();
}

async function cutSurfaces(theme) {
  const need = new Set(['cliffs', theme.sheet, theme.walls && theme.walls.sheet].filter(Boolean));
  const sheets = {};
  for (const k of need) sheets[k] = await loadImg(SHEET_URLS[k] || (SHEET_URLS.cliffs));
  const src = theme.src || 48;
  const fill = theme.fill[0];
  const floorImg = sheets[theme.sheet || 'cliffs'];
  const floor = panel(floorImg, fill[0] * src, fill[1] * src, src, src);
  const ceil = panel(floorImg, fill[0] * src, fill[1] * src, src, src, 0.55);

  // Kept as CANVASES, not data URIs: the ore faces are the wall with a seam in
  // it, and re-decoding a data URI four times to paint on it is a round trip
  // through the image loader for no reason.
  const wallCv = document.createElement('canvas');
  const lowCv = document.createElement('canvas');
  const paint = (cv, img, sx, sy, sw, sh) => {
    cv.width = sw; cv.height = sh;
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  };
  if (theme.walls) {
    const w = sheets[theme.walls.sheet], r = theme.walls.tall, l = theme.walls.low;
    paint(wallCv, w, r[0], r[1], r[2], r[3]);
    paint(lowCv, w, l[0], l[1], l[2], l[3]);
  } else {
    // Two cliff-face tiles stacked make one wall the height of the drop.
    const c = document.createElement('canvas');
    c.width = 48; c.height = 96;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    const put = (t, dy) => g.drawImage(sheets.cliffs, t[0] * 48, t[1] * 48, 48, 48, 0, dy, 48, 48);
    put(theme.faceTop.m, 0); put(theme.faceBot.m, 48);
    paint(wallCv, c, 0, 0, 48, 96);
    paint(lowCv, c, 0, 0, 48, 48);
  }
  const wall = wallCv.toDataURL(), low = lowCv.toDataURL();
  let ores = null;
  try {
    const oreImg = await loadImg(SHEET_URLS.ores);
    ores = {};
    for (const kind of Object.keys(ORE_KINDS)) ores[kind] = bakeOreFace(wallCv, oreImg, kind);
  } catch (e) {
    console.warn('delve-fp: ore sheet missing — seams will read as plain rock', e);
  }
  let rail = null;
  try {
    const railImg = await loadImg(SHEET_URLS.rails);
    const d = DECALS.railH;
    const cv = document.createElement('canvas');
    cv.width = d.w; cv.height = d.w;             // a square tile at the rail's own resolution
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(railImg, d.x, d.y, d.w, d.h, 0, (d.w - d.h) / 2, d.w, d.h);
    rail = cv.toDataURL();
  } catch (e) { /* a map without rails simply has none */ }
  return { floor, ceil, wall, low, ores, rail, ladder: ladderTexture() };
}

/** The rungs, drawn rather than cropped: no sheet in the kit has a head-on
 *  ladder, and a ladder head-on is four rectangles. */
let _ladderTex = null;
function ladderTexture() {
  if (_ladderTex) return _ladderTex;
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 320;
  const g = cv.getContext('2d');
  g.fillStyle = '#5d4026';
  g.fillRect(10, 0, 22, 320); g.fillRect(96, 0, 22, 320);
  g.fillStyle = '#8a6238';
  for (let y = 14; y < 320; y += 46) g.fillRect(10, y, 108, 14);
  g.fillStyle = 'rgba(255,232,180,0.16)';
  g.fillRect(10, 0, 6, 320); g.fillRect(96, 0, 6, 320);
  return (_ladderTex = cv.toDataURL());
}

// ---------------------------------------------------------------------------
// The chart
// ---------------------------------------------------------------------------

const at = (x, y) => {
  if (x < 0 || y < 0 || x >= F.cols || y >= F.rows) return '#';
  return F.grid[y][x];
};
const isWall = (x, y) => !!WALL[at(x, y)];
const isLow = (x, y) => !!LOW[at(x, y)];
const blocked = (x, y) => isWall(x, y) || isLow(x, y) || !!PROP[at(x, y)];
const heightAt = (x, y) => (at(x, y) === '^' ? 1 : 0);
const onClimb = (x, y) => { const c = at(x, y); return c === 'L' || c === 'v'; };
/** A step is legal if the destination is open AND — the delve's own rule — any
 *  change of level happens across a ladder. */
function canStep(fx, fy, tx, ty) {
  if (blocked(tx, ty)) return false;
  return heightAt(fx, fy) === heightAt(tx, ty) || onClimb(fx, fy) || onClimb(tx, ty);
}

/** How far into the dark a point is, 0 (right here) to 1 (gone). */
function fogAt(x, y) {
  const d = Math.hypot(x - F.px, y - F.py);
  return Math.min(1, Math.max(0, (d - FOG_NEAR) / (FOG_FAR - FOG_NEAR)));
}

/** Facing 0=north(-y) 1=east(+x) 2=south(+y) 3=west(-x). */
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const COMPASS = ['N', 'E', 'S', 'W'];

/**
 * Which way to face on arrival: down the longest open run from this cell.
 *
 * The first cut always faced south, which in Ferncreek is one step into the
 * hedge — you arrive nose to the wall, press forward, nothing happens, and the
 * button looks broken. A crawler should open looking at somewhere it can go.
 */
function openestDir(x, y) {
  let best = 2, run = -1;
  for (let d = 0; d < 4; d++) {
    const [dx, dy] = DIRS[d];
    let n = 0;
    while (n < 8 && !blocked(x + dx * (n + 1), y + dy * (n + 1))) n++;
    if (n > run) { run = n; best = d; }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Geometry — rebuilt on a change of cell, never per frame
// ---------------------------------------------------------------------------

/**
 * One quad. `cls` only carries styling; the transform does all the placing.
 *
 * `fog` is painted as a flat colour layer OVER the texture rather than applied
 * as a filter, because `filter` on hundreds of quads is hundreds of GPU passes
 * — and on any wrapper it would flatten `preserve-3d` and collapse the scene.
 * A second background layer costs nothing and is baked in with the geometry.
 */
function quad(tex, w, h, tx, ty, tz, rot, cls, fog) {
  const c = fogRgba(fog > 0 ? fog : 0);
  const veil = fog > 0.004 ? `linear-gradient(${c},${c}),` : '';
  return `<div class="fp-q ${cls}" style="width:${w}px;height:${h}px;margin-left:${-w / 2}px;margin-top:${-h / 2}px;` +
    `background-image:${veil}url(${tex});transform:translate3d(${tx}px,${ty}px,${tz}px) ${rot}"></div>`;
}

function buildGeometry() {
  const S = F.surf;
  const cx = Math.floor(F.px), cy = Math.floor(F.py);
  const out = [];
  for (let y = cy - VIEW_R; y <= cy + VIEW_R; y++) {
    for (let x = cx - VIEW_R; x <= cx + VIEW_R; x++) {
      const fog = fogAt(x + 0.5, y + 0.5);
      if (fog >= FOG_CULL) continue;   // solid dark already — emitting it is pure overdraw
      const ch = at(x, y);
      const wx = (x + 0.5) * T, wz = (y + 0.5) * T;
      if (WALL[ch] || LOW[ch]) {
        const h = LOW[ch] ? LOW_H : WALL_H;
        const tex = ch === 'o' ? ((S.ores && S.ores[oreKindAt(x, y)]) || S.wall)
          : (LOW[ch] ? S.low : S.wall);
        const yc = -h / 2;
        // A face is emitted only where it meets somewhere you could stand, so a
        // solid block of rock costs nothing and no face is ever seen from behind.
        // A face is fogged by ITS OWN distance, not the cell's — the two sides
        // of a block a tile apart should not be equally dark.
        const wf = (fx, fy) => fogAt(fx, fy);
        if (!WALL[at(x, y + 1)] && !LOW[at(x, y + 1)]) out.push(quad(tex, T, h, wx, yc, (y + 1) * T, '', 'fp-wall', wf(x + 0.5, y + 1)));
        if (!WALL[at(x, y - 1)] && !LOW[at(x, y - 1)]) out.push(quad(tex, T, h, wx, yc, y * T, 'rotateY(180deg)', 'fp-wall', wf(x + 0.5, y)));
        if (!WALL[at(x + 1, y)] && !LOW[at(x + 1, y)]) out.push(quad(tex, T, h, (x + 1) * T, yc, wz, 'rotateY(90deg)', 'fp-wall', wf(x + 1, y + 0.5)));
        if (!WALL[at(x - 1, y)] && !LOW[at(x - 1, y)]) out.push(quad(tex, T, h, x * T, yc, wz, 'rotateY(-90deg)', 'fp-wall', wf(x, y + 0.5)));
        // A waist-high run needs a lid, or you look down into an open box.
        if (LOW[ch]) out.push(quad(S.ceil, T, T, wx, -h, wz, 'rotateX(90deg)', 'fp-floor', fog));
        continue;
      }
      if (ch === '#') continue;
      const lift = -heightAt(x, y) * STEP_PX;
      out.push(quad(S.floor, T, T, wx, lift, wz, 'rotateX(90deg)', 'fp-floor', fog));
      out.push(quad(S.ceil, T, T, wx, -WALL_H, wz, 'rotateX(-90deg)', 'fp-ceil', fog));
      // Rails lie ON the floor, a hair above it so the two don't fight for depth.
      if (ch === '=' && S.rail) out.push(quad(S.rail, T, T, wx, lift - 1, wz, 'rotateX(90deg)', 'fp-floor', fog));
      // A ledge's own riser, so a step up reads as a step and not a slope.
      if (heightAt(x, y) && !heightAt(x, y + 1)) out.push(quad(S.low, T, STEP_PX, wx, -STEP_PX / 2, (y + 1) * T, '', 'fp-wall', fog));
      // The rungs. A climb cell is the ONLY place the level may change, so the
      // ladder is drawn flat against whichever neighbouring face it serves —
      // a thing you can see and aim at, not a square that silently lifts you.
      if (S.ladder && onClimb(x, y)) {
        if (heightAt(x, y + 1)) out.push(quad(S.ladder, T * 0.42, STEP_PX, wx, -STEP_PX / 2, (y + 1) * T - 6, 'rotateY(180deg)', 'fp-ladder', fog));
        if (heightAt(x, y - 1)) out.push(quad(S.ladder, T * 0.42, STEP_PX, wx, -STEP_PX / 2, y * T + 6, '', 'fp-ladder', fog));
        if (heightAt(x + 1, y)) out.push(quad(S.ladder, T * 0.42, STEP_PX, (x + 1) * T - 6, -STEP_PX / 2, wz, 'rotateY(-90deg)', 'fp-ladder', fog));
        if (heightAt(x - 1, y)) out.push(quad(S.ladder, T * 0.42, STEP_PX, x * T + 6, -STEP_PX / 2, wz, 'rotateY(90deg)', 'fp-ladder', fog));
      }
    }
  }
  F.world.querySelector('.fp-geo').innerHTML = out.join('');
}

// ---------------------------------------------------------------------------
// Decor — everything that STANDS in the map but is not the map
// ---------------------------------------------------------------------------

/** Grid char → the decal it stands up as, and how tall it stands. */
const GRID_DECOR = {
  r: (theme) => (theme.grayProps ? 'boulderGray' : 'boulder'),
  t: () => 'stalagTall',
  m: () => 'cart',
};
/** The ways out, and what each one is. */
const EXIT_SIGN = { s: ['⌃', 'Way out'], w: ['⌃', 'Way out'], d: ['🚪', 'Door'] };

/** A decal stood up as a billboard, scaled to a real world height. */
function decalBillboard(sheets, decalName, x, y, worldH) {
  const d = DECALS[decalName];
  const img = d && sheets[d.sheet];
  if (!img) return;
  const cv = document.createElement('canvas');
  cv.width = d.w; cv.height = d.h;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(img, d.x, d.y, d.w, d.h, 0, 0, d.w, d.h);
  const el = addBillboard('fp-decor', '', worldH * (d.w / d.h), worldH);
  el.appendChild(cv);
  cv.style.width = '100%'; cv.style.height = '100%';
  standDecor(el, x, y);
}

/** Decor turns to the walker every frame for the same reason a creature does:
 *  a billboard is a flat plane, and a flat plane seen edge-on is nothing. */
function standDecor(el, x, y) {
  F.decor.push({ el, x, y, lift: -heightAt(Math.floor(x), Math.floor(y)) * STEP_PX });
}

/**
 * Put a billboard where it stands, turned to the walker and dimmed by its
 * distance — the same fog the geometry is baked with, or a creature would come
 * at you out of the dark at full brightness like a sticker on the screen.
 *
 * Brightness is QUANTISED to twentieths and every write is compared first: a
 * filter change re-rasterises the layer, and paying that per sprite per frame
 * for a difference nobody can see is most of what a fog costs.
 */
function place(b, x, y, lift) {
  const fog = fogAt(x, y);
  const hidden = fog >= FOG_CULL;
  if (hidden !== b._hidden) { b.el.style.display = (b._hidden = hidden) ? 'none' : ''; }
  if (hidden) return;
  const tf = `translate3d(${(x * T).toFixed(1)}px,${lift}px,${(y * T).toFixed(1)}px) rotateY(${-F.yaw}deg)`;
  if (tf !== b._tf) b.el.style.transform = (b._tf = tf);
  const lit = Math.round((1 - fog) * 20) / 20;
  if (lit !== b._lit) {
    b._lit = lit;
    b.el.style.filter = `drop-shadow(0 4px 5px rgba(0,0,0,0.6)) brightness(${lit})`;
  }
}

/** A sign you can read from down the corridor — the only honest way to tell a
 *  first-person walker that the square ahead is the stairs and not more floor. */
function markerBillboard(glyph, label, cls, x, y) {
  const el = addBillboard('fp-marker ' + cls,
    `<span class="fpm-glyph">${glyph}</span><span class="fpm-label">${label}</span>`, 560, 560);
  standDecor(el, x, y);
}

/**
 * Stand up everything the chart says is in the room. The top-down walk has
 * always done this (delve.js decorates the same grid chars); first person
 * declared `PROP` and then used it for nothing but collision, so a boulder was
 * an invisible wall, a cart was an invisible wall, and the stairs you were
 * looking for were a patch of floor indistinguishable from any other.
 *
 * Built ONCE per map: none of it moves, and mining a face doesn't touch it.
 */
function buildDecor(sheets) {
  F.decor = []; F.doors = [];
  const theme = F.theme, map = F.map;
  for (let y = 0; y < F.rows; y++) {
    for (let x = 0; x < F.cols; x++) {
      const ch = F.grid[y][x];
      const pick = GRID_DECOR[ch];
      if (pick) {
        // The meadow's 't' is a tree, not a stalagmite — same rule as delve.js.
        if (ch === 't' && map.theme === 'meadow') artBillboardH('treeTall', x + 0.5, y + 0.5, DECOR_H.tree);
        else {
          const name = pick(theme);
          decalBillboard(sheets, name, x + 0.5, y + 0.5, DECOR_H[name] || 700);
        }
      }
      const sign = EXIT_SIGN[ch];
      if (sign || ch === '+') {
        if (sign) markerBillboard(sign[0], sign[1], 'fpm-exit', x + 0.5, y + 0.5);
        else markerBillboard('◈', 'Onward', 'fpm-portal', x + 0.5, y + 0.5);
        F.doors.push({ x: x + 0.5, y: y + 0.5 });
      }
    }
  }
  // Authored furnishings — the same art.js standees the top-down walk uses, at
  // the same size: `w` is that view's pixels against its 48px tile, so w/48 is
  // the thing's width in TILES and T/48 carries it straight across.
  for (const p of (map.props || [])) artBillboard(p.art, p.x, p.y, (p.w || 48) * (T / 48), p.label);
}

/** An art.js crop stood up. `worldW` is its width in world px; the height
 *  follows from the crop's own proportions, which is what keeps it a thing and
 *  not a stretched picture of one. */
function artBillboard(name, x, y, worldW, title) {
  const html = artSprite(name, '', 'width:100%;height:100%');
  if (!html) return;
  const a = ART[name];
  const el = addBillboard('fp-decor', html, worldW, worldW * (a.h / a.w));
  if (title) el.title = title;
  standDecor(el, x, y);
}
/** The same, given a HEIGHT — for things the ceiling has an opinion about. */
function artBillboardH(name, x, y, worldH) {
  const a = ART[name];
  if (a) artBillboard(name, x, y, worldH * (a.w / a.h));
}

// ---------------------------------------------------------------------------
// Billboards — creatures, props and markers, always turned to the walker
// ---------------------------------------------------------------------------

function addBillboard(cls, inner, w, h) {
  const el = document.createElement('div');
  el.className = 'fp-bb ' + cls;
  el.style.width = w + 'px';
  el.style.height = h + 'px';
  el.style.marginLeft = (-w / 2) + 'px';
  el.innerHTML = inner;
  F.world.querySelector('.fp-bbs').appendChild(el);
  return el;
}

/**
 * The tight box the art occupies inside a walk-sheet frame, in frame-local
 * coordinates, taken as the UNION over all twelve frames.
 *
 * RPG-Maker charsets centre a small sprite in a generous cell, and how much
 * padding a given sheet leaves is an accident of that sheet. Scaling by the
 * FRAME therefore makes a well-drawn creature small and a badly-cropped one
 * large; scaling by the union of its real pixels makes the rank the only thing
 * that decides. The union (not the one frame) is what stops the sprite
 * jittering as it walks.
 */
const _trimCache = {};
function trimBox(art, img, fw, fh) {
  if (_trimCache[art] !== undefined) return _trimCache[art];
  let box = null;
  try {
    const W = img.naturalWidth, H = img.naturalHeight;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, W, H).data;
    const tiled = W === fw * 3 && H === fh * 4;   // only then is x%fw a frame coordinate
    let x0 = fw, y0 = fh, x1 = -1, y1 = -1;
    for (let py = 0; py < H; py++) {
      for (let px = 0; px < W; px++) {
        if (d[(py * W + px) * 4 + 3] < 12) continue;
        const lx = tiled ? px % fw : px, ly = tiled ? py % fh : py;
        if (lx < x0) x0 = lx;
        if (ly < y0) y0 = ly;
        if (lx > x1) x1 = lx;
        if (ly > y1) y1 = ly;
      }
    }
    if (x1 >= 0) box = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  } catch (e) {
    console.warn('delve-fp: could not measure', art, e);   // tainted canvas — fall back
  }
  return (_trimCache[art] = box);
}

/** The walk cycle, in sheet columns — the same [1,2,1,0] the compositor uses. */
const WALK_COLS = [1, 2, 1, 0];

/** Repaint a creature's canvas. Cheap, and only ever called on a frame change. */
function drawCreature(c) {
  const g = c.cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, c.cv.width, c.cv.height);
  g.drawImage(c.img, c.col * c.fw + c.box.x, c.row * c.fh + c.box.y, c.box.w, c.box.h,
    0, 0, c.box.w, c.box.h);
  c.drawn = c.row * 4 + c.col;
}

function spawnCreature(prey, img, x, y) {
  const fw = Math.floor(img.naturalWidth / 3), fh = Math.floor(img.naturalHeight / 4);
  const box = trimBox(prey.art, img, fw, fh) || { x: 0, y: 0, w: fw, h: fh };
  const aspect = box.w / box.h;
  // Rank sets the height, but nothing may be wider than the passage it stands
  // in: a Slime Sovereign is squat (1.04 wide per tall), so rank 5's 1080 put
  // it 1127 across a 900px tile and its shoulders inside both walls.
  let h = CREATURE_H[Math.min(5, Math.max(1, prey.rank || 1))];
  const maxW = T * 0.92;
  if (h * aspect > maxW) h = maxW / aspect;
  const cv = document.createElement('canvas');
  cv.width = box.w; cv.height = box.h;
  const el = addBillboard('fp-creature', '', h * aspect, h);
  el.appendChild(cv);
  cv.style.width = '100%'; cv.style.height = '100%';
  const c = {
    prey, img, el, cv, fw, fh, box, x, y, home: { x, y },
    mode: 'idle', t: 1 + Math.random() * 2, tx: x, ty: y,
    row: 0, col: 1, drawn: -1, phase: Math.random() * 4,
  };
  drawCreature(c);
  F.creatures.push(c);
}

// ---------------------------------------------------------------------------
// The hands — what you are carrying, held where you can see it
// ---------------------------------------------------------------------------

/**
 * Build the viewmodel from the member's real kit.
 *
 * `hooks.gear` is what hall.js says is equipped — kind and material, nothing
 * else — and art.js turns that pair into a 32px icon cell. The RIGHT hand is
 * the weapon slot, mirrored so the hilt sits at the near corner and the blade
 * rises into frame; the LEFT is a shield, which is what the body slot looks
 * like from behind your own arm (there is no shield slot to read).
 *
 * Nothing is invented: a member with an empty weapon slot shows empty hands,
 * and is told so on the way in, because that is a fact about the delve worth
 * knowing before the first Old Delver.
 */
async function mountHands() {
  const host = F.host.querySelector('.fp-hands');
  if (!host) return;
  // `meet`, not `none`: the dash that draws the arc is measured in USER units,
  // so the viewBox has to scale uniformly or the pattern and the path disagree
  // about how long the path is. (The first cut stretched it and kept the stroke
  // width honest with vector-effect — which put the dashes in SCREEN px against
  // a 122-unit path, and the arc came out as three disconnected chunks.)
  host.innerHTML = '<svg class="fp-slash" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">'
    + '<path d="M92 6 C 60 34, 34 60, 8 94" /></svg>';
  const hands = { el: host, weapon: null, shield: null, pick: null };
  F.hands = hands;
  const gear = F.hooks.gear || {};
  // Sheet loads are slow enough to outlive the delve that asked for them, so
  // every await is followed back into a session that may already be gone.
  const live = () => !!F && F.hands === hands;
  const put = async (icon, cls, title) => {
    if (!icon) return null;
    try {
      const img = await loadImg(icon.url);
      if (!live()) return null;
      const cv = document.createElement('canvas');
      cv.width = icon.sw; cv.height = icon.sh;
      const c = cv.getContext('2d');
      c.imageSmoothingEnabled = false;
      c.drawImage(img, icon.sx, icon.sy, icon.sw, icon.sh, 0, 0, icon.sw, icon.sh);
      const el = document.createElement('div');
      el.className = 'fp-hand ' + cls;
      el.title = title || '';
      el.appendChild(cv);
      host.appendChild(el);
      return el;
    } catch (e) {
      console.warn('delve-fp: hand art missing', cls, e);
      return null;
    }
  };
  const w = gear.weapon, b = gear.body;
  hands.weapon = await put(w && gearIcon(w.kind, w.material), 'fp-hand-weapon', w && w.name);
  // A bow is two-handed: nothing braces an off-hand shield behind it.
  if (live() && !(w && w.kind === 'bow')) {
    hands.shield = await put(b && gearIcon(b.kind, b.material), 'fp-hand-shield', b && b.name);
  }
  // The PICK is not equipment — it is what a delver walks in carrying. It comes
  // out for a seam whatever else is in hand, and when the weapon slot is empty
  // it is the only thing there, so the hands are never simply blank.
  if (live()) hands.pick = await put(PICK_ICON, 'fp-hand-pick' + (hands.weapon ? ' fp-stowed' : ''), 'Delver’s pick');
}

/**
 * Throw the swing. `mining` brings the pick out and stows the blade for the
 * duration, because you do not open a vein with a sword.
 *
 * Retriggering needs the class off, a reflow, and the class back on, or a
 * second swing inside the first simply doesn't play.
 */
function playSwing(mining) {
  const H = F.hands;
  if (!H) return;
  const lead = mining ? (H.pick || H.weapon) : (H.weapon || H.pick);
  // One hand leads and the other stows. The stowed hand must also DROP its
  // swing class: an animation outranks a plain transform, so a pick left
  // mid-swing would keep swinging from inside the holster.
  for (const el of [H.weapon, H.pick]) {
    if (!el) continue;
    const off = el !== lead;
    el.classList.toggle('fp-stowed', off);
    if (off) el.classList.remove('fp-swinging');
  }
  const fire = (el, cls) => {
    if (!el) return;
    el.classList.remove(cls);
    void el.getBoundingClientRect();
    el.classList.add(cls);
  };
  fire(lead, 'fp-swinging');
  fire(H.el.querySelector('.fp-slash'), 'fp-swinging');
  fire(H.shield, 'fp-bracing');
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

/** The prop sheets this chart actually needs — a room never pays for rails. */
async function decorSheets(map) {
  const chars = map.grid.join('');
  const want = new Set();
  if (/[rt]/.test(chars)) want.add('rocks');
  if (chars.includes('m')) want.add('rails');
  const out = {};
  for (const k of want) {
    try { out[k] = await loadImg(SHEET_URLS[k]); }
    catch (e) { console.warn('delve-fp: prop sheet missing', k, e); }
  }
  return out;
}

async function prep(mapId) {
  const map = mapForLocale(mapId);
  if (!map) throw new Error('delve-fp: no map ' + mapId);
  validateMap(map);
  const theme = THEMES[map.theme];
  const surf = await cutSurfaces(theme);
  const props = await decorSheets(map);
  const spawns = [];
  for (const s of (map.spawns || [])) {
    const prey = preyById(s.prey);
    if (!prey) continue;
    try { spawns.push({ prey, s, img: await loadImg(ART_BASE + prey.art + '.png') }); }
    catch (e) { console.warn('delve-fp: creature sheet missing for', s.prey, e); }
  }
  return { map, theme, surf, props, spawns };
}

function mount(prep, entry) {
  const { map, theme, surf, props, spawns } = prep;
  F.map = map; F.theme = theme; F.surf = surf;
  F.cols = map.grid[0].length; F.rows = map.grid.length;
  F.mined = F.mined || new Set();
  // A face already worked stays worked. `map.grid` is the module's own copy and
  // is never mutated, so coming back through a door would otherwise restore the
  // seam as solid rock that mineOre then refuses to touch again — a wall with no
  // way through it, in the middle of the passage you opened.
  F.grid = map.grid.map((row, y) => row.replace(/o/g, (m, x) => (F.mined.has(map.id + ':' + x + ',' + y) ? '.' : m)));
  const at0 = entry || map.entry;
  F.px = Math.floor(at0[0]) + 0.5; F.py = Math.floor(at0[1]) + 0.5;
  F.dir = openestDir(Math.floor(F.px), Math.floor(F.py));
  F.yaw = F.dir * 90; F.turning = null; F.stepping = null;
  F.creatures = []; F.decor = []; F.doors = []; F.armed = false;
  F.settleUntil = performance.now() + 250;

  const stage = F.host.querySelector('.fp-stage');
  stage.innerHTML = '<div class="fp-world"><div class="fp-geo"></div><div class="fp-bbs"></div></div>';
  F.world = stage.querySelector('.fp-world');
  buildGeometry();
  buildDecor(props || {});
  for (const sp of spawns) spawnCreature(sp.prey, sp.img, sp.s.x + 0.5, sp.s.y + 0.5);

  const title = F.host.querySelector('.fp-title');
  if (title) title.textContent = `${F.hooks.locale.glyph} ${map.name || F.hooks.locale.name}`;
  drawMap();
}

/**
 * Open the first-person delve. Same contract as openDelve — `hooks` is the very
 * same object hall.js builds for the top-down walk, so the two modes cannot pay
 * different spoils. Resolves true only if it actually took the screen.
 */
export async function openDelveFp(localeId, member, hooks) {
  if (!mapForLocale(localeId) || !member || F || opening) return false;
  opening = true;
  try {
    const p = await prep(localeId);
    const guildUp = document.getElementById('guildScreen');
    if (F || !guildUp || !guildUp.classList.contains('active')) return false;

    const host = document.getElementById('delveFpScreen');
    host.innerHTML = `
      <div class="fp-stage"></div>
      <div class="fp-hands"></div>
      <div class="fp-vignette"></div>
      <div class="delve-hud">
        <button class="dv-leave" onclick="__delveFp.leave()">⬅ Leave</button>
        <span class="fp-title dv-title"></span>
        <span class="fp-compass"></span>
        <span class="dv-haul fp-haul"></span>
        <button class="fp-help" title="Controls" onclick="__delveFp.help()">?</button>
      </div>
      <canvas class="fp-map" width="150" height="150"></canvas>
      <div class="delve-toasts fp-toasts"></div>
      <div class="fp-keys">
        <b>W</b> forward · <b>S</b> back · <b>A</b>/<b>D</b> sidestep
        · <b>←</b>/<b>→</b> turn · <b>Space</b> or <b>click</b> to strike
        · <b>Esc</b> leave
      </div>
      <div class="fp-pad">
        <button data-k="turnL" aria-label="Turn left">◀<i>←</i></button>
        <button data-k="fwd" aria-label="Forward">▲<i>W</i></button>
        <button data-k="turnR" aria-label="Turn right">▶<i>→</i></button>
        <button data-k="back" aria-label="Back">▼<i>S</i></button>
        <button data-k="attack" class="fp-attack" aria-label="Strike">⚔<i>Space</i></button>
      </div>`;

    F = {
      map: null, theme: null, surf: null, hooks, member, host, world: null,
      grid: null, cols: 0, rows: 0,
      px: 0, py: 0, dir: 2, yaw: 180, turning: null, stepping: null,
      keys: {}, latched: {}, last: 0, raf: 0, ended: false, fighting: false, grace: false, transiting: false,
      creatures: [], decor: [], doors: [], armed: false,
      seen: new Set(), mined: new Set(), settleUntil: 0,
      hands: null, swingUntil: 0, helpTimer: 0,
      haul: { kills: {}, gold: 0, mats: {}, field: 0, bouts: 0 },
      stack: [],
    };
    try {
      mount(p, null);
      wireInput();
      updateHaul();
      showScreen('delveFpScreen');
      startLoop();
    } catch (e) {
      if (F && F.raf) cancelAnimationFrame(F.raf);
      if (F && F.onKeyDown) unwireInput();   // or the page keeps the listeners forever
      F = null;
      host.innerHTML = '';
      showScreen('guildScreen');
      throw e;
    }
    // The hands come up after the screen does: a missing icon sheet must cost
    // the delve nothing but its viewmodel.
    mountHands().catch((e) => console.warn('delve-fp: hands', e));
    const first = member.name.split(' ')[0];
    toast(`${first} descends into ${p.map.name || hooks.locale.name}.`);
    if (!(hooks.gear && hooks.gear.weapon)) toast(`${first} goes in bare-handed — nothing in the weapon slot.`);
    helpUntil(8000);
    return true;
  } finally {
    opening = false;
  }
}

// ---------------------------------------------------------------------------
// Input — grid steps and quarter turns
// ---------------------------------------------------------------------------

/** One table, read by both handlers — two copies drifted apart waiting to happen. */
const KEYMAP = {
  arrowup: 'fwd', w: 'fwd', arrowdown: 'back', s: 'back',
  arrowleft: 'turnL', arrowright: 'turnR', a: 'strafeL', d: 'strafeR',
  q: 'turnL', e: 'turnR',
  ' ': 'attack', spacebar: 'attack', f: 'attack', enter: 'attack',
};

function wireInput() {
  // Both guard on F: a throw during open leaves the listener attached with no
  // session behind it, and an unguarded handler then raises on every keypress
  // for the rest of the page's life.
  F.onKeyDown = (e) => {
    if (!F || !screenActive() || F.fighting) return;
    const k = e.key.toLowerCase();
    if (k === 'escape') { leave(); return; }
    if (k === '?' || k === 'h') { e.preventDefault(); helpUntil(9000); return; }
    if (KEYMAP[k]) { e.preventDefault(); F.keys[KEYMAP[k]] = true; }
  };
  F.onKeyUp = (e) => {
    if (!F) return;
    const k = e.key.toLowerCase();
    if (KEYMAP[k]) F.keys[KEYMAP[k]] = false;
  };
  window.addEventListener('keydown', F.onKeyDown);
  window.addEventListener('keyup', F.onKeyUp);
  F.host.querySelectorAll('.fp-pad button').forEach((b) => {
    const k = b.dataset.k;
    // A tap is shorter than a frame more often than you would think, so the
    // press is LATCHED: readInput consumes it and clears the latch itself.
    const on = (e) => { e.preventDefault(); F.keys[k] = true; F.latched[k] = true; };
    const off = () => { if (F) F.keys[k] = false; };
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off);
    b.addEventListener('pointerleave', off);
    b.addEventListener('pointercancel', off);
  });
  // Clicking into the world strikes at it. The most discoverable control there
  // is: the thing you can see is the thing you can hit.
  F.onStagePointer = (e) => {
    if (!F || F.fighting || F.ended) return;
    e.preventDefault();
    trySwing();
  };
  const stage = F.host.querySelector('.fp-stage');
  if (stage) stage.addEventListener('pointerdown', F.onStagePointer);
}
function unwireInput() {
  window.removeEventListener('keydown', F.onKeyDown);
  window.removeEventListener('keyup', F.onKeyUp);
  const stage = F.host.querySelector('.fp-stage');
  if (stage && F.onStagePointer) stage.removeEventListener('pointerdown', F.onStagePointer);
}

/** Show the control strip for a while. Shown on entry, and on ? or the HUD's
 *  own button — a crawler that never says which key walks is a maze. */
function helpUntil(ms) {
  if (!F) return;
  const el = F.host.querySelector('.fp-keys');
  if (!el) return;
  el.classList.add('on');
  clearTimeout(F.helpTimer);
  F.helpTimer = setTimeout(() => el.classList.remove('on'), ms);
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

/** Begin a stride into the next cell, if anything is there to stride into. */
function tryStep(sign, strafe) {
  const d = (F.dir + (strafe || 0) + 4) % 4;
  const [dx, dy] = DIRS[d];
  const fx = Math.floor(F.px), fy = Math.floor(F.py);
  const tx = fx + dx * sign, ty = fy + dy * sign;
  if (!canStep(fx, fy, tx, ty)) {
    // An ore face is a wall you can take away by walking into it.
    if (at(tx, ty) === 'o') mineOre(tx, ty);
    return;
  }
  F.stepping = { fx: fx + 0.5, fy: fy + 0.5, tx: tx + 0.5, ty: ty + 0.5, t: 0 };
}

function tryTurn(sign) {
  F.turning = { from: F.yaw, to: F.yaw + sign * 90, t: 0 };
  F.dir = (F.dir + sign + 4) % 4;
}

/**
 * Strike at what is in front of you.
 *
 * A crawler's attack is a REACH, not a collision: the bout opens on anything
 * inside SWING_REACH and roughly ahead, so you pick the fight instead of
 * blundering into it. Walking into a creature still starts a bout — a Plague
 * Speaker that runs you down does not wait to be invited — but that is now the
 * fallback rather than the only way combat has ever begun.
 *
 * The same swing works the wall: an ore face IS a thing you hit until it comes
 * out, so striking one mines it, exactly as walking into it always has.
 */
function trySwing() {
  const now = performance.now();
  if (!F || F.ended || F.fighting || F.transiting || now < F.swingUntil) return;
  F.swingUntil = now + SWING_MS;
  const [dx, dy] = DIRS[F.dir];
  const ax = Math.floor(F.px) + dx, ay = Math.floor(F.py) + dy;
  const seam = at(ax, ay) === 'o';
  playSwing(seam);
  if (seam) { mineOre(ax, ay); return; }
  let best = null, bd = SWING_REACH;
  for (const c of F.creatures) {
    const vx = c.x - F.px, vy = c.y - F.py, d = Math.hypot(vx, vy) || 1e-6;
    if (d > bd) continue;
    if ((vx * dx + vy * dy) / d < SWING_CONE) continue;   // it has to be in front
    best = c; bd = d;
  }
  if (best) engage(best);
}

/**
 * A key that is down, or a tap too short to still be down when we looked.
 *
 * Reading ALWAYS spends the latch, including on the key-is-down path. Returning
 * early there left the latch armed through the whole stride — readInput bails on
 * `F.turning || F.stepping` above these calls, so nothing could spend it — and
 * the frame after the stride finished it fired again: one tap of ▲ walked two
 * cells and one tap of ◀ turned a full 180°.
 */
function took(k) {
  const on = !!F.keys[k] || !!F.latched[k];
  F.latched[k] = false;
  return on;
}

function readInput() {
  if (F.fighting || F.transiting) return;
  // Striking is allowed mid-stride: a stride is 200ms, and a crawler that
  // swallows your attack because you are still walking feels broken.
  if (took('attack')) trySwing();
  if (F.turning || F.stepping) return;
  if (performance.now() < F.settleUntil) return;
  if (took('turnL')) { tryTurn(-1); return; }
  if (took('turnR')) { tryTurn(1); return; }
  if (took('fwd')) { tryStep(1, 0); return; }
  if (took('back')) { tryStep(-1, 0); return; }
  if (took('strafeL')) { tryStep(1, -1); return; }
  if (took('strafeR')) { tryStep(1, 1); return; }
}

function advanceMotion(dt) {
  if (F.turning) {
    F.turning.t += dt * 1000 / TURN_MS;
    if (F.turning.t >= 1) { F.yaw = F.turning.to; F.turning = null; drawMap(); }
    else F.yaw = F.turning.from + (F.turning.to - F.turning.from) * ease(F.turning.t);
  }
  if (F.stepping) {
    const s = F.stepping;
    s.t += dt * 1000 / STEP_MS;
    const k = Math.min(1, ease(s.t));
    F.px = s.fx + (s.tx - s.fx) * k;
    F.py = s.fy + (s.ty - s.fy) * k;
    if (s.t >= 1) { F.px = s.tx; F.py = s.ty; F.stepping = null; onArrive(); }
  }
}
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** Everything that happens because a stride finished on a new cell. */
function onArrive() {
  const x = Math.floor(F.px), y = Math.floor(F.py);
  F.seen.add(F.map.id + ':' + x + ',' + y);
  buildGeometry();
  drawMap();
  const ch = at(x, y);
  // The entry sits ON or BESIDE the way out (hollowvein spawns one cell from
  // its 's'), so a door is ARMED only once you have stepped clear of it — the
  // same rule the top-down walk has always had (delve.js checkExit). Without
  // it the first press of ▲ can end the delve before it has begun.
  if (!F.armed) return;
  if (ch === '+') { const p = (F.map.portals || []).find((q) => Math.floor(q.x) === x && Math.floor(q.y) === y); if (p) { usePortal(p); return; } }
  if (EXIT[ch]) {
    if (F.stack.length) { usePortal({ ...F.stack.pop(), popped: true }); return; }
    endDelve('climbed back into the daylight');
  }
}

/** Arm the ways out once the walker has stepped clear of every one of them —
 *  the same 1.35-tile rule delve.js uses, and for the same reason. */
function checkArmed() {
  if (F.armed) return;
  if (F.doors.every((d) => Math.hypot(d.x - F.px, d.y - F.py) > 1.35)) F.armed = true;
}

async function usePortal(portal) {
  if (!F || F.transiting || F.ended) return;
  const S = F;
  S.transiting = true;
  try {
    const p = await prep(portal.to);
    if (F !== S || S.ended) return;
    if (portal.enter) S.stack.push({ to: S.map.id, at: [S.px, S.py] });
    mount(p, portal.at);
    toast(p.map.name || 'Onward');
  } catch (e) {
    console.warn('delve-fp: door failed', e);
    if (F === S && !S.ended) toast('That way is blocked.');
  } finally {
    if (F === S) S.transiting = false;
  }
}

function moveCreatures(dt) {
  for (const c of F.creatures) {
    const dist = Math.hypot(c.x - F.px, c.y - F.py);
    const rank = c.prey.rank || 1;
    let speed = 0.9;
    if (rank <= 1 && dist < 2.6) { c.mode = 'flee'; c.tx = c.x + (c.x - F.px) / (dist || 1) * 2; c.ty = c.y + (c.y - F.py) / (dist || 1) * 2; speed = 1.8; }
    else if (rank >= 3 && dist < 4) { c.mode = 'chase'; c.tx = F.px; c.ty = F.py; speed = rank >= 4 ? 1.5 : 1.2; }
    else if (c.mode === 'chase' || c.mode === 'flee') { c.mode = 'idle'; c.t = 0.6; }
    if (c.mode === 'idle') {
      c.t -= dt;
      if (c.t <= 0) {
        for (let i = 0; i < 6; i++) {
          const nx = c.home.x + (Math.random() * 5 - 2.5), ny = c.home.y + (Math.random() * 5 - 2.5);
          if (!blocked(Math.floor(nx), Math.floor(ny))) { c.tx = nx; c.ty = ny; c.mode = 'walk'; break; }
        }
        if (c.mode !== 'walk') c.t = 1.5;
      }
      poseCreature(c, false);
      continue;
    }
    const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy);
    if (d < 0.15) { c.mode = 'idle'; c.t = 1 + Math.random() * 2; poseCreature(c, false); continue; }
    const step = Math.min(d, speed * dt);
    const nx = c.x + dx / d * step, ny = c.y + dy / d * step;
    if (!blocked(Math.floor(nx), Math.floor(c.y))) c.x = nx;
    if (!blocked(Math.floor(c.x), Math.floor(ny))) c.y = ny;
    c.phase += dt * speed * 3.4;
    poseCreature(c, true);
  }
}

/** Which cell of the walk sheet a creature is showing. Row 0 is the pose that
 *  looks AT you and row 3 the one that looks away, so a fleeing rat shows you
 *  its back — the billboard always faces you, but the creature need not. */
function poseCreature(c, walking) {
  const row = c.mode === 'flee' ? 3 : 0;
  const col = walking ? WALK_COLS[Math.floor(c.phase) % 4] : 1;
  if (c.drawn === row * 4 + col) return;
  c.row = row; c.col = col;
  drawCreature(c);
}

function checkEncounters() {
  for (const c of F.creatures) {
    if (Math.hypot(c.x - F.px, c.y - F.py) < REACH) { engage(c); return; }
  }
}

async function engage(c) {
  if (F.fighting || F.ended) return;
  F.fighting = true;
  F.keys = {}; F.latched = {};
  let bout = null;
  try { bout = await F.hooks.fight(c.prey.id); }
  catch (e) { console.error('delve-fp: bout failed', e); }
  if (!F || F.ended) return;
  showScreen('delveFpScreen');
  F.haul.bouts++;
  if (bout && bout.won) {
    F.creatures = F.creatures.filter((x) => x !== c);
    c.el.remove();
    // Banking the spoils must not be able to strand the session. The loop only
    // restarts from here and from open, so a throw inside onKill would leave
    // the screen up with `fighting` stuck true and no rAF — a delve you can
    // look at and not play. Ledger first, loop always.
    try {
      const r = F.hooks.onKill(c.prey.id);
      F.haul.kills[c.prey.id] = (F.haul.kills[c.prey.id] || 0) + 1;
      if (r) {
        F.haul.gold += r.gold || 0;
        F.haul.field += r.field || 0;
        if (r.meat) F.haul.mats.game_meat = (F.haul.mats.game_meat || 0) + r.meat;
        if (r.pelt) F.haul.mats.pelt = (F.haul.mats.pelt || 0) + r.pelt;
        if (r.loot) F.haul.mats[r.loot] = (F.haul.mats[r.loot] || 0) + 1;
        toast(`${c.prey.glyph} ${c.prey.name} felled! ${r.txt || ''}`);
      }
      updateHaul();
    } catch (e) {
      console.error('delve-fp: spoils failed', e);
    } finally {
      F.grace = true;
      F.fighting = false;
      startLoop();
    }
  } else {
    F.fighting = false;
    endDelve(`driven out by the ${c.prey.name}`, true);
  }
}

/** Work a vein out of the wall in front of you. The face becomes floor, so the
 *  seam you broke is the way on — a mine opens up as you take it apart. */
function mineOre(x, y) {
  const key = F.map.id + ':' + x + ',' + y;
  if (F.mined.has(key)) return;
  F.mined.add(key);
  const kind = oreKindAt(x, y);   // the same seam the top-down walk would pay
  F.grid = F.grid.map((row, ry) => (ry === y ? row.slice(0, x) + '.' + row.slice(x + 1) : row));
  buildGeometry();
  const k = ORE_KINDS[kind];
  const r = F.hooks.onOre(kind);
  F.haul.gold += k.gold;
  if (k.mat) F.haul.mats[k.mat] = (F.haul.mats[k.mat] || 0) + 1;
  updateHaul();
  toast(r && r.txt ? r.txt : `⛏ ${k.name} · +${k.gold}g`);
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function render() {
  const ex = F.px * T, ez = F.py * T;
  const ey = -EYE - heightAt(Math.floor(F.px), Math.floor(F.py)) * STEP_PX;
  // rotateY(+yaw), not −yaw. Forward is −Z, and CSS rotateY maps (x,y,z) to
  // (x·cosθ + z·sinθ, y, −x·sinθ + z·cosθ) — so facing east (yaw 90) has to send
  // world +X to view −Z, which needs +90. The negative sign put east BEHIND the
  // camera and left you staring at the wall you had just walked away from.
  F.world.style.transform = `rotateY(${F.yaw}deg) translate3d(${-ex}px,${-ey}px,${-ez}px)`;
  // Billboards stand on the floor and counter-rotate to face the walker. Every
  // write is guarded by the value it would write: standing still, this loop
  // touches no style at all, which is the difference between a scene that
  // re-rasterises 30 layers a frame and one that does nothing.
  for (const c of F.creatures) place(c, c.x, c.y, -heightAt(Math.floor(c.x), Math.floor(c.y)) * STEP_PX);
  for (const d of F.decor) place(d, d.x, d.y, d.lift);
  // The hands ride the stride and lag the turn — the whole reason to draw them
  // is that they are the only thing on screen that moves WITH you.
  if (F.hands) {
    const bob = F.stepping ? Math.sin(Math.min(1, F.stepping.t) * Math.PI) * 26 : 0;
    const sway = F.turning ? (F.turning.to - F.yaw) / 90 * -30 : 0;
    F.hands.el.style.setProperty('--fp-bob', bob.toFixed(1) + 'px');
    F.hands.el.style.setProperty('--fp-sway', sway.toFixed(1) + 'px');
  }
  const comp = F.host.querySelector('.fp-compass');
  if (comp) comp.textContent = '✦ ' + COMPASS[F.dir];
}

/** The scrap of chart you have drawn so far — only cells you have stood on and
 *  what you could see from them. A crawler without one is a maze, not a map. */
function drawMap() {
  const cv = F.host.querySelector('.fp-map');
  if (!cv) return;
  const g = cv.getContext('2d');
  const R = 9, cell = cv.width / (R * 2 + 1);
  g.clearRect(0, 0, cv.width, cv.height);
  const cx = Math.floor(F.px), cy = Math.floor(F.py);
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      const x = cx + dx, y = cy + dy;
      // Keyed by MAP, like `mined` beside it. Bare coordinates meant a room you
      // walked through left its shape drawn on the chart of the next room —
      // walk the Academy's first form, step through, and the second form opens
      // with a corridor sketched in that it does not have.
      if (!F.seen.has(F.map.id + ':' + x + ',' + y) && Math.hypot(dx, dy) > 3.5) continue;
      const ch = at(x, y);
      g.fillStyle = WALL[ch] ? '#3b3128' : LOW[ch] ? '#5a4a36' : ch === '#' ? 'transparent'
        : EXIT[ch] ? '#d4a843' : ch === '+' ? '#8ab4d8' : '#7d6a4e';
      g.fillRect((dx + R) * cell, (dy + R) * cell, cell - 0.5, cell - 0.5);
    }
  }
  g.fillStyle = '#e8e0d0';
  g.beginPath();
  const mx = (R + 0.5) * cell, my = (R + 0.5) * cell, a = (F.dir * 90 - 90) * Math.PI / 180;
  g.moveTo(mx + Math.cos(a) * cell, my + Math.sin(a) * cell);
  g.lineTo(mx + Math.cos(a + 2.5) * cell, my + Math.sin(a + 2.5) * cell);
  g.lineTo(mx + Math.cos(a - 2.5) * cell, my + Math.sin(a - 2.5) * cell);
  g.fill();
}

function stepSim(now) {
  const dt = Math.min(0.08, (now - (F.last || now)) / 1000);
  /**
   * Re-asked between every stage, not once at the top. A strike may now be
   * thrown MID-STRIDE, and engage() raises `fighting` and the battle screen
   * synchronously — so a single test up front would let the stride it
   * interrupted finish underneath the bout. Landing that stride on the stairs
   * ran endDelve while the fight was still out: the summary card was injected
   * into a hidden screen, onEnd never fired, and the only way back to the guild
   * was a page reload. onArrive can also fire usePortal, which swaps the map out
   * from under a fight that is about to pay spoils for a creature you left behind.
   */
  const busy = () => F.fighting || F.transiting;
  if (!busy()) readInput();
  if (!busy()) advanceMotion(dt);
  if (!busy()) {
    moveCreatures(dt);
    checkArmed();
    if (F.grace) {
      if (F.creatures.every((c) => Math.hypot(c.x - F.px, c.y - F.py) > REACH + 0.5)) F.grace = false;
    } else if (!F.ended) checkEncounters();
  }
  if (!F || F.ended) return false;
  render();
  F.last = now;
  return true;
}

function tick(now) {
  if (!F || F.ended) return;
  if (!screenActive()) { F.raf = 0; return; }
  if (!stepSim(now)) return;
  F.raf = requestAnimationFrame(tick);
}
function startLoop() {
  if (!F || F.raf) return;
  F.last = 0;
  F.raf = requestAnimationFrame(tick);
}

// ---------------------------------------------------------------------------
// HUD and endings
// ---------------------------------------------------------------------------

function toast(txt) {
  const box = F.host.querySelector('.fp-toasts');
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'dv-toast';
  el.textContent = txt;
  box.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}
function updateHaul() {
  const el = F.host.querySelector('.fp-haul');
  if (!el) return;
  const kills = Object.values(F.haul.kills).reduce((s, n) => s + n, 0);
  el.textContent = `☠ ${kills} · ${F.haul.gold}g`;
}

function leave() { if (F && !F.fighting && !F.ended) endDelve('called it a day'); }

function endDelve(reason, beaten = false) {
  if (!F || F.ended) return;
  F.ended = true;
  if (F.raf) cancelAnimationFrame(F.raf);
  clearTimeout(F.helpTimer);
  unwireInput();
  const h = F.haul;
  const killLines = Object.keys(h.kills).map((pid) => {
    const p = preyById(pid);
    return `<div class="ds-line">${p.glyph} ${p.name} × ${h.kills[pid]}</div>`;
  }).join('') || '<div class="ds-line dim">No kills — the dark keeps its own.</div>';
  const matLines = Object.keys(h.mats).map((m) => `<div class="ds-line">▪ ${m.replace(/_/g, ' ')} × ${h.mats[m]}</div>`).join('');
  F.host.insertAdjacentHTML('beforeend', `
    <div class="delve-summary">
      <div class="ds-card">
        <div class="ds-title">${beaten ? '🩸 Driven out' : '🏕 Back to daylight'}</div>
        <div class="ds-sub">${F.member.name.split(' ')[0]} ${reason}.</div>
        ${killLines}${matLines}
        ${h.gold ? `<div class="ds-line">🪙 +${h.gold} gold</div>` : ''}
        ${h.field ? `<div class="ds-line">📜 +${h.field} field insight</div>` : ''}
        <button class="dv-close" onclick="__delveFp.close()">Return to the Guild</button>
      </div>
    </div>`);
}

function close() {
  if (!F) return;
  const hooks = F.hooks, summary = F.haul;
  F.host.innerHTML = '';
  F = null;
  hooks.onEnd(summary);
}

window.__delveFp = { leave, close, help: () => helpUntil(9000) };

// Dev probe — the headless pane runs no rAF, so the sim is stepped by hand.
if (typeof window !== 'undefined') {
  window.__fpDebug = () => F && ({
    map: F.map && F.map.id, x: +F.px.toFixed(2), y: +F.py.toFixed(2), dir: COMPASS[F.dir], yaw: F.yaw,
    moving: !!(F.stepping || F.turning), fighting: F.fighting, armed: F.armed,
    quads: F.world.querySelectorAll('.fp-q').length, creatures: F.creatures.length,
    haul: F.haul.gold, seen: F.seen.size,
    // The three numbers that decide whether a swing lands: how far the nearest
    // creature is, and how far in front of you it is.
    near: F.creatures.map((c) => {
      const vx = c.x - F.px, vy = c.y - F.py, d = Math.hypot(vx, vy) || 1e-6;
      const [dx, dy] = DIRS[F.dir];
      return { id: c.prey.id, d: +d.toFixed(2), dot: +((vx * dx + vy * dy) / d).toFixed(2) };
    }).sort((a, b) => a.d - b.d).slice(0, 3),
  });
  window.__fpStep = (steps = 1, keys = '', ms = 16) => {
    if (!F || F.ended) return null;
    const map = { w: 'fwd', s: 'back', a: 'strafeL', d: 'strafeR', l: 'turnL', r: 'turnR', x: 'attack' };
    for (const k of keys) if (map[k]) F.keys[map[k]] = true;
    for (let i = 0; i < steps; i++) {
      if (!F || F.ended) break;
      stepSim((F.last || performance.now()) + ms);
    }
    for (const k of keys) if (map[k]) F.keys[map[k]] = false;
    return window.__fpDebug();
  };
}
