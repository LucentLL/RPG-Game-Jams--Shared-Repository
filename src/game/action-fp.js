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
 * Nothing here can put the eye outside the world: the board's own fence,
 * apron and stands (tall past any pull-back) come with the dressing — and the
 * shoulder camera CLAMPS at impassable rock, because a boulder standing
 * between the eye and your own fighter reads as standing on a wall.
 */
import { facePanel, apronPanel, standsPanel, cloudsPanel } from './tactical-fp.js';
import { createFpHands, fighterHandsSpec } from './fp-hands.js';

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
/** How fast held turn input swings the view, rad/s. The delve's 45° / 130ms
 *  works out to ~6 rad/s in bursts; continuous steering wants less. */
const TURN_RATE = 3.1;

/** @type {?Object} the live view (null when the arena camera is off) */
let V = null;

export function actFpActive() { return !!V; }
export function actFpPov() { return V ? V.pov : 'first'; }

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
 * Steer, the delve's grammar in real time. Called by actionTick IN PLACE of
 * its own key→vector build while this view is up: `turn` swings the yaw,
 * `fwd` walks along it, `strafe` slides across it, and the returned vector is
 * in world tiles — same speed, same slide rules, nothing about movement
 * changes but the frame it is read in. The returned `yaw` becomes the
 * fighter's facing: where you look is one fact everywhere.
 */
export function actFpSteer(input, dt) {
  if (!V) return null;
  const turn = Math.max(-1, Math.min(1, input.turn || 0));
  V.yaw += turn * TURN_RATE * dt;
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
  let ex = me.ax * T, ez = me.ay * T, ey = lift - EYE, pitch = 0;
  if (V.pov === 'shoulder') {
    const back = backOff(T0, me.ax, me.ay, V.yaw, OTS_BACK);
    ex -= Math.sin(V.yaw) * back * T;
    ez += Math.cos(V.yaw) * back * T;
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
    host.innerHTML = '<div class="tfp-stage"><div class="tfp-world">'
      + '<div class="tfp-geo"></div><div class="tfp-bbs"></div>'
      + '</div></div><div class="tfp-haze"></div>'
      + '<div class="fp-hands"></div>'
      + '<canvas class="afp-ring" width="72" height="72"></canvas>';
    host.style.background = `url(${cloudsPanel()}) repeat-x 0 6% / auto 30%,`
      + 'linear-gradient(rgb(92,132,188) 0%, rgb(128,156,196) 34%, rgb(156,174,196) 50%, rgb(112,120,132) 58%, rgb(74,80,92) 100%)';
    stage.appendChild(host);
    V = {
      host, world: host.querySelector('.tfp-world'), bridge,
      pov: 'first', yaw: 0, wtf: '', last: 0,
      actors: new Map(), shots: new Map(), dressing: [],
      boardKey: '', ringCv: host.querySelector('.afp-ring'),
      handsEl: host.querySelector('.fp-hands'), hands: null, handsFor: null, lastAnim: '',
    };
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
}
