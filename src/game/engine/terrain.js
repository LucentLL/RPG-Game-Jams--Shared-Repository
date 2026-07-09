// ═══════════════════════════════════════════════════════════════════════════
// Elevation & terrain system + BFS pathfinder + battlefield render.
//
// Extracted from crucible.js (engine decomposition, Phase B). The four mutable
// arena fields (elevation / passable / cost / name) live on the shared state
// object `S` (state.js), which mirrors them onto `window` — so crucible.js's
// remaining bare-name reads in the grid renderer keep working, and the combat
// engine reads/writes them through the exported helpers below.
// ═══════════════════════════════════════════════════════════════════════════
import { S } from '../state.js';
import { GS } from '../data/config.js';
import { BF_TEMPLATES } from '../data/arena-templates.js';
import { drawProceduralTile } from './procedural-tiles.js';

// ═══ ELEVATION & TERRAIN SYSTEM ═══

// Tile coordinate shortcuts — [col, row] in the 16x16 tile grid

export function generateArena(){
  var idx=Math.floor(Math.random()*BF_TEMPLATES.length);
  var tmpl=BF_TEMPLATES[idx];
  S.arenaName=tmpl.name;
  S.arenaElevation=tmpl.elevation;
  S.arenaPassable=tmpl.passable;
  S.arenaTerrainCost=tmpl.cost;
  console.log('Battlefield: '+S.arenaName);
  return tmpl.tiles;
}

export function isCellPassable(x,y){
  if(x<0||x>=GS||y<0||y>=GS)return false;
  if(!S.arenaPassable)return true;
  return S.arenaPassable[y][x]===1;
}

export function getCellCost(x,y){
  if(!S.arenaTerrainCost)return 1;
  if(x<0||x>=GS||y<0||y>=GS)return 99;
  return S.arenaTerrainCost[y][x];
}

export function getCellElevation(x,y){
  if(!S.arenaElevation)return 1;
  if(x<0||x>=GS||y<0||y>=GS)return 0;
  return S.arenaElevation[y][x];
}

export function canTraverseTerrain(fx,fy,tx,ty){
  if(!isCellPassable(tx,ty))return false;
  // Elevation no longer blocks movement — it affects combat (high ground advantage) instead
  return true;
}

// ═══ BFS PATHFINDER — returns {dx,dy} for first step toward target, or null if no path ═══
export function bfsNextStep(startX,startY,goalX,goalY,blockedX,blockedY){
  if(startX===goalX&&startY===goalY)return null;
  var dirs=[{x:0,y:-1},{x:0,y:1},{x:-1,y:0},{x:1,y:0},{x:-1,y:-1},{x:1,y:-1},{x:-1,y:1},{x:1,y:1}];
  var visited={};
  var key=function(x,y){return x+','+y};
  var queue=[{x:startX,y:startY,firstDx:0,firstDy:0,steps:0}];
  visited[key(startX,startY)]=true;
  while(queue.length>0){
    var cur=queue.shift();
    for(var i=0;i<dirs.length;i++){
      var nx=cur.x+dirs[i].x,ny=cur.y+dirs[i].y;
      if(nx<0||nx>=GS||ny<0||ny>=GS)continue;
      if(visited[key(nx,ny)])continue;
      if(!canTraverseTerrain(cur.x,cur.y,nx,ny))continue;
      var firstDx=cur.steps===0?dirs[i].x:cur.firstDx;
      var firstDy=cur.steps===0?dirs[i].y:cur.firstDy;
      // GOAL before the occupancy skip: pursuing targets the tile the other fighter
      // STANDS ON (goal === blocked), so testing blocked first made a stationary
      // target unreachable — BFS exhausted the map, returned null, and pursue
      // silently no-oped (both sides pursuing = a permanent standoff).
      if(nx===goalX&&ny===goalY){
        return{dx:firstDx,dy:firstDy};
      }
      if(nx===blockedX&&ny===blockedY)continue; // can't move THROUGH the other fighter
      visited[key(nx,ny)]=true;
      queue.push({x:nx,y:ny,firstDx:firstDx,firstDy:firstDy,steps:cur.steps+1});
    }
  }
  return null; // no path found
}

export function renderBattlefield(arenaGrid){
  var cellPx=80;
  var cv=document.createElement('canvas');
  cv.width=GS*cellPx;cv.height=GS*cellPx;
  var ctx=cv.getContext('2d');
  ctx.imageSmoothingEnabled=false;
  for(var r=0;r<GS;r++){
    for(var c=0;c<GS;c++){
      var pick=arenaGrid[r][c];
      drawProceduralTile(ctx, pick, c*cellPx, r*cellPx, cellPx, r, c);
    }
  }
  if(S.arenaElevation){
    for(var r=0;r<GS;r++){
      for(var c=0;c<GS;c++){
        if(S.arenaElevation[r][c]===0 && S.arenaPassable[r][c]===1){
          ctx.fillStyle='rgba(20,60,140,0.35)';
          ctx.fillRect(c*cellPx,r*cellPx,cellPx,cellPx);
          ctx.strokeStyle='rgba(80,160,255,0.3)';
          ctx.lineWidth=2;
          ctx.beginPath();
          ctx.moveTo(c*cellPx+8,r*cellPx+cellPx*0.4);
          ctx.quadraticCurveTo(c*cellPx+cellPx*0.5,r*cellPx+cellPx*0.3,c*cellPx+cellPx-8,r*cellPx+cellPx*0.4);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(c*cellPx+12,r*cellPx+cellPx*0.7);
          ctx.quadraticCurveTo(c*cellPx+cellPx*0.5,r*cellPx+cellPx*0.6,c*cellPx+cellPx-12,r*cellPx+cellPx*0.7);
          ctx.stroke();
        }
        if(S.arenaPassable[r][c]===0){
          ctx.fillStyle='rgba(0,0,0,0.15)';
          ctx.fillRect(c*cellPx,r*cellPx,cellPx,cellPx);
        }
      }
    }
  }
  var grid=document.getElementById('grid');
  if(grid){
    grid.style.backgroundImage='url('+cv.toDataURL()+')';
    grid.style.backgroundSize='100% 100%';
    grid.style.imageRendering='pixelated';
  }
}
