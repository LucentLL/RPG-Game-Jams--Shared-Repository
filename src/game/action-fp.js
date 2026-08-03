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
 * for "enemies look massive when I look up"). The shoulder camera's built-in 10°
 * stays a rotation, because that lean is the portrait framing this view was
 * tuned to and not something a mouse should quietly restyle.
 *
 * Nothing here can put the eye outside the world: the board's own fence,
 * apron and stands (tall past any pull-back) come with the dressing — and the
 * shoulder camera CLAMPS at impassable rock, because a boulder standing
 * between the eye and your own fighter reads as standing on a wall.
 */
import { facePanel, apronPanel, standsPanel, cloudsPanel, WALL_DIM, SEG_T } from './tactical-fp.js';
import { createFpHands, fighterHandsSpec } from './fp-hands.js';
import { makeBlade, placeBlade, swingT, SWING_COL, SWING_ROW } from './fp-swing.js';
import { createLook, touchPrimary } from '../platform/input.js';

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
const PERSP = 500, PERSP_AT = 720;   // the lens is untouched; that is the point
// Tactical-fp's shoulder framing, kept in lockstep (head near centre, feet
// near the bottom edge, ~half the screen of fighter — the reference shot).
const OTS_BACK = 1.0, OTS_UP = 120 * K, OTS_PITCH = 10;   // tiles, world px, degrees
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

function quad(tex, w, h, tx, ty, tz, rot, cls) {
  return `<div class="tfp-q ${cls || ''}" style="width:${w}px;height:${h}px;margin-left:${-w / 2}px;margin-top:${-h / 2}px;`
    + `background-image:url(${tex});transform:translate3d(${tx}px,${ty}px,${tz}px) ${rot || ''}"></div>`;
}

/** The tactical board's slab-cutter, on this board's own quad(). @see
 *  tactical-fp.js's strip() for why a long slab is not merely expensive. */
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

function boardKey() {
  const T0 = V.bridge.terrain();
  return (T0 ? T0.name : 'flat') + '|' + ((groundURI() || '').length);
}

function buildBoard() {
  const T0 = V.bridge.terrain();
  const cols = T0 ? T0.cols : 9, rows = T0 ? T0.rows : 9;
  const span = cols * T;
  const out = [];
  // The field is a picture, not a repeating tile, so it is panelled rather than
  // stripped — see tactical-fp.js's field(). Same reason: 9 tiles square is
  // past a phone's texture ceiling on the one quad you stand on.
  const ground = groundURI() || facePanel('afpFieldFallback', '#3f5a2e', '#27381c');
  const gn = Math.max(1, Math.ceil(Math.max(span, rows * T) / (SEG_T * T)));
  const gw = span / gn, gh = (rows * T) / gn, gp = 100 / (gn - 1 || 1);
  for (let r = 0; r < gn; r++) {
    for (let c = 0; c < gn; c++) {
      out.push('<div class="tfp-q tfp-floor" style="'
        + `width:${gw}px;height:${gh}px;margin-left:${-gw / 2}px;margin-top:${-gh / 2}px;`
        + `background-image:url(${ground});background-size:${gn * 100}% ${gn * 100}%;`
        + `background-position:${(c * gp).toFixed(4)}% ${(r * gp).toFixed(4)}%;`
        + `transform:translate3d(${(c + 0.5) * gw}px,0px,${(r + 0.5) * gh}px) rotateX(90deg)"></div>`);
    }
  }

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

  V.world.querySelector('.tfp-geo').innerHTML = out.join('');
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
    const base = liftAt(T0, p.x + 0.5, p.y + 0.5);   // the ground THIS prop stands on
    const h = (p.h || 1) * (p.kind === 'boulder' ? T : STEP);
    if (p.flat) {
      // Against its shelf, facing out of it. One quad, one rotation, forever.
      const w = T * 0.42;
      const el = document.createElement('div');
      el.className = 'tfp-q afp-prop afp-flat';
      el.style.cssText = `width:${w}px;height:${h}px;margin-left:${-w / 2}px;margin-top:${-h / 2}px;`
        + `background-image:url(${p.kind === 'vine' ? vineTex() : ladderTex()});`
        + `transform:translate3d(${cx}px,${base - h / 2}px,${cz}px) rotateY(${FACE_YAW[p.face] || 0}deg)`;
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
    V.actors.set(f, { el, cv, bar, tf: '', hpw: '', blade: makeBlade(V.world.querySelector('.tfp-bbs'), T) });
  }
  for (const [f, a] of V.actors) {
    if (live.indexOf(f) < 0) { a.el.remove(); a.blade.el.remove(); V.actors.delete(f); }
  }
}

