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

/**
 * THE CELL SIZE IS THE SHEET'S OWN BUSINESS.
 *
 * Every Elements weapon sheet is 1104×192 — 23 columns of 48px — and for years
 * ELEMENTS_CELL was the answer everywhere. It stopped being the only answer when
 * the whips arrived: their lash reaches 56px past the cell's centre where a
 * sword's slash reaches 24, both drawn at the same pixel scale, so a whip simply
 * does not fit a 48px cell and its sheet is cut at 112 (dev/bake-whips.mjs).
 *
 * What did NOT change is the COLUMN LAYOUT. A whip sheet is still 23×4 and
 * column 11 still means the middle of the slash, so the only thing a lens has to
 * learn is how wide a cell is — and it learns it by DIVIDING, never from a
 * table. A table would be a second place to be wrong; a file's own width cannot
 * disagree with the file.
 *
 * Falls back to ELEMENTS_CELL for an image that has not loaded yet (width 0) or
 * whose width is not a whole number of columns, so a bad sheet draws wrong
 * rather than throwing mid-frame.
 */
function weaponCellOf(img){
  var w = (img && (img.naturalWidth || img.width)) || 0;
  var cell = w / ELEMENTS_COLS;
  return (w && cell === Math.round(cell)) ? cell : ELEMENTS_CELL;
}

export {
  GS, MATERIA_MAX_LVL, MATERIA_DUST_COST, TOTAL_ROUNDS, TILE_SIZE, TILE_COLS, battlefieldTileset,
  ELEMENTS_CELL, ELEMENTS_COLS, ELEMENTS_ROWS, weaponCellOf, CAST_FX_COUNT, CAST_FX_FRAME_MS,
  ORB_BASE_PATH, ORB_CELL, ORB_COLS, ORB_ROWS, SPRITE_CELL, SPRITE_COLS, SPRITE_ROWS,
  ACTION_TILE, ACTION_GS, MOVE_PHASE,
};
