// ═══════════════════════════════════════════════════════════════════════════
// Gear generation — procedural loot pieces + the draft pool.
//
// Extracted from crucible.js (decomposition Phase 1). Builds gear instances
// (sockets, materia fill, links, material tier by round) and the 12-piece draft
// pool with guaranteed slot coverage. Depends only on already-modular data:
// GEAR_TYPES / GEAR_MATERIALS / weapon+shield type sets (data/gear.js), PLANETS
// (data/progression.js), and pick/randInt (engine/rng.js).
// ═══════════════════════════════════════════════════════════════════════════
import { pick, randInt } from '../engine/rng.js';
import { GEAR_TYPES, GEAR_MATERIALS, WEAPON_GEAR_TYPES, SHIELD_GEAR_TYPES } from '../data/gear.js';
import { PLANETS } from '../data/progression.js';

// ═══ GEAR GENERATION (§4) ═══
export function generateGearPiece(round){
  var gt=pick(GEAR_TYPES);
  return generateGearPieceOfType(gt,round);
}

export function generateDraftPool(round){
  // 12 pieces: guarantee at least 2 weapons, 1 shield, 2 body, 2 head, 2 lower
  var pool=[];
  var weaponTypes=GEAR_TYPES.filter(function(g){return g.pos==='Hand'&&WEAPON_GEAR_TYPES.indexOf(g.type)>=0});
  var shieldTypes=GEAR_TYPES.filter(function(g){return g.pos==='Hand'&&SHIELD_GEAR_TYPES.indexOf(g.type)>=0});
  var bodyTypes=GEAR_TYPES.filter(function(g){return g.pos==='Body'});
  var headTypes=GEAR_TYPES.filter(function(g){return g.pos==='Head'});
  var lowerTypes=GEAR_TYPES.filter(function(g){return g.pos==='Lower'});
  for(var w=0;w<2;w++)pool.push(generateGearPieceOfType(pick(weaponTypes),round));
  for(var s=0;s<1;s++)pool.push(generateGearPieceOfType(pick(shieldTypes),round));
  for(var b=0;b<2;b++)pool.push(generateGearPieceOfType(pick(bodyTypes),round));
  for(var h=0;h<2;h++)pool.push(generateGearPieceOfType(pick(headTypes),round));
  for(var lo=0;lo<2;lo++)pool.push(generateGearPieceOfType(pick(lowerTypes),round));
  // Fill remaining randomly
  for(var i=0;i<3;i++)pool.push(generateGearPiece(round));
  // Shuffle
  for(var j=pool.length-1;j>0;j--){
    var k=Math.floor(Math.random()*(j+1));
    var t=pool[j];pool[j]=pool[k];pool[k]=t;
  }
  return pool;
}

export function generateGearPieceOfType(gt,round){
  var tier=Math.min(6,round-1);
  var sockets=randInt(gt.sMin,gt.sMax);
  // Fill rate scales with round: R1=40%, R3=65%, R5=85%, R7=100%
  var fillChance=Math.min(1.0,0.3+round*0.1);
  var materia=[];
  for(var i=0;i<sockets;i++){
    if(Math.random()<fillChance){
      var pIdx=randInt(0,PLANETS.length-1);
      var lvl=1;
      if(round>=5)lvl=randInt(2,Math.min(4,round-2));
      else if(round>=3)lvl=randInt(1,2);
      materia.push({planetIdx:pIdx,level:lvl,xp:0});
    }
  }
  // Links: only between adjacent filled sockets
  var maxLinks=Math.max(0,materia.length-1);
  var links=0;
  for(var j=0;j<maxLinks;j++){
    if(Math.random()<0.1+(round*0.06))links++;
  }
  var matArr=GEAR_MATERIALS[tier];
  return{
    id:Math.random().toString(36).substr(2,8),
    name:pick(matArr)+' '+gt.type,type:gt.type,pos:gt.pos,icon:gt.icon,
    sockets:sockets,materia:materia,links:links,
    tier:tier,refinement:0,stressed:false,scarred:false,noExterior:false
  };
}
