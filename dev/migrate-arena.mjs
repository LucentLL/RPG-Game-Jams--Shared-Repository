/**
 * THE ARENA FIELDS, MOVED INTO THE MAP PACK — and proved byte-lossless.
 *
 * `ARENA_FIELDS` (src/game/arena-terrain.js:46) is seven 9x9 battlefields
 * authored as bare `{ name, grid }` literals inside a combat module. They have
 * no id, no theme and no entry, which means nothing outside that file can name
 * one, no editor can open one, and no port can pin one. This script lifts them
 * into `content/maps/arena-<slug>.json` under the pinned pack schema — kind
 * "arena", one file per map, filename === id — and then PROVES the move cost
 * nothing by reading the JSON back off disk and running the REAL `readField`
 * over the reconstructed grid.
 *
 *     node --import ./dev/register-vite-env.mjs dev/migrate-arena.mjs
 *     node --import ./dev/register-vite-env.mjs dev/migrate-arena.mjs --check
 *
 * `--check` verifies the shipped JSON against the live module without writing,
 * which is the form a CI step or a pre-commit hook wants.
 *
 * WHAT "PROVED" MEANS HERE. Three separate claims, all asserted every run:
 *
 *   1. THE GRID IS BYTE-LOSSLESS. Row count, row length and every character
 *      code compare identical between the live literal and the JSON. Not a
 *      trimmed compare and not a join — a char-code walk, because a trailing
 *      space in an ASCII map is a cell.
 *   2. THE DERIVED WORLD IS IDENTICAL. `readField()` is run twice — once on
 *      the live `ARENA_FIELDS` entry, once on `{ name, grid }` rebuilt from the
 *      JSON — and every field of its answer is deep-compared: height, pass,
 *      climb, blocksSight, bakeGrid, and the props list with each flat prop's
 *      resolved `face`. This is the claim that matters: the pack is faithful
 *      not because the text matches but because the GAME cannot tell.
 *   3. THE NET HAS TEETH. A mutation self-test runs last: one character of one
 *      round-tripped grid is flipped and the same comparator must report a
 *      failure. A round-trip check that cannot fail is not a check.
 *
 * THREE AUTHORING DECISIONS, MADE ON PURPOSE AND RECORDED HERE BECAUSE JSON
 * CANNOT CARRY A COMMENT:
 *
 *   · `theme` is "meadow", NOT "arena". `mountArenaTerrain`
 *     (arena-terrain.js:442) bakes every field with the theme hardcoded to
 *     'meadow', so meadow is the theme in force today. THEMES.arena (raked
 *     sand under blue-grey ashlar, delve-maps.js:242) exists and is very
 *     probably what these fields want, but swapping it changes what every
 *     battle looks like and that is a playtest, not a migration. Authoring the
 *     live theme means a loader that honours the pack reproduces today's
 *     pixels exactly; the sand fix is then a one-word edit in seven files.
 *   · `entry` is [1.5, 7.5] — the player's fixed spawn corner (crucible.js:3108
 *     and 4606). The opponent's corner (7.5, 1.5) has NO home in the pinned
 *     schema (`spawns` entries carry a `prey` id, which an arena opponent is
 *     not) and has deliberately NOT been invented a field for. It stays where
 *     it lives today.
 *   · `name` is carried, not dropped. It is load-bearing: `pickField` resolves
 *     `window.__arenaPin` by name (arena-terrain.js:354) and `__arenaDebug`
 *     reports it as `field`.
 *
 * NO PROPS ARRAY. An arena's boulders, ladders and vines are not authored
 * objects — `readField` DERIVES them from the 'r'/'L'/'v' characters every
 * time it runs. Writing them into the pack would author the same fact twice
 * and invite the two copies to disagree, so the pack carries the grid and the
 * derivation stays the only source. (Their inline heights are a real finding,
 * reported separately; they are not fixed here.)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// ── The headless shim ───────────────────────────────────────────────────────
// arena-terrain.js imports delve.js, which reaches the DOM at module scope
// (delve.js:2752 assigns `window.__delve`, and its own import chain runs
// `window.addEventListener` in platform/input.js:42). None of that is used by
// ARENA_FIELDS or readField — both are pure — so the honest move is to satisfy
// the module scope and import the REAL module, rather than re-parse its source
// and end up pinning a copy. Everything here is inert.
const noop = () => {};
const el = () => ({
  style: {}, dataset: {}, children: [], isConnected: false,
  classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  appendChild: (c) => c, removeChild: noop, remove: noop,
  setAttribute: noop, getAttribute: () => null,
  addEventListener: noop, removeEventListener: noop,
  querySelector: () => null, querySelectorAll: () => [], getContext: () => null,
});
globalThis.window = {
  addEventListener: noop, removeEventListener: noop,
  matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop }),
  requestAnimationFrame: noop, cancelAnimationFrame: noop,
  devicePixelRatio: 1, innerWidth: 800, innerHeight: 600,
  location: { href: 'file:///' },
  navigator: { userAgent: 'node', maxTouchPoints: 0 },
  localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
};
globalThis.document = {
  createElement: () => el(), createElementNS: () => el(), createTextNode: () => ({}),
  addEventListener: noop, removeEventListener: noop,
  querySelector: () => null, querySelectorAll: () => [], getElementById: () => null,
  body: el(), documentElement: el(), head: el(),
};
Object.defineProperty(globalThis, 'navigator', { value: globalThis.window.navigator, configurable: true });
globalThis.localStorage = globalThis.window.localStorage;
globalThis.requestAnimationFrame = noop;
globalThis.Image = class { set src(_v) { /* never loads under node */ } };

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'content', 'maps');

