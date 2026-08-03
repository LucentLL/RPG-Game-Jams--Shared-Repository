/**
 * @file The tactical board, seen from inside it.
 *
 * A SECOND VIEW of the turn-based battle — never a second battle. Every rule
 * stays in crucible.js: the interval-model timeline (read at the left edge of a
 * step, move at the right edge, so speed buys information freshness rather than
 * extra steps), the snapshot belief tables, initiative, zones, resolution. This
 * module reads `S` and draws; it does not decide anything, and nothing here can
 * change the outcome of a turn. If a question about the fight can be answered
 * from this file, that is a bug in this file.
 *
 * WHY IT IS WORTH HAVING. The tactical rules are largely about facing, distance
 * and who knew what when — and all three are things a top-down grid states and a
 * first-person camera SHOWS. Standing in your fighter, the front/side/rear zones
 * are just what is in front of you, and watching a turn replay from inside it is
 * watching your own out-of-date information arrive.
 *
 * The camera takes a SUBJECT, never "the player": 3v3 is planned, so every
 * fighter is a place the camera can stand from the first line of this file.
 *
 * The board's own proportions are the Delve's, because they were measured
 * there — T=900 world px per tile against a lens fitted to the stage height.
 */
import { S } from './state.js';
import { GS } from './data/config.js';
import { createFpHands, fighterHandsSpec } from './fp-hands.js';
import { perspectiveFor, camLean, onView } from '../platform/view-prefs.js';

/**
 * World scale — and the reason a phone can draw this at all.
 *
 * WORLD UNITS ARE NOT SCREEN PIXELS, BUT THE COMPOSITOR CANNOT TELL. The
 * framing here was measured at 900 px per tile, which made the apron slabs
 * eighteen thousand CSS px long and the whole board some 350 megapixels of
 * layout area. Every one of those is a layer the browser rasters at CSS size ×
 * device pixel ratio, whether it covers the screen or four pixels of horizon —
 * on a dpr-2.6 phone that is gigabytes of texture for a scene Hexen drew into
 * 64 KB. Past the budget the compositor does not degrade; it silently drops
 * surfaces, which is the hole in the stands the player photographed.
 *
 * Shrinking the UNIT and growing the world by the same factor is a SIMILARITY:
 * the projection, the framing and every measured number below are unchanged —
 * `aimCamera` carries the factor as one scale3d — but every raster is K² the
 * memory. K = 1/3 takes 350 Mpx² to 40. This is the delve's trick, verbatim,
 * and it is the one thing these two battle files never got. @see delve-fp.js.
 *
 * Everything measured in WORLD PX carries ×K. Percentages, degrees and tiles
 * do not, and neither does the perspective — that is what keeps it a similarity.
 */
const T = 300;            // world px per tile   (was 900)
const K = T / 900;        // ratio to the scale this view was TUNED at
const EYE = 690 * K;      // eye height above the floor a fighter stands on
const STEP = 430 * K;     // one elevation step
const BLOCK_H = 900 * K;  // an impassable cell's height
const FIGHTER_H = 1200 * K; // the compositor's 96px canvas — ~31% of it is empty below the feet
const FOOT_PCT = 31.25;   // a PERCENTAGE — never scaled
const PERSP = 500, PERSP_AT = 720;   // the lens is untouched; that is the point
/**
 * Over-the-shoulder: how far back and up, and how far the lens tips down.
 * Tuned to the action-RPG reference the user gave: the fighter stands about
 * HALF the screen tall, head near centre, feet near the bottom edge. The
 * first cut (1.9 back, 560 up, 12°) was a crane shot — the character landed
 * in the bottom sixth of the frame at a sixth of its height. The numbers
 * fall out of the projection: eye at EYE+120 ≈ 810, one tile back, pitched
 * 10° → head ≈ screen centre, feet ≈ 92% down, span ≈ 46% of the stage.
 */
const OTS_BACK = 1.0, OTS_UP = 120 * K;   // tiles, world px
// The lean is `camLean()` — a slider, shared with action-fp and the crawler, so
// the three third-person cameras cannot drift. NEGATIVE is looking down, and
// that sign is the point: CSS `rotateX(+θ)` aims the camera UP, so the `+10`
// this file shipped for months was looking up ten degrees and the shot was
// mostly sky. @see view-prefs.js.

/** @type {?Object} the live view (null when first person is off) */
let V = null;

/** Every fighter on the board. A list from the outset — `S.fighters` is where a
 *  3v3 roster would land, and until it exists the two duellists are the list. */
function roster() {
  if (Array.isArray(S.fighters) && S.fighters.length) return S.fighters.filter(Boolean);
  return [S.p1, S.p2].filter(Boolean);
}
const alive = (f) => !!f && f.hp > 0;

