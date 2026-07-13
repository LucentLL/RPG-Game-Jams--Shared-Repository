/**
 * @file Room dioramas — an illustrated, LIVING interior per guild room.
 *
 * Where the ranch shows the whole campus, each work room now opens on its OWN
 * interior: a floor and back wall, real furniture and props from the shared art
 * library (counters, an oven, a rack of ingredients, a floppy fish on the block),
 * and the member(s) assigned there standing IN the room, ANIMATED — idling and
 * periodically breaking into a work gesture (the cook chops, the smith hammers,
 * the scholar turns a page).
 *
 * It reuses the arena/ranch sprite machinery via `window.__ranchGfx`
 * (compositeCharacter under the hood) and runs ONE small RAF loop, active only
 * while a diorama is on screen. Room workers are drawn HANDS-FREE (a trade is
 * hands-on, not swordplay) so a Mage rostered to the Kitchen doesn't chop with a
 * staff.
 *
 * hall.js rebuilds `.guild-hall-host` innerHTML on every interaction, so the
 * diorama's canvases are recreated each render; like the ranch, the animation
 * state lives in MODULE state (`roomActors`) and `bindRoomScene()` rebinds the
 * fresh canvases after each render. The loop self-stops when the diorama leaves
 * the DOM (room switched / left the guild).
 */
import { artSprite } from './art.js';

// ─── the interiors: props + worker stations per room ─────────────────────────
// Coordinates are PERCENT of the diorama box. Props/workers are bottom-anchored
// at (x, bottom); `w`/`h` size the art (aspect-ratio holds it true). `z` orders
// depth (higher = nearer the viewer, drawn on top); when omitted it derives from
// bottom (lower on the floor = nearer). A worker `station` places a member; they
// face `f` (s=toward viewer) and periodically play `gesture`.
const S = 1; // layout scale hook (kept 1; tweak to zoom the whole set)

const ROOM_SET = {
  kitchen: {
    theme: 'kitchen', gesture: 'cast',
    props: [
      { art: 'counterLong', x: 40, bottom: 40, w: 42, z: 6 },      // back counter run
      { art: 'oven',        x: 84, bottom: 38, w: 10, z: 7 },      // the stone oven, fire lit
      { art: 'sacks',       x: 12, bottom: 40, w: 7,  z: 8 },      // stacked flour sacks
      { art: 'breadPile',   x: 32, bottom: 52, w: 9,  z: 20 },     // loaves on the counter
      { art: 'floppyfish',  x: 45, bottom: 53, w: 6,  z: 21 },     // the floppy fish on the block
      { art: 'tools',       x: 56, bottom: 53, w: 8,  z: 20 },     // a rolling pin
    ],
    stations: [
      { x: 42, bottom: 16, f: 's', gesture: 'cast' },
      { x: 62, bottom: 18, f: 's', gesture: 'slash' },
    ],
  },
  forge: {
    theme: 'forge', gesture: 'slash',
    props: [
      { art: 'counterLong', x: 24, bottom: 42, w: 30, z: 6 },
      { art: 'anvil',   x: 52, bottom: 14, w: 15, z: 40 },
      { art: 'sacks',   x: 82, bottom: 42, w: 9, z: 8 },
    ],
    stations: [ { x: 52, bottom: 26, f: 's', gesture: 'slash' } ],
  },
  library: {
    theme: 'library', gesture: 'cast', rest: true,
    props: [
      { art: 'bookshelf', x: 20, bottom: 38, w: 17, z: 5 },
      { art: 'bookshelf', x: 46, bottom: 38, w: 17, z: 5 },
      { art: 'bookshelf', x: 72, bottom: 38, w: 17, z: 5 },
    ],
    stations: [ { x: 50, bottom: 18, f: 's', gesture: 'cast' } ],
  },
  laboratory: {
    theme: 'laboratory', gesture: 'cast',
    props: [
      { art: 'counterLong', x: 46, bottom: 40, w: 44, z: 6 },
      { art: 'tools',   x: 30, bottom: 51, w: 7, z: 20 },
      { art: 'sacks',   x: 72, bottom: 42, w: 9, z: 8 },
    ],
    stations: [ { x: 50, bottom: 22, f: 's', gesture: 'cast' } ],
  },
  apothecary: {
    theme: 'apothecary', gesture: 'cast', rest: true,
    props: [
      { art: 'bookshelf', x: 22, bottom: 38, w: 16, z: 5 },
      { art: 'counterLong', x: 62, bottom: 40, w: 36, z: 6 },
    ],
    stations: [ { x: 50, bottom: 20, f: 's', gesture: 'idle' } ],
  },
  armory: {
    theme: 'armory', gesture: 'idle', rest: true,
    props: [
      { art: 'anvil', x: 80, bottom: 16, w: 13, z: 40 },
      { art: 'bookshelf', x: 22, bottom: 38, w: 16, z: 5 },
    ],
    stations: [ { x: 46, bottom: 20, f: 's', gesture: 'idle' } ],
  },
  quarters: {
    theme: 'quarters', gesture: 'idle', rest: true,
    props: [
      { art: 'bed', x: 22, bottom: 26, w: 17, z: 12 },
      { art: 'bed', x: 74, bottom: 26, w: 17, z: 12 },
    ],
    stations: [ { x: 50, bottom: 20, f: 's', gesture: 'idle' } ],
  },
};

