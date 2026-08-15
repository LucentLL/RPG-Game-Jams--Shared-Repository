/**
 * THE THREE CRAFT ROOMS, WITNESSED — a fixture for the Unity port's
 * Smithing / Cooking / Alchemy.
 *
 * smithing.js, cooking.js, alchemy.js, item.js and inventory.js import nothing
 * browser-bound (curriculum.js is pulled in by inventory.js and is likewise
 * pure), so the REAL functions answer here. Every recipe row of all three
 * tables is written down; previewQuality / previewYield / previewPotency /
 * previewBrewYield / previewRework are probed over a practice x field grid;
 * and forge / cook / brew / rework / refine / study / applyPotion are RUN
 * under a PATCHED Math.random — the same mulberry32 stream (rng.js
 * elementsRng) the C# replays through ElementsGen.Rng — with the whole world
 * before and after each hand recorded.
 *
 * FIXTURE LAW (the craft contract): integers only — every float rides x1000 —
 * and no nulls anywhere, because Unity's JsonUtility has no dialect for them.
 * A JS `null` is spelled "" and a missing number is spelled 0.
 *
 * THE PLAYER-FACING LINE is pinned too. The web's copy lives in hall.js's
 * recapPanel (hall.js:2892-2922) as HTML; the port has no HTML and no glyph
 * font, so the dumper composes the SAME WORDS with the tags stripped, the
 * U+2192 arrow spelled "to" and the U+2212 minus spelled "-" (the craft
 * contract's plain-words rule, and HuntScreen.cs:335's en-dash lesson). Those
 * substitutions are the ONLY differences, and they happen here so that the
 * port and the web cannot drift apart in silence.
 *
 *     node dev/dump-craft.mjs ["<out.json>"]
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { elementsRng } = await import(new URL('../src/game/engine/rng.js', import.meta.url));
const S = await import(new URL('../src/guild/smithing.js', import.meta.url));
const C = await import(new URL('../src/guild/cooking.js', import.meta.url));
const A = await import(new URL('../src/guild/alchemy.js', import.meta.url));
const I = await import(new URL('../src/guild/item.js', import.meta.url));
const INV = await import(new URL('../src/guild/inventory.js', import.meta.url));

// ── The larder's ids, in one fixed order both sides walk ──────────────────────
const MAT_IDS = [
  'iron_ore', 'steel_ore', 'mithril_ore', 'sunleaf', 'emberroot', 'nightcap',
  'grain', 'salted_meat', 'game_meat', 'pelt', 'tempering_oil', 'smith_blessing',
];

const realRandom = Math.random;
function withStream(seed, fn) {
  Math.random = elementsRng(seed);
  try { return fn(); } finally { Math.random = realRandom; }
}

/** Plain-words: the port's font draws U+2192/U+2212 as a gamble, so spell them. */
function plain(s) {
  return String(s).replace(/→/g, 'to').replace(/−/g, '-');
}

/** A craft-shaped hero. professions default to all-zero, exactly hero.js:83. */
function mkHero(spec = {}) {
  const p = (d) => ({
    theory: spec[d + 'Theory'] ?? spec.theory ?? 0,
    practice: spec[d + 'Practice'] ?? spec.practice ?? 0,
    field: spec[d + 'Field'] ?? spec.field ?? 0,
  });
  return {
    id: spec.id || 'h1',
    name: spec.name || 'Case Ironhand',
    professions: { blacksmithing: p('bs'), alchemy: p('al'), cooking: p('ck') },
    condition: {
      stamina: spec.stamina ?? 100, morale: 70, loyalty: 60,
      fatigue: spec.fatigue ?? 0, stress: spec.stress ?? 0,
      injury: spec.injury ? { kind: spec.injury, weeksLeft: 3, statHit: 0 } : null,
      discipline: 40,
    },
    traits: spec.traits || [],
    xp: 0,
  };
}

function mkInv(mats = {}) {
  const materials = {};
  for (const id of MAT_IDS) materials[id] = mats[id] || 0;
  return INV.createInventory({ materials });
}

