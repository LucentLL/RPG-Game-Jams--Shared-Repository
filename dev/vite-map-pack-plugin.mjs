/**
 * @file THE MAP PACK, OVER HTTP — the drafting table's write-back path.
 *
 * `content/maps/<id>.json` is the map pack: one file per map, filename === id,
 * loaded into the game by src/guild/map-pack.js and audited by
 * dev/check-maps.mjs. Until now the map EDITOR could not touch it. Drafts lived
 * in localStorage under 'crucible.editorMaps', and the only bridge to the repo
 * was a textarea full of JSON and a human pasting it — which is the whole
 * reason map-editor.js carries a structural refusal to edit a live map
 * (`SHIPPED`, map-editor.js:33). Not because editing one is wrong, but because
 * there was nowhere for the edit to GO.
 *
 * This is where it goes. A map the user edits and a map Claude edits are then
 * the same file, reviewed as a diff and reverted as a revert.
 *
 * ── IT OWNS NO RULES ──────────────────────────────────────────────────────
 *
 * There is ONE validator — src/guild/map-pack-validate.js — and the game's
 * loader, the CLI audit and this endpoint all gate on it. That is deliberate
 * and load-bearing: an endpoint with its own opinion about the schema is an
 * endpoint that can write a file the game then refuses to load. So this file
 * holds exactly three things the validator cannot: the HTTP verbs, the
 * path-traversal defence, and the byte layout on disk (schema key order,
 * empty arrays omitted, two-space indent, trailing newline — identical to
 * dev/migrate-maps.mjs:273, so a PUT and a migration produce the same bytes).
 *
 * The validator reaches `import.meta.env` through art.js, which plain Node has
 * no idea about. Two ways in, injected rather than assumed:
 *   · under Vite — `server.ssrLoadModule`, which transforms it the same way
 *     the browser's copy is transformed;
 *   · standalone (this lane's verification, and any future script) — the
 *     dev/vite-env-hook.mjs loader hook, exactly as dev/check-maps.mjs:41
 *     registers it.
 *
 * ── DEV SERVER ONLY, THREE WAYS OVER ──────────────────────────────────────
 *
 *   1. `apply: 'serve'` — Vite never instantiates this plugin for a build.
 *   2. the only hook is `configureServer`, which does not exist in a build;
 *      nothing here resolves, loads or transforms a module, so not one byte of
 *      it can reach a bundle.
 *   3. it lives in dev/, which no file under src/ imports.
 *  The browser half (src/guild/map-repo.js) gates every call on
 *  `import.meta.env.DEV`, which Vite folds to `false` in production — verified
 *  in a built bundle: `repoAvailable` minifies to `function l(){return
 *  Promise.resolve(!1)}`, so the shipped WebGL/Capacitor build keeps the
 *  export/localStorage path exactly as it is today and never emits a request.
 *
 * Wire it up in vite.config.js:
 *
 *     import { mapPackPlugin } from './dev/vite-map-pack-plugin.mjs';
 *     export default defineConfig({ plugins: [mapPackPlugin()], … });
 *
 * The routes, all under /__maps/ and all answering JSON:
 *
 *     GET    /__maps/          → { ok, dir, maps:[{ id, name, kind, theme,
 *                                  cols, rows, bytes, mtime, errors, warnings }] }
 *     GET    /__maps/<id>      → the pack file, verbatim
 *     PUT    /__maps/<id>      → checkPackMap, then write content/maps/<id>.json
 *     DELETE /__maps/<id>      → unlink it
 *
 * A refusal is `{ ok:false, error, problems:[…] }` with 4xx, where `problems`
 * is checkPackMap's full error list — the editor toasts `error` and consoles
 * the rest, so a rejected save says WHY on the drafting table rather than in a
 * console nobody has open. A refusal NEVER touches the file on disk.
 */
import { readFile, writeFile, readdir, unlink, mkdir, stat } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve, sep } from 'node:path';

/** The repo root, from this file's own location (dev/ → ..). */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Everything this middleware answers hangs off here. */
export const PREFIX = '/__maps/';

/**
 * THE ID RULE, and the whole of the path-traversal defence.
 *
 * Mirrors src/guild/map-pack-validate.js's ID_RE and BAD_IDS — duplicated here
 * ONLY because the path has to be resolved before the validator (which is an
 * async import) is available, and because a middleware must be able to refuse
 * a hostile URL without loading anything at all. `[a-z0-9-]+` has no '.', no
 * '/', no '\' and no ':' in it, so a legal id cannot name a parent directory,
 * a drive, an alternate stream or a dotfile: the filename IS the id.
 * `packPath()` then re-checks the RESOLVED path against the maps directory
 * anyway, because a single guard is a guard you can be talked out of.
 */
