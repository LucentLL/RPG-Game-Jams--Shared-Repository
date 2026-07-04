/**
 * @file Hero model — a recruitable, trainable guild member.
 * Heroes reuse the battle engine's six-stat block (STR/DEX/CON/INT/WIS/CHA) so
 * a hero can be handed straight to the engine for quest/tournament resolution.
 */

/** Primary stats, shared with the battle engine (src/game/crucible.js). */
export const HERO_STATS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

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
 * @property {string} archetype   e.g. 'Knight', 'Mage' — biases growth
 * @property {?Object} appearance  Elements appearance descriptor (engine renders it)
 * @property {Object.<string,number>} stats   STR/DEX/CON/INT/WIS/CHA
 * @property {Object.<string,number>} growth  per-stat growth weighting (Monster-Rancher-style)
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
 * Create a hero with sane defaults. Stats default to all-10 (human average);
 * recruiting.js rolls real ones.
 * TODO: derive hp/ac/speed via the engine's deriveStats() at battle time.
 * @param {Partial<Hero>} [init]
 * @returns {Hero}
 */
export function createHero(init = {}) {
  return {
    id: init.id || nextHeroId(),
    name: init.name || 'Unnamed Hero',
    archetype: init.archetype || 'Adventurer',
    appearance: init.appearance || null,
    stats: init.stats || { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    growth: init.growth || { STR: 1, DEX: 1, CON: 1, INT: 1, WIS: 1, CHA: 1 },
    level: init.level ?? 1,
    xp: init.xp ?? 0,
    condition: init.condition || { stamina: 100, morale: 70, loyalty: 60, fatigue: 0, injury: null },
    age: init.age ?? 0,
    lifespan: init.lifespan ?? 300,
    dietPlanId: init.dietPlanId || null,
    assignment: init.assignment || null,
    loadout: init.loadout || { gear: {}, materia: [] },
    traits: init.traits || [],
  };
}

/**
 * Rough "power" rating used to gate quests and sort the roster.
 * TODO: replace with the engine's real combat evaluation once quests dispatch
 * into the battle system.
 * @param {Hero} hero
 * @returns {number}
 */
export function heroPower(hero) {
  const s = hero.stats;
  const base = HERO_STATS.reduce((sum, k) => sum + (s[k] || 0), 0);
  return Math.round(base * (1 + hero.level * 0.1));
}
