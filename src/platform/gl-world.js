/**
 * @file A rasteriser, at last — one canvas, one depth buffer, and fog in a shader.
 *
 * WHY THIS EXISTS. Every 3D view in this game has so far been drawn by the
 * BROWSER'S COMPOSITOR: each surface a DOM element with a 3D transform, which
 * the compositor promotes to its own GPU texture, allocated at CSS size × device
 * pixel ratio whether it covers the screen or four pixels of horizon, re-rastered
 * whenever its on-screen scale changes — which, while you walk, is every one of
 * them every frame — then depth-sorted and blended. That is a superb strategy for
 * a page with twenty moving cards and a catastrophic one for a world with
 * thirteen hundred surfaces: the cost is per SURFACE, not per pixel, and a phone
 * runs out of surfaces long before it runs out of anything else. When it does it
 * does not fail loudly; it silently stops allocating and draws the frame without
 * them. Six passes of counting things followed (HANDOFF-RENDERER.md), and the
 * player's phone kept dropping the HUD.
 *
 * Hexen drew into a 320×200 byte framebuffer with a column loop and held 35fps on
 * a 486. The hardware was never the problem here. The problem was that nothing in
 * this project ever drew a pixel. This does.
 *
 * WHAT IT IS. Deliberately not an engine. The scene is textured quads and
 * camera-facing sprites with an alpha cutout — Hexen's own vocabulary, where
 * architecture is geometry and everything else is one sprite — so there is no
 * scene graph, no material system and no dependency. Quads are batched by
 * texture into a handful of draw calls, fog is three lines of fragment shader,
 * and the cost is proportional to SCREEN pixels. Draw distance stops being a
 * budget and becomes "the whole chart".
 *
 * WHAT IT IS NOT. It does not own the camera, the world model, or anything you
 * can read: the caller says where the eye is and hands over quads in the same
 * vocabulary `buildGeometry` already speaks (centre, size, one axis rotation),
 * so one geometry builder can feed either backend and they cannot drift.
 * Interface, hands, minimap and floating numbers stay in the DOM, where they are
 * a document and belong.
 *
 * COORDINATES ARE THE CALLER'S — the CSS convention this project is written in:
 * +X right, +Z toward the south of the map, and **Y NEGATIVE UPWARD** (an eye at
 * −690 is 690 above the floor). The conversion to GL's Y-up happens once, here,
 * at the vertex; nowhere else in the codebase has to think about it.
 */

/** One quad's worth of vertices: 6 verts × (x, y, z, u, v). */
const FLOATS_PER_VERT = 5;
const VERTS_PER_QUAD = 6;
const UV_FULL = [0, 0, 1, 1];

const VERT_SRC = `#version 300 es
in vec3 aPos;
in vec2 aUV;
uniform mat4 uVP;
out vec2 vUV;
out vec3 vWorld;
void main() {
  vUV = aUV;
  vWorld = aPos;
  gl_Position = uVP * vec4(aPos, 1.0);
}`;

/**
 * Fog is HORIZONTAL distance from the eye, not view depth — the same quantity
 * `fogAt` has always used, so the weather is identical to the DOM path's and
 * every light in delve-maps still means what it says. The difference is that it
 * is now evaluated per PIXEL rather than per surface, which is what removes the
 * whole "merge only where the fog is flat" constraint the DOM renderer lives
 * under: there is nothing to merge, and nothing to band.
 *
 * The cutout (discard) is Doom's answer to sprite transparency and the reason
 * this needs no back-to-front sort: pixel art has hard edges, so an alpha test
 * is exact, and the depth buffer then does all the occlusion for free.
 */