const matArr = (inv) => MAT_IDS.map((id) => inv.materials[id] || 0);
const costPairs = (cost) => Object.keys(cost || {}).map((k) => ({ id: k, n: cost[k] }));
const costIds = (cost) => Object.keys(cost || {});
const costNs = (cost) => Object.keys(cost || {}).map((k) => cost[k]);

function condSnap(h) {
  return {
    stamina: h.condition.stamina, fatigue: h.condition.fatigue,
    stress: h.condition.stress, xp: h.xp,
    injury: h.condition.injury ? 1 : 0,
  };
}
function profSnap(h, d) {
  const p = h.professions[d] || { theory: 0, practice: 0, field: 0 };
  return { theory: p.theory, practice: p.practice, field: p.field };
}

// ═══ 1. The recipe tables, whole ═════════════════════════════════════════════

const smithRecipes = S.RECIPES.map((r) => ({
  id: r.id, name: r.name, category: r.category, kind: r.kind, slot: r.slot,
  material: r.material, baseQ: r.base, ceilQ: r.ceil,
  reqTheory: r.reqTheory, staminaCost: r.staminaCost,
  costIds: costIds(r.cost), costNs: costNs(r.cost),
}));

const rationRecipes = C.RATION_RECIPES.map((r) => ({
  id: r.id, name: r.name, food: r.food, baseQ: r.base, ceilQ: r.ceil,
  reqTheory: r.reqTheory, staminaCost: r.staminaCost, blurb: r.blurb,
  costIds: costIds(r.cost), costNs: costNs(r.cost),
}));

const potionRecipes = A.POTION_RECIPES.map((r) => ({
  id: r.id, name: r.name, kind: r.kind, material: r.material || '',
  baseQ: r.base, ceilQ: r.ceil, reqTheory: r.reqTheory,
  staminaCost: r.staminaCost, yieldQty: r.yield, blurb: r.blurb,
  costIds: costIds(r.cost), costNs: costNs(r.cost),
}));

// CATEGORY is a slot -> heading map; both sides walk the same key order.
const categorySlots = Object.keys(S.CATEGORY);
const categoryNames = categorySlots.map((k) => S.CATEGORY[k]);

const materialMeta = Object.keys(S.MATERIAL_META).map((m) => ({
  material: m, ore: S.MATERIAL_META[m].ore,
  safe: S.MATERIAL_META[m].safe, fee: S.MATERIAL_META[m].fee,
  oreCostId: costIds(S.materialOreCost(m))[0],
  oreCostN: costNs(S.materialOreCost(m))[0],
}));

// ═══ 2. The previews, over a practice x field grid ═══════════════════════════

const PRACTICE = [0, 25, 50, 75, 100];
const FIELD = [0, 40];

const qualityPreviews = [];
for (const r of S.RECIPES)
  for (const practice of PRACTICE)
    for (const field of FIELD)
      qualityPreviews.push({ id: r.id, practice, field, v: S.previewQuality(r, practice, field) });

const yieldPreviews = [];
for (const r of C.RATION_RECIPES)
  for (const practice of PRACTICE)
    for (const field of FIELD)
      yieldPreviews.push({ id: r.id, practice, field, v: C.previewYield(r, practice, field) });

const potencyPreviews = [];
for (const r of A.POTION_RECIPES)
  for (const practice of PRACTICE)
    for (const field of FIELD)
      potencyPreviews.push({
        id: r.id, practice, field,
        v: A.previewPotency(r, practice, field),
        bottles: A.previewBrewYield(r, practice, field),
      });

// ═══ 3. The unlock gates ═════════════════════════════════════════════════════
// recipeUnlocked / rationUnlocked / potionUnlocked are pure theory comparisons
// (smithing.js:115, cooking.js:41, alchemy.js:50) — every rung, every table.

