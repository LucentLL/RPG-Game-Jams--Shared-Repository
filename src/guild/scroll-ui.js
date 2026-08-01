/**
 * @file The scroll — the guildmaster's paperwork, unrolled DOWN the screen.
 *
 * One reusable modal: two horizontal rollers that start together mid-screen
 * and travel apart as the parchment unrolls between them, top to bottom.
 * Content longer than the paper still pans — but there is NO scrollbar: the
 * pane scrolls under a hidden bar while the rollers' surfaces PHASE-SHIFT
 * with the pan, so what you read is the scroll itself rolling on through.
 *
 * Content is a render FUNCTION, not a string: hall.js re-renders the whole
 * guild screen on every action, so an open scroll refreshes itself from live
 * state afterwards (`refreshScroll`, called from hall's render tail).
 * `openScrollPane` is the sibling entry for content that is not a string at
 * all — a live view (the estate plan) MOUNTED into the parchment and told
 * when it rolls away.
 *
 * EVERY piece of art here is DRAWN on canvas — rollers, parchment grain, the
 * desk's rolled-scroll icons. Nothing is cropped from a sheet: the first cut
 * used a reference sheet the guild does not own a licence to, so it was
 * purged and this module now owes nothing to anyone. (The desk's WOOD is the
 * one exception: it bakes from tiles/woodwall.png, a licensed FBB sheet the
 * delve interiors already build with.)
 *
 * Mounted into #guildScreen, not body — the same rule the Tourney Board's
 * .lens-overlay follows: render() rebuilds `.guild-hall-host` and never its
 * siblings, so the scroll survives the re-render happening underneath it.
 */
import { TILES_BASE } from '../config/assets.js';

const loadImg = (src) => new Promise((res, rej) => {
  const i = new Image();
  i.onload = () => res(i);
  i.onerror = () => rej(new Error('scroll-ui: ' + src + ' failed'));
  i.src = src;
});

// ---------------------------------------------------------------------------
// Drawn art — rollers, parchment, desk icons
// ---------------------------------------------------------------------------

/** The wood shades one rolled scroll is made of, light to dark. */
const ROLL = {
  edge: '#5d3f20', dark: '#8a6335', mid: '#b98d4e', lit: '#d9b06b', hi: '#e8c684',
  cap: '#c9a86a', capRing: '#7a5a30', capCore: '#4a3118',
};

/**
 * A HORIZONTAL roller, drawn at 1px-per-unit and left chunky (the element
 * wears image-rendering: pixelated). Drawn PER WIDTH so the end caps keep
 * their proportions at any modal size, and PER PHASE: the shaft's grain lines
 * ride `phase` (the pane's scrollTop), which is what makes panning the
 * content read as the scroll physically rolling.
 * @param {HTMLCanvasElement} cv @param {number} wCss @param {number} phase
 */
function drawRoller(cv, wCss, phase) {
  const W = Math.max(60, Math.round(wCss / 3)), H = 14;
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  const g = cv.getContext('2d');
  g.clearRect(0, 0, W, H);
  // The shaft: horizontal bands of light — a cylinder read in rows.
  const bands = [[0, ROLL.edge], [1, ROLL.dark], [3, ROLL.mid], [4, ROLL.hi], [6, ROLL.lit], [9, ROLL.mid], [12, ROLL.dark], [13, ROLL.edge]];
  for (let i = 0; i < bands.length; i++) {
    const [y0, col] = bands[i];
    const y1 = i + 1 < bands.length ? bands[i + 1][0] : H;
    g.fillStyle = col;
    g.fillRect(2, y0, W - 4, y1 - y0);
  }
  // Rolling grain: faint rings around the barrel, phase-shifted by the pan.
  // A surface line on a turning cylinder climbs and wraps; three are enough.
  g.fillStyle = 'rgba(74, 49, 24, 0.35)';
  for (let k = 0; k < 3; k++) {
    const y = 1 + ((k * 4 + Math.round(phase / 3)) % 12);
    g.fillRect(2, y, W - 4, 1);
  }
  // End caps: a stepped disc with a ring and a wound core.
  for (const x of [0, W - 7]) {
    g.fillStyle = ROLL.capRing; g.fillRect(x, 0, 7, H);
    g.fillStyle = ROLL.cap; g.fillRect(x + 1, 1, 5, H - 2);
    g.fillStyle = ROLL.capRing; g.fillRect(x + 2, 3, 3, H - 6);
    g.fillStyle = ROLL.capCore; g.fillRect(x + 3, (H / 2 - 1) | 0, 2, 2);
  }
}

/** Faint parchment grain — near-flat, because the paperwork on it is the
 *  point. (Heavy banding was most of what made the first cut hard to read.) */
