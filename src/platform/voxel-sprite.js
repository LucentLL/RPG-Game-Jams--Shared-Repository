/**
 * @file A sprite, given its depth back — the DramaticShape recipe, in this
 * project's own vocabulary.
 *
 * The reference (github.com/DramaticShape/DramaticShapeVoxelMod, found by the
 * user 2026-08-06) rebuilds a Game Boy overworld as a voxel diorama: the
 * ARCHITECTURE'S shapes are derived from the original tile pixels, while the
 * characters stay camera-facing sprites showing the frame the camera's angle
 * deserves. This project already had the second half (the creature rotations)
 * and the diorama cameras; this file is the first half — REAL volume derived
 * from the art itself, for the props three playtests refused to accept faked
 * (the box, the cross, the tipped corpse: "near enough to see you can always
 * tell").
 *
 * WHAT IT BUILDS. A relief extrusion, not a full voxelisation: the FRONT face
 * is the sprite (alpha cutout, as ever), the BACK face is the same picture
 * mirrored, and the RIM between them is walked out of the alpha mask — every
 * run of silhouette edge becomes one thin quad, greedy-merged, facing the way
 * the edge faces. Hexen's sprites got volume the day the engine allowed it;
 * this is that day for the furniture.
 *
 * THE RIM PAINTS ITSELF, and this is the trick worth keeping: each rim quad's
 * UV is a ONE-PIXEL STRIP of the sprite along its own edge, stretched through
 * the depth. The silhouette's border colours wrap around the side the way a
 * carved thing's paint wraps its profile — no palette texture, no per-run
 * colour maths, and the whole prop (front, back, every rim) stays ONE canvas,
 * which the rasteriser batches as ONE draw per art.
 *
 * Everything returns in buildGeometry's quad vocabulary ({src, w, h, x/y/z,
 * rot, uv}, Y NEGATIVE UP), so the rasteriser cannot tell a prop from a wall —
 * which is the point.
 *
 * ── YAW: TURNING WHAT WAS BUILT (2026-08-15) ────────────────────────────────
 *
 * "Some objects have voxel depth so directional facing is important" (user
 * decree). A prop that extrudes to real geometry can be TURNED, and turning a
 * volume is not faking a pose: every side the walker sees at 45° is a side this
 * file actually built out of the sprite's own pixels.
 *
 * Each extruder takes an optional `yaw` (a FACING: degrees clockwise seen from
 * above, 0 = the art as drawn, and NOT a CSS angle — see the sign note on
 * `yawQuads`; @see guild/prop-facing.js, where the number comes from) and applies
 * it to the WHOLE ASSEMBLY: `yawQuads` rotates each quad's centre about the
 * assembly's own vertical axis and composes the yaw ON THE LEFT of that quad's
 * existing `rot`. That distinction is the whole implementation. The quads
 * already carry their own face rotations — a west rim is `rotateY(-90deg)`, a
 * lid is `rotateX(90deg)` — and re-deriving each one by hand for a new heading
 * is how a side face ends up inside-out. Composing instead leaves every face's
 * relationship to its neighbours exactly as built and simply points the finished
 * object somewhere else, which is what a wrapper transform means.
 */

/** Below this alpha a pixel is air — trimBox's own threshold. */
const SOLID = 12;

/**
 * The six orientations these extruders emit, as the WORLD directions a quad's
 * own width and height run along — [ (wx,wy,wz), (hx,hy,hz) ], Y UP (which is
 * why every `hy` is negative: the emitted `y` counts up as negative, and the
 * rasteriser negates it once on the way in).
 *
 * This is the same table gl-world.js's `AXES` holds, and it is not a second
 * source of truth but the same mathematical fact read from the other end: these
 * ARE the CSS rotation matrices applied to a quad lying in the XY plane
 * (`rotateY(θ)` sends (x,y,z) to (x·cosθ + z·sinθ, y, −x·sinθ + z·cosθ)). The
 * proof that the two agree is mechanical — dev-side, the table is lifted out of
 * gl-world.js and compared entry for entry.
 */
const ORIENT = {
  '': [[1, 0, 0], [0, -1, 0]],                        // south face, and any plain quad
  'rotateY(180deg)': [[-1, 0, 0], [0, -1, 0]],        // north face
  'rotateY(90deg)': [[0, 0, -1], [0, -1, 0]],         // east face
  'rotateY(-90deg)': [[0, 0, 1], [0, -1, 0]],         // west face
  'rotateX(90deg)': [[1, 0, 0], [0, 0, 1]],           // floor, seen from above
  'rotateX(-90deg)': [[1, 0, 0], [0, 0, -1]],         // ceiling, seen from below
};

