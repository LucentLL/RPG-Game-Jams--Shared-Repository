// ═══════════════════════════════════════════════════════════════════════════
// Combat AI — turn-based move & attack planners.
//
// Extracted from crucible.js (decomposition Phase 1). Parameterized by actor
// (K5): default to the classic p2-vs-p1, but the same brain can plan FOR p1 —
// Foolery (a disobedient hero) and the Watch/autopilot tier both point it at the
// player's fighter. Reads the shared fighters through S (state.js); depends only
// on the ATTACKS table and pick().
// ═══════════════════════════════════════════════════════════════════════════
import { S } from '../state.js';
import { ATTACKS } from '../data/attacks.js';
import { pick } from './rng.js';

// ═══ AI ═══
export function genAIMoves(self, foe){
  self = self || S.p2; foe = foe || S.p1;
  var q=[];var spd=self.speed;
  var atkName=pickAIAttack(self, foe);var atkRange=ATTACKS[atkName]?ATTACKS[atkName].range:1;
  var dist=Math.max(Math.abs(foe.x-self.x),Math.abs(foe.y-self.y));

  // Decide AI strategy: retreat if low HP, flank if close and smart, else pursue
  var useFlank = dist<=3 && self.hp>self.maxHp*0.4 && Math.random()<0.35;

  for(var i=0;i<spd;i++){
    // Placeholder dx/dy for preview (recalculated dynamically at execution)
    var dx=foe.x-self.x,dy=foe.y-self.y;
    var sdx=dx===0?0:Math.sign(dx),sdy=dy===0?0:Math.sign(dy);

    if(self.hp<self.maxHp*0.25&&dist<=2){
      q.push({dx:-sdx,dy:-sdy,type:'retreat'});
    } else if(dist<=atkRange&&atkRange>0){
      break; // In range — stop moving
    } else if(useFlank){
      q.push({dx:sdx,dy:sdy,type:'flank'});
    } else {
      q.push({dx:sdx,dy:sdy,type:'pursue'});
    }
  }
  return q;
}

export function pickAIAttack(self, foe){
  self = self || S.p2; foe = foe || S.p1;
  var attacks=self.attacks.slice();
  var dist=Math.max(Math.abs(foe.x-self.x),Math.abs(foe.y-self.y));
  if(self.hp<self.maxHp*0.4){var heals=attacks.filter(function(n){return ATTACKS[n]&&ATTACKS[n].special==='heal'});if(heals.length>0)return heals[0]}
  var valid=attacks.filter(function(n){var a=ATTACKS[n];return a&&(a.range===0||a.range>=dist)&&a.dice!=='0d0'});
  if(valid.length>0)return pick(valid);
  return attacks[0];
}
