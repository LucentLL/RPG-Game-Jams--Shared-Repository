/**
 * @file The action arena, seen from inside it.
 *
 * A SECOND VIEW of the real-time battle — never a second battle. Every rule
 * stays in crucible.js: movement, cooldowns, charge tiers, terrain gates,
 * line of sight, the AI. This module reads the live fighters and draws them
 * from a camera standing in (or just behind) your own; it decides nothing.
 * If a question about the fight can be answered from this file, that is a
 * bug in this file.
 *
 * It is tactical-fp's sibling and shares its dressing (the colosseum ring,
 * the apron, the clouds — imported, so the two arenas cannot drift), but its
 * own machine, because the two boards are different animals: the tactical
 * board is 9×9 cells that change on a turn boundary, and this one is two
 * fighters at continuous coordinates moving every frame under a camera that
 * has to decide for itself where to look.
 *
 * YOU STEER THE CAMERA, the camera never steers you. The first cut eased the
 * yaw toward the opponent's bearing (a soft lock-on) and the player's verdict
 * was immediate: it forces your perspective. This is the Wilds' grammar now —
 * the camera looks where YOUR fighter faces, and the controls are the delve's
 * translated to real time: W/S walk the way you are looking (and back), A/D
 * sidestep, ←/→ (and Q/E) turn, the stick turns on X and walks on Y.
 * `actFpSteer` owns that mapping; actionTick calls it in place of its own
 * key→vector build, and it also writes `p1.facing` — so the fighter's pose,
 * a Blink's direction and the camera are all one fact: where you look.
 *
 * AND THE MOUSE IS THE HEAD. Turning began life on a painted thumb-stick,
 * which on a desktop meant dragging a knob to do what a mouse does natively;
 * the stage now takes a pointer lock and mouse travel goes straight into the
 * yaw as an ANGLE, not a rate — the distance your hand moved is the distance
 * the view turned, which is the whole reason a mouse aims better than a key.
 * Mouse Y tips a small free pitch on top, and that pitch SHEARS the lens rather
 * than rotating the world (@see aimLens — it is Hexen's trick, and it is the fix
 * for "enemies look massive when I look up"). Over the shoulder there is no free
 * pitch at all: that camera holds a three-quarter framing, and a pitch the
 * player can move is a pitch that leaves it. Its lean and the field of view are
 * both sliders now — @see view-prefs.js.
 *
 * Nothing here can put the eye outside the world: the board's own fence,
 * apron and stands (tall past any pull-back) come with the dressing — and the
 * shoulder camera CLAMPS at impassable rock, because a boulder standing
 * between the eye and your own fighter reads as standing on a wall.
 */
import { facePanel, apronPanel, standsPanel, cloudsPanel, WALL_DIM, SEG_T, SEG_GROUND, LOW_POWER } from './tactical-fp.js';
import { createFpHands, fighterHandsSpec } from './fp-hands.js';
import { createLook, touchPrimary } from '../platform/input.js';
import { ladderArt } from './arena-terrain.js';
import { perspectiveFor, camLean, onView, view } from '../platform/view-prefs.js';
import { createGlWorld } from '../platform/gl-world.js';

/** World scale — the delve's, via tactical-fp, so a person is the same size
 *  standing in any of the three grounds, and shrunk by the same K for the same
 *  reason: a world unit is not a screen pixel, but the compositor rasters as if
 *  it were. @see tactical-fp.js's note — this file is its twin in every respect
 *  and the two must never drift on this. */
const T = 300;
const K = T / 900;
const EYE = 690 * K;
const STEP = 430 * K;          // one terrain level, world px
const FIGHTER_H = 1200 * K;
const FOOT_PCT = 31.25;        // a PERCENTAGE — never scaled
// The lens the framing was originally measured through. Kept as documentation
// rather than used: the FoV slider's 72° default reproduces
// `PERSP * (h / PERSP_AT)` to the pixel, so every number below still holds at
// the default and anything you see is a deliberate change. @see view-prefs.js.
const PERSP = 500, PERSP_AT = 720;
/**
 * The shoulder camera's ORBIT RADIUS from the subject's eye, in tiles — the one
 * fixed number it has left. Kept in lockstep with tactical-fp.
 *
 * There is no lift constant any more: the rise is `R·sin(angle)` and the
 * pull-back `R·cos(angle)`, so the camera rides a circle around the aim and
 * `camLean()` points it at the centre of that circle. That is what stops the
 * subject climbing the frame as the angle steepens.
 *
 * The lean is NEGATIVE, and the sign is the whole point: CSS `rotateX(+θ)` puts
 * a point straight ahead BELOW the screen centre, which means the camera is
 * aimed above it — the `+10` this replaced was looking UP ten degrees, which is
 * why the shot was three-quarters sky with the fighter pressed into the bottom
 * edge and nothing on the ground readable. `camLean()` returns the negation of
 * a positive "degrees down", so the sign can only be got wrong in one place.
 */
const OTS_BACK = 1.0;
// Three tiles, matching the tactical board: the apron only has to out-reach the
// shoulder camera's one-tile pull-back, and six bought a ring twice as wide as
// anyone can see for twice the surface every device had to allocate.
const APRON_T = 3, RING_H = 2400 * K;
/** How fast held turn input swings the view, rad/s. The delve's 45° / 130ms
 *  works out to ~6 rad/s in bursts; continuous steering wants less. */
const TURN_RATE = 3.1;
/** How far the free look may tip, degrees. The original reason for keeping this
 *  small — a steep pitch showing a fighter's cardboard edge — no longer applies
 *  now that pitch is a shear (@see aimLens); billboards never rotate, so they
 *  cannot be caught being paper at any angle. Left at 24 because that is what
 *  the fight was tuned at; it can be opened up whenever the feel wants it. */
const PITCH_MAX = 24;
/** Right-stick pitch speed, degrees/sec at full deflection. */
const PAD_PITCH_RATE = 90;

/** @type {?Object} the live view (null when the arena camera is off) */
let V = null;

/** The canvas buffer, as a fraction of the device's own pixels. The delve's
 *  rule verbatim: a rasteriser's cost is per PIXEL and pixels fall with the
 *  square, so half resolution is a quarter of the fill rate — and the upscale
 *  is NEAREST, so a low setting reads as leaning into the pixel art rather than
 *  going soft. Phones start at 50. @see view-prefs.js. */
function glDpr() {
  const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
  return Math.min(2, dpr) * (view.res / 100);
}

export function actFpActive() { return !!V; }
export function actFpPov() { return V ? V.pov : 'first'; }
/** Is the right button down, turning the view? */
export function actFpLooking() { return !!(V && V.look && V.look.locked()); }

// ---------------------------------------------------------------------------
// Textures of its own — the arena's terrain props, drawn or cut once
// ---------------------------------------------------------------------------

const _tex = {};

/** A head-on ladder is four rectangles; no kit sheet carries one. */
function ladderTex() {
  if (_tex.ladder) return _tex.ladder;
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 160;
  const g = cv.getContext('2d');
  g.fillStyle = '#5d4026';
  g.fillRect(4, 0, 12, 160); g.fillRect(48, 0, 12, 160);
  g.fillStyle = '#8a6238';
  for (let y = 8; y < 160; y += 24) g.fillRect(4, y, 56, 8);
  return (_tex.ladder = cv.toDataURL());
}

/** A vine: green strands with leaf nubs, hanging the height of the shelf. */
function vineTex() {
  if (_tex.vine) return _tex.vine;
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 160;
  const g = cv.getContext('2d');
  for (let i = 0; i < 5; i++) {
    const x = 6 + i * 12 + (i % 2) * 3;
    g.fillStyle = i % 2 ? '#3f6a2e' : '#4e7a38';
    g.fillRect(x, 0, 4, 160);
    g.fillStyle = '#5e9a44';
    for (let y = 10 + i * 7; y < 160; y += 26) g.fillRect(x - 3, y, 10, 5);
  }
  return (_tex.vine = cv.toDataURL());
}

