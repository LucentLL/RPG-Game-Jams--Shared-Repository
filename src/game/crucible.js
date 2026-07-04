// ═══════════════════════════════════════════════════════════════════════════
// The Crucible — game logic (transitional monolith).
//
// Extracted verbatim from crucible_athanor_v13_01.html and adapted to run as an
// ES module under Vite. The ONLY changes from the original <script> are:
//   1. this header + the asset-base import below,
//   2. the three asset-path constants now reference ../config/assets.js, and
//   3. the window bridge at the end (exposes inline-handler fns to the markup).
//
// This file is deliberately still one module. ARCHITECTURE.md carries the
// function-level roadmap for splitting it into src/game/{engine,data,items,
// screens} and a shared src/game/state.js — done incrementally so the game
// keeps running at every step.
// ═══════════════════════════════════════════════════════════════════════════
import { SPRITE_BASES, MATERIA_BASE, FX_BASE } from '../config/assets.js';
import './state.js'; // shared mutable game state (bridged onto window for legacy bare-name access)
import {
  BODY_TYPES, ELEMENTS_LAYER_ORDER_SOUTH, ELEMENTS_LAYER_ORDER_SIDE, ELEMENTS_LAYER_ORDER_NORTH,
  ELEMENTS_LAYER_ORDER, ELEMENTS_LAYER_ORDER_REV, WEAPON_MIRROR_OK_ANIMS,
  _PASSIVE_ANIMS, _PASSIVE_FALLBACK_COLS, _ACTIVE_FALLBACK_COLS,
  ELEMENTS_ANIMS, ELEMENTS_MANIFEST, PRIME_PALETTE_BIAS,
  ELEMENTS_SKIN_SOURCE, ELEMENTS_SKIN_TONES, ELEMENTS_FIXED_LAYERS, ELEMENTS_HAT_OPEN_TOP,
  SPRITE_ANIMS, BOB_EXCITE_ANIMS, BOB_EXCITE_DURATION_MS, FACINGS,
} from './data/sprite-tables.js';

// --- Extracted data modules (decomposition phase A, cont.) --------------------
import {
  GS, MATERIA_MAX_LVL, MATERIA_DUST_COST, TOTAL_ROUNDS, TILE_SIZE, TILE_COLS, battlefieldTileset,
  ELEMENTS_CELL, ELEMENTS_COLS, ELEMENTS_ROWS, CAST_FX_COUNT, CAST_FX_FRAME_MS,
  ORB_BASE_PATH, ORB_CELL, ORB_COLS, ORB_ROWS, SPRITE_CELL, SPRITE_COLS, SPRITE_ROWS,
  ACTION_TILE, ACTION_GS, MOVE_PHASE,
} from './data/config.js';
import { ORB_FRAMES, PLANET_TO_ORB_COLOR, ORB_COLORS, GEAR_WEAPON_LADDER, GEAR_BODY_LADDER, GEAR_HEAD_LADDER, GEAR_LOWER_LADDER } from './data/orb-tables.js';

// --- Extracted leaf modules (decomposition phase A) ---------------------------
import { PLANETS, COMPOUNDS, ROUND_METALS, RANKS } from './data/progression.js';
import {
  GEAR_TYPES, EQUIP_SLOTS, GEAR_MATERIALS, REFINE_TABLE,
  MAX_REFINEMENT, MAX_SOCKETS, WEAPON_GEAR_TYPES, SHIELD_GEAR_TYPES,
} from './data/gear.js';
import { BASIC_ATTACK, ALL_ATTACKS, ATTACKS } from './data/attacks.js';
import {
  G, CTL, CT, CTR, CFL, CF, CFR, CWL, CW, CWR, WL, W, WR, WBL, WB, WBR, RK1, RK2, FL1, FL2,
  BF_TEMPLATES,
} from './data/arena-templates.js';
import { gearLevel, getRefineChance, getDrillChance, getLinkChance } from './items/blacksmithing.js';
import { tileRng, elementsRng, rollDice, statMod, matXpNeeded, randInt, pick } from './engine/rng.js';

// ══════════════════════════════════════════════════════════════
// THE CRUCIBLE — ATHANOR MODE v1.0
// ══════════════════════════════════════════════════════════════

// ═══ CONSTANTS ═══





// Three body archetypes — flavor the procedural appearance / palette bias.

// ═══ GENTLE FOREST BATTLEFIELD TILESET ═══

// === PROCEDURAL TILE RENDERER ===
// Replaces Mana Seed tileset with canvas-drawn tiles


function drawProceduralTile(ctx, tileType, x, y, size, row, col) {
  var rng = tileRng(row * 137 + col * 311 + tileType[0] * 17 + tileType[1] * 53);
  var tx = tileType[0], ty = tileType[1];
  
  // Identify tile by its coordinate signature
  if (ty === 0 && tx === 0) {
    // GRASS
    drawGrass(ctx, x, y, size, rng);
  } else if (ty === 3) {
    // CLIFF TOP EDGE
    drawGrass(ctx, x, y, size, rng);
    drawCliffTop(ctx, x, y, size, tx, rng);
  } else if (ty === 5) {
    // CLIFF FACE
    drawCliffFace(ctx, x, y, size, tx, rng);
  } else if (ty === 6) {
    // CLIFF-WATER junction
    drawWater(ctx, x, y, size, rng);
    drawCliffWaterEdge(ctx, x, y, size, tx, rng);
  } else if (ty === 7) {
    // WATER
    drawWater(ctx, x, y, size, rng);
  } else if (ty === 8) {
    // WATER BOTTOM
    drawGrass(ctx, x, y, size, rng);
    drawWaterBottom(ctx, x, y, size, tx, rng);
  } else if (ty === 1 && tx >= 6 && tx <= 7) {
    // ROCKS
    drawGrass(ctx, x, y, size, rng);
    drawRock(ctx, x, y, size, rng, tx - 6);
  } else if (ty === 1 && tx >= 8 && tx <= 9) {
    // FLOWERS
    drawGrass(ctx, x, y, size, rng);
    drawFlowers(ctx, x, y, size, rng, tx - 8);
  } else {
    drawGrass(ctx, x, y, size, rng);
  }
}

function drawGrass(ctx, x, y, size, rng) {
  // Base grass color
  ctx.fillStyle = '#3a6e2c';
  ctx.fillRect(x, y, size, size);
  
  // Pixel noise for texture
  var step = Math.max(4, size / 16);
  for (var py = 0; py < size; py += step) {
    for (var px = 0; px < size; px += step) {
      var r = rng();
      var brightness = 0.85 + r * 0.3;
      var g = Math.floor(110 * brightness);
      var rb = Math.floor(58 * brightness);
      var b = Math.floor(44 * brightness);
      ctx.fillStyle = 'rgb(' + rb + ',' + g + ',' + b + ')';
      ctx.fillRect(x + px, y + py, step, step);
    }
  }
  
  // Subtle grass blades
  ctx.strokeStyle = 'rgba(80,140,50,0.4)';
  ctx.lineWidth = 1;
  for (var i = 0; i < 6; i++) {
    var bx = x + rng() * size;
    var by = y + rng() * size;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + (rng() - 0.5) * 6, by - 4 - rng() * 6);
    ctx.stroke();
  }
}

function drawCliffTop(ctx, x, y, size, tx, rng) {
  // Draw cliff edge at bottom of tile
  var edgeY = y + size * 0.6;
  
  // Stone color
  ctx.fillStyle = '#8b7355';
  ctx.fillRect(x, edgeY, size, size - size * 0.6);
  
  // Darker edge line
  ctx.fillStyle = '#6b5335';
  ctx.fillRect(x, edgeY, size, 3);
  
  // Corner handling
  if (tx === 0) { // left corner
    ctx.fillStyle = '#3a6e2c';
    ctx.fillRect(x, edgeY, size * 0.15, size * 0.4);
  } else if (tx === 3) { // right corner
    ctx.fillStyle = '#3a6e2c';
    ctx.fillRect(x + size * 0.85, edgeY, size * 0.15, size * 0.4);
  }
  
  // Stone texture
  for (var i = 0; i < 4; i++) {
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fillRect(x + rng() * size * 0.8, edgeY + 4 + rng() * (size * 0.3), 
                 4 + rng() * 8, 2 + rng() * 4);
  }
}

function drawCliffFace(ctx, x, y, size, tx, rng) {
  // Full stone face
  ctx.fillStyle = '#7a6345';
  ctx.fillRect(x, y, size, size);
  
  // Vertical streaks
  for (var i = 0; i < 5; i++) {
    var sx = x + rng() * size;
    ctx.fillStyle = 'rgba(0,0,0,' + (0.05 + rng() * 0.1) + ')';
    ctx.fillRect(sx, y, 2 + rng() * 4, size);
  }
  
  // Stone texture blocks
  for (var i = 0; i < 6; i++) {
    ctx.fillStyle = rng() > 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
    ctx.fillRect(x + rng() * size * 0.8, y + rng() * size * 0.8,
                 6 + rng() * 12, 4 + rng() * 8);
  }
  
  // Edge handling
  if (tx === 0) {
    ctx.fillStyle = '#5a4325';
    ctx.fillRect(x, y, 3, size);
  } else if (tx === 3) {
    ctx.fillStyle = '#5a4325';
    ctx.fillRect(x + size - 3, y, 3, size);
  }
}

function drawWater(ctx, x, y, size, rng) {
  // Deep water base
  ctx.fillStyle = '#1a3a5c';
  ctx.fillRect(x, y, size, size);
  
  // Water noise
  var step = Math.max(4, size / 12);
  for (var py = 0; py < size; py += step) {
    for (var px = 0; px < size; px += step) {
      var r = rng();
      ctx.fillStyle = 'rgba(' + (r > 0.5 ? '40,100,160' : '20,60,120') + ',0.3)';
      ctx.fillRect(x + px, y + py, step, step);
    }
  }
  
  // Wave highlights
  ctx.strokeStyle = 'rgba(100,180,255,0.25)';
  ctx.lineWidth = 1.5;
  for (var i = 0; i < 3; i++) {
    var wy = y + size * 0.2 + i * size * 0.3;
    ctx.beginPath();
    ctx.moveTo(x + 4, wy);
    ctx.quadraticCurveTo(x + size * 0.5, wy - 3 + rng() * 6, x + size - 4, wy);
    ctx.stroke();
  }
}

function drawCliffWaterEdge(ctx, x, y, size, tx, rng) {
  // Cliff meets water - stone at top
  ctx.fillStyle = '#6b5335';
  ctx.fillRect(x, y, size, size * 0.35);
  
  // Shadow under cliff
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(x, y + size * 0.35, size, size * 0.15);
  
  if (tx === 0) {
    ctx.fillStyle = '#5a4325';
    ctx.fillRect(x, y, 3, size);
  } else if (tx === 3) {
    ctx.fillStyle = '#5a4325';
    ctx.fillRect(x + size - 3, y, 3, size);
  }
}

function drawWaterBottom(ctx, x, y, size, tx, rng) {
  // Water-to-grass transition at top of tile
  ctx.fillStyle = '#1a3a5c';
  ctx.fillRect(x, y, size, size * 0.4);
  
  // Shore gradient
  ctx.fillStyle = 'rgba(58,110,44,0.3)';
  ctx.fillRect(x, y + size * 0.25, size, size * 0.15);
  
  // Foam line
  ctx.fillStyle = 'rgba(200,220,255,0.3)';
  ctx.fillRect(x, y + size * 0.35, size, 2);
  
  if (tx === 0) {
    ctx.fillStyle = '#3a6e2c';
    ctx.fillRect(x, y, size * 0.15, size * 0.4);
  } else if (tx === 3) {
    ctx.fillStyle = '#3a6e2c';
    ctx.fillRect(x + size * 0.85, y, size * 0.15, size * 0.4);
  }
}

