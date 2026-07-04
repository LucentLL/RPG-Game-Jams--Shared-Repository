/**
 * @file Quest board. Patrons submit quests to the guild; the player dispatches
 * heroes to fulfill them. Resolution will run through the battle engine
 * (src/game/crucible.js) — for now resolveQuest() is a stubbed estimate.
 */
import { heroPower } from './hero.js';

/**
 * @typedef {Object} Quest
 * @property {string} id
 * @property {string} title
 * @property {string} patron           who submitted it
 * @property {number} rank             1..7 difficulty (mirrors engine RANKS)
 * @property {string[]} requiredTags   e.g. ['combat'], ['stealth'], ['escort']
 * @property {number} recommendedPower compare against heroPower()
 * @property {number} durationWeeks
 * @property {{gold:number, reputation:number, loot?:string}} rewards
 * @property {number} risk             0..1 baseline injury/failure chance
 * @property {?number} deadlineWeek    guild-week the quest expires (null = open)
 * @property {?string[]} party         hero ids dispatched (null = unassigned)
 */

let _questSeq = 0;
function nextQuestId() { return 'quest_' + (++_questSeq).toString(36); }

/** @param {Partial<Quest>} [init] @returns {Quest} */
export function createQuest(init = {}) {
  return {
    id: init.id || nextQuestId(),
    title: init.title || 'Odd Job',
    patron: init.patron || 'A Villager',
    rank: init.rank ?? 1,
    requiredTags: init.requiredTags || ['combat'],
    recommendedPower: init.recommendedPower ?? 50,
    durationWeeks: init.durationWeeks ?? 1,
    rewards: init.rewards || { gold: 50, reputation: 5 },
    risk: init.risk ?? 0.15,
    deadlineWeek: init.deadlineWeek ?? null,
    party: init.party || null,
  };
}

const PATRONS = ['The Crown', 'A Merchant Guild', 'A Frightened Village', 'The Temple', 'A Noble House'];
const TITLES = ['Clear the Warrens', 'Escort the Caravan', 'Slay the Beast', 'Recover the Relic', 'Purge the Ruins'];

/**
 * Generate a quest scaled to a rank. TODO: pull rewards/loot from the engine's
 * gear/materia generators so quest loot matches the item system.
 * @param {number} [rank]
 * @returns {Quest}
 */
export function generateQuest(rank = 1) {
  return createQuest({
    title: TITLES[Math.floor(Math.random() * TITLES.length)],
    patron: PATRONS[Math.floor(Math.random() * PATRONS.length)],
    rank,
    recommendedPower: 40 + rank * 25,
    durationWeeks: 1 + Math.floor(rank / 3),
    rewards: { gold: rank * 60, reputation: rank * 4 },
    risk: Math.min(0.6, 0.1 + rank * 0.05),
  });
}

/**
 * Estimate a quest outcome from party power vs. recommendedPower.
 * TODO: replace with a real battle run in the engine (auto-resolve mode) and
 * return actual loot/materia + per-hero injuries.
 * @param {Quest} quest
 * @param {import('./hero.js').Hero[]} party
 * @returns {{success:boolean, margin:number, injuries:string[]}}
 */
export function resolveQuest(quest, party) {
  const power = party.reduce((sum, h) => sum + heroPower(h), 0);
  const margin = power / Math.max(1, quest.recommendedPower);
  return { success: margin >= 1, margin, injuries: [] };
}
