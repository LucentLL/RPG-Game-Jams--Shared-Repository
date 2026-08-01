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
 * THE CAMERA IS A SOFT LOCK-ON. In a real-time duel the one thing the player
 * must never lose is the opponent, and your fighter's own `facing` is set by
 * whichever way you last walked — a camera bolted to it whips with every
 * sidestep. So the yaw EASES toward the bearing to the opponent instead
 * (Z-targeting, by an older name): the foe stays framed, W closes, S opens
 * distance, A/D circle them. Movement input is rotated into that camera's
 * frame by actFpMapInput — actionTick calls it, which is the one and only
 * touch this view has on the input path, and it is pure rotation: the same
 * held keys move the same fighter at the same speed.
 *
 * Nothing here can put the eye outside the world: the board's own fence,
 * apron and stands (tall past any pull-back) come with the dressing.
 */
import { facePanel, apronPanel, standsPanel, cloudsPanel } from './tactical-fp.js';

/** World scale — the delve's, via tactical-fp, so a person is the same size
 *  standing in any of the three grounds. */
const T = 900;
const EYE = 690;
const STEP = 430;              // one terrain level, world px
const FIGHTER_H = 1200;
const FOOT_PCT = 31.25;
const PERSP = 500, PERSP_AT = 720;
const OTS_BACK = 1.9, OTS_UP = 560, OTS_PITCH = 12;
const APRON_T = 6, RING_H = 2400;
/** How fast the lock-on settles, 1/s. Fast enough to keep a circling foe
 *  framed, slow enough that a blink-step reads as a swing, not a cut. */
const YAW_EASE = 3.4;

/** @type {?Object} the live view (null when the arena camera is off) */
let V = null;

export function actFpActive() { return !!V; }
export function actFpPov() { return V ? V.pov : 'first'; }

/** Shortest way round the circle. */
const wrapA = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

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
  const ground = groundURI();
  if (ground) out.push(quad(ground, span, rows * T, span / 2, 0, rows * T / 2, 'rotateX(90deg)', 'tfp-floor'));

  // The shelves. bakeGrid already told the flat view where the raised tops
  // are; here they get real sides and a lid at the height combat already
  // credits them with (heightAt/liftAt read the same grids).
  if (T0) {
    const side = facePanel('afpLedge', '#7c8a52', '#42502c');
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
  const edge = facePanel('edge', '#4a4640', '#22201c');
  const B = STEP * 1.15, by = -B / 2;
  out.push(quad(edge, span, B, span / 2, by, 0, 'rotateY(180deg)', 'tfp-wall'));
  out.push(quad(edge, span, B, span / 2, by, rows * T, '', 'tfp-wall'));
  out.push(quad(edge, span, B, 0, by, rows * T / 2, 'rotateY(-90deg)', 'tfp-wall'));
  out.push(quad(edge, span, B, span, by, rows * T / 2, 'rotateY(90deg)', 'tfp-wall'));

  const A = APRON_T * T, apron = apronPanel();
  out.push(quad(apron, span + 2 * A, A, span / 2, 0, -A / 2, 'rotateX(90deg)', 'tfp-floor tfp-apron'));
  out.push(quad(apron, span + 2 * A, A, span / 2, 0, rows * T + A / 2, 'rotateX(90deg)', 'tfp-floor tfp-apron'));
  out.push(quad(apron, A, rows * T, -A / 2, 0, rows * T / 2, 'rotateX(90deg)', 'tfp-floor tfp-apron'));
  out.push(quad(apron, A, rows * T, span + A / 2, 0, rows * T / 2, 'rotateX(90deg)', 'tfp-floor tfp-apron'));

  const stands = standsPanel(), ry = -RING_H / 2, rl = span + 2 * A;
  out.push(quad(stands, rl, RING_H, span / 2, ry, -A, '', 'tfp-wall tfp-ring'));
  out.push(quad(stands, rl, RING_H, span / 2, ry, rows * T + A, 'rotateY(180deg)', 'tfp-wall tfp-ring'));
  out.push(quad(stands, rl, RING_H, -A, ry, rows * T / 2, 'rotateY(90deg)', 'tfp-wall tfp-ring'));
  out.push(quad(stands, rl, RING_H, span + A, ry, rows * T / 2, 'rotateY(-90deg)', 'tfp-wall tfp-ring'));

  V.world.querySelector('.tfp-geo').innerHTML = out.join('');
  V.boardKey = boardKey();
  buildDressing(T0);
}

/** Boulders, ladders and vines — the standing things the flat arena dresses
 *  with sprites. Billboards here, turned to the camera every frame. */
