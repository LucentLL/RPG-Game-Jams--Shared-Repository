/**
 * @file The Delve in FIRST PERSON — the same maps, stood inside instead of over.
 *
 * A PARALLEL MODE, not a replacement. It reads the very same ASCII charts
 * delve.js walks (delve-maps.js), takes the very same hooks object — locale,
 * fight, onKill, onOre, onEnd — and pays the same spoils through the same battle
 * bridge. hall.js can open either opener with one identical call, which is what
 * makes this a second VIEW of the delve rather than a second delve.
 *
 * The renderer is the top-down one turned to face the wall. delve.js already
 * proved the hard part: textured quads folded in real CSS 3D under a perspective,
 * backfaces hidden, painter's order by depth. A corridor is that machinery aimed
 * forward — wall panels at rotateY(±90°), a floor and a ceiling at rotateX(±90°),
 * and the WORLD counter-transformed about the walker instead of a camera moving
 * through it.
 *
 * Movement is grid-locked with 90° turns (Wizardry / Etrian, which is what a
 * handheld crawler is), but interpolated, so a step reads as a stride rather than
 * a jump cut. Geometry is rebuilt only when the walker changes CELL — never per
 * frame — so the loop does nothing but move a transform and a few billboards.
 *
 * Deliberately unhandled: `regions` (the campus's per-room themes). The estate is
 * a place you look at from above; the delve is a place you are inside.
 */
import { ART_BASE } from '../config/assets.js';
import { THEMES, LIGHTS, DECALS, ORE_KINDS, oreKindAt, mapForLocale, validateMap, makeLevelModel, DECK_CH } from './delve-maps.js';
import { preyById } from './locales.js';
import { loadImg, SHEET_URLS } from './delve.js';
import { ART, artSprite, artCropCss, artTexRect, WORN, wornWeapon, wornShield, wornPick } from './art.js';
import { propVolume, propCell, footprint, REST_SLOP, PLAYER_H } from './prop-volume.js';
import { icon } from './icons.js';
import { createLook, readPad, padReset, touchPrimary, onTouchPrimary, PAD } from '../platform/input.js';
import { claimPad } from '../platform/ui-pad.js';
import { perspectiveFor, camLean, onView, view, vpStatus } from '../platform/view-prefs.js';
import { extrudeSprite, extrudePlan } from '../platform/voxel-sprite.js';
import { createGlWorld } from '../platform/gl-world.js';

/**
 * World scale. These look arbitrary and are not: what a surface MEASURES on
 * screen is `size · d/(d + distance)`, so the apparent size of the dungeon is
 * set by the ratio of the tile to the perspective distance, while the FIELD OF
 * VIEW is set by that distance against the stage height. Both have to be chosen.
 *
 * d = 470 gives ~75° vertical on a 720px stage — a crawler's lens, not a
 * fisheye. A tile of 900 then puts the wall you are facing (half a tile off the
 * eye) at ~90% of the screen and a wall three cells out at ~26%, which is the
 * falloff a corridor needs to read as depth. The first cut used a 64px tile
 * against the same lens and drew that same far wall 39px tall on a 1280px
 * screen — geometrically perfect and completely unreadable.
 */
/**
 * WORLD UNITS vs RASTER MEMORY. The framing was tuned at T=900, but layout px
 * are what the compositor records and rasters: at 900 one wall face is a
 * 900×1260 layer, a phone pays it again at devicePixelRatio², and ~300 of them
 * is how tiles simply stop being drawn (the playtest's missing floor).
 * Shrinking the UNIT and growing the world scale by the same factor is a
 * similarity — the screen image is identical (fitLens carries the factor:
 * lens ÷ K, perspective untouched) — but every raster is K² the memory.
 * Every world-px constant below carries ×K so the tuned ratios survive
 * verbatim; nothing about the framing is being re-decided here.
 */
const T = 300;           // world px per tile
const K = T / 900;       // ratio to the scale this view was TUNED at
const WALL_H = 1260 * K; // full wall height — 1.4 tiles reads best
const LOW_H = 560 * K;   // 'b' — waist-high, seen over
const EYE = 690 * K;     // eye height above the floor
const STEP_PX = 430 * K; // one level of ledge, in world px
/** How fast a held turn key swings the view, rad/s — the arena's number, and
 *  the crawler's now too. The eighth-turn it replaces was 45° in 130ms, about
 *  6.0 rad/s: a snap rather than a turn, fine as one discrete action per stride
 *  and far too quick to steer with. */
const TURN_RATE = 3.1;

/**
 * THE LENS, AND WHY IT HAS TO MOVE WITH THE WINDOW.
 *
 * `perspective` is a distance in CSS pixels, but the stage's height is not
 * fixed — so a lens tuned at 720px tall opens up on every larger screen.
 * Vertical FOV is 2·atan((stageH/2)/d): at 720 the shipped 470 gave 75°, and at
 * 1030 the SAME 470 gives 95.5°. That is the "warp speed" — a fisheye that
 * arrives purely because the window got bigger, and with it every surface
 * losing a third of its screen share.
 *
 * Fixing the FOV alone is not enough: hold d constant against the world and the
 * apparent size of the dungeon changes with the window instead. Both stay put
 * only if the whole world scales with the stage TOO, so the projection is a
 * similarity — d, T, WALL_H and every offset multiplied by the same s. Then
 * `WALL_H·d/((d+D)·stageH)` has s in both halves and cancels.
 *
 * PERSP is measured against PERSP_AT. 500 is a slightly longer lens than the
 * 470 this shipped with (71.6° rather than 75.1°) — the corridor still opens
 * out ahead of you, with less of the rush past the walls.
 */
const PERSP = 500, PERSP_AT = 720;
/**
 * How far out geometry is BUILT — derived from the light, never guessed.
 *
 * The cull and the view radius are the same decision seen from two sides: a
 * surface is dropped once the fog has taken it (FOG_CULL), so the radius has to
 * be at least the distance at which that happens, or the world stops at a hard
 * edge with unfogged rock hanging in mid-air. Measured in the meadow before the
 * lights were retuned: fog reached only 0.41 by the edge of the build.
 *
 * Capped, because the cost of a scene is this number squared, and no light is
 * allowed to quietly ask for a thousand quads.
 */
/**
 * The LIGHT TIER. A phone pays for this scene at devicePixelRatio² — the same
 * quad rasterises 7-9× the pixels at dpr 3 — and a tile GPU pays again for
 * every blur-radius filter. So coarse-pointer / high-dpr devices get a shorter
 * lamp and no decorative filters (body.fp-lite in delve.css). The cap and
 * FOG_CULL still move TOGETHER — fitViewRadius derives the fog FROM the radius
 * it settles on precisely so the two cannot drift, because the moment they do
 * you get unfogged rock hanging at the build edge.
 */
const COARSE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
/** Open-air maps see a VISTA, underground ones a lamp's reach — so the cap is
 *  the light's, not one number. The sky tiers are bounded in practice by the
 *  meadow charts themselves (a build radius past the map edge costs nothing),
 *  and phones still take the shorter lamp everywhere. */
/**
 * ON AN OPEN MAP THE COST IS LAYER COUNT, NOT TEXTURE SIZE.
 *
 * Underground, most of a view radius is solid rock that emits nothing — a
 * corridor at R=9 is a few dozen quads. Out on the estate almost every cell in
 * range is open ground, and open ground used to emit a floor quad each: R=11 is
 * a 23×23 window, ~500 floor quads before a single wall, and at R=17 it
 * measured 629 live quads. Each one is a separate compositing layer the GPU has
 * to hold, sort and re-raster whenever the camera moves, and a phone falls over
 * on the COUNT long before the pixels — which is why the estate flickered a
 * step at a time while the 9×9 arena, at eighty quads, did not.
 *
 * That is attacked at the source now: clear ground merges into blocks and wall
 * faces merge along their runs (@see CHUNK), and the half-space behind the
 * camera is not built at all. `node --import ./dev/register-vite-env.mjs
 * dev/check-drawdist.mjs` censuses the real charts, worst of eight bearings:
 *
 *   | chart      | tier    | was        | now         |
 *   |------------|---------|------------|-------------|
 *   | estate     | desktop | R13 /  876 | R30 /  1463 |
 *   | estate     | phone   | R8  /  387 | R9  /   247 |
 *   | Ferncreek  | desktop | R13 /  371 | R24 /   216 |
 *   | Ferncreek  | phone   | R8  /  191 | R20 /   196 |
 *   | arena      | desktop | R13 /  380 | R19 /   137 |
 *   | arena      | phone   | R8  /  359 | R19 /   135 |
 *   | Hollowvein | both    | R7  /  232 | unchanged   |
 *
 * On a phone the meadow sees two and a half times as far for the same layers
 * and the arena more than twice as far for a THIRD of them, both whole-map now.
 * The estate is the chart that cannot: it is forty-six rows of buildings, a
 * wall run cannot merge past a corner, and its stamped rooms each carry their
 * own surface set so the ground cannot merge across a threshold either. There
 * the win is spent on being STABLE instead — much the same reach for 36% fewer
 * layers — which is the bug that was actually reported.
 *
 * This cap is only a RUNAWAY STOP now; the number that binds is a layer budget.
 * It was 20/30 for one build and that was still a wall — Ferncreek and the
 * arena hit it with a third of their budget unspent, so the cap was quietly
 * deciding the draw distance again. Set it past anything a chart can use (the
 * estate is 46 rows, and R is separately clamped to the chart's own span) and
 * let the measurement do the deciding.
 * @see LAYER_BUDGET, fitViewRadius.
 */
const viewCap = () => (L.sky ? (COARSE ? 32 : 48) : (COARSE ? 12 : 16));
/* The radius itself is no longer a formula but a MEASUREMENT, taken once per
   chart against a layer budget — @see fitViewRadius, which is where the cap
   above and FOG_CULL now meet. `F.viewR` is its answer for the live map. */
const REACH = 0.75;      // how close a creature must be to engage

/**
 * DEPTH. Without it the far end of the map is drawn as brightly as the wall you
 * are touching: the corridor reads flat, every surface in the chart is painted
 * at once, and the fill cost is the whole map every frame. The vignette darkens
 * the screen's EDGES, which is not the same thing and never was.
 *
 * Fog is a fraction of the way to FOG_RGB, by distance in tiles. Past FOG_CULL
 * a surface is indistinguishable from the stage's own background, so it is not
 * emitted at all — which is the draw distance, arrived at honestly rather than
 * as a hard circle you can see the edge of.
 */
const FOG_CULL = COARSE ? 0.90 : 0.96;
/** The light this map is under, chosen by its theme (delve-maps LIGHTS). */
let L = LIGHTS.dark;
/* Creatures go into the dark BEFORE the room does (L.sprite). A monster is the
   one thing you can pick out of a dim corridor at any distance, so under a torch
   it must be taken by the dark sooner than the walls it stands between, or the
   mine reads as a lit diorama with things loitering at the back. In open air
   that barely applies — which is why the number belongs to the light. */
/** The veil is painted in the light's own colour (`--fp-fog`, set on mount to
 *  the same rgb the stage background gets) — so a surface that has faded out
 *  entirely and one that was never drawn are indistinguishable: black
 *  underground, pale daylight in the open. */

/**
 * How tall a creature STANDS, in world px, by rank — the one number that
 * decides whether the delve is inhabited or infested with specks.
 *
 * The old cut scaled the sheet frame by a flat 1.9, which made an Old Delver
 * (a 108px frame) 205px tall in a world whose ceiling is 1260 and whose eye is
 * at 690: a human skeleton came up to your ankle, and at two and a half tiles
 * measured 35px on a 720px stage. Sizing by rank instead of by sheet means the
 * art's own resolution stops deciding how big the monster is. 760 is your own
 * height (eye 690, so the top of your head is near there); a Slime Sovereign
 * at 1080 fills the corridor to the ceiling, which is what a sovereign is for.
 */
// Rank 3 IS the player's height — the same fact prop-volume.js's ladder hangs
// every furnishing on, spelled once (760/900 tiles) and multiplied out here.
const CREATURE_H = { 1: 320 * K, 2: 470 * K, 3: PLAYER_H * T, 4: 900 * K, 5: 1080 * K };
/**
 * Standing scenery, in world px tall. Sized to the fact that in FIRST PERSON a
 * prop blocks its WHOLE cell (blocked() consults PROP), where the top-down walk
 * only blocks the shallow slice its art rests on — so a boulder here really is
 * the width of the passage, and drawing it knee-high would be a lie about what
 * you just walked into. Everything stays under WALL_H so nothing pierces the roof.
 */
const DECOR_H = { boulder: 700 * K, boulderGray: 700 * K, stalagTall: 1100 * K, cart: 780 * K, tree: 1150 * K };
/**
 * One swing, and how far it reaches.
 *
 * MELEE is shared by BOTH sides on purpose. It used to be 1.9 for you and 1.10
 * for them, and creatures have no pathfinding — so anything that wedged itself
 * on a boulder or the far side of a block sat in the gap between the two
 * numbers, where every blow of yours landed and none of its could reach. That
 * is a free kill for full spoils, and it bypasses the entire risk economy the
 * health ceiling and the potions exist to create. One number, both ways.
 */
const SWING_MS = 380, MELEE = 1.25, SWING_CONE = 0.3;

/**
 * FIRST-PERSON COMBAT — Morrowind's contract, not the arena's.
 *
 * You aim and time the blow yourself; whether it LANDS is a roll, and the roll
 * is made of the same numbers the rest of the game already uses. `hooks.power`
 * is the member's ↯ (heroPower + gear) and `prey.power` is the recommended
 * party power — the very ratio `huntOdds` prints on the hunt card — so a fight
 * the Wilds room calls Grim rolls Grim, and no second economy is invented here.
 * A kill still pays through `hooks.onKill`, which still runs `resolveHuntPlayed`
 * in hall.js: the spoils are byte-identical to the arena's, because they always
 * were the arena's only contribution.
 *
 * Health is on a flat 0..100 scale for both sides so the ratio is the only
 * thing that varies. It does NOT come back fully between fights: out of contact
 * you recover to a ceiling that drops with every bout, which is what makes a
 * delve a question of how deep to push rather than a corridor you farm.
 */
const HP_MAX = 100;
const HIT_FLOOR = 0.20, HIT_CEIL = 0.92;   // no fight is ever certain, either way
const DMG_BASE = 10;                        // ~10 landed blows at an even match
const FOE_SWING_MS = 1150;                  // how often a creature in reach tries
/** The wind-up you can read and answer. A blow that arrives with no warning is
 *  not a blow you can guard — it is a die roll wearing a costume. */
const WINDUP_MS = 430;
/** Being hit knocks a creature out of what it was doing. This is the window a
 *  second blow lands in, and the reason pressing the attack is a real tactic. */
const STAGGER_MS = 260;
/** How far a thing notices you from, by rank — with line of sight, so rock is
 *  rock. A Sovereign knows the room it is in; a squirrel finds out late. */
const NOTICE = { 1: 3.0, 2: 4.0, 3: 5.5, 4: 6.5, 5: 7.5 };
/** How long a body takes to go down, and how many the room keeps. */
const DEATH_MS = 520, CORPSE_CAP = 14;
/**
 * A creature's blow carries the whole period between its blows — its cooldown
 * AND its wind-up — or the fight is decided by cooldowns rather than by ↯.
 * Without the rate term an EVEN match on the hunt card, where huntOdds prints
 * 50%, was a walkover in the corridor at nearly four times the damage per
 * second; and adding a 430ms telegraph on top would have quietly handed back
 * another 27% on that. Declared AFTER the two it reads: a const in the temporal
 * dead zone is a ReferenceError at module load, and it takes the delve with it.
 *
 * The 0.7 is a deliberate edge left to the delver: alone, a long way in, and the
 * only one of the two who can retreat, guard, or drink.
 */
const FOE_DMG = DMG_BASE * ((FOE_SWING_MS + WINDUP_MS) / SWING_MS) * 0.7;
const BLOCK_CUT = 0.55, BLOCK_EVADE = 0.22; // a raised shield: less damage, more misses
/** Things that fly: how fast, how far a bow carries, how near counts as a hit,
 *  and how close a thing that fights at range is willing to be dragged. */
const SHOT_SPEED = 10, BOW_RANGE = 7.5, SHOT_HIT_R = 0.5;
const RANGED_MIN = 2.2, RANGED_MAX = 7, RANGED_MS = 1900;
const REGEN_PER_S = 7, REGEN_DELAY = 2.2;   // out of contact, you catch your breath
const REGEN_COST = 8, REGEN_FLOOR = 40;     // and every bout lowers the ceiling

/** Cells that are a full wall you cannot see over. 'o' is an ore face — a wall
 *  made of the thing you want, which is why you mine it by walking into it. */
const WALL = { '#': 1, B: 1, F: 1, o: 1 };
/** Waist-high: blocks the step, does not block the view. */
const LOW = { b: 1 };
/** Standing props — the floor stays open under them and they draw as billboards. */
const PROP = { r: 1, t: 1, m: 1, f: 1 };
/** Ways out of the map entirely. */
const EXIT = { s: 1, w: 1, d: 1 };

/** @type {?Object} the live session (null when no first-person delve is running) */
let F = null;
let opening = false;
/** Is the first-person delve open (or mid-open)? hall.js gates on this. */
export function isDelveFpOpen() { return !!F || opening; }

// ---------------------------------------------------------------------------
// Screen plumbing
// ---------------------------------------------------------------------------

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}
const screenActive = () => {
  const el = document.getElementById('delveFpScreen');
  return !!el && el.classList.contains('active');
};

// The crawler's twin of delve.js's claim: while it is being walked the pad is
// the walker's, and the moment it ends the summary card becomes a menu again.
claimPad(() => !!F && screenActive() && !F.ended && !F.transiting);

// ---------------------------------------------------------------------------
// Textures — one panel per surface, cut from the theme the map already names
// ---------------------------------------------------------------------------

/**
 * Draw a source rect onto a canvas OF THE SOURCE'S OWN SIZE and hand back the
 * canvas. `dim` darkens it, which is how the ceiling is made out of the floor.
 *
 * Native size, deliberately. The first cut baked every surface out at WORLD
 * size — a 48×96 rock face blown up to 900×1260 — which buys nothing, because
 * the quads are `background-size: 100% 100%` under `image-rendering: pixelated`
 * and the browser does exactly the same nearest-neighbour upscale for free.
 * What it cost was 29.7MB of texture against 1.17MB for the identical pixels,
 * on a scene that is already several hundred composited 3D layers.
 */
function panel(img, sx, sy, sw, sh, dim) {
  const c = document.createElement('canvas');
  c.width = sw; c.height = sh;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  if (dim) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = `rgba(0,0,0,${dim})`; g.fillRect(0, 0, sw, sh); }
  return c;
}

/**
 * The four surfaces this theme needs, as data URIs.
 *
 * A theme with `walls` (the guild's rooms) already carries a head-on wall face —
 * that is exactly what a first-person panel is, so it is used as authored. A
 * theme without one (the mine, the meadow) has its cliff FACE tiles instead, and
 * those are head-on rock, which is the same thing by another name.
 */
/** Where the seams sit on an ore face: [across, down, size], as FRACTIONS of
 *  the face. Three clusters, off-centre, so no two faces line up. */
const VEIN = [[0.50, 0.50, 0.333], [0.23, 0.74, 0.222], [0.76, 0.28, 0.200]];
/** The light each ore throws — a seam has to be findable from down a corridor. */
const ORE_GLOW = { iron: '200,178,140', copper: '224,138,60', silver: '206,224,236', crystal: '110,231,200' };
/** The ore face is baked at 4× the rock's own resolution: an integer multiple,
 *  so the wall behind the seam stays pixel-identical to every other wall, while
 *  the vein and its glow have somewhere to live. */
const ORE_SCALE = 4;

/** One ore face: the wall, with the vein you are actually going to be paid for
 *  worked into it at a size the eye can find. The first cut pasted a single
 *  48px cluster onto a 900×1260 face — 0.2% of the wall, and invisible past a
 *  tile — and pasted the IRON cluster whatever the cell really paid. */
function bakeOreFace(wallCv, ores, kind) {
  const d = DECALS[ORE_KINDS[kind].decal];
  const W = wallCv.width * ORE_SCALE, H = wallCv.height * ORE_SCALE;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(wallCv, 0, 0, wallCv.width, wallCv.height, 0, 0, W, H);
  const glow = ORE_GLOW[kind] || ORE_GLOW.iron;
  for (const [fx, fy, fs] of VEIN) {
    const cx = fx * W, cy = fy * H, size = fs * W;
    g.save();
    g.globalCompositeOperation = 'lighter';
    const grd = g.createRadialGradient(cx, cy, 0, cx, cy, size);
    grd.addColorStop(0, `rgba(${glow},0.42)`);
    grd.addColorStop(1, `rgba(${glow},0)`);
    g.fillStyle = grd;
    g.fillRect(cx - size, cy - size, size * 2, size * 2);
    g.restore();
    g.drawImage(ores, d.x, d.y, d.w, d.h, cx - size / 2, cy - size / 2, size, size);
  }
  return cv;
}

/** Once a hidden tab's rasteriser misses one toBlob deadline, stop asking. */
let _blobOk = true;

async function cutSurfaces(theme, opts = {}) {
  const need = new Set(['cliffs', theme.sheet, theme.walls && theme.walls.sheet].filter(Boolean));
  if (opts.plank) need.add('woodwall');   // bridge decks are planked
  const sheets = {};
  for (const k of need) sheets[k] = await loadImg(SHEET_URLS[k] || (SHEET_URLS.cliffs));
  const src = theme.src || 48;
  const fill = theme.fill[0];
  const floorImg = sheets[theme.sheet || 'cliffs'];
  // The floor/ceiling dim is baked HERE, not applied as a CSS filter: a filter
  // gives every quad its own offscreen GPU buffer, and floors+ceilings are 75%
  // of a scene — that alone was the mobile frame budget. 0.08 reproduces the
  // old brightness(0.92); 0.73 reproduces the old baked 0.55 × brightness(0.6).
  const floor = panel(floorImg, fill[0] * src, fill[1] * src, src, src, 0.08);
  const ceil = panel(floorImg, fill[0] * src, fill[1] * src, src, src, 0.73);
  // The waist-high blocks' lids were floor-lit (0.45 × brightness 0.92 ≈ 0.41),
  // not ceiling-dark — reusing the ceil bake for them turned every aisle-stack
  // top into a shadowed hole.
  const lid = panel(floorImg, fill[0] * src, fill[1] * src, src, src, 0.586);
  // A deck's UNDERSIDE is its own bake even where the pixels could match the
  // ceiling's: the third-person camera drops ceiling quads by TEXTURE
  // IDENTITY, and a bridge that vanishes over the shoulder is a hole. Planks
  // for 'n' bridges ride along when the map asked for them.
  const deckUnder = panel(floorImg, fill[0] * src, fill[1] * src, src, src, 0.68);
  const plank = opts.plank && sheets.woodwall
    ? panel(sheets.woodwall, 3 * 48, 0, 48, 48, 0.12) : null;
  // BELOW-GRADE risers (a creek's bank, a trench wall) are cut earth — the
  // kit's own rock face — never the hedge/aisle texture a raised ledge wears:
  // on a sky map SC.low is a row of tree trunks, and a creek walled with
  // hedges is a maze, not a stream bed.
  const bank = panel(sheets.cliffs, theme.faceTop.m[0] * 48, theme.faceTop.m[1] * 48, 48, 48, 0.15);

  // Kept as CANVASES, not data URIs: the ore faces are the wall with a seam in
  // it, and re-decoding a data URI four times to paint on it is a round trip
  // through the image loader for no reason.
  const wallCv = document.createElement('canvas');
  const lowCv = document.createElement('canvas');
  const paint = (cv, img, sx, sy, sw, sh) => {
    cv.width = sw; cv.height = sh;
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  };
  if (theme.walls) {
    const w = sheets[theme.walls.sheet], r = theme.walls.tall, l = theme.walls.low;
    paint(wallCv, w, r[0], r[1], r[2], r[3]);
    paint(lowCv, w, l[0], l[1], l[2], l[3]);
  } else {
    // Two cliff-face tiles stacked make one wall the height of the drop.
    const cliffWall = () => {
      const c = document.createElement('canvas');
      c.width = 48; c.height = 96;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      const put = (t, dy) => g.drawImage(sheets.cliffs, t[0] * 48, t[1] * 48, 48, 48, 0, dy, 48, 48);
      put(theme.faceTop.m, 0); put(theme.faceBot.m, 48);
      paint(wallCv, c, 0, 0, 48, 96);
      paint(lowCv, c, 0, 0, 48, 48);
    };
    let walled = false;
    if ((LIGHTS[theme.light] || {}).sky) {
      // OPEN AIR: the rim of a meadow is a FOREST EDGE, not a rock shaft —
      // the playtest read the cliff-faced ravines as "trapped in a dirt
      // hole". Built the way the sheet was authored to build one: the dark
      // canopy FILLER as the backdrop, the bright crown mass over it, and the
      // trunk row at the ground — never the fillers alone as "trees".
      try {
        const tree = await loadImg(ART_BASE + 'tree_3x.png');
        const c = document.createElement('canvas');
        c.width = 96; c.height = 192;
        const g = c.getContext('2d');
        g.imageSmoothingEnabled = false;
        // Opaque base so the wall never shows fog rectangles through leaf gaps.
        g.fillStyle = '#1a2812';
        g.fillRect(0, 0, 96, 192);
        g.drawImage(tree, 96, 144, 96, 96, 0, 0, 96, 96);    // dark canopy backdrop
        g.drawImage(tree, 0, 144, 96, 96, 0, 96, 96, 96);    // the trunk row at the ground
        g.drawImage(tree, 96, 0, 96, 120, 0, 0, 96, 120);    // bright crown over both
        g.fillStyle = 'rgba(18, 28, 10, 0.45)';
        g.fillRect(0, 182, 96, 10);                          // shadowed foot on the grass
        paint(wallCv, c, 0, 0, 96, 192);
        // Waist-high runs are the trunk band alone — a hedge you see over.
        const lo = document.createElement('canvas');
        lo.width = 96; lo.height = 96;
        const lg = lo.getContext('2d');
        lg.imageSmoothingEnabled = false;
        lg.fillStyle = '#1a2812';
        lg.fillRect(0, 0, 96, 96);
        lg.drawImage(tree, 0, 144, 96, 96, 0, 0, 96, 96);
        paint(lowCv, lo, 0, 0, 96, 96);
        walled = true;
      } catch (e) {
        console.warn('delve-fp: tree sheet missing — the rim stays rock', e);
      }
    }
    if (!walled) cliffWall();
  }
  let ores = null;
  // Region themes never carry seams — baking four 4×-scale ore faces per
  // stamped room was most of the campus's open time.
  if (opts.ores !== false) {
    try {
      const oreImg = await loadImg(SHEET_URLS.ores);
      ores = {};
      for (const kind of Object.keys(ORE_KINDS)) ores[kind] = bakeOreFace(wallCv, oreImg, kind);
    } catch (e) {
      console.warn('delve-fp: ore sheet missing — seams will read as plain rock', e);
    }
  }
  let rail = null;
  try {
    const railImg = await loadImg(SHEET_URLS.rails);
    const d = DECALS.railH;
    const cv = document.createElement('canvas');
    cv.width = d.w; cv.height = d.w;             // a square tile at the rail's own resolution
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(railImg, d.x, d.y, d.w, d.h, 0, (d.w - d.h) / 2, d.w, d.h);
    // The same 0.08 dim the floor is baked with — a rail lies ON the floor and
    // must share its light, or it reads brighter than the ground it sits on.
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(0,0,0,0.08)';
    g.fillRect(0, 0, cv.width, cv.height);
    rail = cv;
  } catch (e) { /* a map without rails simply has none */ }
  /**
   * Blob URLs, not data URIs. A data URI IS the bytes, re-parsed out of every
   * style string that names it — the ore faces run to hundreds of KB and there
   * are four of them per map. A blob URL is a constant-length handle to bytes
   * decoded once. `_urls` rides along so mount() can revoke the outgoing map's
   * set when a portal swaps the scene.
   */
  const urls = [];
  // toBlob's callback comes off the rasteriser, and a HIDDEN tab's rasteriser
  // may simply never run it (measured: prep() hung forever in a background
  // pane). One timeout is allowed to discover that, then the whole session
  // falls back to the synchronous data-URI path — bigger strings, but a delve
  // that opens beats one that waits on a compositor that is not coming.
  const urlOf = (cv) => new Promise((resolve) => {
    if (!_blobOk) { resolve(cv.toDataURL()); return; }
    let done = false;
    const settle = (u, viaBlob) => { if (!done) { done = true; if (!viaBlob) _blobOk = false; resolve(u); } };
    try {
      cv.toBlob((b) => {
        if (b) { const u = URL.createObjectURL(b); urls.push(u); settle(u, true); }
        else settle(cv.toDataURL(), false);
      }, 'image/png');
    } catch (e) { settle(cv.toDataURL(), false); }
    setTimeout(() => settle(cv.toDataURL(), false), 1200);
  });
  const out = {
    floor: await urlOf(floor), ceil: await urlOf(ceil), lid: await urlOf(lid),
    wall: await urlOf(wallCv), low: await urlOf(lowCv),
    deckUnder: await urlOf(deckUnder), plank: plank ? await urlOf(plank) : null,
    bank: await urlOf(bank),
    ores: null, rail: rail ? await urlOf(rail) : null,
    ladder: ladderTexture(), _urls: urls,
  };
  if (ores) {
    out.ores = {};
    for (const kind of Object.keys(ores)) out.ores[kind] = await urlOf(ores[kind]);
  }
  return out;
}

