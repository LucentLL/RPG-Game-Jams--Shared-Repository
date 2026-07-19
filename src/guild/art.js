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
import { ART_BASE } from '../config/assets.js';

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
};

/** Named crops: { sheet, x, y, w, h } in sheet pixels. Crops tagged `MEASURE`
 *  are provisional and refined against the real sheet with the alpha-box probe. */
export const ART = {
  tree:      { sheet: 'tree_3x', x: 96, y: 0, w: 96, h: 144 },   // the full Elements tree
  treeSmall: { sheet: 'tree_3x', x: 0, y: 0, w: 96, h: 120 },    // its rounder sibling
  stall:     { sheet: 'stall_3x', x: 3, y: 156, w: 138, h: 156 },// red-striped market stall, table + legs
  wagon:     { sheet: 'wagon_1x', x: 4, y: 0, w: 92, h: 88 },    // covered wagon, front-quarter view
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
};

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
