/**
 * THE BUILDER, WITNESSED — a fixture for the Unity creator screen to be
 * pinned against.
 *
 * The Unity fork (Guild Rancher) carries a C# port of the character BUILDER
 * (crucible.js builderScreen: BUILDER_ROWS, _builderPartCycle,
 * shiftBuilderPart/Color/Skin) — the player-facing creator where every layer
 * is a spinner, not a die. A port of a picker is only right if it offers
 * exactly what the original offers: the same rows in the same order, the same
 * part cycle per layer (INCLUDING the randomSkip "unclothed templates" —
 * pickable in the builder, skipped only by generation, crucible.js:585-587),
 * the same none-stop on optional layers, the same 0..maxC colourways, the
 * same seven skin tones. So this script runs the REAL tables
 * (sprite-tables.js) and BUILDER_ROWS / _builderPartCycle LIFTED VERBATIM out
 * of crucible.js at run time (the dump-appearances.mjs trick — cut out of the
 * source and evaluated, so they cannot drift from it) and writes what it saw
 * to a JSON fixture the C# CreatorTests replay.
 *
 * It ALSO inventories the art: which colourway files actually exist for the
 * four layers the Unity port composites (bottom/top/head/hair). The manifest
 * OVERSTATES the packs in two ways the builder must survive:
 *   - the expansion packs never made a `_c1` file (their bare file IS the
 *     first colourway) — the Costumes.Add c1->bare fallback;
 *   - bottom10 claims maxC 7 but ce1 never drew a c5 AT ALL. The web builder
 *     offers it anyway, 404s, and silently draws a hero with no legs; the
 *     Unity cycler must simply not offer a colour the wardrobe cannot draw.
 * The per-part `shippedC` list here is the wardrobe's own testimony of what
 * exists, read from public/assets/sprites — the same files the Unity build's
 * Resources/Art/sprites were copied from.
 *
 *     node dev/dump-builder.mjs
 *
 * Emits (JsonUtility dialect: no nulls — the none stop is name:'' — because
 * JsonUtility quietly turns a JSON null into a default instance):
 *   - rows:      BUILDER_ROWS, key+label, in the order the player sees
 *   - skinTones: the seven ELEMENTS_SKIN_TONES names, in order
 *   - layers:    per BUILDER_ROWS layer: allowEmpty, and the FULL part cycle
 *                as _builderPartCycle computes it (none stop first when the
 *                layer may be empty), each part with maxC, randomSkip, and
 *                which colourways 0..maxC have a real file (shipped layers)
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tables = await import(new URL('../src/game/data/sprite-tables.js', import.meta.url));
const { ELEMENTS_MANIFEST, ELEMENTS_SKIN_TONES } = tables;

// ── Lift builder facts out of crucible.js, verbatim ─────────────────────────
const source = readFileSync(join(ROOT, 'src', 'game', 'crucible.js'), 'utf8');

function lift(name){
  const at = source.indexOf(`function ${name}(`);
  if (at < 0) throw new Error(`${name} not found in crucible.js`);
  let i = source.indexOf('{', at), depth = 0;
  for (; i < source.length; i++){
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) break;
  }
  return source.slice(at, i + 1);
}

// Same trick for an array literal — BUILDER_ROWS is data, not a function.
function liftArray(name){
  const at = source.indexOf(`var ${name} = [`);
  if (at < 0) throw new Error(`${name} not found in crucible.js`);
  let i = source.indexOf('[', at), depth = 0;
  for (let j = i; j < source.length; j++){
    if (source[j] === '[') depth++;
    else if (source[j] === ']' && --depth === 0) return source.slice(i, j + 1);
  }
  throw new Error(`${name}: unbalanced`);
}

const BUILDER_ROWS = new Function('return ' + liftArray('BUILDER_ROWS'))();
const cycleOf = new Function('ELEMENTS_MANIFEST', 'layer',
  lift('_builderPartCycle') + '\nreturn _builderPartCycle(layer);');

// ── The wardrobe's own inventory ────────────────────────────────────────────
// public/assets/sprites/<pack>/<layer>/<stem>.png — packs are core/ce1/ce2,
// and a stem's layer is its parent folder's name, wherever the pack put it.
const byLayer = {};
(function walk(dir){
  for (const e of readdirSync(dir, { withFileTypes: true })){
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.png'))
      (byLayer[basename(dir)] ??= new Set()).add(e.name.slice(0, -4));
  }
})(join(ROOT, 'public', 'assets', 'sprites'));

// The four layers the Unity port composites (Costumes.Dress; the accessory
// layers are generated-not-drawn — the generatePlainAppearance precedent).
const SHIPPED = new Set(['bottom', 'top', 'head', 'hair']);

const layers = BUILDER_ROWS.map(row => {
  const m = ELEMENTS_MANIFEST[row.key];
  const parts = cycleOf(ELEMENTS_MANIFEST, row.key).map(p => {
    if (!p) return { name: '', maxC: 0, randomSkip: false, shippedC: [] };
    const shippedC = [];
    if (SHIPPED.has(row.key)){
      const have = byLayer[row.key] || new Set();
      for (let c = 0; c <= p.maxC; c++)
        if (have.has(c > 0 ? `${p.name}_c${c}` : p.name)) shippedC.push(c);
    }
    return { name: p.name, maxC: p.maxC, randomSkip: !!p.randomSkip, shippedC };
  });
  return { key: row.key, allowEmpty: !!m.allowEmpty, parts };
});

const fixture = {
  rows: BUILDER_ROWS.map(r => ({ key: r.key, label: r.label })),
  skinTones: ELEMENTS_SKIN_TONES.map(t => t.name),
  layers,
};

const out = join(ROOT, '..', '..', '..', '..', 'Guild Rancher',
                 'Assets', 'Tests', 'EditMode', 'builder-fixture.json');
writeFileSync(out, JSON.stringify(fixture, null, 1));

// Say out loud where the manifest and the packs disagree — the holes the
// Unity cycler exists to step around.
console.log(`fixture → ${out}`);
console.log(`${fixture.rows.length} rows, ${fixture.skinTones.length} skin tones`);
for (const layer of layers){
  if (!SHIPPED.has(layer.key)) continue;
  for (const p of layer.parts){
    if (!p.name) continue;
    const holes = [];
    for (let c = 0; c <= p.maxC; c++) if (!p.shippedC.includes(c)) holes.push(c);
    if (holes.length)
      console.log(`  ${layer.key}/${p.name} (maxC ${p.maxC}) missing colourways: ${holes.join(', ')}`
        + (holes.every(c => c === 1) ? '  (c1 pack — bare stem is the first colourway)' : '  (REAL HOLE)'));
  }
}
