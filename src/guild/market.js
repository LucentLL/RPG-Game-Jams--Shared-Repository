/**
 * @file The Market — how raw materials enter the guild economy.
 *
 * Per DESIGN.md's scope boundary, the guild never mines or farms: it BUYS raw
 * materials with gold and SELLS surplus materials + forged goods back. A skilled
 * smith turns cheap ore into valuable gear — that is the blacksmith's *trade*, and
 * the guild's early income. Good materials are scarce: stock is limited and
 * refreshes each week. (Quest barter/service income arrives in Phase 3.)
 */

/** Buy price per material unit (sell-back is half). Ores feed the Forge, herbs the Lab. */
export const MATERIAL_PRICE = { iron_ore: 8, steel_ore: 20, mithril_ore: 55, sunleaf: 6, emberroot: 16, nightcap: 42 };

// Item value = recoup the ore (floor) + a skill premium for quality above the
// material's unskilled base — so an unskilled smith barely breaks even and PROFIT
// comes from Practice. The smith's trade is skill, not free arbitrage.
const MAT_FLOOR = { iron: 16, steel: 40, mithril: 110 }; // ≈ ore cost of one item
const MAT_BASE = { iron: 20, steel: 40, mithril: 60 };   // recipe base quality (unskilled)
const MAT_GAIN = { iron: 1.6, steel: 2.0, mithril: 2.4 };// gold per quality-point above base

export function buyPrice(matId) { return MATERIAL_PRICE[matId] || 999; }
export function sellPriceMat(matId) { return Math.max(1, Math.floor((MATERIAL_PRICE[matId] || 0) * 0.5)); }

/** What a finished item fetches: quality scaled by its material tier. */
export function itemSellValue(item) {
  const m = item.material;
  const floor = MAT_FLOOR[m] || 10;
  const base = MAT_BASE[m] || 20;
  const gain = MAT_GAIN[m] || 1.5;
  return Math.max(1, Math.round(floor + Math.max(0, item.quality - base) * gain));
}

function defaultStock() { return { iron_ore: 24, steel_ore: 10, mithril_ore: 3, sunleaf: 16, emberroot: 8, nightcap: 3 }; }

/** @param {Object} [init] */
export function createMarket(init = {}) { return { stock: init.stock || defaultStock() }; }

/** Restock the market (called each week). Scarce materials stay scarce. */
export function refreshMarket(market) { market.stock = defaultStock(); }