/**
 * Pixel clouds for the open-air sky — drawn once, tiled repeat-x across the
 * upper stage. Deterministic blobs (no randomness: the sky must bake the same
 * every mount, and Math.random in a bake is a re-raster per session).
 */
let _cloudCv = null;
function cloudCanvas() {
  if (_cloudCv) return _cloudCv;
  const cv = document.createElement('canvas');
  cv.width = 480; cv.height = 200;
  const g = cv.getContext('2d');
  const puff = (x, y, s) => {
    // One cloud: stacked rows of rounded rect-blobs, shaded underneath.
    const row = (dx, dy, w, h, c) => { g.fillStyle = c; g.fillRect(x + dx * s, y + dy * s, w * s, h * s); };
    row(8, 12, 40, 10, 'rgba(255,255,255,0.92)');
    row(0, 18, 58, 10, 'rgba(255,255,255,0.92)');
    row(16, 4, 22, 10, 'rgba(255,255,255,0.88)');
    row(4, 26, 48, 6, 'rgba(214,224,236,0.85)');
    row(12, 30, 30, 4, 'rgba(190,202,220,0.7)');
  };
  puff(30, 26, 1.35);
  puff(200, 70, 0.9);
  puff(330, 20, 1.1);
  puff(120, 120, 0.65);
  puff(410, 110, 0.75);
  return (_cloudCv = cv);
}

/**
 * The whole sky on one canvas, painted at the stage's own size.
 *
 * The old sky was a CSS gradient that settled to the fog colour at 50% and
 * STAYED that colour to the bottom edge — so everywhere the geometry ended,
 * the eye landed in a featureless grey field, and the playtest read the far
 * half of every meadow as soup. What a level camera actually sees out there
 * is a HORIZON: sky meeting ground on a line at eye height, a ridge of far
 * woods standing on it, and hazier, greener country running down from it.
 *
 * The line lives at exactly 50% stage height (a level camera's horizon), and
 * the colour AT the line is the fog colour on both sides — so geometry that
 * has faded into `--fp-fog` hands off to the sky with no seam, and the far
 * cull reads as atmosphere rather than as the world stopping.
 *
 * Deterministic (hash bumps, no randomness): the sky must bake the same every
 * mount, or a portal repaints the weather.
 */
function skyTexture(w, h) {
  const [r, g, b] = L.rgb;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const q = cv.getContext('2d');
  const C = (rr, gg, bb, a) => `rgba(${Math.max(0, Math.min(255, Math.round(rr)))},`
    + `${Math.max(0, Math.min(255, Math.round(gg)))},${Math.max(0, Math.min(255, Math.round(bb)))},${a == null ? 1 : a})`;
  const hy = Math.round(h * 0.5);   // the level camera's horizon
  // The sky, settling to the fog colour exactly at the line.
  const sky = q.createLinearGradient(0, 0, 0, hy);
  sky.addColorStop(0, C(r - 66, g - 42, b + 6));
  sky.addColorStop(0.62, C(r - 26, g - 16, b));
  sky.addColorStop(1, C(r, g, b));
  q.fillStyle = sky;
  q.fillRect(0, 0, w, hy);
  // The sun, high and warm, its glow clipped at the line by the ground band.
  const sx = w * 0.73, sy = h * 0.2, sr = h * 0.17;
  const sun = q.createRadialGradient(sx, sy, 0, sx, sy, sr);
  sun.addColorStop(0, 'rgba(255,246,210,0.9)');
  sun.addColorStop(0.2, 'rgba(255,246,210,0.34)');
  sun.addColorStop(1, 'rgba(255,246,210,0)');
  q.fillStyle = sun;
  q.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
  q.fillStyle = 'rgba(255,250,226,0.95)';
  q.beginPath(); q.arc(sx, sy, h * 0.024, 0, Math.PI * 2); q.fill();
  // Clouds, riding the upper air.
  const cc = cloudCanvas();
  const ch = h * 0.44, cw = cc.width * (ch / cc.height);
  for (let x = 0; x < w; x += cw) q.drawImage(cc, x, 0, cw, ch);
  // The far country below the line: haze at the horizon greening as it nears.
  const gnd = q.createLinearGradient(0, hy, 0, h);
  gnd.addColorStop(0, C(r, g, b));
  gnd.addColorStop(0.16, C(r * 0.72 + 24, g * 0.78 + 28, b * 0.62 + 18));
  gnd.addColorStop(1, C(r * 0.5 + 18, g * 0.58 + 24, b * 0.42 + 10));
  q.fillStyle = gnd;
  q.fillRect(0, hy, w, h - hy);
  // The horizon line itself — a pale seam of light where sky meets ground,
  // with a breath of shadow under it. Subtle, but it is the line the eye
  // anchors the whole scene to.
  q.fillStyle = C(r + 44, g + 38, b + 24, 0.5);
  q.fillRect(0, hy - 1, w, 1);
  q.fillStyle = C(r - 34, g - 26, b - 20, 0.3);
  q.fillRect(0, hy + 1, w, 1);
  // Two ridges of far woods standing on the line — hazier behind, greener in
  // front. Deterministic bumps; flats between them so it reads as canopy.
  const ridge = (amp, base, col) => {
    q.fillStyle = col;
    q.beginPath();
    q.moveTo(0, hy + base);
    const stepW = Math.max(8, Math.round(w / 96));
    for (let x = 0; x <= w + stepW; x += stepW) {
      let s = ((x * 2654435761) ^ (amp * 977)) >>> 0;
      s = ((s ^ (s >>> 13)) * 1274126177) >>> 0;
      const bump = (s % 1000) / 1000;
      q.lineTo(x, hy + base - (0.2 + 0.8 * bump) * amp);
    }
    q.lineTo(w, hy + base);
    q.closePath();
    q.fill();
  };
  ridge(h * 0.05, h * 0.014, C(r * 0.62 + 20, g * 0.68 + 26, b * 0.55 + 22, 0.85));
  ridge(h * 0.032, h * 0.022, C(r * 0.5 + 12, g * 0.58 + 20, b * 0.45 + 12, 0.9));
  return cv.toDataURL();
}

/**
 * Dress the sky layer for this map's light. Open air gets the painted horizon
 * above; underground maps hide the layer and keep their void. Sized to the
 * stage and re-baked on resize (keyed, so idle calls cost nothing) — the
 * horizon must sit at the REAL 50% of the real stage, not of a guess.
 */
function mountSky() {
  const el = F.host.querySelector('.fp-sky');
  if (!el) return;
  F.host.classList.toggle('fp-open', !!L.sky);   // daylight softens the vignette
  if (!L.sky) { el.style.display = 'none'; F._skyKey = ''; return; }
  // mount() runs while the screen is still hidden (clientHeight 0) — bake a
  // placeholder now, and the post-show mountSky() call re-bakes at truth.
  const w = Math.max(320, F.host.clientWidth || 1280);
  const h = Math.max(240, F.host.clientHeight || 720);
  const key = w + 'x' + h + '|' + L.rgb.join(',');
  if (F._skyKey === key) { el.style.display = ''; return; }
  F._skyKey = key;
  el.style.display = '';
  el.style.backgroundImage = `url(${skyTexture(w, h)})`;
  el.style.backgroundSize = '100% 100%';
  el.style.backgroundRepeat = 'no-repeat';
}

/** The rungs, drawn rather than cropped: no sheet in the kit has a head-on
 *  ladder, and a ladder head-on is four rectangles. */
let _ladderTex = null;
function ladderTexture() {
  if (_ladderTex) return _ladderTex;
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 320;
  const g = cv.getContext('2d');
  g.fillStyle = '#5d4026';
  g.fillRect(10, 0, 22, 320); g.fillRect(96, 0, 22, 320);
  g.fillStyle = '#8a6238';
  for (let y = 14; y < 320; y += 46) g.fillRect(10, y, 108, 14);
  g.fillStyle = 'rgba(255,232,180,0.16)';
  g.fillRect(10, 0, 6, 320); g.fillRect(96, 0, 6, 320);
  return (_ladderTex = cv.toDataURL());
}

// ---------------------------------------------------------------------------
// The chart
// ---------------------------------------------------------------------------

const at = (x, y) => {
  if (x < 0 || y < 0 || x >= F.cols || y >= F.rows) return '#';
  return F.grid[y][x];
};
const isWall = (x, y) => !!WALL[at(x, y)];
const isLow = (x, y) => !!LOW[at(x, y)];
const blocked = (x, y) => isWall(x, y) || isLow(x, y) || !!PROP[at(x, y)];
/** The GROUND level under a cell, signed (the shared model's floor — a deck
 *  cell answers with the passage beneath, which is where statics stand). */
const heightAt = (x, y) => {
  const f = F.model && F.model.floorAt(x, y);
  return f == null ? 0 : f;
};
/** Ladder or vine — the slow climbs. Stairs are their own question: they share
 *  the LEGALITY (the model's business) but none of the dressing — no rungs, no
 *  climb pace, no climb pose. */
const onClimb = (x, y) => { const c = at(x, y); return c === 'L' || c === 'v'; };
const onStairs = (x, y) => !!(F.model && F.model.stairAt(x, y));

/**
 * How wide the walker is, in tiles — and the number the whole continuous
 * movement model is bounded by.
 *
 * A grid-locked crawler could be a POINT, because it only ever existed at cell
 * centres and a single test vetted the whole hop before it began. A walker at
 * arbitrary coordinates cannot: it has to be a box, or it slips into the inner
 * angle of a corner that no single axis test refuses. THE BOX IS WHAT PRESERVES
 * THE NO-CORNER-CUTTING RULE — axis separation alone does not, and believing
 * otherwise is how you end up inside the rock.
 *
 * 0.28 is delve.js's `BODY_R`, deliberately, so the two lenses fit through the
 * same doorways. A one-tile gap leaves 0.44 tiles of clearance, which every
 * campus map's only way forward depends on.
 *
 * INVARIANT: `WALK_SPEED * DT_CLAMP < BODY`. Break it and a fast frame steps
 * clean over a wall between two legal positions. 3.4 × 0.08 = 0.272 < 0.28.
 */
const BODY = 0.28;

/**
 * Is this a place the walker's whole body can be, coming FROM (fx, fy)?
 *
 * Four corners through `blocked()` — which keeps the crawler's own solidity
 * vocabulary (walls, low blocks AND props), where handing collision to the
 * arena's `T.pass` would silently make every barrel walk-through — plus
 * THE CLIMB RULE, verbatim from the grid-locked `canStep` this replaces: a
 * ledge still needs a ladder to go UP and none to drop off, because a ledge is
 * a thing you climb to reach, not a pen you must climb to leave.
 */
/** The surface the last successful canStandAt picked — consumed by slide(),
 *  which commits the mover to it. */
let _pick = null;
function canStandAt(x, y, fx, fy, lv) {
  _pick = null;
  for (const cx of [x - BODY, x + BODY]) {
    for (const cy of [y - BODY, y + BODY]) {
      const gx = Math.floor(cx), gy = Math.floor(cy);
      if (!blocked(gx, gy)) continue;
      // A FURNISHING cell blocks by its prop's own circle, not by its whole
      // tile — the tile stood a body-width proud of a small shelf, and the
      // playtest could not get near the thing it could plainly see. Every
      // other blocked cell is architecture and stays a wall.
      if ((F.grid[gy] && F.grid[gy][gx]) === 'f') continue;
      return false;
    }
  }
  // Carved props occupy their ground (@see buildProps) — a circle test, so
  // walking past a lamp post is a brush and walking into it is a stop. A body
  // two or more levels off the prop's floor clears it entirely: the barrel
  // under the bridge does not block the crossing above it.
  for (const b of (F.propBlockers || [])) {
    if (lv != null && Math.abs(lv - (b.lv || 0)) >= 2) continue;
    const dx = x - b.x, dy = y - b.y, rr = b.r + BODY;
    if (dx * dx + dy * dy < rr * rr) return false;
  }
  // THE STEP LAW — the shared model's answer, verbatim in every lens (ONE
  // RULES FACT): down is always legal, up is one rung across a climb cell,
  // and a two-surface cell hands you whichever floor your level earns.
  const pick = fx == null
    ? (F.model.surfacesAt(Math.floor(x), Math.floor(y))[0] ?? null)
    : F.model.pickSurface(lv != null ? lv : heightAt(Math.floor(fx), Math.floor(fy)),
      Math.floor(fx), Math.floor(fy), Math.floor(x), Math.floor(y));
  if (pick == null) return false;
  _pick = pick;
  return true;
}

/**
 * Move, sliding along whatever refuses you, and SAY what refused.
 *
 * Two things here are deliberately not what the arena does:
 *
 * Both existing slides in this repo (arena-terrain's and delve.js's) test the
 * second axis from the ALREADY-MOVED position, which lets a diagonal into a
 * corner sneak through on the second test. The origin is captured once here.
 *
 * And it returns the cell each axis was refused BY, not a bare boolean. That is
 * what keeps walk-into-ore mining alive: the grid-locked crawler knew which
 * cell it had failed to enter because it had asked before moving, and a slide
 * that only reports "blocked" throws that away.
 *
 * The escape clause matters more than it looks. A view swap from the top-down
 * walk lands you at ITS coordinates under ITS solidity model — props block a
 * shallow slice there and the whole cell here — so you can arrive already
 * illegal. Without the fallback you would be wedged with no way out.
 */
function slide(e, dx, dy) {
  const ox = e.x, oy = e.y;
  const stuck = !canStandAt(ox, oy, ox, oy, e.lv);
  // The stuck escape relaxes the BODY to a point, never the level law — a
  // wedged arrival may walk out of a prop's circle, not up a terrace face.
  const ok = stuck
    ? (x, y) => !blocked(Math.floor(x), Math.floor(y))
      && (_pick = F.model.pickSurface(e.lv != null ? e.lv : 0,
        Math.floor(ox), Math.floor(oy), Math.floor(x), Math.floor(y))) != null
    : (x, y) => canStandAt(x, y, ox, oy, e.lv);
  let hit = null;
  if (dx) {
    if (ok(ox + dx, oy)) { e.x = ox + dx; if (_pick != null) e.lv = _pick; }
    else hit = { x: Math.floor(ox + dx + Math.sign(dx) * BODY), y: Math.floor(oy) };
  }
  if (dy) {
    if (ok(e.x, oy + dy)) { e.y = oy + dy; if (_pick != null) e.lv = _pick; }
    else if (!hit) hit = { x: Math.floor(e.x), y: Math.floor(oy + dy + Math.sign(dy) * BODY) };
  }
  return hit;
}

/** Re-fit the lens to the window. Called on mount and on every resize, because
 *  a fullscreen toggle is a resize and the whole framing hangs off this. */
function fitLens() {
  if (!F) return;
  const stage = F.host.querySelector('.fp-stage');
  const h = stage && stage.clientHeight;
  // Measured LAZILY, and skipped when it measures nothing: mount() runs while
  // #delveFpScreen is still display:none, where clientHeight is 0 — take that
  // as an answer and the whole map is built through a 720px lens whatever the
  // window is. The caller re-fits once the screen is up. (Same trap the
  // top-down view hit measuring prop heights before showScreen.)
  if (!h) return;
  // Perspective is UNCHANGED by the world-unit shrink; the world scale carries
  // the whole factor instead (÷K), so the projection is the same similarity it
  // was at T=900 and every measured framing number still holds.
  //
  // The WORLD SCALE keeps its own ratio (PERSP_AT) and the PERSPECTIVE comes
  // from the FoV slider — and the split is deliberate. Field of view IS the
  // ratio between those two: changing the lens while the world stays put is
  // what widens or narrows the view, and changing both together would be a
  // similarity that does nothing at all. @see view-prefs.js.
  const fit = h / PERSP_AT;
  F.lens = fit / K;
  stage.style.perspective = perspectiveFor(h).toFixed(1) + 'px';
  // The rasteriser gets the same box, at buffer resolution — @see glDpr.
  if (F.gl) F.gl.resize(stage.clientWidth, h, glDpr());
}

/**
 * Buffer pixels per CSS px for the rasteriser. The hardware ratio first,
 * capped at 2 because past that a phone is spending four times the fill rate
 * on a difference nobody can see through a pixel-art texture — then the
 * Resolution dial's share on top of it, because a frame's cost falls with the
 * SQUARE of this number and a phone that cannot hold a native frame can
 * usually hold a quarter of one. The canvas upscales NEAREST
 * (@see setGlBackend), so turning the dial down reads as leaning into the
 * pixel art, not blurring it.
 */
function glDpr() {
  return Math.min(2, window.devicePixelRatio || 1) * (view.res / 100);
}

/** The camera panel's line of truth for this lens: the checkbox says what was
 *  ASKED, this says what is RUNNING — canvas and buffer, or the composited
 *  fallback and why. @see vpStatus in view-prefs.js. */
vpStatus(() => {
  if (!F) return '';
  if (F.gl) {
    const c = F.host.querySelector('canvas.fp-gl');
    return `live: canvas ${c ? c.width + '×' + c.height : '?'} @ ${view.res}%`;
  }
  return view.gl ? 'live: composited — WebGL2 unavailable here' : 'live: composited (canvas off)';
});

/**
 * Bring the rasteriser up, or take it down, to match the setting.
 *
 * Failure to get a context is NOT an error: the DOM path is still there and
 * still works, so a device without WebGL2 quietly keeps the game it had. That
 * is the whole reason this arrived as a switch rather than a rewrite.
 */
function setGlBackend(on) {
  if (!F) return;
  let canvas = F.host.querySelector('.fp-gl');
  if (on && !F.gl && canvas) {
    /**
     * A FRESH CANVAS EVERY TIME, and it is not fussiness: `dispose()` ends with
     * `WEBGL_lose_context`, and a canvas whose context has been lost can never
     * be given another one. Reusing the element made the switch one-way —
     * off worked, on afterwards silently returned null and the player was left
     * on the composited path wondering why nothing changed.
     */
    const fresh = document.createElement('canvas');
    fresh.className = canvas.className;
    // NEAREST upscale to the screen: below 100% Resolution the buffer is
    // smaller than the element, and bilinear would smear exactly the pixels
    // the low setting is there to celebrate.
    fresh.style.imageRendering = 'pixelated';
    canvas.replaceWith(fresh);
    canvas = fresh;
    F.gl = createGlWorld(canvas);
    if (!F.gl) {
      console.warn('delve-fp: no WebGL2 here — keeping the composited path');
      // Say it where the player is looking. The silent fallback is how a phone
      // spent a day on the wrong renderer with nobody the wiser.
      try { toast('Canvas renderer unavailable — using the old path.'); } catch (e) { /* pre-toast mount */ }
    }
  } else if (!on && F.gl) {
    F.gl.dispose();
    F.gl = null;
  }
  F.host.classList.toggle('fp-gl-on', !!F.gl);
  fitLens();
  // The two backends want different geometry — the whole chart against a fitted
  // radius — so the switch has to re-measure and rebuild, not just re-point.
  fitViewRadius();
  // EITHER WAY the composited copy is thrown away: turning GL on leaves a
  // thousand hidden elements holding the map that was, and turning it off must
  // start from an empty registry or the diff keeps quads the new radius never
  // asked for.
  F.geo = new Map();
  const geoHost = F.world && F.world.querySelector('.fp-geo');
  if (geoHost) geoHost.innerHTML = '';
  buildGeometry();
  F._wtf = '';
}

/**
 * Every slider moves the picture live. `F._wtf` is the world transform's
 * write-guard — clearing it is what lets the next frame actually write.
 *
 * Draw distance goes further than the lens: it re-measures how far THIS chart
 * can afford to be seen, which moves the fog with it (fitViewRadius derives one
 * from the other), and the scene has to be rebuilt to that new weather. Guarded
 * on the value actually changing, because the panel fires on every `input` and
 * a refit is a few dozen traversals of the chart.
 */
let _dialWas = view.dist, _glWas = view.gl, _dialT = 0;
onView(() => {
  if (!F) return;
  fitLens();
  if (view.gl !== _glWas) { _glWas = view.gl; setGlBackend(view.gl); return; }
  if (view.dist !== _dialWas) {
    _dialWas = view.dist;
    // DEBOUNCED, unlike the lens. A refit is a few dozen traversals of the
    // chart — 126ms on the estate at the top of the range — and the panel fires
    // on every `input`, so dragging the slider would be a second of hitching
    // per sweep. The lens above still moves with the thumb; the world lands
    // when you let go.
    clearTimeout(_dialT);
    _dialT = setTimeout(() => {
      if (!F) return;
      fitViewRadius(); buildGeometry(); drawMap();
      F._wtf = '';
    }, 140);
  }
  F._wtf = '';
});

/** Nothing solid on the floor between two points. Sampled rather than swept —
 *  over a tile and a quarter of reach, eight samples is finer than the grid.
 *  LEVEL-AWARE when the endpoints' surfaces are given: a full level of ground
 *  standing above both endpoints blocks the line (a terrace ridge is rock,
 *  even though its top is floor), and a deck plane lying BETWEEN the two
 *  levels blocks it too — nothing notices, aims or shoots through a bridge. */
function clearLine(ax, ay, bx, by, la, lb) {
  const lvl = la != null && lb != null;
  const hi = lvl ? Math.max(la, lb) : 0, lo = lvl ? Math.min(la, lb) : 0;
  for (let i = 1; i < 8; i++) {
    const t = i / 8;
    const gx = Math.floor(ax + (bx - ax) * t), gy = Math.floor(ay + (by - ay) * t);
    if (blocked(gx, gy)) return false;
    if (!lvl) continue;
    if (heightAt(gx, gy) >= hi + 1) return false;
    const dk = F.model.deckAt(gx, gy);
    if (dk != null && dk > lo && dk <= hi) return false;
  }
  return true;
}

/** How far into the dark a point is, 0 (right here) to 1 (gone). */
function fogAt(x, y) {
  const d = Math.hypot(x - F.px, y - F.py);
  return Math.min(1, Math.max(0, (d - L.near) / (L.far - L.near)));
}

/** EIGHT facings now — quarter turns felt like a tank. 0=N clockwise to 7=NW;
 *  yaw = dir·45°. `DIRS` holds the GRID step (diagonals land on the corner
 *  cell); `DIRV` the unit vector, for every aim, cone and pose dot-product. */
const DIRS = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
/* DIRV is GONE. Every consumer wanted a BEARING, and now takes the live one:
   [Math.sin(F.yaw), -Math.cos(F.yaw)]. A lookup off a rounded eighth-turn would
   put the aim up to 22.5° from the crosshair you are actually looking down. */
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/**
 * Which way to face on arrival: down the longest open run from this cell.
 *
 * The first cut always faced south, which in Ferncreek is one step into the
 * hedge — you arrive nose to the wall, press forward, nothing happens, and the
 * button looks broken. A crawler should open looking at somewhere it can go.
 */
function openestDir(x, y) {
  let best = 4, run = -1;
  for (let d = 0; d < 8; d += 2) {   // cardinal looks only — arriving at 45° reads as a stumble
    const [dx, dy] = DIRS[d];
    let n = 0;
    while (n < 8 && !blocked(x + dx * (n + 1), y + dy * (n + 1))) n++;
    if (n > run) { run = n; best = d; }
  }
  return best;
}
/** The same answer as a continuous heading, in radians. The ray stays an
 *  integer cardinal scan — arriving at 45° reads as a stumble whether or not
 *  the yaw that follows is free. `DIRS` survives for this and nothing else. */
const openestYaw = (x, y) => openestDir(x, y) * Math.PI / 4;

// ---------------------------------------------------------------------------
// Geometry — rebuilt on a change of cell, never per frame
// ---------------------------------------------------------------------------

/**
 * THE SCENE IS RETAINED, NOT REBUILT.
 *
 * The first cut rebuilt every quad as one innerHTML string on every change of
 * cell. Every element was therefore NEW: the compositor re-recorded and
 * re-rasterised the entire scene per step, painted each quad blank until its
 * raster arrived (the playtest's "tiles flicker when moving"), and under a
 * phone's memory pressure some rasters never arrived at all (the missing
 * floor). Now each quad is created once, keyed by what and where it is, and a
 * step only ADDS the rim that walked into the light, REMOVES the rim that
 * left it, and adjusts fog.
 *
 * Fog itself is a solid-colour CHILD (`.fp-veil`) whose OPACITY is the
 * amount. Solid-colour layers cost the compositor almost nothing, and opacity
 * is compositor-only — so re-fogging the world as you walk re-rasterises not
 * one texture. (The old form baked the veil into the background, which is
 * exactly why every step had to repaint everything.) Quantised to 1/40ths so
 * idle steps compare equal and write nothing.
 */
const fogQ = (f) => Math.round(Math.min(1, Math.max(0, f)) * 40) / 40;

/**
 * GROUND LOD — the lever that finally buys the draw distance.
 *
 * Open ground used to emit one quad per cell, so the cost of a vista was the
 * radius SQUARED in compositor layers: R=8 is a 17×17 window and ~290 floor
 * quads before a single wall, and a phone drops layers long before it runs out
 * of pixels (a 2026-08-03 capture caught the HUD itself missing from 22 frames
 * of 326 — see HANDOFF-RENDERER.md §1).
 *
 * But a floor is a PLANE, and every cell of it draws the same tile. So a block
 * of cells that are alike in every way a quad cares about is ONE quad with its
 * texture repeated n×n across it — pixel-identical, 1/n² the layers, and 1/n²
 * the rasters when the camera moves. This is the N64's trick and Doom's before
 * it: spend the detail where the eye is, and merge it where the eye cannot tell.
 *
 * WHERE IT MAY MERGE IS DECIDED BY THE FOG, NOT BY DISTANCE — and that is what
 * makes this lossless rather than a trade. A veil is ONE opacity for the whole
 * quad, so merging cells whose fog differs would replace the per-cell gradient
 * with a staircase: at the phone's ramp a four-tile block steps a third of the
 * whole haze at once, and the meadow would read as tiled lino. Inside `L.near`
 * the fog is exactly 0 on every cell, so a block there is not an approximation
 * of the sixteen quads it replaces — it is the same picture, pixel for pixel.
 *
 * Which is why the lights were re-cut around a wide CLEAR DISC and a short ramp
 * (LIGHTS.open) instead of a short view and a long fade. That shape is the N64
 * open-world shape too: see a long way, and let the last of it go to weather.
 *
 * Blocks are aligned to the WORLD grid, never to the camera, or every step
 * would re-key and re-create the lot.
 *
 * CHUNK is 4 because 4·T = 1200 CSS px, which is 3120 device px at dpr 2.6 —
 * inside the ~4096 GL_MAX_TEXTURE_SIZE floor that delve.css's no-filter rule
 * exists to respect. Raising it needs that arithmetic redone, not taste.
 */
const CHUNK = 4;            // biggest ground block / wall run, in tiles
/**
 * THE HALF-SPACE BEHIND YOU IS NOT BUILT.
 *
 * buildGeometry emitted a full square window with no facing test at all, so on
 * open ground a third of every scene was floor behind the camera holding layers
 * it could never show. The cone is deliberately far wider than the lens (±117°
 * against a horizontal FoV of ~115° on a phone in landscape, so ±58°): the cull
 * edge has to sit where nothing can pop into view during the YAW_Q the scene is
 * allowed to go stale for, and NEAR_KEEP holds everything close whatever the
 * bearing so the third-person pull-back can never see round it.
 */
const NEAR_KEEP = 5, CULL_DOT = 0.45;
/** How far the camera may turn before the cone is rebuilt. Small enough that
 *  the cull edge stays outside the lens, large enough that a slow pan is not a
 *  rebuild every frame. */
const YAW_Q = Math.PI / 6;
/**
 * WHAT A SCENE MAY COST, IN LAYERS — and therefore how far you can see.
 *
 * Read off the failure rather than guessed. The 2026-08-03 phone capture was a
 * device dropping whole layers — the HUD among them — on the estate, which the
 * census puts at 387 layers for that build. The coarse tier is set a third
 * under it; the desktop tier at 1.7× the 876 the same chart was already
 * carrying on a laptop without complaint.
 *
 * This is a BUDGET, not a radius, because the two are not the same question on
 * different charts: merged ground and merged wall runs let Ferncreek show its
 * whole meadow for 124 layers, while the estate — forty-six rows of buildings,
 * every one of them wall faces that cannot merge past a corner — spends that on
 * a fraction of the distance. A single number for both would either black out
 * the meadow or flicker the estate, which is exactly what one number has done
 * twice. @see fitViewRadius.
 */
