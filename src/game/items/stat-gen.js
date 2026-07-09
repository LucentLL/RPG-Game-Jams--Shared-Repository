// ═══════════════════════════════════════════════════════════════════════════
// Stat generation — the roguelike/D&D fighter roll + derived stats.
//
// Extracted from crucible.js (decomposition Phase 1). Pure functions over Math:
// rollStats() rolls 8 + (3d6 keep-highest-2) per ability; deriveStats() turns
// an ability block into HP / AC / speed / proficiency. Zero dependencies.
// (Note: the guild layer uses its own Monster-Rancher stat model — this is the
// engine's D&D-style roll, used by the roguelike run and opponent generation.)
// ═══════════════════════════════════════════════════════════════════════════

// ═══ STAT GENERATION (§3) ═══
export function rollStats(){
  var stats={};
  ['STR','DEX','CON','INT','WIS','CHA'].forEach(function(s){
    // 8 + sum(3d6 keep highest 2)
    var rolls=[];
    for(var i=0;i<3;i++)rolls.push(Math.floor(Math.random()*6)+1);
    rolls.sort(function(a,b){return b-a});
    stats[s]=8+rolls[0]+rolls[1];
  });
  return stats;
}

export function deriveStats(stats){
  var dexMod=Math.floor((stats.DEX-10)/2);
  return{
    hp:20+stats.CON*2,
    ac:10+dexMod,
    speed:Math.max(2,Math.min(6,3+dexMod)),
    proficiency:2
  };
}
