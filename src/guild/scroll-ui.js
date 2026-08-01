/**
 * @file The scroll — the guildmaster's paperwork, unrolled across the screen.
 *
 * One reusable modal: two rolled ends that start TOGETHER in the centre of the
 * screen and travel apart as the parchment between them unrolls. Content is a
 * render FUNCTION, not a string: hall.js re-renders the whole guild screen on
 * every action, so an open scroll refreshes itself from live state afterwards
 * (`refreshScroll`, called from hall's render tail) instead of going stale.
 *
 * EVERY piece of art here is DRAWN on canvas — rollers, parchment grain, the
 * desk's rolled-scroll icons. Nothing is cropped from a sheet: the first cut
 * used a reference sheet the guild does not own a licence to, so it was purged
 * and this module now owes nothing to anyone. (The desk's WOOD is the one
 * exception: it bakes from tiles/woodwall.png, a sheet from the licensed FBB
 * bundles the rest of the delve already builds with.)
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
 * A vertical roller, drawn at 1px-per-unit and left chunky (the element wears
 * image-rendering: pixelated). Drawn PER HEIGHT so the end caps keep their
 * proportions whatever the modal measures — stretching a fixed sprite is
 * exactly what made the first cut read as three detached pieces.
 * @param {HTMLCanvasElement} cv @param {number} hCss the on-screen height
 */
function drawRoller(cv, hCss) {
  const W = 14, H = Math.max(30, Math.round(hCss / 3));
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  // The shaft: vertical bands of light, a cylinder read in columns.
  const bands = [[0, ROLL.edge], [1, ROLL.dark], [3, ROLL.mid], [5, ROLL.lit], [7, ROLL.hi], [9, ROLL.lit], [11, ROLL.mid], [13, ROLL.edge]];
  for (let i = 0; i < bands.length; i++) {
    const [x0, col] = bands[i];
    const x1 = i + 1 < bands.length ? bands[i + 1][0] : W;
    g.fillStyle = col;
    g.fillRect(x0, 2, x1 - x0, H - 4);
  }
  // End caps: a stepped disc with a ring and a wound core, top and bottom.
  g.fillStyle = ROLL.capRing;
  g.fillRect(0, 0, W, 3); g.fillRect(0, H - 3, W, 3);
  g.fillStyle = ROLL.cap;
  g.fillRect(1, 1, W - 2, 4); g.fillRect(1, H - 5, W - 2, 4);
  g.fillStyle = ROLL.capRing;
  g.fillRect(2, 4, W - 4, 1); g.fillRect(2, H - 5, W - 4, 1);
  g.fillStyle = ROLL.capCore;
  g.fillRect(5, 1, 4, 3); g.fillRect(5, H - 4, 4, 3);
}

/** Faint parchment grain — near-flat, because the paperwork on it is the
 *  point. (The reference sheet's heavy banding was most of what made the
 *  first cut hard to read.) */
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
  // End caps — the wound spiral seen face-on.
  for (const x of [0, W - 6]) {
    g.fillStyle = ROLL.capRing; g.fillRect(x, 1, 6, H - 2);
    g.fillStyle = ROLL.cap; g.fillRect(x + 1, 2, 4, H - 4);
    g.fillStyle = ROLL.capRing; g.fillRect(x + 2, 5, 2, H - 10);
    g.fillStyle = ROLL.capCore; g.fillRect(x + 2, (H / 2 - 1) | 0, 2, 2);
  }
  // The tie.
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
 * the vars, so nothing is async at render time. The desk wood is the one
 * baked-from-sheet piece: an interior slice of the licensed A4 wood-wall
 * (same sheet the delve's interiors already build their walls from).
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

/** @type {?{ov:HTMLElement, render:() => string, onEsc:Function, onResize:Function}} */
let CUR = null;

/** Is a scroll open? hall's render tail asks before refreshing it. */
export function isScrollOpen() { return !!CUR; }

/** Re-render the open scroll's content from live state. */
export function refreshScroll() {
  if (!CUR) return;
  const c = CUR.ov.querySelector('.scrollui-content');
  if (c) c.innerHTML = CUR.render();
}

/** Size the rollers to the modal they are in. Re-run on resize: the caps are
 *  drawn per height, never stretched. */
function fitRollers(ov) {
  const frame = ov.querySelector('.scrollui');
  const h = frame && frame.clientHeight;
  if (!h) return;
  ov.querySelectorAll('canvas.scrollui-roll').forEach((cv) => drawRoller(cv, h));
}

/**
 * Unroll a scroll. `render` returns the content HTML and is re-run whenever
 * the guild re-renders beneath the modal, so buttons inside can simply call
 * __guild handlers and trust the scroll to catch up.
 * @param {{title:string, glyph?:string, render:() => string}} opts
 */
export function openScroll(opts) {
  closeScroll(true);
  const host = document.getElementById('guildScreen') || document.body;
  const ov = document.createElement('div');
  ov.className = 'scrollui-veil';
  ov.innerHTML = `
    <div class="scrollui">
      <canvas class="scrollui-roll scrollui-rollL"></canvas>
      <div class="scrollui-body"><div class="scrollui-inner">
        <div class="scrollui-head">
          <span class="scrollui-title">${opts.glyph || '📜'} ${opts.title}</span>
          <button class="scrollui-x" title="Roll it up" onclick="__scrollUi.close()">✕</button>
        </div>
        <div class="scrollui-content"></div>
      </div></div>
      <canvas class="scrollui-roll scrollui-rollR"></canvas>
    </div>`;
  // Click the dark, not the paper: only the veil itself rolls it back up.
  ov.addEventListener('pointerdown', (e) => { if (e.target === ov) closeScroll(); });
  host.appendChild(ov);
  const onEsc = (e) => { if (e.key === 'Escape') closeScroll(); };
  const onResize = () => { if (CUR && CUR.ov === ov) fitRollers(ov); };
  window.addEventListener('keydown', onEsc);
  window.addEventListener('resize', onResize);
  CUR = { ov, render: opts.render, onEsc, onResize };
  refreshScroll();
  fitRollers(ov);
  // Double rAF: the closed (rolls-together) layout must COMMIT before the
  // .on class lands, or the browser coalesces the two frames and the scroll
  // pops open with no unroll at all. Raced against a short timeout because a
  // hidden or throttled tab may not grant frames at all — there the scroll
  // simply opens ready, which beats never opening.
  const arm = () => { if (CUR && CUR.ov === ov) ov.classList.add('on'); };
  requestAnimationFrame(() => requestAnimationFrame(arm));
  setTimeout(arm, 90);
}

/** Roll it back up. `instant` skips the animation (a scroll replacing a scroll). */
export function closeScroll(instant) {
  const c = CUR;
  if (!c) return;
  CUR = null;
  window.removeEventListener('keydown', c.onEsc);
  window.removeEventListener('resize', c.onResize);
  if (instant) { c.ov.remove(); return; }
  c.ov.classList.remove('on');
  setTimeout(() => c.ov.remove(), 380);
}

window.__scrollUi = { close: () => closeScroll() };
