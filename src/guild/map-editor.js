/**
 * @file The map editor — a drafting table for the world.
 *
 * RPG Maker's grammar (a square viewport, a palette sidebar, paint by cell)
 * over THIS project's one map shape: the ASCII grid + props/spawns/portals
 * charts in delve-maps.js. The editor edits THAT object and nothing else —
 * which is what makes a draft instantly walkable in every lens: register it
 * under DELVE_MAPS and the top-down, chase and first-person cameras all read
 * it the same way they read Hollowvein (ONE WORLD; the lenses are cameras).
 *
 * THE LADDER HOLDS BY CONSTRUCTION. A placed prop's chart width is computed
 * here the same way check-volumes.mjs audits it — w = h × art aspect × 48
 * from prop-volume.js's authored rung — so nothing an editor user places can
 * ever be the wrong height. The palette simply has no way to author a size.
 *
 * Drafts persist in localStorage ('crucible.editorMaps') and export as JSON;
 * promoting one to a shipped chart is pasting that JSON into delve-maps.js.
 */
import { DELVE_MAPS, THEMES, validateMap } from './delve-maps.js';
import { invalidateBake } from './delve.js';
import { ART, artSprite, artTexRect } from './art.js';
import { PROP_VOL, PLAYER_H } from './prop-volume.js';
import { PREY } from './locales.js';

/**
 * The ids the GAME owns, captured before any draft registers. A draft may
 * never wear one: hall's room strolls, the campus stamp and shipped portals
 * all resolve through DELVE_MAPS by id, and a draft registered over 'forge'
 * would replace the real Forge for the session (adversarial review's top
 * finding — including 'classroom2', which a naive fork-rename walks into).
 */
const SHIPPED = new Set([...Object.keys(DELVE_MAPS), 'campus']);