/** Is the first-person view currently showing? */
export function tacFpActive() { return !!V; }

// ---------------------------------------------------------------------------
// Textures — the board's own art, cut for surfaces
// ---------------------------------------------------------------------------

const _tex = {};

/**
 * Shade a baked panel, in the bake.
 *
 * THE DIM IS NEVER A CSS FILTER. The delve learned this the hard way and wrote
 * it on the wall (delve.css: "NO filter on quads — a filter here is a private
 * GPU buffer per surface"), and these two battle views are the files that never
 * got the lesson. A filtered element cannot be tiled by the compositor: it has
 * to be rendered into ONE render surface. The apron slabs here are 18,900 CSS
 * px on their long edge — 49,000 device px on a phone at dpr 2.6, several times
 * any mobile GPU's maximum texture size — and a surface that cannot be
 * allocated is silently skipped. That is a whole colosseum that does not draw.
 *
 * Baking the same brightness into a 32px texture costs nothing and looks
 * identical. @param k 1 = untouched, 0.82 = the old brightness(0.82).
 */
function bake(g, w, h, k) {
  if (k >= 1) return;
  g.globalAlpha = 1 - k;
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = '#000';
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
}

/** A flat colour panel with a little noise, for the sides of things. Drawn
 *  rather than cropped: the battlefield bake is a top-down sheet and has no
 *  vertical faces in it. (Exported: action-fp.js dresses the SAME colosseum
 *  around the real-time arena, and two copies of these bakes would drift.)
 *  `dim` carries what .tfp-wall's filter used to — see bake(). */
export function facePanel(key, base, dark, dim) {
  if (_tex[key]) return _tex[key];
  const cv = document.createElement('canvas');
  cv.width = 32; cv.height = 32;
  const g = cv.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 32);
  grd.addColorStop(0, base); grd.addColorStop(1, dark);
  g.fillStyle = grd; g.fillRect(0, 0, 32, 32);
  g.globalAlpha = 0.16;
  for (let i = 0; i < 60; i++) {
    g.fillStyle = (i % 2) ? '#000' : '#fff';
    g.fillRect((i * 7) % 32, (i * 13) % 32, 2, 2);
  }
  g.globalAlpha = 1;
  bake(g, 32, 32, dim == null ? 1 : dim);
  return (_tex[key] = cv.toDataURL());
}

/** What .tfp-wall and .tfp-ring's filters were worth, now that the quads carry
 *  no filter at all. WALL_DIM is the old brightness(0.82); the ring wore both
 *  .tfp-wall and .tfp-ring, so it was 0.82 × 0.9. */
export const WALL_DIM = 0.82, RING_DIM = 0.82 * 0.9;

/** The trodden ground OUTSIDE the lists — the apron between the fence and the
 *  stands. Mottled and dark so the bright play field stays the focus. */
export function apronPanel() {
  if (_tex.apron) return _tex.apron;
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 64;
  const g = cv.getContext('2d');
  g.fillStyle = '#3d4a2c';
  g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 240; i++) {
    const h = (i * 2654435761) >>> 0;
    g.fillStyle = ['#46543311', '#33402444', '#4e5c3a22', '#2c361e33'][h % 4];
    g.fillRect(h % 64, (h >> 6) % 64, 2 + (h >> 12) % 3, 1 + (h >> 14) % 2);
  }
  return (_tex.apron = cv.toDataURL());
}

/** The stands: sandstone tiers with a crowd dotted along every row. This is
 *  what turns "the grid stops being drawn" into somewhere a match happens. */
export function standsPanel() {
  if (_tex.stands) return _tex.stands;
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 96;
  const g = cv.getContext('2d');
  // Base masonry below the first tier.
  const grd = g.createLinearGradient(0, 0, 0, 96);
  grd.addColorStop(0, '#a08a5c'); grd.addColorStop(1, '#5c4c30');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 96);
  // Tier rows, climbing away: a dark riser, a lit tread, and the crowd on it.
  const CROWD = ['#d8b06a', '#b86a4a', '#7a94c8', '#88b06a', '#c8c8d0', '#a86a88'];
  for (let t = 0; t < 5; t++) {
    const y = 8 + t * 15;
    g.fillStyle = '#4a3c24'; g.fillRect(0, y + 9, 128, 4);        // riser shadow
    g.fillStyle = t % 2 ? '#b09a68' : '#a89060';                  // tread
    g.fillRect(0, y + 4, 128, 5);
    for (let x = 2; x < 128; x += 5) {                            // the crowd
      const h = ((x * 31 + t * 131) * 2654435761) >>> 0;
      if ((h & 7) < 6) {
        g.fillStyle = CROWD[h % CROWD.length];
        g.fillRect(x + (h >> 8) % 2, y, 3, 5);
        g.fillStyle = '#e8c898';
        g.fillRect(x + (h >> 8) % 2, y - 1, 3, 2);                // a face over each tunic
      }
    }
  }
  // Parapet at the foot of the stands.
  g.fillStyle = '#8a744c'; g.fillRect(0, 88, 128, 8);
  g.fillStyle = '#c8b088'; g.fillRect(0, 86, 128, 3);
  bake(g, 128, 96, RING_DIM);   // was .tfp-wall + .tfp-ring's two filters
  return (_tex.stands = cv.toDataURL());
}

