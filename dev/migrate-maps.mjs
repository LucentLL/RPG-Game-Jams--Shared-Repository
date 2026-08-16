/**
 * THE CHARTS, MOVED OUT OF SOURCE — a one-shot migration into the map pack.
 *
 * Every shipped delve chart lives in `src/guild/delve-maps.js` as an object
 * literal today, which means the only way to author a map is to edit a module
 * the game imports. This writes each one out to `content/maps/<id>.json` in the
 * pinned pack schema, so a chart becomes DATA and the editor's output and the
 * shipped world stop being two different kinds of thing.
 *
 * It runs the REAL module (imported whole under the Vite env hook — delve-maps
 * pulls campus.js → art.js, which reads `import.meta.env`), so what is written
 * is what the game holds, not a copy of it.
 *
 *     node --import ./dev/register-vite-env.mjs dev/migrate-maps.mjs
 *
 * ── THE ONE HARD RULE: A WIDTH CANNOT BE AUTHORED ─────────────────────────
 *
 * The pack carries NO prop `w`. Width is DERIVED at load from the ladder —
 *
 *     w = round((form === 'lie' ? d : h) × (art.w / art.h) × 48)
 *
 * — and this script does not own a copy of that line. It IMPORTS
 * src/guild/prop-width.js `lawfulWidth`, the single authority the editor, the
 * prop bench, check-volumes and the Unity fixture all now read. A migration
 * that re-typed the arithmetic would be proving the pack against its own
 * second opinion. ONE SIZE FACT (CLAUDE.md) says an
 * object's relative size is identical in every lens and the chart width IS
 * that fact; authoring it a second time beside the height it comes from is how
 * an anvil came to stand eye-high. Dropping the field is that law made
 * STRUCTURAL: there is no longer a slot for a width to drift in.
 *
 * So before a `w` is dropped, it is PROVED redundant: the derivation must
 * reproduce the authored number EXACTLY (not within check-volumes' ±1px
 * authoring tolerance — exactly, because the whole claim is that the file's
 * number carries no information). Any prop where the two differ is printed in
 * a table and the migration REFUSES to write that chart. Neither side is
 * "fixed" here: a mismatch is a finding about the shipped chart or about
 * prop-volume.js, and it belongs to whoever owns those.
 *
 * ── ROUND TRIP ────────────────────────────────────────────────────────────
 *
 * Writing a file is not evidence. Every written file is read back, its props'
 * widths re-derived, and the result deep-compared against the live chart
 * object — PASS/FAIL per chart, with the first differing path named. Two
 * normalizations are applied to BOTH sides and are the only licensed
 * differences (see NORMALIZE below): an empty array is dropped, and an
 * `undefined` value is dropped.
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'content', 'maps');

const { DELVE_MAPS, makeLevelModel, wetCells, waterDepths } =
  await import(new URL('../src/guild/delve-maps.js', import.meta.url));
const { PROP_VOL } = await import(new URL('../src/guild/prop-volume.js', import.meta.url));
const { ART } = await import(new URL('../src/guild/art.js', import.meta.url));
// THE derivation — imported, not re-typed. @see the header, and prop-width.js's
// own note that "the map pack adds a fifth caller".
const { lawfulWidth } = await import(new URL('../src/guild/prop-width.js', import.meta.url));

// ── What the schema knows about ────────────────────────────────────────────
// Listed rather than spread, so a key the pack has no slot for is a LOUD
// finding instead of a field that silently fails to make the crossing.
// Order here is the order written to the file.
const CHART_KEYS = [
  'id', 'name', 'theme', 'grid', 'entry', 'exitStairs',
  'water', 'props', 'portals', 'spawns', 'regions', 'paint', 'locks',
];
const PROP_KEYS = ['art', 'x', 'y', 'use', 'label', 'cls'];
const PORTAL_KEYS = ['x', 'y', 'to', 'at', 'enter', 'stairs'];
const SPAWN_KEYS = ['prey', 'x', 'y'];
// Keys carried by shipped charts that the PINNED SCHEMA does not name. Not
// invented here — authored in delve-maps.js and load-bearing (see the report
// at the end). Carried verbatim and reported; dropping them would make the
// migration lossy, which is the one thing it may not be.
const OFF_SCHEMA = { chart: ['water'], prop: ['cls'] };

// Charts deliberately NOT written, with the reason. A skip is a decision and
// has to read like one.
const SKIP = {
  campus: 'a null PLACEHOLDER (delve-maps.js:778) — mapForLocale swaps it for a '
    + 'live buildCampusMap() derivation every time it is asked for. There is no chart here to move.',
  propbench: 'GENERATED from PROP_VOL at import time (delve-maps.js:577-623) and '
    + 'grows whenever a prop is authored. Freezing it into a file is precisely the staleness '
    + 'its own doc comment exists to prevent ("a list typed out by hand goes stale the first '
    + 'time somebody adds a prop"). It stays a function.',
};

// ── Structural comparison ──────────────────────────────────────────────────
/** First differing path between two values, or null. Key ORDER is not a
 *  difference (keys are sorted); everything else is. */
