/**
 * @file The Build tab — a top-down plan of the whole estate, and the tools to change it.
 *
 * This replaces the Ranch, which had become a second, invented 22×22 estate that
 * showed decorative copies of buildings the walkable Grounds already had. It drew
 * a campus that did not exist.
 *
 * This one draws the REAL campus: it reads `guild.campus` and renders exactly the
 * layout `buildCampusMap()` hands to the walkable Grounds. Deliberately FLAT
 * (no perspective tilt) — a builder wants a plan, not a diorama, and a flat grid
 * makes footprints, doorways and free ground legible at a glance. Every edit goes
 * through campus.js, so the plan and the ground you walk cannot drift.
 */
import {
  CAMPUS_W, CAMPUS_H, BUILDING_KINDS, PROP_KINDS, ensureCampus, buildCampusMap,
  kindWidth, canPlace, placeBuilding, moveBuilding, demolish, fellTree, placeProp, clearProp, doorOf,
} from './campus.js';
import { artSprite } from './art.js';
import { addGold } from './economy.js';

/** The active tool. 'select' inspects; the rest act on the next cell clicked. */
let tool = 'select';
/** Which building/prop kind the place tools are armed with. */
let armedBuilding = 'storehouse', armedProp = 'lampPost';
/** The building picked up by the move tool, awaiting a destination. */
let moving = null;
/** Plan zoom — px per tile. */
let cell = 13;
let _guild = null, _save = null, _notice = '';

const CELL_MIN = 7, CELL_MAX = 26;

export function buildZoomIn() { cell = Math.min(CELL_MAX, Math.round(cell * 1.25)); redraw(); }
export function buildZoomOut() { cell = Math.max(CELL_MIN, Math.round(cell / 1.25)); redraw(); }
export function buildZoomFit() { cell = 13; redraw(); }

/** Arm a tool. Picking the same one twice drops back to select. */
export function setTool(t) {
  tool = (tool === t && t !== 'select') ? 'select' : t;
  if (tool !== 'move') moving = null;
  _notice = '';
  redraw();
}
export function armBuilding(kind) { if (BUILDING_KINDS[kind]) { armedBuilding = kind; tool = 'build'; } redraw(); }
export function armProp(kind) { if (PROP_KINDS[kind]) { armedProp = kind; tool = 'prop'; } redraw(); }

/** A click on the plan at tile (x, y). Everything routes through campus.js. */
export function cellClick(x, y) {
  const g = _guild; if (!g) return;
  ensureCampus(g);
  const b = buildingAt(g, x, y);
  const p = propAt(g, x, y);

  if (tool === 'select') {
    _notice = b ? `${BUILDING_KINDS[b.kind].glyph} ${BUILDING_KINDS[b.kind].name} — ${kindWidth(b.kind)} tiles wide, door on row ${doorOf(b)[1]}.`
      : p ? `${PROP_KINDS[p.kind].glyph} ${PROP_KINDS[p.kind].name}.`
      : treeAt(g, x, y) ? '🌳 A tree. The Fell tool clears it for building.'
      : `Open ground · ${x},${y}`;
  } else if (tool === 'move') {
    if (!moving) {
      if (!b) { _notice = 'Nothing there to move.'; }
      else { moving = b.id; _notice = `Moving ${BUILDING_KINDS[b.kind].name} — click where its base should sit.`; }
    } else {
      // The clicked cell is the building's BASE row, matching how a facade is
      // authored: it stands on `base`, occupying the two rows above it.
      const res = moveBuilding(g, moving, x, y + 1);
      _notice = res.ok ? 'Moved.' : `Can't put it there — ${res.why}.`;
      if (res.ok) { moving = null; _save && _save(); }
    }
  } else if (tool === 'build') {
    const k = BUILDING_KINDS[armedBuilding];
    if (g.gold < k.cost) { _notice = `${k.name} costs ☉${k.cost} — the coffers are short.`; }
    else {
      const res = placeBuilding(g, armedBuilding, x, y + 1);
      if (res.ok) { addGold(g, -k.cost); _notice = `${k.name} raised for ☉${k.cost}.`; _save && _save(); }
      else _notice = `Can't build there — ${res.why}.`;
    }
  } else if (tool === 'prop') {
    const k = PROP_KINDS[armedProp];
    if (g.gold < k.cost) { _notice = `${k.name} costs ☉${k.cost} — the coffers are short.`; }
    else {
      const res = placeProp(g, armedProp, x + 0.5, y + 1);
      if (res.ok) { addGold(g, -k.cost); _notice = `${k.name} placed for ☉${k.cost}.`; _save && _save(); }
      else _notice = `Can't place that — ${res.why}.`;
    }
  } else if (tool === 'fell') {
    if (fellTree(g, x, y).ok) { _notice = 'Cleared. That ground can be built on now.'; _save && _save(); }
    else _notice = 'No tree there.';
  } else if (tool === 'raze') {
    if (b) {
      const res = demolish(g, b.id);
      _notice = res.ok ? `${BUILDING_KINDS[b.kind].name} pulled down${res.refund ? ` · ☉${res.refund} recovered` : ''}.` : `Can't demolish that — ${res.why}.`;
      if (res.ok) { if (res.refund) addGold(g, res.refund); _save && _save(); }
    } else if (p) {
      const res = clearProp(g, p.id);
      if (res.ok) { if (res.refund) addGold(g, res.refund); _notice = 'Cleared.'; _save && _save(); }
    } else _notice = 'Nothing there to pull down.';
  }
  redraw();
}