function drawRock(ctx, x, y, size, rng, variant) {
  var cx = x + size * 0.5;
  var cy = y + size * 0.55;
  var rx = size * (0.25 + variant * 0.05);
  var ry = size * 0.2;
  
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(cx + 2, cy + 3, rx, ry * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  
  // Rock body
  ctx.fillStyle = '#706050';
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  
  // Highlight
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.beginPath();
  ctx.ellipse(cx - rx * 0.2, cy - ry * 0.3, rx * 0.5, ry * 0.4, -0.3, 0, Math.PI * 2);
  ctx.fill();
}

function drawFlowers(ctx, x, y, size, rng, variant) {
  var colors = variant === 0 ? 
    ['#e8d040','#f0e060','#d0b030'] : 
    ['#d050a0','#e070b0','#c04090'];
  
  for (var i = 0; i < 4 + Math.floor(rng() * 3); i++) {
    var fx = x + size * 0.15 + rng() * size * 0.7;
    var fy = y + size * 0.15 + rng() * size * 0.7;
    var fr = 2 + rng() * 3;
    
    // Stem
    ctx.strokeStyle = '#2a5e1c';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(fx, fy + fr);
    ctx.lineTo(fx, fy + fr + 4 + rng() * 4);
    ctx.stroke();
    
    // Petals
    ctx.fillStyle = colors[Math.floor(rng() * colors.length)];
    ctx.beginPath();
    ctx.arc(fx, fy, fr, 0, Math.PI * 2);
    ctx.fill();
    
    // Center
    ctx.fillStyle = 'rgba(255,255,200,0.6)';
    ctx.beginPath();
    ctx.arc(fx, fy, fr * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
}


// ═══ ELEVATION & TERRAIN SYSTEM ═══
var arenaElevation=null;
var arenaPassable=null;
var arenaTerrainCost=null;
var arenaName='';

// Tile coordinate shortcuts — [col, row] in the 16x16 tile grid

function generateArena(){
  var idx=Math.floor(Math.random()*BF_TEMPLATES.length);
  var tmpl=BF_TEMPLATES[idx];
  arenaName=tmpl.name;
  arenaElevation=tmpl.elevation;
  arenaPassable=tmpl.passable;
  arenaTerrainCost=tmpl.cost;
  console.log('Battlefield: '+arenaName);
  return tmpl.tiles;
}

function isCellPassable(x,y){
  if(x<0||x>=GS||y<0||y>=GS)return false;
  if(!arenaPassable)return true;
  return arenaPassable[y][x]===1;
}

function getCellCost(x,y){
  if(!arenaTerrainCost)return 1;
  if(x<0||x>=GS||y<0||y>=GS)return 99;
  return arenaTerrainCost[y][x];
}

function getCellElevation(x,y){
  if(!arenaElevation)return 1;
  if(x<0||x>=GS||y<0||y>=GS)return 0;
  return arenaElevation[y][x];
}

function canTraverseTerrain(fx,fy,tx,ty){
  if(!isCellPassable(tx,ty))return false;
  // Elevation no longer blocks movement — it affects combat (high ground advantage) instead
  return true;
}

// ═══ BFS PATHFINDER — returns {dx,dy} for first step toward target, or null if no path ═══
function bfsNextStep(startX,startY,goalX,goalY,blockedX,blockedY){
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
      if(nx===blockedX&&ny===blockedY)continue; // can't move through the other fighter
      var firstDx=cur.steps===0?dirs[i].x:cur.firstDx;
      var firstDy=cur.steps===0?dirs[i].y:cur.firstDy;
      if(nx===goalX&&ny===goalY){
        return{dx:firstDx,dy:firstDy};
      }
      visited[key(nx,ny)]=true;
      queue.push({x:nx,y:ny,firstDx:firstDx,firstDy:firstDy,steps:cur.steps+1});
    }
  }
  return null; // no path found
}

function renderBattlefield(arenaGrid){
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
  if(arenaElevation){
    for(var r=0;r<GS;r++){
      for(var c=0;c<GS;c++){
        if(arenaElevation[r][c]===0 && arenaPassable[r][c]===1){
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
        if(arenaPassable[r][c]===0){
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


// ═══ SPRITE SYSTEM — TIME ELEMENT MODULAR COMPOSER ═══
// Characters are built in-engine by stacking modular pixel-art layers.
// Each layer PNG is 1104×192 = 23 cols × 4 rows of 48×48 cells.
// Rows: 0=South 1=West 2=East 3=North. Cols hold animation frames.
// Layer order + animation frame ranges are taken from the Elements Generator's
// Settings.json (authoritative).

// Asset folders are tried in order. Loader falls through to the next base on
// 404, so core / CE1 / CE2 can all live in their own folders without copying.
// (Spaces in folder names are handled by encodeURI later.)
var ELEMENTS_BASES  = SPRITE_BASES; // see ../config/assets.js
var ELEMENTS_BASE   = ELEMENTS_BASES[0]; // legacy alias (still used by self-test)

// Per-facing back-to-front orders. The weapon slot is split: `weapon_back` is
// drawn before the body so the far hand (in side views) is hidden by the
// torso; `weapon_front` is drawn last so the near hand sits on top.
// `weaponZForSlot(slot, row)` decides which bucket each weapon goes in.
//
// SOUTH (camera sees character's front):
//   - cape/backpack/tail sit BEHIND the body (mostly hidden, only bottom edges
//     visible past the silhouette).

// Anims where mirroring an off-hand non-slot-suffix weapon still reads
// correctly. For attack-style anims the weapon is in an extended/forward pose
// in the source sprite, so mirroring it would point the wrong direction —
// during those we fall back to the un-mirrored sprite position.

// ─── Weapon empty-cell fallback ──────────────────────────────
// Many Time Element weapon sheets only paint certain anim columns (e.g.
// wand1 is blank at the crouch col, pickaxe1 is blank everywhere except
// the Attack/Tool block, bow1 is blank outside the Nock-and-Bow block).
// We scan each weapon PNG on load to learn which (row,col) cells have
// content, then at draw time fall back to a populated column when the
// requested cell is empty — so the weapon stays visible across all anims.
var _weaponNonEmpty = {};  // file → { 'row,col': 1 }
function _scanWeaponEmpties(file, img){
  if (_weaponNonEmpty[file]) return;
  var w = img.naturalWidth || img.width;
  var h = img.naturalHeight || img.height;
  if (!w || !h) return;
  var cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  var ctx = cv.getContext('2d');
  ctx.drawImage(img, 0, 0);
  var data;
  try { data = ctx.getImageData(0, 0, w, h).data; }
  catch(e){ return; }  // CORS taint — give up, weapon will use raw cells
  var map = {};
  for (var r = 0; r < ELEMENTS_ROWS; r++){
    for (var c = 0; c < ELEMENTS_COLS; c++){
      var found = false;
      for (var x = c*ELEMENTS_CELL; x < (c+1)*ELEMENTS_CELL && !found; x++){
        for (var y = r*ELEMENTS_CELL; y < (r+1)*ELEMENTS_CELL; y++){
          if (data[(y*w + x)*4 + 3] > 0){ found = true; break; }
        }
      }
      if (found) map[r + ',' + c] = 1;
    }
  }
  _weaponNonEmpty[file] = map;
}

// Resolve the actual sheet column to draw for a weapon. Returns -1 to mean
// "hide this weapon for this frame" (used when an active-only weapon like a
// pickaxe or bow has no passive idle/walk cell painted — we'd rather not draw
// it than slot in an attack pose). Death/prone keep the requested col so
// dropped weapons naturally disappear.
function _resolveWeaponSrcCol(file, requestedCol, row, animName){
  if (animName === 'death' || animName === 'prone') return requestedCol;
  var map = _weaponNonEmpty[file];
  if (!map) return requestedCol;
  if (map[row + ',' + requestedCol]) return requestedCol;
  var fallbacks = _PASSIVE_ANIMS[animName] ? _PASSIVE_FALLBACK_COLS : _ACTIVE_FALLBACK_COLS;
  for (var i = 0; i < fallbacks.length; i++){
    if (map[row + ',' + fallbacks[i]]) return fallbacks[i];
  }
  // No passive cell exists — better to hide the weapon than to paste an
  // attack pose into an idle/move frame (looks like the character is mid-swing).
  if (_PASSIVE_ANIMS[animName]) return -1;
  // For active anims, last-resort scan any column with content.
  for (var c = 0; c < ELEMENTS_COLS; c++){
    if (map[row + ',' + c]) return c;
  }
  return -1;
}

// Decide whether this weapon slot renders IN FRONT of or BEHIND the body for
// the given facing row.
//   row 0 (south): both hands toward camera → both 'front'
//   row 1 (west):  character's LEFT side faces camera → LHand 'front', RHand 'back'
//   row 2 (east):  character's RIGHT side faces camera → RHand 'front', LHand 'back'
//   row 3 (north): camera sees the back → both 'back'
function weaponZForSlot(slot, facingRow){
  if (facingRow === 0) return 'front';
  if (facingRow === 3) return 'back';
  if (facingRow === 1) return (slot === 'LHand') ? 'front' : 'back';
  if (facingRow === 2) return (slot === 'RHand') ? 'front' : 'back';
  return 'front';
}

// Animation slot → frame-column lookup. `cols` is the ordered list of columns
// to step through. `reverseDraw` flips the layer z-order for that animation
// (Settings.json only marks Climb true).
// Synthesized frame counts (engine reads `frames`).
Object.keys(ELEMENTS_ANIMS).forEach(function(k){ ELEMENTS_ANIMS[k].frames = ELEMENTS_ANIMS[k].cols.length; });

// Available parts per layer. Each part has a string `name` (the PNG filename
// stem) and `maxC` = highest color-variant suffix that exists (_c1.._cN).
// Names that don't follow `<layer><N>` (e.g. backpack1, crown1, tail3) come
// from the expansion packs and live in the same layer folder. Parts marked
// `randomSkip: true` are still pickable in the builder but are excluded from
// procedural generation (the bottom0/top0 "unclothed templates").

// Prime → color-channel bias so sulfur/salt/mercury fighters feel distinct.
// Each entry: preferred color-variant indices for that prime's hair/clothing.


// Pick a part (and color variant) for a given layer, optionally biased by prime.
function elementsPickPart(rng, layer, prime){
  var m = ELEMENTS_MANIFEST[layer];
  if (!m || m.fixed) return null;
  if (m.allowEmpty && rng() < 0.30) return null;
  // Randomization excludes parts flagged randomSkip (e.g. top0/bottom0 templates).
  var pool = m.parts.filter(function(p){ return !p.randomSkip; });
  if (!pool.length) return null;
  var part = pool[Math.floor(rng() * pool.length)];
  var c = 0;
  if (part.maxC > 0){
    var bias = PRIME_PALETTE_BIAS[prime] && PRIME_PALETTE_BIAS[prime][layer];
    if (bias && rng() < 0.7){
      var ok = bias.filter(function(ci){ return ci <= part.maxC; });
      c = ok.length ? ok[Math.floor(rng()*ok.length)] : 1 + Math.floor(rng()*part.maxC);
    } else {
      c = 1 + Math.floor(rng() * part.maxC);
    }
  }
  return { name: part.name, c: c };
}

// Generate a complete appearance object from a seed and prime.
function generateAppearance(seed, prime){
  var rng = elementsRng(seed);
  var ap = { seed: seed, prime: prime };
  ap.backextra = elementsPickPart(rng, 'backextra', prime);
  ap.bottom    = elementsPickPart(rng, 'bottom', prime);
  ap.top       = elementsPickPart(rng, 'top', prime);
  ap.head      = elementsPickPart(rng, 'head', prime);
  ap.hair      = elementsPickPart(rng, 'hair', prime);
  // Color-match backhair to hair when both are chosen
  if (ap.hair && rng() < 0.55){
    ap.backhair = elementsPickPart(rng, 'backhair', prime);
    if (ap.backhair) ap.backhair.c = ap.hair.c;
  }
  ap.hat       = elementsPickPart(rng, 'hat', prime);
  ap.frontextra= elementsPickPart(rng, 'frontextra', prime);
  // Skin tone — weighted toward the three natural tones (1-3), occasional
  // default (0) or exotic (4-6). Exotic tones land more often on mercury.
  var toneRoll = rng();
  if (prime === 'mercury' && toneRoll < 0.18)      ap.skinTone = 4 + Math.floor(rng()*3);
  else if (toneRoll < 0.08)                         ap.skinTone = 4 + Math.floor(rng()*3);
  else if (toneRoll < 0.18)                         ap.skinTone = 0;  // default
  else                                              ap.skinTone = 1 + Math.floor(rng()*3);
  return ap;
}

// Skin-tone palette swap (Source: Elements Generator Settings.json → PaletteSwaps).
// Each tone replaces the 5 source colors with a new target set.
// Tone 0 = identity (no change).

// Build a fast (R<<16 | G<<8 | B) → target-(R,G,B) lookup per tone.
function _buildTonePalette(tone){
  if (!tone || !tone.target) return null;
  var map = {};
  for (var i = 0; i < ELEMENTS_SKIN_SOURCE.length; i++){
    var s = ELEMENTS_SKIN_SOURCE[i], t = tone.target[i];
    map[(s[0]<<16)|(s[1]<<8)|s[2]] = t;
  }
  return map;
}
var _elementsTonePalettes = ELEMENTS_SKIN_TONES.map(_buildTonePalette);

// Cache toned canvases: 'layer/n_c|toneIdx' → HTMLCanvasElement
var _elementsTonedCache = {};

// Apply a palette swap to a loaded image; return a canvas. Identity tone returns
// the original image directly (no copy needed).
var _toneSwapWarned = false;
function _applyToneToImg(srcImg, toneIdx){
  var palette = _elementsTonePalettes[toneIdx];
  if (!palette) return srcImg;
  var cv = document.createElement('canvas');
  cv.width  = srcImg.naturalWidth  || srcImg.width;
  cv.height = srcImg.naturalHeight || srcImg.height;
  var ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(srcImg, 0, 0);
  var data;
  try { data = ctx.getImageData(0, 0, cv.width, cv.height); }
  catch(e){
    if (!_toneSwapWarned){
      _toneSwapWarned = true;
      console.warn('[Crucible] Skin-tone palette swap disabled — canvas is tainted (likely a file:// origin or missing CORS). Serve the folder via http://localhost to enable it.');
    }
    return srcImg;
  }
  var d = data.data;
  var swapped = 0;
  for (var i = 0; i < d.length; i += 4){
    if (d[i+3] === 0) continue;
    var key = (d[i]<<16) | (d[i+1]<<8) | d[i+2];
    var t = palette[key];
    if (t){ d[i] = t[0]; d[i+1] = t[1]; d[i+2] = t[2]; swapped++; }
  }
  ctx.putImageData(data, 0, 0);
  if (!_toneSwapReportedOnce){
    _toneSwapReportedOnce = true;
    console.log('[Crucible] First tone swap: ' + swapped + ' pixels recolored on a ' + cv.width + '×' + cv.height + ' layer.');
  }
  return cv;
}
var _toneSwapReportedOnce = false;

// Image loader. Prefers fetch → Blob → createImageBitmap so the resulting
// drawable has no origin and never taints canvases (so the palette-swap
// getImageData() call works). Falls back to a plain Image (will load but
// canvas-reads may be blocked when the page is opened via file://).
function _elementsLoadImage(url, onSuccess, onFail){
  var canFetch = (typeof fetch === 'function') && (location.protocol === 'http:' || location.protocol === 'https:');
  var canBitmap = (typeof createImageBitmap === 'function');
  if (canFetch){
    fetch(url).then(function(r){
      if (!r.ok) throw new Error('http ' + r.status);
      return r.blob();
    }).then(function(blob){
      if (canBitmap){
        // ImageBitmap from a Blob is guaranteed non-tainted.
        return createImageBitmap(blob).then(function(bm){ onSuccess(bm); });
      }
      // Fallback: blob URL → Image (also non-tainted for the canvas).
      return new Promise(function(resolve, reject){
        var img = new Image();
        img.onload  = function(){ onSuccess(img); resolve(); };
        img.onerror = function(){ onFail(); reject(); };
        img.src = URL.createObjectURL(blob);
      });
    }).catch(function(){ onFail(); });
  } else {
    var img = new Image();
    img.onload  = function(){ onSuccess(img); };
    img.onerror = function(){ onFail(); };
    img.src = url;
  }
}

// Self-test: confirm we can do a palette swap on a real loaded asset. Result is
// surfaced in the builder UI so the player knows whether tones will visually
// apply. Runs once, caches result.
var _skinSwapStatus = null;  // null = pending, true = ok, false = blocked
function _testSkinSwap(done){
  if (_skinSwapStatus !== null){ done(_skinSwapStatus); return; }
  _elementsLoadImage(ELEMENTS_BASE + 'shadow/shadow.png',
    function(srcImg){
      var cv = document.createElement('canvas');
      cv.width = 4; cv.height = 4;
      var ctx = cv.getContext('2d');
      ctx.drawImage(srcImg, 0, 0, 4, 4);
      try { ctx.getImageData(0, 0, 4, 4); _skinSwapStatus = true; }
      catch(e){ _skinSwapStatus = false; }
      done(_skinSwapStatus);
    },
    function(){ _skinSwapStatus = false; done(false); }
  );
}

// ─── Cast Visual FX ────────────────────────────────────────────
// 60-frame spell flourish from "Visual FX/Effects Pack 14(1)/1/N.png".
// Plays above the character's head during the 'cast' anim. Frames are
// 32×32 and scaled to ~70% of the character's draw size.
var _castFxFrames = new Array(CAST_FX_COUNT); // index → Image | 'loading' | null
function getCastFxFrame(idx){
  if (idx < 0 || idx >= CAST_FX_COUNT) return null;
  if (_castFxFrames[idx] === undefined){
    _castFxFrames[idx] = 'loading';
    var url = encodeURI(FX_BASE + 'effects-pack-14/1/' + (idx+1) + '.png');
    _elementsLoadImage(url,
      function(img){ _castFxFrames[idx] = img; _elementsFireRedraws(); },
      function(){ _castFxFrames[idx] = null; }
    );
  }
  var v = _castFxFrames[idx];
  return (v && v !== 'loading') ? v : null;
}

// Paint one frame of the cast FX onto `canvas`. If `manualFrameIdx` is given
// (debug room), uses that frame directly. Otherwise reads fighter._castFx
// and times the frame by elapsed ms; clears the FX when the cycle completes.
function drawCastFxOnCanvas(canvas, fighter, manualFrameIdx){
  if (!canvas) return;
  var idx;
  if (typeof manualFrameIdx === 'number'){
    idx = Math.max(0, Math.min(CAST_FX_COUNT - 1, manualFrameIdx|0));
  } else if (fighter && fighter._castFx){
    var elapsed = performance.now() - fighter._castFx.start;
    var dur = CAST_FX_COUNT * CAST_FX_FRAME_MS;
    if (elapsed >= dur){ delete fighter._castFx; return; }
    idx = Math.floor(elapsed / CAST_FX_FRAME_MS);
  } else return;
  var img = getCastFxFrame(idx); if (!img) return;
  var ctx = canvas.getContext('2d');
  var w = canvas.width, h = canvas.height;
  var drawSize = Math.min(w, h);
  var dx = Math.round((w - drawSize) / 2);
  var dy = Math.round((h - drawSize) / 2);
  // Positioned overhead — horizontally centered, ~30% of its size above the
  // character's nominal top so the bottom of the FX overlaps the head.
  var fxSize = Math.round(drawSize * 0.7);
  var fxX = dx + Math.round((drawSize - fxSize) / 2);
  var fxY = dy - Math.round(fxSize * 0.3);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, fxX, fxY, fxSize, fxSize);
}

// ─── Materia Orb Sprites ──────────────────────────────────────
// "crystalorb_rm_1_*.png" sheets — 576×384 RPG Maker SV battler format, but
// the artist used the canvas to lay out a few short animations + a static
// dust pile, not a character. Cell size is 48×48 (12 cols × 8 rows); the
// top 4 rows are shadowless and the bottom 4 rows are the same content with
// a small drop shadow under each orb.
//
// Frame indices below are best guesses based on the user's annotated mockup;
// adjust ORB_FRAMES if individual cells look off.

var _orbImgCache = {};   // color → Image | 'loading' | 'failed'
function getOrbImage(color){
  var v = _orbImgCache[color];
  if (v && v !== 'loading' && v !== 'failed') return v;
  if (v === 'loading' || v === 'failed') return null;
  _orbImgCache[color] = 'loading';
  _elementsLoadImage(ORB_BASE_PATH + 'crystalorb_rm_1_' + color + '.png',
    function(img){ _orbImgCache[color] = img; _elementsFireRedraws(); },
    function(){ _orbImgCache[color] = 'failed'; }
  );
  return null;
}
// Draw one orb cell to a destination canvas context. `frame` is either a
// frame-key string ('idle'/'levelup'/'crumble') with optional sub-index, or a
// concrete [col,row] tuple. Returns true if drawn, false if not yet loaded.
function drawOrbCell(ctx, color, col, row, dx, dy, size){
  var img = getOrbImage(color);
  if (!img) return false;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, col*ORB_CELL, row*ORB_CELL, ORB_CELL, ORB_CELL,
                dx, dy, size, size);
  return true;
}

// Render an orb canvas by its `data-orb-*` attributes. Used by the
// MutationObserver path (see renderOrbIcons) and by direct calls when we
// want to refresh a single orb in-place.
function renderOneOrb(c){
  if (!c) return;
  var color = c.getAttribute('data-orb-color') || 'blue';
  // One-shot flash: if data-orb-flash is set (e.g. "levelup") and we haven't
  // started the animation yet, kick off the timer-driven sequence now.
  var flash = c.getAttribute('data-orb-flash');
  if (flash && !c._flashStarted){
    // Need the image loaded before we can render frame 0. If it isn't,
    // queue a redraw and try again then.
    if (getOrbImage(color)){
      c._flashStarted = true;
      _runOrbFlash(c, flash);
    } else {
      elementsRegisterRedraw(c, function(){ renderOneOrb(c); });
    }
    return;
  }
  var animKey = c.getAttribute('data-orb-anim') || 'idle';
  var frameIdx = parseInt(c.getAttribute('data-orb-frame'), 10) || 0;
  var spec;
  if (animKey === 'dust') spec = ORB_FRAMES.dust;
  else {
    var seq = ORB_FRAMES[animKey] || ORB_FRAMES.idle;
    spec = seq[Math.max(0, Math.min(seq.length - 1, frameIdx))];
  }
  if (!spec) return;
  var ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  if (!drawOrbCell(ctx, color, spec[0], spec[1], 0, 0, c.width)){
    elementsRegisterRedraw(c, function(){ renderOneOrb(c); });
  }
}
// Drive a one-shot animation on a single orb canvas. After the sequence
// completes the canvas drops back to the idle frame so it doesn't keep
// pulsing forever.
function _runOrbFlash(c, animKey){
  var seq = ORB_FRAMES[animKey] || ORB_FRAMES.idle;
  var frame = 0;
  c.setAttribute('data-orb-anim', animKey);
  c.setAttribute('data-orb-frame', '0');
  // First paint
  var color = c.getAttribute('data-orb-color') || 'blue';
  var ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  drawOrbCell(ctx, color, seq[0][0], seq[0][1], 0, 0, c.width);
  var iv = setInterval(function(){
    if (!c.isConnected){ clearInterval(iv); return; }
    frame++;
    if (frame >= seq.length){
      clearInterval(iv);
      c.removeAttribute('data-orb-flash');
      c.setAttribute('data-orb-anim', 'idle');
      c.setAttribute('data-orb-frame', '2');
      // Repaint idle frame
      var spec = ORB_FRAMES.idle[2];
      ctx.clearRect(0, 0, c.width, c.height);
      drawOrbCell(ctx, color, spec[0], spec[1], 0, 0, c.width);
      return;
    }
    ctx.clearRect(0, 0, c.width, c.height);
    drawOrbCell(ctx, color, seq[frame][0], seq[frame][1], 0, 0, c.width);
  }, 180);
}
// Repaint every `.materia-orb-pix` canvas in the DOM. Called by the
// MutationObserver and after any state change that introduces new orbs.
function renderOrbIcons(){
  var canvases = document.querySelectorAll('.materia-orb-pix');
  if (!canvases.length) return;
  canvases.forEach(renderOneOrb);
}

// Build the inline HTML for a single materia orb. Includes the planet/level
// tooltip + click handler so the existing showMatDetail flow keeps working.
//   planetIdx — index into PLANETS
//   level     — materia level for the level-sub label
//   opts.size — CSS px (default 28)
//   opts.click — if false, omit the cursor:pointer + onclick
//   opts.xp   — XP for tooltip
function materiaOrbHTML(planetIdx, level, opts){
  opts = opts || {};
  var size = opts.size || 28;
  var p = PLANETS[planetIdx];
  if (!p) return '';
  var color = PLANET_TO_ORB_COLOR[planetIdx] || 'blue';
  var title = p.name + ' Lv' + level + (opts.click === false ? '' : ' — tap for details');
  var clickAttr = (opts.click === false) ? '' :
    ' onclick="event.stopPropagation();showMatDetail(' + planetIdx + ',' + level + ',' + (opts.xp || 0) + ')" style="cursor:pointer"';
  var flashAttr = opts.levelupFlash ? ' data-orb-flash="levelup"' : '';
  return '<span class="materia-orb-wrap" title="' + title + '"' + clickAttr + '>'
    + '<canvas class="materia-orb-pix" width="48" height="48" '
    +   'data-orb-color="' + color + '" data-orb-anim="idle" data-orb-frame="2"' + flashAttr + ' '
    +   'style="width:' + size + 'px;height:' + size + 'px;image-rendering:pixelated;vertical-align:middle"></canvas>'
    + '<sub class="materia-orb-lvl">' + level + '</sub>'
    + '</span>';
}
// Empty-socket placeholder (matches the orb size). Used in place of the
// previous "○" character so the layout doesn't reflow when slotting.
function materiaEmptyOrbHTML(opts){
  opts = opts || {};
  var size = opts.size || 28;
  return '<span class="materia-orb-wrap materia-orb-empty" title="Empty socket">'
    + '<span class="materia-orb-empty-dot" style="width:' + Math.round(size*0.5) + 'px;height:' + Math.round(size*0.5) + 'px"></span>'
    + '</span>';
}

// Continuous-redraw register for canvases that need per-frame updates outside
// the battle anim loop (idle bob in builder/draft/VS/stat previews). Each
// registered renderer runs only when its enclosing .screen is active, so the
// rAF tick is cheap when nothing is on-screen.
var _bobRenderers = new Map();
var _bobRAF = null;
function registerBobRenderer(canvas, fn){
  if (!canvas || !fn) return;
  _bobRenderers.set(canvas, fn);
  _ensureBobLoop();
}
function unregisterBobRenderer(canvas){
  if (canvas) _bobRenderers.delete(canvas);
}
function _ensureBobLoop(){
  if (_bobRAF) return;
  function tick(){
    if (_bobRenderers.size === 0){ _bobRAF = null; return; }
    var dead = [];
    _bobRenderers.forEach(function(rfn, cv){
      if (!cv || !cv.isConnected){ dead.push(cv); return; }
      var scr = cv.closest && cv.closest('.screen');
      if (!scr || !scr.classList.contains('active')) return;
      try { rfn(); } catch(_){}
    });
    dead.forEach(function(cv){ _bobRenderers.delete(cv); });
    _bobRAF = requestAnimationFrame(tick);
  }
  _bobRAF = requestAnimationFrame(tick);
}

// Asset cache: key 'layer/n_c' → Image | 'loading' | 'failed'
var _elementsImgCache = {};
// Per-canvas pending redraws (deduped). The battle loop already re-renders each
// frame, so it never lands here; only the static stat/VS/pantheon canvases do.
var _elementsRedrawByCanvas = new Map();

function elementsRegisterRedraw(canvas, fn){
  if (!canvas) return;
  _elementsRedrawByCanvas.set(canvas, fn);
}
function _elementsFireRedraws(){
  if (_elementsRedrawByCanvas.size === 0) return;
  var entries = [];
  _elementsRedrawByCanvas.forEach(function(fn, cv){ entries.push([cv, fn]); });
  _elementsRedrawByCanvas.clear();
  entries.forEach(function(e){
    // Only redraw if the canvas is still attached to the document.
    if (e[0] && e[0].isConnected !== false) {
      try { e[1](); } catch(_){}
    }
  });
}

// Try each asset base for `<base>/<layer>/<fname>.png`. First 200-OK wins;
// onSuccess/onFail are exclusive. encodeURI handles folder names with spaces.
function _tryLoadFromBases(layer, fname, onSuccess, onFail){
  var i = 0;
  function next(){
    if (i >= ELEMENTS_BASES.length){ onFail(); return; }
    var url = encodeURI(ELEMENTS_BASES[i] + layer + '/' + fname + '.png');
    i++;
    _elementsLoadImage(url, onSuccess, next);
  }
  next();
}

// Returns a loaded image (HTMLImageElement / ImageBitmap), or null if it's
// still loading or unavailable. Part identity is the filename stem string
// (e.g. 'head1', 'backpack1', 'crown1'); a legacy numeric form is migrated.
function getElementsPart(layer, partName, c){
  if (!layer) return null;
  if (layer === 'shadow'){ partName = 'shadow'; c = 0; }
  // Legacy migration: old `{n: 5}` form is stored on saved appearances.
  if (typeof partName === 'number'){
    if (partName <= 0) return null;
    partName = layer + partName;
  }
  if (!partName) return null;
  var fname = partName + (c ? '_c' + c : '');
  var key = layer + '/' + fname;
  var v = _elementsImgCache[key];
  if (v && v !== 'loading' && v !== 'failed') return v;
  if (v === 'loading') return null;
  if (v === 'failed'){
    if (c) return getElementsPart(layer, partName, 0);  // fall back to base color
    return null;
  }
  _elementsImgCache[key] = 'loading';
  _tryLoadFromBases(layer, fname,
    function(img){ _elementsImgCache[key] = img; _elementsFireRedraws(); },
    function(){
      _elementsImgCache[key] = 'failed';
      if (c){ getElementsPart(layer, partName, 0); _elementsFireRedraws(); }
    }
  );
  return null;
}

// Return a layer image with the current skin tone applied. Identity tone
// (index 0) just returns the loaded Image; non-identity returns a cached canvas.
function getElementsPartToned(layer, partName, c, toneIdx){
  var src = getElementsPart(layer, partName, c);
  if (!src || !toneIdx) return src;
  // Resolve numeric legacy name for cache key stability.
  var keyName = (typeof partName === 'number') ? (layer + partName) : partName;
  var key = layer + '/' + keyName + '_' + (c||0) + '|' + toneIdx;
  var hit = _elementsTonedCache[key];
  if (hit) return hit;
  var swapped = _applyToneToImg(src, toneIdx);
  _elementsTonedCache[key] = swapped;
  return swapped;
}
function getElementsWeaponToned(file, c, toneIdx){
  var src = getElementsWeapon(file, c);
  if (!src || !toneIdx) return src;
  var key = 'weapon/' + file + '_' + (c||0) + '|' + toneIdx;
  var hit = _elementsTonedCache[key];
  if (hit) return hit;
  var swapped = _applyToneToImg(src, toneIdx);
  _elementsTonedCache[key] = swapped;
  return swapped;
}

// Idle bob — gentle breathing cycle. Body and weapon move identically (no
// lag). Source-pixel amplitude is just +1 (neutral → down) over a 1400 ms
// baseline cycle. `excite` (0..1) shortens the cycle so the character bobs
// faster for a few seconds after attacking / moving (settles back as the
// fighter's _bobExcite decays). `phase` is a per-fighter offset so two
// characters on the same screen don't bob in lockstep.
// Returned dy is in destination pixels (scaled by drawSize / ELEMENTS_CELL).
function computeIdleBob(t, drawSize, excite, phase){
  var T_BASE = 1400;
  var e = Math.max(0, Math.min(1, excite || 0));
  // excite=0 → 1400ms, excite=1 → 700ms (2× faster). Linear excite decay
  // (driven by fighter._bobExciteEnd) makes the speed-up last ~1.5s, which
  // covers roughly two excited bobs before settling back to baseline.
  var T = T_BASE / (1 + e * 1.0);
  var scale = drawSize / ELEMENTS_CELL;
  var p = (((t + (phase || 0)) % T) + T) % T / T;
  var srcDy = (p >= 0.5) ? 1 : 0;
  var dy = Math.round(srcDy * scale);
  return { body: dy, weapon: dy };
}

// Layers that do NOT participate in the idle bob (planted on the ground).

// Hats that have an open top — hair tufts should be allowed to peek through
// instead of being cropped at the hat's bounding-box top. Currently just the
// two circlet-style crowns; everything else (hood/cap/helm) covers the crown
// of the head, so any hair pixels above the hat's topmost pixel are
// considered clipping artifacts and get clipped out.

// Cache: per (hat layer/file/c, col, row) → top non-transparent Y in the
// 48×48 cell, or -1 if the cell is empty (or CORS-tainted and unreadable).
var _hatTopYCache = {};
function getHatTopY(layer, partName, c, col, row){
  var img = getElementsPart(layer, partName, c);
  if (!img) return null;
  var key = layer + '/' + partName + '_' + (c||0) + '|' + (row|0) + ',' + (col|0);
  if (key in _hatTopYCache) return _hatTopYCache[key];
  var iw = img.naturalWidth || img.width;
  var ih = img.naturalHeight || img.height;
  if (!iw || !ih) return null;
  var cv = document.createElement('canvas');
  cv.width = ELEMENTS_CELL; cv.height = ELEMENTS_CELL;
  var ctx = cv.getContext('2d');
  ctx.drawImage(img, (col|0)*ELEMENTS_CELL, (row|0)*ELEMENTS_CELL, ELEMENTS_CELL, ELEMENTS_CELL, 0, 0, ELEMENTS_CELL, ELEMENTS_CELL);
  var data;
  try { data = ctx.getImageData(0, 0, ELEMENTS_CELL, ELEMENTS_CELL).data; }
  catch(e){ _hatTopYCache[key] = -1; return -1; }
  for (var y = 0; y < ELEMENTS_CELL; y++){
    for (var x = 0; x < ELEMENTS_CELL; x++){
      if (data[(y*ELEMENTS_CELL + x)*4 + 3] > 0){
        _hatTopYCache[key] = y;
        return y;
      }
    }
  }
  _hatTopYCache[key] = -1;
  return -1;
}

// Core compositor — paints one frame of a character onto an arbitrary canvas.
// `weapons` is optional { lhand, rhand } from fighterWeaponLayers().
// `bobOpts` is optional { excite, phase } — fighters in battle pass their own
// excitement & phase so the bob speeds up briefly after attacks/moves.
function compositeCharacter(canvas, appearance, animName, frame, facingRow, weapons, bobOpts){
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = false;
  if (!appearance) appearance = {};

  var anim = ELEMENTS_ANIMS[animName] || ELEMENTS_ANIMS.idle;
  var fr   = Math.max(0, Math.min((frame|0), anim.frames - 1));
  var col  = anim.cols ? anim.cols[fr] : ((anim.startCol||0) + fr);
  var srcX = col * ELEMENTS_CELL;
  var srcY = (facingRow|0) * ELEMENTS_CELL;

  // Sprite is 48×48; draw it as a square in the canvas, scaled to min(w,h).
  var drawSize = Math.min(w, h);
  var dx = Math.round((w - drawSize) / 2);
  var dy = Math.round((h - drawSize) / 2);

  // Per-facing layer order: south = front view, east/west = side profiles,
  // north = back view. Animations flagged reverseDraw (Climb) also use the
  // north stack so capes/weapons drop behind the body.
  var fr0 = facingRow | 0;
  var isBack = (fr0 === 3) || !!anim.reverseDraw;
  var order;
  if (isBack)                           order = ELEMENTS_LAYER_ORDER_NORTH;
  else if (fr0 === 1 || fr0 === 2)      order = ELEMENTS_LAYER_ORDER_SIDE;
  else                                   order = ELEMENTS_LAYER_ORDER_SOUTH;

  // Bob applies only during idle. Other anims drive their own per-frame motion.
  // `bobOpts.disabled` lets the debug room pin a frame for inspection.
  var bob = null;
  if (!(bobOpts && bobOpts.disabled) && (animName === 'idle' || !animName)){
    var bExcite = bobOpts ? bobOpts.excite : 0;
    var bPhase  = bobOpts ? bobOpts.phase  : 0;
    bob = computeIdleBob(performance.now(), drawSize, bExcite, bPhase);
  }

  function blit(img, extraDy){
    if (!img) return false;
    ctx.drawImage(img, srcX, srcY, ELEMENTS_CELL, ELEMENTS_CELL, dx, dy + (extraDy||0), drawSize, drawSize);
    return true;
  }

  // Same as blit() but flips horizontally around the destination center —
  // used for non-slot-suffix weapons in the LEFT hand so a single right-handed
  // sprite can render on either side of the character.
  function blitMirrored(img, extraDy){
    if (!img) return false;
    ctx.save();
    ctx.translate(dx + drawSize/2, 0);
    ctx.scale(-1, 1);
    ctx.translate(-(dx + drawSize/2), 0);
    ctx.drawImage(img, srcX, srcY, ELEMENTS_CELL, ELEMENTS_CELL, dx, dy + (extraDy||0), drawSize, drawSize);
    ctx.restore();
    return true;
  }

  var tone = (appearance && appearance.skinTone) | 0;

  // Pre-compute per-weapon z-bucket for this frame.
  var lZ = (weapons && weapons.lhand) ? weaponZForSlot('LHand', facingRow|0) : null;
  var rZ = (weapons && weapons.rhand) ? weaponZForSlot('RHand', facingRow|0) : null;

  // Hat crop: if the equipped hat has a solid top (i.e. NOT one of the open
  // circlet crowns), find its topmost source-pixel Y and use it as a clip line
  // when rendering hair/backhair below — so long hair / ponytails can't poke
  // above the hat. ELEMENTS_HAT_OPEN_TOP names the exceptions.
  var hatTopYPx = -1;
  var hatPartForCrop = appearance.hat;
  if (hatPartForCrop) {
    var hatNameForCrop = hatPartForCrop.name || (hatPartForCrop.n ? ('hat' + hatPartForCrop.n) : null);
    if (hatNameForCrop && !ELEMENTS_HAT_OPEN_TOP[hatNameForCrop]) {
      var ty = getHatTopY('hat', hatNameForCrop, hatPartForCrop.c, col, facingRow|0);
      if (ty != null && ty >= 0) hatTopYPx = ty;
    }
  }

  // Off-hand mirror is only safe in poses where both hands are at the sides
  // (idle/move/hurt/death/prone). During attacks (slash/cast/parry/hold/jump/
  // nockBow/climb) the source sprite's weapon is in an extended attack pose;
  // mirroring puts the off-hand weapon facing the wrong direction. In those
  // cases we suppress the mirror so the off-hand weapon falls back to the
  // main-hand sprite position — visible, just slightly inconsistent.
  //
  // We also resolve the weapon's source column independently of the body:
  // many weapon sheets don't paint certain animation columns (e.g. wand at
  // crouch). _resolveWeaponSrcCol picks a populated cell for those cases
  // so the weapon stays on-screen.
  function drawWeapon(desc, extraDy){
    var img = getElementsWeaponToned(desc.file, desc.c, tone);
    if (!img) return false;
    var wCol = _resolveWeaponSrcCol(desc.file, col, facingRow|0, animName);
    if (wCol < 0) return false;  // weapon has no good cell for this pose — hide
    var wSrcX = wCol * ELEMENTS_CELL;
    var doMirror = desc.mirror && WEAPON_MIRROR_OK_ANIMS[animName || 'idle'];
    var dyTotal = dy + (extraDy||0);
    if (doMirror){
      ctx.save();
      ctx.translate(dx + drawSize/2, 0);
      ctx.scale(-1, 1);
      ctx.translate(-(dx + drawSize/2), 0);
      ctx.drawImage(img, wSrcX, srcY, ELEMENTS_CELL, ELEMENTS_CELL, dx, dyTotal, drawSize, drawSize);
      ctx.restore();
    } else {
      ctx.drawImage(img, wSrcX, srcY, ELEMENTS_CELL, ELEMENTS_CELL, dx, dyTotal, drawSize, drawSize);
    }
    return true;
  }

  var anyDrawn = false;
  for (var i = 0; i < order.length; i++){
    var layer = order[i];
    var isWeaponSlot = (layer === 'weapon_back' || layer === 'weapon_front');
    var off = 0;
    if (bob && !ELEMENTS_FIXED_LAYERS[layer]){
      off = isWeaponSlot ? bob.weapon : bob.body;
    }
    if (layer === 'shadow'){
      if (blit(getElementsPart('shadow', 1, 0), 0)) anyDrawn = true;
    } else if (isWeaponSlot){
      var want = (layer === 'weapon_back') ? 'back' : 'front';
      // Far-side weapons get clipped at the feet/shadow line so blades don't
      // poke below the body silhouette. Near-side weapons draw uncropped.
      var clipped = (layer === 'weapon_back');
      if (clipped){
        ctx.save();
        ctx.beginPath();
        ctx.rect(dx, dy, drawSize, Math.round(drawSize * 0.88));
        ctx.clip();
      }
      if (weapons && weapons.lhand && lZ === want && drawWeapon(weapons.lhand, off)) anyDrawn = true;
      if (weapons && weapons.rhand && rZ === want && drawWeapon(weapons.rhand, off)) anyDrawn = true;
      if (clipped) ctx.restore();
    } else {
      var p = appearance[layer];
      if (!p) continue;
      // Resolve part identity from either modern `name` or legacy numeric `n`.
      var partName = p.name || (p.n ? (layer + p.n) : null);
      if (!partName) continue;
      var partImg = getElementsPartToned(layer, partName, p.c, tone);
      // Crop hair / backhair to the brim of an opaque-top hat. Clip line is
      // computed in destination pixels, including the same bob offset the hair
      // will be drawn with (hair and hat bob together, so the clip rides with
      // the head's apparent top each frame).
      var needsHatCrop = (hatTopYPx >= 0) && (layer === 'hair' || layer === 'backhair');
      if (needsHatCrop){
        var scaleH = drawSize / ELEMENTS_CELL;
        var clipTopY = dy + Math.round(hatTopYPx * scaleH) + off;
        ctx.save();
        ctx.beginPath();
        ctx.rect(dx, clipTopY, drawSize, drawSize * 2);  // generous bottom — never crops below
        ctx.clip();
        if (blit(partImg, off)) anyDrawn = true;
        ctx.restore();
      } else {
        if (blit(partImg, off)) anyDrawn = true;
      }
    }
  }
  return anyDrawn;
}

// Backwards-compat shim: old SPRITE_SHEET_MAP used by loadSpriteSheets()
var SPRITE_SHEET_MAP = {};
var spriteImages = {};
var spritesLoaded = true;   // compositor loads parts on demand — never "wait"

// ═══ WEAPON SYSTEM — TIME ELEMENT LAYER COMPOSITING ═══
// Weapons are extra modular layers (sword1.png, bow1.png, etc.) drawn on top of
// the character. They share the 23×4 anim grid, so they animate together with
// the body for free — no per-frame hand-offset math needed.


// Gear type → ordered list of Time Element weapon stems by tier. Higher tier
// indexes a later (fancier) weapon. Each entry carries its own maxC.
// Daggers / shields use slot-specific files (L vs R hand).

// Tier (0-6) → weapon color-variant index. Higher tier = fancier finish.
function weaponTierToColor(tier, maxC) {
  if (!maxC) return 0;
  tier = tier || 0;
  if (tier <= 1) return 0;
  if (tier <= 3) return Math.min(2, maxC);
  return Math.min(3, maxC);
}

// Resolve a gear piece + hand slot to a Time Element weapon descriptor, or null.
// `mirror` is true for non-slot-suffix weapons (sword/wand/hammer/etc.) placed
// in the LEFT hand — Time Element only ships a right-handed sprite so we flip
// the canvas horizontally at draw time to put the weapon on the other side.
function gearToWeaponDesc(gear, slot) {
  if (!gear) return null;
  var ladder = GEAR_WEAPON_LADDER[gear.type];
  if (!ladder || !ladder.length) return null;
  var tier = gear.tier || 0;
  var idx = Math.min(tier, ladder.length - 1);
  var spec = ladder[idx];
  var fname = spec.stem;
  var mirror = false;
  if (spec.slotSuffix) {
    fname += (slot === 'LHand' ? 'L' : 'R');
  } else {
    mirror = (slot === 'LHand');
  }
  var c = weaponTierToColor(tier, spec.maxC);
  return { file: fname, c: c, mirror: mirror };
}

// Return an appearance object with equipped body armor overlaid on top of the
// underlying cosmetic layers. Plate/Mail/Robes/Vest swap the `top`; Cloak swaps
// `backextra`. Weapons are NOT applied here — they flow through the compositor's
// `weapons` parameter instead.
function effectiveAppearance(appearance, gear){
  if (!appearance) return null;
  if (!gear) return appearance;
  var eff = {};
  for (var k in appearance) if (Object.prototype.hasOwnProperty.call(appearance, k)) eff[k] = appearance[k];
  EQUIP_SLOTS.forEach(function(slot){
    var g = gear[slot]; if (!g) return;
    var bd = gearToBodyDesc(g); if (!bd) return;
    eff[bd.layer] = { name: bd.file, c: bd.c };
  });
  return eff;
}

// Body / Head / Lower gear → layer-override descriptor. Used by the card
// icon renderer AND by effectiveAppearance to swap the corresponding cosmetic
// layer when this piece is equipped.
function gearToBodyDesc(gear) {
  if (!gear) return null;
  var ladder = null;
  if (gear.pos === 'Body')  ladder = GEAR_BODY_LADDER[gear.type];
  else if (gear.pos === 'Head')  ladder = GEAR_HEAD_LADDER[gear.type];
  else if (gear.pos === 'Lower') ladder = GEAR_LOWER_LADDER[gear.type];
  if (!ladder || !ladder.length) return null;
  var tier = gear.tier || 0;
  var idx = Math.min(tier, ladder.length - 1);
  var spec = ladder[idx];
  return { layer: spec.layer, file: spec.stem, c: weaponTierToColor(tier, spec.maxC) };
}

// Unified descriptor for the gear-card icon. Tells the renderer which layer
// to pull the south-idle frame from. Returns null for jewelry (Ring/Tome/Amulet)
// so they keep their emoji icon.
function gearToCardIconDesc(gear, slot) {
  if (!gear) return null;
  var w = gearToWeaponDesc(gear, slot || 'RHand');
  if (w) return { layer: 'weapon', file: w.file, c: w.c };
  var b = gearToBodyDesc(gear);
  if (b) return b;
  return null;
}

// Resolve weapons for a fighter — produces { lhand, rhand } where each is a
// descriptor (or null) for the weapon-layer compositor.
function fighterWeaponLayers(fighter) {
  var out = { lhand: null, rhand: null };
  if (!fighter || !fighter.gear) return out;
  out.lhand = gearToWeaponDesc(fighter.gear.LHand, 'LHand');
  out.rhand = gearToWeaponDesc(fighter.gear.RHand, 'RHand');
  return out;
}

// Weapon parts use named filenames (sword1, daggerL, hammer, etc.). Loader
// tries each base in turn; first-found is cached.
function getElementsWeapon(file, c){
  if (!file) return null;
  var fname = file + (c ? '_c' + c : '');
  var key = 'weapon/' + fname;
  var v = _elementsImgCache[key];
  if (v && v !== 'loading' && v !== 'failed') return v;
  if (v === 'loading') return null;
  if (v === 'failed'){
    if (c) return getElementsWeapon(file, 0);
    return null;
  }
  _elementsImgCache[key] = 'loading';
  _tryLoadFromBases('weapon', fname,
    function(img){
      _elementsImgCache[key] = img;
      // Scan the base (non-toned) PNG once to learn which cells have content.
      // Toned variants share the same alpha pattern so we don't re-scan them.
      if (!c) _scanWeaponEmpties(file, img);
      _elementsFireRedraws();
    },
    function(){
      _elementsImgCache[key] = 'failed';
      if (c){ getElementsWeapon(file, 0); _elementsFireRedraws(); }
    }
  );
  return null;
}


// Legacy alias — ticking code reads .frames/.speed/.loop, which match ELEMENTS_ANIMS.

function loadSpriteSheets() {
  // Compositor loads modular parts on demand; nothing to preload here.
}

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

function initFighterAnim(fighter) {
  fighter.anim = { name: 'idle', frame: 0, timer: 0, onDone: null };
}

// Anims that count as "active" and push the bob into excited mode.
function setFighterAnim(fighter, animName, onDone) {
  var ad = SPRITE_ANIMS[animName];
  if (!ad) return;
  fighter.anim = { name: animName, frame: 0, timer: performance.now(), onDone: onDone || null };
  // Bump excitement when the fighter takes an active action — the idle bob
  // afterward runs faster for ~1.5s while excite linearly decays back to 0.
  if (BOB_EXCITE_ANIMS[animName]) fighter._bobExciteEnd = performance.now() + BOB_EXCITE_DURATION_MS;
  // Casting kicks off the spell-FX overlay above the character.
  if (animName === 'cast') fighter._castFx = { start: performance.now() };
}
// Linear excite: 1.0 at peak, drops to 0 over BOB_EXCITE_DURATION_MS.
function getBobExcite(fighter){
  if (!fighter || !fighter._bobExciteEnd) return 0;
  var remaining = fighter._bobExciteEnd - performance.now();
  if (remaining <= 0) return 0;
  return Math.min(1, remaining / BOB_EXCITE_DURATION_MS);
}

// Animation tick — call from requestAnimationFrame
var lastAnimTick = 0;
// Decide what state a fighter's anim should revert to when a one-shot ends.
// While `_prone` is set, temporary anims (hurt, slash, etc.) collapse back
// to the prone pose instead of standing idle.
function _fighterIdleAnim(f){
  if (!f) return 'idle';
  if (f._prone) return 'prone';
  return 'idle';
}

function tickAnimations(now) {
  [p1, p2].forEach(function(f) {
    if (!f) return;
    // Bob excitement is computed on demand from f._bobExciteEnd (see
    // getBobExcite). Nothing to decay here.
    if (!f.anim) return;
    var ad = SPRITE_ANIMS[f.anim.name];
    if (!ad) return;
    // Single-frame non-looping anims (hurt, anticip, etc.): time out after speed
    // duration. `hold: true` anims (death, prone) stay until something else
    // overwrites them.
    if (ad.frames <= 1) {
      if (!ad.loop && !ad.hold) {
        var elapsed = now - f.anim.timer;
        if (elapsed >= ad.speed) {
          if (f.anim.onDone) { var cb = f.anim.onDone; f.anim.onDone = null; cb(); }
          f.anim = { name: _fighterIdleAnim(f), frame: 0, timer: now, onDone: null };
        }
      }
      return;
    }
    var elapsed = now - f.anim.timer;
    if (elapsed >= ad.speed) {
      f.anim.frame++;
      f.anim.timer = now;
      if (f.anim.frame >= ad.frames) {
        if (ad.loop) {
          f.anim.frame = 0;
        } else {
          f.anim.frame = ad.frames - 1;
          if (f.anim.onDone) { var cb = f.anim.onDone; f.anim.onDone = null; cb(); }
          if (!ad.hold) { f.anim = { name: _fighterIdleAnim(f), frame: 0, timer: now, onDone: null }; }
        }
      }
    }
  });
}

// Find the fighter being rendered onto a given canvas (battle grid only).
function fighterForCanvas(canvas){
  if (!canvas) return null;
  if (p1){ var cv1 = document.getElementById('cs_' + p1.y + '_' + p1.x); if (cv1 === canvas) return p1; }
  if (p2){ var cv2 = document.getElementById('cs_' + p2.y + '_' + p2.x); if (cv2 === canvas) return p2; }
  return null;
}

// Derive a stable appearance for fighters/champions that don't already have one
// (older save data, ad-hoc sprite previews, etc.).
function ensureAppearance(target, primeFallback){
  if (target && target.appearance) return target.appearance;
  var seed = 0;
  if (target){
    if (target.appearanceSeed) seed = target.appearanceSeed;
    else if (target.name) for (var i=0; i<target.name.length; i++) seed = (seed*131 + target.name.charCodeAt(i)) | 0;
    else seed = ((Math.random()*1e9)|0);
  } else seed = ((Math.random()*1e9)|0);
  var prime = (target && target.prime) || (target && target.bodyType) || primeFallback || 'sulfur';
  var ap = generateAppearance(seed, prime);
  if (target) target.appearance = ap;
  return ap;
}

// Battle-grid render: pulls anim state from the fighter at this canvas.
function renderSprite(canvas, prime, stage, angle, scale){
  var fighter = fighterForCanvas(canvas);
  var appearance = fighter ? ensureAppearance(fighter, prime) : ensureAppearance({prime:prime}, prime);
  if (fighter && fighter.gear) appearance = effectiveAppearance(appearance, fighter.gear);
  var animName = (fighter && fighter.anim && fighter.anim.name) || 'idle';
  var frame    = (fighter && fighter.anim && fighter.anim.frame) || 0;
  var ad = ELEMENTS_ANIMS[animName] || ELEMENTS_ANIMS.idle;
  if (frame >= ad.frames) frame = ad.frames - 1;
  var row = facingToRow(angle);
  var weapons = fighter ? fighterWeaponLayers(fighter) : null;
  var bobOpts = fighter ? { excite: getBobExcite(fighter), phase: fighter._bobPhase||0 } : null;
  compositeCharacter(canvas, appearance, animName, frame, row, weapons, bobOpts);
  if (fighter) drawCastFxOnCanvas(canvas, fighter);
  // Battle loop already re-renders every frame; no need to enqueue here.
}

// Static (non-battle) render: stat screen, VS, pantheon previews, etc.
function renderSpriteStatic(canvas, prime, angle, animName, frame, fighter){
  var src = fighter || {prime: prime};
  var appearance = ensureAppearance(src, prime);
  if (fighter && fighter.gear) appearance = effectiveAppearance(appearance, fighter.gear);
  var ad = ELEMENTS_ANIMS[animName || 'idle'] || ELEMENTS_ANIMS.idle;
  var fr = frame || 0;
  if (fr >= ad.frames) fr = 0;
  var row = facingToRow(angle);
  var weapons = fighter ? fighterWeaponLayers(fighter) : null;
  // Fighters carry their own bob excitement/phase. Non-fighter previews use a
  // stable phase derived from the canvas id so multiple portraits on the same
  // screen don't share an identical breath rhythm.
  var bobOpts;
  if (fighter){
    bobOpts = { excite: getBobExcite(fighter), phase: fighter._bobPhase||0 };
  } else {
    bobOpts = { excite: 0, phase: _bobPhaseForCanvas(canvas) };
  }
  compositeCharacter(canvas, appearance, animName || 'idle', fr, row, weapons, bobOpts);
  if (fighter) drawCastFxOnCanvas(canvas, fighter);
  elementsRegisterRedraw(canvas, function(){ renderSpriteStatic(canvas, prime, angle, animName, frame, fighter); });
  // Idle anims need per-frame bob updates.
  if ((animName || 'idle') === 'idle'){
    registerBobRenderer(canvas, function(){ renderSpriteStatic(canvas, prime, angle, animName, frame, fighter); });
  }
}

// Stable per-canvas phase offset (0-1400ms) so previews on screens that show
// multiple characters (e.g. Pantheon) don't all bob in unison.
function _bobPhaseForCanvas(cv){
  if (!cv) return 0;
  var k = cv.id || '';
  var h = 0;
  for (var i=0; i<k.length; i++){ h = ((h*31) + k.charCodeAt(i)) | 0; }
  return ((h % 1400) + 1400) % 1400;
}

// Animation loop
function startAnimLoop() {
  if (animLoopRunning) return;
  animLoopRunning = true;
  function loop(now) {
    if (!animLoopRunning) return;
    tickAnimations(now);
    // Re-render fighters on grid if in battle
    if (gamePhase && document.getElementById('battleScreen') &&
        document.getElementById('battleScreen').classList.contains('active')) {
      [p1, p2].forEach(function(f) {
        if (!f || f.hp <= 0 || f.x < 0 || f.x >= GS || f.y < 0 || f.y >= GS) return;
        var cv = document.getElementById('cs_' + f.y + '_' + f.x);
        if (cv) renderSprite(cv, f.prime, getRank(getFighterLinkCount(f)).key, f.facing, 0);
      });
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}
function stopAnimLoop() { animLoopRunning = false; }

// ═══ FACING ═══
function facingAngle(dx,dy){
  if(dx===0&&dy===0)return 0;
  return Math.atan2(dx,-dy);
}
function faceBothFighters(){
  if(!p1||!p2)return;
  if(p1.hp>0&&p2.hp>0){
    p1.facing=facingAngle(p2.x-p1.x,p2.y-p1.y);
    p2.facing=facingAngle(p1.x-p2.x,p1.y-p2.y);
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

// ═══ GAME STATE ═══

// ═══ HELPERS ═══
function getRank(linkCount){
  for(var i=RANKS.length-1;i>=0;i--){if(linkCount>=RANKS[i].links)return RANKS[i]}
  return RANKS[0];
}
function showScreen(id){
  document.querySelectorAll('.screen').forEach(function(s){s.classList.remove('active')});
  document.getElementById(id).classList.add('active');
}

// ═══ STAT GENERATION (§3) ═══
function rollStats(){
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
function deriveStats(stats){
  var dexMod=Math.floor((stats.DEX-10)/2);
  return{
    hp:20+stats.CON*2,
    ac:10+dexMod,
    speed:Math.max(2,Math.min(6,3+dexMod)),
    proficiency:2
  };
}

// ═══ GEAR GENERATION (§4) ═══
function generateGearPiece(round){
  var gt=pick(GEAR_TYPES);
  return generateGearPieceOfType(gt,round);
}

function generateDraftPool(round){
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

function generateGearPieceOfType(gt,round){
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

// ═══ RENDER GEAR CARD ═══
// Produces inline HTML for a small pixel-art gear icon. Use this anywhere
// you'd previously have written `gear.icon` (the emoji). Falls back to the
// emoji only if the gear type lacks a sprite mapping — which shouldn't
// happen because GEAR_TYPES is curated to only include pieces with art.
//   opts.size  — CSS px size for the icon (default 22)
//   opts.slot  — for hand gear, picks the L vs R weapon variant (default RHand)
function gearIconHTML(gear, opts){
  if (!gear) return '';
  opts = opts || {};
  var size = opts.size || 22;
  var slotForCard = opts.slot;
  if (!slotForCard) slotForCard = (gear.pos === 'Hand') ? 'RHand' : 'Body';
  var desc = gearToCardIconDesc(gear, slotForCard);
  if (!desc) return gear.icon || '⚙';   // emoji fallback (sprite missing)
  return '<canvas class="gear-pixel-icon" width="48" height="48" '
    + 'data-glayer="' + desc.layer + '" data-gfile="' + desc.file + '" data-gc="' + desc.c + '" '
    + 'style="width:' + size + 'px;height:' + size + 'px;vertical-align:middle;image-rendering:pixelated;margin-right:4px"></canvas>';
}

function gearCardHTML(gear){
  var socketsHTML='';
  var filled=gear.materia.length;
  var empty=gear.sockets-filled;
  gear.materia.forEach(function(m,i){
    if(i>0){
      var isLinked=i<=gear.links;
      if(isLinked){
        socketsHTML+='<span class="materia-link active"></span>';
      } else {
        socketsHTML+='<span class="materia-gap"></span>';
      }
    }
    if(m.hidden){
      socketsHTML+='<span class="materia-orb" style="color:#333;border-color:#333" title="???">?</span>';
    } else {
      var flashFlag=!!m._justLeveled;
      socketsHTML+=materiaOrbHTML(m.planetIdx, m.level, {size:24, xp:m.xp||0, levelupFlash:flashFlag});
      if(flashFlag) delete m._justLeveled;
    }
  });
  for(var e=0;e<empty;e++){
    if(filled+e>0)socketsHTML+='<span class="materia-gap"></span>';
    socketsHTML+=materiaEmptyOrbHTML({size:24});
  }
  var posLabel=gear.pos==='Hand'?'Hand':'Body';
  var refStr=gear.refinement>0?'<span style="color:#d4a843">+'+gear.refinement+'</span> ':'';
  var stressStr=gear.stressed?'<span style="color:#ef4444;font-size:0.7em" title="Stressed — next failure destroys this gear"> ⚠ STRESSED</span>':'';
  var lvlStr=' <span style="color:#555;font-size:0.75em">Lv'+gearLevel(gear)+'</span>';
  var iconHTML = gearIconHTML(gear, {size: 48});
  return '<div class="gc-row">'+
    '<div class="gc-icon-wrap">'+iconHTML+'</div>'+
    '<div class="gc-text">'+
      '<div class="gc-name">'+refStr+gear.name+lvlStr+stressStr+'</div>'+
      '<div class="gc-pos">'+posLabel+' · '+gear.sockets+' socket'+(gear.sockets>1?'s':'')+(empty>0?' ('+empty+' empty)':'')+'</div>'+
      '<div class="gc-sockets">'+socketsHTML+'</div>'+
      (gear.links>0?'<div class="gc-links">'+gear.links+' link'+(gear.links>1?'s':'')+'</div>':'')+
    '</div>'+
  '</div>';
}

// Paint each gear-card thumbnail by drawing the south-facing idle frame
// (col 1, row 0) of the matching Time Element layer. The MutationObserver
// kicks this off whenever new gear cards land in the DOM; new assets that load
// later trigger redraws through the global redraw queue.
function renderGearIcons() {
  var canvases = document.querySelectorAll('.gear-pixel-icon');
  if (!canvases.length) return;
  var pendingForLater = false;
  canvases.forEach(function(c) {
    var layer = c.getAttribute('data-glayer');
    var file = c.getAttribute('data-gfile');
    var cVar = parseInt(c.getAttribute('data-gc'), 10) || 0;
    var img = (layer === 'weapon')
      ? getElementsWeapon(file, cVar)
      : getElementsPart(layer, file, cVar);
    var ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, c.width, c.height);
    if (!img) { pendingForLater = true; return; }
    // Use the south-facing idle cell (col 1 per Settings.json — "Walk stand").
    ctx.drawImage(img, ELEMENTS_CELL, 0, ELEMENTS_CELL, ELEMENTS_CELL, 0, 0, c.width, c.height);
  });
  if (pendingForLater) elementsRegisterRedraw(document, renderGearIcons);
}

var _gearIconObserver = new MutationObserver(function(){ renderGearIcons(); renderOrbIcons(); });
document.addEventListener('DOMContentLoaded', function() {
  _gearIconObserver.observe(document.documentElement, {childList: true, subtree: true});
});

// ═══ RUN MANAGEMENT ═══
function startRun(overrides){
  overrides = overrides || {};
  var seed = (typeof overrides.appearanceSeed === 'number') ? overrides.appearanceSeed : ((Math.random()*1e9)|0);
  var bodyType = overrides.bodyType || pick(BODY_TYPES);
  var appearance = overrides.appearance || generateAppearance(seed, bodyType);
  var dominant = (overrides.dominantHand === 'L' || overrides.dominantHand === 'R') ? overrides.dominantHand : 'R';
  run={
    round:1,
    quicksilver:0,
    stats:null,
    derived:null,
    mode:_pendingRunMode||'turn',
    bodyType:bodyType,
    appearanceSeed:seed,
    appearance:appearance,
    dominantHand:dominant,
    equipped:{Head:null,LHand:null,Body:null,RHand:null,Lower:null},
    laboratory:[],
    looseMateria:[],
    materiaDust:{},    // planetIdx → dust count; produced by failed socket attempts, spent by reformMateria
    totalDamage:0,
    killCount:0,
    draftPool:null,
    merchantStock:null,
    merchantRound:0
  };
  // Roll stats
  run.stats=rollStats();
  run.derived=deriveStats(run.stats);
  showStatScreen();
}
function startRunRandom(){ startRun(); }

// ═══ MODE ENTRY ═══ (turn-based vs action — both share builder/draft)
function startTurnFlow(){ _pendingRunMode = 'turn'; showForgeChoice(); }
function startActionFlow(){ _pendingRunMode = 'action'; showForgeChoice(); }

// ═══ FORGE CHOICE / CHARACTER BUILDER ═══
function showForgeChoice(){ showScreen('forgeChoiceScreen'); }

// Layer rows shown in the builder (in the order the user sees them).
var BUILDER_ROWS = [
  { key:'head',       label:'Head'      },
  { key:'hair',       label:'Hair'      },
  { key:'backhair',   label:'Back Hair' },
  { key:'top',        label:'Top'       },
  { key:'bottom',     label:'Bottom'    },
  { key:'hat',        label:'Hat'       },
  { key:'frontextra', label:'Front Acc' },
  { key:'backextra',  label:'Back Acc'  }
];

var builderState = null;
var _builderAnimTimer = null;
var _builderAnimStart = 0;

function openBuilder(){
  var seed = (Math.random()*1e9)|0;
  var bodyType = pick(BODY_TYPES);
  builderState = {
    seed: seed,
    bodyType: bodyType,
    appearance: generateAppearance(seed, bodyType),
    face: 0,                                           // south
    dominantHand: 'R',                                 // default right-handed
    cosmeticGear: { LHand:null, Body:null, RHand:null } // cosmetic only — not carried into the draft
  };
  showScreen('builderScreen');
  renderBuilderControls();
  renderBuilderPreview();
  startBuilderAnim();
  // Diagnostic: confirm palette-swap actually works on this page's origin.
  var el = document.getElementById('builderSkinStatus');
  if (el){
    el.textContent = 'checking skin-tone support…';
    _testSkinSwap(function(ok){
      if (ok){
        el.innerHTML = '<span style="color:#4ade80">✓ skin tones active</span> · <span style="color:var(--dim)">protocol: ' + location.protocol + '</span>';
      } else {
        el.innerHTML = '<span style="color:#ef4444">⚠ skin tones disabled</span> · serve the folder via <strong>http://localhost</strong> (current protocol: ' + location.protocol + ')';
      }
    });
  }
}

function setBuilderFace(face){
  if (!builderState) return;
  builderState.face = face|0;
  document.querySelectorAll('#builderScreen .face-tab').forEach(function(t){
    t.classList.toggle('active', parseInt(t.getAttribute('data-face'),10) === builderState.face);
  });
  renderBuilderPreview();
}

function renderBuilderControls(){
  var el = document.getElementById('builderControls');
  if (!el || !builderState) return;
  var html = '';
  // Body type + Skin tone share a row.
  var bt = builderState.bodyType;
  var toneIdx = (builderState.appearance.skinTone | 0);
  var toneName = (ELEMENTS_SKIN_TONES[toneIdx] && ELEMENTS_SKIN_TONES[toneIdx].name) || 'Default';
  html += '<div class="builder-row">'
    + '<div class="b-label">Body</div>'
    + '<div class="b-spinner">'
    +   '<button class="b-arrow" onclick="shiftBuilderBody(-1)">◄</button>'
    +   '<div class="b-val">'+ (bt.charAt(0).toUpperCase() + bt.slice(1)) +'</div>'
    +   '<button class="b-arrow" onclick="shiftBuilderBody(1)">►</button>'
    + '</div>'
    + '<div class="b-spinner right">'
    +   '<span class="b-lbl">skin</span>'
    +   '<button class="b-arrow" onclick="shiftBuilderSkin(-1)">◄</button>'
    +   '<div class="b-val" style="min-width:54px">'+ toneName +'</div>'
    +   '<button class="b-arrow" onclick="shiftBuilderSkin(1)">►</button>'
    + '</div>'
    + '</div>';

  // Handedness — drives main-vs-off-hand semantics on the draft screen.
  var dom = builderState.dominantHand || 'R';
  html += '<div class="builder-row">'
    + '<div class="b-label">Handed</div>'
    + '<div class="b-spinner">'
    +   '<button class="b-arrow" onclick="shiftBuilderHand()">◄</button>'
    +   '<div class="b-val">'+ (dom === 'L' ? 'Left-handed' : 'Right-handed') +'</div>'
    +   '<button class="b-arrow" onclick="shiftBuilderHand()">►</button>'
    + '</div>'
    + '</div>';

  BUILDER_ROWS.forEach(function(row){
    var p = builderState.appearance[row.key];
    var partName = p ? (p.name || (p.n ? (row.key + p.n) : null)) : null;
    var manifest = ELEMENTS_MANIFEST[row.key];
    var spec = (partName && manifest && manifest.parts) ? manifest.parts.find(function(x){ return x.name === partName; }) : null;
    var maxC = (spec && spec.maxC) || 0;
    var partLabel = partName ? _builderPartLabel(row.key, partName) : '—';
    var partLabelClass = partName ? '' : 'dim';
    var colorDisabled = !partName || maxC === 0;
    html += '<div class="builder-row">'
      + '<div class="b-label">'+row.label+'</div>'
      + '<div class="b-spinner">'
      +   '<button class="b-arrow" onclick="shiftBuilderPart(\''+row.key+'\',-1)">◄</button>'
      +   '<div class="b-val '+partLabelClass+'" style="min-width:64px">'+partLabel+'</div>'
      +   '<button class="b-arrow" onclick="shiftBuilderPart(\''+row.key+'\',1)">►</button>'
      + '</div>'
      + '<div class="b-spinner right">'
      +   '<span class="b-lbl">color</span>'
      +   '<button class="b-arrow" '+(colorDisabled?'disabled':'')+' onclick="shiftBuilderColor(\''+row.key+'\',-1)">◄</button>'
      +   '<div class="b-val">'+ (partName ? (p.c||0) : '—') +'</div>'
      +   '<button class="b-arrow" '+(colorDisabled?'disabled':'')+' onclick="shiftBuilderColor(\''+row.key+'\',1)">►</button>'
      + '</div>'
      + '</div>';
  });

  // Cosmetic-only loadout. These slots render on the preview but are NOT
  // carried into the gear draft — they're just for trying looks on.
  // "Weapon" maps to the dominant hand's physical slot; "Off-Hand" to the other.
  var bdom = builderState.dominantHand || 'R';
  var mainSlot = (bdom === 'L') ? 'LHand' : 'RHand';
  var offSlot  = (bdom === 'L') ? 'RHand' : 'LHand';
  html += '<div style="font-size:0.7em;color:var(--muted);text-align:center;margin:6px 0 2px;letter-spacing:0.1em;font-family:\'Cinzel\',serif">~ cosmetic loadout ~</div>';
  [[mainSlot,'Weapon'],[offSlot,'Off-Hand'],['Body','Armor']].forEach(function(pair){
    var slot = pair[0], label = pair[1];
    var item = builderState.cosmeticGear[slot];
    var lbl = item ? (item.type + ' T' + (item.tier|0)) : '—';
    var cls = item ? '' : 'dim';
    html += '<div class="builder-row">'
      + '<div class="b-label">'+label+'</div>'
      + '<div class="b-spinner">'
      +   '<button class="b-arrow" onclick="shiftBuilderCosmetic(\''+slot+'\',-1)">◄</button>'
      +   '<div class="b-val '+cls+'" style="min-width:96px">'+lbl+'</div>'
      +   '<button class="b-arrow" onclick="shiftBuilderCosmetic(\''+slot+'\',1)">►</button>'
      + '</div>'
      + '</div>';
  });

  el.innerHTML = html;
}

// Pre-set cosmetic loadout choices. Both hand slots share the same hand cycle
// so swapping the physical slots (on handedness toggle) never loses a value.
var BUILDER_HAND_CYCLE = [
  null,
  {type:'Sword', tier:0, pos:'Hand'}, {type:'Sword', tier:2, pos:'Hand'}, {type:'Sword', tier:4, pos:'Hand'},
  {type:'Dagger', tier:0, pos:'Hand'}, {type:'Dagger', tier:2, pos:'Hand'},
  {type:'Wand', tier:0, pos:'Hand'}, {type:'Wand', tier:3, pos:'Hand'},
  {type:'Bow', tier:0, pos:'Hand'}, {type:'Bow', tier:2, pos:'Hand'},
  {type:'Axe', tier:0, pos:'Hand'}, {type:'Axe', tier:2, pos:'Hand'},
  {type:'Hammer', tier:0, pos:'Hand'}, {type:'Hammer', tier:2, pos:'Hand'},
  {type:'Club', tier:0, pos:'Hand'},
  {type:'Buckler', tier:0, pos:'Hand'}, {type:'Buckler', tier:3, pos:'Hand'}
];
var BUILDER_COSMETIC_CYCLES = {
  RHand: BUILDER_HAND_CYCLE,
  LHand: BUILDER_HAND_CYCLE,
  Body: [
    null,
    {type:'Plate', tier:0, pos:'Body'}, {type:'Plate', tier:2, pos:'Body'}, {type:'Plate', tier:4, pos:'Body'},
    {type:'Mail', tier:0, pos:'Body'}, {type:'Mail', tier:2, pos:'Body'},
    {type:'Robes', tier:0, pos:'Body'}, {type:'Robes', tier:2, pos:'Body'},
    {type:'Cloak', tier:0, pos:'Body'}, {type:'Cloak', tier:1, pos:'Body'},
    {type:'Vest', tier:0, pos:'Body'}, {type:'Vest', tier:2, pos:'Body'}
  ]
};

function _cosmeticMatches(a, b){
  if (a === null && b === null) return true;
  if (!a || !b) return false;
  return a.type === b.type && (a.tier|0) === (b.tier|0);
}

function shiftBuilderCosmetic(slot, delta){
  if (!builderState) return;
  var cycle = BUILDER_COSMETIC_CYCLES[slot];
  if (!cycle) return;
  var current = builderState.cosmeticGear[slot];
  var idx = cycle.findIndex(function(g){ return _cosmeticMatches(g, current); });
  if (idx < 0) idx = 0;
  idx = (idx + delta + cycle.length) % cycle.length;
  builderState.cosmeticGear[slot] = cycle[idx] ? Object.assign({}, cycle[idx]) : null;
  renderBuilderControls();
  renderBuilderPreview();
}

// Display label for a part: show just the trailing digits when the name is
// `<layer><N>` (e.g. head1 → "1"), otherwise show the full name (backpack1, crown1).
function _builderPartLabel(layer, name){
  if (name.indexOf(layer) === 0){
    var rest = name.slice(layer.length);
    if (/^\d+$/.test(rest)) return rest;
  }
  return name;
}

// Cycle list for a layer: [null] (if optional) followed by every manifest part
// in declaration order. Used by the part spinner arrows.
function _builderPartCycle(layer){
  var m = ELEMENTS_MANIFEST[layer];
  if (!m || !m.parts) return [];
  var list = m.parts.slice();
  if (m.allowEmpty) list = [null].concat(list);
  return list;
}

function shiftBuilderPart(layer, delta){
  if (!builderState) return;
  var cycle = _builderPartCycle(layer);
  if (!cycle.length) return;
  var current = builderState.appearance[layer];
  var currentName = current ? (current.name || (current.n ? (layer + current.n) : null)) : null;
  var idx = cycle.findIndex(function(p){
    return (p === null && !currentName) || (p && p.name === currentName);
  });
  if (idx < 0) idx = 0;
  idx = (idx + delta + cycle.length) % cycle.length;
  var picked = cycle[idx];
  if (!picked){
    builderState.appearance[layer] = null;
  } else {
    var c = (current && current.c) || 0;
    var maxC = picked.maxC || 0;
    if (c > maxC) c = 0;
    builderState.appearance[layer] = { name: picked.name, c: c };
  }
  renderBuilderControls();
  renderBuilderPreview();
}

function shiftBuilderColor(layer, delta){
  if (!builderState) return;
  var p = builderState.appearance[layer];
  if (!p) return;
  var partName = p.name || (p.n ? (layer + p.n) : null);
  if (!partName) return;
  var m = ELEMENTS_MANIFEST[layer];
  var spec = m.parts.find(function(x){ return x.name === partName; });
  if (!spec) return;
  var maxC = spec.maxC || 0;
  if (maxC === 0) return;
  var total = maxC + 1;  // includes color 0 (base)
  p.c = ((p.c || 0) + delta + total) % total;
  if (!p.name) p.name = partName;  // normalize legacy
  renderBuilderControls();
  renderBuilderPreview();
}

function shiftBuilderBody(delta){
  if (!builderState) return;
  var idx = BODY_TYPES.indexOf(builderState.bodyType);
  if (idx < 0) idx = 0;
  idx = (idx + delta + BODY_TYPES.length) % BODY_TYPES.length;
  builderState.bodyType = BODY_TYPES[idx];
  renderBuilderControls();
  renderBuilderPreview();
}

function shiftBuilderHand(){
  if (!builderState) return;
  builderState.dominantHand = (builderState.dominantHand === 'L') ? 'R' : 'L';
  // Physical-slot swap so the equipped cosmetic weapon visually moves to the
  // new main hand. Slot-suffixed weapons (daggers/shields) pick up the right
  // L/R sprite automatically; non-suffixed weapons (sword, wand, etc.) get a
  // mirror flag from gearToWeaponDesc.
  var l = builderState.cosmeticGear.LHand;
  var r = builderState.cosmeticGear.RHand;
  builderState.cosmeticGear.LHand = r;
  builderState.cosmeticGear.RHand = l;
  renderBuilderControls();
  renderBuilderPreview();
}

function shiftBuilderSkin(delta){
  if (!builderState) return;
  var cur = (builderState.appearance.skinTone | 0);
  var n = ELEMENTS_SKIN_TONES.length;
  builderState.appearance.skinTone = ((cur + delta) % n + n) % n;
  renderBuilderControls();
  renderBuilderPreview();
}

function randomizeBuilder(){
  if (!builderState) return;
  builderState.seed = (Math.random()*1e9)|0;
  builderState.appearance = generateAppearance(builderState.seed, builderState.bodyType);
  renderBuilderControls();
  renderBuilderPreview();
}

function confirmBuilder(){
  if (!builderState) { showForgeChoice(); return; }
  stopBuilderAnim();
  startRun({
    bodyType: builderState.bodyType,
    appearance: builderState.appearance,
    appearanceSeed: builderState.seed,
    dominantHand: builderState.dominantHand
  });
}

// Builder preview — idle pose with a 4-phase bob (see computeIdleBob).
function renderBuilderPreview(){
  if (!builderState) return;
  var cv = document.getElementById('builderPreviewCanvas');
  if (!cv) return;
  var eff = effectiveAppearance(builderState.appearance, builderState.cosmeticGear);
  var weapons = fighterWeaponLayers({ gear: builderState.cosmeticGear });
  compositeCharacter(cv, eff, 'idle', 0, builderState.face, weapons);
  elementsRegisterRedraw(cv, renderBuilderPreview);
  registerBobRenderer(cv, renderBuilderPreview);
}

function startBuilderAnim(){
  // Mark the South face tab active on open.
  document.querySelectorAll('#builderScreen .face-tab').forEach(function(t){
    t.classList.toggle('active', parseInt(t.getAttribute('data-face'),10) === (builderState ? builderState.face : 0));
  });
}
function stopBuilderAnim(){ /* no-op (preview is static) */ }

// ════════════════════════════════════════════════════════════
//   DEBUG ROOM — character/frame inspector
//   Reuses the builder's helpers (BUILDER_ROWS, _builderPartCycle,
//   _builderPartLabel, BUILDER_COSMETIC_CYCLES, _cosmeticMatches) but
//   keeps its own state so it can't bleed into a real run, and adds
//   Anim + Frame spinners. Bob is disabled so the pose is pin-static.
// ════════════════════════════════════════════════════════════
var debugState = null;

function openDebug(){
  var seed = (Math.random()*1e9)|0;
  var bodyType = pick(BODY_TYPES);
  debugState = {
    seed: seed,
    bodyType: bodyType,
    appearance: generateAppearance(seed, bodyType),
    face: 0,
    dominantHand: 'R',
    cosmeticGear: { LHand:null, Body:null, RHand:null },
    animName: 'idle',
    frame: 0
  };
  showScreen('debugScreen');
  renderDebugControls();
  renderDebugPreview();
  document.querySelectorAll('#debugScreen .face-tab').forEach(function(t){
    t.classList.toggle('active', parseInt(t.getAttribute('data-face'),10) === 0);
  });
}

function setDebugFace(f){
  if (!debugState) return;
  debugState.face = f|0;
  document.querySelectorAll('#debugScreen .face-tab').forEach(function(t){
    t.classList.toggle('active', parseInt(t.getAttribute('data-face'),10) === debugState.face);
  });
  renderDebugPreview();
}

function shiftDebugAnim(delta){
  if (!debugState) return;
  var anims = Object.keys(ELEMENTS_ANIMS);
  var idx = anims.indexOf(debugState.animName);
  if (idx < 0) idx = 0;
  idx = (idx + delta + anims.length) % anims.length;
  debugState.animName = anims[idx];
  debugState.frame = 0;
  renderDebugControls();
  renderDebugPreview();
}
function shiftDebugFrame(delta){
  if (!debugState) return;
  var ad = ELEMENTS_ANIMS[debugState.animName] || ELEMENTS_ANIMS.idle;
  var max = ad.frames || 1;
  debugState.frame = ((debugState.frame + delta) % max + max) % max;
  renderDebugControls();
  renderDebugPreview();
}
function shiftDebugBody(delta){
  if (!debugState) return;
  var idx = BODY_TYPES.indexOf(debugState.bodyType);
  if (idx < 0) idx = 0;
  idx = (idx + delta + BODY_TYPES.length) % BODY_TYPES.length;
  debugState.bodyType = BODY_TYPES[idx];
  renderDebugControls();
  renderDebugPreview();
}
function shiftDebugSkin(delta){
  if (!debugState) return;
  var cur = (debugState.appearance.skinTone | 0);
  var n = ELEMENTS_SKIN_TONES.length;
  debugState.appearance.skinTone = ((cur + delta) % n + n) % n;
  renderDebugControls();
  renderDebugPreview();
}
function shiftDebugHand(){
  if (!debugState) return;
  debugState.dominantHand = (debugState.dominantHand === 'L') ? 'R' : 'L';
  var l = debugState.cosmeticGear.LHand;
  var r = debugState.cosmeticGear.RHand;
  debugState.cosmeticGear.LHand = r;
  debugState.cosmeticGear.RHand = l;
  renderDebugControls();
  renderDebugPreview();
}
function shiftDebugPart(layer, delta){
  if (!debugState) return;
  var cycle = _builderPartCycle(layer);
  if (!cycle.length) return;
  var current = debugState.appearance[layer];
  var currentName = current ? (current.name || (current.n ? (layer + current.n) : null)) : null;
  var idx = cycle.findIndex(function(p){
    return (p === null && !currentName) || (p && p.name === currentName);
  });
  if (idx < 0) idx = 0;
  idx = (idx + delta + cycle.length) % cycle.length;
  var picked = cycle[idx];
  if (!picked){
    debugState.appearance[layer] = null;
  } else {
    var c = (current && current.c) || 0;
    var maxC = picked.maxC || 0;
    if (c > maxC) c = 0;
    debugState.appearance[layer] = { name: picked.name, c: c };
  }
  renderDebugControls();
  renderDebugPreview();
}
function shiftDebugColor(layer, delta){
  if (!debugState) return;
  var p = debugState.appearance[layer];
  if (!p) return;
  var partName = p.name || (p.n ? (layer + p.n) : null);
  if (!partName) return;
  var m = ELEMENTS_MANIFEST[layer];
  var spec = m.parts.find(function(x){ return x.name === partName; });
  if (!spec) return;
  var maxC = spec.maxC || 0;
  if (maxC === 0) return;
  var total = maxC + 1;
  p.c = ((p.c || 0) + delta + total) % total;
  if (!p.name) p.name = partName;
  renderDebugControls();
  renderDebugPreview();
}
function shiftDebugCosmetic(slot, delta){
  if (!debugState) return;
  var cycle = BUILDER_COSMETIC_CYCLES[slot];
  if (!cycle) return;
  var current = debugState.cosmeticGear[slot];
  var idx = cycle.findIndex(function(g){ return _cosmeticMatches(g, current); });
  if (idx < 0) idx = 0;
  idx = (idx + delta + cycle.length) % cycle.length;
  debugState.cosmeticGear[slot] = cycle[idx] ? Object.assign({}, cycle[idx]) : null;
  renderDebugControls();
  renderDebugPreview();
}
function randomizeDebug(){
  if (!debugState) return;
  debugState.seed = (Math.random()*1e9)|0;
  debugState.appearance = generateAppearance(debugState.seed, debugState.bodyType);
  renderDebugControls();
  renderDebugPreview();
}

function renderDebugControls(){
  var el = document.getElementById('debugControls');
  if (!el || !debugState) return;
  var html = '';

  // ─── Anim + Frame ───
  var ad = ELEMENTS_ANIMS[debugState.animName] || ELEMENTS_ANIMS.idle;
  var maxFrame = (ad.frames || 1) - 1;
  html += '<div class="builder-row">'
    + '<div class="b-label">Anim</div>'
    + '<div class="b-spinner">'
    +   '<button class="b-arrow" onclick="shiftDebugAnim(-1)">◄</button>'
    +   '<div class="b-val" style="min-width:90px">'+debugState.animName+'</div>'
    +   '<button class="b-arrow" onclick="shiftDebugAnim(1)">►</button>'
    + '</div>'
    + '<div class="b-spinner right">'
    +   '<span class="b-lbl">frame</span>'
    +   '<button class="b-arrow" '+(maxFrame===0?'disabled':'')+' onclick="shiftDebugFrame(-1)">◄</button>'
    +   '<div class="b-val">'+debugState.frame+' / '+maxFrame+'</div>'
    +   '<button class="b-arrow" '+(maxFrame===0?'disabled':'')+' onclick="shiftDebugFrame(1)">►</button>'
    + '</div>'
    + '</div>';

  // ─── Body + Skin ───
  var bt = debugState.bodyType;
  var toneIdx = (debugState.appearance.skinTone | 0);
  var toneName = (ELEMENTS_SKIN_TONES[toneIdx] && ELEMENTS_SKIN_TONES[toneIdx].name) || 'Default';
  html += '<div class="builder-row">'
    + '<div class="b-label">Body</div>'
    + '<div class="b-spinner">'
    +   '<button class="b-arrow" onclick="shiftDebugBody(-1)">◄</button>'
    +   '<div class="b-val">'+ (bt.charAt(0).toUpperCase() + bt.slice(1)) +'</div>'
    +   '<button class="b-arrow" onclick="shiftDebugBody(1)">►</button>'
    + '</div>'
    + '<div class="b-spinner right">'
    +   '<span class="b-lbl">skin</span>'
    +   '<button class="b-arrow" onclick="shiftDebugSkin(-1)">◄</button>'
    +   '<div class="b-val" style="min-width:54px">'+ toneName +'</div>'
    +   '<button class="b-arrow" onclick="shiftDebugSkin(1)">►</button>'
    + '</div>'
    + '</div>';

  // ─── Handed ───
  var dom = debugState.dominantHand || 'R';
  html += '<div class="builder-row">'
    + '<div class="b-label">Handed</div>'
    + '<div class="b-spinner">'
    +   '<button class="b-arrow" onclick="shiftDebugHand()">◄</button>'
    +   '<div class="b-val">'+ (dom === 'L' ? 'Left-handed' : 'Right-handed') +'</div>'
    +   '<button class="b-arrow" onclick="shiftDebugHand()">►</button>'
    + '</div>'
    + '</div>';

  // ─── Per-layer rows ───
  BUILDER_ROWS.forEach(function(row){
    var p = debugState.appearance[row.key];
    var partName = p ? (p.name || (p.n ? (row.key + p.n) : null)) : null;
    var manifest = ELEMENTS_MANIFEST[row.key];
    var spec = (partName && manifest && manifest.parts) ? manifest.parts.find(function(x){ return x.name === partName; }) : null;
    var maxC = (spec && spec.maxC) || 0;
    var partLabel = partName ? _builderPartLabel(row.key, partName) : '—';
    var partLabelClass = partName ? '' : 'dim';
    var colorDisabled = !partName || maxC === 0;
    html += '<div class="builder-row">'
      + '<div class="b-label">'+row.label+'</div>'
      + '<div class="b-spinner">'
      +   '<button class="b-arrow" onclick="shiftDebugPart(\''+row.key+'\',-1)">◄</button>'
      +   '<div class="b-val '+partLabelClass+'" style="min-width:64px">'+partLabel+'</div>'
      +   '<button class="b-arrow" onclick="shiftDebugPart(\''+row.key+'\',1)">►</button>'
      + '</div>'
      + '<div class="b-spinner right">'
      +   '<span class="b-lbl">color</span>'
      +   '<button class="b-arrow" '+(colorDisabled?'disabled':'')+' onclick="shiftDebugColor(\''+row.key+'\',-1)">◄</button>'
      +   '<div class="b-val">'+ (partName ? (p.c||0) : '—') +'</div>'
      +   '<button class="b-arrow" '+(colorDisabled?'disabled':'')+' onclick="shiftDebugColor(\''+row.key+'\',1)">►</button>'
      + '</div>'
      + '</div>';
  });

  // ─── Cosmetic loadout ───
  var bdom = debugState.dominantHand || 'R';
  var mainSlot = (bdom === 'L') ? 'LHand' : 'RHand';
  var offSlot  = (bdom === 'L') ? 'RHand' : 'LHand';
  html += '<div style="font-size:0.7em;color:var(--muted);text-align:center;margin:6px 0 2px;letter-spacing:0.1em;font-family:\'Cinzel\',serif">~ cosmetic loadout ~</div>';
  [[mainSlot,'Weapon'],[offSlot,'Off-Hand'],['Body','Armor']].forEach(function(pair){
    var slot = pair[0], label = pair[1];
    var item = debugState.cosmeticGear[slot];
    var lbl = item ? (item.type + ' T' + (item.tier|0)) : '—';
    var cls = item ? '' : 'dim';
    html += '<div class="builder-row">'
      + '<div class="b-label">'+label+'</div>'
      + '<div class="b-spinner">'
      +   '<button class="b-arrow" onclick="shiftDebugCosmetic(\''+slot+'\',-1)">◄</button>'
      +   '<div class="b-val '+cls+'" style="min-width:96px">'+lbl+'</div>'
      +   '<button class="b-arrow" onclick="shiftDebugCosmetic(\''+slot+'\',1)">►</button>'
      + '</div>'
      + '</div>';
  });

  el.innerHTML = html;
}

function renderDebugPreview(){
  if (!debugState) return;
  var cv = document.getElementById('debugPreviewCanvas');
  if (!cv) return;
  var eff = effectiveAppearance(debugState.appearance, debugState.cosmeticGear);
  var weapons = fighterWeaponLayers({ gear: debugState.cosmeticGear });
  // bobOpts.disabled — pin the exact frame for layer inspection.
  compositeCharacter(cv, eff, debugState.animName, debugState.frame, debugState.face, weapons, { disabled: true });
  // When inspecting Cast, also paint the matching VFX frame so the user can
  // walk through the sequence and check overlay alignment.
  if (debugState.animName === 'cast'){
    var castAd = ELEMENTS_ANIMS.cast;
    var maxFrame = (castAd.frames || 1) - 1;
    var fxIdx = maxFrame > 0 ? Math.round((debugState.frame / maxFrame) * (CAST_FX_COUNT - 1)) : 0;
    drawCastFxOnCanvas(cv, null, fxIdx);
  }
  elementsRegisterRedraw(cv, renderDebugPreview);
  // Status line under the preview canvas.
  var lbl = document.getElementById('debugFrameLabel');
  if (lbl){
    var ad = ELEMENTS_ANIMS[debugState.animName] || ELEMENTS_ANIMS.idle;
    var col = ad.cols ? ad.cols[debugState.frame] : ((ad.startCol||0) + debugState.frame);
    var facingName = ['South','West','East','North'][debugState.face];
    lbl.textContent = debugState.animName + ' · frame ' + debugState.frame + ' · sheet col ' + col + ' · ' + facingName;
  }
}

// ═══ STAT SCREEN ═══
function showStatScreen(){
  showScreen('statScreen');
  var el=document.getElementById('statReveal');
  var stats=run.stats;
  var d=run.derived;
  var statsHTML='';
  ['STR','DEX','CON','INT','WIS','CHA'].forEach(function(s){
    var mod=Math.floor((stats[s]-10)/2);
    var sign=mod>=0?'+':'';
    statsHTML+='<div class="roll-item revealed"><div class="roll-val">'+stats[s]+'</div><div class="roll-lbl">'+s+'</div><div class="roll-mod">'+sign+mod+'</div></div>';
  });
  var cvW=200,cvH=200;
  el.innerHTML='<h2>⚗ YOUR ALCHEMIST ⚗</h2>'+
    '<div class="sprite-preview"><canvas id="statSprite" width="'+cvW+'" height="'+cvH+'" style="width:'+cvW+'px;height:'+cvH+'px"></canvas></div>'+
    '<div class="roll-grid">'+statsHTML+'</div>'+
    '<div class="derived-stats">'+
      '<span>HP '+d.hp+'</span><span>AC '+d.ac+'</span><span>Speed '+d.speed+'</span><span>Prof +'+d.proficiency+'</span>'+
    '</div>'+
    '<div style="margin-top:16px">'+
      '<button class="reroll-btn" onclick="rerollStats()">↻ Reroll</button>'+
      '<button class="title-btn" style="display:inline-block;width:auto;padding:12px 32px" onclick="goToDraft()">⚔ PROCEED TO DRAFT ⚔</button>'+
    '</div>';
  setTimeout(function(){
    renderSpriteStatic(document.getElementById('statSprite'),run.bodyType,Math.PI,'idle',0,{gear:run.equipped,appearance:run.appearance,appearanceSeed:run.appearanceSeed,prime:run.bodyType});
  },50);
}
function rerollStats(){
  run.stats=rollStats();
  run.derived=deriveStats(run.stats);
  // Note: appearance and bodyType are NOT re-randomized here — the player may
  // have hand-built their alchemist. Stat rolls are independent of appearance.
  showStatScreen();
}

// ═══ DRAFT SCREEN ═══
function goToDraft(){
  run.draftPool=generateDraftPool(run.round);
  run.equipped={Head:null,LHand:null,Body:null,RHand:null,Lower:null};
  showScreen('draftScreen');
  document.getElementById('draftRoundInfo').textContent='Round '+run.round+' — '+ROUND_METALS[run.round-1].sym+' '+ROUND_METALS[run.round-1].name;
  renderDraft();
}

function renderDraft(){
  var eqEl=document.getElementById('equippedSlots');
  eqEl.innerHTML='';
  var totalSockets=0;
  var dom=run.dominantHand||'R';
  function handLabel(pos){ return pos==='Body' ? '' : (pos.charAt(0)===dom ? 'Main' : 'Off'); }
  EQUIP_SLOTS.forEach(function(pos){
    var gear=run.equipped[pos];
    var slot=document.createElement('div');
    var slotClass = pos.toLowerCase();
    slot.className='eq-slot eq-slot-'+slotClass+(gear?' filled':'');
    slot.setAttribute('data-pos', pos);
    // Drop target — accepts any gear whose pos matches this slot.
    slot.addEventListener('dragover', function(e){
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      slot.classList.add('drop-target');
    });
    slot.addEventListener('dragleave', function(){
      slot.classList.remove('drop-target');
    });
    slot.addEventListener('drop', (function(targetPos){return function(e){
      e.preventDefault();
      slot.classList.remove('drop-target');
      var gearId = e.dataTransfer.getData('text/plain');
      var dropped = (run.draftPool||[]).find(function(g){return g && g.id === gearId;});
      if (!dropped) return;
      _equipDroppedGear(dropped, targetPos);
    };})(pos));
    // Dynamic label: show gear role (weapon/shield/armor/head/lower) plus main/off semantics
    var label;
    if(gear){
      if(pos==='Body')  label='🛡 ARMOR';
      else if(pos==='Head')  label='⛑ HEAD';
      else if(pos==='Lower') label='👖 LOWER';
      else {
        var isWeapon=WEAPON_GEAR_TYPES.indexOf(gear.type)>=0;
        label=(isWeapon?'⚔ WEAPON':'🛡 SHIELD')+' · '+handLabel(pos);
      }
    } else {
      if (pos==='Body')  label='ARMOR';
      else if (pos==='Head')  label='HEAD';
      else if (pos==='Lower') label='LOWER';
      else label=handLabel(pos).toUpperCase();
    }
    slot.innerHTML='<div class="slot-label">'+label+'</div>';
    if(gear){
      totalSockets+=gear.sockets;
      slot.innerHTML+='<div class="slot-name">'+gearIconHTML(gear,{size:20,slot:pos})+gear.name+'</div>'+
        '<div class="slot-sockets">'+gear.sockets+' socket'+(gear.sockets>1?'s':'')+'</div>'+
        '<div class="slot-clear" onclick="clearSlot(\''+pos+'\')">✕ remove</div>';
    } else {
      slot.innerHTML+='<div class="slot-name" style="color:#444">empty</div>';
    }
    eqEl.appendChild(slot);
  });
  // Socket counter (informational only)
  var sc=document.getElementById('socketCounter');
  // Slot-choice prompt — both hands free, player needs to decide where to equip.
  if(run._pendingEquip){
    var pg=run._pendingEquip.gear;
    var pdom=run.dominantHand||'R';
    var pMain=(pdom==='L')?'LHand':'RHand';
    var pOff =(pdom==='L')?'RHand':'LHand';
    sc.innerHTML='<div style="background:rgba(212,168,67,0.08);border:1px solid rgba(212,168,67,0.4);border-radius:8px;padding:10px;margin:6px auto;max-width:440px;text-align:center">'
      + '<div style="font-size:0.85em;color:#e8e0d0;margin-bottom:6px">Equip '+gearIconHTML(pg,{size:18})+'<span style="color:var(--gold)">'+pg.name+'</span> to:</div>'
      + '<button class="title-btn" style="display:inline-block;width:auto;padding:6px 18px;margin:2px 4px;font-size:0.8em" onclick="equipDraftGearTo(\''+pMain+'\')">Main Hand</button>'
      + '<button class="title-btn" style="display:inline-block;width:auto;padding:6px 18px;margin:2px 4px;font-size:0.8em" onclick="equipDraftGearTo(\''+pOff+'\')">Off-Hand</button>'
      + '<button class="reroll-btn" style="display:inline-block;margin:2px 4px;padding:6px 14px;font-size:0.8em" onclick="cancelDraftEquipPrompt()">cancel</button>'
      + '</div>';
  } else {
    sc.innerHTML='<span style="color:var(--dim)">Total sockets: </span><span class="count">'+totalSockets+'</span>';
  }
  // Draft pool
  var pool=document.getElementById('draftPool');
  pool.innerHTML='';
  run.draftPool.forEach(function(gear,i){
    var card=document.createElement('div');
    card.className='gear-card';
    var canFit=canEquipGear(gear);
    var isEquipped=Object.values(run.equipped).some(function(g){return g&&g.id===gear.id});
    if(isEquipped)card.className+=' selected';
    else if(!canFit)card.className+=' disabled';
    card.innerHTML=gearCardHTML(gear);
    card.onclick=function(){if(canFit&&!isEquipped)equipDraftGear(gear)};
    // Drag source — equipped/disabled cards aren't draggable.
    if (!isEquipped){
      card.draggable = true;
      card.setAttribute('data-gear-id', gear.id);
      card.addEventListener('dragstart', (function(g){return function(e){
        e.dataTransfer.setData('text/plain', g.id);
        e.dataTransfer.effectAllowed = 'move';
        card.classList.add('dragging');
        // Highlight valid drop targets while dragging.
        document.querySelectorAll('#equippedSlots .eq-slot').forEach(function(s){
          var pos = s.getAttribute('data-pos');
          if (_canDropGearOn(g, pos)) s.classList.add('drop-allowed');
        });
      };})(gear));
      card.addEventListener('dragend', function(){
        card.classList.remove('dragging');
        document.querySelectorAll('#equippedSlots .eq-slot').forEach(function(s){
          s.classList.remove('drop-allowed','drop-target');
        });
      });
    }
    pool.appendChild(card);
  });
  // Confirm button — just need all 3 slots filled
  var cf=document.getElementById('draftConfirm');
  var allFilled = EQUIP_SLOTS.every(function(s){ return !!run.equipped[s]; });
  if(allFilled){
    cf.innerHTML='<button class="title-btn" onclick="confirmDraft()">⚔ ENTER BATTLE ⚔</button>';
  } else {
    cf.innerHTML='<div style="font-size:0.75em;color:var(--dim);padding:8px">Equip gear in all three slots to proceed.</div>';
  }
  // Live character preview with the currently-equipped gear.
  renderDraftCharacter();
}

var _draftFace = 0;  // south by default; user can rotate via the face tabs
function setDraftFace(f){
  _draftFace = f|0;
  renderDraftCharacter();
}
// Rotate the draft preview as if on a turntable. Visual order is the cardinal
// compass cycle: S(0) → E(2) → N(3) → W(1) → S, and reverse for counter-clockwise.
// (Row indices come from the Time Element spritesheet, not compass numbering.)
var _DRAFT_ROTATION_CW  = [0, 2, 3, 1];
function rotateDraftFace(dir){
  var cur = _draftFace | 0;
  var idx = _DRAFT_ROTATION_CW.indexOf(cur);
  if (idx < 0) idx = 0;
  var n = _DRAFT_ROTATION_CW.length;
  idx = (idx + (dir > 0 ? 1 : -1) + n) % n;
  setDraftFace(_DRAFT_ROTATION_CW[idx]);
}
function renderDraftCharacter(){
  var cv=document.getElementById('draftCharCanvas');
  if(!cv||!run||!run.appearance)return;
  var eff=effectiveAppearance(run.appearance,run.equipped);
  var weapons=fighterWeaponLayers({gear:run.equipped});
  compositeCharacter(cv, eff, 'idle', 0, _draftFace, weapons);
  elementsRegisterRedraw(cv, renderDraftCharacter);
  registerBobRenderer(cv, renderDraftCharacter);
}

function canEquipGear(gear){
  if(gear.pos==='Hand'){
    // Must have an empty hand slot
    if(run.equipped.LHand&&run.equipped.RHand)return false;
    // Enforce: one weapon + one shield, no dual wielding
    var isWeapon=WEAPON_GEAR_TYPES.indexOf(gear.type)>=0;
    var isShield=SHIELD_GEAR_TYPES.indexOf(gear.type)>=0;
    var existingGear=run.equipped.LHand||run.equipped.RHand;
    if(existingGear){
      var existIsWeapon=WEAPON_GEAR_TYPES.indexOf(existingGear.type)>=0;
      var existIsShield=SHIELD_GEAR_TYPES.indexOf(existingGear.type)>=0;
      // Can't equip same category as what's already equipped
      if(isWeapon&&existIsWeapon)return false;
      if(isShield&&existIsShield)return false;
    }
    return true;
  }
  // Body / Head / Lower: each is a single slot keyed by gear.pos.
  return !run.equipped[gear.pos];
}

// Drop-target validation — does this slot accept this gear's pos?
function _canDropGearOn(gear, slotPos){
  if (!gear || !slotPos) return false;
  if (gear.pos === 'Hand') return slotPos === 'LHand' || slotPos === 'RHand';
  return slotPos === gear.pos;
}

// Equip a gear piece into a specific slot (drag-and-drop path). Replaces any
// gear already in that slot. For hand gear, also enforces "one weapon + one
// shield" by clearing the OTHER hand if the player drops a same-category item.
function _equipDroppedGear(gear, slotPos){
  if (!_canDropGearOn(gear, slotPos)) return;
  if (gear.pos === 'Hand'){
    var otherHand = (slotPos === 'LHand') ? 'RHand' : 'LHand';
    var existing  = run.equipped[otherHand];
    if (existing){
      var draggedIsWeapon = WEAPON_GEAR_TYPES.indexOf(gear.type) >= 0;
      var existIsWeapon   = WEAPON_GEAR_TYPES.indexOf(existing.type) >= 0;
      if (draggedIsWeapon === existIsWeapon){
        // Dropping a weapon when other hand also has a weapon (or shield with shield):
        // clear the other hand so the new one can fit the rules.
        run.equipped[otherHand] = null;
      }
    }
  }
  // Also clear from any current slot if it was already equipped (drag-to-move).
  EQUIP_SLOTS.forEach(function(s){
    if (run.equipped[s] && run.equipped[s].id === gear.id) run.equipped[s] = null;
  });
  run.equipped[slotPos] = gear;
  delete run._pendingEquip;
  renderDraft();
}

function equipDraftGear(gear){
  if(gear.pos==='Hand'){
    var dom=run.dominantHand||'R';
    var mainSlot=(dom==='L')?'LHand':'RHand';
    var offSlot =(dom==='L')?'RHand':'LHand';
    var mainFree=!run.equipped[mainSlot];
    var offFree =!run.equipped[offSlot];
    if(mainFree && offFree){
      // Both hands free — ask which slot.
      run._pendingEquip = { gear: gear };
      renderDraft();
      return;
    }
    if(mainFree){ run.equipped[mainSlot]=gear; }
    else if(offFree){ run.equipped[offSlot]=gear; }
    else { return; }
  } else {
    run.equipped[gear.pos]=gear;
  }
  renderDraft();
}

// Player has picked a slot from the prompt: equip into that slot and clear the
// pending state.
function equipDraftGearTo(slot){
  if(!run._pendingEquip) return;
  run.equipped[slot]=run._pendingEquip.gear;
  delete run._pendingEquip;
  renderDraft();
}
function cancelDraftEquipPrompt(){
  delete run._pendingEquip;
  renderDraft();
}
function clearSlot(pos){
  run.equipped[pos]=null;
  renderDraft();
}
function confirmDraft(){
  if (run.mode === 'action') startActionArena();
  else startVS();
}

// ════════════════════════════════════════════════════════════
//   ACTION ARENA — real-time variant
//   Reuses builder + draft + attack data; replaces the turn-based
//   grid combat with WASD movement and click/keyboard attacks.
// ════════════════════════════════════════════════════════════
var _actionKeys = {};
var _actionKeyHandler = null;
var _actionKeyUpHandler = null;

function startActionArena(){
  // Build fighters the same way the VS / battle does, then layer on
  // action-specific state (continuous tile coords, cooldown timers).
  var opp;
  if (run.round === TOTAL_ROUNDS){
    var champs = loadPantheon();
    opp = champs.length ? championToOpponent(pick(champs)) : generateOpponent(run.round);
  } else {
    opp = generateOpponent(run.round);
  }
  run.currentOpponent = opp;
  p1 = buildPlayerFighter();
  p2 = buildOpponentFighter(opp);
  // Continuous tile coords (centered in tiles 1.5 / 7.5).
  p1.ax = 1.5; p1.ay = 7.5;
  p2.ax = 7.5; p2.ay = 1.5;
  p1.facing = 0;            // face north toward opponent
  p2.facing = Math.PI;      // face south toward player
  p1._atkCD = 0; p2._atkCD = 0;
  p1._aiAtkCD = 0; p2._aiAtkCD = 0;
  gamePhase = 'action';

  showScreen('actionScreen');
  renderActionTiles();
  buildActionAttackBar();
  document.getElementById('actionLog').innerHTML = '';
  actionLog('⚔ Round '+run.round+' — '+ROUND_METALS[run.round-1].name+' — Fight!', 'crit');
  startActionLoop();
}

function actionLog(msg, cls){
  var el = document.getElementById('actionLog'); if (!el) return;
  var d = document.createElement('div');
  d.className = 'log-entry' + (cls ? ' '+cls : '');
  d.textContent = msg;
  el.prepend(d);
  while (el.children.length > 30) el.removeChild(el.lastChild);
}

// Paint a procedural grass background into the arena canvas/div.
function renderActionTiles(){
  var arena = document.getElementById('actionArena');
  if (!arena) return;
  var px = ACTION_TILE * ACTION_GS;
  var cv = document.createElement('canvas');
  cv.width = px; cv.height = px;
  var ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  for (var r=0; r<ACTION_GS; r++){
    for (var c=0; c<ACTION_GS; c++){
      var rng = tileRng(r*137 + c*311 + 9);
      drawGrass(ctx, c*ACTION_TILE, r*ACTION_TILE, ACTION_TILE, rng);
    }
  }
  arena.style.backgroundImage = 'url(' + cv.toDataURL() + ')';
}

function buildActionAttackBar(){
  var bar = document.getElementById('actionAttackBar');
  if (!bar) return;
  bar.innerHTML = '';
  (p1.attacks||[]).slice(0, 6).forEach(function(name, i){
    var atk = ATTACKS[name]; if (!atk) return;
    var btn = document.createElement('button');
    btn.id = 'actAtk_' + i;
    btn.innerHTML = '<span class="atk-key">'+(i+1)+'</span>'+name;
    btn.onclick = function(){ tryActionAttack(p1, p2, name); };
    bar.appendChild(btn);
  });
}

function startActionLoop(){
  if (actionLoopRunning) return;
  actionLoopRunning = true;
  _actionKeys = {};
  var lastTime = performance.now();
  _actionKeyHandler = function(e){
    var scr = document.getElementById('actionScreen');
    if (!scr || !scr.classList.contains('active')) return;
    var k = e.key.toLowerCase();
    if (k === 'w'||k === 'a'||k === 's'||k === 'd'||k === 'arrowup'||k === 'arrowdown'||k === 'arrowleft'||k === 'arrowright'){
      _actionKeys[k] = true; e.preventDefault();
    } else if (/^[1-9]$/.test(e.key)){
      var idx = parseInt(e.key,10) - 1;
      if (p1.attacks && p1.attacks[idx]) tryActionAttack(p1, p2, p1.attacks[idx]);
      e.preventDefault();
    }
  };
  _actionKeyUpHandler = function(e){ _actionKeys[e.key.toLowerCase()] = false; };
  document.addEventListener('keydown', _actionKeyHandler);
  document.addEventListener('keyup', _actionKeyUpHandler);

  function loop(now){
    if (!actionLoopRunning) return;
    var scr = document.getElementById('actionScreen');
    if (!scr || !scr.classList.contains('active')){ stopActionLoop(); return; }
    var dt = Math.min(0.08, (now - lastTime) / 1000);
    lastTime = now;
    actionTick(dt);
    actionRender();
    if (actionLoopRunning) requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}
function stopActionLoop(){
  actionLoopRunning = false;
  if (_actionKeyHandler) document.removeEventListener('keydown', _actionKeyHandler);
  if (_actionKeyUpHandler) document.removeEventListener('keyup', _actionKeyUpHandler);
  _actionKeyHandler = _actionKeyUpHandler = null;
}

function actionTick(dt){
  if (p1.hp <= 0 || p2.hp <= 0){
    stopActionLoop();
    setTimeout(endActionBattle, 500);
    return;
  }
  // ─── Player movement (held keys) ─────────────────────────────
  var sp1 = ((p1.speed||4) * 0.9);       // tiles/sec
  var dx = 0, dy = 0;
  if (_actionKeys.w || _actionKeys.arrowup) dy -= 1;
  if (_actionKeys.s || _actionKeys.arrowdown) dy += 1;
  if (_actionKeys.a || _actionKeys.arrowleft) dx -= 1;
  if (_actionKeys.d || _actionKeys.arrowright) dx += 1;
  if (dx || dy){
    var L = Math.sqrt(dx*dx + dy*dy);
    dx /= L; dy /= L;
    var nx = p1.ax + dx * sp1 * dt;
    var ny = p1.ay + dy * sp1 * dt;
    // Bounds + simple body-collision with opponent (push gently)
    p1.ax = Math.max(0.5, Math.min(ACTION_GS - 0.5, nx));
    p1.ay = Math.max(0.5, Math.min(ACTION_GS - 0.5, ny));
    p1.facing = Math.atan2(dx, -dy);  // same convention as facingToRow
    if (!p1.anim || p1.anim.name !== 'move') setFighterAnim(p1, 'move');
  } else if (p1.anim && p1.anim.name === 'move'){
    setFighterAnim(p1, 'idle');
  }
  // ─── AI: opponent chases & swings ────────────────────────────
  var oa = p1.ax - p2.ax, ob = p1.ay - p2.ay;
  var od = Math.sqrt(oa*oa + ob*ob);
  var sp2 = ((p2.speed||4) * 0.75);
  if (od > 1.0){
    var ux = oa/od, uy = ob/od;
    p2.ax = Math.max(0.5, Math.min(ACTION_GS - 0.5, p2.ax + ux * sp2 * dt));
    p2.ay = Math.max(0.5, Math.min(ACTION_GS - 0.5, p2.ay + uy * sp2 * dt));
    p2.facing = Math.atan2(ux, -uy);
    if (!p2.anim || p2.anim.name !== 'move') setFighterAnim(p2, 'move');
  } else {
    if (p2.anim && p2.anim.name === 'move') setFighterAnim(p2, 'idle');
    p2.facing = Math.atan2(oa, -ob); // face player even when stationary
  }
  // Opponent auto-attacks on its own cooldown.
  if (p2._aiAtkCD <= 0 && p2.attacks && p2.attacks.length && od < 5){
    var pick2 = p2.attacks[Math.floor(Math.random() * p2.attacks.length)];
    tryActionAttack(p2, p1, pick2);
    p2._aiAtkCD = 1.6;
  }
  // ─── Cooldowns ───────────────────────────────────────────────
  p1._atkCD   = Math.max(0, (p1._atkCD||0)   - dt);
  p2._atkCD   = Math.max(0, (p2._atkCD||0)   - dt);
  p2._aiAtkCD = Math.max(0, (p2._aiAtkCD||0) - dt);
  // Advance per-fighter anim frame timers so slash/hurt etc. cycle through.
  tickAnimations(performance.now());
}

function tryActionAttack(attacker, defender, atkName){
  if (!atkName) return;
  if ((attacker._atkCD||0) > 0) return;
  if (attacker.hp <= 0 || defender.hp <= 0) return;
  var atk = ATTACKS[atkName]; if (!atk) return;
  var matB = getMateriaBonus(attacker, atk);
  // Teleport / heal / buff specials — fire without range check.
  if (atk.special === 'teleport'){
    setFighterAnim(attacker, 'parry');
    attacker._atkCD = 0.5;
    // Step toward player facing direction by teleportRange tiles.
    var tr = atk.teleportRange || 3;
    var dx = Math.sin(attacker.facing), dy = -Math.cos(attacker.facing);
    attacker.ax = Math.max(0.5, Math.min(ACTION_GS - 0.5, attacker.ax + dx * tr));
    attacker.ay = Math.max(0.5, Math.min(ACTION_GS - 0.5, attacker.ay + dy * tr));
    actionLog('☿ '+(attacker===p1?'You':'Opp')+' '+atk.name);
    return;
  }
  if (atk.special === 'heal'){
    setFighterAnim(attacker, 'parry');
    attacker._atkCD = 0.8;
    var healed = rollDice(atk.healDice || '2d6');
    attacker.hp = Math.min(attacker.maxHp, attacker.hp + healed);
    actionLog('☽ '+(attacker===p1?'You':'Opp')+' '+atk.name+' heal '+healed, 'hit');
    return;
  }
  // Damaging attack — range check uses Euclidean dist + extraRange.
  var ddx = defender.ax - attacker.ax, ddy = defender.ay - attacker.ay;
  var dist = Math.sqrt(ddx*ddx + ddy*ddy);
  var effRange = (atk.range || 1) + (atk.range > 0 ? matB.extraRange : 0);
  if (dist > effRange + 0.3){
    if (attacker === p1) actionLog('⚔ '+atk.name+' — out of range', 'miss');
    return;
  }
  // Face the target as we swing.
  attacker.facing = Math.atan2(ddx, -ddy);
  setFighterAnim(attacker, 'slash');
  attacker._atkCD = (atk.range > 1 ? 0.95 : 0.7);
  // Roll-to-hit reuses the same stat → modifier → +prof + materia chain.
  var sMod = Math.floor((attacker.stats[atk.stat] - 10) / 2);
  var toHit = sMod + attacker.prof + (matB.toHit||0);
  var roll = Math.floor(Math.random() * 20) + 1;
  var total = roll + toHit;
  var aName = attacker === p1 ? 'You' : 'Opp';
  if (total >= defender.ac){
    var crit = roll >= (matB.critRange || 20);
    var diceRoll = rollDice(atk.dice||'1d6');
    if (crit) diceRoll += rollDice(atk.dice||'1d6');
    var dmg = diceRoll + sMod + (matB.bonusDmg||0);
    if (dmg < 1) dmg = 1;
    defender.hp -= dmg;
    if (defender.hp < 0) defender.hp = 0;
    if (attacker === p1) run.totalDamage += dmg;
    setFighterAnim(defender, defender.hp <= 0 ? 'death' : 'hurt');
    actionLog((crit?'✦ CRIT ':'⚔ ')+aName+' '+atk.name+' — '+dmg+(crit?' (critical)':''), crit?'crit':'hit');
  } else {
    actionLog('⚔ '+aName+' '+atk.name+' misses', 'miss');
  }
}

function actionRender(){
  // Position fighter canvases. (ax, ay) are tile-centered coordinates;
  // each canvas is 96×96 so we offset half its size to center.
  ['actionP1Cv','actionP2Cv'].forEach(function(id, i){
    var cv = document.getElementById(id); if (!cv) return;
    var f = (i === 0) ? p1 : p2;
    var x = (f.ax * ACTION_TILE) - cv.width / 2;
    var y = (f.ay * ACTION_TILE) - cv.height / 2 - 18; // slight upward bias so feet ≈ tile center
    cv.style.transform = 'translate('+x+'px,'+y+'px)';
    // Z-stack: whoever is lower on the field draws on top (basic painter sort).
    cv.style.zIndex = String(2 + Math.round(f.ay * 10));
    renderActionFighter(cv, f);
  });
  // HUD
  var hp1 = document.getElementById('actHpFillP1');
  var hp2 = document.getElementById('actHpFillP2');
  if (hp1) hp1.style.width = Math.max(0, p1.hp/p1.maxHp*100) + '%';
  if (hp2) hp2.style.width = Math.max(0, p2.hp/p2.maxHp*100) + '%';
  document.getElementById('actLblP1').textContent = '⚗ You · HP '+p1.hp+'/'+p1.maxHp;
  document.getElementById('actLblP2').textContent = '☠ Opponent · HP '+p2.hp+'/'+p2.maxHp;
  // Cooldown dim on attack buttons.
  (p1.attacks||[]).slice(0,6).forEach(function(n, i){
    var btn = document.getElementById('actAtk_'+i);
    if (btn) btn.classList.toggle('cooling', (p1._atkCD||0) > 0);
  });
}

function renderActionFighter(cv, fighter){
  var appearance = ensureAppearance(fighter);
  if (fighter.gear) appearance = effectiveAppearance(appearance, fighter.gear);
  var animName = (fighter.anim && fighter.anim.name) || 'idle';
  var frame    = (fighter.anim && fighter.anim.frame) || 0;
  var ad = ELEMENTS_ANIMS[animName] || ELEMENTS_ANIMS.idle;
  if (frame >= ad.frames) frame = ad.frames - 1;
  // Use typeof check — fighter.facing of 0 (north) would otherwise hit the
  // falsy `|| Math.PI` branch and incorrectly render the south sprite.
  var row = facingToRow(typeof fighter.facing === 'number' ? fighter.facing : Math.PI);
  var weapons = fighterWeaponLayers(fighter);
  var bobOpts = { excite: getBobExcite(fighter), phase: fighter._bobPhase||0 };
  compositeCharacter(cv, appearance, animName, frame, row, weapons, bobOpts);
  drawCastFxOnCanvas(cv, fighter);
}

function endActionBattle(){
  // Reuse the same victory / game-over flow as turn-based.
  if (p2.hp <= 0){
    handleVictory();
  } else if (p1.hp <= 0){
    showGameOver();
  }
}

function forfeitAction(){
  if (!confirm('Abandon this run? All progress will be lost.')) return;
  stopActionLoop();
  showGameOver();
}

// ═══ OPPONENT GENERATION (§7) ═══
function generateOpponent(round){
  var stats={};
  ['STR','DEX','CON','INT','WIS','CHA'].forEach(function(s){
    var floor=8+round;
    var rolls=[];
    for(var i=0;i<2;i++)rolls.push(Math.floor(Math.random()*6)+1);
    rolls.sort(function(a,b){return b-a});
    stats[s]=floor+rolls[0];
  });
  var d=deriveStats(stats);
  // Generate gear: must total 7 sockets
  var gear=generateOpponentGear(round);
  var bodyType=pick(BODY_TYPES);
  var seed=(Math.random()*1e9)|0;
  return{
    name:'Opponent',
    stats:stats,
    derived:d,
    bodyType:bodyType,
    appearanceSeed:seed,
    appearance:generateAppearance(seed, bodyType),
    gear:gear,
    equipped:gear.equipped
  };
}

function generateOpponentGear(round){
  var weaponTypes=GEAR_TYPES.filter(function(g){return g.pos==='Hand'&&WEAPON_GEAR_TYPES.indexOf(g.type)>=0});
  var shieldTypes=GEAR_TYPES.filter(function(g){return g.pos==='Hand'&&SHIELD_GEAR_TYPES.indexOf(g.type)>=0});
  var bodyTypes=GEAR_TYPES.filter(function(g){return g.pos==='Body'});
  var headTypes=GEAR_TYPES.filter(function(g){return g.pos==='Head'});
  var lowerTypes=GEAR_TYPES.filter(function(g){return g.pos==='Lower'});
  // AI always: weapon in RHand, shield in LHand (default stance)
  var rhand=generateGearPieceOfType(pick(weaponTypes),round);
  var body=generateGearPieceOfType(pick(bodyTypes),round);
  var lhand=generateGearPieceOfType(pick(shieldTypes),round);
  var head=generateGearPieceOfType(pick(headTypes),round);
  var lower=generateGearPieceOfType(pick(lowerTypes),round);
  // Scale opponent refinement with round
  [lhand,body,rhand,head,lower].forEach(function(g){
    if(round>=3)g.refinement=randInt(0,Math.min(round-1,5));
    if(round>=6)g.refinement=randInt(2,Math.min(round,8));
  });
  return{equipped:{Head:head,LHand:lhand,Body:body,RHand:rhand,Lower:lower}};
}

// ═══ BUILD FIGHTER FROM RUN STATE ═══
function buildPlayerFighter(){
  var stats=JSON.parse(JSON.stringify(run.stats));
  var d=run.derived;
  var materia=buildFighterMateria(run.equipped);
  return{
    prime:run.bodyType,num:1,name:'Alchemist',col:'#d4a843',
    stats:stats,maxHp:d.hp,hp:d.hp,ac:d.ac,speed:d.speed,prof:d.proficiency,
    x:4,y:7,
    attacks:buildAttacksFromMateria(run.equipped),
    dot:null,ward:0,facing:Math.PI,teleported:false,
    anim:{name:'idle',frame:0,timer:0,onDone:null},
    _bobPhase:Math.floor(Math.random()*1400),_bobExcite:0,
    appearanceSeed:run.appearanceSeed,
    appearance:run.appearance,
    materia:materia,gear:run.equipped
  };
}

function buildOpponentFighter(opp){
  var stats=JSON.parse(JSON.stringify(opp.stats));
  var d=opp.derived;
  var materia=buildFighterMateria(opp.equipped);
  // Apply fog of war: hide materia based on round
  var revealed=8-run.round; // round 1=7 shown, round 7=1 shown
  var totalMat=materia.length;
  if(revealed<totalMat){
    var indices=[];
    for(var i=0;i<totalMat;i++)indices.push(i);
    // Shuffle and hide the extras
    for(var j=indices.length-1;j>0;j--){
      var k=Math.floor(Math.random()*(j+1));
      var t=indices[j];indices[j]=indices[k];indices[k]=t;
    }
    var toHide=totalMat-revealed;
    for(var h=0;h<toHide;h++){
      materia[indices[h]].hidden=true;
    }
  }
  return{
    prime:opp.bodyType,num:2,name:'Opponent',col:'#ef4444',
    stats:stats,maxHp:d.hp,hp:d.hp,ac:d.ac,speed:d.speed,prof:d.proficiency,
    x:4,y:1,
    attacks:buildAttacksFromMateria(opp.equipped),
    dot:null,ward:0,facing:0,teleported:false,
    anim:{name:'idle',frame:0,timer:0,onDone:null},
    _bobPhase:Math.floor(Math.random()*1400),_bobExcite:0,
    appearanceSeed:opp.appearanceSeed,
    appearance:opp.appearance,
    materia:materia,gear:opp.equipped
  };
}

function buildFighterMateria(equipped){
  // Flatten all materia from equipped gear into a flat array with slot info
  var result=[];
  EQUIP_SLOTS.forEach(function(pos){
    var gear=equipped[pos];
    if(!gear)return;
    // Dynamic slot: weapon-type gear = 'w', shield-type = 's', body = 'a'
    var slot;
    if(pos==='Body'||pos==='Head'||pos==='Lower')slot='a';
    else if(WEAPON_GEAR_TYPES.indexOf(gear.type)>=0)slot='w';
    else slot='s';
    gear.materia.forEach(function(m){
      result.push({idx:m.planetIdx,slot:slot,level:m.level,xp:m.xp,hidden:false});
    });
  });
  return result;
}

function buildAttacksFromMateria(equipped){
  // Always have basic Strike
  var atkNames=['Strike'];
  var seen={Strike:true};
  EQUIP_SLOTS.forEach(function(pos){
    var gear=equipped[pos];
    if(!gear)return;
    gear.materia.forEach(function(m){
      var planet=PLANETS[m.planetIdx];
      if(planet.grants){
        planet.grants.forEach(function(name){
          if(!seen[name]){seen[name]=true;atkNames.push(name)}
        });
      }
    });
  });
  return atkNames;
}

// ═══ VS SCREEN ═══
function startVS(){
  // Build fighters
  var opp;
  // Check for Pantheon champion at round 7
  if(run.round===TOTAL_ROUNDS){
    var champs=loadPantheon();
    if(champs.length>0){
      opp=championToOpponent(pick(champs));
    } else {
      opp=generateOpponent(run.round);
    }
  } else {
    opp=generateOpponent(run.round);
  }
  run.currentOpponent=opp;
  p1=buildPlayerFighter();
  p2=buildOpponentFighter(opp);

  showScreen('vsScreen');
  var rm=ROUND_METALS[run.round-1];
  document.getElementById('vsRound').innerHTML='ROUND '+run.round+' — <span style="color:'+rm.col+'">'+rm.sym+' '+rm.name+'</span>';
  renderSpriteStatic(document.getElementById('vsP1'),p1.prime,Math.PI,'idle',0,p1);
  renderSpriteStatic(document.getElementById('vsP2'),p2.prime,Math.PI,'idle',0,p2);
  document.getElementById('vsP1Name').textContent='⚗ Your Alchemist';
  document.getElementById('vsP1Name').style.color='#d4a843';
  document.getElementById('vsP2Name').textContent='☠ Opponent';
  document.getElementById('vsP2Name').style.color='#ef4444';
  document.getElementById('vsP1Stats').textContent='HP '+p1.maxHp+' | AC '+p1.ac+' | Speed '+p1.speed;
  document.getElementById('vsP2Stats').textContent='HP '+p2.maxHp+' | AC '+p2.ac+' | Speed '+p2.speed;
  var fogReveal=Math.max(1,8-run.round);
  // Build scouting report of opponent gear
  var scoutHTML='<div style="font-size:0.7em;color:var(--muted);margin-top:8px">'+fogReveal+'/7 materia revealed</div>';
  scoutHTML+='<div style="display:flex;gap:4px;justify-content:center;margin-top:4px;flex-wrap:wrap">';
  EQUIP_SLOTS.forEach(function(pos){
    var gear=opp.equipped[pos];if(!gear)return;
    scoutHTML+='<div style="background:rgba(255,255,255,0.03);border:1px solid #222;border-radius:6px;padding:4px 6px;font-size:0.65em">';
    scoutHTML+='<div style="color:#aaa">'+gearIconHTML(gear,{size:16,slot:pos})+gear.type+' ('+gear.sockets+'s)</div>';
    scoutHTML+='<div style="display:flex;gap:1px;justify-content:center;margin-top:2px">';
    // Show materia with fog
    var hiddenCount=0;
    var totalMat=gear.materia.length;
    var toReveal=Math.max(0,Math.ceil(fogReveal*totalMat/7));
    gear.materia.forEach(function(m,mi){
      if(mi>0){var linked=mi<=gear.links;scoutHTML+='<span style="width:4px;height:2px;display:inline-block;background:'+(linked?'#555':'#222')+'"></span>'}
      var p=PLANETS[m.planetIdx];
      if(mi<toReveal){
        scoutHTML+='<span style="color:'+p.col+';font-size:0.9em">'+p.sym+'</span>';
      } else {
        scoutHTML+='<span style="color:#333;font-size:0.9em">?</span>';
      }
    });
    for(var e=gear.materia.length;e<gear.sockets;e++){
      scoutHTML+='<span style="color:#222;font-size:0.9em">○</span>';
    }
    scoutHTML+='</div></div>';
  });
  scoutHTML+='</div>';
  document.getElementById('vsFog').innerHTML=scoutHTML;

  setTimeout(function(){startBattle()},2400);
}

// ═══ BATTLE ═══
function startBattle(){
  gamePhase='plan';
  showScreen('battleScreen');
  turnNum=1;moveQueue=[];lastMoveType=null;selectedAttack=null;executing=false;
  // Clear per-turn combat flags
  delete p1._dashing;delete p2._dashing;
  delete p1._disengaging;delete p2._disengaging;
  delete p1._readiedAction;delete p2._readiedAction;
  delete p1._prone;delete p2._prone;
  // ═══ INITIATIVE (D&D 5e PHB) ═══
  rollInitiative();
  document.getElementById('roundBadge').textContent='ROUND '+run.round+' — '+ROUND_METALS[run.round-1].name;
  document.getElementById('qsBadge').textContent='☿ '+run.quicksilver;
  initTiles();faceBothFighters();buildGrid();buildControls();renderAll();
  startAnimLoop();
  logMsg('⚗ Round '+run.round+': '+ROUND_METALS[run.round-1].name+' — Fight!','phase');
}

function rollInitiative(){
  var dexMod1=Math.floor((p1.stats.DEX-10)/2);
  var dexMod2=Math.floor((p2.stats.DEX-10)/2);
  var roll1=Math.floor(Math.random()*20)+1;
  var roll2=Math.floor(Math.random()*20)+1;
  p1.initiative=roll1+dexMod1;
  p2.initiative=roll2+dexMod2;
  logMsg('⚔ Initiative — You: d20('+roll1+')+'+dexMod1+'='+p1.initiative+' | Opp: d20('+roll2+')+'+dexMod2+'='+p2.initiative,'phase');
  if(p1.initiative>=p2.initiative){
    logMsg('You act first!','phase');
  } else {
    logMsg('Opponent acts first!','phase');
  }
}

function initTiles(){
  tiles=[];
  arenaGrid=generateArena();
  for(var r=0;r<GS;r++){tiles[r]=[];for(var c=0;c<GS;c++){tiles[r][c]='none'}}
}

// ═══ GRID ═══
function buildGrid(){
  var g=document.getElementById('grid');g.innerHTML='';
  // Render tileset background
  if(arenaGrid&&battlefieldTileset)renderBattlefield(arenaGrid);
  else if(arenaGrid){
    // Tileset not loaded yet — retry shortly
    // procedural tiles — no load delay needed
  }
  // Show arena name
  var nameEl=document.querySelector('.arena-name');
  if(!nameEl){nameEl=document.createElement('div');nameEl.className='arena-name';g.parentNode.insertBefore(nameEl,g)}
  if(arenaName)nameEl.textContent='⚗ '+arenaName+' ⚗';
  for(var r=0;r<GS;r++){for(var c=0;c<GS;c++){
    var cell=document.createElement('div');cell.className='cell';cell.dataset.r=r;cell.dataset.c=c;
    if(tiles[r][c]!=='none')cell.classList.add(tiles[r][c]+'-tile');
    // Terrain passability classes
    if(arenaPassable&&arenaPassable[r][c]===0)cell.classList.add('impassable-tile');
    if(arenaTerrainCost&&arenaTerrainCost[r][c]===2)cell.classList.add('water-terrain');
    var ti='';
    if(tiles[r][c]==='fire')ti='△';
    else if(tiles[r][c]==='water')ti='~';
    else if(tiles[r][c]==='earth')ti='▲';
    else if(tiles[r][c]==='aether')ti='✦';
    if(ti){var s=document.createElement('span');s.className='tile-icon';s.textContent=ti;
      if(tiles[r][c]==='fire')s.style.color='rgba(220,80,40,0.7)';
      else if(tiles[r][c]==='water')s.style.color='rgba(60,130,220,0.7)';
      else if(tiles[r][c]==='earth')s.style.color='rgba(140,120,60,0.7)';
      else if(tiles[r][c]==='aether')s.style.color='rgba(200,180,255,0.7)';
      cell.appendChild(s)}
    var cv=document.createElement('canvas');cv.className='cell-sprite';cv.id='cs_'+r+'_'+c;cell.appendChild(cv);
    var pip=document.createElement('div');pip.className='hp-pip';
    var pipF=document.createElement('div');pipF.className='hp-pip-fill';pipF.id='pip_'+r+'_'+c;
    pip.appendChild(pipF);cell.appendChild(pip);
    cell.onclick=(function(rr,cc){return function(){onCellClick(rr,cc)}})(r,c);
    g.appendChild(cell);
  }}
}

function renderGrid(){
  for(var r=0;r<GS;r++){for(var c=0;c<GS;c++){
    var cv=document.getElementById('cs_'+r+'_'+c);
    if(cv){var ctx=cv.getContext('2d');var rect=cv.getBoundingClientRect();
      var dpr=window.devicePixelRatio||1;var sz=Math.round(rect.width*dpr);if(cv.width!==sz||cv.height!==sz){cv.width=sz;cv.height=sz}ctx.clearRect(0,0,cv.width,cv.height)}
    var pip=document.getElementById('pip_'+r+'_'+c);if(pip){pip.style.width='0%';pip.style.background='#4ade80'}
    var cell=cv?cv.parentElement:null;if(cell){cell.classList.remove('highlight','path','atk-range','zone-front','zone-side','zone-rear');cell.style.zIndex=''}
  }}
  [p1,p2].forEach(function(f){
    if(!f||f.hp<=0||f.x<0||f.x>=GS||f.y<0||f.y>=GS)return;
    var cv=document.getElementById('cs_'+f.y+'_'+f.x);if(!cv)return;
    // Boost z-index so 2x sprite renders above neighboring cells
    if(cv.parentElement)cv.parentElement.style.zIndex='10';
    var cellSz=cv.width;var voxScale=Math.max(1.5,cellSz/28);
    renderSprite(cv,f.prime,getRank(getFighterLinkCount(f)).key,f.facing,voxScale);
    var pip=document.getElementById('pip_'+f.y+'_'+f.x);
    if(pip){var pct=Math.max(0,f.hp/f.maxHp*100);pip.style.width=pct+'%';pip.style.background=pct<30?'#ef4444':pct<60?'#f59e0b':'#4ade80'}
  });
  if(gamePhase==='plan'){
    var cx=p1.x,cy=p1.y;
    moveQueue.forEach(function(step){var nx=cx+step.dx,ny=cy+step.dy;
      if(nx>=0&&nx<GS&&ny>=0&&ny<GS){var cell=document.querySelector('.cell[data-r="'+ny+'"][data-c="'+nx+'"]');if(cell)cell.classList.add('path');cx=nx;cy=ny}});
    if(moveQueue.length<getEffSpeed(p1)){
      for(var dr=-1;dr<=1;dr++){for(var dc=-1;dc<=1;dc++){
        if(dr===0&&dc===0)continue;var tx=cx+dc,ty=cy+dr;
        if(tx>=0&&tx<GS&&ty>=0&&ty<GS&&!(tx===p2.x&&ty===p2.y)&&canTraverseTerrain(cx,cy,tx,ty)){
          var cell=document.querySelector('.cell[data-r="'+ty+'"][data-c="'+tx+'"]');
          if(cell&&!cell.classList.contains('path'))cell.classList.add('highlight')}}}
    }
    if(selectedAttack){var atk=ATTACKS[selectedAttack];
      if(atk&&atk.range>0){var matB=getMateriaBonus(p1,atk);var endX=cx,endY=cy;
        if(moveQueue.length>0){endX=p1.x;endY=p1.y;moveQueue.forEach(function(s){endX+=s.dx;endY+=s.dy})} else{endX=p1.x;endY=p1.y}
        var effR=atk.range+matB.extraRange;
        for(var ar=-effR;ar<=effR;ar++){for(var ac2=-effR;ac2<=effR;ac2++){
          var dist=Math.max(Math.abs(ar),Math.abs(ac2));if(dist>0&&dist<=effR){
            var tx2=endX+ac2,ty2=endY+ar;if(tx2>=0&&tx2<GS&&ty2>=0&&ty2<GS){
              var cell2=document.querySelector('.cell[data-r="'+ty2+'"][data-c="'+tx2+'"]');if(cell2)cell2.classList.add('atk-range')}}}}
      }
    }
    // ═══ ZONE OVERLAY: Show opponent's front/side/rear zones ═══
    for(var zr=-2;zr<=2;zr++){for(var zc=-2;zc<=2;zc++){
      if(zr===0&&zc===0)continue;
      var ztx=p2.x+zc,zty=p2.y+zr;
      if(ztx<0||ztx>=GS||zty<0||zty>=GS)continue;
      var zone=getZone(p2,ztx,zty);
      var zCell=document.querySelector('.cell[data-r="'+zty+'"][data-c="'+ztx+'"]');
      if(zCell){
        var zDist=Math.max(Math.abs(zr),Math.abs(zc));
        if(zDist<=1){
          if(zone==='rear')zCell.classList.add('zone-rear');
          else if(zone==='front')zCell.classList.add('zone-front');
          else zCell.classList.add('zone-side');
        }
      }
    }}
  }
  // Auto-scroll grid to center between fighters
  var gridWrap=document.querySelector('.grid-wrap');
  if(gridWrap&&p1&&p2){
    var midX=(p1.x+p2.x)/2;
    var cellW=81; // 80px + 1px gap
    var targetScroll=midX*cellW+cellW/2-gridWrap.clientWidth/2;
    gridWrap.scrollLeft=Math.max(0,targetScroll);
  }
}

// ═══ HUD ═══
function updateHUD(){
  [p1,p2].forEach(function(f){
    if(!f)return;
    var id=f===p1?'p1':'p2';var el=document.getElementById(id+'Hud');
    var hpPct=Math.max(0,f.hp/f.maxHp*100);var fLinks=getFighterLinkCount(f);var rank=getRank(fLinks);
    var borderCol=f===p1?'#d4a843':'#ef4444';
    el.style.borderLeft='3px solid '+borderCol;
    el.innerHTML='<h3 style="color:'+borderCol+'">'+
      (f===p1?'⚗ ALCHEMIST (YOU)':'☠ OPPONENT')+
      '</h3><div class="hp-bar"><div class="hp-fill" style="width:'+hpPct+'%;background:linear-gradient(90deg,'+(hpPct<30?'#ef4444,#f87171':'#22c55e,#4ade80')+')"></div></div>'+
      '<div class="stat-row"><span>HP '+f.hp+'/'+f.maxHp+'</span><span class="rank-badge" style="color:'+rank.col+';border-color:'+rank.col+'">'+rank.sym+' '+rank.name+'</span></div>'+
      buildSocketChainHTML(f);
  });
  document.getElementById('turnNum').textContent=turnNum;
}
function getFighterLinkCount(f){
  if(!f.gear)return 0;
  var links=0;
  EQUIP_SLOTS.forEach(function(pos){
    var g=f.gear[pos];if(g)links+=g.links;
  });
  return links;
}
function buildSocketChainHTML(f){
  if(!f.gear)return '';
  var html='<div class="socket-chain">';
  var slotDefs=[
    {pos:'LHand',col:'#d4a843'},
    {pos:'Body',col:'#888'},
    {pos:'RHand',col:'#d4a843'}
  ];
  var first=true;
  slotDefs.forEach(function(sd){
    var gear=f.gear[sd.pos];if(!gear||gear.sockets===0)return;
    if(!first)html+='<span class="socket-sep">|</span>';first=false;
    html+='<span class="socket-group">';
    var slotKey=sd.pos==='Body'?'a':'w';
    var gearMateria=[];
    if(f.materia){f.materia.forEach(function(m){if(m.slot===slotKey)gearMateria.push(m)})}
    var totalOrbs=gear.sockets;
    for(var oi=0;oi<totalOrbs;oi++){
      if(oi>0){
        var isLinked=oi<=gear.links&&oi<gearMateria.length&&oi-1<gearMateria.length;
        if(isLinked){
          var prevP=PLANETS[gearMateria[oi-1].idx];var curP=PLANETS[gearMateria[oi].idx];
          html+='<span class="socket-link active" style="--link-col-l:'+prevP.col+';--link-col-r:'+curP.col+'"></span>';
        } else {
          html+='<span class="socket-gap"></span>';
        }
      }
      if(oi<gearMateria.length){
        var m=gearMateria[oi];var p=PLANETS[m.idx];
        if(m.hidden){html+='<span class="socket-orb hidden-mat" title="???">?</span>'}
        else{html+='<span class="socket-orb filled" style="color:'+p.col+';cursor:pointer" onclick="showMatDetail('+m.idx+','+m.level+','+(m.xp||0)+')" title="'+p.name+' Lv'+m.level+'">'+p.sym+'<sub class="mat-lvl">'+m.level+'</sub></span>'}
      } else {
        html+='<span class="socket-orb" style="color:#333" title="Empty">○</span>';
      }
    }
    html+='</span>';
  });
  return html+'</div>';
}

// ═══ STAT SHEET ═══
function updateStatSheet(){
  if(!p1)return;
  var f=p1;
  document.getElementById('ssTitle').textContent='⚗ Alchemist — Sheet';
  var body=document.getElementById('ssBody');
  var sg='';
  ['STR','DEX','CON','INT','WIS','CHA'].forEach(function(s){
    var mod=Math.floor((f.stats[s]-10)/2);var sign=mod>=0?'+':'';
    sg+='<div class="sg-item"><div class="val">'+f.stats[s]+'</div><div class="lbl">'+s+'</div><div class="mod">'+sign+mod+'</div></div>';
  });
  var ac=f.ac+(f.ward||0);var fLinks=getFighterLinkCount(f);var rank=getRank(fLinks);
  // Build gear display
  var gearHTML='';
  if(f.gear){
    var ssDom=(run&&run.dominantHand)||'R';
    var ssHand=function(pos){ return pos.charAt(0)===ssDom ? 'Main' : 'Off'; };
    var slotLabels={};
    EQUIP_SLOTS.forEach(function(pos){
      if(pos==='Body'){slotLabels[pos]='Body';return}
      var g=f.gear[pos];
      if(g&&WEAPON_GEAR_TYPES.indexOf(g.type)>=0)slotLabels[pos]='⚔ Weapon · '+ssHand(pos);
      else if(g&&SHIELD_GEAR_TYPES.indexOf(g.type)>=0)slotLabels[pos]='🛡 Shield · '+ssHand(pos);
      else slotLabels[pos]=ssHand(pos)+' Hand';
    });
    var slotIcons={LHand:'⚔',Body:'🛡',RHand:'⚔'};
    EQUIP_SLOTS.forEach(function(pos){
      var g=f.gear[pos];
      if(!g){
        gearHTML+='<div class="ss-gear-slot empty"><span class="ss-gear-pos">'+slotLabels[pos]+'</span><span class="ss-gear-name" style="color:var(--muted);font-style:italic">— empty —</span></div>';
        return;
      }
      var sockHTML='';
      g.materia.forEach(function(m,i){
        if(i>0){
          var linked=i<=g.links;
          sockHTML+=linked?'<span class="materia-link active"></span>':'<span class="materia-gap"></span>';
        }
        var flashFlag2=!!m._justLeveled;
        sockHTML+=materiaOrbHTML(m.planetIdx, m.level, {size:22, xp:m.xp||0, levelupFlash:flashFlag2});
        if(flashFlag2) delete m._justLeveled;
      });
      var emptyCount=g.sockets-g.materia.length;
      for(var e=0;e<emptyCount;e++){
        if(g.materia.length>0||e>0)sockHTML+='<span class="materia-gap"></span>';
        sockHTML+=materiaEmptyOrbHTML({size:22});
      }
      var refStr=g.refinement>0?' <span style="color:var(--gold)">+'+g.refinement+'</span>':'';
      gearHTML+='<div class="ss-gear-slot"><span class="ss-gear-pos">'+slotLabels[pos]+'</span>'+
        '<span class="ss-gear-name">'+gearIconHTML(g,{size:16,slot:pos})+g.name+refStr+'</span>'+
        '<span class="ss-gear-sockets">'+sockHTML+'</span></div>';
    });
  }
  body.innerHTML='<div class="stats-grid">'+sg+'</div>'+
    '<div class="info-row"><span>AC: '+ac+(f.ward?' (+'+f.ward+')':'')+'</span><span>Speed: '+f.speed+'</span><span>Prof: +'+f.prof+'</span>'+
    '<span style="color:'+rank.col+'">'+rank.sym+' '+rank.name+' ('+fLinks+' links)</span></div>'+
    (gearHTML?'<div class="ss-gear-section">'+gearHTML+'</div>':'');
}
function toggleStats(){
  statsOpen=!statsOpen;
  document.getElementById('ssBody').classList.toggle('open',statsOpen);
  document.getElementById('ssToggle').textContent=statsOpen?'▲ HIDE':'▼ SHOW';
}

// ═══ CONTROLS ═══
function buildControls(){
  buildDpad();
  buildAutoMoves();
  buildAttackBar();
  updateMoveQueueUI();
}
function buildDpad(){
  var dpad=document.getElementById('dpad');dpad.innerHTML='';
  var dirs=[
    {dx:-1,dy:-1,sym:'↖'},{dx:0,dy:-1,sym:'↑'},{dx:1,dy:-1,sym:'↗'},
    {dx:-1,dy:0,sym:'←'},{dx:0,dy:0,sym:'×'},{dx:1,dy:0,sym:'→'},
    {dx:-1,dy:1,sym:'↙'},{dx:0,dy:1,sym:'↓'},{dx:1,dy:1,sym:'↘'}
  ];
  dirs.forEach(function(d){
    var btn=document.createElement('button');
    if(d.dx===0&&d.dy===0){
      btn.className='dpad-btn dpad-center';btn.textContent='UNDO';
      btn.onclick=function(){
        if(moveQueue.length>0){moveQueue.pop();updateMoveQueueUI();renderGrid()}
      };
    } else {
      btn.className='dpad-btn';btn.textContent=d.sym;
      btn.onclick=function(){queueDpadStep(d.dx,d.dy)};
    }
    dpad.appendChild(btn);
  });
}
function buildAutoMoves(){
  var el=document.getElementById('autoMoves');el.innerHTML='';
  [{id:'pursue',sym:'🎯',lbl:'Pursue'},{id:'retreat',sym:'←',lbl:'Retreat'},{id:'kite',sym:'↗',lbl:'Kite'},{id:'flank',sym:'⚔',lbl:'Flank'}].forEach(function(t){
    var btn=document.createElement('button');btn.className='auto-btn';
    btn.textContent=t.sym+' '+t.lbl;
    btn.onclick=function(){addAutoStep(t.id)};
    el.appendChild(btn);
  });
  var clearBtn=document.createElement('button');clearBtn.className='auto-btn';
  clearBtn.textContent='■ Clear All';clearBtn.style.color='var(--danger)';clearBtn.style.borderColor='#333';
  clearBtn.onclick=function(){moveQueue=[];updateMoveQueueUI();renderGrid()};
  el.appendChild(clearBtn);
}
function getEffSpeed(f){return f._dashing?f.speed*2:f.speed}
function queueDpadStep(dx,dy){
  if(gamePhase!=='plan'||executing||moveQueue.length>=getEffSpeed(p1))return;
  var endX=p1.x,endY=p1.y;moveQueue.forEach(function(s){endX+=s.dx;endY+=s.dy});
  var nx=endX+dx,ny=endY+dy;
  if(nx<0||nx>=GS||ny<0||ny>=GS||(nx===p2.x&&ny===p2.y)||!canTraverseTerrain(endX,endY,nx,ny))return;
  moveQueue.push({dx:dx,dy:dy,type:'direct'});lastMoveType={dx:dx,dy:dy,type:'direct'};updateMoveQueueUI();renderGrid();
}
function addAutoStep(type){
  // Add ONE smart-move step per click (matches CC behavior)
  // Auto-moves recalculate dynamically during execution, so preview dx/dy is approximate
  var maxSteps=getEffSpeed(p1);
  if(moveQueue.length>=maxSteps)return;

  var endX=p1.x,endY=p1.y;
  moveQueue.forEach(function(s){endX+=s.dx;endY+=s.dy});
  var dx=p2.x-endX,dy=p2.y-endY;
  var dist=Math.max(Math.abs(dx),Math.abs(dy));
  var sdx=dx===0?0:(dx>0?1:-1),sdy=dy===0?0:(dy>0?1:-1);

  if(type==='flank'){
    if(dist<=1&&isRearTile(p2,endX,endY)){sdx=0;sdy=0;}
    else{
      var bestDir=null,bestScore=-9999;
      var allD=[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1},{x:1,y:1},{x:-1,y:1},{x:1,y:-1},{x:-1,y:-1}];
      for(var i=0;i<allD.length;i++){
        var d=allD[i],tx=endX+d.x,ty=endY+d.y;
        if(tx<0||tx>=GS||ty<0||ty>=GS||tx===p2.x&&ty===p2.y||!canTraverseTerrain(endX,endY,tx,ty))continue;
        var sc=0,newDist=Math.max(Math.abs(tx-p2.x),Math.abs(ty-p2.y));
        sc+=(dist-newDist)*200;
        if(isRearTile(p2,tx,ty))sc+=400;
        if(isFrontTile(p2,tx,ty))sc-=60;
        if(dist<=2&&!isFrontTile(p2,tx,ty)&&newDist<=2)sc+=100;
        if(sc>bestScore){bestScore=sc;bestDir=d;}
      }
      if(bestDir){sdx=bestDir.x;sdy=bestDir.y;}else{sdx=0;sdy=0;}
    }
  } else if(type==='pursue'){
    if(dist<=1){sdx=0;sdy=0;}
    else{
      // Use BFS pathfinding to navigate around obstacles
      var bfsResult=bfsNextStep(endX,endY,p2.x,p2.y,p2.x,p2.y);
      if(bfsResult){sdx=bfsResult.dx;sdy=bfsResult.dy;}
      else{sdx=0;sdy=0;}
    }
  } else if(type==='retreat'||type==='kite'){
    sdx=-sdx;sdy=-sdy;
  }

  // Collision check for preview path
  if(sdx!==0||sdy!==0){
    var nx=endX+sdx,ny=endY+sdy;
    if(nx<0||nx>=GS||ny<0||ny>=GS||(nx===p2.x&&ny===p2.y)||!canTraverseTerrain(endX,endY,nx,ny)){
      if(sdx!==0&&sdy!==0){
        if(endX+sdx>=0&&endX+sdx<GS&&!(endX+sdx===p2.x&&endY===p2.y)&&canTraverseTerrain(endX,endY,endX+sdx,endY))sdy=0;
        else if(endY+sdy>=0&&endY+sdy<GS&&!(endX===p2.x&&endY+sdy===p2.y)&&canTraverseTerrain(endX,endY,endX,endY+sdy))sdx=0;
        else{sdx=0;sdy=0;}
      }else{sdx=0;sdy=0;}
    }
  }
  moveQueue.push({dx:sdx,dy:sdy,type:type});
  lastMoveType={type:type};
  updateMoveQueueUI();renderGrid();
}
function onCellClick(r,c){
  if(gamePhase!=='plan'||executing||moveQueue.length>=getEffSpeed(p1))return;
  var endX=p1.x,endY=p1.y;moveQueue.forEach(function(s){endX+=s.dx;endY+=s.dy});
  var dx=c-endX,dy=r-endY;
  if(Math.abs(dx)>1||Math.abs(dy)>1||(dx===0&&dy===0)||(c===p2.x&&r===p2.y)||!canTraverseTerrain(endX,endY,c,r))return;
  moveQueue.push({dx:dx,dy:dy,type:'direct'});lastMoveType={dx:dx,dy:dy,type:'direct'};updateMoveQueueUI();renderGrid();
}
function updateMoveQueueUI(){
  var el=document.getElementById('moveQueue');el.innerHTML='';
  var maxSteps=getEffSpeed(p1);
  var remaining=maxSteps-moveQueue.length;
  document.getElementById('moveInfo').textContent=remaining+' step'+(remaining!==1?'s':'')+' remaining';
  // Render filled steps
  moveQueue.forEach(function(step,i){
    var dirs={'-1,-1':'↖','0,-1':'↑','-1,0':'←','1,-1':'↗','1,0':'→','1,1':'↘','0,1':'↓','-1,1':'↙'};
    var arrow=dirs[step.dx+','+step.dy]||'●';
    if(step.type==='pursue')arrow='🎯';
    else if(step.type==='flank')arrow='⚔';
    else if(step.type==='kite')arrow='↗';
    else if(step.type==='retreat')arrow='←';
    var s=document.createElement('span');s.className='mq-step';s.textContent=arrow;
    s.title=step.type!=='direct'?step.type+' (dynamic) — tap to undo':'Tap to undo from here';
    s.onclick=function(){moveQueue.splice(i);updateMoveQueueUI();renderGrid()};
    el.appendChild(s);
  });
  // Render empty slots — tapping fills ALL remaining with last move type
  for(var e=0;e<remaining;e++){
    var empty=document.createElement('span');empty.className='mq-step mq-empty';
    empty.textContent='·';
    empty.title=lastMoveType?'Tap to fill remaining with last move':'Queue a move first';
    empty.onclick=(function(){
      if(!lastMoveType||gamePhase!=='plan'||executing)return;
      var max=getEffSpeed(p1);
      while(moveQueue.length<max){
        if(lastMoveType.type&&lastMoveType.type!=='direct'){
          addAutoStep(lastMoveType.type);
        } else if(lastMoveType.dx!==undefined){
          queueDpadStep(lastMoveType.dx,lastMoveType.dy);
        } else break;
        if(moveQueue.length>=max)break;
      }
    });
    el.appendChild(empty);
  }
}
function buildAttackBar(){
  var bar=document.getElementById('atkBar');bar.innerHTML='';
  // ═══ ATTACK MOVES ═══
  p1.attacks.forEach(function(name){
    var atk=ATTACKS[name];if(!atk)return;
    var typCol=atk.type==='sol'?'#f59e0b':atk.type==='luna'?'#6366f1':atk.type==='physical'?'#94a3b8':'#a890f0';
    var btn=document.createElement('button');btn.className='atk-btn'+(selectedAttack===name?' selected':'');
    var shortName=name.length>14?name.split(' ').map(function(w){return w.slice(0,5)}).join(' '):name;
    btn.innerHTML='<div style="font-size:0.78em;line-height:1.1">'+shortName+'</div><div class="atk-type" style="color:'+typCol+'">● '+atk.type.toUpperCase()+'</div>';
    btn.onclick=function(){selectAttack(name)};bar.appendChild(btn);
  });
  // ═══ ACTION OPTIONS (D&D 5e PHB) ═══
  var actions=[
    {id:'_dash',sym:'🏃',lbl:'Dash',tip:'Double movement, skip attack'},
    {id:'_disengage',sym:'🛡',lbl:'Disengage',tip:'No opportunity attacks, skip attack'},
    {id:'_shove',sym:'🤜',lbl:'Shove',tip:'Contested STR check, push 1 tile + prone'},
    {id:'_ready',sym:'🎯',lbl:'Ready',tip:'Hold attack as reaction when enemy enters range'}
  ];
  actions.forEach(function(a){
    var btn=document.createElement('button');btn.className='atk-btn action-opt'+(selectedAttack===a.id?' selected':'');
    btn.innerHTML='<div style="font-size:0.85em;line-height:1.1">'+a.sym+' '+a.lbl+'</div><div class="atk-type" style="color:#94a3b8;font-size:0.65em">'+a.tip+'</div>';
    btn.onclick=function(){selectAction(a.id)};bar.appendChild(btn);
  });
}
function selectAttack(name){
  // Clear action flags when selecting a normal attack
  delete p1._dashing;
  selectedAttack=name;buildAttackBar();showAttackDetail(name);renderGrid();
  // Re-cap movement at normal speed when switching from Dash
  if(moveQueue.length>p1.speed){moveQueue.length=p1.speed;updateMoveQueueUI();}
}
function selectAction(actionId){
  delete p1._dashing;
  if(actionId==='_dash'){
    p1._dashing=true;
    selectedAttack='_dash';
    // Clear move queue since speed changed (doubled)
    moveQueue=[];updateMoveQueueUI();
    logMsg('🏃 Dash selected — '+p1.speed*2+' movement, no attack','phase');
  } else if(actionId==='_disengage'){
    selectedAttack='_disengage';
    logMsg('🛡 Disengage — safe movement, no attack','phase');
  } else if(actionId==='_shove'){
    selectedAttack='_shove';
    logMsg('🤜 Shove — push enemy 1 tile if adjacent','phase');
  } else if(actionId==='_ready'){
    showReadyPopup();return;
  }
  buildAttackBar();
  document.getElementById('atkDetail').classList.remove('show');
  renderGrid();
}
function showReadyPopup(){
  // Show attack list to pick which move to hold
  var html='<div id="readyOverlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:999;display:flex;align-items:center;justify-content:center;padding:16px" onclick="this.remove()">';
  html+='<div style="background:#15151f;border:2px solid #d4a843;border-radius:12px;padding:16px;max-width:340px;width:100%" onclick="event.stopPropagation()">';
  html+='<div style="text-align:center;font-family:Cinzel,serif;color:#d4a843;margin-bottom:10px">🎯 Ready — Hold Which Attack?</div>';
  html+='<div style="color:#888;font-size:0.8em;text-align:center;margin-bottom:8px">Fires as reaction when enemy enters range</div>';
  p1.attacks.forEach(function(name){
    var atk=ATTACKS[name];if(!atk)return;
    if(atk.range===0&&atk.special!=='teleport')return; // skip self-only moves
    var typCol=atk.type==='sol'?'#f59e0b':atk.type==='luna'?'#6366f1':atk.type==='physical'?'#94a3b8':'#a890f0';
    html+='<div style="background:#1e1e28;border:1px solid #333;border-left:3px solid '+typCol+';padding:8px 12px;margin:4px 0;border-radius:6px;cursor:pointer" onclick="pickReadyAttack(\''+name+'\')">';
    html+='<div style="color:#e8e0d0;font-size:0.9em">'+name+'</div>';
    html+='<div style="color:#888;font-size:0.75em">Range: '+(atk.range||1)+' | '+atk.dice+'</div></div>';
  });
  html+='<div style="text-align:center;margin-top:8px"><button onclick="document.getElementById(\'readyOverlay\').remove()" style="background:transparent;border:1px solid #555;color:#888;padding:6px 20px;border-radius:6px">Cancel</button></div>';
  html+='</div></div>';
  document.body.insertAdjacentHTML('beforeend',html);
}
function pickReadyAttack(atkName){
  var el=document.getElementById('readyOverlay');if(el)el.remove();
  p1._readiedAction={name:atkName};
  selectedAttack='_ready';
  logMsg('🎯 Readied: '+atkName+' — will fire when enemy enters range','phase');
  buildAttackBar();
  document.getElementById('atkDetail').classList.remove('show');
  renderGrid();
}
function showAttackDetail(name){
  var el=document.getElementById('atkDetail');var atk=ATTACKS[name];if(!atk){el.classList.remove('show');return}
  var sMod=Math.floor((p1.stats[atk.stat]-10)/2);
  var matB=getMateriaBonus(p1,atk);var toHit=sMod+p1.prof+matB.toHit;
  var tags='<span class="ad-tag">'+atk.type.toUpperCase()+'</span>';
  var effRange=atk.range+(atk.range>0?matB.extraRange:0);
  tags+='<span class="ad-tag">Range: '+(atk.range===0?'Self':effRange)+'</span>';
  if(atk.dice!=='0d0')tags+='<span class="ad-tag">Dmg: '+atk.dice+'+'+sMod+(matB.bonusDmg>0?'+'+matB.bonusDmg:'')+'</span>';
  tags+='<span class="ad-tag">Hit: d20+'+toHit+'</span>';
  if(matB.critRange<20)tags+='<span class="ad-tag" style="color:#f59e0b">Crit '+matB.critRange+'-20</span>';
  if(matB.lifesteal)tags+='<span class="ad-tag" style="color:#4ade80">Lifesteal</span>';
  if(atk.special==='dot')tags+='<span class="ad-tag" style="color:#f97316">DOT '+(atk.dotTurns+matB.dotBonus)+'t</span>';
  if(atk.special==='heal')tags+='<span class="ad-tag" style="color:#4ade80">Heal '+atk.healDice+'</span>';
  if(atk.special==='ward')tags+='<span class="ad-tag" style="color:#60a5fa">Ward +'+atk.acBonus+'</span>';
  if(atk.special==='teleport')tags+='<span class="ad-tag" style="color:#a78bfa">Teleport '+atk.teleportRange+'</span>';
  el.innerHTML='<div class="ad-name">'+name+'</div><div style="font-size:0.85em;color:var(--dim);margin:3px 0">'+atk.desc+'</div><div class="ad-row">'+tags+'</div>';
  el.classList.add('show');
}

// ═══ MATERIA SYSTEM ═══
function gainMateriaXP(fighter,slotType,amount){
  if(!fighter.materia)return;
  fighter.materia.forEach(function(m){
    if(m.slot===slotType&&m.level<MATERIA_MAX_LVL){
      m.xp+=amount;var needed=matXpNeeded(m.level);
      if(m.xp>=needed){m.xp-=needed;m.level=Math.min(MATERIA_MAX_LVL,m.level+1);
        m._justLeveled=true;   // surfaced post-combat to play levelup orb anim
        logMsg('Materia '+PLANETS[m.idx].name+' ascends to Lv'+m.level+'!','purity');
      }
    }
  });
}
function getMateriaBonus(fighter,atkData){
  var b={toHit:0,critRange:20,extraRange:0,lifesteal:false,dotBonus:0,acBonus:0,lifestealDice:'1d4',bonusDmg:0};
  if(!fighter.materia)return b;
  // Refinement bonus from hand gear: +refinement to damage
  if(fighter.gear){
    ['LHand','RHand'].forEach(function(pos){
      var g=fighter.gear[pos];
      if(g&&g.refinement)b.bonusDmg+=g.refinement;
    });
  }
  // All hand materia ('w') apply to all attacks
  fighter.materia.forEach(function(m){
    if(m.slot!=='w')return;var p=PLANETS[m.idx];var lvl=m.level;
    if(p.bonus==='accuracy')b.toHit+=Math.min(lvl+1,3);
    if(p.bonus==='crit')b.critRange=Math.min(b.critRange,21-Math.min(lvl,3));
    if(p.bonus==='range')b.extraRange+=Math.min(lvl,2);
    if(p.bonus==='damage')b.bonusDmg+=Math.min(lvl+1,3);
    if(p.bonus==='lifesteal')b.lifesteal=true;
    if(p.bonus==='dot')b.dotBonus+=Math.min(lvl,2);
    if(p.bonus==='defense')b.acBonus+=Math.min(lvl+1,3);
  });
  fighter.materia.forEach(function(m){if(m.slot==='a'){var p=PLANETS[m.idx];if(p.bonus==='defense')b.acBonus+=Math.min(m.level,2)}});
  COMPOUNDS.forEach(function(c){
    // Check if compound indices match adjacent materia in same slot
    // This is simplified - just check for any pair of these planet types in same slot
    var found=false;
    fighter.materia.forEach(function(m1,i1){
      fighter.materia.forEach(function(m2,i2){
        if(i1>=i2||!m1.slot||!m2.slot||m1.slot!==m2.slot)return;
        if((m1.idx===c.a&&m2.idx===c.b)||(m1.idx===c.b&&m2.idx===c.a)){
          if(!found&&(m1.slot==='w'||m1.slot==='a')){
            found=true;
            if(c.name==='Lunar Flux'){b.acBonus+=3;b.toHit+=1}
            if(c.name==='Healing Arts'){b.lifesteal=true;b.lifestealDice='1d6'}
            if(c.name==='Solar Grace'){b.lifesteal=true;b.bonusDmg+=2}
            if(c.name==='Solar Forge'){b.bonusDmg+=3;b.critRange=Math.min(b.critRange,19)}
            if(c.name==='War Expansion'){b.critRange=Math.min(b.critRange,18);b.extraRange+=1}
            if(c.name==='Crushing Weight'){b.extraRange+=2;b.dotBonus+=2}
          }
        }
      });
    });
  });
  return b;
}
function getFighterAC(fighter){
  var ac=fighter.ac+(fighter.ward||0);
  // Refinement bonus from body gear: +refinement to AC
  if(fighter.gear&&fighter.gear.Body&&fighter.gear.Body.refinement){
    ac+=fighter.gear.Body.refinement;
  }
  if(!fighter.materia)return ac;
  fighter.materia.forEach(function(m){if(!m.slot)return;var p=PLANETS[m.idx];if(p.bonus==='defense')ac+=Math.min(m.level,2)});
  return ac;
}

// ═══ EXECUTE TURN ═══
function executeTurn(){
  if(gamePhase!=='plan'||executing)return;
  if(!selectedAttack){logMsg('⚠ Select an attack or action first!');return}
  executing=true;document.getElementById('execBtn').disabled=true;gamePhase='execute';

  // Set disengaging flag for OA suppression
  p1._disengaging=(selectedAttack==='_disengage');

  var aiQueue=genAIMoves();var aiAttack=pickAIAttack();
  processDOT(p1);processDOT(p2);
  p1.ward=0;p2.ward=0;

  // Clear per-turn flags on opponent
  delete p2._readiedActionFired;delete p1._readiedActionFired;
  // OA tracking — each fighter gets 1 reaction per turn
  p1._oaUsed=false;p2._oaUsed=false;

  var timeline=buildTimeline(moveQueue,aiQueue);
  // ═══ Build snapshot tables (v13.01) — called once per turn, immediately
  // after timeline. Defensive: on exception, clear maps so getSnapshotFor
  // falls through to live-only fallback. NOT a timer hack; logs loudly.
  try { _snapshotBuildTables(moveQueue, aiQueue); }
  catch(_snapBuildErr){
    try { console.error('[SNAPSHOT BUILD FAILED]', _snapBuildErr); } catch(_){}
    _snapshotIntervalMap.clear(); _snapshotPathMap.clear(); _snapshotStartMap.clear();
  }
  // ═══ PRE-MOVEMENT: Check if readied actions should fire immediately ═══
  // If holder's target is already in range, fire before movement begins
  _checkReadiedImmediate(p1,p2,function(){
  _checkReadiedImmediate(p2,p1,function(){
  if(checkWin()){return}
  animateTimeline(timeline,0,function(){
    // DO NOT faceBothFighters() here — preserves flanking positions!
    // Each attacker faces their target only when they attack (handled in resolveOneAttack)
    renderGrid();
    // ═══ POST-MOVEMENT: Fire any unfired readied actions if target now in range ═══
    _checkReadiedImmediate(p1,p2,function(){
    _checkReadiedImmediate(p2,p1,function(){
    if(checkWin()){return}
    // ═══ ACTION RESOLUTION PHASE ═══
    if(selectedAttack==='_dash'){
      // Dash: no attack, already moved double
      logMsg('🏃 You dashed — no attack this turn','phase');
      finishTurn();
    } else if(selectedAttack==='_disengage'){
      // Disengage: no attack, safe movement done
      logMsg('🛡 You disengaged — no attack this turn','phase');
      // AI still attacks
      resolveOneAttack(p2,p1,aiAttack,function(){finishTurn()});
    } else if(selectedAttack==='_shove'){
      // Shove: contested STR check
      resolveShove(p1,p2,function(){
        if(checkWin()){return}
        resolveOneAttack(p2,p1,aiAttack,function(){finishTurn()});
      });
    } else if(selectedAttack==='_ready'){
      // Ready: skip attack, hold reaction (already stored on p1._readiedAction)
      logMsg('🎯 Holding action — waiting for opportunity','phase');
      // AI attacks normally
      resolveOneAttack(p2,p1,aiAttack,function(){finishTurn()});
    } else {
      // Normal attack — use initiative for order
      resolveAttacks(selectedAttack,aiAttack,function(){finishTurn()});
    }
    });});// close post-movement readied checks
  });// close animateTimeline
  });});// close pre-movement readied checks
}

function finishTurn(){
  applyTileEffects(p1);applyTileEffects(p2);
  gainMateriaXP(p1,'a',1);gainMateriaXP(p2,'a',1);
  if(checkWin())return;
  turnNum++;gamePhase='plan';moveQueue=[];lastMoveType=null;selectedAttack=null;executing=false;
  // Clear per-turn flags
  delete p1._dashing;delete p2._dashing;
  delete p1._disengaging;delete p2._disengaging;
  delete p1._readiedAction;delete p2._readiedAction;
  delete p1._prone;delete p2._prone;
  delete p1._readiedActionFired;delete p2._readiedActionFired;
  // Reset animations to idle (prevents stuck slash/hurt frames). Death is held.
  if(p1&&p1.anim&&p1.anim.name!=='death')p1.anim={name:_fighterIdleAnim(p1),frame:0,timer:performance.now(),onDone:null};
  if(p2&&p2.anim&&p2.anim.name!=='death')p2.anim={name:_fighterIdleAnim(p2),frame:0,timer:performance.now(),onDone:null};
  document.getElementById('execBtn').disabled=false;
  faceBothFighters();buildAttackBar();
  document.getElementById('atkDetail').classList.remove('show');
  updateMoveQueueUI();updateHUD();updateStatSheet();renderGrid();
  logMsg('——— Turn '+turnNum+' ———','phase');
}

// ═══ SHOVE (D&D 5e PHB) — Contested Athletics check ═══
function resolveShove(attacker,defender,done){
  var aName=attacker===p1?'You':'Opp';
  var dName=defender===p1?'You':'Opp';
  var dist=Math.max(Math.abs(attacker.x-defender.x),Math.abs(attacker.y-defender.y));
  if(dist>1){logMsg(aName+' Shove: not adjacent!','miss');setTimeout(done,400);return}

  var atkStrMod=Math.floor((attacker.stats.STR-10)/2);
  var defBestMod=Math.max(Math.floor((defender.stats.STR-10)/2),Math.floor((defender.stats.DEX-10)/2));
  var atkRoll=Math.floor(Math.random()*20)+1;
  var defRoll=Math.floor(Math.random()*20)+1;
  var atkTotal=atkRoll+atkStrMod+attacker.prof;
  var defTotal=defRoll+defBestMod+defender.prof;

  logMsg('🤜 '+aName+' Shove! Athletics d20('+atkRoll+')+'+atkStrMod+'+'+attacker.prof+'='+atkTotal+' vs '+dName+' d20('+defRoll+')+'+defBestMod+'+'+defender.prof+'='+defTotal,'phase');

  if(atkTotal>defTotal){
    // Push 1 tile away + prone
    var dx=defender.x-attacker.x,dy=defender.y-attacker.y;
    if(dx===0&&dy===0)dy=1;
    var pdx=dx===0?0:Math.sign(dx),pdy=dy===0?0:Math.sign(dy);
    // Prefer cardinal
    if(Math.abs(dx)>Math.abs(dy))pdy=0;
    else if(Math.abs(dy)>Math.abs(dx))pdx=0;
    var nx=defender.x+pdx,ny=defender.y+pdy;
    if(nx>=0&&nx<GS&&ny>=0&&ny<GS&&!(nx===attacker.x&&ny===attacker.y)){
      defender.x=nx;defender.y=ny;
      logMsg('💥 Shoved! '+dName+' pushed back and knocked PRONE!','crit');
    } else {
      logMsg('💥 Shove connects but '+dName+' can\'t be pushed (wall)! Knocked PRONE!','crit');
    }
    defender._prone=true;
    setFighterAnim(defender,'prone');
    // Attacker plays a quick shove poke (Arms-Up) so it's clear who did it.
    if (attacker.anim && attacker.anim.name !== 'death') setFighterAnim(attacker,'parry');
    renderGrid();updateHUD();
  } else {
    logMsg('🤜 Shove failed! '+dName+' holds ground.','miss');
  }
  setTimeout(done,500);
}

// ═══ AI ═══
function genAIMoves(){
  var q=[];var spd=p2.speed;
  var atkName=pickAIAttack();var atkRange=ATTACKS[atkName]?ATTACKS[atkName].range:1;
  var dist=Math.max(Math.abs(p1.x-p2.x),Math.abs(p1.y-p2.y));

  // Decide AI strategy: retreat if low HP, flank if close and smart, else pursue
  var useFlank = dist<=3 && p2.hp>p2.maxHp*0.4 && Math.random()<0.35;

  for(var i=0;i<spd;i++){
    // Placeholder dx/dy for preview (recalculated dynamically at execution)
    var dx=p1.x-p2.x,dy=p1.y-p2.y;
    var sdx=dx===0?0:Math.sign(dx),sdy=dy===0?0:Math.sign(dy);

    if(p2.hp<p2.maxHp*0.25&&dist<=2){
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
function pickAIAttack(){
  var attacks=p2.attacks.slice();
  var dist=Math.max(Math.abs(p1.x-p2.x),Math.abs(p1.y-p2.y));
  if(p2.hp<p2.maxHp*0.4){var heals=attacks.filter(function(n){return ATTACKS[n]&&ATTACKS[n].special==='heal'});if(heals.length>0)return heals[0]}
  var valid=attacks.filter(function(n){var a=ATTACKS[n];return a&&(a.range===0||a.range>=dist)&&a.dice!=='0d0'});
  if(valid.length>0)return pick(valid);
  return attacks[0];
}

// ═══ TIMELINE (Interval Model) ═══
// Each step is an INTERVAL, not a point event.
// Left edge  = READ  (snapshot enemy position — "mental note")
// Right edge = MOVE  (execute toward snapshot — physically relocate)
//
// A 1-tile character: one interval spanning [0, 5000ms].
//   Reads at t=0, moves at t=5000. Acts on ancient information.
// A 6-tile character: six intervals of ~833ms each.
//   Reads and moves 6× with ~833ms-old data each time.
//
// Speed advantage = information freshness, not extra steps at the end.
// Both entities finish moving at t=5000 (right edge of last interval).
// Facing uses SNAPSHOT (mental model). Collisions/OA use LIVE positions.

function buildTimeline(pQueue,eQueue){
  var PHASE=5;
  var events=[];

  // Player step intervals
  var pInt=PHASE/Math.max(1,pQueue.length);
  pQueue.forEach(function(step,i){
    // Shared object links read↔move for same step
    var shared={who:p1,step:step,snapshot:null,dex:p1.stats.DEX};
    events.push({type:'read',time:i*pInt,shared:shared,dex:p1.stats.DEX});
    events.push({type:'move',time:(i+1)*pInt,shared:shared,dex:p1.stats.DEX});
  });

  // Enemy step intervals
  var eInt=PHASE/Math.max(1,eQueue.length);
  eQueue.forEach(function(step,i){
    var shared={who:p2,step:step,snapshot:null,dex:p2.stats.DEX};
    events.push({type:'read',time:i*eInt,shared:shared,dex:p2.stats.DEX});
    events.push({type:'move',time:(i+1)*eInt,shared:shared,dex:p2.stats.DEX});
  });

  // Sort: by time → moves before reads at same instant (complete previous
  // interval before next snapshot) → higher DEX first within same type+time
  events.sort(function(a,b){
    if(Math.abs(a.time-b.time)>0.001)return a.time-b.time;
    if(a.type!==b.type)return a.type==='move'?-1:1;
    return b.dex-a.dex;
  });

  return events;
}

// ═══════════════════════════════════════════════════════════════════
// SNAPSHOT SYSTEM (v13.01) — adapted from Crystal Conquest v15.87 spec
// ═══════════════════════════════════════════════════════════════════
// PURPOSE: Provide an asymmetric, speed-aware projection of opponent
// position/facing/intent for AI tactical decisions during the move
// phase. Live state still owns physical reality (collisions, OAs,
// position commits); snapshot owns tactical belief.
//
// ASYMMETRIC INTENT RULE (spec §6):
//   Reader strictly faster than readee → projected pos/facing + intent
//                                        when readee is mid-step
//   Reader slower or equal             → live pos + live facing,
//                                        no intent
// This makes a fast fighter able to "predict" a slow fighter's next
// destination tile and arrive there ahead of them, while a slow
// fighter can only react to a fast fighter's already-completed steps.
//
// SPEED METRIC (spec §6 v15.82): getEffSpeed() — capacity, not queued
// count. A fast fighter who chose few moves is still fast.
//
// PROJECTION MODEL (spec §6.4, E6): Idealized — no collision detours,
// no BFS, no speed-budget walk. Live execution self-corrects.
// ═══════════════════════════════════════════════════════════════════

// Project unit-direction for one step. Player 'direct' moves use stored
// dx/dy (locked choice). Other types derive direction from intent vs target.
function _snapshotProjectStepDir(entity, step, px, py, target){
  if(!step) return {x:0,y:0};
  if(step.type === 'direct'){
    return {x: step.dx||0, y: step.dy||0};
  }
  if(!target) return {x:0,y:0};
  var dx = target.x - px, dy = target.y - py;
  if(step.type === 'pursue' || step.type === 'flank' || step.type === 'stay'){
    if(dx === 0 && dy === 0) return {x:0,y:0};
    return {x: dx===0?0:Math.sign(dx), y: dy===0?0:Math.sign(dy)};
  }
  if(step.type === 'kite' || step.type === 'retreat' || step.type === 'flee' || step.type === 'hide'){
    if(dx === 0 && dy === 0) return {x:1, y:0};
    return {x: dx===0?0:-Math.sign(dx), y: dy===0?0:-Math.sign(dy)};
  }
  // return, regroup, dodge — no deterministic projection
  return {x:0,y:0};
}

// Build snapshot tables once per turn, after buildTimeline.
function _snapshotBuildTables(pQueue, eQueue){
  _snapshotIntervalMap.clear();
  _snapshotPathMap.clear();
  _snapshotStartMap.clear();

  function buildEntityPath(entity, queue){
    _snapshotStartMap.set(entity, {x: entity.x, y: entity.y, facing: entity.facing});
    if(!queue || queue.length === 0){
      _snapshotIntervalMap.set(entity, []);
      _snapshotPathMap.set(entity, []);
      return;
    }
    var interval = MOVE_PHASE / queue.length;
    var boundaries = [];
    var path = [];
    var curX = entity.x, curY = entity.y;
    var target = (entity === p1) ? p2 : p1;
    for(var i = 0; i < queue.length; i++){
      var step = queue[i];
      var t = i * interval;
      boundaries.push(t);
      var dir = _snapshotProjectStepDir(entity, step, curX, curY, target);
      var endX = Math.max(0, Math.min(GS-1, curX + dir.x));
      var endY = Math.max(0, Math.min(GS-1, curY + dir.y));
      path.push({
        dir: dir,
        dest: {x: endX, y: endY},
        endX: endX, endY: endY,
        startX: curX, startY: curY,
        moveType: step.type, time: t
      });
      curX = endX; curY = endY;
    }
    _snapshotIntervalMap.set(entity, boundaries);
    _snapshotPathMap.set(entity, path);
  }

  buildEntityPath(p1, pQueue);
  buildEntityPath(p2, eQueue);
}

// Project tile position at time t (step-END semantics — a step's effect
// is applied only after its interval has fully elapsed).
function _snapshotProjectPosition(entity, t){
  var start = _snapshotStartMap.get(entity);
  var path = _snapshotPathMap.get(entity);
  if(!start) return {x: entity.x, y: entity.y};
  if(!path || path.length === 0) return {x: start.x, y: start.y};
  var boundaries = _snapshotIntervalMap.get(entity) || [];
  var x = start.x, y = start.y;
  for(var i = 0; i < path.length; i++){
    var stepEnd = (i+1 < boundaries.length) ? boundaries[i+1] : MOVE_PHASE;
    if(stepEnd <= t + 0.0001){
      x = path[i].endX; y = path[i].endY;
    } else {
      break;
    }
  }
  return {x: x, y: y};
}

// Project facing at time t. Active step direction if mid-interval, else
// last completed step's direction. Crucible uses radian facing.
function _snapshotProjectFacing(entity, t){
  var start = _snapshotStartMap.get(entity);
  var path = _snapshotPathMap.get(entity);
  if(!start) return (entity ? (entity.facing || 0) : 0);
  if(!path || path.length === 0) return start.facing;
  var boundaries = _snapshotIntervalMap.get(entity) || [];
  var activeStep = null, lastCompleted = null;
  for(var i = 0; i < path.length; i++){
    var s = boundaries[i];
    var e = (i+1 < boundaries.length) ? boundaries[i+1] : MOVE_PHASE;
    if(t >= s - 0.0001 && t < e - 0.0001){ activeStep = path[i]; break; }
    if(e <= t + 0.0001) lastCompleted = path[i];
  }
  var step = activeStep || lastCompleted;
  if(!step) return start.facing;
  var dx = step.dir.x, dy = step.dir.y;
  if(dx === 0 && dy === 0) return start.facing;
  return facingAngle(dx, dy);
}

// Returns step strictly contained in t (t > step_start AND t < step_end).
// Returns null on a boundary, before first step, or after last step.
// This exposes "intent" — a knowable mid-flight commitment.
function _snapshotProjectStepInProgress(entity, t){
  var path = _snapshotPathMap.get(entity);
  var boundaries = _snapshotIntervalMap.get(entity) || [];
  if(!path || path.length === 0) return null;
  for(var i = 0; i < path.length; i++){
    var s = boundaries[i];
    var e = (i+1 < boundaries.length) ? boundaries[i+1] : MOVE_PHASE;
    if(t > s + 0.0001 && t < e - 0.0001) return {dir: path[i].dir, dest: path[i].dest};
  }
  return null;
}

// Comparable speed metric for asymmetric intent rule. Capacity, not
// queued count: getEffSpeed accounts for dash, debuffs, etc.
function _snapshotReaderSpeed(entity){
  if(!entity) return 0;
  if(typeof getEffSpeed === 'function'){
    try { var v = getEffSpeed(entity); if(typeof v === 'number' && !isNaN(v)) return v; } catch(e){}
  }
  return entity.speed || 0;
}

// PRIMARY QUERY — Reader A asks: what does B look like at time T?
// Returns {x, y, facing, intent} where intent is {dir, dest} or null.
// Wrapped in try/catch so a snapshot bug cannot freeze combat (spec §7).
function getSnapshotFor(reader, readee, timeOfRead){
  if(!readee) return null;
  try {
    var readeeBoundaries = _snapshotIntervalMap.get(readee);
    // Readee not in tables → live fallback
    if(!readeeBoundaries){
      return {x: readee.x, y: readee.y, facing: readee.facing || 0, intent: null};
    }
    // Asymmetric speed rule
    var readerSpeed = _snapshotReaderSpeed(reader);
    var readeeSpeed = _snapshotReaderSpeed(readee);
    if(readerSpeed <= readeeSpeed){
      // Slower or equal — live tile, live facing, no intent
      return {x: readee.x, y: readee.y, facing: readee.facing || 0, intent: null};
    }
    // Reader strictly faster — projected snapshot with possible intent.
    // Boundary check: matching readee boundary → no intent; t=0 or t=PHASE → no intent
    var onBoundary = false;
    for(var bi = 0; bi < readeeBoundaries.length; bi++){
      if(Math.abs(readeeBoundaries[bi] - timeOfRead) < 0.0001){ onBoundary = true; break; }
    }
    var pos = _snapshotProjectPosition(readee, timeOfRead);
    var facing = _snapshotProjectFacing(readee, timeOfRead);
    var intent = null;
    if(!onBoundary && timeOfRead > 0.0001 && timeOfRead < MOVE_PHASE - 0.0001){
      var step = _snapshotProjectStepInProgress(readee, timeOfRead);
      if(step) intent = {dir: step.dir, dest: step.dest};
    }
    return {x: pos.x, y: pos.y, facing: facing, intent: intent};
  } catch(_snapErr){
    try { console.error('[SNAPSHOT QUERY FAILED]', _snapErr, 'reader=', reader, 'readee=', readee, 't=', timeOfRead); } catch(_){}
    return {x: readee.x, y: readee.y, facing: readee.facing || 0, intent: null};
  }
}

function animateTimeline(events,idx,done){
  if(idx>=events.length){done();return}
  var ev=events[idx];

  // ═══ READ EVENT: snapshot enemy position via asymmetric snapshot system ═══
  // v13.01: replaces simple live read. Snapshot returns {x, y, facing, intent}.
  // intent === non-null only when reader is strictly faster than readee AND
  // readee is mid-step. _tx/_ty are intent.dest if intent visible, else snap pos.
  if(ev.type==='read'){
    var target=ev.shared.who===p1?p2:p1;
    var _qSnap = (typeof getSnapshotFor === 'function')
      ? getSnapshotFor(ev.shared.who, target, ev.time)
      : null;
    ev.shared.snapshot = _qSnap || {x:target.x, y:target.y, facing:target.facing||0, intent:null};
    // Reads have no animation — process next event immediately
    animateTimeline(events,idx+1,done);
    return;
  }

  // ═══ MOVE EVENT: execute using snapshot from read phase ═══
  var f=ev.shared.who;
  var other=f===p1?p2:p1;
  var step=ev.shared.step;
  var snap=ev.shared.snapshot; // {x, y, facing, intent} — tactical belief from read time
  var dx=step.dx,dy=step.dy;

  // ── Resolve tactical target (v13.01) ─────────────────────────────────
  // When intent is visible (reader faster than readee, readee mid-step),
  // _tx/_ty point at the readee's predicted DESTINATION tile, not their
  // current tile. This is the prediction power of the asymmetric system.
  var _tx = (snap.intent) ? snap.intent.dest.x : snap.x;
  var _ty = (snap.intent) ? snap.intent.dest.y : snap.y;
  var _tFacing = (snap.facing !== undefined && snap.facing !== null) ? snap.facing : (other.facing || 0);
  // Synthetic entity carrying snapshot belief — used for zone tests so
  // flank/rear checks use predicted facing+pos, not live (E2/E3).
  var _snapEnt = {x: _tx, y: _ty, facing: _tFacing};

  // ── Direction from SNAPSHOT (mental model, potentially stale) ──
  if(step.type==='pursue'){
    var dist=Math.max(Math.abs(_tx-f.x),Math.abs(_ty-f.y));
    if(dist<=1){
      // Adjacent to where we THINK they are — hold, face snapshot
      f.facing=facingAngle(_tx-f.x,_ty-f.y);
      renderGrid();updateHUD();
      setTimeout(function(){animateTimeline(events,idx+1,done)},220);return;
    }
    // Use BFS pathfinding toward SNAPSHOT (intent dest if visible, else pos),
    // blocked by LIVE other position (collisions are physical reality).
    var bfsResult=bfsNextStep(f.x,f.y,_tx,_ty,other.x,other.y);
    if(bfsResult){dx=bfsResult.dx;dy=bfsResult.dy;}
    else{dx=0;dy=0;}
  } else if(step.type==='retreat'||step.type==='kite'){
    dx=f.x-_tx;dy=f.y-_ty;
    if(dx===0&&dy===0)dx=1;
    var bestDir=null,bestScore=-9999;
    var allDirs=[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1},{x:1,y:1},{x:-1,y:1},{x:1,y:-1},{x:-1,y:-1}];
    var idealX=dx===0?0:Math.sign(dx),idealY=dy===0?0:Math.sign(dy);
    for(var ki=0;ki<allDirs.length;ki++){
      var kd=allDirs[ki],ktx=f.x+kd.x,kty=f.y+kd.y;
      if(ktx<0||ktx>=GS||kty<0||kty>=GS)continue;
      if(ktx===other.x&&kty===other.y)continue; // Collision check uses LIVE position
      if(!canTraverseTerrain(f.x,f.y,ktx,kty))continue; // Terrain check
      var kdist=Math.max(Math.abs(ktx-_tx),Math.abs(kty-_ty)); // Distance from snapshot/intent dest
      var kalign=(kd.x===idealX?1:0)+(kd.y===idealY?1:0);
      var kscore=kdist*10+kalign;
      if(kscore>bestScore){bestScore=kscore;bestDir=kd;}
    }
    if(bestDir){dx=bestDir.x;dy=bestDir.y;}
    else{dx=0;dy=0;}
  } else if(step.type==='flank'){
    var flankDist=Math.max(Math.abs(_tx-f.x),Math.abs(_ty-f.y));
    // Rear-zone tests use snapshot facing+pos (E3): the AI flanks based on
    // PREDICTED facing/position, not live. A fast flanker exploits a slow
    // foe's about-to-be-exposed rear arc; a slow flanker uses live (no intent).
    if(isRearTile(_snapEnt,f.x,f.y)){
      // Already at predicted rear — hold position, face snapshot dest
      f.facing=facingAngle(_tx-f.x,_ty-f.y);
      renderGrid();updateHUD();
      setTimeout(function(){animateTimeline(events,idx+1,done)},220);return;
    }
    var fBest=null,fBestScore=-9999;
    var fAllDirs=[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1},{x:1,y:1},{x:-1,y:1},{x:1,y:-1},{x:-1,y:-1}];
    for(var fi=0;fi<fAllDirs.length;fi++){
      var fd=fAllDirs[fi],ftx=f.x+fd.x,fty=f.y+fd.y;
      if(ftx<0||ftx>=GS||fty<0||fty>=GS)continue;
      if(ftx===other.x&&fty===other.y)continue; // Collision uses LIVE
      if(!canTraverseTerrain(f.x,f.y,ftx,fty))continue; // Terrain check
      var fScore=0;
      var fDistNew=Math.max(Math.abs(ftx-_tx),Math.abs(fty-_ty)); // Distance to snapshot/intent dest
      fScore+=(flankDist-fDistNew)*200;
      if(isRearTile(_snapEnt,ftx,fty))fScore+=400;
      if(isFrontTile(_snapEnt,ftx,fty))fScore-=60;
      if(flankDist<=2){
        if(!isFrontTile(_snapEnt,ftx,fty)&&fDistNew<=2)fScore+=100;
        if(!isFrontTile(_snapEnt,ftx,fty)&&!isRearTile(_snapEnt,ftx,fty)&&fDistNew<=flankDist)fScore+=50;
      }
      if(fScore>fBestScore){fBestScore=fScore;fBest=fd;}
    }
    if(fBest){dx=fBest.x;dy=fBest.y;}
    else{dx=0;dy=0;}
  }

  // ═══ COLLISION + MOVEMENT (uses LIVE positions — physical reality) ═══
  var oldX=f.x,oldY=f.y;
  var nx=f.x+dx,ny=f.y+dy;
  if(nx<0||nx>=GS||ny<0||ny>=GS||(nx===other.x&&ny===other.y)||!canTraverseTerrain(f.x,f.y,nx,ny)){
    if(dx!==0&&dy!==0){
      if(f.x+dx>=0&&f.x+dx<GS&&!(f.x+dx===other.x&&f.y===other.y)&&canTraverseTerrain(f.x,f.y,f.x+dx,f.y)){nx=f.x+dx;ny=f.y}
      else if(f.y+dy>=0&&f.y+dy<GS&&!(f.x===other.x&&f.y+dy===other.y)&&canTraverseTerrain(f.x,f.y,f.x,f.y+dy)){nx=f.x;ny=f.y+dy}
      else{nx=f.x;ny=f.y}
    } else {nx=f.x;ny=f.y}
  }
  var fdx=nx-f.x,fdy=ny-f.y;
  if(fdx!==0||fdy!==0){f.facing=facingAngle(fdx,fdy);setFighterAnim(f,'move')}
  f.x=nx;f.y=ny;

  // Face SNAPSHOT after move — mental model of where enemy is.
  // With intent visible, this is the predicted destination — moving fighter
  // ends facing where they THINK enemy will be. A slow character ends up
  // facing a stale position. That's being outmaneuvered.
  if(step.type==='pursue'||step.type==='flank'||step.type==='kite'||step.type==='retreat'){
    f.facing=facingAngle(_tx-f.x,_ty-f.y);
  }
  renderGrid();updateHUD();

  // ═══ OPPORTUNITY ATTACK CHECK — uses LIVE positions (physical reality) ═══
  // OA triggers on physically leaving opponent's front zone, regardless of snapshots
  var movedTile=(oldX!==f.x||oldY!==f.y);
  var wasInFront=isFrontTile(other,oldX,oldY);
  var nowInFront=isFrontTile(other,f.x,f.y);
  var moverDisengaging=f._disengaging;
  var oppCanOA=other.hp>0&&!other._oaUsed&&!other._readiedAction;

  if(movedTile&&wasInFront&&!nowInFront&&!moverDisengaging&&oppCanOA){
    other._oaUsed=true;
    // OA attacker faces the mover (live — they're reacting physically)
    other.facing=facingAngle(f.x-other.x,f.y-other.y);
    var oaName=other===p1?'You':'Opp';
    var mName=f===p1?'You':'Opp';
    var oaMod=Math.max(Math.floor((other.stats.STR-10)/2),Math.floor((other.stats.DEX-10)/2));
    var oaRoll=Math.floor(Math.random()*20)+1;
    var oaTotal=oaRoll+oaMod+other.prof;
    var oaAC=getFighterAC(f);
    logMsg('⚡ '+oaName+' Opportunity Attack as '+mName+' moves away!','phase');
    if(oaTotal>=oaAC||oaRoll===20){
      var oaDmg=Math.max(1,other.prof+oaMod);
      if(oaRoll===20)oaDmg*=2;
      f.hp=Math.max(0,f.hp-oaDmg);
      logMsg('⚔ OA hits! d20('+oaRoll+')+'+oaMod+'+'+other.prof+'='+oaTotal+' vs AC'+oaAC+' — '+oaDmg+' dmg'+(oaRoll===20?' CRIT!':''),'crit');
      if(f.hp<=0){setFighterAnim(f,'death')}else{setFighterAnim(f,'hurt');setFighterAnim(other,'slash')}
      updateHUD();renderGrid();
      if(f.hp<=0){
        logMsg('💀 '+mName+' felled by Opportunity Attack!','crit');
        setTimeout(function(){animateTimeline(events,idx+1,done)},600);return;
      }
    } else {
      logMsg('⚡ OA misses! d20('+oaRoll+')+'+oaMod+'+'+other.prof+'='+oaTotal+' vs AC'+oaAC,'miss');
    }
    setTimeout(function(){
      _checkReadied(f,other,function(){
        setTimeout(function(){animateTimeline(events,idx+1,done)},220);
      });
    },400);
    return;
  }

  // ═══ READIED ACTION CHECK ═══
  _checkReadied(f,other,function(){
    setTimeout(function(){animateTimeline(events,idx+1,done)},220);
  });
}

// Check if mover entered range of opponent's readied action
function _checkReadied(mover,holder,cb){
  if(!holder._readiedAction||holder.hp<=0||mover.hp<=0||holder._readiedActionFired){cb();return}
  var ra=holder._readiedAction;
  var atkDef=ATTACKS[ra.name];if(!atkDef){cb();return}
  var trig=_readiedTrigger(holder,mover,atkDef);
  var fires=false;
  if(trig.selfCast){
    fires=true;
  } else {
    var dist=Math.max(Math.abs(holder.x-mover.x),Math.abs(holder.y-mover.y));
    fires = dist<=trig.effRange;
  }
  if(fires){
    holder._readiedActionFired=true;
    var hName=holder===p1?'You':'Opp';
    logMsg('🎯 '+hName+'\'s readied '+ra.name+' triggers!','phase');
    resolveOneAttack(holder,mover,ra.name,function(){
      delete holder._readiedAction;
      updateHUD();renderGrid();
      cb();
    });
    return;
  }
  cb();
}

// Compute the effective range of a readied attack for THIS fighter, including
// materia bonuses. Self-cast specials (teleport, heal, buff) don't depend on
// the target's position — they always count as "in range" so the readied
// action fires as soon as conditions allow.
function _readiedTrigger(holder,target,atkDef){
  if(!atkDef) return {selfCast:false, effRange:1};
  var selfCast = atkDef.special==='teleport' || atkDef.special==='heal' || atkDef.range===0;
  if(selfCast) return {selfCast:true, effRange:0};
  var matB = getMateriaBonus(holder, atkDef);
  var effRange = (atkDef.range||1) + (atkDef.range>0 ? matB.extraRange : 0);
  return {selfCast:false, effRange:effRange};
}

// Immediate readied check — fires if target is already in range (no movement
// needed), OR if the readied attack is self-cast (teleport/heal). Runs both
// before AND after the timeline animation so the readied always activates at
// the earliest possible moment.
function _checkReadiedImmediate(holder,target,cb){
  if(!holder._readiedAction||holder.hp<=0||target.hp<=0||holder._readiedActionFired){cb();return}
  var ra=holder._readiedAction;
  var atkDef=ATTACKS[ra.name];if(!atkDef){cb();return}
  var trig=_readiedTrigger(holder,target,atkDef);
  var fires=false;
  if(trig.selfCast){
    fires=true;
  } else {
    var dist=Math.max(Math.abs(holder.x-target.x),Math.abs(holder.y-target.y));
    fires = dist<=trig.effRange;
  }
  if(fires){
    holder._readiedActionFired=true;
    var hName=holder===p1?'You':'Opp';
    var reason = trig.selfCast ? 'self-cast' : 'target in range';
    logMsg('🎯 '+hName+'\'s readied '+ra.name+' fires — '+reason+'!','phase');
    resolveOneAttack(holder,target,ra.name,function(){
      delete holder._readiedAction;
      updateHUD();renderGrid();
      cb();
    });
    return;
  }
  cb();
}

// ═══ ATTACK RESOLUTION ═══
function resolveAttacks(pAtkName,eAtkName,done){
  var first,second,fAtk,sAtk;
  // Use initiative (rolled at battle start) for attack order
  if(p1.initiative>=p2.initiative){first=p1;second=p2;fAtk=pAtkName;sAtk=eAtkName}
  else{first=p2;second=p1;fAtk=eAtkName;sAtk=pAtkName}
  resolveOneAttack(first,second,fAtk,function(){
    if(second.hp<=0||first.hp<=0){checkWin();done();return}
    resolveOneAttack(second,first,sAtk,function(){done()});
  });
}
function resolveOneAttack(attacker,defender,atkName,done){
  var atk=ATTACKS[atkName];if(!atk){done();return}
  var aName=attacker===p1?'You':'Opp';
  if(atk.special==='heal'){var heal=rollDice(atk.healDice);attacker.hp=Math.min(attacker.maxHp,attacker.hp+heal);logMsg(aName+' '+atkName+': heals '+heal+' HP','hit');updateHUD();renderGrid();setTimeout(done,400);return}
  if(atk.special==='ward'){attacker.ward=atk.acBonus;logMsg(aName+' '+atkName+': +'+atk.acBonus+' AC','hit');updateHUD();renderGrid();setTimeout(done,400);return}
  if(atk.special==='teleport'){
    var dx=defender.x-attacker.x,dy=defender.y-attacker.y;var dist=Math.max(Math.abs(dx),Math.abs(dy));
    if(dist>1){
      // Teleport: jump directly toward target, up to teleportRange tiles, stop adjacent
      var tilesToMove=Math.min(atk.teleportRange,dist-1); // Stop 1 tile from target
      var sdx=dx===0?0:(dx>0?1:-1),sdy=dy===0?0:(dy>0?1:-1);
      // Find best landing tile (teleport skips obstacles)
      var bestX=attacker.x,bestY=attacker.y;
      for(var t=tilesToMove;t>=1;t--){
        var tx=attacker.x+sdx*t,ty=attacker.y+sdy*t;
        if(tx>=0&&tx<GS&&ty>=0&&ty<GS&&!(tx===defender.x&&ty===defender.y)){
          bestX=tx;bestY=ty;break;
        }
      }
      attacker.x=bestX;attacker.y=bestY;
      setFighterAnim(attacker,'move');
      logMsg(aName+' '+atkName+': teleports '+tilesToMove+' tiles!','hit');
    } else {
      logMsg(aName+' '+atkName+': already adjacent — no teleport needed','miss');
    }
    attacker.facing=facingAngle(defender.x-attacker.x,defender.y-attacker.y);
    renderGrid();updateHUD();setTimeout(done,400);return;
  }
  var preMatB=getMateriaBonus(attacker,atk);var effRange=atk.range+(atk.range>0?preMatB.extraRange:0);
  var dist2=Math.max(Math.abs(attacker.x-defender.x),Math.abs(attacker.y-defender.y));
  if(effRange>0&&dist2>effRange){logMsg(aName+' '+atkName+': out of range!','miss');setTimeout(done,400);return}
  if(atk.range===1&&effRange===1&&dist2>1){logMsg(aName+' '+atkName+': out of melee range!','miss');setTimeout(done,400);return}
  var mod=statMod(attacker,atk.stat);var matB=getMateriaBonus(attacker,atk);
  // ═══ FLANKING ADVANTAGE — check BEFORE attacker turns to face ═══
  var flankZone=getZone(defender,attacker.x,attacker.y);
  var flankBonus=0;
  if(flankZone==='rear'){flankBonus=2;logMsg((attacker===p1?'You':'Opp')+' FLANKING from rear! +2 to hit','phase')}
  else if(flankZone==='side'){flankBonus=1;logMsg((attacker===p1?'You':'Opp')+' attacking from side. +1 to hit','phase')}
  // ═══ PRONE ADVANTAGE — melee attacks vs prone targets ═══
  var proneBonus=0;
  if(defender._prone&&dist2<=1){proneBonus=2;logMsg((attacker===p1?'You':'Opp')+' strikes PRONE target! +2 to hit','phase')}
  // Attacker now turns to face defender (visual + facing update)
  attacker.facing=facingAngle(defender.x-attacker.x,defender.y-attacker.y);
  // Defender reacts by facing attacker (preserves flanking calc above since zone was already checked)
  defender.facing=facingAngle(attacker.x-defender.x,attacker.y-defender.y);
  setFighterAnim(attacker,'slash');
  renderGrid();
  var toHit=mod+attacker.prof+matB.toHit+flankBonus+proneBonus;var roll=Math.floor(Math.random()*20)+1;var total=roll+toHit;
  var defAC=getFighterAC(defender);var isCrit=roll>=matB.critRange;
  showDice(aName+' → '+atkName,roll,total,defAC,isCrit,function(){
    if(total>=defAC||isCrit){
      var hitSlot='w';
      gainMateriaXP(attacker,hitSlot,2);
      var dmg=0;
      if(atk.dice!=='0d0'){dmg=rollDice(atk.dice)+mod+matB.bonusDmg;if(isCrit)dmg+=rollDice(atk.dice);dmg=Math.max(1,dmg)}
      defender.hp=Math.max(0,defender.hp-dmg);
      if(defender.hp<=0){setFighterAnim(defender,'death')}else{setFighterAnim(defender,'hurt')}
      if(attacker===p1)run.totalDamage+=dmg;
      logMsg(aName+' '+atkName+': '+(isCrit?'CRIT! ':'')+'d20('+roll+')+'+toHit+'='+total+' vs AC'+defAC+' ✔ '+dmg+' dmg',isCrit?'crit':'hit');
      if(matB.lifesteal&&dmg>0){var steal=rollDice(matB.lifestealDice||'1d4');attacker.hp=Math.min(attacker.maxHp,attacker.hp+steal);logMsg(aName+' drains '+steal+' HP!','hit')}
      if(atk.special==='dot'){var dotTurns=atk.dotTurns+matB.dotBonus;defender.dot={dice:atk.dotDice,turns:dotTurns};logMsg('Putrefaction! ('+dotTurns+' turns)','dissolve')}
    } else {
      logMsg(aName+' '+atkName+': d20('+roll+')+'+toHit+'='+total+' vs AC'+defAC+' ✘ MISS','miss');
    }
    // Reinforce facing — both face each other after attack resolves
    if(attacker.hp>0&&defender.hp>0){
      attacker.facing=facingAngle(defender.x-attacker.x,defender.y-attacker.y);
      defender.facing=facingAngle(attacker.x-defender.x,attacker.y-defender.y);
    }
    updateHUD();updateStatSheet();renderGrid();setTimeout(done,300);
  });
}
function showDice(header,roll,total,ac,isCrit,done){
  var ov=document.getElementById('diceOverlay');
  document.getElementById('diceHeader').textContent=header;
  var d20=document.getElementById('diceD20');d20.textContent=roll;
  d20.style.borderColor=isCrit?'#f59e0b':roll===1?'#ef4444':'var(--gold)';
  d20.style.color=isCrit?'#f59e0b':roll===1?'#ef4444':'var(--gold)';
  document.getElementById('diceResult').textContent='Total: '+total+' vs AC '+ac;
  document.getElementById('diceDamage').textContent=total>=ac||isCrit?'✔ HIT!':'✘ MISS';
  document.getElementById('diceDamage').style.color=total>=ac||isCrit?'#4ade80':'#ef4444';
  ov.classList.add('show');setTimeout(function(){ov.classList.remove('show');done()},1100);
}
function processDOT(f){
  if(!f||!f.dot)return;var dmg=rollDice(f.dot.dice);f.hp=Math.max(0,f.hp-dmg);
  logMsg((f===p1?'You':'Opp')+' takes '+dmg+' Putrefaction dmg!','dissolve');
  f.dot.turns--;if(f.dot.turns<=0)f.dot=null;
}
function applyTileEffects(f){
  if(!f||f.x<0||f.y<0||f.x>=GS||f.y>=GS)return;
  if(tiles[f.y][f.x]==='earth')f.hp=Math.min(f.maxHp,f.hp+2);
}

// ═══ SUMMARY HELPERS ═══
function buildRoundProgressHTML(completedUpTo,victory){
  var html='<div style="display:flex;gap:3px;justify-content:center;margin:8px 0">';
  for(var i=0;i<TOTAL_ROUNDS;i++){
    var rm=ROUND_METALS[i];
    var completed=i<completedUpTo-1;
    var current=i===completedUpTo-1&&!victory;
    var opacity=completed?'1':current?'0.6':'0.2';
    html+='<div style="text-align:center;opacity:'+opacity+'" title="Round '+(i+1)+' — '+rm.name+'">';
    html+='<div style="font-size:1em;color:'+rm.col+'">'+rm.sym+'</div>';
    html+='<div style="font-size:0.5em;color:'+rm.col+'">'+rm.name+'</div>';
    html+='</div>';
  }
  html+='</div>';
  return html;
}
function buildLoadoutSummaryHTML(){
  if(!run||!run.equipped)return '';
  var html='<div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin-top:6px">';
  EQUIP_SLOTS.forEach(function(pos){
    var gear=run.equipped[pos];
    if(!gear)return;
    html+='<div style="background:var(--card);border:1px solid var(--border);border-radius:8px;padding:6px 8px;font-size:0.72em;text-align:center;min-width:80px">';
    html+='<div style="color:#e8e0d0">'+gearIconHTML(gear,{size:18})+gear.name+'</div>';
    html+='<div style="display:flex;gap:2px;justify-content:center;margin-top:3px">';
    gear.materia.forEach(function(m,mi){
      if(mi>0){
        var linked=mi<=gear.links;
        html+='<span style="width:5px;height:2px;display:inline-block;vertical-align:middle;background:'+(linked?'var(--gold)':'#2a2a34')+'"></span>';
      }
      var p=PLANETS[m.planetIdx];
      html+='<span style="color:'+p.col+';font-size:0.9em" title="'+p.name+' Lv'+m.level+'">'+p.sym+'<sub style="font-size:0.65em;opacity:0.5">'+m.level+'</sub></span>';
    });
    for(var e=gear.materia.length;e<gear.sockets;e++){
      html+='<span style="color:#333;font-size:0.9em">○</span>';
    }
    html+='</div></div>';
  });
  html+='</div>';
  return html;
}

// ═══ WIN/LOSS ═══
function checkWin(){
  if(p1.hp<=0){showGameOver();return true}
  if(p2.hp<=0){handleVictory();return true}
  return false;
}
function showGameOver(){
  gamePhase='over';executing=false;
  showScreen('gameOverScreen');
  var rm=ROUND_METALS[run.round-1];
  var progressHTML=buildRoundProgressHTML(run.round,false);
  var loadoutHTML=buildLoadoutSummaryHTML();
  document.getElementById('goStats').innerHTML=
    progressHTML+
    '<div style="margin:12px 0">Fell at <span style="color:'+rm.col+'">'+rm.sym+' '+rm.name+'</span> (Round '+run.round+')</div>'+
    '<div>Rounds survived: <span>'+(run.round-1)+'</span></div>'+
    '<div>Enemies defeated: <span>'+run.killCount+'</span></div>'+
    '<div>Total damage dealt: <span>'+run.totalDamage+'</span></div>'+
    '<div>Quicksilver earned: <span style="color:var(--qs-col)">☿ '+run.quicksilver+'</span></div>'+
    '<div style="margin-top:12px;font-size:0.75em;color:var(--muted)">FINAL LOADOUT</div>'+loadoutHTML;
}
function handleVictory(){
  gamePhase='loot';executing=false;run.killCount++;
  // Award quicksilver
  var qs=10+run.round*5;run.quicksilver+=qs;
  // Sync materia XP back to gear
  syncMateriaToGear();
  showLootScreen(qs);
}
function syncMateriaToGear(){
  // Sync p1's materia levels/xp back into run.equipped — and carry over the
  // `_justLeveled` flag so the post-combat orb display can flash levelup.
  if(!p1||!p1.materia)return;
  var idx=0;
  EQUIP_SLOTS.forEach(function(pos){
    var gear=run.equipped[pos];if(!gear)return;
    gear.materia.forEach(function(m,i){
      if(idx<p1.materia.length){
        m.level=p1.materia[idx].level;
        m.xp=p1.materia[idx].xp;
        if(p1.materia[idx]._justLeveled) m._justLeveled=true;
        idx++;
      }
    });
  });
}

// ═══ LOOT SCREEN ═══
function showLootScreen(qsEarned){
  showScreen('lootScreen');
  var rm=ROUND_METALS[run.round-1];
  document.getElementById('lootHeader').innerHTML='<span style="color:'+rm.col+'">'+rm.sym+'</span> VICTORY — Round '+run.round;
  document.getElementById('lootSub').textContent='The opponent falls. Claim the spoils.';
  document.getElementById('lootQs').textContent='Victory bonus: +'+qsEarned+'☿ (Total: ☿'+run.quicksilver+')';
  // Add opponent gear to laboratory
  var opp=run.currentOpponent;
  var items=document.getElementById('lootItems');items.innerHTML='';
  EQUIP_SLOTS.forEach(function(pos){
    var gear=opp.equipped[pos];if(!gear)return;
    // Remove hidden flags from materia
    gear.materia.forEach(function(m){delete m.hidden});
    run.laboratory.push(JSON.parse(JSON.stringify(gear)));
    var card=document.createElement('div');card.className='loot-card';
    card.innerHTML=gearCardHTML(gear);items.appendChild(card);
  });
  // Button text changes for round 7
  if(run.round>=TOTAL_ROUNDS){
    document.getElementById('lootContinueBtn').textContent='✦ CLAIM VICTORY ✦';
    document.getElementById('lootContinueBtn').onclick=function(){showVictoryScreen()};
  } else {
    document.getElementById('lootContinueBtn').textContent='⚗ ENTER LABORATORY ⚗';
    document.getElementById('lootContinueBtn').onclick=function(){goToLab()};
  }
}

// ═══ LABORATORY ═══
function goToLab(){
  // Generate merchant stock if not already present for this round
  if(!run.merchantStock||run.merchantRound!==run.round){
    run.merchantStock=generateMerchantStock(run.round);
    run.merchantRound=run.round;
  }
  run._labPreview = null;   // any preview from the last visit is stale
  showScreen('labScreen');
  renderLab();
}
// ── Lab Stats Panel ──────────────────────────────────────────────
// Computes the same combat-relevant bonuses the engine would derive at
// battle start from the supplied `equipped` map. Used both for the current
// loadout and the hypothetical "what if I swapped to THIS piece" preview.
function computeLabStats(equipped){
  var d = deriveStats(run.stats);
  var virt = {
    materia: buildFighterMateria(equipped),
    gear: equipped,
    ac: d.ac,
    ward: 0
  };
  var bonus = getMateriaBonus(virt, {range:0});
  return {
    hp: d.hp,
    ac: getFighterAC(virt),
    speed: d.speed,
    toHit: bonus.toHit|0,
    bonusDmg: bonus.bonusDmg|0,
    critRange: bonus.critRange|0,         // best (lowest) crit-on number, 20 = no bonus
    extraRange: bonus.extraRange|0,
    lifesteal: !!bonus.lifesteal,
    lifestealDice: bonus.lifestealDice || '1d4',
    dotBonus: bonus.dotBonus|0,
    attacks: buildAttacksFromMateria(equipped)
  };
}

// Apply a single-slot swap on top of a clone of run.equipped, returning a
// new equipped map. Used to compute preview stats.
function _previewEquippedWith(slot, gear){
  var copy = {};
  EQUIP_SLOTS.forEach(function(p){ copy[p] = run.equipped[p]; });
  copy[slot] = gear;
  return copy;
}

// Resolve which slot a piece of gear should preview into. Hand gear goes
// into the OFF hand if main is filled (so you compare against an empty
// off-hand), otherwise into main. Body/Head/Lower are fixed.
function _previewSlotForGear(gear){
  if (gear.pos === 'Hand'){
    var dom = (run && run.dominantHand) || 'R';
    var main = dom + 'Hand';
    if (!run.equipped[main]) return main;
    var off = (dom === 'R' ? 'LHand' : 'RHand');
    return off;
  }
  // Body slot is the canonical home for body gear; we also use it for any
  // non-hand item whose ladder lives in GEAR_BODY_LADDER (Plate/Mail/Robes/
  // Cloak/Vest). Head and Lower gear go to their own slots.
  if (GEAR_HEAD_LADDER && gear.type in GEAR_HEAD_LADDER) return 'Head';
  if (GEAR_LOWER_LADDER && gear.type in GEAR_LOWER_LADDER) return 'Lower';
  return 'Body';
}

// Format a stat delta number with sign and color class. Returns HTML.
function _statDeltaHTML(diff, opts){
  opts = opts || {};
  if (diff === 0) return '';
  var sign = diff > 0 ? '+' : '';
  var cls = diff > 0 ? 'up' : 'down';
  if (opts.invert){ cls = diff > 0 ? 'down' : 'up'; }   // for crit-range, lower is better
  var txt = sign + diff;
  if (opts.suffix) txt += opts.suffix;
  return '<span class="lab-stat-delta ' + cls + '">' + txt + '</span>';
}

// Render the stats panel. Reads the optional run._labPreview to compute the
// delta column when the player has selected a piece of gear to inspect.
function renderLabStatsPanel(){
  var el = document.getElementById('labStatsPanel');
  if (!el) return;
  var cur = computeLabStats(run.equipped);
  var prev = null;
  var previewBanner = '';
  if (run._labPreview){
    var pg = run._labPreview.gear;
    var pSlot = run._labPreview.slot;
    if (pg && pSlot){
      var hypEquipped = _previewEquippedWith(pSlot, pg);
      prev = computeLabStats(hypEquipped);
      previewBanner = '<div class="lab-preview-banner">'
        + '<div>Preview: <strong>' + pg.name + '</strong> → ' + pSlot.replace('Hand',' Hand') + '</div>'
        + '<button class="lab-preview-clear" onclick="clearLabPreview()">Clear</button>'
        + '</div>';
    }
  }
  function row(label, curVal, prevVal, opts){
    opts = opts || {};
    var diff = (prev && prevVal !== curVal) ? (prevVal - curVal) : 0;
    var display = curVal;
    if (opts.formatter) display = opts.formatter(curVal);
    return '<div class="lab-stat-row"><span class="lab-stat-name">' + label + '</span>'
      + '<span class="lab-stat-val">' + display + _statDeltaHTML(diff, opts) + '</span></div>';
  }
  var statsGrid = '<div class="lab-stats-grid">'
    + row('HP',     cur.hp,         prev?prev.hp:null)
    + row('AC',     cur.ac,         prev?prev.ac:null)
    + row('Speed',  cur.speed,      prev?prev.speed:null)
    + row('To-Hit', '+' + cur.toHit, prev?'+' + prev.toHit:null, {
        formatter: function(v){ return v; }
      })
    + row('Bonus Dmg', '+' + cur.bonusDmg, prev?'+' + prev.bonusDmg:null, {
        formatter: function(v){ return v; }
      })
    + row('Crit On', cur.critRange + '-20', prev?prev.critRange + '-20':null, {
        invert: true,
        formatter: function(v){ return v; }
      })
    + row('Range', '+' + cur.extraRange, prev?'+' + prev.extraRange:null, {
        formatter: function(v){ return v; }
      })
    + row('Lifesteal', cur.lifesteal ? cur.lifestealDice : '—',
                       prev?(prev.lifesteal ? prev.lifestealDice : '—'):null, {
        formatter: function(v){ return v; }
      })
    + row('DOT', '+' + cur.dotBonus, prev?'+' + prev.dotBonus:null, {
        formatter: function(v){ return v; }
      })
    + '</div>';
  // Attack list — annotate adds/removes when previewing.
  var atkHTML = '';
  if (prev){
    var curSet = {}, prevSet = {};
    cur.attacks.forEach(function(a){ curSet[a]=1; });
    prev.attacks.forEach(function(a){ prevSet[a]=1; });
    var all = {};
    cur.attacks.forEach(function(a){ all[a]=1; });
    prev.attacks.forEach(function(a){ all[a]=1; });
    Object.keys(all).forEach(function(a){
      var inCur = !!curSet[a], inPrev = !!prevSet[a];
      var cls = inCur && inPrev ? '' : (inPrev ? 'added' : 'removed');
      atkHTML += '<span class="lab-stats-atk-tag ' + cls + '">' + a + '</span>';
    });
  } else {
    cur.attacks.forEach(function(a){
      atkHTML += '<span class="lab-stats-atk-tag">' + a + '</span>';
    });
  }
  el.innerHTML = '<h3>✦ CURRENT STATS</h3>'
    + statsGrid
    + '<div class="lab-stats-attacks">' + atkHTML + '</div>'
    + previewBanner;
}

// Public preview controls — wired to clicks on storage / merchant cards.
function setLabPreview(source, idx){
  var gear;
  if (source === 'lab')      gear = run.laboratory[idx];
  else if (source === 'shop') gear = (run.merchantStock && run.merchantStock[idx]) ? run.merchantStock[idx].gear : null;
  if (!gear) return;
  // Toggle off if user clicks the same gear again.
  if (run._labPreview && run._labPreview.source === source && run._labPreview.idx === idx){
    clearLabPreview();
    return;
  }
  run._labPreview = { source: source, idx: idx, gear: gear, slot: _previewSlotForGear(gear) };
  renderLab();
}
function clearLabPreview(){
  run._labPreview = null;
  renderLab();
}

function renderLab(){
  document.getElementById('labQs').textContent='☿ '+run.quicksilver;
  // Validate the preview pointer; gear may have moved (sold/equipped) since
  // it was selected. If the item is gone, drop the preview silently.
  if (run._labPreview){
    var pSrc = run._labPreview.source, pIdx = run._labPreview.idx;
    var stillThere = false;
    if (pSrc === 'lab'  && run.laboratory[pIdx]) stillThere = run.laboratory[pIdx] === run._labPreview.gear;
    if (pSrc === 'shop' && run.merchantStock && run.merchantStock[pIdx] && run.merchantStock[pIdx].gear === run._labPreview.gear) stillThere = true;
    if (!stillThere) run._labPreview = null;
  }
  var rm=ROUND_METALS[run.round-1];
  var nextRm=run.round<TOTAL_ROUNDS?ROUND_METALS[run.round]:null;
  document.getElementById('labRoundInfo').innerHTML=
    buildRoundProgressHTML(run.round+1,false)+
    (nextRm?'Next: <span style="color:'+nextRm.col+'">'+nextRm.sym+' '+nextRm.name+'</span> (Round '+(run.round+1)+')':'Final round complete!');
  var hasLoose=run.looseMateria.length>0;

  // ── Stats panel ──
  renderLabStatsPanel();

  // ── Equipped gear section ──
  var eqEl=document.getElementById('labEquipped');
  eqEl.innerHTML='<h3>⚔ EQUIPPED GEAR</h3><div class="lab-gear" id="labEquipGear"></div>';
  var eqGear=document.getElementById('labEquipGear');
  EQUIP_SLOTS.forEach(function(pos){
    var gear=run.equipped[pos];
    var item=document.createElement('div');item.className='lab-gear-item equipped';
    var label;
    var labDom=(run&&run.dominantHand)||'R';
    var labHand=function(p){ return p.charAt(0)===labDom ? 'Main' : 'Off'; };
    if(pos==='Body')label='Body';
    else if(gear&&WEAPON_GEAR_TYPES.indexOf(gear.type)>=0)label='⚔ Weapon · '+labHand(pos);
    else if(gear&&SHIELD_GEAR_TYPES.indexOf(gear.type)>=0)label='🛡 Shield · '+labHand(pos);
    else label=labHand(pos)+' Hand';
    if(gear){
      var hasEmptySockets=gear.materia.length<gear.sockets;
      var canFuse=gear.links<gear.materia.length-1&&gear.materia.length>=2;
      var canRefine=(gear.refinement||0)<MAX_REFINEMENT;
      var canDrill=gear.sockets<MAX_SOCKETS;
      var refineCost=((gear.refinement||0)+1)*3;
      var drillCost=(gear.sockets+1)*5;
      var linkCost=(gear.links+1)*8;
      var actionsHTML='<button class="lab-btn sell" onclick="unequipGear(\''+pos+'\')">Unequip</button>';
      if(canRefine)actionsHTML+='<button class="lab-btn craft" onclick="craftRefine(\'eq\',\''+pos+'\')">🔨 Refine +'+(gear.refinement+1)+' ('+refineCost+'☿ · '+getRefineChance(gear)+'%)</button>';
      if(canDrill)actionsHTML+='<button class="lab-btn craft" onclick="craftDrillSocket(\'eq\',\''+pos+'\')">⛏ Drill Socket ('+drillCost+'☿ · '+getDrillChance(gear)+'%)</button>';
      if(canFuse)actionsHTML+='<button class="lab-btn craft" onclick="craftFuseLink(\''+pos+'\')">⛓ Fuse Link ('+linkCost+'☿ · '+getLinkChance(gear)+'%)</button>';
      if(hasEmptySockets&&hasLoose)actionsHTML+='<button class="lab-btn craft" onclick="showSlotPicker(\'eq\',\''+pos+'\')">Slot (3☿)</button>';
      if(gear.materia.length>0)actionsHTML+='<button class="lab-btn craft" onclick="showEqUnslotPicker(\''+pos+'\')">Unslot (5☿)</button>';
      item.innerHTML='<div class="lab-gear-info">'+gearCardHTML(gear)+
        '<div style="margin-top:3px;font-size:0.7em;color:var(--muted)">'+label+'</div>'+
        '</div><div class="lab-gear-actions">'+actionsHTML+'</div>';
    } else {
      item.innerHTML='<div class="lab-gear-info"><div class="gc-name" style="color:#444">'+label+' — empty</div></div>';
    }
    eqGear.appendChild(item);
  });

  // ── Merchant section ──
  var merchEl=document.getElementById('labMerchant');
  if(run.merchantStock&&run.merchantStock.length>0){
    merchEl.innerHTML='<h3>☿ TRAVELLING MERCHANT</h3><div class="shop-items" id="labShopItems"></div>';
    var shopEl=document.getElementById('labShopItems');
    run.merchantStock.forEach(function(item,i){
      var card=document.createElement('div');
      card.className='shop-item'+(item.sold?' sold':'');
      if(run._labPreview&&run._labPreview.source==='shop'&&run._labPreview.idx===i){
        card.classList.add('lab-card-preview-active');
      }
      var canAfford=run.quicksilver>=item.price;
      if(item.type==='gear'){
        card.innerHTML=gearCardHTML(item.gear)+'<div class="shop-price">'+(canAfford?'':'⚠ ')+'Buy: '+item.price+'☿</div><div class="lab-btn craft" style="margin-top:4px" onclick="event.stopPropagation();setLabPreview(\'shop\','+i+')">👁 Preview Stats</div>';
        card.onclick=function(){if(!item.sold&&canAfford)buyMerchantItem(i)};
      } else if(item.type==='materia'){
        var p=PLANETS[item.materia.planetIdx];
        card.innerHTML='<div class="gc-name" style="color:'+p.col+'">'+p.sym+' '+p.name+' Lv'+item.materia.level+'</div>'+
          '<div class="gc-pos">Loose Materia</div>'+
          '<div class="shop-price">'+(canAfford?'':'⚠ ')+'Buy: '+item.price+'☿</div>';
        card.onclick=function(){if(!item.sold&&canAfford)buyMerchantItem(i)};
      }
      if(!canAfford&&!item.sold)card.style.opacity='0.5';
      shopEl.appendChild(card);
    });
  } else {
    merchEl.innerHTML='';
  }

  // ── Stored gear section ──
  var stEl=document.getElementById('labStored');
  stEl.innerHTML='<h3>📦 STORED GEAR ('+run.laboratory.length+')</h3><div class="lab-gear" id="labStoreGear"></div>';
  var stGear=document.getElementById('labStoreGear');
  if(run.laboratory.length===0){
    stGear.innerHTML='<div style="font-size:0.75em;color:#444;padding:8px">No stored gear.</div>';
  }
  run.laboratory.forEach(function(gear,i){
    var item=document.createElement('div');item.className='lab-gear-item';
    if(run._labPreview&&run._labPreview.source==='lab'&&run._labPreview.idx===i){
      item.classList.add('lab-card-preview-active');
    }
    var sellPrice=gear.sockets*3+gear.links*2+(gear.refinement||0)*2;
    var matVal=0;gear.materia.forEach(function(m){matVal+=m.level*2});
    var sellWithMat=sellPrice+Math.floor(matVal*0.5);
    var canEquip=gear.pos==='Hand'?(!run.equipped.LHand||!run.equipped.RHand):!run.equipped[gear.pos];
    var hasEmptySockets=gear.materia.length<gear.sockets;
    var canRefine=(gear.refinement||0)<MAX_REFINEMENT;
    var canDrill=gear.sockets<MAX_SOCKETS;
    var refineCost=((gear.refinement||0)+1)*3;
    var drillCost=(gear.sockets+1)*5;
    var actionsHTML='';
    if(canEquip)actionsHTML+='<button class="lab-btn equip" onclick="equipFromLab('+i+')">Equip</button>';
    actionsHTML+='<button class="lab-btn sell" onclick="sellGear('+i+')">Sell ('+sellWithMat+'☿)</button>';
    if(canRefine)actionsHTML+='<button class="lab-btn craft" onclick="craftRefine(\'lab\','+i+')">🔨 Refine +'+(gear.refinement+1)+' ('+refineCost+'☿ · '+getRefineChance(gear)+'%)</button>';
    if(canDrill)actionsHTML+='<button class="lab-btn craft" onclick="craftDrillSocket(\'lab\','+i+')">⛏ Drill ('+drillCost+'☿ · '+getDrillChance(gear)+'%)</button>';
    if(gear.materia.length>0)actionsHTML+='<button class="lab-btn craft" onclick="showUnslotPicker('+i+')">Unslot (5☿)</button>';
    if(hasEmptySockets&&hasLoose)actionsHTML+='<button class="lab-btn craft" onclick="showSlotPicker(\'lab\','+i+')">Slot (3☿)</button>';
    var infoHTML='<div class="lab-gear-info" onclick="setLabPreview(\'lab\','+i+')" style="cursor:pointer" title="Click to preview stats with this gear">'+gearCardHTML(gear)+'</div>';
    item.innerHTML=infoHTML+
      '<div class="lab-gear-actions">'+actionsHTML+'</div>';
    stGear.appendChild(item);
  });

  // ── Loose materia section ──
  var matEl=document.getElementById('labLooseMateria');
  if(run.looseMateria.length>0){
    matEl.innerHTML='<h3>✧ LOOSE MATERIA ('+run.looseMateria.length+')</h3><div class="lab-materia" id="labMatList"></div>';
    var matList=document.getElementById('labMatList');
    run.looseMateria.forEach(function(m,i){
      var p=PLANETS[m.planetIdx];
      var canLevel=m.level<MATERIA_MAX_LVL;
      var lvlCost=(m.level+1)*4;
      var xpPct=canLevel?Math.round((m.xp/matXpNeeded(m.level))*100):100;
      var item=document.createElement('div');item.className='lab-mat-item';
      item.style.cursor='pointer';
      item.innerHTML='<div class="mat-sym">'+materiaOrbHTML(m.planetIdx, m.level, {size:36, xp:m.xp||0})+'</div>'+
        '<div class="mat-name" onclick="showMatDetail('+m.planetIdx+','+m.level+','+(m.xp||0)+')">'+p.name+' Lv'+m.level+'</div>'+
        '<div style="font-size:0.65em;color:#555">'+p.bonusDesc+'</div>'+
        (canLevel?'<div style="height:3px;background:#1a1a24;border-radius:2px;margin:2px 0"><div style="height:100%;width:'+xpPct+'%;background:'+p.col+';border-radius:2px"></div></div>':'')+
        (canLevel?'<div class="mat-sell" style="color:var(--qs-col)" onclick="event.stopPropagation();craftLevel('+i+')">Level ('+lvlCost+'☿)</div>':'')+
        '<div class="mat-sell" onclick="event.stopPropagation();sellMateria('+i+')">Sell ('+(m.level*2)+'☿)</div>';
      matList.appendChild(item);
    });
  } else {
    matEl.innerHTML='';
  }

  // ── Materia Dust section ──
  // Failed slot attempts leave a pile of dust per planet. Spend dust to
  // reform a fresh Lv1 materia of the matching planet — no Quicksilver cost
  // (dust IS the material) and always succeeds.
  var dustEl=document.getElementById('labMateriaDust');
  if(dustEl){
    var dustEntries=[];
    if(run.materiaDust){
      for(var pi=0;pi<PLANETS.length;pi++){
        var n=run.materiaDust[pi]|0;
        if(n>0) dustEntries.push({planetIdx:pi, count:n});
      }
    }
    if(dustEntries.length>0){
      var dustHTML='<h3>✦ MATERIA DUST</h3><div style="font-size:0.7em;color:var(--dim);margin-bottom:6px">Reform '+MATERIA_DUST_COST+' dust → fresh Lv1 materia of that planet.</div><div class="lab-materia" id="labDustList"></div>';
      dustEl.innerHTML=dustHTML;
      var dustList=document.getElementById('labDustList');
      dustEntries.forEach(function(entry){
        var p=PLANETS[entry.planetIdx];
        var canReform=entry.count>=MATERIA_DUST_COST;
        var color=PLANET_TO_ORB_COLOR[entry.planetIdx]||'blue';
        var item=document.createElement('div');item.className='lab-mat-item';
        // Use a "dust pile" frame as the visual.
        item.innerHTML='<div class="mat-sym">'
          +'<span class="materia-orb-wrap"><canvas class="materia-orb-pix" width="48" height="48" data-orb-color="'+color+'" data-orb-anim="dust" data-orb-frame="0" style="width:36px;height:36px;image-rendering:pixelated"></canvas></span>'
          +'</div>'
          +'<div class="mat-name">'+p.name+' Dust</div>'
          +'<div style="font-size:0.7em;color:#aaa">'+entry.count+' / '+MATERIA_DUST_COST+'</div>'
          +(canReform
              ?'<div class="mat-sell" style="color:var(--gold)" onclick="reformMateria('+entry.planetIdx+')">Reform Lv1</div>'
              :'<div class="mat-sell" style="color:var(--dim);cursor:default">Need '+(MATERIA_DUST_COST-entry.count)+' more</div>');
        dustList.appendChild(item);
      });
    } else {
      dustEl.innerHTML='';
    }
  }

  // ── Confirm button ──
  var totalS=0;var allFilled=true;var emptySlots=[];
  EQUIP_SLOTS.forEach(function(pos){
    var g=run.equipped[pos];
    if(g)totalS+=g.sockets;
    else{allFilled=false;emptySlots.push(pos==='LHand'?'Left':pos==='RHand'?'Right':pos)}
  });
  var btn=document.getElementById('labConfirmBtn');
  var statusEl=document.querySelector('.lab-confirm-btn');
  if(allFilled){
    btn.disabled=false;btn.style.opacity='1';
    btn.textContent='⚔ CONFIRM & FIGHT ROUND '+(run.round+1)+' ⚔';
  } else {
    btn.disabled=true;btn.style.opacity='0.4';
    btn.textContent='⚔ CONFIRM LOADOUT ⚔';
    var hint=document.createElement('div');
    hint.style.cssText='font-size:0.72em;color:var(--dim);margin-top:4px;text-align:center';
    hint.textContent='Empty slot'+(emptySlots.length>1?'s':'')+': '+emptySlots.join(', ');
    statusEl.appendChild(hint);
  }
}

function unequipGear(pos){
  var gear=run.equipped[pos];if(!gear)return;
  run.laboratory.push(gear);run.equipped[pos]=null;renderLab();
}
function equipFromLab(idx){
  var gear=run.laboratory[idx];if(!gear)return;
  if(gear.pos==='Hand'){
    // Put in first available hand slot, or swap with LHand
    if(!run.equipped.LHand){run.equipped.LHand=gear}
    else if(!run.equipped.RHand){run.equipped.RHand=gear}
    else{run.laboratory.push(run.equipped.LHand);run.equipped.LHand=gear}
  } else {
    if(run.equipped[gear.pos])run.laboratory.push(run.equipped[gear.pos]);
    run.equipped[gear.pos]=gear;
  }
  run.laboratory.splice(idx,1);
  renderLab();
}
function sellGear(idx){
  var gear=run.laboratory[idx];if(!gear)return;
  var price=gear.sockets*3+gear.links*2+(gear.refinement||0)*2;
  var matVal=0;gear.materia.forEach(function(m){matVal+=m.level*2});
  price+=Math.floor(matVal*0.5);
  run.quicksilver+=price;
  run.laboratory.splice(idx,1);
  renderLab();
}
function sellMateria(idx){
  var m=run.looseMateria[idx];if(!m)return;
  run.quicksilver+=m.level*2;
  run.looseMateria.splice(idx,1);
  renderLab();
}

// ═══ MERCHANT ═══
function generateMerchantStock(round){
  var stock=[];
  var itemCount=randInt(4,6);
  var handTypes=GEAR_TYPES.filter(function(g){return g.pos==='Hand'});
  var bodyTypes=GEAR_TYPES.filter(function(g){return g.pos==='Body'});
  for(var i=0;i<itemCount;i++){
    if(Math.random()<0.55){
      // Gear item
      var gear=generateGearPieceOfType(pick(Math.random()<0.6?handTypes:bodyTypes),Math.min(7,round+1));
      var price=gear.sockets*5+gear.links*3;
      gear.materia.forEach(function(m){price+=m.level*3});
      price=Math.max(8,price+randInt(-3,5));
      stock.push({type:'gear',gear:gear,price:price,sold:false});
    } else {
      // Loose materia
      var pIdx=randInt(0,PLANETS.length-1);
      var lvl=round<=2?1:randInt(1,Math.min(3,Math.ceil(round/2)));
      var price2=lvl*5+randInt(0,3);
      stock.push({type:'materia',materia:{planetIdx:pIdx,level:lvl,xp:0},price:price2,sold:false});
    }
  }
  return stock;
}

function buyMerchantItem(idx){
  var item=run.merchantStock[idx];if(!item||item.sold)return;
  if(run.quicksilver<item.price)return;
  run.quicksilver-=item.price;
  item.sold=true;
  if(item.type==='gear'){
    run.laboratory.push(JSON.parse(JSON.stringify(item.gear)));
  } else if(item.type==='materia'){
    run.looseMateria.push(JSON.parse(JSON.stringify(item.materia)));
  }
  renderLab();
}

// ═══ CRAFTING ═══

// ── Percentage-based craft overlay for blacksmithing ──
function showSmithOverlay(title,desc,cost,chance,stressed,smithFn){
  var ov=document.getElementById('craftOverlay');
  var panel=document.getElementById('craftPanel');
  var stressWarning=stressed?'<div style="color:#ef4444;font-weight:bold;margin:6px 0;font-size:0.85em">⚠ STRESSED — Failure will DESTROY this gear permanently!</div>':'';
  panel.innerHTML='<h3>🔨 '+title+'</h3><div class="craft-desc">'+desc+'</div>'+
    '<div class="craft-cost">Cost: '+cost+'</div>'+
    '<div style="font-size:1.2em;margin:8px 0;color:'+(chance>=60?'#4ade80':chance>=30?'#f59e0b':'#ef4444')+'">'+chance+'% success</div>'+
    stressWarning+
    '<div class="craft-btns"><button onclick="cancelCraft()" style="border-color:var(--dim);color:var(--dim)">Cancel</button>'+
    '<button onclick="execCraft()" style="border-color:var(--gold);color:var(--gold)">⚒ Hammer</button></div>'+
    '<div class="craft-result" id="craftResult" style="display:none"></div>';
  ov.classList.add('show');
  window._craftFn=smithFn;
}

// ── REFINE: increase physical power ──
function craftRefine(source,idx){
  var gear;
  if(source==='eq')gear=run.equipped[idx];
  else gear=run.laboratory[idx];
  if(!gear)return;
  if((gear.refinement||0)>=MAX_REFINEMENT){alert('Already at maximum refinement.');return}
  var cost=(gear.refinement+1)*3;
  if(run.quicksilver<cost){alert('Not enough Quicksilver (need '+cost+'☿)');return}
  var chance=getRefineChance(gear);
  var cur=gear.refinement||0;
  var bonusType=gear.pos==='Hand'?'damage':'AC';
  showSmithOverlay(
    'Refine +'+cur+' → +'+(cur+1),
    gear.name+' — physical '+bonusType+' increase',
    cost+'☿',chance,gear.stressed,
    function(){
      run.quicksilver-=cost;
      var roll=Math.floor(Math.random()*100)+1;
      if(roll<=chance){
        gear.refinement=cur+1;
        return{success:true,msg:'Roll: '+roll+' ≤ '+chance+'% — Refined to +'+gear.refinement+'!'};
      }
      // Failure
      if(gear.stressed){
        // Destroy the gear
        if(source==='eq'){run.equipped[idx]=null}
        else{run.laboratory.splice(idx,1)}
        return{success:false,crit:true,msg:'Roll: '+roll+' > '+chance+'% — The '+gear.name+' shatters. Permanently destroyed.'};
      }
      gear.stressed=true;
      return{success:false,msg:'Roll: '+roll+' > '+chance+'% — Failed. Gear is now STRESSED.'};
    }
  );
}

// ── DRILL: add a new socket ──
function craftDrillSocket(source,idx){
  var gear;
  if(source==='eq')gear=run.equipped[idx];
  else gear=run.laboratory[idx];
  if(!gear)return;
  if(gear.sockets>=MAX_SOCKETS){alert('Maximum sockets reached.');return}
  var cost=(gear.sockets+1)*5;
  if(run.quicksilver<cost){alert('Not enough Quicksilver (need '+cost+'☿)');return}
  var chance=getDrillChance(gear);
  showSmithOverlay(
    'Drill Socket ('+gear.sockets+' → '+(gear.sockets+1)+')',
    gear.name+' — add an empty materia socket',
    cost+'☿',chance,gear.stressed,
    function(){
      run.quicksilver-=cost;
      var roll=Math.floor(Math.random()*100)+1;
      if(roll<=chance){
        gear.sockets++;
        return{success:true,msg:'Roll: '+roll+' ≤ '+chance+'% — Socket drilled! ('+gear.sockets+' sockets)'};
      }
      if(gear.stressed){
        if(source==='eq'){run.equipped[idx]=null}
        else{run.laboratory.splice(idx,1)}
        return{success:false,crit:true,msg:'Roll: '+roll+' > '+chance+'% — The '+gear.name+' cracks apart. Permanently destroyed.'};
      }
      gear.stressed=true;
      return{success:false,msg:'Roll: '+roll+' > '+chance+'% — Failed. Gear is now STRESSED.'};
    }
  );
}

// ── FUSE LINK: forge connection between adjacent materia ──
function craftFuseLink(pos){
  var gear=run.equipped[pos];if(!gear)return;
  var nextLink=gear.links;
  if(nextLink>=gear.materia.length-1){alert('No more adjacent pairs to link.');return}
  var cost=(gear.links+1)*8;
  if(run.quicksilver<cost){alert('Not enough Quicksilver (need '+cost+'☿)');return}
  var m1=gear.materia[nextLink],m2=gear.materia[nextLink+1];
  if(!m1||!m2){alert('Both sockets must be filled to forge a link.');return}
  var chance=getLinkChance(gear);
  showSmithOverlay(
    'Fuse Link ('+gear.links+' → '+(gear.links+1)+')',
    'Linking '+PLANETS[m1.planetIdx].name+' ↔ '+PLANETS[m2.planetIdx].name+' in '+gear.name,
    cost+'☿',chance,gear.stressed,
    function(){
      run.quicksilver-=cost;
      var roll=Math.floor(Math.random()*100)+1;
      if(roll<=chance){
        gear.links++;
        return{success:true,msg:'Roll: '+roll+' ≤ '+chance+'% — Link forged! ('+gear.links+' links)'};
      }
      if(gear.stressed){
        run.equipped[pos]=null;
        return{success:false,crit:true,msg:'Roll: '+roll+' > '+chance+'% — The '+gear.name+' is destroyed.'};
      }
      gear.stressed=true;
      return{success:false,msg:'Roll: '+roll+' > '+chance+'% — Failed. Gear is now STRESSED.'};
    }
  );
}

function craftUnslot(source,idx,matIdx){
  // source: 'lab' or 'eq', idx: gear index in lab or pos string for equipped
  var gear;
  if(source==='lab'){gear=run.laboratory[idx]}
  else{gear=run.equipped[idx]}
  if(!gear||!gear.materia[matIdx])return;
  if(run.quicksilver<5){alert('Not enough Quicksilver (need 5☿)');return}
  var m=gear.materia[matIdx];
  var dc=8+m.level*2;
  showCraftOverlay('Unslot Materia','Extracting '+PLANETS[m.planetIdx].name+' Lv'+m.level+' from '+gear.name,'5☿',dc,function(){
    run.quicksilver-=5;
    var roll=Math.floor(Math.random()*20)+1;
    if(roll===1){
      // Crit fail: materia destroyed, socket intact
      gear.materia.splice(matIdx,1);
      // Fix links: cap at materia.length-1
      gear.links=Math.min(gear.links,Math.max(0,gear.materia.length-1));
      return{success:false,crit:true,msg:'NAT 1! '+PLANETS[m.planetIdx].name+' Lv'+m.level+' DESTROYED. Nothing recovered.'};
    }
    if(roll>=dc){
      // Success: extract intact
      gear.materia.splice(matIdx,1);
      gear.links=Math.min(gear.links,Math.max(0,gear.materia.length-1));
      run.looseMateria.push({planetIdx:m.planetIdx,level:m.level,xp:m.xp});
      return{success:true,msg:'Roll: '+roll+' vs DC '+dc+' — Extracted '+PLANETS[m.planetIdx].name+' Lv'+m.level+' intact!'};
    }
    // Normal fail: fracture into N × Lv1
    var fracCount=m.level;
    gear.materia.splice(matIdx,1);
    gear.links=Math.min(gear.links,Math.max(0,gear.materia.length-1));
    for(var i=0;i<fracCount;i++)run.looseMateria.push({planetIdx:m.planetIdx,level:1,xp:0});
    return{success:false,msg:'Roll: '+roll+' vs DC '+dc+' — Fractured into '+fracCount+'× Lv1 '+PLANETS[m.planetIdx].name+'.'};
  });
}

function craftSlot(source,idx,looseIdx){
  // Slot a loose materia into an empty socket on gear
  var gear;
  if(source==='lab'){gear=run.laboratory[idx]}
  else{gear=run.equipped[idx]}
  if(!gear)return;
  if(gear.materia.length>=gear.sockets){alert('No empty sockets on this gear.');return}
  if(run.quicksilver<3){alert('Not enough Quicksilver (need 3☿)');return}
  var m=run.looseMateria[looseIdx];if(!m)return;
  var dc=8;
  showCraftOverlay('Slot Materia','Inserting '+PLANETS[m.planetIdx].name+' Lv'+m.level+' into '+gear.name,'3☿',dc,function(){
    run.quicksilver-=3;
    var roll=Math.floor(Math.random()*20)+1;
    if(roll>=dc){
      gear.materia.push({planetIdx:m.planetIdx,level:m.level,xp:m.xp});
      run.looseMateria.splice(looseIdx,1);
      _playOrbAnimInResult('levelup', m.planetIdx);
      return{success:true,msg:'Roll: '+roll+' vs DC '+dc+' — '+PLANETS[m.planetIdx].name+' socketed!'};
    }
    // Any failure crumbles the orb to dust. Dust granules = max(1, level).
    var dustAmt=Math.max(1, m.level|0);
    run.materiaDust[m.planetIdx]=(run.materiaDust[m.planetIdx]||0)+dustAmt;
    run.looseMateria.splice(looseIdx,1);
    _playOrbAnimInResult('crumble', m.planetIdx);
    var critTag = (roll===1) ? 'NAT 1! ' : '';
    return{success:false,crit:(roll===1),msg:critTag+'Roll: '+roll+' vs DC '+dc+' — '+PLANETS[m.planetIdx].name+' shattered into '+dustAmt+' dust.'};
  });
}

// Play a one-shot orb animation inside the craft result row. Used by the
// slot/level paths to show what happened to the orb. Looks for a placeholder
// `<div id="craftResultOrb"></div>` inside craftResult and replaces it.
function _playOrbAnimInResult(animKey, planetIdx){
  setTimeout(function(){
    var holder=document.getElementById('craftResultOrb');
    if(!holder)return;
    var color=PLANET_TO_ORB_COLOR[planetIdx]||'blue';
    var seq=ORB_FRAMES[animKey]||ORB_FRAMES.idle;
    holder.innerHTML='<canvas class="materia-orb-pix" width="48" height="48" '
      +'data-orb-color="'+color+'" data-orb-anim="'+animKey+'" data-orb-frame="0" '
      +'style="width:64px;height:64px;image-rendering:pixelated"></canvas>';
    var cv=holder.querySelector('canvas');
    var frame=0;
    var iv=setInterval(function(){
      if(!cv.isConnected){clearInterval(iv);return}
      frame++;
      if(frame>=seq.length){
        clearInterval(iv);
        if(animKey==='crumble'){
          // End on the dust pile, replacing the cracked-orb frame
          cv.setAttribute('data-orb-anim','dust');
        } else {
          cv.setAttribute('data-orb-frame', String(seq.length-1));
        }
        renderOneOrb(cv);
        return;
      }
      cv.setAttribute('data-orb-frame', String(frame));
      renderOneOrb(cv);
    }, 180);
  },20);
}

// Reform Materia Dust → fresh Lv1 orb of the same planet. No d20 roll —
// the dust IS the material, so the only gate is having MATERIA_DUST_COST
// granules of the chosen planet.
function reformMateria(planetIdx){
  if(!run||!run.materiaDust)return;
  var have=run.materiaDust[planetIdx]|0;
  if(have<MATERIA_DUST_COST){alert('Not enough dust (need '+MATERIA_DUST_COST+').');return}
  run.materiaDust[planetIdx]=have-MATERIA_DUST_COST;
  if(run.materiaDust[planetIdx]<=0) delete run.materiaDust[planetIdx];
  run.looseMateria.push({planetIdx:planetIdx, level:1, xp:0});
  renderLab();
}

function craftLevel(looseIdx){
  // Level up a loose materia
  var m=run.looseMateria[looseIdx];if(!m)return;
  if(m.level>=MATERIA_MAX_LVL){alert('Already max level.');return}
  var targetLvl=m.level+1;
  var cost=targetLvl*4;
  if(run.quicksilver<cost){alert('Not enough Quicksilver (need '+cost+'☿)');return}
  var dc=10+m.level;
  showCraftOverlay('Level Materia','Refining '+PLANETS[m.planetIdx].name+' Lv'+m.level+' → Lv'+targetLvl,cost+'☿',dc,function(){
    run.quicksilver-=cost;
    var roll=Math.floor(Math.random()*20)+1;
    if(roll===1){
      m.level=Math.max(1,m.level-1);
      _playOrbAnimInResult('crumble', m.planetIdx);
      return{success:false,crit:true,msg:'NAT 1! Purification reversed — dropped to Lv'+m.level+'.'};
    }
    if(roll>=dc){
      m.level=targetLvl;
      _playOrbAnimInResult('levelup', m.planetIdx);
      return{success:true,msg:'Roll: '+roll+' vs DC '+dc+' — Ascended to Lv'+targetLvl+'!'};
    }
    _playOrbAnimInResult('idle', m.planetIdx);
    return{success:false,msg:'Roll: '+roll+' vs DC '+dc+' — Transmutation didn\'t take. Quicksilver wasted.'};
  });
}

function showCraftOverlay(title,desc,cost,dc,craftFn){
  var ov=document.getElementById('craftOverlay');
  var panel=document.getElementById('craftPanel');
  panel.innerHTML='<h3>'+title+'</h3><div class="craft-desc">'+desc+'</div>'+
    '<div class="craft-cost">Cost: '+cost+'</div><div class="craft-dc">DC '+dc+'</div>'+
    '<div class="craft-btns"><button onclick="cancelCraft()" style="border-color:var(--dim);color:var(--dim)">Cancel</button>'+
    '<button onclick="execCraft()" style="border-color:var(--gold);color:var(--gold)">Roll d20</button></div>'+
    '<div class="craft-result" id="craftResult" style="display:none"></div>';
  ov.classList.add('show');
  window._craftFn=craftFn;
}
function cancelCraft(){document.getElementById('craftOverlay').classList.remove('show');window._craftFn=null}
function execCraft(){
  if(!window._craftFn)return;
  var result=window._craftFn();window._craftFn=null;
  var el=document.getElementById('craftResult');
  el.style.display='block';el.className='craft-result '+(result.success?'success':'fail');
  // Render the message above an orb placeholder. _playOrbAnimInResult fills
  // the placeholder via setTimeout so it picks up the just-mounted DOM node.
  el.innerHTML='<div style="text-align:center"><div id="craftResultOrb" style="margin:6px auto 4px;height:64px;display:flex;align-items:center;justify-content:center"></div><div>'+result.msg+'</div></div>';
  // Replace buttons with close
  var btns=document.querySelector('.craft-btns');
  btns.innerHTML='<button onclick="closeCraft()" style="border-color:var(--gold);color:var(--gold)">Close</button>';
}
function closeCraft(){document.getElementById('craftOverlay').classList.remove('show');renderLab()}

function showUnslotPicker(labIdx){
  var gear=run.laboratory[labIdx];if(!gear||gear.materia.length===0)return;
  var ov=document.getElementById('craftOverlay');
  var panel=document.getElementById('craftPanel');
  var html='<h3>Unslot Materia</h3><div class="craft-desc">Choose materia to extract from '+gear.name+' (5☿)</div>';
  html+='<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin:10px 0">';
  gear.materia.forEach(function(m,mi){
    var p=PLANETS[m.planetIdx];
    var dc=8+m.level*2;
    html+='<div style="text-align:center;cursor:pointer;padding:6px 8px;border:1px solid '+p.col+'40;border-radius:8px;background:rgba(255,255,255,0.02)" onclick="cancelCraft();craftUnslot(\'lab\','+labIdx+','+mi+')">';
    html+='<div>'+materiaOrbHTML(m.planetIdx, m.level, {size:32, click:false})+'</div>';
    html+='<div style="font-size:0.7em;color:var(--dim)">'+p.name+' Lv'+m.level+'</div>';
    html+='<div style="font-size:0.6em;color:var(--muted)">DC '+dc+'</div>';
    html+='</div>';
  });
  html+='</div>';
  html+='<div class="craft-btns"><button onclick="cancelCraft()" style="border-color:var(--dim);color:var(--dim)">Cancel</button></div>';
  panel.innerHTML=html;
  ov.classList.add('show');
}

function showSlotPicker(source,idx){
  // Show loose materia list to pick from
  var gear;
  if(source==='lab')gear=run.laboratory[idx];
  else gear=run.equipped[idx];
  if(!gear||gear.materia.length>=gear.sockets)return;
  var ov=document.getElementById('craftOverlay');
  var panel=document.getElementById('craftPanel');
  var html='<h3>Slot Materia</h3><div class="craft-desc">Choose materia to insert into '+gear.name+' (3☿, DC 8)</div>';
  html+='<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin:10px 0">';
  run.looseMateria.forEach(function(m,mi){
    var p=PLANETS[m.planetIdx];
    html+='<div style="text-align:center;cursor:pointer;padding:6px 8px;border:1px solid '+p.col+'40;border-radius:8px;background:rgba(255,255,255,0.02)" onclick="cancelCraft();craftSlot(\''+source+'\',\''+idx+'\','+mi+')">';
    html+='<div>'+materiaOrbHTML(m.planetIdx, m.level, {size:32, click:false})+'</div>';
    html+='<div style="font-size:0.7em;color:var(--dim)">'+p.name+' Lv'+m.level+'</div>';
    html+='</div>';
  });
  html+='</div>';
  html+='<div class="craft-btns"><button onclick="cancelCraft()" style="border-color:var(--dim);color:var(--dim)">Cancel</button></div>';
  panel.innerHTML=html;
  ov.classList.add('show');
}

function showEqUnslotPicker(pos){
  var gear=run.equipped[pos];if(!gear||gear.materia.length===0)return;
  var ov=document.getElementById('craftOverlay');
  var panel=document.getElementById('craftPanel');
  var html='<h3>Unslot Materia</h3><div class="craft-desc">Choose materia to extract from '+gear.name+' (5☿)</div>';
  html+='<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin:10px 0">';
  gear.materia.forEach(function(m,mi){
    var p=PLANETS[m.planetIdx];
    var dc=8+m.level*2;
    html+='<div style="text-align:center;cursor:pointer;padding:6px 8px;border:1px solid '+p.col+'40;border-radius:8px;background:rgba(255,255,255,0.02)" onclick="cancelCraft();craftUnslot(\'eq\',\''+pos+'\','+mi+')">';
    html+='<div>'+materiaOrbHTML(m.planetIdx, m.level, {size:32, click:false})+'</div>';
    html+='<div style="font-size:0.7em;color:var(--dim)">'+p.name+' Lv'+m.level+'</div>';
    html+='<div style="font-size:0.6em;color:var(--muted)">DC '+dc+'</div>';
    html+='</div>';
  });
  html+='</div>';
  html+='<div class="craft-btns"><button onclick="cancelCraft()" style="border-color:var(--dim);color:var(--dim)">Cancel</button></div>';
  panel.innerHTML=html;
  ov.classList.add('show');
}

// ═══ CONFIRM LOADOUT ═══
function confirmLoadout(){
  var allFilled = EQUIP_SLOTS.every(function(s){ return !!run.equipped[s]; });
  if(!allFilled){alert('Fill all three gear slots before proceeding.');return}
  run.round++;
  if(run.round>TOTAL_ROUNDS){showVictoryScreen();return}
  if (run.mode === 'action') startActionArena();
  else startVS();
}
function forfeitRun(){
  if(!confirm('Abandon this run? All progress will be lost.'))return;
  showGameOver();
}

// ═══ VICTORY ═══
function showVictoryScreen(){
  showScreen('victoryScreen');
  var progressHTML=buildRoundProgressHTML(8,true);
  var loadoutHTML=buildLoadoutSummaryHTML();
  document.getElementById('vicStats').innerHTML=
    progressHTML+
    '<div style="margin:8px 0">The Magnum Opus is achieved.</div>'+
    '<div>Enemies defeated: <span>'+run.killCount+'</span></div>'+
    '<div>Total damage dealt: <span>'+run.totalDamage+'</span></div>'+
    '<div>Quicksilver earned: <span style="color:var(--qs-col)">☿ '+run.quicksilver+'</span></div>'+
    '<div style="margin-top:12px;font-size:0.75em;color:var(--muted)">FINAL LOADOUT</div>'+loadoutHTML;
  document.getElementById('champNameInput').value='';
}
function saveChampion(){
  var name=document.getElementById('champNameInput').value.trim()||'Unnamed Alchemist';
  var champ={
    name:name,
    stats:JSON.parse(JSON.stringify(run.stats)),
    derived:JSON.parse(JSON.stringify(run.derived)),
    bodyType:run.bodyType,
    appearanceSeed:run.appearanceSeed,
    appearance:run.appearance?JSON.parse(JSON.stringify(run.appearance)):null,
    gear:{
      Head:run.equipped.Head?JSON.parse(JSON.stringify(run.equipped.Head)):null,
      LHand:run.equipped.LHand?JSON.parse(JSON.stringify(run.equipped.LHand)):null,
      Body:run.equipped.Body?JSON.parse(JSON.stringify(run.equipped.Body)):null,
      RHand:run.equipped.RHand?JSON.parse(JSON.stringify(run.equipped.RHand)):null,
      Lower:run.equipped.Lower?JSON.parse(JSON.stringify(run.equipped.Lower)):null
    },
    meta:{
      quicksilverEarned:run.quicksilver,
      damageDealt:run.totalDamage,
      dateCompleted:new Date().toISOString().split('T')[0]
    }
  };
  var pantheon=loadPantheon();pantheon.push(champ);savePantheon(pantheon);
  showPantheon();
}

// ═══ PANTHEON ═══
function loadPantheon(){
  try{return JSON.parse(localStorage.getItem('crucible_pantheon')||'[]')}catch(e){return[]}
}
function savePantheon(p){
  try{localStorage.setItem('crucible_pantheon',JSON.stringify(p))}catch(e){}
}
function showPantheon(){
  showScreen('pantheonScreen');
  var list=document.getElementById('pantheonList');list.innerHTML='';
  var champs=loadPantheon();
  if(champs.length===0){list.innerHTML='<div class="pantheon-empty">No champions yet. Complete the Athanor to save your first.</div>';return}
  champs.forEach(function(c,i){
    var card=document.createElement('div');card.className='pantheon-card';
    var cvId='panthCv_'+i;
    // Build gear socket display
    var gearHTML='';
    EQUIP_SLOTS.forEach(function(pos){
      var g=c.gear[pos];if(!g)return;
      gearHTML+='<span style="display:inline-flex;align-items:center;gap:1px;margin-right:4px">';
      gearHTML+='<span style="font-size:0.85em">'+gearIconHTML(g,{size:16,slot:pos})+'</span>';
      g.materia.forEach(function(m,mi){
        if(mi>0&&mi<=g.links)gearHTML+='<span style="width:4px;height:2px;display:inline-block;background:var(--gold)"></span>';
        else if(mi>0)gearHTML+='<span style="width:4px;height:2px;display:inline-block;background:#2a2a34"></span>';
        var p=PLANETS[m.planetIdx];
        gearHTML+='<span style="color:'+p.col+';font-size:0.75em">'+p.sym+'</span>';
      });
      gearHTML+='</span>';
    });
    card.innerHTML='<canvas id="'+cvId+'" width="60" height="55" style="width:60px;height:55px"></canvas>'+
      '<div class="pc-info"><div class="pc-name">'+c.name+'</div>'+
      '<div class="pc-stats">HP '+c.derived.hp+' | AC '+c.derived.ac+' | STR '+c.stats.STR+' DEX '+c.stats.DEX+' CON '+c.stats.CON+' INT '+c.stats.INT+'</div>'+
      '<div class="pc-gear">'+gearHTML+'</div>'+
      '<div class="pc-meta">☿ '+c.meta.quicksilverEarned+' | '+c.meta.damageDealt+' dmg | '+c.meta.dateCompleted+
      ' <span style="color:var(--danger);cursor:pointer;margin-left:6px" onclick="deleteChampion('+i+')">[delete]</span></div></div>';
    list.appendChild(card);
    setTimeout(function(){var cv=document.getElementById(cvId);if(cv)renderSpriteStatic(cv,c.bodyType,Math.PI*0.25,'idle',0,c)},50);
  });
}
function deleteChampion(idx){
  if(!confirm('Delete this champion? This cannot be undone.'))return;
  var pantheon=loadPantheon();pantheon.splice(idx,1);savePantheon(pantheon);showPantheon();
}
function championToOpponent(champ){
  return{
    name:champ.name,stats:JSON.parse(JSON.stringify(champ.stats)),
    derived:JSON.parse(JSON.stringify(champ.derived)),
    bodyType:champ.bodyType,
    appearanceSeed:champ.appearanceSeed,
    appearance:champ.appearance?JSON.parse(JSON.stringify(champ.appearance)):null,
    equipped:JSON.parse(JSON.stringify(champ.gear))
  };
}

// ═══ TITLE ═══
function returnToTitle(){
  showScreen('titleScreen');updateTitlePreview();
}
function updateTitlePreview(){
  var el=document.getElementById('titlePantheonPreview');
  var champs=loadPantheon();
  if(champs.length===0){el.innerHTML='';return}
  el.innerHTML='<div style="margin-bottom:4px">'+champs.length+' champion'+(champs.length>1?'s':'')+' in the Pantheon</div>';
  champs.slice(-3).forEach(function(c){
    el.innerHTML+='<div class="champ"><span style="color:var(--gold)">'+c.name+'</span> — HP '+c.derived.hp+' | ☿ '+c.meta.quicksilverEarned+'</div>';
  });
}

// ═══ LOG ═══
function logMsg(msg,cls){
  var el=document.getElementById('log');
  var d=document.createElement('div');d.className='log-entry'+(cls?' '+cls:'');d.textContent=msg;
  el.prepend(d);while(el.children.length>60)el.removeChild(el.lastChild);
}
function renderAll(){updateHUD();updateStatSheet();renderGrid();updateMoveQueueUI()}

// ═══ MATERIA DETAIL VIEW ═══
function showMatDetail(planetIdx,level,xp){
  var p=PLANETS[planetIdx];
  var needed=matXpNeeded(level);
  var xpPct=level>=MATERIA_MAX_LVL?100:Math.round((xp/needed)*100);
  // Describe the bonus at this level
  var bonusText='';
  var lvl=level;
  if(p.bonus==='defense')bonusText='Passive: <span style="color:'+p.col+'">+'+Math.min(lvl+1,3)+' AC</span> when in hand slot, <span style="color:'+p.col+'">+'+Math.min(lvl,2)+' AC</span> when in body slot.';
  else if(p.bonus==='accuracy')bonusText='Attack: <span style="color:'+p.col+'">+'+Math.min(lvl+1,3)+' to hit</span> on all attacks.';
  else if(p.bonus==='damage')bonusText='Attack: <span style="color:'+p.col+'">+'+Math.min(lvl+1,3)+' bonus damage</span> on all attacks.';
  else if(p.bonus==='crit')bonusText='Attack: <span style="color:'+p.col+'">Crit range '+(21-Math.min(lvl,3))+'-20</span> on all attacks.';
  else if(p.bonus==='range')bonusText='Attack: <span style="color:'+p.col+'">+'+Math.min(lvl,2)+' range</span> on ranged attacks.';
  else if(p.bonus==='lifesteal')bonusText='Attack: <span style="color:'+p.col+'">Heal 1d4 HP</span> on hit.';
  else if(p.bonus==='dot')bonusText='Attack: <span style="color:'+p.col+'">+'+Math.min(lvl,2)+' DOT turns</span> on Putrefaction attacks.';
  // Compound info
  var compText='';
  COMPOUNDS.forEach(function(c){
    if(c.a===planetIdx||c.b===planetIdx){
      var otherIdx=c.a===planetIdx?c.b:c.a;
      compText+='<div style="margin-top:3px"><span style="color:'+c.col+'">'+c.name+'</span> — link with '+PLANETS[otherIdx].sym+' '+PLANETS[otherIdx].name+': '+c.desc+'</div>';
    }
  });
  // Slot behavior + granted attacks
  var grantText='';
  if(p.grants&&p.grants.length>0){
    grantText='<div class="md-bonus"><div class="md-bonus-title">GRANTS ATTACKS</div>';
    p.grants.forEach(function(name){
      var atk=ATTACKS[name];if(!atk)return;
      var typCol=atk.type==='sol'?'#f59e0b':atk.type==='luna'?'#6366f1':atk.type==='mercury'?'#a890f0':'#94a3b8';
      grantText+='<div style="margin-top:3px"><span style="color:'+typCol+'">'+name+'</span> — '+atk.desc+'</div>';
    });
    grantText+='</div>';
  }
  var slotText='<div style="margin-top:6px;font-size:0.75em;color:var(--muted)">'+
    'In <span style="color:#d4a843">Hand</span>: attack bonuses + grants spells<br>'+
    'In <span style="color:#888">Body</span>: passive bonuses</div>';

  var panel=document.getElementById('matDetailPanel');
  panel.innerHTML='<div class="md-sym">'+materiaOrbHTML(planetIdx, level, {size:64, click:false, xp:xp})+'</div>'+
    '<div class="md-name" style="color:'+p.col+'">'+p.name+'</div>'+
    '<div class="md-planet">'+p.planet+' — '+p.desc+'</div>'+
    '<div class="md-level">Level <strong>'+level+'</strong>'+(level>=MATERIA_MAX_LVL?' (MAX)':' / '+MATERIA_MAX_LVL)+'</div>'+
    (level<MATERIA_MAX_LVL?'<div style="font-size:0.7em;color:var(--dim)">XP: '+xp+' / '+needed+'</div><div class="md-xp-bar"><div class="md-xp-fill" style="width:'+xpPct+'%;background:'+p.col+'"></div></div>':
    '<div class="md-xp-bar"><div class="md-xp-fill" style="width:100%;background:'+p.col+'"></div></div>')+
    '<div class="md-bonus"><div class="md-bonus-title">BONUS AT LV'+level+'</div>'+bonusText+'</div>'+
    (compText?'<div class="md-bonus"><div class="md-bonus-title">COMPOUND LINKS</div>'+compText+'</div>':'')+
    grantText+
    slotText+
    '<div style="margin-top:10px"><button onclick="closeMatDetail()" style="padding:6px 20px;border:1px solid var(--gold);color:var(--gold);background:transparent;border-radius:6px;font-family:Cinzel,serif;font-size:0.8em;cursor:pointer">Close</button></div>';
  document.getElementById('matDetailOverlay').classList.add('show');
}
function closeMatDetail(){
  document.getElementById('matDetailOverlay').classList.remove('show');
}

// ═══ INIT ═══
loadSpriteSheets();
// tileset now procedural
updateTitlePreview();

// ═══════════════════════════════════════════════════════════════════════════
// Inline-handler bridge (transitional).
//
// The markup in index.html still uses inline `onclick="fn()"` attributes, which
// resolve against the global scope. Because this file is now an ES module, its
// functions are module-scoped, so we expose exactly the set referenced by the
// markup on `window`. This is the complete list (every distinct function called
// from an onclick attribute, static or generated).
//
// TODO(decompose): retire this bridge as screens migrate from inline handlers
// to addEventListener / event delegation. See ARCHITECTURE.md.
// ═══════════════════════════════════════════════════════════════════════════
Object.assign(window, {
  cancelCraft, cancelDraftEquipPrompt, clearLabPreview, clearSlot, closeCraft,
  closeMatDetail, confirmBuilder, confirmDraft, confirmLoadout, craftDrillSocket,
  craftFuseLink, craftLevel, craftRefine, craftSlot, craftUnslot, deleteChampion,
  equipDraftGearTo, equipFromLab, execCraft, executeTurn, forfeitAction, forfeitRun,
  goToDraft, goToLab, openBuilder, openDebug, pickReadyAttack, randomizeBuilder,
  randomizeDebug, reformMateria, rerollStats, returnToTitle, rotateDraftFace,
  saveChampion, sellGear, sellMateria, setBuilderFace, setDebugFace, setLabPreview,
  shiftBuilderBody, shiftBuilderColor, shiftBuilderCosmetic, shiftBuilderHand,
  shiftBuilderPart, shiftBuilderSkin, shiftDebugAnim, shiftDebugBody, shiftDebugColor,
  shiftDebugCosmetic, shiftDebugFrame, shiftDebugHand, shiftDebugPart, shiftDebugSkin,
  showEqUnslotPicker, showForgeChoice, showMatDetail, showPantheon, showSlotPicker,
  showUnslotPicker, startActionFlow, startRunRandom, startTurnFlow, toggleStats,
  unequipGear,
});