/** Pixel clouds for the sky behind everything. Deterministic — the sky must
 *  bake the same every mount. */
export function cloudsPanel() {
  if (_tex.clouds) return _tex.clouds;
  const cv = document.createElement('canvas');
  cv.width = 420; cv.height = 160;
  const g = cv.getContext('2d');
  const puff = (x, y, s) => {
    const row = (dx, dy, w, h, c) => { g.fillStyle = c; g.fillRect(x + dx * s, y + dy * s, w * s, h * s); };
    row(8, 10, 36, 9, 'rgba(255,255,255,0.9)');
    row(0, 16, 52, 9, 'rgba(255,255,255,0.9)');
    row(14, 3, 20, 9, 'rgba(255,255,255,0.85)');
    row(4, 23, 44, 5, 'rgba(210,220,234,0.8)');
  };
  puff(24, 22, 1.2);
  puff(200, 60, 0.8);
  puff(310, 16, 1.0);
  return (_tex.clouds = cv.toDataURL());
}

/** How far the apron runs past the lists, and how tall the stands rise. The
 *  apron must out-reach the shoulder camera's pull-back (OTS_BACK tiles), or
 *  stepping to the board's edge puts the eye outside the world again — one
 *  tile is the requirement, and three is comfort. Six bought a twenty-one-tile
 *  ring whose far end nobody can see and every phone had to allocate. */
const APRON_T = 3, RING_H = 2400 * K;
/** No layout box may run longer than this many tiles. A slab wider than the
 *  GPU's maximum texture is not clipped or downscaled — it is dropped, whole.
 *  Whole tiles, so the repeating apron and stands textures never seam. */
export const SEG_T = 3;

// ---------------------------------------------------------------------------
// Geometry — rebuilt only when the BOARD changes, never per frame
// ---------------------------------------------------------------------------

const elevAt = (c, r) => (S.arenaElevation ? (S.arenaElevation[r][c] || 0) : 1);
const passAt = (c, r) => (S.arenaPassable ? S.arenaPassable[r][c] === 1 : true);
/**
 * How low the ground sits in a cell.
 *
 * THE CAMERA MUST NOT IMPLY A RULE IT DOES NOT ENFORCE. In the tactical lens
 * elevation is cosmetic: `canTraverseTerrain` says so in as many words, and
 * `getCellElevation`/`getCellCost` have no callers at all — the ONLY terrain
 * gate the rules honour is `arenaPassable`. The templates use elevation 0 (the
 * water basin) and 1 (everything else), nothing higher.
 *
 * So water is sunk by a SHALLOW amount — enough to read as a basin you wade
 * into, never enough to read as a ledge you must climb. Drawing it as a proper
 * step would tell the player something about movement that is not true, and a
 * view that lies about the rules is worse than no view.
 */
const WADE = 90 * K;
const liftAt = (c, r) => (elevAt(c, r) === 0 ? WADE : 0);

function quad(tex, w, h, tx, ty, tz, rot, cls, tint) {
  const veil = tint ? `linear-gradient(${tint},${tint}),` : '';
  return `<div class="tfp-q ${cls || ''}" style="width:${w}px;height:${h}px;margin-left:${-w / 2}px;margin-top:${-h / 2}px;`
    + `background-image:${veil}url(${tex});transform:translate3d(${tx}px,${ty}px,${tz}px) ${rot || ''}"></div>`;
}

/**
 * The same quad, cut into panels no longer than SEG_T tiles.
 *
 * A slab is one compositor surface however far away it is, and the apron ran
 * 18,900 px along its length — several times what a phone will allocate. It was
 * not drawn small; it was not drawn at all. Panels repeat the same texture, so
 * the surface is bounded and the seam falls on a tile boundary.
 *
 * `cut` says which of the ELEMENT's own dimensions is the long one, and `axis`
 * which WORLD axis it runs along — the two differ under rotation, and guessing
 * either from the other is how a wall ends up split across its height.
 */