/** Does this room have a living-interior diorama? */
export function hasDiorama(roomId) { return !!ROOM_SET[roomId]; }

// ─── module state (survives hall.js render() via rebind) ─────────────────────
let roomActors = [];        // [{ id, actor, cv, station, gesture, nextAct }]
let roomLoopRunning = false;
let curRoom = null;

const between = (lo, hi) => lo + Math.random() * (hi - lo);
const FACE = { s: Math.PI, n: 0, w: Math.PI / 2, e: -Math.PI / 2 };

/**
 * The diorama HTML for a room: wall + floor, the arranged props, and one
 * animated canvas per assigned worker at their station. Falls back to '' when
 * the room has no set (caller keeps the old banner).
 * @param {string} roomId @param {{id:string,name:string}[]} workers
 * @param {{glyph:string,name:string}} room @param {string} flavor
 */
export function roomSceneHTML(roomId, workers, room, flavor) {
  const set = ROOM_SET[roomId];
  if (!set) return '';
  const propsHTML = set.props.map((p) => {
    const z = p.z != null ? p.z : Math.round(100 - p.bottom);
    return `<span class="rdi-prop" style="left:${p.x}%;bottom:${p.bottom}%;width:${p.w * S}%;z-index:${z}">${artSprite(p.art, 'rdi-art')}</span>`;
  }).join('');
  // Seat the assigned workers into the room's stations (extra workers cluster at
  // the last station with a small x jitter so a crowded room doesn't overlap dead-on).
  const seats = workers.slice(0, 6).map((h, i) => {
    const st = set.stations[Math.min(i, set.stations.length - 1)];
    const jitter = i >= set.stations.length ? (i - set.stations.length + 1) * 8 - 4 : 0;
    const x = Math.max(6, Math.min(94, st.x + jitter));
    const z = Math.round(100 - st.bottom) + 30; // workers sit above the front prop line
    return `<div class="rdi-actor" data-hid="${h.id}" style="left:${x}%;bottom:${st.bottom}%;z-index:${z}" title="${h.name}">
        <canvas class="rdi-cv" width="96" height="96"></canvas>
        <span class="rdi-name">${(h.name || '').split(' ')[0]}</span>
      </div>`;
  }).join('');
  const empty = workers.length ? '' : `<div class="rdi-empty">— no one works here this week —</div>`;
  return `<div class="room-diorama scene-${roomId}" data-room="${roomId}">
      <div class="rdi-wall"></div>
      <div class="rdi-floor"></div>
      <div class="rdi-caption"><span class="rdi-title">${room.glyph} ${room.name}</span><span class="rdi-flavor">${flavor || ''}</span></div>
      <div class="rdi-stage">${propsHTML}${seats}${empty}</div>
    </div>`;
}