const LAYER_BUDGET = { coarse: 440, desktop: 1900 };
/** The budget this device is working to, with the player's own dial on it.
 *  The dial exists because nobody can compute a particular phone's compositor
 *  ceiling from here, and the failure is legible from the sofa: push it until
 *  the world drops surfaces as you walk, come back a step. @see view-prefs. */
const budgetNow = () => (COARSE ? LAYER_BUDGET.coarse : LAYER_BUDGET.desktop) * (view.dist / 100);
/**
 * What a want-set will actually cost the compositor.
 *
 * NOT `want.size`. A quad that has taken any fog carries a `.fp-veil` child, and
 * the whole reason fog is built that way is that the veil is its own surface
 * whose opacity can change without re-rastering the picture underneath. Live on
 * the estate that was 407 veils against 602 quads — count only the quads and
 * the budget is wrong by two thirds, which is precisely the kind of proxy that
 * has already cost this renderer two rounds (HANDOFF-RENDERER.md §1).
 */
function layerCost(want) {
  let n = want.size;
  for (const w of want.values()) if (w.fog > 0) n++;
  return n;
}

/**
 * The want-set: every quad this scene should contain, keyed so the retained
 * scene can diff against it. PURE — it reads the chart and the camera and
 * touches no DOM — because fitViewRadius runs it a few dozen times at mount to
 * find out how far this particular chart can afford to be seen.
 */
function wantSet(px, py, yaw, R, near, far) {
  const S = F.surf;
  // The surface set a cell draws from: its region's if it stands in one (the
  // campus's stamped rooms), the map's own otherwise.
  const surfAt = (x, y) => {
    const t = F.regionThemeAt && F.regionThemeAt(x, y);
    return (t && F.surfByTheme[t]) || S;
  };
  // PAINT swaps the ground fill and nothing else — no walls, no ceiling, no
  // room. (A region is a room; the Surfaces palette writes paint.)
  const floorTexAt = (x, y, SC) => {
    const t = F.paintThemeAt && F.paintThemeAt(x, y);
    return (t && F.surfByTheme[t] && F.surfByTheme[t].floor) || SC.floor;
  };
  const cx = Math.floor(px), cy = Math.floor(py);
  const want = new Map();
  /** How many times a merged quad repeats its own tile, across and down. The
   *  DOM path spells that as a `background-size` percentage; the rasteriser
   *  spells it as a UV that runs past 1. Both come from the same two numbers. */
  const add = (key, tex, w, h, tx, ty, tz, rot, cls, fog, nx, ny) =>
    want.set(key, {
      tex, w, h, tx, ty, tz, rot, cls, fog: fogQ(fog),
      nx: nx || 1, ny: ny || 1, rep: tiled(nx || 1, ny || 1),
    });
  const tiled = (nx, ny) => (nx > 1 || ny > 1
    ? `background-size:${100 / nx}% ${100 / ny}%;background-repeat:repeat;` : '');
  /** Fog by raw distance, so a BLOCK can be judged by its NEAREST point rather
   *  than its middle — the cull edge must never bite a corner you can still see.
   *  Local, not the module's `fogAt`, because a fitting pass asks about a camera
   *  and a light that are not the live ones. */
  const fogD = (d) => Math.min(1, Math.max(0, (d - near) / (far - near)));
  const fogAt = (x, y) => fogD(Math.hypot(x - px, y - py));
  /**
   * May everything out to this distance share ONE veil? Only where the fog has
   * not started: inside the clear disc every cell reads 0, so the merge is the
   * same picture rather than an average of one.
   *
   * ON THE RASTERISER THIS IS ALWAYS TRUE, and that is the single biggest thing
   * the rewrite buys. A veil is one opacity for a whole surface, which is why
   * the DOM path may only merge where the fog is flat and why its draw distance
   * is bounded by the AREA of the ring where it is not. A shader fogs the pixel,
   * so there is nothing to be flat about: merge everything, always, and the
   * cone and the fog cull go with it — the whole chart is cheaper to draw than
   * the old eight-tile bubble was.
   */
  const gl = glOn();
  const flat = (dFar) => gl || dFar <= near;
  const hx = Math.sin(yaw), hy = -Math.cos(yaw);
  const inView = (mx, my, pad) => {
    if (gl) return true;
    const dx = mx - px, dy = my - py, d = Math.hypot(dx, dy);
    return d <= NEAR_KEEP + pad || dx * hx + dy * hy > -CULL_DOT * d - pad;
  };

  /**
   * One cell of GROUND, in full — floor, ceiling, rail, risers, rungs, and the
   * lid a waist-high block wears. The four vertical faces are not here: they
   * merge along their own runs (@see wallRuns), which is where a chart made of
   * buildings spends most of its layers.
   */
  const emitCell = (x, y) => {
    const fog = fogAt(x + 0.5, y + 0.5);
    if (!gl && fog >= FOG_CULL) return;   // solid dark already — emitting it is pure overdraw
    const ch = at(x, y);
    const wx = (x + 0.5) * T, wz = (y + 0.5) * T;
    const id = x + ',' + y;
    const SC = surfAt(x, y);
    if (WALL[ch] || LOW[ch]) {
      // A waist-high run needs a lid, or you look down into an open box.
      // lid, not ceil: a lid is floor-lit (you look DOWN at it under the
      // room's light), and the ceil bake is tuned for the dark overhead.
      if (LOW[ch]) add('d' + id, SC.lid || SC.ceil, T, T, wx, -LOW_H, wz, 'rotateX(90deg)', 'fp-floor', fog);
      // Once any surface climbs to eye-above-the-walls (level 2 up), walls
      // need TOPS or they read as open-topped hollow boxes from a terrace.
      // Charts that never leave the ground pay nothing.
      else if (ch !== '#' && F.maxLv >= 2) {
        add('wt' + id, SC.lid || SC.ceil, T, T, wx, -WALL_H, wz, 'rotateX(90deg)', 'fp-floor', fog);
      }
      return;
    }
    if (ch === '#') return;
    const lv = heightAt(x, y);
    const lift = -lv * STEP_PX;
    add('f' + id, floorTexAt(x, y, SC), T, T, wx, lift, wz, 'rotateX(90deg)', 'fp-floor', fog);
    // A cell inside a stamped room is INDOORS whatever the weather outside —
    // it gets that room's ceiling even on a map whose light is open sky.
    // THE CEILING RISES WITH THE FLOOR (Doom's sector model, first tooth): a
    // raised cell keeps WALL_H of headroom, so a terrace under a mine's roof
    // is a dome, not a place your head leaves the world. Where neighbouring
    // ceilings differ, a SKIRT hangs the gap closed; walls beside lifted
    // cells extend their faces upward the same way (see the wall-run pass).
    const roomed = SC !== S;
    const ceilLift = Math.max(0, lv) * STEP_PX;
    if (!L.sky || roomed) {
      add('c' + id, SC.ceil, T, T, wx, -WALL_H - ceilLift, wz, 'rotateX(-90deg)', 'fp-ceil', fog);
      if (ceilLift > 0) {
        const skirts = [
          { k: 'gs', nx: x, ny: y + 1, rot: '', px: wx, pz: (y + 1) * T },
          { k: 'gn', nx: x, ny: y - 1, rot: 'rotateY(180deg)', px: wx, pz: y * T },
          { k: 'ge', nx: x + 1, ny: y, rot: 'rotateY(90deg)', px: (x + 1) * T, pz: wz },
          { k: 'gw', nx: x - 1, ny: y, rot: 'rotateY(-90deg)', px: x * T, pz: wz },
        ];
        for (const sk of skirts) {
          const nch = at(sk.nx, sk.ny);
          if (WALL[nch] || nch === '#') continue;   // the wall's own extended face closes it
          const nLift = Math.max(0, heightAt(sk.nx, sk.ny)) * STEP_PX;
          if (nLift >= ceilLift) continue;
          const h2 = ceilLift - nLift;
          add(sk.k + id, SC.wall, T, h2, sk.px, -WALL_H - nLift - h2 / 2, sk.pz, sk.rot, 'fp-wall', fog);
        }
      }
    }
    // Rails lie ON the floor, a hair above it so the two don't fight for depth.
    if (ch === '=' && S.rail) add('r' + id, S.rail, T, T, wx, lift - 1, wz, 'rotateX(90deg)', 'fp-floor', fog);
    /**
     * RISERS, signed and general: every side of this cell where the ground
     * falls away gets the exposed band of vertical face — from the higher
     * floor down to whatever stands below it. That one rule is the ledge's
     * old riser, the terrace's taller flank, AND the trench's inner wall
     * (emitted by the RIM cell, whose floor is the higher one). A neighbour's
     * own masonry buries the band it covers: a '2' beside a waist block shows
     * only the strip above the block's top, and a mere ledge beside it shows
     * nothing, exactly as before.
     */
    const sides = [
      { k: 'zs', nx: x, ny: y + 1, rot: '', fx: x + 0.5, fy: y + 1, px: wx, pz: (y + 1) * T },
      { k: 'zn', nx: x, ny: y - 1, rot: 'rotateY(180deg)', fx: x + 0.5, fy: y, px: wx, pz: y * T },
      { k: 'ze', nx: x + 1, ny: y, rot: 'rotateY(90deg)', fx: x + 1, fy: y + 0.5, px: (x + 1) * T, pz: wz },
      { k: 'zw', nx: x - 1, ny: y, rot: 'rotateY(-90deg)', fx: x, fy: y + 0.5, px: x * T, pz: wz },
    ];
    for (const sd of sides) {
      const nch = at(sd.nx, sd.ny);
      // Covered up to: a wall/void neighbour buries everything (its own face
      // spans the gap — the wall-run pass extends below grade); a low block
      // buries LOW_H; open ground buries up to its own floor.
      const cover = (WALL[nch] || nch === '#') ? Infinity : LOW[nch] ? LOW_H / STEP_PX : heightAt(sd.nx, sd.ny);
      if (cover >= lv) continue;
      const h = (lv - cover) * STEP_PX;
      // Any band reaching below grade is cut earth (the bank), not dressing.
      const rtex = cover < 0 ? (S.bank || SC.low) : SC.low;
      add(sd.k + id, rtex, T, h, sd.px, -(cover * STEP_PX) - h / 2, sd.pz, sd.rot, 'fp-wall',
        fogAt(sd.fx, sd.fy), 1, Math.max(1, Math.round(lv - cover)));
    }
    // The rungs. A climb cell is the ONLY place the level may change, so the
    // ladder is drawn flat against whichever neighbouring face it serves —
    // a thing you can see and aim at, not a square that silently lifts you.
    // Drawn from THIS cell's floor up to the neighbour's, however far that is
    // (a vine out of a trench hangs a full step below grade). Stairs draw no
    // rungs — their treads are real geometry below.
    if (S.ladder && onClimb(x, y)) {
      const rungs = [
        { k: 'l0', nx: x, ny: y + 1, rot: 'rotateY(180deg)', px: wx, pz: (y + 1) * T - 6 * K },
        { k: 'l1', nx: x, ny: y - 1, rot: '', px: wx, pz: y * T + 6 * K },
        { k: 'l2', nx: x + 1, ny: y, rot: 'rotateY(-90deg)', px: (x + 1) * T - 6 * K, pz: wz },
        { k: 'l3', nx: x - 1, ny: y, rot: 'rotateY(90deg)', px: x * T + 6 * K, pz: wz },
      ];
      for (const r of rungs) {
        const nf = heightAt(r.nx, r.ny);
        if (WALL[at(r.nx, r.ny)] || at(r.nx, r.ny) === '#' || nf <= lv) continue;
        const h = (nf - lv) * STEP_PX;
        add(r.k + id, S.ladder, T * 0.42, h, r.px, -(lv * STEP_PX) - h / 2, r.pz, r.rot, 'fp-ladder', fog);
      }
    }
    // STAIRS — four real treads and their risers, rising toward the level
    // they serve. Doom's steps, not a decal: feet and eye track them because
    // the surfaces are actually there.
    if (onStairs(x, y)) {
      const dir = [[0, -1], [0, 1], [-1, 0], [1, 0]].find(([ddx, ddy]) =>
        F.model.surfacesAt(x + ddx, y + ddy).includes(lv + 1));
      if (dir) {
        const [ddx, ddy] = dir;
        const treadTex = SC.lid || SC.floor;
        for (let i = 0; i < 4; i++) {
          const topY = -(lv + (i + 1) / 4) * STEP_PX;
          // The tread strip's centre, walking from the low edge toward `dir`.
          const off = (i + 0.5) / 4 - 0.5;   // −0.375 … +0.375 across the cell
          const tx2 = wx + ddx * off * T, tz2 = wz + ddy * off * T;
          const w2 = ddx ? T / 4 : T, d2 = ddx ? T : T / 4;
          add('t' + i + id, treadTex, w2, d2, tx2, topY, tz2, 'rotateX(90deg)', 'fp-floor', fog);
          // The riser under this tread's low edge, facing back down the run.
          const rx = wx + ddx * (i / 4 - 0.5) * T, rz = wz + ddy * (i / 4 - 0.5) * T;
          const rot = ddy === 1 ? 'rotateY(180deg)' : ddy === -1 ? '' : ddx === 1 ? 'rotateY(-90deg)' : 'rotateY(90deg)';
          add('t' + (i + 4) + id, SC.low, ddx ? STEP_PX / 4 : T, STEP_PX / 4,
            ddx ? rx : wx, topY + STEP_PX / 8, ddx ? wz : rz, rot, 'fp-wall', fog);
        }
      }
    }
    // DECKS — the two-surface cells. The crossing is a real floor at deck
    // height wearing planks ('n') or the ground's own dressing ('u'); its
    // underside is a DEDICATED bake (never the ceiling's identity — the
    // third-person camera deletes every .ceil texture from the buffer), hung
    // a thin slab below the top so the passage keeps its lawful headroom.
    if (DECK_CH[ch]) {
      const dlv = F.model.deckAt(x, y);
      if (dlv != null) {
        const topY = -dlv * STEP_PX;
        const SLAB = STEP_PX * 0.2;
        const deckTex = (ch === 'n' && S.plank) || SC.lid || SC.floor;
        const underTex = S.deckUnder || deckTex;
        add('k' + id, deckTex, T, T, wx, topY, wz, 'rotateX(90deg)', 'fp-floor', fog);
        add('ku' + id, underTex, T, T, wx, topY + SLAB, wz, 'rotateX(-90deg)', 'fp-ceil', fog);
        const lips = [
          { k: 'ks', nx: x, ny: y + 1, rot: '', px: wx, pz: (y + 1) * T },
          { k: 'kn', nx: x, ny: y - 1, rot: 'rotateY(180deg)', px: wx, pz: y * T },
          { k: 'ke', nx: x + 1, ny: y, rot: 'rotateY(90deg)', px: (x + 1) * T, pz: wz },
          { k: 'kw', nx: x - 1, ny: y, rot: 'rotateY(-90deg)', px: x * T, pz: wz },
        ];
        for (const lp of lips) {
          if (F.model.surfacesAt(lp.nx, lp.ny).includes(dlv)) continue;   // the crossing continues
          add(lp.k + id, deckTex, T, SLAB, lp.px, topY + SLAB / 2, lp.pz, lp.rot, 'fp-wall', fog);
        }
      }
    }
  };

  /**
   * May this whole block be ONE quad?
   *
   * Only if every cell in it is plain open ground of the same surface set at
   * the same level: anything that needs geometry of its own (a wall, a lid, a
   * rail, a ledge riser, a rung) or a different texture makes the block
   * non-uniform and it splits. Props and exits pass — the floor under a barrel
   * is the same floor, and their sprites are billboards built elsewhere.
   * Out-of-bounds reads as '#', so a block that overhangs the chart splits and
   * the void cells then draw nothing, exactly as they did per-cell.
   */
  const evenGround = (bx, by, n) => {
    const SC = surfAt(bx, by);
    const ft = floorTexAt(bx, by, SC);
    for (let y = by; y < by + n; y++) {
      for (let x = bx; x < bx + n; x++) {
        const ch = at(x, y);
        if (WALL[ch] || LOW[ch] || ch === '#' || ch === '=') return false;
        // Any level fact splits the block: a height, a climb (stairs
        // included), a deck — and a cell whose neighbour falls away, because
        // THAT cell emits the rim's riser and a merged block would swallow it
        // (the creek bank was the first casualty).
        if (heightAt(x, y) || F.model.climbAt(x, y) || DECK_CH[ch]) return false;
        for (const [ddx, ddy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
          const nch = at(x + ddx, y + ddy);
          if (!WALL[nch] && !LOW[nch] && nch !== '#' && heightAt(x + ddx, y + ddy) < 0) return false;
        }
        if (surfAt(x, y) !== SC) return false;
        if (floorTexAt(x, y, surfAt(x, y)) !== ft) return false;
      }
    }
    return true;
  };

  /** n×n cells of ground as one quad, its tile repeated across it. The picture
   *  is identical to the n² quads it replaces — the floor texture was already
   *  the same on every cell of a surface set — so this costs nothing but the
   *  fog, which is now the block's rather than the cell's. Deep in the haze,
   *  where the big blocks live, that is a distinction with no difference. */
  const emitBlock = (bx, by, n) => {
    const SC = surfAt(bx, by);
    const w = n * T, mx = (bx + n / 2) * T, mz = (by + n / 2) * T;
    add(`f${n}:${bx},${by}`, floorTexAt(bx, by, SC), w, w, mx, 0, mz, 'rotateX(90deg)', 'fp-floor', 0, n, n);
    if (!L.sky || SC !== S) add(`c${n}:${bx},${by}`, SC.ceil, w, w, mx, -WALL_H, mz, 'rotateX(-90deg)', 'fp-ceil', 0, n, n);
  };

  /** The farthest corner of a rect from the eye — what decides whether the fog
   *  is still flat across the whole of it. */
  const farCorner = (bx, by, w, h) => Math.hypot(
    Math.max(Math.abs(px - bx), Math.abs(px - (bx + w))),
    Math.max(Math.abs(py - by), Math.abs(py - (by + h))));

  /**
   * Quadtree descent. A block is dropped whole if it is out of the window,
   * behind you, or past the fog; taken whole if the fog is flat across it and
   * its ground is even; and quartered otherwise, all the way down to the cell.
   */
  const walk = (bx, by, n) => {
    if (bx + n <= cx - R || bx > cx + R || by + n <= cy - R || by > cy + R) return;
    const mx = bx + n / 2, my = by + n / 2, pad = n * 0.71;
    if (!inView(mx, my, pad)) return;
    // Nearest point of the block to the eye, clamped into its own rect.
    const nx = Math.max(bx, Math.min(px, bx + n)), ny = Math.max(by, Math.min(py, by + n));
    if (!gl && fogD(Math.hypot(px - nx, py - ny)) >= FOG_CULL) return;
    if (n === 1) { emitCell(bx, by); return; }
    if (flat(farCorner(bx, by, n, n)) && evenGround(bx, by, n)) { emitBlock(bx, by, n); return; }
    const h = n / 2;
    walk(bx, by, h); walk(bx + h, by, h); walk(bx, by + h, h); walk(bx + h, by + h, h);
  };
  const align = (v) => Math.floor(v / CHUNK) * CHUNK;
  for (let by = align(cy - R); by <= cy + R; by += CHUNK) {
    for (let bx = align(cx - R); bx <= cx + R; bx += CHUNK) walk(bx, by, CHUNK);
  }

  /**
   * WALL FACES, MERGED ALONG THEIR RUNS.
   *
   * The estate is not a meadow — it is buildings, and a building is a long
   * straight line of identical faces. Emitting one quad per cell of a twelve-
   * tile wall is twelve layers of the same picture, and the census said the
   * walls, not the grass, were what the estate spent most of its budget on once
   * the ground had been merged.
   *
   * A face is emitted only where it meets somewhere you could stand, so a solid
   * block of rock costs nothing and no face is ever seen from behind. A run
   * extends while the neighbour is the same height, the same texture, and also
   * exposed — and only while the fog is still flat across the whole of it, the
   * same lossless rule the ground blocks take. A face is fogged by ITS OWN
   * distance, not its cell's: the two sides of a block a tile apart should not
   * be equally dark.
   */
  const wallTex = (x, y) => {
    const ch = at(x, y), SC = surfAt(x, y);
    return ch === 'o' ? ((S.ores && S.ores[oreKindAt(x, y)]) || SC.wall)
      : (LOW[ch] ? SC.low : SC.wall);
  };
  const open = (x, y) => !WALL[at(x, y)] && !LOW[at(x, y)];
  // key, the neighbour a face looks at, its rotation, and where the plane sits.
  const SIDES = [
    { k: 's', dx: 0, dy: 1, rot: '', horiz: true, off: 1 },
    { k: 'n', dx: 0, dy: -1, rot: 'rotateY(180deg)', horiz: true, off: 0 },
    { k: 'e', dx: 1, dy: 0, rot: 'rotateY(90deg)', horiz: false, off: 1 },
    { k: 'w', dx: -1, dy: 0, rot: 'rotateY(-90deg)', horiz: false, off: 0 },
  ];
  for (const sd of SIDES) {
    for (let fixed = (sd.horiz ? cy : cx) - R; fixed <= (sd.horiz ? cy : cx) + R; fixed++) {
      const lo = (sd.horiz ? cx : cy) - R, hi = (sd.horiz ? cx : cy) + R;
      const cell = (i) => (sd.horiz ? [i, fixed] : [fixed, i]);
      let i = lo;
      while (i <= hi) {
        const [x, y] = cell(i);
        const ch = at(x, y);
        if (!(WALL[ch] || LOW[ch]) || !open(x + sd.dx, y + sd.dy)) { i++; continue; }
        const h = LOW[ch] ? LOW_H : WALL_H, tex = wallTex(x, y);
        // A wall fronting SUNKEN ground extends its face down to that floor —
        // stopping at grade left a see-through band under every wall on a
        // moat, the trench's most natural authoring. The drop joins the
        // run-match key so a run splits where the ground under it changes.
        const nf = Math.min(0, heightAt(x + sd.dx, y + sd.dy));
        // And a TALL wall fronting a lifted-ceiling cell (a terrace under a
        // roof — the dome) extends UP to meet that ceiling, or the dome shows
        // a gap over every wall it touches. Sky cells lift nothing.
        const upOf = (ax2, ay2) => (!LOW[ch] && (!L.sky || surfAt(ax2, ay2) !== S)
          ? Math.max(0, heightAt(ax2, ay2)) * STEP_PX : 0);
        const uL = upOf(x + sd.dx, y + sd.dy);
        // The face's own middle, half a tile off the cell centre toward the gap.
        const fcx = x + 0.5 + sd.dx * 0.5, fcy = y + 0.5 + sd.dy * 0.5;
        let n = 1;
        while (n < CHUNK) {
          const [ax, ay] = cell(i + n);
          const c2 = at(ax, ay);
          if (!(WALL[c2] || LOW[c2])) break;
          if ((LOW[c2] ? LOW_H : WALL_H) !== h || wallTex(ax, ay) !== tex) break;
          if (!open(ax + sd.dx, ay + sd.dy)) break;
          if (Math.min(0, heightAt(ax + sd.dx, ay + sd.dy)) !== nf) break;
          if (upOf(ax + sd.dx, ay + sd.dy) !== uL) break;
          // The run is a segment on the face plane; both ends must be inside
          // the clear disc or its single veil would flatten a real gradient.
          const w = sd.horiz ? n + 1 : 1, d = sd.horiz ? 1 : n + 1;
          if (!flat(farCorner(sd.horiz ? x : fcx - 0.5, sd.horiz ? fcy - 0.5 : y, w, d))) break;
          n++;
        }
        const mid = sd.horiz ? [x + n / 2, fcy] : [fcx, y + n / 2];
        if ((gl || fogD(Math.hypot(mid[0] - px, mid[1] - py)) < FOG_CULL)
          && inView(mid[0], mid[1], n * 0.5)) {
          // WIDTH IS ALWAYS THE RUN. A quad's own X axis is what `rotateY(±90)`
          // swings onto the world's Z, so an east or west face `T` wide spans
          // one tile ALONG Z — and a four-cell run of them is `4T` wide in the
          // element and 4T deep in the world. Sizing those at `T` drew the run
          // squeezed into one tile with its texture repeated four times inside.
          const drop = -nf * STEP_PX;          // 0 on level ground
          const h2 = h + drop + uL;            // grade face + below-grade drop + dome rise
          add(`${sd.k}${n}:${x},${y}`, tex, n * T, h2,
            (sd.horiz ? x + n / 2 : x + sd.off) * T, -(h + uL) + h2 / 2, (sd.horiz ? y + sd.off : y + n / 2) * T,
            sd.rot, 'fp-wall', fogAt(mid[0], mid[1]), n, h2 / h);
        }
        i += n;
      }
    }
  }
  return want;
}

/**
 * HOW FAR THIS CHART CAN AFFORD TO BE SEEN — measured at mount, then held.
 *
 * The fog and the build radius are one decision, so pin them together and sweep
 * the single variable that is left. `far = R` puts the haze at exactly full
 * strength at the build edge, and `near = R − 0.3/(1 − FOG_CULL)` puts it at
 * FOG_CULL just inside — which fixes the ramp at 3.0 tiles on a phone and 7.5
 * on a desktop and makes everything nearer than that a CLEAR DISC the ground
 * and the walls may merge across losslessly.
 *
 * Then take the largest R whose want-set fits LAYER_BUDGET. Sampled at the
 * entry and the middle of the chart, four bearings each, worst case wins —
 * because a number tuned at a spawn is a number that fails in the courtyard.
 *
 * Underground this does not run: a lamp's reach is the light's statement about
 * the world, not a budget, and rock emits nothing so it was never the problem.
 */
function fitViewRadius() {
  /**
   * ON THE RASTERISER THERE IS NOTHING TO FIT. The whole chart is drawn, and
   * the fog goes back to being weather: hung off the chart's own SPAN so a big
   * estate hazes toward its far end and a one-room interior does not haze at
   * all, rather than off a layer budget. Underground keeps its authored lamp —
   * a lamp's reach is a statement about the world and always was.
   */
  if (glOn()) {
    const span = Math.max(F.cols, F.rows);
    F.viewR = span + 2;
    if (L.sky) L = { ...L, near: span * 0.45, far: span * 1.15 };
    return;
  }
  if (!L.sky) {
    F.viewR = Math.min(viewCap(), Math.ceil(L.near + FOG_CULL * (L.far - L.near)) + 1);
    return;
  }
  const budget = budgetNow();
  const ramp = 0.3 / (1 - FOG_CULL);
  // Past the chart's own span nothing more can appear, so there is no sense
  // paying to look for it.
  const hi0 = Math.min(viewCap(), Math.max(F.cols, F.rows));
  const spots = [[F.px, F.py], [F.cols / 2, F.rows / 2]];
  const fits = (R) => {
    for (const [sx, sy] of spots) {
      for (let d = 0; d < 4; d++) {
        if (layerCost(wantSet(sx, sy, d * Math.PI / 2, R, R - ramp, R)) > budget) return false;
      }
    }
    return true;
  };
  let lo = 6, hi = hi0, best = 6;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (fits(mid)) { best = mid; lo = mid + 1; } else hi = mid - 1;
  }
  F.viewR = best;
  L = { ...L, near: best - ramp, far: best };
}

/**
 * IS THE WORLD BEING DRAWN, OR COMPOSITED?
 *
 * `gl` is a per-session switch rather than a rewrite: both backends read the
 * same want-set, so they cannot drift about what the world contains, and a
 * device with no WebGL2 simply keeps the old path. @see gl-world.js.
 */
const glOn = () => !!(F && F.gl);

/**
 * A want-set entry, in the vocabulary the rasteriser takes. Same numbers, and
 * the fog is dropped on the floor: a veil is the DOM's way of saying "this
 * surface is far away" and the shader knows that from the pixel's own position.
 */
const toGlQuad = (w) => ({
  src: w.tex, w: w.w, h: w.h, x: w.tx, y: w.ty, z: w.tz, rot: w.rot,
  repX: w.nx, repY: w.ny,
});