/** A legal, unshipped id near the wish. */
function freeId(wish) {
  let base = String(wish || 'draft').replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'draft';
  if (base === '__proto__' || base === 'constructor') base = 'draft';
  if (!SHIPPED.has(base)) return base;
  for (let n = 1; ; n++) {
    const id = `${base}-draft${n > 1 ? n : ''}`;
    if (!SHIPPED.has(id)) return id;
  }
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** Every map the editor touches gets the FULL shape — shipped charts omit
 *  arrays they don't use (hollowvein has no props), and imports omit anything. */
function normalize(m) {
  m.id = freeId(m.id);   // freeId suffixes a shipped id ('classroom' → 'classroom-draft')
  m.name = String(m.name || m.id);
  m.theme = THEMES[m.theme] ? m.theme : 'meadow';
  if (!Array.isArray(m.grid) || !m.grid.length) m.grid = blank(20, 14).grid;
  m.grid = m.grid.map(String);
  if (!Array.isArray(m.entry) || m.entry.length !== 2) m.entry = [2.5, 2.5];
  for (const k of ['props', 'spawns', 'portals']) if (!Array.isArray(m[k])) m[k] = [];
  return m;
}

// ---------------------------------------------------------------------------
// The vocabulary — every grid char the charts speak, named for the palette
// ---------------------------------------------------------------------------

/** Paintable cells. Colors are the editor's plan-view shorthand, not game art:
 *  readable at a glance, consistent across themes. */
const TILES = [
  { ch: '.', name: 'Floor', color: '#7c9a55', glyph: '' },
  { ch: '#', name: 'Void / chasm', color: '#14161c', glyph: '' },
  { ch: 'B', name: 'Wall (room height)', color: '#b7bcc4', glyph: '' },
  { ch: 'b', name: 'Low block (waist)', color: '#8c9199', glyph: '' },
  { ch: 'f', name: 'Furnishing cell', color: '#7c9a55', glyph: 'f' },
  { ch: 'd', name: 'Doorway (exit)', color: '#5a4632', glyph: '▢' },
  { ch: '+', name: 'Interior door (portal)', color: '#5a4632', glyph: '+' },
  { ch: 's', name: 'Entry stairs (exit)', color: '#6b5d4a', glyph: 'S' },
  { ch: 'w', name: 'Wagon exit', color: '#6b5d4a', glyph: 'W' },
  { ch: '^', name: 'Ledge (one step up)', color: '#9aa66d', glyph: '▲' },
  { ch: 'L', name: 'Ladder (climb)', color: '#a58448', glyph: 'H' },
  { ch: 'v', name: 'Vine (climb)', color: '#4f7a42', glyph: '≀' },
  { ch: 'o', name: 'Ore node', color: '#c9a86a', glyph: '◆' },
  { ch: 'r', name: 'Boulder', color: '#7d766c', glyph: '●' },
  { ch: 't', name: 'Stalagmite / tree', color: '#4d6b3e', glyph: '♦' },
  { ch: '=', name: 'Minecart rail', color: '#6d6558', glyph: '=' },
  { ch: 'm', name: 'Minecart', color: '#6d6558', glyph: 'M' },
];
const TILE_BY_CH = Object.fromEntries(TILES.map((t) => [t.ch, t]));

/**
 * THE SIZE LAW, applied at placement: the chart width every lens will draw,
 * derived from the ladder height exactly as dev/check-volumes.mjs verifies it.
 */
function lawfulWidth(art) {
  const v = PROP_VOL[art], a = ART[art];
  if (!v || !a) return null;
  return Math.round((v.form === 'lie' ? v.d : v.h) * (a.w / a.h) * 48);
}

/** Every prop with an authored volume — the only placeable objects, because
 *  a volumeless prop is exactly the silent size drift the checker forbids. */
const PROPS = Object.keys(PROP_VOL).filter((n) => ART[n]).map((n) => ({
  id: n, w: lawfulWidth(n), form: PROP_VOL[n].form,
  rung: (PROP_VOL[n].h / PLAYER_H).toFixed(2).replace(/\.?0+$/, ''),
}));

const FLAGS = [
  { id: 'entry', name: 'Entry point', hint: 'Where the walker arrives. One per map.' },
  { id: 'spawn', name: 'Creature spawn', hint: 'Pick a creature, then click a floor cell.' },
  { id: 'portal', name: 'Portal', hint: 'Walk near it to travel to another map.' },
];

const STORE_KEY = 'crucible.editorMaps';
const CELL = 26;              // base cell px at zoom 1

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let E = null;                 // the live editor session, or null
let walkCtx = null;           // { walk(mapId, fp) } — supplied by hall.js

const blank = (w, h) => ({
  id: 'draft', name: 'New Draft', theme: 'meadow',
  grid: Array.from({ length: h }, (_, y) =>
    (y === 0 || y === h - 1) ? '#'.repeat(w)
      : '#' + '.'.repeat(w - 2) + '#'),
  entry: [2.5, 2.5], spawns: [], props: [], portals: [],
});

const clone = (m) => JSON.parse(JSON.stringify(m));

function savedMaps() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch (e) { return {}; }
}
function persist() {
  const all = savedMaps();
  all[E.map.id] = exportShape(E.map);
  try { localStorage.setItem(STORE_KEY, JSON.stringify(all)); }
  catch (err) { toast('Save failed (storage full?) — export the JSON instead.'); return false; }
  register(E.map);
  toast('Saved.');
  return true;
}
/** The map as it would ship: editor-only bookkeeping (fOwn) stripped. */
function exportShape(map) {
  const m = clone(map);
  m.props.forEach((p) => delete p.fOwn);
  return m;
}
/**
 * A draft the lenses can walk: registered under its id like any shipped
 * chart — but NEVER over a shipped id, and always with its bake dropped, or
 * the next top-down walk crosses the previous save's floor plan.
 */
function register(map) {
  if (SHIPPED.has(map.id)) return;
  DELVE_MAPS[map.id] = exportShape(map);
  invalidateBake(map.id);
}

// ---------------------------------------------------------------------------
// Entry — hall.js calls this with the walk bridge
// ---------------------------------------------------------------------------

