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
  { id: 'leather_jerkin', name: 'Leather Jerkin', kind: 'armor', slot: 'body', material: 'leather', cost: { pelt: 3 }, base: 15, ceil: 45, reqTheory: 4, staminaCost: 26 },
  { id: 'hunters_bow', name: "Hunter's Bow", kind: 'bow', slot: 'weapon', material: 'leather', cost: { pelt: 2, iron_ore: 1 }, base: 18, ceil: 50, reqTheory: 8, staminaCost: 28 },
  { id: 'iron_armor', name: 'Iron Armor', kind: 'armor', slot: 'body', material: 'iron', cost: { iron_ore: 3 }, base: 20, ceil: 55, reqTheory: 12, staminaCost: 32 },
  { id: 'steel_sword', name: 'Steel Sword', kind: 'sword', slot: 'weapon', material: 'steel', cost: { steel_ore: 2 }, base: 40, ceil: 80, reqTheory: 30, staminaCost: 30 },
  { id: 'steel_armor', name: 'Steel Armor', kind: 'armor', slot: 'body', material: 'steel', cost: { steel_ore: 3 }, base: 40, ceil: 80, reqTheory: 40, staminaCost: 34 },
  { id: 'mithril_sword', name: 'Mithril Sword', kind: 'sword', slot: 'weapon', material: 'mithril', cost: { mithril_ore: 2 }, base: 60, ceil: 100, reqTheory: 60, staminaCost: 34 },
  { id: 'mithril_armor', name: 'Mithril Armor', kind: 'armor', slot: 'body', material: 'mithril', cost: { mithril_ore: 3 }, base: 60, ceil: 100, reqTheory: 72, staminaCost: 36 },
];

/** Has this smith studied enough Theory to make this recipe? @returns {boolean} */
export function recipeUnlocked(hero, recipe) {
  return ((hero.professions.blacksmithing.theory) || 0) >= (recipe.reqTheory || 0);
}

/**
 * Spend the week STUDYING a discipline — grows that profession's Theory track,
 * which unlocks its recipes. Light on stamina (it's reading, not hammering).
 * Theory grows with the same cap-taper as Practice. The Library Scholar can study
 * metallurgy ('blacksmithing') or 'alchemy'. `bookMult` is the Library's shelf at
 * work: studying FROM a real book (books.js `bestBook` → `bookStudyMult`) beats
 * studying from loose notes, so stocking the shelf compounds across every scholar.
 * @param {import('./hero.js').Hero} hero @param {string} [discipline] @param {number} [bookMult]
 * @returns {{theoryGain:number}}
 */
