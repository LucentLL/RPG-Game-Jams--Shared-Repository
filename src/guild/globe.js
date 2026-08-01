/**
 * @file The world as a GLOBE — the circuit's 32 halls on a turning sphere.
 *
 * The texture is the authored chart (world-guilds.js) rasterised into a
 * 1024×512 equirectangular sheet — land from FBB worldmap tiles, and the
 * surfaces the sheet simply does not carry as opaque fills (open sea, taiga,
 * hills) DRAWN per cell. That is not taste, it is a measurement: the sheet's
 * bluest opaque tile averages rgb(216,237,243) — white-capped foam, which is
 * why the first cut's oceans read as white — and its taiga/hill tiles are
 * mostly transparency, which composited as black holes.
 *
 * The sphere is a per-pixel orthographic projection into a small canvas,
 * CSS-scaled with image-rendering: pixelated. Ray directions are precomputed
 * per zoom level; a frame only rotates and samples. ZOOM (wheel, pinch, the
 * HUD's ＋/−) scales the projection radius: the guild halls are the high-level
 * read, and past GLOBE_DETAIL the towns and the delves you have charted in
 * the Wilds fade in as their own markers.
 *
 * Halls are DOM markers over the canvas — real castle sprites cut from the
 * worldmap sheet (the first cut grabbed worldmapminis_base, which turns out
 * to be the BASE-BODY character minis: naked people planted on every seat).
 */
import { ART_BASE } from '../config/assets.js';
import { CHART, SEATS, REALMS, seatById, realmById, seatName, latLonOf } from './world-guilds.js';

const SHEET = ART_BASE + 'worldmap.png';

/** Biome letter → [sx, sy] of an OPAQUE 16px tile on worldmap.png. Only the
 *  fills that measured fully opaque are taken from the sheet; the rest draw. */
const TILE16 = { g: [32, 32], f: [192, 32], d: [32, 96], i: [32, 352], m: [212, 184] };

/** Small deterministic hash for per-cell variation — the world must bake the
 *  same sea every session. */
const cellHash = (x, y) => { let h = (x * 73856093) ^ (y * 19349663); h = (h ^ (h >> 13)) * 1274126177; return (h ^ (h >> 16)) >>> 0; };

/** The drawn fills. Each paints one 16px cell, opaque, varied by cell hash. */
const DRAWN = {
  // Open sea: deep blue, dither, a wave dash or two. The colour the whole
  // globe reads as — this is the fix for the white ocean.
  '~': (g, x, y, h) => {
    g.fillStyle = '#1e4e80';
    g.fillRect(x, y, 16, 16);
    g.fillStyle = '#27639c';
    for (let i = 0; i < 5; i++) g.fillRect(x + ((h >> (i * 3)) & 15), y + ((h >> (i * 3 + 7)) & 15), 1, 1);
    g.fillStyle = '#173c63';
    g.fillRect(x + ((h >> 2) & 15), y + 13 + (h & 1), 2, 1);
    if ((h & 7) < 3) {
      g.fillStyle = '#6fa8d4';
      g.fillRect(x + (h & 7), y + 3 + ((h >> 5) & 7), 4 + (h & 3), 1);
    }
  },
  // Taiga: the snow fill with a couple of pines stood in it.
  t: (g, x, y, h, sheet) => {
    g.drawImage(sheet, TILE16.i[0], TILE16.i[1], 16, 16, x, y, 16, 16);
    const pine = (px, py) => {
      g.fillStyle = '#2e5a3c';
      g.fillRect(px + 2, py, 2, 2); g.fillRect(px + 1, py + 2, 4, 2); g.fillRect(px, py + 4, 6, 2);
      g.fillStyle = '#1f4029';
      g.fillRect(px + 1, py + 5, 4, 1);
      g.fillStyle = '#5a3a22';
      g.fillRect(px + 2, py + 6, 2, 2);
    };
    pine(x + (h & 7), y + 1 + ((h >> 4) & 3));
    pine(x + 8 + ((h >> 8) & 1), y + 7 + ((h >> 6) & 1));
  },
  // Hills: the grass fill with two brown mounds.
  h: (g, x, y, h, sheet) => {
    g.drawImage(sheet, TILE16.g[0], TILE16.g[1], 16, 16, x, y, 16, 16);
    const mound = (px, py, w) => {
      g.fillStyle = '#8a6335';
      g.fillRect(px + 2, py, w - 4, 2); g.fillRect(px + 1, py + 2, w - 2, 2); g.fillRect(px, py + 4, w, 2);
      g.fillStyle = '#b98d4e';
      g.fillRect(px + 2, py, w - 4, 1);
      g.fillStyle = '#5d3f20';
      g.fillRect(px, py + 5, w, 1);
    };
    mound(x + (h & 3), y + 2, 10);
    mound(x + 6 + ((h >> 5) & 1), y + 9, 9);
  },
};

