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
import { DELVE_MAPS, THEMES, validateMap, makeLevelModel, CLIMB_CH, DECK_CH, wetCells } from './delve-maps.js';
import { invalidateBake } from './delve.js';
import { ART, artSprite, artTexRect } from './art.js';
import { waterFrames, waterFrameAt, WATER_TINT } from './water.js';
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
  if (!Array.isArray(m.grid) || !m.grid.length) m.grid = blank(36, 24).grid;
  m.grid = m.grid.map(String);
  if (!Array.isArray(m.entry) || m.entry.length !== 2) m.entry = [2.5, 2.5];
  for (const k of ['props', 'spawns', 'portals', 'paint', 'regions', 'locks', 'water']) if (!Array.isArray(m[k])) m[k] = [];
  // A wet cell is an [x, y] pair on the grid or it is nothing — and it is only
  // ever there once, so an import (or a drag that outran its own guard) can
  // never leave the same cell stacked and un-dryable.
  {
    const seen = new Set();
    m.water = m.water.filter((c) => {
      if (!Array.isArray(c) || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) return false;
      const k = c[0] + ',' + c[1];
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  // A paint rect is four finite numbers or it is nothing — a NaN rect would
  // draw nowhere on the plan and still ride along in the export.
  m.paint = m.paint.filter((r) => r && [r.x, r.y, r.w, r.h].every(Number.isFinite) && r.w > 0 && r.h > 0);
  // A lock is a [x, y] pair on the grid or it is nothing.
  m.locks = m.locks.filter((l) => Array.isArray(l) && Number.isFinite(l[0]) && Number.isFinite(l[1]));
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
  // '▼', not 'S': the exit stairs go DOWN, and on the plan an 'S' glyph would
  // be indistinguishable from the new Steps char.
  { ch: 's', name: 'Entry stairs (exit)', color: '#6b5d4a', glyph: '▼' },
  { ch: 'w', name: 'Wagon exit', color: '#6b5d4a', glyph: 'W' },
  { ch: '^', name: 'Ledge (one step up)', color: '#9aa66d', glyph: '▲' },
  // The height vocabulary (delve-maps.js) — the canvas's level shading carries
  // most of the reading; the terraces need no glyph at all.
  { ch: '2', name: 'Terrace (two steps)', color: '#a8b478', glyph: '' },
  { ch: '3', name: 'Terrace (three steps)', color: '#b6c184', glyph: '' },
  { ch: '4', name: 'Terrace (four steps)', color: '#c2cc90', glyph: '' },
  { ch: '5', name: 'Terrace (five steps)', color: '#cdd69c', glyph: '' },
  { ch: '6', name: 'Terrace (six steps)', color: '#d8e0a8', glyph: '' },
  { ch: ',', name: 'Sunken floor (one down)', color: '#55663f', glyph: '' },
  { ch: 'S', name: 'Steps (climb at a walk)', color: '#8a7a52', glyph: '≡' },
  { ch: 'u', name: 'Tunnel (under-deck)', color: '#6e6250', glyph: '∩' },
  { ch: 'n', name: 'Bridge (planked deck)', color: '#8a6a42', glyph: '≃' },
  { ch: 'L', name: 'Ladder (climb)', color: '#a58448', glyph: 'H' },
  { ch: 'v', name: 'Vine (climb)', color: '#4f7a42', glyph: '≀' },
  // The moving parts: a door is a wall that opens when walked into (lock it
  // with the Flags tab's Lock), a key spends on one locked door.
  { ch: 'D', name: 'Door (walk to open)', color: '#8a6a42', glyph: '▯' },
  { ch: 'K', name: 'Key', color: '#d8a83c', glyph: 'K' },
  { ch: 'o', name: 'Ore node', color: '#c9a86a', glyph: '◆' },
  { ch: 'r', name: 'Boulder', color: '#7d766c', glyph: '●' },
  { ch: 't', name: 'Stalagmite / tree', color: '#4d6b3e', glyph: '♦' },
  { ch: '=', name: 'Minecart rail', color: '#6d6558', glyph: '=' },
  { ch: 'm', name: 'Minecart', color: '#6d6558', glyph: 'M' },
];
const TILE_BY_CH = Object.fromEntries(TILES.map((t) => [t.ch, t]));

/** Plan-view ground tint per theme — the wash draw() lays for floor cells AND
 *  the swatch the Surfaces tab arms, one table so the chip matches the ground
 *  it paints. Rooms not named here share the generic-interior brown. */
const THEME_TINT = { meadow: '#5d8544', mine: '#8f7c58', interior: '#7a6a55', arena: '#c2b283' };
const themeTint = (t) => THEME_TINT[t] || '#6f5d49';
/** What each theme's floor actually LOOKS like — the Surfaces tab names the
 *  texture, or "forge" reads as designating function (playtest confusion). */
const FLOOR_DESC = {
  meadow: 'grass', mine: 'sandy cave rock', interior: 'parquet',
  guildhall: 'limestone slabs', kitchen: 'scrubbed limestone', forge: 'dark sooty stone',
  apothecary: 'green flagstone', armory: 'brown brick', dormitory: 'wood planks',
  classroom: 'tan flagstone', guildmaster: 'red damask carpet', arena: 'raked sand',
};

/**
 * THE DISTINCT FLOORS, once each.
 *
 * A theme is a ROOM — a floor, a wall palette, a light — and the Surfaces tab
 * only ever borrows the floor. Listing one chip per theme therefore listed the
 * same picture more than once under different room names (guildhall and
 * classroom lay identical slabs; so do kitchen and arena), and named all of
 * them after rooms the palette does not build. An author looking for a stone
 * floor had to know which room happens to own the stone they want.
 *
 * So: group by what the ground ACTUALLY is — the sheet, its tile size, and the
 * fill cells — and keep the first theme in each group as the id the chart will
 * store. The chip then leads with the texture's own name and mentions the
 * theme only as the id it exports under.
 *
 * (Two FLOOR_DESC entries lie as a result of this: 'tan flagstone' and 'raked
 * sand' name tiles that are byte-identical to 'limestone slabs' and 'scrubbed
 * limestone'. Deduping here hides the symptom; the descriptions are a chart
 * question and are left alone.)
 */
const SURFACES = (() => {
  const seen = new Map();
  for (const id of Object.keys(THEMES)) {
    const t = THEMES[id];
    const sig = `${t.sheet || 'cliffs'}|${t.src || 48}|${JSON.stringify(t.fill)}`;
    if (seen.has(sig)) { seen.get(sig).also.push(id); continue; }
    seen.set(sig, { id, name: FLOOR_DESC[id] || id + ' floor', also: [] });
  }
  return [...seen.values()];
})();

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

/**
 * THE OBJECTS PALETTE, grouped by what a thing is FOR.
 *
 * Forty-three chips in one column is a list you scroll rather than a palette
 * you pick from, and the id is the only label — so finding the barrel you
 * wanted meant reading every name. Grouping is by PURPOSE and not by the
 * `form` field (stand / lie / wall), because form is a placement rule and
 * nobody browses furniture by whether it hangs.
 *
 * Hand-authored, so it will drift as props are added — which is exactly why
 * `propGroups()` sweeps the leftovers into a real group at the end instead of
 * trusting this list to stay complete. A new prop shows up unfiled; it never
 * disappears.
 */
const PROP_GROUPS = [
  ['Desks & tables', ['teacherDesk', 'gmDesk', 'classDesk', 'lectern', 'potionCounter']],
  ['Seating & beds', ['gmThrone', 'bed', 'bunkIron', 'bunkPosted']],
  ['Storage', ['gmBookshelf', 'jarCabinet', 'gearCubbies', 'wardrobe', 'footlocker',
    'provisionBarrel', 'quenchBarrel', 'storeBarrel']],
  ['Workstations', ['forgeFurnace', 'stoneOven', 'kitchenStove', 'anvilBare', 'cauldronBoil']],
  ['Tabletop & dressing', ['abacus', 'gmLedgers', 'breadPile', 'herbBasket', 'potionGreen',
    'bedCandle', 'globe', 'gmBust']],
  ['Wall-hung', ['gmPortrait', 'lessonBoard', 'recipeBanner', 'gmBanner', 'hangingHerbs', 'tools']],
  ['Training & display', ['armorKnight', 'armorSteel', 'trainDummy', 'statue']],
  ['Outdoors', ['well', 'stall', 'lampPost']],
];

/** The groups as they will actually render: known ids in authored order, then
 *  whatever PROP_GROUPS forgot. Computed once — PROPS never changes. */
const propGroups = (() => {
  const byId = new Map(PROPS.map((p) => [p.id, p]));
  const filed = new Set();
  const out = [];
  for (const [name, ids] of PROP_GROUPS) {
    const items = ids.filter((id) => byId.has(id)).map((id) => { filed.add(id); return byId.get(id); });
    if (items.length) out.push({ name, items });
  }
  const rest = PROPS.filter((p) => !filed.has(p.id));
  if (rest.length) out.push({ name: 'Unfiled', items: rest });
  return out;
})();

const FLAGS = [
  { id: 'entry', name: 'Entry point', hint: 'Where the walker arrives. One per map.' },
  { id: 'spawn', name: 'Creature spawn', hint: 'Pick a creature, then click a floor cell.' },
  { id: 'portal', name: 'Portal', hint: 'Walk near it to travel to another map.' },
  { id: 'lock', name: 'Lock', hint: 'Click a door (D) to lock or unlock it — a locked door spends a key.' },
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
  entry: [2.5, 2.5], spawns: [], props: [], portals: [], paint: [],
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
      map: normalize(last ? clone(last) : blank(36, 24)),
      sel: { kind: 'tile', id: '.' }, prey: Object.keys(PREY)[0],
      tab: 'tiles', tool: 'paint', zoom: 1.4, panX: 0, panY: 0,
      undo: [], sheets: {}, painting: false, hover: null, paintStart: null,
      view: 'plan', rot: 0, mods: {}, rectStart: null, rectMode: null, pending: null,
    };
  }
  buildDom(host);
  showScreen('editorScreen');
  draw();
  startWater();     // a no-op until the frames are in and the chart is wet
}

