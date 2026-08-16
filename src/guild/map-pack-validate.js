/**
 * @file The map pack's gate — the ONE validator, and the ONE build step.
 *
 * A map pack file is `content/maps/<id>.json`: the same chart shape
 * delve-maps.js authors in JavaScript, moved out of the bundle's source and
 * into data. Two things read it and they must agree exactly:
 *
 *   · src/guild/map-pack.js — the game, via `import.meta.glob` at build time;
 *   · dev/check-maps.mjs    — the CLI audit, via plain `fs.readFileSync`.
 *
 * So neither of them owns a rule. Both import this file, which is why this
 * file may never touch the DOM, `import.meta.glob`, or anything else that
 * only exists inside Vite.
 *
 * ── THE TWO THINGS THIS GATE EXISTS FOR ───────────────────────────────────
 *
 * 1. A BAD MAP DIES HERE, LOUDLY. The Unity port shipped a `DelveMaps.Validate`
 *    with no runtime caller at all — a validator nothing calls is a comment.
 *    `checkPackMap` returns every fault it can find (so an author fixes them
 *    all in one pass) and `buildPackMap` refuses to return a map that has any,
 *    so the failure lands at load with the file's name on it instead of six
 *    frames deep inside the baker.
 *
 * 2. A WIDTH CANNOT BE AUTHORED. The pack carries NO prop `w`. Every prop's
 *    chart width is derived here by prop-width.js's `lawfulWidth` — the same
 *    single implementation the editor places with and dev/check-volumes.mjs
 *    audits — which makes the ONE SIZE FACT structural rather than a rule
 *    somebody has to remember. A file that authors a `w` is malformed, and
 *    says so.
 *
 * ── WHAT IS DELIBERATELY STRICT ───────────────────────────────────────────
 *
 * UNKNOWN KEYS ARE FAULTS. The pinned schema is a closed set, and the honest
 * failure mode for a field the schema has no home for is a loud one: a chart
 * carrying `water` (ferncreek does) or a prop carrying `cls` (the apothecary
 * cauldron does) must NOT be quietly stripped on the way through. Silently
 * dropping data is how a creek dries up between two formats. See the module
 * note at the bottom of this comment.
 *
 * FIELDS THE PINNED SCHEMA HAS NO HOME FOR (report, never invent):
 *   · `water` — ferncreek's 28 wet cells (delve-maps.js:707). Nowhere to go.
 *   · prop `cls` — one apothecary cauldron carries a CSS class.
 *   · `regions` — in the schema, but only campus.js ever produces one, and
 *     campus is derived at runtime rather than authored, so no pack file
 *     should carry one yet. Accepted, not required.
 */
// themes.js, NOT delve-maps.js: delve-maps builds its charts FROM the pack now,
// so importing it back here is a cycle whose THEMES is in the temporal dead zone
// at evaluation time. DELVE_MAPS is gone from this module for the same reason —
// portal targets resolve against `ctx.ids`, which is the whole pack and is
// therefore the complete and only correct answer.
import { THEMES } from './themes.js';
import { PROP_VOL } from './prop-volume.js';
import { ART } from './art.js';
import { lawfulWidth } from './prop-width.js';

/** The pinned pack version. A file that does not say `1` is not this format. */
export const PACK_SCHEMA = 1;

/** The kinds the pack knows. world/estate/tactical are LATER kinds — a file
 *  that claims one is a file written against a schema that does not exist. */
export const PACK_KINDS = ['delve', 'arena'];

/**
 * The closed key sets. Every one of these is the pinned schema verbatim; an
 * addition here is a schema change and belongs in the schema doc first.
 */
export const MAP_KEYS = ['schema', 'kind', 'id', 'name', 'theme', 'grid', 'entry',
  'foe', 'water', 'exitStairs', 'props', 'portals', 'spawns', 'regions', 'paint', 'locks'];
export const PROP_KEYS = ['art', 'x', 'y', 'facing', 'use', 'label', 'cls'];
export const PORTAL_KEYS = ['x', 'y', 'to', 'at', 'enter', 'stairs'];
export const SPAWN_KEYS = ['prey', 'x', 'y'];
export const RECT_KEYS = ['x', 'y', 'w', 'h', 'theme'];
/** The arrays the schema says are omitted when empty. */
export const ARRAY_KEYS = ['props', 'portals', 'spawns', 'regions', 'paint', 'locks'];