/**
 * The play field: ONE baked picture of the whole board, laid down as a grid of
 * panels rather than a single slab.
 *
 * Every other surface here repeats a small tile, so `strip` can cut it anywhere.
 * This one cannot — it is a picture, stretched to fit — so cutting it the same
 * way would draw the entire board once per panel. Each panel instead blows the
 * background up by N and shifts it to its own share: `background-size:N00%` with
 * `background-position` at 0/50/100% is the standard way to take the k-th slice
 * of an image, and it lands pixel-exact because the panels are equal.
 *
 * It is worth the trouble because 9 tiles at T=900 is 8,100 px square — 21,000
 * device px on the reported phone, past every mobile GPU's texture ceiling on a
 * quad the player is standing on.
 */
function field(out, tex, span) {
  const n = Math.max(1, Math.ceil(span / (SEG_T * T)));
  if (n === 1) { out.push(quad(tex, span, span, span / 2, 0, span / 2, 'rotateX(90deg)', 'tfp-floor')); return; }
  const s = span / n, pct = 100 / (n - 1);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      out.push('<div class="tfp-q tfp-floor" style="'
        + `width:${s}px;height:${s}px;margin-left:${-s / 2}px;margin-top:${-s / 2}px;`
        + `background-image:url(${tex});background-size:${n * 100}% ${n * 100}%;`
        + `background-position:${(c * pct).toFixed(4)}% ${(r * pct).toFixed(4)}%;`
        + `transform:translate3d(${(c + 0.5) * s}px,0px,${(r + 0.5) * s}px) rotateX(90deg)"></div>`);
    }
  }
}

function strip(out, tex, w, h, cx, cy, cz, axis, rot, cls, cut) {
  const tall = cut === 'h';
  const len = tall ? h : w;
  const n = Math.max(1, Math.round(len / (SEG_T * T))), seg = len / n;
  for (let i = 0; i < n; i++) {
    const off = -len / 2 + seg * (i + 0.5);
    out.push(quad(tex, tall ? w : seg, tall ? seg : h,
      cx + (axis === 'x' ? off : 0), cy + (axis === 'y' ? off : 0), cz + (axis === 'z' ? off : 0),
      rot, cls));
  }
}

/**
 * Build the board. One big quad carries the whole 9×9 ground, because the
 * battlefield is already baked as a single image for the grid's background —
 * the same art, so the two views cannot disagree about what the field looks
 * like. Only the things that stand OFF that plane cost their own geometry.
 */
