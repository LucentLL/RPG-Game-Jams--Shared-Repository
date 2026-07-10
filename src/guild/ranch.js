/**
 * @file The Ranch — the guild's living CAMPUS (Monster-Rancher-DS × Ys-VI framing).
 *
 * No longer a one-screen diorama: the grounds are a 22×22-tile campus — a crafts
 * quarter, the Great Hall avenue, a worn TRAINING YARD, an arena, a pond, tree
 * lines, and a south gate — viewed through a PAN/ZOOM camera (drag to pan, wheel/
 * pinch/buttons to zoom; zoomed out is the overhead estate view, zoomed in is the
 * MR "stand next to them" view). Members are not wanderers any more: each performs
 * their weekly assignment ON the grounds — slashing the sandbag, parrying at the
 * pell, sprinting the poles, rucking the yard loop, meditating at the stone,
 * sparring at the arena, hammering at the forge door, mustering at the gate.
 *
 * It reuses the ACTION ARENA's animated-sprite machinery via `window.__ranchGfx`
 * (crucible.js): the same fighter renderer + anim FSM, driven by a duty loop
 * instead of combat. Ground is baked once by `bakeCampus` from the procedural tile
 * painters. Positions stay EPHEMERAL — seeded from person.id, never saved.
 *
 * Lives as a `.ranch-view` sibling of `.guild-hall-host` inside #guildScreen;
 * hall.js's render() only ever writes the host, so this subtree survives room
 * re-renders. The RAF loop self-stops when the screen hides.
 */
import { facilityTier } from './guild.js';
import { formatDate } from './calendar.js';
import { STATIONS, YARD_SLOTS, stationDef, stationCapacity, canBuild, addStation, removeStation } from './stations.js';

// --- the campus world ---------------------------------------------------------
/** Campus grid (tiles per side). The arena keeps its own 9 — this is the ESTATE. */
export const RANCH_GS = 22;
const POND = { x: 17.6, y: 16.8, r: 2.1 };          // SE pond (water is unwalkable)
const YARD = { x0: 4.0, y0: 12.1, x1: 10.0, y1: 17.3 }; // SW worn-ground training yard
const AVENUE_X = 11;                                  // the Great Hall's north–south road
const GATE = { x: 11, y: 19.8 };                      // quest parties muster here

// Buildings/zones placed on the campus (tile coords). Rooms → openRoom on tap.
const RANCH_PROPS = [
  { glyph: '🏰', name: 'Great Hall', room: 'roster', tx: 11.0, ty: 3.4, big: true },
  { glyph: '📖', name: 'Library', room: 'library', tx: 7.6, ty: 3.2 },
  { glyph: '🍲', name: 'Kitchen', room: 'kitchen', tx: 14.4, ty: 3.3 },
  { glyph: '🏠', name: 'Quarters', room: 'quarters', tx: 17.6, ty: 4.6, grow: 'quarters' },
  { glyph: '🔨', name: 'Forge', room: 'forge', tx: 4.4, ty: 5.0 },
  { glyph: '🗡', name: 'Armory', room: 'armory', tx: 2.8, ty: 7.3 },
  { glyph: '⚗', name: 'Laboratory', room: 'laboratory', tx: 5.9, ty: 8.4 },
  { glyph: '🏺', name: 'Apothecary', room: 'apothecary', tx: 8.7, ty: 7.9 },
  { glyph: '⚔', name: 'Arena', room: 'arena', tx: 13.8, ty: 12.8 },
  { glyph: '🎓', name: 'Academy', room: 'academy', tx: 17.8, ty: 9.6 },
];
const PROP_BY_ROOM = {};
RANCH_PROPS.forEach((p) => { PROP_BY_ROOM[p.room] = p; });

/** Ground type per tile — the campus layout the baker rasterizes. */
function groundTypeAt(c, r) {
  const x = c + 0.5, y = r + 0.5;
  const dPond = Math.hypot(x - POND.x, y - POND.y);
  if (dPond < POND.r) return 'water';
  if (x >= YARD.x0 && x <= YARD.x1 && y >= YARD.y0 && y <= YARD.y1) return 'path'; // the worn yard
  if (Math.abs(x - AVENUE_X) < 0.9 && y > 3.8 && y < 21) return 'path';            // the avenue to the gate
  if (Math.abs(y - 11.2) < 0.75 && x > 6.5 && x < 15.5) return 'path';             // spur: yard ↔ avenue ↔ arena
  if (Math.abs(y - 5.6) < 0.7 && x > 4.6 && x < 17.4 && Math.abs(x - AVENUE_X) > 0.9) return 'path'; // crafts ↔ hall ↔ quarters lane
  // deterministic sprinkles: flower meadows NW + pond-side, rocks near the fringes
  const h = ((c * 73856093) ^ (r * 19349663)) >>> 0;
  if (dPond < POND.r + 1.6 && (h % 7) === 0) return 'flowers';
  if (x < 8 && y < 10 && (h % 11) === 0) return 'flowers';
  if ((x < 2.2 || x > RANCH_GS - 2.2 || y > RANCH_GS - 2.2) && (h % 13) === 0) return 'rock';
  return 'grass';
}