const THEORIES = [0, 1, 3, 4, 5, 6, 8, 10, 12, 14, 18, 20, 22, 26, 28, 30, 32, 36, 40, 44, 60, 66, 70, 76, 100];
const unlocks = [];
for (const t of THEORIES) {
  const hero = mkHero({ theory: t });
  for (const r of S.RECIPES)
    unlocks.push({ table: 'smith', id: r.id, theory: t, open: S.recipeUnlocked(hero, r) ? 1 : 0 });
  for (const r of C.RATION_RECIPES)
    unlocks.push({ table: 'ration', id: r.id, theory: t, open: C.rationUnlocked(hero, r) ? 1 : 0 });
  for (const r of A.POTION_RECIPES)
    unlocks.push({ table: 'potion', id: r.id, theory: t, open: A.potionUnlocked(hero, r) ? 1 : 0 });
}

// ═══ 4. recipeForItem + previewRework ════════════════════════════════════════

function mkItem(kind, material, quality, plus = 0, name = '') {
  return I.createItem({
    id: 'it_' + kind + '_' + material, kind, material, quality, plus,
    slot: (S.RECIPES.find((r) => r.kind === kind) || {}).slot || 'weapon',
    name: name || (S.RECIPES.find((r) => r.material === material && r.kind === kind) || {}).name || 'Iron Sword',
    history: { forgedBy: 'h0', forgedByName: 'Founder', forgedWeek: 1, wielders: [], kills: 0, repairs: [] },
  });
}

const REWORK_ITEMS = [
  ['sword', 'iron', 20], ['sword', 'iron', 54], ['sword', 'steel', 40],
  ['sword', 'mithril', 90], ['armor', 'leather', 18], ['helm', 'leather', 44],
  ['bow', 'steel', 60], ['shield', 'mithril', 99], ['dagger', 'iron', 55],
];

const recipeForItems = REWORK_ITEMS.map(([kind, material, q]) => ({
  kind, material, quality: q, recipeId: S.recipeForItem(mkItem(kind, material, q)).id,
}));

const reworkPreviews = [];
for (const [kind, material, q] of REWORK_ITEMS)
  for (const practice of PRACTICE)
    for (const field of FIELD)
      reworkPreviews.push({
        kind, material, quality: q, practice, field,
        v: S.previewRework(mkItem(kind, material, q), practice, field),
      });

// ═══ 5. The hands — forge / cook / brew / rework / refine, seeded ════════════
// The recap's copy, lifted: hall.js:2894/2896 (forge), 2886/2890 (rework),
// 2900/2901/2904 (brew), 2920/2922 (cook), 2874-2882 (refine). HTML stripped,
// arrow spelled, glyphs dropped (they are '' in every ported recipe anyway).

const FORGE_WHY = { materials: 'out of materials', locked: 'recipe not yet unlocked' };
const REWORK_WHY = {
  materials: 'out of ore', locked: 'theory not yet studied',
  stamina: 'too tired to work', mastered: 'the piece is beyond their craft',
};
const BREW_WHY = { materials: 'out of herbs', locked: 'recipe not yet unlocked' };
const COOK_WHY = { materials: 'out of ingredients', locked: 'recipe not yet learned' };
const REFINE_WHY = {
  materials: 'out of ore', guard: 'no protective reagent in stock',
  locked: 'theory not yet studied', stamina: 'too tired to work',
  maxed: 'the piece is already +10',
};

let seed = 700;

