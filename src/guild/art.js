/**
 * @file Art crops — real pixel art from the shared `rpg-assets/` library.
 *
 * The library ships SHEETS (many sprites per PNG). This module is the single
 * registry of the crops the game uses: each named sprite is a measured pixel
 * rectangle on a sheet in `public/assets/art/` (curated copies — the full
 * library lives at the repo root; see rpg-assets/README.md for the index).
 *
 * `artSprite(name)` renders a crop as a pure-CSS sprite: background-size and
 * background-position are expressed in PERCENTAGES derived from the sheet and
 * crop dimensions, so the element scales freely (campus standees are sized in
 * % of the field) while staying pixel-exact — no runtime canvas work, no
 * per-sprite image files. Crop boxes were measured with an alpha-cluster probe
 * against the real sheets; sheet dims are part of the registry because the
 * percentage math needs them at render time.
 */
import { ART_BASE, SPRITE_BASES } from '../config/assets.js';

/** Sheet dimensions (px) — required by the percentage crop math. */
const SHEETS = {
  tree_3x: { w: 192, h: 240 },
  stall_3x: { w: 432, h: 432 },
  well_3x: { w: 384, h: 384 },
  bookshelf_3x: { w: 1728, h: 1536 },
  smithy_3x: { w: 1800, h: 1104 },
  wagon_1x: { w: 256, h: 256 },
  bakery_1x: { w: 112, h: 128 },
  oven_1x: { w: 192, h: 128 },
  beds_3x: { w: 432, h: 384 },
  floppyfish: { w: 48, h: 128 },
  kitchenC: { w: 256, h: 256 },
  // Wilds creatures — RPG-Maker 3×4 walk sheets; the crop is the front-idle frame
  // (col 1, row 0), alpha-trimmed by the scratchpad probe so each standee is tight.
  opossum: { w: 243, h: 432 },
  squirrel: { w: 243, h: 432 },
  badger: { w: 378, h: 432 },
  beetle: { w: 279, h: 432 },
  slime: { w: 414, h: 576 },
  wolf: { w: 468, h: 636 },
  bear: { w: 432, h: 384 },
  // Delve denizens — same 3×4 walk-sheet format (delve.js animates the full
  // sheet; these registry entries serve the front-idle standee crops below).
  ghost: { w: 234, h: 432 },
  ghoul: { w: 234, h: 432 },
  skeleton: { w: 234, h: 432 },
  ratking: { w: 234, h: 432 },
  slimeking: { w: 414, h: 576 },
  // Interior furnishings for the walkable rooms (delve-maps.js props). Dims
  // measured off the copied sheets; crops below were probe-verified per sheet.
  mansion_3x: { w: 768, h: 768 },
  judgebench_3x: { w: 192, h: 144 },
  banners_3x: { w: 384, h: 192 },
  safe_3x: { w: 288, h: 384 },
  wizworkshop_3x: { w: 384, h: 672 },
  workbench_3x: { w: 576, h: 336 },
  questboard_3x: { w: 240, h: 288 },
  churchtiles_3x: { w: 384, h: 384 },
  kitchen_3x: { w: 384, h: 240 },
  ovenbake_3x: { w: 576, h: 384 },
  bakerykit_3x: { w: 336, h: 384 },
  forge_3x: { w: 288, h: 528 },
  anvils_3x: { w: 384, h: 192 },
  ruins_3x: { w: 384, h: 528 },
  armorshop_3x: { w: 384, h: 144 },
  storage_3x: { w: 336, h: 384 },
  interior_3x: { w: 768, h: 768 },
  chests_3x: { w: 936, h: 864 },
  candles_3x: { w: 576, h: 480 },
  // The apothecary. The cauldron sheet is an RPG-Maker object charset whose
  // outer columns are flat filler — only column 1 carries art, and it carries
  // FOUR frames down the rows, which .apoth-boil steps through in CSS.
  cauldron_3x: { w: 288, h: 576 },
  witchtiles_3x: { w: 384, h: 192 },
  alchjars_3x: { w: 384, h: 336 },
  shopextras_3x: { w: 336, h: 384 },
  alchbench_3x: { w: 384, h: 144 },
  // Campus exteriors — whole buildings you walk up to and enter.
  guildhall_3x: { w: 816, h: 576 },
  tower_3x: { w: 768, h: 768 },
  huts_3x: { w: 672, h: 336 },
  cottage_3x: { w: 267, h: 300 },
  shopfront_3x: { w: 672, h: 384 },
  colosseum_3x: { w: 432, h: 336 },
  gate_3x: { w: 432, h: 576 },
  dummy_3x: { w: 252, h: 432 },
  lamppost_3x: { w: 192, h: 336 },
  statues_3x: { w: 480, h: 240 },
};

