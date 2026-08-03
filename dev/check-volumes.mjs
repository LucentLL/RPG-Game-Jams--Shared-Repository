/**
 * Every authored delve prop, before and after — in tiles and in metres, with a
 * ceiling check, and what the whole lot costs in compositor layers per chart.
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
const { PROP_VOL } = await import(new URL('../src/guild/prop-volume.js', import.meta.url));

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

const seen = new Map();
for (const p of props) if (!seen.has(p.art)) seen.set(p.art, p);

const rows = [];
for (const [name, p] of seen) {
  const a = ART[name];
  if (!a) { rows.push({ name, note: 'NO ART' }); continue; }
  const oldW = (p.w || 48) / 48, oldH = oldW * (a.h / a.w);
  const v = PROP_VOL[name];
  let newW = oldW, newH = oldH, newD = 0, form = 'billboard';
  if (v) {
    form = v.form;
    newH = v.h;
    newW = v.form === 'lie' ? v.d * (a.w / a.h) : v.h * (a.w / a.h);
    newD = v.d || 0;
    if (v.form === 'lie') { newD = v.d; }
  }
  rows.push({ name, form, oldH, newH, newW, newD, mid: v && v.mid });
}

const f = (n) => (n == null ? '   -  ' : n.toFixed(2).padStart(6));
console.log('prop              form        old h   new h   new w   new d    height   over');
console.log('                              (tiles) (tiles) (tiles) (tiles)  (m)      ceiling?');
console.log('-'.repeat(84));
let over = 0, fixed = 0;
for (const r of rows.sort((x, y) => (x.form || '').localeCompare(y.form || '') || x.name.localeCompare(y.name))) {
  if (r.note) { console.log(r.name.padEnd(18) + r.note); continue; }
  const top = (r.mid != null ? r.mid + r.newH / 2 : r.newH);
  const bad = top > CEIL;
  if (bad) over++;
  if (r.oldH > CEIL && !bad) fixed++;
  console.log(
    r.name.padEnd(18) + r.form.padEnd(11)
    + f(r.oldH) + '  ' + f(r.newH) + '  ' + f(r.newW) + '  ' + f(r.newD)
    + '   ' + (r.newH * M).toFixed(2).padStart(5) + 'm'
    + (bad ? '   ** THROUGH THE CEILING' : (r.oldH > CEIL ? '   (was through it)' : '')));
}
console.log('-'.repeat(84));
console.log(`ceiling ${CEIL.toFixed(2)} tiles · ${rows.length} distinct props · `
  + `${rows.filter((r) => r.form && r.form !== 'billboard').length} given a volume · `
  + `${fixed} no longer pierce the ceiling · ${over} still do`);

// Quad cost, per form, so the layer budget is a number and not a hope. Every
// solid is a CROSS now (there is no box — see prop-volume.js); a slab adds a lid
// only when it is shorter than the eye, because you cannot see the top of a
// wardrobe and an invisible quad is a compositor layer spent on nothing.
const EYE_T = 690 / 900;   // eye height in tiles, K cancels
const cost = (v) => {
  if (!v) return 1;                                   // billboard
  if (v.form === 'wall') return 1;
  if (v.form === 'lie') return 3;                     // crossed frame + art lid
  if (v.form === 'slab') return v.h < EYE_T ? 3 : 2;
  return 2;                                           // cross
};
const byMap = {};
for (let k = 0; ;) {
  const at = mapSrc.indexOf('props: [', k);
  if (at < 0) break;
  const id = (mapSrc.slice(0, at).match(/(\w+): \{\s*\n\s*id: '(\w+)'/g) || []).pop() || '?';
  const lit = literal(mapSrc.slice(at), /props: /, '[', ']');
  const list = eval('(' + lit + ')');
  const name = (id.match(/id: '(\w+)'/) || [, '?'])[1];
  byMap[name] = list.reduce((s, q) => s + cost(PROP_VOL[q.art]), 0);
  k = at + 8;
}
console.log('\nquads spent on furnishings, per chart (was 1 each):');
for (const [m, n] of Object.entries(byMap).sort((a, b) => b[1] - a[1])) {
  console.log('  ' + m.padEnd(14) + String(n).padStart(3) + ' quads');
}
