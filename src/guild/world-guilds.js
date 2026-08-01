/**
 * @file The known world — the 32 halls of the circuit, on a hand-drawn globe.
 *
 * The world is an AUTHORED chart, not a noise field: 64×32 cells, one biome
 * letter each, wrapped equirectangular around the globe (globe.js rasterises
 * it with FBB worldmap tiles). Hand-drawn because every guild seat must stand
 * on land that looks deliberate — four realms, eight halls each, and the
 * player's own hall among them.
 *
 * Biomes: `~` ocean · `i` ice · `t` taiga · `g` grass · `f` forest ·
 * `h` hills · `m` mountain · `d` desert.
 *
 * The chart validates itself at load (row lengths, every seat on dry land) —
 * a hand-authored map's failure mode is a silent one-character slip, so the
 * module refuses to ship one.
 */

export const CHART = [
  'iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii',
  'iiiiiiiiiii~~iiiiiiiiiiiii~~~iiiiiiiiiiiiiii~~iiiiiiiiiiii~iiiii',
  '~~ii~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ii~~~~~~~~~~~~ii~~~~~~~~~ii~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~tt~~~~~ttmmtt~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ttmmtt~ttmmmmtt~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~gg~~~~~~~~~~~~~~~~~~tttmmmmmtttttmmmtttt~~~~~~~~~~~~~~',
  '~~~~~~~~~gggg~~~~~~~~~~~~~~~tttffmmmfffttfffmmtttt~~~~~~~~~~~~~~',
  '~~~~~~gggggggggg~~~~~~~~~~~~~~tfffffffffffffffftttt~~~~~~~~~~~~~',
  '~~~~~ggggffffgggg~~~~~~~~~~~~~~fffgggffffggffffft~~~~~~~~~~~~~~~',
  '~~~~gggfffffffgggg~~~~~~~~~~~~~~fgggggffgggfff~~~~~~~~~~~~~~~~~~',
  '~~~~ggfffhhhhfggggg~~~~~~~~~~~~~~ggggg~~~gg~~~~~~~~~~~~~~~~~~~~~',
  '~~~ggghhhmmmhhgggggg~~~~~~~~~~~~~~ggg~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~ggghmmmmmhhfgggggg~~~~~~~~~~~~~~g~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~gghhmmmhhffggggg~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~gghhhhhffggggg~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~ggggffggg~~g~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~gg~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~dd~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~dddddddddddd~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~dddddddmmddddddddd~~~~~~~~~~~~~~~',
  '~~~~gg~~~~~~~~~~~~~~~~~~~~~~~~dddddmmmmmddddgddddd~~~~~~~~~~~~~~',
  '~~~ggfg~~~~~~~~~~~~~~~~~~~~~dddddmmmmdddddggdddddd~~~~~~~~~~~~~~',
  '~~ggffgg~~~gg~~~~~~~~~~~~~~~ddddddmmddddgggddddddd~~~~~~~~~~~~~~',
  '~~gffffgg~gffg~~~~~~~~~~~~~~~~ddddddddddddggddddd~~~~~~~~~~~~~~~',
  '~~~gffggggffffg~~~~~~~~~~~~~~~ddddddddddddddddd~~~~~~~~~~~~~~~~~',
  '~~~~ggg~gffffgg~~~g~~~~~~~~~~~~dddddddddddddd~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~gggggg~~gfg~~~~~~~~~~~~~~dddddddddd~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~gg~~~~~g~~~~~~~~~~~~~~~~~dd~~~dd~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~iiii~~~~~~~~~~~~ii~~~~~~~~~~~~~~~ii~~~~~~~~~~~~~ii~~~~~~~~~~~~',
  'iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii',
  'iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii',
];

export const REALMS = [
  { id: 'veyra', name: 'Veyra', glyph: '🌿', blurb: 'the green heartland where the circuit began' },
  { id: 'norvale', name: 'Norvale', glyph: '❄', blurb: 'the taiga holds of the north-east' },
  { id: 'ashvara', name: 'Ashvara', glyph: '🏜', blurb: 'the dune courts of the south-east' },
  { id: 'meridia', name: 'Meridia', glyph: '🌊', blurb: 'the scattered isles of the south-west' },
];

/**
 * The 32 seats. `cx, cy` index the chart; `mini` picks one of the twelve
 * little keeps on worldmini.png (3×4 grid). The player's hall is `home` — its
 * display name is the guild's own (seatName), never authored here.
 */