// Deterministic environmental dressing: tree lines along the estate borders (with
// a gap at the south gate), groves by the pond, bushes and accents near buildings.
function jit(n, k) { const h = ((n * 2654435761) ^ (k * 40503)) >>> 0; return (h % 1000) / 1000 - 0.5; }
function buildDecor() {
  const d = [];
  let i = 0;
  for (let x = 1.0; x < RANCH_GS - 0.5; x += 1.9, i++) { // north + south tree lines
    d.push({ kind: 'tree', tx: x + jit(i, 1) * 0.8, ty: 0.9 + jit(i, 2) * 0.5, s: 1 + jit(i, 3) * 0.5 });
    if (Math.abs(x - GATE.x) > 2.4) d.push({ kind: 'tree', tx: x + jit(i, 4) * 0.8, ty: RANCH_GS - 0.7 + jit(i, 5) * 0.4, s: 1 + jit(i, 6) * 0.5 });
  }
  for (let y = 2.8; y < RANCH_GS - 1.4; y += 2.1, i++) { // east + west tree lines
    d.push({ kind: 'tree', tx: 0.8 + jit(i, 7) * 0.5, ty: y + jit(i, 8) * 0.8, s: 1 + jit(i, 9) * 0.5 });
    d.push({ kind: 'tree', tx: RANCH_GS - 0.8 + jit(i, 10) * 0.5, ty: y + jit(i, 11) * 0.8, s: 1 + jit(i, 12) * 0.5 });
  }
  // pond grove + scattered dressing
  d.push({ kind: 'tree', tx: 20.2, ty: 14.6, s: 1.25 }, { kind: 'tree', tx: 15.1, ty: 18.9, s: 1.1 },
    { kind: 'tree', tx: 19.9, ty: 18.8, s: 0.95 }, { kind: 'tree', tx: 14.6, ty: 6.9, s: 1.15 },
    { kind: 'bush', tx: 9.4, ty: 4.6, s: 1 }, { kind: 'bush', tx: 12.6, ty: 4.7, s: 1.05 },
    { kind: 'bush', tx: 16.2, ty: 6.2, s: 0.9 }, { kind: 'bush', tx: 3.4, ty: 9.4, s: 1 },
    { kind: 'bush', tx: 12.4, ty: 14.3, s: 0.95 }, { kind: 'bush', tx: 2.6, ty: 11.6, s: 1.1 },
    { kind: 'glyph', g: '🌼', tx: 3.4, ty: 3.9 }, { kind: 'glyph', g: '🌷', tx: 5.2, ty: 10.6 },
    { kind: 'glyph', g: '🌾', tx: 13.2, ty: 8.4 }, { kind: 'glyph', g: '🌾', tx: 15.8, ty: 15.2 },
    { kind: 'glyph', g: '🍄', tx: 1.6, ty: 13.4 }, { kind: 'glyph', g: '🪨', tx: 19.4, ty: 7.4 },
    { kind: 'glyph', g: '🪵', tx: 9.8, ty: 18.6 }, { kind: 'glyph', g: '🌼', tx: 12.8, ty: 17.4 });
  return d;
}
const RANCH_DECOR = buildDecor();

function decorHTML() {
  const GS = RANCH_GS;
  return RANCH_DECOR.map((d) => {
    const pos = `left:${d.tx / GS * 100}%;top:${d.ty / GS * 100}%;z-index:${2 + Math.round(d.ty * 10)}`;
    if (d.kind === 'tree') return `<span class="ranch-decor" style="${pos}"><span class="rm-shadow"></span><span class="rd-standee" style="--s:${d.s}"><span class="rd-canopy"></span><span class="rd-canopy two"></span><span class="rd-trunk"></span></span></span>`;
    if (d.kind === 'bush') return `<span class="ranch-decor" style="${pos}"><span class="rd-standee" style="--s:${d.s || 1}"><span class="rd-bush"></span></span></span>`;
    return `<span class="ranch-decor" style="${pos}"><span class="rd-standee"><span class="rd-glyph">${d.g}</span></span></span>`;
  }).join('');
}

// --- ephemeral module state -----------------------------------------------------
let actors = [];              // [{ id, actor, el, cv, ax, ay, facing, _duty, _mode, ... }]
let ranchLoopRunning = false; // re-entrancy guard (mirrors actionLoopRunning)
let groundURI = null;         // baked once per session
let _guild = null;            // last guild passed to renderRanch — duties + build actions read it
let _save = null;             // hall's save() hook, so placing/removing equipment persists
let buildMode = false;        // yard build/place mode (ephemeral UI state, never saved)
let pickType = null;          // station type currently armed for placement
// The camera: pan in field-local px (pre-zoom), zoom as a plain scale. Session-only.
const cam = { zoom: 0, panX: 0, panY: 0 }; // zoom 0 → "not initialized yet" (set on first render)
const ZOOM_MIN = 0.42, ZOOM_MAX = 2.4;

