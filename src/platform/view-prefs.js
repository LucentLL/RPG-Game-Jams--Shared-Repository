/**
 * @file The camera, as two numbers you can move while looking at them.
 *
 * These two constants have now been tuned four times by screenshot — send a
 * build, look at it, report, change a number, send a build. That loop is the
 * wrong shape for a value whose only test is whether it looks right, so both
 * come out of the source and go on a slider that applies live.
 *
 * WHAT THEY ARE, AND WHY ONLY THESE TWO:
 *
 * `angle` — how far the OVER-THE-SHOULDER camera looks DOWN, in degrees.
 *   Held here as a positive number because that is how a person says it; the
 *   lenses negate it, since CSS `rotateX(+θ)` aims the camera UP and shipping
 *   that sign backwards is exactly how every third-person camera in this game
 *   spent a month pointed at the sky.
 *   It is the single most consequential number in the 3D views, because these
 *   sprites were drawn for a top-down game: "up" on a sprite gains an AWAY
 *   component of sin(angle), so at 25° a quarter of every swing drawn going up
 *   reads as going forward, and a fallen body reads as fallen. Isometric RPGs
 *   sit between 25° and 45° for precisely this reason.
 *
 * `fov` — VERTICAL field of view in degrees. Vertical and not horizontal
 *   because every lens here fits its perspective to the stage HEIGHT, so
 *   vertical is the quantity that stays put when the window changes shape.
 *   72° matches the lens the framing was originally measured through
 *   (`PERSP 500 / PERSP_AT 720` → 2·atan(720/1000) = 71.5°), so the default is
 *   a no-op and anything you see is a deliberate change.
 *
 * `dist` — DRAW DISTANCE, as a percentage of what the crawler's fitter thinks
 *   the device can afford. Not a radius in tiles, because the affordable radius
 *   is not one number: it depends on the chart (the meadow merges into a
 *   handful of quads, the estate is forty-six rows of buildings that cannot
 *   merge past a corner) and the fitter measures it per map. This scales the
 *   layer budget it measures against. @see LAYER_BUDGET in delve-fp.js.
 *
 *   It is a slider for the same reason the other two are, only more so: the
 *   ceiling is a particular phone's compositor, nobody can compute it from
 *   here, and the failure is legible — push it until the world starts dropping
 *   surfaces as you walk, then come back a step. The default is deliberately
 *   short of the edge.
 *
 * FIRST PERSON HAS NO ANGLE SETTING on purpose: it has free look, and a fixed
 * pitch on top of a pitch you steer is two cameras arguing. The angle belongs
 * to the shoulder camera, which holds a framing rather than following a hand.
 */

const KEY = 'crucible.view';
const DEF = { angle: 25, fov: 72, dist: 100, gl: false };
const LIM = { angle: [0, 45], fov: [50, 110], dist: [40, 300] };
const UNIT = { angle: '°', fov: '°', dist: '%' };
/** Settings that are a switch rather than a number, and what they say. */
const FLAGS = {
  gl: ['Draw on a canvas', 'the new renderer — one surface instead of a thousand'],
};

/** The live values. Read directly — it is one object and it never changes identity. */
export const view = { ...DEF };

const subs = new Set();

