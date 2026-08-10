/**
 * A weapon reaches as far as its art says, and every lens agrees.
 *
 *   node --import ./dev/register-vite-env.mjs dev/check-reach.mjs
 *
 * WHY. Reach is transcribed in seven places — the board's Chebyshev test, the
 * arena's Euclidean one, the AI's mirror of it, the readied-action path, the
 * tile highlight, the printed "Range: N", and the delve's MELEE — and nothing
 * has ever checked that they say the same thing. That was survivable while
 * every melee weapon reached exactly one tile. It stopped being survivable the
 * moment one of them reached two.
 *
 * Most of those live inside crucible.js, which needs a DOM and cannot be
 * imported here. So this checks the thing they all READ FROM instead: the
 * single authored number, and — the part that matters — that the number is
 * still the one the ARTIST drew. Change the whip sheet and this fails.
 *
 * Exits non-zero on the first disagreement.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPng } from './png.mjs';
import { ATTACKS, ALL_ATTACKS, isMissile } from '../src/game/data/attacks.js';
import { WEAPON_REACH, gearReach, fighterReach, GEAR_TYPE_BY_NAME, WEAPON_GEAR_TYPES } from '../src/game/data/gear.js';
import { KIND_TO_ENGINE_TYPE } from '../src/guild/art.js';
import { PLAYER_H } from '../src/guild/prop-volume.js';
import { RECIPES } from '../src/guild/smithing.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SPRITES = path.join(HERE, '..', 'public', 'assets', 'sprites', 'core');
const COLS = 23, EAST = 2;
const problems = [];
const ok = (m) => console.log('  ok  ' + m);

// ── 1. `range` and `missile` are two facts, and both must be stated ─────────
// A row with range >= 2 that does not say whether it flies is the trap this
// split exists to close: under the old rule it silently became a projectile.
for (const a of ALL_ATTACKS) {
  if ((a.range || 1) >= 2 && a.missile === undefined) {
    problems.push(`attack '${a.name}': range ${a.range} but no \`missile\` — say which it is (data/attacks.js)`);
  }
}
if (!problems.length) ok(`${ALL_ATTACKS.filter((a) => (a.range || 1) >= 2).length} ranged attacks all declare \`missile\``);

// ── 2. The weapon's reach and the attack it names are one number ───────────
// basicAttackForEquipped hands a Whip the 'Lash'; if that row's range ever
// drifted from WEAPON_REACH the board and the gear card would disagree.
const NAMES = { Whip: 'Lash', Bow: 'Arrow Shot', Crossbow: 'Arrow Shot' };
for (const [type, reach] of Object.entries(WEAPON_REACH)) {
  if (!GEAR_TYPE_BY_NAME[type]) problems.push(`WEAPON_REACH names '${type}', which is not a gear type`);
  if (WEAPON_GEAR_TYPES.indexOf(type) < 0) {
    problems.push(`'${type}' has reach but is not in WEAPON_GEAR_TYPES — its materia would pay out as ARMOUR`);
  }
  const atk = ATTACKS[NAMES[type]];
  if (!atk) { problems.push(`'${type}' reaches ${reach} but names no attack`); continue; }
  if (atk.range !== reach) problems.push(`'${type}' reaches ${reach} but its attack '${atk.name}' has range ${atk.range}`);
  if (isMissile(atk)) problems.push(`'${type}' is a melee weapon but '${atk.name}' is a missile — it would leave the wielder's hand`);
  ok(`${type} reaches ${reach} and swings '${atk.name}' (range ${atk.range}, stays in hand)`);
}

// ── 3. Both hands answer, and the longer one wins ──────────────────────────
{
  const whip = { type: 'Whip' }, sword = { type: 'Sword' };
  const cases = [
    [{ RHand: sword, LHand: whip }, 2, 'a whip in the OFF hand still reaches two'],
    [{ RHand: whip, LHand: sword }, 2, 'a whip in the main hand reaches two'],
    [{ RHand: sword }, 1, 'a sword alone reaches one'],
    [{}, 1, 'empty hands reach one'],
  ];
  for (const [eq, want, why] of cases) {
    const got = fighterReach(eq);
    if (got !== want) problems.push(`fighterReach: ${why} — wanted ${want}, got ${got}`);
  }
  if (gearReach({ type: 'Whip', cosmetic: true }) !== 1) {
    problems.push('gearReach: a COSMETIC whip must reach 1 — a portrait may not arm a fighter');
  }
  ok('fighterReach takes the longer hand; a cosmetic whip reaches nothing');
}

// ── 4. THE NUMBER IS THE ART ───────────────────────────────────────────────
// The whole claim, re-measured from the sheets on disk: a weapon reaches as far
// as it is drawn, in units of the character it is drawn beside.
//
//   reach in tiles = (tip px past cell centre) / (character height px) × PLAYER_H
//
// The sword is the control — it must come back as the 1 tile the board has
// always given it. Anything that fails here means the art moved and the rules
// number is now a fiction.
function tipPastCentre(file, cols) {
  const im = readPng(file);
  const cell = im.w / COLS;
  let far = -1;
  for (const c of cols) {
    for (let y = 0; y < cell; y++) {
      for (let x = 0; x < cell; x++) {
        if (im.px[((EAST * cell + y) * im.w + c * cell + x) * 4 + 3] < 12) continue;
        if (x > far) far = x;
      }
    }
  }
  return far < 0 ? null : far + 1 - cell / 2;
}
function charHeight() {
  const CELL = 48;
  let top = CELL, bot = -1;
  for (const p of ['bottom/bottom1.png', 'top/top3.png', 'head/head1.png', 'hair/hair1.png']) {
    const im = readPng(path.join(SPRITES, p));
    for (let y = 0; y < CELL; y++) {
      for (let x = 0; x < CELL; x++) {
        if (im.px[((EAST * CELL + y) * im.w + 1 * CELL + x) * 4 + 3] < 12) continue;
        if (y < top) top = y;
        if (y > bot) bot = y;
      }
    }
  }
  return bot - top + 1;
}
{
  const H = charHeight();
  const SLASH = [10, 11, 12, 13, 14];
  const measured = (file) => {
    const tip = tipPastCentre(file, SLASH);
    return tip == null ? null : (tip / H) * PLAYER_H;
  };
  const control = measured(path.join(SPRITES, 'weapon', 'sword1.png'));
  if (control == null || Math.round(control) !== 1) {
    problems.push(`sword1 measures ${control && control.toFixed(2)} tiles of reach — the control should be 1; the measurement itself is wrong`);
  } else {
    ok(`character is ${H}px tall; sword1 reaches ${control.toFixed(2)} tiles → 1 (control)`);
  }
  // Every forgeable whip, not just the first rung: a mithril chainblade that
  // out-reached the leather one would be a second reach nobody authored.
  const whipFiles = new Set();
  for (const r of RECIPES) if (KIND_TO_ENGINE_TYPE[r.kind] === 'Whip') whipFiles.add(r.kind);
  for (const stem of ['whip', 'thornwhip', 'ballchain', 'chainblade']) {
    const t = measured(path.join(SPRITES, 'weapon', stem + '.png'));
    if (t == null) { problems.push(`${stem}.png paints nothing in the slash block`); continue; }
    if (Math.round(t) !== WEAPON_REACH.Whip) {
      problems.push(`${stem} measures ${t.toFixed(2)} tiles → ${Math.round(t)}, but WEAPON_REACH.Whip is ${WEAPON_REACH.Whip}`);
    } else {
      ok(`${stem.padEnd(11)} reaches ${t.toFixed(2)} tiles → ${Math.round(t)}`);
    }
  }
}

console.log();
if (problems.length) {
  console.error(`check-reach: ${problems.length} disagreement(s)\n`);
  for (const p of problems) console.error('  ✗ ' + p);
  process.exit(1);
}
console.log('check-reach: every weapon reaches what its art draws, in every lens that asks.');