// ── forge ────────────────────────────────────────────────────────────────────
const forges = [];
function forgeCase(name, spec, recipeId, mats) {
  const s = ++seed;
  const hero = mkHero(spec);
  const inv = mkInv(mats);
  const recipe = S.getRecipe(recipeId);
  const before = matArr(inv);
  const res = withStream(s, () => S.forge(hero, recipe, inv, 7));
  const line = res.ok
    ? `${hero.name} forged ${res.item.name} (q${res.quality}) · +${res.practiceGain} practice`
    : `${hero.name} couldn't forge — ${FORGE_WHY[res.reason] || 'too tired to work'}`;
  forges.push({
    name, seed: s, recipeId, spec: JSON.stringify(spec), mats: JSON.stringify(mats),
    ok: res.ok ? 1 : 0, reason: res.reason || '',
    quality: res.quality || 0, practiceGain: res.practiceGain || 0,
    itemName: res.ok ? res.item.name : '', itemKind: res.ok ? res.item.kind : '',
    itemMaterial: res.ok ? res.item.material : '', itemSlot: res.ok ? res.item.slot : '',
    itemPlus: res.ok ? res.item.plus : 0,
    bagSize: inv.items.length,
    matsBefore: before, matsAfter: matArr(inv),
    prof: profSnap(hero, 'blacksmithing'), cond: condSnap(hero),
    line: plain(line),
  });
}
forgeCase('fresh smith, iron sword', {}, 'iron_sword', { iron_ore: 20 });
forgeCase('fresh smith, leather greaves', {}, 'leather_greaves', { pelt: 6 });
forgeCase('fresh smith, leather helm', {}, 'leather_helm', { pelt: 6 });
forgeCase('journeyman steel sword', { bsTheory: 40, bsPractice: 45, bsField: 12 }, 'steel_sword', { steel_ore: 8 });
forgeCase('master mithril sword', { bsTheory: 90, bsPractice: 100, bsField: 60 }, 'mithril_sword', { mithril_ore: 9 });
forgeCase('named jerkin', { bsTheory: 20, bsPractice: 30 }, 'leather_jerkin', { pelt: 9 });
forgeCase("named hunter's bow", { bsTheory: 20, bsPractice: 30 }, 'hunters_bow', { pelt: 4, iron_ore: 3 });
forgeCase('named iron buckler', { bsTheory: 20, bsPractice: 30 }, 'iron_buckler', { iron_ore: 6 });
forgeCase('locked: theory too shallow', {}, 'mithril_hammer', { mithril_ore: 9 });
forgeCase('short of ore', { bsTheory: 40 }, 'steel_sword', { steel_ore: 1 });
forgeCase('too tired to work', { bsTheory: 40, stamina: 4 }, 'steel_sword', { steel_ore: 8 });
forgeCase('whip, plaited hide', { bsTheory: 10, bsPractice: 20 }, 'leather_whip', { pelt: 6 });
forgeCase('near the ceiling', { bsTheory: 100, bsPractice: 100, bsField: 100 }, 'iron_sword', { iron_ore: 20 });

// ── cook ─────────────────────────────────────────────────────────────────────
const cooks = [];
function cookCase(name, spec, recipeId, mats) {
  const s = ++seed;
  const hero = mkHero(spec);
  const inv = mkInv(mats);
  const recipe = C.getRation(recipeId);
  const before = matArr(inv);
  const res = withStream(s, () => C.cook(hero, recipe, inv, 7));
  const line = res.ok
    ? `${hero.name} cooked ${res.qty}× ${INV.MATERIALS[res.food].name} · +${res.practiceGain} practice`
    : `${hero.name} couldn't cook — ${COOK_WHY[res.reason] || 'too tired to cook'}`;
  cooks.push({
    name, seed: s, recipeId, spec: JSON.stringify(spec), mats: JSON.stringify(mats),
    ok: res.ok ? 1 : 0, reason: res.reason || '',
    qty: res.qty || 0, food: res.food || '', practiceGain: res.practiceGain || 0,
    matsBefore: before, matsAfter: matArr(inv),
    prof: profSnap(hero, 'cooking'), cond: condSnap(hero),
    line: plain(line),
  });
}
cookCase('fresh cook, daily bread', {}, 'daily_bread', {});
cookCase('practiced cook, daily bread', { ckPractice: 60, ckField: 20 }, 'daily_bread', {});
cookCase('master cook, daily bread', { ckPractice: 100, ckField: 100 }, 'daily_bread', {});
cookCase('cure meat', { ckTheory: 10, ckPractice: 30 }, 'cure_meat', { game_meat: 6 });
cookCase('hearty stew', { ckTheory: 20, ckPractice: 40 }, 'hearty_stew', { grain: 9 });
cookCase('locked: cure meat', {}, 'cure_meat', { game_meat: 6 });
cookCase('locked: hearty stew', { ckTheory: 10 }, 'hearty_stew', { grain: 9 });
cookCase('out of ingredients', { ckTheory: 20 }, 'cure_meat', { game_meat: 1 });
cookCase('too tired to cook', { ckTheory: 20, stamina: 3 }, 'hearty_stew', { grain: 9 });
cookCase('master cure', { ckTheory: 40, ckPractice: 100, ckField: 60 }, 'cure_meat', { game_meat: 8 });