function clamp() {
  for (const k of Object.keys(LIM)) {
    const n = +view[k];
    view[k] = isFinite(n) ? Math.max(LIM[k][0], Math.min(LIM[k][1], n)) : DEF[k];
  }
  for (const k of Object.keys(FLAGS)) view[k] = !!view[k];
}
try { Object.assign(view, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* first run */ }
clamp();

/** Change one or both, persist, and tell every live lens to re-fit. */
export function setView(patch) {
  Object.assign(view, patch);
  clamp();
  try { localStorage.setItem(KEY, JSON.stringify(view)); } catch (e) { /* private mode */ }
  for (const fn of subs) { try { fn(); } catch (e) { console.warn('view-prefs: subscriber threw', e); } }
}

/** Called whenever either number moves. Lenses re-fit their lens and force a
 *  transform rewrite; returns an unsubscribe nobody currently needs. */
export function onView(fn) { subs.add(fn); return () => subs.delete(fn); }

/**
 * The perspective, in px, for a stage of this height — THE one place a field of
 * view becomes a lens, so the three views cannot disagree about what 72° means.
 * `P = (h/2) / tan(fov/2)` is just the projection run backwards.
 */
export function perspectiveFor(h) {
  return (h / 2) / Math.tan(view.fov / 2 * Math.PI / 180);
}

/** P/H — the ratio a projection SHEAR needs (@see action-fp.js aimLens), and
 *  the reason that shear needs no measurement: it is constant for a given FoV
 *  however big the window is. */
export function perspRatio() {
  return 0.5 / Math.tan(view.fov / 2 * Math.PI / 180);
}

/** The shoulder camera's lean, in the sign CSS wants: NEGATIVE is looking down. */
export function camLean() { return -view.angle; }

// ---------------------------------------------------------------------------
// The panel
// ---------------------------------------------------------------------------

let panel = null;

function row(label, key, step, hint) {
  return `<label class="vp-row">
      <span class="vp-name">${label}<i>${hint}</i></span>
      <input type="range" min="${LIM[key][0]}" max="${LIM[key][1]}" step="${step}" value="${view[key]}" data-k="${key}">
      <output>${view[key]}${UNIT[key]}</output>
    </label>`;
}

function flag(key) {
  const [label, hint] = FLAGS[key];
  return `<label class="vp-row vp-flag">
      <span class="vp-name">${label}<i>${hint}</i></span>
      <input type="checkbox" data-k="${key}"${view[key] ? ' checked' : ''}>
    </label>`;
}

function build() {
  panel = document.createElement('div');
  panel.className = 'vp-panel';
  panel.innerHTML = `<div class="vp-card">
      <h3>Camera</h3>
      ${row('Shoulder angle', 'angle', 1, 'how far third person looks down')}
      ${row('Field of view', 'fov', 1, 'vertical, first person and all')}
      ${row('Draw distance', 'dist', 10, 'raise it until the world flickers, then step back')}
      ${flag('gl')}
      <div class="vp-foot">
        <button class="vp-reset" type="button">Reset</button>
        <button class="vp-close" type="button">Done</button>
      </div>
    </div>`;
  // Live, on `input` and not `change`: the whole point is to watch the number
  // move the picture. Each lens re-fits inside its own subscriber.
  panel.addEventListener('input', (e) => {
    const k = e.target && e.target.dataset && e.target.dataset.k;
    if (!k) return;
    setView({ [k]: FLAGS[k] ? e.target.checked : +e.target.value });
    sync();
  });
  panel.querySelector('.vp-reset').onclick = () => { setView({ ...DEF }); sync(); };
  panel.querySelector('.vp-close').onclick = () => showViewPanel(false);
  // Click the backdrop to leave, but never a click that started inside the card.
  panel.addEventListener('pointerdown', (e) => { if (e.target === panel) showViewPanel(false); });
  document.body.appendChild(panel);
}

/** Push the live values back into the controls — after a reset, and after any
 *  change that did not come from the control itself. */
function sync() {
  if (!panel) return;
  for (const el of panel.querySelectorAll('input[data-k]')) {
    const k = el.dataset.k;
    if (FLAGS[k]) { el.checked = !!view[k]; continue; }
    el.value = view[k];
    const out = el.parentElement.querySelector('output');
    if (out) out.textContent = view[k] + UNIT[k];
  }
}

export function showViewPanel(on) {
  if (!panel) build();
  const want = on == null ? !panel.classList.contains('on') : !!on;
  if (want) sync();
  panel.classList.toggle('on', want);
}

// Reachable from the HUD buttons (inline onclick, like every other control in
// this project) and from the keyboard in any view.
if (typeof window !== 'undefined') {
  window.__viewPanel = () => showViewPanel();
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'o' && e.key !== 'O') return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    showViewPanel();
  });
}