/** Named crops: { sheet, x, y, w, h } in sheet pixels. Crops tagged `MEASURE`
 *  are provisional and refined against the real sheet with the alpha-box probe. */
export const ART = {
  tree:      { sheet: 'tree_3x', x: 96, y: 0, w: 96, h: 144 },   // canopy crop (campus rows)
  treeTall:  { sheet: 'tree_3x', x: 96, y: 0, w: 96, h: 240 },   // the FULL tree, trunk included (delve standees)
  treeSmall: { sheet: 'tree_3x', x: 0, y: 0, w: 96, h: 120 },    // its rounder sibling
  stall:     { sheet: 'stall_3x', x: 3, y: 156, w: 138, h: 156 },// red-striped market stall, table + legs
  wagon:     { sheet: 'wagon_1x', x: 4, y: 26, w: 94, h: 66 },   // covered wagon side view (tight box — the sheet's barrel row sits above it)
  well:      { sheet: 'well_3x', x: 192, y: 6, w: 189, h: 254 }, // the roofed village well
  bookshelf: { sheet: 'bookshelf_3x', x: 147, y: 9, w: 138, h: 150 }, // a full library shelf
  anvil:     { sheet: 'smithy_3x', x: 1380, y: 744, w: 75, h: 63 },   // anvil on its stump
  bed:       { sheet: 'beds_3x', x: 21, y: 27, w: 102, h: 147 },      // a made bunk
  oven:      { sheet: 'oven_1x', x: 0, y: 64, w: 48, h: 64 },         // the big stone oven, fire lit
  counter:   { sheet: 'bakery_1x', x: 0, y: 72, w: 112, h: 24 },      // kitchen counter run
  // Kitchen dressing — crops measured against the real sheets (alpha-box probe).
  counterLong:  { sheet: 'bakery_1x', x: 0, y: 72, w: 112, h: 24 },   // the counter run
  counterFront: { sheet: 'bakery_1x', x: 0, y: 100, w: 112, h: 24 },
  floppyfish:{ sheet: 'floppyfish', x: 14, y: 0, w: 20, h: 16 },      // one fish, flopping
  breadPile: { sheet: 'bakery_1x', x: 16, y: 2, w: 48, h: 14 },       // a row of loaves
  tools:     { sheet: 'bakery_1x', x: 0, y: 19, w: 50, h: 14 },       // rolling pin
  sacks:     { sheet: 'bakery_1x', x: 80, y: 16, w: 32, h: 48 },      // stacked sacks / baskets
  // Wilds prey — front-idle standees (probe-measured alpha boxes).
  opossum:  { sheet: 'opossum',  x: 96,  y: 57, w: 54, h: 45 },
  squirrel: { sheet: 'squirrel', x: 99,  y: 39, w: 42, h: 63 },
  badger:   { sheet: 'badger',   x: 159, y: 57, w: 60, h: 45 },
  beetle:   { sheet: 'beetle',   x: 110, y: 48, w: 57, h: 51 },
  slime:    { sheet: 'slime',    x: 174, y: 87, w: 66, h: 54 },
  wolf:     { sheet: 'wolf',     x: 201, y: 51, w: 63, h: 99 },
  bear:     { sheet: 'bear',     x: 177, y: 3,  w: 78, h: 90 },
  // Delve denizens — front-idle standees (probe-measured alpha boxes).
  ghost:     { sheet: 'ghost',     x: 90,  y: 24, w: 51, h: 84 },
  ghoul:     { sheet: 'ghoul',     x: 87,  y: 21, w: 60, h: 87 },
  skeleton:  { sheet: 'skeleton',  x: 84,  y: 6,  w: 63, h: 102 },
  ratking:   { sheet: 'ratking',   x: 84,  y: 24, w: 63, h: 84 },
  slimeking: { sheet: 'slimeking', x: 174, y: 78, w: 66, h: 63 },

  // ── Furnishings for the walkable interiors (delve-maps.js `props`) ───────
  // The Guildmaster's study
  gmDesk:      { sheet: 'judgebench_3x', x: 3,   y: 51,  w: 138, h: 90 },  // the great bench-desk
  gmThrone:    { sheet: 'judgebench_3x', x: 150, y: 12,  w: 36,  h: 72 },  // high-backed chair
  gmBookshelf: { sheet: 'mansion_3x',    x: 3,   y: 537, w: 138, h: 150 },
  gmPortrait:  { sheet: 'mansion_3x',    x: 297, y: 405, w: 78,  h: 72 },
  gmBust:      { sheet: 'mansion_3x',    x: 198, y: 651, w: 36,  h: 48 },
  gmLedgers:   { sheet: 'mansion_3x',    x: 195, y: 531, w: 42,  h: 24 },
  gmBanner:    { sheet: 'banners_3x',    x: 48,  y: 15,  w: 45,  h: 144 },
  gmStrongbox: { sheet: 'safe_3x',       x: 207, y: 0,   w: 66,  h: 78 },
  // The classroom
  lectern:     { sheet: 'judgebench_3x', x: 3,   y: 51,  w: 138, h: 90 },
  lessonBoard: { sheet: 'questboard_3x', x: 0,   y: 210, w: 96,  h: 66 },
  classDesk:   { sheet: 'workbench_3x',  x: 48,  y: 6,   w: 48,  h: 54 },
  classBench:  { sheet: 'churchtiles_3x', x: 120, y: 240, w: 66, h: 45 },
  teacherDesk: { sheet: 'wizworkshop_3x', x: 3,  y: 294, w: 138, h: 81 },
  globe:       { sheet: 'wizworkshop_3x', x: 291, y: 507, w: 42, h: 60 },
  abacus:      { sheet: 'wizworkshop_3x', x: 240, y: 483, w: 48, h: 42 },
  // The kitchen
  stoneOven:    { sheet: 'ovenbake_3x', x: 48,  y: 144, w: 48,  h: 84 },
  prepCounter:  { sheet: 'kitchen_3x',  x: 144, y: 60,  w: 144, h: 57 },
  kitchenStove: { sheet: 'kitchen_3x',  x: 336, y: 33,  w: 48,  h: 87 },
  hangingHerbs: { sheet: 'kitchen_3x',  x: 48,  y: 165, w: 96,  h: 72 },
  hangingMeat:  { sheet: 'kitchen_3x',  x: 236, y: 165, w: 52,  h: 72 },
  hangingPot:   { sheet: 'kitchen_3x',  x: 330, y: 162, w: 40,  h: 60 },
  sackPile:     { sheet: 'bakerykit_3x', x: 249, y: 147, w: 78, h: 45 },
  provisionBarrel: { sheet: 'bakerykit_3x', x: 99, y: 147, w: 42, h: 42 },
  // The forge
  forgeFurnace: { sheet: 'forge_3x',  x: 171, y: 12,  w: 90, h: 144 },
  forgeTwin:    { sheet: 'forge_3x',  x: 144, y: 363, w: 96, h: 126 },
  anvilWork:    { sheet: 'anvils_3x', x: 264, y: 138, w: 84, h: 54 },  // struck: hammer down, chips flying
  anvilFront:   { sheet: 'anvils_3x', x: 192, y: 0,   w: 48, h: 48 },
  // The workable anvil's two states. Same sprite, same pedestal, same pixels
  // under the face — so swapping between them on the strike frame reads as one
  // anvil being hit rather than two anvils cross-fading.
  anvilBare:    { sheet: 'anvils_3x', x: 264, y: 0,   w: 84, h: 48 },  // side view, empty face
  anvilHot:     { sheet: 'anvils_3x', x: 264, y: 48,  w: 84, h: 48 },  // side view, workpiece on the face
  quenchBarrel: { sheet: 'ruins_3x',  x: 6,   y: 213, w: 36, h: 54 },
  // The armory
  armorPlate:     { sheet: 'armorshop_3x', x: 150, y: 57, w: 39, h: 84 },
  armorSteel:     { sheet: 'armorshop_3x', x: 48,  y: 57, w: 45, h: 84 },
  armorKnight:    { sheet: 'armorshop_3x', x: 96,  y: 51, w: 45, h: 90 },
  practiceTarget: { sheet: 'armorshop_3x', x: 342, y: 60, w: 39, h: 81 },
  gearCubbies:    { sheet: 'storage_3x',   x: 198, y: 21, w: 132, h: 96 },
  issueCounter:   { sheet: 'storage_3x',   x: 3,   y: 153, w: 186, h: 78 },
  storeBarrel:    { sheet: 'storage_3x',   x: 6,   y: 261, w: 36, h: 54 },
  // The dormitory
  bunkPosted: { sheet: 'beds_3x',     x: 159, y: 21,  w: 114, h: 156 },
  bunkIron:   { sheet: 'beds_3x',     x: 21,  y: 219, w: 102, h: 147 },
  wardrobe:   { sheet: 'interior_3x', x: 192, y: 249, w: 96,  h: 129 },
  washstand:  { sheet: 'interior_3x', x: 0,   y: 291, w: 96,  h: 87 },
  footlocker: { sheet: 'chests_3x',   x: 87,  y: 54,  w: 57,  h: 51 },
  bedCandle:  { sheet: 'candles_3x',  x: 159, y: 249, w: 21,  h: 45 },

  // ── The apothecary ───────────────────────────────────────────────────────
  // Frame 0 of the witch-hatted cauldron; the other three sit below it at a
  // 144px row pitch and .apoth-boil walks them (see delve.css apothBoil).
  cauldronBoil:  { sheet: 'cauldron_3x',   x: 111, y: 24,  w: 63,  h: 120 },
  cauldronGreen: { sheet: 'witchtiles_3x', x: 114, y: 24,  w: 63,  h: 63 },  // stone pot, paddle standing in it
  cauldronBlue:  { sheet: 'witchtiles_3x', x: 18,  y: 33,  w: 63,  h: 54 },  // a still vat
  potionGreen:   { sheet: 'witchtiles_3x', x: 249, y: 102, w: 27,  h: 36 },
  potionRed:     { sheet: 'witchtiles_3x', x: 297, y: 102, w: 27,  h: 36 },
  potionBlue:    { sheet: 'witchtiles_3x', x: 345, y: 102, w: 27,  h: 36 },
  recipeBanner:  { sheet: 'witchtiles_3x', x: 6,   y: 99,  w: 135, h: 90 },  // scrolls + hanging banner
  jarCounter:    { sheet: 'alchjars_3x',   x: 147, y: 198, w: 138, h: 138 }, // worktop over four tiers of specimen jars
  jarCabinet:    { sheet: 'alchjars_3x',   x: 288, y: 144, w: 96,  h: 192 }, // the tall showpiece wall unit
  jarShelf:      { sheet: 'alchjars_3x',   x: 147, y: 144, w: 138, h: 48 },
  specimenJars:  { sheet: 'alchjars_3x',   x: 0,   y: 159, w: 144, h: 117 }, // three floor-standing jars
  alchBench:     { sheet: 'alchbench_3x',  x: 261, y: 42,  w: 102, h: 54 },  // retort, vials, pot rack
  alchBenchSmall:{ sheet: 'alchbench_3x',  x: 192, y: 45,  w: 48,  h: 51 },
  potionCounter: { sheet: 'shopextras_3x', x: 3,   y: 240, w: 138, h: 42 },  // counter lined with potions
  herbBasket:    { sheet: 'shopextras_3x', x: 192, y: 336, w: 45,  h: 42 },
  apothDresser:  { sheet: 'shopextras_3x', x: 147, y: 21,  w: 90,  h: 99 },

  // ── Campus exteriors (delve-maps.js campus `buildings`) ─────────────────
  // Every one is a front-facing facade with its door on the centre line
  // unless noted; the fraction is where the doorway sits across its width.
  bldgGuildhall: { sheet: 'guildhall_3x', x: 48,  y: 30,  w: 240, h: 534 }, // stone cathedral · door .50
  bldgLibrary:   { sheet: 'tower_3x',     x: 0,   y: 3,   w: 238, h: 477 }, // tan scholar's tower · .50
  bldgAcademy:   { sheet: 'tower_3x',     x: 384, y: 3,   w: 238, h: 477 }, // grey granite twin · .50
  bldgForge:     { sheet: 'huts_3x',      x: 33,  y: 42,  w: 285, h: 294 }, // mossy log hut · door .45
  bldgKitchen:   { sheet: 'huts_3x',      x: 369, y: 42,  w: 285, h: 294 }, // its autumn sibling · .45
  bldgDormitory: { sheet: 'cottage_3x',   x: 0,   y: 0,   w: 267, h: 300 }, // the bunk cottage · .50
  bldgArmory:    { sheet: 'shopfront_3x', x: 240, y: 192, w: 288, h: 96 },  // a shop front · door .27
  bldgApothecary:{ sheet: 'shopfront_3x', x: 48,  y: 48,  w: 144, h: 297 }, // tall timber shop, open front · .50
  bldgArena:     { sheet: 'colosseum_3x', x: 15,  y: 192, w: 114, h: 141 }, // tiered amphitheatre · .50
  gateArch:      { sheet: 'gate_3x',      x: 144, y: 0,   w: 144, h: 123 }, // the estate gate
  trainDummy:    { sheet: 'dummy_3x',     x: 87,  y: 228, w: 75,  h: 96 },
  lampPost:      { sheet: 'lamppost_3x',  x: 102, y: 36,  w: 87,  h: 105 },
  statue:        { sheet: 'statues_3x',   x: 342, y: 3,   w: 135, h: 225 },
};