let _rocks = null;
function rocksImg(tilesBase) {
  if (_rocks) return _rocks;
  _rocks = new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => { _rocks = null; rej(new Error('action-fp: rocks.png failed')); };
    im.src = tilesBase + 'rocks.png';
  });
  return _rocks;
}

/**
 * A SURFACE IS DATA NOW, not an HTML string.
 *
 * The world is described once, as a want-set, and a BACKEND draws it — the DOM
 * compositor as it always did, or gl-world.js on one canvas. This is the delve's
 * arrangement verbatim (@see delve-fp.js), and the point of it is that the two
 * cannot disagree about what the world contains: there is one builder and two
 * renderers, not two worlds.
 *
 * The record's shape IS gl-world's `setGeometry` input — `{src,w,h,x,y,z,rot}`
 * in CSS px, centred on x/y/z, `rot` a CSS rotation string — so the GL path
 * needs no translation beyond the repeat counts. `cls`, `cut`, `axis` and
 * `atlas` are the DOM path's business alone: they are the compositor
 * mitigations, and the canvas has no use for any of them.
 */
function quad(tex, w, h, tx, ty, tz, rot, cls) {
  return { src: tex, w, h, x: tx, y: ty, z: tz, rot: rot || '', cls: cls || '' };
}

/**
 * A long surface, whole.
 *
 * It used to cut itself into SEG_T panels here, at BUILD time, which meant the
 * segmentation was a fact about the world rather than about the renderer
 * drawing it. It is a compositor mitigation — one that
 * `perf-arena-mobile`/HANDOFF record as guarding a limit that stopped binding —
 * so it belongs to the DOM backend and nowhere else. The canvas takes the run
 * in one piece, which is the whole reason 87 layers can become a handful of
 * draw calls. @see domSegments.
 */
function strip(out, tex, w, h, cx, cy, cz, axis, rot, cls, cut) {
  const q = quad(tex, w, h, cx, cy, cz, rot, cls);
  q.axis = axis; q.cut = cut;
  out.push(q);
}

/** The stands texture's own proportions — `background-size: auto 100%` on
 *  `.tfp-ring` (battle.css) scales it to the quad's HEIGHT and repeats across,
 *  so the repeat count is the quad's aspect over the texture's. @see
 *  standsPanel, which bakes 128×96. */
const RING_TEX_AR = 128 / 96;

/** The want-set, as gl-world wants it: the same records with the repeat counts
 *  the DOM path expresses as `background-size` + `background-repeat` instead. */
function glQuads(want) {
  return want.map((q) => {
    let repX = 1, repY = 1;
    if (/tfp-apron/.test(q.cls)) { repX = q.w / T; repY = q.h / T; }        // repeat, T×T
    else if (/tfp-ring/.test(q.cls)) { repX = q.w / (q.h * RING_TEX_AR); }  // repeat-x, auto 100%
    return { src: q.src, w: q.w, h: q.h, x: q.x, y: q.y, z: q.z, rot: q.rot, repX, repY };
  });
}

/**
 * One record → the panels the COMPOSITOR needs it cut into.
 *
 * Two cuts, both DOM-only. `cut` is the slab-cutter the tactical board shares
 * (@see tactical-fp.js's strip for why a long slab is not merely expensive),
 * and `atlas` is the field: it is one PICTURE rather than a repeating tile, so
 * it is panelled by background-position across an n×n grid instead.
 */
function domSegments(q) {
  if (q.atlas) {
    const n = q.atlas, gw = q.w / n, gh = q.h / n, gp = 100 / (n - 1 || 1), out = [];
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        out.push(Object.assign({}, q, {
          w: gw, h: gh,
          x: q.x - q.w / 2 + (c + 0.5) * gw,
          z: q.z - q.h / 2 + (r + 0.5) * gh,
          bg: `background-size:${n * 100}% ${n * 100}%;`
            + `background-position:${(c * gp).toFixed(4)}% ${(r * gp).toFixed(4)}%;`,
        }));
      }
    }
    return out;
  }
  if (!q.cut) return [q];
  const tall = q.cut === 'h';
  const len = tall ? q.h : q.w;
  const n = Math.max(1, Math.round(len / (SEG_T * T)));
  if (n <= 1) return [q];
  const seg = len / n, out = [];
  for (let i = 0; i < n; i++) {
    const off = -len / 2 + seg * (i + 0.5);
    out.push(Object.assign({}, q, {
      w: tall ? q.w : seg, h: tall ? seg : q.h,
      x: q.x + (q.axis === 'x' ? off : 0),
      y: q.y + (q.axis === 'y' ? off : 0),
      z: q.z + (q.axis === 'z' ? off : 0),
    }));
  }
  return out;
}

/** The DOM backend: the want-set as the pile of composited layers it has always
 *  been. Unchanged output — every panel, position and class is what buildBoard
 *  used to emit directly. */
function domHTML(want) {
  let html = '';
  for (const q of want) {
    for (const s of domSegments(q)) {
      html += `<div class="tfp-q ${s.cls}" style="width:${s.w}px;height:${s.h}px;`
        + `margin-left:${-s.w / 2}px;margin-top:${-s.h / 2}px;`
        + `background-image:url(${s.src});${s.bg || ''}`
        + `transform:translate3d(${s.x}px,${s.y}px,${s.z}px) ${s.rot}"></div>`;
    }
  }
  return html;
}

// ---------------------------------------------------------------------------
// The board — rebuilt when the battlefield changes, which is once a match
// ---------------------------------------------------------------------------

/** The ground the 2D arena is already showing — procedural grass first, the
 *  baked estate once its kit loads — so the two views cannot disagree. */
