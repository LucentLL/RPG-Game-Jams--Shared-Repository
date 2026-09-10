#!/usr/bin/env node
/**
 * THE STADIUM, AS A CHART — content/maps/arena-stadium.json, generated.
 *
 *     node dev/gen-arena-stadium.mjs          → writes content/maps/arena-stadium.json
 *
 * Owner directive (2026-09-08): "All maps used in game should be on maps
 * created inside the editor. That's the purpose of it ... Recreate the arena
 * if necessary inside the editor. Flag the 'stadium stands' with crowd
 * positions ... a fence to keep the arena separate from the crowd like an NFL
 * or Soccer stadium."
 *
 * Off the first deploy: "I was expecting the Arena locker rooms to be
 * inside/under the stadium stands like a real stadium ... I also miss the deep
 * bowl with the crowd towering into the sky."
 *
 * And off the second, with two photographs of a players' tunnel: "you really
 * seem to not understand how stadium tunnels work for athletes to go in and
 * out of locker room." The photographs are the spec: the tunnel MOUTH is an
 * opening in the wall at the edge of the pitch, the seats continue right over
 * it, a walled corridor runs back under the first rows, and the locker rooms
 * are deep under the stands at the far end of it. Nothing is beside the
 * pitch; everything is under the crowd.
 *
 * So the arena the duel is fought in is a CHART in the pack's own vocabulary,
 * the one the drafting table edits — this script only saves an author the
 * evening of laying 1000 cells by hand, and it writes nothing the table could
 * not. Open it there and change it; AUTHORED BEATS GROWN.
 *
 * The shape, outside in (36 x 30):
 *   '#'  the void ring
 *   seven TIERS of stands, one cell deep and one BLOCK (three rungs) high
 *        each — levels 21 · 18 · 15 · 12 · 9 · 6 · 3, the deep bowl — every
 *        cell a seat (the levels layer spells the heights; a grid char stops
 *        at 6). The stands start right behind the fence, as a stadium's do.
 *        No stairs: a fighter's step is one rung and a tier is three, so the
 *        stands are the crowd's.
 *   'b'  the fence — a waist-high block ring at the edge of the lists — with
 *        the two TUNNEL MOUTHS ('D') in it, east and west: barred for the
 *        bout, open after
 *   the lists in the middle, 18 x 12
 *   two TUNNELS, one cell wide, running from each mouth straight back under
 *        tiers 7 and 6 (ceilings 3 and 6 rungs — a doorway, then head room),
 *        walled on both sides by the tiers themselves, into a LOCKER ROOM
 *        three cells deep and six wide under tiers 5, 4 and 3 (ceilings 9, 12,
 *        15 — the grandstand's underside rising over your head). Tunnel and
 *        room are the deck char 'n' with floor:deck tokens — a deck lives on a
 *        deck char — so the crowd keeps its seats on the roof and a fighter
 *        walks the floor. In each room: a stall with its merchant (the
 *        Market), an anvil (the Forge — forge, refine, slot), a cauldron (the
 *        Apothecary's materia bench), an armour stand (the Armory — take gear
 *        off and put better on), and a BED, whose use is not a room at all: it
 *        is the loop itself. "The player should walk back to the locker room.
 *        choose to use any of the NPCs to buy items or refine gears, then when
 *        using the bed they should then be prompted to join the next fight"
 *        (owner, 2026-09-09) — so 'rest' is read by ArenaBootstrap.TakeArenaUse
 *        and by nothing else.
 *
 * Every rule about what these chars and tokens mean lives in the game
 * (LevelModel, ArenaField.FromChart); this file decides nothing and validates
 * through the same map-pack-validate.js the sync gates on.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const W = 36, H = 30, TIERS = 7, RUNG = 3;          // a tier is one block: three rungs
const g = Array.from({ length: H }, () => Array(W).fill('#'));
const lv = Array.from({ length: H }, () => Array(W).fill('.'));
const seats = new Set();
const put = (x, y, c) => { g[y][x] = c; };
const level = (x, y, tok) => { lv[y][x] = String(tok); };
const ring = (inset, fn) => {
  const x0 = inset, y0 = inset, x1 = W - 1 - inset, y1 = H - 1 - inset;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++)
    if (x === x0 || x === x1 || y === y0 || y === y1) fn(x, y);
};
const tierLevel = (inset) => RUNG * (TIERS + 1 - inset);   // inset 1 → 21 … inset 7 → 3

// The tiers: seven rings, one block up each, every cell a seat.
for (let i = 1; i <= TIERS; i++) {
  ring(i, (x, y) => { put(x, y, '.'); level(x, y, tierLevel(i)); seats.add(`${x},${y}`); });
}
// The fence at the edge of the lists, then the lists.
const FENCE = TIERS + 1;                           // inset 8
ring(FENCE, (x, y) => put(x, y, 'b'));
const L0 = FENCE + 1;                              // the lists' first column and row (9)
for (let y = L0; y <= H - 1 - L0; y++) for (let x = L0; x <= W - 1 - L0; x++) put(x, y, '.');
const midX = Math.floor(W / 2) - 1;                // 17
const midY = Math.floor(H / 2) - 1;                // 14 — the tunnels run on this row

// The tunnels and the locker rooms, dug under the stands.
const roomRows = [midY - 2, midY - 1, midY, midY + 1, midY + 2, midY + 3];   // 12..17, six cells tall
function side(mirror) {
  const X = (x) => (mirror ? W - 1 - x : x);
  // The mouth: a door in the fence, on the tunnel's row. Barred for the bout.
  put(X(FENCE), midY, 'D');
  // The tunnel: one cell wide, under tiers 7 and 6 — ceilings 3 and 6.
  for (const inset of [TIERS, TIERS - 1]) {
    put(X(inset), midY, 'n'); level(X(inset), midY, '0:' + tierLevel(inset));
  }
  // The room: three cells deep under tiers 5, 4 and 3 — ceilings 9, 12, 15.
  for (const y of roomRows) {
    for (const inset of [TIERS - 2, TIERS - 3, TIERS - 4]) {
      put(X(inset), y, 'n'); level(X(inset), y, '0:' + tierLevel(inset));
    }
  }
}
side(false); side(true);

// Every station a locker room needs (owner, 2026-09-08): "upgrade their gear,
// slot it, craft/refine materia, and buy from an NPC standing at market
// table". The stall opens the Market and seats its merchant behind the counter
// (ArenaWorld.SeatTheCrowd), the anvil the Forge (forge, refine, slot), the
// cauldron the Apothecary's materia bench. A prop's y is its base line — the
// cell it stands in, plus one. The room spans x 3..5 (west), y 12..17; the
// tunnel enters at (5,14), and (3..5,14) stay clear for the walk in.
function stations(mirror) {
  const X = (x) => (mirror ? W - x : x);           // a continuous x, mirrored about the centre line
  return [
    { art: 'stall',        x: X(4.5), y: midY - 1, use: 'market',   label: 'Trade with the merchant' },
    { art: 'anvilBare',    x: X(3.5), y: midY + 2, use: 'anvil',    label: 'Work the anvil — forge, refine, slot' },
    { art: 'cauldronBoil', x: X(5.5), y: midY + 2, use: 'cauldron', label: 'Brew and refine materia' },
    { art: 'bed',          x: X(3.5), y: midY + 4, use: 'rest', label: 'Rest — then take the next bout' },
    { art: 'armorSteel',   x: X(5.5), y: midY + 4, use: 'armory', label: 'Change your gear' },
  ];
}

const seatList = [...seats].map((k) => k.split(',').map(Number)).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
const chart = {
  schema: 1,
  kind: 'arena',
  id: 'arena-stadium',
  name: 'The Stadium',
  theme: 'arena',
  grid: g.map((row) => row.join('')),
  levels: lv.map((row) => row.join(' ')),
  entry: [midX + 0.5, midY + 0.5],
  seats: seatList,
  props: [...stations(false), ...stations(true)],
};

const out = resolve('content/maps/arena-stadium.json');
writeFileSync(out, JSON.stringify(chart, null, 2) + '\n');
console.log(`wrote ${out}: ${W}x${H}, ${TIERS} tiers, ${chart.seats.length} seats, ${chart.props.length} props`);
