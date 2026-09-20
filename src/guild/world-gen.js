/**
 * @file THE WORLD, GENERATED — one seeded algorithm where thirty-two rows of
 * hand-typed letters used to be.
 *
 * The chart this replaces was drawn by hand, and its own header said why: "every
 * guild seat must stand on land that looks deliberate." That is the bar a
 * generator has to clear, not a reason it cannot exist — so this does not scatter
 * noise and hope. It grows the world the fiction already claims:
 *
 *   veyra    — "the green heartland where the circuit began": one broad temperate
 *              continent in the west, grass and forest with a spine of hills.
 *   norvale  — "the taiga holds of the north-east": a cold northern landmass.
 *   ashvara  — "the dune courts of the south-east": a hot, dry mass astride the
 *              southern tropic.
 *   meridia  — "the scattered isles of the south-west": deliberately BROKEN land,
 *              many small islands rather than one shore.
 *
 * Those four sentences are authored content (REALMS in world-guilds.js) and the
 * generator is judged against them: a Norvale that comes out sandy is a bug even
 * though no assertion can see it. @see dev/check-world.mjs, which measures the
 * claims that CAN be checked — realm climates, land fraction, every seat dry.
 *
 * WHAT IS GENERATED AND WHAT IS NOT. The LETTERS are generated; the NAMES are
 * not. Thirty-two halls, their realms, their little keep sprites, the towns and
 * the Wilds all keep the identities they were written with — the generator only
 * decides WHERE they stand. That split is the whole point: a world nobody wrote
 * is scenery, and a world whose halls have no ground under them is a list.
 *
 * ONE SEED, ONE WORLD. `WORLD_SEED` is a constant, so the shipped world is the
 * same world for everybody and every save — ids, not coordinates, are what the
 * save file carries (contacts, venues and the chosen home seat are all keyed by
 * id), but a world that re-rolled per launch would still move every hall under a
 * player mid-campaign. Generated is not the same as random.
 *
 * PORTABILITY IS THE CONSTRAINT ON THE MATH. Unity mirrors this file 1:1, so the
 * only sources of chance are the two primitives already ported and pinned:
 * `elementsRng` (mulberry32) and `hash2` (@see game/engine/rng.js, mirrored as
 * TileAtlas.Hash2). No Math.random, no Date, no iteration-order dependence — a
 * cell's value is a pure function of its coordinates and the seed, which is also
 * what lets a later streaming world ask for one cell without generating the rest.
 * @see reference js-number-traps: the fixture pins the numbers node printed.
 */
import { elementsRng, hash2 } from '../game/engine/rng.js';

/** The chart's shape. TWO TO ONE IS LOAD-BEARING, not a taste: `latLonOf` reads
 *  a full sphere off these (lon over the width, lat over the height), so any
 *  other ratio silently stretches the globe. @see world-guilds.js latLonOf. */
export const WORLD_COLS = 64;
export const WORLD_ROWS = 32;

/** The world the game ships. A different number is a different world, which is
 *  what `dev/check-world.mjs` sweeps to prove the generator is not tuned to one
 *  lucky draw. */
export const WORLD_SEED = 20260821;

// The biome alphabet, unchanged — every renderer, both builds, and two
// validators already speak exactly these eight letters.
export const OCEAN = '~', ICE = 'i', TAIGA = 't', GRASS = 'g',
             FOREST = 'f', HILL = 'h', MOUNT = 'm', DESERT = 'd';
/** Letters a body can stand on. `~` drowns and `i` is the ice cap — the same
 *  "dry" test WorldMap.IsDry keeps on the Unity side. */
const WET = OCEAN + ICE;