function groundURI() {
  const el = V.bridge.arenaEl && V.bridge.arenaEl();
  const bg = el && el.style.backgroundImage;
  const m = bg && bg.match(/url\(["']?(.+?)["']?\)/);
  return m ? m[1] : null;
}

const hAt = (T0, x, y) => {
  if (!T0) return 0;
  const tx = Math.floor(x), ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= T0.cols || ty >= T0.rows) return 0;
  return T0.height[ty][tx];
};
const climbAt = (T0, x, y) => {
  if (!T0) return false;
  const tx = Math.floor(x), ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= T0.cols || ty >= T0.rows) return false;
  return T0.climb[ty][tx];
};
/** World-px lift of a standee at a point — negative is UP. */
const liftAt = (T0, x, y) => -(climbAt(T0, x, y) ? 0.5 : hAt(T0, x, y)) * STEP;

/**
 * Has the board changed? IDENTITY, not content.
 *
 * This used to be the terrain's name plus the LENGTH of the ground's data URI,
 * and it ran once a frame. Both halves of that are expensive in a way the line
 * does not look: reading `el.style.backgroundImage` serialises the whole
 * declaration — a base64 PNG, hundreds of kilobytes — and the regex in
 * groundURI() then scans it, sixty times a second, to compute a number that
 * changes only when the fight moves to a different field. The terrain object is
 * rebuilt per board, so its reference answers the same question for free.
 */
function boardKey() { return V.bridge.terrain() || 'flat'; }

function buildBoard() {
  const T0 = V.bridge.terrain();
  const cols = T0 ? T0.cols : 9, rows = T0 ? T0.rows : 9;
  const span = cols * T;
  const out = [];
  // The field is a picture, not a repeating tile, so it is panelled rather than
  // stripped — see tactical-fp.js's field(). Same reason: 9 tiles square is
  // past a phone's texture ceiling on the one quad you stand on.
  const ground = groundURI() || facePanel('afpFieldFallback', '#3f5a2e', '#27381c');
  // ONE FIELD. It is a picture of the whole board, so the DOM backend panels it
  // by background-position (SEG_GROUND — the field is the most magnified
  // surface in the scene and the one a phone drops, @see tactical-fp.js); the
  // canvas takes it whole, because a rasteriser has no per-surface budget to
  // spend on it.
  const gq = quad(ground, span, rows * T, span / 2, 0, (rows * T) / 2, 'rotateX(90deg)', 'tfp-floor');
  gq.atlas = Math.max(1, Math.ceil(Math.max(span, rows * T) / (SEG_GROUND * T)));
  out.push(gq);

  // The shelves. bakeGrid already told the flat view where the raised tops
  // are; here they get real sides and a lid at the height combat already
  // credits them with (heightAt/liftAt read the same grids).
  if (T0) {
    const side = facePanel('afpLedge', '#7c8a52', '#42502c', WALL_DIM);
    const lid = facePanel('afpLid', '#9cb06a', '#7a9050');
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (T0.height[y][x] !== 1) continue;
        const cx = (x + 0.5) * T, cz = (y + 0.5) * T, yc = -STEP / 2;
        const lower = (nx, ny) => hAt(T0, nx + 0.5, ny + 0.5) === 0;
        if (lower(x, y + 1)) out.push(quad(side, T, STEP, cx, yc, (y + 1) * T, '', 'tfp-wall'));
        if (lower(x, y - 1)) out.push(quad(side, T, STEP, cx, yc, y * T, 'rotateY(180deg)', 'tfp-wall'));
        if (lower(x + 1, y)) out.push(quad(side, T, STEP, (x + 1) * T, yc, cz, 'rotateY(90deg)', 'tfp-wall'));
        if (lower(x - 1, y)) out.push(quad(side, T, STEP, x * T, yc, cz, 'rotateY(-90deg)', 'tfp-wall'));
        out.push(quad(lid, T, T, cx, -STEP, cz, 'rotateX(90deg)', 'tfp-floor'));
      }
    }
  }

  // The lip of the lists, the apron, the stands, exactly as the tactical
  // board dresses itself — the same match, the same colosseum.
  // Segmented for the same reason the tactical board is: an unsplit apron slab
  // is a single compositor surface far larger than a phone will allocate, and
  // one it cannot allocate it simply does not draw. The fence rotations are
  // flipped here too — they faced outward, so the cull hid them from the board.
  const edge = facePanel('edge', '#4a4640', '#22201c', WALL_DIM);
  const B = STEP * 1.15, by = -B / 2, depth = rows * T;
  strip(out, edge, span, B, span / 2, by, 0, 'x', '', 'tfp-wall tfp-2s', 'w');
  strip(out, edge, span, B, span / 2, by, depth, 'x', 'rotateY(180deg)', 'tfp-wall tfp-2s', 'w');
  strip(out, edge, span, B, 0, by, depth / 2, 'z', 'rotateY(90deg)', 'tfp-wall tfp-2s', 'w');
  strip(out, edge, span, B, span, by, depth / 2, 'z', 'rotateY(-90deg)', 'tfp-wall tfp-2s', 'w');

  const A = APRON_T * T, apron = apronPanel();
  strip(out, apron, span + 2 * A, A, span / 2, 0, -A / 2, 'x', 'rotateX(90deg)', 'tfp-floor tfp-apron', 'w');
  strip(out, apron, span + 2 * A, A, span / 2, 0, depth + A / 2, 'x', 'rotateX(90deg)', 'tfp-floor tfp-apron', 'w');
  strip(out, apron, A, depth, -A / 2, 0, depth / 2, 'z', 'rotateX(90deg)', 'tfp-floor tfp-apron', 'h');
  strip(out, apron, A, depth, span + A / 2, 0, depth / 2, 'z', 'rotateX(90deg)', 'tfp-floor tfp-apron', 'h');

  const stands = standsPanel(), ry = -RING_H / 2, rl = span + 2 * A;
  strip(out, stands, rl, RING_H, span / 2, ry, -A, 'x', '', 'tfp-wall tfp-ring', 'w');
  strip(out, stands, rl, RING_H, span / 2, ry, depth + A, 'x', 'rotateY(180deg)', 'tfp-wall tfp-ring', 'w');
  strip(out, stands, rl, RING_H, -A, ry, depth / 2, 'z', 'rotateY(90deg)', 'tfp-wall tfp-ring', 'w');
  strip(out, stands, rl, RING_H, span + A, ry, depth / 2, 'z', 'rotateY(-90deg)', 'tfp-wall tfp-ring', 'w');

  // ONE WANT-SET, TWO BACKENDS. The canvas gets it whole; the compositor gets
  // it cut into the panels it needs. Neither can invent geometry the other does
  // not have, which is the point of building it as data.
  V.want = out;
  V.world.querySelector('.tfp-geo').innerHTML = V.gl ? '' : domHTML(out);
  if (V.gl) V.gl.setGeometry(glQuads(out));
  V.boardKey = boardKey();
  buildDressing(T0);
}

/**
 * The standing things — boulders, ladders, vines — with the volume the map
 * says they have.
 *
 * THIS IS THE BUG THE PLAYER SAW. Every prop used to be one camera-facing card
 * pinned to y=0: a boulder became a 700px wall balanced on its front edge that
 * swung to follow the eye, and on a shelf it sank to the base of the world
 * because nothing ever read the terrain under it. Two different mistakes with
 * the same look — an object that touches the ground along one line and rises
 * into the air.
 *
 * Doom's answer, and it is still the right one: A BILLBOARD IS FOR THINGS THAT
 * FACE YOU, and structure is geometry. Doom's monsters are sprites (drawn in
 * elevation, anchored to the sector floor, with eight rotations so they show
 * you their real side) and its walls and floors are not sprites at all. It also
 * never let the camera truly pitch — Heretic and Hexen "look up" by shearing
 * the projection, not by rotating — precisely so you could never look down on a
 * sprite and catch it being paper.
 *
 * WE SHEAR TOO NOW (aimLens), so that protection is back — but it only covers
 * the free look, and the shoulder camera still leans 10° for its framing. A
 * standee must stand up under that on its own. So:
 *   • A boulder is round, and gets a CROSS — two quads through its centre at
 *     right angles. It touches the ground on both axes, has depth from every
 *     bearing, needs no per-frame rotation and costs one extra quad. This is
 *     the trick every Doom-descendant used for trees and bushes.
 *   • A ladder is genuinely flat, and is bolted to the shelf it serves — so it
 *     takes THAT face's rotation, from the map, and never turns to follow you.
 *   • Both stand on liftAt(), the same ground the fighters stand on.
 *
 * All of it is static: nothing here needs touching again until the board does.
 */