/** Camera-relative rotation, tactical-fp's identical trick: the compositor
 *  picks its sheet row from `facing`, so subtract the camera's yaw on a
 *  shallow proxy and the fighter shows the camera the side it really shows. */
function drawActor(f, a, yaw, swinging) {
  const gfx = window.__ranchGfx;
  if (!gfx || !gfx.renderActor) return;
  // CUT THE ORBITING BLADE FIRST, then hide the standee's own only if that
  // worked. A fighter whose weapon has no sheet — or whose sheet has not loaded
  // yet — must keep the blade the compositor draws, or the blow lands with
  // empty hands. Cut once per swing: the cell is fixed (the sheet's own frames
  // ARE the in-plane swing this replaces), so re-cutting it per frame would be
  // the same pixels at the same size, thirty times a second.
  if (swinging && !a.blade.drawn && gfx.weaponCell) {
    a.blade.drawn = gfx.weaponCell(a.blade.cv, f, SWING_COL, SWING_ROW);
  }
  const view = Object.create(f);
  view.facing = (typeof f.facing === 'number' ? f.facing : Math.PI) - yaw;
  // On a prototype view, so the fighter the sim owns never learns a camera exists.
  view._hideWeapon = !!(swinging && a.blade.drawn);
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
    const t = Math.min(1, (now - p.start) / p.dur);
    const x = p.x0 + (p.x1 - p.x0) * t, y = p.y0 + (p.y1 - p.y0) * t;
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

function fitLens() {
  const h = V.stage && V.stage.clientHeight;
  if (!h) return;
  V.stage.style.perspective = (PERSP * (h / PERSP_AT)).toFixed(1) + 'px';
}

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
 * In CSS the shear is one property. `perspective-origin` IS the vanishing
 * point: a point at infinity straight ahead projects there and nowhere else. A
 * rotation by θ puts the horizon at screen `P·tanθ` from centre, so moving the
 * origin by exactly that much reproduces the rotation's framing with none of
 * its depth change. And because fitLens keeps `perspective` proportional to the
 * stage height, `P/H` is the constant `PERSP/PERSP_AT` — the shear needs no
 * measurement and no resize handling.
 *
 * The knock-on: billboards no longer need their counter-rotation at all. That
 * whole term is gone from every per-frame transform string, which is a write
 * saved per standee per frame on the one lens that has a free look.
 */
function aimLens() {
  const oy = 50 + (PERSP / PERSP_AT) * Math.tan(V.pitch * Math.PI / 180) * 100;
  const po = `50% ${oy.toFixed(2)}%`;
  if (po !== V.po) V.stage.style.perspectiveOrigin = (V.po = po);
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
  const dp = (look ? look.pitch * 180 / Math.PI : 0)
    + Math.max(-1, Math.min(1, input.pitch || 0)) * PAD_PITCH_RATE * dt;
  if (dp) V.pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, V.pitch + dp));
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

  const T0 = V.bridge.terrain();
  const lift = liftAt(T0, me.ax, me.ay);
  let ex = me.ax * T, ez = me.ay * T, ey = lift - EYE, lean = 0;
  if (V.pov === 'shoulder') {
    const back = backOff(T0, me.ax, me.ay, V.yaw, OTS_BACK);
    ex -= Math.sin(V.yaw) * back * T;
    ez += Math.cos(V.yaw) * back * T;
    ey -= OTS_UP;
    lean = OTS_PITCH;
  }
  const deg = V.yaw * 180 / Math.PI;
  // The free pitch is a SHEAR on the lens, not a term in here — see aimLens for
  // why, and for the measured size-swing that rotating it used to cause. The
  // shoulder camera's own 10° stays a rotation: it is a fixed framing lean the
  // portrait shot was tuned to, it never moves while you play, and a constant
  // cannot produce a swing. Billboards therefore counter NOTHING now.
  aimLens();
  // The scale is OUTERMOST and undoes K exactly: the picture is the one the
  // framing was measured at, only the rasters underneath it shrank.
  const sc = (1 / K).toFixed(4);
  const wtf = `scale3d(${sc},${sc},${sc})${lean ? ` rotateX(${lean}deg)` : ''} rotateY(${deg.toFixed(2)}deg) translate3d(${(-ex).toFixed(1)}px,${(-ey).toFixed(1)}px,${(-ez).toFixed(1)}px)`;
  if (wtf !== V.wtf) V.world.style.transform = (V.wtf = wtf);

  if (boardKey() !== V.boardKey) buildBoard();
  ensureActors();

  for (const [f, a] of V.actors) {
    // Your own body is not drawn in first person; it IS from the shoulder.
    const self = f === me && V.pov !== 'shoulder';
    if (self !== a.selfHidden) { a.el.style.visibility = (a.selfHidden = self) ? 'hidden' : ''; }
    // In first person your own blade is the VIEWMODEL, not an orbit around a
    // body you cannot see — park it, or it freezes mid-arc waiting for a frame
    // that never comes.
    if (self) { placeBlade(a.blade, null); continue; }
    const fl = liftAt(T0, f.ax, f.ay);
    const tf = `translate3d(${(f.ax * T).toFixed(1)}px,${fl.toFixed(1)}px,${(f.ay * T).toFixed(1)}px) rotateY(${(-deg).toFixed(1)}deg)`;
    if (tf !== a.tf) a.el.style.transform = (a.tf = tf);
    const hp = Math.max(0, Math.min(1, f.hp / (f.maxHp || f.hp || 1)));
    const w = (hp * 100).toFixed(0) + '%';
    if (w !== a.hpw) { a.bar.style.width = (a.hpw = w); }
    // The blow travels round the wielder in the GROUND plane — the plane the
    // sheet's own attack frames were drawn in before a billboard stood them up.
    const t = swingT(f);
    if (t == null) a.blade.drawn = false;   // re-cut on the next blow
    drawActor(f, a, V.yaw, t != null);      // cuts the blade; must precede placing it
    placeBlade(a.blade, t, f.ax, f.ay, fl, typeof f.facing === 'number' ? f.facing : Math.PI, -deg, T);
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
  const bob = anim === 'move' ? (Math.sin(now / 150) * 14).toFixed(1) + 'px' : '0px';
  if (bob !== V._bob) V.handsEl.style.setProperty('--fp-bob', (V._bob = bob));
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
    host.innerHTML = '<div class="tfp-stage"><div class="tfp-world">'
      + '<div class="tfp-geo"></div><div class="tfp-bbs"></div>'
      + '</div></div><div class="tfp-haze"></div>'
      + '<div class="fp-hands"></div>'
      + '<canvas class="afp-ring" width="72" height="72"></canvas>'
      // Said once, in the order you need it: how to aim, how to hit, how to
      // leave. The cursor is never taken, so the attack bar below is clickable
      // the whole time — which is the entire reason the look is a held button.
      + '<div class="afp-look"><b>Right-drag</b> to look &middot; <b>Left-click</b> or <b>1</b>&ndash;<b>6</b> to attack'
      + ' &middot; <b>V</b> changes camera</div>';
    host.style.background = `url(${cloudsPanel()}) repeat-x 0 6% / auto 30%,`
      + 'linear-gradient(rgb(92,132,188) 0%, rgb(128,156,196) 34%, rgb(156,174,196) 50%, rgb(112,120,132) 58%, rgb(74,80,92) 100%)';
    stage.appendChild(host);
    V = {
      host, world: host.querySelector('.tfp-world'), bridge,
      // The stage owns the LENS: `perspective` is the field of view and
      // `perspective-origin` is where the horizon sits, which is how this view
      // pitches. Held rather than re-queried — both are written per frame.
      stage: host.querySelector('.tfp-stage'), po: '',
      pov: 'first', yaw: 0, pitch: 0, wtf: '', last: 0,
      actors: new Map(), shots: new Map(), dressing: [],
      boardKey: '', ringCv: host.querySelector('.afp-ring'),
      handsEl: host.querySelector('.fp-hands'), hands: null, handsFor: null, lastAnim: '',
      look: null,
    };
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
  });
  window.__actFpStep = () => { actFpFrame(); return window.__actFpDebug(); };
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
