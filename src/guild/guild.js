/**
 * @file Guild — the top-level object the player manages: the roster of heroes,
 * the recruit pool, the quest board, gold/reputation, and the calendar.
 */
import { createCalendar } from './calendar.js';
import { createInventory } from './inventory.js';
import { createMarket } from './market.js';

/**
 * @typedef {Object} Guild
 * @property {string} name
 * @property {number} gold
 * @property {number} reputation   unlocks higher-rank quests & recruits
 * @property {number} rank         guild rank 1..7 (mirrors engine RANKS)
 * @property {import('./hero.js').Hero[]} roster
 * @property {import('./hero.js').Hero[]} recruits      current hireable pool
 * @property {import('./quests.js').Quest[]} questBoard available submitted quests
 * @property {import('./quests.js').Quest[]} activeQuests dispatched, in-progress
 * @property {import('./calendar.js').Calendar} calendar
 * @property {Object.<string,number>} facilities tier (0-based) of each buildable facility
 * @property {import('./tournaments.js').Tournament[]} schedule scheduled tournaments (season events)
 */

/**
 * The guild's buildable facilities — the "Grounds" the player expands. Each is a
 * simple tier ladder: index 0 is the starting (already-owned) tier, and upgrading
 * to tier t costs `costs[t]`. Facilities are gold-gated only (guild.rank isn't yet
 * advanced anywhere, so a rank gate would soft-lock expansion).
 *  - quarters: Living Quarters → how many members the guild can house (the roster cap).
 *  - yard:     Training Yard   → a flat multiplier on weekly training/spar stat gains.
 *  - ring:     Sparring Ring   → raises the overtraining-injury threshold (fewer injuries).
 *  - mess:     Mess Hall       → how many mouths the guild can feed (display for now; the
 *                                supply-gated-diet system will consume it later).
 * @type {Object.<string, {name:string, glyph:string, desc:string, costs:number[], caps?:number[], mainMult?:number[], injuryBonus?:number[], fed?:number[]}>}
 */
export const FACILITIES = {
  quarters: { name: 'Living Quarters', glyph: '🏠', desc: 'Beds & bunks. Raises how many members the guild can house.',
    caps: [6, 10, 20, 60, 120], costs: [0, 800, 2000, 6000, 15000] },
  yard: { name: 'Training Yard', glyph: '⚔', desc: 'Grounds & equipment. Speeds up training and unlocks equipment slots on the ranch (2 / 4 / 6 / 9).',
    mainMult: [1, 1.1, 1.2, 1.3], slots: [2, 4, 6, 9], costs: [0, 600, 1800, 5000] },
  ring: { name: 'Sparring Ring', glyph: '🥊', desc: 'A padded arena. Lowers the risk of overtraining injuries.',
    injuryBonus: [0, 20, 35, 50], costs: [0, 500, 1500, 4500] },
  mess: { name: 'Mess Hall', glyph: '🍲', desc: 'Kitchens & stores. Sets how many mouths the guild can feed.',
    fed: [6, 12, 24, 60, 120], costs: [0, 700, 2000, 6000, 14000] },
  infirmary: { name: 'Infirmary', glyph: '🩹', desc: 'Cots & a surgeon. Injuries heal twice as fast (tier 1+).',
    healRate: [1, 2, 2, 3], costs: [0, 900, 2400, 6500] },
};

/** Current (clamped) tier of a facility for this guild. @param {Guild} guild @param {string} key */
export function facilityTier(guild, key) {
  const def = FACILITIES[key];
  if (!def) return 0;
  const t = guild && guild.facilities && typeof guild.facilities[key] === 'number' ? guild.facilities[key] : 0;
  return Math.max(0, Math.min(def.costs.length - 1, t));
}
/** The roster cap, derived from the Living Quarters tier (replaces the old MAX_ROSTER const). */
export function maxRoster(guild) { return FACILITIES.quarters.caps[facilityTier(guild, 'quarters')]; }
/** How many members the Mess Hall can feed, derived from its tier. */
export function fedCapacity(guild) { return FACILITIES.mess.fed[facilityTier(guild, 'mess')]; }

/** @param {Partial<Guild>} [init] @returns {Guild} */
export function createGuild(init = {}) {
  return {
    name: init.name || 'The Wandering Blade',
    gold: init.gold ?? 500,
    reputation: init.reputation ?? 0,
    rank: init.rank ?? 1,
    roster: init.roster || [],
    recruits: init.recruits || [],
    questBoard: init.questBoard || [],
    activeQuests: init.activeQuests || [],
    calendar: init.calendar || createCalendar(),
    inventory: init.inventory || createInventory(),
    market: init.market || createMarket(),
    quartermaster: init.quartermaster || 'off', // equip policy: 'off' | 'party' | 'all'
    facilities: init.facilities || { quarters: 0, yard: 0, ring: 0, mess: 0 }, // tier per facility; tier 0 == today's defaults (cap 6, no bonuses)
    stations: init.stations || [], // placeable training equipment on the ranch (Guild Academy Pillar A)
    schedule: init.schedule || [], // upcoming tournaments — seeded by ensureSchedule() in the hall's load()
    battlePrefs: init.battlePrefs || { tournament: 'ask' }, // per-event-type combat prefs: 'ask' (chooser on due events) | 'sim' (never ask)
    playPlan: init.playPlan || null, // armed play opt-in: { kind:'tournament'|'quest', id, mode:'action'|'tactical' } — survives reload
    hallOfFame: init.hallOfFame || [], // retired members' frozen careers (the shrine)
    trainer: init.trainer || null, // an appointed retired champion — +15% training gains (staff slots generalize later)
  };
}

/** Add a hero to the roster. @param {Guild} guild @param {import('./hero.js').Hero} hero */
export function addHero(guild, hero) { guild.roster.push(hero); return hero; }

/** @param {Guild} guild @param {string} heroId @returns {?import('./hero.js').Hero} */
export function findHero(guild, heroId) { return guild.roster.find(h => h.id === heroId) || null; }