/**
 * THE FOUR REALMS AS GEOGRAPHY. Each is a soft ellipse on the chart plus the
 * climate its blurb promises; the landmass is the sum of these, so moving a
 * realm moves its continent and its weather together rather than leaving a
 * desert court in a snowfield.
 *
 * `pieces` is what makes Meridia read as ISLES: one domain grows a continent,
 * several small ones scattered around a centre grow an archipelago. The
 * offsets are fixed rather than rolled so the realms keep their places on the
 * map from seed to seed — a world where Norvale wanders south is a different
 * game's world, not a different draw of this one.
 */
const DOMAINS = [
  // A domain's `lift` is measured against SEA (0.42) AFTER the falloff, and the
  // fractal that roughens it swings ±0.31 — so a lift of 0.62 puts only the
  // inner third of an ellipse above water, and the first cut of this table grew
  // a world 4.9% dry with Meridia entirely submerged. Lift is the height of the
  // CENTRE; the coast is wherever the falloff and the noise cross the sea.
  // id        cx    cy   rx    ry   lift  warm   wet    pieces
  { realm: 'veyra',   cx: 13, cy: 12, rx: 12, ry: 8.0, lift: 0.98, warm: 0.02, wet: 0.16, pieces: null,
    prefer: { g: 3.0, f: 2.8, h: 2.0, t: 0.8, d: 0.3, m: 0.5 } },
  { realm: 'norvale', cx: 41, cy: 8,  rx: 12, ry: 5.5, lift: 0.95, warm: -0.18, wet: 0.06, pieces: null,
    prefer: { t: 3.4, h: 2.4, f: 2.0, g: 1.5, m: 0.9, d: 0.2 } },
  { realm: 'ashvara', cx: 41, cy: 20, rx: 12, ry: 6.0, lift: 0.95, warm: 0.22, wet: -0.34, pieces: null,
    prefer: { d: 3.4, h: 2.2, g: 1.5, f: 1.0, m: 0.9, t: 0.2 } },
  // The isles: a field of small lifts, each its own island. They must clear the
  // sea on their own — an archipelago is not a continent with holes in it.
  { realm: 'meridia', cx: 10, cy: 22, rx: 10, ry: 5.0, lift: 0.92, warm: 0.14, wet: 0.20,
    pieces: [[-6.5, -1.5, 3.8], [-2.5, 1.2, 4.0], [1.5, -1.5, 3.6], [5.0, 1.2, 3.8],
             [8.0, 2.8, 3.4], [0.5, 3.4, 3.4], [-4.5, 3.0, 3.2], [3.5, -2.6, 3.2]],
    prefer: { g: 3.0, f: 2.8, h: 1.8, t: 0.6, d: 0.6, m: 0.4 } },
];

/** Where the water stops. Every threshold below is measured against it. */
const SEA = 0.40;

/** Smoothstep — the same S the tile bakers use, so an edge reads as a coast
 *  rather than a staircase. */
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Shortest signed column distance on a wrapped chart — the world is a globe,
 *  so column 63 and column 0 are neighbours and a continent may straddle them. */
function dLon(a, b) {
  let d = a - b;
  if (d > WORLD_COLS / 2) d -= WORLD_COLS;
  if (d < -WORLD_COLS / 2) d += WORLD_COLS;
  return d;
}

/**
 * VALUE NOISE THAT WRAPS. A lattice sampled straight off `hash2` seams at the
 * date line — the one place on a globe where a visible join is unmistakable, and
 * the reason the octave frequencies below are PERIODS rather than scales: each
 * octave lays an exact whole number of lattice cells across the chart's width,
 * so the wrap lands on the lattice instead of between two of its points.
 *
 * Latitude does not wrap (a pole is not a neighbour of anything) and is clamped,
 * which is invisible under the ice caps that cover it.
 */
function vnoise(fx, fy, px, py, ox, oy) {
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = smooth(fx - x0), ty = smooth(fy - y0);
  const wx = (i) => (((i % px) + px) % px) + ox;
  const cy = (j) => (j < 0 ? 0 : j > py ? py : j) + oy;
  const at = (i, j) => hash2(wx(i), cy(j)) / 4294967296;
  const a = lerp(at(x0, y0), at(x0 + 1, y0), tx);
  const b = lerp(at(x0, y0 + 1), at(x0 + 1, y0 + 1), tx);
  return lerp(a, b, ty);
}

