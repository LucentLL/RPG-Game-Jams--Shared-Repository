/**
 * @file Drawn UI icons — the game's own pixel glyphs, replacing emoji.
 *
 * Every icon is a 16×16 monochrome silhouette authored as rectangle runs,
 * rasterised once to a data URL and applied as a CSS MASK over currentColor —
 * so an icon inherits the text colour of wherever it stands (gold in the rail,
 * ink on parchment) exactly the way a character of text would, and the same
 * icon serves every theme without a second bake.
 *
 * Emoji were the old icons, and they were the one part of the UI the game did
 * not draw: coloured by the platform, styled by the platform, different on
 * every platform. These are art, at the same 1em size, under our palette.
 *
 * Usage: icon('forge') → an inline <i> you can drop into any innerHTML.
 * CSS contract (guild.css): .gi is an inline-block 1em square with
 * background:currentColor and mask properties read from --gi.
 */

/** Rect-run silhouettes on a 16×16 grid: [x, y, w, h] fills. */
const GLYPHS = {
  // ── rooms ────────────────────────────────────────────────────────────────
  tent: [[7, 2, 2, 2], [6, 4, 4, 2], [5, 6, 6, 2], [4, 8, 8, 2], [3, 10, 10, 2], [2, 12, 12, 2], [2, 13, 3, 1], [11, 13, 3, 1], [7, 10, 2, 4]],
  quill: [[11, 2, 3, 2], [10, 4, 3, 2], [9, 6, 3, 2], [8, 8, 3, 1], [7, 9, 3, 1], [6, 10, 2, 1], [5, 11, 2, 1], [4, 12, 2, 1], [3, 13, 8, 1], [12, 1, 2, 2]],
  globe: [[5, 2, 6, 1], [3, 3, 10, 2], [2, 5, 12, 6], [3, 11, 10, 2], [5, 13, 6, 1], [7, 2, 2, 12], [2, 7, 12, 2]],
  calendar: [[2, 3, 12, 2], [2, 5, 12, 9], [4, 1, 2, 3], [10, 1, 2, 3], [4, 7, 2, 2], [7, 7, 2, 2], [10, 7, 2, 2], [4, 10, 2, 2], [7, 10, 2, 2]],
  shield: [[3, 2, 10, 2], [3, 4, 10, 4], [4, 8, 8, 2], [5, 10, 6, 2], [6, 12, 4, 1], [7, 13, 2, 1]],
  map: [[2, 3, 4, 10], [6, 2, 4, 10], [10, 3, 4, 10], [3, 5, 2, 1], [7, 7, 2, 1], [11, 6, 2, 1], [11, 9, 2, 1]],
  town: [[2, 8, 5, 6], [3, 6, 3, 2], [9, 8, 5, 6], [10, 6, 3, 2], [6, 4, 4, 10], [7, 2, 2, 2], [4, 10, 1, 2], [11, 10, 1, 2], [7, 11, 2, 3]],
  swords: [[3, 2, 2, 2], [11, 2, 2, 2], [4, 4, 2, 2], [10, 4, 2, 2], [5, 6, 2, 2], [9, 6, 2, 2], [6, 8, 4, 2], [5, 10, 2, 2], [9, 10, 2, 2], [3, 12, 3, 2], [10, 12, 3, 2]],
  hammer: [[3, 3, 8, 4], [5, 1, 4, 2], [11, 4, 2, 2], [6, 7, 3, 7], [5, 13, 5, 1]],
  pot: [[3, 5, 10, 2], [2, 7, 12, 5], [3, 12, 10, 1], [1, 6, 2, 4], [13, 6, 2, 4], [5, 2, 2, 2], [9, 3, 2, 1], [7, 1, 2, 2]],
  jar: [[5, 1, 6, 2], [4, 3, 8, 1], [3, 4, 10, 9], [4, 13, 8, 1], [5, 6, 6, 4]],
  book: [[2, 3, 5, 10], [9, 3, 5, 10], [7, 4, 2, 10], [3, 5, 3, 1], [10, 5, 3, 1], [3, 7, 3, 1], [10, 7, 3, 1]],
  sword: [[7, 1, 2, 8], [6, 2, 1, 5], [9, 2, 1, 5], [4, 9, 8, 2], [7, 11, 2, 3], [6, 13, 4, 1]],
  flask: [[6, 1, 4, 2], [7, 3, 2, 3], [5, 6, 6, 2], [4, 8, 8, 4], [5, 12, 6, 1], [6, 9, 2, 2]],
  mug: [[3, 3, 8, 10], [11, 5, 3, 2], [12, 7, 2, 3], [11, 10, 3, 1], [4, 2, 6, 1], [4, 5, 6, 1]],
  cap: [[2, 5, 12, 2], [4, 3, 8, 2], [6, 7, 4, 2], [5, 9, 6, 1], [12, 7, 1, 4], [11, 11, 3, 1]],
  // ── desk & world ─────────────────────────────────────────────────────────
  scroll: [[3, 2, 10, 2], [4, 4, 8, 8], [3, 12, 10, 2], [2, 2, 2, 3], [12, 2, 2, 3], [2, 11, 2, 3], [12, 11, 2, 3], [6, 6, 4, 1], [6, 8, 4, 1]],
  ledger: [[3, 2, 10, 12], [4, 3, 8, 10], [5, 5, 6, 1], [5, 7, 6, 1], [5, 9, 4, 1], [9, 11, 2, 2]],
  handshake: [[1, 6, 4, 3], [11, 6, 4, 3], [5, 7, 3, 3], [8, 7, 3, 3], [4, 9, 3, 2], [9, 9, 3, 2], [6, 10, 4, 2]],
  trophy: [[4, 2, 8, 2], [5, 4, 6, 3], [6, 7, 4, 1], [7, 8, 2, 3], [5, 11, 6, 1], [4, 12, 8, 2], [2, 3, 2, 3], [12, 3, 2, 3], [3, 6, 2, 1], [11, 6, 2, 1]],
  plan: [[2, 2, 12, 12], [3, 3, 10, 10], [5, 3, 1, 10], [3, 8, 10, 1], [8, 5, 4, 1], [8, 6, 1, 2]],
  // ── delve & combat ───────────────────────────────────────────────────────
  door: [[3, 2, 10, 12], [4, 3, 8, 11], [10, 8, 2, 2], [5, 1, 6, 1]],
  potion: [[6, 1, 4, 2], [7, 3, 2, 2], [5, 5, 6, 2], [4, 7, 8, 5], [5, 12, 6, 1], [5, 8, 4, 3]],
  guard: [[3, 2, 10, 3], [4, 5, 8, 4], [5, 9, 6, 2], [6, 11, 4, 1], [7, 12, 2, 1], [7, 4, 2, 6]],
  strike: [[2, 12, 3, 2], [4, 10, 2, 2], [6, 8, 2, 2], [8, 6, 2, 2], [10, 4, 2, 2], [12, 2, 2, 2], [11, 1, 4, 4], [3, 9, 1, 2], [5, 11, 2, 1]],
  pick: [[2, 4, 3, 2], [5, 3, 6, 2], [11, 4, 3, 2], [7, 5, 2, 9], [2, 2, 2, 2], [12, 2, 2, 2]],
  skull: [[4, 2, 8, 6], [3, 4, 10, 4], [5, 8, 6, 3], [4, 11, 2, 2], [7, 11, 2, 2], [10, 11, 2, 2], [5, 5, 2, 2], [9, 5, 2, 2]],
  eye: [[4, 5, 8, 1], [2, 6, 12, 4], [4, 10, 8, 1], [6, 6, 4, 4], [7, 7, 2, 2]],
  boot: [[4, 2, 4, 7], [4, 9, 7, 3], [9, 10, 4, 2], [3, 12, 10, 2]],
  coin: [[5, 2, 6, 1], [3, 3, 10, 2], [2, 5, 12, 6], [3, 11, 10, 2], [5, 13, 6, 1], [7, 5, 2, 6], [6, 5, 4, 1], [6, 10, 4, 1]],
  crown: [[2, 10, 12, 3], [2, 4, 2, 6], [12, 4, 2, 6], [7, 3, 2, 7], [4, 6, 2, 4], [10, 6, 2, 4]],
  leaf: [[8, 2, 4, 2], [6, 4, 7, 3], [5, 7, 7, 3], [6, 10, 4, 2], [4, 9, 2, 4], [3, 13, 2, 1]],
  auto: [[3, 3, 10, 8], [5, 1, 2, 2], [9, 1, 2, 2], [5, 5, 2, 2], [9, 5, 2, 2], [5, 8, 6, 1], [2, 5, 1, 4], [13, 5, 1, 4], [4, 11, 3, 3], [9, 11, 3, 3]],
};

const _urls = {};
/** Rasterise one glyph (16×16, white on transparent) → data URL, cached. */
function glyphUrl(name) {
  if (_urls[name]) return _urls[name];
  const runs = GLYPHS[name];
  if (!runs) return '';
  const cv = document.createElement('canvas');
  cv.width = 16; cv.height = 16;
  const g = cv.getContext('2d');
  g.fillStyle = '#fff';
  for (const [x, y, w, h] of runs) g.fillRect(x, y, w, h);
  return (_urls[name] = cv.toDataURL());
}

/** An inline icon element, as markup. Sized 1em, coloured by currentColor. */
export function icon(name, cls) {
  const u = glyphUrl(name);
  if (!u) return '';
  return `<i class="gi${cls ? ' ' + cls : ''}" style="--gi:url(${u})"></i>`;
}

/** The raw mask url — for CSS-side uses (buttons that set their own size). */
export function iconUrl(name) { return glyphUrl(name); }
