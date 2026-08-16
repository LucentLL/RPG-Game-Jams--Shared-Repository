/**
 * WHICH WAY A PROP IS TURNED — one answer, for every lens.
 *
 * User decree, 2026-08-15: "some objects have voxel depth so directional facing
 * is important. some objects will remain 2D and rotate as I see fit."
 *
 * That is the whole design. A prop that carries a depth `d` in prop-volume.js is
 * EXTRUDED TO REAL VOLUME from its own pixels (platform/voxel-sprite.js), so
 * turning it on its vertical axis shows sides the extrusion actually built —
 * it is a fact about the object, not a faked pose, and it stays inside the art
 * law. A prop with no depth is a card, and the author turns it as they see fit.
 *
 * The discriminator is ALREADY IN THE DATA. Nothing new is authored per prop:
 *
 *   d, not flat   → 'volume'  23 props (desks, cabinets, beds, furnace, pell)
 *   flat: true    → 'flat'     5 props (barrels, cauldron, basket) — a barrel
 *                              looks the same from every angle, so facing is a
 *                              genuine no-op and the lint says so
 *   form: 'wall'  → 'wall'     6 props (portraits, banners, hanging herbs) —
 *                              already oriented by the wall they hang on
 *   otherwise     → 'card'     9 props (potion, candle, globe, bust, statue)
 *
 * ── WHY THIS COSTS NOTHING IN COLLISION ──────────────────────────────────────
 *
 * ONE COLLISION FACT says a thing blocks the space its art occupies. Turning a
 * long desk would change that space — except blockerRadius(w, d) is a CIRCLE
 * sized off max(w, d) (prop-volume.js:313-317), so it is already
 * rotation-invariant. A rotated prop blocks exactly what an unrotated one does,
 * at every angle, in every lens. That is why facing is a rendering fact and not
 * a physics change, and why it could be added without a playtest of passability.
 *
 * ── THE CONVENTION ───────────────────────────────────────────────────────────
 *
 * Degrees, integer, clockwise seen from above. 0 is the orientation the art was
 * drawn in — so a prop with NO facing draws exactly as it always has, which is
 * what let the whole shipped corpus migrate without a single chart changing.
 */
import { PROP_VOL } from './prop-volume.js';

/** The compass, for editors and for anything that wants to step a prop round. */
export const FACING_STEP = 45;

/**
 * What turning this art would MEAN: 'volume' | 'flat' | 'wall' | 'card'.
 * An unknown art is 'card' — the permissive answer, because refusing to draw
 * something is worse than drawing it unrotated.
 */
export function facingClass(art) {
  const v = PROP_VOL[art];
  if (!v) return 'card';
  if (v.form === 'wall') return 'wall';
  if (v.flat) return 'flat';
  return v.d ? 'volume' : 'card';
}

/** Does an authored facing change ANYTHING for this art? */
export function facingMatters(art) {
  const k = facingClass(art);
  return k === 'volume' || k === 'card';
}

/**
 * The facing a lens should draw this prop at, in degrees 0-359.
 *
 * Wall props return 0 unconditionally: their orientation comes from the wall
 * they hang on, and an authored facing must not fight the bake (the validator
 * warns when a chart authors one anyway). Flat props keep their number — it is
 * harmless and it survives a round-trip through the editor — but a lens may
 * skip the transform entirely, since a radially symmetric thing cannot show it.
 */
export function facingOf(prop) {
  if (!prop) return 0;
  if (facingClass(prop.art) === 'wall') return 0;
  const f = prop.facing;
  if (typeof f !== 'number' || !Number.isFinite(f)) return 0;
  return ((Math.round(f) % 360) + 360) % 360;
}

/** True when a lens can skip building a rotation for this prop at all. */
export function facingIsIdentity(prop) {
  const f = facingOf(prop);
  return f === 0 || facingClass(prop && prop.art) === 'flat';
}