/** Exact cos/sin at the quarter turns, so a 90° yaw lands ON the table above
 *  rather than a floating-point hair off it — which is what lets a quarter-turned
 *  assembly keep naming its faces in the six-word vocabulary every consumer
 *  already speaks. */
const QUARTER = { 0: [1, 0], 90: [0, 1], 180: [-1, 0], 270: [0, -1] };

/** Which of the six this pair of axes IS, or null when the yaw is off-axis. */
function orientName(ax) {
  for (const k in ORIENT) {
    const o = ORIENT[k];
    if (o[0][0] === ax[0][0] && o[0][1] === ax[0][1] && o[0][2] === ax[0][2]
      && o[1][0] === ax[1][0] && o[1][1] === ax[1][1] && o[1][2] === ax[1][2]) return k;
  }
  return null;
}

/**
 * TURN A FINISHED ASSEMBLY on its vertical axis — one rotation, applied to
 * everything the extruder just built. Mutates and returns the same array (the
 * quads were made a line ago and belong to nobody else yet), so the ORDER the
 * extruder emitted is preserved exactly: front, back, then rims, which is the
 * paint order the DOM path relies on and the depth buffer does not care about.
 *
 * Three things travel together and must agree, or the object comes apart:
 *
 *   the CENTRE   `(x, z)` swings about the assembly axis `(cx, cz)`; `y` is
 *                untouched, because a yaw is about the vertical and the
 *                negative-up convention only ever affects `y`.
 *   the AXES     `ax` — the same rotation applied to the quad's own width and
 *                height directions. Because it is a PROPER rotation (det +1),
 *                the face normal (w × h) turns with the quad and never flips:
 *                a front stays a front, so backface-visibility keeps hiding
 *                exactly the faces it hid before, now aimed elsewhere.
 *   the STRING   `rot` — the same composition written in CSS, `rotateY(θ)`
 *                composed on the LEFT of the quad's own rotation, for the DOM
 *                compositor which reads the string and not the axes. When the
 *                composition lands on one of the six named orientations it is
 *                written by NAME instead, so as much of a turned assembly as
 *                possible keeps speaking the vocabulary every consumer already
 *                knows.
 *
 * WHAT `ax` IS FOR, AND WHY IT IS NOT OPTIONAL. A quarter turn maps a VERTICAL
 * face onto another vertical face, so every rim and every front keeps a name.
 * A HORIZONTAL face does not: a lid turned 90° is the same floor quad spun about
 * its own normal, and the six names have no way to say that — they fix a
 * horizontal quad's width along +x and nothing else. Off-axis yaws name nothing
 * at all. So a turned assembly carries its axes explicitly, and a rasteriser
 * that looks its orientation up in a table of six strings MUST prefer `q.ax`
 * when it is there, or it will draw every unnamed quad facing south. Nothing
 * passes a yaw yet, which is why nothing is broken today; that preference is the
 * gate the first caller has to open.
 *
 * ── THE SIGN, WHICH IS THE WHOLE RISK ──────────────────────────────────────
 *
 * `deg` is a FACING: clockwise seen from above, 0 = the art as drawn, which is
 * the one convention prop-facing.js states and the map editor's `facingVec`
 * draws (0° south, 90° west). It is NOT a CSS angle, and the two run opposite
 * ways. World here is x east, z south, y up once the rasteriser has negated it;
 * CSS `rotateY(θ)` sends (x,z) to (x·cosθ + z·sinθ, −x·sinθ + z·cosθ), so it
 * takes east to NORTH — anti-clockwise from above. A facing of f is therefore
 * CSS `rotateY(−f)`, and getting that backwards turns every desk in the world a
 * quarter the wrong way while passing any test that only checks "it moved".
 * The witness worth keeping: a front face points SOUTH at 0°; at 90° it points
 * WEST, the same answer `facingVec` gives.
 *
 * @param {Array} quads  the extruder's own output, in emission order
 * @param {number} cx @param {number} cz  the assembly's vertical axis
 * @param {number} deg  the FACING, clockwise from above; 0 is the art as drawn
 */
