/**
 * @file The world as a GLOBE — the circuit's 32 halls on a turning sphere.
 *
 * The texture is the authored chart (world-guilds.js) rasterised with FBB
 * worldmap tiles into a 1024×512 equirectangular sheet, once. The sphere is a
 * per-pixel orthographic projection drawn into a small canvas (256², CSS-scaled
 * with image-rendering: pixelated, which keeps the retro grain AND makes the
 * per-pixel loop cheap enough for a phone). Ray directions for the disc are
 * precomputed; a frame only rotates and samples.
 *
 * Halls are DOM markers over the canvas, not pixels in it — crisp at any size,
 * tappable, and free to carry labels. They hide behind the horizon by the same
 * math the sampler uses, so a marker never floats where its land has turned
 * away. Drag turns the world (inertia included); tapping a hall opens its
 * dossier in the panel below, which is where contacts are made and where the
 * tournaments a hall is hosting are read.
 */
import { ART_BASE } from '../config/assets.js';
import { CHART, SEATS, REALMS, seatById, realmById, seatName, latLonOf } from './world-guilds.js';

const SHEET = ART_BASE + 'worldmap.png';
const MINI = ART_BASE + 'worldmini.png';

/** Biome letter → [sx, sy] of a 16px tile on worldmap.png. Fill tiles for the
 *  flats; interior crops of the big canopy / rock / hill clusters for the rest
 *  (at globe scale a texture reads, an object would smear). */
const TILE16 = {
  g: [32, 32], f: [192, 32], d: [32, 96], '~': [32, 320],
  i: [32, 352], m: [212, 184], h: [452, 58], t: [176, 300],
};

const loadImg = (src) => new Promise((res, rej) => {
  const i = new Image();
  i.onload = () => res(i);
  i.onerror = () => rej(new Error('globe: ' + src + ' failed'));
  i.src = src;
});

/** The equirect texture, baked once per session. */
let _tex = null;
async function bakeTexture() {
  if (_tex) return _tex;
  const img = await loadImg(SHEET);
  const W = CHART[0].length * 16, H = CHART.length * 16;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  for (let cy = 0; cy < CHART.length; cy++) {
    for (let cx = 0; cx < CHART[0].length; cx++) {
      const t = TILE16[CHART[cy][cx]] || TILE16['~'];
      g.drawImage(img, t[0], t[1], 16, 16, cx * 16, cy * 16, 16, 16);
    }
  }
  const d = g.getImageData(0, 0, W, H);
  _tex = { data: d.data, w: W, h: H };
  return _tex;
}

/** Canvas size and sphere radius, in LOGICAL px (CSS scales the rest). */
const CV = 256, R = 118, CTR = CV / 2;

/** Precomputed unit rays for every pixel of the disc — a frame only rotates. */
let _rays = null;
function rays() {
  if (_rays) return _rays;
  const idx = [], nx = [], ny = [], nz = [];
  for (let y = 0; y < CV; y++) {
    for (let x = 0; x < CV; x++) {
      const px = (x - CTR + 0.5) / R, py = (y - CTR + 0.5) / R;
      const rr = px * px + py * py;
      if (rr > 1) continue;
      idx.push(y * CV + x);
      nx.push(px); ny.push(-py); nz.push(Math.sqrt(1 - rr));
    }
  }
  _rays = {
    idx: new Int32Array(idx), nx: new Float32Array(nx),
    ny: new Float32Array(ny), nz: new Float32Array(nz),
  };
  return _rays;
}

/** @type {?Object} the open globe, or null */
let G = null;
export function isGlobeOpen() { return !!G; }

