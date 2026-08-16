/**
 * THE MAP PACK, AUDITED — run after authoring, editing or generating a map:
 *
 *     node dev/check-maps.mjs [dir]        (default: content/maps)
 *
 * Three duties, in the shape check-volumes.mjs / check-levels.mjs already set:
 *
 * 1. THE SCHEMA. Every `content/maps/<id>.json` is the pinned pack shape and
 *    nothing else — id matches its filename, rows are equal length, the kind
 *    and theme exist, portals land somewhere, every prop names art that has a
 *    ladder rung, and NO prop authors a width. The rule set is imported from
 *    src/guild/map-pack-validate.js, which is the same module the game's
 *    loader (src/guild/map-pack.js) gates on — so this script cannot pass a
 *    file the game would reject, or reject one the game would take.
 *
 * 2. THE WALK. Every delve-kind map goes through the height model's own lint
 *    — climbs that serve nothing, pits with no way out, decks nothing can
 *    step onto, a flag that wakes up under a bridge — asked OF the model
 *    (makeLevelModel) rather than of raw char adjacency, and through
 *    delve-maps.js's own `validateMap` besides.
 *
 * 3. THE LADDER, AGAINST WHAT SHIPPED. Where a pack file carries an id that
 *    delve-maps.js still ships, every prop's DERIVED width is compared to the
 *    width that chart AUTHORS. The pack carries no `w`, so this is the proof
 *    that dropping the authored one loses nothing: derived must equal
 *    authored, everywhere, or the migration is not what it claims to be.
 *
 * It reads the JSON with plain `fs` — no Vite, no bundler, no glob — because
 * a check that needs the build to run is a check nobody runs. (It does import
 * the game's real tables, which reach `import.meta.env` through art.js, so it
 * registers dev/vite-env-hook.mjs itself rather than making the caller
 * remember `--import`.)
 *
 * Exits non-zero on any failure.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { register } from 'node:module';

register('./vite-env-hook.mjs', import.meta.url);

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const DIR = resolvePath(process.argv[2] || join(ROOT, 'content', 'maps'));

const { DELVE_MAPS, makeLevelModel, validateMap, CLIMB_CH, DECK_CH } =
  await import(new URL('../src/guild/delve-maps.js', import.meta.url));
const { checkPackMap, buildPackMap, lintDelveMap, PACK_KINDS } =
  await import(new URL('../src/guild/map-pack-validate.js', import.meta.url));
const { lawfulWidth } = await import(new URL('../src/guild/prop-width.js', import.meta.url));

const problems = [];
const advice = [];
const ok = (m) => console.log('  ok  ' + m);
const fail = (m) => { problems.push(m); console.log('  FAIL ' + m); };
const note = (m) => { advice.push(m); console.log('  ..   ' + m); };

// ── The pack itself ────────────────────────────────────────────────────────

if (!existsSync(DIR)) {
  console.log(`check-maps: no map pack yet — ${DIR} does not exist. Nothing to check.`);
  process.exit(0);
}
const files = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
if (!files.length) {
  console.log(`check-maps: no map pack yet — ${DIR} holds no .json. Nothing to check.`);
  process.exit(0);
}

const stems = files.map((f) => f.replace(/\.json$/, ''));
const ids = new Set(stems);
console.log(`check-maps: ${files.length} map${files.length === 1 ? '' : 's'} in ${DIR}\n`);

const built = new Map();

for (const file of files) {
  const stem = file.replace(/\.json$/, '');
  console.log(file);
  let raw;
  try {
    raw = JSON.parse(readFileSync(join(DIR, file), 'utf8'));
  } catch (err) {
    fail(`${file}: not parseable JSON — ${err.message}`);
    continue;
  }

  const { errors, warnings } = checkPackMap(raw, stem, { ids });
  for (const e of errors) fail(`${file}: ${e}`);
  for (const w of warnings) note(`${file}: ${w}`);
  if (errors.length) continue;

  const map = buildPackMap(raw, stem, { ids });
  built.set(stem, map);
  const dims = `${map.grid[0].length}×${map.grid.length}`;
  const counts = ['props', 'portals', 'spawns', 'locks', 'paint', 'regions']
    .filter((k) => (map[k] || []).length)
    .map((k) => `${(map[k] || []).length} ${k}`);
  ok(`${map.kind} '${map.id}' · theme ${map.theme} · ${dims}${counts.length ? ' · ' + counts.join(', ') : ''}`);

  // Every derived width, printed — the fact the file is no longer allowed to
  // carry, so the only place to read it is here.
  for (const p of map.props || []) ok(`  ${p.art.padEnd(16)} w ${String(p.w).padStart(3)}  (derived)`);
}

// ── The walk ───────────────────────────────────────────────────────────────
// A pack map's portal may name a shipped chart, so resolution looks in both.

const resolveMap = (id) => built.get(id) || DELVE_MAPS[id] || null;

console.log('\nthe walk:');
for (const [stem, map] of built) {
  if (map.kind !== 'delve') { note(`${stem}: kind '${map.kind}' — no height model to lint (delve only)`); continue; }

  // delve-maps.js's own validateMap, with its console.warn captured: it is
  // the shipping validator and its warnings are the shipping severity.
  const warned = [];
  const realWarn = console.warn;
  console.warn = (...a) => warned.push(a.join(' '));
  try { validateMap(map); } catch (err) { fail(`${stem}: validateMap threw — ${err.message}`); }
  finally { console.warn = realWarn; }
  for (const w of warned) note(w);

  const issues = lintDelveMap(map, { makeLevelModel, CLIMB_CH, DECK_CH, resolve: resolveMap });
  if (!issues.length) ok(`${stem}: the walk resolves — every climb serves, every deck mounts, every pit has a way out`);
  for (const i of issues) fail(`${stem}: ${i}`);
}

// ── The ladder, against what shipped ───────────────────────────────────────

console.log('\nthe ladder, against the shipped charts:');
let compared = 0, matchedProps = 0;
for (const [stem, map] of built) {
  const shipped = DELVE_MAPS[stem];
  if (!shipped || !Array.isArray(shipped.props) || !shipped.props.length) continue;
  compared++;
  // Same prop, same place — matched by (art, x, y), because order is not a
  // fact about a chart and a pack generator is free to sort.
  const key = (p) => `${p.art}@${p.x},${p.y}`;
  const authored = new Map(shipped.props.map((p) => [key(p), p]));
  for (const p of map.props || []) {
    const a = authored.get(key(p));
    if (!a) { note(`${stem}: prop ${key(p)} is not in the shipped chart (a new placement, or a moved one)`); continue; }
    const derived = lawfulWidth(p.art);
    if (a.w !== derived) {
      fail(`${stem}: '${p.art}' — the chart authors w ${a.w}, the ladder derives ${derived}. `
        + 'Report it; do NOT add an override field and do NOT re-author the shipped chart.');
    } else matchedProps++;
  }
  for (const a of shipped.props) {
    if (!(map.props || []).some((p) => key(p) === key(a))) note(`${stem}: shipped prop ${key(a)} is absent from the pack file`);
  }
  // The fields the pack is supposed to carry through UNCHANGED. A difference
  // is not automatically wrong (a pack map may be an edit), but it is never
  // something to find out about later.
  for (const k of ['theme', 'name', 'exitStairs']) {
    const s = shipped[k], m = map[k];
    if ((s === undefined) !== (m === undefined) || (s !== undefined && s !== m)) {
      note(`${stem}: ${k} is ${JSON.stringify(m)} in the pack, ${JSON.stringify(s)} in the shipped chart`);
    }
  }
  if (shipped.grid.join('\n') !== map.grid.join('\n')) note(`${stem}: the grid differs from the shipped chart`);
  if (JSON.stringify(shipped.entry) !== JSON.stringify(map.entry)) {
    note(`${stem}: entry is ${JSON.stringify(map.entry)} in the pack, ${JSON.stringify(shipped.entry)} in the shipped chart`);
  }
}
if (compared) ok(`${matchedProps} prop width${matchedProps === 1 ? '' : 's'} across ${compared} chart${compared === 1 ? '' : 's'} derive EXACTLY what the shipped chart authors`);
else note('no pack map shares an id with a shipped chart — nothing to compare the ladder against');

// ── The kinds present ──────────────────────────────────────────────────────

const byKind = {};
for (const m of built.values()) byKind[m.kind] = (byKind[m.kind] || 0) + 1;
console.log('\nkinds: ' + (PACK_KINDS.map((k) => `${k} ${byKind[k] || 0}`).join(' · ')));

console.log();
if (problems.length) {
  console.error(`check-maps: ${problems.length} failure(s)\n`);
  for (const p of problems) console.error('  ✗ ' + p);
  process.exit(1);
}
console.log(`check-maps: the pack holds — ${built.size} map${built.size === 1 ? '' : 's'}, every id its own filename, `
  + `every width derived from the ladder, every walk resolvable`
  + (advice.length ? `  (${advice.length} note${advice.length === 1 ? '' : 's'} above)` : '') + '.');
