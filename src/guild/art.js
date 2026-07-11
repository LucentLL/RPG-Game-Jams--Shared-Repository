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
};

/** Named crops: { sheet, x, y, w, h } in sheet pixels. */
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