/**
 * THE GRID VOCABULARY.
 *
 * Transcribed from map-editor.js's `TILES` table (the palette IS the
 * vocabulary), because map-editor.js cannot be imported outside a browser —
 * it pulls in delve.js, which assigns `window` at module scope. The union of
 * characters actually used across all 15 shipped charts is a strict subset of
 * this string, so the transcription is checked by the charts themselves; see
 * integrationNotes for the export that would remove the copy.
 */
export const GRID_CHARS = '.#Bbfd+sw^23456,SunLvDKort=m';

/** An id the pack will accept: the filename stem, and nothing that could ever
 *  land on Object.prototype. map-editor.js's freeId() RENAMES these (a draft
 *  becomes 'draft'); a pack file cannot be renamed — its name is its id — so
 *  here the same two names are a refusal instead. */
export const BAD_IDS = ['__proto__', 'constructor', 'prototype'];
/** camelCase is legal because SHIPPED IDS ARE camelCase — `libraryLoft`,
 *  `classroom2`, `guildmaster`. An id is a map's name everywhere (portals name
 *  it, saves store it, hall.js's WALKABLE registry keys on it), so a pack file
 *  cannot be renamed to suit a regex; the regex bends. Case-insensitive
 *  uniqueness is enforced across the pack instead (checkPack below) — two files
 *  differing only in case collide on a case-insensitive filesystem. */
export const ID_RE = /^[A-Za-z][A-Za-z0-9-]*$/;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isStr = (v) => typeof v === 'string' && v.length > 0;
const isInt = (v) => isNum(v) && Number.isInteger(v);
const pair = (v) => Array.isArray(v) && v.length === 2 && v.every(isNum);
const plain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** A safe, prototype-less bag — nothing keyed by map id may ever reach
 *  Object.prototype, however hostile the filename. */
export const bag = () => Object.create(null);

/** Is `id` safe to use as an object key AND legal as a filename stem? */
export function safeId(id) {
  return isStr(id) && ID_RE.test(id) && !BAD_IDS.includes(id);
}

/**
 * EVERY FAULT IN ONE MAP FILE.
 *
 * Structural only — the shape of the JSON and the facts it names (a theme
 * that exists, an art with a ladder rung, a portal that lands somewhere).
 * The height-model questions ("does this climb serve anything") are the
 * delve LINT below, because they need makeLevelModel and only apply to a
 * delve.
 *
 * @param {any} raw the parsed JSON
 * @param {string} stem the filename without .json — the id the file claims
 * @param {{ids?:Set<string>|null}} [ctx] `ids` = every id the pack defines,
 *   for portal resolution. Omit to resolve against the shipped charts alone.
 * @returns {{errors:string[], warnings:string[]}}
 */
