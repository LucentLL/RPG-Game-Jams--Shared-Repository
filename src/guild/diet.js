/**
 * @file Diet plans — Monster-Rancher-style feeding. A hero's assigned diet
 * modifies weekly stat growth (via statBias, consumed by training.js), stamina
 * recovery, and fatigue. Balancing diet against training intensity is core loop.
 */

/**
 * @typedef {Object} DietPlan
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {number} weeklyCost                 gold per week
 * @property {Object.<string,number>} statBias   multipliers on training gains, per stat
 * @property {number} staminaRecovery            stamina restored per week
 * @property {number} fatigueRelief              fatigue removed per week
 * @property {number} injuryRiskMod              +/- modifier to injury chance
 */

/** @type {DietPlan[]} */
export const DIET_PLANS = [
  { id: 'balanced', name: 'Balanced Rations', description: 'Steady, cheap, no downside.',
    weeklyCost: 5, statBias: {}, staminaRecovery: 30, fatigueRelief: 20, injuryRiskMod: 0 },
  { id: 'protein', name: 'Protein Feast', description: 'Bulks STR/CON; dulls the mind.',
    weeklyCost: 12, statBias: { STR: 1.3, CON: 1.2, INT: 0.8 }, staminaRecovery: 25, fatigueRelief: 15, injuryRiskMod: -0.02 },
  { id: 'scholar', name: "Scholar's Table", description: 'Feeds INT/WIS; softens the body.',
    weeklyCost: 12, statBias: { INT: 1.3, WIS: 1.2, STR: 0.85 }, staminaRecovery: 25, fatigueRelief: 20, injuryRiskMod: 0 },
  { id: 'lean', name: 'Lean & Light', description: 'Boosts DEX & recovery; less raw power.',
    weeklyCost: 10, statBias: { DEX: 1.3, STR: 0.9 }, staminaRecovery: 40, fatigueRelief: 30, injuryRiskMod: -0.03 },
  { id: 'feast', name: 'Lavish Feast', description: 'Morale soars, waistlines too.',
    weeklyCost: 20, statBias: { CHA: 1.2 }, staminaRecovery: 45, fatigueRelief: 35, injuryRiskMod: 0.01 },
];

/** @param {string} id @returns {?DietPlan} */
export function getDietPlan(id) { return DIET_PLANS.find(d => d.id === id) || null; }

/**
 * Apply one week of the hero's diet to their condition. Training applies stat
 * gains separately (training.js) using this diet's statBias.
 * TODO: model long-term over/under-feeding (weight, peak decline).
 * @param {import('./hero.js').Hero} hero
 * @param {DietPlan} diet
 */
export function applyDiet(hero, diet) {
  const c = hero.condition;
  c.stamina = Math.min(100, c.stamina + diet.staminaRecovery);
  c.fatigue = Math.max(0, c.fatigue - diet.fatigueRelief);
}