// ── brew ─────────────────────────────────────────────────────────────────────
const brews = [];
function brewCase(name, spec, recipeId, mats) {
  const s = ++seed;
  const hero = mkHero(spec);
  const inv = mkInv(mats);
  const recipe = A.getPotionRecipe(recipeId);
  const before = matArr(inv);
  const res = withStream(s, () => A.brew(hero, recipe, inv, 7));
  const line = !res.ok
    ? `${hero.name} couldn't brew — ${BREW_WHY[res.reason] || 'too tired to brew'}`
    : res.material
      ? `${hero.name} distilled ${res.qty}× ${res.name} · to the Forge stockroom · +${res.practiceGain} practice`
      : `${hero.name} brewed ${res.qty}× ${res.batch.name} (p${res.potency}) · +${res.practiceGain} practice`;
  brews.push({
    name, seed: s, recipeId, spec: JSON.stringify(spec), mats: JSON.stringify(mats),
    ok: res.ok ? 1 : 0, reason: res.reason || '',
    potency: res.potency || 0, qty: res.qty || 0,
    material: (res.ok && res.material) || '', practiceGain: res.practiceGain || 0,
    batchName: res.ok && res.batch ? res.batch.name : '',
    batchType: res.ok && res.batch ? res.batch.type : '',
    potionsInBag: (inv.potions || []).reduce((n, b) => n + (b.qty || 0), 0),
    matsBefore: before, matsAfter: matArr(inv),
    prof: profSnap(hero, 'alchemy'), cond: condSnap(hero),
    line: plain(line),
  });
}
brewCase('fresh alchemist, draught', {}, 'minor_heal', { sunleaf: 6 });
brewCase('practiced draught', { alTheory: 10, alPractice: 40, alField: 10 }, 'minor_heal', { sunleaf: 6 });
brewCase('vigor tonic', { alTheory: 10, alPractice: 30 }, 'tonic', { emberroot: 6 });
brewCase('greater draught', { alTheory: 30, alPractice: 50, alField: 20 }, 'greater_heal', { sunleaf: 6, nightcap: 3 });
brewCase('master greater draught', { alTheory: 60, alPractice: 100, alField: 80 }, 'greater_heal', { sunleaf: 6, nightcap: 3 });
brewCase('reagent: tempering oil, weak', { alTheory: 16, alPractice: 10 }, 'tempering_oil', { emberroot: 6, sunleaf: 6 });
brewCase('reagent: tempering oil, potent', { alTheory: 40, alPractice: 90, alField: 40 }, 'tempering_oil', { emberroot: 6, sunleaf: 6 });
brewCase('locked: greater draught', { alTheory: 10 }, 'greater_heal', { sunleaf: 6, nightcap: 3 });
brewCase('out of herbs', { alTheory: 30 }, 'greater_heal', { sunleaf: 1, nightcap: 0 });
brewCase('too tired to brew', { alTheory: 30, stamina: 2 }, 'greater_heal', { sunleaf: 6, nightcap: 3 });