/** hall.js routes a test-walk's onEnd back here. */
export function resumeEditor() {
  if (!E) return;
  const host = document.getElementById('editorScreen');
  buildDom(host);
  showScreen('editorScreen');
  draw();
  startWater();     // a no-op until the frames are in and the chart is wet
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
          <button class="med-btn med-lint" data-act="validate" title="What a walk would trip over">⚠</button>
          <button class="med-btn" data-act="view3d" title="Toggle the extruded 3D view">⬒ 3D</button>
          <button class="med-btn" data-act="rotL" title="Rotate the 3D view left">⟲</button>
          <button class="med-btn" data-act="rotR" title="Rotate the 3D view right">⟳</button>
          <button class="med-btn" data-act="fit" title="Fit the whole map in view">⌖</button>
          <button class="med-btn" data-act="zoomOut">−</button>
          <button class="med-btn" data-act="zoomIn">+</button>
          <button class="med-btn" data-act="raise" title="Raise-ground tool">▲</button>
          <button class="med-btn" data-act="lower" title="Lower-ground tool">▼</button>
          <button class="med-btn med-primary" data-act="walk" title="Save and walk this map top-down">Walk it</button>
          <button class="med-btn med-primary" data-act="walkFp" title="Save and walk it in first person">1st person</button>
        </div>
        <div class="med-view"><canvas class="med-canvas"></canvas>
          <div class="med-readout"></div>
          <div class="med-help">L-click paint · R-click pick · Shift+click erase
            · X+drag room · V+drag fill · 1-5 tabs · Q/E turn · G 3D · F fit</div>
        </div>
        <div class="med-status"></div>
      </div>
      <div class="med-side">
        <div class="med-tabs">
          <button data-tab="tiles">Tiles</button>
          <button data-tab="props">Objects</button>
          <button data-tab="flags">Flags</button>
          <button data-tab="paint">Surfaces</button>
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
  window.addEventListener('pointercancel', onUp);
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  // Wheel zoom aims at the POINTER — the canvas dies with buildDom, so an
  // inline listener here cannot stack the way a window listener would.
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = cv.getBoundingClientRect();
    zoomTo(E.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  // Named module functions on purpose: buildDom re-runs on every return from a
  // test walk, and addEventListener dedupes identical references — an arrow
  // here would stack one live listener per walk, forever.
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKeyUp);
  // A held modifier that never sees its keyup (alt-tab away mid-drag) would
  // leave the next click drawing a room nobody asked for.
  window.addEventListener('blur', clearMods);
  window.addEventListener('resize', onResize);
  renderSide();
}
function onResize() {
  const scr = document.getElementById('editorScreen');
  if (E && scr && scr.classList.contains('active')) draw();
}

/**
 * Centre the map in the canvas — with `rezoom`, size the zoom to fit it too.
 * Called after anything that moves the ground under the camera (a rotation,
 * a resize, an import, the view toggle): a camera left panned over nowhere
 * reads as "the button did nothing" — the second phone playtest saw a black
 * screen and reasonably reported rotation itself as broken.
 */
function fitView(rezoom) {
  const view = document.querySelector('.med-view');
  if (!view || !E) return;
  const W = E.map.grid[0].length, H = E.map.grid.length;
  const cw = view.clientWidth, chh = view.clientHeight;
  if (rezoom) {
    const s1 = E.view === 'iso'
      ? Math.min(cw / ((W + H) * 1.04), chh / ((W + H) * 0.55 + 4))
      : Math.min(cw / (W + 1), chh / (H + 1));
    E.zoom = Math.max(0.15, Math.min(4, s1 / CELL));
  }
  const s = CELL * E.zoom;
  if (E.view === 'iso') {
    const VW = E.rot % 2 ? H : W, VH = E.rot % 2 ? W : H;
    const cx = ((VW - VH) / 2) * s + isoOX();
    const cy = ((VW + VH) / 2) * s * 0.5;
    E.panX = cw / 2 - cx; E.panY = chh / 2 - cy;
  } else {
    E.panX = (cw - W * s) / 2; E.panY = (chh - H * s) / 2;
  }
  draw();
}

/** Zoom keeping the point under the view's CENTRE (or the given screen point)
 *  fixed — zooming about the canvas origin meant you could never zoom INTO
 *  the part of a big map you were working on (playtest). */
function zoomTo(z, px, py) {
  const view = document.querySelector('.med-view');
  if (!view || !E) return;
  const z2 = Math.max(0.15, Math.min(4, z));
  const ax = px != null ? px : view.clientWidth / 2;
  const ay = py != null ? py : view.clientHeight / 2;
  const k = z2 / E.zoom;
  E.panX = ax - (ax - E.panX) * k;
  E.panY = ay - (ay - E.panY) * k;
  E.zoom = z2;
  draw();
}

// ---------------------------------------------------------------------------
// The water, on the drafting table
// ---------------------------------------------------------------------------

/** Does the chart being drafted have any liquid in it? Cached against the
 *  array's own length + identity, because draw() asks on every hover move. */
const mapIsWet = () => !!E && !!(E.map.water && E.map.water.length);
/** The wet lookup for the live draft, rebuilt only when the array changes. */
function wetNow() {
  const arr = E.map.water || [];
  if (E._wetArr !== arr || E._wetN !== arr.length) {
    E._wetArr = arr; E._wetN = arr.length; E._wetSet = wetCells(E.map);
  }
  return E._wetSet;
}
const editorActive = () => {
  const s = document.getElementById('editorScreen');
  return !!s && s.classList.contains('active');
};
const lessMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

/**
 * Fetch the water frames the first time the draft needs them, and start the
 * table's heartbeat.
 *
 * The editor is otherwise entirely event-driven — it redraws on a hover, a
 * click, a zoom, and never otherwise — and that is worth keeping. So this loop
 * exists on exactly two conditions (the chart is wet, the screen is up) and
 * ends itself the moment either stops holding. It also redraws only when the
 * authored FRAME actually changes, which is five times a second, not sixty.
 */
function ensureWater() {
  if (!E || E.wtiles || E._wload || !mapIsWet()) return;
  E._wload = true;
  waterFrames().then((f) => {
    if (!E) return;
    E.wtiles = f;
    draw();
    startWater();
  }).catch((err) => console.warn('editor: water sheet missing — water draws as flat tint', err));
}
function startWater() {
  if (!E || E._wraf || !E.wtiles || lessMotion()) return;
  const step = () => {
    E._wraf = 0;
    if (!E || !E.wtiles || !editorActive() || !mapIsWet()) return;
    const f = waterFrameAt(performance.now());
    if (f !== E._wframe) { E._wframe = f; draw(); }
    E._wraf = requestAnimationFrame(step);
  };
  E._wraf = requestAnimationFrame(step);
}
function stopWater() {
  if (E && E._wraf) { cancelAnimationFrame(E._wraf); E._wraf = 0; }
}
function clearMods() { if (E) E.mods = {}; }
/** The frame the table is showing — held at 0 under reduced motion. */
const waterTile = () => (E.wtiles ? E.wtiles[lessMotion() ? 0 : (E._wframe || 0)] : null);

function toast(msg) {
  const el = document.querySelector('.med-status');
  if (el) { el.textContent = msg; el.classList.add('on'); setTimeout(() => el.classList.remove('on'), 2500); }
}

/**
 * The Objects chips, grouped and filtered. Split out of renderSide because the
 * search box has to survive its own keystrokes.
 *
 * A query matches the id OR the group's name, so "barrel" finds the three
 * barrels wherever they are filed and "wall" brings up everything that hangs.
 * With a query the headings stay: knowing a match came from Storage rather
 * than Outdoors is most of what makes a result readable.
 */
function renderProps() {
  const host = document.getElementById('editorScreen');
  const box = host && host.querySelector('.med-proplist');
  if (!box) return;
  const q = (E.propQ || '').trim().toLowerCase();
  let shown = 0;
  const html = propGroups.map((g) => {
    const hit = q && g.name.toLowerCase().includes(q);
    const items = q && !hit ? g.items.filter((p) => p.id.toLowerCase().includes(q)) : g.items;
    if (!items.length) return '';
    shown += items.length;
    return `<div class="med-group">${g.name}</div>` + items.map((p) => `
      <button class="med-chip med-prop ${E.sel.kind === 'prop' && E.sel.id === p.id ? 'on' : ''}" data-prop="${p.id}"
        title="${p.id} — ${p.rung}× the player's height, ${p.form === 'wall' ? 'hangs on a wall' : p.form === 'lie' ? 'lies flat' : 'stands on the floor'}">
        <span class="med-thumb">${artSprite(p.id, '', 'width:100%')}</span>
        ${p.id}<span class="med-ch">${p.rung}×</span>
      </button>`).join('');
  }).join('');
  box.innerHTML = html || `<div class="med-hint">Nothing matches “${esc(q)}”.</div>`;
}

