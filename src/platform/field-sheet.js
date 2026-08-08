/**
 * @file What you are, what you are carrying, and how the game is set up —
 * available from inside the world instead of only from the menus that own it.
 *
 * THE GAP THIS FILLS (playtest, 2026-08-08): "in delve, arena, or estate crawl
 * there is no way to view gear or change." That was exactly true. The delve's
 * first-person HUD offered three buttons — change view, camera, controls — the
 * arena offered zoom and camera, and the only character sheet in the game was
 * `#battleScreen`'s, which is the tactical board's alone. You could walk an
 * estate for twenty minutes with no way to answer "what am I holding".
 *
 * ONE SHEET, THREE LENSES, and deliberately not three sheets. The lenses do not
 * agree about what a fighter IS — the arena plays a crucible fighter with
 * materia-granted attacks, the delve walks a guild Person with items in a shared
 * inventory — and a panel that knew about both would grow a branch per lens and
 * drift the way the four renderers did (@see HANDOFF-RENDERER.md §3, the
 * data-model lesson). So this module knows about NEITHER. A lens hands it a
 * DESCRIPTION — rows of label/value, a worn set, some chips — and this draws it.
 * Adding a fourth lens is writing a fourth description, not a fourth sheet.
 *
 * IT DOES NOT PAUSE, and that is not an oversight. A view may not change the
 * rules (CLAUDE.md's ONE RULES FACT); the arena is real time and the delve has
 * things that roam, so a sheet that stopped the world would be a way to stop
 * being hit. Reading is free, and choosing WHEN to read is the cost.
 *
 * Built out of ordinary buttons so the controller cursor and the arrow keys
 * reach it for nothing (@see ui-pad.js), and closed by its own `[data-pad-back]`
 * so B and Escape mean what they mean everywhere else.
 */
import { showViewPanel } from './view-prefs.js';

let host = null;      // the live overlay, or null
let spec = null;      // the description the lens handed us
let tab = 'stats';
let picking = null;   // index into spec.gear while its slot picker is open

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A label/value line — the shape every tab is built out of. */
function row(r) {
  return '<div class="fs-row"><span class="fs-k">' + esc(r.label) + '</span>'
    + '<span class="fs-v">' + esc(r.value)
    + (r.sub ? '<i class="fs-sub">' + esc(r.sub) + '</i>' : '')
    + '</span></div>';
}

function chips(list, cls) {
  if (!list || !list.length) return '';
  return '<div class="fs-chips">'
    + list.map((c) => '<span class="fs-chip ' + (cls || '') + '"'
      + (c.title ? ' title="' + esc(c.title) + '"' : '') + '>'
      + esc(typeof c === 'string' ? c : c.label) + '</span>').join('')
    + '</div>';
}

/**
 * One worn slot. `art` is optional HTML the lens already knows how to make (the
 * arena has gearCardHTML, the guild has its item rows) — when it is given, this
 * shows it rather than inventing a second way to draw the same item.
 */
function gearRow(g, i) {
  const swap = !!(spec.equip && g && g.slot);
  const tag = swap ? 'button' : 'div';
  const body = (g && !g.empty)
    ? (g.art || ('<span class="fs-gname">' + esc(g.name) + '</span>'
        + (g.sub ? '<span class="fs-gsub">' + esc(g.sub) + '</span>' : '')))
    : '<span class="fs-gname">— empty —</span>';
  return '<' + tag + ' class="fs-gear' + (g && g.empty ? ' empty' : '') + (swap ? ' swap' : '') + '"'
    + (swap ? ' data-slot="' + i + '"' : '') + '>'
    + '<span class="fs-slot">' + esc((g && g.slot) || '') + '</span>'
    + '<span class="fs-gbody">' + body + '</span>'
    + (swap ? '<span class="fs-swap">Swap</span>' : '')
    + '</' + tag + '>';
}

/** The slot picker — what could go here instead. A sub-view of the Gear tab
 *  rather than a second overlay: an overlay over an overlay on a phone is two
 *  things to dismiss and one of them is always behind the other. */
function pickerHTML(g) {
  const opts = spec.equip.options(g.key) || [];
  let h = '<button class="fs-back" data-pick="back">&larr; ' + esc(g.slot) + '</button>';
  if (!g.empty) h += '<button class="fs-opt fs-opt-none" data-pick="">Take it off</button>';
  if (!opts.length) {
    h += '<div class="fs-none">Nothing else in the armory fits this slot.</div>';
  } else {
    for (const o of opts) {
      h += '<button class="fs-opt" data-pick="' + esc(o.id) + '">'
        + '<span class="fs-gname">' + esc(o.label) + '</span>'
        + (o.sub ? '<span class="fs-gsub">' + esc(o.sub) + '</span>' : '')
        + '</button>';
    }
  }
  return h;
}

