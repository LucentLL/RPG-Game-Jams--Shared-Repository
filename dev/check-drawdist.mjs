/**
 * Quad census for the first-person crawler — what a scene actually costs.
 *
 * Reproduces `buildGeometry`'s want-set (delve-fp.js) over the REAL charts, so
 * it cannot drift from the game the way a hand-kept table would: the merge
 * rule, the facing cone and the fog cull are the same arithmetic.
 *
 *   node --import ./dev/register-vite-env.mjs dev/check-drawdist.mjs
 *
 * Prints, per chart and tier, what the old per-cell renderer asked a phone for
 * against what the merged one does and how far each can see — which is the
 * whole argument for the draw distance being where fitViewRadius puts it.
 *
 * A quad is a compositor layer here, and layers are what the device runs out
 * of: a 2026-08-03 phone capture lost whole surfaces, the HUD among them, at a
 * censused ~227. That number is where the budgets below come from.
 */
import { DELVE_MAPS, THEMES, LIGHTS, makeLevelModel, DECK_CH } from '../src/guild/delve-maps.js';
import { buildCampusMap } from '../src/guild/campus.js';

// The renderer's own numbers. Kept in one place here so a change over there
// shows up as a changed table rather than a stale one.
const CHUNK = 4;
const NEAR_KEEP = 5, CULL_DOT = 0.45;

const WALL = { '#': 1, B: 1, F: 1, o: 1 };
const LOW = { b: 1 };

/** One chart, as the geometry sees it. */
function gridOf(map) {
  const g = map.grid;
  return { g, cols: Math.max(...g.map((r) => r.length)), rows: g.length };
}