export function study(hero, discipline = 'blacksmithing', bookMult = 1) {
  const prof = hero.professions[discipline] || (hero.professions[discipline] = { theory: 0, practice: 0, field: 0 });
  const c = hero.condition;
  const room = (100 - prof.theory) / 100;
  const studious = (hero.traits || []).includes('Studious') ? 1.5 : 1; // the Studious trait devours theory
  const gain = Math.max(1, Math.round(6 * studious * (bookMult || 1) * (0.3 + 0.7 * room)));
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

// ─── Reworking: the Armory feeds the Forge ───────────────────────────────────
// A smith's week can REWORK an existing armory piece instead of forging fresh:
// true the edge, re-temper, re-fit. Quality closes half the gap toward what the
// smith could forge outright (same Practice/Field math — the anti-lie principle),
// capped by the material's ceiling; durability is restored; the work is stamped
// into the item's history (repairs[]), so a storied blade IMPROVES without losing
// its story. Costs one ore of the item's material. A smith whose own work is no
// better than the piece can't improve it ('mastered' — find a better smith).

export const REWORK_STAMINA = 26;

/** Per-material refine/rework table: the ore it consumes, the SAFE refine limit
 *  (guaranteed +1s up to it — RO's safety level: finer material, earlier risk),
 *  the flat power each + is worth, and the gold fee per refine attempt. */
export const MATERIAL_META = {
  leather: { ore: 'pelt',        safe: 7, plusPower: 2, fee: 8 },
  iron:    { ore: 'iron_ore',    safe: 7, plusPower: 2, fee: 10 },
  steel:   { ore: 'steel_ore',   safe: 6, plusPower: 3, fee: 25 },
  mithril: { ore: 'mithril_ore', safe: 5, plusPower: 5, fee: 60 },
};
/** Ore consumed per rework/refine attempt, by material. */
export function materialOreCost(material) {
  return { [(MATERIAL_META[material] || MATERIAL_META.iron).ore]: 1 };
}

/** The recipe governing an item's material (its quality ceiling + Theory gate). */
export function recipeForItem(item) {
  return RECIPES.find((r) => r.material === item.material && r.kind === item.kind)
    || RECIPES.find((r) => r.material === item.material) || RECIPES[0];
}

/** Expected post-rework quality for the UI preview (no jitter, same halfway math). */
export function previewRework(item, practice, field) {
  const recipe = recipeForItem(item);
  const target = previewQuality(recipe, practice, field);
  if (target <= item.quality) return item.quality;
  return Math.max(item.quality + 1, Math.min(recipe.ceil, Math.round((item.quality + target) / 2)));
}

/**
 * Rework one armory item this week. Mutates the smith, the inventory (ore), and
 * the ITEM (quality, durability, history). Returns a recap-shaped result.
 * @param {import('./hero.js').Hero} hero @param {import('./item.js').Item} item
 * @param {import('./inventory.js').Inventory} inv @param {number} week
 * @returns {{ok:boolean, reason?:string, item?:import('./item.js').Item, from?:number, to?:number, practiceGain?:number}}
 */
export function rework(hero, item, inv, week) {
  const c = hero.condition;
  const prof = hero.professions.blacksmithing;
  const recipe = recipeForItem(item);
  if (!recipeUnlocked(hero, recipe)) return { ok: false, reason: 'locked' };
  if (previewQuality(recipe, prof.practice, prof.field) <= item.quality) return { ok: false, reason: 'mastered' };
  const cost = materialOreCost(item.material);
  if (!hasMaterials(inv, cost)) return { ok: false, reason: 'materials' };
  if (c.stamina < REWORK_STAMINA) return { ok: false, reason: 'stamina' };

  spendMaterials(inv, cost);
  const from = item.quality;
  const target = Math.max(5, Math.min(recipe.ceil, Math.round(recipe.base + prof.practice * 0.5 + prof.field * 0.2 + jitter())));
  item.quality = Math.max(from + 1, Math.min(recipe.ceil, Math.round((from + Math.max(from, target)) / 2)));
  if (item.durability) item.durability.current = item.durability.max; // trued and re-edged
  item.history.repairs.push({ week, smithId: hero.id, smithName: hero.name, from, to: item.quality });

  const room = (100 - prof.practice) / 100; // reworking teaches, a little less than forging fresh
  const gain = Math.max(1, Math.round(3 * (0.3 + 0.7 * room)));
  prof.practice = Math.min(100, prof.practice + gain);

  c.stamina = Math.max(0, c.stamina - REWORK_STAMINA);
  c.fatigue = Math.min(100, c.fatigue + 10);
  hero.xp += 7;
  return { ok: true, item, from, to: item.quality, practiceGain: gain };
}

// ─── Refinement: the +N system (Ragnarok Online's grammar) ───────────────────
// A separate axis from quality: each refine attempt pushes an item's `plus` one
// step (+0 → +10). Up to the material's SAFE limit every attempt succeeds; past
// it, success rolls a per-material table and FAILURE DESTROYS THE PIECE — story,
// slotted materia and all — unless a protective reagent softens the blow:
//   · Tempering Oil   (Alchemist-brewed)  → failure only drops the piece −1
//   · Smith's Blessing (Enchanter-made)   → failure keeps the level
// Each attempt costs 1 ore of the item's material + a gold fee (+ the reagent).
// The smith's Practice adds up to +10 percentage points (the Mastersmith bonus).

export const REFINE_STAMINA = 24;
export const MAX_PLUS = 10;

// Success % for the attempt at (current plus + 1), indexed from safe+1 .. 10.
// Rows echo RO's Lv1/Lv2/Lv3 weapon columns.
const REFINE_ROWS = {
  7: [60, 40, 19],             // safe 7: +8, +9, +10
  6: [60, 40, 20, 19],         // safe 6: +7 .. +10
  5: [60, 50, 20, 20, 19],     // safe 5: +6 .. +10
};

/** Success chance (0..100) for refining this item one step, by this smith. */
export function refineChance(item, hero) {
  const meta = MATERIAL_META[item.material] || MATERIAL_META.iron;
  const next = (item.plus || 0) + 1;
  if (next > MAX_PLUS) return 0;
  if (next <= meta.safe) return 100;
  const row = REFINE_ROWS[meta.safe] || REFINE_ROWS[7];
  const base = row[next - meta.safe - 1] ?? 19;
  const prof = hero ? hero.professions.blacksmithing : null;
  const smithBonus = prof ? Math.round((prof.practice || 0) / 10) : 0; // Mastersmith: up to +10
  return Math.min(100, base + smithBonus);
}

/** What a failed attempt does under each guard. */
export const REFINE_GUARDS = {
  none:     { id: 'none',     name: 'No protection',    glyph: '⚠', material: null },
  oil:      { id: 'oil',      name: 'Tempering Oil',    glyph: '🫙', material: 'tempering_oil' },
  blessing: { id: 'blessing', name: "Smith's Blessing", glyph: '⭐', material: 'smith_blessing' },
};

/**
 * Attempt ONE refine step on an armory item. Mutates the smith, the inventory
 * (ore + fee is charged by the caller via `spendGold`; reagent consumed here), and
 * the item (`plus`, or its existence — a failure with no guard DESTROYS it; the
 * caller must drop it from the inventory when `broke` is true).
 * @param {import('./hero.js').Hero} hero @param {import('./item.js').Item} item
 * @param {import('./inventory.js').Inventory} inv @param {number} week
 * @param {'none'|'oil'|'blessing'} [guardId]
 * @returns {{ok:boolean, reason?:string, success?:boolean, broke?:boolean, downgraded?:boolean,
 *            kept?:boolean, from?:number, to?:number, chance?:number, fee?:number, practiceGain?:number}}
 */
export function refine(hero, item, inv, week, guardId = 'none') {
  const c = hero.condition;
  const prof = hero.professions.blacksmithing;
  const recipe = recipeForItem(item);
  const meta = MATERIAL_META[item.material] || MATERIAL_META.iron;
  if (!recipeUnlocked(hero, recipe)) return { ok: false, reason: 'locked' };
  if ((item.plus || 0) >= MAX_PLUS) return { ok: false, reason: 'maxed' };
  const guard = REFINE_GUARDS[guardId] || REFINE_GUARDS.none;
  const cost = materialOreCost(item.material);
  if (guard.material) cost[guard.material] = (cost[guard.material] || 0) + 1;
  if (!hasMaterials(inv, cost)) return { ok: false, reason: guard.material && (inv.materials[guard.material] || 0) < 1 ? 'guard' : 'materials' };
  if (c.stamina < REFINE_STAMINA) return { ok: false, reason: 'stamina' };

  spendMaterials(inv, cost); // ore + reagent are spent on the ATTEMPT, win or lose (RO's rule)
  const from = item.plus || 0;
  const chance = refineChance(item, hero);
  const success = Math.random() * 100 < chance;
  const res = { ok: true, success, from, to: from, chance, fee: meta.fee };
  if (success) {
    item.plus = from + 1;
    res.to = item.plus;
    item.history.repairs.push({ week, smithId: hero.id, smithName: hero.name, plus: item.plus });
  } else if (guard.id === 'blessing') {
    res.kept = true;
  } else if (guard.id === 'oil') {
    item.plus = Math.max(0, from - 1);
    res.to = item.plus;
    res.downgraded = true;
  } else {
    res.broke = true; // the caller removes the piece and tells its story
  }

  const room = (100 - prof.practice) / 100; // the risk game teaches nerve, not craft
  const gain = Math.max(1, Math.round(3 * (0.3 + 0.7 * room)));
  prof.practice = Math.min(100, prof.practice + gain);
  res.practiceGain = gain;

  c.stamina = Math.max(0, c.stamina - REFINE_STAMINA);
  c.fatigue = Math.min(100, c.fatigue + 10);
  hero.xp += 7;
  return res;
}