/** Deterministic spawn tile from the stable person id (no persistence needed). */
function seedTile(id) {
  let s = 0; const key = String(id);
  for (let i = 0; i < key.length; i++) s = (s * 131 + key.charCodeAt(i)) | 0;
  const u = (s >>> 0) / 4294967296, v = ((s >>> 8) & 255) / 255;
  return { ax: 2 + u * (RANCH_GS - 4), ay: 2 + v * (RANCH_GS - 4) };
}
/** Stable small hash for per-member variety (jitter, picks). */
function idHash(id) { let s = 0; const k = String(id); for (let i = 0; i < k.length; i++) s = (s * 131 + k.charCodeAt(i)) | 0; return s >>> 0; }

/** (Re)build the actor list for the current roster, keeping positions for members that persist. */
function seedActors(roster) {
  const gfx = window.__ranchGfx;
  const prev = new Map(actors.map((a) => [a.id, a]));
  actors = roster.map((h) => {
    const keep = prev.get(h.id);
    if (keep) { keep.el = null; keep.cv = null; return keep; } // same member — keep position/duty/anim; DOM rebinds below
    const t = seedTile(h.id);
    return { id: h.id, actor: gfx.makeActor(h), el: null, cv: null, ax: t.ax, ay: t.ay, facing: Math.PI,
      _dutyKey: null, _duty: null, _mode: 'go', _tx: t.ax, _ty: t.ay, _act: 0, _leg: 0, _pause: 0 };
  });
}

/** This week's task, as a glanceable bubble over the member's head (MR-style). */
function taskGlyph(h) {
  const a = h.assignment || {};
  if (h.condition && h.condition.injury) return '🩹';
  if (a.type === 'forge') return '🔨';
  if (a.type === 'brew') return '⚗';
  if (a.type === 'study') return '📖';
  if (a.type === 'quest') return '🗺';
  if (a.trainingId === 'spar') return '🤺';
  if (a.trainingId === 'rest' || !a.trainingId) return '💤';
  return '⚔';
}

// --- duties: what a member DOES on the grounds this week --------------------------
// Drill theater: the anim each stationary drill performs, on a lazy cadence (non-loop
// anims auto-revert to idle in the shared stepper, so each act is one visible rep).
const DRILL_ACT = {
  pow: { anims: ['slash'], gap: [700, 1400] },          // pounding the sandbag
  def: { anims: ['parry'], gap: [800, 1600] },          // shieldwork at the pell
  skl: { anims: ['slash', 'parry'], gap: [600, 1200] }, // forms at the dummy
  int: { anims: ['cast'], gap: [2200, 3800] },          // meditation at the stone
};

/** The placed stations matching a drill (spd/vit train around them differently). */
function stationsFor(drill) {
  return (_guild && _guild.stations || []).filter((s) => { const d = stationDef(s.type); return d && d.drill === drill; });
}

/**
 * Where (and how) this member spends the week on the grounds. Returns a duty
 * object; a change in its key re-targets the actor. Spots avoid the pond.
 */