/** Marker sprites, cut from the sheet (probed boxes) or drawn (no cave-mouth
 *  exists at marker scale). Baked once, alongside the texture. */
const CROPS = {
  hallHome: { x: 308, y: 133, w: 56, h: 45 },   // the red-roofed castle
  hall: { x: 258, y: 132, w: 50, h: 37 },       // the grey keep
  townA: { x: 261, y: 16, w: 21, h: 24 },
  townB: { x: 282, y: 16, w: 26, h: 28 },
};

let _tex = null;      // { canvas, data, w, h }
let _sprites = null;  // { hallHome, hall, townA, townB, dungeon } as data URLs
async function bakeTexture() {
  if (_tex) return _tex;
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('globe: worldmap sheet failed'));
    i.src = SHEET;
  });
  const W = CHART[0].length * 16, H = CHART.length * 16;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  for (let cy = 0; cy < CHART.length; cy++) {
    for (let cx = 0; cx < CHART[0].length; cx++) {
      const b = CHART[cy][cx];
      if (DRAWN[b]) DRAWN[b](g, cx * 16, cy * 16, cellHash(cx, cy), img);
      else {
        const t = TILE16[b] || TILE16.g;
        g.drawImage(img, t[0], t[1], 16, 16, cx * 16, cy * 16, 16, 16);
      }
    }
  }
  const d = g.getImageData(0, 0, W, H);
  _tex = { canvas: cv, data: d.data, w: W, h: H };
  // The marker sprites, at 2x so a 22px marker stays crisp.
  const bake = (r) => {
    const c = document.createElement('canvas');
    c.width = r.w * 2; c.height = r.h * 2;
    const cg = c.getContext('2d');
    cg.imageSmoothingEnabled = false;
    cg.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, r.w * 2, r.h * 2);
    return c.toDataURL();
  };
  const cave = () => {
    const c = document.createElement('canvas');
    c.width = 32; c.height = 28;
    const cg = c.getContext('2d');
    cg.fillStyle = '#6a6a74'; cg.fillRect(4, 8, 24, 18);
    cg.fillRect(8, 4, 16, 6); cg.fillRect(2, 14, 28, 12);
    cg.fillStyle = '#83838d'; cg.fillRect(8, 4, 16, 2); cg.fillRect(4, 8, 4, 4);
    cg.fillStyle = '#08080c'; cg.fillRect(11, 12, 10, 14); cg.fillRect(9, 16, 14, 10);
    cg.fillStyle = '#3c3c46'; cg.fillRect(2, 24, 28, 2);
    return c.toDataURL();
  };
  _sprites = { hallHome: bake(CROPS.hallHome), hall: bake(CROPS.hall), townA: bake(CROPS.townA), townB: bake(CROPS.townB), dungeon: cave() };
  return _tex;
}

/** Canvas size and base sphere radius in LOGICAL px (CSS scales the rest). */
const CV = 320, R = 148, CTR = CV / 2;
const ZOOM_MIN = 1, ZOOM_MAX = 4;
/** Past here the world stops being only politics: towns and charted delves. */
const GLOBE_DETAIL = 1.8;

