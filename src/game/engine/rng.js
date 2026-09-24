// Seeded RNG factories + stateless dice/math helpers — extracted from crucible.js.
// Seeded random for consistent tile noise
function tileRng(seed) {
  var s = seed | 0;
  return function() { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

// Seeded RNG (mulberry32) — deterministic appearance per fighter.
function elementsRng(seed){ var s = (seed|0) || 1; return function(){ s = (s+0x6D2B79F5)|0; var t = s; t = Math.imul(t ^ (t>>>15), t|1); t ^= t + Math.imul(t ^ (t>>>7), t|61); return (((t ^ (t>>>14))>>>0) / 4294967296); }; }

/**
 * WELL-MIXED 2D HASH — one lattice value for a pair of integers, 0..2^32-1.
 *
 * Naive xor-of-primes checkerboards on `% 2` variant picks, which is what this
 * replaced: the delve's floor-fill pick reads it per cell, and a hash with
 * structure in the low bit paints stripes. It lives HERE rather than beside its
 * first caller because it is now TWO facts' source — the tile pick AND the
 * world generator's value noise (world-gen.js) — and this file is the pure,
 * DOM-free home a node check and a C# mirror can both reach. It is already
 * ported and pinned on the Unity side as `TileAtlas.Hash2`, "the web's own
 * hash2 with its float64 emulated", so the two builds cannot drift.
 *
 * THE FLOAT64 IS LOAD-BEARING, NOT AN ACCIDENT. `x * 374761393` is a double
 * multiply that `|0` then truncates; a port that reaches for 32-bit integer
 * multiply gets different bits for large coordinates. @see reference
 * js-number-traps — pin against the numbers node printed, never a reading of
 * the source.
 */
function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = ((h ^ (h >>> 13)) * 1274126177) | 0;
  return (h ^ (h >>> 16)) >>> 0;
}

function rollDice(notation){
  var m=notation.match(/(\d+)d(\d+)/);
  if(!m)return 0;
  var n=parseInt(m[1]),d=parseInt(m[2]),total=0;
  for(var i=0;i<n;i++)total+=Math.floor(Math.random()*d)+1;
  return total;
}
function statMod(fighter,stat){return Math.floor((fighter.stats[stat]-10)/2)}
function matXpNeeded(level){return level*3}
function randInt(min,max){return Math.floor(Math.random()*(max-min+1))+min}
function pick(arr){return arr[Math.floor(Math.random()*arr.length)]}

export { tileRng, elementsRng, hash2, rollDice, statMod, matXpNeeded, randInt, pick };
