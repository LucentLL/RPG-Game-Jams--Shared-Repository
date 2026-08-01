/**
 * @file The campus — one layout, two views.
 *
 * The grounds used to be a frozen module constant: an IIFE in delve-maps.js that
 * ran once at import and baked nine buildings into a 28×46 grid forever. That is
 * fine while nobody can move anything, and impossible the moment they can — a
 * Build tab editing its own copy of the layout would drift from the map you
 * actually walk within one session.
 *
 * So the layout is DATA now, on `guild.campus`, and `buildCampusMap()` is the one
 * derivation that turns it into the `{id, theme, name, grid, entry, buildings,
 * props}` shape delve.js already consumes. The walkable Grounds and the Build tab
 * both call it, on the same array, so they cannot disagree.
 *
 * What is SAVED is deliberately minimal — `{kind, x, base}` per building. Width,
 * footprint, threshold cell and depth stay DERIVED, which preserves the original
 * invariant that "a door can never drift off its own doorway" even while the
 * player is dragging buildings around.
 */
import { ART } from './art.js';
// Circular by design: delve-maps.js asks us for the estate, and we ask it for the
// ROOMS to build the estate out of. Safe because neither side dereferences the
// other at module-evaluation time — the rooms are only read inside a call.
import { DELVE_MAPS } from './delve-maps.js';

/** Grid size. The walkable interior is x 2..W-3, y 1..H-2. */
export const CAMPUS_W = 46, CAMPUS_H = 46;

/**
 * What can stand on the grounds. `to` is the interior map a door leads into
 * (null = an outbuilding with no inside yet). `px` is the facade's render width,
 * from which the tile footprint is derived; `frac` is where the door falls
 * across that width. Every `art` key must exist in art.js ART.
 */
export const BUILDING_KINDS = {
  guildhall:  { name: 'Great Hall', art: 'bldgGuildhall',  px: 240, frac: 0.50, to: 'guildhall',  glyph: '', cost: 0, core: true },
  library:    { name: 'Library',    art: 'bldgLibrary',    px: 238, frac: 0.50, to: 'library',    glyph: '', cost: 0, core: true },
  academy:    { name: 'Academy',    art: 'bldgAcademy',    px: 238, frac: 0.50, to: 'classroom',  glyph: '', cost: 0, core: true },
  forge:      { name: 'Forge',      art: 'bldgForge',      px: 285, frac: 0.45, to: 'forge',      glyph: '', cost: 0, core: true },
  kitchen:    { name: 'Kitchen',    art: 'bldgKitchen',    px: 285, frac: 0.45, to: 'kitchen',    glyph: '', cost: 0, core: true },
  armory:     { name: 'Armory',     art: 'bldgArmory',     px: 288, frac: 0.27, to: 'armory',     glyph: '†', cost: 0, core: true },
  dormitory:  { name: 'Dormitory',  art: 'bldgDormitory',  px: 267, frac: 0.50, to: 'dormitory',  glyph: '', cost: 0, core: true },
  apothecary: { name: 'Apothecary', art: 'bldgApothecary', px: 144, frac: 0.50, to: 'apothecary', glyph: '', cost: 0, core: true },
  arena:      { name: 'Arena',      art: 'bldgArena',      px: 228, frac: 0.50, to: 'arena',      glyph: '⚔', cost: 0, core: true },
  // Annexes: more of an existing facade, buildable and demolishable. They have no
  // interior of their own — an outbuilding, not a second Forge you can walk into.
  storehouse: { name: 'Storehouse', art: 'bldgKitchen',    px: 285, frac: 0.45, to: null, glyph: '', cost: 900 },
  bunkhouse:  { name: 'Bunkhouse',  art: 'bldgDormitory',  px: 267, frac: 0.50, to: null, glyph: '', cost: 1200 },
  watchtower: { name: 'Watchtower', art: 'bldgLibrary',    px: 238, frac: 0.50, to: null, glyph: '', cost: 1500 },
};