// ── rework ───────────────────────────────────────────────────────────────────
const reworks = [];
function reworkCase(name, spec, kind, material, quality, mats) {
  const s = ++seed;
  const hero = mkHero(spec);
  const inv = mkInv(mats);
  const item = mkItem(kind, material, quality);
  INV.addItem(inv, item);
  const before = matArr(inv);
  const res = withStream(s, () => S.rework(hero, item, inv, 7));
  const line = res.ok
    ? `${hero.name} reworked ${I.itemLabel(res.item)} — q${res.from} → q${res.to} · edge trued, +${res.practiceGain} practice`
    : `${hero.name} couldn't rework — ${REWORK_WHY[res.reason] || 'the piece left the armory'}`;
  reworks.push({
    name, seed: s, spec: JSON.stringify(spec), kind, material, quality,
    mats: JSON.stringify(mats),
    ok: res.ok ? 1 : 0, reason: res.reason || '',
    from: res.from || 0, to: res.to || 0, practiceGain: res.practiceGain || 0,
    itemQuality: item.quality,
    matsBefore: before, matsAfter: matArr(inv),
    prof: profSnap(hero, 'blacksmithing'), cond: condSnap(hero),
    line: plain(line),
  });
}
reworkCase('true a tired iron sword', { bsTheory: 20, bsPractice: 40 }, 'sword', 'iron', 20, { iron_ore: 5 });
reworkCase('journeyman on steel', { bsTheory: 40, bsPractice: 60, bsField: 20 }, 'sword', 'steel', 35, { steel_ore: 5 });
reworkCase('mastered — beyond their craft', { bsTheory: 40, bsPractice: 10 }, 'sword', 'steel', 78, { steel_ore: 5 });
reworkCase('out of ore', { bsTheory: 20, bsPractice: 60 }, 'sword', 'iron', 20, {});
reworkCase('too tired to work', { bsTheory: 20, bsPractice: 60, stamina: 5 }, 'sword', 'iron', 20, { iron_ore: 5 });
reworkCase('locked metal', {}, 'hammer', 'mithril', 30, { mithril_ore: 5 });
reworkCase('leather jerkin trued', { bsTheory: 10, bsPractice: 50 }, 'armor', 'leather', 20, { pelt: 5 });
reworkCase('at the ceiling already', { bsTheory: 60, bsPractice: 100, bsField: 100 }, 'sword', 'iron', 54, { iron_ore: 5 });
reworkCase('mithril, master smith', { bsTheory: 80, bsPractice: 100, bsField: 100 }, 'sword', 'mithril', 40, { mithril_ore: 5 });
reworkCase('helm at q44', { bsTheory: 20, bsPractice: 70 }, 'helm', 'leather', 44, { pelt: 5 });

// ── refine (the +N game) ─────────────────────────────────────────────────────
const refineChances = [];
for (const [kind, material] of [['sword', 'leather'], ['sword', 'iron'], ['sword', 'steel'], ['sword', 'mithril']])
  for (let plus = 0; plus <= 10; plus++)
    for (const practice of [0, 45, 100]) {
      const hero = mkHero({ bsPractice: practice });
      refineChances.push({
        material, plus, practice,
        v: S.refineChance(mkItem(kind, material, 50, plus), hero),
      });
    }

