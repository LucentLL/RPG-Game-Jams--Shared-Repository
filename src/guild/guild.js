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
 * @property {string[]} facilities unlocked training/diet facilities
 */

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
    facilities: init.facilities || ['training-yard', 'kitchen', 'forge'],
  };
}

/** Add a hero to the roster. @param {Guild} guild @param {import('./hero.js').Hero} hero */
export function addHero(guild, hero) { guild.roster.push(hero); return hero; }

/** @param {Guild} guild @param {string} heroId @returns {?import('./hero.js').Hero} */
export function findHero(guild, heroId) { return guild.roster.find(h => h.id === heroId) || null; }