const FACE_YAW = { n: 0, s: 180, e: 90, w: -90 };
function buildDressing(T0) {
  for (const d of V.dressing) d.el.remove();
  V.dressing = [];
  if (!T0) return;
  const bbs = V.world.querySelector('.tfp-bbs');
  for (const p of T0.props) {
    const cx = (p.x + 0.5) * T, cz = (p.y + 0.5) * T;
    // The ground THIS prop stands on — and a flat prop reads the FLOOR, not
    // liftAt: liftAt answers for a CLIMBER (half a step up, mid-rungs), and a
    // ladder hung from that answer floats with its feet at knee height — the
    // playtest's "ladders only go halfway". The foot belongs on the floor of
    // its own cell; the head reaches the shelf by being one STEP tall.
    const base = p.flat ? -hAt(T0, p.x + 0.5, p.y + 0.5) * STEP
      : liftAt(T0, p.x + 0.5, p.y + 0.5);
    const h = (p.h || 1) * (p.kind === 'boulder' ? T : STEP);
    if (p.flat) {
      // AGAINST its shelf — pressed to the riser face it serves, not standing
      // in the middle of its own cell (the playtest's "ladders aren't
      // attached to tiles"). 0.44 of a tile puts the quad a hair off the
      // face's plane so the two never z-fight, and the rotation stays the
      // map's fact, never the camera's.
      const OFF = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };
      const o = OFF[p.face] || OFF.n;
      const lx = (p.x + 0.5 + o[0] * 0.44) * T, lz = (p.y + 0.5 + o[1] * 0.44) * T;
      const w = T * 0.42;
      const el = document.createElement('div');
      el.className = 'tfp-q afp-prop afp-flat';
      el.style.cssText = `width:${w}px;height:${h}px;margin-left:${-w / 2}px;margin-top:${-h / 2}px;`
        + `transform:translate3d(${lx}px,${base - h / 2}px,${lz}px) rotateY(${FACE_YAW[p.face] || 0}deg)`;
      if (p.kind === 'vine') {
        el.style.backgroundImage = `url(${vineTex()})`;
      } else {
        // The kit's own wood, tiled up the height of the shelf — caveladders'
        // cutout in place of four painted rectangles. The paint survives only
        // as the fallback for a sheet that never arrives.
        const cv = document.createElement('canvas');
        const cw = 48, chh = Math.max(1, Math.round(cw * h / w));
        cv.width = cw; cv.height = chh;
        cv.style.width = '100%'; cv.style.height = '100%';
        el.appendChild(cv);
        ladderArt(V.bridge.tilesBase).then((art) => {
          const g = cv.getContext('2d');
          g.imageSmoothingEnabled = false;
          const th = Math.max(1, Math.round(art.height * cw / art.width));
          for (let y = 0; y < chh; y += th) g.drawImage(art, 0, y, cw, th);
        }).catch(() => { el.style.backgroundImage = `url(${ladderTex()})`; });
      }
      bbs.appendChild(el);
      V.dressing.push({ el });
      continue;
    }
    // Round things get the cross.
    const w = T * 0.78;
    const tex = facePanel('afpRock', '#8a8478', '#4a463e');
    for (const rot of [0, 90]) {
      const el = document.createElement('div');
      el.className = 'tfp-q afp-prop afp-round';
      el.style.cssText = `width:${w}px;height:${h}px;margin-left:${-w / 2}px;margin-top:${-h / 2}px;`
        + `transform:translate3d(${cx}px,${base - h / 2}px,${cz}px) rotateY(${rot}deg)`;
      const cv = document.createElement('canvas');
      cv.width = 48; cv.height = 48;
      cv.style.width = '100%'; cv.style.height = '100%';
      el.appendChild(cv);
      rocksImg(V.bridge.tilesBase).then((im) => {
        const g = cv.getContext('2d');
        g.imageSmoothingEnabled = false;
        g.drawImage(im, 0, 0, 48, 48, 0, 0, 48, 48);
      }).catch(() => { el.style.backgroundImage = `url(${tex})`; });
      bbs.appendChild(el);
      V.dressing.push({ el });
    }
  }
}

// ---------------------------------------------------------------------------
// The people in it
// ---------------------------------------------------------------------------

function ensureActors() {
  const live = (V.bridge.fighters() || []).filter(Boolean);
  for (const f of live) {
    if (V.actors.has(f)) continue;
    const el = document.createElement('div');
    el.className = 'tfp-bb tfp-fighter';
    el.style.width = (FIGHTER_H * 0.75) + 'px';
    el.style.height = FIGHTER_H + 'px';
    el.style.marginLeft = (-FIGHTER_H * 0.75 / 2) + 'px';
    const cv = document.createElement('canvas');
    cv.width = 96; cv.height = 96;
    cv.style.width = '100%'; cv.style.height = '100%';
    cv.style.transform = `translateY(${FOOT_PCT}%)`;
    el.appendChild(cv);
    const bar = document.createElement('i');
    el.appendChild(bar);
    V.world.querySelector('.tfp-bbs').appendChild(el);
    V.actors.set(f, { el, cv, bar, tf: '', hpw: '' });
  }
  for (const [f, a] of V.actors) {
    if (live.indexOf(f) < 0) { a.el.remove(); V.actors.delete(f); }
  }
}

/** Camera-relative rotation, tactical-fp's identical trick: the compositor
 *  picks its sheet row from `facing`, so subtract the camera's yaw on a
 *  shallow proxy and the fighter shows the camera the side it really shows. */
/**
 * A FALLEN FIGHTER SHOWS THE SHEET'S OWN DEATH CELL, PLAIN — no fall, no
 * squash, no roll (playtest verdict 2026-08-05: "they should just use the
 * designated death position from the character, armor, etc tilesets").
 *
 * The previous cut tipped the standee 74° about its feet and foreshortened it
 * — the delve's creature fold, borrowed verbatim — and the photograph came
 * back a crumpled sticker on the sand. Same lesson as the crossed solids and
 * the detached swing, third time now: a synthetic transform faking what the
 * art should say is always near enough to see and always wrong. The
 * compositor's death anim IS the designated cell, drawn across every layer of
 * the outfit; the billboard's whole job is to show it at full size and hold
 * still.
 */

function drawActor(f, a, yaw) {
  const gfx = window.__ranchGfx;
  if (!gfx || !gfx.renderActor) return;
  const view = Object.create(f);
  view.facing = (typeof f.facing === 'number' ? f.facing : Math.PI) - yaw;
  try { gfx.renderActor(a.cv, view); } catch (e) { /* a half-loaded sheet is not worth a crash */ }
}

/** The held charge, drawn where this view can see it: on your own standee
 *  from over the shoulder, and as a small fixed ring in first person (your
 *  body is not drawn there, and the ring must not vanish with it). */
function drawCharge(subject) {
  const ch = V.bridge.charge && V.bridge.charge();
  const ring = V.ringCv;
  if (ring) {
    const g = ring.getContext('2d');
    g.clearRect(0, 0, ring.width, ring.height);
    if (ch && V.pov === 'first') {
      g.lineWidth = 5;
      g.strokeStyle = ch.tier2 ? '#ef4444' : (ch.prog >= 1 ? '#f59e0b' : 'rgba(212,168,67,0.75)');
      g.beginPath();
      g.arc(ring.width / 2, ring.height / 2, ring.width * 0.38, -Math.PI / 2, -Math.PI / 2 + Math.min(1, ch.prog) * Math.PI * 2);
      g.stroke();
    }
  }
  if (ch && V.pov === 'shoulder' && subject) {
    const a = V.actors.get(subject);
    if (a) {
      const g = a.cv.getContext('2d');
      g.save();
      g.lineWidth = 4;
      g.strokeStyle = ch.tier2 ? '#ef4444' : (ch.prog >= 1 ? '#f59e0b' : 'rgba(212,168,67,0.6)');
      g.beginPath();
      g.arc(a.cv.width / 2, a.cv.height * 0.82, a.cv.width * 0.17, -Math.PI / 2, -Math.PI / 2 + Math.min(1, ch.prog) * Math.PI * 2);
      g.stroke();
      g.restore();
    }
  }
}

// ---------------------------------------------------------------------------
// Things in flight
// ---------------------------------------------------------------------------

/** Mirror the live projectile list as billboards. Keyed on the projectile
 *  objects themselves — crucible owns their lifetime, this view only shows
 *  them, rolled to their flight angle relative to the camera. */
