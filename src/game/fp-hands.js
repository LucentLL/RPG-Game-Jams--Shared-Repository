/**
 * @file The held viewmodel — your ARMS and what they carry, raised to the
 * screen — shared by EVERY first-person lens.
 *
 * The Wilds delve built this first and the two arena cameras shipped without
 * it, which read instantly as "a different system": standing in your fighter
 * with empty hands is standing in nobody. This module is that viewmodel
 * extracted to a neutral seam so the delve, the tactical board and the action
 * arena hold the same steel the same way — same sheets, same rest-frame
 * fitting, same swing. The delve carried a private fork of the whole rig for a
 * while (its own mountHands/fitHands/cellUnion/handFrame/playFrames); the fork
 * is gone and its capabilities — the pick, stow arbitration, the raised guard —
 * live here, because two viewmodels drift and one cannot.
 *
 * THE ARMS ARE THE POINT. For most of this file's life the viewmodel drew the
 * WEAPON SHEET alone, and that sheet is a weapon on transparency: row 3 col 14
 * of sword1 is 48 pixels of blade and not one pixel of skin. First person was a
 * sword floating in the dark with nobody behind it. The hand was never missing
 * art — it was on the BODY sheet the whole time, in the same cell of the same
 * frame, because the artist drew the arm and the weapon as one pose. So the
 * viewmodel now composites the pair, and a member's first-person arms are
 * literally their own arms: their skin tone, their sleeves, their armour.
 * @see WORN.armReach in art.js for how much of the body is "the arm".
 *
 * Everything hard here was learned in the delve and is preserved verbatim:
 * - Hands are cropped to the UNION of the frames they play (nothing shifts as
 *   the swing steps through), but SIZED and PLACED from the rest frame alone —
 *   the union is set by the big slash cells, and sizing by it drew the weapon
 *   you look at 95% of the time at a third of its size.
 * - The transform-origin is the GRIP (bottom-centre of the rest pose inside
 *   the union), so the CSS swing's rotation reads as a wrist. About the box
 *   centre the same keyframes carried the weapon around the whole screen.
 * - A bow animates on its own sheet block (WORN.bowDraw) — outside those
 *   columns every bow sheet is blank, and a bow drawn from the ordinary
 *   frames is an empty canvas.
 * - The slash-arc SVG must scale UNIFORMLY (`meet`): its dash is measured in
 *   viewBox units, and non-uniform scaling breaks the arc into chunks.
 *
 * The styling is delve.css's `.fp-hands` / `.fp-hand` family — global classes
 * on purpose, so the three lenses cannot drift apart visually.
 */
import { loadImg } from '../guild/delve.js';
import { WORN, wornWeapon, wornShield, wornPick, wornArms } from '../guild/art.js';
import { ELEMENTS_SKIN_SOURCE, ELEMENTS_SKIN_TONES } from './data/sprite-tables.js';

/**
 * How a held thing sits in the frame.
 *
 * HELD, NOT DISPLAYED. The first cut inset each hand 4.5% from the corner, so
 * the whole weapon — grip, guard, the hand around it — floated fully inside the
 * picture like an item card. Nothing in a first-person view is ever fully in
 * frame: you see the far end of what you are carrying and the rest runs off the
 * bottom corner past your own wrist. So the rest pose is deliberately hung OFF
 * the edges — a bit under half of it below the bottom, a quarter past the side
 * — and grown to compensate, which is what makes it read as carried.
 *
 * The sizes are of the REST pose, not of the sheet crop: the crop is the union
 * of the swing frames and is much larger than the weapon you look at.
 */
const REST_H = 0.62, SHIELD_H = 0.5;
/**
 * The most SCREEN pixels one SOURCE pixel of the art may become.
 *
 * REST_H and SHIELD_H say how much of the lens the weapon occupies, and on
 * their own that is a promise the art cannot keep. These are 48px cells and the
 * rest poses inside them are tiny: a sword is 10×10 source pixels, a buckler
 * 11×10, a wand 12×12, a dagger 8×7. Asking a 10px sprite to fill 62% of a
 * 390px phone axis is a 19–34× nearest-neighbour blow-up (`image-rendering:
 * pixelated`), and what lands in the corner is not a pose — it is individual
 * source pixels drawn as 13–35px squares. That is the player's report of "raw
 * sheet pixels", and it is worst for the SMALLEST weapons, because the rest
 * pose's share of the crop is the divisor: a dagger resolved to a 1105px-tall
 * element on an 844px screen.
 *
 * 8 is not a taste call: it is roughly what the WORLD is drawn at. A 48px tile
 * spans T=300 world px in the arena, about 6.25 screen px per source px before
 * the camera, so a viewmodel held at 8 is a shade crisper than the ground it
 * stands on and no more. It only ever binds where the art is too small to
 * honour the fraction — a larger sprite is unaffected and the framing, the
 * grip pivot and the hang off the corner are all unchanged.
 */
