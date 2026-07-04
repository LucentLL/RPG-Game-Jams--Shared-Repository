/**
 * @file Alchemy — potion recipes + the weekly BREW action (the Alchemist's trade).
 *
 * Mirrors blacksmithing: an Alchemist assigned to the Laboratory spends the week
 * brewing a batch of potions from herbs (bought at market / bartered from quests)
 * into the Apothecary. Potency is driven by the alchemist's PRACTICE (Theory gates
 * which recipes they may attempt; Field-insight from quests adds a small bonus) —
 * same three-track skill model as the smith. Potions are CONSUMABLES: batches with
 * a quantity, spent to heal a hero (cure injuries, restore stamina, shed wear).
 */
import { hasMaterials, spendMaterials, addPotion } from './inventory.js';

let _potionSeq = 0;
const _potionRun = Math.random().toString(36).slice(2, 6);
function nextPotionId() { return 'potion_' + _potionRun + (++_potionSeq).toString(36); }

/**
 * Potion recipes. `base` = unskilled potency; `ceil` = the most this brew can reach.
 * `kind` drives the effect: 'heal' restores stamina (and cures injury when potent),
 * 'tonic' sheds fatigue & stress. `reqTheory` gates the recipe; Practice sets potency.
 * @typedef {Object} PotionRecipe
 * @property {string} id @property {string} name @property {string} kind @property {string} glyph
 * @property {Object.<string,number>} cost @property {number} base @property {number} ceil
 * @property {number} reqTheory @property {number} staminaCost @property {number} yield @property {string} blurb
 */
export const POTION_RECIPES = [
  { id: 'minor_heal', name: 'Healing Draught', kind: 'heal', glyph: '🧪',
    cost: { sunleaf: 2 }, base: 22, ceil: 55, reqTheory: 0, staminaCost: 20, yield: 2,
    blurb: 'Restores stamina; mends light hurts.' },
  { id: 'tonic', name: 'Vigor Tonic', kind: 'tonic', glyph: '🧉',
    cost: { emberroot: 2 }, base: 26, ceil: 62, reqTheory: 8, staminaCost: 20, yield: 2,
    blurb: 'Sheds fatigue & stress.' },
  { id: 'greater_heal', name: 'Greater Draught', kind: 'heal', glyph: '⚗',
    cost: { sunleaf: 2, nightcap: 1 }, base: 48, ceil: 88, reqTheory: 28, staminaCost: 26, yield: 2,
    blurb: 'A potent heal that reliably cures injuries.' },
];

/** @param {string} id @returns {?PotionRecipe} */
export function getPotionRecipe(id) { return POTION_RECIPES.find((r) => r.id === id) || null; }

/** Alchemy profession block, tolerant of un-migrated heroes. */
function alch(hero) { return (hero.professions.alchemy || (hero.professions.alchemy = { theory: 0, practice: 0, field: 0 })); }

/** Has this alchemist studied enough Theory to brew this? @returns {boolean} */
export function potionUnlocked(hero, recipe) { return (alch(hero).theory || 0) >= (recipe.reqTheory || 0); }

/** Rough expected potency for a UI preview (no jitter). */
export function previewPotency(recipe, practice, field) {
  return Math.max(5, Math.min(recipe.ceil, Math.round(recipe.base + (practice || 0) * 0.5 + (field || 0) * 0.2)));
}

function jitter() { return Math.floor(Math.random() * 10) - 3; } // -3..+6

/**
 * Brew one batch this week. Mutates the alchemist (stamina/fatigue/xp, Practice) and
 * the inventory (spends herbs, adds a potion batch). Returns a result for the recap.
 * @param {import('./hero.js').Hero} hero @param {PotionRecipe} recipe
 * @param {import('./inventory.js').Inventory} inv @param {number} week
 * @returns {{ok:boolean, reason?:string, batch?:Object, potency?:number, qty?:number, practiceGain?:number}}
 */
export function brew(hero, recipe, inv, week) {
  const c = hero.condition;
  const prof = alch(hero);
  if (!potionUnlocked(hero, recipe)) return { ok: false, reason: 'locked' };
  if (!hasMaterials(inv, recipe.cost)) return { ok: false, reason: 'materials' };
  if (c.stamina < recipe.staminaCost) return { ok: false, reason: 'stamina' };

  spendMaterials(inv, recipe.cost);
  const potency = Math.max(5, Math.min(recipe.ceil, Math.round(recipe.base + prof.practice * 0.5 + prof.field * 0.2 + jitter())));
  const qty = recipe.yield; // fixed per brew — skill drives POTENCY, not quantity (mirrors the smith's one-item-per-forge), so cost-per-heal stays flat
  const batch = {
    id: nextPotionId(), recipeId: recipe.id, type: recipe.kind, name: recipe.name, glyph: recipe.glyph,
    potency, qty, brewedBy: hero.id, brewedByName: hero.name, week,
  };
  addPotion(inv, batch);

  const room = (100 - prof.practice) / 100; // cap-taper, same as smithing
  const gain = Math.max(1, Math.round(5 * (0.3 + 0.7 * room)));
  prof.practice = Math.min(100, prof.practice + gain);

  c.stamina = Math.max(0, c.stamina - recipe.staminaCost);
  c.fatigue = Math.min(100, c.fatigue + 12);
  hero.xp += 8;
  return { ok: true, batch, potency, qty, practiceGain: gain };
}

/**
 * Apply one potion to a hero. Mutates the hero's condition; returns a short recap of
 * what it did (or null if it would do nothing, so the caller can decline to spend it).
 * @param {Object} batch @param {import('./hero.js').Hero} hero @returns {?string}
 */
export function applyPotion(batch, hero) {
  const c = hero.condition;
  const p = batch.potency || 30;
  if (batch.type === 'tonic') {
    const fr = Math.min(c.fatigue || 0, p);
    const sr = Math.min(c.stress || 0, Math.round(p * 0.7));
    if (fr <= 0 && sr <= 0) return null; // already fresh — don't waste the potion
    c.fatigue = Math.max(0, (c.fatigue || 0) - p);
    c.stress = Math.max(0, (c.stress || 0) - Math.round(p * 0.7));
    return `fatigue −${fr}${sr ? `, stress −${sr}` : ''}`;
  }
  // heal
  const before = c.stamina || 0;
  const cures = c.injury && p >= 70; // only a POTENT brew mends a real injury — keeps injuries a meaningful
                                      // counterweight to heavy training (a mid-skill Greater Draught, ~q70+).
  if (before >= 100 && !cures) return null; // full stamina, nothing to cure — don't waste it
  c.stamina = Math.min(100, before + p);
  let msg = `stamina +${c.stamina - before}`;
  if (cures) { c.injury = null; msg += ', injury cured'; } // cured, but still worn — no free fatigue relief
  return msg;
}