function buildBoard() {
  const out = [];
  // A missing bake used to mean NO GROUND QUAD AT ALL — a hole where the field
  // is, showing stage gradient. The URI is only written inside the 2D grid's
  // own bake, so any path that reaches this view first left the board floorless.
  const ground = S.arenaGroundURI || facePanel('fieldFallback', '#3f5a2e', '#27381c');
  const span = GS * T;
  field(out, ground, span);

  const rock = facePanel('rock', '#6b6257', '#2e2a24', WALL_DIM);
  const rockTop = facePanel('rockTop', '#7d7466', '#5c5548');
  const edge = facePanel('edge', '#4a4640', '#22201c', WALL_DIM);

  for (let r = 0; r < GS; r++) {
    for (let c = 0; c < GS; c++) {
      const x0 = c * T, z0 = r * T, cx = x0 + T / 2, cz = z0 + T / 2;
      // An impassable cell is a solid block you cannot see over — this is the
      // cover the rules already respect, finally drawn as cover.
      if (!passAt(c, r)) {
        const h = BLOCK_H, yc = -h / 2;
        if (r + 1 >= GS || passAt(c, r + 1)) out.push(quad(rock, T, h, cx, yc, z0 + T, '', 'tfp-wall'));
        if (r - 1 < 0 || passAt(c, r - 1)) out.push(quad(rock, T, h, cx, yc, z0, 'rotateY(180deg)', 'tfp-wall'));
        if (c + 1 >= GS || passAt(c + 1, r)) out.push(quad(rock, T, h, x0 + T, yc, cz, 'rotateY(90deg)', 'tfp-wall'));
        if (c - 1 < 0 || passAt(c - 1, r)) out.push(quad(rock, T, h, x0, yc, cz, 'rotateY(-90deg)', 'tfp-wall'));
        out.push(quad(rockTop, T, T, cx, -h, cz, 'rotateX(90deg)', 'tfp-floor'));
        continue;
      }
      // Water. Drawn as a shallow basin you can see the bottom of, not a drop:
      // you may walk into it, and the view must not suggest otherwise. Its
      // colour is already in the baked ground, so this is only the depth.
      if (elevAt(c, r) === 0) {
        out.push(quad(rock, T, WADE, cx, WADE / 2, z0, 'rotateY(180deg)', 'tfp-wall', 'rgba(24,58,120,0.5)'));
        out.push(quad(rock, T, WADE, x0, WADE / 2, cz, 'rotateY(-90deg)', 'tfp-wall', 'rgba(24,58,120,0.5)'));
      }
    }
  }
  // The lip of the lists. You cannot leave the grid, so its edge is a low
  // fence — and past the fence the world KEEPS GOING: an apron of trodden
  // ground, then the stands, then sky. The shoulder camera stands up to two
  // tiles outside the board, and what it used to see out there was nothing.
  // Every one of these four faced OUTWARD — away from the board — and
  // backface-visibility:hidden then made the fence invisible from the only
  // place anyone stands. Compare the ring below: same north side, no rotation.
  // It is two-sided because the shoulder camera does step out onto the apron.
  const B = BLOCK_H * 0.55, by = -B / 2;
  strip(out, edge, span, B, span / 2, by, 0, 'x', '', 'tfp-wall tfp-2s', 'w');
  strip(out, edge, span, B, span / 2, by, span, 'x', 'rotateY(180deg)', 'tfp-wall tfp-2s', 'w');
  strip(out, edge, span, B, 0, by, span / 2, 'z', 'rotateY(90deg)', 'tfp-wall tfp-2s', 'w');
  strip(out, edge, span, B, span, by, span / 2, 'z', 'rotateY(-90deg)', 'tfp-wall tfp-2s', 'w');

  // The apron — four runs of trodden ground from the fence out to the stands.
  // Under rotateX(90) the element's HEIGHT is what runs along world Z, which is
  // why the east/west runs cut on 'h' while the north/south ones cut on 'w'.
  const A = APRON_T * T, apron = apronPanel();
  strip(out, apron, span + 2 * A, A, span / 2, 0, -A / 2, 'x', 'rotateX(90deg)', 'tfp-floor tfp-apron', 'w');
  strip(out, apron, span + 2 * A, A, span / 2, 0, span + A / 2, 'x', 'rotateX(90deg)', 'tfp-floor tfp-apron', 'w');
  strip(out, apron, A, span, -A / 2, 0, span / 2, 'z', 'rotateX(90deg)', 'tfp-floor tfp-apron', 'h');
  strip(out, apron, A, span, span + A / 2, 0, span / 2, 'z', 'rotateX(90deg)', 'tfp-floor tfp-apron', 'h');

  // The colosseum ring — crowd-dotted stands facing the field on all four
  // sides, tall enough that no camera the view can produce sees past them
  // except into sky. (tfp-ring tiles the texture along the wall instead of
  // stretching one crowd across half a kilometre of masonry.)
  const stands = standsPanel(), ry = -RING_H / 2, rl = span + 2 * A;
  strip(out, stands, rl, RING_H, span / 2, ry, -A, 'x', '', 'tfp-wall tfp-ring', 'w');
  strip(out, stands, rl, RING_H, span / 2, ry, span + A, 'x', 'rotateY(180deg)', 'tfp-wall tfp-ring', 'w');
  strip(out, stands, rl, RING_H, -A, ry, span / 2, 'z', 'rotateY(90deg)', 'tfp-wall tfp-ring', 'w');
  strip(out, stands, rl, RING_H, span + A, ry, span / 2, 'z', 'rotateY(-90deg)', 'tfp-wall tfp-ring', 'w');

  V.world.querySelector('.tfp-geo').innerHTML = out.join('');
  V.boardKey = boardKey();
}

/** What "the board changed" means — the arena and its shape, nothing per-turn. */
function boardKey() {
  return (S.arenaName || '') + '|' + (S.arenaGroundURI || '').length
    + '|' + (S.arenaElevation ? S.arenaElevation.join(';') : '')
    + '|' + (S.arenaPassable ? S.arenaPassable.join(';') : '');
}

// ---------------------------------------------------------------------------
// The people on it
// ---------------------------------------------------------------------------

function billboard(cls, w, h) {
  const el = document.createElement('div');
  el.className = 'tfp-bb ' + cls;
  el.style.width = w + 'px';
  el.style.height = h + 'px';
  el.style.marginLeft = (-w / 2) + 'px';
  V.world.querySelector('.tfp-bbs').appendChild(el);
  return el;
}

function ensureActors() {
  const live = roster();
  for (const f of live) {
    if (V.actors.has(f)) continue;
    const el = billboard('tfp-fighter', FIGHTER_H * 0.75, FIGHTER_H);
    const cv = document.createElement('canvas');
    cv.width = 96; cv.height = 96;
    cv.style.width = '100%'; cv.style.height = '100%';
    cv.style.transform = `translateY(${FOOT_PCT}%)`;   // stand the art on its soles
    el.appendChild(cv);
    const bar = document.createElement('i');
    el.appendChild(bar);
    V.actors.set(f, { el, cv, bar, drawn: -1 });
  }
  for (const [f, a] of V.actors) {
    if (live.indexOf(f) < 0) { a.el.remove(); V.actors.delete(f); }
  }
}