function renderSide() {
  const host = document.getElementById('editorScreen');
  if (!host) return;
  host.querySelectorAll('.med-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === E.tab));
  host.querySelector('.med-title').textContent = `${E.map.name} · ${E.map.grid[0].length}×${E.map.grid.length} · ${E.map.theme}`;
  const pal = host.querySelector('.med-palette');

  if (E.tab === 'tiles') {
    // GROUPED, because this palette holds three different KINDS of thing and
    // used to run them together as one undifferentiated column: two sculpting
    // verbs, one overlay, then thirty tiles. Water in particular was
    // unfindable — sitting third in a flat list it read as another ground
    // verb, and an author looking for it went to Surfaces (where it is not,
    // because it is not a floor) and gave up. A heading costs one line.
    const group = (t) => `<div class="med-group">${t}</div>`;
    pal.innerHTML = `<div class="med-hint">Click a tile, then paint. <b>Right-click</b> picks up whatever is
        under the cursor, <b>Shift+click</b> erases, <b>X+drag</b> draws a room and <b>V+drag</b> fills a
        rectangle. Keys 1-5 change tab, Q/E turn the 3D view, G toggles it, F fits.</div>`
      // The vertical VERBS, ahead of the tiles: sculpt the ground a step at a
      // time (pit , → floor . → ledge ^ → terraces 2 → 3) instead of hunting
      // the height chars — the answer to "how do I add vertically."
      + group('Sculpt the ground')
      + `<button class="med-chip ${E.sel.kind === 'vert' && E.sel.dir === 1 ? 'on' : ''}" data-vert="1">
          <span class="med-swatch" style="background:#3c4457">▲</span>Raise ground
          <span class="med-ch">+1</span></button>
        <button class="med-chip ${E.sel.kind === 'vert' && E.sel.dir === -1 ? 'on' : ''}" data-vert="-1">
          <span class="med-swatch" style="background:#3c4457">▼</span>Lower ground
          <span class="med-ch">−1</span></button>`
      // WATER IS NOT A TILE, and it sits here anyway — because painting is how
      // you author it, and the Tiles tab is where painting lives. It flows OVER
      // whatever the cell already is (a wet ',' is a creek you wade AND climb
      // out of), so it can never overwrite a floor the way a tile would.
      // Shift+click (or the Eraser) dries a cell.
      + group('Water — lies OVER any floor')
      + `<button class="med-chip med-wet ${E.sel.kind === 'water' ? 'on' : ''}" data-water="1"
          title="Paint water onto any walkable cell. It keeps the cell's own height, so a flooded creek bed is still a bed you climb out of. Shift+click to dry.">
          <span class="med-swatch" style="background:${WATER_TINT}">≈</span>Water (wade across)
          <span class="med-ch">drag</span></button>`
      + group('Tiles')
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
      const vt = e.target.closest('[data-vert]');
      const wa = e.target.closest('[data-water]');
      if (t) E.sel = { kind: 'tile', id: t.dataset.tile };
      if (er) E.sel = { kind: 'erase' };
      if (vt) E.sel = { kind: 'vert', dir: +vt.dataset.vert };
      if (wa) E.sel = { kind: 'water' };
      if (t || er || vt || wa) renderSide();
    };
  } else if (E.tab === 'props') {
    pal.innerHTML = `<div class="med-hint">Click an object, then click WHERE it stands — quarter-tile precision,
        and a small piece dropped on a bigger one rests on top of it. Size follows the ladder
        automatically (×player rung shown). Shift+click the map removes it.</div>
      <input class="med-search" type="search" placeholder="Search objects…" value="${esc(E.propQ || '')}">
      <div class="med-proplist"></div>`;
    renderProps();
    // The list redraws ALONE on every keystroke. A full renderSide() would
    // rebuild the input too and take the caret with it — you would get one
    // letter per click into the box.
    const box = pal.querySelector('.med-search');
    box.oninput = (e) => { E.propQ = e.target.value; renderProps(); };
    pal.onclick = (e) => {
      const b = e.target.closest('[data-prop]');
      if (!b) return;
      E.sel = { kind: 'prop', id: b.dataset.prop };
      // Repaint the chips in place, for the same caret reason.
      renderProps();
    };
  } else if (E.tab === 'flags') {
    pal.innerHTML = `<div class="med-hint">Entry, creatures and portals. Click the map to place the armed flag.</div>`
      + FLAGS.map((f) => `
        <button class="med-chip ${E.sel.kind === 'flag' && E.sel.id === f.id ? 'on' : ''}" data-flag="${f.id}" title="${f.hint}">
          <span class="med-swatch" style="background:#3c4457">${f.id === 'entry' ? '⚑' : f.id === 'spawn' ? '☠' : f.id === 'lock' ? '▣' : '◈'}</span>${f.name}
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
  } else if (E.tab === 'paint') {
    // Ground-fill dressing (the charts' `paint` array) — NOT regions: a
    // region is a room with walls and a ceiling, and the drafting table does
    // not author rooms. This tab only re-skins ground the grid already has.
    pal.innerHTML = `<div class="med-hint">FLOOR TEXTURE, nothing more: drag a rectangle to re-tile the ground
        there. It does NOT make the area a forge or change any rule. Each floor is listed once, by
        what it looks like — <b>water is not here</b>, it lies on TOP of a floor: find it in Tiles.</div>`
      + SURFACES.map((s) => `
        <button class="med-chip ${E.sel.kind === 'paint' && E.sel.id === s.id ? 'on' : ''}" data-paint="${s.id}"
          title="${s.also.length ? `exports as '${s.id}' — ${s.also.join(', ')} lay the same tiles` : `exports as '${s.id}'`}">
          <span class="med-swatch" style="background:${themeTint(s.id)}"></span>${s.name}
          <span class="med-ch">${s.id}</span>
        </button>`).join('')
      + `<button class="med-chip ${E.sel.kind === 'paintErase' ? 'on' : ''}" data-paint-erase="1">
          <span class="med-swatch" style="background:#2b2f38">✕</span>Eraser
          <span class="med-ch">del</span></button>`;
    pal.onclick = (e) => {
      const t = e.target.closest('[data-paint]');
      const er = e.target.closest('[data-paint-erase]');
      if (t) E.sel = { kind: 'paint', id: t.dataset.paint };
      else if (er) E.sel = { kind: 'paintErase' };
      if (t || er) renderSide();
    };
  } else {
    const themes = Object.keys(THEMES);
    const templates = Object.keys(DELVE_MAPS).filter((k) => DELVE_MAPS[k]);
    pal.innerHTML = `
      <div class="med-field"><label>Name</label><input class="med-name" value="${esc(E.map.name)}"></div>
      <div class="med-field"><label>Id</label><input class="med-id" value="${esc(E.map.id)}"></div>
      <div class="med-field"><label>Theme</label><select class="med-theme">
        ${themes.map((t) => `<option ${t === E.map.theme ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="med-field"><label>Size</label>
        <input class="med-w" type="number" min="6" max="128" value="${E.map.grid[0].length}"> ×
        <input class="med-h" type="number" min="6" max="128" value="${E.map.grid.length}">
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
      fitView(true); renderSide();
    };
  }
}

function onMapAction(act, pal) {
  if (act === 'resize') {
    // 96 on a side is town scale — the whole campus is 26×46. Past that the
    // top-down bake canvas (48px per cell) is what starts to hurt a phone.
    const w = Math.max(6, Math.min(128, +pal.querySelector('.med-w').value || 20));
    const h = Math.max(6, Math.min(128, +pal.querySelector('.med-h').value || 14));
    snap();
    E.map.grid = Array.from({ length: h }, (_, y) => {
      const row = E.map.grid[y] || '';
      return (row + '#'.repeat(Math.max(0, w - row.length))).slice(0, w);
    });
    fitView(true); renderSide();
  } else if (act === 'new') {
    snap(); E.map = blank(36, 24); fitView(true); renderSide();
  } else if (act === 'save') {
    persist(); renderSide();
  } else if (act === 'validate') {
    runValidate();
  } else if (act === 'export') {
    pal.querySelector('.med-json').value = JSON.stringify(exportShape(E.map), null, 2);
    toast('JSON in the box below — copy it, or hand it to Claude to ship into delve-maps.js.');
  } else if (act === 'import') {
    try {
      const m = JSON.parse(pal.querySelector('.med-json').value);
      if (!m || !Array.isArray(m.grid) || !m.grid.length) throw new Error('no grid');
      snap(); E.map = normalize(m); fitView(true); renderSide(); toast('Imported as ' + E.map.id + '.');
    } catch (err) { toast('Import failed: ' + (err.message || err)); }
  }
}

/**
 * Does an anchor at (ax, ay) land ON a taller placed prop — the walk's own
 * restOn rule (delve-fp buildProps), asked at PLACEMENT time so a resting
 * prop takes no 'f' cell: ledgers on a desk block nothing, per the charts.
 */
function restsOn(ax, ay, art) {
  const hMe = PROP_VOL[art] ? PROP_VOL[art].h : 0;
  return E.map.props.some((q) => {
    const v = PROP_VOL[q.art], a = ART[q.art];
    if (!v || !a || v.form === 'wall' || v.h <= hMe) return false;
    const qy = Number.isInteger(q.y) ? q.y - 0.5 : q.y;   // propCell's reading
    const w = (v.form === 'lie' ? v.d : v.h) * (a.w / a.h);
    const d = v.d || 0.3;
    return Math.abs(ax - q.x) <= w / 2 + 0.15
      && ay >= qy - d / 2 - 0.15 && ay <= qy + d / 2 + 0.15;
  });
}

/**
 * The height law of the CURRENT grid — the SAME model every lens walks
 * (delve-maps.js makeLevelModel), cached against the joined grid because
 * draw() runs on every hover move and the flood is cheap but not free.
 */
function levelModel() {
  const key = E.map.grid.join('\n');
  if (E._modelKey !== key) { E._modelKey = key; E._model = makeLevelModel(E.map.grid); }
  return E._model;
}

/** Editor-side lint past validateMap's: things a draft walk would trip over.
 *  Every height question below is asked OF THE MODEL, never re-derived from
 *  raw char adjacency — a lint that disagrees with the walk teaches lies. */
function lint() {
  const out = [];
  const m = E.map;
  const W = m.grid[0].length, H = m.grid.length;
  const at = (x, y) => (m.grid[Math.floor(y)] || '')[Math.floor(x)];
  const inside = (x, y) => x >= 0 && x < W && y >= 0 && y < H;
  const model = levelModel();
  const ORTH = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  const e = at(m.entry[0], m.entry[1]);
  if (!e || '#BbFrtmo'.includes(e)) out.push(`entry at ${m.entry} stands in '${e || 'void'}'`);
  const exits = m.grid.join('').match(/[sdw]/g) || [];
  if (!exits.length && !(m.portals || []).length) out.push('no exit cell (s/d/w) — the walk cannot end');
  if (exits.length > 1) out.push(`${exits.length} exit cells — the top-down keeps only the last one scanned as the live exit`);
  for (const p of m.props) if (!PROP_VOL[p.art]) out.push(`prop '${p.art}' has no volume entry — author its ladder height first`);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ch = at(x, y);
      if (CLIMB_CH[ch]) {
        // A climb stands on the low ground it derived; its whole job is the
        // level one rung up. No such neighbour → dressed floor. A neighbour
        // MORE than one up → a wall the step law will refuse.
        const lv = model.floorAt(x, y);
        let serves = false, jump = false;
        for (const [dx, dy] of ORTH) {
          if (model.surfacesAt(x + dx, y + dy).includes(lv + 1)) serves = true;
          const nf = model.floorAt(x + dx, y + dy), nd = model.deckAt(x + dx, y + dy);
          if (nf != null && (nf > lv + 1 || (nd != null && nd > lv + 1))) jump = true;
        }
        // A jump alone is not a fault: a stair chute walled by tall masonry
        // (the Gallery's pillar trick) faces 2s on both flanks and serves its
        // ledge perfectly well. Only a climb with NOTHING one rung up is
        // broken — and then the jump is the likeliest reason why.
        if (!serves) {
          out.push(jump
            ? `climb at ${x},${y} faces a jump of more than one level — terrace by construction (add a landing)`
            : `climb at ${x},${y} serves no higher ground`);
        }
      }
      // validateMap's deck-over-void rule, surfaced in the status bar where
      // the author is, not the console.
      if (DECK_CH[ch] && ORTH.some(([dx, dy]) => (at(x + dx, y + dy) || '#') === '#')) {
        out.push(`deck at ${x},${y} borders the void — bridge a ',' trench or open ground instead`);
      }
    }
  }

  // Every pit needs its own way back out: dropping in is always legal, and
  // the climb is the only way up. A climb beside sunken floor floods WITH it
  // (it derives the pit's level), so an escape is simply a member climb.
  const seenPit = new Set();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const lv0 = model.floorAt(x, y);
      if (lv0 == null || lv0 >= 0 || seenPit.has(y * W + x)) continue;
      const stack = [[x, y]];
      seenPit.add(y * W + x);
      let escape = false;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        if (model.climbAt(cx, cy)) escape = true;
        for (const [dx, dy] of ORTH) {
          const nx = cx + dx, ny = cy + dy, k = ny * W + nx;
          if (!inside(nx, ny) || seenPit.has(k)) continue;
          const nlv = model.floorAt(nx, ny);
          if (nlv != null && nlv < 0) { seenPit.add(k); stack.push([nx, ny]); }
        }
      }
      if (!escape) out.push(`a pit at ${x},${y} has no way out — hang a vine or cut steps`);
    }
  }

  // A deck run nothing can step ONTO is scenery wearing a bridge's clothes:
  // some cell of the run must touch non-deck ground at the deck's own level.
  const seenDeck = new Set();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (model.deckAt(x, y) == null || seenDeck.has(y * W + x)) continue;
      const stack = [[x, y]];
      seenDeck.add(y * W + x);
      let mounts = false;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        const d = model.deckAt(cx, cy);
        for (const [dx, dy] of ORTH) {
          const nx = cx + dx, ny = cy + dy, k = ny * W + nx;
          if (model.deckAt(nx, ny) != null) {
            if (inside(nx, ny) && !seenDeck.has(k)) { seenDeck.add(k); stack.push([nx, ny]); }
          } else if (model.surfacesAt(nx, ny).includes(d)) mounts = true;
        }
      }
      if (!mounts) out.push(`a deck at ${x},${y} nothing can step onto`);
    }
  }

  // Big maps are legal but priced: past ~96 a side the top-down lens's baked
  // ground canvas (48px a cell) is heavy on a phone. FP doesn't care.
  if (W > 96 || H > 96) out.push(`${W}×${H} is a big bake — the top-down walk may load slowly on a phone (first person is unaffected)`);

  // The moving parts: a latch on nothing, and more locks than keys.
  for (const [lx, ly] of (m.locks || [])) {
    if (at(lx, ly) !== 'D') out.push(`lock at ${lx},${ly} sits on '${at(lx, ly) || 'void'}' — locks belong on doors`);
  }
  const nLocks = (m.locks || []).filter(([lx, ly]) => at(lx, ly) === 'D').length;
  const nKeys = (m.grid.join('').match(/K/g) || []).length;
  if (nLocks > nKeys) out.push(`${nLocks} locked door${nLocks > 1 ? 's' : ''} but only ${nKeys} key${nKeys === 1 ? '' : 's'} — something stays shut forever`);

  // (No open-sky rule for tall terraces: indoors the ceiling RISES with the
  // floor — a terrace under a roof is a dome, per delve-fp's sector ceilings.)

  // An arrival takes the LOW surface (pickSurface with no origin — static
  // things live on the ground), so a flag on a deck cell wakes up UNDER it.
  if (model.deckAt(Math.floor(m.entry[0]), Math.floor(m.entry[1])) != null) out.push(`${m.entry[0]},${m.entry[1]} arrives on the GROUND under the deck`);
  for (const sp of m.spawns) {
    if (model.deckAt(Math.floor(sp.x), Math.floor(sp.y)) != null) out.push(`${sp.x},${sp.y} arrives on the GROUND under the deck`);
  }
  for (const p of m.portals || []) {
    const dest = p.to === m.id ? m : DELVE_MAPS[p.to];
    if (!dest || !Array.isArray(dest.grid) || !Array.isArray(p.at)) continue;
    const dm = p.to === m.id ? model : makeLevelModel(dest.grid);
    if (dm.deckAt(Math.floor(p.at[0]), Math.floor(p.at[1])) != null) out.push(`${p.at[0]},${p.at[1]} arrives on the GROUND under the deck`);
  }

  // The prop chart has no height slot yet, so furniture keeps to level 0 —
  // a piece anywhere else would draw at the ground in one lens and float in
  // another. (Off-map anchors are the resize lint's business, below.)
  for (const p of m.props) {
    const cx = Math.floor(p.x), cy = Number.isInteger(p.y) ? p.y - 1 : Math.floor(p.y);   // propCell's reading
    if (inside(cx, cy) && model.floorAt(cx, cy) !== 0) out.push(`prop '${p.art}' stands off ground level — furniture keeps to level 0 for now`);
  }

  for (const r of m.paint) if (!THEMES[r.theme]) out.push(`paint rect at ${r.x},${r.y} names unknown theme '${r.theme}'`);

  // Water over the void has no bed to sit in — the painter keeps no pixels
  // there and the walk has no floor, so the cell is silently dropped at bake
  // time. Say so here instead, where the author can move it.
  for (const [wx, wy] of (m.water || [])) {
    if (!inside(wx, wy)) continue;                 // the off-map sweep below has it
    if (at(wx, wy) === '#') out.push(`water at ${wx},${wy} lies over the void — cut floor under it, or dry the cell`);
  }

  const gone = (r) => [r.x, r.y, r.w, r.h].every(Number.isFinite)
    && (r.x >= W || r.y >= H || r.x + r.w <= 0 || r.y + r.h <= 0);
  const off = [...m.props.filter((p) => !inside(p.x, p.y - 0.5)).map((p) => p.art),
    ...m.spawns.filter((s) => !inside(s.x, s.y)).map((s) => s.prey),
    ...(m.portals || []).filter((p) => !inside(p.x, p.y)).map(() => 'portal'),
    ...m.paint.filter(gone).map(() => 'paint'),
    ...(m.water || []).filter(([wx, wy]) => !inside(wx, wy)).map(() => 'water'),
    ...(m.regions || []).filter((r) => r && gone(r)).map(() => 'region')];
  if (off.length) out.push(`off the map after a resize: ${off.join(', ')} — erase or move them`);
  return out;
}

/** Validate + lint, and say the first thing that is wrong. Shared by the
 *  toolbar's ⚠ and the Map tab's button — one answer, two doors. */
function runValidate() {
  try {
    validateMap(E.map);
    const issues = lint();
    toast(issues.length
      ? issues[0] + (issues.length > 1 ? ` (+${issues.length - 1} more — see console)` : '')
      : 'Clean: rows even, entry on floor.');
    issues.forEach((i) => console.warn('editor lint:', i));
  } catch (err) { toast(String(err.message || err)); }
}

/**
 * The bottom-left readout and the ⚠ badge.
 *
 * A cell's LEVEL is the thing an author most needs and could least see: the
 * plan shades it, but "a bit lighter than the last one" is not a number, and
 * the whole height vocabulary is about which rung a cell is on. Reading it off
 * the model (never off the char) means it agrees with the walk by construction.
 *
 * Lint is counted here rather than only on demand, because a lint you have to
 * ask for is a lint you find out about after the walk (@see the ⚠ in the bar).
 */
function refreshStatus() {
  const host = document.getElementById('editorScreen');
  if (!host) return;
  const out = host.querySelector('.med-readout');
  if (out) {
    const h = E.hover, m = E.map;
    const inMap = h && h.x >= 0 && h.y >= 0 && h.y < m.grid.length && h.x < m.grid[0].length;
    if (!inMap) out.textContent = '';
    else {
      const ch = m.grid[h.y][h.x];
      const t = TILE_BY_CH[ch];
      const model = levelModel();
      const lv = model.floorAt(h.x, h.y), dk = model.deckAt(h.x, h.y);
      const wet = wetNow().has(h.x + ',' + h.y);
      const prop = m.props.find((p) => Math.abs(p.x - h.fx) < 0.5 && Math.abs(p.y - 0.4 - h.fy) < 0.5);
      out.textContent = [
        `${h.x},${h.y}`,
        `'${ch}' ${t ? t.name : '?'}`,
        lv == null ? 'no floor' : `level ${lv}`,
        dk != null ? `deck ${dk}` : '',
        wet ? 'water' : '',
        prop ? prop.art : '',
      ].filter(Boolean).join('  ·  ');
    }
  }
  const badge = host.querySelector('.med-lint');
  if (badge) {
    // CACHED against the chart itself. draw() runs on every hover move and
    // lint() floods the grid several times over; recomputing it per mouse
    // pixel on a town-scale plan is how a drafting table starts to stutter.
    const m = E.map;
    const key = m.grid.join('\n') + '|' + [m.props, m.spawns, m.portals, m.paint, m.locks, m.water]
      .map((a) => (a || []).length).join(',') + '|' + JSON.stringify(m.entry);
    if (E._lintKey !== key) {
      E._lintKey = key;
      try { validateMap(m); E._lintN = lint().length; } catch (err) { E._lintN = -1; }
    }
    const n = E._lintN;
    badge.textContent = n < 0 ? '⚠ !' : n ? `⚠ ${n}` : '⚠';
    badge.classList.toggle('on', n !== 0);
    badge.title = n < 0 ? 'The chart is malformed — click for the reason'
      : n ? `${n} thing${n > 1 ? 's' : ''} a walk would trip over — click to read` : 'Nothing to report';
  }
}

function onBarClick(e) {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  // Anything that takes the screen away stops the table's heartbeat; the loop
  // also checks for itself, but ending it at the door is cheaper than one more
  // wasted frame and makes the lifetime obvious from here.
  if (act === 'back' || act === 'walk' || act === 'walkFp') stopWater();
  if (act === 'back') { walkCtx && walkCtx.back ? walkCtx.back() : history.back(); }
  else if (act === 'view3d') {
    E.view = E.view === 'iso' ? 'plan' : 'iso';
    b.textContent = E.view === 'iso' ? '▦ Plan' : '⬒ 3D';
    fitView(true);
  }
  else if (act === 'undo') undo();
  else if (act === 'rotL' || act === 'rotR') {
    E.rot = (E.rot + (act === 'rotL' ? 3 : 1)) % 4;
    if (E.view !== 'iso') toast('Rotation turns the 3D view — press ⬒ 3D to see it.');
    fitView(false);   // recentre: a turn that leaves you panned off-map reads as nothing
  }
  else if (act === 'fit') fitView(true);
  else if (act === 'raise' || act === 'lower') {
    E.sel = { kind: 'vert', dir: act === 'raise' ? 1 : -1 };
    E.tab = 'tiles'; renderSide();
    toast(act === 'raise'
      ? 'Raise armed — click ground to lift it, a step at a time, up to six.'
      : 'Lower armed — click ground to sink it, down to the pit.');
  }
  else if (act === 'zoomIn') zoomTo(E.zoom * 1.25);
  else if (act === 'zoomOut') zoomTo(E.zoom / 1.25);
  else if (act === 'walk' || act === 'walkFp') {
    try { validateMap(E.map); } catch (err) { toast(String(err.message || err)); return; }
    // Only what makes a walk IMPOSSIBLE stops the button: a drowned entry or
    // no way out. Everything else lint knows is ADVICE — a stray ladder must
    // not lock the author out of their own map (it did, one playtest long).
    const stop = walkStoppers();
    if (stop.length) { toast(stop[0]); return; }
    const notes = lint();
    if (notes.length) toast(notes[0] + ' — walking anyway (Validate lists all)');
    persist();
    if (walkCtx && walkCtx.walk) walkCtx.walk(E.map.id, act === 'walkFp');
    else toast('No walker attached — open the editor from the Grounds.');
  }
}

/** The two faults a walk cannot survive; lint()'s everything-else is advice. */
function walkStoppers() {
  const m = E.map;
  const at = (x, y) => (m.grid[Math.floor(y)] || '')[Math.floor(x)];
  const out = [];
  const e = at(m.entry[0], m.entry[1]);
  if (!e || '#BbFrtmo'.includes(e)) out.push(`entry at ${m.entry} stands in '${e || 'void'}' — move the ⚑ flag to open floor`);
  const exits = m.grid.join('').match(/[sdw]/g) || [];
  if (!exits.length && !(m.portals || []).length) out.push('no exit cell (s/d/w) — the walk could never end; paint a Wagon or Doorway');
  return out;
}

/**
 * THE KEYBOARD. Until now this file bound exactly one chord (undo) and every
 * other verb cost a trip to the sidebar — which is most of the difference in
 * feel between this and a level editor somebody builds levels in.
 *
 * The scheme is Wizordum's, because it is a good one and because a person who
 * has used one tile editor should not have to learn a second grammar: the
 * number row picks the MODE, held letters modify the drag, and Shift is
 * always "the destructive version of what this button already does".
 *
 * Held modifiers (X, V, C) are read at pointer-down out of `E.mods`, not
 * bound to actions here — a chord that fires on keydown cannot express "hold
 * this while you drag".
 */
const HOT_TABS = { 1: 'tiles', 2: 'props', 3: 'flags', 4: 'paint', 5: 'map' };
function onKey(e) {
  if (!E || !editorActive()) return;
  // Never eat a keystroke aimed at a field — the Map tab is full of them.
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (HOT_TABS[k]) { E.tab = HOT_TABS[k]; renderSide(); e.preventDefault(); return; }
  if (k === 'x' || k === 'v') { E.mods[k] = true; return; }   // held, read at drag time
  if (k === 'q' || k === 'e') {
    E.rot = (E.rot + (k === 'q' ? 3 : 1)) % 4;
    if (E.view !== 'iso') toast('Rotation turns the 3D view — press ⬒ 3D to see it.');
    fitView(false); e.preventDefault(); return;
  }
  if (k === 'f') { fitView(true); e.preventDefault(); return; }
  if (k === 'g') { E.view = E.view === 'iso' ? 'plan' : 'iso'; syncBar(); fitView(true); e.preventDefault(); return; }
  if (k === 'b') { E.sel = { kind: 'tile', id: '.' }; renderSide(); e.preventDefault(); return; }
  if (k === 'delete' || k === 'backspace') { E.sel = { kind: 'erase' }; renderSide(); e.preventDefault(); return; }
}
function onKeyUp(e) {
  if (!E) return;
  const k = e.key.toLowerCase();
  if (k === 'x' || k === 'v') E.mods[k] = false;
}
/** Anything the toolbar shows that a HOTKEY can also change has to be told. */
function syncBar() {
  const b = document.querySelector('.med-bar [data-act="view3d"]');
  if (b) b.textContent = E.view === 'iso' ? '▦ Plan' : '⬒ 3D';
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
  if (E.view === 'iso') {
    // Invert the dimetric projection on the ground plane: picking answers at
    // level 0, which is where painting happens — the plan view stays the
    // precision instrument, the 3D view is where you SEE what you built.
    const u = (px - isoOX()) / s, v = py / (s * 0.5);
    const vu = (v + u) / 2, vv = (v - u) / 2;
    const [fx, fy] = unrot(vu, vv);
    return { x: Math.floor(fx), y: Math.floor(fy), fx, fy };
  }
  return { x: Math.floor(px / s), y: Math.floor(py / s), fx: px / s, fy: py / s };
}

/** The four bearings of the 3D view: continuous world→view, view→world, and
 *  a direction transform, all of one fact (E.rot, quarter turns clockwise). */
function vrot(x, y) {
  const W = E.map.grid[0].length, H = E.map.grid.length;
  return E.rot === 0 ? [x, y] : E.rot === 1 ? [H - y, x] : E.rot === 2 ? [W - x, H - y] : [y, W - x];
}
function unrot(u, v) {
  const W = E.map.grid[0].length, H = E.map.grid.length;
  return E.rot === 0 ? [u, v] : E.rot === 1 ? [v, H - u] : E.rot === 2 ? [W - u, H - v] : [W - v, u];
}
const vdir = (dx, dy) => (E.rot === 0 ? [dx, dy] : E.rot === 1 ? [-dy, dx] : E.rot === 2 ? [-dx, -dy] : [dy, -dx]);

/** The 3D view's x-offset: the view-space rows set the leftmost point the
 *  dimetric projection produces, so shift by that to stay on-canvas. */
function isoOX() {
  return (E.rot % 2 ? E.map.grid[0].length : E.map.grid.length) * CELL * E.zoom;
}

/**
 * How long a TOUCH gesture must live before it is allowed to edit anything.
 *
 * A pinch lands its second finger 50-80ms after its first. The old code
 * committed the first finger's edit on pointerdown, so by the time the second
 * arrived the tile — or worse, the object — was already placed, and every
 * zoom left litter behind it (playtest 2026-08-07). Deferring costs nothing
 * anyone can feel: a TAP still commits on release, and a deliberate drag
 * commits a tenth of a second in, before the finger has crossed a cell.
 */
const TOUCH_HOLD = 110;

/** A gesture that turned out to be the camera's. Anything the first finger
 *  armed is dropped UNAPPLIED — which is the whole reason touch defers. */
function cancelGesture() {
  if (!E) return;
  E.pending = null;
  E.painting = false; E.paintStart = null;
  E.rectStart = null; E.rectMode = null;
  E.pan = null; E.dragRight = false;
  draw();
}

function onDown(ev) {
  // TWO FINGERS drive the camera on touch — drag pans, pinch zooms at the
  // midpoint. Phones have no middle button, and without this the camera was
  // parked over one corner of the map forever (the second phone playtest).
  E.pts = E.pts || new Map();
  E.pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  // `>= 2`, not `=== 2`: a third finger used to fall straight through this
  // guard and paint.
  if (E.pts.size >= 2) { cancelGesture(); return; }
  if (ev.button === 1) { E.pan = { x: ev.clientX - E.panX, y: ev.clientY - E.panY }; return; }
  const c = cellAt(ev);
  if (c.y < 0 || c.y >= E.map.grid.length || c.x < 0 || c.x >= E.map.grid[0].length) return;
  /**
   * RIGHT-CLICK IS THE EYEDROPPER now, not a floor shortcut.
   *
   * "Right-click paints floor" spent a whole mouse button on a tile that is
   * one click away in the palette; picking up what is already under the
   * cursor is the thing you actually want twenty times a minute, and it is
   * what every tile editor in the world binds here. Deleting moves to
   * Shift+click, which is where Wizordum has it and where the same gesture
   * already meant "the destructive version" everywhere else.
   */
  if (ev.button === 2) { pick(c); draw(); return; }
  // A FINGER PROVES ITSELF FIRST. A mouse cannot grow a second cursor, so it
  // edits immediately and nothing about the desktop feel changes.
  if (ev.pointerType === 'touch') {
    E.pending = { c, shift: ev.shiftKey, t: performance.now() };
    return;
  }
  beginEdit(c, ev.shiftKey);
}

/** Start whatever the armed tool does at this cell. Split out of onDown so a
 *  deferred touch can run the identical path a moment later. */
function beginEdit(c, shift) {
  // The Surfaces tab drags RECTANGLES, not cells: arm the corner here and let
  // onUp commit — one gesture, one undo step.
  if (E.sel.kind === 'paint') { E.paintStart = { x: c.x, y: c.y }; draw(); return; }
  if (shift) {
    snap();
    E.painting = true; E.dragRight = true;
    apply(c, true);
    draw();
    return;
  }
  // A held X or V arms a RECTANGLE instead of a stroke: X draws a room (walls
  // around floor), V fills. Both commit on release as one undo step, the same
  // contract the Surfaces drag has always had.
  if (E.mods.x || E.mods.v) {
    E.rectMode = E.mods.x ? 'room' : 'fill';
    E.rectStart = { x: c.x, y: c.y };
    draw();
    return;
  }
  snap();
  E.painting = true;
  E.dragRight = false;
  apply(c, false);
  draw();
}
function onMove(ev) {
  if (!E) return;
  if (E.pts && E.pts.size >= 2 && E.pts.has(ev.pointerId)) {
    const old = [...E.pts.values()];
    const oMid = { x: (old[0].x + old[1].x) / 2, y: (old[0].y + old[1].y) / 2 };
    const oDist = Math.hypot(old[0].x - old[1].x, old[0].y - old[1].y) || 1;
    E.pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    const now = [...E.pts.values()];
    const nMid = { x: (now[0].x + now[1].x) / 2, y: (now[0].y + now[1].y) / 2 };
    const nDist = Math.hypot(now[0].x - now[1].x, now[0].y - now[1].y) || 1;
    E.panX += nMid.x - oMid.x; E.panY += nMid.y - oMid.y;
    const cv = document.querySelector('.med-canvas');
    const r = cv.getBoundingClientRect();
    zoomTo(E.zoom * (nDist / oDist), nMid.x - r.left, nMid.y - r.top);
    return;
  }
  if (E.pts && E.pts.has(ev.pointerId)) E.pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (E.pan) { E.panX = ev.clientX - E.pan.x; E.panY = ev.clientY - E.pan.y; draw(); return; }
  const c = cellAt(ev);
  const changed = !E.hover || E.hover.x !== c.x || E.hover.y !== c.y;
  E.hover = c;
  // The deferred touch edit lands here, once the gesture has stayed one finger
  // long enough to prove it is not a pinch. It starts at the cell the finger
  // went DOWN on, not this one, so a stroke begins where you touched.
  if (E.pending && performance.now() - E.pending.t > TOUCH_HOLD) {
    const p = E.pending;
    E.pending = null;
    beginEdit(p.c, p.shift);
  }
  // Tiles and water both DRAG — they are the two brushes. Erasing drags too:
  // drying a creek one click at a time is nobody's idea.
  if (E.painting && (E.sel.kind === 'tile' || E.sel.kind === 'water')) { apply(c, E.dragRight); draw(); }
  else if (changed) draw();
}
function onUp(ev) {
  if (!E) return;
  if (ev && E.pts) E.pts.delete(ev.pointerId);
  // A TAP. The finger lifted alone and never stayed long enough to commit on
  // the move — so it was an edit after all, and it runs now. (A pinch never
  // reaches this: its second finger cleared `pending` on the way down.)
  if (E.pending) {
    const p = E.pending;
    E.pending = null;
    beginEdit(p.c, p.shift);
  }
  // The armed Surfaces rect commits on release: snap() THEN push, so the
  // whole drag is one undo step.
  if (E.paintStart) {
    const r = E.sel.kind === 'paint' ? dragRect() : null;
    if (r) { snap(); E.map.paint.push({ ...r, theme: E.sel.id }); }
    E.paintStart = null;
    draw();
  }
  // The armed rectangle commits here, as ONE undo step for the whole gesture.
  if (E.rectStart) {
    const r = dragRect(E.rectStart);
    if (r) {
      snap();
      if (!fillRect(r, E.rectMode)) E.undo.pop();
    }
    E.rectStart = null; E.rectMode = null;
    draw();
  }
  E.painting = false; E.pan = null; E.dragRight = false;
}

/** The live Surfaces drag as a grid rect — normalized and clamped, min 1×1
 *  (the anchor cell is always on the map, so the clamp can never empty it). */
function dragRect(from) {
  const a = from || E.paintStart;
  if (!a) return null;
  const b = E.hover || a;
  const W = E.map.grid[0].length, H = E.map.grid.length;
  const x0 = Math.max(0, Math.min(a.x, b.x)), y0 = Math.max(0, Math.min(a.y, b.y));
  const x1 = Math.min(W - 1, Math.max(a.x, b.x)), y1 = Math.min(H - 1, Math.max(a.y, b.y));
  if (x1 < x0 || y1 < y0) return null;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * THE EYEDROPPER. Arms whatever is already under the cursor — the thing on
 * the cell first (a prop, a spawn, a portal are what you are usually reaching
 * for), then the water, then the ground char itself. Never edits anything, so
 * it takes no undo step.
 */
function pick(c) {
  const { x, y } = c;
  if (y < 0 || y >= E.map.grid.length || x < 0 || x >= E.map.grid[0].length) return;
  const near = (list, fn) => {
    let best = -1, bd = 0.8;
    list.forEach((it, i) => { const d = Math.hypot(fn(it)[0] - c.fx, fn(it)[1] - c.fy); if (d < bd) { bd = d; best = i; } });
    return best;
  };
  let i = near(E.map.props, (p) => [p.x, p.y - 0.4]);
  if (i >= 0) { E.sel = { kind: 'prop', id: E.map.props[i].art }; E.tab = 'props'; renderSide(); return; }
  i = near(E.map.spawns, (s) => [s.x + 0.5, s.y + 0.5]);
  if (i >= 0) { E.prey = E.map.spawns[i].prey; E.sel = { kind: 'flag', id: 'spawn' }; E.tab = 'flags'; renderSide(); return; }
  if ((E.map.water || []).some(([wx, wy]) => wx === x && wy === y)) {
    E.sel = { kind: 'water' }; E.tab = 'tiles'; renderSide(); return;
  }
  const ch = (E.map.grid[y] || '')[x];
  if (TILE_BY_CH[ch]) { E.sel = { kind: 'tile', id: ch }; E.tab = 'tiles'; renderSide(); }
}

/**
 * The armed tile laid over a whole rectangle.
 *
 * `room` is the gesture the drafting table was most obviously missing: a wall
 * ring with floor inside it, in one drag, which is how a building actually
 * gets drawn. It uses the ARMED tile as the wall so the same gesture builds a
 * bookshelf room, a rock chamber or a waist-high pen depending on what is in
 * your hand — and it refuses to make a room out of something that is not a
 * wall, because a ring of ladders is not a room.
 */
function fillRect(r, mode) {
  const wallCh = E.sel.kind === 'tile' ? E.sel.id : 'B';
  if (mode === 'room' && !'Bbo'.includes(wallCh)) {
    toast('A room is drawn with a WALL — arm B, b or an ore vein, then X+drag.');
    return false;
  }
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      if (mode === 'fill') { paintOne(x, y); continue; }
      const edge = x === r.x || y === r.y || x === r.x + r.w - 1 || y === r.y + r.h - 1;
      setCell(x, y, edge ? wallCh : '.');
    }
  }
  return true;
}
/** One cell of a filled rect, routed by what is armed (water is not a tile). */
function paintOne(x, y) {
  if (E.sel.kind === 'water') {
    E.map.water = E.map.water || [];
    if ((E.map.grid[y] || '')[x] === '#') return;
    if (!E.map.water.some(([wx, wy]) => wx === x && wy === y)) E.map.water.push([x, y]);
    return;
  }
  if (E.sel.kind === 'tile') setCell(x, y, E.sel.id);
}

/**
 * One edit, routed by what is armed.
 *
 * `erase` is Shift+click (or a shift-drag) — the RIGHT button is the
 * eyedropper now and never routes here. What erasing means is the armed
 * tool's business: with Water armed it dries the cell, otherwise it takes the
 * ground back to plain floor.
 */
function apply(c, erase) {
  const { x, y } = c;
  if (y < 0 || y >= E.map.grid.length || x < 0 || x >= E.map.grid[0].length) return;
  if (erase) {
    if (E.sel.kind === 'water') {
      const before = (E.map.water || []).length;
      E.map.water = (E.map.water || []).filter(([wx, wy]) => wx !== x || wy !== y);
      if (E.map.water.length === before) E.undo.pop();
      return;
    }
    setCell(x, y, '.');
    return;
  }

  if (E.sel.kind === 'tile') {
    const was = (E.map.grid[y] || '')[x];
    setCell(x, y, E.sel.id);
    // A lock belongs to its door: painting anything else over a locked 'D'
    // takes the latch with the wood (a lock on plain floor is a lint ghost).
    if (was === 'D' && E.sel.id !== 'D' && Array.isArray(E.map.locks)) {
      E.map.locks = E.map.locks.filter(([lx, ly]) => lx !== x || ly !== y);
    }
    // The grid is one char per cell, so painting REPLACES — a vine over the
    // abyss becomes climbable floor, which surprised the first playtest. Say
    // so, and teach the climb grammar (a link serves a level) while at it.
    if (CLIMB_CH[E.sel.id]) {
      // Ask the MODEL, not the chars: a neighbour at any DIFFERENT derived
      // level is height this climb could serve — the chars alone would miss
      // a landing that is itself a climb, a deck, or plain ground the flood
      // has already stepped.
      const model = levelModel();
      const lv = model.floorAt(x, y);
      const stepBeside = [[0, -1], [0, 1], [1, 0], [-1, 0]].some(([dx, dy]) => {
        const nch = (E.map.grid[y + dy] || '')[x + dx];
        if (nch && '^23,'.includes(nch)) return true;
        const nlv = model.floorAt(x + dx, y + dy);
        return nlv != null && nlv !== lv;
      });
      if (was === '#') toast('The abyss has no bottom to climb to — this cell is floor now. For a pit you can hang into, paint a sunken floor \',\' and set the vine on its rim.');
      else if (!stepBeside) toast('A climb links two heights: put a ▲ ledge beside it, or it is just dressed floor.');
    }
    return;
  }

  if (E.sel.kind === 'water') {
    // Painted, not toggled: dragging across a creek must FLOOD it, and a
    // toggle would leave every second cell dry when the drag re-enters one it
    // already crossed. Right-click dries, which is the same grammar the tile
    // tools use for their eraser.
    E.map.water = E.map.water || [];
    const i = E.map.water.findIndex(([wx, wy]) => wx === x && wy === y);
    if (i >= 0) { E.undo.pop(); return; }        // already wet — nothing changed
    if ((E.map.grid[y] || '')[x] === '#') {
      toast('The void has no bed to hold water — cut floor there first.');
      E.undo.pop(); return;
    }
    E.map.water.push([x, y]);
    return;
  }

  if (E.sel.kind === 'vert') {
    // Sculpting: one step along the ground ladder per click. Anything that
    // is not GROUND (walls, doors, climbs, decks) refuses rather than being
    // silently overwritten — the verbs shape terrain, tiles place things.
    const seq = [',', '.', '^', '2', '3', '4', '5', '6'];
    const ch = (E.map.grid[y] || '')[x];
    const i = seq.indexOf(ch);
    if (i < 0) { toast('Raise and lower sculpt open ground — floors, ledges, terraces, pits.'); E.undo.pop(); return; }
    const ni = Math.max(0, Math.min(seq.length - 1, i + E.sel.dir));
    if (ni === i) { E.undo.pop(); return; }
    setCell(x, y, seq[ni]);
    return;
  }

  if (E.sel.kind === 'paintErase') {
    // Topmost wins — the rect painted later lies over the earlier one.
    for (let i = E.map.paint.length - 1; i >= 0; i--) {
      const r = E.map.paint[i];
      if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) { E.map.paint.splice(i, 1); return; }
    }
    E.undo.pop();   // nothing under the click — drop the pre-armed snapshot
    return;
  }

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
    // Water lies OVER the cell, so it is the last thing on it and the first
    // thing off it: the eraser dries before it razes the ground underneath.
    if ((E.map.water || []).some(([wx, wy]) => wx === x && wy === y)) {
      E.map.water = E.map.water.filter(([wx, wy]) => wx !== x || wy !== y);
      return;
    }
    setCell(x, y, '.');
    return;
  }

  if (E.sel.kind === 'prop') {
    const art = E.sel.id, vol = PROP_VOL[art];
    const w = lawfulWidth(art);
    if (!vol || w == null) return;
    // FORGE'S FREEDOM, kept tidy: the anchor is where you actually clicked,
    // snapped to quarter-tiles — the abacus goes mid-cell, the ledgers go ON
    // the desk. A fractional y is a literal placement in every lens (propCell
    // only re-reads INTEGER anchors as foot lines), so what you place is what
    // both cameras draw.
    const q4 = (v, max) => Math.min(Math.max(Math.round(v * 4) / 4, 0.25), max - 0.25);
    const ax = q4(c.fx, E.map.grid[0].length);
    const ay = q4(c.fy, E.map.grid.length);
    if (vol.form === 'wall') {
      // Hung a hair proud of the cell's north edge — the charts' convention
      // (y ~ row + 0.02); wallSolid finds the actual stone from the map.
      E.map.props.push({ art, x: ax, y: y + 0.02, w });
      return;
    }
    // A small thing dropped on a bigger thing's footprint RESTS on it (the
    // walk's own restOn rule) — no 'f', it blocks nothing. On open ground,
    // furniture still needs floor: on a wall it would be entombed, on a ledge
    // it would block nothing, and ONE COLLISION FACT refuses both.
    const resting = restsOn(ax, ay, art);
    const cx = Math.floor(ax), cyRow = Number.isInteger(ay) ? ay - 1 : Math.floor(ay);
    const under = (E.map.grid[cyRow] || '')[cx];
    if (!resting && under !== '.' && under !== 'f') {
      // '^23,Sun' spells the seven level chars: honest ground to WALK, but
      // the prop chart has no height slot yet — a desk on a bridge would
      // draw at level 0 in every lens and lie in all of them.
      toast('^23,Sun'.includes(under)
        ? 'Furniture keeps to ground level for now — terraces and decks cannot take a piece yet.'
        : 'Furniture needs a floor cell — or a bigger piece to rest on.');
      return;
    }
    const fOwn = !resting && under === '.' ? 1 : undefined;
    E.map.props.push({ art, x: ax, y: ay, w, ...(fOwn ? { fOwn } : {}) });
    if (fOwn) setCell(cx, cyRow, 'f');
    return;
  }

  if (E.sel.kind === 'flag') {
    if (E.sel.id === 'lock') {
      if ((E.map.grid[y] || '')[x] !== 'D') { toast('Locks belong on doors — paint a D first.'); E.undo.pop(); return; }
      E.map.locks = E.map.locks || [];
      const i = E.map.locks.findIndex(([lx, ly]) => lx === x && ly === y);
      if (i >= 0) { E.map.locks.splice(i, 1); toast('Unlocked.'); }
      else { E.map.locks.push([x, y]); toast('Locked — this door will spend a key.'); }
      return;
    }
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

/** Darken/lighten a colour by factor f (1 = unchanged). Accepts #rrggbb AND
 *  its own rgb() output, so a shade of a shade stays a colour — feeding one
 *  back through a hex-only parser was how every terrace face went black. */
function shade(col, f) {
  let r, gc, b2;
  if (col[0] === '#') {
    const n = parseInt(col.slice(1), 16);
    r = n >> 16; gc = (n >> 8) & 255; b2 = n & 255;
  } else {
    [r, gc, b2] = (col.match(/\d+/g) || [0, 0, 0]).map(Number);
  }
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c(r)},${c(gc)},${c(b2)})`;
}

/**
 * THE 3D VIEW — the same draft, stood up. A dimetric extrusion of the level
 * model: floors at their level, walls and doors as prisms, decks as hovering
 * slabs, stairs as steps, props as their real art standing at their feet and
 * wall-hung pieces raised to the height they hang at. Everything is drawn
 * from the SAME model the lenses walk (ONE RULES FACT — this is a camera,
 * not a second opinion), painted back-to-front along the x+y diagonals.
 * Props and flags come in a second pass ON TOP by design: an author must
 * never lose sight of a thing they placed behind a wall.
 */
function drawIso(g, s, m, model, themeFloor, wtile, wet) {
  const W = m.grid[0].length, H = m.grid.length;
  /**
   * The water's fill, as a repeating pattern scaled to the current zoom.
   *
   * A pattern is laid in CANVAS space, so on the dimetric diamonds it is not
   * projected — the waves run flat across the screen rather than with the
   * ground. For water that is the right trade and not a compromise: the
   * texture is amorphous, there is no grid in it to look wrong, and the
   * alternative (a per-cell transformed drawImage inside a clipped diamond)
   * costs a clip per tile for a difference nobody can name. The FACES still
   * take a flat colour, because `shade()` needs one.
   */
  let waterPat = null;
  if (wtile) {
    try {
      waterPat = g.createPattern(wtile, 'repeat');
      if (waterPat && waterPat.setTransform) waterPat.setTransform(new DOMMatrix().scale(s / 48));
    } catch (e) { waterPat = null; }   // no DOMMatrix here — the tint still reads
  }
  const ox = isoOX(), ZH = s * 0.5;
  const P = (x, y, z) => [(x - y) * s + ox, (x + y) * s * 0.5 - (z || 0) * ZH];
  const quad = (a, b2, c, d, fill) => {
    g.fillStyle = fill;
    g.beginPath();
    g.moveTo(a[0], a[1]); g.lineTo(b2[0], b2[1]); g.lineTo(c[0], c[1]); g.lineTo(d[0], d[1]);
    g.closePath(); g.fill();
  };
  const top = (x, y, z, fill) => quad(P(x, y, z), P(x + 1, y, z), P(x + 1, y + 1, z), P(x, y + 1, z), fill);
  // The two faces the camera sees: south-west (the y+1 edge) and south-east
  // (the x+1 edge), each shaded so the prism reads as a solid.
  const faceSW = (x, y, zTop, zBot, fill) =>
    quad(P(x, y + 1, zTop), P(x + 1, y + 1, zTop), P(x + 1, y + 1, zBot), P(x, y + 1, zBot), fill);
  const faceSE = (x, y, zTop, zBot, fill) =>
    quad(P(x + 1, y, zTop), P(x + 1, y + 1, zTop), P(x + 1, y + 1, zBot), P(x + 1, y, zBot), fill);
  const WALL_LV = { B: 2, F: 2, D: 2, o: 2, b: 1 };
  const paintAt = (x, y) => {
    for (let i = (m.paint || []).length - 1; i >= 0; i--) {
      const r = m.paint[i];
      if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return themeTint(r.theme);
    }
    return null;
  };
  const lockAt = (x, y) => (m.locks || []).some(([lx, ly]) => lx === x && ly === y);
  const floorOf = (x, y) => {
    const f = model.floorAt(x, y);
    return f == null ? null : f;
  };

  // ── Terrain, back to front along the VIEW's diagonals ────────────────────
  // The camera turns by quarter steps (E.rot): the loop walks VIEW cells so
  // the painter's order is always toward the eye, and each view cell asks the
  // WORLD (grid + model) through the rotation. Faces still shade by which way
  // they look in the view, so a turned map lights like a turned model.
  const VW = E.rot % 2 ? H : W, VH = E.rot % 2 ? W : H;
  const wcell = (u, v) => E.rot === 0 ? [u, v] : E.rot === 1 ? [v, H - 1 - u]
    : E.rot === 2 ? [W - 1 - u, H - 1 - v] : [W - 1 - v, u];
  const chAt = (x2, y2) => (x2 < 0 || y2 < 0 || x2 >= W || y2 >= H) ? '#' : m.grid[y2][x2];
  for (let d = 0; d <= VW + VH - 2; d++) {
    for (let v = Math.max(0, d - VW + 1); v <= Math.min(VH - 1, d); v++) {
      const u = d - v;
      if (u < 0 || u >= VW) continue;
      const [x, y] = wcell(u, v);
      const ch = m.grid[y][x];
      if (ch === '#') continue;                       // the void draws nothing
      const t = TILE_BY_CH[ch];
      const lv = floorOf(x, y);
      const base = lv == null ? 0 : lv;
      let fill = paintAt(x, y) || (ch === '.' || ch === 'f' || lv != null ? themeFloor : (t ? t.color : '#a03a72'));
      // Height keeps the plan's reading: brighter per step up, darker sunken.
      if (lv != null && lv !== 0) fill = shade(paintAt(x, y) || themeFloor, 1 + 0.14 * lv);
      // Water outranks paint and the level wash alike — it is not a floor tile
      // and not a height, it is what is lying on top of one.
      const isWet = wet.has(x + ',' + y);
      if (isWet) fill = WATER_TINT;
      // The view-south and view-east neighbours — whatever they are in world.
      const [sx2, sy2] = wcell(u, v + 1), [ex2, ey2] = wcell(u + 1, v);
      // The ground itself (walls stand on plane 0 and skip it).
      if (!WALL_LV[ch] || ch === 'D' || ch === 'o') {
        top(u, v, base, isWet && waterPat ? waterPat : fill);
        const sf = floorOf(sx2, sy2), ef = floorOf(ex2, ey2);
        const sDrop = chAt(sx2, sy2) === '#' ? base - 1 : sf;
        const eDrop = chAt(ex2, ey2) === '#' ? base - 1 : ef;
        if (sDrop != null && sDrop < base) faceSW(u, v, base, sDrop, shade(fill, 0.62));
        if (eDrop != null && eDrop < base) faceSE(u, v, base, eDrop, shade(fill, 0.5));
      }
      // Standing masonry: walls, veins, doors, waist blocks — real prisms.
      if (WALL_LV[ch]) {
        const b0 = (ch === 'D' || ch === 'o') ? base : 0;
        const zTop = b0 + WALL_LV[ch];
        const wf = ch === 'D' ? '#6a4a2a' : (t ? t.color : '#888');
        top(u, v, zTop, shade(wf, 1.12));
        faceSW(u, v, zTop, b0, shade(wf, 0.72));
        faceSE(u, v, zTop, b0, shade(wf, 0.55));
        if (ch === 'D' && lockAt(x, y)) {              // the keyhole plate
          const [kx, ky] = P(u + 0.55, v + 1, b0 + 1);
          g.fillStyle = '#d8a83c'; g.fillRect(kx - s * 0.08, ky - s * 0.12, s * 0.16, s * 0.22);
          g.fillStyle = '#1c202a'; g.beginPath(); g.arc(kx, ky - s * 0.04, s * 0.035, 0, 7); g.fill();
        }
      }
      // Stairs: four rising treads toward the level they serve.
      if (model.stairAt(x, y)) {
        const dir = [[0, -1], [0, 1], [-1, 0], [1, 0]].find(([dx2, dy2]) =>
          model.surfacesAt(x + dx2, y + dy2).includes(base + 1));
        const dv2 = dir ? vdir(dir[0], dir[1]) : [0, 0];
        for (let i = 0; i < 4; i++) {
          const f2 = (i + 0.5) / 4 - 0.5;
          top(u + dv2[0] * f2 + 0.125, v + dv2[1] * f2 + 0.125, base + (i + 1) / 4, shade(themeFloor, 1.05 + i * 0.06));
        }
      }
      // A deck hovers at its own level, its slab faces hanging beneath.
      const dk = model.deckAt(x, y);
      if (dk != null) {
        const dfill = ch === 'n' ? '#8a6a42' : shade(themeFloor, 1.2);
        top(u, v, dk, dfill);
        faceSW(u, v, dk, dk - 0.3, shade(dfill, 0.62));
        faceSE(u, v, dk, dk - 0.3, shade(dfill, 0.5));
      }
      // Climbs keep their glyph, planted on the ground they derive.
      if (t && t.glyph && !WALL_LV[ch]) {
        const [gx2, gy2] = P(u + 0.5, v + 0.5, base);
        g.fillStyle = 'rgba(255,255,255,.8)';
        g.font = `${Math.round(s * 0.42)}px serif`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(t.glyph, gx2, gy2);
      }
    }
  }

  // ── Props: the real art, standing up — wall pieces at hanging height ─────
  const redraw = () => E && draw();
  const vsum = (p) => { const [u2, v2] = vrot(p.x, Number.isInteger(p.y) ? p.y - 0.5 : p.y); return u2 + v2; };
  for (const p of [...m.props].sort((a, b) => vsum(a) - vsum(b))) {
    const a = ART[p.art];
    const got = a && sheetFor(p.art, redraw);
    const vol = PROP_VOL[p.art];
    const cy = Number.isInteger(p.y) ? p.y - 0.5 : p.y;
    const lvP = floorOf(Math.floor(p.x), Math.floor(cy)) || 0;
    const wPx = ((p.w || 48) / 48) * s;
    const hPx = a ? wPx * (a.h / a.w) : wPx;
    // A hung piece rises to the height it hangs at, with a stem to its wall.
    const hang = vol && vol.form === 'wall' ? (vol.mid || 1) * s : 0;
    const [fx2, fy2] = P(...vrot(p.x, cy), lvP);
    const x0 = fx2 - wPx / 2, y0 = fy2 - hPx - hang;
    if (hang) {
      g.strokeStyle = 'rgba(255,255,255,.35)';
      g.beginPath(); g.moveTo(fx2, fy2); g.lineTo(fx2, y0 + hPx); g.stroke();
    } else {
      // A CONTACT SHADOW pins the sprite to its tile. The art is a billboard
      // — in every lens it faces the camera, Hexen's own grammar — so over
      // the diagonal ground it read as "placed at an angle" until the ground
      // itself said where it stands.
      g.fillStyle = 'rgba(0,0,0,.38)';
      g.beginPath();
      g.ellipse(fx2, fy2 - s * 0.02, Math.max(s * 0.2, wPx * 0.42), s * 0.15, 0, 0, 7);
      g.fill();
    }
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

  // ── Flags, planted at their ground ───────────────────────────────────────
  g.font = `${Math.round(s * 0.55)}px serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const sp of m.spawns || []) {
    const [cx2, cy2] = P(...vrot(sp.x + 0.5, sp.y + 0.5), floorOf(sp.x, sp.y) || 0);
    g.fillStyle = 'rgba(200,60,60,.85)';
    g.beginPath(); g.arc(cx2, cy2, s * 0.26, 0, 7); g.fill();
    g.fillStyle = '#fff';
    g.fillText((PREY[sp.prey] && PREY[sp.prey].name ? PREY[sp.prey].name : sp.prey)[0].toUpperCase(), cx2, cy2);
  }
  for (const p of m.portals || []) {
    const [cx2, cy2] = P(...vrot(p.x, p.y), 0);
    g.fillStyle = 'rgba(90,140,255,.9)';
    g.fillText('◈', cx2, cy2);
  }
  {
    const [ex2, ey2] = P(...vrot(m.entry[0], m.entry[1]), 0);
    g.fillStyle = '#ffd76b';
    g.fillText('⚑', ex2, ey2);
  }

  // Hover: the picked ground diamond, turned with the view.
  if (E.hover && E.hover.x >= 0 && E.hover.y >= 0 && E.hover.y < H && E.hover.x < W) {
    const hb = floorOf(E.hover.x, E.hover.y) || 0;
    g.strokeStyle = 'rgba(255,215,107,.9)';
    g.lineWidth = 2;
    const c00 = vrot(E.hover.x, E.hover.y), c10 = vrot(E.hover.x + 1, E.hover.y),
      c11 = vrot(E.hover.x + 1, E.hover.y + 1), c01 = vrot(E.hover.x, E.hover.y + 1);
    const pts = [P(...c00, hb), P(...c10, hb), P(...c11, hb), P(...c01, hb)];
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (const pt of pts.slice(1)) g.lineTo(pt[0], pt[1]);
    g.closePath(); g.stroke();
  }
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
  const model = levelModel();
  const themeFloor = themeTint(m.theme);
  ensureWater();
  refreshStatus();
  const wtile = waterTile();
  const wet = wetNow();

  if (E.view === 'iso') { drawIso(g, s, m, model, themeFloor, wtile, wet); return; }

  for (let y = 0; y < m.grid.length; y++) {
    for (let x = 0; x < m.grid[y].length; x++) {
      const ch = m.grid[y][x];
      const t = TILE_BY_CH[ch];
      g.fillStyle = ch === '.' || ch === 'f' ? themeFloor : (t ? t.color : '#a03a72');
      g.fillRect(x * s, y * s, s, s);
      // Water draws as WATER, at the frame the table is showing — the plan is
      // where a lake's shape is actually authored, and a flat blue rectangle
      // tells you nothing about whether it reads as water in the walk. It goes
      // OVER the tile's own swatch because that is what it does in the world:
      // a wet ',' is still a creek bed, with water in it.
      if (wet.has(x + ',' + y)) {
        if (wtile) g.drawImage(wtile, x * s, y * s, s, s);
        else { g.fillStyle = WATER_TINT; g.fillRect(x * s, y * s, s, s); }
      }
      // Level shading from the MODEL, not the chars: a terrace lightens per
      // step, a pit darkens, and a climb shades at the ground it DERIVED —
      // so the plan reads height exactly the way the lenses will walk it.
      const lv = model.floorAt(x, y);
      if (lv != null && lv !== 0) {
        g.fillStyle = lv > 0 ? `rgba(255,255,255,${Math.min(0.4, 0.12 * lv)})` : 'rgba(0,0,0,.35)';
        g.fillRect(x * s, y * s, s, s);
      }
      // A deck cell is TWO surfaces: the ground shading above stays honest,
      // and a band across the middle is the deck you also stand on — planks
      // for a bridge, the terrace top for a tunnel's bored-through rock.
      if (model.deckAt(x, y) != null) {
        g.fillStyle = ch === 'u' ? TILE_BY_CH['2'].color : TILE_BY_CH['n'].color;
        g.fillRect(x * s, y * s + s * 0.2, s, s * 0.6);
      }
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

  // Ground-fill paint (the charts' `paint` rects): a translucent wash of the
  // theme's tint, dashed so it reads as dressing over the plan, named at the
  // corner so the author knows which ground the lenses will lay there.
  for (const r of m.paint || []) {
    const tint = themeTint(r.theme);
    g.globalAlpha = 0.25;
    g.fillStyle = tint;
    g.fillRect(r.x * s, r.y * s, r.w * s, r.h * s);
    g.globalAlpha = 1;
    g.strokeStyle = tint;
    g.lineWidth = 1;
    g.setLineDash([4, 3]);
    g.strokeRect(r.x * s + 0.5, r.y * s + 0.5, r.w * s - 1, r.h * s - 1);
    g.setLineDash([]);
    g.fillStyle = 'rgba(255,255,255,.75)';
    g.font = `${Math.max(9, Math.round(s * 0.32))}px serif`;
    g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillText(FLOOR_DESC[r.theme] || r.theme + ' floor', r.x * s + 3, r.y * s + 3);
  }

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
  // Locks: a gold plate with a keyhole over the door that wears one.
  for (const [lx, ly] of m.locks || []) {
    g.fillStyle = '#d8a83c';
    g.fillRect(lx * s + s * 0.32, ly * s + s * 0.3, s * 0.36, s * 0.4);
    g.fillStyle = '#1c202a';
    g.beginPath(); g.arc((lx + 0.5) * s, (ly + 0.44) * s, s * 0.07, 0, 7); g.fill();
    g.fillRect((lx + 0.47) * s, (ly + 0.44) * s, s * 0.06, s * 0.18);
  }
  g.fillStyle = '#ffd76b';
  g.fillText('⚑', m.entry[0] * s, m.entry[1] * s);

  // Hover cell cursor.
  if (E.hover && E.hover.x >= 0 && E.hover.y >= 0 && E.hover.y < m.grid.length && E.hover.x < m.grid[0].length) {
    g.strokeStyle = 'rgba(255,215,107,.9)';
    g.lineWidth = 2;
    g.strokeRect(E.hover.x * s + 1, E.hover.y * s + 1, s - 2, s - 2);
  }

  // The live Surfaces drag: the rect that will commit on release.
  const pr = E.sel.kind === 'paint' ? dragRect() : null;
  if (pr) {
    g.strokeStyle = themeTint(E.sel.id);
    g.lineWidth = 2;
    g.setLineDash([5, 4]);
    g.strokeRect(pr.x * s + 1, pr.y * s + 1, pr.w * s - 2, pr.h * s - 2);
    g.setLineDash([]);
  }
  // The live X/V rectangle. Drawn as what it will BECOME — a room shows its
  // wall ring, a fill shows its body — so the gesture is legible before you
  // let go of it rather than after.
  const rr = E.rectStart ? dragRect(E.rectStart) : null;
  if (rr) {
    const tint = E.sel.kind === 'water' ? WATER_TINT
      : (E.sel.kind === 'tile' && TILE_BY_CH[E.sel.id] ? TILE_BY_CH[E.sel.id].color : '#ffd76b');
    g.globalAlpha = 0.45;
    g.fillStyle = tint;
    if (E.rectMode === 'room') {
      g.fillRect(rr.x * s, rr.y * s, rr.w * s, s);
      g.fillRect(rr.x * s, (rr.y + rr.h - 1) * s, rr.w * s, s);
      g.fillRect(rr.x * s, rr.y * s, s, rr.h * s);
      g.fillRect((rr.x + rr.w - 1) * s, rr.y * s, s, rr.h * s);
    } else {
      g.fillRect(rr.x * s, rr.y * s, rr.w * s, rr.h * s);
    }
    g.globalAlpha = 1;
    g.strokeStyle = '#ffd76b';
    g.lineWidth = 2;
    g.strokeRect(rr.x * s + 1, rr.y * s + 1, rr.w * s - 2, rr.h * s - 2);
  }
}
