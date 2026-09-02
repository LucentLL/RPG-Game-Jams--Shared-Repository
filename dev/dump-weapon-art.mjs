/**
 * EVERY WEAPON SHEET THE KITS SHIP, COUNTED — the fixture WeaponArt is pinned
 * against, and a contact sheet of the whole vocabulary.
 *
 * WHY THIS EXISTS (owner, 2026-09-01, twice). First: "you added Bow ... but
 * didn't check for other weapons and add them. I.E. crossbow is in the same
 * folder." Then, after the fix: "The weapon audit did not find all weapons
 * and/or variants. For example, only three whips are used and I found many
 * more in the same folder."
 *
 * Both reports are the same fault — a HAND-WRITTEN table of what art exists.
 * A person reads a folder once, types what they saw, and every file added
 * afterwards is invisible forever. The answer is not to type it more carefully;
 * it is to stop typing it. This script reads the folders and writes what is
 * there, WeaponArtTests replays it against the C# table, and a sheet nobody
 * wired up fails a test with its own name in the message.
 *
 * A stem is one weapon SHAPE; `_cN` files are that shape's colourways. Two
 * stems that differ only by a trailing L/R are ONE shape drawn for each hand
 * (dagger, shield1, shield2) — the kit's own convention, and the only reason
 * the port ever needed a `slotSuffix` flag.
 *
 *     node dev/dump-weapon-art.mjs          fixture + contact sheet
 *     node dev/dump-weapon-art.mjs --no-png fixture only
 */
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readPng, encodePng, blankPng, blitPng } from './png.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SPRITES = join(ROOT, 'public', 'assets', 'sprites');
const PACKS = ['core', 'ce1', 'ce2'];

// ── Read the folders ────────────────────────────────────────────────────────

/** stem → { pack, colors:Set, hands:Set, w, h } */
const found = new Map();
let fileCount = 0;

for (const pack of PACKS) {
  const dir = join(SPRITES, pack, 'weapon');
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith('.png')) continue;
    fileCount++;
    const base = file.slice(0, -4);
    const m = /^(.*?)(?:_c(\d+))?$/.exec(base);
    let stem = m[1];
    const c = m[2] === undefined ? 0 : Number(m[2]);

    // A trailing L/R is a HAND, not a shape — but only when its twin is there
    // too, or `bow1arrow1` would lose its 1 and daggers.png (a figure holding
    // two) would be mistaken for one of the pair.
    let hand = '';
    const lr = /^(.*)([LR])$/.exec(stem);
    if (lr && hasBoth(pack, lr[1])) { stem = lr[1]; hand = lr[2]; }

    const { width, height } = pngSize(join(dir, file));
    const rec = found.get(stem) ?? { pack, colors: new Set(), hands: new Set(), w: width, h: height };
    rec.colors.add(c);
    if (hand) rec.hands.add(hand);
    if (rec.w !== width || rec.h !== height)
      throw new Error(`${stem}: ${file} is ${width}x${height}, its siblings are ${rec.w}x${rec.h}`);
    found.set(stem, rec);
  }
}

/** Do both `<base>L.png` and `<base>R.png` sit in this pack's weapon folder? */
function hasBoth(pack, base) {
  const dir = join(SPRITES, pack, 'weapon');
  const names = new Set(readdirSync(dir));
  return names.has(base + 'L.png') && names.has(base + 'R.png');
}

/** Width and height straight off the IHDR — no decode, this runs over 147 files. */
function pngSize(path) {
  const { w, h } = readPng(path);
  return { width: w, height: h };
}

// ── The fixture ─────────────────────────────────────────────────────────────

const COLS = 23, ROWS = 4;   // every Elements sheet, and the re-cut whips

const shapes = [...found.entries()]
  .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  .map(([stem, r]) => {
    if (r.w % COLS !== 0 || r.h !== (r.w / COLS) * ROWS)
      throw new Error(`${stem}: ${r.w}x${r.h} is not a ${COLS}x${ROWS} sheet`);
    return {
      stem,
      pack: r.pack,
      cell: r.w / COLS,
      handed: r.hands.size === 2,
      colors: [...r.colors].sort((a, b) => a - b),
    };
  });

const fixture = {
  packs: PACKS,
  cols: COLS, rows: ROWS,
  files: fileCount,
  shapes,
};

const out = join(ROOT, '..', '..', '..', '..', 'Guild Rancher',
                 'Assets', 'Tests', 'EditMode', 'weapon-art-fixture.json');
writeFileSync(out, JSON.stringify(fixture, null, 1));
const variants = shapes.reduce((n, s) => n + s.colors.length * (s.handed ? 2 : 1), 0);
console.log(`fixture → ${out}`);
console.log(`  ${fileCount} files · ${shapes.length} shapes · ${variants} shape+colourway+hand combinations`);

// ── The contact sheet ───────────────────────────────────────────────────────
//
// COLUMN 1, ROW 2 — the east STAND cell, which is art.js's own choice for an
// armory card and for the same reason: column 11 is the middle of the slash and
// paints the swing's arc into the frame, so every weapon photographs as a
// swoosh. The whips are 112px and everything else 48; each row is drawn at its
// own cell size and left-aligned, so a lash is not squeezed to match a dagger.

if (!process.argv.includes('--no-png')) {
  const LAID_COL = 1, LAID_ROW = 2, PAD = 4;
  const rowH = Math.max(...shapes.map((s) => s.cell)) + PAD;
  const widest = Math.max(...shapes.map((s) => s.cell * s.colors.length + PAD * s.colors.length));
  const sheetW = widest + PAD;
  const sheetH = shapes.length * rowH + PAD;
  const dst = { w: sheetW, h: sheetH, px: blankPng(sheetW, sheetH, [24, 22, 28, 255]).px };

  shapes.forEach((s, i) => {
    let x = PAD;
    const y = PAD + i * rowH;
    for (const c of s.colors) {
      const name = s.stem + (s.handed ? 'R' : '') + (c ? `_c${c}` : '');
      const src = readPng(join(SPRITES, s.pack, 'weapon', name + '.png'));
      blitPng(dst, src, LAID_COL * s.cell, LAID_ROW * s.cell, s.cell, s.cell, x, y);
      x += s.cell + PAD;
    }
  });

  mkdirSync(join(ROOT, 'dev', 'out'), { recursive: true });
  const png = join(ROOT, 'dev', 'out', 'weapon-art.png');
  writeFileSync(png, encodePng(dst.w, dst.h, dst.px));
  console.log(`contact sheet → ${png}  (${sheetW}x${sheetH}, one row per shape)`);
}