export function checkPackMap(raw, stem, ctx = {}) {
  const errors = [];
  const warnings = [];
  const bad = (m) => errors.push(m);
  const warn = (m) => warnings.push(m);

  if (!plain(raw)) return { errors: ['not a JSON object'], warnings };

  // ── The envelope ─────────────────────────────────────────────────────────
  for (const k of Object.keys(raw)) {
    if (!MAP_KEYS.includes(k)) {
      bad(`unknown key '${k}' — the pinned schema has no home for it; report it, do not invent one`);
    }
  }
  if (raw.schema !== PACK_SCHEMA) bad(`schema is ${JSON.stringify(raw.schema)}, want ${PACK_SCHEMA}`);
  if (!PACK_KINDS.includes(raw.kind)) bad(`kind ${JSON.stringify(raw.kind)} is not one of ${PACK_KINDS.join(' / ')}`);
  if (!safeId(raw.id)) bad(`id ${JSON.stringify(raw.id)} is not a legal map id (${ID_RE} and never ${BAD_IDS.join('/')})`);
  else if (raw.id !== stem) bad(`id '${raw.id}' does not match the filename '${stem}.json' — one file, one map, one name`);
  if ('name' in raw && !isStr(raw.name)) bad('name is present but not a non-empty string (omit it instead)');
  if (!isStr(raw.theme)) bad(`theme ${JSON.stringify(raw.theme)} is not a string`);
  else if (!THEMES[raw.theme]) bad(`theme '${raw.theme}' is not in THEMES (${Object.keys(THEMES).join(', ')})`);
  if ('exitStairs' in raw && typeof raw.exitStairs !== 'boolean') bad('exitStairs is present but not a boolean');

  // ── The grid ─────────────────────────────────────────────────────────────
  let W = 0, H = 0;
  if (!Array.isArray(raw.grid) || !raw.grid.length) {
    bad('grid is missing or empty');
  } else if (!raw.grid.every((r) => typeof r === 'string')) {
    bad('grid holds something that is not a string');
  } else {
    H = raw.grid.length;
    W = raw.grid[0].length;
    if (!W) bad('grid row 0 is empty');
    raw.grid.forEach((row, y) => {
      if (row.length !== W) bad(`grid row ${y} is ${row.length} wide, row 0 is ${W} — rows must be equal length`);
      for (let x = 0; x < row.length; x++) {
        if (!GRID_CHARS.includes(row[x])) bad(`grid ${x},${y} is '${row[x]}', which is not in the vocabulary (${GRID_CHARS})`);
      }
    });
  }
  const inside = (x, y) => W > 0 && x >= 0 && y >= 0 && Math.floor(x) < W && Math.floor(y) < H;

  // ── entry ────────────────────────────────────────────────────────────────
  // The schema comment says "integers"; every shipped chart authors halves
  // (hollowvein's [4.5, 15.5] is a tile CENTRE). Finite is the honest test —
  // see blockers.
  if ('entry' in raw) {
    if (!pair(raw.entry)) bad(`entry ${JSON.stringify(raw.entry)} is not two finite numbers`);
    else if (!inside(raw.entry[0], raw.entry[1])) bad(`entry ${raw.entry} is off the ${W}×${H} grid`);
  }

  // ── foe: the arena's SECOND corner ───────────────────────────────────────
  // An arena field keeps two spawn points, not one — the player at (1.5,7.5)
  // and the opponent at (7.5,1.5) (arena-terrain.js:42-44, set by
  // crucible.js:3108-3109). `entry` is the player's; this is the other. Delve
  // charts have no such thing (their foes are `spawns`, which name a prey id).
  if ('foe' in raw) {
    if (raw.kind !== 'arena') bad(`foe is an ARENA field's opponent corner; kind '${raw.kind}' has spawns instead`);
    if (!pair(raw.foe)) bad(`foe ${JSON.stringify(raw.foe)} is not two finite numbers`);
    else if (!inside(raw.foe[0], raw.foe[1])) bad(`foe ${raw.foe} is off the ${W}×${H} grid`);
  } else if (raw.kind === 'arena') {
    warn('arena field has no foe corner — the opponent will spawn wherever the caller decides');
  }

  // ── water: wet cells, deliberately NOT a grid char ───────────────────────
  // ferncreek authors 28 of them (delve-maps.js:707). Water is an overlay and
  // not a glyph because a wet cell keeps whatever floor char it had — ',' is a
  // creek BED, and the wetness is a separate fact painted over it.
  if ('water' in raw) {
    if (!Array.isArray(raw.water)) bad('water is present but not an array');
    else raw.water.forEach((c, i) => {
      if (!pair(c) || !c.every(isInt)) bad(`water[${i}] ${JSON.stringify(c)} is not two integer cell coords`);
      else if (!inside(c[0], c[1])) bad(`water[${i}] ${c} is off the ${W}×${H} grid`);
    });
  }

  // ── The overlay arrays ───────────────────────────────────────────────────
  for (const k of ARRAY_KEYS) {
    if (!(k in raw)) continue;
    if (!Array.isArray(raw[k])) { bad(`${k} is present but not an array`); continue; }
    if (!raw[k].length) warn(`${k} is an empty array — the schema omits empty arrays`);
  }

  for (const [i, p] of (Array.isArray(raw.props) ? raw.props : []).entries()) {
    const at = `props[${i}]`;
    if (!plain(p)) { bad(`${at} is not an object`); continue; }
    for (const k of Object.keys(p)) {
      if (k === 'w') bad(`${at} authors w:${p.w} — the pack carries NO width; it is derived from the ladder at load`);
      else if (!PROP_KEYS.includes(k)) bad(`${at} has unknown key '${k}'`);
    }
    if (!isStr(p.art)) { bad(`${at} has no art id`); continue; }
    if (!ART[p.art]) bad(`${at} art '${p.art}' is not in ART`);
    if (!PROP_VOL[p.art]) bad(`${at} art '${p.art}' has no PROP_VOL rung — author its ladder height before placing it`);
    else if (lawfulWidth(p.art) == null) bad(`${at} art '${p.art}' has a rung but no derivable width (bad crop?)`);
    if (!isNum(p.x) || !isNum(p.y)) bad(`${at} '${p.art}' has no finite x,y`);
    else if (!inside(p.x, Number.isInteger(p.y) ? p.y - 0.5 : p.y)) bad(`${at} '${p.art}' stands off the ${W}×${H} grid at ${p.x},${p.y}`);
    for (const k of ['use', 'label', 'cls']) if (k in p && !isStr(p[k])) bad(`${at} ${k} is present but not a non-empty string`);

    // ── facing ───────────────────────────────────────────────────────────
    // Degrees clockwise, 0 = the orientation the art was drawn in (so an
    // absent facing is today's behaviour, exactly). This is NOT a faked pose:
    // a prop with a depth `d` extrudes to real volume from its own pixels
    // (platform/voxel-sprite.js), and turning that volume on its vertical
    // axis shows the sides the extrusion actually built. Collision does not
    // move with it and does not need to — blockerRadius(w,d) is a CIRCLE
    // sized off max(w,d) (prop-volume.js:313-317), so it is already
    // rotation-invariant and ONE COLLISION FACT holds at every angle.
    if ('facing' in p) {
      const vol = PROP_VOL[p.art];
      if (!isInt(p.facing) || p.facing < 0 || p.facing > 359) {
        bad(`${at} facing ${JSON.stringify(p.facing)} is not an integer 0-359`);
      } else if (vol && vol.flat) {
        warn(`${at} '${p.art}' is flat:true — radially symmetric, so facing ${p.facing}° draws identically. Harmless, but it means nothing.`);
      } else if (vol && vol.form === 'wall') {
        warn(`${at} '${p.art}' is a wall form — it already orients to the wall it hangs on; an authored facing ${p.facing}° will not survive the bake`);
      }
    }
  }

  const known = ctx.ids || null;
  for (const [i, p] of (Array.isArray(raw.portals) ? raw.portals : []).entries()) {
    const at = `portals[${i}]`;
    if (!plain(p)) { bad(`${at} is not an object`); continue; }
    for (const k of Object.keys(p)) if (!PORTAL_KEYS.includes(k)) bad(`${at} has unknown key '${k}'`);
    if (!isNum(p.x) || !isNum(p.y)) bad(`${at} has no finite x,y`);
    else if (!inside(p.x, p.y)) bad(`${at} sits off the ${W}×${H} grid at ${p.x},${p.y}`);
    else {
      // validateMap's own severity again (delve-maps.js:1094): a portal on a
      // blocked cell is unreachable content, not a broken file.
      const ch = raw.grid[Math.floor(p.y)][Math.floor(p.x)];
      if (ch === '#' || 'BbFfrtmo'.includes(ch)) warn(`${at} sits on '${ch}' — unreachable`);
    }
    if (!isStr(p.to)) bad(`${at} names no destination`);
    else if (known && !known.has(p.to)) {
      bad(`${at} leads to '${p.to}', which no map in the pack defines`);
    }
    if ('at' in p && !pair(p.at)) bad(`${at} 'at' is present but not two finite numbers`);
    for (const k of ['enter', 'stairs']) if (k in p && typeof p[k] !== 'boolean') bad(`${at} ${k} is present but not a boolean`);
  }

  for (const [i, s] of (Array.isArray(raw.spawns) ? raw.spawns : []).entries()) {
    const at = `spawns[${i}]`;
    if (!plain(s)) { bad(`${at} is not an object`); continue; }
    for (const k of Object.keys(s)) if (!SPAWN_KEYS.includes(k)) bad(`${at} has unknown key '${k}'`);
    if (!isStr(s.prey)) bad(`${at} has no prey id`);
    if (!isNum(s.x) || !isNum(s.y)) bad(`${at} '${s.prey}' has no finite x,y`);
    else if (!inside(s.x, s.y)) bad(`${at} '${s.prey}' stands off the ${W}×${H} grid at ${s.x},${s.y}`);
    // validateMap's own severity, kept: a spawn on void is content nobody
    // meets, not a crash (delve-maps.js:1090).
    else if (raw.grid[Math.floor(s.y)][Math.floor(s.x)] === '#') warn(`${at} '${s.prey}' at ${s.x},${s.y} is on void`);
  }

  for (const key of ['regions', 'paint']) {
    for (const [i, r] of (Array.isArray(raw[key]) ? raw[key] : []).entries()) {
      const at = `${key}[${i}]`;
      if (!plain(r)) { bad(`${at} is not an object`); continue; }
      for (const k of Object.keys(r)) if (!RECT_KEYS.includes(k)) bad(`${at} has unknown key '${k}'`);
      if (![r.x, r.y, r.w, r.h].every(isNum)) bad(`${at} is not four finite numbers`);
      else if (!(r.w > 0 && r.h > 0)) bad(`${at} is ${r.w}×${r.h} — a rect covers something`);
      if (!isStr(r.theme)) bad(`${at} names no theme`);
      else if (!THEMES[r.theme]) bad(`${at} names unknown theme '${r.theme}'`);
    }
  }

  for (const [i, l] of (Array.isArray(raw.locks) ? raw.locks : []).entries()) {
    const at = `locks[${i}]`;
    if (!Array.isArray(l) || l.length !== 2 || !l.every(isInt)) { bad(`${at} is not an [x, y] pair of integers`); continue; }
    if (!inside(l[0], l[1])) bad(`${at} at ${l} is off the ${W}×${H} grid`);
    else if (raw.grid[l[1]][l[0]] !== 'D') bad(`${at} at ${l} sits on '${raw.grid[l[1]][l[0]]}' — locks belong on 'D' doors`);
  }

  return { errors, warnings };
}

