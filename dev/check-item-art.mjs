/**
 * Every forgeable item must have a picture.
 *
 * `itemSprite` resolves a kind + material to a sheet, a folder, a colour variant
 * and one 48px cell, and NONE of that is checked at runtime: a wrong pack points
 * at a file that 404s, and a wrong cell points at empty pixels. Both fail the
 * same silent way — a blank square on the armory card that nobody reports.
 *
 * Both had actually happened when this was written. The Hunter's Bow had shown
 * a blank icon for its whole life (bow sheets paint only in the nock/draw block
 * — cols 15-18 — and the laid-item cell is empty on every row, the same trap
 * shields fall into), and the two mithril armour pieces pointed at core/ for
 * stems that live in ce1/.
 *
 *   node --import ./dev/register-vite-env.mjs dev/check-item-art.mjs
 *
 * Exits non-zero on the first kind that cannot be drawn.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RECIPES } from '../src/guild/smithing.js';
import { itemSprite, hasItemSprite } from '../src/guild/art.js';
import { readPng, encodePng } from './png.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(HERE, '..', 'public');
// COLS/ROWS are the layout every sheet shares. THE CELL IS NOT A CONSTANT: a
// whip sheet is cut at 112px because its lash does not fit 48 (dev/bake-whips
// .mjs), so it is measured off each file — sheet width ÷ COLS, the same
// division the renderer does (data/config.js weaponCellOf).
//
// This was `const CELL = 48` and it made the check LIE. On a 2576px whip sheet
// it sampled a 48px box at column×48, which lands a third of the way into
// column 0 of a 112px grid, and reported `ok` for a garbage slice that happened
// to contain pixels — certifying exactly the bug this file exists to catch.
const COLS = 23, ROWS = 4;
const cellOf = (im) => im.w / COLS;

/** Pull the sheet URL and the cell back out of the CSS itemSprite emits, so the
 *  test reads exactly what the game will paint rather than a parallel guess. */
function resolve(kind, material) {
  const html = itemSprite({ kind, material });
  const url = (html.match(/url\(([^)]+)\)/) || [])[1];
  const pos = html.match(/background-position:([\d.]+)% ([\d.]+)%/);
  if (!url || !pos) return null;
  return {
    file: path.join(PUBLIC, url.replace(/^.*?assets\//, 'assets/')),
    col: Math.round(parseFloat(pos[1]) / 100 * (COLS - 1)),
    row: Math.round(parseFloat(pos[2]) / 100 * (ROWS - 1)),
  };
}

const problems = [];
const seen = new Set();
for (const r of RECIPES) {
  const key = r.kind + '/' + r.material;
  if (seen.has(key)) continue;
  seen.add(key);
  if (!hasItemSprite({ kind: r.kind })) { problems.push(`${r.id}: kind '${r.kind}' has no sprite entry`); continue; }
  const res = resolve(r.kind, r.material);
  if (!res) { problems.push(`${r.id}: itemSprite emitted no url/position`); continue; }
  if (!fs.existsSync(res.file)) {
    problems.push(`${r.id}: missing sheet ${path.relative(PUBLIC, res.file).replace(/\\/g, '/')}`);
    continue;
  }
  const im = readPng(res.file);
  const CELL = cellOf(im);
  const rel = path.relative(PUBLIC, res.file).replace(/\\/g, '/');
  if (CELL !== Math.round(CELL) || im.h !== CELL * ROWS) {
    problems.push(`${r.id}: ${rel} is ${im.w}×${im.h} — not ${COLS}×${ROWS} square cells`);
    continue;
  }
  let n = 0;
  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      const px = res.col * CELL + x, py = res.row * CELL + y;
      if (im.px[(py * im.w + px) * 4 + 3] >= 12) n++;
    }
  }
  if (!n) problems.push(`${r.id}: BLANK cell r${res.row}c${res.col} of ${rel}`);
  else console.log(`  ok  ${r.id.padEnd(18)} ${String(n).padStart(4)}px  ${String(CELL).padStart(3)}px cell  r${res.row}c${res.col}  ${rel}`);
}

// `--sheet <out.png>` also draws every icon as one contact sheet, because a
// cell that paints SOMETHING still isn't proof it paints the right thing.
const sheetAt = process.argv.indexOf('--sheet');
if (sheetAt > 0 && process.argv[sheetAt + 1] && !problems.length) {
  // BOX, not zoom. Cells are no longer one size, so each is fitted into the
  // same square — a 112px whip cell lands beside a 48px sword cell at the
  // proportion the game draws them, which is the comparison worth looking at.
  const BOX = 144, PAD = 2, COLS_OUT = 8;
  const cells = [...seen].map((k) => { const [kind, material] = k.split('/'); return { kind, material, ...resolve(kind, material) }; });
  const rows = Math.ceil(cells.length / COLS_OUT);
  const CW = BOX + PAD, OW = COLS_OUT * CW + PAD, OH = rows * CW + PAD;
  const out = Buffer.alloc(OW * OH * 4);
  for (let i = 0; i < OW * OH; i++) { out[i * 4] = 20; out[i * 4 + 1] = 21; out[i * 4 + 2] = 30; out[i * 4 + 3] = 255; }
  cells.forEach((c, n) => {
    const im = readPng(c.file);
    const CELL = cellOf(im);
    const ox = PAD + (n % COLS_OUT) * CW, oy = PAD + ((n / COLS_OUT) | 0) * CW;
    for (let y = 0; y < BOX; y++) for (let x = 0; x < BOX; x++) {
      const sx = c.col * CELL + ((x * CELL / BOX) | 0), sy = c.row * CELL + ((y * CELL / BOX) | 0);
      const s = (sy * im.w + sx) * 4;
      if (im.px[s + 3] < 12) continue;
      const o = ((oy + y) * OW + ox + x) * 4;
      out[o] = im.px[s]; out[o + 1] = im.px[s + 1]; out[o + 2] = im.px[s + 2];
    }
  });
  fs.mkdirSync(path.dirname(process.argv[sheetAt + 1]), { recursive: true });
  fs.writeFileSync(process.argv[sheetAt + 1], encodePng(OW, OH, out));
  console.log(`contact sheet → ${process.argv[sheetAt + 1]} (${OW}×${OH})`);
  console.log('order: ' + cells.map((c) => c.kind + '/' + c.material[0]).join(' '));
}

console.log();
if (problems.length) {
  console.error(`check-item-art: ${problems.length} forgeable item(s) cannot be drawn\n`);
  for (const p of problems) console.error('  ✗ ' + p);
  process.exit(1);
}
console.log(`check-item-art: all ${seen.size} kind/material pairs across ${RECIPES.length} recipes draw real pixels.`);