export const SEATS = [
  { id: 'home', name: null, realm: 'veyra', cx: 15, cy: 12, mini: 4 },
  { id: 'emberwatch', name: 'Emberwatch', realm: 'veyra', cx: 6, cy: 8, mini: 0 },
  { id: 'silverbrook', name: 'Silverbrook', realm: 'veyra', cx: 10, cy: 9, mini: 1 },
  { id: 'thornhall', name: 'Thornhall', realm: 'veyra', cx: 11, cy: 11, mini: 2 },
  { id: 'roseward', name: 'Roseward', realm: 'veyra', cx: 17, cy: 13, mini: 3 },
  { id: 'oakenshield', name: 'Oakenshield', realm: 'veyra', cx: 9, cy: 10, mini: 5 },
  { id: 'mistvale', name: 'Mistvale', realm: 'veyra', cx: 13, cy: 14, mini: 6 },
  { id: 'dawnspire', name: 'Dawnspire', realm: 'veyra', cx: 17, cy: 15, mini: 7 },
  { id: 'frosthollow', name: 'Frosthollow', realm: 'norvale', cx: 35, cy: 5, mini: 8 },
  { id: 'ravenmoor', name: 'Ravenmoor', realm: 'norvale', cx: 38, cy: 7, mini: 9 },
  { id: 'ironpeak', name: 'Ironpeak', realm: 'norvale', cx: 44, cy: 5, mini: 10 },
  { id: 'palewatch', name: 'Palewatch', realm: 'norvale', cx: 48, cy: 6, mini: 11 },
  { id: 'wolfden', name: 'Wolfden', realm: 'norvale', cx: 42, cy: 8, mini: 0 },
  { id: 'rimegard', name: 'Rimegard', realm: 'norvale', cx: 34, cy: 9, mini: 1 },
  { id: 'stormkeep', name: 'Stormkeep', realm: 'norvale', cx: 45, cy: 7, mini: 2 },
  { id: 'hallowmere', name: 'Hallowmere', realm: 'norvale', cx: 36, cy: 11, mini: 3 },
  { id: 'suncrest', name: 'Suncrest', realm: 'ashvara', cx: 44, cy: 19, mini: 5 },
  { id: 'duneveil', name: 'Duneveil', realm: 'ashvara', cx: 37, cy: 17, mini: 6 },
  { id: 'bronzegate', name: 'Bronzegate', realm: 'ashvara', cx: 38, cy: 18, mini: 7 },
  { id: 'scarabmark', name: 'Scarabmark', realm: 'ashvara', cx: 34, cy: 22, mini: 8 },
  { id: 'mirrorwell', name: 'Mirrorwell', realm: 'ashvara', cx: 43, cy: 20, mini: 9 },
  { id: 'cinderhold', name: 'Cinderhold', realm: 'ashvara', cx: 36, cy: 20, mini: 10 },
  { id: 'vulturegate', name: 'Vulturegate', realm: 'ashvara', cx: 46, cy: 23, mini: 11 },
  { id: 'saltspire', name: 'Saltspire', realm: 'ashvara', cx: 48, cy: 19, mini: 0 },
  { id: 'tidewatch', name: 'Tidewatch', realm: 'meridia', cx: 4, cy: 20, mini: 1 },
  { id: 'coralkeep', name: 'Coralkeep', realm: 'meridia', cx: 7, cy: 22, mini: 2 },
  { id: 'palmshade', name: 'Palmshade', realm: 'meridia', cx: 12, cy: 21, mini: 3 },
  { id: 'driftmark', name: 'Driftmark', realm: 'meridia', cx: 4, cy: 24, mini: 5 },
  { id: 'pearlhaven', name: 'Pearlhaven', realm: 'meridia', cx: 9, cy: 23, mini: 6 },
  { id: 'lagunport', name: 'Lagunport', realm: 'meridia', cx: 13, cy: 25, mini: 7 },
  { id: 'verdanthall', name: 'Verdanthall', realm: 'meridia', cx: 11, cy: 22, mini: 8 },
  { id: 'kelpmoor', name: 'Kelpmoor', realm: 'meridia', cx: 17, cy: 25, mini: 9 },
];

/** Free towns — the detail layer. They exist so a zoomed-in globe shows a
 *  lived-in world, not just politics; two per realm, all on probed land. */
export const TOWNS = [
  { id: 'millbrook', name: 'Millbrook', realm: 'veyra', cx: 5, cy: 9 },
  { id: 'harrowgate', name: 'Harrowgate', realm: 'veyra', cx: 18, cy: 14 },
  { id: 'elkford', name: 'Elkford', realm: 'norvale', cx: 35, cy: 8 },
  { id: 'coldquay', name: 'Coldquay', realm: 'norvale', cx: 41, cy: 9 },
  { id: 'brasshaven', name: 'Brasshaven', realm: 'ashvara', cx: 41, cy: 21 },
  { id: 'semirsrest', name: "Semir's Rest", realm: 'ashvara', cx: 44, cy: 20 },
  { id: 'saltwhistle', name: 'Saltwhistle', realm: 'meridia', cx: 6, cy: 21 },
  { id: 'palmrow', name: 'Palmrow', realm: 'meridia', cx: 14, cy: 23 },
];

/** Where each Wilds locale sits on the world, keyed by locale id — charted
 *  delves join the zoomed globe once discovered (hall.js gates on discovery).
 *  All in Veyra, around the home seat: the Wilds are YOUR wilds. */
export const DUNGEON_CELLS = {
  ferncreek: [17, 11], hollowvein: [7, 12], thornwood: [13, 9], mistfen: [16, 14], blackpine: [12, 14],
};

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
