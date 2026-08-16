/**
 * THE DELVE, DERIVED AND WITNESSED — the fixture for Unity's DelveMaps.
 *
 * DelveMaps.cs:11-13 has cited this file and `delve-fixture.json` since the
 * port landed, and neither existed: sixteen charts, twelve themes, three
 * lights and the whole LevelModel were transcribed by hand and pinned by
 * nothing. This is the net that has to be under them before a single chart
 * moves.
 *
 * It runs the REAL module — `src/guild/delve-maps.js`, imported whole under
 * the Vite env hook (delve-maps.js pulls campus.js → art.js, which reads
 * `import.meta.env`) — and writes down its answers. Nothing here re-implements
 * a derivation; the one piece that cannot be imported is `bakeChar`, which
 * lives in delve.js beside a top-level `window.__delve = …`, so its source
 * text is LIFTED VERBATIM by balanced-delimiter scan and evaluated against the
 * real FLOOR_LV/CLIMB_CH/DECK_CH tables (the dump-rooms.mjs / dump-facing.mjs
 * trick: the lifted text IS the source, so it cannot drift from it).
 *
 * WHAT IS WRITTEN DOWN, per chart:
 *   · the authored print — id/name/theme/cols/rows, the grid rows VERBATIM,
 *     entry, and every overlay array (props with their CURRENT authored w,
 *     portals, spawns, water, locks, paint, regions);
 *   · THE DERIVED ANSWERS, which are the actual point of the net —
 *       floor / deck / surfaces / underOK / climb, cell by cell, row-major;
 *       pickSurface (THE STEP LAW) for every orthogonal step between two
 *       cells that both have footing, from every surface the origin offers;
 *       the render grid (bakeChar), which is what the baker and the geometry
 *       extractor actually see;
 *       oreKindAt for every 'o' cell; waterDepths for every wet cell;
 *       validateMap's lint, captured off console.warn;
 *   · THE LAWFUL WIDTH DERIVATION for every prop — art id, its PROP_VOL rung
 *     (form/h/d/mid/fold), the ART crop w/h, the width the ladder DERIVES
 *     (w = (form==='lie' ? d : h) × (art.w/art.h) × 48 — prop-volume's own
 *     arithmetic, check-volumes.mjs:103) and the width the chart AUTHORS, so
 *     the migration off eyeballed widths can be proved non-destructive;
 *   · WHICH WAY EACH PROP IS TURNED — the authored angle, the angle
 *     `facingOf` ANSWERS (they differ on a wall form, which is the whole
 *     point), and the facing CLASS the art falls in.
 *
 * Plus THE FACING LAW ITSELF, as a table (`facingLaw`), which is not a chart
 * claim and is the reason it is here at all: no shipped chart authors a facing
 * yet, so per-prop rows alone would pin nothing but a corpus of zeroes. Every
 * art in PROP_VOL — plus one id PROP_VOL has never heard of, for the
 * permissive branch — is asked `facingClass`, `facingMatters`, and then
 * `facingOf`/`facingIsIdentity` at every angle in FACING_PROBE: negatives, a
 * full turn, more than a full turn, and the compass points between. That pins
 * the two rules a lens could plausibly get wrong on its own — a wall form
 * answers 0 whatever the chart says, and everything else is normalised into
 * 0-359 — against real data rather than against a comment.
 *
 * Plus the shared tables every chart reaches into: LIGHTS, THEMES (with the
 * `sheet`/`src`/`rimSheet` fallbacks RESOLVED — delve.js:297, 312, 424-425,
 * 372 — because the port stores the resolved value), ORE_KINDS, FLOOR_LV,
 * DECK_CH, CLIMB_CH, SWIM_DEPTH, FORD_DEPTH, MIN_CLEAR.
 *
 * And one PROBE grid, authored here rather than shipped: the charts between
 * them never use '3'..'6', 'u' or a key beside a terrace, so the vocabulary
 * itself would go unpinned. It is marked `probe` and is not a chart claim.
 *
 * Fixture law (dump-campus.mjs:28-30): integers only — every fraction rides
 * ×1000 — and no nulls, an absent string is "". The level model's `null` (a
 * cell nothing stands on) rides as NIL = -32768, which is outside every level
 * the vocabulary can author (-1 … 6).
 *
 *     node --import ./dev/register-vite-env.mjs dev/dump-delve.mjs [outPath]
 *
 * Default out is the Unity repo's Assets/Tests/EditMode/delve-fixture.json
 * (the house path — dump-rooms.mjs:167).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const {
  DELVE_MAPS, THEMES, LIGHTS, ORE_KINDS, FLOOR_LV, DECK_CH, CLIMB_CH,
  SWIM_DEPTH, FORD_DEPTH, MIN_CLEAR,
  makeLevelModel, oreKindAt, wetCells, waterDepths, validateMap,
} = await import(new URL('../src/guild/delve-maps.js', import.meta.url));
const { PROP_VOL, PLAYER_H, LADDER } = await import(new URL('../src/guild/prop-volume.js', import.meta.url));
const { ART } = await import(new URL('../src/guild/art.js', import.meta.url));
const { facingOf, facingClass, facingMatters, facingIsIdentity, FACING_STEP } =
  await import(new URL('../src/guild/prop-facing.js', import.meta.url));

const K = (v) => Math.round(v * 1000);                       // the ×1000 fixture rounding
const S = (v) => (v === undefined || v === null ? '' : String(v));
const NIL = -32768;                                          // the model's null
const LV = (v) => (v === null || v === undefined ? NIL : v);

// ── bakeChar, lifted verbatim out of delve.js ───────────────────────────────
// delve.js cannot be imported (delve.js:2752 assigns window at module scope),
// and bakeChar is not exported anyway. Lift its text and close it over the
// REAL tables, so the render-grid derivation in this fixture is the shipping
// derivation and not a second copy of it.
const delveSrc = readFileSync(join(ROOT, 'src', 'guild', 'delve.js'), 'utf8');
function balancedFrom(source, from, open = '{', close = '}') {
  let i = source.indexOf(open, from), depth = 0;
  for (; i < source.length; i++) {
    if (source[i] === open) depth++;
    else if (source[i] === close && --depth === 0) break;
  }
  return i;
}
function liftConst(source, name) {
  const at = source.indexOf(`const ${name} = `);
  if (at < 0) throw new Error(`${name} not found in delve.js — the lift needs re-aiming`);
  return source.slice(at, balancedFrom(source, at) + 1);
}
const ledgeMatch = delveSrc.match(/const LEDGE = '(.)';/);
if (!ledgeMatch) throw new Error('LEDGE not found in delve.js');
const LEDGE = ledgeMatch[1];
const bakeChar = new Function('FLOOR_LV', 'CLIMB_CH', 'DECK_CH', 'LEDGE',
  liftConst(delveSrc, 'bakeChar') + '\nreturn bakeChar;')(FLOOR_LV, CLIMB_CH, DECK_CH, LEDGE);

// ── The tables ──────────────────────────────────────────────────────────────
const lights = Object.keys(LIGHTS).map((key) => {
  const l = LIGHTS[key];
  return {
    key, r: l.rgb[0], g: l.rgb[1], b: l.rgb[2],
    nearX1000: K(l.near), farX1000: K(l.far), spriteX1000: K(l.sprite),
    sky: !!l.sky,
    // The phone tier. DROPPED by the port (DelveMaps.cs:76-77) as a DOM layer
    // budget; written down anyway so the drop stays a decision.
    hasLite: !!l.lite,
    liteNearX1000: l.lite ? K(l.lite.near) : 0,
    liteFarX1000: l.lite ? K(l.lite.far) : 0,
  };
});

/** A [cx,cy] table entry as BOTH the cell it is authored as and the source
 *  pixel rect a consumer needs (px = cell × src). */