// ─── Item art: one cell off an Elements weapon sheet ─────────────────────────
// Armory items have never had a picture — only a KIND_GLYPH emoji. But the
// compositor's weapon overlays are real art, and one cell of them is a real
// weapon on transparency. Column 11 is the mid-swing frame, where the weapon is
// fully extended and clear of the (absent) body; row 2 is the east facing, so
// the blade lies up-and-right with its hilt at the lower left. That single cell
// is a weapon lying on its side — which is exactly a piece waiting on an anvil.
const WEAPON_SHEET = { w: 1104, h: 192, cell: 48, cols: 23, rows: 4 };
const LAID_COL = 11, LAID_ROW = 2;

/** Item kind → the weapon sheet that stands in for it. `pack` indexes
 *  SPRITE_BASES (0 core · 1 ce1 · 2 ce2), matching where each PNG really is. */
const ITEM_WEAPON = {
  sword:  { pack: 0, stem: 'sword1',  maxC: 3 },
  dagger: { pack: 2, stem: 'daggerR', maxC: 3 },
  axe:    { pack: 1, stem: 'axe1',    maxC: 3 },
  bow:    { pack: 0, stem: 'bow1',    maxC: 0 },
  mace:   { pack: 0, stem: 'mace1',   maxC: 5 },
  hammer: { pack: 2, stem: 'hammer',  maxC: 3 },
};
/** Material → colour variant, so a mithril blade reads finer than an iron one.
 *  Mirrors crucible.js weaponTierToColor: variant 0 is the base file. */