function dutyFor(h) {
  const a = h.assignment || {};
  const hh = idHash(h.id);
  if (h.condition && h.condition.injury) {
    return { kind: 'rest', key: 'hurt', tx: PROP_BY_ROOM.quarters.tx - 1.1 + (hh % 5) * 0.4, ty: PROP_BY_ROOM.quarters.ty + 1.3 };
  }
  if (a.type === 'train') {
    const drill = a.trainingId;
    if (!drill || drill === 'rest') {
      const byPond = hh % 2 === 0;
      return { kind: 'rest', key: 'rest' + (byPond ? 'p' : 'q'),
        tx: byPond ? POND.x - POND.r - 1.0 : PROP_BY_ROOM.quarters.tx - 1.2 + (hh % 4) * 0.5,
        ty: byPond ? POND.y - 0.4 + (hh % 3) * 0.5 : PROP_BY_ROOM.quarters.ty + 1.4 };
    }
    if (drill === 'spar') return { kind: 'spar', key: 'spar:' + (a.sparWith || ''), partner: a.sparWith };
    if (drill === 'vit') return { kind: 'ruck', key: 'ruck' }; // the yard loop — always on the move
    const st = stationsFor(drill);
    const slot = st.length ? YARD_SLOTS[st[hh % st.length].slot] : null;
    if (drill === 'spd') {
      const cy = slot ? slot.ty + 0.8 : YARD.y1 - 1.0;
      const cx = slot ? slot.tx : (YARD.x0 + YARD.x1) / 2;
      return { kind: 'agility', key: 'spd:' + (slot ? 's' : 'open') + cx.toFixed(1), x1: cx - 1.1, x2: cx + 1.1, ty: cy };
    }
    if (slot) {
      return { kind: 'drill', key: 'drill:' + drill + ':' + slot.tx, drill,
        tx: slot.tx + (hh % 2 ? 0.55 : -0.55), ty: slot.ty + 0.65, faceTx: slot.tx, faceTy: slot.ty - 0.2 };
    }
    // no equipment placed — shadow-drill in the open yard (the gear ad the player can see)
    return { kind: 'drill', key: 'drill:' + drill + ':open', drill,
      tx: YARD.x0 + 1 + (hh % 5) * 0.9, ty: YARD.y0 + 1 + ((hh >> 3) % 4) * 1.0, faceTy: YARD.y0, faceTx: null };
  }
  if (a.type === 'forge') return workDuty('forge', hh, { anims: ['slash'], gap: [900, 1700] }); // hammer swings at the anvil
  if (a.type === 'brew') return workDuty('laboratory', hh, { anims: ['cast'], gap: [1800, 3200] }); // stirring something volatile
  if (a.type === 'study') return workDuty('library', hh, null);
  if (a.type === 'quest') return { kind: 'muster', key: 'muster', tx: GATE.x - 0.9 + (hh % 4) * 0.6, ty: GATE.y - 0.4 + ((hh >> 2) % 2) * 0.6 };
  return { kind: 'stroll', key: 'stroll' };
}
function workDuty(room, hh, act) {
  const p = PROP_BY_ROOM[room];
  return { kind: 'work', key: 'work:' + room, act,
    tx: p.tx - 0.6 + (hh % 3) * 0.6, ty: p.ty + 0.85, sideFace: hh % 2 ? Math.PI / 2 : -Math.PI / 2 };
}

/** Keep a point out of the pond (project radially to the bank). */
function avoidPond(x, y) {
  const dx = x - POND.x, dy = y - POND.y, d = Math.hypot(dx, dy), min = POND.r + 0.55;
  if (d >= min || d === 0) return { x, y };
  return { x: POND.x + dx / d * min, y: POND.y + dy / d * min };
}
const clampT = (v) => Math.max(0.7, Math.min(RANCH_GS - 0.7, v));

/** Walk an actor toward (tx,ty); returns true when arrived. Speed in tiles/sec. */
function walkToward(a, gfx, tx, ty, sp, dt) {
  const dx = tx - a.ax, dy = ty - a.ay, d = Math.hypot(dx, dy);
  if (d <= 0.15) return true;
  const ux = dx / d, uy = dy / d;
  const nx = avoidPond(clampT(a.ax + ux * sp * dt), clampT(a.ay + uy * sp * dt));
  a.ax = nx.x; a.ay = nx.y;
  a.facing = Math.atan2(ux, -uy); // same convention as facingToRow
  if (a.actor.anim.name !== 'move') gfx.setAnim(a.actor, 'move');
  return false;
}
/** Face a world point without moving. */
function faceToward(a, tx, ty) {
  const dx = tx - a.ax, dy = ty - a.ay;
  if (Math.abs(dx) + Math.abs(dy) > 0.01) a.facing = Math.atan2(dx / (Math.hypot(dx, dy) || 1), -dy / (Math.hypot(dx, dy) || 1));
}
const between = (lo, hi) => lo + Math.random() * (hi - lo);

