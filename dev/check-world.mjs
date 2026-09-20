/**
 * THE WORLD, MEASURED — and drawn, because a generated map is the one kind of
 * output whose bugs are obvious to an eye and invisible to an assertion.
 *
 *     node --import ./dev/register-vite-env.mjs dev/check-world.mjs
 *     node --import ./dev/register-vite-env.mjs dev/check-world.mjs --sweep
 *
 * It prints the shipped world as ASCII with every hall on it, then checks the
 * claims the fiction makes (world-gen.js DOMAINS quotes them):
 *
 *   • every hall, town and charted delve stands on dry land — the same law the
 *     module-scope validator enforces, checked here first so a bad seed fails
 *     in a script rather than by taking the whole bundle down at import;
 *   • the world is mostly sea but not a puddle;
 *   • each realm wears the climate its blurb promises — Norvale cold, Ashvara
 *     dry, Meridia broken into isles, Veyra green;
 *   • the halls are spread, not stacked;
 *   • and it is DETERMINISTIC: the same seed twice is the same world, which is
 *     what the Unity mirror will be pinned against.
 *
 * `--sweep` runs the same checks over many seeds. That is the difference
 * between a generator and a lucky draw: the shipped seed passing proves nothing
 * about the algorithm, and the day someone wants a "new world" button the sweep
 * is the evidence it will not strand a hall in the sea.
 */
import { generateWorld, placeSeats, placeNear, landFraction, WORLD_SEED } from '../src/guild/world-gen.js';
import { CHART, SEATS, TOWNS, DUNGEON_CELLS, REALMS, WORLD } from '../src/guild/world-guilds.js';

const WET = '~i';
const isDry = (chart, cx, cy) => {
  const c = (chart[cy] || '')[cx];
  return !!c && WET.indexOf(c) < 0;
};

let failed = 0;
const fail = (msg) => { console.error('  FAIL  ' + msg); failed++; };
const ok = (msg) => console.log('  ok    ' + msg);

// ── Draw it ─────────────────────────────────────────────────────────────────
// One letter per cell, with the halls stamped over the top: digits 0-9 and
// letters for the rest, so a glance shows whether the circuit sits on land and
// whether the four realms landed where their blurbs say they do.
const MARK = '0123456789ABCDEFGHIJKLMNOPQRSTUV';
const overlay = CHART.map((r) => r.split(''));
SEATS.forEach((s, i) => { overlay[s.cy][s.cx] = MARK[i]; });
for (const t of TOWNS) if (overlay[t.cy][t.cx] === CHART[t.cy][t.cx]) overlay[t.cy][t.cx] = '+';
for (const k in DUNGEON_CELLS) {
  const [cx, cy] = DUNGEON_CELLS[k];
  if (overlay[cy][cx] === CHART[cy][cx]) overlay[cy][cx] = '*';
}

console.log(`\nTHE WORLD — seed ${WORLD.seed}, ${WORLD.cols}x${WORLD.rows}\n`);
console.log('    ' + '0123456789'.repeat(Math.ceil(WORLD.cols / 10)).slice(0, WORLD.cols));
overlay.forEach((row, y) => console.log(String(y).padStart(3, ' ') + ' ' + row.join('')));
console.log('\n    ~ sea · i ice · t taiga · g grass · f forest · h hills · m mountain · d desert');
console.log('    0-V halls (roster order) · + town · * charted delve\n');

// ── The laws ────────────────────────────────────────────────────────────────
console.log('SHIPPED WORLD');

const W = CHART[0].length;
let shaped = true;
CHART.forEach((row, y) => {
  if (row.length !== W) { fail(`row ${y} is ${row.length} wide, not ${W}`); shaped = false; }
  if (/[^~itgfhmd]/.test(row)) { fail(`row ${y} carries an unknown biome letter`); shaped = false; }
});
if (shaped) ok(`the chart is ${W}x${CHART.length} and speaks only the eight letters`);
if (CHART[0].length !== CHART.length * 2) {
  fail(`the chart is ${CHART[0].length}x${CHART.length} — latLonOf reads a full sphere off a 2:1 chart`);
} else ok('2:1 — the projection\'s premise holds');

let wet = 0;
for (const s of SEATS) if (!isDry(CHART, s.cx, s.cy)) { fail(`hall ${s.id} stands at ${s.cx},${s.cy} in the sea`); wet++; }
for (const t of TOWNS) if (!isDry(CHART, t.cx, t.cy)) { fail(`town ${t.id} stands at ${t.cx},${t.cy} in the sea`); wet++; }
for (const k in DUNGEON_CELLS) {
  const [cx, cy] = DUNGEON_CELLS[k];
  if (!isDry(CHART, cx, cy)) { fail(`delve ${k} stands at ${cx},${cy} in the sea`); wet++; }
}
if (!wet) ok(`all ${SEATS.length} halls, ${TOWNS.length} towns and ${Object.keys(DUNGEON_CELLS).length} delves are on dry land`);

const land = landFraction(WORLD);
if (land < 0.10 || land > 0.55) fail(`land is ${(land * 100).toFixed(1)}% of the chart — a world is neither a puddle nor a pangaea`);
else ok(`land covers ${(land * 100).toFixed(1)}% of the chart`);

// Nothing stacked: two halls in one cell is a placement bug the eye will miss
// on a 1024px oval where a marker is 12px wide.
const seen = new Set();
let stacked = 0;
for (const s of SEATS) {
  const key = s.cx + ',' + s.cy;
  if (seen.has(key)) { fail(`two halls share cell ${key}`); stacked++; }
  seen.add(key);
}
if (!stacked) ok('no two halls share a cell');

