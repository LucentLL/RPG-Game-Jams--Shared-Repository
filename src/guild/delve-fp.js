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
import { THEMES, DECALS, ORE_KINDS, mapForLocale, validateMap } from './delve-maps.js';
import { preyById } from './locales.js';
import { loadImg, SHEET_URLS } from './delve.js';

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
const VIEW_R = 9;        // tiles of geometry built around the walker
const REACH = 0.75;      // how close a creature must be to engage

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

/** Draw a source rect onto a canvas of its own size and hand back a data URI.
 *  `dim` darkens it, which is how the ceiling is made out of the floor. */
function panel(img, sx, sy, sw, sh, dw, dh, dim) {
  const c = document.createElement('canvas');
  c.width = dw; c.height = dh;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
  if (dim) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = `rgba(0,0,0,${dim})`; g.fillRect(0, 0, dw, dh); }
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
async function cutSurfaces(theme) {
  const need = new Set(['cliffs', theme.sheet, theme.walls && theme.walls.sheet].filter(Boolean));
  const sheets = {};
  for (const k of need) sheets[k] = await loadImg(SHEET_URLS[k] || (SHEET_URLS.cliffs));
  const src = theme.src || 48;
  const fill = theme.fill[0];
  const floorImg = sheets[theme.sheet || 'cliffs'];
  const floor = panel(floorImg, fill[0] * src, fill[1] * src, src, src, T, T);
  const ceil = panel(floorImg, fill[0] * src, fill[1] * src, src, src, T, T, 0.55);

  let wall, low;
  if (theme.walls) {
    const w = sheets[theme.walls.sheet], r = theme.walls.tall, l = theme.walls.low;
    wall = panel(w, r[0], r[1], r[2], r[3], T, WALL_H);
    low = panel(w, l[0], l[1], l[2], l[3], T, LOW_H);
  } else {
    // Two cliff-face tiles stacked make one wall the height of the drop.
    const c = document.createElement('canvas');
    c.width = 48; c.height = 96;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    const put = (t, dy) => g.drawImage(sheets.cliffs, t[0] * 48, t[1] * 48, 48, 48, 0, dy, 48, 48);
    put(theme.faceTop.m, 0); put(theme.faceBot.m, 48);
    wall = panel(c, 0, 0, 48, 96, T, WALL_H);
    low = panel(c, 0, 0, 48, 48, T, LOW_H);
  }
  // The ore face is the vein art on a wall, so a seam reads as something to work.
  const ores = await loadImg(SHEET_URLS.ores);
  const oreCrop = DECALS.oreIron;
  const oc = document.createElement('canvas');
  oc.width = T; oc.height = WALL_H;
  const og = oc.getContext('2d');
  og.imageSmoothingEnabled = false;
  const wi = new Image();
  return new Promise((res) => {
    wi.onload = () => {
      og.drawImage(wi, 0, 0);
      og.drawImage(ores, oreCrop.x, oreCrop.y, oreCrop.w, oreCrop.h, (T - 48) / 2, WALL_H - 56, 48, 48);
      res({ floor, ceil, wall, low, ore: oc.toDataURL() });
    };
    wi.onerror = () => res({ floor, ceil, wall, low, ore: wall });
    wi.src = wall;
  });
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

/** Facing 0=north(-y) 1=east(+x) 2=south(+y) 3=west(-x). */
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const COMPASS = ['N', 'E', 'S', 'W'];

// ---------------------------------------------------------------------------
// Geometry — rebuilt on a change of cell, never per frame
// ---------------------------------------------------------------------------

/** One quad. `cls` only carries styling; the transform does all the placing. */
function quad(tex, w, h, tx, ty, tz, rot, cls) {
  return `<div class="fp-q ${cls}" style="width:${w}px;height:${h}px;margin-left:${-w / 2}px;margin-top:${-h / 2}px;` +
    `background-image:url(${tex});transform:translate3d(${tx}px,${ty}px,${tz}px) ${rot}"></div>`;
}

function buildGeometry() {
  const S = F.surf;
  const cx = Math.floor(F.px), cy = Math.floor(F.py);
  const out = [];
  for (let y = cy - VIEW_R; y <= cy + VIEW_R; y++) {
    for (let x = cx - VIEW_R; x <= cx + VIEW_R; x++) {
      const ch = at(x, y);
      const wx = (x + 0.5) * T, wz = (y + 0.5) * T;
      if (WALL[ch] || LOW[ch]) {
        const h = LOW[ch] ? LOW_H : WALL_H;
        const tex = ch === 'o' ? S.ore : (LOW[ch] ? S.low : S.wall);
        const yc = -h / 2;
        // A face is emitted only where it meets somewhere you could stand, so a
        // solid block of rock costs nothing and no face is ever seen from behind.
        if (!WALL[at(x, y + 1)] && !LOW[at(x, y + 1)]) out.push(quad(tex, T, h, wx, yc, (y + 1) * T, '', 'fp-wall'));
        if (!WALL[at(x, y - 1)] && !LOW[at(x, y - 1)]) out.push(quad(tex, T, h, wx, yc, y * T, 'rotateY(180deg)', 'fp-wall'));
        if (!WALL[at(x + 1, y)] && !LOW[at(x + 1, y)]) out.push(quad(tex, T, h, (x + 1) * T, yc, wz, 'rotateY(90deg)', 'fp-wall'));
        if (!WALL[at(x - 1, y)] && !LOW[at(x - 1, y)]) out.push(quad(tex, T, h, x * T, yc, wz, 'rotateY(-90deg)', 'fp-wall'));
        // A waist-high run needs a lid, or you look down into an open box.
        if (LOW[ch]) out.push(quad(S.ceil, T, T, wx, -h, wz, 'rotateX(90deg)', 'fp-floor'));
        continue;
      }
      if (ch === '#') continue;
      const lift = -heightAt(x, y) * STEP_PX;
      out.push(quad(S.floor, T, T, wx, lift, wz, 'rotateX(90deg)', 'fp-floor'));
      out.push(quad(S.ceil, T, T, wx, -WALL_H, wz, 'rotateX(-90deg)', 'fp-ceil'));
      // A ledge's own riser, so a step up reads as a step and not a slope.
      if (heightAt(x, y) && !heightAt(x, y + 1)) out.push(quad(S.low, T, STEP_PX, wx, -STEP_PX / 2, (y + 1) * T, '', 'fp-wall'));
    }
  }
  F.world.querySelector('.fp-geo').innerHTML = out.join('');
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

function spawnCreature(prey, img, x, y) {
  const fw = Math.floor(img.naturalWidth / 3), fh = Math.floor(img.naturalHeight / 4);
  const cv = document.createElement('canvas');
  cv.width = fw; cv.height = fh;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(img, fw, 0, fw, fh, 0, 0, fw, fh); // col 1, row 0 — the toward-you pose
  const scale = 1.9;
  const el = addBillboard('fp-creature', '', fw * scale, fh * scale);
  el.appendChild(cv);
  cv.style.width = '100%'; cv.style.height = '100%';
  F.creatures.push({ prey, el, x, y, home: { x, y }, mode: 'idle', t: 1 + Math.random() * 2, tx: x, ty: y });
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

async function prep(mapId) {
  const map = mapForLocale(mapId);
  if (!map) throw new Error('delve-fp: no map ' + mapId);
  validateMap(map);
  const theme = THEMES[map.theme];
  const surf = await cutSurfaces(theme);
  const spawns = [];
  for (const s of (map.spawns || [])) {
    const prey = preyById(s.prey);
    if (!prey) continue;
    try { spawns.push({ prey, s, img: await loadImg(ART_BASE + prey.art + '.png') }); }
    catch (e) { console.warn('delve-fp: creature sheet missing for', s.prey, e); }
  }
  return { map, theme, surf, spawns };
}

function mount(prep, entry) {
  const { map, theme, surf, spawns } = prep;
  F.map = map; F.theme = theme; F.surf = surf;
  F.grid = map.grid; F.cols = map.grid[0].length; F.rows = map.grid.length;
  const at0 = entry || map.entry;
  F.px = Math.floor(at0[0]) + 0.5; F.py = Math.floor(at0[1]) + 0.5;
  F.dir = 2; F.yaw = 180; F.turning = null; F.stepping = null;
  F.creatures = []; F.mined = F.mined || new Set();
  F.settleUntil = performance.now() + 250;

  const stage = F.host.querySelector('.fp-stage');
  stage.innerHTML = '<div class="fp-world"><div class="fp-geo"></div><div class="fp-bbs"></div></div>';
  F.world = stage.querySelector('.fp-world');
  buildGeometry();
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
      <div class="fp-vignette"></div>
      <div class="delve-hud">
        <button class="dv-leave" onclick="__delveFp.leave()">⬅ Leave</button>
        <span class="fp-title dv-title"></span>
        <span class="fp-compass"></span>
        <span class="dv-haul fp-haul"></span>
      </div>
      <canvas class="fp-map" width="150" height="150"></canvas>
      <div class="delve-toasts fp-toasts"></div>
      <div class="fp-pad">
        <button data-k="turnL">◀</button>
        <button data-k="fwd">▲</button>
        <button data-k="turnR">▶</button>
        <button data-k="back">▼</button>
      </div>`;

    F = {
      map: null, theme: null, surf: null, hooks, member, host, world: null,
      grid: null, cols: 0, rows: 0,
      px: 0, py: 0, dir: 2, yaw: 180, turning: null, stepping: null,
      keys: {}, last: 0, raf: 0, ended: false, fighting: false, grace: false, transiting: false,
      creatures: [], seen: new Set(), mined: new Set(), settleUntil: 0,
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
      F = null;
      host.innerHTML = '';
      showScreen('guildScreen');
      throw e;
    }
    toast(`${member.name.split(' ')[0]} descends into ${p.map.name || hooks.locale.name}.`);
    return true;
  } finally {
    opening = false;
  }
}

// ---------------------------------------------------------------------------
// Input — grid steps and quarter turns
// ---------------------------------------------------------------------------

function wireInput() {
  F.onKeyDown = (e) => {
    if (!screenActive() || F.fighting) return;
    const k = e.key.toLowerCase();
    if (k === 'escape') { leave(); return; }
    const map = {
      arrowup: 'fwd', w: 'fwd', arrowdown: 'back', s: 'back',
      arrowleft: 'turnL', arrowright: 'turnR', a: 'strafeL', d: 'strafeR',
      q: 'turnL', e: 'turnR',
    };
    if (map[k]) { e.preventDefault(); F.keys[map[k]] = true; }
  };
  F.onKeyUp = (e) => {
    if (!F) return;
    const k = e.key.toLowerCase();
    const map = {
      arrowup: 'fwd', w: 'fwd', arrowdown: 'back', s: 'back',
      arrowleft: 'turnL', arrowright: 'turnR', a: 'strafeL', d: 'strafeR',
      q: 'turnL', e: 'turnR',
    };
    if (map[k]) F.keys[map[k]] = false;
  };
  window.addEventListener('keydown', F.onKeyDown);
  window.addEventListener('keyup', F.onKeyUp);
  F.host.querySelectorAll('.fp-pad button').forEach((b) => {
    const k = b.dataset.k;
    const on = (e) => { e.preventDefault(); F.keys[k] = true; };
    const off = () => { if (F) F.keys[k] = false; };
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off);
    b.addEventListener('pointerleave', off);
    b.addEventListener('pointercancel', off);
  });
}
function unwireInput() {
  window.removeEventListener('keydown', F.onKeyDown);
  window.removeEventListener('keyup', F.onKeyUp);
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

function readInput() {
  if (F.turning || F.stepping || F.fighting || F.transiting) return;
  if (performance.now() < F.settleUntil) return;
  if (F.keys.turnL) { tryTurn(-1); return; }
  if (F.keys.turnR) { tryTurn(1); return; }
  if (F.keys.fwd) { tryStep(1, 0); return; }
  if (F.keys.back) { tryStep(-1, 0); return; }
  if (F.keys.strafeL) { tryStep(1, -1); return; }
  if (F.keys.strafeR) { tryStep(1, 1); return; }
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
  F.seen.add(x + ',' + y);
  buildGeometry();
  drawMap();
  const ch = at(x, y);
  if (ch === '+') { const p = (F.map.portals || []).find((q) => Math.floor(q.x) === x && Math.floor(q.y) === y); if (p) { usePortal(p); return; } }
  if (EXIT[ch]) {
    if (F.stack.length) { usePortal({ ...F.stack.pop(), popped: true }); return; }
    endDelve('climbed back into the daylight');
  }
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
      continue;
    }
    const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy);
    if (d < 0.15) { c.mode = 'idle'; c.t = 1 + Math.random() * 2; continue; }
    const step = Math.min(d, speed * dt);
    const nx = c.x + dx / d * step, ny = c.y + dy / d * step;
    if (!blocked(Math.floor(nx), Math.floor(c.y))) c.x = nx;
    if (!blocked(Math.floor(c.x), Math.floor(ny))) c.y = ny;
  }
}

function checkEncounters() {
  for (const c of F.creatures) {
    if (Math.hypot(c.x - F.px, c.y - F.py) < REACH) { engage(c); return; }
  }
}

async function engage(c) {
  if (F.fighting || F.ended) return;
  F.fighting = true;
  F.keys = {};
  let bout = null;
  try { bout = await F.hooks.fight(c.prey.id); }
  catch (e) { console.error('delve-fp: bout failed', e); }
  if (!F || F.ended) return;
  showScreen('delveFpScreen');
  F.haul.bouts++;
  if (bout && bout.won) {
    F.creatures = F.creatures.filter((x) => x !== c);
    c.el.remove();
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
    F.grace = true;
    F.fighting = false;
    startLoop();
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
  const kinds = Object.keys(ORE_KINDS);
  const kind = kinds[(x * 7 + y * 13) % kinds.length];
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
  // Billboards stand on the floor and counter-rotate to face the walker.
  for (const c of F.creatures) {
    c.el.style.transform = `translate3d(${c.x * T}px,${-heightAt(Math.floor(c.x), Math.floor(c.y)) * STEP_PX}px,${c.y * T}px) rotateY(${-F.yaw}deg)`;
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
      if (!F.seen.has(x + ',' + y) && Math.hypot(dx, dy) > 3.5) continue;
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
  if (!F.fighting && !F.transiting) {
    readInput();
    advanceMotion(dt);
    moveCreatures(dt);
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

window.__delveFp = { leave, close };

// Dev probe — the headless pane runs no rAF, so the sim is stepped by hand.
if (typeof window !== 'undefined') {
  window.__fpDebug = () => F && ({
    map: F.map && F.map.id, x: +F.px.toFixed(2), y: +F.py.toFixed(2), dir: COMPASS[F.dir], yaw: F.yaw,
    moving: !!(F.stepping || F.turning), fighting: F.fighting,
    quads: F.world.querySelectorAll('.fp-q').length, creatures: F.creatures.length,
    haul: F.haul.gold, seen: F.seen.size,
  });
  window.__fpStep = (steps = 1, keys = '', ms = 16) => {
    if (!F || F.ended) return null;
    const map = { w: 'fwd', s: 'back', a: 'strafeL', d: 'strafeR', l: 'turnL', r: 'turnR' };
    for (const k of keys) if (map[k]) F.keys[map[k]] = true;
    for (let i = 0; i < steps; i++) {
      if (!F || F.ended) break;
      stepSim((F.last || performance.now()) + ms);
    }
    for (const k of keys) if (map[k]) F.keys[map[k]] = false;
    return window.__fpDebug();
  };
}