function parchmentTile() {
  const S = 64;
  const cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = '#e4c996';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 90; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(120,84,40,0.05)' : 'rgba(255,244,214,0.07)';
    g.fillRect((Math.random() * S) | 0, (Math.random() * S) | 0, 2 + ((Math.random() * 5) | 0), 1);
  }
  for (let y = 0; y < S; y += 8 + ((Math.random() * 6) | 0)) {
    g.fillStyle = 'rgba(140,100,52,0.045)';
    g.fillRect(0, y, S, 1);
  }
  return cv.toDataURL();
}

/** A closed scroll lying on the desk: cylinder, cap rings, a tie band. */
function deskScrollIcon() {
  const W = 64, H = 20;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const rows = [[2, ROLL.edge], [3, ROLL.dark], [5, ROLL.mid], [7, ROLL.hi], [10, ROLL.lit], [13, ROLL.mid], [16, ROLL.dark], [18, ROLL.edge]];
  for (let i = 0; i < rows.length; i++) {
    const [y0, col] = rows[i];
    const y1 = i + 1 < rows.length ? rows[i + 1][0] : H;
    g.fillStyle = col;
    g.fillRect(2, y0, W - 4, y1 - y0);
  }
  for (const x of [0, W - 6]) {
    g.fillStyle = ROLL.capRing; g.fillRect(x, 1, 6, H - 2);
    g.fillStyle = ROLL.cap; g.fillRect(x + 1, 2, 4, H - 4);
    g.fillStyle = ROLL.capRing; g.fillRect(x + 2, 5, 2, H - 10);
    g.fillStyle = ROLL.capCore; g.fillRect(x + 2, (H / 2 - 1) | 0, 2, 2);
  }
  g.fillStyle = '#7a3d22';
  g.fillRect(40, 1, 4, H - 2);
  g.fillStyle = '#9a5230';
  g.fillRect(41, 1, 1, H - 2);
  g.fillStyle = '#5a2c18';
  g.fillRect(39, (H / 2) | 0, 6, 2);
  return cv.toDataURL();
}

/**
 * Publish the drawn tiles as CSS custom properties on :root — CSS references
 * the vars, so nothing here is async at render time. The desk wood is the one
 * baked-from-sheet piece: an interior slice of the licensed A4 wood-wall.
 */
(function bakeVars() {
  const root = document.documentElement.style;
  root.setProperty('--scroll-parch', `url(${parchmentTile()})`);
  root.setProperty('--scroll-icon', `url(${deskScrollIcon()})`);
  loadImg(TILES_BASE + 'woodwall.png').then((img) => {
    const cv = document.createElement('canvas');
    cv.width = 48; cv.height = 96;
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    // x=24: an interior slice, so the 48px repeat seam falls inside a plank
    // course — the same offset rule the delve's wall themes use on this sheet.
    g.drawImage(img, 24, 48, 48, 96, 0, 0, 48, 96);
    root.setProperty('--desk-wood', `url(${cv.toDataURL()})`);
  }).catch((e) => console.warn('scroll-ui: desk wood bake failed — flat colour stands in', e));
})();

// ---------------------------------------------------------------------------
// The modal
// ---------------------------------------------------------------------------

/** @type {?{ov:HTMLElement, render:?(() => string), onClose:?Function, onEsc:Function, onResize:Function}} */
let CUR = null;

/** Is a scroll open? hall's render tail asks before refreshing it. */
export function isScrollOpen() { return !!CUR; }

/** Re-render the open scroll's content from live state (string scrolls only —
 *  a mounted pane owns its own DOM and refreshes itself). */
export function refreshScroll() {
  if (!CUR || !CUR.render) return;
  const c = CUR.ov.querySelector('.scrollui-content');
  if (c) c.innerHTML = CUR.render();
  fitHeight();
}

/** Redraw both rollers at the current width and pan phase. */
function fitRollers() {
  if (!CUR) return;
  const frame = CUR.ov.querySelector('.scrollui');
  const w = frame && frame.clientWidth;
  if (!w) return;
  const sc = (CUR.ov.querySelector('.scrollui-content') || {}).scrollTop || 0;
  const rolls = CUR.ov.querySelectorAll('canvas.scrollui-roll');
  if (rolls[0]) drawRoller(rolls[0], w, sc * 0.55);
  if (rolls[1]) drawRoller(rolls[1], w, -sc * 0.55);
}

/** The paper unrolls only as far as the paperwork needs — measured, so a
 *  three-line note is a short scroll and the quest board a long one. Measured
 *  off the CONTENT's scrollHeight, which is honest even while the body is
 *  still rolled to 0 (the inner column collapses with its parent; an
 *  overflow box's scrollHeight never lies about its children). */
