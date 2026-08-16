/**
 * @file THE ONE SIZE FACT, as a function.
 *
 * `w` — the chart width every lens draws a furnishing at, in px against the
 * 48px tile — is DERIVED, never authored:
 *
 *     w = round((form === 'lie' ? d : h) × (art.w / art.h) × 48)
 *
 * That one line was, until now, typed out in four places: map-editor.js's
 * `lawfulWidth` (placement), delve-maps.js's `buildPropBench` (the bench),
 * dev/check-volumes.mjs (the audit) and dev/dump-delve.mjs (the Unity
 * fixture). Four copies of an arithmetic law is three chances for it to
 * drift, and the map pack adds a fifth caller — so the copy lives HERE now,
 * and everything else imports it.
 *
 * WHY NOT IN prop-volume.js, where the ladder lives? Because the derivation
 * needs the ART crop's aspect, and art.js reaches `import.meta.env` through
 * config/assets.js. prop-volume.js is deliberately dependency-free — plain
 * `node dev/check-volumes.mjs` imports it with no Vite shim at all — and
 * pulling art.js into it would break that. So the LADDER stays where it is
 * and the DERIVATION sits one file out, where it is allowed to know what the
 * art looks like.
 *
 * Nothing here is a policy. `widthFromVolume` is the arithmetic and nothing
 * else; `lawfulWidth` is that arithmetic plus the two registry lookups.
 */
import { PROP_VOL } from './prop-volume.js';
import { ART } from './art.js';

/** px per tile in the top-down chart — the unit `w` is expressed in. */
export const CHART_TILE = 48;

/**
 * The chart width a volume + crop derive, exactly.
 *
 * A `lie` prop (a bed, drawn in plan) takes its long axis `d`; everything
 * else takes its standing height `h`. Both are in tiles, so the crop's own
 * aspect turns the authored dimension into the other one and the tile turns
 * tiles into chart px.
 *
 * @param {{form:string,h:number,d?:number}|null|undefined} v PROP_VOL entry
 * @param {{w:number,h:number}|null|undefined} a ART crop
 * @returns {number|null} the width, or null if either fact is missing
 */
export function widthFromVolume(v, a) {
  if (!v || !a || !(a.h > 0)) return null;
  const along = v.form === 'lie' ? v.d : v.h;
  if (!(along > 0)) return null;
  return Math.round(along * (a.w / a.h) * CHART_TILE);
}

/**
 * The chart width the named prop is ENTITLED to — the only width any author,
 * editor or loader may give it.
 *
 * @param {string} art the prop's art id
 * @returns {number|null} null when the art is unknown or has no ladder rung,
 *   which is the caller's cue to refuse the placement rather than guess.
 */
export function lawfulWidth(art) {
  return widthFromVolume(PROP_VOL[art], ART[art]);
}
