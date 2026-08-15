/**
 * THE GEAR SYSTEM, WITNESSED — a fixture for the Unity port to be pinned against.
 *
 * The Unity fork (Guild Rancher) carries a C# port of the gear tables, the
 * draft generator and the armour sums. The tables and formulas are pinned by
 * running the REAL modules — gear.js's own gearArmor/gearDamage/gearTierBonus,
 * the real GEAR_MATERIALS — and writing down their answers. The generator is
 * built on Math.random, which no fixture can seed... so Math.random itself is
 * REPLACED for the duration: a recording mulberry32 (elementsRng, the same
 * stream dump-appearances.mjs pins) stands in for it, every double it hands
 * out is written down, and the C# test REPLAYS that exact stream through the
 * port. One draw out of order — a socket rolled before a fill check, a name
 * picked before an id — and the replay diverges loudly. That is the whole
 * generator pinned, not just its outputs.
 *
 * generateGearPiece / generateGearPieceOfType / getFighterAC cannot be
 * imported (they live in crucible.js's flat script body), so they are LIFTED
 * VERBATIM by balanced-brace scan and evaluated — the dump-appearances.mjs
 * trick — and therefore cannot drift from the source.
 *
 *     node dev/dump-gear.mjs
 *
 * Emits gear-fixture.json into the Unity repo's EditMode tests:
 *   - types/materials/refineTable/slots: the tables, straight from gear.js
 *   - tierBonus:   gearTierBonus over every tier
 *   - formula:     gearDamage + gearArmor for hand-built pieces across every
 *                  type x tier x refinement spread (and the cosmetic zero)
 *   - names:       material-word + type assembly for known (tier, index) pairs
 *   - generation:  full recorded-rng replays of generateGearPiece
 *   - fighterAc:   getFighterAC (ward-less, materia-less) over built loadouts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { elementsRng, pick, randInt } = await import(new URL('../src/game/engine/rng.js', import.meta.url));
const {
  GEAR_TYPES, GEAR_MATERIALS, EQUIP_SLOTS, HAND_SLOTS, REFINE_TABLE,
  WEAPON_GEAR_TYPES, SHIELD_GEAR_TYPES, TWO_HANDED_GEAR_TYPES,
  gearTierBonus, gearDamage, gearArmor,
} = await import(new URL('../src/game/data/gear.js', import.meta.url));
const { PLANETS } = await import(new URL('../src/game/data/progression.js', import.meta.url));

// ── Lift the crucible.js functions, verbatim ────────────────────────────────
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
  'GEAR_TYPES', 'GEAR_MATERIALS', 'PLANETS', 'EQUIP_SLOTS',
  'pick', 'randInt', 'gearArmor',
  lift('generateGearPiece') + '\n' + lift('generateGearPieceOfType') + '\n' +
  lift('getFighterAC') +
  '\nreturn { generateGearPiece, getFighterAC };');
const { generateGearPiece, getFighterAC } = factory(
  GEAR_TYPES, GEAR_MATERIALS, PLANETS, EQUIP_SLOTS, pick, randInt, gearArmor);

// ── The recording rng — Math.random, deposed and witnessed ──────────────────
// pick/randInt (rng.js) and the lifted functions all reach for the GLOBAL
// Math.random at call time, so swapping the global is enough to seed them all.
// The doubles ride as IEEE-754 BIT PATTERNS (hex), not decimals: JsonUtility
// parses a 17-digit decimal a ulp off, which fails a replay that is actually
// identical (the dump-appearances war story). Bits survive any parser.
const _bits = new DataView(new ArrayBuffer(8));
const bitsOf = d => { _bits.setFloat64(0, d); return _bits.getBigUint64(0).toString(16).padStart(16, '0'); };

const realRandom = Math.random;
function recorded(seed, fn){
  const r = elementsRng(seed);
  const tape = [];
  Math.random = () => { const d = r(); tape.push(d); return d; };
  try { return { tape, result: fn() }; }
  finally { Math.random = realRandom; }
}

// ── types / materials / refine — the tables as the source states them ───────
const types = GEAR_TYPES.map(g => ({
  type: g.type, pos: g.pos, icon: g.icon || '',
  sMin: g.sMin, sMax: g.sMax, dmg: g.dmg, ac: g.ac,
}));
const materials = GEAR_MATERIALS.map(row => ({ names: row }));
const refineTable = REFINE_TABLE.map(row => ({ rates: row }));

// ── formula: what a piece is worth, deterministically ───────────────────────
// Every type, a tier spread, a refinement spread, plus the cosmetic zero —
// the exact cases where the web build once could not tell two items apart.
const formula = [];
for (const g of GEAR_TYPES)
  for (const tier of [0, 3, 6])
    for (const refinement of [0, 4, 10]){
      const piece = { type: g.type, tier, refinement };
      formula.push({ type: g.type, tier, refinement, cosmetic: false,
                     damage: gearDamage(piece), armor: gearArmor(piece) });
    }
for (const g of GEAR_TYPES){
  const piece = { type: g.type, tier: 4, refinement: 3, cosmetic: true };
  formula.push({ type: g.type, tier: 4, refinement: 3, cosmetic: true,
                 damage: gearDamage(piece), armor: gearArmor(piece) });
}

const tierBonus = [0, 1, 2, 3, 4, 5, 6].map(gearTierBonus);

// ── names: pick(matArr) + ' ' + gt.type, with the pick made deterministic ───
const names = [];
for (let tier = 0; tier < GEAR_MATERIALS.length; tier++)
  for (let mi = 0; mi < GEAR_MATERIALS[tier].length; mi++){
    const type = GEAR_TYPES[(tier * 4 + mi) % GEAR_TYPES.length].type;
    names.push({ type, tier, mi, name: GEAR_MATERIALS[tier][mi] + ' ' + type });
  }

// ── generation: the whole generator, replayed draw for draw ─────────────────
// The piece's `id` is deliberately NOT pinned: it is one draw shaped by
// Number.prototype.toString(36)'s shortest-round-trip trimming, which no port
// should re-implement for a throwaway key. The DRAW is still on the tape, so
// a port that forgets to consume it diverges on the very next field.
const generation = [];
for (const seed of [1, 2, 42, 777, 20260812])
  for (let round = 1; round <= 7; round++){
    const { tape, result: p } = recorded(seed * 31 + round, () => generateGearPiece(round));
    generation.push({
      seed: seed * 31 + round, round,
      bits: tape.map(bitsOf),
      piece: {
        name: p.name, type: p.type, pos: p.pos,
        sockets: p.sockets, links: p.links, tier: p.tier, refinement: p.refinement,
        materia: p.materia.map(m => ({ planetIdx: m.planetIdx, level: m.level, xp: m.xp })),
      },
    });
  }

// ── fighterAc: base + every equipped piece's gearArmor, per the one sum ─────
// Ward-less and materia-less on purpose — those systems are other lanes, and
// getFighterAC's own guards (`ward||0`, `if(!fighter.materia)return`) make the
// lifted function answer for exactly the sum the port carries.
function acCase(baseAc, pieces){
  const gear = {};
  for (const p of pieces) gear[p.slot] = { type: p.type, tier: p.tier, refinement: p.refinement, cosmetic: !!p.cosmetic };
  const expectedAc = getFighterAC({ ac: baseAc, gear });
  return { baseAc, pieces: pieces.map(p => ({ slot: p.slot, type: p.type, tier: p.tier, refinement: p.refinement, cosmetic: !!p.cosmetic })), expectedAc };
}
const fighterAc = [
  // Fully dressed — every slot pays in, except the sword (weapons defend nothing).
  acCase(12, [
    { slot: 'Head',  type: 'Helm',     tier: 2, refinement: 0 },
    { slot: 'LHand', type: 'Buckler',  tier: 1, refinement: 0 },
    { slot: 'Body',  type: 'Plate',    tier: 3, refinement: 2 },
    { slot: 'RHand', type: 'Sword',    tier: 6, refinement: 5 },
    { slot: 'Lower', type: 'Leggings', tier: 0, refinement: 0 },
  ]),
  // Naked: the sum must collapse to base.
  acCase(10, []),
  // A +9 whip is nine more DAMAGE, not armour — AC must stay base.
  acCase(14, [{ slot: 'RHand', type: 'Whip', tier: 2, refinement: 9 }]),
  // Refinement pays into armour on every slot (the user decree of 2026-08-08).
  acCase(11, [
    { slot: 'Body', type: 'Robes', tier: 6, refinement: 10 },
    { slot: 'Head', type: 'Crown', tier: 4, refinement: 0 },
  ]),
  // A shield is armour worn in a hand — the hand slot must pay into AC.
  acCase(13, [{ slot: 'LHand', type: 'Buckler', tier: 6, refinement: 10 }]),
  // A cosmetic piece is a sprite, not a defence: worth zero beside a real vest.
  acCase(12, [
    { slot: 'RHand', type: 'Buckler', tier: 6, refinement: 0, cosmetic: true },
    { slot: 'Body',  type: 'Vest',    tier: 5, refinement: 1 },
  ]),
];

const fixture = {
  types, materials, refineTable,
  equipSlots: EQUIP_SLOTS, handSlots: HAND_SLOTS,
  weaponTypes: WEAPON_GEAR_TYPES, shieldTypes: SHIELD_GEAR_TYPES, twoHanded: TWO_HANDED_GEAR_TYPES,
  tierBonus, formula, names, generation, fighterAc,
};
const out = join(ROOT, '..', '..', '..', '..', 'Guild Rancher',
                 'Assets', 'Tests', 'EditMode', 'gear-fixture.json');
writeFileSync(out, JSON.stringify(fixture, null, 1));
console.log(`fixture → ${out}`);
console.log(`${types.length} gear types, ${formula.length} formula cases, ${names.length} name cases,`
  + ` ${generation.length} recorded generations, ${fighterAc.length} AC sums`);
const draws = generation.reduce((n, g) => n + g.bits.length, 0);
console.log(`${draws} recorded rng draws across the generations`);
