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

/**
 * THE LADDER IS A GRID, NOT A LIST.
 *
 * Every piece of gear is forgeable, and the difficulty of any one of them is
 * two numbers added together: what the METAL demands, and what the SHAPE
 * demands. That is the whole law — a mithril dagger is hard because mithril is
 * hard, a bow is hard because a bow is hard, and a mithril bow is both.
 *
 * The table below used to be thirteen hand-written rows, which is fine until
 * you want the other twenty-six: gates drift, one kind gets a cheaper metal
 * than its neighbour for no reason anybody can name, and nothing tells you a
 * combination is missing because nothing knows the combinations exist. Written
 * as a grid it cannot drift, and adding a kind is one line.
 *
 * `base`/`ceil` come from the metal alone — the shape does not change how good
 * steel can get — so quality = clamp(base + practice*0.5, 5, ceil) still reads
 * the same way, and iron can never match mithril however practiced the smith.
 */
const MATERIAL_TIER = {
  // `floor` is the Theory the metal itself costs. Leather is NEGATIVE on
  // purpose: hide is the material you learn on, so a fresh smith can already
  // cut a jerkin and a cap while iron is still teaching them to draw a blade.
  leather: { floor: -8, base: 15, ceil: 45, ore: 'pelt', name: 'Leather' },
  iron:    { floor: 0,  base: 20, ceil: 55, ore: 'iron_ore', name: 'Iron' },
  steel:   { floor: 30, base: 40, ceil: 80, ore: 'steel_ore', name: 'Steel' },
  mithril: { floor: 60, base: 60, ceil: 100, ore: 'mithril_ore', name: 'Mithril' },
};

/**
 * The shapes, in the order the forge lists them: weapons first, then armour,
 * each run from the simplest thing to the hardest.
 *
 * `skill` is added to the metal's floor. `bulk` is how much ore the shape eats.
 * `mats` is which metals the shape is made of at all — nobody forges a leather
 * sword, and a bow is hide and horn before it is ever steel.
 */
const KINDS = [
  // ── Weapon ───────────────────────────────────────────────────────────────
  { kind: 'dagger', slot: 'weapon', noun: 'Dagger', skill: 2,  bulk: 1, stamina: 24, mats: ['iron', 'steel', 'mithril'] },
  { kind: 'sword',  slot: 'weapon', noun: 'Sword',  skill: 0,  bulk: 2, stamina: 30, mats: ['iron', 'steel', 'mithril'] },
  { kind: 'mace',   slot: 'weapon', noun: 'Mace',   skill: 4,  bulk: 2, stamina: 28, mats: ['iron', 'steel', 'mithril'] },
  { kind: 'axe',    slot: 'weapon', noun: 'Axe',    skill: 6,  bulk: 2, stamina: 30, mats: ['iron', 'steel', 'mithril'] },
  { kind: 'hammer', slot: 'weapon', noun: 'Hammer', skill: 8,  bulk: 3, stamina: 34, mats: ['iron', 'steel', 'mithril'] },
  { kind: 'staff',  slot: 'weapon', noun: 'Staff',  skill: 14, bulk: 2, stamina: 28, mats: ['iron', 'steel', 'mithril'] },
  { kind: 'bow',    slot: 'weapon', noun: 'Bow',    skill: 16, bulk: 2, stamina: 28, mats: ['leather', 'steel', 'mithril'] },
  // A whip is plaited hide long before it is chain — same three metals as the
  // bow, and for the same reason. Skill sits between the hammer and the staff:
  // the plaiting is the hard part, not the metal.
  { kind: 'whip',   slot: 'weapon', noun: 'Whip',   skill: 11, bulk: 2, stamina: 28, mats: ['leather', 'steel', 'mithril'] },
  { kind: 'wand',   slot: 'weapon', noun: 'Wand',   skill: 16, bulk: 1, stamina: 24, mats: ['iron', 'steel', 'mithril'] },
  // ── Armor ────────────────────────────────────────────────────────────────
  { kind: 'greaves', slot: 'lower',  noun: 'Greaves', skill: 3,  bulk: 2, stamina: 26, mats: ['leather', 'iron', 'steel', 'mithril'] },
  { kind: 'helm',    slot: 'head',   noun: 'Helm',    skill: 5,  bulk: 2, stamina: 26, mats: ['leather', 'iron', 'steel', 'mithril'] },
  { kind: 'shield',  slot: 'offhand', noun: 'Shield', skill: 10, bulk: 2, stamina: 26, mats: ['iron', 'steel', 'mithril'] },
  { kind: 'armor',   slot: 'body',   noun: 'Armor',   skill: 12, bulk: 3, stamina: 32, mats: ['leather', 'iron', 'steel', 'mithril'] },
];

/**
 * Pieces the guild already knew by name. The grid would have called these
 * `leather_armor`, `leather_bow` and `iron_shield`; a save holding a smith
 * mid-week on `hunters_bow` must still find their recipe, and "Leather Jerkin"
 * is a better name than the grid can generate anyway.
 */
const NAMED = {
  leather_armor: { id: 'leather_jerkin', name: 'Leather Jerkin', cost: { pelt: 3 } },
  leather_bow:   { id: 'hunters_bow', name: "Hunter's Bow", cost: { pelt: 2, iron_ore: 1 } },
  iron_shield:   { id: 'iron_buckler', name: 'Iron Buckler' },
};

/** Weapon or Armor — the two headings the forge groups its list under. */
export const CATEGORY = { weapon: 'Weapon', offhand: 'Armor', head: 'Armor', body: 'Armor', lower: 'Armor' };
export const CATEGORY_ORDER = ['Weapon', 'Armor'];

export const RECIPES = KINDS.flatMap((k) => k.mats.map((material) => {
  const t = MATERIAL_TIER[material];
  const key = `${material}_${k.kind}`;
  const named = NAMED[key] || {};
  return {
    id: named.id || key,
    name: named.name || `${t.name} ${k.noun}`,
    kind: k.kind,
    slot: k.slot,
    category: CATEGORY[k.slot],
    material,
    cost: named.cost || { [t.ore]: k.bulk },
    base: t.base, ceil: t.ceil,
    // The one line the whole grid exists for. Never below 0 — a metal cheap
    // enough to go negative just means the shape is the only thing standing
    // between a fresh smith and the piece.
    reqTheory: Math.max(0, t.floor + k.skill),
    staminaCost: k.stamina,
  };
}));

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
 *  and the gold fee per refine attempt. (What each + is WORTH lives elsewhere:
 *  combat power in inventory.js PLUS_POWER, sale premium in market.js MAT_PLUS_GAIN.) */
export const MATERIAL_META = {
  leather: { ore: 'pelt',        safe: 7, fee: 8 },
  iron:    { ore: 'iron_ore',    safe: 7, fee: 10 },
  steel:   { ore: 'steel_ore',   safe: 6, fee: 25 },
  mithril: { ore: 'mithril_ore', safe: 5, fee: 60 },
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
  oil:      { id: 'oil',      name: 'Tempering Oil',    glyph: '', material: 'tempering_oil' },
  blessing: { id: 'blessing', name: "Smith's Blessing", glyph: '★', material: 'smith_blessing' },
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