function census(map, px, py, yaw, R, light, fogCull, merged) {
  const { g, cols, rows } = gridOf(map);
  const at = (x, y) => (x < 0 || y < 0 || x >= cols || y >= rows ? '#' : (g[y][x] || '#'));
  // The SHARED level model — the census no longer keeps its own copy of the
  // height vocabulary, which is exactly how it had started to drift.
  const model = map._model || (map._model = makeLevelModel(map.grid));
  const heightAt = (x, y) => { const f = model.floorAt(x, y); return f == null ? 0 : f; };
  const onClimb = (x, y) => at(x, y) === 'L' || at(x, y) === 'v';
  let maxLv = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const s = model.surfacesAt(x, y);
      if (s.length && s[s.length - 1] > maxLv) maxLv = s[s.length - 1];
    }
  }
  const fogD = (d) => Math.min(1, Math.max(0, (d - light.near) / (light.far - light.near)));
  const fogAt = (x, y) => fogD(Math.hypot(x - px, y - py));
  const hx = Math.sin(yaw), hy = -Math.cos(yaw);
  const inView = (mx, my, pad) => {
    const dx = mx - px, dy = my - py, d = Math.hypot(dx, dy);
    return d <= NEAR_KEEP + pad || dx * hx + dy * hy > -CULL_DOT * d - pad;
  };
  const flat = (dFar) => dFar <= light.near;
  const farCorner = (bx, by, w, h) => Math.hypot(
    Math.max(Math.abs(px - bx), Math.abs(px - (bx + w))),
    Math.max(Math.abs(py - by), Math.abs(py - (by + h))));
  const tally = { wall: 0, floor: 0, block: 0, riser: 0, other: 0, veil: 0 };
  // A quad that has taken any fog carries a veil child, and that veil is a
  // surface of its own — the whole point of building fog that way. Counted.
  const veil = (f) => { if (f > 0) tally.veil++; };
  const cell = (x, y) => {
    const fog = fogAt(x + 0.5, y + 0.5);
    if (fog >= fogCull) return;
    const ch = at(x, y);
    if (WALL[ch] || LOW[ch]) {
      if (LOW[ch]) { tally.other++; veil(fog); }                       // lid
      else if (ch !== '#' && maxLv >= 2) { tally.other++; veil(fog); } // wall top
      return;                                                          // faces are runs
    }
    if (ch === '#') return;
    const lv = heightAt(x, y);
    tally.floor++; veil(fog);                         // floor
    if (!light.sky) { tally.floor++; veil(fog); }     // ceiling
    if (ch === '=') { tally.other++; veil(fog); }     // rail
    // Signed risers: one exposed band per side where the ground falls away.
    for (const [dx2, dy2] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nch = at(x + dx2, y + dy2);
      const cover = (WALL[nch] || nch === '#') ? Infinity : LOW[nch] ? 560 / 430 : heightAt(x + dx2, y + dy2);
      if (cover < lv) { tally.riser++; veil(fog); }
    }
    if (onClimb(x, y)) { tally.other += 1; veil(fog); }
    // Dome skirts: a lifted ceiling hangs a strip toward every lower one.
    // The lift follows the cell's HIGHEST surface (a deck lifts too), exactly
    // as the emitter reads it. (Region-roomed sky cells are uncensused here —
    // the census has never modelled the campus's stamped rooms.)
    const topOf = (x2, y2) => { const s = model.surfacesAt(x2, y2); return s.length ? Math.max(0, s[s.length - 1]) : 0; };
    const myTop = topOf(x, y);
    if (!light.sky && myTop > 0) {
      for (const [dx2, dy2] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const nch = at(x + dx2, y + dy2);
        if (WALL[nch] || nch === '#') continue;
        if (topOf(x + dx2, y + dy2) < myTop) { tally.riser++; veil(fog); }
      }
    }
    // Stairs are eight real quads; a deck is a top, an underside and its lips.
    if (model.stairAt(x, y)) { tally.other += 8; for (let i = 0; i < 8; i++) veil(fog); }
    if (DECK_CH[ch] && model.deckAt(x, y) != null) {
      const d = model.deckAt(x, y);
      let q = 2;
      for (const [dx2, dy2] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        if (!model.surfacesAt(x + dx2, y + dy2).includes(d)) q++;
      }
      tally.other += q; for (let i = 0; i < q; i++) veil(fog);
    }
  };
  /** Vertical faces, merged along their runs exactly as buildGeometry does. */
  const wallPass = () => {
    const open = (x, y) => !WALL[at(x, y)] && !LOW[at(x, y)];
    const SIDES = [
      { dx: 0, dy: 1, horiz: true }, { dx: 0, dy: -1, horiz: true },
      { dx: 1, dy: 0, horiz: false }, { dx: -1, dy: 0, horiz: false },
    ];
    for (const sd of SIDES) {
      for (let fixed = (sd.horiz ? cy : cx) - R; fixed <= (sd.horiz ? cy : cx) + R; fixed++) {
        const lo = (sd.horiz ? cx : cy) - R, hi = (sd.horiz ? cx : cy) + R;
        const cellAt = (i) => (sd.horiz ? [i, fixed] : [fixed, i]);
        let i = lo;
        while (i <= hi) {
          const [x, y] = cellAt(i);
          const ch = at(x, y);
          if (!(WALL[ch] || LOW[ch]) || !open(x + sd.dx, y + sd.dy)) { i++; continue; }
          const h = LOW[ch] ? 1 : 2;
          const nf = Math.min(0, heightAt(x + sd.dx, y + sd.dy));   // face drop joins the run key
          // The dome rise mirrors the emitter's upOf: TALL faces only (never
          // LOW runs), by the fronted cell's highest surface, indoors only.
          const topOf2 = (x2, y2) => { const s2 = model.surfacesAt(x2, y2); return s2.length ? Math.max(0, s2[s2.length - 1]) : 0; };
          const uL = (light.sky || h === 1) ? 0 : topOf2(x + sd.dx, y + sd.dy);
          const fcx = x + 0.5 + sd.dx * 0.5, fcy = y + 0.5 + sd.dy * 0.5;
          let n = 1;
          while (merged && n < CHUNK) {
            const [ax, ay] = cellAt(i + n);
            const c2 = at(ax, ay);
            if (!(WALL[c2] || LOW[c2]) || (LOW[c2] ? 1 : 2) !== h) break;
            if (!open(ax + sd.dx, ay + sd.dy)) break;
            if (Math.min(0, heightAt(ax + sd.dx, ay + sd.dy)) !== nf) break;
            if (((light.sky || h === 1) ? 0 : topOf2(ax + sd.dx, ay + sd.dy)) !== uL) break;
            const w = sd.horiz ? n + 1 : 1, d = sd.horiz ? 1 : n + 1;
            if (!flat(farCorner(sd.horiz ? x : fcx - 0.5, sd.horiz ? fcy - 0.5 : y, w, d))) break;
            n++;
          }
          const mid = sd.horiz ? [x + n / 2, fcy] : [fcx, y + n / 2];
          if (fogD(Math.hypot(mid[0] - px, mid[1] - py)) < fogCull
            && (!merged || inView(mid[0], mid[1], n * 0.5))) { tally.wall++; veil(fogD(Math.hypot(mid[0] - px, mid[1] - py))); }
          i += n;
        }
      }
    }
  };
  const even = (bx, by, s) => {
    for (let y = by; y < by + s; y++) {
      for (let x = bx; x < bx + s; x++) {
        const ch = at(x, y);
        if (WALL[ch] || LOW[ch] || ch === '#' || ch === '=') return false;
        if (heightAt(x, y) || model.climbAt(x, y) || DECK_CH[ch]) return false;
        for (const [dx2, dy2] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
          const nch = at(x + dx2, y + dy2);
          if (!WALL[nch] && !LOW[nch] && nch !== '#' && heightAt(x + dx2, y + dy2) < 0) return false;
        }
      }
    }
    return true;
  };
  const cx = Math.floor(px), cy = Math.floor(py);
  const walk = (bx, by, s) => {
    if (bx + s <= cx - R || bx > cx + R || by + s <= cy - R || by > cy + R) return;
    const mx = bx + s / 2, my = by + s / 2, pad = s * 0.71;
    if (merged && !inView(mx, my, pad)) return;
    const nx = Math.max(bx, Math.min(px, bx + s)), ny = Math.max(by, Math.min(py, by + s));
    if (fogD(Math.hypot(px - nx, py - ny)) >= fogCull) return;
    if (s === 1) { cell(bx, by); return; }
    const d = Math.max(Math.abs(mx - px), Math.abs(my - py));
    if (merged && flat(farCorner(bx, by, s, s)) && even(bx, by, s)) {
      tally.block += light.sky ? 1 : 2; return;
    }
    const h = s / 2;
    walk(bx, by, h); walk(bx + h, by, h); walk(bx, by + h, h); walk(bx + h, by + h, h);
  };
  const align = (v) => Math.floor(v / CHUNK) * CHUNK;
  for (let by = align(cy - R); by <= cy + R; by += CHUNK) {
    for (let bx = align(cx - R); bx <= cx + R; bx += CHUNK) walk(bx, by, CHUNK);
  }
  wallPass();
  tally.total = tally.wall + tally.floor + tally.block + tally.riser + tally.other + tally.veil;
  return tally;
}

