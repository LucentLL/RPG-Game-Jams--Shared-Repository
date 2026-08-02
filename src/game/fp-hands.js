/**
 * @file The held viewmodel — your weapon and shield, raised to the screen —
 * shared by EVERY first-person lens.
 *
 * The Wilds delve built this first (delve-fp.js mountHands) and the two arena
 * cameras shipped without it, which read instantly as "a different system":
 * standing in your fighter with empty hands is standing in nobody. This module
 * is that viewmodel extracted to a neutral seam so the delve, the tactical
 * board and the action arena hold the same steel the same way — same WORN
 * sheets, same rest-frame fitting, same swing.
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
import { WORN, wornWeapon, wornShield } from '../guild/art.js';

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
/** Fraction of the rest pose hidden past the bottom edge, and past the side. */
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
  return { weapon, offhand, shield };
}

/** The tight box a set of frames occupies inside one row of a 48px sheet —
 *  union over the frames, or the art jumps as it plays. (delve-fp's rule.) */
function cellUnion(img, row, cols) {
  const S = WORN.cell;
  try {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let x0 = S, y0 = S, x1 = -1, y1 = -1;
    for (const col of cols) {
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const px = col * S + x, py = row * S + y;
          if (px >= c.width || py >= c.height) continue;
          if (d[(py * c.width + px) * 4 + 3] < 12) continue;
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

function handFrame(hand, col) {
  if (hand.at === col) return;
  hand.at = col;
  const S = WORN.cell, b = hand.box;
  const g = hand.cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, b.w, b.h);
  g.drawImage(hand.img, col * S + b.x, WORN.row * S + b.y, b.w, b.h, 0, 0, b.w, b.h);
}

function playFrames(hand, cols) {
  if (!hand) return;
  clearInterval(hand.timer);
  let i = 0;
  handFrame(hand, cols[0]);
  hand.timer = setInterval(() => {
    i++;
    if (i >= cols.length) { clearInterval(hand.timer); hand.timer = 0; handFrame(hand, hand.frames[0]); return; }
    handFrame(hand, cols[i]);
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
 */
export function createFpHands(layer, spec) {
  layer.innerHTML = '<svg class="fp-slash" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">'
    + '<path d="M92 6 C 60 34, 34 60, 8 94" /></svg>';
  const H = { layer, weapon: null, offhand: null, shield: null, dead: false, bow: false };

  const put = async (src, frames, cls, title) => {
    if (!src) return null;
    try {
      const img = await loadImg(src.url);
      if (H.dead) return null;
      const box = cellUnion(img, WORN.row, frames);
      if (!box) return null;
      const rest = cellUnion(img, WORN.row, [frames[0]]) || box;
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
      const hand = { el, cv, img, box, rest, frames, at: -1, timer: 0,
        side: off ? 'left' : 'right', kind: cls.indexOf('shield') >= 0 ? 'shield' : 'weapon' };
      handFrame(hand, frames[0]);
      return hand;
    } catch (e) {
      console.warn('fp-hands: hand art missing', cls, e);
      return null;
    }
  };

  H.fit = () => {
    const W = layer.clientWidth || 1280, Hh = layer.clientHeight || 720;
    // Size against the SMALLER axis, not the height. A held weapon is a
    // fraction of your field of view, and in a tall portrait window "62% of the
    // height" is most of the screen: on a phone held upright the sword filled
    // the room. Landscape is unaffected — there the height is already the
    // smaller term — so this only bites where it was wrong.
    const base = Math.min(Hh, W * 0.78);
    for (const h of [H.weapon, H.offhand, H.shield]) {
      if (!h) continue;
      const b = h.box, r = h.rest;
      const share = r.h / b.h;                       // how much of the crop the rest pose is
      const restH = (h.kind === 'shield' ? SHIELD_H : REST_H) * base;
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
      h.el.style.bottom = Math.round(-OFF_BOTTOM * restH - (1 - bottom) * elH) + 'px';
      const push = Math.round(-OFF_SIDE * restW);
      if (h.side === 'left') h.el.style.left = Math.round(push - left * elW) + 'px';
      else h.el.style.right = Math.round(push - (1 - right) * elW) + 'px';
      h.el.style.transformOrigin = ((r.x + r.w / 2 - b.x) / b.w * 100).toFixed(1) + '% '
        + ((r.y + r.h - b.y) / b.h * 100).toFixed(1) + '%';
    }
  };

  // Dual wielding alternates: a swing that always led with the same hand would
  // make the second weapon scenery.
  let lead = 0;
  H.swing = () => {
    const hands = [H.weapon, H.offhand].filter(Boolean);
    const h = hands.length ? hands[lead++ % hands.length] : null;
    if (h) { fire(h.el, 'fp-swinging'); playFrames(h, h.frames); }
    fire(layer.querySelector('.fp-slash'), 'fp-swinging');
  };
  H.brace = () => {
    if (H.shield) { fire(H.shield.el, 'fp-bracing'); playFrames(H.shield, H.shield.frames); }
    else if (H.offhand) { fire(H.offhand.el, 'fp-swinging'); playFrames(H.offhand, H.offhand.frames); }
  };
  H.dispose = () => {
    H.dead = true;
    for (const h of [H.weapon, H.offhand, H.shield]) if (h) clearInterval(h.timer);
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
    if (!H.dead) {
      H.fit();
      for (const h of [H.weapon, H.offhand, H.shield]) if (h) h.el.classList.add('fp-ready');
    }
    return H;
  })();

  return H;
}