function ranchTick(dt, now) {
  const gfx = window.__ranchGfx;
  const roster = (_guild && _guild.roster) || [];
  const heroMap = new Map(roster.map((h) => [h.id, h]));
  const actorMap = new Map(actors.map((a) => [a.id, a]));
  for (const a of actors) {
    const h = heroMap.get(a.id);
    if (!h) continue;
    const duty = dutyFor(h);
    if (duty.key !== a._dutyKey) { // assignment changed (or first tick) — re-target
      a._dutyKey = duty.key; a._duty = duty; a._mode = 'go'; a._leg = 0; a._act = now + between(400, 1200);
      a._tx = clampT(duty.tx ?? a.ax); a._ty = clampT(duty.ty ?? a.ay);
      if (duty.kind === 'stroll' || duty.kind === 'ruck') a._mode = 'perform';
    }
    const d = a._duty;

    if (a._mode === 'go') {
      if (walkToward(a, gfx, a._tx, a._ty, 2.3, dt)) { gfx.setAnim(a.actor, 'idle'); a._mode = 'perform'; a._act = now + between(300, 900); }
      a.actor.facing = a.facing; gfx.tickActor(a.actor, now);
      continue;
    }

    switch (d.kind) {
      case 'drill': { // reps at the station (or shadow-drilling the open yard)
        if (d.faceTx != null) faceToward(a, d.faceTx, d.faceTy);
        else if (d.faceTy != null) a.facing = Math.PI / 2; // profile to the camera — the swing reads
        if (now >= a._act) {
          const act = DRILL_ACT[d.drill] || DRILL_ACT.pow;
          gfx.setAnim(a.actor, act.anims[(Math.random() * act.anims.length) | 0]);
          a._act = now + between(act.gap[0], act.gap[1]);
        }
        break;
      }
      case 'agility': { // sprint the poles: dash side to side, spring at each turn
        const target = a._leg === 0 ? d.x1 : d.x2;
        if (a._pause > now) { /* landing beat */ }
        else if (walkToward(a, gfx, target, d.ty, 4.4, dt)) {
          gfx.setAnim(a.actor, 'jump');
          a._leg = a._leg ? 0 : 1; a._pause = now + 340;
        }
        break;
      }
      case 'ruck': { // the yard loop, endlessly (rucksack miles make VIT)
        const loop = [
          { x: YARD.x0 + 0.5, y: YARD.y0 + 0.4 }, { x: YARD.x1 - 0.5, y: YARD.y0 + 0.4 },
          { x: YARD.x1 - 0.5, y: YARD.y1 - 0.3 }, { x: YARD.x0 + 0.5, y: YARD.y1 - 0.3 },
        ];
        const wp = loop[a._leg % 4];
        if (walkToward(a, gfx, wp.x, wp.y, 1.7, dt)) a._leg++;
        break;
      }
      case 'spar': { // square off at the arena with your partner
        const p = actorMap.get(d.partner);
        const base = PROP_BY_ROOM.arena;
        const left = !p || String(a.id) < String(d.partner);
        const tx = base.tx + (left ? -0.55 : 0.55), ty = base.ty + 1.05;
        if (walkToward(a, gfx, tx, ty, 2.3, dt)) {
          if (p) faceToward(a, p.ax, p.ay); else a.facing = Math.PI;
          if (now >= a._act) {
            gfx.setAnim(a.actor, Math.random() < 0.55 ? 'slash' : 'parry');
            a._act = now + between(700, 1400);
          }
        }
        break;
      }
      case 'work': { // at their workshop door, side-on so the craft reads
        a.facing = d.sideFace;
        if (d.act && now >= a._act) {
          gfx.setAnim(a.actor, d.act.anims[(Math.random() * d.act.anims.length) | 0]);
          a._act = now + between(d.act.gap[0], d.act.gap[1]);
        }
        break;
      }
      case 'muster': { // at the gate, restless before the march
        if (now >= a._act) {
          a._tx = clampT(GATE.x - 1.2 + Math.random() * 2.4); a._ty = clampT(GATE.y - 0.8 + Math.random() * 1.2);
          a._mode = 'go'; a._act = now + between(2500, 5000);
        } else a.facing = Math.PI; // watching the south road
        break;
      }
      case 'rest': { // long idles, tiny strolls near their rest spot
        if (now >= a._act) {
          a._tx = clampT(d.tx + (Math.random() - 0.5) * 1.6); a._ty = clampT(d.ty + (Math.random() - 0.5) * 1.2);
          a._mode = 'go'; a._act = now + between(4000, 8000);
        }
        break;
      }
      default: { // stroll — the old free wander, across the whole campus
        if (now >= a._act) {
          const t = avoidPond(1.2 + Math.random() * (RANCH_GS - 2.4), 1.2 + Math.random() * (RANCH_GS - 2.4));
          a._tx = t.x; a._ty = t.y; a._mode = 'go'; a._act = now + between(1800, 4500);
        }
      }
    }
    a.actor.facing = a.facing;
    gfx.tickActor(a.actor, now);
  }
}

// --- camera ----------------------------------------------------------------------
function fieldEl() {
  const scr = document.getElementById('guildScreen');
  return scr ? scr.querySelector('.ranch-view .ranch-field') : null;
}
function applyCamera() {
  const f = fieldEl();
  if (!f) return;
  const lim = f.offsetWidth * 0.55;
  cam.panX = Math.max(-lim, Math.min(lim, cam.panX));
  cam.panY = Math.max(-lim, Math.min(lim, cam.panY));
  f.style.transform = `rotateX(52deg) translateZ(-150px) scale(${cam.zoom}) translate(${cam.panX}px, ${cam.panY}px)`;
}
function setZoom(z) { cam.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z)); applyCamera(); }
/** Fit the whole estate on screen (the overhead survey view). */
export function ranchZoomFit() { cam.zoom = ZOOM_MIN + 0.03; cam.panX = 0; cam.panY = 0; applyCamera(); }
export function ranchZoomIn() { setZoom(cam.zoom * 1.25); }
export function ranchZoomOut() { setZoom(cam.zoom / 1.25); }

/** Drag-to-pan + wheel/pinch zoom on the stage. Re-wired on every renderRanch (the
 *  innerHTML rebuild drops old listeners with their nodes). Taps still reach the
 *  standee buttons — a real drag suppresses the click that follows it. */
