// Core config constants — scalar tuning values (extracted from crucible.js).
import { MATERIA_BASE } from '../../config/assets.js';

var GS=9;
var MATERIA_MAX_LVL=5;
var MATERIA_DUST_COST=8;   // dust granules of a single planet required to reform a Lv1 orb
var TOTAL_ROUNDS=7;
var TILE_SIZE=48;
var TILE_COLS=16;
// Tileset replaced with procedural generation
var battlefieldTileset=true; // flag — procedural tiles always "loaded"
var ELEMENTS_CELL   = 48;
var ELEMENTS_COLS   = 23;
var ELEMENTS_ROWS   = 4;
var CAST_FX_COUNT = 60;
var CAST_FX_FRAME_MS = 14;             // ≈ 71fps; total ≈ 840ms (matches 5-frame cast at 140ms)
var ORB_BASE_PATH = MATERIA_BASE;
var ORB_CELL = 48;
var ORB_COLS = 12;
var ORB_ROWS = 8;
var SPRITE_CELL = ELEMENTS_CELL;
var SPRITE_COLS = ELEMENTS_COLS;
var SPRITE_ROWS = ELEMENTS_ROWS;
var ACTION_TILE = 80;
var ACTION_GS = 9;
var MOVE_PHASE = 5;                    // total move phase span (matches buildTimeline's PHASE)

export {
  GS, MATERIA_MAX_LVL, MATERIA_DUST_COST, TOTAL_ROUNDS, TILE_SIZE, TILE_COLS, battlefieldTileset,
  ELEMENTS_CELL, ELEMENTS_COLS, ELEMENTS_ROWS, CAST_FX_COUNT, CAST_FX_FRAME_MS,
  ORB_BASE_PATH, ORB_CELL, ORB_COLS, ORB_ROWS, SPRITE_CELL, SPRITE_COLS, SPRITE_ROWS,
  ACTION_TILE, ACTION_GS, MOVE_PHASE,
};
