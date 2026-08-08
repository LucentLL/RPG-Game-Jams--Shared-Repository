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
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { RECIPES } from '../src/guild/smithing.js';
import { itemSprite, hasItemSprite } from '../src/guild/art.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(HERE, '..', 'public');
const CELL = 48, COLS = 23, ROWS = 4;

/** Alpha plane of a PNG — enough to answer "does this cell paint anything?". */
function alphaOf(file) {
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
  const a = new Uint8Array(w * h);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride));
    for (let i = 0; i < stride; i++) {
      const l = i >= ch ? line[i - ch] : 0, u = prev[i], ul = i >= ch ? prev[i - ch] : 0;
      if (ft === 1) line[i] = (line[i] + l) & 255;
      else if (ft === 2) line[i] = (line[i] + u) & 255;
      else if (ft === 3) line[i] = (line[i] + ((l + u) >> 1)) & 255;
      else if (ft === 4) {
        const pp = l + u - ul, pa = Math.abs(pp - l), pb = Math.abs(pp - u), pc = Math.abs(pp - ul);
        line[i] = (line[i] + (pa <= pb && pa <= pc ? l : pb <= pc ? u : ul)) & 255;
      }
    }
    for (let x = 0; x < w; x++) a[y * w + x] = ch === 4 ? line[x * ch + 3] : 255;
    prev = line;
  }
  return { w, h, a };
}

/** Full RGBA, for the optional contact sheet. */
function rgbaOf(file) {
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
  const ch = ct === 6 ? 4 : 3, stride = w * ch;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride));
    for (let i = 0; i < stride; i++) {
      const l = i >= ch ? line[i - ch] : 0, u = prev[i], ul = i >= ch ? prev[i - ch] : 0;
      if (ft === 1) line[i] = (line[i] + l) & 255;
      else if (ft === 2) line[i] = (line[i] + u) & 255;
      else if (ft === 3) line[i] = (line[i] + ((l + u) >> 1)) & 255;
      else if (ft === 4) {
        const pp = l + u - ul, pa = Math.abs(pp - l), pb = Math.abs(pp - u), pc = Math.abs(pp - ul);
        line[i] = (line[i] + (pa <= pb && pa <= pc ? l : pb <= pc ? u : ul)) & 255;
      }
    }
    for (let x = 0; x < w; x++) {
      px[(y * w + x) * 4] = line[x * ch];
      px[(y * w + x) * 4 + 1] = line[x * ch + 1];
      px[(y * w + x) * 4 + 2] = line[x * ch + 2];
      px[(y * w + x) * 4 + 3] = ch === 4 ? line[x * ch + 3] : 255;
    }
    prev = line;
  }
  return { w, h, px };
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
  const { w, a } = alphaOf(res.file);
  let n = 0;
  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      const px = res.col * CELL + x, py = res.row * CELL + y;
      if (a[py * w + px] >= 12) n++;
    }
  }
  const rel = path.relative(PUBLIC, res.file).replace(/\\/g, '/');
  if (!n) problems.push(`${r.id}: BLANK cell r${res.row}c${res.col} of ${rel}`);
  else console.log(`  ok  ${r.id.padEnd(18)} ${String(n).padStart(3)}px  r${res.row}c${res.col}  ${rel}`);
}

// `--sheet <out.png>` also draws every icon as one contact sheet, because a
// cell that paints SOMETHING still isn't proof it paints the right thing.
const sheetAt = process.argv.indexOf('--sheet');
if (sheetAt > 0 && process.argv[sheetAt + 1] && !problems.length) {
  const Z = 3, PAD = 2, COLS_OUT = 8;
  const cells = [...seen].map((k) => { const [kind, material] = k.split('/'); return { kind, material, ...resolve(kind, material) }; });
  const rows = Math.ceil(cells.length / COLS_OUT);
  const CW = CELL * Z + PAD, OW = COLS_OUT * CW + PAD, OH = rows * CW + PAD;
  const out = Buffer.alloc(OW * OH * 4);
  for (let i = 0; i < OW * OH; i++) { out[i * 4] = 20; out[i * 4 + 1] = 21; out[i * 4 + 2] = 30; out[i * 4 + 3] = 255; }
  cells.forEach((c, n) => {
    const im = rgbaOf(c.file);
    const ox = PAD + (n % COLS_OUT) * CW, oy = PAD + ((n / COLS_OUT) | 0) * CW;
    for (let y = 0; y < CELL * Z; y++) for (let x = 0; x < CELL * Z; x++) {
      const sx = c.col * CELL + ((x / Z) | 0), sy = c.row * CELL + ((y / Z) | 0);
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
