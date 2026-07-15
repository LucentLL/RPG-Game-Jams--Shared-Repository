// Seeded RNG factories + stateless dice/math helpers — extracted from crucible.js.
// Seeded random for consistent tile noise
function tileRng(seed) {
  var s = seed | 0;
  return function() { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

// Seeded RNG (mulberry32) — deterministic appearance per fighter.
function elementsRng(seed){ var s = (seed|0) || 1; return function(){ s = (s+0x6D2B79F5)|0; var t = s; t = Math.imul(t ^ (t>>>15), t|1); t ^= t + Math.imul(t ^ (t>>>7), t|61); return (((t ^ (t>>>14))>>>0) / 4294967296); }; }

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

export { tileRng, elementsRng, rollDice, statMod, matXpNeeded, randInt, pick };
