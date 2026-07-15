/**
 * @file Rivals — the persistent named circuit your heroes compete against.
 *
 * Tournaments used to be fought against an anonymous power curve: synthetic foes
 * were minted mid-fight and thrown away, so there was nothing to scout, no one to
 * hate, and no record to settle. This module gives the circuit FACES: a pool of
 * persistent named competitors (`guild.rivals`) with careers of their own. Every
 * scheduled event draws its FIELD from the pool (`ensureField` — one rival per
 * bracket round), so the Tourney Board can show exactly who waits in each round
 * before anything is fought, and the resolver/played-bracket meet those same
 * rivals. Records accrue on both sides: beat a rival and their loss column grows;
 * fall to one and they take the title — and next season they're back, fatter.
 *
 * Anti-lie invariant: a rival drawn into round `i` is RETUNED to exactly
 * `roundOpponentPower(t, i)` (they trained too), so the ⚡ on the board IS the
 * number `resolveTournament` checks and the stat spread the played round fights.
 */
import { roundOpponentPower } from './tournaments.js';
import { HERO_STATS } from './hero.js';

const rand = (n) => Math.floor(Math.random() * n);

let _seq = 0;
const _run = Math.random().toString(36).slice(2, 6);
function nextRivalId() { return 'rival_' + _run + (++_seq).toString(36); }

const ARCHES = ['Knight', 'Ranger', 'Mage', 'Cleric', 'Rogue', 'Berserker'];
const FORE = ['Sera', 'Kael', 'Brann', 'Yasha', 'Odric', 'Mireille', 'Tomas', 'Iskra', 'Dain', 'Vela',
  'Roderic', 'Anouk', 'Corvin', 'Petra', 'Hale', 'Sunniva', 'Garrick', 'Liesl', 'Emeric', 'Nadia'];
const AFT = ['Ashvale', 'the Unbowed', 'of the Reach', 'Thornwood', 'Greyspur', 'the Lantern', 'Vosk',
  'Half-Moon', 'Ironquill', 'of Duskmere', 'the Younger', 'Stormsong', 'Redmarsh', 'the Patient',
  'Coalbrand', 'of the Nine Fords', 'Whitecrow', 'the Long-Odds', 'Marrowgate', 'Two-Rivers'];

/** Spread a rival's power evenly-ish across the six MR stats (mirrors the bridge's
 *  foes, INCLUDING its per-stat 100 cap — the played engine's tables assume heroic
 *  scale; the RESOLVER's check uses rival.power, which stays uncapped and honest). */
function spreadStats(power) {
  const per = Math.max(8, Math.min(100, Math.round((power || 120) / 6)));
  const stats = {};
  HERO_STATS.forEach((s) => { stats[s] = Math.max(6, Math.min(100, per + Math.round((Math.random() - 0.5) * 10))); });
  return stats;
}

/**
 * @typedef {Object} Rival
 * @property {string} id @property {string} name @property {string} archetype
 * @property {number} appearanceSeed  stable face (Elements engine derives the look)
 * @property {number} power   current circuit strength — retuned when drawn into a round
 * @property {Object.<string,number>} stats  MR-stat spread of `power` (played rounds fight these)
 * @property {{w:number,l:number,d:number}} record  career wins/losses/draws
 * @property {number} titles  events won on the circuit
 * @property {number} seenWeek  last week they appeared in a drawn field (for pool pruning)
 */

/** @param {number} power @param {number} week @returns {Rival} */
export function createRival(power, week) {
  const p = Math.max(30, Math.round(power || 120));
  return {
    id: nextRivalId(),
    name: FORE[rand(FORE.length)] + ' ' + AFT[rand(AFT.length)],
    archetype: ARCHES[rand(ARCHES.length)],
    appearanceSeed: (Math.random() * 1e9) | 0,
    power: p,
    stats: spreadStats(p),
    record: { w: rand(6), l: rand(4), d: 0 }, // they had a career before you met them
    titles: 0,
    seenWeek: week || 1,
  };
}

/** @param {import('./guild.js').Guild} guild @param {string} id @returns {?Rival} */
export function rivalById(guild, id) { return (guild.rivals || []).find((r) => r.id === id) || null; }