function buildGeometry() {
  const want = wantSet(F.px, F.py, F.yaw, F.viewR, L.near, L.far);
  if (glOn()) {
    // No diff, no veils, no budget: the whole chart every time, which on the
    // estate is one buffer upload of ~1400 quads and about a dozen draw calls.
    let entries = [...want.values()];
    /**
     * THIRD PERSON SEES PAST THE ROOF — its camera lives above one the moment
     * you step indoors, and the playtest photographed the resulting acre of
     * shingle. The DOM path earned this with a tri-state x-ray; the
     * rasteriser's answer is blunter: over the shoulder, ceiling surfaces
     * stay out of the buffer entirely. First person keeps them — a corridor
     * without its dark is no corridor.
     */
    if (F.pov === 3) {
      const ceils = new Set();
      if (F.surf && F.surf.ceil) ceils.add(F.surf.ceil);
      for (const s of Object.values(F.surfByTheme || {})) if (s && s.ceil) ceils.add(s.ceil);
      if (ceils.size) entries = entries.filter((w) => !ceils.has(w.tex));
    }
    const quads = entries.map(toGlQuad);
    /**
     * THE SKIRT — one quad so the world does not visibly END.
     *
     * The composited path never had to think about this: its fog closed inside
     * the build radius, and the build radius was always well inside the chart.
     * Draw the whole chart instead and you can stand at the edge of the meadow
     * and see the ground stop at a hard line with the void behind it, which is
     * exactly what the first rasterised build did.
     *
     * So the ground plane keeps going. One tiled quad, centred on the chart and
     * reaching `L.far · 2` tiles past every edge of it, a hair BELOW the real
     * floor so the two never fight for depth. It costs one quad and one draw
     * call, and it is the oldest trick there is: the world ends in weather, and
     * nobody can walk far enough to catch it out.
     */
    if (L.sky && F.surf && F.surf.floor) {
      const reach = Math.max(F.cols, F.rows) + L.far * 2;
      const n = Math.ceil(reach * 2);
      // The skirt sinks below the chart's DEEPEST floor: at grade+2 it
      // depth-beat every sunken cell and the creek rendered as phantom grass.
      quads.push({
        src: F.surf.floor, w: n * T, h: n * T,
        x: (F.cols / 2) * T, y: 2 + Math.max(0, -F.minLv) * STEP_PX, z: (F.rows / 2) * T,
        rot: 'rotateX(90deg)', repX: n, repY: n,
      });
    }
    // The furniture's extruded volumes ride the same buffer (@see voxelProp).
    if (F.propQuads && F.propQuads.length) quads.push(...F.propQuads);
    F.gl.setGeometry(quads);
    return;
  }
  /**
   * A chart is sampled at two spots, and a courtyard can still be denser than
   * either. So the budget has a runtime floor as well: blow well past it and
   * the view closes by a tile, ONE WAY — it never re-opens, because a radius
   * that breathes as you walk is a fog bank sliding in and out of the scene.
   */
  const budget = budgetNow();
  if (layerCost(want) > budget * 1.35 && F.viewR > 6) {
    const ramp = 0.3 / (1 - FOG_CULL);
    F.viewR -= 1;
    if (L.sky) L = { ...L, near: F.viewR - ramp, far: F.viewR };
  }
  applyWants(want);
}

function applyWants(want) {
  // The diff. A quad that left the light is dropped, one that entered it is
  // built, and one that merely got darker changes a single compositor-only
  // number. This — not the traversal above — is why a step costs no raster.
  const host = F.world.querySelector('.fp-geo');
  for (const [key, q] of F.geo) {
    if (want.has(key)) continue;
    q.el.remove();
    F.geo.delete(key);
  }
  // A veil is a whole extra compositor layer per quad, and inside the clear
  // radius (fog exactly 0 — everything within L.near) it paints nothing. So
  // it is attached LAZILY, the first time a quad actually takes fog: in the
  // open retune that spares every near floor and wall its second layer,
  // which is a third of the meadow's whole layer count.
  const veilFor = (rec) => {
    if (!rec.veil) {
      rec.veil = document.createElement('i');
      rec.veil.className = 'fp-veil';
      rec.el.appendChild(rec.veil);
    }
    return rec.veil;
  };
  for (const [key, w] of want) {
    const have = F.geo.get(key);
    if (have) {
      if (have.fog !== w.fog) { have.fog = w.fog; veilFor(have).style.opacity = w.fog; }
      continue;
    }
    const el = document.createElement('div');
    el.className = 'fp-q ' + w.cls;
    el.style.cssText = `width:${w.w}px;height:${w.h}px;margin-left:${-w.w / 2}px;margin-top:${-w.h / 2}px;`
      // A merged quad repeats its tile instead of stretching it. `.fp-q` says
      // `100% 100% / no-repeat` for the single-cell case, so both live here.
      + w.rep
      + `background-image:url(${w.tex});transform:translate3d(${w.tx}px,${w.ty}px,${w.tz}px) ${w.rot}`;
    host.appendChild(el);
    const rec = { el, veil: null, fog: w.fog };
    if (w.fog > 0) veilFor(rec).style.opacity = w.fog;
    F.geo.set(key, rec);
  }
}

// ---------------------------------------------------------------------------
// Decor — everything that STANDS in the map but is not the map
// ---------------------------------------------------------------------------

/** Grid char → the decal it stands up as, and how tall it stands. */
const GRID_DECOR = {
  r: (theme) => (theme.grayProps ? 'boulderGray' : 'boulder'),
  t: () => 'stalagTall',
  m: () => 'cart',
};
/** The ways out, and what each one is. Drawn icons, never platform emoji. */
const EXIT_SIGN = { s: ['⌃', 'Way out'], w: ['⌃', 'Home'], d: [icon('door'), 'Door'] };

/** A decal stood up as a billboard, scaled to a real world height. */
function decalBillboard(sheets, decalName, x, y, worldH) {
  const d = DECALS[decalName];
  const img = d && sheets[d.sheet];
  if (!img) return;
  const cv = document.createElement('canvas');
  cv.width = d.w; cv.height = d.h;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(img, d.x, d.y, d.w, d.h, 0, 0, d.w, d.h);
  const el = addBillboard('fp-decor', '', worldH * (d.w / d.h), worldH);
  el.appendChild(cv);
  cv.style.width = '100%'; cv.style.height = '100%';
  standDecor(el, x, y);
}

/** Decor turns to the walker every frame for the same reason a creature does:
 *  a billboard is a flat plane, and a flat plane seen edge-on is nothing. */
function standDecor(el, x, y, rest) {
  // `rest` is what it is STANDING ON — 0 for the floor, a taller prop's height
  // for the ledgers on the desk. Up is negative.
  F.decor.push({ el, x, y, lift: -heightAt(Math.floor(x), Math.floor(y)) * STEP_PX - (rest || 0) });
}

/**
 * Put a billboard where it stands, turned to the walker and dimmed by its
 * distance — the same fog the geometry is baked with, or a creature would come
 * at you out of the dark at full brightness like a sticker on the screen.
 *
 * Brightness is QUANTISED to twentieths and every write is compared first: a
 * filter change re-rasterises the layer, and paying that per sprite per frame
 * for a difference nobody can see is most of what a fog costs.
 */
function place(b, x, y, lift) {
  const fog = Math.min(1, fogAt(x, y) / L.sprite);
  const hidden = fog >= 0.995;
  if (hidden !== b._hidden) { b.el.style.display = (b._hidden = hidden) ? 'none' : ''; }
  if (hidden) return;
  const tf = `translate3d(${(x * T).toFixed(1)}px,${(+lift).toFixed(1)}px,${(y * T).toFixed(1)}px)`
    + ` rotateY(${(-F.yaw * 180 / Math.PI).toFixed(1)}deg)`
    + (b.death ? ` rotateZ(${(b.death * -74).toFixed(1)}deg) scale(${(1 - b.death * 0.34).toFixed(3)},${(1 - b.death * 0.66).toFixed(3)})` : '');
  if (tf !== b._tf) b.el.style.transform = (b._tf = tf);
  /**
   * Distance is OPACITY, not brightness. Brightness fades to black, which is
   * only right underground — in open air a far-off badger must wash out PALE,
   * toward the same daylight the walls fade into. Fading toward transparent
   * over a stage painted in the light's own colour is correct for both, and it
   * is a compositor-only property, so it does not re-rasterise the layer.
   *
   * (`opacity < 1` flattens transform-style on the element it is set on. Safe
   * here — .fp-bb's children are a flat canvas and a flat bar — but it is the
   * exact trap that squashed every standee in the top-down view, so: never put
   * this on a wrapper whose CHILD carries a 3D counter-rotation.)
   *
   * A BODY is dimmer than a thing that is alive, and that dim rides here too.
   * It used to be `.fp-corpse { filter: grayscale() brightness() }` in CSS —
   * a filter, on a billboard, for the rest of the delve, fourteen of them at
   * CORPSE_CAP, each forcing its own render surface on a phone that is already
   * out of them. Fading a body toward the light's own colour is the same answer
   * distance already gets, and it costs nothing.
   */
  const lit = Math.round((1 - fog) * (b.death != null ? 0.62 : 1) * 20) / 20;
  if (lit !== b._lit) { b._lit = lit; b.el.style.opacity = lit; }
  // A struck creature flashes white — the one piece of feedback that has to
  // arrive before the number does.
  const hurt = b.hurtUntil > performance.now();
  const dead = b.death != null;
  if (hurt !== b._hurt || dead !== b._dead) {
    b._hurt = hurt; b._dead = dead;
    // The drop-shadow is a per-sprite blur buffer — decorative on desktop,
    // unaffordable on a dpr-3 phone, and NEVER left on a body: every creature
    // that dies has been hurt, so this line used to hand each of the fourteen
    // corpses a permanent render surface on the way out. The hurt flash stays
    // on both: it is feedback, brief, and on one creature at a time.
    b.el.style.filter = (COARSE || dead ? '' : 'drop-shadow(0 4px 5px rgba(0,0,0,0.6))')
      + (hurt ? ' brightness(2.6) saturate(0.2)' : '');
  }
  // The bar only exists while the thing is hurt, so an untouched room is clean.
  if (b.bar) {
    const show = b.hp != null && b.hp < HP_MAX;
    if (show !== b._bar) { b.bar.style.display = (b._bar = show) ? 'block' : 'none'; }
    if (show) {
      const w = Math.max(0, b.hp) + '%';
      if (w !== b._bw) { b.bar.firstChild.style.width = (b._bw = w); }
    }
  }
}

/** A sign you can read from down the corridor — the only honest way to tell a
 *  first-person walker that the square ahead is the stairs and not more floor. */
function markerBillboard(glyph, label, cls, x, y) {
  const el = addBillboard('fp-marker ' + cls,
    `<span class="fpm-glyph">${glyph}</span><span class="fpm-label">${label}</span>`, 560 * K, 560 * K);
  standDecor(el, x, y);
}

// ---------------------------------------------------------------------------
// Solids — the furnishings that have a VOLUME, not just a picture
// ---------------------------------------------------------------------------

/**
 * THE ARENA'S LESSON, APPLIED HERE.
 *
 * `buildDressing` in action-fp.js already learned this: a billboard is for
 * things that FACE you, and furniture is not one of them. A desk turned into a
 * camera-facing card is a desk that touches the floor along a single line and
 * swings as you walk past it; and because its height was width × the crop's
 * aspect ratio, it was also three times too tall. @see prop-volume.js for the
 * measured list of what that produced.
 *
 * So a furnishing with an authored volume is emitted as GEOMETRY: static quads,
 * placed once in world space, never rotated again. That is not only more
 * honest, it is cheaper than what it replaces — a static face's transform
 * string never changes, so the per-frame write guard rejects every write for
 * the life of the map, where a billboard rewrote its transform on every turn.
 *
 * They live in `.fp-bbs` rather than `.fp-geo` because `.fp-geo` is diffed
 * against the view radius every step and would evict anything it did not put
 * there itself.
 */
const SOLID_HOST = () => F.world.querySelector('.fp-bbs');

/**
 * A static quad. Fog is a `.fp-veil` child, exactly as the walls do it, rather
 * than the opacity a billboard uses — a solid standing against a wall must take
 * the dark at the same rate as the wall behind it or it floats off the surface.
 */
function solidQuad(host, css, w, h, tx, ty, tz, rot, anchor, cls) {
  const el = document.createElement('div');
  el.className = 'fp-q fp-solid' + (cls ? ' ' + cls : '');
  // BORN HIDDEN, and shown by the first fogSolids() that finds it in range.
  // The estate's chart carries the furniture of every stamped room on it at
  // once — a couple of hundred quads, nearly all of them a long way off — and
  // creating them visible would put the whole lot on the compositor for the one
  // frame between building the map and fogging it. That frame is exactly the
  // budget a phone has no slack in.
  el.style.cssText = `display:none;width:${w.toFixed(1)}px;height:${h.toFixed(1)}px;`
    + `margin-left:${(-w / 2).toFixed(1)}px;margin-top:${(-h / 2).toFixed(1)}px;${css}`
    + `transform:translate3d(${tx.toFixed(1)}px,${ty.toFixed(1)}px,${tz.toFixed(1)}px)${rot ? ' ' + rot : ''}`;
  host.appendChild(el);
  F.solids.push({ el, x: anchor.x, y: anchor.y, veil: null, fog: -1, off: true });
  return el;
}

/**
 * Fog every solid, once a frame. Same contract as the geometry's: quantised, so
 * an idle frame writes nothing, and culled entirely past FOG_CULL — a solid
 * that has faded into the light's own colour is indistinguishable from one that
 * was never drawn, and `display:none` takes its layer out of the compositor
 * rather than merely making it invisible.
 */
function fogSolids() {
  /**
   * Furniture has its OWN horizon, shorter than the ground's.
   *
   * Fog alone used to decide this, which was fine at a 16-tile vista and is not
   * at 30: the campus chart carries every stamped room's furnishings at once, so
   * opening the distance would have put a hundred desks and barrels on the
   * compositor to be drawn a few pixels tall each. Scenery you cannot read is
   * scenery you should not be paying a layer for — the ground, the buildings and
   * the tree line are what a vista is made of.
   */
  const solidR = COARSE ? 14 : 20;
  for (const s of F.solids) {
    const f = fogAt(s.x, s.y);
    const off = f >= FOG_CULL || Math.hypot(s.x - F.px, s.y - F.py) > solidR;
    if (off !== s.off) { s.el.style.display = (s.off = off) ? 'none' : ''; }
    if (off) continue;
    const q = fogQ(f);
    if (q === s.fog) continue;
    s.fog = q;
    if (!q && !s.veil) continue;   // inside the clear radius: no second layer
    if (!s.veil) {
      s.veil = document.createElement('i');
      s.veil.className = 'fp-veil';
      s.el.appendChild(s.veil);
    }
    s.veil.style.opacity = q;
  }
}

/**
 * FLAT ON THE FLOOR — for art drawn in PLAN. The beds: their sheet draws a bunk
 * from ABOVE, so a camera-facing sprite stands them on their footboards, which
 * is how the dormitory came to be full of beds on end. One quad, in the plane
 * the picture was actually painted for. Doom's floor detail, and no more
 * geometry than the sprite it replaces.
 *
 * A hair above the floor for the same reason the rails are: two coplanar quads
 * fight for depth and flicker.
 */
function lieSolid(host, p, vol, fp, base) {
  const w = fp.w * T, d = fp.d * T;
  // A bed blocks like a bed: its own footprint's circle, now that 'f' cells
  // no longer hard-block (@see canStandAt).
  F.propBlockers.push({ x: fp.cx, y: fp.cy, r: Math.max(0.14, Math.min(0.5, Math.max(fp.w, fp.d) * 0.45)) });
  // Under GL the bed joins the BUFFER — a DOM solid composites over the
  // canvas with no depth test, which is how every bed on the estate showed
  // through every wall on the estate (playtest). Same numbers, real depth.
  if (glOn()) {
    // A bed is a MATTRESS, not a rug: the plan art becomes the TOP at the
    // volume table's own thickness, and walls drop from its silhouette to
    // the floor (@see extrudePlan — playtest: "beds are flat in the floor").
    const mapId = F.map.id;
    voxCrop(p.art).then((cv) => {
      if (!F || !F.gl || F.map.id !== mapId) return;
      const t = Math.max(8, vol.h * T * 0.85);
      F.propQuads.push(...extrudePlan(cv, { x: fp.cx * T, y: base, z: fp.cy * T, w, d, h: t }));
      buildGeometry();
    }).catch(() => {});
    return;
  }
  const el = solidQuad(host, artCropCss(p.art), w, d,
    fp.cx * T, base - Math.max(2, vol.h * T * 0.5), fp.cy * T, 'rotateX(90deg)', p);
  if (p.label) el.title = p.label;
}

/**
 * Bolted to the wall it hangs on, at the height it hangs at.
 *
 * Which wall is read from the MAP, once, here — the arena's `face` lesson. The
 * estate authors every hung thing a hair proud of its wall (`y: 2.02`), so the
 * anchor is already in front of the stone; all this has to find is which of the
 * four neighbours is the stone. A portrait with no wall behind it is a mistake
 * in the chart, and falls back to a billboard rather than being silently
 * pasted onto thin air.
 */
const WALL_FACE = [
  [0, -1, ''],                 // stone to the north — face south
  [0, 1, 'rotateY(180deg)'],
  [1, 0, 'rotateY(-90deg)'],
  [-1, 0, 'rotateY(90deg)'],
];
function wallSolid(host, p, vol, base) {
  const tx = Math.floor(p.x), ty = Math.floor(p.y);
  const face = WALL_FACE.find(([dx, dy]) => isWall(tx + dx, ty + dy) || isLow(tx + dx, ty + dy));
  if (!face) return false;
  const h = vol.h * T, w = h * (ART[p.art].w / ART[p.art].h);
  // Same story as lieSolid: hung things join the buffer under GL, so a
  // portrait is depth-tested against the wall it hangs on.
  if (glOn()) {
    const mapId = F.map.id;
    voxCrop(p.art).then((cv) => {
      if (!F || !F.gl || F.map.id !== mapId) return;
      F.propQuads.push({ src: cv, w, h, x: p.x * T, y: base - vol.mid * T, z: p.y * T, rot: face[2], uv: [0, 0, 1, 1] });
      buildGeometry();
    }).catch(() => {});
    return true;
  }
  const el = solidQuad(host, artCropCss(p.art), w, h,
    p.x * T, base - vol.mid * T, p.y * T, face[2], p);
  if (p.label) el.title = p.label;
  return true;
}

/**
 * Stand up everything the chart says is in the room. The top-down walk has
 * always done this (delve.js decorates the same grid chars); first person
 * declared `PROP` and then used it for nothing but collision, so a boulder was
 * an invisible wall, a cart was an invisible wall, and the stairs you were
 * looking for were a patch of floor indistinguishable from any other.
 *
 * Built ONCE per map: none of it moves, and mining a face doesn't touch it.
 */
function buildDecor(sheets) {
  F.decor = []; F.doors = []; F.solids = [];
  const theme = F.theme, map = F.map;
  for (let y = 0; y < F.rows; y++) {
    for (let x = 0; x < F.cols; x++) {
      const ch = F.grid[y][x];
      const pick = GRID_DECOR[ch];
      if (pick) {
        // The meadow's 't' is a tree, not a stalagmite — same rule as delve.js.
        if (ch === 't' && map.theme === 'meadow') artBillboardH('treeTall', x + 0.5, y + 0.5, DECOR_H.tree);
        else {
          const name = pick(theme);
          decalBillboard(sheets, name, x + 0.5, y + 0.5, DECOR_H[name] || 700 * K);
        }
      }
      const sign = EXIT_SIGN[ch];
      if (sign || ch === '+') {
        // A way out must be a THING you can see, not a lucky patch of floor.
        // The wagon exit stands the same wagon the top-down walk parks there
        // (82px against a 48px tile, the width that view already chose), with
        // the sign floating over it; bare exits keep the sign alone. Stood up
        // BEFORE the marker so the label paints over the canvas, not under it.
        if (ch === 'w') artBillboard('wagon', x + 0.5, y + 0.5, 82 * (T / 48), 'The wagon home');
        if (sign) markerBillboard(sign[0], sign[1], 'fpm-exit', x + 0.5, y + 0.5);
        else markerBillboard('◈', 'Onward', 'fpm-portal', x + 0.5, y + 0.5);
        // The grid char rides along: checkDoors has to know whether reaching
        // this one pops the stack ('d') or ends the delve ('s'/'w'), which the
        // old arrival path re-read from the cell it had just landed on.
        F.doors.push({ x: x + 0.5, y: y + 0.5, ch, dead: false });
      }
    }
  }
  buildProps(map.props || []);
  // The estate's buildings. A ROOMED one is its walls — the stamped ring is
  // real geometry here — so it only needs its name over the door. An annex has
  // no room behind its 'F' mass, so its facade art stands at the front.
  for (const b of (map.facades || [])) {
    if (b.roomed) {
      const d = b.door || [b.x + Math.floor(b.w / 2), b.y + b.h - 1];
      markerBillboard('', b.name, 'fpm-sign', d[0] + 0.5, d[1] + 1.4);
    } else {
      artBillboard(b.art, b.x + b.w / 2, b.y + b.h + 0.04, Math.min(b.w * T, (b.px || b.w * 48) * (T / 48)), b.name);
    }
  }
}

/**
 * The authored furnishings — HEXEN'S RULE. Architecture is geometry; everything
 * standing in the room is ONE sprite that turns to face you. No crossed quads,
 * no lids, no boxes. @see prop-volume.js for the two rounds of building volume
 * out of a single elevation and the playtest killing both.
 *
 * What the volume table is FOR, then, is the size: `artBillboardH` takes the
 * authored HEIGHT and lets the crop's own proportions give the width, which is
 * the whole of what was ever wrong (a desk 1.03 tiles tall in a 1.4-tile room).
 * Shape was never the bug.
 *
 * `lie` and `wall` are the two exceptions, and both are single quads too: a bed
 * is drawn in PLAN so it goes flat on the floor, and a hung portrait is a
 * texture on the one thing in the room that genuinely has volume — the wall.
 *
 * AND THEY STAND IN THE MIDDLE OF A TILE, not on the line between two. The
 * charts anchor a furnishing on its cell's SOUTH EDGE — `y: 4` for a bunk whose
 * `'f'` is at row 3 — because that is the top-down view's foot line, with the
 * art rising north from it into the marked cell. Taken literally here it plants
 * every piece of furniture on a boundary; `propCell` reads the line back into
 * the cell it means. @see prop-volume.js.
 *
 * Footprints survive for ONE job: deciding what is standing on what. `gmLedgers`
 * is authored to OVERLAP `gmDesk`, because that reads as "ledgers on the desk"
 * in the top-down view; taken literally in three dimensions it is a stack of
 * books at floor level beside a desk. A small prop whose anchor falls inside a
 * taller one's footprint stands on it instead. No new authoring, checked against
 * the heights the props already declare.
 *
 * A prop with no volume keeps the OLD billboard, sized from the top-down view's
 * pixel width — which is the sizing this replaces, so it is a gap, not a default.
 */
/**
 * REAL VOLUME, from the art itself — the DramaticShape recipe (@see
 * voxel-sprite.js). GL only; one extrusion per ART NAME is cached as its
 * pixel-readable crop, then placed per prop. Quads land in F.propQuads and
 * buildGeometry spreads them into every rebuild; a sheet that never decodes
 * costs that prop its volume, nothing else.
 */
const _voxCache = {};
/** One pixel-readable crop per ART name, cached, alpha HARD-THRESHOLDED —
 *  kit art carries anti-aliased edges, and a half-transparent pixel makes a
 *  half-transparent voxel: the playtest saw the wall through the statue. A
 *  carved thing is solid or it is air. */
function voxCrop(art) {
  if (_voxCache[art]) return _voxCache[art];
  const a = ART[art];
  const rec = artTexRect(art);
  if (!a || !rec) return Promise.reject(new Error('voxel: no art ' + art));
  _voxCache[art] = new Promise((res, rej) => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => {
      try {
        const cv = document.createElement('canvas');
        cv.width = a.w; cv.height = a.h;
        const g = cv.getContext('2d', { willReadFrequently: true });
        g.drawImage(im, a.x, a.y, a.w, a.h, 0, 0, a.w, a.h);
        const id = g.getImageData(0, 0, a.w, a.h);
        const d = id.data;
        for (let i = 3; i < d.length; i += 4) d[i] = d[i] < 128 ? 0 : 255;
        g.putImageData(id, 0, 0);
        res(cv);
      } catch (e) { delete _voxCache[art]; rej(e); }
    };
    im.onerror = () => { delete _voxCache[art]; rej(new Error('voxel: ' + art + ' sheet failed')); };
    im.src = rec.url;
  });
  return _voxCache[art];
}
function voxelProp(art, tx, ty, vol, lift) {
  const a = ART[art];
  if (!a) return;
  const mapId = F.map.id;
  voxCrop(art).then((cv) => {
    if (!F || !F.gl || F.map.id !== mapId) return;   // the map moved on
    const h = vol.h * T, w = h * (a.w / a.h);
    // Depth never beats the art's own width — a barrel deeper than it is
    // wide is a crate wearing a barrel's face (playtest: "too thick").
    const d = Math.min(Math.min(0.6, vol.d || 0.3) * T, w * 0.8);
    const q = extrudeSprite(cv, { x: tx * T, y: -lift, z: ty * T, h, d });
    if (!q.length) return;
    F.propQuads.push(...q);
    buildGeometry();   // fold them into the live buffer now, not next stride
  }).catch(() => { /* billboardless, not broken */ });
}

function buildProps(props) {
  const host = SOLID_HOST();
  const plan = props.map((p) => {
    const a = ART[p.art];
    const vol = a ? propVolume(p.art) : null;
    if (!vol) return { p, vol: null, at: p };
    // `wall` keeps its authored point: it is not standing in a cell, it is hung
    // a hair proud of a wall face, and that hair is the whole placement.
    const at = vol.form === 'wall' ? p : propCell(p);
    // A standing thing is as wide as its own art says, given the height; a `lie`
    // is drawn in plan, so its LENGTH is the authored number and width follows.
    if (vol.form === 'lie') return { p, vol, at, fp: footprint(at, vol.d * (a.w / a.h), vol.d) };
    if (vol.d) return { p, vol, at, fp: footprint(at, vol.h * (a.w / a.h), vol.d) };
    return { p, vol, at };
  });
  const shelves = plan.filter((q) => q.fp);
  /** How high the ground under this prop really is — 0, or a taller prop's top. */
  const restOn = (q) => {
    let top = 0;
    for (const s of shelves) {
      if (s === q || s.vol.h <= q.vol.h || s.vol.h <= top) continue;
      if (q.at.x < s.fp.x0 - REST_SLOP || q.at.x > s.fp.x1 + REST_SLOP) continue;
      if (q.at.y < s.fp.y0 - REST_SLOP || q.at.y > s.fp.y1 + REST_SLOP) continue;
      top = s.vol.h;
    }
    return top;
  };
  for (const q of plan) {
    const { p, vol, at } = q;
    if (!vol) {
      // `w` is the top-down view's pixels against its 48px tile, so w/48 is the
      // thing's width in TILES and T/48 carries it straight across. Left on the
      // authored anchor: a prop with no volume has not been looked at yet, and
      // moving it would hide that.
      artBillboard(p.art, p.x, p.y, (p.w || 48) * (T / 48), p.label);
      continue;
    }
    // The ground UNDER THE CELL IT STANDS IN, not under the line it was
    // authored on — those are different cells on a ledge.
    const ground = -heightAt(Math.floor(at.x), Math.floor(at.y)) * STEP_PX;
    if (vol.form === 'wall') {
      // Nothing to bolt it to is a fault in the chart, not something to paper
      // over: fall back to the sprite so it is still visible and still wrong.
      if (!wallSolid(host, at, vol, ground)) artBillboard(p.art, at.x, at.y, (p.w || 48) * (T / 48), p.label);
      continue;
    }
    const rest = restOn(q);
    if (vol.form === 'lie') { lieSolid(host, p, vol, q.fp, ground - rest * T); continue; }
    /**
     * ONE SIZE FACT (CLAUDE.md law, user decree 2026-08-06: "all objects
     * should be the same size, relatively, across perspectives — I'm
     * building a game where each perspective is valid"). The chart's own
     * authored width `p.w` (px against the 48px tile) is what the top-down
     * draws; every lens derives from THAT, so a bookshelf cannot be knee-high
     * here and shoulder-high there. The volume table's `h` survives only as
     * the fallback for props no chart gives a width.
     */
    const artRec = ART[p.art];
    let wTiles = p.w ? p.w / 48 : vol.h * (artRec.w / artRec.h);
    let hTiles = wTiles * (artRec.h / artRec.w);
    // THE LAW SURVIVES THE ROOF: a prop that cannot fit under a ceiling is
    // scaled WHOLE (width and height together — the aspect is the art's own
    // truth) and reported, because the real fix is the CHART's number, never
    // a per-lens patch (playtest: "cabinet extending through the roof").
    const CEIL_T = 1.35;
    if (hTiles > CEIL_T) {
      console.warn(`delve-fp: ${p.art} at ${at.x},${at.y} runs ${hTiles.toFixed(2)} tiles tall — scaled to fit ${CEIL_T}; `
        + `re-author its chart w (max ≈ ${(CEIL_T * (artRec.w / artRec.h) * 48).toFixed(0)}px)`);
      const s = CEIL_T / hTiles;
      hTiles *= s; wTiles *= s;
    }
    /**
     * ONE COLLISION FACT: a thing blocks the space its ART occupies. The
     * circle's radius comes from the drawn width — canStandAt exempts 'f'
     * cells so the coarse tile-block stops standing a body-width proud of a
     * small shelf ("bigger than art" collision is a bug by definition).
     * Things resting ON other things block nothing.
     */
    if (!(rest > 0)) {
      // The 0.12 floor exists so a small thing still stops a foot — but never
      // wider than the art's own half-width (a potion bottle is 8px; a blocker
      // past its glass is "bigger than the art", the law's own definition).
      F.propBlockers.push({ x: at.x, y: at.y, r: Math.min(wTiles / 2, Math.max(0.12, wTiles * 0.42)) || 0.06 });
    }
    // Under GL a standing thing gets its VOLUME BACK — extruded from its own
    // pixels (@see voxel-sprite.js) — unless the table says `flat` (animated
    // art, leafy organics: a carving cannot stir). The composited path keeps
    // Hexen's answer: ONE SPRITE, turned to the walker every frame by place().
    if (glOn() && !vol.flat) {
      voxelProp(p.art, at.x, at.y, { ...vol, h: hTiles }, rest * T);
      continue;
    }
    artBillboardH(p.art, at.x, at.y, hTiles * T, p.label, rest * T);
  }
}