/**
 * THE MAP THE GAME ACTUALLY WALKS — validated, then completed.
 *
 * The only thing "completing" adds is the derived prop widths, because that
 * is the only fact the pack is forbidden to carry. Everything else is passed
 * through as authored: a loader that normalises is a loader that can disagree
 * with the file, and then nobody knows which one the lens drew.
 *
 * Throws on any fault. That is the point — @see the module comment.
 *
 * @param {any} raw @param {string} stem @param {{ids?:Set<string>|null}} [ctx]
 */
export function buildPackMap(raw, stem, ctx = {}) {
  const { errors } = checkPackMap(raw, stem, ctx);
  if (errors.length) {
    throw new Error(`content/maps/${stem}.json is not a legal map pack file:\n  · ` + errors.join('\n  · '));
  }
  const map = { ...raw };
  if (Array.isArray(raw.props)) {
    map.props = raw.props.map((p) => ({ ...p, w: lawfulWidth(p.art) }));
  }
  return map;
}

// ---------------------------------------------------------------------------
// The delve lint — the height model's questions, asked of the model
// ---------------------------------------------------------------------------

const ORTH = [[0, -1], [0, 1], [-1, 0], [1, 0]];

/**
 * WHAT A WALK WOULD TRIP OVER.
 *
 * A transcription of map-editor.js's `lint()` (map-editor.js:786) against an
 * explicit map instead of the editor's live session — the editor's version
 * closes over module state (`E`) and lives in a file that cannot be imported
 * outside a browser. Every height question is asked OF THE MODEL and never
 * re-derived from raw char adjacency, for the reason the editor gives: a lint
 * that disagrees with the walk teaches lies.
 *
 * Dropped from the editor's list, because they are editor-session faults and
 * not file faults: the resize sweep (off-map anchors — `checkPackMap` already
 * refuses those outright) and the prop-without-a-volume check (same).
 *
 * @param {any} map a built pack map
 * @param {{makeLevelModel:Function, CLIMB_CH:object, DECK_CH:object,
 *          resolve?:(id:string)=>any}} model the delve-maps tables, passed in
 *   so this module stays importable by anything that has them
 * @returns {string[]} advice, worst first is not attempted — these are peers
 */