// ...and nothing else stands on one either: a town or a delve seated on a
// hall's cell draws as one marker hidden under another.
let buried = 0;
const hallAt = new Set(SEATS.map((s) => s.cx + ',' + s.cy));
for (const t of TOWNS) if (hallAt.has(t.cx + ',' + t.cy)) { fail(`town ${t.id} stands on a hall`); buried++; }
for (const k in DUNGEON_CELLS) {
  const key = DUNGEON_CELLS[k].join(',');
  if (hallAt.has(key)) { fail(`delve ${k} stands on a hall`); buried++; }
}
if (!buried) ok('no town or delve is buried under a hall');

// ── The realms wear their blurbs ────────────────────────────────────────────
console.log('\nREALMS');
const cellsOfRealm = (id) => SEATS.filter((s) => s.realm === id).map((s) => CHART[s.cy][s.cx]);
const count = (arr, set) => arr.filter((c) => set.indexOf(c) >= 0).length;

for (const r of REALMS) {
  const got = cellsOfRealm(r.id);
  console.log(`  ${r.name.padEnd(8)} ${got.join(' ')}   (${r.blurb})`);
}
const nor = cellsOfRealm('norvale'), ash = cellsOfRealm('ashvara'),
      vey = cellsOfRealm('veyra'), mer = cellsOfRealm('meridia');
if (count(nor, 'tmhi') < 4) fail(`Norvale is "the taiga holds of the north-east" and only ${count(nor, 'tmhi')}/8 halls stand on cold ground`);
else ok(`Norvale holds the cold — ${count(nor, 'tmhi')}/8 on taiga, hill or mountain`);
if (count(ash, 'dmh') < 4) fail(`Ashvara is "the dune courts" and only ${count(ash, 'dmh')}/8 halls stand on dune or rock`);
else ok(`Ashvara holds the dunes — ${count(ash, 'dmh')}/8 on desert or rock`);
if (count(vey, 'gfh') < 6) fail(`Veyra is "the green heartland" and only ${count(vey, 'gfh')}/8 halls stand on green`);
else ok(`Veyra is green — ${count(vey, 'gfh')}/8 on grass, forest or hills`);

// Meridia is ISLES: its halls should sit on several separate bodies of land, so
// flood-fill the realm's cells and count how many distinct islands they occupy.
const islandOf = (cx, cy) => {
  const key = (x, y) => x + ',' + y;
  const seenC = new Set([key(cx, cy)]);
  const stack = [[cx, cy]];
  while (stack.length) {
    const [x, y] = stack.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = ((x + dx) % W + W) % W, ny = y + dy;
      if (ny < 0 || ny >= CHART.length || !isDry(CHART, nx, ny) || seenC.has(key(nx, ny))) continue;
      seenC.add(key(nx, ny)); stack.push([nx, ny]);
    }
  }
  return seenC;
};
const merIslands = [];
for (const s of SEATS.filter((x) => x.realm === 'meridia')) {
  if (!merIslands.some((isl) => isl.has(s.cx + ',' + s.cy))) merIslands.push(islandOf(s.cx, s.cy));
}
if (merIslands.length < 3) fail(`Meridia is "the scattered isles" and its halls sit on only ${merIslands.length} landmass(es)`);
else ok(`Meridia is scattered — its 8 halls sit on ${merIslands.length} separate islands`);

// ── Determinism, which is what the port will be pinned against ──────────────
console.log('\nDETERMINISM');
const a = generateWorld(WORLD_SEED), b = generateWorld(WORLD_SEED);
if (a.chart.join('\n') !== b.chart.join('\n')) fail('the same seed grew two different worlds');
else ok('the same seed grows the same chart, twice');
const pa = placeSeats(a, SEATS.map((s) => ({ id: s.id, realm: s.realm })));
const pb = placeSeats(b, SEATS.map((s) => ({ id: s.id, realm: s.realm })));
let drift = 0;
for (const s of SEATS) if (String(pa.get(s.id)) !== String(pb.get(s.id))) drift++;
if (drift) fail(`${drift} halls moved between two runs of the same seed`);
else ok('every hall lands on the same cell, twice');

// ── The sweep ───────────────────────────────────────────────────────────────
if (process.argv.includes('--sweep')) {
  console.log('\nSWEEP — 40 seeds');
  const specs = SEATS.map((s) => ({ id: s.id, realm: s.realm }));
  const townSpecs = TOWNS.map((t) => ({ id: t.id, realm: t.realm }));
  let bad = 0, minLand = 1, maxLand = 0;
  for (let k = 0; k < 40; k++) {
    const seed = WORLD_SEED + k * 7919;
    try {
      const w = generateWorld(seed);
      const seats = placeSeats(w, specs);
      const towns = placeSeats(w, townSpecs, { minGap: 1.6 });
      const busy = [...seats.values(), ...towns.values()];
      placeNear(w, seats.get('home'), Object.keys(DUNGEON_CELLS), busy);
      for (const [id, [cx, cy]] of seats) {
        if (!w.isDry(cx, cy)) { fail(`seed ${seed}: hall ${id} in the sea`); bad++; }
      }
      const lf = landFraction(w);
      minLand = Math.min(minLand, lf); maxLand = Math.max(maxLand, lf);
      if (lf < 0.10 || lf > 0.55) { fail(`seed ${seed}: land is ${(lf * 100).toFixed(1)}%`); bad++; }
    } catch (e) {
      fail(`seed ${seed}: ${e.message}`); bad++;
    }
  }
  if (!bad) ok(`40 seeds all grew a world every hall could stand in (land ${(minLand * 100).toFixed(0)}-${(maxLand * 100).toFixed(0)}%)`);
}

console.log('');
if (failed) { console.error(`check-world: ${failed} problem(s).`); process.exit(1); }
console.log('check-world: the world holds — grown, seated, and the same every time.\n');
