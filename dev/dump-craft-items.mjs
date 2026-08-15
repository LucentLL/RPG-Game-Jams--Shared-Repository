/**
 * THE ARMORY, THE LARDER AND THE MARKET, WITNESSED — a fixture for the Unity
 * port's Materials.cs / Item.cs / Market.cs.
 *
 * item.js imports nothing, and inventory.js / market.js import only
 * curriculum.js and books.js — which themselves import nothing — so unlike
 * dump-rooms.mjs there is nothing to lift by text scan: the REAL modules are
 * imported whole and every answer below is the shipping code's own.
 *
 * The one impurity is deliberately avoided rather than stubbed: createItem
 * mints an id from Math.random (item.js:10) and createMarket rolls a
 * bookseller's shelf (market.js:48), so the fixture pins every field EXCEPT
 * those ids and that shelf — nothing on either side of the port compares them.
 *
 * Every number here is an integer, per the fixture law: prices and qualities
 * are integers already, and there are no nulls anywhere (a missing colour or
 * an absent room rides as "").
 *
 *     node dev/dump-craft-items.mjs            # → the Unity repo's EditMode dir
 *     node dev/dump-craft-items.mjs --out DIR  # → anywhere else
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const INV = await import(new URL('../src/guild/inventory.js', import.meta.url));
const ITEM = await import(new URL('../src/guild/item.js', import.meta.url));
const MKT = await import(new URL('../src/guild/market.js', import.meta.url));
// smithing.js imports only item.js + inventory.js, so it too runs whole. Only
// its recipe IDENTITY is pinned here (id/name/kind/slot/material) — the costs,
// skill floors and stamina belong to the craft lane's Smithing.cs. This lane
// needs the identity because createItem's 2-argument form must derive the
// web's own slot and the web's own name from a kind and a metal alone.
const SMITH = await import(new URL('../src/guild/smithing.js', import.meta.url));

// ── The tables, verbatim ─────────────────────────────────────────────────────

const MAT_IDS = Object.keys(INV.MATERIALS);      // the shelf order the UI walks
const materials = MAT_IDS.map((id) => {
  const m = INV.MATERIALS[id];
  return {
    id: m.id, name: m.name, kind: m.kind, tier: m.tier, col: m.col,
    // ROOM_OF_KIND applied — "" when a kind has no room (no such kind today,
    // but the port's RoomOf must answer the same nothing if one ever appears).
    room: INV.ROOM_OF_KIND[m.kind] || '',
  };
});

const roomOfKind = Object.keys(INV.ROOM_OF_KIND)
  .map((kind) => ({ kind, room: INV.ROOM_OF_KIND[kind] }));

// roomMaterialIds over every real room, plus two rooms that shelve nothing.
const ROOMS = ['forge', 'laboratory', 'kitchen', 'armory', 'library', 'nowhere'];
const roomMaterials = ROOMS.map((room) => ({ room, ids: INV.roomMaterialIds(room) }));

// createInventory's starter stock (inventory.js:51) — the larder a new guild
// opens with. Rows, because JsonUtility has no dialect for a JS object map.
const starterInv = INV.createInventory();
const starterStock = Object.keys(starterInv.materials)
  .map((id) => ({ id, n: starterInv.materials[id] }));

// ── The count/has/spend/add verbs, run against a real inventory ──────────────
// Each case starts from a NAMED larder, applies one verb, and writes down the
// larder after. `costIds`/`costNs` are parallel arrays — the fixture law's
// no-map rule — and `-1` in a spend result means the verb refused.
function larder(rows) {
  const materials = {};
  for (const r of rows) materials[r.id] = r.n;
  return INV.createInventory({ materials });
}
function rowsOf(inv, ids) { return ids.map((id) => ({ id, n: INV.materialCount(inv, id) })); }

const VERB_LARDER = [
  { id: 'iron_ore', n: 5 }, { id: 'steel_ore', n: 0 }, { id: 'pelt', n: 2 },
];
const VERB_WATCH = ['iron_ore', 'steel_ore', 'pelt', 'mithril_ore'];
const VERB_COSTS = [
  [],                                                  // a free recipe: always affordable
  [{ id: 'iron_ore', n: 1 }],
  [{ id: 'iron_ore', n: 5 }],                          // exactly the shelf
  [{ id: 'iron_ore', n: 6 }],                          // one too many
  [{ id: 'steel_ore', n: 1 }],                         // a zero stack
  [{ id: 'mithril_ore', n: 1 }],                       // a stack that was never opened
  [{ id: 'pelt', n: 2 }, { id: 'iron_ore', n: 1 }],    // two lines, both affordable
  [{ id: 'pelt', n: 3 }, { id: 'iron_ore', n: 1 }],    // two lines, one short
];
const spends = VERB_COSTS.map((cost) => {
  const costObj = {};
  for (const c of cost) costObj[c.id] = c.n;
  const inv = larder(VERB_LARDER);
  const has = INV.hasMaterials(inv, costObj);
  if (has) INV.spendMaterials(inv, costObj);           // the web's own pairing (smithing.js:165-168)
  return {
    costIds: cost.map((c) => c.id), costNs: cost.map((c) => c.n),
    has: has ? 1 : 0, after: rowsOf(inv, VERB_WATCH),
  };
});

// addMaterial has no clamp and no floor (inventory.js:66) — including the
// negative n the port must not quietly turn into a spend.
const ADDS = [
  { id: 'iron_ore', n: 3 }, { id: 'iron_ore', n: 0 }, { id: 'iron_ore', n: -2 },
  { id: 'game_meat', n: 4 },                            // a stack the larder never held
  { id: 'tempering_oil', n: 1 },                        // a brewed reagent landing at the forge
];
const adds = ADDS.map((a) => {
  const inv = larder(VERB_LARDER);
  INV.addMaterial(inv, a.id, a.n);
  return { id: a.id, n: a.n, after: INV.materialCount(inv, a.id) };
});

// materialCount over ids that are and are not on the shelf.
const counts = ['iron_ore', 'steel_ore', 'pelt', 'mithril_ore', 'grain', 'not_a_material']
  .map((id) => ({ id, n: INV.materialCount(larder(VERB_LARDER), id) }));

// ── item.js ─────────────────────────────────────────────────────────────────

const qualityTiers = ITEM.QUALITY_TIERS.map((t) => ({ min: t.min, name: t.name, col: t.col }));

// qualityTier over a sweep that lands on every boundary and both sides of it,
// plus the negatives the JS `find` falls off the end of (item.js:24).
const SWEEP = [];
for (const b of [0, 25, 45, 65, 85]) SWEEP.push(b - 1, b, b + 1);
for (let q = 0; q <= 100; q += 5) SWEEP.push(q);
SWEEP.push(-100, -1, 99, 100, 101, 150, 1000);
const sweep = [...new Set(SWEEP)].sort((a, b) => a - b);
const qualityTierCases = sweep.map((score) => {
  const t = ITEM.qualityTier(score);
  return { score, index: ITEM.QUALITY_TIERS.indexOf(t), name: t.name, min: t.min };
});

// createItem's defaults, field for field (item.js:42-55) — the shape the port
// must mint when the caller names nothing.
const d = ITEM.createItem();
const itemDefaults = {
  kind: d.kind, slot: d.slot, material: d.material, quality: d.quality, plus: d.plus,
  name: d.name, durCurrent: d.durability.current, durMax: d.durability.max,
  location: d.location, kills: d.history.kills,
  // history.forgedBy/forgedByName/forgedWeek are JS null here; the port spells
  // "none" as "" / 0, so the fixture records the SENTINEL it expects, not null.
  forgedByName: d.history.forgedByName || '', forgedWeek: d.history.forgedWeek || 0,
  idPrefix: d.id.slice(0, 5),                            // 'item_' (item.js:11)
};

// createItem carrying a forge's own arguments through, unchanged.
const MADE = [
  { kind: 'sword', slot: 'weapon', material: 'iron', quality: 30, name: 'Iron Sword' },
  { kind: 'armor', slot: 'body', material: 'leather', quality: 15, name: 'Leather Jerkin' },
  { kind: 'bow', slot: 'weapon', material: 'leather', quality: 44, name: "Hunter's Bow" },
  { kind: 'shield', slot: 'offhand', material: 'iron', quality: 51, name: 'Iron Buckler' },
  { kind: 'dagger', slot: 'weapon', material: 'mithril', quality: 100, name: 'Mithril Dagger' },
];
const created = MADE.map((m) => {
  const it = ITEM.createItem({ ...m });
  return {
    kind: it.kind, slot: it.slot, material: it.material, quality: it.quality,
    plus: it.plus, name: it.name, durCurrent: it.durability.current,
    durMax: it.durability.max, location: it.location,
  };
});

// The recipe grid's IDENTITY (smithing.js:93-112) — every id/name/kind/slot/
// material the forge can mint, so the port's SlotOf / NameFor / RecipeIdFor are
// witnessed against the real grid instead of a hand-typed guess. The three
// NAMED overrides (smithing.js:83-87) ride in here for free.
const shapes = SMITH.RECIPES.map((r) => ({
  id: r.id, name: r.name, kind: r.kind, slot: r.slot, category: r.category, material: r.material,
}));

// itemLabel over twelve hands — the +N worn up front, RO-style (item.js:59).
const LABEL_HANDS = [
  { plus: 0, name: 'Iron Sword' },
  { plus: 1, name: 'Iron Sword' },
  { plus: 5, name: 'Steel Sword' },
  { plus: 7, name: 'Leather Jerkin' },
  { plus: 10, name: 'Mithril Dagger' },
  { plus: 0, name: "Hunter's Bow" },
  { plus: 3, name: "Hunter's Bow" },
  { plus: 0, name: 'Iron Buckler' },
  { plus: 2, name: 'Iron Buckler' },
  { plus: 9, name: 'Mithril Armor' },
  { plus: 0, name: 'Steel Greaves' },
  { plus: 4, name: 'Steel Helm' },
];
const labels = LABEL_HANDS.map((h) => ({
  plus: h.plus, name: h.name, label: ITEM.itemLabel(ITEM.createItem({ ...h })),
}));

// ── market.js ───────────────────────────────────────────────────────────────

const PRICE_IDS = [...MAT_IDS, 'not_a_material'];       // every material + the unpriced fallback
const prices = PRICE_IDS.map((id) => ({
  id, buy: MKT.buyPrice(id), sell: MKT.sellPriceMat(id),
  listed: MKT.MATERIAL_PRICE[id] === undefined ? 0 : 1,
  hunt: MKT.HUNT_MATERIALS.includes(id) ? 1 : 0,
}));

// itemSellValue across every material band, both sides of its unskilled base,
// and the refine premium — plus an unlisted material on the fallback branch.
const SELL_HANDS = [
  { material: 'leather', quality: 15, plus: 0 },        // exactly the base: no premium
  { material: 'leather', quality: 45, plus: 0 },        // the metal's ceiling
  { material: 'leather', quality: 45, plus: 7 },
  { material: 'iron', quality: 5, plus: 0 },            // below base: the max(0,…) floor
  { material: 'iron', quality: 20, plus: 0 },
  { material: 'iron', quality: 55, plus: 0 },
  { material: 'iron', quality: 55, plus: 10 },
  { material: 'steel', quality: 40, plus: 0 },
  { material: 'steel', quality: 80, plus: 6 },
  { material: 'mithril', quality: 60, plus: 0 },
  { material: 'mithril', quality: 100, plus: 0 },
  { material: 'mithril', quality: 100, plus: 10 },
  { material: 'bone', quality: 50, plus: 3 },           // unlisted: floor 10 / base 20 / gain 1.5 / +5
];
const sells = SELL_HANDS.map((h) => ({
  material: h.material, quality: h.quality, plus: h.plus,
  value: MKT.itemSellValue(ITEM.createItem({ ...h })),
}));

// The market's own shelf — defaultStock through createMarket (its bookStock
// roll is Math.random and is deliberately not pinned), then refreshMarket at
// every Mess Hall tier (the FACILITIES fed ladder, guild.js:36-49).
const stock0 = MKT.createMarket().stock;
const defaultStock = Object.keys(stock0).map((id) => ({ id, n: stock0[id] }));
const restock = [1, 6, 7, 12, 24, 60, 120].map((foodMouths) => {
  const m = MKT.createMarket();
  MKT.refreshMarket(m, foodMouths);
  return { foodMouths, rows: Object.keys(m.stock).map((id) => ({ id, n: m.stock[id] })) };
});

const fixture = {
  materials, roomOfKind, roomMaterials, starterStock,
  counts, spends, adds,
  qualityTiers, qualityTierCases, itemDefaults, created, shapes, labels,
  huntMaterials: MKT.HUNT_MATERIALS, prices, sells, defaultStock, restock,
};

const argOut = process.argv.indexOf('--out');
const out = join(
  argOut >= 0 && process.argv[argOut + 1]
    ? process.argv[argOut + 1]
    : join(ROOT, '..', '..', '..', '..', 'Guild Rancher', 'Assets', 'Tests', 'EditMode'),
  'craft-items-fixture.json',
);
writeFileSync(out, JSON.stringify(fixture, null, 1));
console.log(`fixture → ${out}`);
console.log(`${materials.length} materials, ${roomOfKind.length} kinds, ${roomMaterials.length} room shelves,`
  + ` ${starterStock.length} starter stacks, ${counts.length} counts, ${spends.length} spends, ${adds.length} adds,`
  + ` ${qualityTiers.length} tiers, ${qualityTierCases.length} tier cases, ${created.length} created,`
  + ` ${shapes.length} recipe identities,`
  + ` ${labels.length} labels, ${prices.length} prices, ${sells.length} sale values,`
  + ` ${defaultStock.length} stock rows, ${restock.length} restocks`);
