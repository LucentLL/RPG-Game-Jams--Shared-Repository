/**
 * @file Tournaments — the season's tentpole events (Monster-Rancher style).
 *
 * Unlike quests (a fresh, reactive board each week), tournaments are SCHEDULED far in
 * advance at fixed weeks, so the player can SEE them coming and plan training toward
 * them. You ENTER heroes ahead of time; on the tournament's week it auto-resolves as a
 * small single-elimination bracket — the entered lineup's combined power vs an
 * escalating field, round by round. Placing well pays far more gold + reputation than a
 * quest. This is the long-horizon spine that gives week-to-week training a purpose.
 */
import { heroPower } from './hero.js';

// Flavour names by rank tier (index = rank-1, clamped).
const CIRCUITS = [
  ['The Village Cup', 'The Harvest Melee', 'The Copper Circuit'],
  ['The Iron Tournament', 'The Free Cities Open', "The Wardens' Trial"],
  ['The Silver Gauntlet', 'The Grand Melee', "The Champions' League"],
  ['The Crown Tournament', 'The Mythic Invitational', 'The Adamant Crucible'],
];
const rand = (n) => Math.floor(Math.random() * n);
const TIER = (rank) => Math.max(0, Math.min(CIRCUITS.length - 1, rank - 1));

let _seq = 0;
const _run = Math.random().toString(36).slice(2, 6);
function nextId() { return 'tourney_' + _run + (++_seq).toString(36); }

/**
 * @typedef {Object} Tournament
 * @property {string} id @property {string} name @property {number} rank
 * @property {number} week   absolute target week (calendar.week) it resolves on
 * @property {number} field  opponent power baseline (the final round is ~1.35× this)
 * @property {number} rounds bracket depth — win them all to be Champion
 * @property {{gold:number, reputation:number, loot:?string}} rewards  Champion payout (placements get a fraction)
 * @property {string[]} entrants  heroIds signed up in advance
 * @property {boolean} resolved
 * @property {?Object} result  filled in after resolution
 */

/** @param {Partial<Tournament>} [init] @returns {Tournament} */
export function createTournament(init = {}) {
  return {
    id: init.id || nextId(),
    type: init.type || 'tournament', // event-type discriminator: 'tournament' | 'major' (more via events.js)
    name: init.name || 'Open Tournament',
    rank: init.rank ?? 1,
    week: init.week ?? 1,
    field: init.field ?? 150,
    rounds: init.rounds ?? 4,
    rewards: init.rewards || { gold: 300, reputation: 8, loot: null },
    entrants: Array.isArray(init.entrants) ? init.entrants : [],
    resolved: init.resolved ?? false,
    result: init.result || null,
  };
}

/** A tournament scaled to a rank, landing on absolute `week`. */
export function generateTournament(rank, week) {
  const r = Math.max(1, rank);
  const names = CIRCUITS[TIER(r)];
  return createTournament({
    name: names[rand(names.length)],
    rank: r,
    week,
    field: 150 + (r - 1) * 120,
    rounds: Math.min(5, 3 + Math.floor(r / 2)),
    // Tournaments are the tentpoles — they pay well above a same-rank quest.
    rewards: { gold: 220 + r * 120, reputation: 6 + r * 4, loot: r >= 3 ? 'mithril_ore' : (r >= 2 ? 'steel_ore' : null) },
  });
}

/**
 * Keep a rolling window of `count` UPCOMING tournaments on the calendar — one roughly
 * every `cadence` weeks, ranks rising the further out they sit (and floored by the
 * guild's reputation). Drops resolved ones and re-sorts. Call after load() and after
 * each Advance Week so there's always something on the horizon to train toward.
 * @param {import('./guild.js').Guild} guild
 */
export function ensureSchedule(guild, count = 3, cadence = 8) {
  const cur = guild.calendar.week;
  const repRank = 1 + Math.floor((guild.reputation || 0) / 60);
  guild.schedule = (guild.schedule || []).filter((t) => !t.resolved);
  let lastWeek = guild.schedule.reduce((m, t) => Math.max(m, t.week), cur);
  let guard = 0;
  while (guild.schedule.filter((t) => t.week > cur).length < count && guard++ < 20) {
    lastWeek += cadence;
    const weeksOut = lastWeek - cur;
    const rank = Math.max(1, Math.min(CIRCUITS.length, repRank + Math.floor(weeksOut / 24)));
    guild.schedule.push(generateTournament(rank, lastWeek));
  }
  guild.schedule.sort((a, b) => a.week - b.week);
  return guild.schedule;
}

/** The next unresolved tournament on/after the current week (for teasers/status). */
export function nextTournament(guild) {
  const cur = guild.calendar.week;
  return (guild.schedule || []).filter((t) => !t.resolved && t.week >= cur).sort((a, b) => a.week - b.week)[0] || null;
}

/**
 * The field's strength in round `i` (0-based): round 0 ≈ field×0.65, the final ≈
 * field×1.35. THE single source of bracket math — resolveTournament, championOdds,
 * and the played-bracket adapter (battle-bridge) all read this, so displayed odds,
 * simulated brackets, and played brackets can never drift apart.
 * @param {Tournament} t @param {number} i  round index, 0-based
 */
