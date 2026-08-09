/**
 * @file The compare panel — what you have on, beside what is being offered,
 * and the difference between them in green or red.
 *
 * THE GAP THIS FILLS (user request, 2026-08-08): every screen in the game that
 * offers you a piece of gear showed it ALONE. The loot screen printed the spoils
 * and never read `run.equipped`; the merchant priced a sword without saying what
 * sword you were holding; the armory shelf listed ↯ numbers with no ↯ to measure
 * them against; and the field sheet's slot picker went one better and FILTERED
 * THE WORN PIECE OUT of the list, so the one item you needed to compare against
 * was the one item guaranteed to be missing. In all four the player was doing
 * the arithmetic in their head, from numbers that were never on screen together.
 *
 * ONE PANEL, TWO ITEM MODELS, and deliberately not two panels. The crucible's
 * gear (type/tier/sockets/materia/refinement) and the guild's Item (kind/
 * material/quality/plus/durability) share no field but `id` and `name`, and a
 * renderer that knew about both would grow a branch per model and drift the way
 * the four renderers did (@see HANDOFF-RENDERER.md §3). So this module knows
 * about NEITHER. A caller hands it two DESCRIPTIONS and a list of rows; this
 * draws them and subtracts. Adding a third item model is writing a third
 * description, not a third panel. @see field-sheet.js, which is the same seam.
 *
 * IT NEVER AUTHORS A NUMBER. CLAUDE.md's ONE RULES FACT: combat, reach and
 * legality are decided by the shared model, never by a view — so this file
 * contains no stat table, no weighting, and no opinion about what a sword is
 * worth. It subtracts two numbers the model handed it and paints the sign. If a
 * column would need a rule invented to fill it, the caller must not pass it.
 *
 * THE DELTA IS COMPUTED FROM NUMBERS, THE DISPLAY FROM A FORMATTER — and they
 * are never the same string. That scar is the lab panel's (crucible.js:6688):
 * deltas were once subtracted from FORMATTED text, which happens to work for
 * '+3' and printed a red NaN beside every stat that formatted as anything else
 * ('19-20'). Rows here carry `cur`/`cand` as raw numbers and `fmt` separately;
 * a row whose values are not both finite numbers is a TEXT row and is shown as
 * "old → new" instead of being subtracted.
 */

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * The difference a row is worth, or null when there is no arithmetic to do.
 * Deliberately strict: a string that happens to parse as a number ('19-20'
 * parses as 19) is NOT a quantity, and treating it as one is the exact bug the
 * file header records.
 */
function deltaOf(row) {
  if (typeof row.cur !== 'number' || typeof row.cand !== 'number') return null;
  if (!isFinite(row.cur) || !isFinite(row.cand)) return null;
  return row.cand - row.cur;
}

/**
 * The signed, coloured difference. `invert` is for stats where LOWER is better
 * (crit-on: 19-20 beats 20-20), which is a property of the stat and therefore
 * the caller's to declare — this file has no way to know it.
 */
function deltaHTML(diff, row) {
  if (diff == null || !isFinite(diff) || diff === 0) return '';
  const good = row.invert ? diff < 0 : diff > 0;
  return '<span class="cmp-delta ' + (good ? 'up' : 'down') + '">'
    + (diff > 0 ? '+' : '') + diff + esc(row.suffix || '') + '</span>';
}

/** One stat line. Left column = worn, right column = offered, then the delta. */
function rowHTML(row, hasCand) {
  const fmt = row.fmt || ((v) => v);
  const curTxt = row.cur == null || row.cur === '' ? '—' : fmt(row.cur);
  const candTxt = row.cand == null || row.cand === '' ? '—' : fmt(row.cand);
  const diff = deltaOf(row);
  // A row with nothing to compare against is still worth printing — it is what
  // the item IS. It just has no second column and no delta.
  if (!hasCand) {
    return '<div class="cmp-row"><span class="cmp-label">' + esc(row.label) + '</span>'
      + '<span class="cmp-cur">' + esc(curTxt) + '</span></div>';
  }
  // Word-valued stats ('1d4', 'Arrow Shot', '—') have no difference to subtract,
  // so the change IS the new value. Same rule the lab's textRow keeps.
  const changed = diff == null && String(curTxt) !== String(candTxt);
  return '<div class="cmp-row' + (changed ? ' changed' : '') + '">'
    + '<span class="cmp-label">' + esc(row.label) + '</span>'
    + '<span class="cmp-cur">' + esc(curTxt) + '</span>'
    + '<span class="cmp-cand">' + esc(candTxt) + deltaHTML(diff, row) + '</span>'
    + '</div>';
}

