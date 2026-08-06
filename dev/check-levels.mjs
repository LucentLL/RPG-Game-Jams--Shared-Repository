/**
 * The height-law audit — run after touching the level model or any chart:
 *   node --import ./dev/register-vite-env.mjs dev/check-levels.mjs
 *
 * Two duties, like check-volumes.mjs:
 * 1. The LAW: makeLevelModel's answers on canonical shapes (terrace chains,
 *    the trench vine, tunnel bores, bridges) must never drift.
 * 2. The CHARTS: every shipped grid must resolve — no climb serving a jump of
 *    more than one level, no deck with no way onto it, no surface an entry or
 *    spawn can't stand at.
 */
import { makeLevelModel, DELVE_MAPS, CLIMB_CH, DECK_CH } from '../src/guild/delve-maps.js';

let fails = 0;
const ok = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) return;
  fails++;
  console.log('  FAIL', name, '— got', g, 'want', w);
};

// ── 1. The law, on canonical ground ─────────────────────────────────────────

{ // The shipped ledge grammar, verbatim (Sparring Ring shape).
  const m = makeLevelModel(DELVE_MAPS.arena.grid);
  ok('arena: tier reads level 1', m.floorAt(5, 2), 1);
  ok('arena: ladder derives level 0', m.floorAt(3, 3), 0);
  ok('arena: strolling onto the tier is refused', m.pickSurface(0, 5, 4, 5, 2), null);
  ok('arena: the ladder serves it', m.pickSurface(0, 3, 3, 3, 2), 1);
  ok('arena: dropping off is free', m.pickSurface(1, 5, 2, 5, 3), 0);
  ok('arena: a wall stands nobody', m.floorAt(1, 1), null);
}
{ // Terrace chain — one rung per climb, never a leap. The chain is walled:
  // a stair also touching open low ground would honestly stand there instead.
  const m = makeLevelModel(['#########', '#...S^S2#', '#########']);
  ok('stairs derive the landing below', [m.floorAt(4, 1), m.floorAt(6, 1)], [0, 1]);
  ok('chain climbs 0→1', m.pickSurface(0, 4, 1, 5, 1), 1);
  ok('chain climbs 1→2', m.pickSurface(1, 6, 1, 7, 1), 2);
  ok('no leap 0→2', m.pickSurface(0, 4, 1, 7, 1), null);
}
{ // The abyss vine — a pit you drop into and climb out of.
  const m = makeLevelModel(['#####', '#.,.#', '#.v.#', '#####']);
  ok('trench reads −1', m.floorAt(2, 1), -1);
  ok('vine hangs at trench level', m.floorAt(2, 2), -1);
  ok('dropping in is free', m.pickSurface(0, 1, 1, 2, 1), -1);
  ok('the vine is the way out', m.pickSurface(-1, 2, 2, 1, 2), 0);
  ok('a bare wall is not', m.pickSurface(-1, 2, 1, 1, 1), null);
}
{ // Tunnel bore: passage at 0 under a rock deck at 2, both walkable.
  const m = makeLevelModel(['#######', '#.....#', '#22u22#', '#.....#', '#######']);
  ok('bore ground 0 / deck 2', [m.floorAt(3, 2), m.deckAt(3, 2)], [0, 2]);
  ok('two surfaces', m.surfacesAt(3, 2), [0, 2]);
  ok('walk under from the south', m.pickSurface(0, 3, 3, 3, 2), 0);
  ok('walk over from the ridge', m.pickSurface(2, 2, 2, 3, 2), 2);
}
{ // Bridge at grade over a creek: deck only — one step of water is no headroom.
  const m = makeLevelModel(['#######', '#..,..#', '#..n..#', '#..,..#', '#######']);
  ok('creek bridge floor −1 / deck 0', [m.floorAt(3, 2), m.deckAt(3, 2)], [-1, 0]);
  ok('deck only', m.surfacesAt(3, 2), [0]);
  ok('cross at grade', m.pickSurface(0, 2, 2, 3, 2), 0);
  ok('no crawling under one step of bridge', m.pickSurface(-1, 3, 1, 3, 2), null);
}
{ // Bridge between terraces over open ground — the room-over-room Doom lacked.
  const m = makeLevelModel(['#######', '#.....#', '#22n22#', '#.....#', '#######']);
  ok('span holds deck 2 over ground 0', [m.floorAt(3, 2), m.deckAt(3, 2)], [0, 2]);
  ok('under AND over', m.surfacesAt(3, 2), [0, 2]);
}
{ // A long span holds its height mid-air (the flood must carry it).
  const m = makeLevelModel(['#########', '#.......#', '#2nnnnn2#', '#.......#', '#########']);
  ok('mid-span deck still 2', m.deckAt(4, 2), 2);
  ok('mid-span ground still 0', m.floorAt(4, 2), 0);
}
{ // A stair ON a gallery beside the gallery's own ladder must stand at the
  // gallery's level, not chain down through the ladder to the floor below.
  const m = makeLevelModel(['#####', '#^2^#', '#^S^#', '#.L.#', '#####']);
  ok('gallery ladder derives 0', m.floorAt(2, 3), 0);
  ok('gallery stair derives 1', m.floorAt(2, 2), 1);
  ok('stair serves the crow\'s nest', m.pickSurface(1, 2, 2, 2, 1), 2);
}
{ // A vein is rock continuous with the ground it stands in: authored in a
  // terrace flank it opens (when mined) AT the terrace, not into a pit.
  const m = makeLevelModel(['#####', '#^^^#', '#^o^#', '#^^^#', '#####']);
  ok('flank vein derives the terrace level', m.floorAt(2, 2), 1);
}
{ // A grade vein still opens at grade (Hollowvein's seams).
  const m = makeLevelModel(['#####', '#...#', '#.o.#', '#####']);
  ok('grade vein derives 0', m.floorAt(2, 2), 0);
}