/**
 * Draw a fighter facing the way it faces RELATIVE TO THE CAMERA.
 *
 * The compositor picks its sheet row from `fighter.facing`, so a camera-relative
 * rotation is that angle minus the camera's — Doom's trick, and it costs nothing
 * because a shallow object over the real fighter inherits every other field.
 * Shadowing `facing` on the proxy also means nothing is ever written back onto
 * the fighter the rules own.
 */
function drawActor(f, a, yaw) {
  const gfx = window.__ranchGfx;
  if (!gfx || !gfx.renderActor) return;
  const view = Object.create(f);
  view.facing = (typeof f.facing === 'number' ? f.facing : Math.PI) - yaw;
  try { gfx.renderActor(a.cv, view); } catch (e) { /* a half-loaded sheet is not worth a crash */ }
}

// ---------------------------------------------------------------------------
// The plan, drawn on the ground you would walk it over
// ---------------------------------------------------------------------------

/**
 * The queued path as footfalls ahead of you.
 *
 * Only `direct` steps have a destination at plan time; `pursue`, `flank`, `kite`
 * and the rest are INTENTS resolved against wherever the enemy turns out to be,
 * so this stops at the first of them and marks it — showing a guessed
 * destination for a dynamic step would be inventing information the rules
 * deliberately withhold until the turn runs.
 */
function buildPath() {
  const host = V.world.querySelector('.tfp-path');
  const subj = V.subject;
  if (!host) return;
  if (!subj || S.gamePhase !== 'plan' || S.executing) { host.innerHTML = ''; V.pathKey = ''; return; }
  const q = S.moveQueue || [];
  const key = subj.x + ',' + subj.y + '|' + q.map((s) => s.type + (s.dx || 0) + (s.dy || 0)).join(';');
  if (key === V.pathKey) return;
  V.pathKey = key;
  const dot = facePanel('step', '#ffe9a8', '#c9a63f');
  const dyn = facePanel('dyn', '#a8d4ff', '#3f7ac9');
  let x = subj.x, y = subj.y;
  const out = [];
  for (const s of q) {
    if (s.type !== 'direct') {                       // an intent, not a destination
      out.push(quad(dyn, T * 0.42, T * 0.42, x * T + T / 2, liftAt(x, y) - 8 * K, y * T + T / 2, 'rotateX(90deg)', 'tfp-mark'));
      break;
    }
    x += s.dx; y += s.dy;
    if (x < 0 || y < 0 || x >= GS || y >= GS) break;
    out.push(quad(dot, T * 0.3, T * 0.3, x * T + T / 2, liftAt(x, y) - 8 * K, y * T + T / 2, 'rotateX(90deg)', 'tfp-mark'));
  }
  host.innerHTML = out.join('');
}

// ---------------------------------------------------------------------------
// The camera
// ---------------------------------------------------------------------------

function fitLens() {
  if (!V) return;
  const st = V.host.querySelector('.tfp-stage');
  const h = st && st.clientHeight;
  if (!h) return;                                    // measured before it is shown
  st.style.perspective = perspectiveFor(h).toFixed(1) + 'px';
}

// Either slider moves the picture now. `V.wtf` is the camera's write-guard;
// clearing it is what lets the next placement actually write.
onView(() => { if (!V) return; fitLens(); V.wtf = ''; aimCamera(); });

/** How far back the shoulder camera may pull before an impassable block
 *  stands between it and the fighter. A block is only BLOCK_H tall and the
 *  raised eye sees over its top — which cut the subject off at the waist and
 *  read as "standing on a wall". Off-board is open ground (the apron). */
function backOff(fx, fy, yaw, want) {
  if (!S.arenaPassable) return want;
  let ok = 0.45;
  for (let s = 0.2; s <= want + 1e-6; s += 0.2) {
    const cx = fx + 0.5 - Math.sin(yaw) * s, cy = fy + 0.5 + Math.cos(yaw) * s;
    const tx = Math.floor(cx), ty = Math.floor(cy);
    if (tx >= 0 && ty >= 0 && tx < GS && ty < GS && S.arenaPassable[ty][tx] === 0) {
      return Math.max(0.45, s - 0.35);
    }
    ok = s;
  }
  return Math.max(0.45, ok);
}