/** An art.js crop stood up. `worldW` is its width in world px; the height
 *  follows from the crop's own proportions, which is what keeps it a thing and
 *  not a stretched picture of one. */
function artBillboard(name, x, y, worldW, title, rest) {
  const html = artSprite(name, '', 'width:100%;height:100%');
  if (!html) return;
  const a = ART[name];
  const el = addBillboard('fp-decor', html, worldW, worldW * (a.h / a.w));
  // The DOM draws this crop as a background-position; the rasteriser needs the
  // same rectangle as a texture and four UVs. One table, two spellings.
  el._glTex = artTexRect(name);
  if (title) el.title = title;
  standDecor(el, x, y, rest);
}
/** The same, given a HEIGHT — which is how everything with an authored volume
 *  is sized (@see prop-volume.js), and the one thing that was ever wrong. */
function artBillboardH(name, x, y, worldH, title, rest) {
  const a = ART[name];
  if (a) artBillboard(name, x, y, worldH * (a.w / a.h), title, rest);
}

// ---------------------------------------------------------------------------
// Billboards — creatures, props and markers, always turned to the walker
// ---------------------------------------------------------------------------

function addBillboard(cls, inner, w, h) {
  const el = document.createElement('div');
  el.className = 'fp-bb ' + cls;
  el.style.width = w + 'px';
  el.style.height = h + 'px';
  el.style.marginLeft = (-w / 2) + 'px';
  el.innerHTML = inner;
  F.world.querySelector('.fp-bbs').appendChild(el);
  return el;
}

/**
 * The tight box the art occupies inside a walk-sheet frame, in frame-local
 * coordinates, taken as the UNION over all twelve frames.
 *
 * RPG-Maker charsets centre a small sprite in a generous cell, and how much
 * padding a given sheet leaves is an accident of that sheet. Scaling by the
 * FRAME therefore makes a well-drawn creature small and a badly-cropped one
 * large; scaling by the union of its real pixels makes the rank the only thing
 * that decides. The union (not the one frame) is what stops the sprite
 * jittering as it walks.
 */
const _trimCache = {};
function trimBox(art, img, fw, fh) {
  if (_trimCache[art] !== undefined) return _trimCache[art];
  let box = null;
  try {
    const W = img.naturalWidth, H = img.naturalHeight;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, W, H).data;
    const tiled = W === fw * 3 && H === fh * 4;   // only then is x%fw a frame coordinate
    let x0 = fw, y0 = fh, x1 = -1, y1 = -1;
    for (let py = 0; py < H; py++) {
      for (let px = 0; px < W; px++) {
        if (d[(py * W + px) * 4 + 3] < 12) continue;
        const lx = tiled ? px % fw : px, ly = tiled ? py % fh : py;
        if (lx < x0) x0 = lx;
        if (ly < y0) y0 = ly;
        if (lx > x1) x1 = lx;
        if (ly > y1) y1 = ly;
      }
    }
    if (x1 >= 0) box = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  } catch (e) {
    console.warn('delve-fp: could not measure', art, e);   // tainted canvas — fall back
  }
  return (_trimCache[art] = box);
}

/** The walk cycle, in sheet columns — the same [1,2,1,0] the compositor uses. */
const WALK_COLS = [1, 2, 1, 0];

/** Repaint a creature's canvas. Cheap, and only ever called on a frame change. */
function drawCreature(c) {
  const g = c.cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, c.cv.width, c.cv.height);
  g.drawImage(c.img, c.col * c.fw + c.box.x, c.row * c.fh + c.box.y, c.box.w, c.box.h,
    0, 0, c.box.w, c.box.h);
  c.drawn = c.row * 4 + c.col;
  // The rasteriser re-uploads this canvas when the stamp moves (@see texFor).
  c.cv._glRev = (c.cv._glRev || 0) + 1;
}

function spawnCreature(prey, img, x, y) {
  const fw = Math.floor(img.naturalWidth / 3), fh = Math.floor(img.naturalHeight / 4);
  const box = trimBox(prey.art, img, fw, fh) || { x: 0, y: 0, w: fw, h: fh };
  const aspect = box.w / box.h;
  // Rank sets the height, but nothing may be wider than the passage it stands
  // in: a Slime Sovereign is squat (1.04 wide per tall), so rank 5's 1080 put
  // it 1127 across a 900px tile and its shoulders inside both walls.
  let h = CREATURE_H[Math.min(5, Math.max(1, prey.rank || 1))];
  const maxW = T * 0.92;
  if (h * aspect > maxW) h = maxW / aspect;
  const cv = document.createElement('canvas');
  cv.width = box.w; cv.height = box.h;
  const el = addBillboard('fp-creature', '<div class="fp-hp"><i></i></div>', h * aspect, h);
  el.insertBefore(cv, el.firstChild);
  cv.style.width = '100%'; cv.style.height = '100%';
  const c = {
    prey, img, el, cv, fw, fh, box, x, y, home: { x, y },
    // Committed surface — spawns stand on the ground of their cell.
    lv: (F.model ? (F.model.surfacesAt(Math.floor(x), Math.floor(y))[0] || 0) : 0),
    mode: 'idle', t: 1 + Math.random() * 2, tx: x, ty: y,
    row: 0, col: 1, drawn: -1, phase: Math.random() * 4, vx: 0, vy: 0,
    hp: HP_MAX, atkAt: 0, hurtUntil: 0, bar: el.querySelector('.fp-hp'),
    // Fixed per creature so a circling thing keeps going the same way round
    // instead of shivering between the two.
    spin: Math.random() < 0.5 ? -1 : 1,
    // Where it is FACING, in the world — the rotation rows are cut from this.
    // Random at spawn so a chamber of idle things looks inhabited rather than
    // paraded, and so some of them start with their backs to the door.
    head: Math.random() * Math.PI * 2,
    aggro: false, staggerUntil: 0, windUntil: 0,
  };
  drawCreature(c);
  F.creatures.push(c);
}

// ---------------------------------------------------------------------------
// The hands — what you are carrying, held where you can see it
// ---------------------------------------------------------------------------

/**
 * Build the viewmodel from the member's real kit.
 *
 * `hooks.gear` is what hall.js says is equipped — kind and material, nothing
 * else — and art.js turns that pair into a 32px icon cell. The RIGHT hand is
 * the weapon slot, mirrored so the hilt sits at the near corner and the blade
 * rises into frame; the LEFT is a shield, which is what the body slot looks
 * like from behind your own arm (there is no shield slot to read).
 *
 * Nothing is invented: a member with an empty weapon slot shows empty hands,
 * and is told so on the way in, because that is a fact about the delve worth
 * knowing before the first Old Delver.
 */
async function mountHands() {
  const host = F.host.querySelector('.fp-hands');
  if (!host) return;
  // `meet`, not `none`: the dash that draws the arc is measured in USER units,
  // so the viewBox has to scale uniformly or the pattern and the path disagree
  // about how long the path is. (The first cut stretched it and kept the stroke
  // width honest with vector-effect — which put the dashes in SCREEN px against
  // a 122-unit path, and the arc came out as three disconnected chunks.)
  host.innerHTML = '<svg class="fp-slash" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">'
    + '<path d="M92 6 C 60 34, 34 60, 8 94" /></svg>';
  const hands = { el: host, weapon: null, shield: null, pick: null };
  F.hands = hands;
  const gear = F.hooks.gear || {};
  // Sheet loads are slow enough to outlive the delve that asked for them, so
  // every await is followed back into a session that may already be gone.
  const live = () => !!F && F.hands === hands;
  const put = async (src, frames, cls, title) => {
    if (!src) return null;
    try {
      const img = await loadImg(src.url);
      if (!live()) return null;
      // Cropped to the UNION of the frames it will show, so the art fills the
      // hand instead of floating in a mostly-empty 48px cell — and so nothing
      // shifts as the swing steps through.
      const box = cellUnion(img, WORN.row, frames);
      if (!box) return null;
      // ALSO measure the resting frame alone. The union is set by the big slash
      // cells, so the stand pose is a small part of it — a sword measures 8×11
      // inside a 19×34 box. Sizing the element by the union therefore drew the
      // thing you look at 95% of the time at a third of the size it should be.
      const rest = cellUnion(img, WORN.row, [frames[0]]) || box;
      const cv = document.createElement('canvas');
      cv.width = box.w; cv.height = box.h;
      const el = document.createElement('div');
      el.className = 'fp-hand ' + cls;
      el.title = title || '';
      el.appendChild(cv);
      host.appendChild(el);
      const hand = { el, cv, img, box, rest, frames, at: -1, timer: 0, side: cls.indexOf('shield') >= 0 ? 'left' : 'right' };
      handFrame(hand, frames[0]);
      return hand;
    } catch (e) {
      console.warn('delve-fp: hand art missing', cls, e);
      return null;
    }
  };
  const w = gear.weapon, b = gear.body;
  const SW = [WORN.rest].concat(WORN.swing);
  // A bow animates on its own block of the sheet — see WORN.bowDraw.
  const wFrames = w && w.kind === 'bow' ? WORN.bowDraw : SW;
  hands.weapon = await put(w && wornWeapon(w.kind, w.material), wFrames, 'fp-hand-weapon', w && w.name);
  // A bow is two-handed: nothing braces an off-hand shield behind it.
  if (live() && !(w && w.kind === 'bow')) {
    hands.shield = await put(b && wornShield(b.material), WORN.shieldBrace, 'fp-hand-shield', b && b.name);
  }
  // The PICK is not equipment — it is what a delver walks in carrying. It comes
  // out for a seam whatever else is in hand, and when the weapon slot is empty
  // it is the only thing there, so the hands are never simply blank.
  if (live()) hands.pick = await put(wornPick(), SW, 'fp-hand-pick' + (hands.weapon ? ' fp-stowed' : ''), 'Delver’s pick');
  if (live()) { fitHands(); for (const h of [hands.weapon, hands.shield, hands.pick]) if (h) h.el.classList.add('fp-ready'); }
}

/**
 * Put the hands where an Elder Scrolls viewmodel puts them: the weapon filling
 * the near corner at about REST_H of the screen, its grip running off the
 * bottom edge.
 *
 * Sized and placed from the REST frame, in JS, because every sheet's art sits
 * somewhere different inside its cell — a sword's stand pose is 8×11 low in a
 * 19×34 union, a pick's is 16×24 in a 25×34 — so no single CSS rule can put
 * them all in the same place. The element still carries the whole UNION (that
 * is what keeps the swing registered); we simply scale and offset it so the
 * part you see at rest lands in the corner, and let the swing frames sweep out
 * of the box across the view. #delveFpScreen clips, so the overflow is free.
 */
const REST_H = 0.44, SHIELD_H = 0.36, HAND_INSET = 0.045;
function fitHands() {
  if (!F || !F.hands) return;
  const stage = F.host.querySelector('.fp-stage');
  const W = stage ? stage.clientWidth : 1280, H = stage ? stage.clientHeight : 720;
  for (const h of [F.hands.weapon, F.hands.pick, F.hands.shield]) {
    if (!h) continue;
    const b = h.box, r = h.rest;
    const share = r.h / b.h;                             // how much of the box the rest pose is
    const elH = Math.round((h.side === 'left' ? SHIELD_H : REST_H) * H / share);
    const elW = Math.round(elH * (b.w / b.h));
    h.el.style.height = elH + 'px';
    h.el.style.width = elW + 'px';
    // Fractions of the element the rest art's edges fall at.
    const right = (r.x + r.w - b.x) / b.w, left = (r.x - b.x) / b.w;
    const bottom = (r.y + r.h - b.y) / b.h;
    h.el.style.bottom = Math.round(HAND_INSET * H - (1 - bottom) * elH) + 'px';
    if (h.side === 'left') h.el.style.left = Math.round(HAND_INSET * W - left * elW) + 'px';
    else h.el.style.right = Math.round(HAND_INSET * W - (1 - right) * elW) + 'px';
    // The PIVOT is the GRIP — the bottom-centre of the rest pose within the
    // union box. The swing keyframes only rotate; about this point the rotation
    // reads as a wrist. About the default origin (the centre of a box fitHands
    // has just grown to near screen height, ~350px from the visible weapon) the
    // same keyframes carried the weapon around the entire viewport. Inline for
    // the same reason the sizing is: it is per-sheet, and re-set on resize.
    h.el.style.transformOrigin = ((r.x + r.w / 2 - b.x) / b.w * 100).toFixed(1) + '% '
      + ((r.y + r.h - b.y) / b.h * 100).toFixed(1) + '%';
  }
}

/** The tight box a set of frames occupies inside one row of a 48px sheet, in
 *  cell-local coordinates. Union, not per-frame, or the art jumps as it plays. */
function cellUnion(img, row, cols) {
  const S = WORN.cell;
  try {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let x0 = S, y0 = S, x1 = -1, y1 = -1;
    for (const col of cols) {
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const px = col * S + x, py = row * S + y;
          if (px >= c.width || py >= c.height) continue;
          if (d[(py * c.width + px) * 4 + 3] < 12) continue;
          if (x < x0) x0 = x;
          if (y < y0) y0 = y;
          if (x > x1) x1 = x;
          if (y > y1) y1 = y;
        }
      }
    }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  } catch (e) {
    console.warn('delve-fp: could not measure hand art', e);
    return null;
  }
}

/** Paint one sheet column into a hand's canvas. */
function handFrame(hand, col) {
  if (hand.at === col) return;
  hand.at = col;
  const S = WORN.cell, b = hand.box;
  const g = hand.cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, b.w, b.h);
  g.drawImage(hand.img, col * S + b.x, WORN.row * S + b.y, b.w, b.h, 0, 0, b.w, b.h);
}

/** Step a hand through its frames and settle back on the first. */
function playFrames(hand, cols) {
  if (!hand) return;
  clearInterval(hand.timer);
  let i = 0;
  handFrame(hand, cols[0]);
  hand.timer = setInterval(() => {
    i++;
    if (i >= cols.length) { clearInterval(hand.timer); hand.timer = 0; handFrame(hand, hand.frames[0]); return; }
    handFrame(hand, cols[i]);
  }, WORN.frameMs);
}

/**
 * Throw the swing. `mining` brings the pick out and stows the blade for the
 * duration, because you do not open a vein with a sword.
 *
 * Retriggering needs the class off, a reflow, and the class back on, or a
 * second swing inside the first simply doesn't play.
 */
function playSwing(mining) {
  const H = F.hands;
  if (!H) return;
  const lead = mining ? (H.pick || H.weapon) : (H.weapon || H.pick);
  // One hand leads and the other stows. The stowed hand must also DROP its
  // swing class: an animation outranks a plain transform, so a pick left
  // mid-swing would keep swinging from inside the holster.
  for (const h of [H.weapon, H.pick]) {
    if (!h) continue;
    const off = h !== lead;
    h.el.classList.toggle('fp-stowed', off);
    if (off) { h.el.classList.remove('fp-swinging'); clearInterval(h.timer); handFrame(h, h.frames[0]); }
  }
  const fire = (el, cls) => {
    if (!el) return;
    el.classList.remove(cls);
    void el.getBoundingClientRect();
    el.classList.add(cls);
  };
  if (lead) { fire(lead.el, 'fp-swinging'); playFrames(lead, lead.frames); }
  fire(H.el.querySelector('.fp-slash'), 'fp-swinging');
  if (H.shield) { fire(H.shield.el, 'fp-bracing'); playFrames(H.shield, H.shield.frames); }
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

/** The prop sheets this chart actually needs — a room never pays for rails. */
async function decorSheets(map) {
  const chars = map.grid.join('');
  const want = new Set();
  if (/[rt]/.test(chars)) want.add('rocks');
  if (chars.includes('m')) want.add('rails');
  const out = {};
  for (const k of want) {
    try { out[k] = await loadImg(SHEET_URLS[k]); }
    catch (e) { console.warn('delve-fp: prop sheet missing', k, e); }
  }
  return out;
}

async function prep(mapId) {
  const map = mapForLocale(mapId);
  if (!map) throw new Error('delve-fp: no map ' + mapId);
  validateMap(map);
  const theme = THEMES[map.theme];
  const surf = await cutSurfaces(theme, { plank: map.grid.some((r) => r.includes('n')) });
  // REGIONS — rooms stamped into this plane with textures of their own (the
  // campus). One surface set per distinct theme, picked per cell at build time,
  // so a kitchen's wall ring is scrubbed stone and the meadow around it grass.
  // Baked in parallel and without ore faces — rooms have no seams. PAINT
  // themes (the Surfaces palette) join the same pool: their sets are baked
  // whole but only their FLOOR is ever read (@see floorTexAt).
  const surfByTheme = {};
  const names = [...new Set([
    ...(map.regions || []).map((r) => r.theme),
    ...(map.paint || []).map((r) => r.theme),
  ])].filter((n) => THEMES[n]);
  const sets = await Promise.all(names.map((n) => cutSurfaces(THEMES[n], { ores: false })));
  names.forEach((n, i) => { surfByTheme[n] = sets[i]; });
  const props = await decorSheets(map);
  const spawns = [];
  for (const s of (map.spawns || [])) {
    const prey = preyById(s.prey);
    if (!prey) continue;
    try { spawns.push({ prey, s, img: await loadImg(ART_BASE + prey.art + '.png') }); }
    catch (e) { console.warn('delve-fp: creature sheet missing for', s.prey, e); }
  }
  return { map, theme, surf, surfByTheme, props, spawns };
}

function mount(prep, entry) {
  const { map, theme, surf, surfByTheme, props, spawns } = prep;
  // The outgoing map's textures are blob URLs; the incoming set replaces every
  // reference to them in the same task, so they can be revoked here.
  for (const old of [F.surf, ...Object.values(F.surfByTheme || {})]) {
    if (old && old._urls && old !== surf) old._urls.forEach((u) => URL.revokeObjectURL(u));
  }
  F.map = map; F.theme = theme; F.surf = surf; F.surfByTheme = surfByTheme || {};
  // Region lookup for the texture pick — a handful of rects, checked per cell
  // only while geometry is being (re)built.
  F.regions = map.regions || [];
  F.regionThemeAt = (x, y) => {
    for (const r of F.regions) if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return r.theme;
    return null;
  };
  // Paint rects swap the ground fill only — never rooms (@see floorTexAt).
  F.paints = map.paint || [];
  F.paintThemeAt = (x, y) => {
    for (const r of F.paints) if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return r.theme;
    return null;
  };
  // The light comes with the place. Everything that fades — quads, sprites, the
  // stage behind them — reads it, so switching a map switches the whole mood in
  // one assignment rather than in six. A coarse-pointer device takes the
  // light's `lite` weather where one is authored: same colour, shorter reach,
  // so the haze still closes before the smaller build radius runs out.
  const baseL = LIGHTS[theme.light] || LIGHTS.dark;
  L = COARSE && baseL.lite ? { ...baseL, near: baseL.lite.near, far: baseL.lite.far } : baseL;
  F.host.style.background = `rgb(${L.rgb[0]},${L.rgb[1]},${L.rgb[2]})`;
  // The veil colour every quad's fog child paints in — one write, whole mood.
  F.host.style.setProperty('--fp-fog', `rgb(${L.rgb[0]},${L.rgb[1]},${L.rgb[2]})`);
  mountSky();
  F.cols = map.grid[0].length; F.rows = map.grid.length;
  F.mined = F.mined || new Set();
  // A face already worked stays worked. `map.grid` is the module's own copy and
  // is never mutated, so coming back through a door would otherwise restore the
  // seam as solid rock that mineOre then refuses to touch again — a wall with no
  // way through it, in the middle of the passage you opened.
  F.grid = map.grid.map((row, y) => row.replace(/o/g, (m, x) => (F.mined.has(map.id + ':' + x + ',' + y) ? '.' : m)));
  // The height law (ONE RULES FACT). Built from the AUTHORED grid — a mined
  // seam opens at the level the model already knew ('o' is ground to it).
  F.model = makeLevelModel(map.grid);
  // The chart's vertical extremes, asked once: the GL skirt sinks below the
  // deepest floor, and wall tops are only built once anything can look down
  // on them (a walker on a lv-2 surface stands eye-above every wall).
  F.minLv = 0; F.maxLv = 0;
  for (let y = 0; y < F.rows; y++) {
    for (let x = 0; x < F.cols; x++) {
      const s = F.model.surfacesAt(x, y);
      if (!s.length) continue;
      if (s[0] < F.minLv) F.minLv = s[0];
      if (s[s.length - 1] > F.maxLv) F.maxLv = s[s.length - 1];
    }
  }
  const at0 = entry || map.entry;
  // NOT floored to a centre. Every campus chart authors its entry 0.2 tiles
  // clear of its own doorway ([4.5, 7.3]), and snapping moved you back TOWARD
  // the door you had just come out of — which a proximity trigger notices.
  F.px = at0[0]; F.py = at0[1];
  // HARD-RESET every smoothed value in the same task, for the same reason
  // F._wtf is reset below: a portal would otherwise carry the previous room's
  // easing into the new one and the eye would rise out of the floor on arrival.
  F.yaw = openestYaw(Math.floor(F.px), Math.floor(F.py));
  F.vx = 0; F.vy = 0; F.sway = 0; F.bobPhase = 0; F.prevYaw = F.yaw;
  // A fresh arrival commits to the GROUND surface (a deck-top arrival is a
  // view-swap carry's business — the caller overrides F.lv after mount).
  F.lv = F.model.surfacesAt(Math.floor(F.px), Math.floor(F.py))[0] || 0;
  F.lev = F.lv;                                           // snapped, never lerped
  F.cellKey = Math.floor(F.px) + ',' + Math.floor(F.py);  // so frame one re-fires nothing
  F.yawQ = Math.round(F.yaw / YAW_Q);                     // and neither does the cone
  F.seen.add(F.map.id + ':' + F.cellKey);                 // you have seen where you stand
  F.creatures = []; F.decor = []; F.solids = []; F.doors = []; F.shots = []; F.armed = false;
  F.settleUntil = performance.now() + 350;   // delve.js's, not the old STEP_MS's

  const stage = F.host.querySelector('.fp-stage');
  stage.innerHTML = '<div class="fp-world"><div class="fp-geo"></div><div class="fp-bbs"></div></div>';
  F.world = stage.querySelector('.fp-world');
  // A fresh .fp-geo means the retained-quad registry starts empty with it.
  F.geo = new Map();
  // Extruded props belong to the MAP — a portal starts the list clean and the
  // sheet decodes refill it (@see voxelProp). Their ground circles likewise.
  F.propQuads = [];
  F.propBlockers = [];
  // The third-person self rides across portals — a fresh stage orphaned it.
  if (F.self) { F.world.querySelector('.fp-bbs').appendChild(F.self.el); F.self._tf = ''; }
  // The world element is NEW but render()'s write-guard cache is not: a portal
  // landing on the same coords/yaw would build the identical transform string,
  // skip the write, and leave this world untransformed. Same-task reset.
  F._wtf = '';
  // The rasteriser survives a portal — the CONTEXT is expensive to make and the
  // canvas is outside `.fp-stage`, which mountScene just rewrote. Only its
  // textures go, because they belonged to the map that just ended.
  if (view.gl && !F.gl) F.gl = createGlWorld(F.host.querySelector('.fp-gl'));
  if (F.gl) F.gl.dropTextures();
  F.host.classList.toggle('fp-gl-on', !!F.gl);
  fitLens();
  // How far THIS chart can be seen, before anything is built from it — the fog
  // it settles on is the fog every quad below is then cut to.
  fitViewRadius();
  buildGeometry();
  buildDecor(props || {});
  for (const sp of spawns) spawnCreature(sp.prey, sp.img, sp.s.x + 0.5, sp.s.y + 0.5);

  const title = F.host.querySelector('.fp-title');
  if (title) title.textContent = `${F.hooks.locale.glyph || ''} ${map.name || F.hooks.locale.name}`.trim();
  drawMap();
}

/**
 * Open the first-person delve. Same contract as openDelve — `hooks` is the very
 * same object hall.js builds for the top-down walk, so the two modes cannot pay
 * different spoils. Resolves true only if it actually took the screen.
 */
export async function openDelveFp(localeId, member, hooks, carry) {
  if (!mapForLocale(localeId) || !member || F || opening) return false;
  opening = true;
  try {
    if (carry && !carry.swap) carry = null;   // only a live swap may carry state
    const p = await prep(carry ? carry.mapId : localeId);
    // A view swap arrives with the TOP-DOWN screen active, not the guild's —
    // the session it carries is the licence to take over from it.
    const guildUp = document.getElementById('guildScreen');
    if (F || (!carry && (!guildUp || !guildUp.classList.contains('active')))) return false;

    const host = document.getElementById('delveFpScreen');
    // The light tier's CSS switch (blur filters off, see delve.css). Keyed to
    // the device, not the session, so it is never removed.
    if (COARSE) document.body.classList.add('fp-lite');
    host.innerHTML = `
      <div class="fp-sky"></div>
      <canvas class="fp-gl"></canvas>
      <div class="fp-stage"></div>
      <div class="fp-hands"></div>
      <div class="fp-vignette"></div>
      <div class="fp-blood"></div>
      <div class="delve-hud">
        <button class="dv-leave" onclick="__delveFp.leave()">&larr; Leave</button>
        <span class="fp-title dv-title"></span>
        <span class="fp-compass"></span>
        <span class="dv-haul fp-haul"></span>
        <button class="fp-help fp-povbtn" title="Change view" onclick="__delveFp.pov()">3rd person</button>
        <button class="fp-help" title="Camera settings" onclick="__viewPanel()">${icon('eye')}</button>
        <button class="fp-help" title="Controls" onclick="__delveFp.help()">?</button>
      </div>
      <canvas class="fp-map" width="150" height="150"></canvas>
      <div class="fp-floats"></div>
      <div class="delve-toasts fp-toasts"></div>
      <div class="fp-vitals">
        <span class="fp-vitals-fill"></span>
        <span class="fp-vitals-cap"></span>
        <b class="fp-vitals-n">100</b>
      </div>
      <div class="fp-keys">
        <b>W</b> forward · <b>S</b> back · <b>A</b>/<b>D</b> sidestep
        · <b>←</b>/<b>→</b> or <b>right-drag</b> turn · <b>Space</b> or <b>click</b> to strike
        · hold <b>Shift</b> to guard · <b>R</b> drink · <b>Esc</b> leave
        <br>Hold the <b>right</b> mouse button to turn; the left one strikes.
        A controller works too: sticks walk and turn, <b>A</b> strikes, <b>LT</b> guards.
      </div>
      <div class="fp-pad">
        <button data-k="turnL" aria-label="Turn left">◀<i>←</i></button>
        <button data-k="fwd" aria-label="Forward">▲<i>W</i></button>
        <button data-k="turnR" aria-label="Turn right">▶<i>→</i></button>
        <button data-k="block" class="fp-block" aria-label="Guard">${icon('guard')}<i>Shift</i></button>
        <button data-k="back" aria-label="Back">▼<i>S</i></button>
        <button data-k="attack" class="fp-attack" aria-label="Strike">${icon('strike')}<i>Space</i></button>
        <button data-k="drink" class="fp-drink" aria-label="Drink a draught">${icon('potion')}<b>0</b><i>R</i></button>
      </div>`;

    F = {
      map: null, theme: null, surf: null, hooks, member, host, world: null,
      grid: null, cols: 0, rows: 0,
      px: 0, py: 0, dir: 2, yaw: 180, turning: null, stepping: null,
      keys: {}, latched: {}, padKeys: {}, padAxes: null, look: null,
      // The continuous walker's state. Every one of these is hard-reset in
      // mount(), because a portal must not carry the last room's easing in.
      vx: 0, vy: 0, lev: 0, lv: 0, bobPhase: 0, sway: 0, prevYaw: 0,
      cellKey: '', yawQ: 0, viewR: 8, gl: null, selfFace: null,
      last: 0, raf: 0, ended: false, transiting: false,
      creatures: [], decor: [], solids: [], doors: [], shots: [], armed: false,
      seen: new Set(), mined: new Set(), settleUntil: 0,
      hands: null, swingUntil: 0, helpTimer: 0, lens: 1,
      pov: 1, self: null,
      hp: HP_MAX, hpCeil: HP_MAX, contactAt: 0, hurtUntil: 0,
      haul: { kills: {}, gold: 0, mats: {}, field: 0, bouts: 0, swings: 0 },
      stack: [],
    };
    // A swap carries the walk in: same ledger, same doors behind you, same
    // worked veins, standing on the same cell.
    if (carry) {
      F.stack = (carry.stack || []).slice();
      F.mined = new Set(carry.mined || []);
      if (carry.haul) F.haul = { kills: {}, gold: 0, mats: {}, field: 0, bouts: 0, swings: 0, ...carry.haul };
    }
    try {
      mount(p, carry ? carry.at : null);
      // The FACING crosses the swap too — the lenses are 1:1 by decree.
      // openestDir only chooses for a fresh march in through the gate.
      if (carry && carry.dir != null) {
        F.yaw = carry.dir * Math.PI / 4;
        F.prevYaw = F.yaw; F.yawQ = Math.round(F.yaw / YAW_Q);
      }
      // And the SURFACE: a body on a bridge must arrive on it, not under it —
      // validated against what the arrival cell actually offers.
      if (carry && carry.lev != null
        && F.model.surfacesAt(Math.floor(F.px), Math.floor(F.py)).includes(carry.lev)) {
        F.lv = carry.lev; F.lev = carry.lev;
      }
      wireInput();
      // The stick arrives with the first touch, exactly like the top-down's.
      F.joyTouchOff = onTouchPrimary(() => { if (F && !F.joyEl) buildFpStick(); });
      if (touchPrimary()) buildFpStick();
      updateHaul();
      showScreen('delveFpScreen');
      fitLens();               // now that the stage has a height to measure
      fitHands();              // and the hands with it
      mountSky();              // and the horizon at the real 50% of it
      startLoop();
    } catch (e) {
      if (F && F.raf) cancelAnimationFrame(F.raf);
      if (F && F.onKeyDown) unwireInput();   // or the page keeps the listeners forever
      F = null;
      host.innerHTML = '';
      showScreen('guildScreen');
      throw e;
    }
    // The hands come up after the screen does: a missing icon sheet must cost
    // the delve nothing but its viewmodel.
    mountHands().catch((e) => console.warn('delve-fp: hands', e));
    updateVitals();
    updatePotions();
    const first = member.name.split(' ')[0];
    if (!carry) {
      toast(`${first} descends into ${p.map.name || hooks.locale.name}.`);
      if (!(hooks.gear && hooks.gear.weapon)) toast(`${first} goes in bare-handed — nothing in the weapon slot.`);
      // No entry lecture — the playtest's words: "not skippable, lasts too
      // long, should only come up if player selects it." The ? button and the
      // ? key still teach anyone who asks.
    }
    povLabel();
    return true;
  } finally {
    opening = false;
  }
}

// ---------------------------------------------------------------------------
// Input — held rates, drained once a tick
// ---------------------------------------------------------------------------

/** One table, read by both handlers — two copies drifted apart waiting to happen. */
const KEYMAP = {
  arrowup: 'fwd', w: 'fwd', arrowdown: 'back', s: 'back',
  arrowleft: 'turnL', arrowright: 'turnR', a: 'strafeL', d: 'strafeR',
  q: 'turnL', e: 'turnR',
  ' ': 'attack', spacebar: 'attack', f: 'attack', enter: 'attack',
  shift: 'block', r: 'drink',
};

/**
 * THE MOUSE STEERS THE CAMERA, as it does in the arena.
 *
 * It used to bank travel until it was worth a whole eighth-turn, because the
 * crawler had no continuous yaw to give it — `F.dir` was an integer index that
 * seven other things read. All seven take the live yaw now, so the bank is gone
 * and mouse travel is added to `F.yaw` directly: the distance your hand moved
 * IS the distance the view turns. What follows is the old note, kept because
 * it fills a bucket, and each bucketful spends itself as ONE eighth-turn on the
 * same latch the ◀ ▶ buttons use. A flick turns you, a drift does not.
 */
/* LOOK_SNAP is gone with the eighth-turn it fed. Mouse travel goes straight
   into the yaw as an angle now — the distance your hand moved IS the distance
   the view turned, which is the whole reason a mouse aims better than a key. */
/** Past this a stick is a direction, not a resting hand. The crawler's inputs
 *  are all discrete, so an analog axis has to be squared off somewhere. */
/* PAD_ON is gone: the sticks are read as analog axes (see readDevices). */

function wireInput() {
  // Both guard on F: a throw during open leaves the listener attached with no
  // session behind it, and an unguarded handler then raises on every keypress
  // for the rest of the page's life.
  F.onKeyDown = (e) => {
    if (!F || !screenActive()) return;
    // Ctrl-R is the browser's, not ours. Claiming a bare letter is fine;
    // claiming it under a modifier swallowed reload — and drank a real potion
    // on the way past.
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'escape') { leave(); return; }
    if (k === '?' || k === 'h') { e.preventDefault(); helpUntil(9000); return; }
    if (KEYMAP[k]) { e.preventDefault(); F.keys[KEYMAP[k]] = true; }
  };
  F.onKeyUp = (e) => {
    if (!F) return;
    const k = e.key.toLowerCase();
    if (KEYMAP[k]) F.keys[KEYMAP[k]] = false;
  };
  // NOTHING FIRES A KEYUP when the window goes away — not alt-tab, not a
  // minimise, not Esc out of a pointer lock. Grid-lock hid this (a held key
  // only ever bought one more stride); a rate model turns it into walking into
  // a wall forever, and a stuck Shift into every attack silently refused
  // behind "Shield up — no room to swing."
  F.onDrop = () => {
    if (!F) return;
    F.keys = {}; F.latched = {}; F.padKeys = {}; F.padAxes = null;
  };
  window.addEventListener('blur', F.onDrop);
  document.addEventListener('visibilitychange', F.onDrop);
  window.addEventListener('keydown', F.onKeyDown);
  window.addEventListener('keyup', F.onKeyUp);
  F.host.querySelectorAll('.fp-pad button').forEach((b) => {
    const k = b.dataset.k;
    // A tap is shorter than a frame more often than you would think, so the
    // press is LATCHED: readInput consumes it and clears the latch itself.
    const on = (e) => { e.preventDefault(); F.keys[k] = true; F.latched[k] = true; };
    const off = () => { if (F) F.keys[k] = false; };
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off);
    b.addEventListener('pointerleave', off);
    b.addEventListener('pointercancel', off);
  });
  // Clicking into the world strikes at it. The most discoverable control there
  // is: the thing you can see is the thing you can hit.
  F.onStagePointer = (e) => {
    if (!F || F.ended) return;
    if (e.button !== 0) return;          // the right button turns; the left one strikes
    e.preventDefault();
    trySwing();
  };
  const stage = F.host.querySelector('.fp-stage');
  if (stage) stage.addEventListener('pointerdown', F.onStagePointer);
  F.look = createLook(F.host, {
    enabled: () => !touchPrimary(),
    ignore: '.delve-hud,.fp-pad,.fp-map,.fp-vitals',
    onChange: (on) => { if (F) F.host.classList.toggle('fp-looking', on); },
  });
  F.onResize = () => { fitLens(); fitHands(); mountSky(); };
  window.addEventListener('resize', F.onResize);
}
/**
 * The crawler's thumb-stick — the top-down walk's stick re-aimed at a KEY
 * TABLE instead of a velocity, because the crawler's grammar IS keys: Y is
 * W/S and X is the turn pair (quarter turns at their own cadence while held).
 * The thresholds cut a dead cross in the middle — .35 forward so a walk is
 * easy to hold, .55 for a turn so a thumb rolling forward does not also spin
 * you. Appears only when touch is the primary driver, like the top-down's,
 * and serves first person and over-the-shoulder alike (same walker).
 */