const buildingAt = (g, x, y) => g.campus.buildings.find((b) => {
  const w = kindWidth(b.kind);
  return x >= b.x && x < b.x + w && y >= b.base - 2 && y < b.base;
});
const propAt = (g, x, y) => g.campus.props.find((p) => Math.floor(p.x) === x && Math.round(p.y) - 1 === y);
const treeAt = (g, x, y) => g.campus.trees.some((t) => t[0] === x && t[1] === y);

/** Is this tile inside a footprint that the armed tool could not use? */
function blockedFor(g, x, y) {
  if (tool !== 'build') return false;
  return !canPlace(g, armedBuilding, x, y + 1, moving).ok;
}

const TOOLS = [
  { id: 'select', glyph: '🔍', name: 'Inspect' },
  { id: 'move', glyph: '✥', name: 'Move' },
  { id: 'build', glyph: '🏗', name: 'Build' },
  { id: 'prop', glyph: '🪵', name: 'Place' },
  { id: 'fell', glyph: '🪓', name: 'Fell trees' },
  { id: 'raze', glyph: '💥', name: 'Demolish' },
];

/** Render the whole tab into `#guildScreen`. */
export function renderBuild(guild, save) {
  _guild = guild; if (save) _save = save;
  const screen = document.getElementById('guildScreen');
  if (!screen) return;
  ensureCampus(guild);
  let view = screen.querySelector('.build-view');
  if (!view) { view = document.createElement('div'); view.className = 'build-view'; screen.appendChild(view); }

  const map = buildCampusMap(guild);
  const W = CAMPUS_W * cell, H = CAMPUS_H * cell;

  // Ground: one cell per tile, classed by what the derivation put there. This is
  // the authoritative grid, so the plan can never show ground the walk disagrees with.
  let tiles = '';
  for (let y = 0; y < CAMPUS_H; y++) {
    for (let x = 0; x < CAMPUS_W; x++) {
      const ch = map.grid[y][x];
      const cls = ch === '#' ? 'bv-void' : ch === 'F' ? 'bv-solid' : ch === '+' ? 'bv-door'
        : ch === 't' ? 'bv-tree' : ch === 'w' ? 'bv-gate' : 'bv-open';
      const warn = blockedFor(guild, x, y) ? ' bv-no' : '';
      tiles += `<button class="bv-cell ${cls}${warn}" style="left:${x * cell}px;top:${y * cell}px;width:${cell}px;height:${cell}px" onclick="__guild.buildCell(${x},${y})"></button>`;
    }
  }
  // Facades, drawn at their real footprint so scale reads true.
  const bldgs = guild.campus.buildings.map((b) => {
    const k = BUILDING_KINDS[b.kind], w = kindWidth(b.kind);
    const sel = moving === b.id ? ' bv-moving' : '';
    return `<div class="bv-bldg${sel}" style="left:${b.x * cell}px;top:${(b.base - 2) * cell}px;width:${w * cell}px">
        ${artSprite(k.art, 'bv-art')}<span class="bv-tag">${k.glyph} ${k.name}</span></div>`;
  }).join('');
  const props = guild.campus.props.map((p) => {
    const k = PROP_KINDS[p.kind];
    return `<div class="bv-prop" style="left:${(p.x - 0.6) * cell}px;top:${(p.y - 1.6) * cell}px;width:${cell * 1.2}px">${artSprite(k.art, 'bv-art')}</div>`;
  }).join('');

  const toolBtns = TOOLS.map((t) => `<button class="bv-tool ${tool === t.id ? 'on' : ''}" onclick="__guild.buildTool('${t.id}')">${t.glyph} ${t.name}</button>`).join('');
  const palette = tool === 'build'
    ? Object.entries(BUILDING_KINDS).filter(([, k]) => !k.core).map(([id, k]) =>
        `<button class="bv-pick ${armedBuilding === id ? 'on' : ''} ${guild.gold < k.cost ? 'lack' : ''}" onclick="__guild.buildArm('${id}')">${k.glyph} ${k.name} <span class="bv-cost">☉${k.cost}</span></button>`).join('')
    : tool === 'prop'
    ? Object.entries(PROP_KINDS).map(([id, k]) =>
        `<button class="bv-pick ${armedProp === id ? 'on' : ''} ${guild.gold < k.cost ? 'lack' : ''}" onclick="__guild.buildArmProp('${id}')">${k.glyph} ${k.name} <span class="bv-cost">☉${k.cost}</span></button>`).join('')
    : '';
  const hint = tool === 'select' ? 'Click anything to read it.'
    : tool === 'move' ? (moving ? 'Now click the row its base should stand on.' : 'Click a building to pick it up.')
    : tool === 'build' ? 'Click the row the new base should stand on. Red tiles are taken.'
    : tool === 'prop' ? 'Click where it should stand.'
    : tool === 'fell' ? 'Click a green tree tile to clear it.'
    : 'Click a building or prop to pull it down. Core buildings hold a room’s only door and stay.';

  view.innerHTML = `
    <div class="bv-bar">
      <span class="bv-title">🏗 Build · The Grounds</span>
      <span class="bv-gold">☉${guild.gold}</span>
      <span class="bv-zoom">
        <button onclick="__guild.buildZoomOut()">−</button>
        <button onclick="__guild.buildZoomFit()">▣</button>
        <button onclick="__guild.buildZoomIn()">＋</button>
      </span>
      <button class="bv-walk" onclick="__guild.walkGuild()">🚶 Walk it</button>
    </div>
    <div class="bv-tools">${toolBtns}</div>
    ${palette ? `<div class="bv-palette">${palette}</div>` : ''}
    <div class="bv-hint">${_notice || hint}</div>
    <div class="bv-stage"><div class="bv-plan" style="width:${W}px;height:${H}px">
      ${tiles}${props}${bldgs}
    </div></div>`;
}

function redraw() { if (_guild) renderBuild(_guild, _save); }

/** Dev probe — the plan's state without a click. */
if (typeof window !== 'undefined') {
  window.__buildDebug = () => (!_guild ? null : {
    tool, armedBuilding, armedProp, moving, cell, notice: _notice,
    buildings: _guild.campus.buildings.map((b) => `${b.kind}@${b.x},${b.base}`),
    trees: _guild.campus.trees.length, props: _guild.campus.props.length,
  });
}
