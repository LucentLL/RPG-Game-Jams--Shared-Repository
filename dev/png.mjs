/**
 * @file PNG in and PNG out, for the dev scripts.
 *
 * Three copies of this had already accumulated inside check-item-art.mjs alone
 * (`alphaOf`, `rgbaOf`, and the encoder), two of them the same filter loop with
 * a different last line. The bake scripts need the identical pair, so it lives
 * here once: a decoder that hands back straight RGBA, and an encoder that takes
 * it back. Node ships the only hard part — zlib — so this stays small enough to
 * read in one sitting, which is the point. No dependency, no build step, and
 * the art pipeline keeps working on a bare `node`.
 *
 * DELIBERATELY NARROW. 8-bit, non-interlaced, colour type 2 (RGB) or 6 (RGBA) —
 * which is every sheet in this project and everything the Elements and Time
 * Fantasy kits ship. Anything else throws by name rather than decoding to
 * garbage, because a silently wrong alpha plane is how a blank armory card gets
 * certified as fine.
 */
import fs from 'node:fs';
import zlib from 'node:zlib';

/**
 * A PNG as RGBA. `px` is w×h×4 bytes, row-major, alpha 255 where the source had
 * no alpha channel. Takes a path or the bytes themselves — the roof bake reads
 * its sheets out of a zip and never puts them on disk.
 * @param {string|Buffer} src @returns {{w:number, h:number, px:Buffer}}
 */
export function readPng(src) {
  const file = Buffer.isBuffer(src) ? '<buffer>' : src;
  const b = Buffer.isBuffer(src) ? src : fs.readFileSync(src);
  let p = 8, w = 0, h = 0, bd = 0, ct = 0;
  const idat = [];
  while (p < b.length) {
    const len = b.readUInt32BE(p), type = b.toString('ascii', p + 4, p + 8);
    const data = b.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4); bd = data[8]; ct = data[9];
      if (data[12] !== 0) throw new Error(`${file}: interlaced`);
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (bd !== 8 || (ct !== 6 && ct !== 2)) throw new Error(`${file}: bitDepth=${bd} colorType=${ct}`);
  const ch = ct === 6 ? 4 : 3, stride = w * ch;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    // Each scanline names its own filter; undoing it needs the pixel to the
    // left (l), the one above (u) and the one up-left (ul), all POST-undo —
    // which is why `line` is copied and mutated in place.
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
      const o = (y * w + x) * 4;
      px[o] = line[x * ch]; px[o + 1] = line[x * ch + 1]; px[o + 2] = line[x * ch + 2];
      px[o + 3] = ch === 4 ? line[x * ch + 3] : 255;
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

/** RGBA back to a PNG buffer. Filter 0 throughout — pixel art of this size
 *  deflates small anyway, and an unfiltered file is one less thing to be wrong. */
export function encodePng(w, h, px) {
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

/** A blank RGBA canvas, optionally flooded with one colour. */
export function blankPng(w, h, rgba = [0, 0, 0, 0]) {
  const px = Buffer.alloc(w * h * 4);
  if (rgba[3]) for (let i = 0; i < w * h; i++) { px[i * 4] = rgba[0]; px[i * 4 + 1] = rgba[1]; px[i * 4 + 2] = rgba[2]; px[i * 4 + 3] = rgba[3]; }
  return { w, h, px };
}

/**
 * Copy a rectangle of `src` into `dst` at (dx,dy), skipping transparent source
 * pixels. A straight copy, never a resample: these scripts move authored cells
 * around, and a filtered pixel is a pixel the artist did not draw.
 */
export function blitPng(dst, src, sx, sy, sw, sh, dx, dy) {
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const px = dx + x, py = dy + y;
      if (px < 0 || py < 0 || px >= dst.w || py >= dst.h) continue;
      const s = ((sy + y) * src.w + (sx + x)) * 4;
      if (!src.px[s + 3]) continue;
      const o = (py * dst.w + px) * 4;
      dst.px[o] = src.px[s]; dst.px[o + 1] = src.px[s + 1]; dst.px[o + 2] = src.px[s + 2]; dst.px[o + 3] = src.px[s + 3];
    }
  }
}

/**
 * The PNGs inside a .zip, by name.
 *
 * The rooftop kit ships as `2021_rooftops_update_MVMZ.zip` and the repo vendors
 * it in that shape (rpg-assets/2021p_bundle). Unpacking seven 46KB sheets beside
 * it to read two tiles out of each would be 320KB of duplicate art in the tree,
 * so the bake reads the archive the library actually holds. Local file headers
 * only — enough for a flat, deflate-or-stored archive, which is what it is.
 * @returns {Map<string, Buffer>}
 */
export function zipEntries(file) {
  const b = fs.readFileSync(file), out = new Map();
  let p = 0;
  while (p < b.length - 4 && b.readUInt32BE(p) === 0x504b0304) {
    const flags = b.readUInt16LE(p + 6), method = b.readUInt16LE(p + 8);
    const csize = b.readUInt32LE(p + 18);
    // Bit 3 means the sizes live in a trailing data descriptor and the header's
    // are zero — the walk below would step to the wrong place and silently
    // return nothing. Say so instead.
    if (flags & 8) throw new Error(`${file}: streamed entry '${b.toString('utf8', p + 30, p + 30 + b.readUInt16LE(p + 26))}' (data descriptor) — unzip it first`);
    const nlen = b.readUInt16LE(p + 26), elen = b.readUInt16LE(p + 28);
    const name = b.toString('utf8', p + 30, p + 30 + nlen);
    const body = b.subarray(p + 30 + nlen + elen, p + 30 + nlen + elen + csize);
    if (method === 0 || method === 8) out.set(name, method ? zlib.inflateRawSync(body) : Buffer.from(body));
    p += 30 + nlen + elen + csize;
  }
  return out;
}
