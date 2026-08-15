/**
 * THE PREY'S HUMANOID STAND-IN, WITNESSED — a fixture for the Unity port's
 * HuntDispatch.FoeStatsAt / PreyFoeAt (LANE GUILD, the delve wave).
 *
 * A played hunt bout fights the prey as a human-shaped foe: playHuntBout
 * (battle-bridge.js:98-105) builds `{name, archetype, stats, appearanceSeed}`
 * where stats = foeStats(prey.power / partySize) — the target stat-sum spread
 * across the six MR stats with ±6 jitter, clamped 8..100 (battle-bridge.js:
 * 47-52). This dumper LIFTS foeStats, ARCHES and the foe object literal
 * VERBATIM (dump-hunt-power.mjs's balanced-delimiter lifter), shims
 * Math.random with NAMED rolls, and writes down every answer so the C# port
 * replays the same doubles bit for bit.
 *
 * Rolls ride ×1000 (fixture law: integers only; both sides divide by 1000.0
 * back to the same IEEE double). Targets ride ×1000 too — 420/8 = 52.5 is a
 * legal target. No nulls (JsonUtility law).
 *
 *     node dev/dump-foe-stats.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(ROOT, 'src', 'guild', p), 'utf8');
const bridgeSrc = src('battle-bridge.js');
const localesSrc = src('locales.js');

// ── Lift, verbatim (dump-hunt-power.mjs's lifter) ────────────────────────────
/** Balanced scan from the first `open` at/after `from` to its mate. */
function balanced(source, from, open, close) {
  let i = source.indexOf(open, from), depth = 0;
  for (; i < source.length; i++) {
    if (source[i] === open) depth++;
    else if (source[i] === close && --depth === 0) break;
  }
  return i;
}
function liftFn(source, name) {
  const at = source.indexOf(`function ${name}(`);
  if (at < 0) throw new Error(`${name} not found`);
  return source.slice(at, balanced(source, at, '{', '}') + 1);
}
function liftVal(source, name, open = '{', close = '}') {
  const at = source.indexOf(`const ${name} = ${open}`);
  if (at < 0) throw new Error(`${name} not found`);
  const start = source.indexOf(open, at);
  return source.slice(start, balanced(source, start, open, close) + 1);
}

const archesTxt = liftVal(bridgeSrc, 'ARCHES', '[', ']');
const foeStatsTxt = liftFn(bridgeSrc, 'foeStats');
const preyTxt = liftVal(localesSrc, 'PREY');

// The foe object literal INSIDE playHuntBout (battle-bridge.js:100-105) —
// lifted whole so the construction (name, archetype fallback, the /partySize
// share, the |0 seed) is the web's text, not a paraphrase.
const huntAt = bridgeSrc.indexOf('export async function playHuntBout');
if (huntAt < 0) throw new Error('playHuntBout not found');
const foeAt = bridgeSrc.indexOf('const foe = {', huntAt);
if (foeAt < 0) throw new Error('playHuntBout foe literal not found');
const foeTxt = bridgeSrc.slice(bridgeSrc.indexOf('{', foeAt), balanced(bridgeSrc, foeAt, '{', '}') + 1);

// One evaluator, Math handed IN so the lifted code rolls OUR named dice while
// inheriting round/max/min/floor from the real Math.
const build = new Function('Math',
  'const ARCHES = ' + archesTxt + ';\n'
  + foeStatsTxt + '\n'
  + 'const PREY = ' + preyTxt + ';\n'
  + 'const makeFoe = (prey, partySize) => (' + foeTxt + ');\n'
  + 'return { foeStats, makeFoe, PREY, ARCHES };');

function withRolls(rollsX1000, run) {
  const q = rollsX1000.map((r) => r / 1000);
  const shim = Object.create(Math);
  shim.random = () => { if (!q.length) throw new Error('roll queue ran dry'); return q.shift(); };
  const out = run(build(shim));
  if (q.length) throw new Error('unconsumed rolls — the roll count drifted off the web source');
  return out;
}

// Named rolls, rotating — varied enough to hit both jitter signs and the clamps.
const TABLE = [0, 999, 500, 250, 750, 125, 875, 333, 666, 42, 958, 417];
let cursor = 0;
const take = (n) => Array.from({ length: n }, () => TABLE[cursor++ % TABLE.length]);

const statArr = (s) => [s.POW, s.DEF, s.SKL, s.SPD, s.INT, s.VIT]; // the literal's own order
const lawful = (v) => { if (!Number.isInteger(v) || v < 8 || v > 100) throw new Error('stat off the 8..100 law: ' + v); return v; };

// ── foeStats over hand-picked targets ────────────────────────────────────────
// 0 exercises the `targetPower || 120` fallback; 41 the per-floor max(10);
// 52.5 a real party share (420/8); 601 and 700 the per-ceiling min(100).
const foeStats = [];
for (const targetX1000 of [0, 41000, 52500, 80000, 100000, 120000, 175000, 240000, 420000, 601000, 700000]) {
  const rollsX1000 = take(6);
  const stats = statArr(withRolls(rollsX1000, (api) => api.foeStats(targetX1000 / 1000)));
  stats.forEach(lawful);
  foeStats.push({ targetX1000, rollsX1000, stats });
}

// ── The whole stand-in, prey by prey (battle-bridge.js:100-105) ──────────────
// Roll order is the object literal's: archetype (1), the six stats (2..7),
// the appearance seed (8). partySize divides the power BEFORE foeStats.
const preyFoe = [];
for (const preyId of ['squirrel', 'opossum', 'bear', 'ratking', 'slimeking'])
  for (const partySize of [1, 2, 5]) {
    const rollsX1000 = take(8);
    const foe = withRolls(rollsX1000, (api) => api.makeFoe(api.PREY[preyId], partySize));
    statArr(foe.stats).forEach(lawful);
    if (!Number.isInteger(foe.appearanceSeed)) throw new Error('non-integer seed');
    preyFoe.push({ preyId, partySize, rollsX1000,
      name: foe.name, archetype: foe.archetype,
      stats: statArr(foe.stats), appearanceSeed: foe.appearanceSeed });
  }

const fixture = { foeStats, preyFoe };
const out = join(ROOT, '..', '..', '..', '..', 'Guild Rancher',
                 'Assets', 'Tests', 'EditMode', 'foe-stats-fixture.json');
writeFileSync(out, JSON.stringify(fixture, null, 1));
console.log(`fixture → ${out}`);
console.log(`${foeStats.length} foeStats targets, ${preyFoe.length} prey stand-ins`);
