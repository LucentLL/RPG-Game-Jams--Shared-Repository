/**
 * @file The input seam — one walk and one look, whatever you are holding.
 *
 * The game grew up under a thumb: every walking lens shipped a virtual stick,
 * and on a desktop that stick became the ONLY way to turn — a mouse dragging a
 * painted knob to do what a mouse has done natively since Quake. This module is
 * the other two hands: a POINTER-LOCK LOOK that turns the camera with the mouse
 * itself, and a STANDARD GAMEPAD read that speaks sticks, d-pad and face
 * buttons. It owns no camera, no fighter and no rule; it hands back numbers and
 * the lens decides what they mean.
 *
 * Three deliberate shapes:
 *
 *   • The look ACCUMULATES and DRAINS. Mouse events arrive many times a frame
 *     and a lens ticks once, so `read()` returns everything banked since the
 *     last read and zeroes the bank. A dropped frame turns exactly as far as
 *     the mouse moved — no per-event camera writes, no lost motion.
 *   • The pad is READ, never subscribed. `navigator.getGamepads()` is a
 *     snapshot with no events behind it, so polling once per frame from inside
 *     the lens's own loop is the whole story — and a lens that is not running
 *     cannot be steered by a controller left face-down on the couch.
 *   • Touch is a QUESTION, not an assumption. `touchPrimary()` asks whether the
 *     primary pointer is a finger, so the virtual sticks appear where they are
 *     the only option and stay gone where they are a downgrade.
 *
 * Living in platform/ is the point: when the Steam and Android shells come
 * online, a native controller or an on-screen overlay is a change here and
 * nowhere else. @see ARCHITECTURE.md — "src/platform/ is the seam".
 */

// ---------------------------------------------------------------------------
// Is there a mouse behind this, or a thumb?
// ---------------------------------------------------------------------------

const mq = (q) => (typeof matchMedia === 'function' ? matchMedia(q) : null);

/** Has a finger ever actually touched this screen? Latched, because a hybrid
 *  laptop reports a fine pointer right up until someone reaches out. */
let _touched = false;
const _touchSubs = new Set();
if (typeof window !== 'undefined') {
  window.addEventListener('touchstart', () => {
    if (_touched) return;
    _touched = true;
    for (const fn of _touchSubs) { try { fn(); } catch (_) { /* a bad listener is not a lost input */ } }
  }, { passive: true, capture: true });
}

/**
 * Called once, the first time this session turns out to be a touch session
 * after all — the moment a player on a touchscreen laptop reaches past the
 * keyboard. A lens that hid its virtual stick uses this to put it back
 * mid-scene, which is what makes hiding it on desktop safe in the first place.
 *
 * The latch is one-way on purpose: once a thumb has been used, a stick that
 * flickered away again on the next mouse twitch would be worse than either.
 *
 * @returns {() => void} unsubscribe — call it when the lens closes, or a
 *   long session stacks one dead listener per scene.
 */
export function onTouchPrimary(fn) {
  if (typeof fn !== 'function') return () => {};
  if (_touched) { try { fn(); } catch (_) {} return () => {}; }
  _touchSubs.add(fn);
  return () => _touchSubs.delete(fn);
}

/**
 * Should this device get the on-screen stick?
 *
 * The primary-pointer query, not the touch-capability one: a Windows laptop
 * with a touchscreen reports `maxTouchPoints > 0` and has always been handed a
 * thumb-stick it never needed. `(pointer: coarse)` asks about the device the
 * player is actually steering with, and the latch above catches the hybrid the
 * moment they put a finger on the glass.
 */
export function touchPrimary() {
  if (_touched) return true;
  const coarse = mq('(pointer: coarse)');
  if (coarse) {
    if (coarse.matches) return true;
    const fine = mq('(pointer: fine)');
    if (fine && fine.matches) return false;
  }
  return typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
}

// ---------------------------------------------------------------------------
// Mouse look
// ---------------------------------------------------------------------------

/** Radians of yaw per pixel of mouse travel at sensitivity 1. Tuned against
 *  the arena's held-key TURN_RATE: a palm-width flick is roughly a half turn. */
const LOOK_RAD_PER_PX = 0.0026;
/** A single event carrying more than this is a pointer-lock warp, not a hand —
 *  Chrome coalesces a re-lock into one enormous movementX. Dropped, not
 *  clamped: a clamped warp still spins you the wrong way half a turn. */
const LOOK_SANE_PX = 420;

let _sens = 1;
let _invertY = false;

/** Look sensitivity multiplier (1 = default). Clamped to something usable. */
export function lookSensitivity(v) {
  if (typeof v === 'number' && isFinite(v)) _sens = Math.max(0.15, Math.min(4, v));
  return _sens;
}
/** Invert the vertical look, the way flight sticks want it. */
export function invertLook(on) {
  if (on != null) _invertY = !!on;
  return _invertY;
}