function placeShots(yaw) {
  const list = V.bridge.projectiles() || [];
  const now = performance.now();
  for (const p of list) {
    let m = V.shots.get(p);
    if (!m) {
      const el = document.createElement('div');
      el.className = 'tfp-bb afp-shot';
      const w = T * 0.5;
      el.style.width = w + 'px';
      el.style.height = w + 'px';
      el.style.marginLeft = (-w / 2) + 'px';
      const cv = document.createElement('canvas');
      cv.width = 16; cv.height = 16;
      cv.style.width = '100%'; cv.style.height = '100%';
      el.appendChild(cv);
      V.world.querySelector('.tfp-bbs').appendChild(el);
      m = { el, cv, tf: '' };
      V.shots.set(p, m);
    }
    // A LIVE shot carries its own position (the sim ticks it); only the old
    // cosmetic streaks still lerp between endpoints on a clock.
    const t = p.live ? 1 : Math.min(1, (now - p.start) / p.dur);
    const x = p.live ? p.x : p.x0 + (p.x1 - p.x0) * t;
    const y = p.live ? p.y : p.y0 + (p.y1 - p.y0) * t;
    const im = V.bridge.projImg && V.bridge.projImg(p.kind, p.c);
    if (im) {
      const g = m.cv.getContext('2d');
      g.clearRect(0, 0, 16, 16);
      g.imageSmoothingEnabled = false;
      g.drawImage(im, 0, 0);
    }
    const roll = (p.angDeg || 0) - yaw * 180 / Math.PI;
    // No counter-pitch to sequence around any more — the free pitch is a shear
    // on the lens, so a shot is already in the camera's plane and the roll is
    // the only thing that has to happen in it.
    const tf = `translate3d(${(x * T).toFixed(1)}px,${(-EYE * 0.55).toFixed(1)}px,${(y * T).toFixed(1)}px)`
      + ` rotateY(${(-yaw * 180 / Math.PI).toFixed(1)}deg) rotateZ(${roll.toFixed(1)}deg)`;
    if (tf !== m.tf) m.el.style.transform = (m.tf = tf);
  }
  for (const [p, m] of V.shots) {
    if (list.indexOf(p) < 0) { m.el.remove(); V.shots.delete(p); }
  }
}

// ---------------------------------------------------------------------------
// The camera
// ---------------------------------------------------------------------------

/**
 * THE LENS, RE-FITTED FROM THE HEIGHT THE FRAME IS ACTUALLY BEING DRAWN AT.
 *
 * Called per frame, and guarded on the height so it is one property read when
 * nothing moved. That is not caution, it is the FIX: the GL camera derives its
 * pull-back from `perspectiveFor(stage.clientHeight)` fresh on every frame,
 * so a DOM `perspective` written once at creation and left there is a SECOND,
 * different lens the moment the stage is any other height — and the two draw
 * the same world at two fields of view.
 *
 * It bit exactly where you would expect. The old `if (!h) return` gave up
 * silently, and `actFpToggle` runs while `#actionScreen` may still be display:
 * none — which is routine, because the camera choice is remembered, so a battle
 * that starts in first person builds this view before the screen it lives on is
 * laid out. The stage then measured 0, nothing was written, and the DOM kept
 * battle.css's placeholder `perspective: 500px` against the canvas's 523. Four
 * percent, and four percent of a projection is a fighter standing 19px off
 * their own shadow at four tiles and further out the further they walk.
 * Measured with `__actFpAgree()`, which is what it is for.
 */
function fitLens() {
  const h = V.stage && V.stage.clientHeight;
  if (!h || h === V.lensH) return;
  V.lensH = h;
  // The FoV slider is the only thing that decides this now. Its default of 72°
  // reproduces the old `PERSP * (h / PERSP_AT)` exactly, so the framing every
  // number in this file was measured against is still the default framing.
  V.stage.style.perspective = perspectiveFor(h).toFixed(1) + 'px';
}

// Either slider moves the picture NOW: re-fit the lens and clear the transform
// write-guards, or the frame loop compares the new string against the old one,
// finds them equal for the parts it did not change, and skips the write. The
// height has not changed, so fitLens's guard has to be dropped by hand.
onView(() => { if (!V) return; V.lensH = 0; fitLens(); V.wtf = ''; actFpFrame(); });

/**
 * PITCH IS A SHEAR, NOT A ROTATION — Hexen's answer, and the reason its
 * monsters read as solid.
 *
 * THIS IS THE BUG THE PLAYER SAW, in both of its halves: "I feel taller than
 * enemies when looking down, and enemies look massive when I look up."
 *
 * Rotating the world about the eye moves a standee's FEET toward or away from
 * the projection plane, because the feet sit a whole eye-height below the pivot.
 * With the eye at 690 world px, that lever arm enters the perspective divide
 * directly: apparent size = P / (P + d·cosθ − 690·sinθ). Look up and the
 * subtraction shrinks the denominator and the fighter swells; look down and it
 * grows and the fighter shrinks. At half a tile — melee, where you actually
 * read an opponent's size — the sweep from −24° to +24° changes a fighter's
 * on-screen height by a factor of 1.6. Nothing was wrong with the standee; the
 * camera was zooming and calling it looking.
 *
 * Doom, Heretic and Hexen never had this, and not by luck: they "look up" by
 * SHEARING the projection — sliding the horizon along the screen — instead of
 * rotating the camera. A shear leaves every object's depth exactly where it
 * was, so nothing changes size, and it leaves billboards screen-parallel, so
 * you can never look down on one and catch it being paper.
 *
 * AND IT IS THE PROJECTION THAT SHEARS, NOT THE WORLD — which the first cut got
 * wrong in a way nothing could see until the canvas turned up to disagree with
 * it. That cut moved `perspective-origin`, on the reasoning that the origin IS
 * the vanishing point, so putting it `P·tanθ` off centre reproduces a rotation's
 * horizon with none of its depth change. The horizon, yes. Everything else, no:
 * CSS projects to `O + m·(p − O)` with `m = P/(P − z)`, so moving `O` by Δ moves
 * a point by `Δ·(1 − m)` — the full Δ at infinity, and NOTHING at the eye plane.
 * That is a rubber sheet, not a shear: look up and the far stands slide while
 * the grass at your feet stays nailed down.
 *
 * Doom slides the whole PICTURE, and the rasteriser does too — one constant in
 * the projection matrix (`proj[9]`, @see gl-world), applied after the divide, so
 * every pixel at every depth moves together. With the canvas drawing the ground
 * and the DOM drawing the people, "together" is not a nicety: it is the only
 * thing keeping a fighter's feet on the field. At a 20 degree look the two rules
 * differed by 17px at four tiles and 190 at the horizon.
 *
 * So the DOM shears too, and in the one space where a shear survives the divide:
 * a screen slide of Δ is `t_y = Δ − Δ·z/P` applied in stage space, because
 * `m·t_y = [P/(P−z)]·Δ·[(P−z)/P] = Δ` for every z. Two matrix cells, outermost
 * on the world transform, and Δ/P is just `tan(free)` — the ratio the old
 * `perspRatio()` was carrying is now the shear coefficient itself.
 *
 * The knock-on stands: billboards need no counter-rotation at all, because a
 * shear leaves them screen-parallel. That whole term is gone from every
 * per-frame transform string.
 */
function aimLens(free) {
  const t = Math.tan(free * Math.PI / 180);
  if (!t) return '';
  // Δ = P·tan(free) — the horizon's slide, in stage px — and the z→y coupling
  // that carries it back to every nearer depth unchanged. Column-major: the
  // 10th cell is z→y, the 14th is the y translate.
  const d = perspectiveFor(V.lensH || V.stage.clientHeight) * t;
  return `matrix3d(1,0,0,0,0,1,0,0,0,${(-t).toFixed(5)},1,0,0,${d.toFixed(2)},0,1) `;
}

/**
 * Steer, the delve's grammar in real time. Called by actionTick IN PLACE of
 * its own key→vector build while this view is up: `turn` swings the yaw,
 * `fwd` walks along it, `strafe` slides across it, and the returned vector is
 * in world tiles — same speed, same slide rules, nothing about movement
 * changes but the frame it is read in. The returned `yaw` becomes the
 * fighter's facing: where you look is one fact everywhere.
 *
 * `turn` and `pitch` are RATES (-1..1, held input). The mouse is neither: its
 * travel is an absolute angle already banked by the pointer-lock look, drained
 * here once per frame and added straight to the yaw. That is the whole reason
 * a mouse turns better than a key — the distance your hand moved IS the angle,
 * with no ramp in between — and it is why the drain lives inside the one
 * function the tick already calls exactly once.
 */