function wireCamera(view) {
  const stage = view.querySelector('.ranch-stage');
  if (!stage) return;
  const pointers = new Map();
  let dragging = false, lastPinch = 0;
  stage.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragging = false;
  });
  stage.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    if (pointers.size === 2) { // pinch zoom
      const pts = [...pointers.values()];
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [q1, q2] = [...pointers.values()];
      const dNow = Math.hypot(q1.x - q2.x, q1.y - q2.y);
      if (lastPinch) setZoom(cam.zoom * (dNow / lastPinch));
      lastPinch = dNow;
      dragging = true;
      return;
    }
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (!dragging && Math.hypot(dx, dy) < 6) return; // a tap, not a drag (yet)
    dragging = true;
    stage.classList.add('dragging');
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // translate composes before scale/rotation, so pan in field-local px; the
    // rotateX foreshortens screen-Y by ~cos(52°) — divide it back out for 1:1 feel.
    cam.panX += dx / cam.zoom;
    cam.panY += dy / (cam.zoom * 0.62);
    applyCamera();
  });
  const end = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) lastPinch = 0;
    if (dragging && pointers.size === 0) {
      stage.classList.remove('dragging');
      // eat the click this drag would otherwise fire on a building/member
      view.addEventListener('click', (ce) => { ce.stopPropagation(); ce.preventDefault(); }, { capture: true, once: true });
      dragging = false;
    }
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
  stage.addEventListener('pointerleave', end);
  stage.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(cam.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)); }, { passive: false });
}

