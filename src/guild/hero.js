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
    condition: init.condition || { stamina: 100, morale: 70, loyalty: 60, fatigue: 0, stress: 0, injury: null, discipline: 40 },
    age: init.age ?? 0,
    lifespan: init.lifespan ?? 300,
    dietPlanId: init.dietPlanId || null,
    assignment: init.assignment || null,
    schedule: init.schedule || [], // Pillar B: queued FUTURE training weeks [{trainingId,intensity}]; Advance Week shifts the front into `assignment`

    loadout: init.loadout || { gear: {}, materia: [] },
    professions: init.professions || { blacksmithing: { theory: 0, practice: 0, field: 0 }, alchemy: { theory: 0, practice: 0, field: 0 } },
    equipped: init.equipped || {}, // slot -> itemId (real Phase-1 armory items)
    traits: init.traits || [],
    // The Monster-Rancher career arc: a life's record, and what remains after it.
    career: init.career || { debut: null, titles: [], wins: 0, losses: 0, injuries: 0, techniques: [] },
    retired: init.retired ?? false,
    staffRole: init.staffRole || null, // post-retirement posting (e.g. guild trainer)
  };
}

/**
 * Personality traits (K5) — every hero rolls TWO at recruitment. Each is a small,
 * legible modifier read where it matters: training gains (`gain`), injury odds
 * (`injury`), study/theory (`study`), stamina recovery (`recover`), lifespan
 * (`lifespan`, applied at roll time), and OBEDIENCE in played tactical fights
 * (`obey`, added to the (discipline+bond)/200 roll — Foolery when it fails).
 */
export const TRAITS = {
  Fearless:   { desc: 'never disobeys in a fight',            obey: +1 },
  Hotheaded:  { desc: 'fights their own way; drills hard',    obey: -0.2, gain: 1.1, slack: 1.4 },
  Timid:      { desc: 'hesitates under orders; quick feet',   obey: -0.1, gain: 1.05 },
  Loyal:      { desc: 'bond grows twice as fast',             bond: 2, slack: 0.6 },
  Lazy:       { desc: 'trains soft but recovers deeply',      gain: 0.9, recover: 1.4, slack: 2 },
  Studious:   { desc: 'devours theory',                       study: 1.5 },
  Prodigy:    { desc: 'burns bright — and burns out sooner',  gain: 1.15, lifespan: 0.85 },
  Ironbody:   { desc: 'rarely gets hurt',                     injury: 0.6 },
  Fragile:    { desc: 'pushes hard; breaks easier',           injury: 1.5, gain: 1.1 },
  Glutton:    { desc: 'lives for the mess hall',              recover: 1.3, slack: 1.2 },
  Stoic:      { desc: 'sheds stress like rain',               stress: 0.7 },
  Showman:    { desc: 'feeds on the crowd — big feelings',    morale: 2 },
};
/** Multiply a numeric trait effect across a hero's traits (1 = neutral). */
export function traitMult(hero, key) {
  return (hero.traits || []).reduce((m, t) => m * ((TRAITS[t] && TRAITS[t][key]) || 1), 1);
}
/** Sum an additive trait effect (0 = neutral) — only `obey` is additive. */
export function traitAdd(hero, key) {
  return (hero.traits || []).reduce((s, t) => s + ((TRAITS[t] && typeof TRAITS[t][key] === 'number') ? TRAITS[t][key] : 0), 0);
}

/** The career arc's stages (fractions of lifespan). Twilight decays; lifespan retires. */
export const LIFE_STAGES = [
  { key: 'novice', name: 'Novice', max: 0.15, col: '#6fbf73', desc: 'still growing into the work' },
  { key: 'prime', name: 'Prime', max: 0.5, col: '#d4a843', desc: 'peak training years' },
  { key: 'veteran', name: 'Veteran', max: 0.8, col: '#e08a3c', desc: 'gains slow; wisdom shows' },
  { key: 'twilight', name: 'Twilight', max: 1.01, col: '#b06a6a', desc: 'stats decay — the last seasons' },
];
/** @param {Hero} hero */
export function lifeFrac(hero) { return Math.max(0, Math.min(1, (hero.age || 0) / Math.max(1, hero.lifespan || 300))); }
/** @param {Hero} hero */
export function lifeStage(hero) {
  const f = lifeFrac(hero);
  return LIFE_STAGES.find((s) => f < s.max) || LIFE_STAGES[LIFE_STAGES.length - 1];
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