export function actFpSteer(input, dt) {
  if (!V) return null;
  const look = V.look ? V.look.read() : null;
  const turn = Math.max(-1, Math.min(1, input.turn || 0));
  V.yaw += turn * TURN_RATE * dt + (look ? look.yaw : 0);
  // Wrap. Key turning could never outrun a float; a mouse can spin the view a
  // hundred times a minute, and an ever-growing yaw both lengthens the
  // transform string every frame and eventually costs real precision.
  if (V.yaw > Math.PI) V.yaw -= 2 * Math.PI;
  else if (V.yaw <= -Math.PI) V.yaw += 2 * Math.PI;
  // THE SHOULDER CAMERA'S PITCH IS FIXED. Its whole job is to hold a
  // three-quarter view — the angle that makes the ground readable and a
  // top-down-drawn swing read as forward — and a pitch the player can move is a
  // pitch that leaves it. Free look belongs to first person, where there is no
  // framing to keep. The banked mouse travel is DRAINED either way (the `look`
  // read above), so nothing accumulates while you are over the shoulder and
  // nothing jumps when you cut back to first person.
  const dp = (look ? look.pitch * 180 / Math.PI : 0)
    + Math.max(-1, Math.min(1, input.pitch || 0)) * PAD_PITCH_RATE * dt;
  if (dp && V.pov !== 'shoulder') V.pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, V.pitch + dp));
  const fwd = Math.max(-1, Math.min(1, input.fwd || 0));
  const strafe = Math.max(-1, Math.min(1, input.strafe || 0));
  const s = Math.sin(V.yaw), c = Math.cos(V.yaw);
  return {
    x: s * fwd + c * strafe,
    y: -c * fwd + s * strafe,
    yaw: V.yaw,
  };
}

/** How far back the shoulder camera may pull before rock stands between it
 *  and the fighter — the "standing on a wall" illusion. Walked in small steps
 *  along the back-ray; off-board is open (the apron is real ground). */
function backOff(T0, x, y, yaw, want) {
  if (!T0) return want;
  let ok = 0.45;
  for (let s = 0.2; s <= want + 1e-6; s += 0.2) {
    const cx = x - Math.sin(yaw) * s, cy = y + Math.cos(yaw) * s;
    const tx = Math.floor(cx), ty = Math.floor(cy);
    if (tx >= 0 && ty >= 0 && tx < T0.cols && ty < T0.rows && !T0.pass[ty][tx]) {
      return Math.max(0.45, s - 0.35);
    }
    ok = s;
  }
  return Math.max(0.45, ok);
}

/** Per frame, from actionRender. Placement only — yaw belongs to the input. */
export function actFpFrame() {
  if (!V) return;
  const me = (V.bridge.fighters() || [])[0];
  if (!me) return;
  const now = performance.now();
  V.last = now;
  // ONE HEIGHT, ONE LENS. The DOM's `perspective` and the GL camera's pull-back
  // are the same field of view expressed twice; fit them off the same reading
  // of the same box on the same frame, or they are two cameras. @see fitLens.
  fitLens();

  const T0 = V.bridge.terrain();
  const lift = liftAt(T0, me.ax, me.ay);
  let ex = me.ax * T, ez = me.ay * T, ey = lift - EYE, lean = 0;
  if (V.pov === 'shoulder') {
    // THE CAMERA ORBITS THE FIGHTER'S EYE. A camera parked behind-and-above by
    // fixed amounts sees the subject at a fixed angle below its horizontal, so
    // tipping the lens walks them UP the frame — the playtest's "as I change the
    // camera angle, the player character seems to shift up on screen". Resolving
    // the pull-back on a circle instead puts the camera exactly `angle` above
    // the aim, and camLean() then points it exactly at the aim, so the subject
    // lands in the same place at every angle. @see delve-fp.js's twin of this.
    lean = camLean();
    const orb = -lean * Math.PI / 180;
    const back = backOff(T0, me.ax, me.ay, V.yaw, OTS_BACK) * T;
    ex -= Math.sin(V.yaw) * back * Math.cos(orb);
    ez += Math.cos(V.yaw) * back * Math.cos(orb);
    ey -= back * Math.sin(orb);   // the rise IS the angle now; OTS_UP is gone
  }
  const deg = V.yaw * 180 / Math.PI;
  // The free pitch is a SHEAR on the lens, not a term in here — see aimLens for
  // why, and for the measured size-swing that rotating it used to cause. The
  // shoulder camera's own lean stays a ROTATION and is the only pitch it has:
  // a constant cannot produce a swing, and over the shoulder the free look is
  // held at zero so the three-quarter framing is a fact and not a suggestion.
  const free = V.pov === 'shoulder' ? 0 : V.pitch;
  // The look's shear is OUTERMOST OF ALL — it works on the projected frame, so
  // everything else must already have happened. @see aimLens.
  // The scale is next and undoes K exactly: the picture is the one the framing
  // was measured at, only the rasters underneath it shrank.
  const sc = (1 / K).toFixed(4);
  const wtf = `${aimLens(free)}scale3d(${sc},${sc},${sc})${lean ? ` rotateX(${lean}deg)` : ''} rotateY(${deg.toFixed(2)}deg) translate3d(${(-ex).toFixed(1)}px,${(-ey).toFixed(1)}px,${(-ez).toFixed(1)}px)`;
  if (wtf !== V.wtf) V.world.style.transform = (V.wtf = wtf);

  // THE CANVAS IS AIMED BY THE SAME NUMBERS THE CSS CHAIN IS AIMED BY — this is
  // what makes it the same picture rather than a second one. `back` is the
  // pull-back CSS `perspective` implies and a GL camera at the eye does not:
  // the world transform lands a point at stage-z = lens·Z with the viewer at
  // +P, so the distance is P + lens·d, and the two agree only with the GL
  // camera pulled back P/lens world px. @see HANDOFF-RENDERER.md §-1, and
  // delve-fp.js's twin of this block. The arena's lens is 1/K, so P/lens = P·K.
  //
  // PITCH IS THE SHOULDER LEAN ONLY — as a ROTATION. The free look is not a
  // rotation in either backend (@see aimLens for the measured 1.6x size swing
  // that made it a shear), and it is NOT nothing either: it is a shear here too.
  //
  // THIS LINE WAS MISSING AND IT WAS HALF THE PLAYTEST BUG. `aimLens` slides the
  // DOM's vanishing point by `P·tan(free)` and every DOM thing rides that lens —
  // both fighters, every arrow, every boulder — while the canvas underneath them
  // kept a level horizon, so LOOKING UP OR DOWN WALKED THE WHOLE CAST OFF THE
  // GROUND. Measured with `__actFpAgree()` before the fix: an opponent four
  // tiles out floated 77px above their own shadow at a 10 degree look and 159px
  // at 20 — which is what "in 1st person, both characters are outside of the
  // map" looks like from the player's chair.
  //
  // gl-world has carried the matching cell all along (`proj[9]`, @see its
  // `project`/`draw`) and nothing in the repo ever wrote it. Its contract is
  // `tan(pitch)/tan(fovY/2)`, positive looks up — which resolves to a screen
  // slide of `tan(free)·(H/2)/tan(fov/2)` = `P·tan(free)`, the DOM's number
  // exactly. One angle, one horizon, two backends.
  if (V.gl) {
    const st = V.stage;
    if (st && st.clientHeight) V.gl.resize(st.clientWidth, st.clientHeight, glDpr());
    const fovY = view.fov * Math.PI / 180;
    V.gl.setCamera({
      x: ex, y: ey, z: ez, yaw: V.yaw,
      pitch: lean ? lean * Math.PI / 180 : 0,
      shear: free ? Math.tan(free * Math.PI / 180) / Math.tan(fovY / 2) : 0,
      fovY,
      back: st && st.clientHeight ? perspectiveFor(st.clientHeight) * K : 0,
    });
    // No fog in an arena — you can see the far stands, and the sky behind them
    // is the host's own background. Far enough out that nothing in a 9×9 field
    // ever reaches it.
    V.gl.setFog([120, 132, 150], 1e9, 1e9 + 1);
    V.gl.setTime(now / 1000);
    V.gl.draw();
  }

  if (boardKey() !== V.boardKey) buildBoard();
  ensureActors();

  for (const [f, a] of V.actors) {
    // Your own body is not drawn in first person; it IS from the shoulder.
    const self = f === me && V.pov !== 'shoulder';
    if (self !== a.selfHidden) { a.el.style.visibility = (a.selfHidden = self) ? 'hidden' : ''; }
    if (self) continue;
    const fl = liftAt(T0, f.ax, f.ay);
    const tf = `translate3d(${(f.ax * T).toFixed(1)}px,${fl.toFixed(1)}px,${(f.ay * T).toFixed(1)}px) rotateY(${(-deg).toFixed(1)}deg)`;
    if (tf !== a.tf) a.el.style.transform = (a.tf = tf);
    const hp = Math.max(0, Math.min(1, f.hp / (f.maxHp || f.hp || 1)));
    const w = (hp * 100).toFixed(0) + '%';
    if (w !== a.hpw) { a.bar.style.width = (a.hpw = w); }
    drawActor(f, a, V.yaw);
  }
  // The dressing does NOT move. It is placed once, in world space, standing on
  // its own ground — see buildDressing. Rotating it to the camera every frame is
  // what made a boulder read as a card that follows you.
  placeShots(V.yaw);
  drawCharge(me);
  syncHands(me, now);
}

