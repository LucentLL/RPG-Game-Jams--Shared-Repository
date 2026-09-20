/**
 * THE WORLD AS A PICTURE — a flat biome plate of the generated chart, written
 * straight to a PNG so the map can be judged without launching the game.
 *
 *     node --import ./dev/register-vite-env.mjs dev/dump-world-png.mjs [seed...]
 *
 * This is NOT the game's map. The game bakes the same chart with the FBB
 * worldmap tiles and drapes it over an orthographic oval (globe.js) or a
 * sphere; this is one flat colour per biome with the circuit stamped on top.
 * A schematic is the right tool for the question it answers — "did the
 * generator grow a world, and are the halls standing in the right country" —
 * and the wrong one for "does it look good", which only the real bake can say.
 *
 * Node ships zlib, so the PNG is written here rather than pulled in as a
 * dependency: an 8-bit RGB image is a header, one deflate stream of unfiltered
 * scanlines, and three CRCs.
 */
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';
import { generateWorld, placeSeats, placeNear, landFraction, WORLD_SEED } from '../src/guild/world-gen.js';
import { SEATS, TOWNS, DUNGEON_CELLS } from '../src/guild/world-guilds.js';

const CELL = 12;                       // px per chart cell
const COLOR = {
  '~': [40, 74, 122], i: [223, 233, 242], t: [63, 95, 74], g: [106, 168, 79],
  f: [56, 112, 47], h: [138, 122, 74], m: [142, 142, 142], d: [214, 191, 122],
};
const HALL = [176, 42, 42], HOME = [232, 196, 72], TOWN = [245, 245, 245], DELVE = [186, 84, 196];

// ── A very small PNG writer ─────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(width, height, rgb) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;                                   // filter: none
    rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;  // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Paint one world ─────────────────────────────────────────────────────────
function plate(world, seats, towns, delves, homeId) {
  const W = world.cols * CELL, H = world.rows * CELL;
  const buf = Buffer.alloc(W * H * 3);
  const put = (px, py, c) => {
    if (px < 0 || py < 0 || px >= W || py >= H) return;
    const o = (py * W + px) * 3;
    buf[o] = c[0]; buf[o + 1] = c[1]; buf[o + 2] = c[2];
  };
  const box = (cx, cy, inset, c) => {
    for (let y = inset; y < CELL - inset; y++) {
      for (let x = inset; x < CELL - inset; x++) put(cx * CELL + x, cy * CELL + y, c);
    }
  };

  for (let cy = 0; cy < world.rows; cy++) {
    for (let cx = 0; cx < world.cols; cx++) {
      const c = COLOR[world.at(cx, cy)] || [255, 0, 255];
      // A one-px darker edge per cell reads as the chart's own grain and makes
      // a coastline countable by eye.
      for (let y = 0; y < CELL; y++) {
        for (let x = 0; x < CELL; x++) {
          const edge = x === 0 || y === 0;
          put(cx * CELL + x, cy * CELL + y,
              edge ? [Math.round(c[0] * 0.88), Math.round(c[1] * 0.88), Math.round(c[2] * 0.88)] : c);
        }
      }
    }
  }
  for (const [id, [cx, cy]] of delves) box(cx, cy, 4, DELVE);
  for (const [, [cx, cy]] of towns) box(cx, cy, 4, TOWN);
  for (const [id, [cx, cy]] of seats) {
    box(cx, cy, 2, id === homeId ? HOME : HALL);
    box(cx, cy, 5, [20, 16, 12]);
  }
  return { buf, W, H };
}

const seeds = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number);
if (!seeds.length) seeds.push(WORLD_SEED);

for (const seed of seeds) {
  const world = generateWorld(seed);
  const specs = SEATS.map((s) => ({ id: s.id, realm: s.realm }));
  const tspecs = TOWNS.map((t) => ({ id: t.id, realm: t.realm }));
  const seats = placeSeats(world, specs);
  // The same three passes, in the same order, that world-guilds.js runs — a
  // preview seated differently is a preview of a world nobody plays.
  const towns = placeSeats(world, tspecs, { minGap: 1.6, taken: [...seats.values()] });
  const delves = placeNear(world, seats.get('home'), Object.keys(DUNGEON_CELLS),
                           [...seats.values(), ...towns.values()]);
  const { buf, W, H } = plate(world, seats, towns, delves, 'home');
  // Written where the caller stands; keep generated plates out of the repo.
  const name = process.env.WORLD_PNG_DIR ? join(process.env.WORLD_PNG_DIR, `world-${seed}.png`) : `world-${seed}.png`;
  writeFileSync(name, png(W, H, buf));
  console.log(`${name}  ${W}x${H}  land ${(landFraction(world) * 100).toFixed(1)}%  ` +
              `home ${seats.get('home').join(',')}`);
}