const MAT_COLOR = { leather: 0, iron: 0, steel: 2, mithril: 3 };

/**
 * The item as a laid-down weapon sprite, or '' when the kind has no sheet
 * (armor — the caller falls back to an armour-stand crop).
 * @param {{kind:string, material:string}} item
 * @param {string} [cls] @param {string} [style]
 */
export function itemSprite(item, cls = '', style = '') {
  const w = item && ITEM_WEAPON[item.kind];
  if (!w) return '';
  const c = Math.min(MAT_COLOR[item.material] || 0, w.maxC);
  const file = w.stem + (c ? '_c' + c : '');
  const S = WEAPON_SHEET;
  return `<span class="px-art ${cls}" style="aspect-ratio:1;` +
    `background-image:url(${SPRITE_BASES[w.pack]}weapon/${file}.png);` +
    `background-size:${(S.w / S.cell * 100).toFixed(4)}% ${(S.h / S.cell * 100).toFixed(4)}%;` +
    `background-position:${(LAID_COL / (S.cols - 1) * 100).toFixed(4)}% ${(LAID_ROW / (S.rows - 1) * 100).toFixed(4)}%;${style}"></span>`;
}

/** Does this item have laid-weapon art? (armor and unknown kinds do not) */
export function hasItemSprite(item) { return !!(item && ITEM_WEAPON[item.kind]); }