/** Four octaves, each an exact whole number of lattice cells across the world —
 *  @see vnoise for why that is a rule and not a tuning. */
const OCTAVES = [
  { p: 4, a: 1 }, { p: 8, a: 0.5 }, { p: 16, a: 0.25 }, { p: 32, a: 0.125 },
];

/** Fractal sum, normalised to 0..1. `off` is the seed's contribution: whole
 *  lattice offsets, so the octaves stay periodic and the seed still moves every
 *  coastline. */
function fbm(cx, cy, off) {
  let sum = 0, norm = 0;
  for (let k = 0; k < OCTAVES.length; k++) {
    const o = OCTAVES[k];
    const px = o.p, py = Math.max(2, o.p >> 1);      // 2:1 chart → 2:1 lattice
    const fx = (cx / WORLD_COLS) * px;
    const fy = (cy / WORLD_ROWS) * py;
    sum += vnoise(fx, fy, px, py, off[k][0], off[k][1]) * o.a;
    norm += o.a;
  }
  return sum / norm;
}

/** Seed → the lattice offsets each octave is sampled at. Drawn in a fixed order
 *  off the pinned mulberry32, so one seed is one world in both builds. */
function offsetsFor(seed, salt) {
  const rnd = elementsRng((seed | 0) + salt);
  const out = [];
  for (let k = 0; k < OCTAVES.length; k++) {
    out.push([Math.floor(rnd() * 4096) | 0, Math.floor(rnd() * 4096) | 0]);
  }
  return out;
}

/**
 * How much land a domain lifts under this cell, 0..1 — and the same falloff
 * answers "how much of this realm's WEATHER does this cell feel", which is what
 * keeps a climate from stopping dead at a coastline.
 */
function domainAt(d, cx, cy) {
  if (!d.pieces) {
    const ax = dLon(cx, d.cx) / d.rx, ay = (cy - d.cy) / d.ry;
    return 1 - smooth(Math.sqrt(ax * ax + ay * ay));
  }
  // An archipelago: the strongest island wins, and the wide shelf under them
  // all is what turns open ocean into shallows the isles can sit in.
  let best = 0;
  for (const [ox, oy, r] of d.pieces) {
    const ax = dLon(cx, d.cx + ox) / r, ay = (cy - (d.cy + oy)) / (r * 0.62);
    const v = 1 - smooth(Math.sqrt(ax * ax + ay * ay));
    if (v > best) best = v;
  }
  return best;
}

/**
 * GENERATE THE WORLD. Pure: the same seed gives the same chart, in this build
 * and in the port, on every machine.
 *
 * @param {number} [seed] @returns {{cols, rows, seed, chart: string[],
 *   height: Float64Array, temp: Float64Array, moist: Float64Array,
 *   at(cx,cy): string, isDry(cx,cy): boolean, realmField: Uint8Array}}
 */
