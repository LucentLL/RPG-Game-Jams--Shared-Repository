/**
 * @file The swing, put back in the ground plane.
 *
 * THE PROBLEM, EXACTLY. Every character sheet in this game was drawn for a
 * TOP-DOWN game, and in a top-down game a forward swing is motion across the
 * GROUND — the blade travels through the tile in front of you, and the artist
 * drew that as motion across the sprite's own 2D plane. A first-person or
 * over-the-shoulder camera stands that plane UP. The swing goes up with it, and
 * a horizontal cut becomes an overhead chop: the playtest note "it swings the
 * weapon up into the air … instead of raising it above their head".
 *
 * It is the same failure as the bed drawn in plan and stood on its footboard,
 * and it has the same shape of fix: the picture is fine, the PLANE it was
 * authored in is the thing that has to be respected. So the swing stops being
 * motion inside the billboard and becomes a rotation about the wielder's own
 * vertical axis — the blade travels round them like a hula hoop, which is what
 * a forward swing always was.
 *
 * WHY THE BLADE STAYS A CAMERA-FACING BILLBOARD while its POSITION orbits. The
 * obvious build is to lay the blade quad flat and spin it, and it is wrong for
 * the reason every flat quad in this renderer is wrong: a horizontal quad seen
 * from a standing eye is nearly edge-on, so the sword would vanish for most of
 * the arc it is supposed to be read through. Orbiting a camera-facing quad puts
 * the MOTION in the ground plane — which is the whole complaint — while keeping
 * the blade legible from every bearing. Same reasoning as the crossed solids.
 *
 * The lens owns the DOM (each already has its own billboard idiom); this file
 * owns the geometry, so the three cannot drift on where a swing goes.
 */

/**
 * The sheet cell the orbiting blade is cut from: the NORTH row (row 3, the
 * wielder seen from behind — the row every first-person lens already uses for
 * its viewmodel) at the middle of the attack block, where the weapon is at full
 * extension. Deliberately ONE cell and not the 10..14 run: the sheet's own
 * frames ARE the in-plane swing we are replacing, so playing them here would
 * put the arc back on top of the orbit that has taken its place.
 */
export const SWING_ROW = 3, SWING_COL = 12;

/** How far round the wielder the blade travels, in degrees off their facing.
 *  It starts drawn back across the body and finishes past the far shoulder. */
export const ARC_FROM = 82, ARC_TO = -88;
/** How far out from the wielder's centre it travels, and at what height, and
 *  how big the quad is — all in TILES, so each lens multiplies by its own unit
 *  exactly like prop-volume.js. Hip height, because that is where a one-handed
 *  cut lives; a head-height sweep is a different attack. */
export const ORBIT_T = 0.46, HIP_T = 0.44, BLADE_T = 0.66;

/**
 * Where the blade is, `t` of the way through the swing (0..1).
 *
 * Eased, not linear. A linear sweep reads as a fan being waved: the eye needs
 * the blade to HANG at the wind-up and then leave, which is the whole
 * difference between a threat and a gesture. The last fifth fades, so the
 * follow-through leaves rather than blinking out.
 */
export function swingAt(t) {
  const u = Math.max(0, Math.min(1, t));
  const e = u < 0.3 ? (u / 0.3) * 0.16 : 0.16 + Math.pow((u - 0.3) / 0.7, 0.62) * 0.84;
  return {
    deg: ARC_FROM + (ARC_TO - ARC_FROM) * e,
    fade: u < 0.78 ? 1 : Math.max(0, 1 - (u - 0.78) / 0.22),
  };
}

/**
 * How far through the swing a fighter is, from the anim the sim already set —
 * so the orbit and the body pose cannot drift apart. Null when not swinging.
 */
export function swingT(f) {
  const a = f && f.anim;
  if (!a || (a.name !== 'slash' && a.name !== 'nockBow')) return null;
  if (a.name === 'nockBow') return null;   // a bow is drawn and loosed, never swung
  return Math.max(0, Math.min(1, (a.frame || 0) / 4));   // ELEMENTS_ANIMS.slash is 5 frames
}

/**
 * The blade quad. Centre-anchored (not foot-anchored like a standee) because it
 * is placed by where the EDGE is, not by where something stands.
 */
export function makeBlade(host, worldT) {
  const w = BLADE_T * worldT;
  const el = document.createElement('div');
  el.className = 'fp-blade';
  el.style.cssText = `width:${w}px;height:${w}px;margin-left:${-w / 2}px;margin-top:${-w / 2}px;display:none`;
  const cv = document.createElement('canvas');
  cv.width = 48; cv.height = 48;
  el.appendChild(cv);
  host.appendChild(el);
  return { el, cv, tf: '', on: false, fade: -1, drawn: false };
}

/**
 * Put the blade where the swing has carried it, or park it.
 *
 * `x`/`y` are the wielder's position in TILES, `facing` their heading in
 * radians (0 = north, the same convention the move vector uses: heading is
 * `(sin, -cos)` in x/z), `camYawDeg` the camera's yaw in degrees — the blade
 * counter-rotates by it like every other billboard, so it stays legible all the
 * way round. Returns true if it drew.
 */
export function placeBlade(b, t, x, y, lift, facing, camYawDeg, worldT) {
  // `drawn` is the gate as much as `t` is: a fighter whose weapon has no sheet
  // (or whose sheet has not loaded yet) must keep the blade the compositor drew
  // on their standee, or a blow lands with empty hands. The lens hides the
  // standee's weapon ONLY once this one exists — see drawActor.
  if (t == null || !b.drawn) {
    if (b.on) { b.el.style.display = 'none'; b.on = false; }
    return false;
  }
  const s = swingAt(t);
  const th = facing + s.deg * Math.PI / 180;
  const bx = (x + Math.sin(th) * ORBIT_T) * worldT;
  const bz = (y - Math.cos(th) * ORBIT_T) * worldT;
  const by = lift - HIP_T * worldT;
  if (!b.on) { b.el.style.display = ''; b.on = true; }
  const tf = `translate3d(${bx.toFixed(1)}px,${by.toFixed(1)}px,${bz.toFixed(1)}px) rotateY(${camYawDeg.toFixed(1)}deg)`;
  if (tf !== b.tf) b.el.style.transform = (b.tf = tf);
  const fade = Math.round(s.fade * 10) / 10;
  if (fade !== b.fade) { b.fade = fade; b.el.style.opacity = fade; }
  return true;
}