const { ARENA_FIELDS, readField, canStandAt } =
  await import(new URL('../src/game/arena-terrain.js', import.meta.url));
const { FLOOR_LV, CLIMB_CH, DECK_CH } =
  await import(new URL('../src/guild/delve-maps.js', import.meta.url));

const CHECK_ONLY = process.argv.includes('--check');

/** Pack ids are [a-z0-9-]+ and the file is named for the id. The `arena-`
 *  prefix is not decoration: `arena` is already a DELVE chart id (The Sparring
 *  Ring, delve-maps.js:781), and content/maps/arena.json belongs to it. */
const slug = (name) => 'arena-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** The one theme these fields actually bake with today. @see the header. */
const LIVE_THEME = 'meadow';
/** The player's spawn corner, from crucible.js. @see the header. */
const ENTRY = [1.5, 7.5];

// ── The conversion ──────────────────────────────────────────────────────────
/** One ARENA_FIELDS entry → one pack object. Optional arrays stay OMITTED
 *  (schema rule), and no width, height or volume is authored anywhere. */
function toPack(field) {
  return {
    schema: 1,
    kind: 'arena',
    id: slug(field.name),
    name: field.name,
    theme: LIVE_THEME,
    grid: field.grid.slice(),
    entry: ENTRY.slice(),
  };
}

// ── The proof ───────────────────────────────────────────────────────────────
/** Char-code equality of two ASCII grids. Not `join('\n') ===`: this reports
 *  WHICH cell drifted, which is the difference between a failing check and a
 *  useful one. */
function gridDiff(live, back) {
  if (live.length !== back.length) return [`row count ${live.length} → ${back.length}`];
  const bad = [];
  for (let y = 0; y < live.length; y++) {
    if (live[y].length !== back[y].length) { bad.push(`row ${y} length ${live[y].length} → ${back[y].length}`); continue; }
    for (let x = 0; x < live[y].length; x++) {
      if (live[y].charCodeAt(x) !== back[y].charCodeAt(x)) {
        bad.push(`(${x},${y}) '${live[y][x]}' (${live[y].charCodeAt(x)}) → '${back[y][x]}' (${back[y].charCodeAt(x)})`);
      }
    }
  }
  return bad;
}

/** Deep-compare two readField() results, field by named field. Returns the
 *  names that differ — the whole derived world, not a spot check. */
function fieldDiff(a, b) {
  const bad = [];
  for (const k of ['name', 'cols', 'rows', 'height', 'pass', 'climb', 'blocksSight', 'bakeGrid', 'props']) {
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) bad.push(k);
  }
  // Anything readField grows later must not slip through the list above.
  const extra = Object.keys(a).filter((k) => ![
    'name', 'cols', 'rows', 'height', 'pass', 'climb', 'blocksSight', 'bakeGrid', 'props',
  ].includes(k));
  for (const k of extra) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) bad.push(k + ' (unlisted)');
  if (extra.length) bad.push(`!! readField grew fields this script does not name: ${extra.join(', ')}`);
  return bad;
}

/** THE DELVE'S OWN GRID VOCABULARY, assembled from the shipped tables rather
 *  than typed out — so this test cannot go stale behind delve-maps.js. */
const DELVE_VOCAB = new Set([
  '.', ...Object.keys(FLOOR_LV), ...Object.keys(CLIMB_CH), ...Object.keys(DECK_CH),
  '#', 'B', 'b', 'F', 'D', 'K', 'o', 'f', 'r', 't', 'm', 's', 'd', 'w', 'S',
]);

