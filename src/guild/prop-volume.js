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
 * Width is never a SECOND fact. It follows from the authored height and the
 * crop's own proportions — the arena's rule (@see action-fp.js buildDressing)
 * — which is what keeps a piece of furniture a thing and not a stretched
 * picture of one. The charts do carry a `w` (the ONE SIZE FACT the lenses
 * draw from), but it is COMPUTED from the height here, and
 * dev/check-volumes.mjs fails the moment the two disagree — authored twice,
 * derived once, drift loud.
 *
 * SCALE. A tile is 300 world px, the eye stands at 0.77 of one and the ceiling
 * is at 1.4, so a tile is very close to 2.1 metres.
 *
 * ── THE LADDER (user decree, 2026-08-06) ──────────────────────────────────
 *
 * "Object heights should be related to player character sizes... if an object
 * is meant to be used by humans it should be sized appropriately for a human
 * to use." So the unit below is not the tile, it is THE PLAYER: every height
 * is an explicit multiple of PLAYER_H, and only these multiples are legal —
 *
 *     0.125x  a stack of ledgers, a rolling pin on its hooks
 *     0.25x   a footlocker, a basket, a mattress-top
 *     0.5x    waist height: desks, counters, barrels, the anvil
 *     0.75x   chest height: lecterns, the throne, a bust on its plinth
 *     1x      your height: shelving, stoves, armour stands, the pell
 *     1.25x   over your head: the furnace, the statue, the well
 *     1.5x    half again: the lamp post, the witch at her cauldron
 *     2x, 3x  outdoors only — nothing indoor clears the 1.4-tile ceiling
 *
 * The playtested heights all sat within about a tenth of a tile of a rung
 * (worst movers: wardrobe and jarCabinet, 0.95 → 0.84); the ladder is what
 * they were converging on, now written down. The chart's
 * authored `w` (the ONE SIZE FACT every lens draws from) is COMPUTED from
 * these heights — w = h × (art.w/art.h) × 48 — and dev/check-volumes.mjs
 * fails on any chart width that has drifted off its rung, because authoring
 * height here and width there would otherwise let the two disagree silently.
 */

/**
 * The player's own standing height, in tiles — the same fact delve-fp.js's
 * CREATURE_H writes as rank 3 (760 world px at the 900-tuned scale): "760 is
 * your own height; the eye is at 690". One body, one number, every lens.
 */
export const PLAYER_H = 760 / 900;   // ≈ 0.844 tiles ≈ 1.8 m

/** The legal multiples of PLAYER_H. Exported for the checker, not for lenses —
 *  a lens never snaps; it draws the authored number. */
export const LADDER = [0.125, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3];

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
  teacherDesk:  { form: 'stand', h: 0.50 * PLAYER_H, d: 0.30 },
  gmDesk:       { form: 'stand', h: 0.75 * PLAYER_H, d: 0.38 },   // a raised bench-desk, not a table
  classDesk:    { form: 'stand', h: 0.50 * PLAYER_H, d: 0.30 },
  lectern:      { form: 'stand', h: 0.75 * PLAYER_H, d: 0.35 },
  potionCounter:{ form: 'stand', h: 0.50 * PLAYER_H, d: 0.30 },
  abacus:       { form: 'stand', h: 0.25 * PLAYER_H, d: 0.14 },
  gmLedgers:    { form: 'stand', h: 0.125 * PLAYER_H, d: 0.16 },
  breadPile:    { form: 'stand', h: 0.125 * PLAYER_H, d: 0.22 },

  // ── Cabinets and cases: tall solids against a wall ────────────────────────
  gmBookshelf:  { form: 'stand', h: 1.00 * PLAYER_H, d: 0.28 },
  jarCabinet:   { form: 'stand', h: 1.00 * PLAYER_H, d: 0.30 },
  gearCubbies:  { form: 'stand', h: 1.00 * PLAYER_H, d: 0.28 },
  wardrobe:     { form: 'stand', h: 1.00 * PLAYER_H, d: 0.30 },
  footlocker:   { form: 'stand', h: 0.25 * PLAYER_H, d: 0.24 },
  gmThrone:     { form: 'stand', h: 0.75 * PLAYER_H, d: 0.30 },

  // ── Fire and iron ─────────────────────────────────────────────────────────
  forgeFurnace: { form: 'stand', h: 1.25 * PLAYER_H, d: 0.55 },
  stoneOven:    { form: 'stand', h: 1.00 * PLAYER_H, d: 0.42 },
  kitchenStove: { form: 'stand', h: 1.00 * PLAYER_H, d: 0.40 },
  anvilBare:    { form: 'stand', h: 0.50 * PLAYER_H, d: 0.28 },

  // ── Beds: drawn in plan, so they lie down ─────────────────────────────────
  // `h` is the mattress-top: a quarter of a person is where you sit down to.
  bed:          { form: 'lie', h: 0.25 * PLAYER_H, d: 0.95 },
  bunkIron:     { form: 'lie', h: 0.25 * PLAYER_H, d: 0.95 },
  bunkPosted:   { form: 'lie', h: 0.25 * PLAYER_H, d: 0.95 },

  // ── Round and irregular uprights ──────────────────────────────────────────
  // `flat: true` opts a prop OUT of the voxel extrusion (playtest 2026-08-06):
  // animated art and leafy organics read better as sprites — the same call the
  // voxel mod's own overworld makes. `d` is now ALSO the extrusion depth, so a
  // pole can say it is a pole instead of inheriting a crate's default.
  provisionBarrel: { form: 'stand', h: 0.50 * PLAYER_H },
  quenchBarrel:    { form: 'stand', h: 0.50 * PLAYER_H },
  storeBarrel:     { form: 'stand', h: 0.50 * PLAYER_H },
  // The witch-hatted cauldron is FOUR FRAMES of art (.apoth-boil walks them
  // top-down) — a carving cannot stir, so she stays a sprite, at the height
  // the art actually draws her rather than the pot's old waist-high number.
  cauldronBoil:    { form: 'stand', h: 1.50 * PLAYER_H, flat: true },
  herbBasket:      { form: 'stand', h: 0.25 * PLAYER_H, flat: true },
  potionGreen:     { form: 'stand', h: 0.25 * PLAYER_H },
  bedCandle:       { form: 'stand', h: 0.50 * PLAYER_H },
  globe:           { form: 'stand', h: 0.75 * PLAYER_H },   // a floor globe on its stand
  gmBust:          { form: 'stand', h: 0.75 * PLAYER_H },
  armorKnight:     { form: 'stand', h: 1.00 * PLAYER_H },
  armorSteel:      { form: 'stand', h: 1.00 * PLAYER_H },
  trainDummy:      { form: 'stand', h: 1.00 * PLAYER_H, d: 0.22 },   // a pell IS a person
  statue:          { form: 'stand', h: 1.25 * PLAYER_H },
  // Outdoors, where nothing has a ceiling to pierce but you still walk around
  // it. These are PLACEABLES — a handful per estate, bought one at a time — so
  // the second quad each costs is a rounding error against the ground they
  // stand on.
  well:            { form: 'stand', h: 1.25 * PLAYER_H },
  stall:           { form: 'stand', h: 1.25 * PLAYER_H },
  lampPost:        { form: 'stand', h: 1.50 * PLAYER_H, d: 0.10 },   // a post is a post, not a crate
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
  // `mid` stays in tiles: it is a position on the wall, not a size.
  gmPortrait:   { form: 'wall', h: 0.50 * PLAYER_H, mid: 0.95 },
  lessonBoard:  { form: 'wall', h: 0.50 * PLAYER_H, mid: 0.90 },
  recipeBanner: { form: 'wall', h: 0.75 * PLAYER_H, mid: 0.95 },
  gmBanner:     { form: 'wall', h: 1.00 * PLAYER_H, mid: 0.85 },
  hangingHerbs: { form: 'wall', h: 0.50 * PLAYER_H, mid: 1.18 },   // hangs from the beams
  tools:        { form: 'wall', h: 0.125 * PLAYER_H, mid: 1.05 },  // the rolling pin on its hooks
});