const cell = (pair, src) => ({ cx: pair[0], cy: pair[1], x: pair[0] * src, y: pair[1] * src, w: src, h: src });
const RIM_ORDER = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'];
const rect4 = (r) => (r ? { x: r[0], y: r[1], w: r[2], h: r[3] } : { x: 0, y: 0, w: 0, h: 0 });

const themes = Object.keys(THEMES).map((key) => {
  const t = THEMES[key];
  // The fallbacks the renderers apply, resolved here because the port stores
  // the resolved value: sheet → 'cliffs' (delve.js:424), src → TILE 48
  // (delve.js:425), rimSheet → theme.sheet || 'cliffs' (delve.js:297),
  // walls.src → TILE (delve.js:372).
  const sheet = t.sheet || 'cliffs';
  const src = t.src || 48;
  const rimSheet = t.rimSheet || t.sheet || 'cliffs';
  const w = t.walls || null;
  return {
    key, light: t.light, sheet, src, rimSheet, grayProps: !!t.grayProps, wallH: t.wallH | 0,
    fill: t.fill.map((p) => cell(p, src)),
    // The rim/face tables are on the RIM sheet, always 48px cells.
    rim: RIM_ORDER.map((k) => cell(t.rim[k], 48)),
    faces: [t.faceTop.l, t.faceTop.m, t.faceTop.r, t.faceBot.l, t.faceBot.m, t.faceBot.r].map((p) => cell(p, 48)),
    voidSampleX: t.voidSample[0], voidSampleY: t.voidSample[1],
    hasWalls: !!w,
    wallSheet: w ? S(w.sheet) : '',
    wallSrc: w ? (w.src || 48) : 0,
    wallTileFill: !!(w && w.tileFill),
    wallTall: rect4(w && w.tall), wallLow: rect4(w && w.low), wallCrown: rect4(w && w.crown),
    // RENDER-ONLY, dropped by the port (DelveMaps.cs:95-97): the top-down
    // baker's turf apron strips. Written down so "dropped" stays checkable.
    hasBands: !!t.bandN,
    bandN: (t.bandN ? [t.bandN.w, t.bandN.m, t.bandN.e] : []).map((p) => cell(p, 48)),
    bandW: (t.bandW || []).map((p) => cell(p, 48)),
    bandE: (t.bandE || []).map((p) => cell(p, 48)),
  };
});