const MAX_SRC_PX = 8;
/**
 * Fraction of the WEAPON's rest pose hidden past the bottom edge, and past the
 * side. About half of what you carry is out of frame, which is what makes it
 * read as carried rather than displayed.
 *
 * THE ARM DOES NOT GET A VOTE HERE. There was a version that anchored on the
 * GRIP instead, so the whole hand would land in the near corner — and it put
 * the entire arm on screen, which is wrong twice over: a viewmodel with a
 * forearm parked in frame reads as a mannequin, and the arm's cut end (where
 * the mask stops following the limb toward a torso that is not in the shot) sat
 * right there in the middle of the picture with daylight through it. Framing is
 * the WEAPON's business. The arm hangs off the bottom behind it and is seen
 * when the swing brings it up, which is when you have an arm at all.
 */
const OFF_BOTTOM = 0.46, OFF_SIDE = 0.24;

/**
 * What a crucible FIGHTER is holding, translated into the guild kit vocabulary
 * the worn-art helpers speak. Engine gear lives in typed slots (RHand/LHand,
 * 'Sword'/'Buckler'/…); the sheets are keyed by guild item kinds + materials.
 * Tier (or refinement) stands in for material — a veteran's blade reads finer.
 *
 * EVERY armed hand shows its arm. This table used to stop at the blades, with
 * a note claiming wands and staves had no worn sheet — they do (art.js's
 * ITEM_WEAPON, wand1 and staff1), and the note had simply outlived the kit. A
 * caster standing in first person held nothing whatsoever, which reads as a bug
 * in the view rather than a choice about casters.
 */
const TYPE_KIND = {
  Sword: 'sword', Dagger: 'dagger', Axe: 'axe', Bow: 'bow', Crossbow: 'bow',
  Hammer: 'hammer', Mace: 'mace', Club: 'mace',
  Wand: 'wand', Staff: 'staff', Rod: 'wand',
};
export function fighterHandsSpec(fighter) {
  const g = (fighter && fighter.gear) || {};
  const mat = (it) => {
    const t = (it && (it.tier != null ? it.tier : it.refinement)) || 0;
    return t >= 4 ? 'mithril' : t >= 2 ? 'steel' : 'iron';
  };
  let weapon = null, offhand = null, shield = null;
  // Main hand first, and whatever is in the OTHER hand is the off-hand — a
  // shield if it is one, and otherwise the second weapon. Dual wielding used to
  // fall off the end of this loop entirely: a sword and dagger showed the sword
  // and nothing else, because only a Buckler was allowed to be an off-hand.
  for (const slot of ['RHand', 'LHand']) {
    const it = g[slot];
    if (!it) continue;
    if (it.type === 'Buckler') { if (!shield) shield = { material: mat(it), name: it.type }; continue; }
    const kind = TYPE_KIND[it.type];
    if (!kind) continue;
    const held = { kind, material: mat(it), name: it.type };
    if (!weapon) weapon = held;
    else if (!offhand) offhand = held;
  }
  return { weapon, offhand, shield, arms: armsOf(fighter) };
}

/**
 * The body sheet and skin tone this character's arms are drawn from.
 *
 * The compositor already answers this — `effectiveAppearance` folds Body gear
 * over the rolled look and hands back a `{name, c}` for the `top` layer — but
 * crucible.js is a global script with no ES exports, so `window.CharGen` is the
 * seam. Missing it is not an error: bare arms in the default tone are a real
 * answer for a character with nothing on the body, and it is what the fallback
 * draws. Exported because the delve resolves its own delver the same way.
 */
export function armsOf(subject) {
  try {
    const CG = typeof window !== 'undefined' && window.CharGen;
    if (!CG || !CG.bodyLayer) return null;
    return CG.bodyLayer(subject) || null;
  } catch (e) { return null; }
}

