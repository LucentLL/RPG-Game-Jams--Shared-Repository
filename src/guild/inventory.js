/**
 * @file Guild inventory — the real armory. Forged weapons/armor are individual
 * Item INSTANCES; raw materials are counted stacks. (Consumables/food batches with
 * expiry come in later phases — see DESIGN.md.)
 */

/** Raw materials. `kind` groups them BY ROOM (ore → Forge stockroom, herb → Laboratory
 *  stores, food → Kitchen pantry); `tier` sets the quality floor of what they craft
 *  into. All enter via the market or quest barter and are DELIVERED to their room. */
export const MATERIALS = {
  iron_ore: { id: 'iron_ore', name: 'Iron Ore', kind: 'ore', tier: 1, col: '#c45040' },
  steel_ore: { id: 'steel_ore', name: 'Steel Ore', kind: 'ore', tier: 2, col: '#b8c4d0' },
  mithril_ore: { id: 'mithril_ore', name: 'Mithril Ore', kind: 'ore', tier: 3, col: '#e8dff0' },
  sunleaf: { id: 'sunleaf', name: 'Sunleaf', kind: 'herb', tier: 1, col: '#7bbf5a' },
  emberroot: { id: 'emberroot', name: 'Emberroot', kind: 'herb', tier: 2, col: '#d07a3c' },
  nightcap: { id: 'nightcap', name: 'Nightcap', kind: 'herb', tier: 3, col: '#9a7bd0' },
  grain: { id: 'grain', name: 'Grain', kind: 'food', tier: 1, col: '#d8c268' },
  salted_meat: { id: 'salted_meat', name: 'Salted Meat', kind: 'food', tier: 2, col: '#c0705a' },
  // Wilds spoils — brought home from a hunt (see locales.js). Game meat feeds the
  // Kitchen pantry (a Hunter's Table diet); pelts are a hide shelved in the Armory
  // and sold for gold at the Market. Neither is buyable — you hunt them.
  game_meat: { id: 'game_meat', name: 'Game Meat', kind: 'food', tier: 2, col: '#a85a4a' },
  pelt: { id: 'pelt', name: 'Pelt', kind: 'hide', tier: 1, col: '#b8895a' },
};

/** Which room a material kind is stored in (its working inventory). */
export const ROOM_OF_KIND = { ore: 'forge', herb: 'laboratory', food: 'kitchen', hide: 'armory' };
/** The material ids shelved in a given room's store. */
export function roomMaterialIds(roomId) {
  return Object.keys(MATERIALS).filter((k) => ROOM_OF_KIND[MATERIALS[k].kind] === roomId);
}

/**
 * @typedef {Object} Inventory
 * @property {import('./item.js').Item[]} items  forged weapon/armor instances (the Armory)
 * @property {Object.<string,number>} materials  raw material stacks (ore + herb + food, shelved per room)
 * @property {Object[]} potions  brewed potion batches { id, type, potency, qty, ... } (the Apothecary)
 * @property {import('./books.js').Book[]} books  shelved volumes (the Library)
 */

/** @param {Partial<Inventory>} [init] @returns {Inventory} */
export function createInventory(init = {}) {
  return {
    items: init.items || [],
    materials: init.materials || { iron_ore: 20, steel_ore: 8, mithril_ore: 2, sunleaf: 6, emberroot: 2, nightcap: 1, grain: 12, salted_meat: 4 }, // starter stock
    potions: init.potions || [],
    books: init.books || [],
  };
}

export function materialCount(inv, id) { return inv.materials[id] || 0; }
export function hasMaterials(inv, cost) { return Object.keys(cost).every((k) => (inv.materials[k] || 0) >= cost[k]); }
export function spendMaterials(inv, cost) { for (const k in cost) inv.materials[k] = Math.max(0, (inv.materials[k] || 0) - cost[k]); }
export function addMaterial(inv, id, n) { inv.materials[id] = (inv.materials[id] || 0) + n; }

export function addItem(inv, item) { inv.items.push(item); return item; }
export function findItem(inv, itemId) { return inv.items.find((it) => it.id === itemId) || null; }

// --- potions (consumable batches) ---
export function addPotion(inv, batch) { (inv.potions || (inv.potions = [])).push(batch); return batch; }
export function findPotion(inv, batchId) { return (inv.potions || []).find((b) => b.id === batchId) || null; }
/** Spend one potion from a batch, removing the batch when empty. @returns {boolean} spent */
export function consumePotion(inv, batchId) {
  const list = inv.potions || (inv.potions = []);
  const i = list.findIndex((b) => b.id === batchId);
  if (i < 0 || list[i].qty <= 0) return false;
  list[i].qty -= 1;
  if (list[i].qty <= 0) list.splice(i, 1);
  return true;
}
/** Total potions on hand (across all batches). */
export function potionCount(inv) { return (inv.potions || []).reduce((s, b) => s + (b.qty || 0), 0); }
/** Items currently sitting in the armory (not carried by anyone). */
export function armoryItems(inv) { return inv.items.filter((it) => it.location === 'armory'); }

/** The equipment slots a hero can fill (one item each). */
export const EQUIP_SLOTS = ['weapon', 'body'];
/** How much each slot's quality is worth as combat power. */
const GEAR_SLOT_WEIGHT = { weapon: 0.6, body: 0.5 };

/**
 * Combat power a hero's equipped gear adds on top of their trained stats. Quality
 * (scaled by slot and current durability) is what makes forging a good armory pay
 * off in the field — a well-kitted party clears quests a bare-handed one can't.
 * @param {Inventory} inv @param {import('./hero.js').Hero} hero @returns {number}
 */
export function gearBonus(inv, hero) {
  const eq = hero.equipped || {};
  let bonus = 0;
  for (const slot in eq) {
    const it = findItem(inv, eq[slot]);
    if (!it) continue;
    const dur = it.durability ? it.durability.current / (it.durability.max || 100) : 1;
    bonus += (it.quality || 0) * (GEAR_SLOT_WEIGHT[slot] || 0.5) * dur;
  }
  return Math.round(bonus);
}