// --- render ------------------------------------------------------------------
/** Build (or refresh) the ranch DOM and (re)start the duty loop. Call on entry / on roster change. */
export function renderRanch(guild, save) {
  _guild = guild; if (save) _save = save;
  const screen = document.getElementById('guildScreen');
  if (!screen) return;
  let view = screen.querySelector('.ranch-view');
  if (!view) { view = document.createElement('div'); view.className = 'ranch-view'; screen.appendChild(view); }
  const gfx = window.__ranchGfx;
  if (!gfx) { view.innerHTML = '<div class="ranch-fallback">Loading the grounds…</div>'; return; }
  if (!groundURI) groundURI = gfx.bakeCampus ? gfx.bakeCampus(RANCH_GS, RANCH_GS, groundTypeAt) : gfx.bakeGrass();
  const GS = RANCH_GS;
  const roster = guild.roster || [];

  // Buildings + members are PAPER STANDEES on the tilted plane: a flat wrapper sits
  // ON the ground (owns the shadow), an inner .standee counter-rotates upright.
  const propsHTML = RANCH_PROPS.map((p) => {
    const tier = p.grow ? facilityTier(guild, p.grow) : 0;
    return `<button class="ranch-prop ${p.big ? 'big' : ''}" style="left:${p.tx / GS * 100}%;top:${p.ty / GS * 100}%;z-index:${2 + Math.round(p.ty * 10)}" title="Enter the ${p.name}" onclick="__guild.enterRoomFromRanch('${p.room}')">
        <span class="rm-shadow"></span>
        <span class="rp-standee" style="${tier ? `--grow:${1 + tier * 0.14}` : ''}">
          <span class="rp-roof"></span>
          <span class="rp-wall"><span class="rp-glyph">${p.glyph}</span></span>
          <span class="rp-name">${p.name}${tier ? ' ·' + (tier + 1) : ''}</span>
        </span></button>`;
  }).join('');
  const membersHTML = roster.map((h) =>
    `<button class="ranch-actor" data-rid="${h.id}" title="${h.name} — ${taskGlyph(h)} this week · manage" onclick="__guild.manageMemberFromRanch('${h.id}')">
        <span class="rm-shadow"></span>
        <span class="ra-standee">
          <span class="rm-task">${taskGlyph(h)}</span>
          <canvas class="ranch-member" width="96" height="96"></canvas>
          <span class="rm-name">${(h.name || '').split(' ')[0]}</span>
        </span></button>`).join('');

  // Training stations — placed equipment standing on the yard slots. In build mode
  // each grows a ✕ to remove it (50% refund, handled in removeStationById).
  const stationsHTML = (guild.stations || []).map((st) => {
    const def = stationDef(st.type); const slot = YARD_SLOTS[st.slot];
    if (!def || !slot) return '';
    const z = 2 + Math.round(slot.ty * 10);
    return `<div class="ranch-station" style="left:${slot.tx / GS * 100}%;top:${slot.ty / GS * 100}%;z-index:${z}" title="${def.name} — +${Math.round(def.boost * 100)}% ${def.stat} training">
        <span class="rm-shadow"></span>
        <span class="rs-standee"><span class="rs-glyph">${def.glyph}</span><span class="rs-post"></span></span>
        ${buildMode ? `<button class="rs-remove" title="Remove (${Math.floor(def.cost * 0.5)}g back)" onclick="__guild.ranchRemoveStation('${st.id}')">✕</button>` : ''}
      </div>`;
  }).join('');

  // Build mode: ghost markers on every FREE slot within capacity (tap to place the
  // armed station), plus the build panel (capacity + station palette).
  let ghostsHTML = '', buildPanelHTML = '';
  if (buildMode) {
    const cap = stationCapacity(guild);
    const taken = new Set((guild.stations || []).map((s) => s.slot));
    const armed = pickType && canBuild(guild) && guild.gold >= (stationDef(pickType)?.cost || 0);
    ghostsHTML = YARD_SLOTS.slice(0, cap).map((slot, i) => taken.has(i) ? '' :
      `<button class="ranch-ghost ${armed ? 'ready' : ''}" style="left:${slot.tx / GS * 100}%;top:${slot.ty / GS * 100}%;z-index:${2 + Math.round(slot.ty * 10)}" title="${pickType ? 'Place here' : 'Pick a station first'}" onclick="__guild.ranchPlace(${i})"><span class="rg-mark">＋</span></button>`).join('');
    const count = (guild.stations || []).length, full = count >= cap;
    const items = STATIONS.map((s) => {
      const dis = full || guild.gold < s.cost;
      return `<button class="rbld-item ${pickType === s.type ? 'sel' : ''} ${dis ? 'dis' : ''}" onclick="__guild.ranchPick('${s.type}')">
          <span class="rbld-g">${s.glyph}</span>
          <span class="rbld-t"><b>${s.name}</b><small>+${Math.round(s.boost * 100)}% ${s.stat} · ☉${s.cost}g</small></span></button>`;
    }).join('');
    buildPanelHTML = `<div class="ranch-build">
        <div class="rbld-head"><span>🏗 Training yard</span><span class="rbld-cap ${full ? 'full' : ''}">${count} / ${cap}</span></div>
        <div class="rbld-hint">${full ? 'Yard full — upgrade the Training Yard in Grounds for more slots.' : (pickType ? 'Tap a ＋ spot in the training yard (south-west grounds) to place it.' : 'Pick a station, then tap a spot in the yard.')}</div>
        <div class="rbld-list">${items}</div>
      </div>`;
  }

  view.innerHTML = `
    <div class="ranch-hud">
      <span class="ranch-title">☙ ${guild.name}</span>
      <span class="ranch-meta">☉ <b>${guild.gold}</b>g · ✦ <b>${guild.reputation}</b> · ${formatDate(guild.calendar)}</span>
      <span class="ranch-hud-btns">
        <button class="ranch-btn ${buildMode ? 'on' : ''}" onclick="__guild.ranchBuild()">🏗 ${buildMode ? 'Done' : 'Build'}</button>
        <button class="ranch-btn adv" onclick="__guild.advanceAll()">▶ Advance Week</button>
      </span>
    </div>
    <div class="ranch-stage">
      <div class="ranch-field" style="--rgs:${GS};background-image:url(${groundURI})">${decorHTML()}${propsHTML}${stationsHTML}${ghostsHTML}${membersHTML}</div>
    </div>
    ${buildPanelHTML}
    <div class="ranch-zoom">
      <button class="rz-btn" title="Zoom in" onclick="__guild.ranchZoomIn()">＋</button>
      <button class="rz-btn" title="Zoom out" onclick="__guild.ranchZoomOut()">−</button>
      <button class="rz-btn" title="See the whole estate" onclick="__guild.ranchZoomFit()">⤢</button>
    </div>
    <div class="ranch-menu">
      <button class="rmn-btn" onclick="__guild.enterRoomFromRanch('roster')"><span class="rmn-g">🛡</span>Roster</button>
      <button class="rmn-btn" onclick="__guild.enterRoomFromRanch('calendar')"><span class="rmn-g">📅</span>Calendar</button>
      <button class="rmn-btn" onclick="__guild.enterRoomFromRanch('arena')"><span class="rmn-g">⚔</span>Arena</button>
      <button class="rmn-btn" onclick="__guild.enterRoomFromRanch('grounds')"><span class="rmn-g">🏗</span>Grounds</button>
      <button class="rmn-btn" onclick="__guild.enterRoomFromRanch('hub')"><span class="rmn-g">☰</span>All rooms</button>
    </div>`;

  seedActors(roster);
  // Cache each member's freshly-built wrapper + canvas so the render loop needn't re-query per frame.
  const field = view.querySelector('.ranch-field');
  actors.forEach((a) => {
    a.el = field.querySelector(`.ranch-actor[data-rid="${a.id}"]`);
    a.cv = a.el ? a.el.querySelector('canvas.ranch-member') : null;
  });
  if (!cam.zoom) { // first open this session: a mid-height view over the hall & yard
    cam.zoom = 0.8; cam.panX = 0; cam.panY = field.offsetWidth * 0.06;
  }
  wireCamera(view);
  applyCamera();
  ranchRender();      // draw the first frame now (so sprites show before the RAF loop ticks)
  startRanchLoop();
}

