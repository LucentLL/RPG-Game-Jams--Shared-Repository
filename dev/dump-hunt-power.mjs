/**
 * THE HUNT'S MUSCLE, WITNESSED — a fixture for the Unity port's HuntDispatch.
 *
 * The hall dispatches hunts on ONE power number: combatPower (hall.js:116)
 * = heroPower (hero.js:144-148, stats summed and nudged by level) + gearBonus
 * (inventory.js:128-137, the forged armory's worth). resolveHunt and the odds
 * card both sum that number over the marching party (locales.js:168,
 * hall.js:3325), and canMarch (hall.js:59) decides who marches at all.
 *
 * All four are LIFTED VERBATIM (dump-rooms.mjs's balanced-delimiter lifter —
 * the lifted text IS the source, so it cannot drift) and run over hand-picked
 * stat hands. gearBonus is lifted with a findItem/itemPower that THROW: the
 * Unity build has no forged armory yet, and the witness here is that a hero
 * with nothing equipped never consults it — combatPower === heroPower, to the
 * digit, which is the only hero the port can produce today.
 *
 * Every number is an integer (heroPower Math.rounds; canMarch rides as 0/1),
 * per the fixture law. The odds/spoils tables are the world-map lane's dumper
 * — not duplicated here.
 *
 *     node dev/dump-hunt-power.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(ROOT, 'src', 'guild', p), 'utf8');

const heroSrc = src('hero.js');
const invSrc = src('inventory.js');
const hallSrc = src('hall.js');

// ── Lift, verbatim (dump-rooms.mjs's lifter) ─────────────────────────────────
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

// canMarch is a one-line const arrow (hall.js:59) — lift to its semicolon.
const canMarchTxt = hallSrc.match(/const canMarch = \(h\) => [^;]+;/)?.[0];
if (!canMarchTxt) throw new Error('canMarch not found in hall.js');
const questStamina = Number(hallSrc.match(/const QUEST_STAMINA = (\d+)/)?.[1]);
if (!Number.isInteger(questStamina)) throw new Error('QUEST_STAMINA not found in hall.js');

const lifted = new Function(
  'const HERO_STATS = ' + liftVal(heroSrc, 'HERO_STATS', '[', ']') + ';\n'
  // The armory tripwires: a bare hero's gearBonus must never reach them.
  + 'const findItem = () => { throw new Error("bare hero consulted the armory"); };\n'
  + 'const itemPower = () => { throw new Error("bare hero priced an item"); };\n'
  + liftFn(heroSrc, 'heroPower') + '\n'
  + liftFn(invSrc, 'gearBonus') + '\n'
  + 'const guild = { inventory: { items: [], materials: {} } };\n'
  + liftFn(hallSrc, 'combatPower') + '\n'
  + 'const QUEST_STAMINA = ' + questStamina + ';\n'
  + canMarchTxt + '\n'
  + 'return { heroPower, combatPower, canMarch };'
)();

/** A web-shaped hero from an MR block: stats keyed POW..VIT (hero.js order),
 *  nothing equipped, condition as given. */
const KEYS = ['POW', 'DEF', 'SKL', 'SPD', 'INT', 'VIT'];
const hero = (mr, level, condition) => {
  const stats = {};
  KEYS.forEach((k, i) => { stats[k] = mr[i]; });
  return { stats, level, equipped: {}, condition: condition || { injury: null, stamina: 100 } };
};

// ── heroPower / combatPower over hand-picked stat hands ──────────────────────
// Sums chosen to sit ON and AROUND the .5 rounding boundary at ×1.1 (level 1:
// 105 → 115.5, 115 → 126.5) — the exact seam where a float port would betray
// the double the web computes with.
const hands = [
  { mr: [0, 0, 0, 0, 0, 0], level: 1 },
  { mr: [12, 12, 12, 12, 12, 12], level: 1 },        // the founding floor (rollStatBlock's base)
  { mr: [12, 14, 18, 20, 25, 30], level: 1 },
  { mr: [20, 20, 20, 20, 20, 5], level: 1 },         // sum 105 → 115.5 at level 1
  { mr: [20, 20, 20, 20, 20, 15], level: 1 },        // sum 115 → 126.5 at level 1
  { mr: [17, 17, 17, 17, 17, 16], level: 1 },        // sum 101 → 111.1
  { mr: [33, 12, 28, 19, 7, 26], level: 2 },
  { mr: [50, 50, 50, 50, 50, 50], level: 3 },
  { mr: [55, 40, 35, 60, 45, 50], level: 4 },
  { mr: [70, 65, 80, 75, 60, 55], level: 5 },
  { mr: [99, 98, 97, 96, 95, 94], level: 7 },
  { mr: [100, 100, 100, 100, 100, 100], level: 1 },
  { mr: [100, 100, 100, 100, 100, 100], level: 10 },
  { mr: [100, 100, 100, 100, 100, 100], level: 20 },
  { mr: [13, 27, 41, 8, 36, 22], level: 1 },
  { mr: [45, 3, 88, 61, 29, 74], level: 6 },
  { mr: [31, 31, 31, 31, 31, 30], level: 15 },
  { mr: [24, 18, 33, 29, 21, 26], level: 2 },
];
const power = hands.map(({ mr, level }) => {
  const h = hero(mr, level);
  const hp = lifted.heroPower(h);
  const cp = lifted.combatPower(h);   // throws if the bare hero touches the armory
  if (cp !== hp) throw new Error(`combatPower ${cp} !== heroPower ${hp} for a bare hero`);
  if (!Number.isInteger(cp)) throw new Error('non-integer power — the fixture law');
  return { stats: mr, level, power: cp };
});

// ── Party power: the sum the odds card and the resolver both take ────────────
// (locales.js:168 `party.reduce((s,h) => s + powerFn(h), 0)`; hall.js:3325 the
// same sum for the displayed odds.) `members` index into the power rows above.
const parties = [
  { members: [1] },
  { members: [1, 2] },
  { members: [3, 4, 5] },
  { members: [0, 11] },                 // a nobody and a titan
  { members: [6, 7, 8, 9, 10] },
  { members: [13, 13] },                // the same hand twice — a sum, not a set
  { members: [] },                      // nobody marched: power 0
].map(({ members }) => ({
  members,
  total: members.reduce((s, i) => s + lifted.combatPower(hero(hands[i].mr, hands[i].level)), 0),
}));

// ── canMarch's truth table (hall.js:59) ──────────────────────────────────────
// injury 1 = any injury object; marches as 0/1. The Unity build has no
// condition system yet — its CanMarch can only replay the fresh-hero row
// (injury 0, stamina 100) — but the whole table is pinned here for the day
// condition ports, so the threshold cannot be re-invented from memory.
const canMarch = [];
for (const injury of [0, 1])
  for (const stamina of [0, 39, 40, 41, 100])
    canMarch.push({
      injury, stamina,
      marches: lifted.canMarch(hero([20, 20, 20, 20, 20, 20], 1,
        { injury: injury ? { kind: 'sprain' } : null, stamina })) ? 1 : 0,
    });

const fixture = { questStamina, power, parties, canMarch };
const out = join(ROOT, '..', '..', '..', '..', 'Guild Rancher',
                 'Assets', 'Tests', 'EditMode', 'hunt-power-fixture.json');
writeFileSync(out, JSON.stringify(fixture, null, 1));
console.log(`fixture → ${out}`);
console.log(`${power.length} power hands, ${parties.length} party sums, ${canMarch.length} march cases, quest stamina ${questStamina}`);
