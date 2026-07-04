/**
 * @file Recruiting. A rotating tavern pool of candidate heroes to hire.
 * Each archetype has distinct GROWTH TALENTS (how fast each stat trains), so
 * a Knight and a Mage diverge over many weeks even from similar starting stats.
 */
import { createHero, HERO_STATS, STAT_CAP } from './hero.js';

/**
 * Archetypes with per-stat growth talents (1 = normal, 3 = gifted, 0.5 = weak).
 * Growth multiplies training gains, so talents shape a hero's long-term ceiling-pace.
 */
const ARCHETYPES = [
  { name: 'Knight',    growth: { POW: 3, DEF: 3, SKL: 2, SPD: 1, INT: 0.5, VIT: 2 } },
  { name: 'Mage',      growth: { POW: 0.5, DEF: 1, SKL: 2, SPD: 2, INT: 3, VIT: 2 } },
  { name: 'Ranger',    growth: { POW: 2, DEF: 1, SKL: 3, SPD: 3, INT: 1, VIT: 1 } },
  { name: 'Cleric',    growth: { POW: 1, DEF: 2, SKL: 2, SPD: 1, INT: 3, VIT: 2 } },
  { name: 'Rogue',     growth: { POW: 2, DEF: 1, SKL: 3, SPD: 3, INT: 1.5, VIT: 1 } },
  { name: 'Berserker', growth: { POW: 3, DEF: 2, SKL: 1, SPD: 2, INT: 0.5, VIT: 3 } },
];

const FIRST = ['Aldric', 'Bryn', 'Cass', 'Doran', 'Elowen', 'Fenn', 'Gwen', 'Hale', 'Iris', 'Joss'];
const EPITHET = ['the Bold', 'of the Vale', 'Ironhand', 'Swift', 'the Quiet', 'Emberkin'];

const rand = (n) => Math.floor(Math.random() * n);

/**
 * Roll a fresh stat block on the 0..STAT_CAP scale, seeded low (room to grow) and
 * nudged up a little where the archetype is talented.
 * @param {Object.<string,number>} growth
 * @returns {Object.<string,number>}
 */
export function rollStatBlock(growth) {
  const stats = {};
  for (const s of HERO_STATS) {
    const talent = growth[s] || 1;
    // base 12–32, +0–6 talent bump; leaves the bulk of 0..100 for training.
    stats[s] = Math.min(STAT_CAP, 12 + rand(21) + Math.round((talent - 1) * 3));
  }
  return stats;
}

/**
 * Generate a hireable recruit with an archetype, growth talents, and low stats.
 * TODO: generate an Elements appearance so recruits render as real sprites.
 * @returns {import('./hero.js').Hero}
 */
export function generateRecruit() {
  const arch = ARCHETYPES[rand(ARCHETYPES.length)];
  // Growth talents with small per-hero jitter so no two Knights are identical.
  const growth = {};
  for (const s of HERO_STATS) growth[s] = Math.max(0.5, arch.growth[s] + (rand(3) - 1) * 0.25);
  const name = FIRST[rand(FIRST.length)] + ' ' + EPITHET[rand(EPITHET.length)];
  return createHero({ name, archetype: arch.name, stats: rollStatBlock(growth), growth });
}

/**
 * Hire cost — scales with current stat total AND growth potential, so a gifted
 * rookie costs more than a mediocre one with the same stats today.
 * @param {import('./hero.js').Hero} hero
 * @returns {number}
 */
export function hireCost(hero) {
  const total = HERO_STATS.reduce((sum, k) => sum + (hero.stats[k] || 0), 0);
  const talent = HERO_STATS.reduce((sum, k) => sum + (hero.growth?.[k] || 1), 0);
  return Math.round(total * 2 + talent * 20);
}

/** Roll a fresh recruit pool. @param {number} [n] @returns {import('./hero.js').Hero[]} */
export function rollRecruitPool(n = 3) {
  return Array.from({ length: n }, () => generateRecruit());
}
