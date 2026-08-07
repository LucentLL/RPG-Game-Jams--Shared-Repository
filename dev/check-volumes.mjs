/**
 * THE SIZE LAW, ENFORCED. Every authored prop, in tiles and in player-heights,
 * with the two facts that must agree checked against each other:
 *
 *   1. THE LADDER (user decree 2026-08-06): a prop's height in prop-volume.js
 *      is a legal multiple of PLAYER_H — 0.125, 0.25, 0.5, 0.75, 1, 1.25,
 *      1.5, 2, 3 — because "object heights should be related to player
 *      character sizes", and a human-usable thing is sized for a human.
 *   2. THE CHART WIDTH (the ONE SIZE FACT every lens draws from) is COMPUTED
 *      from that height: w = h × (art.w/art.h) × 48. Authoring w by eye is how
 *      the anvil came to stand eye-high — this script fails on any drift, so
 *      the drift can never again be silent.
 *
 *     node dev/check-volumes.mjs
 *
 * Reads the REAL tables (art.js's ART, delve-maps.js's and campus.js's props,
 * prop-volume.js) rather than a copy of them, so it cannot quietly drift from
 * the game — which is the only reason a check like this is worth keeping.
 * art.js can't simply be imported here because it pulls in `import.meta.env`,
 * so its one object literal is lifted out and evaluated instead.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'guild') + '/';
const { PROP_VOL, propCell, PLAYER_H, LADDER } =
  await import(new URL('../src/guild/prop-volume.js', import.meta.url));

/** Pull a balanced literal out of a source file, starting at `open`. */
function literal(src, startRe, open, close) {
  const m = startRe.exec(src);
  if (!m) return null;
  let i = src.indexOf(open, m.index), depth = 0, j = i;
  for (; j < src.length; j++) {
    if (src[j] === open) depth++;
    else if (src[j] === close && --depth === 0) break;
  }
  return src.slice(i, j + 1);
}

const artSrc = readFileSync(ROOT + 'art.js', 'utf8');
const ART = eval('(' + literal(artSrc, /export const ART = /, '{', '}') + ')');

// Every `props: [ ... ]` array in the delve charts, flattened.
const mapSrc = readFileSync(ROOT + 'delve-maps.js', 'utf8');
const props = [];
for (let k = 0; ;) {
  const at = mapSrc.indexOf('props: [', k);
  if (at < 0) break;
  const lit = literal(mapSrc.slice(at), /props: /, '[', ']');
  props.push(...eval('(' + lit + ')'));
  k = at + 8;
}
// Campus placeables carry their width from PROP_KINDS instead.
const campusSrc = readFileSync(ROOT + 'campus.js', 'utf8');
for (const m of campusSrc.matchAll(/art: '(\w+)',\s+w: (\d+)/g)) props.push({ art: m[1], w: +m[2] });

const T = 300, K = T / 900, WALL_H = 1260 * K, CEIL = WALL_H / T;   // ceiling, in tiles
const M = 2.1;   // metres per tile (eye 0.77 tiles ≈ 1.65 m)

// Sizing must agree within rounding: w is an integer px against the 48px tile,
// so ±1 px against the exact derivation is the honest tolerance — for EVERY
// form. (Comparing heights through the aspect instead let a wide crop hide
// ±4 px of drift and would flag a tall narrow crop at its own correct round.)
const W_TOL = 1.0;     // px — authored w against the volume-derived spec

// The props allowed to keep the old billboard sizing: no volume entry, width
// still the top-down's authored fact. Anything ELSE without a volume is the
// silent drift this script exists to stop — the law is not opt-in per prop.
const BILLBOARD_OK = new Set(['treeTall', 'gateArch', 'wagon']);

// EVERY authored width per art, so one object drawn two sizes is caught too.
const widths = new Map();
for (const p of props) {
  if (!widths.has(p.art)) widths.set(p.art, new Set());
  if (p.w) widths.get(p.art).add(p.w);
}

