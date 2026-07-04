/**
 * @file Training regimens. Each week a hero can be assigned a regimen that grows
 * stats (weighted by the hero's growth rates and their diet's statBias) at the
 * cost of stamina and fatigue.
 */

/**
 * @typedef {Object} TrainingRegimen
 * @property {string} id
 * @property {string} name
 * @property {string[]} focus     stats trained, e.g. ['STR']
 * @property {number} intensity   0..3 — higher = more gain, more fatigue
 * @property {number} staminaCost
 * @property {number} fatigueGain negative = recovery
 * @property {number} xp
 */

/** @type {TrainingRegimen[]} */
export const TRAINING_REGIMENS = [
  { id: 'drill_str',  name: 'Weight Drills',   focus: ['STR'],       intensity: 2, staminaCost: 30, fatigueGain: 15, xp: 10 },
  { id: 'drill_dex',  name: 'Agility Course',  focus: ['DEX'],       intensity: 2, staminaCost: 30, fatigueGain: 15, xp: 10 },
  { id: 'drill_con',  name: 'Endurance March', focus: ['CON'],       intensity: 2, staminaCost: 35, fatigueGain: 20, xp: 10 },
  { id: 'study_int',  name: 'Arcane Study',    focus: ['INT'],       intensity: 1, staminaCost: 20, fatigueGain: 10, xp: 10 },
  { id: 'study_wis',  name: 'Meditation',      focus: ['WIS'],       intensity: 1, staminaCost: 15, fatigueGain: 8,  xp: 8  },
  { id: 'social_cha', name: 'Court Etiquette', focus: ['CHA'],       intensity: 1, staminaCost: 15, fatigueGain: 8,  xp: 8  },
  { id: 'spar',       name: 'Sparring Match',  focus: ['STR', 'DEX'], intensity: 3, staminaCost: 45, fatigueGain: 30, xp: 20 },
  { id: 'rest',       name: 'Rest & Recover',  focus: [],            intensity: 0, staminaCost: 0,  fatigueGain: -25, xp: 0 },
];

/** @param {string} id @returns {?TrainingRegimen} */
export function getRegimen(id) { return TRAINING_REGIMENS.find(r => r.id === id) || null; }

/**
 * Resolve one week of training. Mutates hero stats/condition/xp.
 * Gain per focused stat = round(intensity * heroGrowth * dietBias), gated by stamina.
 * @param {import('./hero.js').Hero} hero
 * @param {TrainingRegimen} regimen
 * @param {Object.<string,number>} [dietBias]  from the hero's diet (diet.js statBias)
 * @returns {{gains: Object.<string,number>}}
 */
export function applyTraining(hero, regimen, dietBias = {}) {
  const gains = {};
  const c = hero.condition;
  if (c.stamina < regimen.staminaCost) {
    // Too tired to train effectively — only partial fatigue changes.
    c.fatigue = Math.max(0, Math.min(100, c.fatigue + Math.round(regimen.fatigueGain / 2)));
    return { gains };
  }
  for (const stat of regimen.focus) {
    const growth = hero.growth[stat] || 1;
    const bias = dietBias[stat] || 1;
    const gain = Math.max(0, Math.round(regimen.intensity * growth * bias));
    if (gain > 0) { hero.stats[stat] = (hero.stats[stat] || 0) + gain; gains[stat] = gain; }
  }
  c.stamina = Math.max(0, c.stamina - regimen.staminaCost);
  c.fatigue = Math.max(0, Math.min(100, c.fatigue + regimen.fatigueGain));
  hero.xp += regimen.xp;
  return { gains };
}
