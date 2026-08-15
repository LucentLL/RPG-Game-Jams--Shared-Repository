/**
 * THE GROUNDS, WITNESSED — a fixture for the Unity port's RoomsData/Economy.
 *
 * The facility catalogue (FACILITIES, guild.js:36-49), its tier clamp
 * (facilityTier, guild.js:52-57), the derived capacities (maxRoster guild.js:59,
 * fedCapacity guild.js:61, dormCapacity apprentices.js:34, stationCapacity
 * stations.js:43-46), the Grounds card's effect strings (facilityEffect,
 * hall.js:3666-3675) and the whole economy module (economy.js) are pinned by
 * running the REAL code and writing down its answers.
 *
 * economy.js imports nothing, so it is imported whole. guild.js/apprentices.js/
 * stations.js/hall.js pull chains of browser-adjacent modules, so their pieces
 * are LIFTED VERBATIM by balanced-delimiter scan and evaluated — the
 * dump-appearances.mjs / dump-facing.mjs trick: the lifted text IS the source,
 * so it cannot drift from it.
 *
 * Every number here is an integer (the one float family, yard's mainMult
 * 1/1.1/1.2/1.3, rides as x100 ints) — no 17-digit decimals for JsonUtility to
 * mis-parse, per the fixture law.
 *
 *     node dev/dump-rooms.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(ROOT, 'src', 'guild', p), 'utf8');

const guildSrc = src('guild.js');
const apprSrc = src('apprentices.js');
const statSrc = src('stations.js');
const hallSrc = src('hall.js');

// economy.js has no imports — run the real module directly.
const economy = await import(new URL('../src/guild/economy.js', import.meta.url));

// ── Lift, verbatim ───────────────────────────────────────────────────────────
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

const FACILITIES = new Function('return ' + liftVal(guildSrc, 'FACILITIES'))();

// facilityTier + the deriveds + facilityEffect, all closed over the REAL tables.
const lifted = new Function('FACILITIES',
  liftFn(guildSrc, 'facilityTier') + '\n' +
  liftFn(guildSrc, 'maxRoster') + '\n' +
  liftFn(guildSrc, 'fedCapacity') + '\n' +
  liftFn(apprSrc, 'dormCapacity') + '\n' +
  'const SLOT_CAP = ' + liftVal(statSrc, 'SLOT_CAP', '[', ']') + ';\n' +
  'const YARD_SLOTS = ' + liftVal(statSrc, 'YARD_SLOTS', '[', ']') + ';\n' +
  liftFn(statSrc, 'stationCapacity') + '\n' +
  liftFn(hallSrc, 'facilityEffect') + '\n' +
  'return { facilityTier, maxRoster, fedCapacity, dormCapacity, stationCapacity, facilityEffect, yardSlotCount: YARD_SLOTS.length };'
)(FACILITIES);

const KEYS = Object.keys(FACILITIES);   // quarters, yard, ring, mess, infirmary, dorm — card order

// ── The catalogue, with every effect array present (empty = not this room's) ─
const facilities = KEYS.map((key) => {
  const d = FACILITIES[key];
  return {
    key, name: d.name, desc: d.desc,
    costs: d.costs,
    caps: d.caps || [], fed: d.fed || [], injuryBonus: d.injuryBonus || [],
    healRate: d.healRate || [], beds: d.beds || [], slots: d.slots || [],
    mainMultX100: (d.mainMult || []).map((m) => Math.round(m * 100)),
  };
});

// ── facilityTier's clamp, witnessed across the ugly inputs ───────────────────
const tierClamp = [];
for (const key of KEYS)
  for (const stored of [-3, -1, 0, 1, 2, 3, 4, 5, 9, 99])
    tierClamp.push({ key, stored, tier: lifted.facilityTier({ facilities: { [key]: stored } }, key) });

// ── facilityEffect verbatim + the upgrade card's gate/cost per tier ──────────
const effects = [], upgrades = [];
for (const key of KEYS) {
  const d = FACILITIES[key];
  for (let t = 0; t < d.costs.length; t++) {
    effects.push({ key, tier: t, text: lifted.facilityEffect(key, t) });
    const maxed = t >= d.costs.length - 1;               // hall.js:3681/3694
    upgrades.push({ key, tier: t, maxed: maxed ? 1 : 0, nextCost: maxed ? 0 : d.costs[t + 1] });
  }
}

// ── The deriveds over whole guild states (uniform ladders + mixed hands) ─────
const hands = [0, 1, 2, 3, 4, 5, 6].map((t) => ({ quarters: t, yard: t, ring: t, mess: t, infirmary: t, dorm: t }));
hands.push({ quarters: 2, yard: 1, ring: 3, mess: 0, infirmary: 1, dorm: 2 });
hands.push({ quarters: 4, yard: 3, ring: 0, mess: 4, infirmary: 3, dorm: 3 });
hands.push({ quarters: 1, yard: 0, ring: 2, mess: 3, infirmary: 0, dorm: 1 });
const derived = hands.map((f) => {
  const g = { facilities: f };
  return {
    quarters: f.quarters, yard: f.yard, ring: f.ring, mess: f.mess, infirmary: f.infirmary, dorm: f.dorm,
    maxRoster: lifted.maxRoster(g), fed: lifted.fedCapacity(g),
    dormBeds: lifted.dormCapacity(g), stationCap: lifted.stationCapacity(g),
  };
});

// ── economy.js, the real module answering ────────────────────────────────────
const wages = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 20, 30, 50]
  .map((level) => ({ level, wage: economy.heroWage({ level }) }));

// weeklyUpkeep replays: parallel dietCosts, -1 = this hero eats from no plan
// (no dietPlanId, or a plan the lookup no longer knows — economy.js:19-21 sums
// zero either way).
function upkeepCase(levels, dietCosts) {
  const plans = {};
  const roster = levels.map((level, i) => {
    if (dietCosts[i] >= 0) { plans['d' + i] = { weeklyCost: dietCosts[i] }; return { level, dietPlanId: 'd' + i }; }
    return { level, dietPlanId: null };
  });
  const total = economy.weeklyUpkeep({ roster }, (id) => plans[id] || null);
  return { levels, dietCosts, total };
}
const upkeep = [
  upkeepCase([], []),
  upkeepCase([1, 1, 1, 1, 1, 1], [-1, -1, -1, -1, -1, -1]),   // the founding six, level 1, undieted
  upkeepCase([1, 2, 3], [-1, -1, -1]),
  upkeepCase([5, 10], [-1, -1]),
  upkeepCase([1, 1, 4], [12, -1, 30]),
  upkeepCase([7], [0]),                                        // a free diet still costs its zero
  upkeepCase([3, 3], [25, 25]),
];

const goldClamp = [
  [100, -50], [100, -150], [0, -10], [0, 40], [500, -500], [794, -794], [10, 0], [3, -3],
].map(([gold, delta]) => {
  const g = { gold };
  return { gold, delta, result: economy.addGold(g, delta) };
});

const income = [0, 1, 5, 10, 15, 29, 30, 31, 60, 100]
  .map((reputation) => ({ reputation, income: economy.guildIncome({ reputation }) }));

// ── The opening purse, read off createGuild rather than re-typed ─────────────
const goldMatch = guildSrc.match(/gold:\s*init\.gold\s*\?\?\s*(\d+)/);
if (!goldMatch) throw new Error('createGuild opening gold not found in guild.js');
const startingGold = Number(goldMatch[1]);   // guild.js:67

const fixture = {
  startingGold,
  baseIncome: economy.BASE_INCOME,
  yardSlotCount: lifted.yardSlotCount,       // stations.js YARD_SLOTS.length — the physical yard
  facilities, tierClamp, effects, upgrades, derived,
  wages, upkeep, goldClamp, income,
};
const out = join(ROOT, '..', '..', '..', '..', 'Guild Rancher',
                 'Assets', 'Tests', 'EditMode', 'rooms-fixture.json');
writeFileSync(out, JSON.stringify(fixture, null, 1));
console.log(`fixture → ${out}`);
console.log(`${facilities.length} facilities, ${tierClamp.length} clamp cases, ${effects.length} effect strings,`
  + ` ${upgrades.length} upgrade rows, ${derived.length} derived states,`
  + ` ${wages.length} wages, ${upkeep.length} upkeep sums, ${goldClamp.length} gold clamps, ${income.length} incomes`);