function diff(a, b, path = '$') {
  if (a === b) return null;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return `${path}: array vs ${typeof b}`;
    if (a.length !== b.length) return `${path}: length ${a.length} vs ${b.length}`;
    for (let i = 0; i < a.length; i++) { const d = diff(a[i], b[i], `${path}[${i}]`); if (d) return d; }
    return null;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
    if (ka.join(',') !== kb.join(',')) return `${path}: keys {${ka.join(',')}} vs {${kb.join(',')}}`;
    for (const k of ka) { const d = diff(a[k], b[k], `${path}.${k}`); if (d) return d; }
    return null;
  }
  return `${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`;
}

/**
 * NORMALIZE — the only two differences the round trip licenses, applied to
 * both sides so neither can hide behind them.
 *   · an EMPTY ARRAY is dropped. The pack omits empty arrays and every shipped
 *     loader already tolerates the key being absent (hollowvein has no `props`
 *     at all), so `spawns: []` and no spawns key are the same map. Only
 *     `library` is affected.
 *   · an UNDEFINED value is dropped — JSON has no such value to write.
 * Nothing else: a 0, a false, an empty string all survive as themselves.
 */
function normalize(v) {
  if (Array.isArray(v)) return v.map(normalize);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v)) {
      const x = v[k];
      if (x === undefined) continue;
      if (Array.isArray(x) && x.length === 0) continue;
      out[k] = normalize(x);
    }
    return out;
  }
  return v;
}

// ── Pass 1: the width proof ────────────────────────────────────────────────
const drift = [];        // props whose authored w does not reproduce
const strays = [];       // keys with nowhere to go in the pack
const written = [];
const skipped = [];

function unknownKeys(obj, known, where) {
  for (const k of Object.keys(obj)) if (!known.includes(k)) strays.push(`${where}.${k}`);
}

console.log('MIGRATING THE DELVE CHARTS INTO content/maps/\n');
console.log('chart          props  widths derived  off-schema keys');
console.log('-'.repeat(72));