function fitHeight() {
  if (!CUR) return;
  const body = CUR.ov.querySelector('.scrollui-body');
  const head = CUR.ov.querySelector('.scrollui-head');
  const content = CUR.ov.querySelector('.scrollui-content');
  if (!body || !content) return;
  const chrome = (head ? head.offsetHeight : 0) + 28;
  // A `tall` scroll (the world map, the estate plan) may take the whole
  // screen; ordinary paperwork stops at a hand-held height.
  const max = Math.round(CUR.tall ? window.innerHeight * 0.94 : Math.min(window.innerHeight * 0.8, 760)) - 34 * 2;
  body.style.setProperty('--sh-open', Math.max(140, Math.min(max, content.scrollHeight + chrome)) + 'px');
}

function buildOverlay(title, glyph) {
  const host = document.getElementById('guildScreen') || document.body;
  const ov = document.createElement('div');
  ov.className = 'scrollui-veil';
  ov.innerHTML = `
    <div class="scrollui">
      <canvas class="scrollui-roll"></canvas>
      <div class="scrollui-body"><div class="scrollui-inner">
        <div class="scrollui-head">
          <span class="scrollui-title">${glyph || '📜'} ${title}</span>
          <button class="scrollui-x" title="Roll it up" onclick="__scrollUi.close()">✕</button>
        </div>
        <div class="scrollui-content"></div>
      </div></div>
      <canvas class="scrollui-roll scrollui-rollB"></canvas>
    </div>`;
  ov.addEventListener('pointerdown', (e) => { if (e.target === ov) closeScroll(); });
  host.appendChild(ov);
  // Panning the pane rolls the rollers — throttled to a frame, with a timeout
  // raced in so a throttled/hidden tab still rolls (same rule as the opener).
  let pend = false;
  const roll = () => { if (!pend) return; pend = false; fitRollers(); };
  ov.querySelector('.scrollui-content').addEventListener('scroll', () => {
    if (pend) return;
    pend = true;
    requestAnimationFrame(roll);
    setTimeout(roll, 40);
  });
  return ov;
}

function armOpen(ov) {
  const onEsc = (e) => { if (e.key === 'Escape') closeScroll(); };
  const onResize = () => { if (CUR && CUR.ov === ov) { fitRollers(); fitHeight(); } };
  window.addEventListener('keydown', onEsc);
  window.addEventListener('resize', onResize);
  // Double rAF so the closed (rolls-together) layout commits before .on lands,
  // raced against a timeout because a throttled tab may never grant frames.
  const arm = () => { if (CUR && CUR.ov === ov) ov.classList.add('on'); };
  requestAnimationFrame(() => requestAnimationFrame(arm));
  setTimeout(arm, 90);
  return { onEsc, onResize };
}

/**
 * Unroll a scroll of rendered paperwork. `render` returns the content HTML
 * and re-runs whenever the guild re-renders beneath the modal.
 * @param {{title:string, glyph?:string, render:() => string, width?:number}} opts
 */
export function openScroll(opts) {
  closeScroll(true);
  const ov = buildOverlay(opts.title, opts.glyph);
  if (opts.width) ov.style.setProperty('--sw', opts.width + 'px');
  CUR = { ov, render: opts.render, onClose: null, tall: !!opts.tall, ...armOpen(ov) };
  refreshScroll();
  fitRollers();
}

/**
 * Unroll a scroll around a LIVE VIEW: `mount(contentEl)` puts real DOM in the
 * parchment (the estate plan), `onClose` hears the roll-up however it happens
 * — ✕, Esc, the veil, or a replacing scroll.
 * @param {{title:string, glyph?:string, mount:(el:HTMLElement)=>void, onClose?:Function}} opts
 */
export function openScrollPane(opts) {
  closeScroll(true);
  const ov = buildOverlay(opts.title, opts.glyph);
  ov.classList.add('scrollui-pane');
  CUR = { ov, render: null, onClose: opts.onClose || null, tall: true, ...armOpen(ov) };
  opts.mount(ov.querySelector('.scrollui-content'));
  fitHeight();
  fitRollers();
}

/** Roll it back up. `instant` skips the animation (a scroll replacing a scroll). */
export function closeScroll(instant) {
  const c = CUR;
  if (!c) return;
  CUR = null;
  window.removeEventListener('keydown', c.onEsc);
  window.removeEventListener('resize', c.onResize);
  if (instant) { c.ov.remove(); if (c.onClose) c.onClose(); return; }
  c.ov.classList.remove('on');
  setTimeout(() => c.ov.remove(), 380);
  if (c.onClose) c.onClose();
}

window.__scrollUi = { close: () => closeScroll() };
