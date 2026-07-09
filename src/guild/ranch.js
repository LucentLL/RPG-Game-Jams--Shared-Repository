/**
 * @file The Ranch — the guild's living-canvas HOME view (Monster-Rancher-DS style).
 *
 * Members roam a grass field as animated sprites; facilities/buildings sit placed on
 * the grounds; tapping a building drills into that room, tapping a member opens their
 * card. It reuses the ACTION ARENA's animated-sprite machinery via `window.__ranchGfx`
 * (exposed by crucible.js): the same fighter renderer running a wander loop instead of
 * a combat loop. Positions are EPHEMERAL — seeded deterministically from person.id and
 * never saved (see the design: a Person has no spatial fields).
 *
 * Lives as a `.ranch-view` sibling of `.guild-hall-host` inside #guildScreen; hall.js's
 * render() only ever writes the host, so this canvas subtree survives room re-renders.
 * The RAF loop self-stops whenever #guildScreen loses `.active` or the ranch is hidden.
 */
import { facilityTier } from './guild.js';
import { formatDate } from './calendar.js';
import { STATIONS, YARD_SLOTS, stationDef, stationCapacity, canBuild, addStation, removeStation } from './stations.js';

// --- ephemeral module state -------------------------------------------------
let actors = [];              // [{ id, actor, cv, ax, ay, facing, _wander }]
let ranchLoopRunning = false; // re-entrancy guard (mirrors actionLoopRunning)
let grassURI = null;          // baked once
let _guild = null;            // last guild passed to renderRanch — build actions + wander AI read it
let _save = null;             // hall's save() hook, so placing/removing equipment persists
let buildMode = false;        // yard build/place mode (ephemeral UI state, never saved)
let pickType = null;          // station type currently armed for placement

// Buildings/zones placed on the GS×GS field (tile coords). Rooms → openRoom on tap.
const RANCH_PROPS = [
  { glyph: '🏰', name: 'Great Hall', room: 'roster', tx: 4.5, ty: 1.6, big: true },
  { glyph: '🏠', name: 'Quarters', room: 'quarters', tx: 1.4, ty: 2.2, grow: 'quarters' },
  { glyph: '🔨', name: 'Forge', room: 'forge', tx: 7.4, ty: 2.4 },
  { glyph: '📖', name: 'Library', room: 'library', tx: 1.5, ty: 5.4 },
  { glyph: '🗡', name: 'Armory', room: 'armory', tx: 7.5, ty: 5.6 },
  { glyph: '🍲', name: 'Kitchen', room: 'kitchen', tx: 3.0, ty: 7.5 },
  { glyph: '⚔', name: 'Arena', room: 'arena', tx: 6.4, ty: 7.4 },
];