/** Retune a drawn rival to a round's exact field strength — they trained too. */
function retune(rival, power) {
  rival.power = Math.round(power);
  rival.stats = spreadStats(rival.power);
}

/**
 * Draw (or repair) an event's field: one named rival per bracket round, favoring
 * pool rivals near that round's strength, minting new blood when none fit. Mutates
 * `guild.rivals` and `t.rivalIds` — call from load()/advanceAll (never mid-render)
 * so the draw is decided once and persists. Returns true if anything changed.
 * @param {import('./guild.js').Guild} guild @param {import('./tournaments.js').Tournament} t
 */
export function ensureField(guild, t) {
  if (!t || t.resolved) return false;
  guild.rivals = guild.rivals || [];
  const rounds = t.rounds || 4;
  const have = Array.isArray(t.rivalIds) ? t.rivalIds : [];
  if (have.length === rounds && have.every((id) => rivalById(guild, id))) return false;
  const week = guild.calendar ? guild.calendar.week : 1;
  // A rival can't be drawn into two live events at once: drawing retunes their ⚡,
  // which would silently desync the OTHER event's board from its resolver (anti-lie).
  const taken = new Set();
  for (const other of guild.schedule || []) {
    if (other !== t && !other.resolved) (other.rivalIds || []).forEach((id) => taken.add(id));
  }
  t.rivalIds = [];
  for (let i = 0; i < rounds; i++) {
    const target = roundOpponentPower(t, i);
    // Nearest free pool rival within ±25% keeps faces recurring; else new blood.
    let best = null, bestGap = 0.25;
    for (const r of guild.rivals) {
      if (taken.has(r.id)) continue;
      const gap = Math.abs(r.power - target) / Math.max(1, target);
      if (gap <= bestGap) { best = r; bestGap = gap; }
    }
    const rival = best || (guild.rivals.push(createRival(target, week)), guild.rivals[guild.rivals.length - 1]);
    retune(rival, target);
    rival.seenWeek = week;
    taken.add(rival.id);
    t.rivalIds.push(rival.id);
  }
  return true;
}

/**
 * Write an event's outcome into the rivals' careers. Reaching round `i` of a
 * single-elim bracket means a rival already won `i` matches; then your champion
 * either beat them (their L) or fell to them (their W). If the guild didn't take
 * the title, the final-round rival did.
 * @param {import('./guild.js').Guild} guild @param {import('./tournaments.js').Tournament} t
 * @param {?{wins:number,rounds:number,champion:boolean}} res  null/forfeit → the field played itself
 */
export function recordFieldOutcome(guild, t, res) {
  const ids = Array.isArray(t.rivalIds) ? t.rivalIds : [];
  const rounds = t.rounds || 4;
  ids.forEach((id, i) => {
    const r = rivalById(guild, id);
    if (!r) return;
    r.record.w += i; // the matches that carried them to round i+1
    if (res && !res.forfeit) {
      if (i < res.wins) r.record.l += 1;               // your champion cut them down
      else if (i === res.wins && !res.champion) r.record.w += 1; // the one who stopped you
    }
  });
  if (!res || res.forfeit || !res.champion) {
    const finalRival = rivalById(guild, ids[rounds - 1]);
    if (finalRival) {
      finalRival.titles += 1; // someone lifts the cup
      // The W for beating YOUR champion in the final was already booked by the
      // stopped-you branch above — don't count the same match twice (review fix).
      if (!res || res.forfeit || res.wins < rounds - 1) finalRival.record.w += 1;
    }
  }
}

/**
 * Keep the pool from growing without bound: drop rivals unseen for ~2 years who
 * aren't drawn into any unresolved event. Call after ensureField passes.
 * @param {import('./guild.js').Guild} guild
 */
export function pruneRivals(guild, maxIdleWeeks = 96) {
  const pool = guild.rivals || [];
  if (pool.length <= 24) return;
  const week = guild.calendar ? guild.calendar.week : 1;
  const drawn = new Set();
  for (const t of guild.schedule || []) {
    if (!t.resolved) (t.rivalIds || []).forEach((id) => drawn.add(id));
  }
  guild.rivals = pool.filter((r) => drawn.has(r.id) || week - (r.seenWeek || 0) <= maxIdleWeeks);
}