export function roundOpponentPower(t, i) {
  const rounds = t.rounds || 4;
  return t.field * (0.65 + i * (0.7 / Math.max(1, rounds - 1)));
}

/**
 * Resolve a tournament as a small bracket: the lineup's combined power faces an
 * escalating field each round (roundOpponentPower); you advance while you win, and
 * the round you lose is your placement. Mirrors resolveQuest's power×variance model
 * so odds stay honest.
 * @param {Tournament} t @param {import('./hero.js').Hero[]} lineup
 * @param {(h:import('./hero.js').Hero)=>number} [powerFn]
 * @returns {{power:number, rounds:number, wins:number, champion:boolean}}
 */
export function resolveTournament(t, lineup, powerFn = heroPower) {
  const power = lineup.reduce((s, h) => s + powerFn(h), 0);
  const rounds = t.rounds || 4;
  let wins = 0;
  for (let i = 0; i < rounds; i++) {
    const variance = 0.8 + Math.random() * 0.4; // 0.8..1.2
    if (power * variance >= roundOpponentPower(t, i)) wins++;
    else break;
  }
  return { power, rounds, wins, champion: wins === rounds };
}

/** Placement label + reward fraction from a resolution. */
export function placement(res) {
  if (res.champion) return { label: 'Champion', place: 1, frac: 1 };
  if (res.wins === res.rounds - 1) return { label: 'Finalist', place: 2, frac: 0.5 };
  if (res.wins >= Math.ceil(res.rounds / 2)) return { label: 'Semi-finalist', place: 4, frac: 0.25 };
  if (res.wins >= 1) return { label: `Round ${res.wins}`, place: 8, frac: 0.1 };
  return { label: 'Eliminated', place: 0, frac: 0 };
}

/**
 * Estimated probability (0..1) of winning the WHOLE bracket for a lineup of `power`.
 * Product of each round's P(win) under the same variance model as resolveTournament,
 * so the Calendar's displayed odds can't drift from the resolver.
 */
export function championOdds(power, t) {
  const rounds = t.rounds || 4;
  let p = 1;
  for (let i = 0; i < rounds; i++) {
    p *= Math.max(0, Math.min(1, (1.2 - roundOpponentPower(t, i) / Math.max(1, power)) / 0.4));
  }
  return p;
}

// ─── Stakes: the injury/death gradient by event tier ─────────────────────────
// The tier is derived from the event TYPE, so the same season fabric carries a
// rising danger: monthly minors are FRIENDLIES (safe practice, no deaths), the
// seasonal MAJORS carry real stakes, and the WORLD CUP can kill — which is what
// forces you to keep a successor in training (the Academy loop).
export const STAKES = {
  tournament: { tier: 'Friendly',    glyph: '🕊', injury: 0.04, death: 0,     deathRamp: 0,   danger: 'Friendly — low injury risk, no danger to life.' },
  major:      { tier: 'Competitive', glyph: '⚔', injury: 0.12, death: 0.006, deathRamp: 0.8, danger: 'Real stakes — injuries likely; a brutal loss can end a career.' },
  worldcup:   { tier: 'World Cup',   glyph: '🌍', injury: 0.24, death: 0.03,  deathRamp: 1.6, danger: 'Lethal — losing an elimination match can KILL. Keep a successor ready.' },
};
/** The stakes profile for an event (by type). */
export function stakesOf(t) { return STAKES[(t && t.type)] || STAKES.tournament; }

/**
 * Per-competitor injury/death risk from one event, given how they placed. Risk rises
 * with the event's STAKES, how DEEP they fought (tougher fields), and how OUTMATCHED
 * they were. Champions can be hurt but never die (they won every round). Returns
 * chances in 0..1 plus a severity hint for the injury ladder.
 * @param {Tournament} t @param {number} power  the competitor's combat power
 * @param {{wins:number,rounds:number,champion:boolean}} res
 */
export function competitionHarm(t, power, res) {
  const s = stakesOf(t);
  const rounds = t.rounds || 4;
  const fought = res.champion ? rounds : Math.min(rounds, (res.wins || 0) + 1); // the extra round is the one they lost
  const depth = fought / rounds; // deeper run = tougher opponents = more toll
  const toughest = roundOpponentPower(t, Math.max(0, fought - 1));
  const mismatch = Math.max(0.6, Math.min(2.4, toughest / Math.max(1, power))); // >1 = outmatched
  const injuryChance = Math.min(0.85, s.injury * (0.5 + depth) * mismatch);
  const deathChance = res.champion ? 0 : Math.min(0.5, s.death * (1 + s.deathRamp * depth) * mismatch * mismatch);
  return { injuryChance, deathChance, severityOverflow: Math.round((mismatch - 1) * 80 + depth * 30) };
}

/** Weeks between World Cups (~4 years of 48-week years). Tune this one number. */
export const WORLD_CUP_CADENCE = 192;
/** The apex event: the deepest, deadliest bracket, once every four years, richest purse. */
export function generateWorldCup(rank, week) {
  const r = Math.max(1, rank);
  return createTournament({
    type: 'worldcup',
    name: 'The World Cup',
    rank: r,
    week,
    field: Math.round((150 + (r - 1) * 120) * 1.5),
    rounds: 6,
    rewards: { gold: 2000 + r * 400, reputation: 40 + r * 10, loot: 'mithril_ore' },
  });
}