export function yawQuads(quads, cx, cz, deg) {
  const f = ((Math.round((deg || 0) * 1e6) / 1e6) % 360 + 360) % 360;
  if (!f) return quads;                       // 0° is the shipped path, untouched
  const a = (360 - f) % 360;                  // the facing, as a CSS angle
  const q4 = QUARTER[a];
  const t = a * Math.PI / 180;
  const c = q4 ? q4[0] : Math.cos(t), s = q4 ? q4[1] : Math.sin(t);
  const spin = (v) => [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
  const css = a > 180 ? a - 360 : a;          // the short way round, for the string
  for (const q of quads) {
    const dx = q.x - cx, dz = q.z - cz;
    q.x = cx + dx * c + dz * s;
    q.z = cz - dx * s + dz * c;
    const base = ORIENT[q.rot || ''] || ORIENT[''];
    const ax = [spin(base[0]), spin(base[1])];
    q.ax = ax;
    const named = orientName(ax);
    q.rot = named != null ? named : `rotateY(${css}deg) ${q.rot || ''}`.trim();
  }
  return quads;
}

/**
 * The PLAN-ART extrusion — for things drawn from ABOVE (beds, rugs with
 * thickness). The elevation extruder stands a picture up and walks its rim;
 * this lays the picture flat as the TOP at `h` above the floor and drops
 * WALLS from its silhouette to the ground — a mattress with sides, not a
 * decal (playtest: "beds are flat in the floor"). Same 1px-strip rim trick:
 * the plan's border pixels paint the walls.
 * @param {HTMLCanvasElement} cv  the plan crop, pixel-readable
 * @param {object} o  { x, z: world centre; y: the FLOOR (negative-up);
 *                      w, d: world footprint; h: thickness (world px);
 *                      yaw?: degrees clockwise from above (@see yawQuads) }
 */
export function extrudePlan(cv, o) {
  const W = cv.width, H = cv.height;
  let data;
  try {
    data = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  } catch (e) { return []; }
  const solid = (x, y) => x >= 0 && y >= 0 && x < W && y < H && data[(y * W + x) * 4 + 3] >= SOLID;
  const w = o.w, d = o.d, t = o.h;
  const sx = w / W, sz = d / H;
  const x0 = o.x - w / 2, z0 = o.z - d / 2, top = o.y - t;
  const quads = [{ src: cv, w, h: d, x: o.x, y: top, z: o.z, rot: 'rotateX(90deg)', uv: [0, 0, 1, 1] }];
  // North/south walls — runs along art rows (art +y is world +z, south).
  for (let y = 0; y <= H; y++) {
    for (let x = 0; x < W; x++) {
      const nFace = solid(x, y) && !solid(x, y - 1);
      const sFace = solid(x, y - 1) && !solid(x, y);
      if (!nFace && !sFace) continue;
      const test = nFace
        ? (xx) => solid(xx, y) && !solid(xx, y - 1)
        : (xx) => solid(xx, y - 1) && !solid(xx, y);
      let x1 = x;
      while (x1 + 1 < W && test(x1 + 1)) x1++;
      const runW = (x1 - x + 1) * sx;
      const v = nFace ? (y + 0.5) / H : (y - 0.5) / H;
      quads.push({
        src: cv, w: runW, h: t,
        x: x0 + x * sx + runW / 2, y: top + t / 2, z: z0 + y * sz,
        rot: nFace ? 'rotateY(180deg)' : '',
        uv: [x / W, v, (x1 + 1) / W, v],
      });
      x = x1;
    }
  }
  // East/west walls — runs along art columns.
  for (let x = 0; x <= W; x++) {
    for (let y = 0; y < H; y++) {
      const wFace = solid(x, y) && !solid(x - 1, y);
      const eFace = solid(x - 1, y) && !solid(x, y);
      if (!wFace && !eFace) continue;
      const test = wFace
        ? (yy) => solid(x, yy) && !solid(x - 1, yy)
        : (yy) => solid(x - 1, yy) && !solid(x, yy);
      let y1 = y;
      while (y1 + 1 < H && test(y1 + 1)) y1++;
      const runD = (y1 - y + 1) * sz;
      const u = wFace ? (x + 0.5) / W : (x - 0.5) / W;
      quads.push({
        src: cv, w: runD, h: t,
        x: x0 + x * sx, y: top + t / 2, z: z0 + y * sz + runD / 2,
        rot: wFace ? 'rotateY(-90deg)' : 'rotateY(90deg)',
        uv: [u, y / H, u, (y1 + 1) / H],
      });
      y = y1;
    }
  }
  return yawQuads(quads, o.x, o.z, o.yaw);
}

/**
 * THE FOLD — for art that already drew its own top.
 *
 * A kit's desk, table, counter or chest is not a pure elevation: the artist
 * drew the FRONT and, above it in perspective, the TOP SURFACE. Extruding
 * that whole picture straight back stands the drawn top UP as part of the
 * front and caps the volume with a slab at the sprite's top edge — the
 * player's own diagnosis, and their fix: fold the picture at the line where
 * the top meets the front, and lay that upper slice FLAT as the real top.
 *
 * So the crop splits at `fold` (the fraction of the crop's height that is
 * drawn top): the lower slice stands as the front elevation (rim walked from
 * its own alpha, back face mirrored), and the upper slice is laid horizontal
 * at the front's top edge, running back through the footprint. Nothing is
 * invented — both faces are the artist's own pixels, each in the plane it
 * was drawn for. The pixel scales differ between slices on purpose: a top
 * drawn in perspective is foreshortened, which is exactly why it is shorter
 * on the sheet than the depth it represents.
 *
 * @param {HTMLCanvasElement} cv  the crop, pixel-readable
 * @param {object} o  { x, z: world centre; y: the FOOT line (negative-up);
 *                      h: TOTAL drawn height; d: footprint depth; w: width;
 *                      fold: 0..1 of the crop's height that is the top;
 *                      yaw?: degrees clockwise from above (@see yawQuads) }
 */
export function extrudeFold(cv, o) {
  const W = cv.width, H = cv.height;
  let data;
  try {
    data = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  } catch (e) { return []; }
  const solid = (x, y) => x >= 0 && y >= 0 && x < W && y < H && data[(y * W + x) * 4 + 3] >= SOLID;

  const fold = Math.max(0.05, Math.min(0.9, o.fold));
  const cut = Math.round(H * fold);            // first row of the FRONT slice
  const w = o.w || o.h * (W / H), d = o.d;
  const hF = o.h * (1 - fold);                 // the front's world height
  const foot = o.y, zF = o.z + d / 2;          // the front plane
  const sx = w / W, sy = hF / Math.max(1, H - cut);
  const px = (x) => o.x - w / 2 + x * sx;
  const py = (y) => foot - hF + (y - cut) * sy;
  const quads = [];

  // The TOP, laid flat where the front ends: the artist's own drawn surface,
  // finally horizontal, running back across the footprint.
  quads.push({
    src: cv, w, h: d, x: o.x, y: foot - hF, z: o.z,
    rot: 'rotateX(90deg)', uv: [0, 0, 1, fold],
  });
  // The FRONT, and its mirror at the back of the footprint.
  quads.push({ src: cv, w, h: hF, x: o.x, y: foot - hF / 2, z: zF, rot: '', uv: [0, fold, 1, 1] });
  quads.push({ src: cv, w, h: hF, x: o.x, y: foot - hF / 2, z: o.z - d / 2, rot: 'rotateY(180deg)', uv: [1, fold, 0, 1] });

  // Vertical rims of the FRONT slice only — the sides of the standing part.
  for (let x = 0; x <= W; x++) {
    for (let y = cut; y < H; y++) {
      const westFace = solid(x, y) && !solid(x - 1, y);
      const eastFace = solid(x - 1, y) && !solid(x, y);
      if (!westFace && !eastFace) continue;
      const test = westFace
        ? (yy) => solid(x, yy) && !solid(x - 1, yy)
        : (yy) => solid(x - 1, yy) && !solid(x, yy);
      let y1 = y;
      while (y1 + 1 < H && test(y1 + 1)) y1++;
      const runH = (y1 - y + 1) * sy;
      const u = westFace ? (x + 0.5) / W : (x - 0.5) / W;
      quads.push({
        src: cv, w: d, h: runH,
        x: px(x), y: py(y) + runH / 2, z: o.z,
        rot: westFace ? 'rotateY(-90deg)' : 'rotateY(90deg)',
        uv: [u, y / H, u, (y1 + 1) / H],
      });
      y = y1;
    }
  }
  // The UNDERSIDE only: the front slice's top edge is covered by the folded
  // top, so a rim there would be a second lid inside the first.
  for (let x = 0; x < W; x++) {
    if (!solid(x, H - 1)) continue;
    let x1 = x;
    while (x1 + 1 < W && solid(x1 + 1, H - 1)) x1++;
    const runW = (x1 - x + 1) * sx;
    quads.push({
      src: cv, w: runW, h: d,
      x: px(x) + runW / 2, y: foot, z: o.z,
      rot: 'rotateX(-90deg)',
      uv: [x / W, (H - 0.5) / H, (x1 + 1) / W, (H - 0.5) / H],
    });
    x = x1;
  }
  return yawQuads(quads, o.x, o.z, o.yaw);
}

/**
 * Extrude one sprite crop into a quad list.
 * @param {HTMLCanvasElement} cv  the crop, drawn 1:1 and pixel-readable
 * @param {object} o  { x, z: world centre; y: the FOOT line (negative-up);
 *                      h: world height; d: world depth; w?: width (defaults
 *                      to h × the crop's own aspect — a thing, not a stretch);
 *                      yaw?: degrees clockwise from above (@see yawQuads) }
 * @returns {Array} quads for setGeometry, or [] if the canvas is unreadable
 */
export function extrudeSprite(cv, o) {
  const W = cv.width, H = cv.height;
  let data;
  try {
    data = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  } catch (e) { return []; }   // tainted canvas — the billboard fallback stands
  const solid = (x, y) => x >= 0 && y >= 0 && x < W && y < H && data[(y * W + x) * 4 + 3] >= SOLID;

  const h = o.h, w = o.w || h * (W / H), d = o.d;
  const sx = w / W, sy = h / H;              // one sprite pixel, in world px
  const foot = o.y;                          // y grows DOWN; the foot is the base
  const px = (x) => o.x - w / 2 + x * sx;    // left edge of pixel column x
  const py = (y) => foot - h + y * sy;       // top edge of pixel row y (up = −)
  const quads = [];

  // Front and back: the whole crop, one quad each. The back mirrors by
  // swapping U in its rect — same canvas, same batch, no second texture.
  quads.push({ src: cv, w, h, x: o.x, y: foot - h / 2, z: o.z + d / 2, rot: '', uv: [0, 0, 1, 1] });
  quads.push({ src: cv, w, h, x: o.x, y: foot - h / 2, z: o.z - d / 2, rot: 'rotateY(180deg)', uv: [1, 0, 0, 1] });

  // Vertical rims — walk every column boundary, merge runs of edge.
  for (let x = 0; x <= W; x++) {
    for (let y = 0; y < H; y++) {
      const westFace = solid(x, y) && !solid(x - 1, y);
      const eastFace = solid(x - 1, y) && !solid(x, y);
      if (!westFace && !eastFace) continue;
      const test = westFace
        ? (yy) => solid(x, yy) && !solid(x - 1, yy)
        : (yy) => solid(x - 1, yy) && !solid(x, yy);
      let y1 = y;
      while (y1 + 1 < H && test(y1 + 1)) y1++;
      const runH = (y1 - y + 1) * sy;
      // The strip samples the pixel BESIDE the edge — the silhouette's own
      // border colour, which is what a carved side would show.
      const u = westFace ? (x + 0.5) / W : (x - 0.5) / W;
      quads.push({
        src: cv, w: d, h: runH,
        x: px(x), y: py(y) + runH / 2, z: o.z,
        rot: westFace ? 'rotateY(-90deg)' : 'rotateY(90deg)',
        uv: [u, y / H, u, (y1 + 1) / H],
      });
      y = y1;
    }
  }
  // Horizontal rims — the same walk turned sideways: tops seen from above,
  // undersides from below.
  for (let y = 0; y <= H; y++) {
    for (let x = 0; x < W; x++) {
      const topFace = solid(x, y) && !solid(x, y - 1);
      const botFace = solid(x, y - 1) && !solid(x, y);
      if (!topFace && !botFace) continue;
      const test = topFace
        ? (xx) => solid(xx, y) && !solid(xx, y - 1)
        : (xx) => solid(xx, y - 1) && !solid(xx, y);
      let x1 = x;
      while (x1 + 1 < W && test(x1 + 1)) x1++;
      const runW = (x1 - x + 1) * sx;
      const v = topFace ? (y + 0.5) / H : (y - 0.5) / H;
      quads.push({
        src: cv, w: runW, h: d,
        x: px(x) + runW / 2, y: py(y), z: o.z,
        rot: topFace ? 'rotateX(90deg)' : 'rotateX(-90deg)',
        uv: [x / W, v, (x1 + 1) / W, v],
      });
      x = x1;
    }
  }
  return yawQuads(quads, o.x, o.z, o.yaw);
}