// ─── Gear icons: the piece seen BIG ─────────────────────────────────────────
// The compositor's weapon cells are ~10 source pixels of blade (measured: the
// sword in sword1.png r0c1 has an 8×11 alpha box). That is right for a 48px
// battle sprite and useless for anything held up close — the first-person
// delve wants a weapon that fills a corner of the screen. These are the item
// ICON sheets from the same art family: 32px cells, one weapon each, drawn
// hilt-at-lower-left so a mirrored copy reads as a blade rising into frame.
const GEAR_SHEETS = {
  swords:  { file: 'gear_swords32.png',  cols: 13 },  // mswords_icon32
  axes:    { file: 'gear_axes32.png',    cols: 13 },  // mspears_icon32 — 0..6 spears, 7..12 axes
  hammers: { file: 'gear_hammers32.png', cols: 16 },  // icons_hammers_32_fc
  bows:    { file: 'gear_bows32.png',    cols: 16 },  // marrows_icon32 — 3..6 bows, 7..9 crossbows
  shields: { file: 'gear_shields32.png', cols: 15 },  // mshields_icon32 — two rows of 15
};
/**
 * Item kind → icon sheet + the cell each MATERIAL wears, so a mithril blade
 * reads finer than an iron one (the same idea as MAT_COLOR, one level up).
 *
 * `armor` resolves to a SHIELD: the body slot is the guard kit, and a shield
 * is what a guard kit looks like from behind your own arm. It is the only way
 * the off-hand has anything to show — there is no shield slot (EQUIP_SLOTS).
 */