// ── Compositing the arm onto the weapon ─────────────────────────────────────

/** Try each candidate URL in order; the first that loads wins. (The compositor's
 *  own `_tryLoadFromBases` rule — a top stem does not say which pack holds it.) */
async function loadFirst(urls) {
  let last = null;
  for (const u of urls) {
    try { return await loadImg(u); } catch (e) { last = e; }
  }
  throw last || new Error('fp-hands: no candidate sheet loaded');
}

/** Whole-sheet pixels, once per image. Both masks below index into these. */
const _pixCache = new WeakMap();
function sheetPixels(img) {
  let p = _pixCache.get(img);
  if (p) return p;
  const c = document.createElement('canvas');
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  p = { w: c.width, h: c.height, d: g.getImageData(0, 0, c.width, c.height).data };
  _pixCache.set(img, p);
  return p;
}

/** Alpha mask of one 48px cell, as a flat cell×cell Uint8Array. */
function cellAlpha(pix, row, col, cell) {
  const m = new Uint8Array(cell * cell);
  for (let y = 0; y < cell; y++) {
    for (let x = 0; x < cell; x++) {
      const px = col * cell + x, py = row * cell + y;
      if (px >= pix.w || py >= pix.h) continue;
      m[y * cell + x] = pix.d[(py * pix.w + px) * 4 + 3] >= 12 ? 1 : 0;
    }
  }
  return m;
}

/**
 * The arm: body pixels within `reach` steps OF THE BODY of a pixel touching the
 * weapon.
 *
 * Seeds are the body pixels adjacent to the weapon — the hand on the grip,
 * which the art puts there by construction. The walk is GEODESIC (through body
 * pixels only), and that is the whole trick: a torso sits two pixels from a
 * sword's grip in a straight line but a dozen steps away along the arm, so a
 * radius would drag the chest in and a walk does not.
 */
function armMask(body, weapon, reach, cell) {
  const dist = new Int16Array(cell * cell).fill(-1);
  const q = [];
  for (let y = 0; y < cell; y++) {
    for (let x = 0; x < cell; x++) {
      if (!body[y * cell + x]) continue;
      let touching = false;
      for (let dy = -1; dy <= 1 && !touching; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= cell || ny >= cell) continue;
          if (weapon[ny * cell + nx]) { touching = true; break; }
        }
      }
      if (touching) { dist[y * cell + x] = 0; q.push(y * cell + x); }
    }
  }
  for (let h = 0; h < q.length; h++) {
    const p = q[h], x = p % cell, y = (p / cell) | 0;
    if (dist[p] >= reach) continue;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cell || ny >= cell) continue;
        const np = ny * cell + nx;
        if (!body[np] || dist[np] >= 0) continue;
        dist[np] = dist[p] + 1; q.push(np);
      }
    }
  }
  return dist;
}

/**
 * Bake the played frames into one strip: arm first, weapon over it.
 *
 * ARM UNDER, ALWAYS. Not a taste call — it is what keeps one rule working for
 * everything. A shield's silhouette CONTAINS the whole body cell (shield1L
 * covers x17-27 y16-25; the body at that frame is x18-27 y18-24), so drawing
 * the arm over it plastered a slab of torso across the boss, while drawing it
 * under makes the forearm disappear behind the shield — which is exactly what a
 * braced shield does to your forearm. The same order leaves a blade's
 * silhouette unbroken with the hand reading around the grip. No per-kind
 * special case, no threshold, and neither authored image is damaged.
 *
 * The strip is also what frees the rest of the rig from the 48px sheet: it is
 * our own format (one row, one column per played frame), so `handFrame` blits
 * column i and everything downstream measures the strip, not the source.
 */
/** The tight box one cell of a source sheet occupies, in cell-local pixels.
 *  Strip columns are copied 1:1 from their cell, so a box measured here is
 *  directly valid as strip-local coordinates. */
