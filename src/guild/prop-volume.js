/**
 * @file What a furnishing IS, as opposed to what it looks like.
 *
 * THE LESSON THIS FILE EXISTS TO STOP REPEATING. A prop used to be `{art, x, y,
 * w}` — a picture, a point, and a width in the TOP-DOWN view's pixels. That is
 * enough to draw one view and not enough to draw two, so every other lens
 * invented the missing dimensions for itself and they disagreed. In first
 * person the invention was "height = width × the crop's aspect ratio", and
 * because `w` was authored for top-down READABILITY (a desk drawn generously so
 * you can tell it from a chair), that arithmetic made:
 *
 *     teacherDesk   1.03 tiles tall     a desk three-quarters of the way to the ceiling
 *     gmDesk        1.49 tiles tall     through the ceiling (which is 1.4)
 *     bed           1.26 tiles tall     stood on its end, facing you
 *     wardrobe      2.24 tiles tall
 *     forgeFurnace  3.00 tiles tall     twice the height of the room it is in
 *     statue        2.92 tiles tall
 *     jarCabinet    3.00 tiles tall
 *
 * — which is the playtest note "a desk renders as a wall-sized panel". It was
 * never a rendering bug. The renderer drew exactly what the data said, and the
 * data did not know how tall anything was.
 *
 * So: the volume is authored HERE, once, in TILES, and each lens multiplies by
 * its own world unit. Nothing in this file is in pixels, because a pixel is a
 * fact about a screen and this is a fact about a thing. The same table is what
 * a canvas renderer would read, unchanged.
 *
 * Width is deliberately NOT authored. It follows from the authored height and
 * the crop's own proportions — the arena's rule (@see action-fp.js buildDressing)
 * — which is what keeps a piece of furniture a thing and not a stretched
 * picture of one. Authoring both would let the two drift, and the drift would
 * be silent.
 *
 * SCALE. A tile is 300 world px, the eye stands at 0.77 of one and the ceiling
 * is at 1.4, so a tile is very close to 2.1 metres. Read the numbers below that
 * way: a desk at 0.40 is 85cm, a wardrobe at 0.95 is two metres.
 */

/**
 * How a thing occupies its cell.
 *
 * `box`   — a solid standing on the floor whose ART IS ITS FRONT. Four sides and
 *           a lid. The ends and the back get a slice of the art's own edge
 *           rather than an invented tint, so a repainted sheet stays in step.
 * `lie`   — a solid whose ART IS ITS TOP. Beds: the sheet draws them in plan,
 *           and standing a plan view up on its edge is precisely the bug above.
 *           The lid takes the art; `d` is the long axis and width follows it.
 * `cross` — two quads at right angles through the centre, for round or
 *           irregular uprights (barrels, statues, trees, cauldrons). Ground
 *           contact on both axes, depth from every bearing, no per-frame
 *           rotation, one extra quad. The trick every Doom descendant used.
 * `wall`  — one quad bolted flat to the wall it hangs on, taking THAT wall's
 *           rotation from the map and never turning to follow the camera.
 *           `mid` is the centre height above the floor: a portrait hangs, it
 *           does not stand on the skirting.
 *
 * A name absent from this table keeps the old camera-facing billboard. That is
 * the right default for anything genuinely flat or too small to have sides, and
 * it means adding an entry is always a considered act.
 *
 * @typedef {{form:'box'|'lie'|'cross'|'wall', h:number, d?:number, mid?:number}} Volume
 * `h` height in tiles · `d` depth in tiles (box/lie) · `mid` centre height (wall)
 */