/**
 * Rebind the freshly-rendered canvases to module actors and (re)start the loop.
 * Called after every hall render while a diorama room is shown. `makeActor` and
 * `renderActor` come from the shared arena/ranch gfx facade.
 * @param {string} roomId @param {{id:string,name:string,archetype:string,stats:Object}[]} workers
 */
export function bindRoomScene(roomId, workers) {
  const gfx = window.__ranchGfx;
  const host = document.querySelector('#guildScreen .room-diorama[data-room="' + roomId + '"]');
  if (!gfx || !host) { stopRoomLoop(); return; }
  const set = ROOM_SET[roomId];
  curRoom = roomId;
  const now = performance.now();
  const prev = new Map(roomActors.map((a) => [a.id, a]));
  roomActors = workers.slice(0, 6).map((h, i) => {
    const st = set.stations[Math.min(i, set.stations.length - 1)];
    const gesture = st.gesture || set.gesture || 'idle';
    const keep = prev.get(h.id);
    const el = host.querySelector('.rdi-actor[data-hid="' + h.id + '"]');
    const cv = el ? el.querySelector('canvas.rdi-cv') : null;
    if (keep) { keep.cv = cv; keep.station = st; keep.gesture = gesture; return keep; }
    const actor = gfx.makeActor(h);
    actor.gear = { RHand: null, LHand: null }; // a trade is hands-on — no weapon at the bench
    actor.sheatheWhenIdle = false;
    actor.facing = FACE[st.f] != null ? FACE[st.f] : Math.PI;
    gfx.setAnim(actor, 'idle');
    return { id: h.id, actor, cv, station: st, gesture, nextAct: now + between(600, 2600) };
  });
  drawRoomActors();
  startRoomLoop();
}

function roomTick(now) {
  const gfx = window.__ranchGfx;
  for (const a of roomActors) {
    const anim = a.actor.anim && a.actor.anim.name;
    // Idle at the bench; periodically break into the room's work gesture. The
    // gesture anims auto-revert to idle in the shared stepper, so each is one rep.
    if (anim === 'idle' && a.gesture !== 'idle' && now >= a.nextAct) {
      gfx.setAnim(a.actor, a.gesture);
      a.nextAct = now + between(1400, 3400);
    }
    gfx.tickActor(a.actor, now);
  }
}
function drawRoomActors() {
  const gfx = window.__ranchGfx;
  for (const a of roomActors) {
    if (a.cv && a.cv.isConnected) gfx.renderActor(a.cv, a.actor);
  }
}
function startRoomLoop() {
  if (roomLoopRunning) return;
  roomLoopRunning = true;
  function loop(now) {
    if (!roomLoopRunning) return;
    const scr = document.getElementById('guildScreen');
    const host = document.querySelector('#guildScreen .room-diorama[data-room="' + curRoom + '"]');
    // Self-stop when the guild screen is hidden, the diorama left the DOM
    // (switched rooms), OR it's hidden behind the ranch view (host [hidden] →
    // offsetParent null). Mirrors the ranch loop's active-guard; saves battery.
    if (!scr || !scr.classList.contains('active') || !host || host.offsetParent === null) { stopRoomLoop(); return; }
    try { roomTick(now); drawRoomActors(); }
    catch (e) { console.error('room diorama tick error', e); }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}
export function stopRoomLoop() { roomLoopRunning = false; }

// Dev probe (headless verification: hidden windows never fire rAF — step by hand).
if (typeof window !== 'undefined') {
  window.__roomDebug = () => ({ running: roomLoopRunning, room: curRoom, actors: roomActors.map((a) => ({ id: a.id, anim: a.actor.anim.name, cv: !!(a.cv && a.cv.isConnected) })) });
  window.__roomStep = (now) => { roomTick(now ?? performance.now()); drawRoomActors(); };
}
