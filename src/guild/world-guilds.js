/**
 * @file The known world — the 32 halls of the circuit, on a GENERATED globe.
 *
 * The world is 64×32 cells, one biome letter each, wrapped equirectangular
 * around the globe (globe.js rasterises it with FBB worldmap tiles). It used to
 * be thirty-two rows of hand-typed letters, and that header said why: "every
 * guild seat must stand on land that looks deliberate." It still must — the
 * letters are grown by a seeded algorithm now (@see world-gen.js), and the bar
 * did not move. What changed is that the world can be re-grown, checked, and
 * eventually chosen, which thirty-two string literals could never be.
 *
 * WHAT IS AUTHORED HERE AND WHAT IS GENERATED. Everything a player can NAME is
 * authored, right below: four realms, thirty-two halls, eight towns, and which
 * little keep each hall flies. The generator owns exactly one thing — WHERE each
 * of them stands, and what the ground is made of. Identity is content; geography
 * is a function of the seed.
 *
 * THE SAVE IS SAFE BECAUSE NOTHING STORES A COORDINATE. Contacts, venues, rival
 * halls and the chosen home seat are all keyed by seat ID (@see seatForEvent,
 * rivalSeat, and the guild's own `contacts` map), so the world could move under
 * a campaign and every one of those bindings would still point at the same hall.
 * That is why the halls could be re-seated at all.
 *
 * Biomes: `~` ocean · `i` ice · `t` taiga · `g` grass · `f` forest ·
 * `h` hills · `m` mountain · `d` desert.
 *
 * The chart still validates itself at load — a generator's failure mode is a
 * seat left in the sea, which is the same bug the hand-drawn map could have and
 * exactly as unshippable.
 */
import { generateWorld, placeSeats, placeNear, WORLD_SEED } from './world-gen.js';

/** The world this build ships, grown once at load. */
export const WORLD = generateWorld(WORLD_SEED);
export const CHART = WORLD.chart;

export const REALMS = [
  // Typographic marks, one per realm — never platform emoji.
  { id: 'veyra', name: 'Veyra', glyph: '☘', blurb: 'the green heartland where the circuit began' },
  { id: 'norvale', name: 'Norvale', glyph: '❄', blurb: 'the taiga holds of the north-east' },
  { id: 'ashvara', name: 'Ashvara', glyph: '☀', blurb: 'the dune courts of the south-east' },
  { id: 'meridia', name: 'Meridia', glyph: '≈', blurb: 'the scattered isles of the south-west' },
];

/**
 * THE THIRTY-TWO HALLS, as identities. `mini` picks one of the twelve little
 * keeps on worldmini.png (3×4 grid). The player's hall is `home` — its display
 * name is the guild's own (@see seatName), never authored here.
 *
 * NO COORDINATES. The order IS the placement order and therefore matters: the
 * home seat is placed first and takes the best ground in Veyra, and each hall
 * after it takes the best cell its realm has left. Reordering this list
 * reshuffles the map, which is why it is a list and not a set.
 */
const SEAT_ROSTER = [
  { id: 'home', name: null, realm: 'veyra', mini: 4 },
  { id: 'emberwatch', name: 'Emberwatch', realm: 'veyra', mini: 0 },
  { id: 'silverbrook', name: 'Silverbrook', realm: 'veyra', mini: 1 },
  { id: 'thornhall', name: 'Thornhall', realm: 'veyra', mini: 2 },
  { id: 'roseward', name: 'Roseward', realm: 'veyra', mini: 3 },
  { id: 'oakenshield', name: 'Oakenshield', realm: 'veyra', mini: 5 },
  { id: 'mistvale', name: 'Mistvale', realm: 'veyra', mini: 6 },
  { id: 'dawnspire', name: 'Dawnspire', realm: 'veyra', mini: 7 },
  { id: 'frosthollow', name: 'Frosthollow', realm: 'norvale', mini: 8 },
  { id: 'ravenmoor', name: 'Ravenmoor', realm: 'norvale', mini: 9 },
  { id: 'ironpeak', name: 'Ironpeak', realm: 'norvale', mini: 10 },
  { id: 'palewatch', name: 'Palewatch', realm: 'norvale', mini: 11 },
  { id: 'wolfden', name: 'Wolfden', realm: 'norvale', mini: 0 },
  { id: 'rimegard', name: 'Rimegard', realm: 'norvale', mini: 1 },
  { id: 'stormkeep', name: 'Stormkeep', realm: 'norvale', mini: 2 },
  { id: 'hallowmere', name: 'Hallowmere', realm: 'norvale', mini: 3 },
  { id: 'suncrest', name: 'Suncrest', realm: 'ashvara', mini: 5 },
  { id: 'duneveil', name: 'Duneveil', realm: 'ashvara', mini: 6 },
  { id: 'bronzegate', name: 'Bronzegate', realm: 'ashvara', mini: 7 },
  { id: 'scarabmark', name: 'Scarabmark', realm: 'ashvara', mini: 8 },
  { id: 'mirrorwell', name: 'Mirrorwell', realm: 'ashvara', mini: 9 },
  { id: 'cinderhold', name: 'Cinderhold', realm: 'ashvara', mini: 10 },
  { id: 'vulturegate', name: 'Vulturegate', realm: 'ashvara', mini: 11 },
  { id: 'saltspire', name: 'Saltspire', realm: 'ashvara', mini: 0 },
  { id: 'tidewatch', name: 'Tidewatch', realm: 'meridia', mini: 1 },
  { id: 'coralkeep', name: 'Coralkeep', realm: 'meridia', mini: 2 },
  { id: 'palmshade', name: 'Palmshade', realm: 'meridia', mini: 3 },
  { id: 'driftmark', name: 'Driftmark', realm: 'meridia', mini: 5 },
  { id: 'pearlhaven', name: 'Pearlhaven', realm: 'meridia', mini: 6 },
  { id: 'lagunport', name: 'Lagunport', realm: 'meridia', mini: 7 },
  { id: 'verdanthall', name: 'Verdanthall', realm: 'meridia', mini: 8 },
  { id: 'kelpmoor', name: 'Kelpmoor', realm: 'meridia', mini: 9 },
];