const refines = [];
function refineCase(name, spec, kind, material, quality, plus, guardId, mats) {
  const s = ++seed;
  const hero = mkHero(spec);
  const inv = mkInv(mats);
  const item = mkItem(kind, material, quality, plus);
  INV.addItem(inv, item);
  const before = matArr(inv);
  const label = I.itemLabel(item);
  const res = withStream(s, () => S.refine(hero, item, inv, 7, guardId));
  let line;
  if (res.ok && res.success) {
    line = `${hero.name} refined ${label} → +${res.to} · ${res.chance}% held`
      + (res.to > 0 && res.chance < 100 ? ' — nerves of steel' : '');
  } else if (res.ok && res.broke) {
    line = `${hero.name} pushed ${label} past +${res.from} — it SHATTERED on the anvil · ${res.chance}% missed`;
  } else if (res.ok && res.downgraded) {
    line = `${hero.name} failed the refine — the Tempering Oil held the piece together at +${res.to}`;
  } else if (res.ok && res.kept) {
    line = `${hero.name} failed the refine — the Smith's Blessing kept it at +${res.from}`;
  } else {
    line = `${hero.name} couldn't refine — ${REFINE_WHY[res.reason] || 'the piece left the armory'}`;
  }
  refines.push({
    name, seed: s, spec: JSON.stringify(spec), kind, material, quality, plus,
    guard: guardId, mats: JSON.stringify(mats),
    ok: res.ok ? 1 : 0, reason: res.reason || '',
    success: res.success ? 1 : 0, broke: res.broke ? 1 : 0,
    downgraded: res.downgraded ? 1 : 0, kept: res.kept ? 1 : 0,
    from: res.from || 0, to: res.to || 0, chance: res.chance || 0, fee: res.fee || 0,
    practiceGain: res.practiceGain || 0, itemPlus: item.plus || 0,
    matsBefore: before, matsAfter: matArr(inv),
    prof: profSnap(hero, 'blacksmithing'), cond: condSnap(hero),
    line: plain(line),
  });
}
refineCase('safe +1 on iron', { bsTheory: 20 }, 'sword', 'iron', 50, 0, 'none', { iron_ore: 5 });
refineCase('safe +7 on iron', { bsTheory: 20 }, 'sword', 'iron', 50, 6, 'none', { iron_ore: 5 });
refineCase('risky +8 bare', { bsTheory: 20, bsPractice: 30 }, 'sword', 'iron', 50, 7, 'none', { iron_ore: 5 });
refineCase('risky +8 bare, second seed', { bsTheory: 20, bsPractice: 90 }, 'sword', 'iron', 50, 7, 'none', { iron_ore: 5 });
refineCase('risky +9 with oil', { bsTheory: 20, bsPractice: 30 }, 'sword', 'iron', 50, 8, 'oil', { iron_ore: 5, tempering_oil: 2 });
refineCase('risky +10 with blessing', { bsTheory: 20, bsPractice: 30 }, 'sword', 'iron', 50, 9, 'blessing', { iron_ore: 5, smith_blessing: 2 });
refineCase('steel past safe 6', { bsTheory: 40, bsPractice: 50 }, 'sword', 'steel', 60, 6, 'none', { steel_ore: 5 });
refineCase('mithril past safe 5', { bsTheory: 70, bsPractice: 80 }, 'sword', 'mithril', 80, 5, 'none', { mithril_ore: 5 });
refineCase('already maxed', { bsTheory: 20 }, 'sword', 'iron', 50, 10, 'none', { iron_ore: 5 });
refineCase('no ore', { bsTheory: 20 }, 'sword', 'iron', 50, 0, 'none', {});
refineCase('no reagent', { bsTheory: 20 }, 'sword', 'iron', 50, 7, 'oil', { iron_ore: 5 });
refineCase('too tired', { bsTheory: 20, stamina: 3 }, 'sword', 'iron', 50, 0, 'none', { iron_ore: 5 });
refineCase('locked metal', {}, 'hammer', 'mithril', 50, 0, 'none', { mithril_ore: 5 });

// ═══ 6. study — the Theory track that opens the tables ═══════════════════════

const studies = [];
function studyCase(name, spec, discipline, bookMult) {
  const s = ++seed;
  const hero = mkHero(spec);
  const res = withStream(s, () => S.study(hero, discipline, bookMult));
  // recapPanel (hall.js:2930), tags stripped; the subject label is
  // BOOK_SUBJECTS[discipline].label lower-cased (books.js:20-25).
  const label = { blacksmithing: 'metallurgy', alchemy: 'alchemy', cooking: 'culinary arts' }[discipline] || 'metallurgy';
  studies.push({
    name, seed: s, spec: JSON.stringify(spec), discipline,
    bookMultX1000: Math.round((bookMult ?? 1) * 1000),
    theoryGain: res.theoryGain,
    prof: profSnap(hero, discipline), cond: condSnap(hero),
    line: plain(`${hero.name} studied ${label} — Theory +${res.theoryGain}`),
  });
}
studyCase('fresh metallurgy', {}, 'blacksmithing', 1);
studyCase('fresh metallurgy, studious', { traits: ['Studious'] }, 'blacksmithing', 1);
studyCase('metallurgy with a tier-2 book', {}, 'blacksmithing', 1.35);
studyCase('half-taught metallurgy', { bsTheory: 50 }, 'blacksmithing', 1);
studyCase('nearly mastered metallurgy', { bsTheory: 96 }, 'blacksmithing', 1);
studyCase('capped metallurgy', { bsTheory: 100 }, 'blacksmithing', 1);
studyCase('fresh alchemy', {}, 'alchemy', 1);
studyCase('fresh cooking', {}, 'cooking', 1);
studyCase('cooking, studious, good book', { traits: ['Studious'] }, 'cooking', 1.7);
studyCase('tired scholar', { stamina: 6 }, 'blacksmithing', 1);