/** The volume of a named furnishing, or null if it is still just a picture. */
export function propVolume(art) {
  return (art && PROP_VOL[art]) || null;
}

/**
 * WHICH TILE A PROP IS ACTUALLY STANDING IN.
 *
 * The charts anchor a furnishing on the SOUTH EDGE of its cell, not in the
 * middle of it — `{ art: 'bed', x: 3.5, y: 4 }` in a chart whose `'f'` is at
 * ROW 3. That is the top-down view's foot line: the standee's base sits on
 * `y` and its art rises north from there, into the cell the chart marked. It
 * is correct for that view and it is a LINE, so a first-person lens that takes
 * it literally stands every piece of furniture in the estate on the boundary
 * between two tiles — the playtest's "why are none of these objects centered in
 * tiles? They all look to be centered on edge lines."
 *
 * So an anchor that lands exactly ON a boundary is read as a foot line and
 * moved to the middle of the cell above it. A FRACTIONAL anchor is not: `2.02`
 * is a cabinet deliberately pressed against the wall at row 1, and `6.12` is a
 * stack of ledgers deliberately laid over a desk. Those are placements, not
 * lines, and snapping them would undo the author's aim.
 *
 * 44 of the 59 authored props are on a line; every one of them was half a tile
 * out.
 */
export const propCell = (p) => (Number.isInteger(p.y) ? { ...p, y: p.y - 0.5 } : p);

/**
 * The footprint a prop covers, in tiles, CENTRED on where it stands.
 *
 * Centred and not grown-backward-from-an-edge: `propCell` above has already
 * turned the authored foot line into the middle of the occupied cell, so there
 * is no front edge left to grow from and no masonry to test for.
 *
 * Returns the centre and the extents, so a caller only ever adds and halves.
 * @param {{x:number,y:number}} p where the prop stands
 * @param {number} w width in tiles @param {number} d depth in tiles
 */
export function footprint(p, w, d) {
  return {
    cx: p.x, cy: p.y, w, d,
    x0: p.x - w / 2, x1: p.x + w / 2, y0: p.y - d / 2, y1: p.y + d / 2,
  };
}

/**
 * Authoring slop, in tiles, when deciding whether a small thing is resting on a
 * big one. The maps anchor a stack of ledgers ON the desk's drawn face in the
 * top-down view (`y: 5.8` against a desk whose footprint ends at 5.69), which
 * is a hair south of the desk's real 3-D footprint; the slop is the difference
 * between ledgers on the desk and ledgers on the floor beside it, and is far
 * too small to lift anything that was meant to stand on its own.
 */
export const REST_SLOP = 0.15;
