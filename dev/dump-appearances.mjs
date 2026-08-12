/**
 * THE GENERATOR, WITNESSED — a fixture for the Unity port to be pinned against.
 *
 * The Unity fork (Guild Rancher) carries a C# port of generateAppearance so a
 * stadium can be full of GENERATED people rather than seven hand-picked
 * costumes. A port of a seeded generator is only right if it is EXACTLY right:
 * one rng call out of order and every appearance after it differs, silently.
 * So this script runs the REAL generator — elementsRng out of rng.js, the real
 * ELEMENTS_MANIFEST out of sprite-tables.js, and elementsPickPart /
 * generateAppearance LIFTED VERBATIM out of crucible.js at run time (the same
 * trick check-volumes.mjs uses for art.js: the functions cannot be imported,
 * so they are cut out of the source and evaluated, and therefore cannot drift
 * from it) — and writes what it saw to a JSON fixture the C# tests replay.
 *
 *     node dev/dump-appearances.mjs
 *
 * Emits:
 *   - rng:         first doubles of mulberry32 for a spread of seeds
 *   - appearances: seeds 1..24 x each prime — every layer pick, every c, tone
 *   - roster:      the arena's own 36 (12 armed, 24 crowd) with the exact
 *                  art files the four shipped layers need (bottom/top/head/
 *                  hair — the accessory layers are generated but not shipped,
 *                  the generatePlainAppearance precedent)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { elementsRng } = await import(new URL('../src/game/engine/rng.js', import.meta.url));
const tables = await import(new URL('../src/game/data/sprite-tables.js', import.meta.url));
const { ELEMENTS_MANIFEST, PRIME_PALETTE_BIAS } = tables;

// ── Lift the two functions out of crucible.js, verbatim ─────────────────────
const source = readFileSync(join(ROOT, 'src', 'game', 'crucible.js'), 'utf8');

function lift(name){
  const at = source.indexOf(`function ${name}(`);
  if (at < 0) throw new Error(`${name} not found in crucible.js`);
  let i = source.indexOf('{', at), depth = 0;
  for (; i < source.length; i++){
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) break;
  }
  return source.slice(at, i + 1);
}

const factory = new Function(
  'ELEMENTS_MANIFEST', 'PRIME_PALETTE_BIAS', 'elementsRng',
  lift('elementsPickPart') + '\n' + lift('generateAppearance') +
  '\nreturn generateAppearance;');
const generateAppearance = factory(ELEMENTS_MANIFEST, PRIME_PALETTE_BIAS, elementsRng);

// ── The witness ─────────────────────────────────────────────────────────────
const PRIMES = ['sulfur', 'salt', 'mercury'];

// The doubles ride as IEEE-754 BIT PATTERNS (hex strings), not decimals:
// Unity's JsonUtility parses a 17-digit decimal a ulp off, which failed the
// bit-for-bit test against a stream that was actually identical. A hex string
// survives any parser unchanged.
const _bits = new DataView(new ArrayBuffer(8));
const bitsOf = d => { _bits.setFloat64(0, d); return _bits.getBigUint64(0).toString(16).padStart(16, '0'); };
const rngCases = [1, 2, 42, 20260812, -7].map(seed => {
  const r = elementsRng(seed);
  return { seed, bits: Array.from({ length: 8 }, () => bitsOf(r())) };
});

const appearances = [];
for (let seed = 1; seed <= 24; seed++)
  for (const prime of PRIMES)
    appearances.push({ seed, prime, ...strip(generateAppearance(seed, prime)) });

// The arena's own roster — ITS policy, pinned here so the art list is a fact.
// Fighters are armed blocks 1001..1012; the crowd 2001..2024. Primes cycle.
const roster = [];
for (let i = 0; i < 12; i++)
  roster.push({ role: 'fighter', seed: 1001 + i, prime: PRIMES[i % 3],
                ...strip(generateAppearance(1001 + i, PRIMES[i % 3])) });
for (let i = 0; i < 24; i++)
  roster.push({ role: 'crowd', seed: 2001 + i, prime: PRIMES[i % 3],
                ...strip(generateAppearance(2001 + i, PRIMES[i % 3])) });

function strip(ap){
  // An empty pick is {name:'', c:-1} rather than null: the fixture is replayed
  // by Unity's JsonUtility, which quietly turns a JSON null into a default
  // instance — indistinguishable from real data. A sentinel cannot be misread.
  const pick = p => p ? { name: p.name, c: p.c } : { name: '', c: -1 };
  return {
    backextra: pick(ap.backextra), bottom: pick(ap.bottom), top: pick(ap.top),
    head: pick(ap.head), hair: pick(ap.hair), backhair: pick(ap.backhair),
    hat: pick(ap.hat), frontextra: pick(ap.frontextra), skinTone: ap.skinTone,
  };
}

// Which files the roster's four SHIPPED layers actually reference.
const SHIPPED = ['bottom', 'top', 'head', 'hair'];
const files = new Set();
for (const r of roster)
  for (const layer of SHIPPED){
    const p = r[layer];
    if (p && p.name) files.add(`${layer}/${p.name}${p.c > 0 ? '_c' + p.c : ''}.png`);
  }

const fixture = { rng: rngCases, appearances, roster, artFiles: [...files].sort() };
const out = join(ROOT, '..', '..', '..', '..', 'Guild Rancher',
                 'Assets', 'Tests', 'EditMode', 'appearance-fixture.json');
writeFileSync(out, JSON.stringify(fixture, null, 1));
console.log(`fixture → ${out}`);
console.log(`${appearances.length} pinned appearances, ${roster.length} roster entries, ${files.size} art files needed:`);
for (const f of fixture.artFiles) console.log('  ' + f);
