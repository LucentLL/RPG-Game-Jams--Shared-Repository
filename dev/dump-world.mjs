/**
 * THE WORLD, WITNESSED — a fixture for the Unity port to be pinned against.
 *
 *     node --import ./dev/register-vite-env.mjs dev/dump-world.mjs
 *
 * The port (WorldGen.cs) agrees with this file about the ALGORITHM by
 * construction — it was transcribed from it. What no amount of transcription
 * proves is that it agrees about the NUMBERS, and a world generator is exactly
 * the kind of code where a single last-bit difference is not a rounding error
 * but a different coastline, a hall on the wrong island, and a venue in the
 * sea. So the numbers node actually printed are written down and the C# test
 * replays them (@see reference js-number-traps, which is this lesson).
 *
 * WHAT IS PINNED, from the inside out:
 *   • RAW FIELDS at sampled cells — height, temp and moisture BEFORE they are
 *     rounded into a letter. This is the layer that catches drift while it is
 *     still sub-pixel: two builds can agree on every letter and still disagree
 *     about a height by 1e-12, and the day a threshold moves that becomes a
 *     visible difference. Pinning the letters alone would hide it until then.
 *   • THE WHOLE CHART — all 32 rows, because it is small and it is the thing
 *     the player looks at.
 *   • THE SEATING — every hall, town and delve cell, which is the placement
 *     pass (a different algorithm from the generator, with its own tie-breaks).
 *   • A SECOND SEED, because a fixture of one seed pins a world; two pin a
 *     generator.
 */
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateWorld, placeSeats, placeNear, landFraction, WORLD_SEED } from '../src/guild/world-gen.js';
import { SEATS, TOWNS, DUNGEON_CELLS } from '../src/guild/world-guilds.js';

const ROOT = dirname(fileURLToPath(import.meta.url));

// The seating orders are the ROSTER orders, and placement is greedy — order is
// its tie-break, so the fixture records them explicitly rather than letting the
// port read them off a differently-sorted table.
const SEAT_ORDER = SEATS.map((s) => ({ id: s.id, realm: s.realm }));
const TOWN_ORDER = TOWNS.map((t) => ({ id: t.id, realm: t.realm }));
const DELVE_ORDER = ['ferncreek', 'thornwood', 'mistfen', 'blackpine', 'hollowvein'];

/** Cells sampled for raw fields — a spread over ocean, coast, every realm and
 *  both caps, so a drift anywhere shows up in at least one of them. */
const SAMPLES = [
  [0, 0], [32, 0], [63, 31], [0, 16], [32, 16], [7, 8], [13, 12], [19, 15],
  [41, 8], [35, 6], [47, 11], [41, 20], [36, 18], [46, 23], [10, 22], [4, 20],
  [16, 25], [55, 14], [24, 3], [60, 28],
];

function worldFixture(seed) {
  const w = generateWorld(seed);
  const seats = placeSeats(w, SEAT_ORDER);
  const towns = placeSeats(w, TOWN_ORDER, { minGap: 1.6, taken: [...seats.values()] });
  const delves = placeNear(w, seats.get('home'), DELVE_ORDER, [...seats.values(), ...towns.values()]);
  const cells = SAMPLES.map(([cx, cy]) => {
    const i = cy * w.cols + cx;
    return { cx, cy, h: w.height[i], t: w.temp[i], m: w.moist[i], b: w.at(cx, cy), r: w.realmField[i] };
  });
  return {
    seed, cols: w.cols, rows: w.rows,
    chart: w.chart,
    land: landFraction(w),
    cells,
    seats: Object.fromEntries([...seats].map(([id, c]) => [id, c])),
    towns: Object.fromEntries([...towns].map(([id, c]) => [id, c])),
    delves: Object.fromEntries([...delves].map(([id, c]) => [id, c])),
  };
}

const fixture = {
  seatOrder: SEAT_ORDER, townOrder: TOWN_ORDER, delveOrder: DELVE_ORDER,
  shipped: worldFixture(WORLD_SEED),
  // A second, arbitrary seed: the shipped world could pass by coincidence if
  // the port hard-coded it; a second one cannot.
  other: worldFixture(WORLD_SEED + 7919),
};

// ROOT is dev/, so five levels up is the user directory the Unity fork sits in
// beside OneDrive — one deeper than dump-gear.mjs, which computes from the
// repo root.
const out = join(ROOT, '..', '..', '..', '..', '..', 'Guild Rancher',
                 'Assets', 'Tests', 'EditMode', 'world-fixture.json');
writeFileSync(out, JSON.stringify(fixture, null, 1));
console.log(`fixture → ${out}`);
console.log(`2 worlds, ${fixture.shipped.chart.length} rows each, ${SAMPLES.length} sampled cells,`
  + ` ${Object.keys(fixture.shipped.seats).length} halls + ${Object.keys(fixture.shipped.towns).length} towns`
  + ` + ${Object.keys(fixture.shipped.delves).length} delves seated`);
console.log(`shipped land ${(fixture.shipped.land * 100).toFixed(2)}%,`
  + ` home at ${fixture.shipped.seats.home.join(',')}`);