/** Free-standing dressing you can place and clear. `w` is render px. */
export const PROP_KINDS = {
  lampPost:   { name: 'Lamp Post',      art: 'lampPost',   w: 58,  glyph: '', cost: 60 },
  statue:     { name: 'Statue',         art: 'statue',     w: 90,  glyph: '', cost: 400 },
  trainDummy: { name: 'Training Dummy', art: 'trainDummy', w: 50,  glyph: '◎', cost: 120 },
  well:       { name: 'Well',           art: 'well',       w: 96,  glyph: '', cost: 250 },
  stall:      { name: 'Market Stall',   art: 'stall',      w: 84,  glyph: '', cost: 180 },
  treeTall:   { name: 'Tree',           art: 'treeTall',   w: 96,  glyph: '', cost: 40 },
};

/**
 * A building's ROOM — its interior map with the void margin stripped off, which
 * is the shape that actually gets stamped into the estate.
 *
 * This is what makes the outside world visible from inside one: the room is not
 * a separate scene reached through a door, it is a piece of THIS plane with its
 * own floor and walls, and the facade standing over it is a standee like any
 * other. Step under the facade and the occluder rule fades it, which is the
 * cutaway — the town is still there because you never left it.
 *
 * Cached: the interior grids are module constants.
 */
const _roomCache = {};
export function roomOf(kind) {
  const to = (BUILDING_KINDS[kind] || {}).to;
  if (!to) return null;
  if (_roomCache[to] !== undefined) return _roomCache[to];
  const m = DELVE_MAPS[to];
  if (!m) return (_roomCache[to] = null);
  const rows = m.grid.slice(1, -1).map((r) => r.slice(1, -1));
  return (_roomCache[to] = {
    id: to, theme: m.theme, rows, w: rows[0].length, h: rows.length,
    props: m.props || [], portals: m.portals || [],
  });
}

/** Footprint width in tiles — the room's, or the facade's for a roomless annex. */
export const kindWidth = (kind) => {
  const r = roomOf(kind);
  return r ? r.w : Math.max(1, Math.round((BUILDING_KINDS[kind] || {}).px / 48) || 1);
};
/** Footprint depth in tiles. A room is as deep as it is; an annex is two rows. */
export const kindHeight = (kind) => (roomOf(kind) ? roomOf(kind).h : 2);
/** Kept for callers that still speak of a flat two-row footprint (annexes). */
export const FOOTPRINT_H = 2;

/** The default layout — what the grounds looked like before anyone could edit it. */
function defaultCampus() {
  return {
    // Three rows of buildings with lanes between them. Every `base` is the row
    // just SOUTH of the room, so a room occupies base-h .. base-1 and its
    // doorway is always on base-1 — the same convention the two-row footprint
    // used, which is why moving a building still only saves {kind, x, base}.
    buildings: [
      { id: 'b_library', kind: 'library', x: 3, base: 11 },
      { id: 'b_hall', kind: 'guildhall', x: 13, base: 11 },
      { id: 'b_kitchen', kind: 'kitchen', x: 23, base: 11 },
      { id: 'b_forge', kind: 'forge', x: 3, base: 23 },
      { id: 'b_academy', kind: 'academy', x: 15, base: 23 },
      { id: 'b_armory', kind: 'armory', x: 25, base: 23 },
      { id: 'b_dorm', kind: 'dormitory', x: 3, base: 36 },
      { id: 'b_apoth', kind: 'apothecary', x: 15, base: 36 },
      { id: 'b_arena', kind: 'arena', x: 25, base: 36 },
    ],
    // Trees are TERRAIN, not scenery: they live in the grid as 't' cells, which
    // already block the shallow slice their art rests on. That is what makes
    // clearing one a real spatial act rather than deleting a decal. They stand
    // in the open ground east of the buildings and along the bottom lane.
    trees: [[34, 4], [37, 7], [41, 5], [35, 9], [40, 9], [6, 40], [13, 42], [21, 40], [34, 42], [43, 30]],
    props: [
      { id: 'p_statue', kind: 'statue', x: 13.5, y: 14 },
      { id: 'p_lamp1', kind: 'lampPost', x: 9.5, y: 14 }, { id: 'p_lamp2', kind: 'lampPost', x: 21.5, y: 14 },
      { id: 'p_lamp3', kind: 'lampPost', x: 9.5, y: 26 }, { id: 'p_lamp4', kind: 'lampPost', x: 21.5, y: 26 },
      { id: 'p_dummy1', kind: 'trainDummy', x: 22.5, y: 33 }, { id: 'p_dummy2', kind: 'trainDummy', x: 23.5, y: 34 },
    ],
  };
}

