/**
 * THE ESTATE, DERIVED AND WITNESSED — the fixture for Unity's CampusMap.
 *
 * `buildCampusMap()` (campus.js:333-408) is the one derivation that turns the
 * saved layout — nine buildings, ten trees, seven props — into the 46x46 chart
 * the Grounds are walked on, with every building's INTERIOR STAMPED INTO THE
 * SAME PLANE. There is no second copy of that grid anywhere: the walk and the
 * Build tab both read this function's output. So the port cannot be checked by
 * eye against a table — it has to be checked against the grid itself.
 *
 * This runs the REAL module (no lifting, no copies) and writes down:
 *   · the derived 46x46 grid AS 46 STRINGS — the whole contract of the port;
 *   · regions, facades (kind/name/roof/rect/door/roomed), portals, props, entry;
 *   · the BUILDING_KINDS / PROP_KINDS tables and each kind's derived footprint;
 *   · doorOf per placed building and a handful of canPlace rulings;
 *   · seventeen stationFor hands — every branch of "where is this member this
 *     week", including the two the switch falls THROUGH to.
 *
 * campus.js pulls art.js, which reads Vite's `import.meta.env`, so this runs
 * under the env hook like the other audits:
 *
 *     node --import ./dev/register-vite-env.mjs dev/dump-campus.mjs [outPath]
 *
 * Default out is the Unity repo's Assets/Tests/EditMode/campus-map-fixture.json
 * (the house path — dump-rooms.mjs:167). `outPath` overrides it, which is how
 * the port wave ran it: a lane may not write inside another repo's Assets.
 *
 * Fixture law: integers only (every fraction rides x1000), no nulls — an
 * absent string is "".
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const {
  CAMPUS_W, CAMPUS_H, BUILDING_KINDS, PROP_KINDS,
  buildCampusMap, ensureCampus, stationFor, doorOf, canPlace,
  kindWidth, kindHeight, roomOf, kindForMapId, doorstepOf,
} = await import(new URL('../src/guild/campus.js', import.meta.url));

const K = (v) => Math.round(v * 1000);          // the x1000 fixture rounding
const S = (v) => (v === undefined || v === null ? '' : String(v));

// ONE guild for the whole dump, so the grid and the stations agree about
// where the Forge stands (ensureCampus repairs in place — campus.js:153-177).
const guild = {};
const layout = ensureCampus(guild);
const map = buildCampusMap(guild);

// ── The tables ───────────────────────────────────────────────────────────────
const kinds = Object.entries(BUILDING_KINDS).map(([key, k]) => ({
  key, name: k.name, art: k.art, to: S(k.to), glyph: S(k.glyph),
  px: k.px, fracX1000: K(k.frac), cost: k.cost | 0, core: !!k.core, roof: k.roof,
  tilesW: kindWidth(key), tilesH: kindHeight(key),
  // roomOf's margin strip: the interior grid minus its void ring is the shape
  // that gets stamped (campus.js:85-96). Null for a roomless annex.
  roomId: S((roomOf(key) || {}).id), roomTheme: S((roomOf(key) || {}).theme),
  // The inverse of `to` (campus.js:314-317). Asked only of the roomed kinds:
  // kindForMapId(null) matches the FIRST roomless annex, which is a quirk of
  // an unasked question, not a fact worth pinning.
  mapIdBack: k.to ? S(kindForMapId(k.to)) : '',
}));

const propKinds = Object.entries(PROP_KINDS).map(([key, k]) => ({
  key, name: k.name, art: k.art, glyph: S(k.glyph), w: k.w, cost: k.cost | 0,
}));

// ── The saved layout (the minimal state — campus.js:108-138) ────────────────
// `baseRow`, not `base`: the fixture is read back through a C# class, and
// `base` is a keyword there.
const buildings = layout.buildings.map((b) => ({ id: b.id, kind: b.kind, x: b.x, baseRow: b.base }));
const trees = layout.trees.map(([x, y]) => ({ x, y }));
const layoutProps = layout.props.map((p) => ({ id: p.id, kind: p.kind, x1000: K(p.x), y1000: K(p.y) }));

// ── The derivation ───────────────────────────────────────────────────────────
const regions = map.regions.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h, theme: r.theme }));

// The facade print, plus its BUILDING_KINDS key: facades ride in building order
// (campus.js:404 maps the same array), so the key is the layout's own.
const facades = map.facades.map((f, i) => ({
  kind: layout.buildings[i].kind,
  art: f.art, name: f.name, roof: f.roof,
  x: f.x, y: f.y, w: f.w, h: f.h, px: f.px,
  doorX: f.door[0], doorY: f.door[1], roomed: !!f.roomed,
}));

// A stamped stair keeps to/at/enter and DROPS the interior's `stairs` flag
// (campus.js:368). Cells, not centres: every authored portal is on a cell
// centre, so floor() is lossless — the Unity DelvePortal carries ints.
const portals = map.portals.map((p) => ({
  x: Math.floor(p.x), y: Math.floor(p.y), to: p.to,
  atX1000: K(p.at[0]), atY1000: K(p.at[1]),
  enter: !!p.enter, exitStairs: !!p.stairs,
}));

const props = map.props.map((p) => ({
  art: p.art, x1000: K(p.x), y1000: K(p.y), w1000: K(p.w),
  use: S(p.use), label: S(p.label),
}));

const doors = layout.buildings.map((b) => {
  const d = doorOf(b);
  const step = doorstepOf(guild, b.kind) || { x: 0, y: 0 };
  return { kind: b.kind, x: d[0], y: d[1], stepX1000: K(step.x), stepY1000: K(step.y) };
});

// ── canPlace rulings (campus.js:192-215) ─────────────────────────────────────
const placements = [
  ['storehouse', 34, 20],   // open ground east of the Armory — legal
  ['storehouse', 0, 20],    // past the west wall
  ['storehouse', 36, 44],   // past the south wall (base > H-3)
  ['storehouse', 2, 10],    // over the Library's own footprint
  ['watchtower', 11, 42],   // its door falls on column 13, in the gate lane
].map(([kind, x, base]) => {
  const r = canPlace(guild, kind, x, base);
  return { kind, x, baseRow: base, ok: !!r.ok, why: S(r.why) };
});

// ── stationFor: every branch (campus.js:256-309) ────────────────────────────
// `label` names the branch; type/trainingId/injured are the WEB assignment
// vocabulary, which is the vocabulary the port's StationForDuty speaks.
const hands = [
  ['no member at all', null],
  ['the Guildmaster — no assignment, no condition', { }],
  ['injured', { condition: { injury: { kind: 'strained', weeksLeft: 2 } } }],
  ['injured while assigned to the Forge — hurt outranks the plan',
    { assignment: { type: 'forge' }, condition: { injury: { kind: 'torn', weeksLeft: 5 } } }],
  ['forge', { assignment: { type: 'forge' } }],
  ['brew', { assignment: { type: 'brew' } }],
  ['cook', { assignment: { type: 'cook' } }],
  ['study', { assignment: { type: 'study' } }],
  ['enchant', { assignment: { type: 'enchant' } }],
  ['quest', { assignment: { type: 'quest' } }],
  ['hunt', { assignment: { type: 'hunt' } }],
  ['train · rest', { assignment: { type: 'train', trainingId: 'rest' } }],
  ['train · spar', { assignment: { type: 'train', trainingId: 'spar' } }],
  ['train · pow', { assignment: { type: 'train', trainingId: 'pow' } }],
  ['train · int', { assignment: { type: 'train', trainingId: 'int' } }],
  ['unknown type · pow — falls past the switch AND past train', { assignment: { type: 'mystery', trainingId: 'pow' } }],
  ['no type · spar — the trainingId check sits OUTSIDE the switch', { assignment: { trainingId: 'spar' } }],
  ['forge while ALSO carrying a trainingId — the switch returns first',
    { assignment: { type: 'forge', trainingId: 'spar' } }],
];

const stations = hands.map(([label, member]) => {
  const a = (member && member.assignment) || {};
  const st = stationFor(guild, member);
  return {
    label,
    type: S(a.type), trainingId: S(a.trainingId),
    injured: !!(member && member.condition && member.condition.injury),
    x1000: K(st.x), y1000: K(st.y), why: st.why,
    // The cell the station stands on, so the port lands on the same character.
    // WORTH KNOWING: cook/study/enchant answer "the middle of the floor"
    // (campus.js:279) and the middle of those three rooms is the counter run,
    // the aisle stacks and the weapon racks — a 'b' low block, which BLOCKING
    // stops a body on. That is the web's own answer, so it is pinned rather
    // than quietly corrected here.
    cell: map.grid[Math.floor(st.y)][Math.floor(st.x)],
  };
});

// ── Write ────────────────────────────────────────────────────────────────────
const fixture = {
  w: CAMPUS_W, h: CAMPUS_H,
  id: map.id, theme: map.theme, name: map.name,
  entryX1000: K(map.entry[0]), entryY1000: K(map.entry[1]),
  gateX: 13, gateY: CAMPUS_H - 3,             // campus.js:383 — the way back to the desk
  grid: map.grid,
  kinds, propKinds,
  buildings, trees, layoutProps,
  regions, facades, portals, props, doors, placements, stations,
};

const out = process.argv[2] || join(ROOT, '..', '..', '..', '..', 'Guild Rancher',
                                    'Assets', 'Tests', 'EditMode', 'campus-map-fixture.json');
writeFileSync(out, JSON.stringify(fixture, null, 1));
console.log(`fixture → ${out}`);
console.log(`${fixture.grid.length}x${fixture.grid[0].length} grid, ${regions.length} regions, ${facades.length} facades,`
  + ` ${portals.length} portals, ${props.length} props, ${doors.length} doors,`
  + ` ${placements.length} placement rulings, ${stations.length} stations`);