/** A guild shaped just enough for campus.js to lay the estate out. */
const stubGuild = { campus: null, rooms: {}, name: 'Census' };

const rows = [];
const maps = [];
try {
  maps.push(['campus (the estate)', buildCampusMap(stubGuild)]);
} catch (e) {
  console.log('campus skipped:', e.message);
}
for (const id of ['ferncreek', 'hollowvein', 'arena']) {
  if (DELVE_MAPS[id]) maps.push([id, DELVE_MAPS[id]]);
}

/**
 * WHAT SHIPPED BEFORE, AND WHAT THE FIT SETTLES ON NOW.
 *
 * `was` is the 2026-08-03 build — per-cell ground, per-cell wall faces, no
 * facing cone, and a radius from a formula (LIGHTS.open 7/16, lite 4.5/10,
 * capped 13/8). That is the build the player captured the missing HUD on.
 *
 * `now` is fitViewRadius: merging is only lossless inside the clear disc, so
 * the fogged annulus stays one quad per cell and its AREA is what bounds the
 * view. Pin the fog to close exactly at the build edge — `far = R`, and
 * `near = R − 0.3/(1 − FOG_CULL)`, which fixes the ramp at 3.0 tiles on a phone
 * and 7.5 on a desktop — and the radius becomes a single free variable to sweep
 * against a layer budget.
 *
 * The budgets are read off the failure, not guessed: the capture was a phone
 * dropping whole layers at a censused ~227 quads.
 */