export const ID_RE = /^[a-z0-9-]+$/;
/** @see map-pack-validate.js BAD_IDS — 'constructor' and 'prototype' both
 *  match ID_RE and must still never key an object. */
export const BAD_IDS = ['__proto__', 'constructor', 'prototype'];

/** How large a map is allowed to be on the wire. A 128×128 chart with every
 *  array full is well under 400 KB; this is the "something is wrong" ceiling. */
export const MAX_BODY = 4 * 1024 * 1024;

export const mapsDir = (root = REPO_ROOT) => join(resolve(root), 'content', 'maps');

/**
 * The file an id names, or null if the id is not one.
 *
 * Two independent refusals: the id must be legal, and the RESOLVED path must
 * sit directly inside content/maps. Nothing outside that directory is
 * reachable through this endpoint under any input.
 */
export function packPath(id, root = REPO_ROOT) {
  if (typeof id !== 'string' || !ID_RE.test(id) || BAD_IDS.includes(id)) return null;
  const dir = mapsDir(root);
  const p = resolve(dir, id + '.json');
  if (p !== join(dir, id + '.json')) return null;
  if (!p.startsWith(dir + sep)) return null;
  return p;
}

// ---------------------------------------------------------------------------
// The one validator, loaded two ways
// ---------------------------------------------------------------------------

let _standalone = null;
/**
 * Load src/guild/map-pack-validate.js in plain Node, under the same env hook
 * dev/check-maps.mjs registers. Used only when no `loadValidator` is injected
 * — inside Vite the plugin always passes `server.ssrLoadModule`, because
 * installing a process-wide loader hook in someone's dev server is rude.
 */
async function standaloneValidator(root) {
  if (_standalone) return _standalone;
  const { register } = await import('node:module');
  register('./vite-env-hook.mjs', pathToFileURL(join(root, 'dev', 'x')).href);
  _standalone = await import(pathToFileURL(join(root, 'src', 'guild', 'map-pack-validate.js')).href);
  return _standalone;
}

// ---------------------------------------------------------------------------
// On disk
// ---------------------------------------------------------------------------

/**
 * The bytes a pack file is written as.
 *
 * Schema key ORDER (map-pack-validate.js's MAP_KEYS), empty arrays omitted —
 * "arrays are omitted when empty" is the schema's own line and checkPackMap
 * warns on an empty one — two-space indent, trailing newline. Identical to
 * dev/migrate-maps.mjs:273, so a save and a migration are byte-for-byte the
 * same file and a re-save shows up as no diff at all.
 *
 * Nothing is dropped here: checkPackMap has already refused any key MAP_KEYS
 * does not list, so re-keying cannot lose an author's data.
 */
export function packText(m, MAP_KEYS, ARRAY_KEYS) {
  const out = {};
  for (const k of MAP_KEYS) {
    if (!(k in m)) continue;
    if (ARRAY_KEYS.includes(k) && Array.isArray(m[k]) && !m[k].length) continue;
    out[k] = m[k];
  }
  return JSON.stringify(out, null, 2) + '\n';
}

/** Every id the pack currently defines — checkPackMap needs it to resolve a
 *  portal that leads to a sibling file rather than to a shipped chart. */
async function packIds(dir) {
  try {
    return new Set((await readdir(dir))
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.slice(0, -5))
      .filter((s) => ID_RE.test(s) && !BAD_IDS.includes(s)));
  } catch (e) {
    if (e.code === 'ENOENT') return new Set();
    throw e;
  }
}

// ---------------------------------------------------------------------------
// HTTP plumbing
// ---------------------------------------------------------------------------