let _seq = 0;
const nid = (p) => p + Math.random().toString(36).slice(2, 7) + (++_seq).toString(36);

/**
 * Create or repair `guild.campus`. Idempotent, and deliberately
 * REFERENCE-STABLE: it repairs entries IN PLACE rather than rebuilding them.
 *
 * That matters more than it looks. This runs from inside canPlace(), so a
 * mutation like moveBuilding — which finds a building, then calls canPlace, then
 * writes to what it found — would otherwise be writing to an object that the
 * second ensureCampus had already thrown away. It reported success and changed
 * nothing. Repair in place and the reference stays live.
 */
export function ensureCampus(guild) {
  const c = guild.campus;
  if (!c || !Array.isArray(c.buildings) || !c.buildings.length) { guild.campus = defaultCampus(); return guild.campus; }
  // Splice out anything unusable, then normalise the survivors in place.
  for (let i = c.buildings.length - 1; i >= 0; i--) {
    const b = c.buildings[i];
    if (!b || !BUILDING_KINDS[b.kind]) { c.buildings.splice(i, 1); continue; }
    if (!b.id) b.id = nid('b_');
    b.x |= 0; b.base |= 0;
  }
  if (!Array.isArray(c.trees)) c.trees = [];
  else for (let i = c.trees.length - 1; i >= 0; i--) {
    const t = c.trees[i];
    if (!Array.isArray(t) || t.length !== 2) { c.trees.splice(i, 1); continue; }
    t[0] |= 0; t[1] |= 0;
  }
  if (!Array.isArray(c.props)) c.props = [];
  else for (let i = c.props.length - 1; i >= 0; i--) {
    const p = c.props[i];
    if (!p || !PROP_KINDS[p.kind]) { c.props.splice(i, 1); continue; }
    if (!p.id) p.id = nid('p_');
    p.x = +p.x; p.y = +p.y;
  }
  return c;
}

/** The tiles a building at (x, base) would occupy. */
export function footprintOf(kind, x, base) {
  const w = kindWidth(kind), h = kindHeight(kind);
  const cells = [];
  for (let y = base - h; y < base; y++) for (let cx = x; cx < x + w; cx++) cells.push([cx, y]);
  return cells;
}

/**
 * May a building of `kind` sit at (x, base)? Checks the walls, the gate lane, and
 * every other building's footprint — `ignoreId` lets a building test its own move.
 * @returns {{ok:boolean, why?:string}}
 */
export function canPlace(guild, kind, x, base, ignoreId) {
  const c = ensureCampus(guild);
  const w = kindWidth(kind);
  if (x < 2 || x + w > CAMPUS_W - 2) return { ok: false, why: 'past the estate wall' };
  if (base - kindHeight(kind) < 1 || base > CAMPUS_H - 3) return { ok: false, why: 'past the estate wall' };
  const taken = new Set();
  for (const b of c.buildings) {
    if (b.id === ignoreId) continue;
    for (const [cx, cy] of footprintOf(b.kind, b.x, b.base)) taken.add(cx + ',' + cy);
    // Keep the row in front of a door clear, or its threshold is unreachable.
    const d = doorOf(b);
    taken.add(d[0] + ',' + (d[1] + 1));
  }
  for (const [cx, cy] of footprintOf(kind, x, base)) {
    if (taken.has(cx + ',' + cy)) return { ok: false, why: 'that ground is taken' };
  }
  // The gate lane must stay walkable or the player can be sealed out of the map.
  // Same door logic as doorOf — the frac formula it used disagreed with the
  // room's own 'd' (armory: frac says col x+2, the wall says x+3), so a plot
  // could pass this check while its REAL door and threshold sat on the lane.
  const dx = doorOf({ kind, x, base })[0];
  if (dx === 13 && base >= CAMPUS_H - 5) return { ok: false, why: 'that blocks the gate' };
  return { ok: true };
}