const oreKinds = Object.keys(ORE_KINDS).map((key) => {
  const o = ORE_KINDS[key];
  return { key, decal: o.decal, name: o.name, gold: o.gold, mat: S(o.mat) };
});

const floorLv = Object.keys(FLOOR_LV).map((ch) => ({ ch, lv: FLOOR_LV[ch] }));
const climbCh = Object.keys(CLIMB_CH).map((ch) => ({ ch, kind: CLIMB_CH[ch] }));
const deckChars = Object.keys(DECK_CH).join('');

// ── The width law, per prop placement ───────────────────────────────────────
// The ONE SIZE FACT and where it comes from: the ladder height in
// prop-volume.js through the art's own aspect (check-volumes.mjs:103). Both
// the inputs and both answers ride, so a migration off an eyeballed width is
// provable rather than asserted.
function volRow(art, authoredW, count) {
  const v = PROP_VOL[art] || null;
  const a = ART[art] || null;
  const derived = (v && a) ? Math.round((v.form === 'lie' ? v.d : v.h) * (a.w / a.h) * 48) : NIL;
  const rung = v ? v.h / PLAYER_H : null;
  const snapped = rung == null ? null
    : LADDER.reduce((b, r) => (Math.abs(r - rung) < Math.abs(b - rung) ? r : b));
  return {
    art, count,
    // "" where the art carries no volume entry — the billboard allowlist
    // (check-volumes.mjs:71). No delve chart currently places one; a "" here
    // is a real gap, not a default.
    form: v ? v.form : '',
    hX1000: v ? K(v.h) : NIL,
    dX1000: v && v.d != null ? K(v.d) : NIL,
    midX1000: v && v.mid != null ? K(v.mid) : NIL,
    foldX1000: v && v.fold != null ? K(v.fold) : NIL,
    rungX1000: snapped == null ? NIL : K(snapped),
    artW: a ? a.w : 0, artH: a ? a.h : 0,
    artSheet: a ? S(a.sheet) : '',
    derivedW: derived,
    authoredW,
    // The tolerance check-volumes.mjs holds every chart to (±1px, W_TOL).
    lawful: derived === NIL ? false : Math.abs(authoredW - derived) <= 1,
  };
}