const FRAG_SRC = `#version 300 es
precision mediump float;
in vec2 vUV;
in vec3 vWorld;
uniform sampler2D uTex;
uniform vec3 uFog;
uniform vec2 uFogRange;
uniform vec2 uEyeXZ;
uniform float uAlpha;
uniform float uCutout;
out vec4 outColor;
void main() {
  vec4 c = texture(uTex, vUV);
  if (c.a < uCutout) discard;
  float d = distance(vWorld.xz, uEyeXZ);
  float f = clamp((d - uFogRange.x) / max(uFogRange.y - uFogRange.x, 1.0), 0.0, 1.0);
  outColor = vec4(mix(c.rgb, uFog, f), c.a * uAlpha);
}`;

// ---------------------------------------------------------------------------
// Matrices — the four lines of linear algebra this needs, and no library
// ---------------------------------------------------------------------------

function perspective(out, fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2), nf = 1 / (near - far);
  out[0] = f / aspect; out[1] = 0; out[2] = 0; out[3] = 0;
  out[4] = 0; out[5] = f; out[6] = 0; out[7] = 0;
  out[8] = 0; out[9] = 0; out[10] = (far + near) * nf; out[11] = -1;
  out[12] = 0; out[13] = 0; out[14] = 2 * far * near * nf; out[15] = 0;
  return out;
}

/**
 * A look-at built from a bearing rather than a target, because that is what a
 * crawler has: yaw is the compass heading and pitch the free look.
 *
 * `back` SITS THE CAMERA BEHIND THE EYE, and it is not a stylistic choice — it
 * is what makes this the same picture the CSS renderer draws. Worth the
 * derivation, because it is invisible and it cost an hour:
 *
 *   CSS `perspective: P` puts the viewer at stage-z = +P, and the world
 *   transform `scale3d(lens) · rotate · translate(−eye)` lands a point at
 *   stage-z = lens·Z, where Z is its forward offset from the eye (negative
 *   ahead). So the viewer-to-point distance is P + lens·d, and a height Y
 *   projects to `lens·Y·P/(P + lens·d)` = `Y·P/(P/lens + d)`.
 *
 *   A GL camera AT the eye gives `Y·P/d`. The two agree exactly when the GL
 *   camera is moved back by **P/lens world px** — which is 165px, about half a
 *   tile, at the shipped lens. Small, but it is 27% of the apparent size of
 *   anything two tiles away, and every framing number in this project was tuned
 *   through the CSS lens.
 *
 * The scale therefore does NOT simply cancel, which is the thing that is easy
 * to talk yourself into. Fog is still measured from the EYE (`uEyeXZ`), not from
 * here — the weather is about where you are standing, not where the lens is.
 */
function viewFromEye(out, ex, ey, ez, yaw, pitch, back) {
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  // Forward matches the rest of the codebase: (sin yaw, −cos yaw) on the ground.
  const fx = Math.sin(yaw) * cp, fy = sp, fz = -Math.cos(yaw) * cp;
  if (back) { ex -= fx * back; ey -= fy * back; ez -= fz * back; }
  // Right is forward × up with up = +Y; for a level-ish camera this never degenerates.
  const rx = Math.cos(yaw), ry = 0, rz = Math.sin(yaw);
  // Up = right × forward.
  const ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;
  out[0] = rx; out[1] = ux; out[2] = -fx; out[3] = 0;
  out[4] = ry; out[5] = uy; out[6] = -fy; out[7] = 0;
  out[8] = rz; out[9] = uz; out[10] = -fz; out[11] = 0;
  out[12] = -(rx * ex + ry * ey + rz * ez);
  out[13] = -(ux * ex + uy * ey + uz * ez);
  out[14] = fx * ex + fy * ey + fz * ez;
  out[15] = 1;
  return out;
}

function multiply(out, a, b) {
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1]
        + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// The quad vocabulary — the caller's CSS transforms, resolved to corners
// ---------------------------------------------------------------------------