const BUDGET = { phone: Number(process.env.PH || 440), desktop: Number(process.env.DESK || 1900) };
const CAP = { phone: 32, desktop: 48 };
const WAS = {
  desktop: { near: 7, far: 16, cap: 13 },
  phone: { near: 4.5, far: 10, cap: 8 },
};

/** The worst of the eight bearings, never a lucky one. */
function worst(map, light, fogCull, R, merged) {
  const e = map.entry || [Math.floor(map.grid[0].length / 2), Math.floor(map.grid.length / 2)];
  let out = null;
  for (let d = 0; d < 8; d++) {
    const t = census(map, e[0], e[1], d * Math.PI / 4, R, light, fogCull, merged);
    if (!out || t.total > out.total) out = t;
  }
  return out;
}

for (const [name, map] of maps) {
  const theme = THEMES[map.theme] || THEMES.meadow;
  const base = LIGHTS[theme.light] || LIGHTS.open;
  const span = Math.max(map.grid.length, ...map.grid.map((r) => r.length));
  for (const tier of ['desktop', 'phone']) {
    const coarse = tier === 'phone';
    const fogCull = coarse ? 0.90 : 0.96;

    // As shipped.
    const w = base.sky ? { ...base, ...WAS[tier] }
      : (coarse && base.lite ? { ...base, ...base.lite } : base);
    const wR = Math.min(base.sky ? WAS[tier].cap : (coarse ? 7 : 9),
      Math.ceil(w.near + fogCull * (w.far - w.near)) + 1);
    const wT = worst(map, w, fogCull, wR, false);

    // As fitted. A lamp is the light's statement about the world, not a budget,
    // so underground keeps its authored reach and only gains the merging.
    let nR = wR, nT, nNear = w.near;
    if (!base.sky) {
      nT = worst(map, w, fogCull, nR, true);
    } else {
      let best = null;
      for (let R = 6; R <= Math.min(CAP[tier], span); R++) {
        const near = R - 0.3 / (1 - fogCull);
        if (near < 3) continue;
        const t = worst(map, { ...base, near, far: R }, fogCull, R, true);
        if (t.total <= BUDGET[tier]) best = { R, near, t };
      }
      best = best || { R: 6, near: 6 - 0.3 / (1 - fogCull), t: worst(map, { ...base, near: 3, far: 6 }, fogCull, 6, true) };
      nR = best.R; nNear = best.near; nT = best.t;
    }
    rows.push({
      map: name, tier,
      'was R': wR, 'was quads': wT.total,
      'now R': nR, 'clear to': +nNear.toFixed(1), 'now quads': nT.total,
      ground: nT.floor + nT.block, walls: nT.wall + nT.riser,
      'view ×': +(nR / wR).toFixed(2), 'layers ×': +(nT.total / wT.total).toFixed(2),
    });
  }
}
console.table(rows);
console.log(`budgets — phone ${BUDGET.phone}, desktop ${BUDGET.desktop} layers`);