export function lintDelveMap(map, model) {
  const { makeLevelModel, CLIMB_CH, DECK_CH, resolve } = model;
  const out = [];
  const grid = map.grid;
  const W = grid[0].length, H = grid.length;
  const at = (x, y) => (grid[Math.floor(y)] || '')[Math.floor(x)];
  const inside = (x, y) => x >= 0 && x < W && y >= 0 && y < H;
  const m = makeLevelModel(grid);

  if (map.entry) {
    const e = at(map.entry[0], map.entry[1]);
    if (!e || '#BbFrtmo'.includes(e)) out.push(`entry at ${map.entry} stands in '${e || 'void'}'`);
  }
  const exits = grid.join('').match(/[sdw]/g) || [];
  if (!exits.length && !(map.portals || []).length) out.push('no exit cell (s/d/w) and no portal — the walk cannot end');
  if (exits.length > 1) out.push(`${exits.length} exit cells — the top-down keeps only the last one scanned as the live exit`);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ch = at(x, y);
      if (CLIMB_CH[ch]) {
        const lv = m.floorAt(x, y);
        let serves = false, jump = false;
        for (const [dx, dy] of ORTH) {
          if (m.surfacesAt(x + dx, y + dy).includes(lv + 1)) serves = true;
          const nf = m.floorAt(x + dx, y + dy), nd = m.deckAt(x + dx, y + dy);
          if (nf != null && (nf > lv + 1 || (nd != null && nd > lv + 1))) jump = true;
        }
        if (!serves) {
          out.push(jump
            ? `climb at ${x},${y} faces a jump of more than one level — terrace by construction (add a landing)`
            : `climb at ${x},${y} serves no higher ground`);
        }
      }
      if (DECK_CH[ch] && ORTH.some(([dx, dy]) => (at(x + dx, y + dy) || '#') === '#')) {
        out.push(`deck at ${x},${y} borders the void — bridge a ',' trench or open ground instead`);
      }
    }
  }

  // Every pit needs its own way out.
  const seenPit = new Set();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const lv0 = m.floorAt(x, y);
      if (lv0 == null || lv0 >= 0 || seenPit.has(y * W + x)) continue;
      const stack = [[x, y]];
      seenPit.add(y * W + x);
      let escape = false;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        if (m.climbAt(cx, cy)) escape = true;
        for (const [dx, dy] of ORTH) {
          const nx = cx + dx, ny = cy + dy, k = ny * W + nx;
          if (!inside(nx, ny) || seenPit.has(k)) continue;
          const nlv = m.floorAt(nx, ny);
          if (nlv != null && nlv < 0) { seenPit.add(k); stack.push([nx, ny]); }
        }
      }
      if (!escape) out.push(`a pit at ${x},${y} has no way out — hang a vine or cut steps`);
    }
  }

  // A deck run nothing can step onto is scenery wearing a bridge's clothes.
  const seenDeck = new Set();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (m.deckAt(x, y) == null || seenDeck.has(y * W + x)) continue;
      const stack = [[x, y]];
      seenDeck.add(y * W + x);
      let mounts = false;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        const d = m.deckAt(cx, cy);
        for (const [dx, dy] of ORTH) {
          const nx = cx + dx, ny = cy + dy, k = ny * W + nx;
          if (m.deckAt(nx, ny) != null) {
            if (inside(nx, ny) && !seenDeck.has(k)) { seenDeck.add(k); stack.push([nx, ny]); }
          } else if (m.surfacesAt(nx, ny).includes(d)) mounts = true;
        }
      }
      if (!mounts) out.push(`a deck at ${x},${y} nothing can step onto`);
    }
  }

  if (W > 96 || H > 96) out.push(`${W}×${H} is a big bake — the top-down walk may load slowly on a phone (first person is unaffected)`);

  const nLocks = (map.locks || []).filter(([lx, ly]) => at(lx, ly) === 'D').length;
  const nKeys = (grid.join('').match(/K/g) || []).length;
  if (nLocks > nKeys) out.push(`${nLocks} locked door${nLocks > 1 ? 's' : ''} but only ${nKeys} key${nKeys === 1 ? '' : 's'} — something stays shut forever`);

  // An arrival takes the LOW surface, so a flag on a deck cell wakes up UNDER it.
  if (map.entry && m.deckAt(Math.floor(map.entry[0]), Math.floor(map.entry[1])) != null) {
    out.push(`entry ${map.entry} arrives on the GROUND under the deck`);
  }
  for (const s of map.spawns || []) {
    if (m.deckAt(Math.floor(s.x), Math.floor(s.y)) != null) out.push(`spawn ${s.x},${s.y} arrives on the GROUND under the deck`);
  }
  for (const p of map.portals || []) {
    if (!Array.isArray(p.at)) continue;
    const dest = p.to === map.id ? map : (resolve ? resolve(p.to) : null);
    if (!dest || !Array.isArray(dest.grid)) continue;
    const dm = p.to === map.id ? m : makeLevelModel(dest.grid);
    if (dm.deckAt(Math.floor(p.at[0]), Math.floor(p.at[1])) != null) {
      out.push(`portal to '${p.to}' arrives at ${p.at} on the GROUND under the deck`);
    }
  }

  // Furniture keeps to level 0 — the prop chart has no height slot yet.
  for (const p of map.props || []) {
    const cx = Math.floor(p.x), cy = Number.isInteger(p.y) ? p.y - 1 : Math.floor(p.y);
    if (inside(cx, cy) && m.floorAt(cx, cy) !== 0) out.push(`prop '${p.art}' stands off ground level — furniture keeps to level 0 for now`);
  }

  return out;
}