function renderGlobe() {
  const { ctx, tex } = G;
  const ray = rays();
  const img = G.frame || (G.frame = ctx.createImageData(CV, CV));
  const out = img.data;
  out.fill(0);
  const cosT = Math.cos(G.tilt), sinT = Math.sin(G.tilt);
  const yaw = G.yaw;
  const TW = tex.w, TH = tex.h, td = tex.data;
  const PI2 = Math.PI * 2;
  for (let i = 0; i < ray.idx.length; i++) {
    const x = ray.nx[i], y0 = ray.ny[i], z0 = ray.nz[i];
    // Undo the camera tilt, then read lat/lon in the yawed frame.
    const y = y0 * cosT + z0 * sinT;
    const z = -y0 * sinT + z0 * cosT;
    const lat = Math.asin(y);
    let lon = Math.atan2(x, z) + yaw;
    lon -= Math.floor((lon + Math.PI) / PI2) * PI2;      // wrap to [-π, π)
    const u = Math.min(TW - 1, ((lon + Math.PI) / PI2 * TW) | 0);
    const v = Math.min(TH - 1, ((0.5 - lat / Math.PI) * TH) | 0);
    const s = (v * TW + u) * 4;
    // Limb darkening — the one shading a pixel sphere needs to read as round.
    const shade = 0.62 + 0.38 * z0;
    const o = ray.idx[i] * 4;
    out[o] = td[s] * shade;
    out[o + 1] = td[s + 1] * shade;
    out[o + 2] = td[s + 2] * shade;
    out[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  placeMarkers();
}

/** Project every seat; front-facing ones become positioned DOM markers. */
function placeMarkers() {
  const cosT = Math.cos(G.tilt), sinT = Math.sin(G.tilt);
  for (const m of G.markers) {
    const { lat, lon } = m.geo;
    const cl = Math.cos(lat);
    const x = cl * Math.sin(lon - G.yaw);
    const z = cl * Math.cos(lon - G.yaw);
    const y = Math.sin(lat);
    // Apply the camera tilt (the inverse of the sampler's un-tilt).
    const y2 = y * cosT - z * sinT;
    const z2 = y * sinT + z * cosT;
    const front = z2 > 0.14;
    if (front !== m.front) { m.front = front; m.el.style.display = front ? '' : 'none'; }
    if (!front) continue;
    const sx = (CTR + x * R) / CV * 100;
    const sy = (CTR - y2 * R) / CV * 100;
    const sc = (0.72 + 0.38 * z2).toFixed(3);
    const tf = `translate(-50%, -86%) scale(${sc})`;
    m.el.style.left = sx.toFixed(2) + '%';
    m.el.style.top = sy.toFixed(2) + '%';
    if (tf !== m._tf) m.el.style.transform = (m._tf = tf);
    m.el.style.zIndex = String(100 + Math.round(z2 * 100));
  }
}

function loop() {
  G.raf = 0;
  if (!G) return;
  if (!G.drag && Math.abs(G.vyaw) > 0.0004) {
    G.yaw += G.vyaw;
    G.vyaw *= 0.93;
    G.dirty = true;
  }
  if (G.dirty) { G.dirty = false; renderGlobe(); }
  if (G.drag || Math.abs(G.vyaw) > 0.0004) G.raf = requestAnimationFrame(loop);
}
const wake = () => { if (G && !G.raf) G.raf = requestAnimationFrame(loop); };

/** The dossier below the globe — a hall, or the legend when none is picked. */
function renderPanel() {
  if (!G) return;
  const panel = G.ov.querySelector('.globe-panel');
  if (!panel) return;
  const st = G.opts.state();
  const s = G.sel ? seatById(G.sel) : null;
  if (!s) {
    panel.innerHTML = `<div class="gp-title">🌍 The Known World</div>
      <div class="gp-sub">${REALMS.map((r) => `${r.glyph} <b>${r.name}</b>`).join(' · ')}</div>
      <div class="gp-dim">Drag to turn the world. Tap a hall for its dossier — ${Object.keys(st.contacts || {}).length}/${SEATS.length - 1} halls answer your letters.</div>`;
    return;
  }
  const realm = realmById(s.realm);
  const name = seatName(s, st.guildName);
  if (s.id === 'home') {
    panel.innerHTML = `<div class="gp-title">☙ ${name}</div>
      <div class="gp-sub">${realm.glyph} ${realm.name} — ${realm.blurb}</div>
      <div class="gp-dim">The seat of your guild. Every road on this map leads back here.</div>`;
    return;
  }
  const known = (st.contacts || {})[s.id];
  const hosting = (st.events || []).filter((e) => e.venueId === s.id);
  const hostLines = hosting.map((e) => `<div class="gp-line">🏆 <b>${e.name}</b> · R${e.rank} · ${e.when}</div>`).join('');
  const locals = (st.rivalsOf ? st.rivalsOf(s.id) : []).slice(0, 3)
    .map((r) => `<div class="gp-line gp-dim2">🗡 ${r.name} · ${r.record}</div>`).join('');
  panel.innerHTML = `<div class="gp-title">${realm.glyph} ${name}</div>
    <div class="gp-sub">${realm.name} — ${realm.blurb}</div>
    ${known ? `<div class="gp-line gp-known">🤝 A standing contact since week ${known} — their circulars reach your desk.</div>` : ''}
    ${hostLines || '<div class="gp-line gp-dim2">No tournament on their grounds this season.</div>'}
    ${locals}
    ${!known ? `<button class="gp-contact" ${st.gold >= st.contactCost ? '' : 'disabled'} onclick="__globe.contact()">✉ Send an envoy — establish contact (☉${st.contactCost})</button>` : ''}`;
}
/** Re-read live state into the panel (hall calls this after a contact lands). */
export function refreshGlobePanel() { if (G) { renderPanel(); markerBadges(); } }

function markerBadges() {
  const st = G.opts.state();
  for (const m of G.markers) {
    m.el.classList.toggle('known', m.seat.id === 'home' || !!(st.contacts || {})[m.seat.id]);
    m.el.classList.toggle('hosting', (st.events || []).some((e) => e.venueId === m.seat.id));
    m.el.classList.toggle('sel', G.sel === m.seat.id);
  }
}

function select(id) {
  if (!G) return;
  G.sel = G.sel === id ? null : id;
  renderPanel();
  markerBadges();
}

/**
 * Open the globe. `opts.state()` returns live guild facts (contacts, gold,
 * events with venueIds, rival lookups); `opts.onContact(seatId)` performs the
 * envoy purchase — the globe never touches guild state itself.
 */
export async function openGlobe(opts) {
  if (G) closeGlobe();
  const host = document.getElementById('guildScreen') || document.body;
  const ov = document.createElement('div');
  ov.className = 'globe-overlay';
  ov.innerHTML = `
    <div class="globe-hud">
      <span class="globe-title">🌍 The Known World</span>
      <button class="globe-x" onclick="__globe.close()">✕</button>
    </div>
    <div class="globe-box">
      <canvas class="globe-cv" width="${CV}" height="${CV}"></canvas>
      <div class="globe-marks"></div>
    </div>
    <div class="globe-panel"></div>
    <div class="globe-hint">drag to turn the world · tap a hall</div>`;
  ov.addEventListener('pointerdown', (e) => { if (e.target === ov) closeGlobe(); });
  host.appendChild(ov);
  const home = latLonOf(seatById('home'));
  G = {
    ov, opts, sel: null, markers: [],
    cv: ov.querySelector('.globe-cv'),
    yaw: home.lon, tilt: -home.lat * 0.7, vyaw: 0,
    drag: null, dirty: true, raf: 0, frame: null, tex: null,
  };
  G.ctx = G.cv.getContext('2d');
  const marks = ov.querySelector('.globe-marks');
  for (const seat of SEATS) {
    const el = document.createElement('button');
    el.className = 'globe-mk' + (seat.id === 'home' ? ' home' : '');
    const col = seat.mini % 3, row = (seat.mini / 3) | 0;
    el.innerHTML = `<span class="mk-keep" style="background-image:url(${MINI});background-position:${col * 50}% ${row / 3 * 100}%"></span>
      <span class="mk-label"></span>`;
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('click', () => select(seat.id));
    // Born HIDDEN and front:false in agreement — placeMarkers only writes on a
    // CHANGE of side, so a marker born visible on the far side would never be
    // hidden by the very check that exists to hide it.
    el.style.display = 'none';
    marks.appendChild(el);
    G.markers.push({ seat, el, geo: latLonOf(seat), front: false, _tf: '' });
  }
  // Labels resolve live (the home seat wears the guild's name).
  const st = opts.state();
  for (const m of G.markers) m.el.querySelector('.mk-label').textContent = seatName(m.seat, st.guildName);
  markerBadges();
  renderPanel();

  // Drag anywhere on the box — the markers stopPropagation so a tap stays a tap.
  const box = ov.querySelector('.globe-box');
  box.addEventListener('pointerdown', (e) => {
    G.drag = { x: e.clientX, y: e.clientY, moved: 0 };
    G.vyaw = 0;
    box.setPointerCapture(e.pointerId);
    wake();
  });
  box.addEventListener('pointermove', (e) => {
    if (!G || !G.drag) return;
    const k = Math.PI / (box.clientWidth || 320);       // a full drag ≈ half a turn
    const dx = e.clientX - G.drag.x, dy = e.clientY - G.drag.y;
    G.yaw -= dx * k;
    G.tilt = Math.max(-0.9, Math.min(0.9, G.tilt + dy * k * 0.7));
    G.vyaw = -dx * k * 0.55;
    G.drag.x = e.clientX; G.drag.y = e.clientY;
    G.drag.moved += Math.abs(dx) + Math.abs(dy);
    G.dirty = true;
    wake();
  });
  const drop = () => { if (G) { G.drag = null; wake(); } };
  box.addEventListener('pointerup', drop);
  box.addEventListener('pointercancel', drop);
  G.onEsc = (e) => { if (e.key === 'Escape') closeGlobe(); };
  window.addEventListener('keydown', G.onEsc);

  try {
    G.tex = await bakeTexture();
  } catch (e) {
    console.warn('globe: texture failed', e);
    if (G && G.ov === ov) closeGlobe();
    return;
  }
  if (!G || G.ov !== ov) return;   // closed while the texture baked
  renderGlobe();
  requestAnimationFrame(() => ov.classList.add('on'));
}

export function closeGlobe() {
  if (!G) return;
  if (G.raf) cancelAnimationFrame(G.raf);
  window.removeEventListener('keydown', G.onEsc);
  G.ov.remove();
  G = null;
}

window.__globe = {
  close: closeGlobe,
  contact: () => { if (G && G.sel) G.opts.onContact(G.sel); },
};