function ranchRender() {
  const gfx = window.__ranchGfx; const GS = RANCH_GS;
  const scr = document.getElementById('guildScreen');
  const stage = scr && scr.querySelector('.ranch-view .ranch-stage');
  const f = fieldEl();
  const fieldPx = f ? f.offsetWidth : 0;
  const halfW = stage ? stage.clientWidth * 0.78 : 1e9;
  const halfH = stage ? stage.clientHeight * 1.0 : 1e9;
  for (const a of actors) {
    if (!a.el || !a.el.isConnected || !a.cv) continue;
    a.el.style.left = (a.ax / GS * 100) + '%';
    a.el.style.top = (a.ay / GS * 100) + '%';
    a.el.style.zIndex = String(2 + Math.round(a.ay * 10)); // painter sort backstop (3D depth handles overlaps)
    // Rough viewport cull: skip the per-frame recomposite for actors far offscreen
    // (position math only — the anim FSM still ticks, so they're mid-rep when panned to).
    if (fieldPx) {
      const sx = ((a.ax / GS - 0.5) * fieldPx + cam.panX) * cam.zoom;
      const sy = ((a.ay / GS - 0.5) * fieldPx + cam.panY) * cam.zoom * 0.62;
      if (Math.abs(sx) > halfW || Math.abs(sy) > halfH) continue;
    }
    gfx.renderActor(a.cv, a.actor);
  }
}

function startRanchLoop() {
  if (ranchLoopRunning) return;
  ranchLoopRunning = true;
  let last = performance.now();
  function loop(now) {
    if (!ranchLoopRunning) return;
    const scr = document.getElementById('guildScreen');
    const view = scr && scr.querySelector('.ranch-view');
    // Self-stop when the guild screen isn't showing OR the ranch is hidden (drilled
    // into a room / in a battle) — mirrors the arena loop's active-guard, saves battery.
    if (!scr || !scr.classList.contains('active') || !view || view.hidden) { stopRanchLoop(); return; }
    const dt = Math.min(0.08, (now - last) / 1000); last = now;
    // A duty bug must never freeze the campus: log it, keep the loop alive.
    try { ranchTick(dt, now); ranchRender(); }
    catch (e) { console.error('ranch tick error', e); window.__ranchErr = String((e && e.stack) || e); }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

export function stopRanchLoop() { ranchLoopRunning = false; }

// Dev probes: inspect the duty loop, and step it by hand (headless windows never
// fire rAF, so automated checks drive the simulation clock manually).
if (typeof window !== 'undefined') {
  window.__ranchDebug = () => ({
    running: ranchLoopRunning,
    guildRoster: _guild ? (_guild.roster || []).map((h) => h.id) : null,
    actors: actors.map((a) => ({ id: a.id, mode: a._mode, key: a._dutyKey, tx: a._tx, ty: a._ty, ax: +a.ax.toFixed(2), ay: +a.ay.toFixed(2), anim: a.actor.anim.name, el: !!(a.el && a.el.isConnected) })),
  });
  window.__ranchStep = (dt, now) => { ranchTick(dt ?? 0.016, now ?? performance.now()); ranchRender(); };
}

// --- yard build mode (Guild Academy Pillar A) -------------------------------
/** Toggle the equipment build/place mode on the ranch. */
export function toggleBuild() {
  buildMode = !buildMode;
  if (!buildMode) pickType = null;
  if (buildMode && _guild) { // jump the camera to the training yard so the slots are on screen
    const f = fieldEl();
    if (f) {
      const fieldPx = f.offsetWidth;
      cam.zoom = Math.max(cam.zoom, 0.9);
      cam.panX = -((YARD.x0 + YARD.x1) / 2 / RANCH_GS - 0.5) * fieldPx;
      cam.panY = -((YARD.y0 + YARD.y1) / 2 / RANCH_GS - 0.5) * fieldPx;
    }
  }
  if (_guild) renderRanch(_guild);
}
/** Arm (or un-arm) a station type for placement. */
export function pickStation(type) { pickType = (pickType === type ? null : type); if (_guild) renderRanch(_guild); }
/** Place the armed station on yard slot `slotIdx` — charges its gold cost and persists. */
export function placeStationAt(slotIdx) {
  if (!_guild || !pickType) return;
  const def = stationDef(pickType);
  if (!def || _guild.gold < def.cost) return;
  const st = addStation(_guild, pickType, slotIdx);
  if (st) { _guild.gold -= def.cost; if (_save) _save(); }
  renderRanch(_guild);
}
/** Remove a station, refunding half its cost. */
export function removeStationById(id) {
  if (!_guild) return;
  const st = (_guild.stations || []).find((s) => s.id === id);
  if (st) { const def = stationDef(st.type); if (def) _guild.gold += Math.floor(def.cost * 0.5); }
  removeStation(_guild, id);
  if (_save) _save();
  renderRanch(_guild);
}
