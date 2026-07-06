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

// --- ephemeral module state -------------------------------------------------
let actors = [];              // [{ id, actor, cv, ax, ay, facing, _wander }]
let ranchLoopRunning = false; // re-entrancy guard (mirrors actionLoopRunning)
let grassURI = null;          // baked once

// Buildings/zones placed on the GS×GS field (tile coords). Rooms → openRoom on tap.
const RANCH_PROPS = [
  { glyph: '🏰', name: 'Great Hall', room: 'roster', tx: 4.5, ty: 2.0, big: true },
  { glyph: '🏠', name: 'Quarters', room: 'quarters', tx: 1.4, ty: 2.2, grow: 'quarters' },
  { glyph: '🔨', name: 'Forge', room: 'forge', tx: 7.4, ty: 2.4 },
  { glyph: '📖', name: 'Library', room: 'library', tx: 1.7, ty: 5.4 },
  { glyph: '🗡', name: 'Armory', room: 'armory', tx: 7.5, ty: 5.6 },
  { glyph: '🍲', name: 'Kitchen', room: 'kitchen', tx: 3.3, ty: 7.4 },
  { glyph: '⚔', name: 'Arena', room: 'arena', tx: 6.2, ty: 7.2 },
];

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
    if (keep) return keep; // same member — keep its position, wander state, actor + anim
    const t = seedTile(h.id, GS);
    return { id: h.id, actor: gfx.makeActor(h), cv: null, ax: t.ax, ay: t.ay, facing: Math.PI,
      _wander: { state: 'idle', until: performance.now() + Math.random() * 1500, tx: t.ax, ty: t.ay } };
  });
}

/** Build (or refresh) the ranch DOM and (re)start the wander loop. Call on entry / on roster change. */
export function renderRanch(guild) {
  const screen = document.getElementById('guildScreen');
  if (!screen) return;
  let view = screen.querySelector('.ranch-view');
  if (!view) { view = document.createElement('div'); view.className = 'ranch-view'; screen.appendChild(view); }
  const gfx = window.__ranchGfx;
  if (!gfx) { view.innerHTML = '<div class="ranch-fallback">Loading the grounds…</div>'; return; }
  if (!grassURI) grassURI = gfx.bakeGrass();
  const GS = gfx.GS;
  const roster = guild.roster || [];

  const propsHTML = RANCH_PROPS.map((p) => {
    const tier = p.grow ? facilityTier(guild, p.grow) : 0;
    return `<button class="ranch-prop ${p.big ? 'big' : ''}" style="left:${p.tx / GS * 100}%;top:${p.ty / GS * 100}%;z-index:${2 + Math.round(p.ty * 10)}" title="${p.name}" onclick="__guild.enterRoomFromRanch('${p.room}')">
        <span class="rp-glyph">${p.glyph}</span><span class="rp-name">${p.name}${tier ? ' ·' + (tier + 1) : ''}</span></button>`;
  }).join('');
  const membersHTML = roster.map((h) =>
    `<canvas class="ranch-member" width="96" height="96" data-rid="${h.id}" title="${h.name} — manage" onclick="__guild.manageMemberFromRanch('${h.id}')"></canvas>`).join('');

  view.innerHTML = `
    <div class="ranch-hud">
      <span class="ranch-title">☙ ${guild.name}</span>
      <span class="ranch-meta">☉ <b>${guild.gold}</b>g · ✦ <b>${guild.reputation}</b> · ${formatDate(guild.calendar)}</span>
      <span class="ranch-hud-btns">
        <button class="ranch-btn" onclick="__guild.enterRoomFromRanch('hub')">☰ Manage</button>
        <button class="ranch-btn adv" onclick="__guild.advanceAll()">▶ Advance Week</button>
      </span>
    </div>
    <div class="ranch-stage">
      <div class="ranch-field" style="background-image:url(${grassURI})">${propsHTML}${membersHTML}</div>
    </div>`;

  seedActors(roster, GS);
  // Cache each member's freshly-built canvas so the render loop needn't re-query per frame.
  const field = view.querySelector('.ranch-field');
  actors.forEach((a) => { a.cv = field.querySelector(`canvas.ranch-member[data-rid="${a.id}"]`); });
  ranchRender();      // draw the first frame now (so sprites show before the RAF loop ticks)
  startRanchLoop();
}

function ranchTick(dt, now) {
  const gfx = window.__ranchGfx; const GS = gfx.GS;
  for (const a of actors) {
    const w = a._wander;
    if (w.state === 'idle' && now >= w.until) {
      w.state = 'move';
      w.tx = 0.8 + Math.random() * (GS - 1.6);
      w.ty = 0.8 + Math.random() * (GS - 1.6);
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
    if (!a.cv || !a.cv.isConnected) continue;
    a.cv.style.left = (a.ax / GS * 100) + '%';
    a.cv.style.top = (a.ay / GS * 100) + '%';
    a.cv.style.zIndex = String(2 + Math.round(a.ay * 10)); // painter sort: lower on the field draws on top
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