/** Where a building's door falls: [x, y]. A room says so itself — the 'd' in its
 *  own south wall — so the threshold can never drift off the doorway. */
export function doorOf(b) {
  const room = roomOf(b.kind);
  if (room) {
    const dx = room.rows[room.h - 1].indexOf('d');
    return [b.x + (dx < 0 ? Math.floor(room.w / 2) : dx), b.base - 1];
  }
  const k = BUILDING_KINDS[b.kind];
  const w = kindWidth(b.kind);
  return [b.x + Math.min(w - 1, Math.floor(w * k.frac)), b.base - 1];
}

/**
 * The layout as a delve map. This IS the grounds — `mapForLocale('campus')`
 * returns it, and the Build tab reads the same result, so the plan you edit and
 * the ground you walk are one object.
 */
export function buildCampusMap(guild) {
  const c = ensureCampus(guild);
  const g = Array.from({ length: CAMPUS_H }, () => Array(CAMPUS_W).fill('.'));
  for (let y = 0; y < CAMPUS_H; y++) {
    for (let x = 0; x < CAMPUS_W; x++) if (x < 2 || x >= CAMPUS_W - 2 || y < 1 || y >= CAMPUS_H - 1) g[y][x] = '#';
  }
  // Trees first, so a building placed over one simply covers it.
  for (const [tx, ty] of c.trees) if (g[ty] && g[ty][tx] === '.') g[ty][tx] = 't';

  const regions = [], stairs = [], roomProps = [];
  const buildings = c.buildings.map((b) => {
    const k = BUILDING_KINDS[b.kind];
    const w = kindWidth(b.kind), h = kindHeight(b.kind);
    const top = b.base - h;
    const room = roomOf(b.kind);
    if (room) {
      // STAMP THE ROOM INTO THE ESTATE. Its walls, its floor, its furniture cells
      // become part of this plane, and `regions` tells the baker to paint and
      // wall them in the room's own theme. The 'd' that used to be the way out
      // of a separate scene becomes plain floor: there is nothing to leave, so
      // the doorway is just a gap you walk through.
      for (let ry = 0; ry < h; ry++) {
        for (let rx = 0; rx < w; rx++) {
          const gy = top + ry, gx = b.x + rx;
          if (!g[gy] || gx < 0 || gx >= CAMPUS_W) continue;
          const ch = room.rows[ry][rx];
          g[gy][gx] = ch === 'd' ? '.' : ch;
        }
      }
      regions.push({ x: b.x, y: top, w, h, theme: room.theme });
      // Room coordinates counted the void margin this room no longer has.
      for (const p of room.props) roomProps.push({ ...p, x: b.x + p.x - 1, y: top + p.y - 1 });
      // A stair still leads to a scene of its own — an upper storey is genuinely
      // somewhere else. `enter` makes it remember the step you left from, so the
      // floor above can put you back on the estate exactly here.
      for (const q of room.portals) stairs.push({ x: b.x + q.x - 1, y: top + q.y - 1, to: q.to, at: q.at, enter: true });
    } else {
      // A roomless annex is still a solid: 'F', not 'f', because a facade is a
      // full-height mass you can never step into.
      for (let y = top; y < b.base; y++) {
        for (let x = b.x; x < b.x + w; x++) if (g[y] && (g[y][x] === '.' || g[y][x] === 't')) g[y][x] = 'F';
      }
    }
    const [dx, dy] = doorOf(b);
    // The threshold is cut unconditionally, and the tile in FRONT of it is
    // cleared — a tree grown across your own doorstep would lock the room out.
    if (g[dy]) g[dy][dx] = '.';
    if (g[dy + 1] && g[dy + 1][dx] === 't') g[dy + 1][dx] = '.';
    return { id: b.id, to: k.to, art: k.art, name: k.name, x: b.x, y: top, w, h, px: k.px, roomed: !!room, door: [dx, dy] };
  });
  g[CAMPUS_H - 3][13] = 'w'; // the gate — the way back to the desk

  const props = c.props.map((p) => {
    const k = PROP_KINDS[p.kind];
    return { art: k.art, x: p.x, y: p.y, w: k.w };
  });
  props.push({ art: 'gateArch', x: 13.5, y: CAMPUS_H - 2, w: 144 });

  return {
    id: 'campus', theme: 'meadow', name: 'The Grounds',
    grid: g.map((r) => r.join('')),
    entry: [13.5, CAMPUS_H - 4.7],
    regions,
    // Facades are STANDEES now, not doors — every one stands over the room it
    // contains. `w/h` is the room's tile rect (the occluder must cover all of
    // it), `px` the art's AUTHORED width: the sprite renders at native scale,
    // centred, because stretching it to room width also stretched its height
    // (aspect-ratio) and grew every door to three characters tall. `roomed`
    // marks the ones whose rect got a stamped interior (annexes did not) — the
    // renderer caps those with a roof so their wall ring reads as a building,
    // not a fence. Nothing here is a portal any more except a stair.
    facades: buildings.map((b) => ({ art: b.art, name: b.name, x: b.x, y: b.y, w: b.w, h: b.h, px: b.px, roomed: b.roomed, door: b.door })),
    portals: stairs,
    props: props.concat(roomProps),
  };
}

