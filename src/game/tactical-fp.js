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

/** World scale. Shared with the delve so a person is the same size in both. */
const T = 900;            // world px per tile
const EYE = 690;          // eye height above the floor a fighter stands on
const STEP = 430;         // one elevation step
const BLOCK_H = 900;      // an impassable cell's height
const FIGHTER_H = 1200;   // the compositor's 96px canvas — ~31% of it is empty below the feet
const FOOT_PCT = 31.25;   // …which is why the art slides down by this much to stand up
const PERSP = 500, PERSP_AT = 720;
/** Over-the-shoulder: how far back and up, and how far the lens tips down. */
const OTS_BACK = 1.9, OTS_UP = 560, OTS_PITCH = 12;

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
 *  vertical faces in it. */
function facePanel(key, base, dark) {
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
  // The lip of the world. You cannot leave the grid, so it should look like
  // somewhere that ends rather than somewhere that stops being drawn.
  const B = BLOCK_H * 0.55, by = -B / 2;
  out.push(quad(edge, span, B, span / 2, by, 0, 'rotateY(180deg)', 'tfp-wall'));
  out.push(quad(edge, span, B, span / 2, by, span, '', 'tfp-wall'));
  out.push(quad(edge, span, B, 0, by, span / 2, 'rotateY(-90deg)', 'tfp-wall'));
  out.push(quad(edge, span, B, span, by, span / 2, 'rotateY(90deg)', 'tfp-wall'));

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

/** Place the world so the subject's eye is at the origin, looking down its facing. */
function aimCamera() {
  const f = V.subject;
  if (!f || !V.world) return;
  const yaw = (typeof f.facing === 'number' ? f.facing : Math.PI);
  const deg = yaw * 180 / Math.PI;
  const lift = liftAt(f.x, f.y);
  let ex = (f.x + 0.5) * T, ez = (f.y + 0.5) * T, ey = lift - EYE, pitch = 0;
  if (V.pov === 'shoulder') {
    // Behind and above, looking slightly down — the fighter stays in frame.
    ex -= Math.sin(yaw) * OTS_BACK * T;
    ez += Math.cos(yaw) * OTS_BACK * T;
    ey -= OTS_UP;
    pitch = OTS_PITCH;
  }
  V.yaw = yaw;
  V.world.style.transform = `rotateX(${pitch}deg) rotateY(${deg}deg) translate3d(${-ex}px,${-ey}px,${-ez}px)`;
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
    + '</div></div><div class="tfp-haze"></div>';
  screen.appendChild(host);
  V = {
    host, world: host.querySelector('.tfp-world'),
    subject: null, pov: 'first', yaw: 0,
    actors: new Map(), boardKey: '', pathKey: '',
  };
  tacFpSetSubject(0);
  if (!V.onResize) { V.onResize = () => { fitLens(); }; window.addEventListener('resize', V.onResize); }
}
