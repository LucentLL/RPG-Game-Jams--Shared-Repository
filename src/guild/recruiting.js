/**
 * @file Recruiting. A rotating pool of candidate heroes the player can hire.
 * Stats/growth are randomized; appearance will hook into the Elements system
 * (engine) so recruits render as real sprites.
 */
import { createHero, HERO_STATS } from './hero.js';

const ARCHETYPES = ['Knight', 'Mage', 'Ranger', 'Cleric', 'Rogue', 'Berserker'];
const FIRST = ['Aldric', 'Bryn', 'Cass', 'Doran', 'Elowen', 'Fenn', 'Gwen', 'Hale', 'Iris', 'Joss'];
const EPITHET = ['the Bold', 'of the Vale', 'Ironhand', 'Swift', 'the Quiet', 'Emberkin'];

/** 8 + best-2-of-3d6, matching the engine's rollStats(). @returns {number} */
function rollStat() {
  const r = [0, 0, 0].map(() => 1 + Math.floor(Math.random() * 6)).sort((a, b) => b - a);
  return 8 + r[0] + r[1];
}

/**
 * Generate a hireable recruit.
 * TODO: generate an Elements appearance via the engine and bias stats/growth by
 * archetype so a "Mage" rolls better INT and INT growth.
 * @returns {import('./hero.js').Hero}
 */
export function generateRecruit() {
  const stats = {};
  const growth = {};
  for (const s of HERO_STATS) {
    stats[s] = rollStat();
    growth[s] = 1 + Math.floor(Math.random() * 3); // 1..3 growth weight
  }
  const name = FIRST[Math.floor(Math.random() * FIRST.length)] + ' ' +
    EPITHET[Math.floor(Math.random() * EPITHET.length)];
  return createHero({
    name,
    archetype: ARCHETYPES[Math.floor(Math.random() * ARCHETYPES.length)],
    stats,
    growth,
  });
}

/** Cost to hire, scaled by raw stat total. @param {import('./hero.js').Hero} hero @returns {number} */
export function hireCost(hero) {
  const total = HERO_STATS.reduce((sum, k) => sum + hero.stats[k], 0);
  return Math.round(total * 5);
}

/** Roll a fresh recruit pool. @param {number} [n] @returns {import('./hero.js').Hero[]} */
export function rollRecruitPool(n = 3) {
  return Array.from({ length: n }, () => generateRecruit());
}