export function openMapEditor(ctx) {
  walkCtx = ctx || walkCtx;
  const host = document.getElementById('editorScreen');
  if (!host) return;
  if (!E) {
    // Re-register every saved draft so portals between drafts resolve.
    // register() skips shipped ids, which also HEALS a store poisoned by the
    // pre-guard build (a draft saved as 'forge' simply stops applying).
    const saved = savedMaps();
    for (const id in saved) register(normalize(saved[id]));
    const last = Object.values(saved)[0];
    E = {
      map: normalize(last ? clone(last) : blank(20, 14)),
      sel: { kind: 'tile', id: '.' }, prey: Object.keys(PREY)[0],
      tab: 'tiles', tool: 'paint', zoom: 1.4, panX: 0, panY: 0,
      undo: [], sheets: {}, painting: false, hover: null,
    };
  }
  buildDom(host);
  showScreen('editorScreen');
  draw();
}

/** hall.js routes a test-walk's onEnd back here. */
export function resumeEditor() {
  if (!E) return;
  const host = document.getElementById('editorScreen');
  buildDom(host);
  showScreen('editorScreen');
  draw();
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
}

// ---------------------------------------------------------------------------
// DOM — built fresh on open; the canvas redraws, the sidebar re-renders
// ---------------------------------------------------------------------------

function buildDom(host) {
  host.innerHTML = `
    <div class="med-wrap">
      <div class="med-main">
        <div class="med-bar">
          <button class="med-btn" data-act="back">← Guild</button>
          <span class="med-title"></span>
          <span class="med-spacer"></span>
          <button class="med-btn" data-act="undo" title="Undo (Ctrl+Z)">↺ Undo</button>
          <button class="med-btn" data-act="zoomOut">−</button>
          <button class="med-btn" data-act="zoomIn">+</button>
          <button class="med-btn med-primary" data-act="walk" title="Save and walk this map top-down">Walk it</button>
          <button class="med-btn med-primary" data-act="walkFp" title="Save and walk it in first person">1st person</button>
        </div>
        <div class="med-view"><canvas class="med-canvas"></canvas></div>
        <div class="med-status"></div>
      </div>
      <div class="med-side">
        <div class="med-tabs">
          <button data-tab="tiles">Tiles</button>
          <button data-tab="props">Objects</button>
          <button data-tab="flags">Flags</button>
          <button data-tab="map">Map</button>
        </div>
        <div class="med-palette"></div>
      </div>
    </div>`;
  host.querySelector('.med-bar').addEventListener('click', onBarClick);
  host.querySelector('.med-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (b) { E.tab = b.dataset.tab; renderSide(); }
  });
  const cv = host.querySelector('.med-canvas');
  cv.addEventListener('pointerdown', onDown);
  cv.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  // Named module functions on purpose: buildDom re-runs on every return from a
  // test walk, and addEventListener dedupes identical references — an arrow
  // here would stack one live listener per walk, forever.
  window.addEventListener('keydown', onKey);
  window.addEventListener('resize', onResize);
  renderSide();
}
function onResize() {
  const scr = document.getElementById('editorScreen');
  if (E && scr && scr.classList.contains('active')) draw();
}

function toast(msg) {
  const el = document.querySelector('.med-status');
  if (el) { el.textContent = msg; el.classList.add('on'); setTimeout(() => el.classList.remove('on'), 2500); }
}

