/**
 * Bake the first-person viewmodel's composited hands to a real tilesheet.
 *
 * The runtime composites these at mount (src/game/fp-hands.js): the arm is cut
 * from the member's BODY sheet, masked to the forearm, and drawn under the
 * weapon from the matching cell of the matching frame. That happens in a canvas
 * nobody can open, so this writes the same pixels out as a 48px-cell sheet you
 * can look at, hand-edit, or diff after a change to the rule.
 *
 * It imports WORN from art.js rather than restating the numbers, so the reach,
 * the row and the frame lists here are the ones the game actually plays.
 *
 *   node --import ./dev/register-vite-env.mjs dev/bake-fp-hands.mjs [out.png]
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { WORN } from '../src/guild/art.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SPRITES = path.join(HERE, '..', 'public', 'assets', 'sprites');
const CELL = WORN.cell, ROW = WORN.row, REACH = WORN.armReach;

// ── PNG (8-bit, no deps) ───────────────────────────────────────────────────
function decodePng(file) {
  const b = fs.readFileSync(file);
  let p = 8, w = 0, h = 0, bd = 0, ct = 0; const idat = [];
  while (p < b.length) {
    const len = b.readUInt32BE(p), type = b.toString('ascii', p + 4, p + 8);
    const data = b.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bd = data[8]; ct = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (bd !== 8 || (ct !== 6 && ct !== 2)) throw new Error(`${file}: bitDepth=${bd} colorType=${ct}`);
  const ch = ct === 6 ? 4 : 3, stride = w * ch;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride));
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? line[i - ch] : 0, bb = prev[i], c = i >= ch ? prev[i - ch] : 0;
      if (ft === 1) line[i] = (line[i] + a) & 255;
      else if (ft === 2) line[i] = (line[i] + bb) & 255;
      else if (ft === 3) line[i] = (line[i] + ((a + bb) >> 1)) & 255;
      else if (ft === 4) {
        const pp = a + bb - c, pa = Math.abs(pp - a), pb = Math.abs(pp - bb), pc = Math.abs(pp - c);
        line[i] = (line[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? bb : c)) & 255;
      }
    }
    for (let x = 0; x < w; x++) {
      out[(y * w + x) * 4] = line[x * ch];
      out[(y * w + x) * 4 + 1] = line[x * ch + 1];
      out[(y * w + x) * 4 + 2] = line[x * ch + 2];
      out[(y * w + x) * 4 + 3] = ch === 4 ? line[x * ch + 3] : 255;
    }
    prev = line;
  }
  return { w, h, px: out };
}
const CRC = (() => {
  const t = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return (buf) => { let c = 0xffffffff; for (const v of buf) c = t[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
})();
function encodePng(w, h, px) {
  const stride = w * 4, raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (stride + 1)] = 0; px.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride); }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const cc = Buffer.alloc(4); cc.writeUInt32BE(CRC(td));
    return Buffer.concat([len, td, cc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ── The rule, same as fp-hands.js ──────────────────────────────────────────
const cache = new Map();
const load = (rel) => {
  if (!cache.has(rel)) cache.set(rel, decodePng(path.join(SPRITES, rel)));
  return cache.get(rel);
};
const cellMask = (im, col) => {
  const m = new Uint8Array(CELL * CELL);
  for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++)
    m[y * CELL + x] = im.px[((ROW * CELL + y) * im.w + col * CELL + x) * 4 + 3] >= 12 ? 1 : 0;
  return m;
};
/** Body pixels within REACH steps THROUGH THE BODY of one touching the weapon. */
function armMask(body, weapon) {
  const dist = new Int16Array(CELL * CELL).fill(-1), q = [];
  for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
    if (!body[y * CELL + x]) continue;
    let touching = false;
    for (let dy = -1; dy <= 1 && !touching; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < CELL && ny < CELL && weapon[ny * CELL + nx]) { touching = true; break; }
    }
    if (touching) { dist[y * CELL + x] = 0; q.push(y * CELL + x); }
  }
  for (let h = 0; h < q.length; h++) {
    const p = q[h], x = p % CELL, y = (p / CELL) | 0;
    if (dist[p] >= REACH) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= CELL || ny >= CELL) continue;
      const np = ny * CELL + nx;
      if (!body[np] || dist[np] >= 0) continue;
      dist[np] = dist[p] + 1; q.push(np);
    }
  }
  return dist;
}

const SW = [WORN.rest].concat(WORN.swing);
// Every viewmodel sheet the kit carries, against a spread of body tops.
const WEAPONS = [
  ['sword', 'core/weapon/sword1.png', SW],
  ['dagger', 'ce2/weapon/daggerR.png', SW],
  ['axe', 'ce1/weapon/axe1.png', SW],
  ['mace', 'core/weapon/mace1.png', SW],
  ['hammer', 'ce2/weapon/hammer.png', SW],
  ['staff', 'core/weapon/staff1.png', SW],
  ['wand', 'ce1/weapon/wand1.png', SW],
  ['pick', 'core/weapon/pickaxe1.png', SW],
  ['shield', 'core/weapon/shield1L.png', WORN.shieldBrace],
  ['bow', 'core/weapon/bow1.png', WORN.bowDraw],
];
const TOPS = [
  ['bare', 'core/top/top0.png'],
  ['shirt', 'core/top/top1.png'],
  ['plate', 'core/top/top10.png'],
];

const rows = [];
for (const [tName, tRel] of TOPS) {
  for (const [wName, wRel, frames] of WEAPONS) {
    let wpn, top;
    try { wpn = load(wRel); top = load(tRel); }
    catch (e) { console.warn(`  skip ${wName}/${tName}: ${e.message}`); continue; }
    rows.push({ label: `${wName}·${tName}`, wpn, top, frames });
  }
}

const COLS = Math.max(...rows.map((r) => r.frames.length));
const OW = COLS * CELL, OH = rows.length * CELL;
const out = Buffer.alloc(OW * OH * 4);            // fully transparent

rows.forEach((r, ri) => {
  r.frames.forEach((col, ci) => {
    const wm = cellMask(r.wpn, col);
    const dist = armMask(cellMask(r.top, col), wm);
    for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
      const d = ((ri * CELL + y) * OW + ci * CELL + x) * 4;
      if (dist[y * CELL + x] >= 0) {              // arm under
        const s = ((ROW * CELL + y) * r.top.w + col * CELL + x) * 4;
        out[d] = r.top.px[s]; out[d + 1] = r.top.px[s + 1]; out[d + 2] = r.top.px[s + 2]; out[d + 3] = r.top.px[s + 3];
      }
      if (wm[y * CELL + x]) {                     // weapon over
        const s = ((ROW * CELL + y) * r.wpn.w + col * CELL + x) * 4;
        out[d] = r.wpn.px[s]; out[d + 1] = r.wpn.px[s + 1]; out[d + 2] = r.wpn.px[s + 2]; out[d + 3] = r.wpn.px[s + 3];
      }
    }
  });
});

const dest = process.argv[2] || path.join(HERE, 'out', 'fp-hands-tilesheet.png');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, encodePng(OW, OH, out));

console.log(`fp-hands tilesheet — ${CELL}px cells, reach ${REACH}, sheet row ${ROW} (north)`);
console.log(`${OW}×${OH}  (${COLS} frame columns × ${rows.length} rows)\n`);
rows.forEach((r, i) => {
  console.log(`  row ${String(i).padStart(2)}  ${r.label.padEnd(14)} frames ${r.frames.join(',')}`);
});
console.log(`\nwrote ${dest}`);
