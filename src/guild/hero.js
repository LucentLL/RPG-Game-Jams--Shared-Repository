/**
 * @file Hero model — a recruitable, trainable guild member.
 *
 * Stats use a Monster-Rancher / Pokémon-style scale (0..STAT_CAP) rather than
 * D&D's 3–20, so there is room for many weeks of satisfying training growth.
 * Six stats: POW (power), DEF (defense), SKL (skill/accuracy), SPD (speed),
 * INT (intellect/magic), VIT (vitality/life). Raise STAT_CAP to 255/999 later
 * if you want an even longer grind — training and display are cap-relative.
 */

/** Primary stats (Monster-Rancher style). */
export const HERO_STATS = ['POW', 'DEF', 'SKL', 'SPD', 'INT', 'VIT'];

/** Display names for the UI. */
export const STAT_LABEL = { POW: 'Power', DEF: 'Defense', SKL: 'Skill', SPD: 'Speed', INT: 'Intellect', VIT: 'Vitality' };

/** The soft ceiling every stat trains toward. Bump to 255 or 999 for a longer game. */
export const STAT_CAP = 100;

/**
 * @typedef {Object} HeroCondition
 * @property {number} stamina  0..100 — spent on training/quests, restored by rest/diet
 * @property {number} morale   0..100 — affects training gains & quest performance
 * @property {number} loyalty  0..100 — low loyalty risks the hero leaving
 * @property {number} fatigue  0..100 — high fatigue raises injury risk
 * @property {?string} injury  null, or an injury tag sidelining the hero
 */

/**
 * @typedef {Object} Hero
 * @property {string} id
 * @property {string} name
 * @property {string} archetype   e.g. 'Knight', 'Mage' — biases growth talents
 * @property {?Object} appearance  Elements appearance descriptor (engine renders it)
 * @property {Object.<string,number>} stats   POW/DEF/SKL/SPD/INT/VIT, 0..STAT_CAP
 * @property {Object.<string,number>} growth  per-stat growth talent (multiplier on training)
 * @property {number} level
 * @property {number} xp
 * @property {HeroCondition} condition
 * @property {number} age        in guild-weeks; heroes peak then decline
 * @property {number} lifespan   weeks before forced retirement
 * @property {?string} dietPlanId  assigned diet (see diet.js)
 * @property {?Object} assignment  this week's task (train/quest/rest)
 * @property {Object} loadout    { gear, materia } — reuses engine item models
 * @property {string[]} traits   e.g. 'Brave', 'Glutton', 'Prodigy'
 */

let _heroSeq = 0;
// A per-page-load random prefix keeps IDs unique across sessions: heroes created
// after a reload (e.g. fresh tavern recruits) can never collide with the IDs of
// heroes already loaded from a save. The counter disambiguates within a session.
const _heroRun = Math.random().toString(36).slice(2, 7);
function nextHeroId() { return 'hero_' + _heroRun + (++_heroSeq).toString(36); }

/**
 * Create a hero with sane defaults. Stats default low (room to grow); recruiting.js
 * rolls real starting stats + growth talents.
 * @param {Partial<Hero>} [init]
 * @returns {Hero}
 */
export function createHero(init = {}) {
  const flat = {};
  HERO_STATS.forEach((s) => { flat[s] = 20; });
  const ones = {};
  HERO_STATS.forEach((s) => { ones[s] = 1; });
  return {
    id: init.id || nextHeroId(),
    name: init.name || 'Unnamed Hero',
    archetype: init.archetype || 'Adventurer',
    appearance: init.appearance || null,
    stats: init.stats || flat,
    growth: init.growth || ones,
    level: init.level ?? 1,
    xp: init.xp ?? 0,
    condition: init.condition || { stamina: 100, morale: 70, loyalty: 60, fatigue: 0, stress: 0, injury: null },
    age: init.age ?? 0,
    lifespan: init.lifespan ?? 300,
    dietPlanId: init.dietPlanId || null,
    assignment: init.assignment || null,
    loadout: init.loadout || { gear: {}, materia: [] },
    professions: init.professions || { blacksmithing: { theory: 0, practice: 0, field: 0 } },
    equipped: init.equipped || {}, // slot -> itemId (real Phase-1 armory items)
    traits: init.traits || [],
  };
}

/**
 * Overall "power" rating — the sum of stats, nudged by level. With a 100 cap the
 * ceiling is ~600, so a fully-trained hero reads clearly above a fresh recruit.
 * @param {Hero} hero
 * @returns {number}
 */
export function heroPower(hero) {
  const s = hero.stats;
  const base = HERO_STATS.reduce((sum, k) => sum + (s[k] || 0), 0);
  return Math.round(base * (1 + hero.level * 0.1));
}
