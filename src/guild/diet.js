/**
 * @file Diet plans — Monster-Rancher-style feeding. A hero's assigned diet
 * biases weekly stat growth (via statBias, consumed by training.js) and drives
 * stamina/fatigue recovery. Balancing diet against training is the core loop.
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
  { id: 'protein', name: 'Protein Feast', description: 'Bulks POW & VIT; dulls the mind.',
    weeklyCost: 12, statBias: { POW: 1.35, VIT: 1.2, INT: 0.8 }, staminaRecovery: 25, fatigueRelief: 15, injuryRiskMod: -0.02 },
  { id: 'scholar', name: "Scholar's Table", description: 'Feeds INT & SKL; softens the body.',
    weeklyCost: 12, statBias: { INT: 1.35, SKL: 1.2, POW: 0.85 }, staminaRecovery: 25, fatigueRelief: 20, injuryRiskMod: 0 },
  { id: 'lean', name: 'Lean & Light', description: 'Boosts SPD & recovery; less raw power.',
    weeklyCost: 10, statBias: { SPD: 1.35, SKL: 1.1, POW: 0.9 }, staminaRecovery: 40, fatigueRelief: 30, injuryRiskMod: -0.03 },
  { id: 'hearty', name: 'Hearty Stew', description: 'Toughens DEF & VIT; a slow burn.',
    weeklyCost: 12, statBias: { DEF: 1.35, VIT: 1.2, SPD: 0.9 }, staminaRecovery: 30, fatigueRelief: 25, injuryRiskMod: -0.04 },
  { id: 'feast', name: 'Lavish Feast', description: 'Morale soars, waistlines too.',
    weeklyCost: 20, statBias: { POW: 1.05, DEF: 1.05 }, staminaRecovery: 45, fatigueRelief: 35, injuryRiskMod: 0.01 },
];

/** @param {string} id @returns {?DietPlan} */
export function getDietPlan(id) { return DIET_PLANS.find((d) => d.id === id) || null; }

/**
 * Apply one week of the hero's diet to their condition. Training applies stat
 * gains separately (training.js) using this diet's statBias.
 * @param {import('./hero.js').Hero} hero
 * @param {DietPlan} diet
 */
export function applyDiet(hero, diet) {
  const c = hero.condition;
  c.stamina = Math.min(100, c.stamina + diet.staminaRecovery);
  c.fatigue = Math.max(0, c.fatigue - diet.fatigueRelief);
}