function renderSide() {
  const host = document.getElementById('editorScreen');
  if (!host) return;
  host.querySelectorAll('.med-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === E.tab));
  host.querySelector('.med-title').textContent = `${E.map.name} · ${E.map.grid[0].length}×${E.map.grid.length} · ${E.map.theme}`;
  const pal = host.querySelector('.med-palette');

  if (E.tab === 'tiles') {
    pal.innerHTML = `<div class="med-hint">Click a tile, then paint the map. Right-click paints floor.</div>`
      + TILES.map((t) => `
        <button class="med-chip ${E.sel.kind === 'tile' && E.sel.id === t.ch ? 'on' : ''}" data-tile="${t.ch}">
          <span class="med-swatch" style="background:${t.color}">${t.glyph}</span>${t.name}
          <span class="med-ch">'${t.ch}'</span>
        </button>`).join('')
      + `<button class="med-chip ${E.sel.kind === 'erase' ? 'on' : ''}" data-erase="1">
          <span class="med-swatch" style="background:#2b2f38">✕</span>Eraser
          <span class="med-ch">del</span></button>`;
    pal.onclick = (e) => {
      const t = e.target.closest('[data-tile]');
      const er = e.target.closest('[data-erase]');
      if (t) E.sel = { kind: 'tile', id: t.dataset.tile };
      if (er) E.sel = { kind: 'erase' };
      if (t || er) renderSide();
    };
  } else if (E.tab === 'props') {
    pal.innerHTML = `<div class="med-hint">Click an object, then click the cell it stands in. Its size follows
        the ladder automatically (×player rung shown). Eraser removes it.</div>`
      + PROPS.map((p) => `
        <button class="med-chip med-prop ${E.sel.kind === 'prop' && E.sel.id === p.id ? 'on' : ''}" data-prop="${p.id}">
          <span class="med-thumb">${artSprite(p.id, '', 'width:100%')}</span>
          ${p.id}<span class="med-ch">${p.rung}×</span>
        </button>`).join('');
    pal.onclick = (e) => {
      const b = e.target.closest('[data-prop]');
      if (b) { E.sel = { kind: 'prop', id: b.dataset.prop }; renderSide(); }
    };
  } else if (E.tab === 'flags') {
    pal.innerHTML = `<div class="med-hint">Entry, creatures and portals. Click the map to place the armed flag.</div>`
      + FLAGS.map((f) => `
        <button class="med-chip ${E.sel.kind === 'flag' && E.sel.id === f.id ? 'on' : ''}" data-flag="${f.id}" title="${f.hint}">
          <span class="med-swatch" style="background:#3c4457">${f.id === 'entry' ? '⚑' : f.id === 'spawn' ? '☠' : '◈'}</span>${f.name}
        </button>`).join('')
      + `<div class="med-field"><label>Creature</label><select class="med-prey">
          ${Object.keys(PREY).map((k) => `<option value="${k}" ${k === E.prey ? 'selected' : ''}>${PREY[k].name || k}</option>`).join('')}
        </select></div>
      <div class="med-hint">Spawns end a top-down test walk if they catch you (no arena hooks on the
        drafting table) — test combat maps in 1st person, where the fight is real.</div>`;
    pal.onclick = (e) => {
      const b = e.target.closest('[data-flag]');
      if (b) { E.sel = { kind: 'flag', id: b.dataset.flag }; renderSide(); }
    };
    pal.querySelector('.med-prey').onchange = (e) => { E.prey = e.target.value; };
  } else {
    const themes = Object.keys(THEMES);
    const templates = Object.keys(DELVE_MAPS).filter((k) => DELVE_MAPS[k]);
    pal.innerHTML = `
      <div class="med-field"><label>Name</label><input class="med-name" value="${esc(E.map.name)}"></div>
      <div class="med-field"><label>Id</label><input class="med-id" value="${esc(E.map.id)}"></div>
      <div class="med-field"><label>Theme</label><select class="med-theme">
        ${themes.map((t) => `<option ${t === E.map.theme ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="med-field"><label>Size</label>
        <input class="med-w" type="number" min="6" max="60" value="${E.map.grid[0].length}"> ×
        <input class="med-h" type="number" min="6" max="60" value="${E.map.grid.length}">
        <button class="med-btn" data-act="resize">Apply</button></div>
      <div class="med-row">
        <button class="med-btn" data-act="new">New</button>
        <button class="med-btn" data-act="save">Save</button>
        <button class="med-btn" data-act="validate">Validate</button>
      </div>
      <div class="med-field"><label>Open</label><select class="med-load">
        <option value="">— template or draft —</option>
        ${templates.map((t) => `<option>${t}</option>`).join('')}</select></div>
      <div class="med-row">
        <button class="med-btn" data-act="export">Export JSON</button>
        <button class="med-btn" data-act="import">Import</button>
      </div>
      <textarea class="med-json" placeholder="Exported JSON appears here; paste a map here and press Import."></textarea>`;
    pal.onclick = (e) => {
      const b = e.target.closest('[data-act]');
      if (b) onMapAction(b.dataset.act, pal);
    };
    pal.querySelector('.med-name').onchange = (e) => { snap(); E.map.name = e.target.value; renderSide(); };
    pal.querySelector('.med-id').onchange = (e) => {
      snap();
      const wish = e.target.value;
      E.map.id = freeId(wish);
      if (E.map.id !== wish.toLowerCase()) toast(`'${wish}' is taken by the game — using '${E.map.id}'.`);
      renderSide();
    };
    pal.querySelector('.med-theme').onchange = (e) => { snap(); E.map.theme = e.target.value; draw(); renderSide(); };
    pal.querySelector('.med-load').onchange = (e) => {
      const id = e.target.value;
      if (!id || !DELVE_MAPS[id]) return;
      snap();
      E.map = normalize(clone(DELVE_MAPS[id]));
      // Opening a SHIPPED chart forks it: normalize has already moved the id
      // off the shipped one ('classroom' → 'classroom-draft', never the
      // shipped 'classroom2'), so the original stays intact.
      if (SHIPPED.has(id)) E.map.name = (DELVE_MAPS[id].name || id) + ' (draft)';
      E.panX = E.panY = 0;
      draw(); renderSide();
    };
  }
}

function onMapAction(act, pal) {
  if (act === 'resize') {
    const w = Math.max(6, Math.min(60, +pal.querySelector('.med-w').value || 20));
    const h = Math.max(6, Math.min(60, +pal.querySelector('.med-h').value || 14));
    snap();
    E.map.grid = Array.from({ length: h }, (_, y) => {
      const row = E.map.grid[y] || '';
      return (row + '#'.repeat(Math.max(0, w - row.length))).slice(0, w);
    });
    draw(); renderSide();
  } else if (act === 'new') {
    snap(); E.map = blank(20, 14); E.panX = E.panY = 0; draw(); renderSide();
  } else if (act === 'save') {
    persist(); renderSide();
  } else if (act === 'validate') {
    try {
      validateMap(E.map);
      const issues = lint();
      toast(issues.length ? issues[0] + (issues.length > 1 ? ` (+${issues.length - 1} more — see console)` : '') : 'Clean: rows even, entry on floor.');
      issues.forEach((i) => console.warn('editor lint:', i));
    } catch (err) { toast(String(err.message || err)); }
  } else if (act === 'export') {
    pal.querySelector('.med-json').value = JSON.stringify(exportShape(E.map), null, 2);
    toast('JSON in the box below — copy it, or hand it to Claude to ship into delve-maps.js.');
  } else if (act === 'import') {
    try {
      const m = JSON.parse(pal.querySelector('.med-json').value);
      if (!m || !Array.isArray(m.grid) || !m.grid.length) throw new Error('no grid');
      snap(); E.map = normalize(m); draw(); renderSide(); toast('Imported as ' + E.map.id + '.');
    } catch (err) { toast('Import failed: ' + (err.message || err)); }
  }
}

/** Editor-side lint past validateMap's: things a draft walk would trip over. */
function lint() {
  const out = [];
  const m = E.map;
  const W = m.grid[0].length, H = m.grid.length;
  const at = (x, y) => (m.grid[Math.floor(y)] || '')[Math.floor(x)];
  const e = at(m.entry[0], m.entry[1]);
  if (!e || '#BbFrtmo'.includes(e)) out.push(`entry at ${m.entry} stands in '${e || 'void'}'`);
  const exits = m.grid.join('').match(/[sdw]/g) || [];
  if (!exits.length && !(m.portals || []).length) out.push('no exit cell (s/d/w) — the walk cannot end');
  if (exits.length > 1) out.push(`${exits.length} exit cells — the top-down keeps only the last one scanned as the live exit`);
  for (const p of m.props) if (!PROP_VOL[p.art]) out.push(`prop '${p.art}' has no volume entry — author its ladder height first`);
  const inside = (x, y) => x >= 0 && x < W && y >= 0 && y < H;
  const off = [...m.props.filter((p) => !inside(p.x, p.y - 0.5)).map((p) => p.art),
    ...m.spawns.filter((s) => !inside(s.x, s.y)).map((s) => s.prey),
    ...(m.portals || []).filter((p) => !inside(p.x, p.y)).map(() => 'portal')];
  if (off.length) out.push(`off the map after a resize: ${off.join(', ')} — erase or move them`);
  return out;
}

function onBarClick(e) {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  if (act === 'back') { walkCtx && walkCtx.back ? walkCtx.back() : history.back(); }
  else if (act === 'undo') undo();
  else if (act === 'zoomIn') { E.zoom = Math.min(3, E.zoom * 1.25); draw(); }
  else if (act === 'zoomOut') { E.zoom = Math.max(0.4, E.zoom / 1.25); draw(); }
  else if (act === 'walk' || act === 'walkFp') {
    try { validateMap(E.map); } catch (err) { toast(String(err.message || err)); return; }
    const issues = lint();
    if (issues.length) { toast(issues[0]); return; }
    persist();
    if (walkCtx && walkCtx.walk) walkCtx.walk(E.map.id, act === 'walkFp');
    else toast('No walker attached — open the editor from the Grounds.');
  }
}

function onKey(e) {
  if (!E || !document.getElementById('editorScreen') ||
      !document.getElementById('editorScreen').classList.contains('active')) return;
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
}

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

function snap() { E.undo.push(clone(E.map)); if (E.undo.length > 60) E.undo.shift(); }
function undo() { const m = E.undo.pop(); if (m) { E.map = m; draw(); renderSide(); } }

const setCell = (x, y, ch) => {
  const row = E.map.grid[y];
  if (!row || x < 0 || x >= row.length) return;
  E.map.grid[y] = row.slice(0, x) + ch + row.slice(x + 1);
};

function cellAt(ev) {
  const cv = document.querySelector('.med-canvas');
  const r = cv.getBoundingClientRect();
  const px = (ev.clientX - r.left) - E.panX, py = (ev.clientY - r.top) - E.panY;
  const s = CELL * E.zoom;
  return { x: Math.floor(px / s), y: Math.floor(py / s), fx: px / s, fy: py / s };
}

function onDown(ev) {
  if (ev.button === 1) { E.pan = { x: ev.clientX - E.panX, y: ev.clientY - E.panY }; return; }
  const c = cellAt(ev);
  if (c.y < 0 || c.y >= E.map.grid.length || c.x < 0 || c.x >= E.map.grid[0].length) return;
  snap();
  E.painting = true;
  apply(c, ev.button === 2);
  draw();
}
function onMove(ev) {
  if (E && E.pan) { E.panX = ev.clientX - E.pan.x; E.panY = ev.clientY - E.pan.y; draw(); return; }
  if (!E) return;
  const c = cellAt(ev);
  const changed = !E.hover || E.hover.x !== c.x || E.hover.y !== c.y;
  E.hover = c;
  if (E.painting && E.sel.kind === 'tile') { apply(c, false); draw(); }
  else if (changed) draw();
}
function onUp() { if (E) { E.painting = false; E.pan = null; } }

/** One edit, routed by what is armed. Right-click always paints floor. */
function apply(c, rightClick) {
  const { x, y } = c;
  if (y < 0 || y >= E.map.grid.length || x < 0 || x >= E.map.grid[0].length) return;
  if (rightClick) { setCell(x, y, '.'); return; }

  if (E.sel.kind === 'tile') { setCell(x, y, E.sel.id); return; }

  if (E.sel.kind === 'erase') {
    // Nearest thing wins: prop → spawn → portal → tile back to floor.
    const px = c.fx, py = c.fy;
    const near = (list, fn) => {
      let best = -1, bd = 0.8;
      list.forEach((it, i) => { const d = Math.hypot(fn(it)[0] - px, fn(it)[1] - py); if (d < bd) { bd = d; best = i; } });
      return best;
    };
    let i = near(E.map.props, (p) => [p.x, p.y - 0.4]);
    if (i >= 0) {
      const p = E.map.props.splice(i, 1)[0];
      const cy = Number.isInteger(p.y) ? p.y - 1 : Math.floor(p.y);
      const cx = Math.floor(p.x);
      // The 'f' goes with the prop ONLY if the prop brought it (fOwn — a
      // hand-painted 'f' is the author's, not ours) and no other placed
      // stand/lie prop still owns the cell (a wall prop hanging there never
      // owned it and must not keep an orphan blocker alive).
      if (p.fOwn && (E.map.grid[cy] || '')[cx] === 'f'
        && !E.map.props.some((q) => q.fOwn && Math.floor(q.x) === cx && (Number.isInteger(q.y) ? q.y - 1 : Math.floor(q.y)) === cy)) {
        setCell(cx, cy, '.');
      }
      return;
    }
    i = near(E.map.spawns, (s) => [s.x + 0.5, s.y + 0.5]);
    if (i >= 0) { E.map.spawns.splice(i, 1); return; }
    i = near(E.map.portals || [], (p) => [p.x, p.y]);
    if (i >= 0) { E.map.portals.splice(i, 1); return; }
    setCell(x, y, '.');
    return;
  }

  if (E.sel.kind === 'prop') {
    const art = E.sel.id, vol = PROP_VOL[art];
    const w = lawfulWidth(art);
    if (!vol || w == null) return;
    // Furniture stands on FLOOR. On a wall it would be entombed, on a ledge
    // it would block nothing (no 'f' bake) — ONE COLLISION FACT says a thing
    // blocks the space its art occupies, so the editor refuses the placements
    // that cannot honor it rather than silently minting walk-through props.
    const under = (E.map.grid[y] || '')[x];
    if (under !== '.' && under !== 'f') { toast('Furniture needs a floor cell.'); return; }
    if (vol.form === 'wall') {
      // Hung a hair proud of the cell's north edge — the charts' convention
      // (y ~ row + 0.02); wallSolid finds the actual stone from the map.
      E.map.props.push({ art, x: x + 0.5, y: y + 0.02, w });
    } else {
      // Standing/lying: foot line on the cell's south edge, art rising north —
      // the top-down's own anchor rule. The cell becomes an 'f' so it blocks;
      // fOwn marks the 'f' as ours so the eraser can tell it from an authored one.
      const fOwn = under === '.' ? 1 : undefined;
      E.map.props.push({ art, x: x + 0.5, y: y + 1, w, ...(fOwn ? { fOwn } : {}) });
      if (fOwn) setCell(x, y, 'f');
    }
    return;
  }

  if (E.sel.kind === 'flag') {
    if (E.sel.id === 'entry') E.map.entry = [x + 0.5, y + 0.5];
    else if (E.sel.id === 'spawn') E.map.spawns.push({ prey: E.prey, x, y });
    else if (E.sel.id === 'portal') {
      const to = prompt('Portal to which map id?', Object.keys(DELVE_MAPS).find((k) => k !== E.map.id) || '');
      if (!to) { E.undo.pop(); return; }   // cancelled — drop the pre-armed snapshot
      const dest = DELVE_MAPS[to];
      E.map.portals = E.map.portals || [];
      E.map.portals.push({ x: x + 0.5, y: y + 0.5, to, at: dest ? [...dest.entry] : [2.5, 2.5], enter: true });
    }
  }
}

// ---------------------------------------------------------------------------
// Drawing — plan view: tiles as swatches, props as their real art
// ---------------------------------------------------------------------------

function sheetFor(art, onload) {
  const rec = artTexRect(art);
  if (!rec) return null;
  let img = E.sheets[rec.url];
  if (!img) {
    img = new Image();
    img.src = rec.url;
    img.onload = onload;
    E.sheets[rec.url] = img;
  }
  return img.complete && img.naturalWidth ? { img, rec } : null;
}

function draw() {
  const cv = document.querySelector('.med-canvas');
  if (!cv || !E) return;
  const view = cv.parentElement;
  const dpr = window.devicePixelRatio || 1;
  const W = view.clientWidth, H = view.clientHeight;
  if (cv.width !== W * dpr || cv.height !== H * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#0d0f14';
  g.fillRect(0, 0, W, H);
  g.translate(E.panX, E.panY);

  const s = CELL * E.zoom;
  const m = E.map;
  const themeFloor = { meadow: '#5d8544', mine: '#8f7c58', }[m.theme] || '#6f5d49';

  for (let y = 0; y < m.grid.length; y++) {
    for (let x = 0; x < m.grid[y].length; x++) {
      const ch = m.grid[y][x];
      const t = TILE_BY_CH[ch];
      g.fillStyle = ch === '.' || ch === 'f' ? themeFloor : (t ? t.color : '#a03a72');
      g.fillRect(x * s, y * s, s, s);
      if (ch === '^') { g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(x * s, y * s, s, s); }
      if (t && t.glyph) {
        g.fillStyle = 'rgba(255,255,255,.75)';
        g.font = `${Math.round(s * 0.5)}px serif`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(t.glyph, x * s + s / 2, y * s + s / 2);
      }
    }
  }
  // Grid lines, faint, so counting cells is possible without dominating.
  g.strokeStyle = 'rgba(255,255,255,.07)';
  g.lineWidth = 1;
  const gw = m.grid[0].length * s, gh = m.grid.length * s;
  for (let x = 0; x <= m.grid[0].length; x++) { g.beginPath(); g.moveTo(x * s, 0); g.lineTo(x * s, gh); g.stroke(); }
  for (let y = 0; y <= m.grid.length; y++) { g.beginPath(); g.moveTo(0, y * s); g.lineTo(gw, y * s); g.stroke(); }

  // Props: the real crops, drawn at their chart width against the 48px tile —
  // the same relative size every lens shows, which is the point of the law.
  const redraw = () => E && draw();
  for (const p of [...m.props].sort((a, b) => a.y - b.y)) {
    const a = ART[p.art];
    const got = a && sheetFor(p.art, redraw);
    const wPx = ((p.w || 48) / 48) * s;
    const hPx = a ? wPx * (a.h / a.w) : wPx;
    const x0 = p.x * s - wPx / 2, y0 = p.y * s - hPx;
    if (got) {
      const { img, rec } = got;
      const iw = img.naturalWidth, ih = img.naturalHeight;
      g.drawImage(img, rec.uv[0] * iw, rec.uv[1] * ih, (rec.uv[2] - rec.uv[0]) * iw, (rec.uv[3] - rec.uv[1]) * ih,
        x0, y0, wPx, hPx);
    } else {
      g.fillStyle = 'rgba(200,170,110,.55)';
      g.fillRect(x0, y0, wPx, hPx);
    }
  }

  // Flags over everything: entry, spawns, portals.
  g.font = `${Math.round(s * 0.6)}px serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const sp of m.spawns || []) {
    g.fillStyle = 'rgba(200,60,60,.85)';
    g.beginPath(); g.arc((sp.x + 0.5) * s, (sp.y + 0.5) * s, s * 0.3, 0, 7); g.fill();
    g.fillStyle = '#fff';
    g.fillText((PREY[sp.prey] && PREY[sp.prey].name ? PREY[sp.prey].name : sp.prey)[0].toUpperCase(), (sp.x + 0.5) * s, (sp.y + 0.5) * s);
  }
  for (const p of m.portals || []) {
    g.fillStyle = 'rgba(90,140,255,.9)';
    g.fillText('◈', p.x * s, p.y * s);
    g.font = `${Math.round(s * 0.32)}px serif`;
    g.fillText(p.to, p.x * s, p.y * s + s * 0.45);
    g.font = `${Math.round(s * 0.6)}px serif`;
  }
  g.fillStyle = '#ffd76b';
  g.fillText('⚑', m.entry[0] * s, m.entry[1] * s);

  // Hover cell cursor.
  if (E.hover && E.hover.x >= 0 && E.hover.y >= 0 && E.hover.y < m.grid.length && E.hover.x < m.grid[0].length) {
    g.strokeStyle = 'rgba(255,215,107,.9)';
    g.lineWidth = 2;
    g.strokeRect(E.hover.x * s + 1, E.hover.y * s + 1, s - 2, s - 2);
  }
}