// ── One chart, derived ──────────────────────────────────────────────────────
function dumpChart(map, { probe = false, generated = false } = {}) {
  const grid = map.grid;
  const rows = grid.length, cols = grid[0].length;
  const model = makeLevelModel(grid);

  // The render grid the baker actually sees (delve.js:550).
  const rgrid = grid.map((row, y) => Array.from(row, (ch, x) => bakeChar(ch, x, y, model)).join(''));

  // The level model, cell by cell, row-major. surf0/surf1 pin surfacesAt
  // exactly — its length AND its values, which floor/deck alone cannot (a
  // deck with no headroom answers [deck], not [floor]).
  const floor = [], deck = [], surf0 = [], surf1 = [], under = [];
  const climb = [];
  for (let y = 0; y < rows; y++) {
    let crow = '';
    for (let x = 0; x < cols; x++) {
      floor.push(LV(model.floorAt(x, y)));
      deck.push(LV(model.deckAt(x, y)));
      const s = model.surfacesAt(x, y);
      surf0.push(s.length > 0 ? s[0] : NIL);
      surf1.push(s.length > 1 ? s[1] : NIL);
      under.push(model.underOK(x, y) ? 1 : 0);
      const ch = grid[y][x];
      crow += CLIMB_CH[ch] ? ch : '.';
    }
    climb.push(crow);
  }

  // THE STEP LAW, exhaustively over every orthogonal pair where both cells
  // have footing — refusals included (that is the law's whole point: a ledge
  // you cannot step onto answers nothing). From every surface the origin
  // offers, because a body under a bridge and a body on it are different
  // bodies asking the same question.
  const ORTH = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  const steps = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const from = model.surfacesAt(x, y);
      if (!from.length) continue;
      for (const [dx, dy] of ORTH) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        if (!model.surfacesAt(nx, ny).length) continue;
        for (const lv of from) steps.push({ fx: x, fy: y, lv, x: nx, y: ny, to: LV(model.pickSurface(lv, x, y, nx, ny)) });
      }
    }
  }

  // Every ore seam, named. The hash is the shared fact both lenses read
  // (delve-maps.js:304-310).
  const ore = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (grid[y][x] === 'o') ore.push({ x, y, kind: oreKindAt(x, y) });

  // Water: the overlay, and how deep it lies per connected body.
  const wet = wetCells(map);
  const depthMap = waterDepths(model, wet);
  const depths = [...depthMap.entries()].map(([k, d]) => {
    const [x, y] = k.split(',').map(Number);
    return { x, y, depthX1000: K(d) };
  });

  // validateMap's lint, off console.warn (the web's channel; the port returns
  // a list — DelveMaps.cs:980-1020).
  const warns = [];
  const realWarn = console.warn;
  console.warn = (...a) => warns.push(a.join(' '));
  let ragged = '';
  try { validateMap(map); } catch (e) { ragged = String(e.message || e); } finally { console.warn = realWarn; }

  // The width law, one row per distinct (art, authored w) on this chart.
  const byArt = new Map();
  for (const p of (map.props || [])) {
    const key = p.art + '|' + p.w;
    byArt.set(key, (byArt.get(key) || 0) + 1);
  }
  const vols = [...byArt.entries()].map(([key, count]) => {
    const at = key.lastIndexOf('|');
    return volRow(key.slice(0, at), Number(key.slice(at + 1)), count);
  });

  return {
    id: map.id, name: S(map.name), theme: map.theme, cols, rows,
    // propbench is GENERATED from PROP_VOL (delve-maps.js:577-623), so it
    // grows whenever a prop is authored — and it is deliberately absent from
    // the port (DelveMaps.cs:550-551): nothing routes there but the editor.
    generated,
    probe: !!probe,
    exitStairs: !!map.exitStairs,
    grid,
    entryX1000: K(map.entry[0]), entryY1000: K(map.entry[1]),
    props: (map.props || []).map((p) => ({
      art: p.art, x1000: K(p.x), y1000: K(p.y), w1000: K(p.w),
      // WHICH WAY IT IS TURNED. `facingAuthored` is what the chart wrote (NIL
      // where it wrote nothing — an absent facing and an authored 0 are the
      // same DRAWN fact but not the same authoring fact, and the port must not
      // be able to blur them); `facing` is what facingOf ANSWERS, which is the
      // number a lens draws at. They part company on a wall form, whose angle
      // comes from the wall and not from the chart.
      facingAuthored: typeof p.facing === 'number' && Number.isFinite(p.facing) ? Math.round(p.facing) : NIL,
      facing: facingOf(p),
      facingCls: facingClass(p.art),
      facingIdentity: !!facingIsIdentity(p),
      use: S(p.use), label: S(p.label),
      // RENDER-ONLY, dropped by the port (DelveMaps.cs:20-21): a CSS class,
      // the apothecary cauldron's only.
      cls: S(p.cls),
    })),
    portals: (map.portals || []).map((p) => ({
      x1000: K(p.x), y1000: K(p.y), cellX: Math.floor(p.x), cellY: Math.floor(p.y),
      to: p.to, atX1000: K(p.at[0]), atY1000: K(p.at[1]),
      enter: !!p.enter, stairs: !!p.stairs,
    })),
    spawns: (map.spawns || []).map((s) => ({ prey: s.prey, x: s.x, y: s.y })),
    water: (map.water || []).map(([x, y]) => ({ x, y })),
    locks: (map.locks || []).map(([x, y]) => ({ x, y })),
    paint: (map.paint || []).map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h, theme: S(r.theme) })),
    regions: (map.regions || []).map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h, theme: S(r.theme) })),
    rgrid, floor, deck, surf0, surf1, under, climb,
    steps, ore, depths, vols,
    warns, ragged,
  };
}

