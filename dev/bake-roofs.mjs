/**
 * The roof kit, cut down to the tiles a roof is actually made of.
 *
 *   node --import ./dev/register-vite-env.mjs dev/bake-roofs.mjs
 *
 * WHY THIS EXISTS. Until now a building's roof was a shingle texture DRAWN in
 * canvas (delve.js `shingleUrl`) — six bands of #8a4a3a with a highlight and a
 * nail dot. It was written when no owned kit carried roof tiles, exactly as the
 * art law allows. One does now: `2021_rooftops_update` ships seven colourways
 * of a clay-tile roof at 48px, which is the delve's own tile size, so nothing
 * has to be scaled to use it.
 *
 * WHY A BAKE AND NOT A COPY. Each colourway sheet is 768×768 and two tiles are
 * wanted out of it. Copying all seven into public/ would put 320KB of unused
 * dormers, chimneys and stone walls into the phone build to paint one slope.
 * The output is a 384×48 strip — under 2KB — and art.js ROOF_KIT records which
 * cells it came from, so re-cutting it later is reading, not archaeology.
 *
 * WHY A STRIP AND NOT SEVEN FILES. `.dv-roofq` tiles its texture with
 * `background-repeat: repeat`, and CSS cannot repeat a sub-rectangle of an
 * image. So the runtime cuts one cell out of this strip into its own 48×48
 * canvas and hands CSS a data URL — the same move `apronTileUrl` already makes
 * with the cliff sheet. One request, seven roofs.
 *
 * Re-run it when the kit changes. The output is committed: public/ is the art
 * the game serves, and the source zip is vendored in rpg-assets/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPng, encodePng, blankPng, blitPng, zipEntries } from './png.mjs';
import { ROOF_KIT, ROOF_GABLE_COL } from '../src/guild/art.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ZIP = path.join(HERE, '..', 'rpg-assets', '2021p_bundle', '2021', '2021_rooftops_update_MVMZ.zip');
const OUT = path.join(HERE, '..', 'public', 'assets', 'tiles', ROOF_KIT.file);
const T = ROOF_KIT.cell;

const entries = zipEntries(ZIP);
const strip = blankPng((ROOF_KIT.colours.length + 1) * T, T);
const [fx, fy] = ROOF_KIT.src.field, [gx, gy] = ROOF_KIT.src.gable;

let gableFrom = null;
ROOF_KIT.colours.forEach((colour, i) => {
  const name = `2021_rooftops_update/tileB_2021rooftops_${colour}.png`;
  const buf = entries.get(name);
  if (!buf) throw new Error(`${path.basename(ZIP)} has no entry ${name}`);
  const sheet = readPng(buf);
  if (sheet.w !== 768 || sheet.h !== 768) throw new Error(`${name}: expected 768×768, got ${sheet.w}×${sheet.h}`);
  blitPng(strip, sheet, fx * T, fy * T, T, T, i * T, 0);
  // The gable face is the same pixels in every colourway — the kit recolours
  // the tiles, not the plaster under them — so it is baked once from whichever
  // sheet came first, and the loop below proves the others match.
  if (gableFrom === null) { blitPng(strip, sheet, gx * T, gy * T, T, T, ROOF_GABLE_COL * T, 0); gableFrom = colour; }
  else for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const s = ((gy * T + y) * sheet.w + gx * T + x) * 4, d = (y * strip.w + ROOF_GABLE_COL * T + x) * 4;
    if (sheet.px[s] !== strip.px[d] || sheet.px[s + 1] !== strip.px[d + 1] || sheet.px[s + 2] !== strip.px[d + 2]) {
      throw new Error(`gable cell differs between ${gableFrom} and ${colour} at ${x},${y} — it needs a column per colourway`);
    }
  }
});

// Every cell must be fully opaque: a roof with holes in it is a roof you can
// see the room through, and the transparent cells of this sheet are the ones
// shaped like half a dormer.
for (let c = 0; c <= ROOF_GABLE_COL; c++) {
  let clear = 0;
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if (!strip.px[(y * strip.w + c * T + x) * 4 + 3]) clear++;
  if (clear) throw new Error(`column ${c} has ${clear} transparent px — wrong source cell`);
}

fs.writeFileSync(OUT, encodePng(strip.w, strip.h, strip.px));
console.log(`bake-roofs → public/assets/tiles/${ROOF_KIT.file} (${strip.w}×${strip.h}, ${fs.statSync(OUT).size} bytes)`);
console.log(`  cols 0-${ROOF_KIT.colours.length - 1}: ${ROOF_KIT.colours.join(' ')} — cell (${fx},${fy}) of each colourway`);
console.log(`  col ${ROOF_GABLE_COL}: gable face — cell (${gx},${gy}), verified identical in all ${ROOF_KIT.colours.length}`);