/**
 * The held viewmodel — built from the fighter's REAL gear, swung when the
 * fighter swings. The rig mirrors the fighter's anim transitions (slash /
 * nockBow / parry), so the hands and the rules can never disagree about when
 * a blow happened. Hidden (CSS) over the shoulder; while hidden the anim
 * transitions are still swallowed so re-entering first person doesn't replay
 * a stale swing.
 */
function syncHands(me, now) {
  if (!V.handsEl) return;
  if (V.handsFor !== me) {
    if (V.hands) V.hands.dispose();
    V.handsFor = me;
    V.hands = createFpHands(V.handsEl, fighterHandsSpec(me));
    V.lastAnim = '';
  }
  const anim = (me.anim && me.anim.name) || 'idle';
  if (V.pov !== 'first') { V.lastAnim = anim; return; }
  if (anim !== V.lastAnim) {
    if (anim === 'slash' || anim === 'nockBow') V.hands.swing();
    else if (anim === 'parry') V.hands.brace();
    V.lastAnim = anim;
  }
  // The stride bob the delve's hands ride, keyed here to the move anim.
  // Written as a TRANSFORM, not an inherited custom property: a var set on the
  // hands layer invalidates style for every hand, canvas and SVG beneath it,
  // and while a swing animation is running that recalc lands on live animated
  // elements every frame. @see the note on `.fp-hands` in delve.css.
  const bob = anim === 'move' ? Math.round(Math.sin(now / 150) * 14 * 2) / 2 : 0;
  const tf = `translate3d(0,${bob.toFixed(1)}px,0)`;
  if (tf !== V._bob) V.handsEl.style.transform = (V._bob = tf);
}

// ---------------------------------------------------------------------------
// On / off
// ---------------------------------------------------------------------------

/**
 * Set the view: 'first', 'shoulder', or null to hand the screen back to the
 * arena. `bridge` is crucible's read-only window onto the live battle —
 * fighters, terrain, projectiles, the held charge — handed in at toggle so
 * this module imports none of crucible's globals.
 */
export function actFpToggle(kind, bridge) {
  if (!kind) {
    if (V) {
      if (V.onResize) window.removeEventListener('resize', V.onResize);
      if (V.look) V.look.dispose();     // and hands the cursor back to the HUD
      if (V.hands) V.hands.dispose();
      if (V.gl) V.gl.dispose();         // the GL context outlives its host otherwise
      V.host.remove();
      V = null;
    }
    return false;
  }
  if (!V) {
    const stage = document.querySelector('#actionScreen .action-stage');
    if (!stage) return false;
    const host = document.createElement('div');
    host.className = 'tfp-host afp-host';
    host.style.setProperty('--tfp-t', T + 'px');   // world px that live in CSS — see tactical-fp
    host.innerHTML = '<div class="tfp-stage"><canvas class="afp-gl"></canvas><div class="tfp-world">'
      + '<div class="tfp-geo"></div><div class="tfp-bbs"></div>'
      + '</div></div><div class="tfp-haze"></div>'
      + '<div class="fp-hands"></div>'
      + '<canvas class="afp-ring" width="72" height="72"></canvas>'
      // Said once, in the order you need it: how to aim, how to hit, how to
      // leave. The cursor is never taken, so the attack bar below is clickable
      // the whole time — which is the entire reason the look is a held button.
      + '<div class="afp-look"><b>Right-drag</b> to look &middot; <b>Left-click</b> or <b>1</b>&ndash;<b>6</b> to attack'
      + ' &middot; <b>V</b> changes camera</div>';
    // THE CLOUD BAND HAS TO CLEAR THE CHROME. `0 6%` was authored for the
    // tactical lens, whose host has nothing over it; this screen carries 136px
    // of HP cards, log and camera rail across its top, and the band resolved to
    // y 16–133 in landscape and y 35–289 in portrait — i.e. straight through
    // all of it. Nothing paints out of order (the host is under the HUD): the
    // clouds simply showed THROUGH translucent panels, which is why the log
    // read as smeared. 34% puts the band below the rail at both orientations
    // and still well above the horizon at 50%.
    host.style.background = `url(${cloudsPanel()}) repeat-x 0 34% / auto 22%,`
      + 'linear-gradient(rgb(92,132,188) 0%, rgb(128,156,196) 34%, rgb(156,174,196) 50%, rgb(112,120,132) 58%, rgb(74,80,92) 100%)';
    stage.appendChild(host);
    V = {
      host, world: host.querySelector('.tfp-world'), bridge,
      // The stage owns the LENS: `perspective` is the field of view, and it is
      // the ONE number the DOM and the canvas both fit themselves to, so it is
      // held rather than re-queried and re-fitted per frame. (The horizon is no
      // longer a property here — the look shears the world transform instead,
      // @see aimLens.) `lensH` is the height it was last fitted at.
      stage: host.querySelector('.tfp-stage'), lensH: 0,
      pov: 'first', yaw: 0, pitch: 0, wtf: '', last: 0,
      actors: new Map(), shots: new Map(), dressing: [], want: [], gl: null,
      boardKey: '', ringCv: host.querySelector('.afp-ring'),
      handsEl: host.querySelector('.fp-hands'), hands: null, handsFor: null, lastAnim: '',
      look: null,
    };
    // A phone's GPU is not a desktop's. The delve tiers itself this way and so
    // does the tactical lens; THIS one never did, which is why it was the one
    // that fell over. Everything the class strips is a live blur on something
    // that moves every frame: both fighter billboards, every projectile, the
    // haze, and — biggest by a distance — the held viewmodel, whose drop-shadow
    // is a private render surface covering ~43% of a landscape phone screen and
    // re-rastered on every step of the walk. Measured at 844x390: 203k px of
    // filtered surface against a 329k px viewport, 62% of the screen.
    //
    // Keyed to the DEVICE, not the session, and never removed — the same rule
    // the delve settled on.
    if (LOW_POWER) document.body.classList.add('fp-lite');
    // THE SAME ENGINE THE DELVE DRAWS WITH (user decree, 2026-08-08). Every
    // mitigation this file carried — SEG_T, SEG_GROUND, the K-scale, tiering on
    // a coarse pointer — was managing the DOM compositor's ceiling, and the
    // ceiling is still there: 87 surfaces on The Cairns, each rastered at CSS
    // size × dpr whether it covers the screen or four pixels of horizon, and
    // dropped without warning when the budget runs out. That is the black world
    // in every playtest photo. A rasteriser has no per-surface budget at all.
    //
    // A BACKEND, not a rewrite: both paths read the one want-set out of
    // buildBoard, so they cannot drift about what the world contains, and a
    // device without WebGL2 keeps the composited path. Same switch as the
    // delve's — `view.gl`, Camera panel → "Draw on a canvas".
    if (view.gl) V.gl = createGlWorld(host.querySelector('.afp-gl'));
    host.classList.toggle('afp-gl-on', !!V.gl);
    // The mouse becomes the head. Taken on the host (which fills the stage),
    // never on the HUD around it, and never on a touch device — where the
    // stick IS the control and a pointer lock is a cursor thrown away.
    V.look = createLook(host, {
      enabled: () => !touchPrimary(),
      ignore: '#actionJoystick',
      onChange: (on) => {
        host.classList.toggle('afp-looking', on);
        if (on) host.classList.add('afp-aimed');   // the hint has been read
      },
    });
    host.classList.toggle('afp-touch', touchPrimary());
    // Open looking the way your fighter faces — the view begins as a change
    // of camera, never a change of heading.
    const me = (bridge.fighters() || [])[0];
    if (me && typeof me.facing === 'number') V.yaw = me.facing;
    buildBoard();
    ensureActors();
    fitLens();
    V.onResize = () => { fitLens(); if (V && V.hands) V.hands.fit(); };
    window.addEventListener('resize', V.onResize);
  } else {
    V.bridge = bridge || V.bridge;
  }
  V.pov = kind === 'shoulder' ? 'shoulder' : 'first';
  V.host.classList.toggle('tfp-ots', V.pov === 'shoulder');
  actFpFrame();
  if (V.hands) V.hands.fit();   // the layer may have just un-hidden
  return true;
}