const packs = new Map();
for (const [key, chart] of Object.entries(DELVE_MAPS)) {
  if (SKIP[key] || !chart) { skipped.push([key, SKIP[key] || 'null']); continue; }
  unknownKeys(chart, CHART_KEYS, key);
  if (chart.id !== key) strays.push(`${key}: id is '${chart.id}' — filename stem must equal id`);

  const off = [];
  for (const k of OFF_SCHEMA.chart) if (chart[k] !== undefined) off.push(k);

  const props = (chart.props || []).map((p) => {
    unknownKeys(p, PROP_KEYS.concat('w'), `${key}.props[${p.art}]`);
    for (const k of OFF_SCHEMA.prop) if (p[k] !== undefined && !off.includes('prop:' + k)) off.push('prop:' + k);
    const derived = lawfulWidth(p.art);
    if (derived == null) {
      drift.push({ chart: key, art: p.art, authored: p.w, derived: 'UNDERIVABLE',
        why: !PROP_VOL[p.art] ? 'no PROP_VOL entry' : 'no ART crop' });
    } else if (derived !== p.w) {
      drift.push({ chart: key, art: p.art, authored: p.w, derived, why: `off by ${p.w - derived}px` });
    }
    const out = {};
    for (const k of PROP_KEYS) if (p[k] !== undefined) out[k] = p[k];
    return out;
  });
  for (const p of chart.portals || []) unknownKeys(p, PORTAL_KEYS, `${key}.portals`);
  for (const s of chart.spawns || []) unknownKeys(s, SPAWN_KEYS, `${key}.spawns`);

  const pack = { schema: 1, kind: 'delve' };
  for (const k of CHART_KEYS) {
    const v = k === 'props' ? props : chart[k];
    if (v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    pack[k] = v;
  }
  packs.set(key, pack);
  console.log(key.padEnd(15) + String(props.length).padStart(5)
    + String(props.filter((p) => lawfulWidth(p.art) != null).length).padStart(8) + '        '
    + (off.length ? off.join(' ') : '—'));
}

console.log('-'.repeat(72));
for (const [k, why] of skipped) console.log(`SKIPPED ${k} — ${why}`);

// ── The width table. A drift stops the migration for that chart. ───────────
console.log('\nTHE WIDTH PROOF — every authored w must reproduce from the ladder, exactly.');
if (drift.length) {
  console.log('\n** THESE DO NOT. Neither side touched; this is a finding, not a fixup:\n');
  console.log('  chart          art               authored  derived  ');
  for (const d of drift) {
    console.log('  ' + d.chart.padEnd(15) + d.art.padEnd(18)
      + String(d.authored).padStart(8) + String(d.derived).padStart(9) + '   ' + d.why);
  }
  console.log('\n  Charts containing a drifted prop are NOT written.');
} else {
  const n = [...packs.values()].reduce((s, p) => s + (p.props || []).length, 0);
  console.log(`  all ${n} props across ${packs.size} charts: derived === authored, exactly. `
    + 'Every `w` in the source carries zero information and is dropped.');
}
const blocked = new Set(drift.map((d) => d.chart));

if (strays.length) {
  console.log('\n** KEYS WITH NOWHERE TO GO IN THE PACK (nothing written for their charts):');
  for (const s of strays) console.log('   ' + s);
  for (const s of strays) blocked.add(s.split(/[.:]/)[0]);
}

// ── THE DERIVED WORLD ──────────────────────────────────────────────────────
/**
 * Everything the shared model answers about a chart, flattened. Run over the
 * live chart and over the one rebuilt from JSON, this is the claim that
 * actually matters: not that the text matches, but that every rules question
 * the game asks gets the same answer — floor and deck heights, the surfaces a
 * body may stand on, and THE STEP LAW (`pickSurface`), whose `null` refusals
 * are what stop a body walking up a terrace wall and so must be pinned as
 * carefully as its successes.
 */
function derivedWorld(chart) {
  const m = makeLevelModel(chart.grid);
  const NIL = -32768;                                   // the model's null, as a number
  const L = (v) => (v == null ? NIL : v);
  const cells = [], steps = [];
  const ORTH = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  for (let y = 0; y < m.rows; y++) {
    for (let x = 0; x < m.cols; x++) {
      cells.push([L(m.floorAt(x, y)), L(m.deckAt(x, y)), m.underOK(x, y) ? 1 : 0,
        m.climbAt(x, y) ? 1 : 0, m.stairAt(x, y) ? 1 : 0, ...m.surfacesAt(x, y)].join('/'));
      for (const s of m.surfacesAt(x, y)) {
        for (const [dx, dy] of ORTH) {
          const nx = x + dx, ny = y + dy;
          if (!m.surfacesAt(nx, ny).length) continue;
          steps.push(`${x},${y}@${s}→${nx},${ny}=${L(m.pickSurface(s, x, y, nx, ny))}`);
        }
      }
    }
  }
  const wet = [...wetCells(chart)].sort();
  const depths = waterDepths(m, wetCells(chart));
  return { cells, steps, wet, depths: wet.map((k) => k + '=' + Math.round(depths.get(k) * 1000)) };
}

/**
 * A pack file, turned back into the chart shape the game holds — which is what
 * the loader in delve-maps.js will do: strip the envelope, and put every
 * prop's width back BY DERIVATION. This is the only place `w` re-enters the
 * world, and it re-enters computed.
 */
function rebuild(read) {
  const out = {};
  for (const k of Object.keys(read)) {
    if (k === 'schema' || k === 'kind') continue;
    out[k] = k === 'props' ? read.props.map((p) => ({ ...p, w: lawfulWidth(p.art) })) : read[k];
  }
  return out;
}

// ── Pass 2: write, then read back and prove it ─────────────────────────────
mkdirSync(OUT_DIR, { recursive: true });
console.log('\nWRITING + ROUND-TRIPPING');
console.log('-'.repeat(72));
let fails = 0;
for (const [key, pack] of packs) {
  if (blocked.has(key)) { console.log(`SKIP  ${key.padEnd(14)} — blocked above`); fails++; continue; }
  const file = join(OUT_DIR, key + '.json');
  writeFileSync(file, JSON.stringify(pack, null, 2) + '\n');

  // Read it back cold and rebuild the chart the way a LOADER would: strip the
  // envelope, put every prop's width back by derivation.
  const read = JSON.parse(readFileSync(file, 'utf8'));
  if (read.schema !== 1) { console.log(`FAIL  ${key} — schema ${read.schema}`); fails++; continue; }
  if (read.kind !== 'delve') { console.log(`FAIL  ${key} — kind ${read.kind}`); fails++; continue; }
  const rebuilt = rebuild(read);

  // CLAIM 1 — the authored print survives.
  const d = diff(normalize(rebuilt), normalize(DELVE_MAPS[key]));
  // CLAIM 2 — and so does THE DERIVED WORLD, which is the one that matters:
  // the pack is faithful not because the text matches but because the game's
  // own model cannot tell the two charts apart.
  const w = derivedWorld(rebuilt), w0 = derivedWorld(DELVE_MAPS[key]);
  const dw = diff(w, w0);
  const bytes = readFileSync(file).length;
  if (d || dw) { console.log(`FAIL  ${key.padEnd(14)} ${d || 'derived world: ' + dw}`); fails++; }
  else console.log(`PASS  ${key.padEnd(14)} ${String(bytes).padStart(6)} bytes  `
    + `${pack.grid.length}×${pack.grid[0].length} grid, `
    + `${(pack.props || []).length} props, ${(pack.spawns || []).length} spawns, `
    + `${(pack.portals || []).length} portals · `
    + `${w.steps.length} step rulings + ${w.wet.length} wet cells identical`);
}
console.log('-'.repeat(72));
console.log(`${packs.size - fails} / ${packs.size} charts round-trip against the live module — `
  + 'authored print AND derived world.');

// ── THE NET HAS TEETH ──────────────────────────────────────────────────────
// A round-trip check that cannot fail is not a check. Each claim is mutated
// against a change it is SPECIFICALLY responsible for catching — because the
// two do not overlap, and the first draft of this self-test hid that. Stealing
// hollowvein's 'K' leaves the level model bit-identical (a key derives its
// floor from its neighbours exactly as the '.' replacing it does), so it is
// the PRINT's job; flattening the crow's nest is the MODEL's.
const TEETH = [
  ['hollowvein', "steal the key ('K' → '.')", 'print',
    (m) => { m.grid[7] = m.grid[7].replace('K', '.'); }],
  ['hollowvein', "flatten the crow's nest ('2' → '^')", 'world',
    (m) => { m.grid[16] = m.grid[16].replace('^2^^', '^^^^'); }],
  ['hollowvein', 'unlock the east door', 'print', (m) => { m.locks[0][1] = 12; }],
  ['ferncreek', 'drain one creek cell', 'print', (m) => { m.water.splice(3, 1); }],
  ['ferncreek', "fill the creek bed (',' → '.')", 'world',
    (m) => { m.grid[7] = m.grid[7].split(',').join('.'); }],
  ['apothecary', 'drop the cauldron\'s cls', 'print', (m) => { delete m.props[1].cls; }],
  ['guildhall', 'redirect the stair portal', 'print', (m) => { m.portals[0].to = 'forge'; }],
];
console.log('\nSELF-TEST — every claim mutated against what it is responsible for');
console.log('-'.repeat(72));
for (const [id, what, who, mutate] of TEETH) {
  const victim = rebuild(JSON.parse(readFileSync(join(OUT_DIR, id + '.json'), 'utf8')));
  mutate(victim);
  const live = DELVE_MAPS[id];
  const caught = who === 'world'
    ? diff(derivedWorld(victim), derivedWorld(live))
    : diff(normalize(victim), normalize(live));
  console.log((caught ? 'CAUGHT ' : '** MISSED ** ') + who.padEnd(6) + ' ' + (id + ': ' + what).padEnd(42)
    + (caught || 'the check proves nothing'));
  if (!caught) process.exitCode = 1;
}

// ── THE COLLISIONS WITH THE PIN ────────────────────────────────────────────
// Three shipped facts the pinned schema has no legal home for. Every one is
// WRITTEN AS AUTHORED and reported here, because all three of the alternatives
// are worse: dropping them makes the migration lossy, renaming one is a rules
// change smuggled in by an exporter, and inventing a field papers over a
// decision that is not this lane's to make. src/guild/map-pack-validate.js
// rejects all three today — which is the right behaviour and exactly how they
// were found. Run `node --import ./dev/register-vite-env.mjs dev/check-maps.mjs`
// to see them from the loader's side.
console.log('\nCOLLISIONS WITH THE PINNED SCHEMA — written as authored, decided by nobody here');
console.log('-'.repeat(72));
const collisions = [];
for (const [key, pack] of packs) {
  if (pack.water) collisions.push([key, `chart key 'water' (${pack.water.length} cells)`,
    'A liquid is not a KIND of ground, so the web spells it as an overlay, not a grid char — '
    + "that is what lets a ',' creek bed be one step down AND full of water. Drop the array and "
    + 'the creek becomes a dry ditch.']);
  for (const p of pack.props || []) {
    if (p.cls) collisions.push([key, `prop key 'cls' on '${p.art}'`,
      `'${p.cls}' walks four frames of art. Drop it and an animation becomes a still.`]);
  }
  if (!/^[a-z0-9-]+$/.test(key)) collisions.push([key, `id '${key}' is not [a-z0-9-]+`,
    'The id is a KEY — a portal `to`, a hall.js locale hook and the port\'s own registry all '
    + 'name it. Renaming it is a cross-repo rules change, not a filename tidy. NOT renamed.']);
}
if (!collisions.length) console.log('  none.');
for (const [id, what, why] of collisions) {
  console.log(`  ${id} — ${what}`);
  console.log(`      ${why}`);
}
console.log('\n  All three need the PIN to move, or the chart cannot enter the pack.');
console.log('  Nothing above was dropped, renamed, or given a field of its own.');

if (fails) process.exitCode = 1;