const fails = [];
const rows = [];
if (!CHECK_ONLY && !existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

for (const field of ARENA_FIELDS) {
  const pack = toPack(field);
  const file = join(OUT_DIR, pack.id + '.json');
  if (!CHECK_ONLY) writeFileSync(file, JSON.stringify(pack, null, 2) + '\n');
  if (!existsSync(file)) { fails.push(`${pack.id}: ${file} does not exist`); continue; }

  // Read it back the way a loader would — off disk, through JSON.parse.
  const back = JSON.parse(readFileSync(file, 'utf8'));

  // Claim 0: the pack shape itself.
  if (back.schema !== 1) fails.push(`${pack.id}: schema ${back.schema}`);
  if (back.kind !== 'arena') fails.push(`${pack.id}: kind ${back.kind}`);
  if (!/^[a-z0-9-]+$/.test(back.id)) fails.push(`${pack.id}: id is not [a-z0-9-]+`);
  if (back.id !== pack.id) fails.push(`${pack.id}: id/filename mismatch (${back.id})`);
  if (back.theme !== LIVE_THEME) fails.push(`${pack.id}: theme ${back.theme} (the bake uses '${LIVE_THEME}')`);
  if (back.name !== field.name) fails.push(`${pack.id}: name '${back.name}' !== '${field.name}'`);
  for (const k of ['props', 'portals', 'spawns', 'regions', 'paint', 'locks', 'exitStairs']) {
    if (k in back) fails.push(`${pack.id}: authored an empty/needless '${k}'`);
  }

  // Claim 1: the grid is byte-lossless.
  const gd = gridDiff(field.grid, back.grid);
  for (const d of gd) fails.push(`${pack.id}: grid ${d}`);

  // Claim 2: the derived world is identical.
  const live = readField(field);
  const rebuilt = readField({ name: back.name, grid: back.grid });
  const fd = fieldDiff(live, rebuilt);
  for (const d of fd) fails.push(`${pack.id}: readField.${d} differs`);

  // The entry has to be somewhere a body can actually stand.
  if (!canStandAt(rebuilt, back.entry[0], back.entry[1])) {
    fails.push(`${pack.id}: entry [${back.entry}] is not legal footing`);
  }

  // The vocabulary claim, per chart.
  const alien = [...new Set(back.grid.join(''))].filter((c) => !DELVE_VOCAB.has(c));
  if (alien.length) fails.push(`${pack.id}: chars outside the delve vocabulary: ${alien.join(' ')}`);

  rows.push({
    id: pack.id, name: field.name, cells: back.grid.length * back.grid[0].length,
    props: live.props.length, ok: !gd.length && !fd.length,
  });
}

// Claim 3: the comparator can fail. Flip one character of a round-tripped grid
// and demand the same two checks catch it — a green light nothing can turn red
// is a decoration. One mutation per CHANNEL readField publishes, so a check
// that has quietly stopped watching passability (or climbs, or sight) says so.
const teeth = [];
{
  const f = ARENA_FIELDS[0];                       // Broken Ridge
  const MUTATIONS = [
    { x: 3, y: 3, ch: '.', why: "ledge → ground", want: ['height', 'bakeGrid'] },
    { x: 5, y: 1, ch: '.', why: "boulder → ground", want: ['pass', 'blocksSight', 'props'] },
    { x: 2, y: 4, ch: '.', why: "ladder → ground", want: ['climb', 'props'] },
  ];
  for (const m of MUTATIONS) {
    const mutated = f.grid.slice();
    mutated[m.y] = mutated[m.y].slice(0, m.x) + m.ch + mutated[m.y].slice(m.x + 1);
    const gd = gridDiff(f.grid, mutated);
    const fd = fieldDiff(readField(f), readField({ name: f.name, grid: mutated }));
    const missed = m.want.filter((k) => !fd.includes(k));
    const ok = gd.length && !missed.length;
    teeth.push(`  ${ok ? 'caught' : 'MISSED'} (${m.x},${m.y}) ${m.why} → grid ${gd[0] || 'NOTHING'}; readField ${fd.join(', ') || 'NOTHING'}`);
    if (!ok) fails.push(`mutation self-test (${m.x},${m.y}) ${m.why}: unwatched channel(s) ${missed.join(', ') || '—'}`);
  }
}

// ── The report ──────────────────────────────────────────────────────────────
console.log(CHECK_ONLY ? 'CHECKING content/maps/arena-*.json' : 'WROTE content/maps/arena-*.json');
for (const r of rows) {
  console.log(`  ${r.ok ? 'ok  ' : 'FAIL'} ${r.id.padEnd(22)} ${String(r.cells).padStart(3)} cells  ${String(r.props).padStart(2)} derived props  "${r.name}"`);
}
console.log('mutation self-test:');
for (const t of teeth) console.log(t);
if (fails.length) {
  console.error(`\n${fails.length} FAILURE(S):`);
  for (const f of fails) console.error('  ' + f);
  process.exit(1);
}
console.log(`\n${rows.length}/${ARENA_FIELDS.length} fields round-trip byte-for-byte, and readField cannot tell the pack from the literal.`);