/** Place the world so the subject's eye is at the origin, looking down its facing. */
function aimCamera() {
  const f = V.subject;
  if (!f || !V.world) return;
  const yaw = (typeof f.facing === 'number' ? f.facing : Math.PI);
  const deg = yaw * 180 / Math.PI;
  const lift = liftAt(f.x, f.y);
  let ex = (f.x + 0.5) * T, ez = (f.y + 0.5) * T, ey = lift - EYE, pitch = 0;
  if (V.pov === 'shoulder') {
    // Behind and above, looking slightly down — the fighter stays in frame,
    // and the pull-back stops short of any rock that would hide them.
    const back = backOff(f.x, f.y, yaw, OTS_BACK);
    ex -= Math.sin(yaw) * back * T;
    ez += Math.cos(yaw) * back * T;
    ey -= OTS_UP;
    pitch = camLean();
  }
  V.yaw = yaw;
  // GUARDED, and rounded. This ran unconditionally every frame with raw
  // Math.sin output in the string, so the transform was "new" on every single
  // rAF even with the camera parked — and every rewrite makes the compositor
  // re-raster the surfaces under .tfp-world's will-change, which is the tearing
  // the player sees while turning. Both siblings already do this (action-fp's
  // V.wtf, the delve's F._wtf); this file is the one that never did.
  // The scale is OUTERMOST and undoes K exactly, so the image on screen is the
  // one the framing was measured at — only the rasters underneath it shrank.
  const s = (1 / K).toFixed(4);
  const wtf = `scale3d(${s},${s},${s}) rotateX(${pitch}deg) rotateY(${deg.toFixed(2)}deg) `
    + `translate3d(${(-ex).toFixed(1)}px,${(-ey).toFixed(1)}px,${(-ez).toFixed(1)}px)`;
  if (wtf !== V.wtf) V.world.style.transform = (V.wtf = wtf);
}

/**
 * The held viewmodel — the subject's real kit raised to the screen, exactly
 * the delve's hands (shared module). Swings mirror the subject's own anim
 * transitions during the turn replay, so what the hands do and what the
 * rules resolved are one event. Hidden by CSS over the shoulder; transitions
 * are swallowed while hidden so re-entry doesn't replay a stale swing.
 */
function syncHands() {
  if (!V || !V.handsEl) return;
  const f = V.subject;
  if (!f) return;
  if (V.handsFor !== f) {
    if (V.hands) V.hands.dispose();
    V.handsFor = f;
    V.hands = createFpHands(V.handsEl, fighterHandsSpec(f));
    V.lastAnim = '';
  }
  const anim = (f.anim && f.anim.name) || 'idle';
  if (V.pov !== 'first') { V.lastAnim = anim; return; }
  if (anim !== V.lastAnim) {
    if (anim === 'slash' || anim === 'nockBow') V.hands.swing();
    else if (anim === 'parry') V.hands.brace();
    V.lastAnim = anim;
  }
}

// ---------------------------------------------------------------------------
// The public surface — three calls, all of them one-way
// ---------------------------------------------------------------------------

/** Turn the view on (building it if needed) or off. Returns the new state. */
export function tacFpToggle(on) {
  const want = on == null ? !V : !!on;
  if (want && !V) mount();
  else if (!want && V) {
    // The resize listener closes over the module-level V — left attached it
    // fires on a null V after exit (one throw per prior FP entry, per resize).
    if (V.onResize) {
      window.removeEventListener('resize', V.onResize);
      window.removeEventListener('orientationchange', V.onResize);
    }
    if (V.ro) V.ro.disconnect();
    if (V.hands) V.hands.dispose();
    V.host.remove(); V = null;
  }
  if (V) { tacFpSync(); fitLens(); }
  return !!V;
}

/** Whose eyes. Takes a fighter (3v3-ready) or an index into the roster. */
export function tacFpSetSubject(who) {
  if (!V) return;
  const list = roster();
  V.subject = typeof who === 'number' ? list[who] : who;
  if (!V.subject) V.subject = list[0];
  V.pathKey = '';
  aimCamera();
}

/** 'first' — standing in them; 'shoulder' — behind and above. */
export function tacFpSetPov(kind) {
  if (!V) return;
  V.pov = kind === 'shoulder' ? 'shoulder' : 'first';
  V.host.classList.toggle('tfp-ots', V.pov === 'shoulder');
  aimCamera();
  if (V.hands) V.hands.fit();   // the hands layer may have just un-hidden
}
export function tacFpPov() { return V ? V.pov : 'first'; }

/**
 * The board or the plan changed. Cheap: geometry is rebuilt only when the ARENA
 * is different, which is once a match.
 */
export function tacFpSync() {
  if (!V) return;
  // A new match REPLACES p1/p2 with fresh objects, so a subject can be alive and
  // yet no longer be anybody on this board. Identity, not health, is the test.
  const list = roster();
  if (!V.subject || list.indexOf(V.subject) < 0 || !alive(V.subject)) {
    V.subject = list.find(alive) || list[0] || null;
    V.pathKey = '';
  }
  if (boardKey() !== V.boardKey) buildBoard();
  ensureActors();
  buildPath();
  aimCamera();
  placeActors();
}

