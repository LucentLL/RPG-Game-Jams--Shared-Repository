/**
 * @file Blacksmithing — recipes + the weekly forge action.
 *
 * A hero assigned to "work: forge" spends the week making a real item that lands
 * in the armory. Its quality is driven by the smith's PRACTICE skill, so training
 * the smith produces better gear over time (Theory-gated recipes + Field-insight
 * quality bonuses arrive in Phase 2 — see DESIGN.md).
 */
import { createItem } from './item.js';
import { hasMaterials, spendMaterials, addItem } from './inventory.js';

/**
 * Recipes. `base` sets the material's quality band; the smith's Practice (0..100)
 * fills the rest, so quality ≈ base + practice*0.5.
 * @typedef {Object} Recipe
 * @property {string} id @property {string} name @property {string} kind @property {string} slot
 * @property {string} material @property {Object.<string,number>} cost @property {number} base @property {number} staminaCost
 */
// `base` = unskilled quality; `ceil` = the best this material can reach even at max
// Practice. Cheaper materials cap lower, so iron can never match steel/mithril quality
// (the material tier stays meaningful) — quality = clamp(base + practice*0.5, 5, ceil).
// `reqTheory` = the blacksmithing Theory a smith must have STUDIED to be allowed to
// make this at all (Theory unlocks recipes; Practice then drives quality). So a
// fresh smith can only forge iron until they study the metallurgy of steel/mithril.
export const RECIPES = [
  { id: 'iron_sword', name: 'Iron Sword', kind: 'sword', slot: 'weapon', material: 'iron', cost: { iron_ore: 2 }, base: 20, ceil: 55, reqTheory: 0, staminaCost: 30 },
  { id: 'iron_armor', name: 'Iron Armor', kind: 'armor', slot: 'body', material: 'iron', cost: { iron_ore: 3 }, base: 20, ceil: 55, reqTheory: 12, staminaCost: 32 },
  { id: 'steel_sword', name: 'Steel Sword', kind: 'sword', slot: 'weapon', material: 'steel', cost: { steel_ore: 2 }, base: 40, ceil: 80, reqTheory: 30, staminaCost: 30 },
  { id: 'mithril_sword', name: 'Mithril Sword', kind: 'sword', slot: 'weapon', material: 'mithril', cost: { mithril_ore: 2 }, base: 60, ceil: 100, reqTheory: 60, staminaCost: 34 },
];

/** Has this smith studied enough Theory to make this recipe? @returns {boolean} */
export function recipeUnlocked(hero, recipe) {
  return ((hero.professions.blacksmithing.theory) || 0) >= (recipe.reqTheory || 0);
}

/**
 * Spend the week STUDYING a discipline (books/notes) — grows that profession's Theory
 * track, which unlocks its recipes. Light on stamina (it's reading, not hammering).
 * Theory grows with the same cap-taper as Practice. The Library Scholar can study
 * metallurgy ('blacksmithing') or 'alchemy'.
 * @param {import('./hero.js').Hero} hero @param {string} [discipline] @returns {{theoryGain:number}}
 */
export function study(hero, discipline = 'blacksmithing') {
  const prof = hero.professions[discipline] || (hero.professions[discipline] = { theory: 0, practice: 0, field: 0 });
  const c = hero.condition;
  const room = (100 - prof.theory) / 100;
  const studious = (hero.traits || []).includes('Studious') ? 1.5 : 1; // the Studious trait devours theory
  const gain = Math.max(1, Math.round(6 * studious * (0.3 + 0.7 * room)));
  prof.theory = Math.min(100, prof.theory + gain);
  c.stamina = Math.max(0, c.stamina - 12);
  c.fatigue = Math.max(0, Math.min(100, c.fatigue + 4));
  hero.xp += 6;
  return { theoryGain: gain };
}

/** @param {string} id @returns {?Recipe} */
export function getRecipe(id) { return RECIPES.find((r) => r.id === id) || null; }

/** Rough expected quality for a UI preview (no jitter). */
export function previewQuality(recipe, practice, field) {
  return Math.max(5, Math.min(recipe.ceil, Math.round(recipe.base + (practice || 0) * 0.5 + (field || 0) * 0.2)));
}

function jitter() { return Math.floor(Math.random() * 10) - 3; } // -3..+6

/**
 * Forge one item this week. Mutates the smith (stamina/fatigue/xp, Practice growth)
 * and the inventory (spends materials, adds the item). Returns a result for the recap.
 * @param {import('./hero.js').Hero} hero
 * @param {Recipe} recipe
 * @param {import('./inventory.js').Inventory} inv
 * @param {number} week   guild-week, stamped into the item's history
 * @returns {{ok:boolean, reason?:string, item?:import('./item.js').Item, quality?:number, practiceGain?:number}}
 */
export function forge(hero, recipe, inv, week) {
  const c = hero.condition;
  const prof = hero.professions.blacksmithing;
  if (!recipeUnlocked(hero, recipe)) return { ok: false, reason: 'locked' };
  if (!hasMaterials(inv, recipe.cost)) return { ok: false, reason: 'materials' };
  if (c.stamina < recipe.staminaCost) return { ok: false, reason: 'stamina' };

  spendMaterials(inv, recipe.cost);
  // Practice drives quality; Field Insight (from questing/combat) adds a smaller bonus
  // — a smith who has SEEN blades fail forges a little better.
  const quality = Math.max(5, Math.min(recipe.ceil, Math.round(recipe.base + prof.practice * 0.5 + prof.field * 0.2 + jitter())));
  const item = createItem({
    kind: recipe.kind, slot: recipe.slot, material: recipe.material, quality, name: recipe.name,
    history: { forgedBy: hero.id, forgedByName: hero.name, forgedWeek: week, wielders: [], kills: 0, repairs: [] },
  });
  addItem(inv, item);

  // Practice growth with cap-taper (fast early, slow near 100).
  const room = (100 - prof.practice) / 100;
  const gain = Math.max(1, Math.round(5 * (0.3 + 0.7 * room)));
  prof.practice = Math.min(100, prof.practice + gain);

  c.stamina = Math.max(0, c.stamina - recipe.staminaCost);
  c.fatigue = Math.min(100, c.fatigue + 12);
  hero.xp += 8;
  return { ok: true, item, quality, practiceGain: gain };
}