/** Precomputed unit rays for the disc at the CURRENT zoom — a frame rotates. */
let _rays = { key: '' };
function rays() {
  const key = G.zoom.toFixed(3);
  if (_rays.key === key) return _rays;
  const Rz = R * G.zoom;
  const idx = [], nx = [], ny = [], nz = [];
  for (let y = 0; y < CV; y++) {
    for (let x = 0; x < CV; x++) {
      const px = (x - CTR + 0.5) / Rz, py = (y - CTR + 0.5) / Rz;
      const rr = px * px + py * py;
      if (rr > 1) continue;
      idx.push(y * CV + x);
      nx.push(px); ny.push(-py); nz.push(Math.sqrt(1 - rr));
    }
  }
  _rays = {
    key,
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
    const y = y0 * cosT + z0 * sinT;
    const z = -y0 * sinT + z0 * cosT;
    const lat = Math.asin(y);
    let lon = Math.atan2(x, z) + yaw;
    lon -= Math.floor((lon + Math.PI) / PI2) * PI2;
    const u = Math.min(TW - 1, ((lon + Math.PI) / PI2 * TW) | 0);
    const v = Math.min(TH - 1, ((0.5 - lat / Math.PI) * TH) | 0);
    const s = (v * TW + u) * 4;
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

/** Project every marker; front-facing, on-canvas ones become positioned DOM. */
function placeMarkers() {
  const cosT = Math.cos(G.tilt), sinT = Math.sin(G.tilt);
  const Rz = R * G.zoom;
  const detail = G.zoom >= GLOBE_DETAIL;
  for (const m of G.markers) {
    const { lat, lon } = m.geo;
    const cl = Math.cos(lat);
    const x = cl * Math.sin(lon - G.yaw);
    const z = cl * Math.cos(lon - G.yaw);
    const y = Math.sin(lat);
    const y2 = y * cosT - z * sinT;
    const z2 = y * sinT + z * cosT;
    const sx = CTR + x * Rz, sy = CTR - y2 * Rz;
    const show = z2 > 0.14 && sx > -14 && sx < CV + 14 && sy > -14 && sy < CV + 14
      && (m.poi ? detail : true);
    if (show !== m.front) { m.front = show; m.el.style.display = show ? '' : 'none'; }
    if (!show) continue;
    const sc = ((0.72 + 0.38 * z2) * Math.min(1.55, 0.8 + 0.22 * G.zoom)).toFixed(3);
    const tf = `translate(-50%, -86%) scale(${sc})`;
    m.el.style.left = (sx / CV * 100).toFixed(2) + '%';
    m.el.style.top = (sy / CV * 100).toFixed(2) + '%';
    if (tf !== m._tf) m.el.style.transform = (m._tf = tf);
    m.el.style.zIndex = String(100 + Math.round(z2 * 100));
  }
}

function setZoom(z) {
  if (!G) return;
  G.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
  G.ov.classList.toggle('zoomed', G.zoom >= GLOBE_DETAIL);
  const zl = G.ov.querySelector('.globe-zoomlvl');
  if (zl) zl.textContent = '×' + G.zoom.toFixed(1);
  G.dirty = true;
  wake();
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

/** The dossier below the globe — a hall, a town, a delve, or the legend. */
function renderPanel() {
  if (!G) return;
  const panel = G.ov.querySelector('.globe-panel');
  if (!panel) return;
  const st = G.opts.state();
  if (G.sel && G.sel.poi) {
    const p = G.sel.poi;
    panel.innerHTML = p.kind === 'dungeon'
      ? `<div class="gp-title">${p.glyph || '⛏'} ${p.name}</div>
         <div class="gp-sub">A charted delve of your Wilds${p.tier ? ` · tier ${p.tier}` : ''}.</div>
         <div class="gp-dim">March there from the 🗺 Wilds room — this map only knows where it is.</div>`
      : `<div class="gp-title">🏘 ${p.name}</div>
         <div class="gp-sub">A free town of ${(realmById(p.realm) || {}).name || 'the world'}.</div>
         <div class="gp-dim">Caravans, gossip, and somewhere for a road to go.</div>`;
    return;
  }
  const s = G.sel ? seatById(G.sel.id) : null;
  if (!s) {
    panel.innerHTML = `<div class="gp-title">🌍 The Known World</div>
      <div class="gp-sub">${REALMS.map((r) => `${r.glyph} <b>${r.name}</b>`).join(' · ')}</div>
      <div class="gp-dim">Drag to turn · pinch or ＋/− to zoom (closer in, towns and your charted delves appear) · tap a hall. ${Object.keys(st.contacts || {}).length}/${SEATS.length - 1} halls answer your letters.</div>`;
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
    if (m.poi) { m.el.classList.toggle('sel', !!(G.sel && G.sel.poi && G.sel.poi.id === m.poi.id)); continue; }
    m.el.classList.toggle('known', m.seat.id === 'home' || !!(st.contacts || {})[m.seat.id]);
    m.el.classList.toggle('hosting', (st.events || []).some((e) => e.venueId === m.seat.id));
    m.el.classList.toggle('sel', !!(G.sel && !G.sel.poi && G.sel.id === m.seat.id));
  }
}

function select(sel) {
  if (!G) return;
  const same = G.sel && sel && ((sel.poi && G.sel.poi && sel.poi.id === G.sel.poi.id) || (!sel.poi && !G.sel.poi && sel.id === G.sel.id));
  G.sel = same ? null : sel;
  renderPanel();
  markerBadges();
}

/** One marker element: a sprite plate and a label. */
function addMarker(marks, sprite, label, cls) {
  const el = document.createElement('button');
  el.className = 'globe-mk ' + cls;
  el.innerHTML = `<span class="mk-keep" style="background-image:url(${sprite})"></span><span class="mk-label">${label}</span>`;
  el.style.display = 'none';
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  marks.appendChild(el);
  return el;
}

/**
 * Open the globe. `opts.state()` returns live guild facts (contacts, gold,
 * events with venueIds, rival lookups, pois — towns + charted delves);
 * `opts.onContact(seatId)` performs the envoy purchase.
 */
export async function openGlobe(opts) {
  if (G) closeGlobe();
  const host = document.getElementById('guildScreen') || document.body;
  const ov = document.createElement('div');
  ov.className = 'globe-overlay';
  ov.innerHTML = `
    <div class="globe-hud">
      <span class="globe-title">🌍 The Known World</span>
      <span class="globe-zoomlvl">×1.0</span>
      <button class="globe-zoom" onclick="__globe.zoom(-1)" title="Zoom out">−</button>
      <button class="globe-zoom" onclick="__globe.zoom(1)" title="Zoom in">＋</button>
      <button class="globe-x" onclick="__globe.close()">✕</button>
    </div>
    <div class="globe-box">
      <canvas class="globe-cv" width="${CV}" height="${CV}"></canvas>
      <div class="globe-marks"></div>
    </div>
    <div class="globe-panel"></div>
    <div class="globe-hint">drag to turn · pinch or ＋/− to zoom · tap a hall</div>`;
  ov.addEventListener('pointerdown', (e) => { if (e.target === ov) closeGlobe(); });
  host.appendChild(ov);
  const home = latLonOf(seatById('home'));
  G = {
    ov, opts, sel: null, markers: [],
    cv: ov.querySelector('.globe-cv'),
    yaw: home.lon, tilt: -home.lat * 0.7, vyaw: 0, zoom: 1,
    drag: null, pointers: new Map(), pinch: 0,
    dirty: true, raf: 0, frame: null, tex: null,
  };
  G.ctx = G.cv.getContext('2d');

  try {
    G.tex = await bakeTexture();
  } catch (e) {
    console.warn('globe: texture failed', e);
    if (G && G.ov === ov) closeGlobe();
    return;
  }
  if (!G || G.ov !== ov) return;   // closed while the texture baked

  // Markers — halls always; towns and charted delves join past GLOBE_DETAIL.
  const st = opts.state();
  const marks = ov.querySelector('.globe-marks');
  for (const seat of SEATS) {
    const el = addMarker(marks, seat.id === 'home' ? _sprites.hallHome : _sprites.hall,
      seatName(seat, st.guildName), seat.id === 'home' ? 'home' : '');
    el.addEventListener('click', () => select({ id: seat.id }));
    G.markers.push({ seat, el, geo: latLonOf(seat), front: false, _tf: '' });
  }
  for (const p of (st.pois || [])) {
    const el = addMarker(marks, p.kind === 'dungeon' ? _sprites.dungeon : ((cellHash(p.cx, p.cy) & 1) ? _sprites.townA : _sprites.townB),
      p.name, 'globe-poi ' + (p.kind === 'dungeon' ? 'poi-delve' : 'poi-town'));
    el.addEventListener('click', () => select({ poi: p }));
    G.markers.push({ poi: p, el, geo: latLonOf(p), front: false, _tf: '' });
  }
  markerBadges();
  renderPanel();

  // Drag turns, two pointers pinch; markers stopPropagation so a tap stays one.
  const box = ov.querySelector('.globe-box');
  box.addEventListener('pointerdown', (e) => {
    G.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (G.pointers.size === 1) { G.drag = { x: e.clientX, y: e.clientY }; G.vyaw = 0; }
    else { G.drag = null; G.pinch = 0; }
    box.setPointerCapture(e.pointerId);
    wake();
  });
  box.addEventListener('pointermove', (e) => {
    if (!G || !G.pointers.has(e.pointerId)) return;
    G.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (G.pointers.size === 2) {
      const [a, b] = [...G.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (G.pinch) setZoom(G.zoom * (d / G.pinch));
      G.pinch = d;
      return;
    }
    if (!G.drag) return;
    const k = Math.PI / ((box.clientWidth || 320) * G.zoom);
    const dx = e.clientX - G.drag.x, dy = e.clientY - G.drag.y;
    G.yaw -= dx * k;
    G.tilt = Math.max(-1.1, Math.min(1.1, G.tilt + dy * k * 0.7));
    G.vyaw = -dx * k * 0.55;
    G.drag.x = e.clientX; G.drag.y = e.clientY;
    G.dirty = true;
    wake();
  });
  const drop = (e) => { if (!G) return; G.pointers.delete(e.pointerId); if (G.pointers.size < 2) G.pinch = 0; if (!G.pointers.size) G.drag = null; wake(); };
  box.addEventListener('pointerup', drop);
  box.addEventListener('pointercancel', drop);
  box.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(G.zoom * Math.exp(-e.deltaY * 0.0016)); }, { passive: false });
  G.onEsc = (e) => { if (e.key === 'Escape') closeGlobe(); };
  window.addEventListener('keydown', G.onEsc);

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

// ---------------------------------------------------------------------------
// The FLAT map — the wall-scroll version, Street-Fighter-select style
// ---------------------------------------------------------------------------

/**
 * The whole world at once: the equirect texture squashed row-by-row into an
 * oval (the arcade world-select look), halls stamped on with their castle
 * sprites and name plates. Returned as a data URL so it can live inside a
 * scroll's innerHTML and survive every refresh untouched. High-level on
 * purpose: halls only — the globe is where zoom buys towns and delves.
 */
export async function flatMapDataUrl(st) {
  const tex = await bakeTexture();
  const W = 1024, H = 600, MAP_H = 512;
  const cx = W / 2, cy = MAP_H / 2, rx = W / 2 - 10, ry = MAP_H / 2 - 8;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  // The sea behind the oval's own edge, then the world squashed into it.
  for (let y = 0; y < MAP_H; y++) {
    const t = (y - cy) / ry;
    if (Math.abs(t) > 1) continue;
    const k = Math.sqrt(1 - t * t);
    const sy = ((y - (cy - ry)) / (2 * ry)) * tex.h;
    g.drawImage(tex.canvas, 0, sy, tex.w, tex.h / (2 * ry), cx - rx * k, y, 2 * rx * k, 1);
  }
  // Rim so the oval reads as an object on the parchment.
  g.strokeStyle = '#2a1c0e';
  g.lineWidth = 3;
  g.beginPath(); g.ellipse(cx, cy, rx + 1, ry + 1, 0, 0, Math.PI * 2); g.stroke();

  const plate = (x, y, txt, gold) => {
    g.font = '700 15px Georgia, serif';
    const w = g.measureText(txt).width + 10;
    const px = Math.max(2, Math.min(W - w - 2, x - w / 2));
    g.fillStyle = 'rgba(12,8,4,0.85)';
    g.fillRect(px, y, w, 19);
    g.strokeStyle = gold ? '#d4a843' : '#5a4630';
    g.lineWidth = 1;
    g.strokeRect(px + 0.5, y + 0.5, w - 1, 18);
    g.fillStyle = gold ? '#ffd98a' : '#e8dcc0';
    g.fillText(txt, px + 5, y + 14);
  };
  const spriteImg = (url) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = url; });
  const homeImg = await spriteImg(_sprites.hallHome), hallImg = await spriteImg(_sprites.hall);
  const seats = SEATS.map((s) => ({ s, known: s.id === 'home' || !!(st.contacts || {})[s.id] }));
  for (const { s, known } of seats) {
    const u = ((s.cx + 0.5) / CHART[0].length);
    const y = (cy - ry) + ((s.cy + 0.5) / CHART.length) * 2 * ry;
    const k = Math.sqrt(Math.max(0.02, 1 - ((y - cy) / ry) ** 2));
    const x = cx + (u - 0.5) * 2 * rx * k;
    const img = s.id === 'home' ? homeImg : hallImg;
    const hosting = (st.events || []).some((e) => e.venueId === s.id);
    if (hosting) {
      g.strokeStyle = '#ffd98a'; g.lineWidth = 2;
      g.beginPath(); g.arc(x, y - 8, 17, 0, Math.PI * 2); g.stroke();
    }
    if (img) {
      g.globalAlpha = known ? 1 : 0.5;
      const iw = img.width * 0.55, ih = img.height * 0.55;
      g.drawImage(img, x - iw / 2, y - ih + 4, iw, ih);
      g.globalAlpha = 1;
    }
  }
  // Plates second, so no castle overprints a neighbour's name.
  for (const { s, known } of seats) {
    if (!known) continue;
    const u = ((s.cx + 0.5) / CHART[0].length);
    const y = (cy - ry) + ((s.cy + 0.5) / CHART.length) * 2 * ry;
    const k = Math.sqrt(Math.max(0.02, 1 - ((y - cy) / ry) ** 2));
    const x = cx + (u - 0.5) * 2 * rx * k;
    plate(x, Math.min(H - 22, y + 6), seatName(s, st.guildName), s.id === 'home');
  }
  // Legend strip under the oval.
  g.font = '700 16px Georgia, serif';
  g.fillStyle = '#2a1c0e';
  const known = seats.filter((q) => q.known).length - 1;
  g.fillText(`THE KNOWN WORLD — ${SEATS.length} halls · ${known}/${SEATS.length - 1} in contact · ⭘ hosts a tournament`, 18, MAP_H + 34);
  g.font = '14px Georgia, serif';
  g.fillStyle = '#55402a';
  g.fillText('Unknown halls stand faded until an envoy carries your seal. The globe knows more: zoom it for towns and delves.', 18, MAP_H + 60);
  return cv.toDataURL();
}

window.__globe = {
  close: closeGlobe,
  zoom: (dir) => { if (G) setZoom(G.zoom * (dir > 0 ? 1.3 : 1 / 1.3)); },
  contact: () => { if (G && G.sel && !G.sel.poi) G.opts.onContact(G.sel.id); },
};
