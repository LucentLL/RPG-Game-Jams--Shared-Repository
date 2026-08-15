/**
 * THE ATHANOR'S ARITHMETIC, WITNESSED — a fixture for the Unity port's
 * tactical engine (TacticalEngine.cs) to be pinned against.
 *
 * The tactical board's combat math lives in crucible.js's resolveOneAttack /
 * deriveStats / getFighterAC and in engine/facing.js's zone geometry. The
 * resolvers themselves cannot be imported (crucible.js is one side-effectful
 * module married to the DOM), so this script takes each number the same way
 * dump-appearances.mjs does:
 *
 *   - REAL IMPORTS where a module is clean: ATTACKS (data/attacks.js),
 *     statMod (engine/rng.js), getZone/facingAngle (engine/facing.js — its
 *     state.js dependency guards its window bridge, so node imports it fine),
 *     GS (data/config.js).
 *   - THE BALANCED-BRACE LIFT for the two pure functions trapped inside
 *     crucible.js: deriveStats and getFighterAC. Lifted verbatim at run time,
 *     so they cannot drift from the shipped code.
 *   - TRANSCRIBED SUMS only where the formula is inline in a DOM-bound
 *     function and cannot execute outside it: the flank/prone bonuses of
 *     resolveOneAttack (crucible.js:6520-6525) and the opportunity-attack
 *     roll (crucible.js:6370-6377). Each carries its line citation; if those
 *     lines change, change here or the fixture lies.
 *
 *     node --import ./dev/register-vite-env.mjs dev/dump-tactical.mjs
 *
 * (The hook because data/config.js reaches src/config/assets.js, which reads
 * import.meta.env — the same reason every check-*.mjs runs under it.)
 *
 * Emits tactical-fixture.json into the Unity repo's EditMode tests:
 *   - speeds:  deriveStats' speed/ac/hp for every DEX 1..20
 *   - zones:   real getZone answers for 8 facings x near+far tiles
 *   - toHit:   the 6532 sum (mod + prof + flank + prone) for pinned spreads
 *   - wardAc:  real getFighterAC (lifted) for base-AC x ward combinations
 *   - wardAttack / dots / teleport: the special rows' own numbers
 *   - oa:      the OA modifier and non-crit damage for stat spreads
 *
 * All values are integers or strings — nothing rides as a double, so the
 * hex-bit-pattern trick dump-appearances.mjs needs is unnecessary here.
 * No nulls either: JsonUtility would silently default-construct them.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { ATTACKS } = await import(new URL('../src/game/data/attacks.js', import.meta.url));
const { statMod } = await import(new URL('../src/game/engine/rng.js', import.meta.url));
const { getZone, facingAngle } = await import(new URL('../src/game/engine/facing.js', import.meta.url));
const { GS } = await import(new URL('../src/game/data/config.js', import.meta.url));

// ── Lift the two pure functions out of crucible.js, verbatim ────────────────
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

// getFighterAC's gear/materia branches reference EQUIP_SLOTS and gearArmor as
// free variables, but a gearless, materia-less fighter never enters them —
// which is exactly the fighter the Unity fork has (its ArenaCombat carries the
// same "gear is the seam to port later" note). null gear/materia below.
const lifted = new Function(
  lift('deriveStats') + '\n' + lift('getFighterAC') +
  '\nreturn { deriveStats: deriveStats, getFighterAC: getFighterAC };')();
const { deriveStats, getFighterAC } = lifted;

const statsWithDex = dex => ({ STR: 10, DEX: dex, CON: 10, INT: 10, WIS: 10, CHA: 10 });

// ── speeds: deriveStats for every DEX (crucible.js:1821-1829) ───────────────
const speeds = [];
for (let dex = 1; dex <= 20; dex++){
  const d = deriveStats(statsWithDex(dex));
  speeds.push({ dex, speed: d.speed, ac: d.ac, hp: d.hp });
}
const proficiency = deriveStats(statsWithDex(10)).proficiency;

// ── zones: the REAL getZone, 8 facings x a ring of tiles ────────────────────
// The defender sits at (4,4) facing a compass direction; every adjacent tile
// plus four distant ones is classified. Distant tiles matter because
// resolveOneAttack flanks by POSITION AT ANY RANGE (crucible.js:6519 passes
// the attacker's tile straight in — an archer flanks from across the board).
const FACINGS = [[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
const TILES = [];
for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++)
  if (dx || dy) TILES.push([4 + dx, 4 + dy]);
TILES.push([4, 0], [8, 4], [7, 1], [0, 8]);   // far: N, E, NE-ish, SW-ish

const zones = [];
for (const [fdx, fdy] of FACINGS){
  const defender = { x: 4, y: 4, facing: facingAngle(fdx, fdy) };
  for (const [tx, ty] of TILES)
    zones.push({ fdx, fdy, tileX: tx, tileY: ty, zone: getZone(defender, tx, ty) });
}

// ── toHit: resolveOneAttack's 6532 sum for a gearless fighter ───────────────
// toHit = statMod + prof + matB.toHit + flankBonus + proneBonus, with
// matB.toHit = 0 (materia is unported in the Unity fork — the same stub its
// ArenaCombat documents). Flank: rear +2, side +1 (crucible.js:6520-6522).
// Prone: +2 only in melee reach, `defender._prone && dist2 <= 1`
// (crucible.js:6524-6525) — a Lash at 2 tiles gets NOTHING from a prone
// target, which is a pin worth having.
function toHitOf(stats, atkName, zone, prone, dist){
  const atk = ATTACKS[atkName];
  if (!atk) throw new Error(`unknown attack ${atkName}`);
  if (atk.range > 0 && dist > atk.range) throw new Error(`${atkName} cannot reach ${dist}`);
  const mod = statMod({ stats }, atk.stat);
  const flank = zone === 'rear' ? 2 : zone === 'side' ? 1 : 0;
  const proneB = (prone && dist <= 1) ? 2 : 0;
  return mod + proficiency + flank + proneB;
}
const S = (STR=10, DEX=10, CON=10, INT=10, WIS=10, CHA=10) => ({ STR, DEX, CON, INT, WIS, CHA });
const toHitCases = [
  { attack: 'Strike',      stats: S(14),          zone: 'front', prone: false, dist: 1 },
  { attack: 'Strike',      stats: S(14),          zone: 'side',  prone: false, dist: 1 },
  { attack: 'Strike',      stats: S(14),          zone: 'rear',  prone: false, dist: 1 },
  { attack: 'Strike',      stats: S(14),          zone: 'front', prone: true,  dist: 1 },
  { attack: 'Strike',      stats: S(14),          zone: 'rear',  prone: true,  dist: 1 },
  { attack: 'Strike',      stats: S(9),           zone: 'front', prone: false, dist: 1 },  // the floor-division case
  { attack: 'Lash',        stats: S(18),          zone: 'side',  prone: true,  dist: 2 },  // prone denied past melee reach
  { attack: 'Arrow Shot',  stats: S(10, 16),      zone: 'rear',  prone: false, dist: 4 },  // flanked from range
  { attack: 'Venom Touch', stats: S(10,10,10,10,10,12), zone: 'front', prone: false, dist: 1 },
];
const toHit = toHitCases.map(c => ({
  attack: c.attack, zone: c.zone, prone: c.prone, dist: c.dist,
  str: c.stats.STR, dex: c.stats.DEX, con: c.stats.CON,
  intel: c.stats.INT, wis: c.stats.WIS, cha: c.stats.CHA,
  toHit: toHitOf(c.stats, c.attack, c.zone, c.prone, c.dist),
}));

// ── wardAc: the REAL getFighterAC (crucible.js:5767-5785), gearless ─────────
const wardAc = [];
for (const [ac, ward] of [[10,0],[10,3],[12,3],[9,3],[15,2],[11,0],[8,5]])
  wardAc.push({ baseAc: ac, ward, ac: getFighterAC({ ac, ward, gear: null, materia: null }) });

// ── The special rows' own numbers, from the real table ──────────────────────
const dd = n => { const m = ATTACKS[n].dotDice.match(/(\d+)d(\d+)/); return { count: +m[1], faces: +m[2] }; };
const wardAttack = { name: 'Stone Ward', acBonus: ATTACKS['Stone Ward'].acBonus };
const dots = ['Venom Touch', 'Poison Cloud'].map(n => ({
  name: n, dotTurns: ATTACKS[n].dotTurns, dotCount: dd(n).count, dotFaces: dd(n).faces,
}));
const teleport = { name: 'Blink', range: ATTACKS['Blink'].teleportRange };

// ── oa: the opportunity attack's arithmetic (crucible.js:6370-6377) ─────────
// mod = max(strMod, dexMod); non-crit damage = max(1, prof + mod). The d20
// itself is left to the engine's injected rng — only the derived numbers pin.
const oa = [[14,10],[10,16],[8,8],[18,20],[10,10]].map(([str, dex]) => {
  const mod = Math.max(statMod({ stats: S(str, dex) }, 'STR'), statMod({ stats: S(str, dex) }, 'DEX'));
  return { str, dex, oaMod: mod, oaDamage: Math.max(1, proficiency + mod) };
});

// ── Write it where the Unity tests read it ──────────────────────────────────
const fixture = { gridSize: GS, proficiency, speeds, zones, toHit, wardAc, wardAttack, dots, teleport, oa };
const out = join(ROOT, '..', '..', '..', '..', 'Guild Rancher',
                 'Assets', 'Tests', 'EditMode', 'tactical-fixture.json');
writeFileSync(out, JSON.stringify(fixture, null, 1));
console.log(`fixture → ${out}`);
console.log(`grid ${GS}x${GS}, prof ${proficiency}; ${speeds.length} speed rows, ` +
            `${zones.length} zone cases, ${toHit.length} to-hit sums, ${wardAc.length} ward ACs, ${oa.length} OA rows`);
for (const t of toHit) console.log(`  ${t.attack} ${t.zone}${t.prone ? ' prone' : ''} d${t.dist} → +${t.toHit}`);