/**
 * Pointer-lock look over a host element.
 *
 * Clicking the host takes the lock and hides the cursor; the browser's own Esc
 * gives it back. While locked, mouse travel banks into a yaw/pitch pair that
 * the lens drains once a frame. Clicks on real controls are LEFT ALONE — a HUD
 * button inside the host must stay a button, so anything that looks like a
 * control (or opts out with `data-nolook`) never triggers the grab.
 *
 * @param {HTMLElement} host          the element the lock is taken on
 * @param {object}     [opts]
 * @param {(locked:boolean)=>void} [opts.onChange] told when the lock flips
 * @param {()=>boolean}            [opts.enabled]  gate — false means "don't grab"
 * @param {string}                 [opts.ignore]   selector whose clicks are not a grab
 * @returns {{locked():boolean, request():void, release():void,
 *            read():{yaw:number,pitch:number}, dispose():void}}
 */
export function createLook(host, opts = {}) {
  let yaw = 0, pitch = 0, dead = false;
  const owns = () => document.pointerLockElement === host;

  const onMove = (e) => {
    if (!owns()) return;
    const mx = e.movementX || 0, my = e.movementY || 0;
    if (Math.abs(mx) > LOOK_SANE_PX || Math.abs(my) > LOOK_SANE_PX) return;
    yaw += mx * LOOK_RAD_PER_PX * _sens;
    pitch += my * LOOK_RAD_PER_PX * _sens * (_invertY ? -1 : 1);
  };
  const onLockChange = () => {
    if (dead) return;
    // Whatever travel was banked at the boundary belongs to the last frame of
    // the last lock, and firing it into the first frame of the next one snaps
    // the camera. Drop it.
    yaw = pitch = 0;
    if (opts.onChange) opts.onChange(owns());
  };
  const onDown = (e) => {
    if (dead || owns()) return;
    if (opts.enabled && !opts.enabled()) return;
    if (e.button != null && e.button !== 0) return;      // right-click is a menu, not a grab
    // A control inside the host stays a control. The virtual stick is the one
    // that bites: it lives on the same stage, calls preventDefault and STILL
    // bubbles, so a thumb-drag would take the mouse away from a HUD it needs.
    const t = e.target;
    const skip = 'button,a,input,select,textarea,[data-nolook]' + (opts.ignore ? ',' + opts.ignore : '');
    if (t && t.closest && t.closest(skip)) return;
    request();
  };

  function request() {
    if (dead || owns()) return;
    try { host.requestPointerLock(); } catch (_) { /* denied, or no lock in this browser */ }
  }
  function release() {
    if (owns()) { try { document.exitPointerLock(); } catch (_) {} }
  }

  host.addEventListener('pointerdown', onDown);
  document.addEventListener('mousemove', onMove);
  document.addEventListener('pointerlockchange', onLockChange);

  return {
    locked: owns,
    request,
    release,
    read() {
      const out = { yaw, pitch };
      yaw = pitch = 0;
      return out;
    },
    dispose() {
      dead = true;
      release();
      host.removeEventListener('pointerdown', onDown);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('pointerlockchange', onLockChange);
    },
  };
}

// ---------------------------------------------------------------------------
// Gamepad
// ---------------------------------------------------------------------------

/** Standard-gamepad button indices, by the name on the pad in your hands.
 *  @see https://w3c.github.io/gamepad/#remapping — every lens maps from HERE,
 *  so "what does A do" is one lookup and never a magic number in a tick. */
export const PAD = {
  A: 0, B: 1, X: 2, Y: 3,
  LB: 4, RB: 5, LT: 6, RT: 7,
  SELECT: 8, START: 9, L3: 10, R3: 11,
  UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15,
};

/** Stick slack. Cheap pads rest at 0.1 and a drifting one walks you into a
 *  wall all match; anything under this is a hand not touching the stick. */
const PAD_DEAD = 0.24;
/** An analog trigger reads 0..1 on `value`; past this it is a press. */
const TRIGGER = 0.45;

const _prev = new Map();      // pad index -> Uint8Array of last frame's buttons
let _frame = null, _frameAt = -1;   // this frame's snapshot, memoised (see readPad)

/** Rescale past the deadzone so the first live degree of travel is a crawl,
 *  not a lurch — a raw cutoff makes every stick feel like a switch. */
function ax(v) {
  const a = Math.abs(v || 0);
  if (a < PAD_DEAD) return 0;
  return Math.sign(v) * ((a - PAD_DEAD) / (1 - PAD_DEAD));
}

/**
 * The pad we are steering with. A `standard` mapping is always preferred: the
 * button indices above are only meaningful under it.
 *
 * A pad reporting NO mapping is still accepted when it is shaped like a normal
 * controller — two sticks and at least a face cluster, shoulders and start —
 * because a great many perfectly ordinary pads never get recognised: anything
 * in DirectInput mode, most third-party pads, and nearly everything on Firefox.
 * Refusing those means "my controller does nothing", which is exactly the bug
 * this is here to avoid. Ten buttons is the floor, not sixteen, because an
 * unrecognised pad usually reports its d-pad as a HAT AXIS instead of buttons
 * 12–15 — decoded below — and so has four fewer buttons than a standard one.
 *
 * What it will not do is guess at something with one axis and three buttons.
 */
