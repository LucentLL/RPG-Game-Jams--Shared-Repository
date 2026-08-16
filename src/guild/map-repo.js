/**
 * @file THE MAP PACK, from the browser — read and write the real repo files.
 *
 * `content/maps/<id>.json` is the map pack: one file per map, filename === id,
 * loaded into the game by map-pack.js and gated by map-pack-validate.js. This
 * module is the drafting table's door to it, talking to the dev server's
 * /__maps/ endpoint (dev/vite-map-pack-plugin.mjs), so that a map the user
 * edits and a map Claude edits are the same file rather than two copies that
 * drift.
 *
 * ── IT IS A CAPABILITY, NOT A DEPENDENCY ──────────────────────────────────
 *
 * The endpoint exists only under `npm run dev`; the shipped WebGL / Capacitor
 * build has no server behind it and must not regress. So:
 *
 *   · every exported call funnels through `repoAvailable()`, which is `false`
 *     the instant `import.meta.env.DEV` is false. Vite folds that constant at
 *     build time — verified in a real production bundle, where this function
 *     minifies to `function l(){return Promise.resolve(!1)}` — so no request
 *     is ever emitted and the editor falls back to Export/localStorage;
 *   · the probe is a real request, once, memoised, because DEV alone is not
 *     proof: a dev server whose vite.config.js has not been given the plugin
 *     answers 404, and the editor must fall back cleanly rather than throw;
 *   · nothing here is ever on a drawing path. The editor asks once when it
 *     opens and shows "Save to repo" or does not.
 *
 * ── IT OWNS NO RULES ──────────────────────────────────────────────────────
 *
 * The schema is map-pack-validate.js's and the width derivation is
 * prop-width.js's. Both are imported, never restated: `checkChart` is the
 * editor's PRE-FLIGHT against the very same `checkPackMap` the endpoint, the
 * CLI audit and the game's loader all gate on, so a save that will be refused
 * can say so before the round trip, in the same words.
 *
 * ── THE TWO SHAPES ────────────────────────────────────────────────────────
 *
 * The chart the editor and the lenses walk is NOT the pack file: it has no
 * `schema` and no `kind`, it carries the editor's `fOwn` bookkeeping, and its
 * props carry `w`. `toPack`/`fromPack` are the whole of the translation, in
 * one place — and `w` is the point of it. The file may not hold one (the pack
 * carries NO prop width); `toPack` strips it, `fromPack` DERIVES it back with
 * prop-width.js's `lawfulWidth`, exactly as buildPackMap does for the game.
 * ONE SIZE FACT, structural: there is no field to get wrong.
 */
import { lawfulWidth } from './prop-width.js';
import {
  checkPackMap, PACK_SCHEMA, PACK_KINDS, MAP_KEYS, ARRAY_KEYS, ID_RE, safeId,
} from './map-pack-validate.js';

/** Where the dev plugin listens. */
const BASE = '/__maps/';

export { PACK_SCHEMA, PACK_KINDS, ID_RE, safeId, lawfulWidth };

// ---------------------------------------------------------------------------
// Capability
// ---------------------------------------------------------------------------

let _probe = null;   // Promise<boolean>, once
let _live = false;   // the answer, for synchronous UI questions after the probe

/**
 * Can this build write to the repo pack?
 *
 * `import.meta.env.DEV` first (a production bundle stops here and the rest is
 * unreachable), then one real request, because a dev server without the plugin
 * is a perfectly ordinary thing to be running.
 */
export function repoAvailable() {
  if (!import.meta.env.DEV) return Promise.resolve(false);
  if (_probe) return _probe;
  _probe = fetch(BASE, { method: 'GET', headers: { accept: 'application/json' } })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => { _live = !!(j && j.ok && Array.isArray(j.maps)); return _live; })
    .catch(() => { _live = false; return false; });
  return _probe;
}

/** What the last probe said, without awaiting — for render paths that have
 *  already been told. False until `repoAvailable()` has resolved once. */
export const repoLive = () => _live;

/** Forget the probe (after wiring the plugin into vite.config.js and
 *  restarting, say) so the next ask is a fresh request. */
export function resetRepoProbe() { _probe = null; _live = false; }

// ---------------------------------------------------------------------------
// Shape translation
// ---------------------------------------------------------------------------

const clone = (v) => JSON.parse(JSON.stringify(v));

/**
 * The editor/lens chart → the pack file.
 *
 * Keys come out in MAP_KEYS order and empty arrays are dropped, so the body is
 * already the shape that will land on disk and a re-save of an unchanged map
 * is a no-op diff. Props lose their derived `w` and the editor's own `fOwn`.
 *
 * ANYTHING THE CHART CARRIES THAT THE SCHEMA HAS NO SLOT FOR IS LEFT ON AND
 * SENT — the endpoint refuses it BY NAME. That is deliberate and is the whole
 * reason this function does not filter: a client that quietly drops an
 * author's array is the one failure worse than not saving. The live example is
 * `water` (ferncreek's creek, delve-maps.js:707); a wet map cannot be saved to
 * the pack today and says so out loud instead of drying up.
 */