function json(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((ok, no) => {
    let n = 0;
    const chunks = [];
    req.on('data', (c) => {
      n += c.length;
      if (n > MAX_BODY) { no(new Error(`body over ${MAX_BODY} bytes`)); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => ok(Buffer.concat(chunks).toString('utf8')));
    req.on('error', no);
  });
}

/** One line of the Open dialog's list. Carries the validator's verdict so the
 *  editor can mark a file the game would currently refuse to load — the pack
 *  has three of those today (see this lane's findings). */
async function summarize(dir, file, check, ids) {
  const id = file.slice(0, -5);
  const full = join(dir, file);
  let st;
  try { st = await stat(full); } catch (e) { return null; }
  let m = null, errors = [], warnings = [];
  try { m = JSON.parse(await readFile(full, 'utf8')); }
  catch (e) { errors = ['not JSON: ' + String(e.message || e)]; }
  if (m) {
    try { ({ errors, warnings } = check(m, id, { ids })); }
    catch (e) { errors = [String(e.message || e)]; }
  }
  const grid = m && Array.isArray(m.grid) ? m.grid : [];
  return {
    id,
    name: (m && typeof m.name === 'string' && m.name) || id,
    kind: (m && m.kind) || '',
    theme: (m && m.theme) || '',
    cols: grid.length && typeof grid[0] === 'string' ? grid[0].length : 0,
    rows: grid.length,
    bytes: st.size,
    mtime: st.mtimeMs,
    errors,
    warnings,
  };
}

/**
 * The connect-style middleware, standalone so it can be exercised without Vite
 * — which is how this lane verified it: a bare node:http server with this
 * mounted, then PUT/GET/DELETE against a scratch map.
 *
 * @param {{root?:string, loadValidator?:()=>Promise<object>}} opts
 */
export function createMapPackMiddleware(opts = {}) {
  const root = resolve(opts.root || REPO_ROOT);
  const dir = mapsDir(root);
  const validator = opts.loadValidator || (() => standaloneValidator(root));

  return async function mapPackMiddleware(req, res, next) {
    let path;
    try { path = new URL(req.url, 'http://localhost').pathname; }
    catch (e) { return next(); }
    if (path !== PREFIX.slice(0, -1) && !path.startsWith(PREFIX)) return next();

    const rest = path === PREFIX.slice(0, -1) ? '' : decodeURIComponent(path.slice(PREFIX.length));
    const method = (req.method || 'GET').toUpperCase();

    try {
      // ── LIST ──────────────────────────────────────────────────────────────
      if (!rest) {
        if (method !== 'GET' && method !== 'HEAD') {
          return json(res, 405, { ok: false, error: 'the collection answers GET' });
        }
        let files = [];
        try { files = (await readdir(dir)).filter((f) => f.endsWith('.json')); }
        catch (e) { if (e.code !== 'ENOENT') throw e; }     // no pack yet is not an error
        const { checkPackMap } = await validator();
        const ids = await packIds(dir);
        const maps = (await Promise.all(files.sort().map((f) => summarize(dir, f, checkPackMap, ids)))).filter(Boolean);
        return json(res, 200, { ok: true, dir, maps });
      }

      // ── ONE MAP ───────────────────────────────────────────────────────────
      const id = rest.replace(/\/+$/, '');
      const file = packPath(id, root);
      if (!file) {
        return json(res, 400, {
          ok: false,
          error: `'${id}' is not a legal map id`,
          problems: [`a map id is ${ID_RE} and never ${BAD_IDS.join('/')} — no dots, no slashes, no drive letters`],
        });
      }

      if (method === 'GET') {
        let txt;
        try { txt = await readFile(file, 'utf8'); }
        catch (e) { return json(res, 404, { ok: false, error: `no map '${id}' in the pack` }); }
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        return res.end(txt);
      }

      if (method === 'PUT') {
        let body;
        try { body = await readBody(req); }
        catch (e) { return json(res, 413, { ok: false, error: String(e.message || e) }); }
        let m;
        try { m = JSON.parse(body); }
        catch (e) { return json(res, 400, { ok: false, error: 'body is not JSON', problems: [String(e.message || e)] }); }

        const { checkPackMap, MAP_KEYS, ARRAY_KEYS } = await validator();
        const ids = await packIds(dir);
        ids.add(id);                              // a map may portal to itself
        const { errors, warnings } = checkPackMap(m, id, { ids });
        if (errors.length) return json(res, 422, { ok: false, error: errors[0], problems: errors, warnings });

        await mkdir(dir, { recursive: true });
        await writeFile(file, packText(m, MAP_KEYS, ARRAY_KEYS), 'utf8');
        const st = await stat(file);
        return json(res, 200, { ok: true, id, path: file, bytes: st.size, mtime: st.mtimeMs, warnings });
      }

      if (method === 'DELETE') {
        try { await unlink(file); }
        catch (e) {
          if (e.code === 'ENOENT') return json(res, 404, { ok: false, error: `no map '${id}' in the pack` });
          throw e;
        }
        return json(res, 200, { ok: true, id, deleted: true });
      }

      return json(res, 405, { ok: false, error: `${method} is not a thing a map answers` });
    } catch (err) {
      return json(res, 500, { ok: false, error: String((err && err.message) || err) });
    }
  };
}

/**
 * The Vite plugin. `apply: 'serve'` is the load-bearing line — with it, a
 * production build never instantiates this at all.
 */
export function mapPackPlugin(opts = {}) {
  return {
    name: 'crucible-map-pack',
    apply: 'serve',
    configureServer(server) {
      const root = resolve(opts.root || server.config.root || REPO_ROOT);
      // The validator, through Vite's own transform — the same module text the
      // browser gets, so the endpoint and the game cannot disagree.
      const loadValidator = () => server.ssrLoadModule('/src/guild/map-pack-validate.js');
      server.middlewares.use(createMapPackMiddleware({ root, loadValidator }));
      server.config.logger.info(`  ➜  map pack:  ${PREFIX} → ${mapsDir(root)}`);
    },
  };
}

export default mapPackPlugin;