// Environmental dressing (Pixy-Garden set dressing, MR-ranch density): CSS trees,
// bushes, and small accents scattered art-directed around the walk area, plus a
// flat dirt path and a pond that LIE on the plane. Purely decorative — never saved.
const RANCH_DECOR = [
  { kind: 'tree',  tx: 0.55, ty: 0.8, s: 1.25 }, { kind: 'tree',  tx: 2.6, ty: 0.7, s: 1.0 },
  { kind: 'tree',  tx: 6.2, ty: 0.6, s: 1.15 }, { kind: 'tree',  tx: 8.35, ty: 0.9, s: 1.3 },
  { kind: 'tree',  tx: 0.5, ty: 3.8, s: 1.1 },  { kind: 'tree',  tx: 8.5, ty: 4.1, s: 1.05 },
  { kind: 'tree',  tx: 0.6, ty: 7.6, s: 1.2 },  { kind: 'tree',  tx: 8.4, ty: 7.8, s: 1.1 },
  { kind: 'tree',  tx: 1.0, ty: 8.6, s: 0.9 },  { kind: 'tree',  tx: 7.9, ty: 8.7, s: 1.0 },
  { kind: 'bush',  tx: 2.9, ty: 2.9, s: 1 },    { kind: 'bush',  tx: 6.1, ty: 3.1, s: 1.1 },
  { kind: 'bush',  tx: 2.2, ty: 6.4, s: 0.9 },  { kind: 'bush',  tx: 6.9, ty: 6.6, s: 1 },
  { kind: 'bush',  tx: 4.2, ty: 8.6, s: 1.05 }, { kind: 'bush',  tx: 8.2, ty: 2.9, s: 0.85 },
  { kind: 'glyph', g: '🌼', tx: 3.6, ty: 3.4 }, { kind: 'glyph', g: '🌼', tx: 5.5, ty: 5.2 },
  { kind: 'glyph', g: '🌷', tx: 2.4, ty: 4.6 }, { kind: 'glyph', g: '🌾', tx: 6.6, ty: 4.5 },
  { kind: 'glyph', g: '🌾', tx: 3.1, ty: 5.8 }, { kind: 'glyph', g: '🍄', tx: 1.3, ty: 6.9 },
  { kind: 'glyph', g: '🪨', tx: 7.2, ty: 1.6 }, { kind: 'glyph', g: '🌼', tx: 5.0, ty: 6.9 },
  { kind: 'glyph', g: '🪵', tx: 2.0, ty: 1.3 }, { kind: 'glyph', g: '🌷', tx: 7.6, ty: 6.9 },
];
function decorHTML(GS) {
  const items = RANCH_DECOR.map((d) => {
    const pos = `left:${d.tx / GS * 100}%;top:${d.ty / GS * 100}%;z-index:${2 + Math.round(d.ty * 10)}`;
    if (d.kind === 'tree') return `<span class="ranch-decor" style="${pos}"><span class="rm-shadow"></span><span class="rd-standee" style="--s:${d.s}"><span class="rd-canopy"></span><span class="rd-canopy two"></span><span class="rd-trunk"></span></span></span>`;
    if (d.kind === 'bush') return `<span class="ranch-decor" style="${pos}"><span class="rd-standee" style="--s:${d.s || 1}"><span class="rd-bush"></span></span></span>`;
    return `<span class="ranch-decor" style="${pos}"><span class="rd-standee"><span class="rd-glyph">${d.g}</span></span></span>`;
  }).join('');
  // Flat features lie IN the plane: a worn dirt path from the Great Hall down the
  // middle, and a pond by the kitchen. Drawn as ground patches, not standees.
  const flats = `
    <span class="ranch-path" style="left:${4.5 / GS * 100}%;top:${1.9 / GS * 100}%;width:${1.15 / GS * 100}%;height:${6.1 / GS * 100}%"></span>
    <span class="ranch-path spur" style="left:${5.55 / GS * 100}%;top:${7.0 / GS * 100}%;width:${1.1 / GS * 100}%;height:${0.5 / GS * 100}%"></span>
    <span class="ranch-pond" style="left:${1.6 / GS * 100}%;top:${8.0 / GS * 100}%;width:${1.9 / GS * 100}%;height:${1.1 / GS * 100}%"></span>`;
  return flats + items;
}

/** Deterministic spawn tile from the stable person id (no persistence needed). */
function seedTile(id, GS) {
  let s = 0; const key = String(id);
  for (let i = 0; i < key.length; i++) s = (s * 131 + key.charCodeAt(i)) | 0;
  const u = (s >>> 0) / 4294967296, v = ((s >>> 8) & 255) / 255;
  return { ax: 1 + u * (GS - 2), ay: 1 + v * (GS - 2) };
}