// ─── Mutations. Each validates, mutates, and reports; the caller owns gold. ───

/** Place a new building. @returns {{ok:boolean, why?:string, id?:string}} */
export function placeBuilding(guild, kind, x, base) {
  if (!BUILDING_KINDS[kind]) return { ok: false, why: 'no such building' };
  const chk = canPlace(guild, kind, x, base);
  if (!chk.ok) return chk;
  const id = nid('b_');
  guild.campus.buildings.push({ id, kind, x: x | 0, base: base | 0 });
  return { ok: true, id };
}

/** Move an existing building. */
export function moveBuilding(guild, id, x, base) {
  const c = ensureCampus(guild);
  const b = c.buildings.find((q) => q.id === id);
  if (!b) return { ok: false, why: 'no such building' };
  const chk = canPlace(guild, b.kind, x, base, id);
  if (!chk.ok) return chk;
  b.x = x | 0; b.base = base | 0;
  return { ok: true };
}

/** Demolish a building. Core buildings hold a room's only entrance, so they stay. */
export function demolish(guild, id) {
  const c = ensureCampus(guild);
  const b = c.buildings.find((q) => q.id === id);
  if (!b) return { ok: false, why: 'no such building' };
  if (BUILDING_KINDS[b.kind].core) return { ok: false, why: 'that is the only way into its room' };
  c.buildings = c.buildings.filter((q) => q.id !== id);
  return { ok: true, refund: Math.floor((BUILDING_KINDS[b.kind].cost || 0) * 0.5) };
}

/** Fell a tree. The tile stops blocking, so the ground can be built on. */
export function fellTree(guild, x, y) {
  const c = ensureCampus(guild);
  const before = c.trees.length;
  c.trees = c.trees.filter((t) => !(t[0] === (x | 0) && t[1] === (y | 0)));
  return { ok: c.trees.length < before, felled: before - c.trees.length };
}

/** Place a prop. Props never block, so the only check is the estate wall. */
export function placeProp(guild, kind, x, y) {
  if (!PROP_KINDS[kind]) return { ok: false, why: 'no such prop' };
  if (x < 2 || x > CAMPUS_W - 2 || y < 2 || y > CAMPUS_H - 2) return { ok: false, why: 'past the estate wall' };
  const id = nid('p_');
  ensureCampus(guild).props.push({ id, kind, x: +x, y: +y });
  return { ok: true, id };
}

/** Clear a prop. */
export function clearProp(guild, id) {
  const c = ensureCampus(guild);
  const p = c.props.find((q) => q.id === id);
  if (!p) return { ok: false, why: 'no such prop' };
  c.props = c.props.filter((q) => q.id !== id);
  return { ok: true, refund: Math.floor((PROP_KINDS[p.kind].cost || 0) * 0.5) };
}

/** Sanity: every kind's art must exist, or a facade renders as nothing. */
export function validateKinds() {
  const missing = [];
  for (const [k, v] of Object.entries(BUILDING_KINDS)) if (!ART[v.art]) missing.push(k + '→' + v.art);
  for (const [k, v] of Object.entries(PROP_KINDS)) if (!ART[v.art]) missing.push(k + '→' + v.art);
  return missing;
}
