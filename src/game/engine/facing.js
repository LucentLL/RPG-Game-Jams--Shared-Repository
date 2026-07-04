// Facing & zone geometry (8-compass facings) — extracted from crucible.js.
// faceBothFighters is the only stateful helper (reads/writes S.p1/S.p2);
// the rest is pure geometry over passed-in entities.
import { GS } from '../data/config.js';
import { S } from '../state.js';

function facingToRow(angle) {
  // Convert game's radian facing to Mana Seed spritesheet row
  // Game: atan2(dx,-dy) → 0=target above, PI=target below, PI/2=right, -PI/2=left
  // Spritesheet rows: 0=South(front), 1=East(right), 2=West(left), 3=North(back)
  var deg = ((angle * 180 / Math.PI) % 360 + 360) % 360;
  if (deg > 315 || deg <= 45) return 3;     // target above → face up (show back)
  if (deg > 45 && deg <= 135) return 2;     // target right → face right (East, row 2)
  if (deg > 135 && deg <= 225) return 0;    // target below → face down (South, row 0)
  return 1;                                  // target left → face left (West, row 1)
}

function facingAngle(dx,dy){
  if(dx===0&&dy===0)return 0;
  return Math.atan2(dx,-dy);
}
function faceBothFighters(){
  if(!S.p1||!S.p2)return;
  if(S.p1.hp>0&&S.p2.hp>0){
    S.p1.facing=facingAngle(S.p2.x-S.p1.x,S.p2.y-S.p1.y);
    S.p2.facing=facingAngle(S.p1.x-S.p2.x,S.p1.y-S.p2.y);
  }
}

// ═══ FACING ZONES (Front/Side/Rear) ═══
// Uses the radian-based facing system to classify adjacent tiles
function angleDiff(a, b) {
  var d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

function getZone(defender, tileX, tileY) {
  // Returns 'front', 'side', or 'rear' for a tile relative to defender's facing
  var dx = tileX - defender.x, dy = tileY - defender.y;
  if (dx === 0 && dy === 0) return 'self';
  var tileAngle = Math.atan2(dx, -dy); // same convention as facingAngle
  var diff = Math.abs(angleDiff(tileAngle, defender.facing));
  if (diff <= Math.PI * 0.375) return 'front';  // ~67.5° cone
  if (diff >= Math.PI * 0.625) return 'rear';    // ~67.5° cone behind
  return 'side';
}

function getAdjacentTilesByZone(entity, zone) {
  var tiles = [];
  for (var dx = -1; dx <= 1; dx++) {
    for (var dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      var tx = entity.x + dx, ty = entity.y + dy;
      if (tx < 0 || tx >= GS || ty < 0 || ty >= GS) continue;
      if (getZone(entity, tx, ty) === zone) tiles.push({x: tx, y: ty});
    }
  }
  return tiles;
}

function isRearTile(entity, tx, ty) { return getZone(entity, tx, ty) === 'rear'; }
function isFrontTile(entity, tx, ty) { return getZone(entity, tx, ty) === 'front'; }

export {
  facingToRow, facingAngle, faceBothFighters, angleDiff,
  getZone, getAdjacentTilesByZone, isRearTile, isFrontTile,
};
