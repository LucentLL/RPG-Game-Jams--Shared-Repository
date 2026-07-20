/**
 * @file Cooking — the Cook's trade (a guild ELECTIVE). Mirrors blacksmithing/alchemy.
 *
 * A member with the Cooking elective works the Kitchen for the week and PRODUCES food
 * into the pantry — the one thing the guild couldn't make before (it could only buy at
 * market or bring home game from a hunt). A Cook bakes daily bread from their labour,
 * salt-cures hunted game into rich rations, and stews grain into a hearty table. Yield
 * scales with the Cook's PRACTICE (Theory gates the richer recipes; Field-insight from
 * quests adds a little) — the same three-track skill model as the smith and alchemist.
 *
 * This closes a loop: hunters bring home game_meat → the Cook cures it into salted_meat
 * → the rich diets (and a member's hidden food preference) run on home-grown fare.
 */
import { hasMaterials, spendMaterials, addMaterial } from './inventory.js';

/**
 * Ration recipes. Unlike a potion (skill → potency), a cook's skill drives QUANTITY:
 * `base` is the unskilled yield, `ceil` the most a master turns out. `food` is the
 * pantry material produced; `cost` the raw inputs (empty = pure labour).
 * @typedef {Object} RationRecipe
 * @property {string} id @property {string} name @property {string} glyph @property {string} food
 * @property {Object.<string,number>} cost @property {number} base @property {number} ceil
 * @property {number} reqTheory @property {number} staminaCost @property {string} blurb
 */
export const RATION_RECIPES = [
  { id: 'daily_bread', name: 'Daily Bread', glyph: '🍞', food: 'grain', cost: {},
    base: 3, ceil: 10, reqTheory: 0, staminaCost: 16, blurb: 'Bakes plain grain rations for the pantry — pure labour.' },
  { id: 'cure_meat', name: 'Salt-Cured Meat', glyph: '🥓', food: 'salted_meat', cost: { game_meat: 2 },
    base: 2, ceil: 6, reqTheory: 6, staminaCost: 20, blurb: 'Preserves hunted game into rich, keeping rations.' },
  { id: 'hearty_stew', name: 'Hearty Stew', glyph: '🍲', food: 'salted_meat', cost: { grain: 3 },
    base: 2, ceil: 5, reqTheory: 18, staminaCost: 22, blurb: 'Stews grain and stock into a filling table.' },
];

/** @param {string} id @returns {?RationRecipe} */
export function getRation(id) { return RATION_RECIPES.find((r) => r.id === id) || null; }

/** Cooking profession block, tolerant of un-migrated heroes (mirrors alchemy's alch()). */
function cookProf(hero) { return (hero.professions.cooking || (hero.professions.cooking = { theory: 0, practice: 0, field: 0 })); }

/** Has this cook studied enough Theory for this recipe? */
export function rationUnlocked(hero, recipe) { return (cookProf(hero).theory || 0) >= (recipe.reqTheory || 0); }

/** Rough expected yield for a UI preview (no jitter). */
export function previewYield(recipe, practice, field) {
  return Math.max(recipe.base, Math.min(recipe.ceil, Math.round(recipe.base + (practice || 0) * 0.06 + (field || 0) * 0.02)));
}

/**
 * Cook one week: produce `qty` food into the pantry, grow Practice. Mutates the cook
 * (stamina/fatigue/xp) and the inventory. Returns a result for the recap.
 * @param {import('./hero.js').Hero} hero @param {RationRecipe} recipe
 * @param {import('./inventory.js').Inventory} inv @param {number} week
 * @returns {{ok:boolean, reason?:string, food?:string, foodName?:string, glyph?:string, qty?:number, practiceGain?:number}}
 */
export function cook(hero, recipe, inv, week) {
  const c = hero.condition;
  const prof = cookProf(hero);
  if (!rationUnlocked(hero, recipe)) return { ok: false, reason: 'locked' };
  if (!hasMaterials(inv, recipe.cost)) return { ok: false, reason: 'materials' };
  if (c.stamina < recipe.staminaCost) return { ok: false, reason: 'stamina' };

  spendMaterials(inv, recipe.cost);
  const jitter = Math.floor(Math.random() * 3) - 1; // -1..+1
  const qty = Math.max(1, Math.min(recipe.ceil, Math.round(recipe.base + prof.practice * 0.06 + prof.field * 0.02 + jitter)));
  addMaterial(inv, recipe.food, qty);

  const room = (100 - prof.practice) / 100; // cap-taper, same as the smith/alchemist
  const gain = Math.max(1, Math.round(5 * (0.3 + 0.7 * room)));
  prof.practice = Math.min(100, prof.practice + gain);

  c.stamina = Math.max(0, c.stamina - recipe.staminaCost);
  c.fatigue = Math.min(100, c.fatigue + 12);
  hero.xp += 8;
  return { ok: true, food: recipe.food, foodName: recipe.name, glyph: recipe.glyph, qty, practiceGain: gain };
}