/** Dev probe — the headless pane runs no rAF, so the view is stepped by hand. */
if (typeof window !== 'undefined') {
  window.__tacFpDebug = () => V && ({
    pov: V.pov,
    subject: V.subject && V.subject.name,
    subjectAt: V.subject && [V.subject.x, V.subject.y],
    yawDeg: +(V.yaw * 180 / Math.PI).toFixed(1),
    quads: V.world.querySelectorAll('.tfp-q').length,
    marks: V.world.querySelectorAll('.tfp-path .tfp-q').length,
    actors: [...V.actors].map(([f, a]) => ({
      name: f.name, at: [f.x, f.y], hidden: !!a.selfHidden,
      placed: !!a.tf, hp: a.hpw,
    })),
  });
  window.__tacFpStep = () => { tacFpFrame(); return window.__tacFpDebug(); };
}

/** Per frame, from crucible's own animation loop. Placement only. */
export function tacFpFrame() {
  if (!V || !V.subject) return;
  aimCamera();
  placeActors();
  syncHands();
}

/**
 * Put everyone where they stand. Called from the frame loop AND from sync, so a
 * board that changes while the loop is stalled — or a headless probe stepping it
 * by hand — still shows the truth rather than the last frame that happened to run.
 */
function placeActors() {
  const yaw = V.yaw;
  for (const [f, a] of V.actors) {
    const show = alive(f);
    if (show !== a.shown) { a.el.style.display = (a.shown = show) ? '' : 'none'; }
    if (!show) continue;
    // The subject's own body is not drawn in first person — you do not see
    // yourself from inside your own head — but it IS from over the shoulder.
    const self = f === V.subject && V.pov !== 'shoulder';
    if (self !== a.selfHidden) { a.el.style.visibility = (a.selfHidden = self) ? 'hidden' : ''; }
    if (self) continue;
    const tf = `translate3d(${((f.x + 0.5) * T).toFixed(1)}px,${liftAt(f.x, f.y)}px,${((f.y + 0.5) * T).toFixed(1)}px) rotateY(${(-yaw * 180 / Math.PI).toFixed(1)}deg)`;
    if (tf !== a.tf) a.el.style.transform = (a.tf = tf);
    const hp = Math.max(0, Math.min(1, f.hp / (f.maxHp || f.hp || 1)));
    const w = (hp * 100).toFixed(0) + '%';
    if (w !== a.hpw) { a.bar.style.width = (a.hpw = w); }
    drawActor(f, a, yaw);
  }
}

function mount() {
  const screen = document.getElementById('battleScreen');
  if (!screen) return;
  const host = document.createElement('div');
  host.className = 'tfp-host';
  // The tile, published to CSS. Anything in battle.css measured in WORLD px —
  // the apron's repeat, the HP bar over a fighter's head, the standee shadow —
  // lives INSIDE the scaled world and has to shrink with it, or it renders K
  // times too big. This is the trap that makes K stop being a similarity.
  host.style.setProperty('--tfp-t', T + 'px');
  host.innerHTML = '<div class="tfp-stage"><div class="tfp-world">'
    + '<div class="tfp-geo"></div><div class="tfp-path"></div><div class="tfp-bbs"></div>'
    + '</div></div><div class="tfp-haze"></div><div class="fp-hands"></div>';
  // The sky — behind everything the stage draws. Blue settling to the haze
  // colour at the horizon (the stage's centre), pixel clouds riding high.
  host.style.background = `url(${cloudsPanel()}) repeat-x 0 6% / auto 30%,`
    + 'linear-gradient(rgb(92,132,188) 0%, rgb(128,156,196) 34%, rgb(156,174,196) 50%, rgb(112,120,132) 58%, rgb(74,80,92) 100%)';
  screen.appendChild(host);
  V = {
    host, world: host.querySelector('.tfp-world'),
    subject: null, pov: 'first', yaw: 0, wtf: '',
    actors: new Map(), boardKey: '', pathKey: '',
    handsEl: host.querySelector('.fp-hands'), hands: null, handsFor: null, lastAnim: '',
  };
  // A phone's GPU is not a desktop's. The delve already tiers itself this way;
  // the battle views never did, so every fighter carried a live blur.
  if (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) {
    document.body.classList.add('fp-lite');
  }
  tacFpSetSubject(0);
  syncHands();
  if (!V.onResize) {
    V.onResize = () => { fitLens(); if (V && V.hands) V.hands.fit(); };
    window.addEventListener('resize', V.onResize);
    // A phone rotating, and Android's URL bar sliding away, both change the
    // stage's height WITHOUT a resize event — and fitLens is what turns the
    // stage height into the lens. Watch the element itself; the observer also
    // fires once on observe, which self-heals the case where the view mounts
    // while the screen is still display:none and clientHeight is 0.
    const st = host.querySelector('.tfp-stage');
    if (st && typeof ResizeObserver === 'function') {
      V.ro = new ResizeObserver(V.onResize);
      V.ro.observe(st);
    }
    window.addEventListener('orientationchange', V.onResize);
  }
}