export const PROP_VOL = /** @type {Record<string, Volume>} */ ({
  // ── Desks, benches, counters ──────────────────────────────────────────────
  teacherDesk:  { form: 'box', h: 0.40, d: 0.30 },
  gmDesk:       { form: 'box', h: 0.55, d: 0.38 },   // a raised bench-desk, not a table
  classDesk:    { form: 'box', h: 0.40, d: 0.30 },
  lectern:      { form: 'box', h: 0.55, d: 0.35 },
  potionCounter:{ form: 'box', h: 0.44, d: 0.30 },
  abacus:       { form: 'box', h: 0.30, d: 0.14 },
  gmLedgers:    { form: 'box', h: 0.12, d: 0.16 },
  breadPile:    { form: 'box', h: 0.14, d: 0.22 },

  // ── Cabinets and cases: tall solids against a wall ────────────────────────
  gmBookshelf:  { form: 'box', h: 0.90, d: 0.28 },
  jarCabinet:   { form: 'box', h: 0.95, d: 0.30 },
  gearCubbies:  { form: 'box', h: 0.85, d: 0.28 },
  wardrobe:     { form: 'box', h: 0.95, d: 0.30 },
  footlocker:   { form: 'box', h: 0.24, d: 0.24 },
  gmThrone:     { form: 'box', h: 0.60, d: 0.30 },

  // ── Fire and iron ─────────────────────────────────────────────────────────
  forgeFurnace: { form: 'box', h: 1.05, d: 0.55 },
  stoneOven:    { form: 'box', h: 0.85, d: 0.42 },
  kitchenStove: { form: 'box', h: 0.85, d: 0.40 },
  anvilBare:    { form: 'box', h: 0.35, d: 0.28 },

  // ── Beds: drawn in plan, so they lie down ─────────────────────────────────
  bed:          { form: 'lie', h: 0.26, d: 0.95 },
  bunkIron:     { form: 'lie', h: 0.26, d: 0.95 },
  bunkPosted:   { form: 'lie', h: 0.30, d: 0.95 },

  // ── Round and irregular uprights ──────────────────────────────────────────
  provisionBarrel: { form: 'cross', h: 0.42 },
  quenchBarrel:    { form: 'cross', h: 0.42 },
  storeBarrel:     { form: 'cross', h: 0.42 },
  cauldronBoil:    { form: 'cross', h: 0.52 },
  herbBasket:      { form: 'cross', h: 0.26 },
  potionGreen:     { form: 'cross', h: 0.20 },
  bedCandle:       { form: 'cross', h: 0.34 },
  globe:           { form: 'cross', h: 0.55 },   // a floor globe on its stand
  gmBust:          { form: 'cross', h: 0.70 },
  armorKnight:     { form: 'cross', h: 0.88 },
  armorSteel:      { form: 'cross', h: 0.88 },
  trainDummy:      { form: 'cross', h: 0.88 },
  statue:          { form: 'cross', h: 1.15 },
  // Outdoors, where nothing has a ceiling to pierce but you still walk around
  // it. These are PLACEABLES — a handful per estate, bought one at a time — so
  // the second quad each costs is a rounding error against the ground they
  // stand on.
  well:            { form: 'cross', h: 1.10 },
  stall:           { form: 'cross', h: 1.05 },
  lampPost:        { form: 'cross', h: 1.25 },
  // NOT treeTall, deliberately. The meadow grows trees from its GRID as well as
  // from the placeable list, and the grid ones are legion — the estate's open
  // ground is already the map that runs out of compositor layers first (@see
  // delve-fp.js's note on viewCap: 629 live quads and flickering). Crossing a
  // few hundred trees is exactly the wrong place to spend the budget, and
  // crossing only the bought ones would make two trees of the same kind behave
  // differently a tile apart. So both stay billboards until the renderer stops
  // paying a layer per surface; if that changes, this is a two-line edit and a
  // matching one at DECOR_H.tree.

  // ── Hung on a wall ────────────────────────────────────────────────────────
  gmPortrait:   { form: 'wall', h: 0.42, mid: 0.95 },
  lessonBoard:  { form: 'wall', h: 0.50, mid: 0.90 },
  recipeBanner: { form: 'wall', h: 0.55, mid: 0.95 },
  gmBanner:     { form: 'wall', h: 0.90, mid: 0.85 },
  hangingHerbs: { form: 'wall', h: 0.34, mid: 1.18 },   // hangs from the beams
  tools:        { form: 'wall', h: 0.13, mid: 1.05 },   // the rolling pin on its hooks
});

/** The volume of a named furnishing, or null if it is still just a picture. */
export function propVolume(art) {
  return (art && PROP_VOL[art]) || null;
}

/**
 * The footprint a solid covers, in tiles, given where it was authored.
 *
 * `x, y` is the anchor the maps already carry, and it means what a top-down
 * standee has always meant: the MIDDLE OF THE FRONT EDGE, at floor level. The
 * solid therefore grows BACKWARD from it — except where backward is masonry,
 * which is what `openBack` is asked. Everything wall-hugging in the estate is
 * authored a hair south of its wall (`y: 2.02`), so without that test every
 * cabinet in the game would be buried half a tile inside the stonework.
 *
 * Returns the CENTRE and the extents, so a caller only ever adds and halves.
 * @param {{x:number,y:number}} p the authored anchor
 * @param {number} w width in tiles @param {number} d depth in tiles
 * @param {(x:number,y:number)=>boolean} openBack can the solid grow that way?
 */
export function footprint(p, w, d, openBack) {
  const back = openBack ? openBack(p.x, p.y - d) : true;
  const cy = back ? p.y - d / 2 : p.y + d / 2;
  return { cx: p.x, cy, w, d, x0: p.x - w / 2, x1: p.x + w / 2, y0: cy - d / 2, y1: cy + d / 2 };
}

/**
 * Authoring slop, in tiles, when deciding whether a small thing is resting on a
 * big one. The maps place a stack of ledgers so it OVERLAPS the desk in the
 * top-down view, which is a hair outside the desk's real footprint; an eighth
 * of a tile of tolerance is the difference between ledgers on the desk and
 * ledgers on the floor beside it, and is far too small to lift anything that
 * was meant to stand on its own.
 */
export const REST_SLOP = 0.15;