export function generateWorld(seed = WORLD_SEED) {
  const cols = WORLD_COLS, rows = WORLD_ROWS, n = cols * rows;
  const hOff = offsetsFor(seed, 0), mOff = offsetsFor(seed, 7919),
        wOff = offsetsFor(seed, 104729), rOff = offsetsFor(seed, 15485863);
  const height = new Float64Array(n), temp = new Float64Array(n), moist = new Float64Array(n);
  const realmField = new Uint8Array(n);
  const rowsMid = (rows - 1) / 2;

  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const i = cy * cols + cx;

      // WARP FIRST. Sampling the domains at a noise-displaced point is what
      // stops four ellipses reading as four ellipses: the coast wanders inland
      // and out again, bays and peninsulas fall out of it, and no shoreline is
      // a curve anyone drew.
      const wx = cx + (fbm(cx, cy, wOff) - 0.5) * 14;
      const wy = cy + (fbm(cx + 512, cy + 512, wOff) - 0.5) * 8;

      let lift = 0, warm = 0, wet = 0, pull = 0, who = 0;
      for (let k = 0; k < DOMAINS.length; k++) {
        const d = DOMAINS[k];
        const f = domainAt(d, wx, wy);
        if (f <= 0) continue;
        lift = Math.max(lift, f * d.lift);
        warm += d.warm * f; wet += d.wet * f;
        if (f > pull) { pull = f; who = k + 1; }
      }
      realmField[i] = who;

      // Elevation, in two parts, because ONE field cannot be both.
      //
      // The domain lift decides what is LAND — it must be strong at the centre
      // to clear the sea at all. Read as relief that same strength makes every
      // continent a dome, and the first cut of this generator duly grew a
      // mountain range in the middle of every landmass and nowhere else, which
      // is not what a continent looks like from above.
      //
      // So height above the waterline is re-mapped: the dome contributes only
      // gently, and a SEPARATE ridge field raised to a hard power supplies the
      // peaks. Mountains then run in ranges wherever that field crests — across
      // an interior, down a coast, over an isthmus — and the middle of a
      // continent is ordinary ground you could put a hall on.
      let e = clamp01(lift + (fbm(cx, cy, hOff) - 0.5) * 0.62);
      if (e > SEA) {
        const rel = (e - SEA) / (1 - SEA);
        const ridge = fbm(cx + 2048, cy + 2048, rOff);
        // THE RIDGE IS SCALED BY THE LAND UNDER IT. Added flat, it raised peaks
        // wherever the field happened to crest — including on one-cell islands,
        // which came out as mountains in the sea. Multiplied by `rel` it can
        // only lift ground that is already thick, so a range needs a continent
        // to stand on and the isles stay low and green.
        //
        // CUBED BY MULTIPLICATION, NEVER `Math.pow`. Every other operation here
        // is +-*/ and sqrt, which IEEE-754 pins to the bit in both languages;
        // `pow` is the one call whose last bit is implementation-defined, and a
        // single-ULP difference on one cell is a different coastline in the
        // port. @see reference js-number-traps.
        const r3 = ridge * ridge * ridge;
        e = SEA + (1 - SEA) * clamp01(rel * (0.45 + r3 * 1.2));
      }
      height[i] = e;

      // Climate. Latitude is the whole of temperature before a realm has its
      // say — the ice caps at the top and bottom of the chart are this line,
      // not a special case.
      const lat = Math.abs(cy - rowsMid) / rowsMid;
      temp[i] = clamp01(1 - lat * 1.05 + warm - Math.max(0, e - 0.62) * 0.55);
      moist[i] = clamp01(fbm(cx + 1024, cy + 1024, mOff) * 0.82 + wet + 0.09);
    }
  }

  const chart = [];
  for (let cy = 0; cy < rows; cy++) {
    let row = '';
    for (let cx = 0; cx < cols; cx++) {
      const i = cy * cols + cx;
      row += biomeOf(height[i], temp[i], moist[i]);
    }
    chart.push(row);
  }

  const at = (cx, cy) => ((cy >= 0 && cy < rows && (chart[cy] || '')[((cx % cols) + cols) % cols]) || OCEAN);
  const isDry = (cx, cy) => WET.indexOf(at(cx, cy)) < 0;
  return { cols, rows, seed, chart, height, temp, moist, realmField, at, isDry };
}

/**
 * ONE CELL'S LETTER, from the three numbers that describe it. Read top to
 * bottom: the sea takes what is below it, the cold takes what is above the
 * treeline or beyond it, then height, then rain.
 */