/** Free towns — the detail layer. They exist so a zoomed-in globe shows a
 *  lived-in world, not just politics; two per realm. Placed after the halls, so
 *  a town never takes the ground a hall wanted. */
const TOWN_ROSTER = [
  { id: 'millbrook', name: 'Millbrook', realm: 'veyra' },
  { id: 'harrowgate', name: 'Harrowgate', realm: 'veyra' },
  { id: 'elkford', name: 'Elkford', realm: 'norvale' },
  { id: 'coldquay', name: 'Coldquay', realm: 'norvale' },
  { id: 'brasshaven', name: 'Brasshaven', realm: 'ashvara' },
  { id: 'semirsrest', name: "Semir's Rest", realm: 'ashvara' },
  { id: 'saltwhistle', name: 'Saltwhistle', realm: 'meridia' },
  { id: 'palmrow', name: 'Palmrow', realm: 'meridia' },
];

/** The Wilds, in the order they are seated around the home hall. */
const DELVE_IDS = ['ferncreek', 'thornwood', 'mistfen', 'blackpine', 'hollowvein'];

// ── The world, seated ────────────────────────────────────────────────────────
// Halls first (they own the best ground), then towns on what is left, then the
// Wilds ringed around your own hall. One pass, one order, one answer.
const _seatCells = placeSeats(WORLD, SEAT_ROSTER);
const _townCells = placeSeats(WORLD, TOWN_ROSTER,
                              { minGap: 1.6, taken: [..._seatCells.values()] });

/** The 32 seats — authored identity, generated ground. `cx, cy` index the chart. */
export const SEATS = SEAT_ROSTER.map((s) => {
  const [cx, cy] = _seatCells.get(s.id);
  return { ...s, cx, cy };
});
export const TOWNS = TOWN_ROSTER.map((t) => {
  const [cx, cy] = _townCells.get(t.id);
  return { ...t, cx, cy };
});

/** Where each Wilds locale sits on the world, keyed by locale id — charted
 *  delves join the zoomed globe once discovered (hall.js gates on discovery).
 *  Ringed around the home seat: the Wilds are YOUR wilds. */
export const DUNGEON_CELLS = (() => {
  const home = _seatCells.get('home');
  const busy = [...SEATS.map((s) => [s.cx, s.cy]), ...TOWNS.map((t) => [t.cx, t.cy])];
  const placed = placeNear(WORLD, home, DELVE_IDS, busy);
  const out = {};
  for (const id of DELVE_IDS) out[id] = placed.get(id);
  return out;
})();

export const seatById = (id) => SEATS.find((s) => s.id === id) || null;
export const realmById = (id) => REALMS.find((r) => r.id === id) || null;
/** A seat's display name — the home seat wears the guild's own. */
export const seatName = (seat, guildName) => (seat && (seat.name || guildName || 'Your Hall')) || '';

/** Chart cell → geographic coordinates (radians). */
export function latLonOf(seat) {
  const lon = ((seat.cx + 0.5) / CHART[0].length) * Math.PI * 2 - Math.PI;
  const lat = Math.PI / 2 - ((seat.cy + 0.5) / CHART.length) * Math.PI;
  return { lat, lon };
}

/** Stable string hash (djb2) — venue and rival assignments must survive reload. */
function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h;
}

/** Which hall hosts an event — any seat but your own, stable per event id. */
export function seatForEvent(eventId) {
  return SEATS[1 + (hash(String(eventId)) % (SEATS.length - 1))].id;
}
/** Which hall a circuit rival fights out of — stable per rival id. */
export function rivalSeat(rivalId) {
  return SEATS[1 + (hash('rv' + String(rivalId)) % (SEATS.length - 1))].id;
}

/** The chart refuses to load malformed — a hand-authored map's failure mode is
 *  a silent one-character slip, and a seat in the sea is a bug, not weather. */
(function validateWorld() {
  const W = CHART[0].length;
  CHART.forEach((row, y) => {
    if (row.length !== W) throw new Error(`world chart row ${y} is ${row.length} wide, not ${W}`);
    if (/[^~itgfhmd]/.test(row)) throw new Error(`world chart row ${y} carries an unknown biome`);
  });
  const dry = (id, cx, cy) => {
    const c = (CHART[cy] || '')[cx];
    if (!c || c === '~' || c === 'i') throw new Error(`${id} stands at ${cx},${cy} on '${c || 'nothing'}'`);
  };
  for (const s of SEATS) dry('guild seat ' + s.id, s.cx, s.cy);
  for (const t of TOWNS) dry('town ' + t.id, t.cx, t.cy);
  for (const k in DUNGEON_CELLS) dry('delve ' + k, DUNGEON_CELLS[k][0], DUNGEON_CELLS[k][1]);
})();