function buildFpStick() {
  if (!F || !F.host || F.joyEl) return;
  const joy = document.createElement('div');
  joy.className = 'fp-joy';
  joy.innerHTML = '<div class="dj-base"><div class="dj-knob"></div></div>';
  F.host.appendChild(joy);
  F.joyEl = joy;
  const base = joy.querySelector('.dj-base'), knob = joy.querySelector('.dj-knob');
  const clear = () => { if (F) F.keys.fwd = F.keys.back = F.keys.turnL = F.keys.turnR = false; };
  let pid = null, cx = 0, cy = 0;
  joy.addEventListener('pointerdown', (e) => {
    pid = e.pointerId; cx = e.clientX; cy = e.clientY;
    base.style.left = cx + 'px'; base.style.top = cy + 'px';
    base.classList.add('on');
    joy.setPointerCapture(pid);
  });
  joy.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pid) return;
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const m = Math.hypot(dx, dy);
    if (m > 42) { dx = dx / m * 42; dy = dy / m * 42; }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    if (!F) return;
    const nx = m > 8 ? dx / 42 : 0, ny = m > 8 ? dy / 42 : 0;
    F.keys.fwd = ny < -0.35; F.keys.back = ny > 0.35;
    F.keys.turnL = nx < -0.55; F.keys.turnR = nx > 0.55;
  });
  const end = (e) => {
    if (e.pointerId !== pid) return;
    pid = null;
    base.classList.remove('on');
    knob.style.transform = '';
    clear();
  };
  joy.addEventListener('pointerup', end);
  joy.addEventListener('pointercancel', end);
}

function unwireInput() {
  window.removeEventListener('keydown', F.onKeyDown);
  window.removeEventListener('keyup', F.onKeyUp);
  if (F.onDrop) {
    window.removeEventListener('blur', F.onDrop);
    document.removeEventListener('visibilitychange', F.onDrop);
  }
  const stage = F.host.querySelector('.fp-stage');
  if (stage && F.onStagePointer) stage.removeEventListener('pointerdown', F.onStagePointer);
  if (F.look) { F.look.dispose(); F.look = null; }   // and hands the cursor back
  padReset();
  if (F.onResize) window.removeEventListener('resize', F.onResize);
}

/**
 * The mouse and the controller, in the crawler's own vocabulary.
 *
 * The pad gets its OWN bag rather than writing into `F.keys`, and that is not
 * fastidiousness: a stick reports its resting position every frame, so a pad
 * that shared the key table would write `fwd = false` sixty times a second and
 * a held W would never walk anywhere while a controller was merely plugged in.
 * `took` and `guarding` read both bags; nothing else has to know there are two.
 *
 * The mouse writes neither — it writes the LATCH, because a flick is a tap. And
 * only on the crossing edge, never per frame from a held state: readInput bails
 * out for the whole of a stride, so a latch armed during one is still sitting
 * there when it ends and immediately spends itself on a second (the one-tap-
 * two-cells bug documented on `took`).
 */
function readDevices() {
  if (!F) return;
  const was = F.padKeys || {};
  const now = {};
  const ax = { fwd: 0, strafe: 0, turn: 0 };
  const p = readPad();
  if (p) {
    // ANALOG STRAIGHT THROUGH. input.js's own `ax()` has already deadzoned and
    // rescaled these, so squaring them off into booleans (which is what the
    // grid-locked crawler did, at PAD_ON 0.5) throws away the one thing a
    // continuous walker exists to use: how far you pushed.
    ax.fwd = -p.my;
    ax.turn = p.rx;
    ax.strafe = p.mx + (p.down(PAD.RB) ? 1 : 0) - (p.down(PAD.LB) ? 1 : 0);
    now.attack = p.down(PAD.A) || p.down(PAD.RT);
    now.drink = p.down(PAD.X);
    now.block = p.down(PAD.LT) || p.down(PAD.Y);
    // ONLY the three presses manufacture an edge. Movement used to as well, and
    // under a rate model that is a bug with a delay on it: an edge armed on
    // `fwd` sits in the latch and spends itself as a step AFTER the stick has
    // been released. A press too short to survive a frame still counts.
    for (const k of ['attack', 'drink', 'block']) if (now[k] && !was[k]) F.latched[k] = true;
    if (p.hit(PAD.SELECT)) togglePov();
  }
  F.padKeys = now;
  F.padAxes = ax;
}

/** Is the shield up, by any hand? Read raw all over the fight — never through
 *  `took`, because a guard is a state and not a press. */
function guarding() { return !!(F.keys.block || (F.padKeys && F.padKeys.block)); }

/** Show the control strip — ONLY when asked (the ? button or the ? key; the
 *  entry auto-show died by playtest verdict). A tap anywhere on the strip
 *  dismisses it early, because "skippable" is most of what was asked for. */
function helpUntil(ms) {
  if (!F) return;
  const el = F.host.querySelector('.fp-keys');
  if (!el) return;
  el.classList.add('on');
  el.onpointerdown = () => { clearTimeout(F.helpTimer); el.classList.remove('on'); };
  clearTimeout(F.helpTimer);
  F.helpTimer = setTimeout(() => el.classList.remove('on'), ms);
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------


/**
 * Strike at what is in front of you.
 *
 * A crawler's attack is a REACH, not a collision: the bout opens on anything
 * inside SWING_REACH and roughly ahead, so you pick the fight instead of
 * blundering into it. Walking into a creature still starts a bout — a Plague
 * Speaker that runs you down does not wait to be invited — but that is now the
 * fallback rather than the only way combat has ever begun.
 *
 * The same swing works the wall: an ore face IS a thing you hit until it comes
 * out, so striking one mines it, exactly as walking into it always has.
 */
function trySwing() {
  const now = performance.now();
  if (!F || F.ended || F.transiting || now < F.swingUntil) return;
  // A raised shield is a CHOICE, not a free passive: behind it you cannot
  // strike. Guarding that cost nothing meant letting go of Shift was never the
  // right move, which is the same as having no guard at all.
  if (guarding()) { toast('Shield up — no room to swing.'); return; }
  F.swingUntil = now + SWING_MS;
  const dx = Math.sin(F.yaw), dy = -Math.cos(F.yaw);     // the true aim, live
  // The cell ahead is a RAY now. Standing anywhere in a cell facing anywhere at
  // all, the seam you can see is the one the ray meets; a grid step off a
  // rounded eighth-turn takes the diagonal neighbour instead.
  let ax = Math.floor(F.px + dx * 0.7), ay = Math.floor(F.py + dy * 0.7);
  for (let r = 0.55; r <= 1.15; r += 0.15) {
    const rx = Math.floor(F.px + dx * r), ry = Math.floor(F.py + dy * r);
    if (at(rx, ry) === 'o') { ax = rx; ay = ry; break; }
  }
  const seam = at(ax, ay) === 'o';
  playSwing(seam);
  const w = F.hooks.gear && F.hooks.gear.weapon;
  // The standee swings whatever the hands do — including the pick at a seam.
  selfSwing(!seam && w && w.kind === 'bow');
  if (seam) { mineOre(ax, ay); return; }
  // A bow does not swing at anything. It looses, and the arrow finds out.
  F.haul.swings = (F.haul.swings || 0) + 1;
  if (w && w.kind === 'bow') {
    spawnShot('arrow', 'player', F.px + dx * 0.4, F.py + dy * 0.4, dx, dy, null);
    return;
  }
  let best = null, bd = MELEE;
  for (const c of F.creatures) {
    const vx = c.x - F.px, vy = c.y - F.py, d = Math.hypot(vx, vy) || 1e-6;
    if (d > bd) continue;
    if ((vx * dx + vy * dy) / d < SWING_CONE) continue;   // it has to be in front
    if (Math.abs((c.lv || 0) - (F.lv || 0)) > 1) continue; // a step of reach, not a storey
    if (!clearLine(F.px, F.py, c.x, c.y, F.lv || 0, c.lv || 0)) continue; // and not behind the rock
    best = c; bd = d;
  }
  if (best) strike(best);
}

/**
 * A key that is down, or a tap too short to still be down when we looked.
 *
 * Reading ALWAYS spends the latch, including on the key-is-down path. Returning
 * early there left the latch armed through the whole stride — readInput bails on
 * `F.turning || F.stepping` above these calls, so nothing could spend it — and
 * the frame after the stride finished it fired again: one tap of ▲ walked two
 * cells and one tap of ◀ turned a full 180°.
 */
function took(k) {
  const on = !!F.keys[k] || !!(F.padKeys && F.padKeys[k]) || !!F.latched[k];
  F.latched[k] = false;
  return on;
}

/**
 * WALK, TURN, SLIDE — one engine, the arena's, every frame.
 *
 * This replaces `readInput()` + `advanceMotion()`, and with them the whole
 * grid-lock: `F.stepping`, `F.turning`, `ease`, `tryStep`, `tryTurn`, STEP_MS,
 * TURN_MS and DIAG_MS. The playtest verdict was "walking feels choppy, like the
 * player is always stepping with the same foot… there should not be a separate
 * mode", and both halves of that were true. The choppiness was 205ms hops
 * between cell centres; the same foot was the walk cycle restarting, because a
 * walker is `'move'` only while `F.stepping` exists and every gap between
 * strides reset the anim to frame 0.
 *
 * Divergences from the arena's tick, each of which is deliberate:
 *
 * The vector is CLAMPED, not normalised. `dx /= L` forces unit length, so a
 * stick at 0.3 walks at full speed — and a crawler edging toward a ledge or an
 * ore face is exactly who wants that magnitude back. It also caps a diagonal at
 * 1 rather than the √2 the arena's own steer lets through.
 *
 * The settle ZEROES the vector rather than bailing. The old guard returned
 * outright, which swallowed turning too; here everything else keeps ticking.
 *
 * WALK_SPEED is delve.js's, not the arena's, for two reasons: a view swap
 * between the two lenses is seamless, so walking at different paces is a
 * visible seam — and the invariant below.
 *
 * INVARIANT: `WALK_SPEED * DT_CLAMP < BODY`. 3.4 × 0.08 = 0.272 < 0.28. Break
 * it and one slow frame steps clean over a wall, between two legal positions.
 */
const WALK_SPEED = 3.4, CLIMB_RATE = 0.42;
/** How far you travel per bob cycle, tiles. Keyed to distance and not to time,
 *  so walking into a wall does not bob. */
const STRIDE_LEN = 1.25;
const clamp1 = (v) => (v < -1 ? -1 : v > 1 ? 1 : v);

function steer(dt) {
  if (F.transiting) return;
  // Striking stays above the settle, and stays on `took` — a blow is a press.
  if (took('attack')) trySwing();
  if (took('drink')) drink();
  // Drained FIRST and ALWAYS. A read that only happens on some frames banks the
  // travel between them and spends it in a lump.
  const look = F.look ? F.look.read() : null;
  const held = (a, b) => ((F.keys[a] ? 1 : 0) - (F.keys[b] ? 1 : 0));
  const A = F.padAxes || { fwd: 0, strafe: 0, turn: 0 };
  const turn = clamp1(held('turnR', 'turnL') + A.turn);
  let fwd = clamp1(held('fwd', 'back') + A.fwd);
  let strafe = clamp1(held('strafeR', 'strafeL') + A.strafe);

  // Held input is a RATE (×dt); mouse travel is a DISPLACEMENT already — the
  // distance your hand moved IS the angle. They must never be mixed.
  const locked = !!(F.look && F.look.locked());
  F.yaw += turn * TURN_RATE * dt + (locked && look ? look.yaw : 0);
  if (F.yaw > Math.PI) F.yaw -= 2 * Math.PI;
  else if (F.yaw <= -Math.PI) F.yaw += 2 * Math.PI;

  if (performance.now() < F.settleUntil) { fwd = 0; strafe = 0; }
  const s = Math.sin(F.yaw), c = Math.cos(F.yaw);
  let dx = s * fwd + c * strafe, dy = -c * fwd + s * strafe;
  const L = Math.hypot(dx, dy);
  if (L > 1) { dx /= L; dy /= L; }
  const cx = Math.floor(F.px), cy = Math.floor(F.py);
  // Rungs cost time; stairs are the climb taken at a walk.
  const sp = WALK_SPEED * (onClimb(cx, cy) ? CLIMB_RATE : 1);
  const ox = F.px, oy = F.py;
  const e = { x: F.px, y: F.py, lv: F.lv };
  const hit = slide(e, dx * sp * dt, dy * sp * dt);
  F.px = e.x; F.py = e.y; F.lv = e.lv;
  // ACHIEVED velocity, not intended — the idiom moveCreatures already uses.
  // Walking into a wall must read as standing still, or the standee marches on
  // the spot and the bob never stops.
  const adx = F.px - ox, ady = F.py - oy;
  F.vx = adx / dt; F.vy = ady / dt;

  // WALK-INTO-ORE SURVIVES. The grid-locked crawler knew which cell it had
  // failed to enter because it asked before moving; `slide` reports the cell
  // that refused each axis, which is the same knowledge after the fact.
  // A pick reaches the vein you are level with (±1 step), not one a storey off.
  if (hit && at(hit.x, hit.y) === 'o'
    && Math.abs((F.lv || 0) - heightAt(hit.x, hit.y)) <= 1) mineOre(hit.x, hit.y);

  // The four smoothed values, each with a hard-zero threshold so an idle frame
  // still compares equal and writes nothing — that guard IS the mobile budget.
  // The eye eases toward the COMMITTED surface, not the cell's ground — which
  // is the whole difference between walking a bridge and walking under one.
  const want = F.lv != null ? F.lv : heightAt(Math.floor(F.px), Math.floor(F.py));
  const k = 1 - Math.exp(-dt / 0.09);            // ~the old 205ms ease
  F.lev += (want - F.lev) * k;
  if (Math.abs(want - F.lev) < 0.01) F.lev = want;
  const dist = Math.hypot(adx, ady);
  if (dist > 1e-4) F.bobPhase = (F.bobPhase + dist / STRIDE_LEN * Math.PI * 2) % (Math.PI * 2);
  // Sway is a low-passed yaw RATE. The old one read the remaining tween angle —
  // a scripted lean that led the camera — which has nothing to read any more.
  let dyaw = F.yaw - F.prevYaw;
  if (dyaw > Math.PI) dyaw -= 2 * Math.PI; else if (dyaw <= -Math.PI) dyaw += 2 * Math.PI;
  F.sway += (dyaw / Math.max(dt, 1e-3) / TURN_RATE - F.sway) * Math.min(1, dt / 0.07);
  if (Math.abs(F.sway) < 0.004) F.sway = 0;
  F.prevYaw = F.yaw;
}

/**
 * Everything that used to hang off "a stride finished", split in two.
 *
 * There is no arrival any more, so the work divides by what it actually needed:
 * the map bookkeeping needs a CHANGE OF CELL, and the ways out need PROXIMITY.
 * Folding them together is what made a portal fire the instant you stepped on
 * its cell — fine at 205ms a step, wrong when you can stand astride the line.
 */
function onCellChange() {
  const key = Math.floor(F.px) + ',' + Math.floor(F.py);
  /**
   * A walker jittering on a cell line would otherwise re-run a diff over the
   * whole want-set every frame. Require a real committal into the new cell —
   * BOTH axes inside the band.
   *
   * This was `&&`, which made the guard very nearly inert: crossing a boundary
   * you are 0.49 off-centre on the axis you are travelling and ~0 on the other,
   * so the test only held within 0.05 tiles of a CORNER and every straight walk
   * rebuilt exactly ON the line — the one place a slide can re-cross it.
   */
  const cx = Math.floor(F.px) + 0.5, cy = Math.floor(F.py) + 0.5;
  const moved = key !== F.cellKey
    && Math.abs(F.px - cx) <= 0.45 && Math.abs(F.py - cy) <= 0.45;
  /**
   * A TURN changes the scene too, now that the half-space behind you is not
   * built. Quantised to YAW_Q so a slow pan rebuilds every 30° rather than
   * every frame, and the cone is cut wide enough that the stale wedge in
   * between is always outside the lens.
   */
  const yq = Math.round(F.yaw / YAW_Q);
  const turned = yq !== F.yawQ;
  if (!moved && !turned) return;
  if (moved) {
    F.cellKey = key;
    F.seen.add(F.map.id + ':' + Math.floor(F.px) + ',' + Math.floor(F.py));
  }
  F.yawQ = yq;
  buildGeometry();
  if (moved) drawMap();
}

/**
 * The ways out, by proximity — the top-down walk's rule (checkPortals), 0.8
 * tiles, measured against the AUTHORED fractional coordinates rather than the
 * grid character. The char route was also a latent bug: validateMap only warns
 * when a portal sits on a plain '.', so such a portal worked in the top-down
 * walk and was silently dead here.
 *
 * Four things stop this double-firing, and all four are load-bearing: `F.armed`
 * (you must step clear of every door before any of them works), `F.transiting`
 * (set synchronously before usePortal's first await, so `busy()` blocks every
 * later frame), the settle zeroing your movement on arrival, and a door that
 * threw being retired so it cannot be offered again.
 */
function checkDoors() {
  if (!F.armed || F.transiting || F.ended) return;
  // Level with the doorway, not merely over it — crossing a bridge above the
  // way out must not end the walk (ONE RULES FACT, level gates everywhere).
  const near = (q) => Math.hypot(q.x - F.px, q.y - F.py) < 0.8
    && Math.abs((F.lv || 0) - (F.model.surfacesAt(Math.floor(q.x), Math.floor(q.y))[0] || 0)) <= 0.5;
  for (const q of (F.map.portals || [])) {
    if (q.dead || !near(q)) continue;
    usePortal(q); return;
  }
  for (const d of F.doors) {
    if (d.dead || !near(d)) continue;
    if (EXIT[d.ch]) {
      if (F.stack.length) { usePortal({ ...F.stack[F.stack.length - 1], popped: true }); return; }
      endDelve('climbed back into the daylight'); return;
    }
  }
}

/** Arm the ways out once the walker has stepped clear of every one of them —
 *  the same 1.35-tile rule delve.js uses, and for the same reason. */
function checkArmed() {
  if (F.armed) return;
  if (F.doors.every((d) => Math.hypot(d.x - F.px, d.y - F.py) > 1.35)) F.armed = true;
}

async function usePortal(portal) {
  if (!F || F.transiting || F.ended) return;
  const S = F;
  S.transiting = true;
  try {
    const p = await prep(portal.to);
    if (F !== S || S.ended) return;
    if (portal.enter) S.stack.push({ to: S.map.id, at: [S.px, S.py] });
    // The stack is POPPED here, not by the caller. It used to be spliced before
    // this function's own guard and before the try — so a door that threw
    // discarded the return address, and the next `d` ended the delve instead of
    // taking you down a floor. Unreachable at one trigger per stride; routine
    // once the trigger is per-frame.
    if (portal.popped) S.stack.pop();
    mount(p, portal.at);
    toast(p.map.name || 'Onward');
  } catch (e) {
    console.warn('delve-fp: door failed', e);
    // RETIRE A BROKEN DOOR. One toast used to be one toast because you had to
    // step off and back on; standing inside a 0.8-tile radius would now retry
    // it every frame — an unbounded run of async map bakes, one toast each.
    if (portal) portal.dead = true;
    if (F === S && !S.ended) toast('That way is blocked.');
  } finally {
    if (F === S) S.transiting = false;
  }
}

/**
 * What the things in the room are doing.
 *
 * WAKING is by sight, not by rank. A creature notices you when you are inside
 * its notice radius AND it can actually see you — so a Barrow Ghoul two rooms
 * away through a wall of rock does not start walking at you, and one across an
 * open chamber does. Once woken it stays woken. (`aggro` is the same flag being
 * struck sets, so hitting something out of the dark wakes it too.)
 *
 * A woken thing CLOSES to melee and then CIRCLES rather than standing in your
 * face: walking straight in and stopping is what made every fight a staring
 * contest at exactly one distance.
 *
 * STAGGER is the other half of a readable exchange — a creature that has just
 * been hit stops for a moment, which is the window a second blow lands in.
 */
function moveCreatures(dt) {
  const now = performance.now();
  for (const c of F.creatures) {
    const dx0 = F.px - c.x, dy0 = F.py - c.y;
    const dist = Math.hypot(dx0, dy0) || 1e-6;
    const rank = c.prey.rank || 1;
    const px = c.x, py = c.y;

    if (!c.aggro && dist < NOTICE[Math.min(5, rank)]
      && clearLine(c.x, c.y, F.px, F.py, c.lv || 0, F.lv || 0)) {
      c.aggro = true;
      c.noticedAt = now;
    }
    // Reeling. It cannot chase, circle or swing while it is coming back to itself.
    if (c.staggerUntil > now) { c.vx = c.vy = 0; poseCreature(c, false); continue; }

    let speed = 0.9;
    if (c.aggro) {
      // Rank 1 breaks and runs once it is actually hurt; everything else closes.
      if (rank <= 1 && c.hp < HP_MAX * 0.6) {
        c.mode = 'flee'; speed = 1.9;
        c.tx = c.x - dx0 / dist * 3; c.ty = c.y - dy0 / dist * 3;
      } else {
        c.mode = 'chase'; speed = 1.15 + rank * 0.18;
        if (dist <= MELEE * 0.95) {
          // In reach: orbit. `spin` is fixed per creature so it does not jitter
          // between directions, and a slight inward pull keeps it in the fight.
          const tx = -dy0 / dist, ty = dx0 / dist;
          c.tx = c.x + tx * c.spin * 1.6 - dx0 / dist * 0.4;
          c.ty = c.y + ty * c.spin * 1.6 - dy0 / dist * 0.4;
          speed *= 0.55;
        } else { c.tx = F.px; c.ty = F.py; }
      }
    } else if (c.mode === 'chase' || c.mode === 'flee') { c.mode = 'idle'; c.t = 0.6; }

    if (c.mode === 'idle') {
      c.t -= dt;
      if (c.t <= 0) {
        for (let i = 0; i < 6; i++) {
          const nx = c.home.x + (Math.random() * 5 - 2.5), ny = c.home.y + (Math.random() * 5 - 2.5);
          if (!blocked(Math.floor(nx), Math.floor(ny))) { c.tx = nx; c.ty = ny; c.mode = 'walk'; break; }
        }
        if (c.mode !== 'walk') c.t = 1.5;
      }
      c.vx = c.vy = 0;
      poseCreature(c, false);
      continue;
    }
    const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy);
    if (d < 0.15) {
      c.mode = 'idle'; c.t = 1 + Math.random() * 2; c.vx = c.vy = 0;
      // A woken thing that has arrived somewhere turns to you; a wanderer that
      // has arrived keeps looking the way it walked, which is what lets you
      // come round behind it.
      if (c.aggro) c.head = Math.atan2(dy0, dx0);
      poseCreature(c, false); continue;
    }
    const step = Math.min(d, speed * dt);
    const nx = c.x + dx / d * step, ny = c.y + dy / d * step;
    // The same step law the walker obeys (ONE RULES FACT): a creature cannot
    // stroll up a terrace either, and a big body (rank 4+, taller than the
    // passage) does not fit beneath a deck — you fit or you don't.
    const okc = (X, Y) => {
      const gx = Math.floor(X), gy = Math.floor(Y);
      if (blocked(gx, gy)) return false;
      const pk = F.model.pickSurface(c.lv != null ? c.lv : 0, Math.floor(c.x), Math.floor(c.y), gx, gy);
      if (pk == null) return false;
      const dk = F.model.deckAt(gx, gy);
      if (rank >= 4 && dk != null && pk < dk) return false;
      c.lv = pk;
      return true;
    };
    if (okc(nx, c.y)) c.x = nx;
    if (okc(c.x, ny)) c.y = ny;
    // Actual velocity, not intent — a creature grinding along a wall it cannot
    // get past should show the direction it is really going, which is nowhere.
    c.vx = (c.x - px) / (dt || 1e-6); c.vy = (c.y - py) / (dt || 1e-6);
    // FACING follows real movement — but a woken thing in reach squares up to
    // you even while its feet carry it sideways round the orbit: a circling
    // wolf strafes, it does not politely show you its flank. (Doom's monsters
    // do the same — the face tracks the target whatever the feet say.)
    if (Math.hypot(c.vx, c.vy) > 0.05) c.head = Math.atan2(c.vy, c.vx);
    if (c.aggro && c.mode === 'chase' && dist <= MELEE * 1.4) c.head = Math.atan2(dy0, dx0);
    c.phase += dt * speed * 3.4;
    poseCreature(c, Math.hypot(c.vx, c.vy) > 0.05);
  }
}