// ── THE PROBE — the vocabulary itself, not a chart claim ────────────────────
// Between them the shipped charts never author '3'..'6', never author a 'u'
// tunnel, and never stand a door or a key against a terrace, so the level
// vocabulary would be pinned only where somebody happened to use it. This
// grid uses every char the model reads, and it is marked `probe: true` so
// nothing mistakes it for a place.
const probeGrid = [
  '################',
  '#..^2345.....D.#',   // the terrace ladder, and a door at grade
  '#.LLLLLL.....K.#',   // a climb beside every rung (chained climbs, deliberately)
  '#..o.,,,,.o..o.#',   // veins at grade and in the trench
  '#....,uu,......#',   // a tunnel bored through the trench — ground under, deck over
  '#..3.,,,,.3....#',
  '#....nn........#',   // planks between two floors: a degenerate deck (drops to floor)
  '#....S.........#',
  '#..2S2.........#',   // a stair between two terraces
  '################',
];
const probeMap = {
  id: '__probe', theme: 'mine', name: 'Vocabulary probe',
  grid: probeGrid, entry: [2.5, 1.5], spawns: [], props: [], portals: [],
  water: [[5, 3], [6, 3], [7, 3], [8, 3]], locks: [[13, 1]], paint: [], regions: [],
};

// ── THE FACING LAW — the contract, not a chart claim ────────────────────────
//
// No shipped chart authors a facing (the field landed with the pack schema and
// the corpus migrated at 0, which is exactly why nothing moved). So a fixture
// that only wrote down per-prop facings would pin a field full of zeroes and
// catch nothing — the port could force every angle to 0, or normalise the wrong
// way round, and every assertion would still pass.
//
// This table asks the REAL prop-facing.js the two questions a lens could get
// wrong on its own, for every art the volume ladder knows:
//   · what CLASS is this art, and does facing mean anything for it;
//   · what does facingOf ANSWER at each of these angles — including a wall
//     form, which must answer 0 however hard the chart pushes.
// The angles are deliberately hostile: a full turn, more than a full turn,
// negatives (which JS's `%` leaves negative and C#'s leaves negative too, so
// both sides have to do the same +360 dance), and the compass points a
// FACING_STEP editor would actually produce.
const FACING_PROBE = [-450, -360, -180, -45, 0, 1, 44, 45, 90, 135, 180, 270, 359, 360, 405, 720];

// One id PROP_VOL has never heard of: facingClass's permissive branch answers
// 'card' rather than refusing, "because refusing to draw something is worse
// than drawing it unrotated" (prop-facing.js:45-47). An unknown art reaching a
// lens is a bug elsewhere; it must not be a crash here.
const FACING_ARTS = [...Object.keys(PROP_VOL).sort(), '__notAnArt'];