/** (Re)build the actor list for the current roster, keeping positions for members that persist. */
function seedActors(roster, GS) {
  const gfx = window.__ranchGfx;
  const prev = new Map(actors.map((a) => [a.id, a]));
  actors = roster.map((h) => {
    const keep = prev.get(h.id);
    if (keep) { keep.el = null; keep.cv = null; return keep; } // same member — keep position/wander/anim; DOM rebinds below
    const t = seedTile(h.id, GS);
    return { id: h.id, actor: gfx.makeActor(h), el: null, cv: null, ax: t.ax, ay: t.ay, facing: Math.PI,
      _wander: { state: 'idle', until: performance.now() + Math.random() * 1500, tx: t.ax, ty: t.ay } };
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

/** Build (or refresh) the ranch DOM and (re)start the wander loop. Call on entry / on roster change. */
export function renderRanch(guild, save) {
  _guild = guild; if (save) _save = save;
  const screen = document.getElementById('guildScreen');
  if (!screen) return;
  let view = screen.querySelector('.ranch-view');
  if (!view) { view = document.createElement('div'); view.className = 'ranch-view'; screen.appendChild(view); }
  const gfx = window.__ranchGfx;
  if (!gfx) { view.innerHTML = '<div class="ranch-fallback">Loading the grounds…</div>'; return; }
  if (!grassURI) grassURI = gfx.bakeGrass();
  const GS = gfx.GS;
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
        <div class="rbld-hint">${full ? 'Yard full — upgrade the Training Yard in Grounds for more slots.' : (pickType ? 'Tap a ＋ spot on the grounds to place it.' : 'Pick a station, then tap a spot on the grounds.')}</div>
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
      <div class="ranch-field" style="background-image:url(${grassURI})">${decorHTML(GS)}${propsHTML}${stationsHTML}${ghostsHTML}${membersHTML}</div>
    </div>
    ${buildPanelHTML}
    <div class="ranch-menu">
      <button class="rmn-btn" onclick="__guild.enterRoomFromRanch('roster')"><span class="rmn-g">🛡</span>Roster</button>
      <button class="rmn-btn" onclick="__guild.enterRoomFromRanch('calendar')"><span class="rmn-g">📅</span>Calendar</button>
      <button class="rmn-btn" onclick="__guild.enterRoomFromRanch('arena')"><span class="rmn-g">⚔</span>Arena</button>
      <button class="rmn-btn" onclick="__guild.enterRoomFromRanch('grounds')"><span class="rmn-g">🏗</span>Grounds</button>
      <button class="rmn-btn" onclick="__guild.enterRoomFromRanch('hub')"><span class="rmn-g">☰</span>All rooms</button>
    </div>`;

  seedActors(roster, GS);
  // Cache each member's freshly-built wrapper + canvas so the render loop needn't re-query per frame.
  const field = view.querySelector('.ranch-field');
  actors.forEach((a) => {
    a.el = field.querySelector(`.ranch-actor[data-rid="${a.id}"]`);
    a.cv = a.el ? a.el.querySelector('canvas.ranch-member') : null;
  });
  ranchRender();      // draw the first frame now (so sprites show before the RAF loop ticks)
  startRanchLoop();
}

/** ~45% of the time, route a member who's training a drill to a station that boosts
 *  it — so placed equipment visibly draws its users. Returns a tile point, or null
 *  (free roam). */
function stationWanderTarget(id, GS) {
  if (!_guild || Math.random() > 0.45) return null;
  const hero = (_guild.roster || []).find((h) => h.id === id);
  const a = hero && hero.assignment;
  const drill = a && a.type === 'train' ? a.trainingId : null;
  if (!drill) return null;
  const matches = (_guild.stations || []).filter((s) => { const d = stationDef(s.type); return d && d.drill === drill; });
  if (!matches.length) return null;
  const slot = YARD_SLOTS[matches[Math.floor(Math.random() * matches.length)].slot];
  if (!slot) return null;
  return { tx: Math.max(0.8, Math.min(GS - 0.8, slot.tx + (Math.random() - 0.5) * 0.5)), ty: Math.min(GS - 0.8, slot.ty + 0.55) };
}

function ranchTick(dt, now) {
  const gfx = window.__ranchGfx; const GS = gfx.GS;
  for (const a of actors) {
    const w = a._wander;
    if (w.state === 'idle' && now >= w.until) {
      w.state = 'move';
      const spot = stationWanderTarget(a.id, GS);
      if (spot) { w.tx = spot.tx; w.ty = spot.ty; }
      else { w.tx = 0.8 + Math.random() * (GS - 1.6); w.ty = 0.8 + Math.random() * (GS - 1.6); }
    }
    if (w.state === 'move') {
      const dx = w.tx - a.ax, dy = w.ty - a.ay, d = Math.sqrt(dx * dx + dy * dy);
      if (d > 0.15) {
        const ux = dx / d, uy = dy / d, sp = 2.1; // tiles/sec — a gentle stroll (combat is ~4)
        a.ax = Math.max(0.5, Math.min(GS - 0.5, a.ax + ux * sp * dt));
        a.ay = Math.max(0.5, Math.min(GS - 0.5, a.ay + uy * sp * dt));
        a.facing = Math.atan2(ux, -uy); // same convention as facingToRow
        if (a.actor.anim.name !== 'move') gfx.setAnim(a.actor, 'move');
      } else {
        gfx.setAnim(a.actor, 'idle');
        w.state = 'idle'; w.until = now + 1500 + Math.random() * 2500;
      }
    }
    a.actor.facing = a.facing;
    gfx.tickActor(a.actor, now); // step the walk/idle frame
  }
}

function ranchRender() {
  const gfx = window.__ranchGfx; const GS = gfx.GS;
  for (const a of actors) {
    if (!a.el || !a.el.isConnected || !a.cv) continue;
    a.el.style.left = (a.ax / GS * 100) + '%';
    a.el.style.top = (a.ay / GS * 100) + '%';
    a.el.style.zIndex = String(2 + Math.round(a.ay * 10)); // painter sort backstop (3D depth handles overlaps)
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
    ranchTick(dt, now);
    ranchRender();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

export function stopRanchLoop() { ranchLoopRunning = false; }

// --- yard build mode (Guild Academy Pillar A) -------------------------------
/** Toggle the equipment build/place mode on the ranch. */
export function toggleBuild() { buildMode = !buildMode; if (!buildMode) pickType = null; if (_guild) renderRanch(_guild); }
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