/**
 * Which cell of the walk sheet a creature is showing — its ROTATION, in Doom's
 * sense, which is what makes a sprite read as a thing in the room rather than a
 * sticker that always looks at you.
 *
 * A 3×4 charset is four poses of one character drawn from one viewpoint: front,
 * two profiles, back. Used as rotations they are exactly the four Hexen would
 * pick from eight — and the row is Doom's own rule: the creature's world-space
 * FACING (`head`) against the line of sight from you to it. Not its velocity
 * against the camera, which is what this used to be — a camera-relative row is
 * a photograph, it cannot be re-projected when YOU move, so a standing thing
 * showed you the same face however far round it you walked:
 *
 *   facing you           → row 0, its face
 *   facing away          → row 3, its back
 *   facing across        → row 1 or 2, whichever profile leads
 *
 * Re-judged every frame, so the rotation turns when IT turns and when YOU walk
 * round it — circle a thing that has not noticed you and you are reading its
 * back. The 1.15 is HYSTERESIS at the 45° boundaries: without a preference for
 * the axis it is already on, a rotation sitting exactly on a diagonal flips
 * row every frame as the two magnitudes trade places by a hair — the same
 * shiver `spin` exists to prevent, cured the same way.
 */
function poseCreature(c, walking) {
  const bx0 = c.x - F.px, by0 = c.y - F.py;
  const bd = Math.hypot(bx0, by0) || 1e-6;
  const bx = bx0 / bd, by = by0 / bd;             // the line of sight, out of you
  const ux = Math.cos(c.head), uy = Math.sin(c.head);
  const away = ux * bx + uy * by;                 // + = facing off along it (back)
  const across = ux * -by + uy * bx;              // + = facing your screen-right
  const onAway = c.row === 0 || c.row === 3;
  const useAway = onAway ? Math.abs(away) * 1.15 >= Math.abs(across)
                         : Math.abs(away) >= Math.abs(across) * 1.15;
  c.row = useAway ? (away > 0 ? 3 : 0) : (across > 0 ? 2 : 1);
  const col = walking ? WALK_COLS[Math.floor(c.phase) % 4] : 1;
  if (c.drawn === c.row * 4 + col) return;
  c.col = col;
  drawCreature(c);
}


// ---------------------------------------------------------------------------
// Combat — fought HERE, in the corridor, at the size the corridor draws it
// ---------------------------------------------------------------------------

/** The matchup, as one number: the member's ↯ over what the prey is worth. */
const oddsVs = (prey) => (F.hooks.power || 100) / Math.max(1, prey.power || 100);

/** Morrowind's question — you swung and connected, but did you HIT? Stats say.
 *  Tiredness is the delve's own tax: a spent delver flails. */
function rollHit(ratio, tired) {
  const base = 0.30 + 0.55 * Math.min(1, Math.max(0, (ratio - 0.55) / 0.9));
  const fit = tired ? 0.65 + 0.35 * (1 - Math.min(100, tired) / 100) : 1;
  return Math.random() < Math.min(HIT_CEIL, Math.max(HIT_FLOOR, base * fit));
}
const spread = (n) => Math.max(1, Math.round(n * (0.8 + Math.random() * 0.4)));

/**
 * A word or a number that rises where the blow landed.
 *
 * SCREEN space, not world space. Parented to the creature it belonged to, a
 * number was sized in WORLD px and every fight is fought at about a tile, where
 * the billboard fills the screen — so "−9" arrived the height of the corridor.
 * Worse, `slay()` removes the creature's element in the same synchronous task
 * that spawned the number, so the killing blow — the one you most want to see —
 * was destroyed before a single frame was painted.
 *
 * At a melee reach of 1.25 tiles inside a ±72° cone, whatever you hit is very
 * near the middle of the screen anyway; a fixed spot reads better than a
 * perspective-scaled one and cannot be taken away with its owner.
 */
function floater(txt, cls) {
  const box = F && F.host.querySelector('.fp-floats');
  if (!box) return;
  const el = document.createElement('span');
  el.className = 'fp-float ' + (cls || '');
  el.textContent = txt;
  el.style.setProperty('--fx', (Math.random() * 16 - 8).toFixed(1) + '%');
  box.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

/** Your blow. Aimed by you, resolved by the numbers. */
function strike(c) {
  c.aggro = true;                                  // anything you hit turns on you
  F.contactAt = performance.now();
  if (!rollHit(oddsVs(c.prey), F.hooks.fatigue)) {
    F.haul.missed = (F.haul.missed || 0) + 1;
    floater('miss', 'fp-miss');
    return;
  }
  F.haul.landed = (F.haul.landed || 0) + 1;
  const dmg = spread(DMG_BASE * Math.min(2, Math.max(0.5, oddsVs(c.prey))));
  c.hp -= dmg;
  const now = performance.now();
  c.hurtUntil = now + 160;
  // Reeling: it loses its footing AND whatever it was winding up. Pressing an
  // advantage is a tactic, not a coincidence.
  c.staggerUntil = now + STAGGER_MS;
  c.windUntil = 0;
  c.atkAt = Math.max(c.atkAt, now + STAGGER_MS + 120);
  if (c.el) c.el.classList.remove('fp-winding');
  floater('−' + dmg, 'fp-hit');
  if (c.hp <= 0) slay(c);
}

// ── Things that fly ─────────────────────────────────────────────────────────
// A fight where both parties must stand in the same square is one fight. A bow
// that reaches across the chamber, and a Mournwisp that will not close at all,
// are two more — and they are the reason the corridor has a length.

/** Small pixel art, drawn rather than cropped: no sheet in the kit carries a
 *  projectile at a size that survives being flown at the camera. */
const _shotTex = {};
function shotTexture(kind) {
  if (_shotTex[kind]) return _shotTex[kind];
  const cv = document.createElement('canvas');
  const g = cv.getContext('2d');
  if (kind === 'arrow') {
    cv.width = 24; cv.height = 8;
    g.fillStyle = '#6b4a2a'; g.fillRect(2, 3, 16, 2);            // shaft
    g.fillStyle = '#d8dce4'; g.fillRect(17, 2, 6, 4);            // head
    g.fillStyle = '#e8e0d0'; g.fillRect(0, 1, 4, 2); g.fillRect(0, 5, 4, 2); // fletching
  } else {
    const col = kind === 'plague' ? ['#8fbf5a', '#4d7a2a'] : ['#bfe6ff', '#4f86b8'];
    cv.width = 12; cv.height = 12;
    g.fillStyle = col[1]; g.fillRect(2, 2, 8, 8);
    g.fillStyle = col[0]; g.fillRect(3, 3, 6, 6); g.fillRect(1, 5, 10, 2); g.fillRect(5, 1, 2, 10);
  }
  return (_shotTex[kind] = cv.toDataURL());
}

/** Loose something. `from` is who owns the roll when it arrives. */
function spawnShot(kind, from, x, y, dx, dy, prey) {
  const w = (kind === 'arrow' ? 260 : 190) * K;
  const el = addBillboard('fp-shot', '', w, kind === 'arrow' ? w / 3 : w);
  el.style.backgroundImage = `url(${shotTexture(kind)})`;
  F.shots.push({ el, x, y, dx, dy, from, prey, t: 0, lift: -EYE * 0.62, range: from === 'player' ? BOW_RANGE : RANGED_MAX + 1 });
}

/** Advance every shot, and resolve the first thing it reaches. A shot that hits
 *  rock simply stops — the wall is what a bow cannot shoot through. */
function advanceShots(dt) {
  for (const s of F.shots.slice()) {
    s.t += dt;
    s.x += s.dx * SHOT_SPEED * dt;
    s.y += s.dy * SHOT_SPEED * dt;
    // Spent when it has flown its range, or when it finds rock. A bow that
    // carried forever would out-range the map.
    let done = s.t * SHOT_SPEED > s.range || blocked(Math.floor(s.x), Math.floor(s.y));
    if (!done && s.from === 'player') {
      const hit = F.creatures.find((c) => Math.hypot(c.x - s.x, c.y - s.y) < SHOT_HIT_R);
      if (hit) { strike(hit); done = true; }
    } else if (!done) {
      if (Math.hypot(F.px - s.x, F.py - s.y) < SHOT_HIT_R) { foeHit(s.prey, guarding()); done = true; }
    }
    if (done) { s.el.remove(); F.shots = F.shots.filter((q) => q !== s); }
  }
}

/** Its blow, wherever it came from. Melee and a thrown thing resolve on the
 *  same roll and the same numbers — only the delivery differs. */
function foeHit(prey, guarding) {
  F.contactAt = performance.now();
  const guard = guarding ? 1 - BLOCK_EVADE : 1;
  if (!rollHit((1 / oddsVs(prey)) * guard, 0)) {
    F.haul.dodged = (F.haul.dodged || 0) + 1;
    // Whose whiff it was has to be legible, or the fight is two identical words.
    // The PARAMETER, not the module function it shadows — calling the boolean
    // threw on the first evaded blow and killed the frame loop dead: the
    // playtest's "game freezes as soon as a monster approaches".
    floater(guarding ? 'blocked' : 'dodged', 'fp-parry');
    return;
  }
  F.haul.taken = (F.haul.taken || 0) + 1;
  let dmg = spread(FOE_DMG / Math.min(2, Math.max(0.5, oddsVs(prey))));
  if (guarding) { dmg = Math.max(1, Math.round(dmg * BLOCK_CUT)); braceShield(); }
  F.hp -= dmg;
  F.hurtUntil = performance.now() + 260;
  // In third person the blow lands on someone you can SEE — recoil them.
  if (F.self && F.pov === 3 && F.hp > 0) {
    F.self.gfx.setAnim(F.self.actor, 'hurt');
    F.self.busyUntil = performance.now() + 260;
  }
  floater('−' + dmg, 'fp-hurt');
  const blood = F.host.querySelector('.fp-blood');
  // `.on` is what shows it at all now (delve.css) — a stage-sized gradient held
  // at `opacity: 0` still costs a stage-sized layer, and it is invisible for
  // almost the whole of a delve. So the class has to come back OFF at the end
  // of the flash, or the first blow you take buys that layer for good.
  if (blood) {
    blood.classList.remove('on'); void blood.getBoundingClientRect(); blood.classList.add('on');
    clearTimeout(F._bloodT);
    F._bloodT = setTimeout(() => blood.classList.remove('on'), 340);
  }
  updateVitals();
  if (F.hp <= 0) {
    F.hp = 0;
    endDelve(`cut down by the ${prey.name}`, true);
  }
}

/** Melee: the same blow, delivered by something standing on top of you. */
function foeSwing(c, now) {
  c.atkAt = now + FOE_SWING_MS * (0.85 + Math.random() * 0.4);
  foeHit(c.prey, guarding());
}

/**
 * It falls, and the ledger is the same ledger the arena fed.
 *
 * The body STAYS. A creature that blinked out of existence the moment its bar
 * emptied made a corridor you had fought your way down look identical to one
 * you had walked; leaving the dead where they fell is most of why Hexen's
 * levels feel inhabited. The sprite is moved out of `creatures` and into
 * `decor`, where it is placed like any other standing thing but carries a
 * `death` value the transform folds it down by — no CSS animation, because
 * `place()` rewrites that transform every frame and the two would fight.
 */
function slay(c) {
  F.creatures = F.creatures.filter((x) => x !== c);
  c.el.classList.remove('fp-winding');
  c.el.classList.add('fp-corpse');
  if (c.bar) c.bar.remove();
  c.bar = null; c.hp = null; c.death = 0.0001;
  // Decor is placed with an explicit lift; a creature carried its own from the
  // floor it stood on. Without this the corpse's transform reads `undefinedpx`,
  // the whole declaration is dropped, and the body snaps to the world origin.
  // The surface it DIED on, not the cell's ground — a thing slain on a bridge
  // leaves its corpse on the planks, not on the creek bed below.
  c.lift = -(c.lv != null ? c.lv : heightAt(Math.floor(c.x), Math.floor(c.y))) * STEP_PX;
  F.decor.push(c);
  // Only so many. A long delve should not end up rendering a battlefield.
  const bodies = F.decor.filter((d) => d.death != null);
  while (bodies.length > CORPSE_CAP) { const old = bodies.shift(); old.el.remove(); F.decor = F.decor.filter((d) => d !== old); }
  F.haul.bouts++;
  // Banking must not be able to strand the session: a throw inside onKill used
  // to leave the delve up with no way on. Ledger first, loop always.
  try {
    const r = F.hooks.onKill(c.prey.id);
    F.haul.kills[c.prey.id] = (F.haul.kills[c.prey.id] || 0) + 1;
    if (r) {
      F.haul.gold += r.gold || 0;
      F.haul.field += r.field || 0;
      if (r.meat) F.haul.mats.game_meat = (F.haul.mats.game_meat || 0) + r.meat;
      if (r.pelt) F.haul.mats.pelt = (F.haul.mats.pelt || 0) + r.pelt;
      if (r.loot) F.haul.mats[r.loot] = (F.haul.mats[r.loot] || 0) + 1;
      toast(`${c.prey.glyph} ${c.prey.name} felled! ${r.txt || ''}`);
    }
    updateHaul();
  } catch (e) {
    console.error('delve-fp: spoils failed', e);
  }
  updateVitals();
}

/**
 * Everything the creatures do to you, and what standing clear buys back.
 *
 * Combat runs on the WALL CLOCK, not on the simulation's `now` — the same clock
 * `trySwing` already cools down against. Mixing the two means a swing cooldown
 * and a creature's cooldown drift apart under any stepped or throttled frame,
 * and the fight quietly changes speed.
 */
function fightTick(dt) {
  const now = performance.now();
  // The dead go down over half a second, then lie there.
  for (const d of F.decor) if (d.death != null && d.death < 1) d.death = Math.min(1, d.death + dt * 1000 / DEATH_MS);
  for (const c of F.creatures) {
    const d = Math.hypot(c.x - F.px, c.y - F.py);
    // Something that fights at range looses across the room instead of closing.
    // It still has to SEE you, so rock is cover — which is the first tactical
    // use the corridor's own shape has ever had.
    if (c.prey.ranged && c.aggro && c.staggerUntil <= now && d > RANGED_MIN && d < RANGED_MAX
        && clearLine(c.x, c.y, F.px, F.py, c.lv || 0, F.lv || 0)) {
      if (!c.shotAt) c.shotAt = now + RANGED_MS * 0.5;   // (unchanged — the shot aims by vector, not facing)
      else if (now >= c.shotAt) {
        c.shotAt = now + RANGED_MS * (0.8 + Math.random() * 0.5);
        const k = 1 / (d || 1);
        spawnShot(c.prey.ranged, 'foe', c.x, c.y, (F.px - c.x) * k, (F.py - c.y) * k, c.prey);
      }
    }
    const inReach = d <= MELEE && Math.abs((c.lv || 0) - (F.lv || 0)) <= 1
      && clearLine(F.px, F.py, c.x, c.y, F.lv || 0, c.lv || 0);
    if (!inReach || c.staggerUntil > now) {
      // Step out of a wind-up and the blow does not land — which is what makes
      // backing off an answer rather than a delay.
      if (c.windUntil) { c.windUntil = 0; c.el.classList.remove('fp-winding'); }
      continue;
    }
    if (!c.atkAt) { c.atkAt = now + FOE_SWING_MS * 0.5; continue; }
    // WIND UP first, strike second. A blow with no telegraph cannot be guarded
    // against; it can only be survived, which is a die roll wearing a costume.
    if (!c.windUntil) {
      if (now < c.atkAt) continue;
      c.windUntil = now + WINDUP_MS;
      c.el.classList.add('fp-winding');
      continue;
    }
    if (now >= c.windUntil) {
      c.windUntil = 0;
      c.el.classList.remove('fp-winding');
      foeSwing(c, now);
    }
    if (!F || F.ended) return;
  }
  // A breather, but never the whole of it back. Each bout lowers the ceiling,
  // so the question a delve asks is how much further you can afford to go.
  if (now - (F.contactAt || 0) > REGEN_DELAY * 1000 && F.hp < F.hpCeil) {
    F.hp = Math.min(F.hpCeil, F.hp + REGEN_PER_S * dt);
    updateVitals();
  }
  F.hpCeil = Math.max(REGEN_FLOOR, HP_MAX - REGEN_COST * F.haul.bouts);
}

/** Drink. Real Apothecary stock, spent through hall.js — the delve cannot
 *  conjure a bottle the guild does not have, and it never drinks two at once. */
function drink() {
  const now = performance.now();
  if (!F || F.ended || now < (F.drinkUntil || 0)) return;
  if (F.hp >= F.hpCeil) { toast('No need — still hale.'); return; }
  const p = F.hooks.drink && F.hooks.drink();
  if (!p) { toast('No draughts in the satchel.'); return; }
  F.drinkUntil = now + 900;
  F.hp = Math.min(F.hpCeil, F.hp + (p.potency || 20));
  floater('+' + (p.potency || 20), 'fp-heal');
  toast(`${p.name} — ${Math.ceil(F.hp)} left in you.`);
  updateVitals();
  updatePotions();
}

/** How many draughts are left, on the pad's own button. */
function updatePotions() {
  const b = F.host.querySelector('.fp-drink b');
  if (!b) return;
  const n = F.hooks.potions ? F.hooks.potions() : 0;
  b.textContent = n;
  const btn = F.host.querySelector('.fp-drink');
  if (btn) btn.classList.toggle('fp-dry', !n);
}

function braceShield() {
  const s = F.hands && F.hands.shield;
  if (!s) return;
  s.el.classList.remove('fp-bracing');
  void s.el.getBoundingClientRect();
  s.el.classList.add('fp-bracing');
  playFrames(s, WORN.shieldBrace);
}

/** The one bar that matters, plus the red edge of being hurt. */
function updateVitals() {
  const el = F.host.querySelector('.fp-vitals-fill');
  if (el) el.style.width = Math.max(0, Math.min(100, (F.hp / HP_MAX) * 100)).toFixed(1) + '%';
  const cap = F.host.querySelector('.fp-vitals-cap');
  if (cap) cap.style.left = Math.max(0, Math.min(100, (F.hpCeil / HP_MAX) * 100)).toFixed(1) + '%';
  const n = F.host.querySelector('.fp-vitals-n');
  if (n) n.textContent = Math.ceil(F.hp);
}

/** Work a vein out of the wall in front of you. The face becomes floor, so the
 *  seam you broke is the way on — a mine opens up as you take it apart. */
function mineOre(x, y) {
  const key = F.map.id + ':' + x + ',' + y;
  if (F.mined.has(key)) return;
  F.mined.add(key);
  const kind = oreKindAt(x, y);   // the same seam the top-down walk would pay
  F.grid = F.grid.map((row, ry) => (ry === y ? row.slice(0, x) + '.' + row.slice(x + 1) : row));
  buildGeometry();
  const k = ORE_KINDS[kind];
  const r = F.hooks.onOre(kind);
  F.haul.gold += k.gold;
  if (k.mat) F.haul.mats[k.mat] = (F.haul.mats[k.mat] || 0) + 1;
  updateHaul();
  toast(r && r.txt ? r.txt : `${k.name} · +${k.gold}g`);
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function render() {
  // OVER THE SHOULDER: third person is the same camera pulled back along the
  // facing and lifted — the world, the controls and the combat don't move.
  const pov3 = F.pov === 3;
  // The pull-back hangs off the LIVE yaw, not the settled facing. F.dir snaps
  // to the new heading the instant a turn begins while the view lerps after
  // it, so a pull-back along DIRV jumped 45° ahead of the camera's own
  // rotation for the length of every turn — the one window in which the
  // chase camera was NOT behind the walker.
  const yr = F.yaw;                    // radians, natively, since the swap
  /**
   * Third person frames like the reference action-RPG shot: about a tile
   * back, eye barely over the member's head, lens tipped 9° down — head near
   * screen centre, feet near the bottom edge, roughly half a screen of
   * character. And the pull-back CLAMPS at solid cells (walls, ore faces,
   * props): backed into rock, the camera slides in over your shoulder rather
   * than leaving you watched from inside the hill.
   */
  let back = 0;
  if (pov3) {
    back = 1.1;
    for (let s = 0.2; s <= 1.1 + 1e-6; s += 0.15) {
      const cx = F.px - Math.sin(yr) * s, cy = F.py + Math.cos(yr) * s;
      if (blocked(Math.floor(cx), Math.floor(cy))) { back = Math.max(0.4, s - 0.3); break; }
    }
    back *= T;
  }
  /**
   * THE CAMERA ORBITS THE WALKER'S OWN EYE — it does not sit at a fixed offset
   * and tip.
   *
   * The difference is the whole of "as I change the camera angle, the player
   * character seems to shift up on screen". A camera parked behind and above by
   * fixed amounts sees the walker at a fixed angle α below its horizontal, so
   * tipping the lens by θ puts them at screen `P·tan(α − θ)`: the steeper the
   * lean, the further up the frame they climb, until at 45° they are near the
   * middle. Framing that moves when you change the angle is not framing.
   *
   * So the pull-back is resolved on a CIRCLE around the aim point instead —
   * horizontal `R·cos(angle)`, rise `R·sin(angle)` — which puts the camera
   * exactly `angle` above the aim, and `camLean()` (which is −angle) then points
   * it exactly at that aim. The aim projects to the middle of the screen at
   * EVERY angle, so the walker cannot move.
   *
   * The aim is the walker's own EYE, and that is what gets the framing for free:
   * head near the centre, body hanging below it, feet at ~82% down the frame.
   */
  const orb = pov3 ? camLean() * -Math.PI / 180 : 0;
  const horiz = back * Math.cos(orb);
  const ex = F.px * T - Math.sin(yr) * horiz, ez = F.py * T + Math.cos(yr) * horiz;
  // The level under the eye, interpolated across a stride so a walk-off-the-
  // ledge drop is a hop down rather than a mid-step teleport.
  // Smoothed every frame in steer() now, instead of eased across a stride.
  const lev = F.lev;
  let ey = -EYE - lev * STEP_PX - back * Math.sin(orb);
  // Under a deck the chase camera's rise would put the lens inside (or above)
  // the planks, photographing the deck top instead of the subject — clamp it
  // just beneath the underside, the same instinct backOff has at rock.
  if (pov3) {
    const dk = F.model.deckAt(Math.floor(F.px), Math.floor(F.py));
    if (dk != null && (F.lv || 0) < dk) ey = Math.max(ey, -(dk * STEP_PX - STEP_PX * 0.2) + 8);
  }
  // rotateY(+yaw), not −yaw. Forward is −Z, and CSS rotateY maps (x,y,z) to
  // (x·cosθ + z·sinθ, y, −x·sinθ + z·cosθ) — so facing east (yaw 90) has to send
  // world +X to view −Z, which needs +90. The negative sign put east BEHIND the
  // camera and left you staring at the wall you had just walked away from.
  // scale3d, never scale(): a 2D scale between a rotate and the billboards'
  // counter-rotate leaves Z alone, which is not a similarity in 3D and squashes
  // every standee (the top-down view learned this the hard way).
  // Guarded like every billboard write below: an idle frame must recomposite
  // nothing, and an unguarded write here recomposited the whole quad stack.
  /**
   * The chase pitch is CAMERA-space, so it sits left of the yaw (scale3d is a
   * uniform similarity and commutes past it).
   *
   * NEGATIVE, and the sign is the point. CSS `rotateX(+θ)` puts a point
   * straight ahead BELOW the screen centre, which means the camera is aimed
   * ABOVE it — the `9deg` this replaces was looking UP nine degrees, and so
   * were both battle lenses. Looking DOWN is the three-quarter view every
   * isometric RPG uses, and it is what lets art drawn for a top-down game read
   * at all: "up" on a sprite gains an AWAY component of sin(lean) — a quarter
   * of it at 25° — so a swing drawn going up starts reading as going forward,
   * and the floor is visible enough to tell where anything is standing. The
   * arithmetic: this camera rides 41 world px above the eye and 1.1 tiles back,
   * which puts the walker's centre 23.6° below its horizontal, so looking up 9
   * left them 32.6° down the frame.
   *
   * It is `camLean()` — ONE slider shared with action-fp.js and tactical-fp.js,
   * so the three third-person cameras cannot drift and the sign can only be got
   * wrong in one place. @see view-prefs.js.
   *
   * Billboards only counter-yaw, so they lean by the whole of it from true.
   * That lean is not a cost here, it is the mechanism.
   */
  const wtf = `scale3d(${F.lens.toFixed(4)},${F.lens.toFixed(4)},${F.lens.toFixed(4)})`
    + `${pov3 ? ` rotateX(${camLean()}deg)` : ''}`
    + ` rotateY(${(F.yaw * 180 / Math.PI).toFixed(2)}deg)`
    + ` translate3d(${(-ex).toFixed(1)}px,${(-ey).toFixed(1)}px,${(-ez).toFixed(1)}px)`;
  if (wtf !== F._wtf) F.world.style.transform = (F._wtf = wtf);
  /**
   * THE SAME CAMERA, TOLD TO A RASTERISER.
   *
   * The eye, the bearing and the lean are already computed above for the CSS
   * transform — this hands them to the shader instead of building a string, so
   * the two backends cannot disagree about where you are standing.
   *
   * The world SCALE is deliberately not passed. In the CSS form a fixed
   * `perspective` P and a scaled world express a field of view together, and
   * the scale cancels: a world length L at world depth D lands at `L·P/D` on
   * screen whatever the scale, so the vertical FoV is exactly `2·atan(h/2P)` —
   * which is `view.fov`, by construction of `perspectiveFor`. Handing the
   * projection the FoV directly is therefore the same picture, not a new one.
   *
   * Fog is in TILES in this file and world px in the shader, so it multiplies
   * by the tile on the way out. It is the only conversion between them.
   */
  if (glOn()) {
    // Sized from the live stage every frame, not only from fitLens. fitLens
    // bails when the stage measures nothing — which is exactly what it does
    // during mount(), before showScreen — and a canvas that missed its one
    // chance to be sized stays 1×1 and draws a frame nobody can see. `resize`
    // early-outs on no change, so the cost of never having that bug is nil.
    const st = F.host.querySelector('.fp-stage');
    if (st && st.clientHeight) {
      F.gl.resize(st.clientWidth, st.clientHeight, glDpr());
    }
    F.gl.setCamera({
      x: ex, y: ey, z: ez, yaw: yr,
      pitch: pov3 ? camLean() * Math.PI / 180 : 0,
      fovY: view.fov * Math.PI / 180,
      // @see viewFromEye: this is what makes it the SAME picture, not a new one.
      back: st && st.clientHeight ? perspectiveFor(st.clientHeight) / F.lens : 0,
    });
    F.gl.setFog(L.rgb, L.near * T, L.far * T);
    /**
     * THE SCENERY GOES IN THE BUFFER TOO — and this is the fix for the first
     * rasterised build coming back with the flicker, the dropped HUD and the
     * low frame rate all intact.
     *
     * Putting the WORLD on a canvas took ~1180 compositor layers down to 11,
     * and then opening the draw distance to the whole chart handed most of them
     * straight back: `place()` shows a billboard until the fog has taken it, so
     * a fog that now reaches the far side of the meadow means every tree in the
     * meadow is a live DOM layer at once. The renderer was fine; the scenery
     * around it was still being composited, in numbers the old short fog had
     * been quietly hiding.
     *
     * So decor and shots are drawn here, from the records rather than the DOM
     * (`.fp-gl-on` hides those elements), each one a camera-facing quad taking
     * its texture from the canvas the billboard already holds.
     *
     * CREATURES AND MARKERS STAY DOM on purpose. A creature carries an overhead
     * health bar and a hurt flash, and a marker is a glyph and a label — those
     * are LABELS, they belong on top, and there are never more than a handful.
     * Trees are what there are two hundred of.
     */
    const sprites = [];
    const add = (rec) => {
      const el = rec.el;
      if (!el || el.style.display === 'none') return;
      const w = parseFloat(el.style.width), h = parseFloat(el.style.height);
      if (!(w > 0) || !(h > 0)) return;
      /**
       * A billboard's art is one of two things in this codebase and the
       * rasteriser takes both: a real CANVAS child (decals and creatures, drawn
       * by hand at build time) or a CROP OF A SHEET (everything through
       * `artSprite`, which the DOM spells as a background-position and
       * `artTexRect` spells as a URL plus four UVs). Cached on the element,
       * because this runs for every sprite every frame.
       */
      let g = el._glSrc;
      if (g === undefined) {
        const cv = el.querySelector('canvas, img');
        g = el._glSrc = cv ? { src: cv, uv: null } : (el._glTex ? { src: el._glTex.url, uv: el._glTex.uv } : null);
      }
      if (!g) return;
      sprites.push({ src: g.src, uv: g.uv, w, h, x: rec.x * T, y: rec.lift || 0, z: rec.y * T, alpha: 1 });
    };
    for (const d of F.decor) if (!d.el.classList.contains('fp-marker')) add(d);
    for (const s of F.shots) add(s);
    /**
     * THE PEOPLE JOIN THE PICTURE (playtest: walking behind the lamp post
     * "makes the character appear on top of it"). Creatures and the
     * third-person self were DOM billboards composited OVER the canvas — no
     * depth test, so no voxel could ever stand in front of them. Their
     * canvases are LIVE textures (`_glRev` re-uploads on repaint), so they
     * ride the sprite buffer and the depth buffer decides who is in front.
     * The DOM els survive as LABELS — health bar, hurt flash — with only the
     * drawn body hidden (@see delve.css .fp-gl-on rules).
     */
    for (const c of F.creatures) {
      if (c._hidden || !c.el || c.el.style.display === 'none') continue;
      const w = parseFloat(c.el.style.width), h = parseFloat(c.el.style.height);
      if (!(w > 0) || !(h > 0)) continue;
      sprites.push({
        src: c.cv, uv: null, w, h,
        x: c.x * T, y: -(c.lv != null ? c.lv : heightAt(Math.floor(c.x), Math.floor(c.y))) * STEP_PX, z: c.y * T, alpha: 1,
      });
    }
    if (F.self && F.pov === 3) {
      const sh = parseFloat(F.self.el.style.height) || 0;
      // The compositor cell keeps ~31% of itself empty under the feet; a
      // buffer sprite stands ON its anchor, so the anchor drops by that band
      // or the member floats their own footroom above the floor.
      if (sh > 0) sprites.push({
        src: F.self.cv, uv: null, w: sh, h: sh,
        x: F.px * T, y: -lev * STEP_PX + sh * 0.3125, z: F.py * T, alpha: 1,
      });
    }
    F.gl.setSprites(sprites);
    F.gl.draw();
  }
  // Billboards stand on the floor and counter-rotate to face the walker. Every
  // write is guarded by the value it would write: standing still, this loop
  // touches no style at all, which is the difference between a scene that
  // re-rasterises 30 layers a frame and one that does nothing.
  for (const c of F.creatures) place(c, c.x, c.y, -(c.lv != null ? c.lv : heightAt(Math.floor(c.x), Math.floor(c.y))) * STEP_PX);
  for (const d of F.decor) place(d, d.x, d.y, d.lift);
  // The solids do NOT move. They were placed once in world space, standing on
  // their own ground (@see buildProps) — all a frame owes them is the dark.
  fogSolids();
  for (const s of F.shots) place(s, s.x, s.y, s.lift);
  // A raised shield has to LOOK raised, or the only feedback for a key you are
  // holding down is that you cannot attack.
  if (F.hands && F.hands.shield) {
    const up = guarding();
    if (up !== F.hands._guard) { F.hands._guard = up; F.hands.shield.el.classList.toggle('fp-guarding', up); }
  }
  // DUEL STANCE. A rank-1 creature stands 320 world px — knee height — and the
  // tile in front of you is exactly where the viewmodel lives, so the thing
  // you were fighting was hidden behind your own sword. When anything alive is
  // in the fight, the hands drop clear; they rise again once the floor ahead
  // is empty. Hysteresis (enter 1.7, leave 2.05) so a circler on the threshold
  // doesn't strobe the hands. Class goes on the HOST so the CSS can reach both
  // hands and the shield with one flag.
  if (F.hands) {
    const near = F.creatures.some((c) => Math.hypot(c.x - F.px, c.y - F.py) < (F._duel ? 2.05 : 1.7));
    if (near !== !!F._duel) { F._duel = near; F.host.classList.toggle('fp-duel', near); }
  }
  // The hands ride the stride and lag the turn — the whole reason to draw them
  // is that they are the only thing on screen that moves WITH you.
  if (F.hands) {
    // Bob rides DISTANCE travelled, so walking into a wall does not bob; sway
    // is a low-passed yaw rate. Both hard-zero in steer(), so a standing frame
    // builds the same string and the guard below rejects the write.
    // ONE transform write, not two inherited custom properties — @see the note
    // on `.fp-hands` in delve.css for why that distinction is the difference
    // between smooth and unplayable when a swing is running underneath.
    //
    // And quantised to a HALF PIXEL. At a tenth the bob changes on very nearly
    // every frame of a walk, which is a write per frame for a difference no eye
    // resolves; at a half it changes a few times a cycle and the guard below
    // rejects the rest.
    // FROZEN DURING A SWING. This layer carries the perspective the swing is
    // projected through, so a transform here invalidates the projection of a
    // ~2.7 Mpx animating child on every frame — which is precisely why walking
    // alone and swinging alone are both smooth and doing both is 5fps.
    const swinging = performance.now() < F.swingUntil;
    const spd = swinging ? 0 : Math.min(1, Math.hypot(F.vx, F.vy) / WALK_SPEED);
    const q = (v) => (Math.round(v * 2) / 2).toFixed(1);
    const tf = swinging ? F._handTf || 'translate3d(0px,0px,0)'
      : `translate3d(${q(clamp1(F.sway) * -30)}px,${q(Math.sin(F.bobPhase) * 26 * spd)}px,0)`;
    if (tf !== F._handTf) F.hands.el.style.transform = (F._handTf = tf);
  }
  // The walker's own back, when the camera stands behind it.
  if (F.self) {
    if (pov3 !== F.self._on) { F.self._on = pov3; F.self.el.style.display = pov3 ? '' : 'none'; }
    if (pov3) {
      const lift = -lev * STEP_PX;   // the same interpolated level the eye rides
      const tf = `translate3d(${(F.px * T).toFixed(1)}px,${lift.toFixed(1)}px,${(F.py * T).toFixed(1)}px)`
        + ` rotateY(${(-F.yaw * 180 / Math.PI).toFixed(1)}deg)`;
      if (tf !== F.self._tf) F.self.el.style.transform = (F.self._tf = tf);
      /**
       * The pose is CAMERA-relative, like every rotation in this view
       * (tactical-fp's drawActor does the identical subtraction). The chase
       * camera looks along the walker's own facing, so the difference is ~0
       * and the compositor draws the BACK row — you stand behind the member.
       * Passing the WORLD facing here handed facingToRow a fixed-north
       * camera's answer: face east and the standee turned its profile — or,
       * facing south, its FACE — to a camera that was standing behind it,
       * which is what the playtest reported as "the camera isn't behind me".
       * During a turn the settled facing leads the lerping yaw by up to 45°,
       * so the sprite leans into the turn for a beat, which is the one moment
       * a profile is the true answer.
       */
      // Facing follows the MOVEMENT while moving and holds when still, so a
      // strafe shows a profile. The old lean-into-the-turn came from F.dir
      // leading the lerping yaw, and goes with the tween that produced it.
      if (Math.hypot(F.vx, F.vy) > 0.05) F.selfFace = Math.atan2(F.vx, -F.vy);
      F.self.actor.facing = (F.selfFace == null ? F.yaw : F.selfFace) - yr;
      const now = performance.now();
      // One-shots (a swing, a bow draw, a hit taken) own the sprite while
      // they play; the stance logic reasserts itself the moment they lapse.
      if (now >= (F.self.busyUntil || 0)) {
        // Climb pose only while the LEVEL is actually easing, or standing in
        // the middle third of the rungs' own cell — floor(px) alone flipped
        // the pose a half-tile early and the member mimed the climb from the
        // approach (playtest). F.lev eases toward heightAt in steer(), so
        // "easing" IS the climb in motion.
        const cellX = Math.floor(F.px), cellY = Math.floor(F.py);
        const centred = Math.abs(F.px - cellX - 0.5) < 0.3 && Math.abs(F.py - cellY - 0.5) < 0.3;
        // Against the COMMITTED surface, not the cell's ground — standing on a
        // bridge deck is standing, not an endless mime of climbing. Stairs
        // never pose the climb either: they are walked (onClimb is L/v only).
        const climbing = Math.abs((F.lv || 0) - F.lev) > 0.05
          || (onClimb(cellX, cellY) && centred);
        const desired = guarding() ? 'hold'
          : climbing ? 'climb'
            : Math.hypot(F.vx, F.vy) > 0.05 ? 'move' : 'idle';
        if (F.self.actor.anim.name !== desired) F.self.gfx.setAnim(F.self.actor, desired);
      }
      // Tick, THEN draw: the anim frames advance on the compositor's own
      // stepper (walk cycle, slash follow-through), exactly as the top-down
      // walker's do. Without the tick every anim froze on its first frame.
      F.self.gfx.tickActor(F.self.actor, now);
      F.self.gfx.renderActor(F.self.cv, F.self.actor);
      F.self.cv._glRev = (F.self.cv._glRev || 0) + 1;   // the buffer copy follows
    }
  }
  // The compass element survives portal re-mounts (mount() rebuilds only the
  // stage, the HUD is per-session), so it is looked up once — a querySelector
  // plus a textContent write per frame kept layout dirty on every idle frame.
  if (!F._comp) F._comp = F.host.querySelector('.fp-compass');
  // The double modulo is not optional: a negative yaw gives a negative index
  // and the HUD reads "✦ undefined".
  const cd = ((Math.round(F.yaw / (Math.PI / 4)) % 8) + 8) % 8;
  if (F._comp && F._compDir !== cd) { F._compDir = cd; F._comp.textContent = '✦ ' + COMPASS[cd]; }
}

/** The scrap of chart you have drawn so far — only cells you have stood on and
 *  what you could see from them. A crawler without one is a maze, not a map. */
function drawMap() {
  const cv = F.host.querySelector('.fp-map');
  if (!cv) return;
  const g = cv.getContext('2d');
  const R = 9, cell = cv.width / (R * 2 + 1);
  g.clearRect(0, 0, cv.width, cv.height);
  const cx = Math.floor(F.px), cy = Math.floor(F.py);
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      const x = cx + dx, y = cy + dy;
      // Keyed by MAP, like `mined` beside it. Bare coordinates meant a room you
      // walked through left its shape drawn on the chart of the next room —
      // walk the Academy's first form, step through, and the second form opens
      // with a corridor sketched in that it does not have.
      if (!F.seen.has(F.map.id + ':' + x + ',' + y) && Math.hypot(dx, dy) > 3.5) continue;
      const ch = at(x, y);
      g.fillStyle = WALL[ch] ? '#3b3128' : LOW[ch] ? '#5a4a36' : ch === '#' ? 'transparent'
        : EXIT[ch] ? '#d4a843' : ch === '+' ? '#8ab4d8' : '#7d6a4e';
      g.fillRect((dx + R) * cell, (dy + R) * cell, cell - 0.5, cell - 0.5);
      // Height shading — the automap tells terraces from trenches at a glance.
      const lv = heightAt(x, y);
      if (lv && !WALL[ch] && !LOW[ch] && ch !== '#') {
        g.fillStyle = lv > 0 ? `rgba(255,244,214,${Math.min(0.42, 0.14 * lv)})` : 'rgba(0,0,0,0.35)';
        g.fillRect((dx + R) * cell, (dy + R) * cell, cell - 0.5, cell - 0.5);
      }
      if (DECK_CH[ch] && F.model.deckAt(x, y) != null) {
        g.fillStyle = ch === 'n' ? '#8a6a42' : '#6e6250';
        g.fillRect((dx + R) * cell, (dy + R) * cell + cell * 0.3, cell - 0.5, cell * 0.4);
      }
    }
  }
  g.fillStyle = '#e8e0d0';
  g.beginPath();
  const mx = (R + 0.5) * cell, my = (R + 0.5) * cell, a = F.yaw - Math.PI / 2;
  g.moveTo(mx + Math.cos(a) * cell, my + Math.sin(a) * cell);
  g.lineTo(mx + Math.cos(a + 2.5) * cell, my + Math.sin(a + 2.5) * cell);
  g.lineTo(mx + Math.cos(a - 2.5) * cell, my + Math.sin(a - 2.5) * cell);
  g.fill();
}