const GEAR_ICON = {
  sword:  { sheet: 'swords',  by: { leather: 0,  iron: 3,  steel: 9,  mithril: 11 } },
  dagger: { sheet: 'swords',  by: { leather: 0,  iron: 0,  steel: 2,  mithril: 2 } },
  axe:    { sheet: 'axes',    by: { leather: 12, iron: 12, steel: 11, mithril: 8 } },
  mace:   { sheet: 'hammers', by: { leather: 2,  iron: 0,  steel: 6,  mithril: 14 } },
  hammer: { sheet: 'hammers', by: { leather: 2,  iron: 0,  steel: 6,  mithril: 14 } },
  bow:    { sheet: 'bows',    by: { leather: 4,  iron: 4,  steel: 5,  mithril: 6 } },
  armor:  { sheet: 'shields', by: { leather: 0,  iron: 13, steel: 10, mithril: 24 } },
};
/** Icon cell size, in sheet pixels. Every sheet above is on this grid. */
export const GEAR_ICON_SIZE = 32;

/**
 * Where a piece of gear's big icon lives — enough for a caller to `drawImage`
 * it onto a canvas of its own. Null for a kind with no sheet.
 * @param {string} kind @param {string} material
 * @returns {?{url:string, sx:number, sy:number, s:number}}
 */
export function gearIcon(kind, material) {
  const g = GEAR_ICON[kind];
  if (!g) return null;
  const sh = GEAR_SHEETS[g.sheet];
  const i = g.by[material] != null ? g.by[material] : g.by.iron;
  const S = GEAR_ICON_SIZE;
  return { url: ART_BASE + sh.file, sx: (i % sh.cols) * S, sy: Math.floor(i / sh.cols) * S, s: S };
}

/**
 * A cropped sheet sprite as an HTML string. Size it from CSS/inline style
 * (width + the intrinsic aspect-ratio keeps it true); it scales pixel-crisp.
 * @param {keyof typeof ART} name @param {string} [cls] extra classes
 * @param {string} [style] extra inline style (e.g. 'width:64%')
 */
export function artSprite(name, cls = '', style = '') {
  const s = ART[name];
  if (!s) return '';
  const sh = SHEETS[s.sheet];
  const posX = sh.w === s.w ? 0 : (s.x / (sh.w - s.w)) * 100;
  const posY = sh.h === s.h ? 0 : (s.y / (sh.h - s.h)) * 100;
  return `<span class="px-art ${cls}" style="aspect-ratio:${s.w}/${s.h};` +
    `background-image:url(${ART_BASE}${s.sheet}.png);` +
    `background-size:${(sh.w / s.w * 100).toFixed(4)}% ${(sh.h / s.h * 100).toFixed(4)}%;` +
    `background-position:${posX.toFixed(4)}% ${posY.toFixed(4)}%;${style}"></span>`;
}
