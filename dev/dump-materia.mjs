/**
 * MATERIA, WITNESSED — the bonus math pinned for the Unity port.
 *
 * The Unity fork (Guild Rancher) carries a C# transcription of the materia
 * system: the PLANETS/COMPOUNDS tables (src/game/data/progression.js — NOT
 * orb-tables.js, which holds the orbs' sprite frames), getMateriaBonus's
 * per-planet branches with their caps, the compound pairing rule, and the
 * gainMateriaXP/matXpNeeded ladder. The branch caps are exactly the kind of
 * number a port paraphrases without noticing — `min(lvl+1,3)` for accuracy but
 * `min(lvl,2)` for range, `21-min(lvl,3)` for crit — so this script runs the
 * REAL code and writes down its answers: PLANETS/COMPOUNDS imported from
 * progression.js, matXpNeeded from rng.js, and getMateriaBonus/gainMateriaXP
 * LIFTED VERBATIM out of crucible.js at run time (the dump-appearances.mjs
 * trick: the functions cannot be imported, so they are cut out of the source
 * and evaluated, and therefore cannot drift from it).
 *
 *     node dev/dump-materia.mjs
 *
 * Emits (Guild Rancher/Assets/Tests/EditMode/materia-fixture.json):
 *   - planets/compounds: the tables themselves, so the C# copies are diffed
 *     against the web's own rows, not against a human transcription
 *   - xpTable/maxLevel:  matXpNeeded(1..5) and MATERIA_MAX_LVL
 *   - cases:             hand-built loadouts → the full bonus b{} each earns:
 *                        every planet at every level in a weapon socket, the
 *                        armour lane, the shield lane (which getMateriaBonus
 *                        deliberately ignores), every compound pair in every
 *                        slot letter, and the ordering/dedup traps
 *   - xpCases:           gainMateriaXP before/after states, level-ups included
 *
 * No orb in any case is null and no slot is null — an unsocketed orb carries
 * slot '' — because Unity's JsonUtility quietly turns a JSON null into a
 * default instance (the dump-appearances sentinel rule).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { PLANETS, COMPOUNDS } = await import(new URL('../src/game/data/progression.js', import.meta.url));
const { matXpNeeded } = await import(new URL('../src/game/engine/rng.js', import.meta.url));
const { HAND_SLOTS, gearDamage } = await import(new URL('../src/game/data/gear.js', import.meta.url));

// MATERIA_MAX_LVL is read out of config.js's SOURCE rather than imported:
// config.js drags in config/assets.js, whose `import.meta.env` exists only
// under Vite, so a plain-node import throws before the constant is reachable.
// A regex on the declaration itself cannot drift from the file the game ships.
const configSrc = readFileSync(join(ROOT, 'src', 'game', 'data', 'config.js'), 'utf8');
const MATERIA_MAX_LVL = Number(configSrc.match(/var MATERIA_MAX_LVL\s*=\s*(\d+)/)[1]);

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

// getMateriaBonus reads HAND_SLOTS/gearDamage only under `if(fighter.gear)`,
// and no fixture fighter carries gear — the weapons' own damage is the GEAR
// lane's fact, pinned by that lane's own fixture, and letting it into these
// numbers would make every case answer two questions at once. The real
// imports are passed anyway so the lift runs the code as shipped.
const getMateriaBonus = new Function(
  'PLANETS', 'COMPOUNDS', 'HAND_SLOTS', 'gearDamage',
  lift('getMateriaBonus') + '\nreturn getMateriaBonus;'
)(PLANETS, COMPOUNDS, HAND_SLOTS, gearDamage);

const gainMateriaXP = new Function(
  'PLANETS', 'MATERIA_MAX_LVL', 'matXpNeeded', 'logMsg',
  lift('gainMateriaXP') + '\nreturn gainMateriaXP;'
)(PLANETS, MATERIA_MAX_LVL, matXpNeeded, function(){ /* the log is a view */ });

// ── The witness ─────────────────────────────────────────────────────────────
const orb = (idx, slot, level, xp = 0) => ({ idx, slot, level, xp });
const keyOf = i => PLANETS[i].key;

const cases = [];
function pin(name, materia){
  // atkData is handed a dummy: getMateriaBonus ACCEPTS the attack and never
  // reads it (crucible.js — hand materia apply to all attacks). Pinning with a
  // dummy is what proves the C# port may ignore its Attack argument too.
  const b = getMateriaBonus({ materia }, { range: 1 });
  cases.push({ name, materia, bonus: {
    toHit: b.toHit, critRange: b.critRange, extraRange: b.extraRange,
    lifesteal: !!b.lifesteal, lifestealDice: b.lifestealDice,
    dotBonus: b.dotBonus, acBonus: b.acBonus, bonusDmg: b.bonusDmg,
  }});
}

// Nothing socketed — the default b{}.
pin('no-materia', []);
// An unsocketed orb (slot '' — the falsy-slot state getFighterAC guards on).
pin('unslotted-orb', [orb(0, '', 5)]);

// Every planet, every level, in a weapon socket — this is the walk that pins
// each branch's CAP (accuracy tops out at lvl 2, crit at 3, range/dot at 2...).
for (let idx = 0; idx < PLANETS.length; idx++)
  for (let lvl = 1; lvl <= MATERIA_MAX_LVL; lvl++)
    pin(`w-${keyOf(idx)}-lv${lvl}`, [orb(idx, 'w', lvl)]);