/** One side's heading — the item itself, however its lens likes to draw it. */
function sideHTML(side, cls, fallbackTitle) {
  const s = side || {};
  const body = s.empty || (!s.name && !s.art)
    ? '<span class="cmp-empty">— nothing —</span>'
    : (s.art || ('<span class="cmp-name">' + esc(s.name) + '</span>'
      + (s.sub ? '<span class="cmp-sub">' + esc(s.sub) + '</span>' : '')));
  return '<div class="cmp-side ' + cls + '">'
    + '<div class="cmp-side-title">' + esc(s.title || fallbackTitle) + '</div>'
    + '<div class="cmp-side-body">' + body + '</div>'
    + '</div>';
}

/**
 * Attacks and abilities gained or lost by the swap. These are NAMES, not
 * numbers — a thing you would or would not be able to do — so they get chips
 * rather than a row, and only the ones that CHANGE are worth the space.
 * @param {{label:string, state:'added'|'removed'|''}[]} tags
 */
function tagsHTML(tags) {
  if (!tags || !tags.length) return '';
  const shown = tags.filter((t) => t && t.label);
  if (!shown.length) return '';
  return '<div class="cmp-tags">' + shown.map((t) =>
    '<span class="cmp-tag ' + esc(t.state || '') + '">'
    + (t.state === 'added' ? '+ ' : t.state === 'removed' ? '− ' : '')
    + esc(t.label) + '</span>').join('') + '</div>';
}

/**
 * The split window.
 *
 * @param {Object} spec
 * @param {string} [spec.slot]      the slot being contested ('Main Hand')
 * @param {Object} [spec.cur]       {title?, name, sub, art, empty} — what is worn
 * @param {Object} [spec.cand]      {title?, name, sub, art} — what is offered; omit
 *                                  to render a one-sided readout of `cur`
 * @param {Array}  [spec.rows]      [{label, cur, cand, fmt?, invert?, suffix?}]
 * @param {Array}  [spec.tags]      [{label, state:'added'|'removed'|''}]
 * @param {string} [spec.note]      a caveat the MODEL knows (e.g. what a bow displaces)
 * @param {boolean}[spec.compact]   inline under a card rather than a standalone block
 * @returns {string} HTML
 */
export function compareHTML(spec) {
  if (!spec) return '';
  const hasCand = !!spec.cand;
  const rows = (spec.rows || []).filter((r) => r && r.label);
  return '<div class="cmp' + (spec.compact ? ' compact' : '') + (hasCand ? '' : ' solo') + '">'
    + (spec.slot ? '<div class="cmp-slot">' + esc(spec.slot) + '</div>' : '')
    + '<div class="cmp-sides">'
    + sideHTML(spec.cur, 'is-cur', 'Equipped')
    + (hasCand ? sideHTML(spec.cand, 'is-cand', 'Offered') : '')
    + '</div>'
    + (rows.length ? '<div class="cmp-rows">' + rows.map((r) => rowHTML(r, hasCand)).join('') + '</div>' : '')
    + tagsHTML(spec.tags)
    + (spec.note ? '<div class="cmp-note">' + esc(spec.note) + '</div>' : '')
    + '</div>';
}

/**
 * The one-line verdict, for places too tight for the full panel (an option in a
 * picker, a row on the armory shelf). Shows only the headline number's delta.
 * Same arithmetic, same colours, so a player who reads both never sees them
 * disagree.
 * @param {number} cur @param {number} cand @param {{invert?:boolean,suffix?:string,label?:string}} [opts]
 */
export function deltaChipHTML(cur, cand, opts) {
  const o = opts || {};
  const d = deltaOf({ cur, cand });
  if (d == null || d === 0) {
    return '<span class="cmp-chip same">' + esc(o.same || 'no change') + '</span>';
  }
  const good = o.invert ? d < 0 : d > 0;
  return '<span class="cmp-chip ' + (good ? 'up' : 'down') + '">'
    + (d > 0 ? '+' : '') + d + esc(o.suffix || '')
    + (o.label ? ' ' + esc(o.label) : '') + '</span>';
}

/**
 * Turn two lists of ability NAMES into the chips above. The caller owns both
 * lists because only the model knows what an item grants.
 * @param {string[]} curList @param {string[]} candList
 */
export function diffTags(curList, candList) {
  const a = curList || [], b = candList || [];
  const inA = {}, inB = {};
  a.forEach((n) => { inA[n] = 1; });
  b.forEach((n) => { inB[n] = 1; });
  const all = [];
  const seen = {};
  a.concat(b).forEach((n) => { if (!seen[n]) { seen[n] = 1; all.push(n); } });
  return all.map((n) => ({
    label: n,
    state: inA[n] && inB[n] ? '' : (inB[n] ? 'added' : 'removed'),
  })).filter((t) => t.state); // only the CHANGES earn the space
}
