/**
 * @file The Market — how raw materials enter the guild economy.
 *
 * Per DESIGN.md's scope boundary, the guild never mines or farms: it BUYS raw
 * materials with gold and SELLS surplus materials + forged goods back. A skilled
 * smith turns cheap ore into valuable gear — that is the blacksmith's *trade*, and
 * the guild's early income. Good materials are scarce: stock is limited and
 * refreshes each week. (Quest barter/service income arrives in Phase 3.)
 */

/** Buy price per material unit (sell-back is half). */
export const MATERIAL_PRICE = { iron_ore: 8, steel_ore: 20, mithril_ore: 55 };

/** Material name → quality tier, for pricing finished goods. */
const MAT_TIER = { iron: 1, steel: 2, mithril: 3 };

export function buyPrice(matId) { return MATERIAL_PRICE[matId] || 999; }
export function sellPriceMat(matId) { return Math.max(1, Math.floor((MATERIAL_PRICE[matId] || 0) * 0.5)); }

/** What a finished item fetches: quality scaled by its material tier. */
export function itemSellValue(item) {
  const t = MAT_TIER[item.material] || 1;
  return Math.max(1, Math.round(item.quality * (1 + t * 0.3)));
}

function defaultStock() { return { iron_ore: 24, steel_ore: 10, mithril_ore: 3 }; }

/** @param {Object} [init] */
export function createMarket(init = {}) { return { stock: init.stock || defaultStock() }; }

/** Restock the market (called each week). Scarce materials stay scarce. */
export function refreshMarket(market) { market.stock = defaultStock(); }