/**
 * The five orientations `buildGeometry` emits, as the local axes a quad's own
 * width and height run along. An unrotated element lies in the XY plane facing
 * the camera with **Y DOWN**, which is why every `hy` below is negative: the
 * conversion to Y-up lives here and only here.
 *
 * Each entry is [ (wx,wy,wz), (hx,hy,hz) ] — the world direction of half a
 * width and half a height. Read them against the CSS rotation matrices:
 * `rotateY(θ)` sends (x,y,z) to (x·cosθ + z·sinθ, y, −x·sinθ + z·cosθ) and
 * `rotateX(θ)` sends it to (x, y·cosθ − z·sinθ, y·sinθ + z·cosθ).
 */
const AXES = {
  '': [[1, 0, 0], [0, -1, 0]],                        // south face, and any plain quad
  'rotateY(180deg)': [[-1, 0, 0], [0, -1, 0]],        // north face
  'rotateY(90deg)': [[0, 0, -1], [0, -1, 0]],         // east face
  'rotateY(-90deg)': [[0, 0, 1], [0, -1, 0]],         // west face
  'rotateX(90deg)': [[1, 0, 0], [0, 0, 1]],           // floor, seen from above
  'rotateX(-90deg)': [[1, 0, 0], [0, 0, -1]],         // ceiling, seen from below
};

/** Write one quad's six vertices. `rep` tiles the texture across it — the same
 *  thing `background-size: 25%` means to the DOM path, and free here. */
function writeQuad(buf, at, q) {
  const ax = AXES[q.rot || ''] || AXES[''];
  const hw = q.w / 2, hh = q.h / 2;
  const [W, H] = ax;
  const wx = W[0] * hw, wy = W[1] * hw, wz = W[2] * hw;
  const hx = H[0] * hh, hy = H[1] * hh, hz = H[2] * hh;
  // Y is negated ONCE, here: the caller counts up as negative.
  const cx = q.x, cy = -q.y, cz = q.z;
  const ru = q.repX || 1, rv = q.repY || 1;
  // `uv` is the same four-number rect writeSprite takes — a crop of the
  // texture instead of a tiling of it (the two are exclusive by nature). The
  // voxel extruder lives on this: a rim quad maps a ONE-PIXEL strip of its
  // own sprite, so the silhouette's border colours paint the sides.
  const u = q.uv;
  const u0 = u ? u[0] : 0, v0 = u ? u[1] : 0;
  const u1 = u ? u[2] : ru, v1 = u ? u[3] : rv;
  // Corners: top-left, top-right, bottom-right, bottom-left in the quad's own
  // frame, so the texture lands the same way up it does in CSS.
  const P = [
    [cx - wx - hx, cy - (wy + hy), cz - wz - hz, u0, v0],
    [cx + wx - hx, cy + (wy - hy), cz + wz - hz, u1, v0],
    [cx + wx + hx, cy + (wy + hy), cz + wz + hz, u1, v1],
    [cx - wx + hx, cy - (wy - hy), cz - wz + hz, u0, v1],
  ];
  for (const i of [0, 1, 2, 0, 2, 3]) {
    const p = P[i];
    buf[at++] = p[0]; buf[at++] = p[1]; buf[at++] = p[2]; buf[at++] = p[3]; buf[at++] = p[4];
  }
  return at;
}

/** A camera-facing sprite, built the same way but with its width laid along the
 *  camera's right vector. Sprites never pitch with the lens — a standee leans
 *  only in yaw, exactly as the DOM billboards' counter-rotation did. */