// ═══ 7. applyPotion — what a bottle actually does ════════════════════════════

const potionApplies = [];
function applyCase(name, batchSpec, spec) {
  const hero = mkHero(spec);
  const batch = { potency: batchSpec.potency, type: batchSpec.type, name: batchSpec.name || 'Draught' };
  const msg = A.applyPotion(batch, hero);
  potionApplies.push({
    name, potency: batchSpec.potency, type: batchSpec.type, spec: JSON.stringify(spec),
    spent: msg ? 1 : 0, msg: plain(msg || ''),
    cond: condSnap(hero),
  });
}
applyCase('heal a spent hero', { potency: 40, type: 'heal' }, { stamina: 30 });
applyCase('heal overflows the cap', { potency: 90, type: 'heal' }, { stamina: 60 });
applyCase('heal a full hero — wasted', { potency: 40, type: 'heal' }, { stamina: 100 });
applyCase('weak heal cannot cure', { potency: 55, type: 'heal' }, { stamina: 40, injury: 'strained' });
applyCase('potent heal cures', { potency: 80, type: 'heal' }, { stamina: 40, injury: 'strained' });
applyCase('potent heal cures at full stamina', { potency: 80, type: 'heal' }, { stamina: 100, injury: 'torn' });
applyCase('tonic sheds both', { potency: 40, type: 'tonic' }, { fatigue: 70, stress: 50 });
applyCase('tonic on fatigue only', { potency: 40, type: 'tonic' }, { fatigue: 70, stress: 0 });
applyCase('tonic on a fresh hero — wasted', { potency: 40, type: 'tonic' }, { fatigue: 0, stress: 0 });
applyCase('tonic overshoots', { potency: 90, type: 'tonic' }, { fatigue: 20, stress: 10 });

// ═══ Write ═══════════════════════════════════════════════════════════════════

const fixture = {
  matIds: MAT_IDS,
  categoryOrder: S.CATEGORY_ORDER,
  categorySlots, categoryNames,
  reworkStamina: S.REWORK_STAMINA,
  refineStamina: S.REFINE_STAMINA,
  maxPlus: S.MAX_PLUS,
  materialMeta,
  smithRecipes, rationRecipes, potionRecipes,
  qualityPreviews, yieldPreviews, potencyPreviews,
  unlocks, recipeForItems, reworkPreviews,
  forges, cooks, brews, reworks, refineChances, refines,
  studies, potionApplies,
};

const out = process.argv[2] || join(ROOT, '..', '..', '..', '..', 'Guild Rancher',
                                    'Assets', 'Tests', 'EditMode', 'craft-rules-fixture.json');
const json = JSON.stringify(fixture, null, 1);
if (json.includes('null')) throw new Error('fixture law: a null reached the JSON');
writeFileSync(out, json);
console.log(`fixture -> ${out}`);
console.log(`${smithRecipes.length} smith recipes, ${rationRecipes.length} rations, ${potionRecipes.length} potions`);
console.log(`${qualityPreviews.length + yieldPreviews.length + potencyPreviews.length + reworkPreviews.length} previews, ${unlocks.length} unlock rungs`);
console.log(`${forges.length} forges, ${cooks.length} cooks, ${brews.length} brews, ${reworks.length} reworks, ${refines.length} refines, ${studies.length} studies, ${potionApplies.length} potions applied`);
// Unused-import guard: costPairs is exported shape sugar kept for readers.
void costPairs;