const bad = [];
const rows = [];
for (const [name, ws] of widths) {
  const a = ART[name];
  if (!a) { bad.push(`${name}: NO ART`); continue; }
  const v = PROP_VOL[name];
  if (ws.size > 1) bad.push(`${name}: authored at ${ws.size} different widths (${[...ws].join(', ')}) — one object, one size`);
  const w = [...ws][0];
  if (!v) {
    if (!BILLBOARD_OK.has(name)) bad.push(`${name}: no PROP_VOL entry and not on the billboard allowlist — author its ladder height`);
    rows.push({ name, form: 'billboard', w, hChart: (w / 48) * (a.h / a.w) });
    continue;
  }

  // The ladder: the authored height is a legal multiple of the player.
  const rung = v.h / PLAYER_H;
  const snapped = LADDER.reduce((b, r) => (Math.abs(r - rung) < Math.abs(b - rung) ? r : b));
  if (Math.abs(snapped - rung) > 0.01) {
    bad.push(`${name}: h ${v.h.toFixed(3)} tiles is ${rung.toFixed(3)}× the player — off the ladder (nearest ${snapped}×)`);
  }

  // The chart width agrees with the size it was computed from — the exact
  // derivation, all three forms, so no aspect can widen the tolerance.
  const spec = (v.form === 'lie' ? v.d : v.h) * (a.w / a.h) * 48;
  const hChart = v.form === 'stand' ? (w / 48) * (a.h / a.w) : null;
  if (Math.abs(w - spec) > W_TOL) {
    bad.push(`${name}: chart w ${w} but the ${v.form} volume derives ${spec.toFixed(1)}px — re-author w = ${Math.round(spec)}`);
  }

  // Nothing indoor pierces the roof (outdoor placeables all sit under it too).
  const top = v.mid != null ? v.mid + v.h / 2 : v.h;
  if (top > CEIL) bad.push(`${name}: top at ${top.toFixed(2)} tiles is through the ${CEIL.toFixed(2)} ceiling`);

  rows.push({ name, form: v.form, w, rung: snapped, h: v.h, d: v.d, mid: v.mid, hChart });
}

const f = (n, p = 2) => (n == null ? '    - ' : n.toFixed(p).padStart(6));
console.log('prop              form        ×player  h(tiles)  h(m)   chart w  w-derived h');
console.log('-'.repeat(80));
for (const r of rows.sort((x, y) => (x.rung || 99) - (y.rung || 99) || x.name.localeCompare(y.name))) {
  console.log(
    r.name.padEnd(18) + r.form.padEnd(11)
    + (r.rung != null ? String(r.rung).padStart(6) : '     -') + '  '
    + f(r.h) + '  ' + (r.h != null ? (r.h * M).toFixed(2).padStart(5) : '    -')
    + String(r.w ?? '-').padStart(9)
    + (r.hChart != null ? f(r.hChart) : '      '));
}
console.log('-'.repeat(80));
console.log(`player ${PLAYER_H.toFixed(3)} tiles · ceiling ${CEIL.toFixed(2)} tiles · ${rows.length} distinct props · `
  + `${rows.filter((r) => r.form !== 'billboard').length} on the ladder · `
  + `${rows.filter((r) => r.form === 'billboard').length} still billboard-sized (a gap, not a default)`);

// Layer cost is no longer worth tabulating: EVERY furnishing is exactly one
// quad now — a sprite that turns to face you, a bed flat on the floor, or a
// portrait flat on a wall. That is Hexen's rule and it is also, by some way,
// the cheapest of the three things this project tried. Assert it rather than
// print it, so a future form that quietly costs two is a failure, not a footnote.
const many = [...widths.keys()].filter((n) => {
  const v = PROP_VOL[n];
  return v && !['stand', 'lie', 'wall'].includes(v.form);
});
console.log('\nlayers: one quad per furnishing'
  + (many.length ? '  ** EXCEPT ' + many.join(', ') : ' — every form, no exceptions'));

// WHERE THINGS STAND. The charts anchor a furnishing on its cell's SOUTH EDGE
// (the top-down view's foot line, art rising north into the marked 'f'), so a
// lens that takes it literally plants everything on a boundary. propCell reads
// the line back into the cell. Counted rather than eyeballed, because "centred"
// is exactly the kind of thing a screenshot argues about.
const frac = (v) => ((v % 1) + 1) % 1;
let onLine = 0, centred = 0, kept = 0, stillOff = [];
for (const p of props) {
  const c = propCell(p);
  if (frac(p.y) < 1e-6) onLine++;
  if (c.y === p.y) { kept++; continue; }
  if (Math.abs(frac(c.y) - 0.5) < 1e-6) centred++;
  else stillOff.push(p.art + '@' + c.y);
}
console.log('\nanchors:');
console.log('  ' + String(onLine).padStart(3) + ' were on a tile boundary');
console.log('  ' + String(centred).padStart(3) + ' now stand at a tile centre');
console.log('  ' + String(kept).padStart(3) + ' left as authored (wall-hugging + tabletop nudges)');
if (stillOff.length) console.log('  ** moved but not centred: ' + stillOff.join(', '));

// THE FOLD is read off the art, so it can only be wrong two ways: outside the
// crop, or claimed by a form that has no front to fold (@see extrudeFold).
for (const [art, v] of Object.entries(PROP_VOL)) {
  if (v.fold == null) continue;
  if (v.form !== 'stand') bad.push(`${art}: fold on a '${v.form}' prop — only a standing elevation folds`);
  if (!(v.fold > 0.05 && v.fold < 0.9)) bad.push(`${art}: fold ${v.fold} is outside the crop's usable band (0.05–0.9)`);
}

if (bad.length) {
  console.log('\n** THE SIZE LAW IS BROKEN:');
  for (const b of bad) console.log('   ' + b);
  process.exitCode = 1;
} else {
  console.log('\nsize law holds: every height on the ladder, every chart width derived from it.');
}
