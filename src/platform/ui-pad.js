/**
 * @file A cursor for the menus — the controller's half of the game outside combat.
 *
 * The battle lenses learned to take a pad; everything else in the game is a DOM
 * screen built out of 260-odd buttons and about as many `onclick` divs, and a
 * controller could not touch a single one of them. This module gives that DOM a
 * CURSOR: a highlighted element you move with the stick or the d-pad, activate
 * with A, and back out of with B. It is the same idea a console menu has always
 * used, and it is deliberately not a fake mouse pointer pushed around by the
 * stick — that is slower, less precise, and sets off every hover style on the
 * way past.
 *
 * THE GOVERNING RULE: the pad reaches exactly what the mouse reaches. Not more
 * (a control the mouse cannot click must not become pad-clickable), and not
 * less (a card that merely LOOKS disabled but whose handler guards internally
 * stays reachable, because that is what a mouse gets). Everything below —
 * the candidate filter, the activation, the back ladder — falls out of it.
 *
 * Three things make it work on a codebase that never planned for it:
 *
 *   • It reads the DOM, not a registry. Nothing has to be declared navigable.
 *     A screen written tomorrow is navigable the day it renders.
 *   • It moves SPATIALLY, by geometry, not in document order. The guild hall is
 *     a rail beside a stage and the hub is a grid; in document order "right"
 *     and "down" would be the same key and crossing from rail to stage would
 *     mean walking every chip.
 *   • It survives the rug being pulled. hall.js re-renders whole screens on
 *     every press, so the cursor is remembered by a stable KEY and re-found
 *     after the wipe — and failing that, by where it last was on screen.
 *
 * It never fights a combat lens: a lens registers a predicate with `claimPad`,
 * and while any predicate is true this module does not so much as READ the pad.
 * That is stronger than ignoring the input, and it has to be — readPad()
 * memoises a frame, so a second reader would share the lens's button edges and
 * silently double-fire them.
 *
 * The same cursor is driven by the arrow keys, Enter and Escape, because Tab
 * does nothing useful here: the game has no tabindex anywhere and a third of
 * its controls are divs. @see ./input.js for the pad itself.
 */
import { readPad, PAD } from './input.js';

// ---------------------------------------------------------------------------
// Who owns the pad
// ---------------------------------------------------------------------------

const _claims = new Set();

/**
 * Register a lens that steers with the controller. While the predicate is
 * true, this module leaves the pad entirely alone.
 *
 * A predicate rather than a flag, and the LENS's predicate rather than one kept
 * here, because only the lens knows the difference between "my screen is up"
 * and "I am steering": a delve showing its end-of-run summary card is still
 * open, and that card is plain DOM that ought to be navigable.
 *
 * @param {() => boolean} fn
 * @returns {() => void} unregister
 */
export function claimPad(fn) {
  if (typeof fn !== 'function') return () => {};
  _claims.add(fn);
  return () => _claims.delete(fn);
}

