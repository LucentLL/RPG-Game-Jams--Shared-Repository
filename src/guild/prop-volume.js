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
 * `stand` — ONE camera-facing sprite, standing on the floor at the authored
 *           height. This is what Hexen does, and it is now what almost
 *           everything here does. See below for the two rounds it took to get
 *           back to it.
 * `lie`   — ONE quad flat on the floor, for art drawn in PLAN. The beds: their
 *           sheet draws them from above, so a camera-facing sprite would stand
 *           them on their footboards. `d` is the long axis and width follows it.
 *           Doom's floor detail, and the same single quad as `stand` — just in
 *           the plane the picture was actually painted for.
 * `wall`  — ONE quad bolted flat to the wall it hangs on, taking THAT wall's
 *           rotation from the map and never turning to follow the camera.
 *           `mid` is the centre height above the floor: a portrait hangs, it
 *           does not stand on the skirting. This is a texture on something that
 *           genuinely has volume — the wall — which is the other half of the
 *           rule below.
 *
 * ── WHAT HEXEN DOES, AND WHY WE ARRIVED BACK AT IT ────────────────────────
 *
 * Hexen has exactly two kinds of thing. ARCHITECTURE — walls, floors, ceilings
 * — is geometry with textures on it. EVERYTHING ELSE is a single sprite that
 * always turns to face you. There are no crossed quads, no lids, no boxes. Not
 * a limitation they worked around: it is the answer, because one drawing can
 * only ever be honest from one angle, and a sprite that always faces you is
 * only ever seen from that angle.
 *
 * Two rounds of building otherwise, and the playtest killed both:
 *
 * 1. A real six-sided BOX. Every crop in this game is a single elevation, so
 *    all four walls of the box got the same picture. "The Furnace/Anvil are
 *    placed 4 times around the sides of an invisible cube — this is not
 *    acceptable." Correct, and not tunable: a box needs four pictures.
 * 2. A CROSS — two quads at right angles, the trick used for trees. "I'm not a
 *    fan of the perpendicular images intersecting or the 'tops' placed on
 *    objects like the desk and anvils. Either the object should rotate
 *    smoothly, or be a texture on an object with actual volume."
 *
 * Both failed the same way. A cross and a box are attempts to fake volume out
 * of a picture, and near enough to see, you can always tell — the intersection
 * shows, the lid reads as a lid. The sprite does not fake anything: it declines
 * to have a side, and because it turns, you never look for one.
 *
 * SO WHAT WAS THE POINT? The heights. Every number below is the durable half of
 * this work and none of it changed across the three rounds: it is what stopped
 * a desk being 1.03 tiles tall in a 1.4-tile room. Rendering a correctly-sized
 * sprite was always the goal; the volume detour was how we learned that sizing,
 * not shape, was the whole bug.
 *
 * A name absent from this table keeps the OLD billboard, sized from the
 * top-down view's pixel width — which is the sizing this file exists to
 * replace, so an absent name is a gap and not a default.
 *
 * @typedef {{form:'stand'|'lie'|'wall', h:number, d?:number, mid?:number}} Volume
 * `h` height in tiles · `d` depth in tiles (lie, and the resting test) ·
 * `mid` centre height (wall)
 */
export const PROP_VOL = /** @type {Record<string, Volume>} */ ({
  // ── Desks, benches, counters ──────────────────────────────────────────────
  teacherDesk:  { form: 'stand', h: 0.40, d: 0.30 },
  gmDesk:       { form: 'stand', h: 0.55, d: 0.38 },   // a raised bench-desk, not a table
  classDesk:    { form: 'stand', h: 0.40, d: 0.30 },
  lectern:      { form: 'stand', h: 0.55, d: 0.35 },
  potionCounter:{ form: 'stand', h: 0.44, d: 0.30 },
  abacus:       { form: 'stand', h: 0.30, d: 0.14 },
  gmLedgers:    { form: 'stand', h: 0.12, d: 0.16 },
  breadPile:    { form: 'stand', h: 0.14, d: 0.22 },

  // ── Cabinets and cases: tall solids against a wall ────────────────────────
  gmBookshelf:  { form: 'stand', h: 0.90, d: 0.28 },
  jarCabinet:   { form: 'stand', h: 0.95, d: 0.30 },
  gearCubbies:  { form: 'stand', h: 0.85, d: 0.28 },
  wardrobe:     { form: 'stand', h: 0.95, d: 0.30 },
  footlocker:   { form: 'stand', h: 0.24, d: 0.24 },
  gmThrone:     { form: 'stand', h: 0.60, d: 0.30 },

  // ── Fire and iron ─────────────────────────────────────────────────────────
  forgeFurnace: { form: 'stand', h: 1.05, d: 0.55 },
  stoneOven:    { form: 'stand', h: 0.85, d: 0.42 },
  kitchenStove: { form: 'stand', h: 0.85, d: 0.40 },
  anvilBare:    { form: 'stand', h: 0.35, d: 0.28 },

  // ── Beds: drawn in plan, so they lie down ─────────────────────────────────
  bed:          { form: 'lie', h: 0.26, d: 0.95 },
  bunkIron:     { form: 'lie', h: 0.26, d: 0.95 },
  bunkPosted:   { form: 'lie', h: 0.30, d: 0.95 },

  // ── Round and irregular uprights ──────────────────────────────────────────
  provisionBarrel: { form: 'stand', h: 0.42 },
  quenchBarrel:    { form: 'stand', h: 0.42 },
  storeBarrel:     { form: 'stand', h: 0.42 },
  cauldronBoil:    { form: 'stand', h: 0.52 },
  herbBasket:      { form: 'stand', h: 0.26 },
  potionGreen:     { form: 'stand', h: 0.20 },
  bedCandle:       { form: 'stand', h: 0.34 },
  globe:           { form: 'stand', h: 0.55 },   // a floor globe on its stand
  gmBust:          { form: 'stand', h: 0.70 },
  armorKnight:     { form: 'stand', h: 0.88 },
  armorSteel:      { form: 'stand', h: 0.88 },
  trainDummy:      { form: 'stand', h: 0.88 },
  statue:          { form: 'stand', h: 1.15 },
  // Outdoors, where nothing has a ceiling to pierce but you still walk around
  // it. These are PLACEABLES — a handful per estate, bought one at a time — so
  // the second quad each costs is a rounding error against the ground they
  // stand on.
  well:            { form: 'stand', h: 1.10 },
  stall:           { form: 'stand', h: 1.05 },
  lampPost:        { form: 'stand', h: 1.25 },
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