function body() {
  if (tab === 'gear') {
    const list = spec.gear || [];
    if (picking != null && list[picking] && spec.equip) return pickerHTML(list[picking]);
    return list.length
      ? list.map(gearRow).join('')
      : '<div class="fs-none">Nothing worn.</div>';
  }
  if (tab === 'settings') {
    // LAUNCHERS, NOT A SECOND COPY. The camera dials already live in one place
    // and are shared by all three 3D lenses; a duplicate set here would be two
    // panels to keep in step. @see view-prefs.js.
    let h = '<div class="fs-none">Camera, display and controls for every view.</div>'
      + '<button class="fs-act" id="fsCam">Camera &amp; display…</button>';
    if (spec.onHelp) h += '<button class="fs-act" id="fsHelp">Controls…</button>';
    (spec.actions || []).forEach((a, i) => {
      h += '<button class="fs-act" data-act="' + i + '">' + esc(a.label) + '</button>';
    });
    return h;
  }
  let h = '';
  if (spec.vitals && spec.vitals.length) h += '<div class="fs-grid">' + spec.vitals.map(row).join('') + '</div>';
  if (spec.stats && spec.stats.length) h += '<div class="fs-grid">' + spec.stats.map(row).join('') + '</div>';
  h += chips(spec.notes);
  return h || '<div class="fs-none">Nothing to report.</div>';
}

function paint() {
  if (!host) return;
  host.querySelector('.fs-body').innerHTML = body();
  host.querySelectorAll('.fs-tab').forEach((b) => {
    b.classList.toggle('on', b.getAttribute('data-tab') === tab);
  });
  const cam = host.querySelector('#fsCam');
  if (cam) cam.onclick = () => showViewPanel(true);
  const help = host.querySelector('#fsHelp');
  if (help) help.onclick = () => { closeFieldSheet(); spec.onHelp(); };
  host.querySelectorAll('.fs-act[data-act]').forEach((b) => {
    b.onclick = () => {
      const a = (spec.actions || [])[+b.getAttribute('data-act')];
      if (!a) return;
      if (a.closes !== false) closeFieldSheet();
      a.run();
    };
  });
  host.querySelectorAll('.fs-gear.swap').forEach((b) => {
    b.onclick = () => { picking = +b.getAttribute('data-slot'); paint(); };
  });
  host.querySelectorAll('[data-pick]').forEach((b) => {
    b.onclick = () => {
      const v = b.getAttribute('data-pick');
      if (v === 'back') { picking = null; paint(); return; }
      const g = (spec.gear || [])[picking];
      if (!g) { picking = null; paint(); return; }
      spec.equip.apply(g.key, v || null);
      // Ask the lens again rather than patching the row: the swap may have
      // displaced something else (a bow gives up both hands), and only the
      // model knows what the member is wearing now.
      if (spec.refresh) { const next = spec.refresh(); if (next) spec = next; }
      picking = null;
      paint();
    };
  });
}

export function fieldSheetOpen() { return !!host; }

export function closeFieldSheet() {
  if (!host) return;
  host.remove();
  host = null;
  const s = spec; spec = null;
  if (s && s.onClose) s.onClose();
}

/**
 * Show the sheet for whatever the lens is playing.
 * @param {{name:string, sub?:string, vitals?:Array, stats?:Array, gear?:Array,
 *          notes?:Array, actions?:Array, onHelp?:Function, onClose?:Function}} s
 */
export function openFieldSheet(s) {
  if (!s) return;
  closeFieldSheet();
  spec = s;
  picking = null;
  host = document.createElement('div');
  host.className = 'fs-veil';
  host.innerHTML = '<div class="fs-card">'
    + '<div class="fs-head"><b>' + esc(s.name || 'Sheet') + '</b>'
    + (s.sub ? '<i>' + esc(s.sub) + '</i>' : '') + '</div>'
    + '<div class="fs-tabs">'
    + '<button class="fs-tab" data-tab="stats">Stats</button>'
    + '<button class="fs-tab" data-tab="gear">Gear</button>'
    + '<button class="fs-tab" data-tab="settings">Settings</button>'
    + '</div>'
    + '<div class="fs-body"></div>'
    + '<button class="fs-close" data-pad-back>Close</button>'
    + '</div>';
  host.querySelectorAll('.fs-tab').forEach((b) => {
    b.onclick = () => { tab = b.getAttribute('data-tab'); picking = null; paint(); };
  });
  host.querySelector('.fs-close').onclick = closeFieldSheet;
  // The backdrop closes it, but never a press that began inside the card — a
  // drag from a slider that ends on the veil is not a click on the veil.
  host.addEventListener('pointerdown', (e) => { if (e.target === host) closeFieldSheet(); });
  document.body.appendChild(host);
  paint();
  const first = host.querySelector('.fs-tab');
  if (first) try { first.focus({ preventScroll: true }); } catch (_e) {}
}

// Escape closes it from anywhere, the same key every other overlay in the game
// answers to. Registered once; a closed sheet is a no-op.
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !host) return;
    e.preventDefault();
    e.stopPropagation();
    closeFieldSheet();
  }, true);
  window.__fieldSheet = { open: openFieldSheet, close: closeFieldSheet, isOpen: fieldSheetOpen };
}
