/**
 * @file Training regimens (Monster-Rancher style). Each week a hero can be
 * assigned a regimen that grows one or two stats toward STAT_CAP, weighted by
 * the hero's growth talent and their diet's stat bias, at a stamina/fatigue cost.
 * Gains taper as a stat nears the cap, so the last points are earned, not free.
 */
import { HERO_STATS, STAT_CAP } from './hero.js';

/** How much raw stat a single intensity-point yields before talent/diet/taper. */
const GAIN_SCALE = 2.4;

/**
 * @typedef {Object} TrainingRegimen
 * @property {string} id
 * @property {string} name
 * @property {string[]} focus     stats trained, e.g. ['POW']
 * @property {number} intensity   0..3 — higher = more gain, more fatigue
 * @property {number} staminaCost
 * @property {number} fatigueGain negative = recovery
 * @property {number} xp
 */

/** @type {TrainingRegimen[]} */
export const TRAINING_REGIMENS = [
  { id: 'drill_pow',  name: 'Weight Drills',   focus: ['POW'],        intensity: 2, staminaCost: 30, fatigueGain: 15, xp: 10 },
  { id: 'guard_def',  name: 'Shield Wall',     focus: ['DEF'],        intensity: 2, staminaCost: 30, fatigueGain: 15, xp: 10 },
  { id: 'forms_skl',  name: 'Weapon Forms',    focus: ['SKL'],        intensity: 2, staminaCost: 28, fatigueGain: 14, xp: 10 },
  { id: 'sprint_spd', name: 'Sprint Course',   focus: ['SPD'],        intensity: 2, staminaCost: 30, fatigueGain: 16, xp: 10 },
  { id: 'study_int',  name: 'Arcane Study',    focus: ['INT'],        intensity: 2, staminaCost: 22, fatigueGain: 12, xp: 10 },
  { id: 'march_vit',  name: 'Endurance March', focus: ['VIT'],        intensity: 2, staminaCost: 35, fatigueGain: 20, xp: 10 },
  { id: 'spar',       name: 'Sparring Match',  focus: ['POW', 'SKL'], intensity: 3, staminaCost: 45, fatigueGain: 30, xp: 20 },
  { id: 'rest',       name: 'Rest & Recover',  focus: [],             intensity: 0, staminaCost: 0,  fatigueGain: -25, xp: 0 },
];

/** @param {string} id @returns {?TrainingRegimen} */
export function getRegimen(id) { return TRAINING_REGIMENS.find((r) => r.id === id) || null; }

/** Taper factor 1.0 (empty stat) → 0.3 (at cap), so training never fully stalls. */
function capTaper(current) { return 0.3 + 0.7 * Math.max(0, (STAT_CAP - current) / STAT_CAP); }

/**
 * Resolve one week of training. Mutates hero stats/condition/xp.
 * gain = round(intensity * GAIN_SCALE * talent * dietBias * capTaper), min 1 while
 * there's room and the hero isn't too tired; clamped to STAT_CAP.
 * @param {import('./hero.js').Hero} hero
 * @param {TrainingRegimen} regimen
 * @param {Object.<string,number>} [dietBias]  from the hero's diet (diet.js statBias)
 * @returns {{gains: Object.<string,number>}}
 */
export function applyTraining(hero, regimen, dietBias = {}) {
  const gains = {};
  const c = hero.condition;
  // Morale scales effort a little: a happy hero trains ~15% better, a miserable one worse.
  const moraleMult = 0.85 + (c.morale / 100) * 0.3;

  if (c.stamina < regimen.staminaCost) {
    // Too tired to train effectively — only partial fatigue changes.
    c.fatigue = Math.max(0, Math.min(100, c.fatigue + Math.round(regimen.fatigueGain / 2)));
    return { gains };
  }

  for (const stat of regimen.focus) {
    const current = hero.stats[stat] || 0;
    if (current >= STAT_CAP) continue;
    const talent = hero.growth[stat] || 1;
    const bias = dietBias[stat] || 1;
    const raw = regimen.intensity * GAIN_SCALE * talent * bias * moraleMult * capTaper(current);
    const gain = Math.max(1, Math.round(raw));
    const next = Math.min(STAT_CAP, current + gain);
    hero.stats[stat] = next;
    gains[stat] = next - current; // actual gain after the cap
  }

  c.stamina = Math.max(0, c.stamina - regimen.staminaCost);
  c.fatigue = Math.max(0, Math.min(100, c.fatigue + regimen.fatigueGain));
  hero.xp += regimen.xp;
  return { gains };
}

// Keep HERO_STATS reachable to importers that only pull from training.
export { HERO_STATS };