function firstPad() {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
  let list;
  try { list = navigator.getGamepads(); } catch (_) { return null; }
  let spare = null;
  for (const g of list || []) {
    if (!g || !g.connected) continue;
    if (g.mapping === 'standard') return g;
    if (!spare && (g.axes || []).length >= 4 && (g.buttons || []).length >= 10) spare = g;
  }
  return spare;
}

/**
 * What the browser can actually see, in the player's own words. "My controller
 * does nothing" has half a dozen causes that look identical from the sofa —
 * the pad asleep until its first button press, a driver in the wrong mode, a
 * page that never had focus — and this answers all of them at once.
 */
export function padReport() {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) {
    return { supported: false, note: 'this browser exposes no Gamepad API' };
  }
  let list = [];
  try { list = navigator.getGamepads() || []; } catch (_) {}
  const seen = [];
  for (const g of list) {
    if (!g) continue;
    seen.push({
      id: g.id, mapping: g.mapping || '(none)', connected: !!g.connected,
      axes: (g.axes || []).length, buttons: (g.buttons || []).length,
      pressed: (g.buttons || []).map((b, i) => (b && (b.pressed || b.value > TRIGGER) ? i : -1)).filter((i) => i >= 0),
    });
  }
  const using = firstPad();
  return {
    supported: true,
    seen,
    using: using ? using.id : null,
    note: seen.length ? (using ? 'in use' : 'seen, but not shaped like a controller this game can read')
      : 'nothing yet — browsers hide a pad until you press one of its buttons with the game window focused',
  };
}
if (typeof window !== 'undefined') window.__padReport = () => padReport();

/** Is a controller awake? (Browsers hide pads until one is pressed.) */
export function padPresent() { return !!firstPad(); }

/**
 * One frame's controller state, or null when nothing is plugged in.
 *
 * `hit()` is an EDGE against the previous read, which makes a second read in
 * the same frame a bug that eats the press — so the answer is memoised for a
 * few milliseconds and a double call simply gets the same frame back. That
 * turns "poll exactly once per tick" from a rule a caller must remember into
 * one it cannot break.
 *
 * @returns {?{lx:number,ly:number,rx:number,ry:number,mx:number,my:number,
 *             down(i:number):boolean, hit(i:number):boolean}}
 */
export function readPad() {
  const t = typeof performance !== 'undefined' ? performance.now() : 0;
  if (t - _frameAt < 4) return _frame;
  _frameAt = t;
  const g = firstPad();
  if (!g) { _prev.clear(); return (_frame = null); }
  const b = g.buttons || [];
  const on = (i) => {
    const btn = b[i];
    if (!btn) return false;
    return typeof btn === 'object' ? (btn.pressed || (btn.value || 0) > TRIGGER) : btn > TRIGGER;
  };

  const was = _prev.get(g.index);
  const now = new Uint8Array(Math.max(b.length, 17));
  for (let i = 0; i < now.length; i++) now[i] = on(i) ? 1 : 0;
  _prev.set(g.index, now);

  const a = g.axes || [];
  const lx = ax(a[0]), ly = ax(a[1]), rx = ax(a[2]), ry = ax(a[3]);
  // The d-pad is buttons 12–15 under the standard mapping. A pad that reports
  // no mapping (and so no d-pad buttons) usually hangs it off a hat axis —
  // decoded here so an off-brand controller still walks.
  let dx = (now[PAD.RIGHT] ? 1 : 0) - (now[PAD.LEFT] ? 1 : 0);
  let dy = (now[PAD.DOWN] ? 1 : 0) - (now[PAD.UP] ? 1 : 0);
  if (!dx && !dy && b.length < 16 && a.length > 9) {
    const h = a[9];
    if (h >= -1.01 && h <= 1.01) {
      const oct = Math.round((h + 1) * 3.5);            // -1..1 → 0..7, N clockwise
      if (oct >= 0 && oct <= 7) {
        dx = [0, 1, 1, 1, 0, -1, -1, -1][oct];
        dy = [-1, -1, 0, 1, 1, 1, 0, -1][oct];
      }
    }
  }

  return (_frame = {
    lx, ly, rx, ry,
    // What the player means by "walk": whichever of stick and d-pad is louder.
    mx: Math.abs(lx) > Math.abs(dx) ? lx : dx,
    my: Math.abs(ly) > Math.abs(dy) ? ly : dy,
    down: (i) => !!now[i],
    hit: (i) => !!now[i] && !(was && was[i]),
  });
}

/** Forget the edge state — call when a lens closes, so the button still held
 *  as you left does not read as a fresh press the next time one opens. */
export function padReset() { _prev.clear(); _frame = null; _frameAt = -1; }