function biomeOf(e, t, m) {
  // THE CAPS COME FIRST, AND THEY FLOAT. Ice is tested before the sea because
  // the top and bottom of a globe are frozen OCEAN as much as frozen ground —
  // the hand-drawn chart iced its polar rows straight across, open water and
  // all, and a world whose poles are plain blue does not read as a globe.
  // `i` is not dry in either build, so a cap can never host a hall.
  if (t < 0.12) return ICE;
  if (e < SEA) return OCEAN;
  if (t < 0.20) return ICE;                       // frozen ground below the cap
  if (e > 0.80) return MOUNT;
  if (e > 0.68) return HILL;
  if (t < 0.34) return TAIGA;                     // the cold holds
  if (m < 0.30 && t > 0.52) return DESERT;        // hot AND dry, never merely dry
  if (m > 0.56) return FOREST;
  return GRASS;
}

/**
 * WHERE A HALL CAN STAND. Scored, not searched-at-random: every dry cell in the
 * realm is rated and the best free one taken, so the same world always seats the
 * same guild in the same place and a re-run cannot shuffle the map.
 *
 * The score is what makes a placement look deliberate:
 *   • inside your own realm (the domain field decides, so a hall never defects
 *     to the continent next door),
 *   • on ground people settle — grass and forest first, hills next, mountain
 *     and desert only where that IS the realm's character,
 *   • near enough the coast to be a port, without standing in the surf,
 *   • and never crowding a hall already placed.
 */
function scoreCell(w, cx, cy, realmIdx, taken, minGap) {
  if (!w.isDry(cx, cy)) return -1;
  const i = cy * w.cols + cx;
  if (w.realmField[i] !== realmIdx + 1) return -1;

  for (const t of taken) {
    const dx = dLon(cx, t[0]), dy = cy - t[1];
    if (Math.sqrt(dx * dx + dy * dy) < minGap) return -1;
  }

  const c = w.at(cx, cy);
  const d = DOMAINS[realmIdx];
  // GROUND A REALM WOULD SETTLE, in ITS OWN terms — a flat "grass is best"
  // table put Norvale's halls on meadows and Ashvara's on lawns, because
  // grass outranked the taiga and the dunes those realms are named for. Each
  // realm rates its own ground, so a dune court sits on dunes even though a
  // greener cell was going spare two columns away.
  let s = d.prefer[c] || 0;

  // A coast is worth having and a puddle is not: count the sea within one step.
  let sea = 0;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      if (!ox && !oy) continue;
      if (!w.isDry(cx + ox, cy + oy)) sea++;
    }
  }
  s += sea >= 1 && sea <= 4 ? 1.1 : sea > 4 ? -0.6 : 0;

  // Toward the middle of the realm, gently — the edge of a domain is where the
  // land is thinnest and a hall there reads as an afterthought.
  const ax = dLon(cx, d.cx) / d.rx, ay = (cy - d.cy) / d.ry;
  s += (1 - Math.min(1, Math.sqrt(ax * ax + ay * ay))) * 1.4;
  return s;
}

/**
 * Seat everything the world has to carry, in one deterministic pass.
 *
 * ORDER IS THE TIE-BREAK, and it is the order the caller hands them in — halls
 * before towns before delves, each realm's halls in their authored order. So
 * "which of two equally good cells did Emberwatch take" has one answer forever,
 * and it is the same answer in C#.
 *
 * @param {object} world @param {Array} specs `{id, realm}` in authored order
 * @param {object} [opts] `{minGap, taken}` — `taken` is ground already spoken
 *   for by an EARLIER pass (the halls, when this is called again for towns);
 *   without it a town could be seated on a hall's own cell, which the map draws
 *   as one marker sitting on another.
 * @returns {Map<string,[number,number]>} id → [cx, cy]
 */