export function toPack(chart, kind = 'delve') {
  const m = clone(chart);
  const props = (m.props || []).map((p) => {
    const out = {};
    for (const k of ['art', 'x', 'y', 'use', 'label']) if (k in p) out[k] = p[k];
    // `w` and `fOwn` are not written. Anything ELSE a prop carries rides along
    // so the validator can name it (the apothecary cauldron's `cls` does).
    for (const k of Object.keys(p)) if (!(k in out) && k !== 'w' && k !== 'fOwn') out[k] = p[k];
    return out;
  });
  const src = { ...m, schema: PACK_SCHEMA, kind, props };
  // `name` is OPTIONAL and the schema says omit it where the web authors none
  // — hollowvein.json and ferncreek.json carry none. map-editor.js's
  // normalize() MANUFACTURES one (`m.name = String(m.name || m.id)`,
  // map-editor.js:52), so without this an untouched open-and-save of either
  // file would add a key and show as a diff. A name that is only the id is not
  // a name.
  if (src.name === src.id) delete src.name;
  const pack = {};
  for (const k of MAP_KEYS) {
    if (!(k in src)) continue;
    if (ARRAY_KEYS.includes(k) && Array.isArray(src[k]) && !src[k].length) continue;
    pack[k] = src[k];
  }
  for (const k of Object.keys(src)) if (!(k in pack) && !ARRAY_KEYS.includes(k)) pack[k] = src[k];
  return pack;
}

/**
 * The pack file → the chart the editor and the lenses walk.
 *
 * This is where `w` comes back: DERIVED, never read, because the file is not
 * allowed to hold one. A prop whose art has no rung gets no width at all
 * rather than a guessed one — the lenses' `p.w || 48` fallback and the
 * editor's own lint ("author its ladder height first") then say so.
 *
 * TOLERANT ON PURPOSE, unlike map-pack.js's `buildPackMap`, which throws. The
 * game must refuse to load a broken map; the EDITOR is where a broken map gets
 * fixed, and a file you cannot open is a file you cannot repair. Ask
 * `checkChart` for the verdict instead.
 */
export function fromPack(pack) {
  const m = clone(pack);
  delete m.schema;
  delete m.kind;
  m.props = (m.props || []).map((p) => {
    const w = lawfulWidth(p.art);
    return w == null ? { ...p } : { ...p, w };
  });
  for (const k of ARRAY_KEYS) if (!Array.isArray(m[k])) m[k] = [];
  return m;
}

/**
 * PRE-FLIGHT: what the endpoint will say about this chart, before sending it.
 *
 * The same `checkPackMap` the server, the CLI audit and the game's loader use
 * — so "Save to repo" can refuse in the editor's own toast, in the endpoint's
 * exact words, without a round trip.
 *
 * @param {object} chart the editor's live map
 * @param {{kind?:string, ids?:Set<string>}} [opts] `ids` = every id the pack
 *   defines, for portal resolution (pass `new Set(listMaps() ids)`).
 * @returns {{errors:string[], warnings:string[]}}
 */
export function checkChart(chart, opts = {}) {
  const kind = opts.kind || 'delve';
  const id = String((chart && chart.id) || '');
  return checkPackMap(toPack(chart, kind), id, { ids: opts.ids || null });
}

// ---------------------------------------------------------------------------
// The four calls
// ---------------------------------------------------------------------------

/** A refusal carries the server's own first problem — the editor toasts it
 *  verbatim and consoles `err.problems`, so a rejected save says WHY. */
async function ask(url, init) {
  const r = await fetch(url, init);
  let j = null;
  try { j = await r.json(); } catch (e) { /* a non-JSON body is its own answer */ }
  if (!r.ok || (j && j.ok === false)) {
    const err = new Error((j && (j.error || (j.problems || [])[0])) || `${r.status} ${r.statusText}`);
    err.status = r.status;
    err.problems = (j && j.problems) || [];
    throw err;
  }
  return j;
}

/**
 * Every map in the repo pack: `[{ id, name, kind, theme, cols, rows, bytes,
 * mtime, errors, warnings }]` — `errors` non-empty means the game's loader
 * would currently REFUSE that file, which the Open dialog can mark.
 *
 * Returns [] when there is no repo to ask, so a caller never has to branch on
 * capability just to LIST.
 */
export async function listMaps() {
  if (!(await repoAvailable())) return [];
  const j = await ask(BASE, { method: 'GET', headers: { accept: 'application/json' } });
  return j.maps || [];
}

/** One map, as a CHART (widths derived), or null if the pack has no such id. */
export async function loadMap(id) {
  if (!safeId(id)) throw new Error(`'${id}' is not a legal map id`);
  if (!(await repoAvailable())) return null;
  try {
    return fromPack(await ask(BASE + id, { method: 'GET', headers: { accept: 'application/json' } }));
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

/**
 * Write a chart to `content/maps/<id>.json`.
 *
 * Throws when there is no repo to write to, so a caller can never believe a
 * save happened that did not — the editor asks `repoAvailable()` first and
 * shows the button only when the answer is yes. Resolves
 * `{ ok, id, path, bytes, mtime, warnings }`.
 */
export async function saveMap(chart, kind = 'delve') {
  const id = String((chart && chart.id) || '');
  if (!safeId(id)) throw new Error(`'${id}' is not a legal map id — [a-z0-9-] only, and never __proto__/constructor/prototype`);
  if (!(await repoAvailable())) throw new Error('no repo to save to — this is a shipped build; use Export JSON');
  return ask(BASE + id, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(toPack(chart, kind)),
  });
}

/** Remove a map from the pack. Resolves false when there was nothing there. */
export async function deleteMap(id) {
  if (!safeId(id)) throw new Error(`'${id}' is not a legal map id`);
  if (!(await repoAvailable())) throw new Error('no repo to delete from — this is a shipped build');
  try {
    await ask(BASE + id, { method: 'DELETE' });
    return true;
  } catch (err) {
    if (err.status === 404) return false;
    throw err;
  }
}