function writeSprite(buf, at, s, rx, rz) {
  const hw = s.w / 2;
  const cx = s.x, cy = -s.y, cz = s.z;
  if (s.roll) {
    // A shot flies at its own angle: the right/up basis rolls in the camera
    // plane, CENTRED on the anchor — an arrow pivots on its middle, not its
    // feet. Sign matches CSS rotateZ (positive = clockwise on screen).
    const th = s.roll * Math.PI / 180, c = Math.cos(th), sn = Math.sin(th);
    const hh = s.h / 2;
    const u = s.uv || UV_FULL;
    const Rx = rx * c * hw, Ry = -sn * hw, Rz = rz * c * hw;
    const Ux = rx * sn * hh, Uy = c * hh, Uz = rz * sn * hh;
    const P = [
      [cx - Rx + Ux, cy - Ry + Uy, cz - Rz + Uz, u[0], u[1]],
      [cx + Rx + Ux, cy + Ry + Uy, cz + Rz + Uz, u[2], u[1]],
      [cx + Rx - Ux, cy + Ry - Uy, cz + Rz - Uz, u[2], u[3]],
      [cx - Rx - Ux, cy - Ry - Uy, cz - Rz - Uz, u[0], u[3]],
    ];
    for (const i of [0, 1, 2, 0, 2, 3]) {
      const p = P[i];
      buf[at++] = p[0]; buf[at++] = p[1]; buf[at++] = p[2]; buf[at++] = p[3]; buf[at++] = p[4];
    }
    return at;
  }
  const wx = rx * hw, wz = rz * hw;
  const top = cy + s.h;             // sprites stand ON their anchor point
  // `uv` is a sub-rectangle of a SHEET (@see artTexRect) — most of this game's
  // scenery is one crop out of a shared atlas, which the DOM says with a
  // background-position and this says with four numbers.
  const u = s.uv || UV_FULL;
  const P = [
    [cx - wx, top, cz - wz, u[0], u[1]],
    [cx + wx, top, cz + wz, u[2], u[1]],
    [cx + wx, cy, cz + wz, u[2], u[3]],
    [cx - wx, cy, cz - wz, u[0], u[3]],
  ];
  for (const i of [0, 1, 2, 0, 2, 3]) {
    const p = P[i];
    buf[at++] = p[0]; buf[at++] = p[1]; buf[at++] = p[2]; buf[at++] = p[3]; buf[at++] = p[4];
  }
  return at;
}

// ---------------------------------------------------------------------------

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {?object} the renderer, or null if the device has no WebGL2 (in
 *   which case the caller keeps the DOM path — this is an upgrade, not a
 *   requirement, and every phone that cannot take it still gets a game).
 */