const facingLaw = FACING_ARTS.map((art) => ({
  art,
  cls: facingClass(art),
  matters: !!facingMatters(art),
  // facingOf's answer at each FACING_PROBE angle, in that order.
  answers: FACING_PROBE.map((f) => facingOf({ art, facing: f })),
  // facingIsIdentity at each, as 1/0 (fixture law: no bare booleans in arrays
  // — JsonUtility reads a bool[] but an int[] is what every other array here
  // is, and one shape is easier to trust than two).
  identity: FACING_PROBE.map((f) => (facingIsIdentity({ art, facing: f }) ? 1 : 0)),
  // The three ways a chart can carry NO angle at all. All three are 0: an
  // absent facing draws exactly as the art was drawn, which is the promise
  // that let the whole corpus migrate untouched.
  absent: facingOf({ art }),
  nulled: facingOf({ art, facing: null }),
  nan: facingOf({ art, facing: NaN }),
}));

// ── Run ─────────────────────────────────────────────────────────────────────
const chartIds = Object.keys(DELVE_MAPS);
const charts = [];
for (const id of chartIds) {
  const map = DELVE_MAPS[id];
  // 'campus' is a null PLACEHOLDER in the registry (delve-maps.js:777):
  // the estate is DERIVED per call by mapForLocale/buildCampusMap, and it is
  // pinned by campus-map-fixture.json / CampusMapTests.cs, not here.
  if (!map) continue;
  charts.push(dumpChart(map, { generated: id === 'propbench' }));
}
charts.push(dumpChart(probeMap, { probe: true }));

// Never a chart: the registry holds it as null and derives it per call
// (delve-maps.js:777, 1078-1080), and CampusMapTests.cs already pins it.
const fixtureDerived = chartIds.filter((id) => !DELVE_MAPS[id]);

const fixture = {
  // The registry's own key order, campus placeholder included — a chart added
  // to the middle of DELVE_MAPS is a change worth seeing.
  chartIds,
  derivedIds: fixtureDerived,
  swimDepthX1000: K(SWIM_DEPTH), fordDepthX1000: K(FORD_DEPTH), minClear: MIN_CLEAR,
  playerHX1000: K(PLAYER_H), ladderX1000: LADDER.map(K),
  floorLv, climbCh, deckChars,
  facingStep: FACING_STEP, facingProbe: FACING_PROBE, facingLaw,
  lights, themes, oreKinds,
  charts,
};

const out = process.argv[2] || join(ROOT, '..', '..', '..', '..', 'Guild Rancher',
                                    'Assets', 'Tests', 'EditMode', 'delve-fixture.json');
writeFileSync(out, JSON.stringify(fixture, null, 1));

const n = (f) => charts.reduce((a, c) => a + c[f].length, 0);
const registered = charts.filter((c) => !c.generated && !c.probe).length;
console.log(`fixture → ${out}`);
console.log(`${registered} registered charts + ${charts.length - registered} unregistered (the generated bench, the vocabulary probe);`
  + ` ${chartIds.length} registry ids of which ${fixtureDerived.length} derived (campus);`
  + ` ${themes.length} themes, ${lights.length} lights, ${oreKinds.length} ore kinds`);
console.log(`${n('grid')} grid rows, ${n('floor')} model cells, ${n('steps')} step-law rulings,`
  + ` ${n('props')} props / ${n('vols')} width derivations, ${n('portals')} portals, ${n('spawns')} spawns,`
  + ` ${n('ore')} ore seams, ${n('depths')} wet cells, ${n('locks')} locks, ${n('warns')} lint warnings`);
const unlawful = charts.flatMap((c) => c.vols.filter((v) => !v.lawful).map((v) => `${c.id}/${v.art} authored ${v.authoredW} vs derived ${v.derivedW}`));
console.log(unlawful.length ? `** WIDTHS OFF THE LADDER: ${unlawful.join(' · ')}` : 'every authored width derives from the ladder (±1px)');

const byCls = facingLaw.reduce((a, r) => ({ ...a, [r.cls]: (a[r.cls] || 0) + 1 }), {});
const turned = charts.flatMap((c) => c.props.filter((p) => p.facing !== 0).map((p) => `${c.id}/${p.art} ${p.facing}°`));
console.log(`facing law: ${facingLaw.length} arts × ${FACING_PROBE.length} angles `
  + `(${Object.entries(byCls).map(([k, n]) => `${n} ${k}`).join(', ')}); step ${FACING_STEP}°`);
console.log(turned.length ? `props turned off 0: ${turned.join(' · ')}`
  : 'no chart turns a prop yet — every placement draws as the art was drawn (facing 0)');
