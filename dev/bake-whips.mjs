/**
 * The whip kit, re-cut onto the columns the compositor names.
 *
 *   node --import ./dev/register-vite-env.mjs dev/bake-whips.mjs
 *
 * ── WHY A BAKE AT ALL ──────────────────────────────────────────────────────
 *
 * The whip sheets (rpg-assets/whips/) are 560×448: five 112px cells across,
 * four facings down, in RPG-Maker row order. The compositor speaks a different
 * sheet: TWENTY-THREE columns, and it addresses them by NAME — slash is 10-14,
 * the walk cycle is 1/2/0, hurt is 6, sleep is 22 (data/sprite-tables.js
 * ELEMENTS_ANIMS). Five columns cannot answer those questions. So the artist's
 * five cells are PLACED at the columns that mean what they draw, and the sheet
 * the game loads is 23 columns wide like every other.
 *
 * This is placement, not transformation. Every pixel written here was drawn by
 * the artist, at the size they drew it, in the cell they drew it in; nothing is
 * scaled, rotated, flipped or interpolated. The art law forbids faking a pose,
 * and no pose is faked — the crack is the crack, the carry is the carry.
 *
 * ── WHY 112px CELLS AND NOT 48 ─────────────────────────────────────────────
 *
 * Measured against the kit the compositor already draws: an Elements character
 * (head+top+bottom+hair, east stand) is 11×24 px, and sword1's slash reaches 24
 * px past the cell's centre. The whip's crack reaches 56. Both sheets are drawn
 * at the same pixel scale — 1px strokes, same palette weight — so that 56 is
 * not a bigger drawing, it is a longer weapon: 2.33 character-heights against a
 * sword's 1.0.
 *
 * A 48px cell can hold 24px of reach. Squeezing the whip into one would cut 32
 * px off the lash, and scaling it down to fit would resample pixel art by 0.43
 * and make the whip reach exactly as far as a sword — which is the one thing it
 * must not do, because that reach is where the RULES number comes from
 * (PLAYER_H 0.844 tiles × 2.33 ≈ 2 tiles). So the cell grows instead. The
 * column layout is unchanged, which is why the compositor only has to learn a
 * cell SIZE and not a second vocabulary — and it learns that from the file's
 * own width (sheet width ÷ 23), so this bake and the renderer cannot disagree.
 *
 * ── WHERE THEY LAND ────────────────────────────────────────────────────────
 *
 * public/assets/sprites/core/weapon/. That folder is where the loader looks
 * (config/assets.js SPRITE_BASES), not a claim about provenance: whips are
 * their own kit, vendored at rpg-assets/whips/, not part of the Elements core
 * pack they sit beside.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPng, encodePng, blankPng, blitPng } from './png.mjs';
import { ELEMENTS_COLS, ELEMENTS_ROWS } from '../src/game/data/config.js';
import { WORN } from '../src/guild/art.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', 'rpg-assets', 'whips');
const OUT = path.join(HERE, '..', 'public', 'assets', 'sprites', 'core', 'weapon');

/** The kit's own grid. */
const SRC_COLS = 5, SRC_ROWS = 4;

/**
 * WHICH AUTHORED CELL ANSWERS WHICH COLUMN.
 *
 * Source col 0 is the lash drawn back along the body — the whip CARRIED, tip 6
 * px behind centre. Source cols 1-4 are the crack: 56, 55, 52, 43 px past
 * centre, so 1 is the full extension and 4 is the recoil.
 *
 * The crack goes to the slash block, in order, so the swing plays wind-out-
 * recoil and settles on 14 — which is also where the first-person viewmodel
 * rests (art.js WORN.rest). EVERY OTHER COLUMN gets the carry.
 *
 * Filling the rest rather than leaving it empty is deliberate. Empty columns
 * are handled by _resolveWeaponSrcCol's fallback lists, but those lists end at
 * the slash block: a whip-wielder mid-CAST (cols 4,15-18) would fall through to
 * col 10 and crack the whip in the middle of a spell. A carried whip during a
 * cast is simply true.
 */
const CRACK = WORN.swing;                     // [10,11,12,13,14] — the compositor's own slash
const CARRY_SRC = 0;

/** stem → how many colour variants the kit ships (base + _c2 …). */
const STEMS = { whip: 2, thornwhip: 2, ballchain: 3, chainblade: 3 };

fs.mkdirSync(OUT, { recursive: true });
let wrote = 0;

for (const [stem, variants] of Object.entries(STEMS)) {
  for (let c = 1; c <= variants; c++) {
    const name = stem + (c > 1 ? `_c${c}` : '');
    const src = readPng(path.join(SRC, name + '.png'));
    const cell = src.w / SRC_COLS;
    if (src.w !== SRC_COLS * cell || src.h !== SRC_ROWS * cell || cell !== Math.round(cell)) {
      throw new Error(`${name}: ${src.w}×${src.h} is not ${SRC_COLS}×${SRC_ROWS} square cells`);
    }
    const out = blankPng(ELEMENTS_COLS * cell, ELEMENTS_ROWS * cell);
    for (let row = 0; row < ELEMENTS_ROWS; row++) {
      for (let col = 0; col < ELEMENTS_COLS; col++) {
        const i = CRACK.indexOf(col);
        const srcCol = i < 0 ? CARRY_SRC : i;
        blitPng(out, src, srcCol * cell, row * cell, cell, cell, col * cell, row * cell);
      }
    }
    // The two cells the rules and the viewmodel actually stand on. If either is
    // blank the whip is invisible where it matters most, and nothing downstream
    // would say so — check-item-art passes a cell that paints ANY pixel.
    for (const [label, col] of [['carry', 1], ['rest', WORN.rest]]) {
      let n = 0;
      for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) {
        if (out.px[((2 * cell + y) * out.w + col * cell + x) * 4 + 3]) n++;
      }
      if (!n) throw new Error(`${name}: ${label} cell (row 2, col ${col}) is blank`);
    }
    fs.writeFileSync(path.join(OUT, name + '.png'), encodePng(out.w, out.h, out.px));
    wrote++;
    console.log(`  ${name.padEnd(15)} ${src.w}×${src.h} → ${out.w}×${out.h}  (cell ${cell}px)`);
  }
}
console.log(`\nbake-whips: ${wrote} sheets → public/assets/sprites/core/weapon/`);
console.log(`  cols ${CRACK.join(',')} ← source cols 0-4 (the crack); every other column ← source col 0 (carried)`);
