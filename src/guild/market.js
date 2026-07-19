/**
 * @file The Market — how raw materials enter the guild economy.
 *
 * Per DESIGN.md's scope boundary, the guild never mines or farms: it BUYS raw
 * materials with gold and SELLS surplus materials + forged goods back. A skilled
 * smith turns cheap ore into valuable gear — that is the blacksmith's *trade*, and
 * the guild's early income. Good materials are scarce: stock is limited and
 * refreshes each week. (Quest barter/service income arrives in Phase 3.)
 */
import { rollBookStock } from './books.js';

/** Buy price per material unit (sell-back is half). Ores feed the Forge, herbs the
 *  Lab, foodstuffs the Kitchen pantry — each delivered to its room's store. */
export const MATERIAL_PRICE = { iron_ore: 8, steel_ore: 20, mithril_ore: 55, sunleaf: 6, emberroot: 16, nightcap: 42, grain: 3, salted_meat: 9, game_meat: 7, pelt: 14 };

/** Wilds spoils — carried by MATERIAL_PRICE for their SELL value, but never stocked
 *  for purchase (you hunt them, you don't buy them). The Market shows these as a
 *  "sell your haul" section rather than buy rows. */
export const HUNT_MATERIALS = ['game_meat', 'pelt'];

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

function defaultStock() { return { iron_ore: 24, steel_ore: 10, mithril_ore: 3, sunleaf: 16, emberroot: 8, nightcap: 3, grain: 30, salted_meat: 12 }; }

/** @param {Object} [init] */
export function createMarket(init = {}) { return { stock: init.stock || defaultStock(), bookStock: init.bookStock || rollBookStock() }; }

/** Restock the market (called each week). Scarce materials stay scarce; the
 *  bookseller's shelf turns over completely — buy a rare volume when you see it.
 *  FOOD scales with `foodMouths` (the Mess Hall's fed capacity): a bigger Mess Hall
 *  means bigger standing contracts with the farms, so a 120-bed guild can actually
 *  keep its pantry stocked (base supply feeds ~42; review finding). */
export function refreshMarket(market, foodMouths = 6) {
  const scale = Math.max(1, Math.ceil(foodMouths / 6));
  market.stock = defaultStock();
  market.stock.grain *= scale;
  market.stock.salted_meat *= scale;
  market.bookStock = rollBookStock();
}
