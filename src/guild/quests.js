/**
 * @file Quest board — the service half of the guild economy (DESIGN.md).
 *
 * Patrons post quests; you dispatch a hero (weekly assignment `quest`). On Advance
 * Week the quest AUTO-RESOLVES from the party's power vs its difficulty (management
 * altitude — you dispatch, you don't hand-play the battle; a hands-on battle mode
 * can come later). Success pays gold + reputation + sometimes loot (materials, tying
 * back into the trade economy) and grants the hero FIELD INSIGHT — the third skill
 * track, which also nudges forge quality. Reputation unlocks higher-rank quests.
 */
import { heroPower } from './hero.js';

const PATRONS = ['The Crown', 'A Merchant Guild', 'A Frightened Village', 'The Temple', 'A Noble House', "The Miners' Union"];
const TITLES = ['Clear the Warrens', 'Escort the Caravan', 'Slay the Beast', 'Recover the Relic', 'Purge the Ruins', 'Break the Siege', 'Hunt the Poachers'];
const LOOT = ['iron_ore', 'iron_ore', 'steel_ore', 'mithril_ore'];
const rand = (n) => Math.floor(Math.random() * n);

let _questSeq = 0;
const _questRun = Math.random().toString(36).slice(2, 6);
function nextQuestId() { return 'quest_' + _questRun + (++_questSeq).toString(36); }

/**
 * @typedef {Object} Quest
 * @property {string} id @property {string} title @property {string} patron
 * @property {number} rank @property {number} recommendedPower @property {number} durationWeeks
 * @property {{gold:number, reputation:number, field:number}} rewards
 * @property {?string} loot   material id awarded on success, or null
 * @property {number} risk
 */

/** @param {Partial<Quest>} [init] @returns {Quest} */
export function createQuest(init = {}) {
  return {
    id: init.id || nextQuestId(),
    title: init.title || 'Odd Job',
    patron: init.patron || 'A Villager',
    rank: init.rank ?? 1,
    recommendedPower: init.recommendedPower ?? 120,
    durationWeeks: init.durationWeeks ?? 1,
    rewards: init.rewards || { gold: 70, reputation: 3, field: 6 },
    loot: init.loot ?? null,
    risk: init.risk ?? 0.15,
  };
}

/** A single quest scaled to a rank. @param {number} [rank] @returns {Quest} */
export function generateQuest(rank = 1) {
  const r = Math.max(1, rank);
  return createQuest({
    title: TITLES[rand(TITLES.length)],
    patron: PATRONS[rand(PATRONS.length)],
    rank: r,
    recommendedPower: 110 + (r - 1) * 100,
    rewards: { gold: 60 + r * 45, reputation: r * 3, field: 4 + r * 2 },
    loot: Math.random() < 0.5 ? LOOT[rand(LOOT.length)] : null,
    risk: Math.min(0.55, 0.1 + r * 0.06),
  });
}

/**
 * A fresh board of `n` quests. Reputation unlocks higher ranks (every 40 rep = +1
 * available rank), so building the guild's name opens bigger jobs.
 * @param {import('./guild.js').Guild} guild @param {number} [n] @returns {Quest[]}
 */
export function generateQuestBoard(guild, n = 3) {
  const maxRank = 1 + Math.floor((guild.reputation || 0) / 40);
  return Array.from({ length: n }, () => generateQuest(1 + rand(maxRank)));
}

/**
 * Auto-resolve a quest: combined party power vs recommendedPower, with luck.
 * @param {Quest} quest @param {import('./hero.js').Hero[]} party
 * @returns {{success:boolean, score:number, power:number}}
 */
export function resolveQuest(quest, party) {
  const power = party.reduce((s, h) => s + heroPower(h), 0);
  const variance = 0.75 + Math.random() * 0.5; // 0.75..1.25 luck of the draw
  const score = (power / Math.max(1, quest.recommendedPower)) * variance;
  return { success: score >= 1, score, power };
}
