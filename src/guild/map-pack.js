/**
 * @file THE MAP PACK — every authored map, bundled, validated, and derived.
 *
 * The charts used to be JavaScript object literals inside delve-maps.js. That
 * made them unreachable to everything except the bundle: the editor could not
 * write one back, the Unity port had to TRANSCRIBE them by hand, and a check
 * script had to scrape the source text with a balanced-brace scanner to read
 * them at all (dev/check-volumes.mjs:46-54). A map is DATA. It lives in
 * `content/maps/<id>.json` now, one file per map, filename === id.
 *
 * ── NO ASYNC, NO FETCH ────────────────────────────────────────────────────
 *
 * `import.meta.glob(..., { eager: true, import: 'default' })` is a BUILD-TIME
 * expansion: Vite rewrites the call into a static import of every matching
 * file, so the JSON is inlined into the bundle and this module's exports are
 * plain synchronous constants. That is not a preference — vite.config.js sets
 * `base: './'` precisely because this build has to run from a `file://` origin
 * inside an Electron/Tauri shell and a Capacitor WebView, and `fetch()` on a
 * `file://` URL is blocked by every one of them. A map pack that had to be
 * fetched would be a map pack that works in `vite dev` and nowhere else.
 *
 * The pattern reaches OUT of `src/` (`../../content/maps/*.json`), which Vite
 * allows: the glob is resolved relative to this file and the result sits under
 * the project root, which is Vite's `root`. It is a literal string on purpose
 * — Vite cannot expand a pattern it has to evaluate.
 *
 * ── LOUD, AT LOAD ─────────────────────────────────────────────────────────
 *
 * Every map is validated here, on the way in, and a bad one throws before the
 * game has drawn a pixel. The alternative is the port's mistake: Unity's
 * `DelveMaps.Validate` has no runtime caller at all, so a malformed chart
 * would surface as an exception several frames deep inside the baker with
 * nothing pointing at the file that caused it.
 *
 * ── AND NO WIDTH ──────────────────────────────────────────────────────────
 *
 * A prop's `w` — the ONE SIZE FACT — is not in the file and cannot be put
 * there. It is derived at load by prop-width.js's `lawfulWidth`, the same
 * implementation the map editor places with and dev/check-volumes.mjs audits.
 * The size law is now structural: there is no field to get wrong.
 *
 * ── ONE CONSTRAINT ON THE WIRING ──────────────────────────────────────────
 *
 * delve-maps.js MUST NOT import this file. This module imports THEMES and
 * DELVE_MAPS from delve-maps.js (through map-pack-validate.js) and does its
 * work at module scope; a cycle would run that work before delve-maps.js had
 * defined its tables, and the whole game would die in a temporal-dead-zone
 * error. Merge the pack into DELVE_MAPS from the CONSUMER side instead —
 * @see integrationNotes.
 */
import { buildPackMap, safeId, bag } from './map-pack-validate.js';

/**
 * Every pack file, keyed by its path relative to this module. Eager + default
 * import, so `FILES[path]` is the parsed JSON and there is not a promise in
 * sight. Under plain Node (a dev script) `import.meta.glob` does not exist —
 * which is why dev/check-maps.mjs reads the same directory with `fs` and
 * shares only the VALIDATOR, never this file.
 */
const FILES = import.meta.glob('../../content/maps/*.json', { eager: true, import: 'default' });

/** 'content/maps/hollowvein.json' → 'hollowvein'. */
const stemOf = (path) => path.slice(path.lastIndexOf('/') + 1).replace(/\.json$/, '');

/**
 * THE PACK, BUILT.
 *
 * Two passes, because a portal is a cross-file fact: the first pass learns
 * every id the pack defines (from the FILENAMES, which are the ids — so a
 * file that lies about its own id is caught by the second pass rather than
 * quietly defining the map it claims to be), the second validates and builds.
 */
function loadPack() {
  const stems = [];
  for (const path of Object.keys(FILES).sort()) {
    const stem = stemOf(path);
    if (!safeId(stem)) {
      throw new Error(`map pack: '${path}' is not a legal map filename — an id is [a-z0-9-]+ and never __proto__/constructor/prototype`);
    }
    stems.push([path, stem]);
  }
  const ids = new Set(stems.map(([, s]) => s));

  const byId = bag();
  const byKind = bag();
  for (const [path, stem] of stems) {
    // buildPackMap throws with every fault in the file, named.
    const map = buildPackMap(FILES[path], stem, { ids });
    byId[stem] = map;
    (byKind[map.kind] || (byKind[map.kind] = bag()))[stem] = map;
  }
  return { byId, byKind, ids };
}

const PACK = loadPack();

/**
 * The maps grouped by kind — `MAP_PACK.delve.hollowvein`, `MAP_PACK.arena.…`.
 * Prototype-less at both levels: no map id, however hostile, can reach
 * Object.prototype (the guard map-editor.js's `freeId` makes by renaming, and
 * that a pack file cannot make by renaming, because its name is its id).
 *
 * A kind with no maps is simply absent, so read it as `MAP_PACK.arena || {}`.
 */
export const MAP_PACK = PACK.byKind;

/** Every pack map by id, kind ignored — for the loaders that just want a chart. */
export const PACK_MAPS = PACK.byId;

/** The ids the pack defines, in sorted order. */
export const PACK_IDS = [...PACK.ids].sort();

/** One map by id, or null. Never returns anything off Object.prototype. */
export function packMap(id) {
  return (typeof id === 'string' && Object.prototype.hasOwnProperty.call(PACK_MAPS, id)) ? PACK_MAPS[id] : null;
}

/** Every map of one kind, as a plain object (empty when the kind is unused). */
export function packOfKind(kind) {
  return (typeof kind === 'string' && Object.prototype.hasOwnProperty.call(MAP_PACK, kind)) ? MAP_PACK[kind] : bag();
}
