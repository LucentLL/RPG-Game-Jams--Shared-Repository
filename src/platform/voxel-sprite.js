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
 */

/** Below this alpha a pixel is air — trimBox's own threshold. */
const SOLID = 12;

/**
 * The PLAN-ART extrusion — for things drawn from ABOVE (beds, rugs with
 * thickness). The elevation extruder stands a picture up and walks its rim;
 * this lays the picture flat as the TOP at `h` above the floor and drops
 * WALLS from its silhouette to the ground — a mattress with sides, not a
 * decal (playtest: "beds are flat in the floor"). Same 1px-strip rim trick:
 * the plan's border pixels paint the walls.
 * @param {HTMLCanvasElement} cv  the plan crop, pixel-readable
 * @param {object} o  { x, z: world centre; y: the FLOOR (negative-up);
 *                      w, d: world footprint; h: thickness (world px) }
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
  return quads;
}

/**
 * Extrude one sprite crop into a quad list.
 * @param {HTMLCanvasElement} cv  the crop, drawn 1:1 and pixel-readable
 * @param {object} o  { x, z: world centre; y: the FOOT line (negative-up);
 *                      h: world height; d: world depth; w?: width (defaults
 *                      to h × the crop's own aspect — a thing, not a stretch) }
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
  return quads;
}
