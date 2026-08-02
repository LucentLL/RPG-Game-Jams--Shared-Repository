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

/** World scale. Shared with the delve so a person is the same size in both. */
const T = 900;            // world px per tile
const EYE = 690;          // eye height above the floor a fighter stands on
const STEP = 430;         // one elevation step
const BLOCK_H = 900;      // an impassable cell's height
const FIGHTER_H = 1200;   // the compositor's 96px canvas — ~31% of it is empty below the feet
const FOOT_PCT = 31.25;   // …which is why the art slides down by this much to stand up
const PERSP = 500, PERSP_AT = 720;
/**
 * Over-the-shoulder: how far back and up, and how far the lens tips down.
 * Tuned to the action-RPG reference the user gave: the fighter stands about
 * HALF the screen tall, head near centre, feet near the bottom edge. The
 * first cut (1.9 back, 560 up, 12°) was a crane shot — the character landed
 * in the bottom sixth of the frame at a sixth of its height. The numbers
 * fall out of the projection: eye at EYE+120 ≈ 810, one tile back, pitched
 * 10° → head ≈ screen centre, feet ≈ 92% down, span ≈ 46% of the stage.
 */
const OTS_BACK = 1.0, OTS_UP = 120, OTS_PITCH = 10;

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
/** A flat colour panel with a little noise, for the sides of things. Drawn
 *  rather than cropped: the battlefield bake is a top-down sheet and has no
 *  vertical faces in it. (Exported: action-fp.js dresses the SAME colosseum
 *  around the real-time arena, and two copies of these bakes would drift.) */
export function facePanel(key, base, dark) {
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
  return (_tex[key] = cv.toDataURL());
}

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
 *  stepping to the board's edge puts the eye outside the world again. */
const APRON_T = 6, RING_H = 2400;

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
const WADE = 90;
const liftAt = (c, r) => (elevAt(c, r) === 0 ? WADE : 0);

function quad(tex, w, h, tx, ty, tz, rot, cls, tint) {
  const veil = tint ? `linear-gradient(${tint},${tint}),` : '';
  return `<div class="tfp-q ${cls || ''}" style="width:${w}px;height:${h}px;margin-left:${-w / 2}px;margin-top:${-h / 2}px;`
    + `background-image:${veil}url(${tex});transform:translate3d(${tx}px,${ty}px,${tz}px) ${rot || ''}"></div>`;
}

/**
 * Build the board. One big quad carries the whole 9×9 ground, because the
 * battlefield is already baked as a single image for the grid's background —
 * the same art, so the two views cannot disagree about what the field looks
 * like. Only the things that stand OFF that plane cost their own geometry.
 */
function buildBoard() {
  const out = [];
  const ground = S.arenaGroundURI;
  const span = GS * T;
  if (ground) out.push(quad(ground, span, span, span / 2, 0, span / 2, 'rotateX(90deg)', 'tfp-floor'));

  const rock = facePanel('rock', '#6b6257', '#2e2a24');
  const rockTop = facePanel('rockTop', '#7d7466', '#5c5548');
  const edge = facePanel('edge', '#4a4640', '#22201c');

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
  const B = BLOCK_H * 0.55, by = -B / 2;
  out.push(quad(edge, span, B, span / 2, by, 0, 'rotateY(180deg)', 'tfp-wall'));
  out.push(quad(edge, span, B, span / 2, by, span, '', 'tfp-wall'));
  out.push(quad(edge, span, B, 0, by, span / 2, 'rotateY(-90deg)', 'tfp-wall'));
  out.push(quad(edge, span, B, span, by, span / 2, 'rotateY(90deg)', 'tfp-wall'));

  // The apron — four slabs of ground from the fence out to the stands.
  const A = APRON_T * T, apron = apronPanel();
  out.push(quad(apron, span + 2 * A, A, span / 2, 0, -A / 2, 'rotateX(90deg)', 'tfp-floor tfp-apron'));
  out.push(quad(apron, span + 2 * A, A, span / 2, 0, span + A / 2, 'rotateX(90deg)', 'tfp-floor tfp-apron'));
  out.push(quad(apron, A, span, -A / 2, 0, span / 2, 'rotateX(90deg)', 'tfp-floor tfp-apron'));
  out.push(quad(apron, A, span, span + A / 2, 0, span / 2, 'rotateX(90deg)', 'tfp-floor tfp-apron'));

  // The colosseum ring — crowd-dotted stands facing the field on all four
  // sides, tall enough that no camera the view can produce sees past them
  // except into sky. (tfp-ring tiles the texture along the wall instead of
  // stretching one crowd across half a kilometre of masonry.)
  const stands = standsPanel(), ry = -RING_H / 2, rl = span + 2 * A;
  out.push(quad(stands, rl, RING_H, span / 2, ry, -A, '', 'tfp-wall tfp-ring'));
  out.push(quad(stands, rl, RING_H, span / 2, ry, span + A, 'rotateY(180deg)', 'tfp-wall tfp-ring'));
  out.push(quad(stands, rl, RING_H, -A, ry, span / 2, 'rotateY(90deg)', 'tfp-wall tfp-ring'));
  out.push(quad(stands, rl, RING_H, span + A, ry, span / 2, 'rotateY(-90deg)', 'tfp-wall tfp-ring'));

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
      out.push(quad(dyn, T * 0.42, T * 0.42, x * T + T / 2, liftAt(x, y) - 8, y * T + T / 2, 'rotateX(90deg)', 'tfp-mark'));
      break;
    }
    x += s.dx; y += s.dy;
    if (x < 0 || y < 0 || x >= GS || y >= GS) break;
    out.push(quad(dot, T * 0.3, T * 0.3, x * T + T / 2, liftAt(x, y) - 8, y * T + T / 2, 'rotateX(90deg)', 'tfp-mark'));
  }
  host.innerHTML = out.join('');
}

// ---------------------------------------------------------------------------
// The camera
// ---------------------------------------------------------------------------

function fitLens() {
  const st = V.host.querySelector('.tfp-stage');
  const h = st && st.clientHeight;
  if (!h) return;                                    // measured before it is shown
  st.style.perspective = (PERSP * (h / PERSP_AT)).toFixed(1) + 'px';
}

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
    pitch = OTS_PITCH;
  }
  V.yaw = yaw;
  V.world.style.transform = `rotateX(${pitch}deg) rotateY(${deg}deg) translate3d(${-ex}px,${-ey}px,${-ez}px)`;
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
    if (V.onResize) window.removeEventListener('resize', V.onResize);
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
    subject: null, pov: 'first', yaw: 0,
    actors: new Map(), boardKey: '', pathKey: '',
    handsEl: host.querySelector('.fp-hands'), hands: null, handsFor: null, lastAnim: '',
  };
  tacFpSetSubject(0);
  syncHands();
  if (!V.onResize) { V.onResize = () => { fitLens(); if (V && V.hands) V.hands.fit(); }; window.addEventListener('resize', V.onResize); }
}