function lensOwnsPad() {
  for (const f of _claims) {
    try { if (f()) return true; } catch (_) { /* a broken claim must not freeze the menus */ }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Where the cursor is allowed to be
// ---------------------------------------------------------------------------

const click = (el) => { if (el) el.click(); };

/**
 * The layers that can sit over a screen, in descending z-order, each with the
 * one thing B should mean while it is up. Probed top-down, so when a scroll and
 * the globe are both open the globe wins — which is what the mouse can reach.
 *
 * `back: null` is a statement, not an omission: the tourney lens gates an
 * awaited promise and closing it would hang a week advance.
 */
const ROOTS = [
  { sel: '#readyOverlay', back: (el) => el.remove() },
  { sel: '.dv-choose', back: (el) => click(el.querySelector('.dvc-cancel')) },
  { sel: '.delve-summary', back: (el) => click(el.querySelector('.dv-close')) },
  { sel: '.globe-overlay', back: () => window.__globe && window.__globe.close(), escOwned: true },
  { sel: '.scrollui-veil', back: () => window.__scrollUi && window.__scrollUi.close(), escOwned: true },
  { sel: '.lens-overlay', back: null },
  { sel: '.assembly-overlay', back: (el) => click(el.querySelector('.as-dismiss,.assembly-close')) },
  { sel: '.mat-detail-overlay.show', back: () => window.closeMatDetail && window.closeMatDetail() },
  { sel: '.craft-overlay.show', back: () => window.cancelCraft && window.cancelCraft() },
];

/**
 * Is this overlay actually up?
 *
 * Two tests that look obvious and are both wrong here:
 *   • `offsetParent !== null` is null for every `position: fixed` element, and
 *     every overlay in this game is fixed — it sees none of them.
 *   • `opacity !== '0'` misses the globe, which mounts at 0 and fades in over
 *     280ms; for its first frames it is up, interactive, and invisible to that
 *     test. The overlays that DO park in the DOM while closed are already
 *     pinned to their `.show` class in ROOTS, so opacity has nothing left to say.
 */
function onScreen(el) {
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return false;
  const cs = getComputedStyle(el);
  return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.pointerEvents !== 'none';
}

function padRoot() {
  for (const r of ROOTS) {
    let el = null;
    try { el = document.querySelector(r.sel); } catch (_) { continue; }
    if (el && onScreen(el)) return { el, rule: r };
  }
  const s = document.querySelector('.screen.active');
  return s ? { el: s, rule: null } : null;
}

/**
 * What counts as a control.
 *
 * Three unions, because the game says "clickable" three ways: real focusable
 * elements, an inline `onclick=` attribute, and a handler assigned as a
 * PROPERTY (`el.onclick = fn`) — which leaves no attribute to match on, so
 * those few classes are named. `[data-pad]` is the escape hatch for whatever
 * comes next.
 */
const SEL = [
  'button:not([disabled])',
  'input:not([disabled]):not([type=hidden])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[onclick]',
  '.gear-card', '.cell', '.shop-item', '.mq-step', '.globe-mk',
  '[data-pad]',
].join(',');

/** Controls that already have a first-class pad binding of their own. The
 *  attack bar and the crawler's d-pad are hold-to-charge, bound on pointerdown
 *  — a synthetic click would press them without ever letting go. */
const SKIP = '[data-pad-skip],.fp-pad,.action-attacks';

function usable(el, clip) {
  if (el.closest(SKIP)) return false;
  if (el.disabled) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  // Clip BEFORE asking for computed style: the build plan renders 46×46 cells
  // and getComputedStyle on two thousand of them, every frame, is the whole
  // frame. Geometry is cheap; style is not.
  if (r.bottom < clip.top || r.top > clip.bottom || r.right < clip.left || r.left > clip.right) return false;
  const cs = getComputedStyle(el);
  if (cs.pointerEvents === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
  return true;
}

let _root = null;

function candidates() {
  const r = padRoot();
  _root = r;
  if (!r) return [];
  const box = r.el.getBoundingClientRect();
  const clip = {
    top: Math.max(0, box.top), left: Math.max(0, box.left),
    bottom: Math.min(innerHeight, box.bottom), right: Math.min(innerWidth, box.right),
  };
  const out = [];
  for (const el of r.el.querySelectorAll(SEL)) if (usable(el, clip)) out.push(el);
  return out;
}

/** A name for a control that survives its element being thrown away and rebuilt.
 *  hall.js re-renders whole screens on every press; without this the cursor
 *  would land back at the top of the list after every single click. */
function keyOf(el) {
  return el.id
    || el.getAttribute('data-pad-key')
    || (el.className || '') + '|' + (el.getAttribute('onclick') || '') + '|' + (el.textContent || '').trim().slice(0, 40);
}

// ---------------------------------------------------------------------------
// The cursor
// ---------------------------------------------------------------------------

let cursorEl = null, lastKey = '', lastRect = null;
let navMode = false;          // is the ring showing? (false for mouse users)

function setCursor(el) {
  if (cursorEl === el) { if (el) bringIntoView(el); return; }
  if (cursorEl) {
    cursorEl.classList.remove('pad-focus');
    try { cursorEl.blur(); } catch (_) {}
  }
  cursorEl = el || null;
  if (!cursorEl) { lastKey = ''; lastRect = null; return; }
  lastKey = keyOf(cursorEl);
  cursorEl.classList.add('pad-focus');
  // tabindex -1 makes anything programmatically focusable WITHOUT joining the
  // tab ring — 264 controls in a linear tab order would be worse than none.
  if (!cursorEl.hasAttribute('tabindex') && !/^(BUTTON|INPUT|SELECT|TEXTAREA|A)$/.test(cursorEl.tagName)) {
    cursorEl.setAttribute('tabindex', '-1');
  }
  try { cursorEl.focus({ preventScroll: true }); } catch (_) {}
  bringIntoView(cursorEl);
  const r = cursorEl.getBoundingClientRect();
  lastRect = { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
}

function bringIntoView(el) {
  // Instant, never smooth: the scroll overlay's parchment roller is driven by
  // its own scrollTop, and a smooth scroll would fight that animation frame
  // for frame. `nearest` leaves an already-visible control exactly where it is.
  try { el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' }); } catch (_) {}
}

/**
 * Direction scoring. Two passes in one number: anything sharing a lane with the
 * cursor scores under 100000 and wins outright; everything else is a fallback,
 * ranked by how far off-axis it is. A menu has no diagonals, so a step is
 * always one of four, and a candidate must be strictly PAST the cursor to count
 * — otherwise a tall element beside a short one captures both directions.
 */
function score(cur, c, d) {
  const sign = (d === 'right' || d === 'down') ? 1 : -1;
  const horiz = (d === 'left' || d === 'right');
  const cp = horiz ? c.left + c.width / 2 : c.top + c.height / 2;
  const rp = horiz ? cur.left + cur.width / 2 : cur.top + cur.height / 2;
  const gap = (cp - rp) * sign;
  if (gap <= 1) return Infinity;
  const [ca, cb] = horiz ? [c.top, c.bottom] : [c.left, c.right];
  const [ra, rb] = horiz ? [cur.top, cur.bottom] : [cur.left, cur.right];
  const overlap = Math.min(cb, rb) - Math.max(ca, ra);
  const minLen = Math.min(cb - ca, rb - ra) || 1;
  const ortho = Math.abs((ca + cb) / 2 - (ra + rb) / 2);
  if (overlap >= minLen * 0.25) return gap + ortho * 0.15;
  return 100000 + gap + ortho * 2;
}

function move(dir) {
  const list = candidates();
  if (!list.length) { setCursor(null); return; }
  if (!cursorEl || !cursorEl.isConnected || list.indexOf(cursorEl) < 0) { setCursor(list[0]); return; }
  const cur = cursorEl.getBoundingClientRect();
  let best = null, bestS = Infinity;
  for (const el of list) {
    if (el === cursorEl) continue;
    const s = score(cur, el.getBoundingClientRect(), dir);
    if (s < bestS) { bestS = s; best = el; }
  }
  if (best) setCursor(best);
  else {
    // Nothing that way. If the context scrolls, the wall may just be the edge
    // of the viewport rather than the edge of the menu.
    const sc = scroller(cursorEl);
    if (sc && (dir === 'up' || dir === 'down')) {
      sc.scrollTop += (dir === 'down' ? 1 : -1) * 120;
      const l2 = candidates();
      const cur2 = cursorEl.isConnected ? cursorEl.getBoundingClientRect() : cur;
      let b2 = null, s2 = Infinity;
      for (const el of l2) { if (el === cursorEl) continue; const s = score(cur2, el.getBoundingClientRect(), dir); if (s < s2) { s2 = s; b2 = el; } }
      if (b2) setCursor(b2);
    }
  }
}

function scroller(from) {
  for (let e = from; e && e !== document.body; e = e.parentElement) {
    const cs = getComputedStyle(e);
    if (/auto|scroll/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 4) return e;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Acting on it
// ---------------------------------------------------------------------------

function activate(el) {
  if (!el || !el.isConnected) return;
  // The dice roll takes the screen for a beat and a mouse cannot click past it.
  // .click() does no hit-testing, so without this the pad could.
  const dice = document.querySelector('.dice-overlay.show');
  if (dice && getComputedStyle(dice).pointerEvents !== 'none') return;
  maskHeld();
  try { el.click(); } catch (_) {}
}

/**
 * B, down a ladder that never guesses.
 *
 * There is no single back convention in this game — an overlay has its own
 * closer, a screen has whatever button it was given, and several screens have
 * no way back at all because the game does not offer one. Where the ladder ends
 * without an answer, B does nothing. A back button that sometimes means "leave
 * the run" is worse than no back button.
 */
function back() {
  const r = _root || padRoot();
  if (!r) return;
  if (r.rule) { if (r.rule.back) r.rule.back(r.el); return; }
  const btn = r.el.querySelector('[data-pad-back]');
  if (btn) activate(btn);
}

// ---------------------------------------------------------------------------
// Surviving a re-render
// ---------------------------------------------------------------------------

let pending = 0, lastRootEl = null;

/**
 * Put the cursor somewhere legal, and keep it where it was if that is still a
 * place. Called before every action and on every DOM change, because the cursor
 * can be invalidated two quite different ways:
 *
 *   • THE SCREEN CHANGED. showScreen only flips a class — no nodes move — so no
 *     mutation fires and the cursor would sit, invisible and still clickable, on
 *     the screen you just left. Pressing A would then activate a button nobody
 *     can see. A new root always starts at its first control.
 *   • THE SCREEN REBUILT ITSELF. hall.js re-renders wholesale on every press, so
 *     the very node under the cursor is thrown away and an identical one takes
 *     its place. Landing back at the top of the list every time would make the
 *     guild unusable, so the cursor is re-found by its KEY, and failing that by
 *     what is now nearest to where it visually was.
 */
function recover() {
  pending = 0;
  if (!navMode) return;
  // Never yank the caret out of a name field mid-word.
  const ae = document.activeElement;
  if (ae && ae !== cursorEl && /^(INPUT|TEXTAREA)$/.test(ae.tagName)) return;
  const r = padRoot();
  _root = r;
  if (!r) { if (cursorEl) setCursor(null); return; }
  const rootChanged = r.el !== lastRootEl;
  lastRootEl = r.el;
  if (!rootChanged && cursorEl && cursorEl.isConnected && r.el.contains(cursorEl)) {
    cursorEl.classList.add('pad-focus');   // still there; a re-render may have stripped the class
    return;
  }
  const list = candidates();
  const stale = cursorEl;
  cursorEl = null;                         // the old node is gone or off-screen: do not unstyle it
  if (stale && stale.isConnected) stale.classList.remove('pad-focus');
  if (!list.length) { lastKey = ''; lastRect = null; return; }
  let next = null;
  if (!rootChanged) {
    next = lastKey ? list.find((e) => keyOf(e) === lastKey) : null;
    if (!next && lastRect) {
      let bd = Infinity;
      for (const e of list) {
        const b = e.getBoundingClientRect();
        const d = Math.hypot(b.left + b.width / 2 - lastRect.cx, b.top + b.height / 2 - lastRect.cy);
        if (d < bd) { bd = d; next = e; }
      }
    }
  }
  setCursor(next || list[0]);
}

function watchDom() {
  const mo = new MutationObserver(() => {
    if (!navMode || pending) return;
    pending = requestAnimationFrame(recover);
  });
  mo.observe(document.body, { childList: true, subtree: true });
}

// ---------------------------------------------------------------------------
// Modes — the ring belongs to whoever is steering
// ---------------------------------------------------------------------------

function enter() {
  const was = navMode;
  navMode = true;
  if (!was) document.body.classList.add('pad-nav');
  recover();     // the screen may have changed since the cursor was last placed
}

/** A hand back on the mouse takes the ring away — but NOT the cursor's place,
 *  so coming back to the pad resumes where you were. */
function leave() {
  if (!navMode) return;
  navMode = false;
  document.body.classList.remove('pad-nav');
  if (cursorEl) {
    cursorEl.classList.remove('pad-focus');
    try { cursorEl.blur(); } catch (_) {}
  }
}

// ---------------------------------------------------------------------------
// Repeat, and the button mask
// ---------------------------------------------------------------------------

const REPEAT_DELAY = 380, REPEAT_RATE = 130;
const FIRE = 0.55, ARM = 0.35;
let heldDir = null, heldSince = 0, lastStep = 0;

function stickDir(p) {
  const dx = (p.down(PAD.RIGHT) ? 1 : 0) - (p.down(PAD.LEFT) ? 1 : 0);
  const dy = (p.down(PAD.DOWN) ? 1 : 0) - (p.down(PAD.UP) ? 1 : 0);
  if (dx) return dx > 0 ? 'right' : 'left';
  if (dy) return dy > 0 ? 'down' : 'up';
  const ax = Math.abs(p.lx), ay = Math.abs(p.ly);
  // Hysteresis: a stick resting at 0.3 in a lazy diagonal would otherwise creep
  // one step at a time forever. Fire high, re-arm low.
  const live = heldDir ? ARM : FIRE;
  if (ax < live && ay < live) return null;
  return ax > ay ? (p.lx > 0 ? 'right' : 'left') : (p.ly > 0 ? 'down' : 'up');
}

function stepDue(dir, now) {
  if (dir !== heldDir) { heldDir = dir; heldSince = now; lastStep = now; return !!dir; }
  if (!dir) return false;
  if (now - heldSince >= REPEAT_DELAY && now - lastStep >= REPEAT_RATE) { lastStep = now; return true; }
  return false;
}

/**
 * A button already down when we take the pad back is not a press.
 *
 * Deliberately not padReset(): that forgets the previous frame, which makes
 * every held button read as FRESH on the next read — precisely the bug. A
 * masked button has to be seen released before it counts again.
 */
const masked = new Set();
function maskHeld() {
  const p = readPad(); if (!p) return;
  for (const i of [PAD.A, PAD.B, PAD.START, PAD.LB, PAD.RB]) if (p.down(i)) masked.add(i);
}
function hit(p, i) {
  if (masked.has(i)) { if (!p.down(i)) masked.delete(i); return false; }
  return p.hit(i);
}

// ---------------------------------------------------------------------------
// The loop
// ---------------------------------------------------------------------------

let raf = 0, wasOwned = false;

function tick(now) {
  raf = requestAnimationFrame(tick);
  pump(now);
}

function pump(now) {
  if (lensOwnsPad()) { wasOwned = true; if (navMode) leave(); return; }  // and NOT readPad — see the header
  if (wasOwned) { wasOwned = false; maskHeld(); return; }
  const p = readPad();
  if (!p) return;

  const dir = stickDir(p);
  if (stepDue(dir, now)) { enter(); move(dir); }

  // enter() re-validates the cursor first, so A can never fire a control on a
  // screen the player has already left.
  if (hit(p, PAD.A)) { enter(); if (cursorEl) activate(cursorEl); }
  if (hit(p, PAD.B)) { enter(); back(); }
  // Shoulders page the nearest scroller — a long ledger or roster is a lot of
  // single steps otherwise.
  const page = (hit(p, PAD.RB) ? 1 : 0) - (hit(p, PAD.LB) ? 1 : 0);
  if (page) {
    enter();
    const sc = scroller(cursorEl || (_root && _root.el)) || (_root && _root.el);
    if (sc) { sc.scrollTop += page * sc.clientHeight * 0.8; recover(); }
  }
  // The right stick scrolls without moving the cursor — for reading, not choosing.
  if (Math.abs(p.ry) > 0.3) {
    const sc = scroller(cursorEl || (_root && _root.el));
    if (sc) sc.scrollTop += p.ry * 22;
  }
}

// ---------------------------------------------------------------------------
// Keyboard — the same cursor, for people without a pad
// ---------------------------------------------------------------------------

function wireKeyboard() {
  addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (lensOwnsPad()) return;              // the delve and the arena own their keys
    const ae = document.activeElement;
    const typing = ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName);
    const k = e.key;

    if (k === 'Escape') {
      const r = padRoot();
      // The globe and the scroll desk already bind Escape at the window. Firing
      // as well would close them twice.
      if (!r || (r.rule && r.rule.escOwned)) return;
      if (!r.rule && !r.el.querySelector('[data-pad-back]')) return;
      e.preventDefault(); enter(); back(); return;
    }
    if (k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight') {
      if (typing && (k === 'ArrowLeft' || k === 'ArrowRight')) return;   // the caret wins
      e.preventDefault(); enter(); move(k.slice(5).toLowerCase()); return;
    }
    if (k === 'Enter' || k === ' ') {
      if (typing || !navMode) return;
      recover();
      if (!cursorEl) return;
      // A real button with real focus activates itself on Enter. Clicking it
      // here as well would fire the handler twice.
      if (/^(BUTTON|INPUT|SELECT|TEXTAREA|A)$/.test(cursorEl.tagName)) return;
      e.preventDefault(); activate(cursorEl);
    }
  });
}

function wireModeExit() {
  let lx = 0, ly = 0;
  addEventListener('pointermove', (e) => {
    // A synthetic or sub-pixel move must not steal the ring back from a pad.
    if (Math.abs(e.clientX - lx) + Math.abs(e.clientY - ly) < 6) return;
    lx = e.clientX; ly = e.clientY;
    leave();
  }, { capture: true, passive: true });
  addEventListener('pointerdown', leave, { capture: true, passive: true });
  addEventListener('touchstart', leave, { capture: true, passive: true });
  addEventListener('wheel', leave, { capture: true, passive: true });
}

/** Start the menu cursor. Called once, from main.js. The pad loop starts only
 *  when a controller actually appears, so mouse-only players pay nothing for
 *  it; the keyboard half is free and always on. */
export function startUiPad() {
  if (typeof window === 'undefined') return;
  wireKeyboard();
  wireModeExit();
  watchDom();
  const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
  addEventListener('gamepadconnected', kick);
  if (readPad()) kick();     // one already awake, e.g. from a battle just left
  // Dev probe, in the spirit of __arenaStep / __fpStep: a headless pane runs no
  // rAF, so `step` is the only way to exercise the real loop — repeat timing,
  // the button mask, the ownership gate — instead of the functions under it.
  window.__padUi = {
    cursor: () => cursorEl,
    root: () => (padRoot() || {}).el,
    count: () => candidates().length,
    nav: () => navMode,
    owned: () => lensOwnsPad(),
    step: (now) => pump(now == null ? performance.now() : now),
    move, activate: () => activate(cursorEl), back, enter, leave,
  };
}