export function placeSeats(world, specs, opts = {}) {
  const minGap = opts.minGap != null ? opts.minGap : 2.2;
  // A CROWDED REALM BEATS A MISSING HALL. The gap is what keeps eight markers
  // from stacking into one blob on a 1024px oval, so it is tried first and
  // hardest — but a seed that grows a narrow Norvale or a sparse Meridia can
  // genuinely lack a cell that far from the other seven, and the first cut of
  // this threw on 7 seeds in 40 rather than seating the last hall (@see
  // dev/check-world.mjs --sweep, which is what found it: the shipped seed
  // passed the whole time). So the gap steps down until the realm can hold
  // everyone, and only a realm with fewer dry cells than halls is a real fault.
  // The floor is 0.5 — under a whole cell, which still forbids two halls in one.
  const ladder = [minGap, 1.8, 1.4, 1.05, 0.5];
  const taken = (opts.taken || []).slice();
  const out = new Map();
  for (const spec of specs) {
    const realmIdx = DOMAINS.findIndex((d) => d.realm === spec.realm);
    if (realmIdx < 0) throw new Error(`world-gen: '${spec.id}' names realm '${spec.realm}', which has no domain`);
    let best = -1, bx = -1, by = -1;
    for (const gap of ladder) {
      for (let cy = 0; cy < world.rows; cy++) {
        for (let cx = 0; cx < world.cols; cx++) {
          const s = scoreCell(world, cx, cy, realmIdx, taken, gap);
          if (s > best) { best = s; bx = cx; by = cy; }
        }
      }
      if (best >= 0) break;
    }
    if (best < 0) {
      // Not a placement fault — the realm itself came out too small to hold its
      // halls. Name the realm and the seat rather than dropping a hall in the
      // sea for a validator downstream to find.
      throw new Error(`world-gen: ${spec.realm} has no room for '${spec.id}' (seed ${world.seed})`);
    }
    taken.push([bx, by]);
    out.set(spec.id, [bx, by]);
  }
  return out;
}

/**
 * The Wilds, seated around a hall — "the Wilds are YOUR wilds", so they are
 * placed by distance from the home seat rather than by realm, spiralling out
 * over dry ground in a fixed ring order so five delves land near home and never
 * on top of each other or on a hall.
 */
export function placeNear(world, home, ids, taken, opts = {}) {
  const minGap = opts.minGap != null ? opts.minGap : 1.9;
  // The same ladder as the halls, in both terms that can run out: how close two
  // delves may sit, and how far from home "your own wilds" reaches.
  const ladder = [[minGap, 7], [1.4, 9], [1.05, 12], [0.5, 16]];
  const seen = taken.slice();
  const out = new Map();
  for (let k = 0; k < ids.length; k++) {
    let best = -1, bx = -1, by = -1;
    for (const [gap, reach] of ladder) {
      for (let cy = 0; cy < world.rows; cy++) {
        for (let cx = 0; cx < world.cols; cx++) {
          if (!world.isDry(cx, cy)) continue;
          let clear = true;
          for (const t of seen) {
            const dx = dLon(cx, t[0]), dy = cy - t[1];
            if (Math.sqrt(dx * dx + dy * dy) < gap) { clear = false; break; }
          }
          if (!clear) continue;
          const dx = dLon(cx, home[0]), dy = cy - home[1];
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > reach) continue;                 // still your own country
          const s = 20 - dist;                        // nearer is better, flatly
          if (s > best) { best = s; bx = cx; by = cy; }
        }
      }
      if (best >= 0) break;
    }
    if (best < 0) throw new Error(`world-gen: nowhere near home for '${ids[k]}' (seed ${world.seed})`);
    seen.push([bx, by]);
    out.set(ids[k], [bx, by]);
  }
  return out;
}

/** What fraction of the chart is standable — the one number that says at a
 *  glance whether a seed grew a world or a puddle. */
export function landFraction(world) {
  let land = 0;
  for (let cy = 0; cy < world.rows; cy++) {
    for (let cx = 0; cx < world.cols; cx++) if (world.isDry(cx, cy)) land++;
  }
  return land / (world.cols * world.rows);
}
