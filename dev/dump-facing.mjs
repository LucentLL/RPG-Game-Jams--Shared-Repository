/**
 * THE FACING FENCES, WITNESSED — a fixture for the Unity port's FacingToRow.
 *
 * facingToRow (src/game/engine/facing.js) is nine lines, and nine lines is
 * exactly the size of function that gets re-typed instead of transcribed and
 * then disagrees on a diagonal for a month. The Unity fork picks every sheet
 * row through its port of this function — fighters and fifteen hundred
 * spectators alike, camera-relative the way action-fp.js:548 subtracts the
 * yaw — so the fences (45°, 135°, 225°, 315°) must be the web's own.
 *
 * The function is LIFTED VERBATIM out of facing.js at run time (the
 * check-volumes.mjs / dump-appearances.mjs trick: it cannot drift from the
 * source because it IS the source). The samples keep 0.25° clear of the four
 * fences on purpose: the two builds convert radians to degrees in different
 * float widths, and a sample sitting ON a fence tests the parsers rather
 * than the rule.
 *
 *     node dev/dump-facing.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ── Lift the real function out of facing.js, verbatim ───────────────────────
const source = readFileSync(join(ROOT, 'src', 'game', 'engine', 'facing.js'), 'utf8');
const at = source.indexOf('function facingToRow(');
if (at < 0) throw new Error('facingToRow not found in facing.js');
let i = source.indexOf('{', at), depth = 0;
for (; i < source.length; i++) {
  if (source[i] === '{') depth++;
  else if (source[i] === '}' && --depth === 0) break;
}
const facingToRow = new Function('return ' + source.slice(at, i + 1))();

// ── The witness: every sector, both shoulders of every fence, two turns out ──
const cases = [];
for (let base = -720; base < 720; base += 45) {
  for (const deg of [base + 0.25, base + 22.5, base + 44.75]) {
    const a = (deg * Math.PI) / 180;
    cases.push({ a, row: facingToRow(a) });
  }
}

const out = join(ROOT, '..', '..', '..', '..', 'Guild Rancher',
                 'Assets', 'Tests', 'EditMode', 'facing-fixture.json');
writeFileSync(out, JSON.stringify({ cases }, null, 1));
console.log(`fixture → ${out}  (${cases.length} cases)`);