function stepSim(now) {
  const dt = Math.min(0.08, (now - (F.last || now)) / 1000);
  /**
   * Re-asked between every stage, not once at the top. Any stage can end the
   * session or start a door: a strike can drop the last creature and a stride
   * can land on the stairs, and `onArrive` fires `usePortal`, which swaps the
   * whole map out. Testing once up front let the stride that a portal
   * interrupted finish inside the room it had already left.
   */
  const busy = () => F.transiting || F.ended;
  // Mouse and controller first: they speak into the same key table readInput
  // reads, so they have to have spoken before it looks.
  if (!busy()) readDevices();
  if (!busy()) steer(dt);
  if (!busy()) onCellChange();
  if (!busy()) checkDoors();
  if (!busy()) moveCreatures(dt);
  if (!busy()) checkArmed();
  if (!busy()) fightTick(dt);
  if (!busy()) advanceShots(dt);
  if (!F || F.ended) return false;
  render();
  F.last = now;
  return true;
}

function tick(now) {
  if (!F || F.ended) return;
  if (!screenActive()) { F.raf = 0; return; }
  if (!stepSim(now)) return;
  F.raf = requestAnimationFrame(tick);
}
function startLoop() {
  if (!F || F.raf) return;
  F.last = 0;
  F.raf = requestAnimationFrame(tick);
}

// ---------------------------------------------------------------------------
// HUD and endings
// ---------------------------------------------------------------------------

function toast(txt) {
  const box = F.host.querySelector('.fp-toasts');
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'dv-toast';
  el.textContent = txt;
  box.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}
function updateHaul() {
  const el = F.host.querySelector('.fp-haul');
  if (!el) return;
  const kills = Object.values(F.haul.kills).reduce((s, n) => s + n, 0);
  el.textContent = `☠ ${kills} · ${F.haul.gold}g`;
}

/**
 * The view cycle: first person → over the shoulder → back to the top-down
 * walk. The first two move only the CAMERA (render pulls it back along the
 * facing) and stand the member's own composited sprite at the walker cell —
 * same controls, same combat, same spoils. The viewmodel hands hide via
 * .fp-pov3 (you can't hold a sword to a screen you are standing inside of).
 * The third step hands the whole session back to the top-down engine.
 */
function togglePov() {
  if (!F || F.ended || F.transiting) return;
  if (F.pov === 3) { swapToTop(); return; }
  F.pov = 3;
  F.host.classList.toggle('fp-pov3', true);
  if (!F.self) mountSelf();
  F._wtf = '';                       // force the camera transform to rewrite
  buildGeometry();                   // the shoulder camera drops the ceilings
  toast('Over the shoulder.');
  povLabel();
}

/** The view button says where tapping TAKES you, in words — an eye glyph read
 *  as decoration and nobody found the other camera behind it. */
function povLabel() {
  const b = F && F.host.querySelector('.fp-povbtn');
  if (b) b.textContent = F.pov === 3 ? 'Top-down' : '3rd person';
}

/** Hand the session back to the top-down walk, mid-stride — the mirror of the
 *  top-down HUD's "1st person". Same carry, same hooks, no payout. */
function swapToTop() {
  if (!F || F.ended || F.transiting) return;
  const hooks = F.hooks;
  if (!hooks.swapView) return;
  F.transiting = true;
  const carry = {
    swap: true, mapId: F.map.id, at: [F.px, F.py], lev: F.lv,
    // The facing crosses too — the walker turns to look where you were looking.
    dir: Math.round((((F.yaw * 180 / Math.PI) % 360) + 360) % 360 / 45) % 8,
    stack: F.stack.slice(), mined: [...F.mined], haul: F.haul,
  };
  hooks.swapView('top', carry).then((ok) => { if (!ok && F) F.transiting = false; });
}

/** Retire the session with no ending — the view swap took it over. */
export function closeDelveFpSilent() {
  if (!F) return;
  if (F.raf) cancelAnimationFrame(F.raf);
  clearTimeout(F.helpTimer);
  unwireInput();
  if (F.joyTouchOff) F.joyTouchOff();
  for (const s of [F.surf, ...Object.values(F.surfByTheme || {})]) {
    if (s && s._urls) s._urls.forEach((u) => URL.revokeObjectURL(u));
  }
  F.host.innerHTML = '';
  F = null;
}
function mountSelf() {
  const gfx = window.__ranchGfx;
  if (!gfx) { console.warn('delve-fp: compositor missing — no third-person sprite'); return; }
  /**
   * The BILLBOARD is not the ART. The compositor centres a small sprite in
   * its 96px cell: ~31% of the canvas is empty under the feet and ~11% over
   * the head, so the drawn member occupies only ~58% of the box. Sizing the
   * billboard to CREATURE_H[3] therefore drew YOU at 58% of your own height —
   * knee-high to the squirrels, and most of why the third-person camera read
   * as "too small". Creatures don't share the problem (trimBox crops their
   * art to fill the billboard exactly); the self canvas can't be trimmed per
   * frame, so the box is scaled up until the ART inside it is a full person.
   */
  const h = CREATURE_H[3] * 1.73;
  const el = addBillboard('fp-self', '', h, h);
  const cv = document.createElement('canvas');
  cv.width = 96; cv.height = 96;
  el.appendChild(cv);
  F.self = { el, cv, gfx, actor: gfx.makeActor(F.member), busyUntil: 0, _on: false, _tf: '' };
  el.style.display = 'none';
}

/**
 * The third-person half of a swing: the member's own standee plays the same
 * compositor attack every other combat lens plays — blade drawn off the back
 * (makeActor's sheatheWhenIdle) and swung, or the bow nocked and loosed. The
 * hands' viewmodel is hidden in this view, so without this the only evidence
 * of your own attack was the slash SVG flashing over an idle sprite.
 */
function selfSwing(bow) {
  if (!F.self || F.pov !== 3) return;
  F.self.gfx.setAnim(F.self.actor, bow ? 'nockBow' : 'slash');
  // Slightly past the anim's own length, so the stance logic in render()
  // cannot snatch the sprite back mid-follow-through.
  F.self.busyUntil = performance.now() + (bow ? 460 : SWING_MS);
}

function leave() { if (F && !F.ended) endDelve('called it a day'); }

function endDelve(reason, beaten = false) {
  if (!F || F.ended) return;
  F.ended = true;
  if (F.raf) cancelAnimationFrame(F.raf);
  clearTimeout(F.helpTimer);
  unwireInput();
  if (F.joyTouchOff) F.joyTouchOff();
  const h = F.haul;
  const killLines = Object.keys(h.kills).map((pid) => {
    const p = preyById(pid);
    return `<div class="ds-line">${p.glyph} ${p.name} × ${h.kills[pid]}</div>`;
  }).join('') || '<div class="ds-line dim">No kills — the dark keeps its own.</div>';
  const matLines = Object.keys(h.mats).map((m) => `<div class="ds-line">▪ ${m.replace(/_/g, ' ')} × ${h.mats[m]}</div>`).join('');
  F.host.insertAdjacentHTML('beforeend', `
    <div class="delve-summary">
      <div class="ds-card">
        <div class="ds-title">${beaten ? 'Driven out' : 'Back to daylight'}</div>
        <div class="ds-sub">${F.member.name.split(' ')[0]} ${reason}.</div>
        ${killLines}${matLines}
        ${h.gold ? `<div class="ds-line">${icon('coin')} +${h.gold} gold</div>` : ''}
        ${h.field ? `<div class="ds-line">${icon('scroll')} +${h.field} field insight</div>` : ''}
        <button class="dv-close" onclick="__delveFp.close()">Return to the Guild</button>
      </div>
    </div>`);
}

function close() {
  if (!F) return;
  clearTimeout(F._bloodT);
  // The GL context and every texture in it go with the session — `host.innerHTML
  // = ''` below drops the canvas, and a context left behind is one of the very
  // few things a browser will not reclaim on its own.
  if (F.gl) { F.gl.dispose(); F.gl = null; }
  const hooks = F.hooks, summary = F.haul;
  for (const s of [F.surf, ...Object.values(F.surfByTheme || {})]) {
    if (s && s._urls) s._urls.forEach((u) => URL.revokeObjectURL(u));
  }
  F.host.innerHTML = '';
  F = null;
  hooks.onEnd(summary);
}

window.__delveFp = { leave, close, help: () => helpUntil(9000), pov: togglePov };

// Dev probe — the headless pane runs no rAF, so the sim is stepped by hand.
if (typeof window !== 'undefined') {
  window.__fpDebug = () => F && ({
    map: F.map && F.map.id, x: +F.px.toFixed(2), y: +F.py.toFixed(2),
    lv: F.lv, lev: +F.lev.toFixed(3),   // committed surface · the eased eye
    dir: COMPASS[((Math.round(F.yaw / (Math.PI / 4)) % 8) + 8) % 8],
    yawDeg: +(F.yaw * 180 / Math.PI).toFixed(1),
    speed: +Math.hypot(F.vx, F.vy).toFixed(3),
    moving: Math.hypot(F.vx, F.vy) > 0.05, hp: Math.ceil(F.hp), hpCeil: F.hpCeil, armed: F.armed,
    quads: F.world.querySelectorAll('.fp-q').length, creatures: F.creatures.length,
    // How far this chart was fitted to be seen, and the weather that closes it.
    // `merged` is the whole point of the 2026-08-03 pass: how many of those
    // quads are ground blocks or wall runs standing in for several cells each.
    view: { R: F.viewR, clear: +L.near.toFixed(1), gone: +L.far.toFixed(1), budget: Math.round(budgetNow()), dial: view.dist },
    merged: [...F.geo.keys()].filter((k) => /^[fcsnew][248]:/.test(k)).length,
    veils: F.world.querySelectorAll('.fp-veil').length,
    // Split out because the two are bounded by different things and the phone
    // falls over on the total: geometry is the view radius squared, solids are
    // whatever the chart furnished the map with. `drawn` excludes the ones fog
    // has taken out of the compositor entirely.
    decor: F.decor.length, solids: F.solids.length,
    solidsDrawn: F.solids.filter((s) => !s.off).length,
    voxProps: (F.propQuads || []).length,
    propBlockers: (F.propBlockers || []).length,
    haul: F.haul.gold, seen: F.seen.size, power: F.hooks.power, fatigue: F.hooks.fatigue,
    fight: { swings: F.haul.swings|0, landed: F.haul.landed|0, missed: F.haul.missed|0, foeHits: F.haul.taken|0, foeMisses: F.haul.dodged|0, bouts: F.haul.bouts },
    // The three numbers that decide whether a swing lands: how far the nearest
    // creature is, and how far in front of you it is.
    near: F.creatures.map((c) => {
      const vx = c.x - F.px, vy = c.y - F.py, d = Math.hypot(vx, vy) || 1e-6;
      const dx = Math.sin(F.yaw), dy = -Math.cos(F.yaw);
      return {
        id: c.prey.id, d: +d.toFixed(2), dot: +((vx * dx + vy * dy) / d).toFixed(2),
        row: ['front', 'left', 'right', 'back'][c.row], mode: c.mode,
        awake: !!c.aggro, hp: Math.max(0, Math.round(c.hp)),
        winding: !!c.windUntil, staggered: c.staggerUntil > performance.now(),
      };
    }).sort((a, b) => a.d - b.d).slice(0, 3),
  });
  /** The rendered frame, read back — @see gl-world.js `probe`. */
  window.__fpGl = (c, r, rect) => (F && F.gl
    ? { ...F.gl.stats(), ...F.gl.probe(c, r, rect), R: F.viewR, fog: [+L.near.toFixed(1), +L.far.toFixed(1)] }
    : null);
  /** Where a world point lands on the stage. The proof that the rasteriser's
   *  camera IS the CSS camera is projecting the same point both ways. */
  window.__fpProject = (x, y, z) => (F && F.gl ? F.gl.project(x, y, z) : null);
  window.__fpStep = (steps = 1, keys = '', ms = 16) => {
    if (!F || F.ended) return null;
    const map = { w: 'fwd', s: 'back', a: 'strafeL', d: 'strafeR', l: 'turnL', r: 'turnR', x: 'attack' };
    for (const k of keys) if (map[k]) F.keys[map[k]] = true;
    for (let i = 0; i < steps; i++) {
      if (!F || F.ended) break;
      stepSim((F.last || performance.now()) + ms);
    }
    for (const k of keys) if (map[k]) F.keys[map[k]] = false;
    return window.__fpDebug();
  };
  // Mouse look, without a mouse: a headless pane can hold no pointer lock, so
  // the bank the lock would have filled is handed to readDevices directly.
  window.__fpLook = (rad, steps = 1) => {
    if (!F || F.ended) return null;
    const real = F.look;
    let spent = false;
    F.look = { locked: () => true, read: () => (spent ? { yaw: 0, pitch: 0 } : (spent = true, { yaw: rad || 0, pitch: 0 })) };
    for (let i = 0; i < steps; i++) stepSim((F.last || performance.now()) + 16);
    F.look = real;
    return window.__fpDebug();
  };
}
