/**
 * @file Water — the one moving surface in the world, cut from the owned kit.
 *
 * `public/assets/tiles/water.png` is `newworld_waterA1.png` out of the shared
 * rpg-assets library (2022 patron bundle): an RPG-Maker A1 autotile sheet,
 * which is to say several terrain families of pond edging wrapped around ONE
 * water fill, drawn in THREE animation frames. Only the fill is used here —
 * the edging is autotile bookkeeping this project's ASCII grid does not speak,
 * and a shoreline that reads as drawn rather than derived is a later job.
 *
 * FINDING THE FILL. An A1 block is 2 tiles wide and 3 tall: a cap row, then a
 * 2×2 of CORNER pieces. The seamless full-water tile is not any one of those
 * four — it is their four INNER quadrants, assembled. Measured against the
 * real sheet (2026-08-07): the three blocks at sheet-pixel x 0 / 96 / 192,
 * y 48 come out 100% blue, and their wrap-around seam scores BELOW the tile's
 * own wave detail, so a lake of them shows no grid.
 *
 * HOW EACH LENS MOVES IT is the lens's business, not the water's. The shared
 * fact is only "this cell is water" (ONE WORLD); the animation is presentation,
 * and the two cameras look at this plane from angles that reward opposite
 * techniques. The top-down looks straight DOWN at it, where the three authored
 * frames are the whole effect and a scroll would read as the ground sliding —
 * so it swaps frames. The first-person view sees the same plane nearly
 * EDGE-ON, where a frame swap is invisible and drift is everything — so its
 * shader scrolls and shears the texture instead, which also keeps the surface
 * geometrically still (a quad that bobs opens a crack against the bank).
 */
import { TILES_BASE } from '../config/assets.js';

/** Sheet-pixel x of each frame's 2×2 corner block; they share a row. */
const FRAME_X = [0, 96, 192];
const BLOCK_Y = 48;
const TILE = 48, HALF = 24;

/** ms per authored frame — RPG Maker's own water cadence, near enough. */
export const WATER_FRAME_MS = 200;
/** Fraction of walking speed while wading. Water is not an obstacle; it is a
 *  cost, which is the only thing that makes a ford a decision. */
export const WADE_SPEED = 0.62;

let _frames = null;   // Promise<HTMLCanvasElement[]>, one per session

/**
 * The three water fill tiles, 48×48 each, assembled from the sheet's inner
 * quadrants. Cached — every lens that asks gets the same canvases, so a map
 * walked top-down and then in first person uploads one texture, not two.
 * @returns {Promise<HTMLCanvasElement[]>}
 */
export function waterFrames() {
  if (_frames) return _frames;
  _frames = new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(FRAME_X.map((ox) => {
      const cv = document.createElement('canvas');
      cv.width = TILE; cv.height = TILE;
      const g = cv.getContext('2d');
      g.imageSmoothingEnabled = false;
      // The four inner quadrants, in reading order: bottom-right of the NW
      // corner piece, bottom-left of the NE, top-right of the SW, top-left
      // of the SE. That is the autotile's centre, and it wraps.
      g.drawImage(im, ox + HALF, BLOCK_Y + HALF, HALF, HALF, 0, 0, HALF, HALF);
      g.drawImage(im, ox + TILE, BLOCK_Y + HALF, HALF, HALF, HALF, 0, HALF, HALF);
      g.drawImage(im, ox + HALF, BLOCK_Y + TILE, HALF, HALF, 0, HALF, HALF, HALF);
      g.drawImage(im, ox + TILE, BLOCK_Y + TILE, HALF, HALF, HALF, HALF, HALF, HALF);
      return cv;
    }));
    // Evict on failure so one bad load doesn't poison the session (loadImg's
    // own rule, and for the same reason).
    im.onerror = () => { _frames = null; reject(new Error('water: failed to load ' + im.src)); };
    im.src = TILES_BASE + 'water.png';
  });
  return _frames;
}

/** Which authored frame is showing at wall-clock `now` (ms). */
export const waterFrameAt = (now) => Math.floor(now / WATER_FRAME_MS) % FRAME_X.length;

/** How many frames the strip carries — the CSS `steps()` count. */
export const WATER_FRAMES = FRAME_X.length;

let _strip = null;
/**
 * The three frames side by side as one 144×48 image, as a data URL.
 *
 * This is the top-down lens's whole animation: a cell wearing this strip with
 * `background-size: 300% 100%` and a stepped `background-position` keyframe
 * plays the authored water with NO per-frame JavaScript at all — which is
 * what lets the water live at any level (a creek bed is a quad a step down,
 * not part of the ground plane) without the render loop having to know.
 * @returns {Promise<string>}
 */
export function waterStripUrl() {
  if (_strip) return _strip;
  _strip = waterFrames().then((f) => {
    const cv = document.createElement('canvas');
    cv.width = TILE * f.length; cv.height = TILE;
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    f.forEach((tile, i) => g.drawImage(tile, i * TILE, 0));
    return cv.toDataURL('image/png');
  });
  return _strip;
}

/** The average water colour — what a plan view tints with, and what the editor
 *  paints before the sheet has decoded. Sampled off the fill, not invented. */
export const WATER_TINT = '#1f6094';