function buildDressing(T0) {
  for (const d of V.dressing) d.el.remove();
  V.dressing = [];
  if (!T0) return;
  for (const p of T0.props) {
    const el = document.createElement('div');
    el.className = 'tfp-bb afp-prop';
    let w, h;
    if (p.kind === 'boulder') {
      w = T * 0.78; h = T * 0.78;
      const cv = document.createElement('canvas');
      cv.width = 48; cv.height = 48;
      cv.style.width = '100%'; cv.style.height = '100%';
      el.appendChild(cv);
      rocksImg(V.bridge.tilesBase).then((im) => {
        const g = cv.getContext('2d');
        g.imageSmoothingEnabled = false;
        g.drawImage(im, 0, 0, 48, 48, 0, 0, 48, 48);
      }).catch(() => { el.style.backgroundImage = `url(${facePanel('afpRock', '#8a8478', '#4a463e')})`; });
    } else {
      w = T * 0.42; h = STEP;
      el.style.backgroundImage = `url(${p.kind === 'vine' ? vineTex() : ladderTex()})`;
      el.style.backgroundSize = '100% 100%';
    }
    el.style.width = w + 'px';
    el.style.height = h + 'px';
    el.style.marginLeft = (-w / 2) + 'px';
    V.world.querySelector('.tfp-bbs').appendChild(el);
    V.dressing.push({ el, x: p.x + 0.5, y: p.y + 0.5, h, tf: '' });
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
  const st = V.host.querySelector('.tfp-stage');
  const h = st && st.clientHeight;
  if (!h) return;
  st.style.perspective = (PERSP * (h / PERSP_AT)).toFixed(1) + 'px';
}

/**
 * Rotate held input into the camera's frame: pressing ▲ walks the way the
 * camera looks. Called by actionTick — pure rotation, so speed is untouched.
 * When the view is off it is the identity, and the arena is exactly itself.
 */
export function actFpMapInput(dx, dy) {
  if (!V) return { x: dx, y: dy };
  const s = Math.sin(V.yaw), c = Math.cos(V.yaw);
  return { x: s * -dy + c * dx, y: -c * -dy + s * dx };
}

/** Per frame, from actionRender. Eases the lock-on, places everyone. */
export function actFpFrame() {
  if (!V) return;
  const [me, foe] = V.bridge.fighters() || [];
  if (!me) return;
  const now = performance.now();
  const dt = Math.min(0.08, (now - (V.last || now)) / 1000);
  V.last = now;

  // The soft lock: settle the yaw toward the foe's bearing while they stand;
  // once they fall, toward your own facing, which is the walk-away shot.
  const want = (foe && foe.hp > 0)
    ? Math.atan2(foe.ax - me.ax, -(foe.ay - me.ay))
    : (typeof me.facing === 'number' ? me.facing : 0);
  V.yaw += wrapA(want - V.yaw) * Math.min(1, dt * YAW_EASE);

  const T0 = V.bridge.terrain();
  const lift = liftAt(T0, me.ax, me.ay);
  let ex = me.ax * T, ez = me.ay * T, ey = lift - EYE, pitch = 0;
  if (V.pov === 'shoulder') {
    ex -= Math.sin(V.yaw) * OTS_BACK * T;
    ez += Math.cos(V.yaw) * OTS_BACK * T;
    ey -= OTS_UP;
    pitch = OTS_PITCH;
  }
  const deg = V.yaw * 180 / Math.PI;
  const wtf = `rotateX(${pitch}deg) rotateY(${deg.toFixed(2)}deg) translate3d(${(-ex).toFixed(1)}px,${(-ey).toFixed(1)}px,${(-ez).toFixed(1)}px)`;
  if (wtf !== V.wtf) V.world.style.transform = (V.wtf = wtf);

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
  for (const d of V.dressing) {
    const tf = `translate3d(${(d.x * T).toFixed(1)}px,0px,${(d.y * T).toFixed(1)}px) rotateY(${(-deg).toFixed(1)}deg)`;
    if (tf !== d.tf) d.el.style.transform = (d.tf = tf);
  }
  placeShots(V.yaw);
  drawCharge(me);
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
    host.innerHTML = '<div class="tfp-stage"><div class="tfp-world">'
      + '<div class="tfp-geo"></div><div class="tfp-bbs"></div>'
      + '</div></div><div class="tfp-haze"></div>'
      + '<canvas class="afp-ring" width="72" height="72"></canvas>';
    host.style.background = `url(${cloudsPanel()}) repeat-x 0 6% / auto 30%,`
      + 'linear-gradient(rgb(92,132,188) 0%, rgb(128,156,196) 34%, rgb(156,174,196) 50%, rgb(112,120,132) 58%, rgb(74,80,92) 100%)';
    stage.appendChild(host);
    V = {
      host, world: host.querySelector('.tfp-world'), bridge,
      pov: 'first', yaw: 0, wtf: '', last: 0,
      actors: new Map(), shots: new Map(), dressing: [],
      boardKey: '', ringCv: host.querySelector('.afp-ring'),
    };
    // Open looking the way your fighter faces — the first eased frames then
    // carry the eye onto the foe, which reads as finding them, not a cut.
    const me = (bridge.fighters() || [])[0];
    if (me && typeof me.facing === 'number') V.yaw = me.facing;
    buildBoard();
    ensureActors();
    fitLens();
    V.onResize = () => fitLens();
    window.addEventListener('resize', V.onResize);
  } else {
    V.bridge = bridge || V.bridge;
  }
  V.pov = kind === 'shoulder' ? 'shoulder' : 'first';
  V.host.classList.toggle('tfp-ots', V.pov === 'shoulder');
  actFpFrame();
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
}
