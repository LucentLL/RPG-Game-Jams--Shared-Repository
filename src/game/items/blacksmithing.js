// Blacksmithing success-chance math — extracted from crucible.js.
import { REFINE_TABLE, MAX_REFINEMENT, MAX_SOCKETS } from '../data/gear.js';

function gearLevel(gear){
  // tier 0-1 → Lv1, tier 2-3 → Lv2, tier 4 → Lv3, tier 5-6 → Lv4
  var t=gear.tier||0;
  if(t<=1)return 1;
  if(t<=3)return 2;
  if(t===4)return 3;
  return 4;
}

function getRefineChance(gear){
  var lvl=gearLevel(gear);var row=gear.refinement||0;
  if(row>=MAX_REFINEMENT)return 0;
  if(row>=REFINE_TABLE.length)return 0;
  var base=REFINE_TABLE[row][lvl-1];
  // Cross-penalty: each filled socket -10%, each link -5%
  var penalty=gear.materia.length*10+gear.links*5;
  return Math.max(1,base-penalty);
}

function getDrillChance(gear){
  var lvl=gearLevel(gear);var row=gear.sockets; // current socket count as difficulty index
  if(row>=MAX_SOCKETS)return 0;
  if(row>=REFINE_TABLE.length)return 0;
  var base=REFINE_TABLE[row][lvl-1];
  // Cross-penalty: each +1 refinement -10%
  var penalty=(gear.refinement||0)*10;
  return Math.max(1,base-penalty);
}

function getLinkChance(gear){
  var lvl=gearLevel(gear);var row=gear.links; // current link count as difficulty index
  if(row>=REFINE_TABLE.length)return 0;
  var base=REFINE_TABLE[row][lvl-1];
  // Cross-penalty: refinement -10%, sockets -5%
  var penalty=(gear.refinement||0)*10+gear.sockets*5;
  return Math.max(1,base-penalty);
}

export { gearLevel, getRefineChance, getDrillChance, getLinkChance };
