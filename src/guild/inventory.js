/**
 * @file Guild inventory — the real armory. Forged weapons/armor are individual
 * Item INSTANCES; raw materials are counted stacks. (Consumables/food batches with
 * expiry come in later phases — see DESIGN.md.)
 */

/** Raw materials. `tier` sets the quality floor of what they forge into. */
export const MATERIALS = {
  iron_ore: { id: 'iron_ore', name: 'Iron Ore', tier: 1, col: '#c45040' },
  steel_ore: { id: 'steel_ore', name: 'Steel Ore', tier: 2, col: '#b8c4d0' },
  mithril_ore: { id: 'mithril_ore', name: 'Mithril Ore', tier: 3, col: '#e8dff0' },
};

/**
 * @typedef {Object} Inventory
 * @property {import('./item.js').Item[]} items  forged weapon/armor instances
 * @property {Object.<string,number>} materials  raw material stacks
 */

/** @param {Partial<Inventory>} [init] @returns {Inventory} */
export function createInventory(init = {}) {
  return {
    items: init.items || [],
    materials: init.materials || { iron_ore: 20, steel_ore: 8, mithril_ore: 2 }, // starter stock
  };
}

export function materialCount(inv, id) { return inv.materials[id] || 0; }
export function hasMaterials(inv, cost) { return Object.keys(cost).every((k) => (inv.materials[k] || 0) >= cost[k]); }
export function spendMaterials(inv, cost) { for (const k in cost) inv.materials[k] = Math.max(0, (inv.materials[k] || 0) - cost[k]); }
export function addMaterial(inv, id, n) { inv.materials[id] = (inv.materials[id] || 0) + n; }

export function addItem(inv, item) { inv.items.push(item); return item; }
export function findItem(inv, itemId) { return inv.items.find((it) => it.id === itemId) || null; }
/** Items currently sitting in the armory (not carried by anyone). */
export function armoryItems(inv) { return inv.items.filter((it) => it.location === 'armory'); }