function cellBox(pix, row, col, cell) {
  let x0 = cell, y0 = cell, x1 = -1, y1 = -1;
  for (let y = 0; y < cell; y++) {
    for (let x = 0; x < cell; x++) {
      const px = col * cell + x, py = row * cell + y;
      if (px >= pix.w || py >= pix.h) continue;
      if (pix.d[(py * pix.w + px) * 4 + 3] < 12) continue;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function buildStrip(weaponImg, armsImg, frames, skinTone) {
  const S = WORN.cell;
  const strip = document.createElement('canvas');
  strip.width = S * frames.length;
  strip.height = S;
  // Read twice (the tone swap below, then stripUnion): declare it up front or
  // the browser warns and takes the slow path both times.
  const g = strip.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = false;

  let wp = null, ap = null, grip = null;
  // Pixel access needs the sheets to be same-origin; they are (vite serves
  // /public). If that ever changes, the arm is what is lost, not the weapon.
  try {
    wp = sheetPixels(weaponImg);
    if (armsImg) ap = sheetPixels(armsImg);
  } catch (e) {
    console.warn('fp-hands: could not read sheet pixels — drawing the weapon alone', e);
    ap = null;
  }

  frames.forEach((col, i) => {
    const ox = i * S;
    if (ap && wp) {
      const wm = cellAlpha(wp, WORN.row, col, S);
      const bm = cellAlpha(ap, WORN.row, col, S);
      const dist = armMask(bm, wm, WORN.armReach, S);
      // THE GRIP, for free: the seed pixels of that walk ARE the body touching
      // the weapon, which is the hand on the handle. Their centre is the point
      // fit() pins to the near corner. Taken from the rest frame only — the
      // grip must not wander while the swing plays.
      if (i === 0) {
        let gx = 0, gy = 0, n = 0;
        for (let y = 0; y < S; y++) {
          for (let x = 0; x < S; x++) {
            if (dist[y * S + x] !== 0) continue;
            gx += x; gy += y; n++;
          }
        }
        if (n) grip = { x: gx / n, y: gy / n };
      }
      const arm = g.createImageData(S, S);
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          if (dist[y * S + x] < 0) continue;
          const sx = col * S + x, sy = WORN.row * S + y;
          if (sx >= ap.w || sy >= ap.h) continue;
          const si = (sy * ap.w + sx) * 4, di = (y * S + x) * 4;
          arm.data[di] = ap.d[si];
          arm.data[di + 1] = ap.d[si + 1];
          arm.data[di + 2] = ap.d[si + 2];
          arm.data[di + 3] = ap.d[si + 3];
        }
      }
      g.putImageData(arm, ox, 0);
    }
    g.drawImage(weaponImg, col * S, WORN.row * S, S, S, ox, 0, S, S);
  });
  applyTone(g, strip, skinTone);
  // The REST BOX IS THE WEAPON'S, not the composite's — see the note on `rest`
  // where put() uses it. `grip` is null when there is no arm to find it with;
  // fit() then falls back to the bottom-centre of the weapon, which is where
  // the pivot sat before any of this existed.
  const rest = wp ? cellBox(wp, WORN.row, frames[0], S) : null;
  return { strip, rest, grip: grip || (rest ? { x: rest.x + rest.w / 2, y: rest.y + rest.h } : null) };
}

/**
 * Repaint the skin ramp for this member's tone — the same exact-RGB swap the
 * third-person compositor does to every body layer it draws.
 *
 * ONE WORLD: a Tone-3 delver whose standee has dark arms cannot have pale ones
 * in first person, and the two must agree by sharing the table rather than by
 * both happening to look right. Applied to the WHOLE strip, weapon included,
 * because the compositor tones the weapon sheets too — the darkest skin colour
 * doubles as the outline on shield1L, bow1 and pickaxe1, so toning the arm and
 * not the weapon would leave a seam down the middle of the thing being held.
 */
function applyTone(g, strip, skinTone) {
  const tone = ELEMENTS_SKIN_TONES[skinTone | 0];
  if (!tone || !tone.target) return;           // 0 = Default, an identity swap
  const map = new Map();
  for (let i = 0; i < ELEMENTS_SKIN_SOURCE.length; i++) {
    const s = ELEMENTS_SKIN_SOURCE[i];
    map.set((s[0] << 16) | (s[1] << 8) | s[2], tone.target[i]);
  }
  try {
    const img = g.getImageData(0, 0, strip.width, strip.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const t = map.get((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
      if (t) { d[i] = t[0]; d[i + 1] = t[1]; d[i + 2] = t[2]; }
    }
    g.putImageData(img, 0, 0);
  } catch (e) {
    // A tainted canvas costs the tone, not the hands. (The compositor warns
    // about the same case for the same reason — see _applyToneToImg.)
    console.warn('fp-hands: skin tone not applied', e);
  }
}

/** The tight box a set of strip columns occupies — union, or the art jumps as
 *  it plays. Cell-local coordinates, measured on the strip we just baked. */
function stripUnion(strip, cols) {
  const S = WORN.cell;
  try {
    const g = strip.getContext('2d', { willReadFrequently: true });
    const d = g.getImageData(0, 0, strip.width, strip.height).data;
    let x0 = S, y0 = S, x1 = -1, y1 = -1;
    for (const col of cols) {
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const px = col * S + x;
          if (px >= strip.width || y >= strip.height) continue;
          if (d[(y * strip.width + px) * 4 + 3] < 12) continue;
          if (x < x0) x0 = x;
          if (y < y0) y0 = y;
          if (x > x1) x1 = x;
          if (y > y1) y1 = y;
        }
      }
    }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  } catch (e) {
    console.warn('fp-hands: could not measure hand art', e);
    return null;
  }
}

function handFrame(hand, i) {
  if (hand.at === i) return;
  hand.at = i;
  const S = WORN.cell, b = hand.box;
  const g = hand.cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, b.w, b.h);
  g.drawImage(hand.strip, i * S + b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
}

function playFrames(hand) {
  if (!hand) return;
  clearInterval(hand.timer);
  let i = 0;
  handFrame(hand, 0);
  hand.timer = setInterval(() => {
    i++;
    if (i >= hand.n) { clearInterval(hand.timer); hand.timer = 0; handFrame(hand, 0); return; }
    handFrame(hand, i);
  }, WORN.frameMs);
}

/** Retrigger a CSS animation: class off, reflow, class on. */
function fire(el, cls) {
  if (!el) return;
  el.classList.remove(cls);
  void el.getBoundingClientRect();
  el.classList.add(cls);
}

/**
 * Build a hands rig inside `layer` (an element carrying the `fp-hands` class,
 * absolutely filling its lens' host). Returns the handle immediately; sheet
 * loads land on `handle.ready`. Callers re-`fit()` on resize, `swing()` on an
 * attack, `brace()` on a guard, and `dispose()` when the lens closes — every
 * await double-checks the handle is still live, because a sheet load is slow
 * enough to outlive the battle that asked for it.
 *
 * `spec.pick` mounts the delver's pick as a third hand; `spec.arms` is the
 * top-layer stem the arms come from (null = bare).
 */
export function createFpHands(layer, spec) {
  layer.innerHTML = '<svg class="fp-slash" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">'
    + '<path d="M92 6 C 60 34, 34 60, 8 94" /></svg>';
  // `delver` is the DELVE lens, not "has a pick": it decides stow arbitration
  // and the swing-time shield brace, and must hold even if the pick sheet fails.
  const H = { layer, weapon: null, offhand: null, shield: null, pick: null,
    dead: false, bow: false, delver: !!(spec && spec.pick) };
  // TAKE THE CLASS OFF WHEN THE ANIMATION ENDS. `fire()` only ever put it on,
  // and nothing anywhere took it off again, so `fp-swinging` was permanent from
  // a member's first swing. Two things went quietly wrong for the rest of the
  // delve: `.fp-hand.fp-swinging { filter: none }` killed that hand's drop
  // shadow for good, and every `:not(.fp-swinging)` guard — the duel duck, and
  // now the climb and swim poses — stopped matching, so those states could
  // never move a hand again. One delegated listener covers both hands, the
  // pick and the slash SVG.
  layer.addEventListener('animationend', (e) => {
    if (e.target === e.currentTarget) return;
    e.target.classList.remove('fp-swinging', 'fp-bracing');
  });
  const arms = (spec && spec.arms) || null;
  const armsUrls = wornArms(arms && arms.file).urls;
  const skinTone = (arms && arms.skinTone) | 0;

  const put = async (src, frames, cls, title) => {
    if (!src) return null;
    try {
      const img = await loadImg(src.url);
      if (H.dead) return null;
      // The arms are optional in the strictest sense: if the body sheet will not
      // load we still want the weapon, because a floating sword is the bug we
      // had and an empty screen would be a worse one.
      let armsImg = null;
      try { armsImg = await loadFirst(armsUrls); } catch (e) { armsImg = null; }
      if (H.dead) return null;
      const built = buildStrip(img, armsImg, frames, skinTone);
      const strip = built.strip;
      // The CROP is the whole composite over every frame it plays, or the arm
      // gets clipped and the swing jumps.
      const box = stripUnion(strip, frames.map((_, i) => i));
      if (!box) return null;
      // The REST POSE, which fit() sizes and places from, is the WEAPON ALONE.
      //
      // It is tempting to measure the composite — but the arm runs DOWN AND
      // INWARD from the grip toward a torso that is not in frame, so including
      // it grows the rest box downward, and OFF_BOTTOM (which hides 46% of the
      // rest pose past the bottom edge) then hides the HAND and leaves the blade
      // floating. Measuring the weapon keeps every tuned constant meaning what
      // it meant before the arm existed: the weapon sits exactly where it has
      // always sat, and the arm is extra pixels that hang off the corner behind
      // it — which is what an arm does.
      const rest = built.rest || stripUnion(strip, [0]) || box;
      const cv = document.createElement('canvas');
      cv.width = box.w; cv.height = box.h;
      const el = document.createElement('div');
      el.className = 'fp-hand ' + cls;
      el.title = title || '';
      el.appendChild(cv);
      layer.appendChild(el);
      // The off-hand — shield or second weapon — is the LEFT hand, because the
      // sheet's north row draws the main hand right of centre and the other
      // left of it. That is where your hands are when you look at your own back.
      const off = cls.indexOf('shield') >= 0 || cls.indexOf('offhand') >= 0;
      // Never null: if the pixels could not be read at all there is no arm and
      // no measured grip, and the pivot falls back to the bottom-centre of the
      // weapon — where it sat before any of this existed.
      const grip = built.grip || { x: rest.x + rest.w / 2, y: rest.y + rest.h };
      const hand = { el, cv, strip, box, rest, grip, n: frames.length, at: -1, timer: 0,
        side: off ? 'left' : 'right', kind: cls.indexOf('shield') >= 0 ? 'shield' : 'weapon' };
      handFrame(hand, 0);
      return hand;
    } catch (e) {
      console.warn('fp-hands: hand art missing', cls, e);
      return null;
    }
  };

  const all = () => [H.weapon, H.offhand, H.shield, H.pick].filter(Boolean);

  H.fit = () => {
    const W = layer.clientWidth || 1280, Hh = layer.clientHeight || 720;
    // Size against the SMALLER axis, not the height. A held weapon is a
    // fraction of your field of view, and in a tall portrait window "62% of the
    // height" is most of the screen: on a phone held upright the sword filled
    // the room. Landscape is unaffected — there the height is already the
    // smaller term — so this only bites where it was wrong.
    const base = Math.min(Hh, W * 0.78);
    for (const h of all()) {
      const b = h.box, r = h.rest;
      const share = r.h / b.h;                       // how much of the crop the rest pose is
      // Two ceilings, and the art gets the last word: a fraction of the lens,
      // AND no more than MAX_SRC_PX screen px per source px. @see MAX_SRC_PX.
      const restH = Math.min((h.kind === 'shield' ? SHIELD_H : REST_H) * base,
                             r.h * MAX_SRC_PX);
      const elH = Math.round(restH / share);
      const elW = Math.round(elH * (b.w / b.h));
      const restW = elW * (r.w / b.w);
      h.el.style.height = elH + 'px';
      h.el.style.width = elW + 'px';
      // Where the rest pose sits inside the crop, as fractions of the crop.
      const right = (r.x + r.w - b.x) / b.w, left = (r.x - b.x) / b.w;
      const bottom = (r.y + r.h - b.y) / b.h;
      // Hang it off the edge: the rest pose's own bottom goes BELOW the frame
      // by OFF_BOTTOM of its height, and its outer edge past the side by
      // OFF_SIDE of its width. Everything is measured from the rest pose, so a
      // sword and a buckler hang by the same amount of themselves.
      h.el.style.top = 'auto';
      h.el.style.bottom = Math.round(-OFF_BOTTOM * restH - (1 - bottom) * elH) + 'px';
      const push = Math.round(-OFF_SIDE * restW);
      if (h.side === 'left') { h.el.style.left = Math.round(push - left * elW) + 'px'; h.el.style.right = 'auto'; }
      else { h.el.style.right = Math.round(push - (1 - right) * elW) + 'px'; h.el.style.left = 'auto'; }
      // The PIVOT is the GRIP — measured, not guessed at the box's bottom-centre
      // — so the CSS swing's rotation reads as a wrist. About the box centre,
      // hundreds of px from the visible weapon once the element has been grown
      // to near screen height, the same keyframes carried it around the viewport.
      const gx = (h.grip.x - b.x) / b.w, gy = (h.grip.y - b.y) / b.h;
      h.el.style.transformOrigin = (gx * 100).toFixed(1) + '% ' + (gy * 100).toFixed(1) + '%';
    }
  };

  // Dual wielding alternates: a swing that always led with the same hand would
  // make the second weapon scenery.
  let lead = 0;
  /**
   * Throw the swing. `mining` brings the pick out and stows the blade for the
   * duration, because you do not open a vein with a sword.
   */
  H.swing = (mining) => {
    let h;
    if (H.delver) {
      // One hand leads and the other stows. The stowed hand must also DROP its
      // swing class: an animation outranks a plain transform, so a pick left
      // mid-swing would keep swinging from inside the holster.
      h = mining ? (H.pick || H.weapon) : (H.weapon || H.pick);
      for (const o of [H.weapon, H.pick]) {
        if (!o) continue;
        const off = o !== h;
        o.el.classList.toggle('fp-stowed', off);
        if (off) { o.el.classList.remove('fp-swinging'); clearInterval(o.timer); o.timer = 0; handFrame(o, 0); }
      }
    } else {
      const hands = [H.weapon, H.offhand].filter(Boolean);
      h = hands.length ? hands[lead++ % hands.length] : null;
    }
    if (h) { fire(h.el, 'fp-swinging'); playFrames(h); }
    fire(layer.querySelector('.fp-slash'), 'fp-swinging');
    // A delve swing braces the shield on the same beat — the arm you are not
    // swinging with is the one keeping you alive. Keyed to the LENS, not to
    // whether the pick happened to load: a missing pick sheet must not silently
    // cost the delve its shield animation too.
    if (H.delver && H.shield) { fire(H.shield.el, 'fp-bracing'); playFrames(H.shield); }
  };
  H.brace = () => {
    if (H.shield) { fire(H.shield.el, 'fp-bracing'); playFrames(H.shield); }
    else if (H.offhand) { fire(H.offhand.el, 'fp-swinging'); playFrames(H.offhand); }
  };
  /** A raised shield has to LOOK raised, or the only feedback for a key you are
   *  holding down is that you cannot attack. */
  H.guard = (on) => {
    if (!H.shield || on === H._guard) return;
    H._guard = on;
    H.shield.el.classList.toggle('fp-guarding', !!on);
  };
  H.dispose = () => {
    H.dead = true;
    for (const h of all()) clearInterval(h.timer);
    layer.innerHTML = '';
  };

  H.ready = (async () => {
    const w = spec && spec.weapon, o = spec && spec.offhand, s = spec && spec.shield;
    H.bow = !!(w && w.kind === 'bow');
    const SW = [WORN.rest].concat(WORN.swing);
    H.weapon = await put(w && wornWeapon(w.kind, w.material), H.bow ? WORN.bowDraw : SW, 'fp-hand-weapon', w && w.name);
    // A bow is two-handed: nothing goes in the other hand behind it.
    if (!H.dead && !H.bow) {
      if (s) H.shield = await put(wornShield(s.material), WORN.shieldBrace, 'fp-hand-shield', s.name);
      else if (o) H.offhand = await put(wornWeapon(o.kind, o.material), SW, 'fp-hand-offhand', o.name);
    }
    // The PICK is not equipment — it is what a delver walks in carrying. It
    // comes out for a seam whatever else is in hand, and when the weapon slot
    // is empty it is the only thing there, so the hands are never simply blank.
    if (!H.dead && H.delver) {
      H.pick = await put(wornPick(), SW, 'fp-hand-pick' + (H.weapon ? ' fp-stowed' : ''), 'Delver’s pick');
    }
    if (!H.dead) {
      H.fit();
      for (const h of all()) h.el.classList.add('fp-ready');
    }
    return H;
  })();

  return H;
}