export function createGlWorld(canvas) {
  const gl = canvas.getContext('webgl2', {
    alpha: true, depth: true, antialias: false, premultipliedAlpha: false,
    powerPreference: 'high-performance',
  });
  if (!gl) return null;

  const prog = link(gl, VERT_SRC, FRAG_SRC);
  if (!prog) return null;
  const loc = {
    pos: gl.getAttribLocation(prog, 'aPos'),
    uv: gl.getAttribLocation(prog, 'aUV'),
    vp: gl.getUniformLocation(prog, 'uVP'),
    tex: gl.getUniformLocation(prog, 'uTex'),
    fog: gl.getUniformLocation(prog, 'uFog'),
    fogRange: gl.getUniformLocation(prog, 'uFogRange'),
    eye: gl.getUniformLocation(prog, 'uEyeXZ'),
    alpha: gl.getUniformLocation(prog, 'uAlpha'),
    cutout: gl.getUniformLocation(prog, 'uCutout'),
  };

  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  const stride = FLOATS_PER_VERT * 4;
  gl.enableVertexAttribArray(loc.pos);
  gl.vertexAttribPointer(loc.pos, 3, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(loc.uv);
  gl.vertexAttribPointer(loc.uv, 2, gl.FLOAT, false, stride, 12);
  gl.bindVertexArray(null);

  const spriteVao = gl.createVertexArray();
  const spriteVbo = gl.createBuffer();
  gl.bindVertexArray(spriteVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, spriteVbo);
  gl.enableVertexAttribArray(loc.pos);
  gl.vertexAttribPointer(loc.pos, 3, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(loc.uv);
  gl.vertexAttribPointer(loc.uv, 2, gl.FLOAT, false, stride, 12);
  gl.bindVertexArray(null);

  // --- textures -----------------------------------------------------------
  /**
   * Keyed by the SOURCE the caller already has — a blob URL for baked surfaces,
   * or a live canvas for anything the sprite compositor is drawing into. A
   * canvas is re-uploaded when the caller stamps `_glRev`; a URL is decoded
   * once and never again. Nothing here reaches back into the game to ask for a
   * different asset pipeline, which is the whole point: the bakes were already
   * canvases, so this is the cheapest possible bridge.
   */
  const tex = new Map();

  function paramsFor(t, mip) {
    gl.bindTexture(gl.TEXTURE_2D, t);
    // NEAREST magnification keeps the pixel art chunky; a mipmapped minification
    // is what stops a tiled floor shimmering into noise at distance, which is a
    // thing the DOM path could never do at all.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER,
      mip ? gl.NEAREST_MIPMAP_LINEAR : gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  }

  function upload(entry, src) {
    gl.bindTexture(gl.TEXTURE_2D, entry.t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    } catch (e) { return false; }
    const w = src.naturalWidth || src.width, h = src.naturalHeight || src.height;
    // Mipmaps only where the texture repeats across a surface (the world's
    // floors and walls). A sprite is drawn about its own size and gains nothing.
    const mip = entry.mip && w > 1 && h > 1;
    if (mip) gl.generateMipmap(gl.TEXTURE_2D);
    paramsFor(entry.t, mip);
    entry.ready = true;
    return true;
  }

  /** @param {string|HTMLCanvasElement|HTMLImageElement} src */
  function texFor(src, wantMip) {
    if (!src) return null;
    let e = tex.get(src);
    if (!e) {
      e = { t: gl.createTexture(), ready: false, mip: !!wantMip, rev: -1, warm: 0 };
      tex.set(src, e);
      paramsFor(e.t, false);
      if (typeof src === 'string') {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => { e.img = img; upload(e, img); };
        img.onerror = () => { e.failed = true; };
        img.src = src;
      } else {
        upload(e, src);
      }
    }
    if (typeof src !== 'string') {
      /**
       * A canvas is re-read for its first few draws whatever it says, because
       * this game's sprite canvases are filled LATE: the compositor's redraw
       * registry paints them on a real frame, so a tree uploaded the instant it
       * was created is a tree that stays blank for the rest of the delve. After
       * that a live one (a walking creature) opts in by bumping `_glRev`.
       */
      if (!e.ready || e.warm < 8) { e.warm = (e.warm || 0) + 1; upload(e, src); }
      else if (src._glRev !== undefined && src._glRev !== e.rev) { e.rev = src._glRev; upload(e, src); }
    }
    return e.ready ? e.t : null;
  }

  // --- state --------------------------------------------------------------
  const proj = new Float32Array(16), viewM = new Float32Array(16), vp = new Float32Array(16);
  let cam = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, fovY: 1.25, back: 0 };
  let fog = { rgb: [0, 0, 0], near: 1e9, far: 1e9 + 1 };
  let geoBuf = new Float32Array(0);
  let geoRuns = [];          // [{ src, start, count }]
  let geoDirty = false, geoUsed = 0;
  let sprBuf = new Float32Array(0);
  let sprRuns = [];
  let sprUsed = 0;
  let W = 1, H = 1, dprNow = 1;

  return {
    get gl() { return gl; },

    resize(cssW, cssH, dpr) {
      const w = Math.max(1, Math.round(cssW * dpr)), h = Math.max(1, Math.round(cssH * dpr));
      if (w === W && h === H) return;
      W = w; H = h; dprNow = dpr;
      canvas.width = w; canvas.height = h;
      canvas.style.width = cssW + 'px';
      canvas.style.height = cssH + 'px';
    },

    setCamera(c) { cam = c; },

    /** Colour in 0-255, distances in world px, horizontal — the caller's own
     *  `L.rgb` / `L.near` / `L.far` scaled by the tile, nothing reinterpreted. */
    setFog(rgb, near, far) { fog = { rgb, near, far }; },

    /**
     * The static world. `quads` is the caller's own want-set: each entry
     * `{ src, w, h, x, y, z, rot, repX, repY }` in CSS coordinates. Sorted by
     * texture and packed into one buffer, so the whole chart is a handful of
     * draw calls however many surfaces it has.
     */
    setGeometry(quads) {
      const byTex = new Map();
      for (const q of quads) {
        let a = byTex.get(q.src);
        if (!a) byTex.set(q.src, (a = []));
        a.push(q);
      }
      const total = quads.length * VERTS_PER_QUAD * FLOATS_PER_VERT;
      if (geoBuf.length < total) geoBuf = new Float32Array(total);
      let at = 0;
      geoRuns = [];
      for (const [src, list] of byTex) {
        // Start the decode HERE rather than at the first draw. A blob URL still
        // has to be fetched and decoded, and until it is, its quads draw
        // nothing — so a fresh map opens on a frame or two of bare sky. Warming
        // at build time is the cheapest tile of that latency to take back.
        texFor(src, true);
        const start = at / FLOATS_PER_VERT;
        for (const q of list) at = writeQuad(geoBuf, at, q);
        geoRuns.push({ src, start, count: at / FLOATS_PER_VERT - start });
      }
      geoUsed = at;
      geoDirty = true;
    },

    /** Everything that turns to face you, rebuilt per frame — there are only
     *  ever a few dozen, and they move every one of them. */
    setSprites(list) {
      const byTex = new Map();
      for (const s of list) {
        if (!s.src || s.w <= 0 || s.h <= 0) continue;
        let a = byTex.get(s.src);
        if (!a) byTex.set(s.src, (a = []));
        a.push(s);
      }
      let n = 0;
      for (const a of byTex.values()) n += a.length;
      const total = n * VERTS_PER_QUAD * FLOATS_PER_VERT;
      if (sprBuf.length < total) sprBuf = new Float32Array(Math.max(total, 1));
      const rx = Math.cos(cam.yaw), rz = Math.sin(cam.yaw);
      let at = 0;
      sprRuns = [];
      for (const [src, arr] of byTex) {
        const start = at / FLOATS_PER_VERT;
        // One alpha per run: sprites that share a texture and a fade batch.
        for (const s of arr) at = writeSprite(sprBuf, at, s, rx, rz);
        sprRuns.push({ src, start, count: at / FLOATS_PER_VERT - start, alpha: arr[0].alpha });
      }
      sprUsed = at;
    },

    draw() {
      gl.viewport(0, 0, W, H);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.disable(gl.CULL_FACE);          // every quad is legible from both sides
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(prog);

      // The far plane has to clear the chart, and the near plane has to be
      // close enough to stand against a wall: both in world px.
      perspective(proj, cam.fovY, W / H, 4, 200000);
      // HEXEN'S LOOK-UP as one matrix cell: a free pitch SHEARS the projection
      // (slides the horizon) instead of rotating the camera, so nothing
      // changes size with the look. The caller passes tan(pitch)/tan(fovY/2);
      // positive looks up. Applied in project() too, or the equivalence probe
      // would disagree with the picture.
      if (cam.shear) proj[9] = cam.shear;
      viewFromEye(viewM, cam.x, -cam.y, cam.z, cam.yaw, cam.pitch, cam.back || 0);
      multiply(vp, proj, viewM);
      gl.uniformMatrix4fv(loc.vp, false, vp);
      gl.uniform3f(loc.fog, fog.rgb[0] / 255, fog.rgb[1] / 255, fog.rgb[2] / 255);
      gl.uniform2f(loc.fogRange, fog.near, fog.far);
      gl.uniform2f(loc.eye, cam.x, cam.z);
      gl.uniform1i(loc.tex, 0);
      gl.activeTexture(gl.TEXTURE0);

      gl.bindVertexArray(vao);
      if (geoDirty) {
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, geoBuf.subarray(0, geoUsed), gl.STATIC_DRAW);
        geoDirty = false;
      }
      gl.uniform1f(loc.alpha, 1);
      // Doom's alpha test, at Doom's threshold. 0.02 let MIPMAP-AVERAGED
      // half-pixels through — and a translucent fragment still writes DEPTH,
      // so a voxel prop's own back face occluded its front and the playtest
      // saw the floor through the target dummy. Pixel art is solid or air;
      // the world's opaque bakes never notice the difference.
      gl.uniform1f(loc.cutout, 0.5);
      for (const run of geoRuns) {
        const t = texFor(run.src, true);
        if (!t) continue;                 // still decoding — it lands next frame
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.drawArrays(gl.TRIANGLES, run.start, run.count);
      }

      if (sprUsed) {
        gl.bindVertexArray(spriteVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, spriteVbo);
        gl.bufferData(gl.ARRAY_BUFFER, sprBuf.subarray(0, sprUsed), gl.DYNAMIC_DRAW);
        // A hard cutout, so the depth buffer does the occluding and no sprite
        // ever has to be sorted against another.
        gl.uniform1f(loc.cutout, 0.35);
        for (const run of sprRuns) {
          const t = texFor(run.src, false);
          if (!t) continue;
          gl.uniform1f(loc.alpha, run.alpha == null ? 1 : run.alpha);
          gl.bindTexture(gl.TEXTURE_2D, t);
          gl.drawArrays(gl.TRIANGLES, run.start, run.count);
        }
      }
      gl.bindVertexArray(null);
    },

    /** Drop every texture this map owned. Called on a portal, like the blob
     *  URLs beside them — a long delve through eight interiors would otherwise
     *  hold every wall it had ever seen. */
    dropTextures() {
      for (const e of tex.values()) gl.deleteTexture(e.t);
      tex.clear();
    },

    dispose() {
      this.dropTextures();
      gl.deleteBuffer(vbo); gl.deleteBuffer(spriteVbo);
      gl.deleteVertexArray(vao); gl.deleteVertexArray(spriteVao);
      gl.deleteProgram(prog);
      const ext = gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    },

    /**
     * A world point, in CSS pixels on the stage.
     *
     * Needed for real work, not only for tests: everything that is a LABEL
     * rather than a thing — an overhead health bar, a damage number, a door's
     * name — belongs in the DOM on top of the picture, and this is how it finds
     * out where to sit once the world stops being DOM itself. It doubles as the
     * proof that this camera IS the CSS camera: project a point both ways and
     * the two must land on the same pixel.
     */
    project(x, y, z) {
      perspective(proj, cam.fovY, W / H, 4, 200000);
      // HEXEN'S LOOK-UP as one matrix cell: a free pitch SHEARS the projection
      // (slides the horizon) instead of rotating the camera, so nothing
      // changes size with the look. The caller passes tan(pitch)/tan(fovY/2);
      // positive looks up. Applied in project() too, or the equivalence probe
      // would disagree with the picture.
      if (cam.shear) proj[9] = cam.shear;
      viewFromEye(viewM, cam.x, -cam.y, cam.z, cam.yaw, cam.pitch, cam.back || 0);
      multiply(vp, proj, viewM);
      const wx = x, wy = -y, wz = z;
      const cx = vp[0] * wx + vp[4] * wy + vp[8] * wz + vp[12];
      const cy = vp[1] * wx + vp[5] * wy + vp[9] * wz + vp[13];
      const cw = vp[3] * wx + vp[7] * wy + vp[11] * wz + vp[15];
      if (cw <= 0) return { x: NaN, y: NaN, w: cw, onScreen: false };
      const sx = (cx / cw * 0.5 + 0.5) * (W / dprNow);
      const sy = (0.5 - cy / cw * 0.5) * (H / dprNow);
      return { x: sx, y: sy, w: cw, onScreen: sx >= 0 && sy >= 0 && sx <= W / dprNow && sy <= H / dprNow };
    },

    /**
     * The frame, as numbers — draw and then read it back.
     *
     * This exists because a rasteriser can be VERIFIED and a compositor cannot.
     * The headless pane this project is developed against composites nothing
     * and runs no rAF, so every CSS-3D change for a year has been checked by
     * measuring DOM rectangles and hoping. `readPixels` returns the actual
     * picture: a coarse grid of mean colours says whether the ground is green
     * at the bottom, whether the sky is empty at the top, whether a wall is
     * where the map says it is, and whether the fog closes with distance —
     * which between them catch a flipped axis, a bad winding, a broken
     * projection and a dead texture without anybody looking at a screen.
     */
    probe(cols = 8, rows = 6, rect) {
      this.draw();
      const px = new Uint8Array(W * H * 4);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
      // An optional window, in CSS px from the top-left — for looking at ONE
      // thing (is that sprite actually on screen?) rather than the whole frame.
      const RX = rect ? rect[0] * dprNow : 0, RW = rect ? rect[2] * dprNow : W;
      const RY = rect ? rect[1] * dprNow : 0, RH = rect ? rect[3] * dprNow : H;
      const out = [];
      for (let r = 0; r < rows; r++) {
        const line = [];
        for (let c = 0; c < cols; c++) {
          // readPixels is bottom-up; flip so row 0 is the top of the window.
          const y0 = Math.floor(H - RY - RH * (r + 1) / rows), y1 = Math.floor(H - RY - RH * r / rows);
          const x0 = Math.floor(RX + RW * c / cols), x1 = Math.floor(RX + RW * (c + 1) / cols);
          let R = 0, G = 0, B = 0, A = 0, n = 0;
          for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) {
            for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) {
              const i = (y * W + x) * 4;
              R += px[i]; G += px[i + 1]; B += px[i + 2]; A += px[i + 3]; n++;
            }
          }
          line.push(n ? [Math.round(R / n), Math.round(G / n), Math.round(B / n), Math.round(A / n)] : null);
        }
        out.push(line);
      }
      let lit = 0;
      for (let i = 3; i < px.length; i += 4 * 97) if (px[i] > 8) lit++;
      return { grid: out, coverage: +(lit / Math.ceil(px.length / (4 * 97))).toFixed(3), w: W, h: H };
    },

    stats() {
      return { textures: tex.size, geoRuns: geoRuns.length, spriteRuns: sprRuns.length,
        geoQuads: geoUsed / (VERTS_PER_QUAD * FLOATS_PER_VERT),
        spriteQuads: sprUsed / (VERTS_PER_QUAD * FLOATS_PER_VERT) };
    },
  };

  // Hoisted so the closures above can share them without a wrapper object.
  function link(g, vs, fs) {
    const v = compile(g, g.VERTEX_SHADER, vs), f = compile(g, g.FRAGMENT_SHADER, fs);
    if (!v || !f) return null;
    const p = g.createProgram();
    g.attachShader(p, v); g.attachShader(p, f); g.linkProgram(p);
    if (!g.getProgramParameter(p, g.LINK_STATUS)) {
      console.warn('gl-world: link failed —', g.getProgramInfoLog(p));
      return null;
    }
    g.deleteShader(v); g.deleteShader(f);
    return p;
  }
  function compile(g, kind, src) {
    const s = g.createShader(kind);
    g.shaderSource(s, src); g.compileShader(s);
    if (!g.getShaderParameter(s, g.COMPILE_STATUS)) {
      console.warn('gl-world: shader failed —', g.getShaderInfoLog(s));
      return null;
    }
    return s;
  }
}
