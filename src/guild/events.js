/**
 * @file Events — the typed calendar fabric (Monster-Rancher season pacing).
 *
 * The schedule used to be a flat rolling list of tournaments (one every ~8 weeks).
 * This module turns it into a SEASON: the 48-week year splits into four 12-week
 * seasons, each paced like MR's official calendar —
 *   · monthly MINOR tournaments (weeks 2, 6, 10 of each season) to earn and learn on,
 *   · one seasonal MAJOR on the season's final week (bigger field, double purse) —
 *     the tentpole you peak a champion for.
 * Every schedule entry carries a `type` discriminator; EVENT_TYPES holds each type's
 * display identity (and, as later keystones land festivals/errantries/rivals, their
 * generators and resolvers). Old saves migrate in hall.js load() (type → 'tournament').
 */
import { createTournament, generateTournament, generateWorldCup, WORLD_CUP_CADENCE } from './tournaments.js';

/** Four 12-week seasons per 48-week year. */
export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
/** @param {number} weekOfYear 1..48 */
export function seasonOf(weekOfYear) { return SEASONS[Math.max(0, Math.min(3, Math.floor((weekOfYear - 1) / 12)))]; }

/** Seasonal majors — one signature name per season (index = season). */
const MAJOR_NAMES = ['The Rite of Blossoms', 'The Solstice Crucible', 'The Harvest Crown', 'The Midwinter Grand Melee'];

/**
 * Display identity per event type. `card` rendering and resolution stay in hall.js's
 * bracket pipeline for bracket-shaped events; non-bracket types (festival, errantry,
 * rival — later keystones) will add `generate`/`resolve` hooks here.
 */
export const EVENT_TYPES = {
  tournament: { glyph: '🏆', name: 'Tournament', blurb: 'a monthly open bracket' },
  major:      { glyph: '👑', name: 'Seasonal Major', blurb: 'the season’s tentpole — double purse, brutal field' },
  worldcup:   { glyph: '🌍', name: 'World Cup', blurb: 'once every four years — the deadliest bracket; win it or fall trying' },
};

/** weekOfYear (1..48) for an absolute week, anchored on the current calendar. */
function weekOfYearAt(cal, absWeek) {
  const delta = absWeek - cal.week;
  return ((cal.weekOfYear - 1 + (delta % 48) + 48) % 48) + 1;
}

/**
 * Keep the schedule paced like a season: fill every scheduled slot in the next
 * `horizon` weeks — minors on season-weeks 2/6/10, the MAJOR on season-week 12.
 * Ranks rise with reputation (as before); majors sit one rank above the minors and
 * pay double. Existing unresolved entries are respected (no double-booking a week).
 * Replaces ensureSchedule() as the calendar's top-up (call after load + each week).
 * @param {import('./guild.js').Guild} guild
 */
export function generateSeason(guild, horizon = 14) {
  const cal = guild.calendar;
  guild.schedule = (guild.schedule || []).filter((t) => !t.resolved);
  const booked = new Set(guild.schedule.map((t) => t.week));
  // Clamped like the old ensureSchedule was — otherwise high-rep saves book minors
  // ABOVE the (capped) major, inverting the tentpole (review fix).
  const repRank = Math.min(4, 1 + Math.floor((guild.reputation || 0) / 60));

  for (let w = cal.week + 1; w <= cal.week + horizon; w++) {
    const wy = weekOfYearAt(cal, w);
    const seasonWeek = ((wy - 1) % 12) + 1;   // 1..12 inside the season
    if (booked.has(w)) {
      // A legacy/rolling entry may be squatting on a major slot — promote it in
      // place (entrants preserved) rather than silently cancelling the season's
      // tentpole (review fix).
      if (seasonWeek === 12) {
        const t = guild.schedule.find((x) => x.week === w && !x.resolved && x.type !== 'major' && x.type !== 'worldcup');
        if (t) {
          t.type = 'major';
          t.name = MAJOR_NAMES[Math.floor((wy - 1) / 12)] || 'The Grand Crucible';
          t.rank = Math.min(4, (t.rank || 1) + 1);
          t.field = Math.round(t.field * 1.3);
          t.rounds = Math.min(6, (t.rounds || 4) + 1);
          t.rewards = { gold: t.rewards.gold * 2, reputation: t.rewards.reputation * 2, loot: t.rewards.loot || 'steel_ore' };
        }
      }
      continue;
    }
    if (seasonWeek === 12) {
      // The seasonal MAJOR — one rank up, 130% field, double purse.
      const base = generateTournament(Math.min(4, repRank + 1), w);
      guild.schedule.push(createTournament({
        ...base,
        type: 'major',
        name: MAJOR_NAMES[Math.floor((wy - 1) / 12)] || 'The Grand Crucible',
        field: Math.round(base.field * 1.3),
        rounds: Math.min(6, base.rounds + 1),
        rewards: { gold: base.rewards.gold * 2, reputation: base.rewards.reputation * 2, loot: base.rewards.loot || 'steel_ore' },
      }));
      booked.add(w);
    } else if (seasonWeek === 2 || seasonWeek === 6 || seasonWeek === 10) {
      guild.schedule.push(generateTournament(repRank, w));
      booked.add(w);
    }
  }
  guild.schedule.sort((a, b) => a.week - b.week);
  return guild.schedule;
}

/**
 * Keep the next World Cup on the calendar. World Cups land every WORLD_CUP_CADENCE
 * weeks; we book the upcoming one as soon as it's computed so the guild can SEE it
 * looming for years and breed a successor for it. If a minor/major already squats on
 * that week, it's promoted in place (entrants preserved). Call after generateSeason.
 * @param {import('./guild.js').Guild} guild
 */
export function ensureWorldCup(guild) {
  const cal = guild.calendar;
  const next = Math.ceil((cal.week + 1) / WORLD_CUP_CADENCE) * WORLD_CUP_CADENCE; // next cadence multiple after now
  guild.schedule = (guild.schedule || []).filter((t) => !t.resolved);
  if (guild.schedule.some((t) => t.type === 'worldcup' && t.week === next)) return; // already booked
  const repRank = Math.min(4, 1 + Math.floor((guild.reputation || 0) / 60));
  const wc = generateWorldCup(Math.min(4, repRank + 1), next);
  const existing = guild.schedule.find((t) => t.week === next && !t.resolved);
  if (existing) Object.assign(existing, wc, { id: existing.id, entrants: existing.entrants }); // promote in place
  else guild.schedule.push(wc);
  guild.schedule.sort((a, b) => a.week - b.week);
  return guild.schedule;
}