// Dev probe — headless panes run no rAF; step the camera by hand.
if (typeof window !== 'undefined') {
  window.__actFpDebug = () => V && ({
    pov: V.pov,
    yawDeg: +(V.yaw * 180 / Math.PI).toFixed(1),
    quads: V.world.querySelectorAll('.tfp-q').length,
    actors: V.actors.size,
    shots: V.shots.size,
    dressing: V.dressing.length,
    boardKey: V.boardKey,
    want: V.want.length,
    gl: !!V.gl,
    glStats: V.gl ? V.gl.stats() : null,
  });
  /**
   * WHAT THE CANVAS ACTUALLY DREW — and the reason the rasteriser is worth
   * having twice over. A compositor can only be checked by measuring DOM
   * rectangles and hoping; `probe()` draws and reads the pixels back, so a
   * headless pane that composites nothing and runs no rAF can still assert that
   * the sky is empty at the top and the field green at the bottom. Every
   * CSS-3D change in this file for a year was verified by inference.
   * @see HANDOFF-RENDERER.md §-1.
   */
  window.__actFpProbe = () => {
    if (!V || !V.gl) return null;
    actFpFrame();
    return V.gl.probe();
  };
  window.__actFpStep = () => { actFpFrame(); return window.__actFpDebug(); };
  /**
   * DO THE TWO CAMERAS AGREE ABOUT WHERE A FIGHTER IS STANDING?
   *
   * The world is drawn by the rasteriser and the people standing in it are
   * drawn by the compositor, so this view has TWO cameras that must be the same
   * camera. Nothing checked that, and nothing could: `probe()` reads the
   * canvas's pixels and `getBoundingClientRect` reads the DOM's box, and until
   * they are put in the same units neither can contradict the other.
   *
   * They can here. `gl.project` returns a world point in stage CSS px (it exists
   * for overhead labels, and doubles as this proof), and the DOM side is read by
   * hanging a ZERO-SIZED marker in `.tfp-bbs` at the same world point: a 0x0 box
   * has no shape to distort, so its client rect IS that point after the whole
   * CSS chain. Same point, two projections, one number: `dx`/`dy`.
   *
   * The standee's own bounding box will NOT do, and the reason is worth keeping:
   * a billboard is a real quad leaning with the shoulder camera's `rotateX`, so
   * off to the side it projects as a TRAPEZOID and its box centre drifts from the
   * ground point it is anchored on — 19px at four tiles out, pure measurement
   * artefact, exactly the sort of small honest lie that would make a real 20px
   * displacement unfalsifiable.
   *
   * IT CAUGHT A REAL ONE (2026-08-08). A stray `position:relative` in
   * action-arena.css re-flowed `.tfp-world` to full stage width and moved its
   * `transform-origin` off the eye, displacing the whole DOM cast from the
   * canvas's world by `(700 - 2100·cos yaw, 0, 2100·sin yaw)` stage px — the
   * playtest's "in 1st person, both characters are outside of the map". `dx` was
   * 146 px at seven tiles and 546 px over the shoulder. Anything past a pixel or
   * two here is that class of bug: a lens re-authoring where the world is.
   */
  window.__actFpAgree = () => {
    if (!V || !V.gl) return null;
    actFpFrame();
    const T0 = V.bridge.terrain();
    const s = V.stage.getBoundingClientRect();
    const mark = document.createElement('div');
    mark.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0';
    V.world.querySelector('.tfp-bbs').appendChild(mark);
    const out = [];
    for (const f of (V.bridge.fighters() || []).filter(Boolean)) {
      const lift = liftAt(T0, f.ax, f.ay);
      const g = V.gl.project(f.ax * T, lift, f.ay * T);
      // Behind the eye there is no pixel to disagree about — and the CSS chain
      // does not report a sign, so a point projected through it from behind
      // comes back as a plausible-looking number. Drop them rather than compare.
      if (!isFinite(g.x) || !isFinite(g.y)) continue;
      mark.style.transform = `translate3d(${f.ax * T}px,${lift}px,${f.ay * T}px)`;
      const r = mark.getBoundingClientRect();
      const dom = { x: r.x - s.x, y: r.y - s.y };
      out.push({
        at: [+f.ax.toFixed(2), +f.ay.toFixed(2)],
        gl: { x: +g.x.toFixed(1), y: +g.y.toFixed(1) },
        dom: { x: +dom.x.toFixed(1), y: +dom.y.toFixed(1) },
        dx: +(dom.x - g.x).toFixed(1), dy: +(dom.y - g.y).toFixed(1),
      });
    }
    mark.remove();
    const worst = out.reduce((m, o) => Math.max(m, Math.abs(o.dx), Math.abs(o.dy)), 0);
    return { pov: V.pov, yawDeg: +(V.yaw * 180 / Math.PI).toFixed(1), worst: +worst.toFixed(1), fighters: out };
  };
  // Look, without a mouse: a headless pane can never hold a pointer lock, so
  // the only way to prove the steer's angle path is to hand it the same numbers
  // the lock would have banked. Goes through actFpSteer, not around it.
  window.__actFpLook = (yawRad, pitchRad) => {
    if (!V) return null;
    const prev = V.look;
    V.look = { read: () => ({ yaw: yawRad || 0, pitch: pitchRad || 0 }), locked: () => true };
    actFpSteer({}, 0);
    V.look = prev;
    actFpFrame();
    return { ...window.__actFpDebug(), pitchDeg: +V.pitch.toFixed(2) };
  };
}