// The armour lane: Silver at every level (the min(lvl,2) cap, LOWER than the
// weapon socket's min(lvl+1,3)) and every other planet once — armour sockets
// carry only defense, everything else pins to zero.
for (let lvl = 1; lvl <= MATERIA_MAX_LVL; lvl++)
  pin(`a-silver-lv${lvl}`, [orb(0, 'a', lvl)]);
for (let idx = 1; idx < PLANETS.length; idx++)
  pin(`a-${keyOf(idx)}-lv3`, [orb(idx, 'a', 3)]);

// The shield lane: getMateriaBonus gives 's' orbs NOTHING — a shield-socketed
// Silver defends through getFighterAC (the AC lane), not through b{}.
pin('s-silver-lv3', [orb(0, 's', 3)]);
pin('s-gold-lv3', [orb(3, 's', 3)]);

// Every compound pair, in each slot letter. 'w' and 'a' fire; 's' does not
// (the found-guard admits only 'w'/'a'); a pair SPLIT across slots never
// pairs at all (same-slot is the whole rule).
for (const c of COMPOUNDS){
  const tag = c.name.replace(/\s+/g, '');
  pin(`compound-w-${tag}`, [orb(c.a, 'w', 1), orb(c.b, 'w', 1)]);
  pin(`compound-a-${tag}`, [orb(c.a, 'a', 1), orb(c.b, 'a', 1)]);
  pin(`compound-s-${tag}`, [orb(c.a, 's', 1), orb(c.b, 's', 1)]);
  pin(`split-w-a-${tag}`,  [orb(c.a, 'w', 1), orb(c.b, 'a', 1)]);
}

// THE ORDERING TRAP: a matching pair in 's' is scanned FIRST and passed over
// WITHOUT setting the found flag, so the later 'w' pair still fires. A port
// that sets found on any match kills the compound here.
pin('s-pair-then-w-pair-LunarFlux',
    [orb(0, 's', 1), orb(1, 's', 1), orb(0, 'w', 1), orb(1, 'w', 1)]);
// THE DEDUP TRAP: two Golds beside an Iron make two possible Solar Forge
// pairs; the found flag fires the compound ONCE (the singles still add twice).
pin('dup-pair-SolarForge', [orb(3, 'w', 2), orb(3, 'w', 2), orb(4, 'w', 2)]);
// A chain shares its middle orb: Silver-Quicksilver-Copper is Lunar Flux AND
// Healing Arts, both at once — each compound scans independently.
pin('chain-LunarFlux-HealingArts', [orb(0, 'w', 2), orb(1, 'w', 2), orb(2, 'w', 2)]);
// Kitchen sink: all seven planets at max level in hand — every single at its
// cap and ALL SIX compounds at once (the table is an adjacency chain).
pin('all-seven-lv5-w', PLANETS.map((_, i) => orb(i, 'w', MATERIA_MAX_LVL)));

// ── gainMateriaXP: before/after, mutation witnessed ─────────────────────────
const xpCases = [];
function pinXp(name, materia, slotType, amount){
  const fighter = { materia: materia.map(m => ({ ...m })) };
  gainMateriaXP(fighter, slotType, amount);
  xpCases.push({ name, slotType, amount, materia,
    after: fighter.materia.map(m => ({
      level: m.level, xp: m.xp, justLeveled: !!m._justLeveled })) });
}

// The web awards 1 xp per surviving armour orb per round (crucible.js) and 2
// to the striking hand on a hit — amounts 1 and 2 against a smallest bar of 3
// (matXpNeeded(1)), which is why gainMateriaXP levels AT MOST ONCE per grant.
pinXp('xp-level-up-exact', [orb(1, 'w', 1, 2)], 'w', 1);   // 2+1 = bar of 3
pinXp('xp-no-level',       [orb(1, 'w', 1, 0)], 'w', 2);
pinXp('xp-carryover',      [orb(4, 'w', 1, 2)], 'w', 2);   // 4 vs 3 → Lv2 with 1 banked
pinXp('xp-max-level-frozen', [orb(0, 'w', MATERIA_MAX_LVL, 0)], 'w', 2);
pinXp('xp-slot-filter',    [orb(0, 'w', 1, 2), orb(2, 'a', 1, 2)], 'a', 1);
pinXp('xp-armor-round-tick', [orb(0, 'a', 2, 5), orb(6, 'a', 1, 1)], 'a', 1);

// ── Write it down ───────────────────────────────────────────────────────────
const fixture = {
  maxLevel: MATERIA_MAX_LVL,
  planets: PLANETS.map(p => ({
    key: p.key, sym: p.sym, name: p.name, planet: p.planet, col: p.col,
    bonus: p.bonus, bonusDesc: p.bonusDesc, desc: p.desc, grants: p.grants })),
  compounds: COMPOUNDS.map(c => ({ a: c.a, b: c.b, name: c.name, col: c.col, desc: c.desc })),
  xpTable: Array.from({ length: MATERIA_MAX_LVL }, (_, i) => ({ level: i + 1, needed: matXpNeeded(i + 1) })),
  cases, xpCases,
};

const out = join(ROOT, '..', '..', '..', '..', 'Guild Rancher',
                 'Assets', 'Tests', 'EditMode', 'materia-fixture.json');
writeFileSync(out, JSON.stringify(fixture, null, 1));
console.log(`fixture → ${out}`);
console.log(`${fixture.planets.length} planets, ${fixture.compounds.length} compounds, ` +
            `${cases.length} bonus cases, ${xpCases.length} xp cases, max Lv${MATERIA_MAX_LVL}`);
for (const c of cases) console.log('  ' + c.name + '  →  ' + JSON.stringify(c.bonus));