// ── 2. The shipped charts must resolve ──────────────────────────────────────

const ORTH = [[0, -1], [0, 1], [-1, 0], [1, 0]];
for (const [id, map] of Object.entries(DELVE_MAPS)) {
  if (!map || !map.grid) continue;
  const m = makeLevelModel(map.grid);
  const at = (x, y) => (map.grid[y] || '')[x];
  for (let y = 0; y < m.rows; y++) {
    for (let x = 0; x < m.cols; x++) {
      const ch = at(x, y);
      if (CLIMB_CH[ch]) {
        // A climb must serve something: some neighbour exactly one above it.
        const lv = m.floorAt(x, y);
        const served = ORTH.some(([dx, dy]) => {
          const s = m.surfacesAt(x + dx, y + dy);
          return s.includes(lv + 1);
        });
        if (!served) { fails++; console.log(`  FAIL ${id}: climb '${ch}' at ${x},${y} serves no level ${lv + 1} neighbour`); }
      }
      if (DECK_CH[ch] && m.deckAt(x, y) != null) {
        // A deck must be reachable: some neighbour stands at deck level.
        const d = m.deckAt(x, y);
        const reach = ORTH.some(([dx, dy]) => m.surfacesAt(x + dx, y + dy).includes(d));
        if (!reach) { fails++; console.log(`  FAIL ${id}: deck at ${x},${y} (level ${d}) has no approach`); }
      }
    }
  }
  const [ex, ey] = map.entry || [];
  if (ex != null && !m.surfacesAt(Math.floor(ex), Math.floor(ey)).length) {
    fails++; console.log(`  FAIL ${id}: entry stands at no surface`);
  }
  for (const s of map.spawns || []) {
    if (!m.surfacesAt(Math.floor(s.x), Math.floor(s.y)).length) {
      fails++; console.log(`  FAIL ${id}: spawn ${s.prey} at ${s.x},${s.y} stands at no surface`);
    }
  }
}

if (fails) { console.log(`\ncheck-levels: ${fails} FAILURES`); process.exit(1); }
console.log('check-levels: the height law holds.');
