# The two map kinds nobody has authored yet — a scout

Scope: **STADIUM** (an authored venue for `tactical-fp.js` / `action-fp.js`) and
**WORLD** (roads and realm borders on `world-guilds.js` + `globe.js`). No game
code was written. Every dimension, crop rectangle and colour below was measured
by decoding the actual PNGs — a scratchpad PNG decoder, not a library and not a
filename. Where something is *unproven* it says so.

The pinned map-pack schema is **not** extended by anything here. `kind` stays
`"delve" | "arena"`; world and stadium are not new kinds and this document does
not propose making them one. What they need is an *extra optional field on an
existing kind* plus a table module beside `THEMES` — the same shape the delve
already uses.

---

## PART 1 — STADIUM

### 1.1 The sheets that actually exist on disk

The brief's second path is wrong. Verified by reading the IHDR of each file:

| path | dims | md5 (12) | status |
|---|---|---|---|
| `rpg-assets/2024patronbundle/3x(MVZ)/colosseum_3.png` | **480 × 432** RGBA8 | `8bf1194a9c34` | exists, **never copied into `public/assets`** |
| `rpg-assets/2024patronbundle/2x(VX)/colosseum_2.png` | 320 × 288 | — | 2× sibling |
| `rpg-assets/2024patronbundle/1x/colosseum_1.png` | 160 × 144 | — | 1× sibling |
| `rpg-assets/2024patronbundle/1x/colosseum_extra.png` | 112 × 48 | — | **1× only, no 3× sibling** — a single curved arena-floor rim strip |
| `rpg-assets/2023patronbundle/3x_MVMZ/npc_crowd_3.png` | **288 × 384** RGBA8 | — | exists — **NOT** in the 2024 bundle as the brief says |
| `rpg-assets/2023patronbundle/1x/npc_crowd_1.png` | 96 × 128 | — | 1× sibling |
| `rpg-assets/2020patronbundle/2020/3x_MVMZ/colosseum_world_3.png` | 432 × 336 | `081cb044e00f` | **already shipped** (see below) |
| `rpg-assets/2019bundle/2019/3x_RMMV/spqrbanners_3.png` | 384 × 192 | `a15750db4d1f` | **already shipped** as `banners_3x.png` |

Other siblings found by search: `lobit_flags_1.png` (192 × 128, **1× only**),
`worldmap-brokenbridges-1.png` (128 × 64, 1× only).

**A name collision is already in the tree.** `public/assets/art/colosseum_3x.png`
is byte-identical (`081cb044e00f`) to `colosseum_world_3.png` — it is the
**world-map icon** sheet: six whole amphitheatres drawn as overworld building
minis (plain / red-bannered / blue-bannered / ruined), plus a banner strip and
a few columns. `art.js` registers it as `SHEETS.colosseum_3x` (432 × 336) with
exactly one crop, `bldgArena { x:15, y:192, w:114, h:141 }`, used by
`campus.js` for the Arena building tile.

The 2024 `colosseum_3.png` is a **different sheet for a different job** — a
ground-level construction kit. It must take a new `SHEETS` key. Suggested:
`arenakit_3x`. Reusing `colosseum_3x` would silently repoint `bldgArena`.

`banners_3x` (= spqrbanners) is already in the build with **one** crop
registered (`gmBanner { x:48, y:15, w:45, h:144 }`). Its remaining art —
gold-topped standards on poles, four hanging banners, two wide swags, and a
bunting run — is free stadium dressing that needs no new file.

### 1.2 `colosseum_3.png` — what is really in it

480 × 432 = 10 × 9 cells of 48 px (it is a 3× MV/MZ sheet, so **1 sheet px = 1
chart px**: the sheet's own tile is 48, the same 48 the chart width is measured
against). Alpha-island scan + edge-run analysis gives:

| region (sheet px) | what it is |
|---|---|
| `x48 y0 w384 h48` | pale sandstone **arena-floor autotile** (8 cells; one carries an inset outlined square — a trap/pit decal) |
| `x336 y0 w144 h48` | a smooth dark→pale **vertical gradient band**, 3 cells wide (a shade/awning shadow strip) |
| `y48 … y143`, both flanks | **oblique outer-rim pieces** — diagonal stepped masonry, corners and edges of an oval wall, drawn for the *top-down* lens |
| `x96 y144 w96 h156` | **tier block A** — a wedge of stone benches climbing away, with an arch mouth (vomitorium) at its foot. Dark-ink bbox `x100 y140 w92 h160` |
| `x192 y144 w96 h156` | **tier block B**, identical footprint |
| `x288 y144 w96 h156` | **tier block C**, identical footprint |
| `x384 y144 w48 h156` | **tier block D** — the half-width end/corner piece |
| `x288 y240 w192 h60` | **balustrade rail** strips (light stone rail over a dark under-band), two runs |
| `x384 y264 w96 h36` | an **orange/ochre bench band** (wooden seating course) |
| `x6 y156 w36 h129` | **column**, clean marble, with capital |
| `x48 y144 w48 h144` | **column**, weathered/chipped |
| `x6 y288 w36 h45` | broken capital / rubble |
| `x6 y348 w36 h36` | round **plinth** disc |
| `x54 y303 w39 h66` | **red hanging banner**, gold lion mask + fringe |
| `x294 y303 w39 h66` | **blue hanging banner** (mirror) |
| `x96 y288 w144 h57` | **red awning + rail above it** |
| `x336 y288 w144 h57` | **blue awning + rail** |
| `x96 y384 w144 h33` | **red awning**, bare |
| `x336 y384 w144 h33` | **blue awning**, bare |
| `x18 y387 w63 h45` | **red crest** (heraldic shield, face emblem) |
| `x258 y387 w63 h45` | **blue crest** |

The tier blocks sit on a 96-px pitch (`96 / 192 / 288 / 384`) and are 156 px
tall from `y144`. Blocks A–C are pixel-identical in bounds; D is the half piece.

### 1.3 `npc_crowd_3.png` — what is really in it

288 × 384. **Four still-art clumps, not a character sheet.** The 48-px
occupancy grid has an empty column at `x144..191` and an empty row at
`y240..287`, and there are exactly four alpha islands:

| island | contents |
|---|---|
| `x0 y27 w144 h213` | a packed crowd, **3 figures wide × 3 rows deep**, front-facing, full body |
| `x192 y27 w96 h213` | same crowd, **2 wide** |
| `x0 y288 w144 h96` | **heads-and-torsos strip**, 3 wide × 2 rows — drawn to sit behind a parapet |
| `x192 y288 w96 h96` | same strip, 2 wide |

The three front-row figures were measured individually:

| figure | box | height |
|---|---|---|
| front-left | `x0..47  y150..239` | **90 px** |
| front-mid | `x48..95 y150..233` | 84 px |
| front-right | `x96..143 y150..239` | **90 px** |

So a single spectator is a clean **48 × 90** cell, and the clump is
`213 / 90 = 2.37 ×` one figure.

This art is **still**, so Art Law permits extruding it — but it should not be
extruded: it is a crowd, and a crowd is a texture on the stands (§1.5).

### 1.4 The crops a stadium palette would need, with real derived widths

`w = round((form === 'lie' ? d : h) × (art.w / art.h) × 48)`, `PLAYER_H = 760/900`.
Computed, not guessed:

| proposed crop | art w×h | rung | h (tiles) | h (m) | **derived chart w** | tiles wide |
|---|---|---|---|---|---|---|
| `standTier` | 96×156 | 3 | 2.533 | 5.32 | **75** | 1.56 |
| `standTier` | 96×156 | 2 | 1.689 | 3.55 | 50 | 1.04 |
| `standTierEnd` | 48×156 | 3 | 2.533 | 5.32 | 37 | 0.78 |
| `arenaPillar` | 36×129 | 3 | 2.533 | 5.32 | **34** | 0.71 |
| `arenaPillar` | 36×129 | 2 | 1.689 | 3.55 | 23 | 0.47 |
| `pillarBroken` | 48×144 | 2 | 1.689 | 3.55 | 27 | 0.56 |
| `pillarPlinth` | 36×36 | 0.25 | 0.211 | 0.44 | 10 | 0.21 |
| `pillarRubble` | 36×45 | 0.5 | 0.422 | 0.89 | 16 | 0.34 |
| `arenaBanner` | 39×66 | 1.5 | 1.267 | 2.66 | **36** | 0.75 |
| `arenaCrest` | 63×45 | 0.75 | 0.633 | 1.33 | 43 | 0.89 |
| `arenaAwning` | 144×33 | 0.5 | 0.422 | 0.89 | 88 | 1.84 |
| `arenaAwningRailed` | 144×57 | 0.75 | 0.633 | 1.33 | 77 | 1.60 |
| `crowdClump` | 144×213 | 3 | 2.533 | 5.32 | 82 | 1.71 |
| `crowdClump` | 144×213 | 2 | 1.689 | 3.55 | 55 | 1.14 |
| **`crowdFigure`** | **48×90** | **1** | **0.844** | **1.77** | **22** | **0.45** |
| `crowdParapet` | 144×96 | 1.5 | 1.267 | 2.66 | 91 | 1.90 |

### 1.5 THE FINDING THAT DECIDES THE DESIGN: this kit does not fit the ladder

Three measured conflicts, all of them structural rather than fixable by choosing
a different number:

1. **The tier block's native scale is off the ladder.** The sheet is 48 px per
   tile, so a tier block drawn at 1:1 is 96 × 156 chart px = 2.00 × 3.25 tiles.
   `3.25 / PLAYER_H = 3.85 ×` the player — between the ladder's `3` and nothing.
   Put it on rung 3 and it draws **75 px wide instead of its native 96** (a 22 %
   squeeze, and the arch mouths stop lining up on the 2-tile pitch the sheet was
   drawn to).
2. **The crowd clump is off the ladder.** `213 / 90 = 2.37 ×` a figure. Rung 2
   makes every spectator 0.79 × the player; rung 3 makes them 1.19 ×. Neither is
   right, and 2.37 is not a rung.
3. **`check-volumes.mjs` forbids the banners as `wall` props.** Line 110–111
   asserts `mid + h/2 <= CEIL` where `CEIL = 1260·K / 300 = 1.40` tiles. A
   stadium banner hangs *above* head height on an outdoor wall; anything with
   `mid > 1.40 − h/2` fails the size law. The ceiling test has no outdoor
   exemption today, and inventing one is exactly the "never invent a schema
   field to paper over a problem" case — it is a finding, not a patch.

**The resolution is the one `prop-volume.js` already wrote down.** Its Hexen
note draws the line: *architecture* is geometry with textures on it, *everything
else* is a sprite on the ladder. The stands, the rail, the apron and the awning
runs are **architecture** — the ladder does not govern a wall any more than it
governs a floor, and `standsPanel()` is already a texture on a quad. Only the
free-standing objects go on the ladder:

- **Architecture (textures, no `PROP_VOL` entry, no chart `w`):** tier blocks,
  rail, orange bench course, floor autotile, awning runs, crowd (painted into
  the tier tread — see §1.7).
- **Props (ladder, `PROP_VOL` + `ART`, chart `w` derived):** `arenaPillar` (3),
  `pillarBroken` (2), `pillarPlinth` (0.25), `pillarRubble` (0.5),
  `arenaCrest` (0.75). These are the ones that stand on the sand.
- **Blocked pending a decision:** `arenaBanner` as a `wall` prop, because of
  the 1.40-tile ceiling. Either it becomes architecture too (baked into the
  parapet texture, which is what the art is drawn for), or the ceiling test
  grows an explicit outdoor concept. **Recommend architecture** — it needs no
  law change and it is where the art already lives on the sheet (the banners
  ship pre-composited with their rail at `x96 y288 w144 h57`).

### 1.6 What `tactical-fp.js` bakes today, and what it has no data for

All of it is procedural, none of it is authored. Measured from the source:

| what | where | size / constants |
|---|---|---|
| `facePanel(key, base, dark, dim)` | `tactical-fp.js:126` | 32 × 32 canvas, linear gradient + 60 noise rects |
| `apronPanel()` | `:151` | 64 × 64, flat `#3d4a2c` + 240 hashed specks |
| `standsPanel()` | `:168` | **128 × 96**, 5 tier rows at 15 px pitch, riser `#4a3c24`, tread `#b09a68`/`#a89060`, 6 hardcoded crowd colours, a 3 × 5 px body + a 3 × 2 px face every 5 px, parapet at `y88` |
| `cloudsPanel()` | `:203` | 420 × 160, 3 deterministic puffs |
| the ring | `:444–448` | 4 strips, `RING_H = 2400·K = 800` world px = **2.667 tiles**, length `span + 2·A` |
| the apron | `:434–438` | `APRON_T = 3` tiles |
| scale | `:50–56` | `T = 300`, `K = 1/3`, `EYE = 230`, `BLOCK_H = 300` |

`action-fp.js:45` **imports** `facePanel, apronPanel, standsPanel, cloudsPanel`
from this file (`tactical-fp.js:123` says so explicitly: "action-fp.js dresses
the SAME colosseum … two copies of these bakes would drift"). So one change to
`standsPanel()` lands in both battle lenses at once. That is the cheapest
visible win available here.

**FINDING — the textures are shared but the ring GEOMETRY is not.** The line
`const APRON_T = 3, RING_H = 2400 * K;` appears twice, identically:
`tactical-fp.js:226` and `action-fp.js:88`. So do `T = 300` and `K = T / 900`
(`tactical-fp.js:50–51`, `action-fp.js:57–58`). The comment on the shared bakes
says two copies would drift — and two copies of the numbers those bakes are
stretched over already exist. Any venue field that sets ring height or apron
depth must reach **both** files, or it will drift exactly the way the bakes were
protected from. Centralising those four constants is a prerequisite for the
venue layer, not an optional tidy-up.

`boardKey()` (`:455`) is `arenaName + groundURI.length + elevation + passable` —
**the venue is not part of the board key**, so a venue field added later must be
added to that string or the ring will not rebuild when the venue changes.

The only stadium-adjacent data anywhere in the game today is
`ARENA_FIELDS` (`arena-terrain.js:46`) — `{ name, grid }`, 9 × 9, and its
exported map-pack form `content/maps/arena-*.json` carries `kind/id/name/theme/
grid/entry` and nothing else. There is **no venue concept at all**;
`venueId` in `hall.js`/`globe.js` is a *guild seat id* for tournament hosting,
a completely different axis.

### 1.7 What a venue layer would have to carry

Model it on `THEMES` (`delve-maps.js`), not on a new `kind`: a **`VENUES` table
module** keyed by string, and one **optional `venue` string on an arena map**.
Fields the current bake would need before it could be authored:

```
VENUES.colosseum = {
  sheet:   'arenakit_3x',
  tiers:   5,               // rows of seating in the strip texture
  tierPx:  15,              // tread pitch inside the baked texture
  tread:   [x,y,w,h],       // crop, or a colour pair when the venue is drawn
  riser:   [x,y,w,h],
  parapet: [x,y,w,h],       // the rail run at x288 y240
  crowd:   { crop:[0,150,48,90], fill: 0.75, rows: 5 },
  ringH:   2.667,           // tiles — today's RING_H, now authored
  apron:   3,               // tiles — today's APRON_T
  awning:  { crop:[96,384,144,33], sides:['n','s'] },
  banners: { crop:[54,303,39,66], everyTiles: 4 },
  colonnade:{ prop:'arenaPillar', everyTiles: 2 },
  sky:     'day' | 'dusk' | 'torchlit',
  floor:   [48,0,384,48],   // the sand autotile
}
```

Two facts must be stated in the module's own doc so they are decisions rather
than losses: (a) `ringH` and `apron` are **tiles**, never world px — they are
multiplied by `T` at draw, exactly as the delve does, so the `K` similarity
survives; (b) the crowd `crop` is a **texture source**, deliberately not a
`PROP_VOL` entry, for the reason in §1.5.

Then the *only* schema touch is `"venue": "colosseum"` — an optional string on
an arena map, absent everywhere today, defaulting to the current procedural
bake. Optional-key tolerance is already the pack's stated rule.

### 1.8 The smallest first step that is visible in play

**Put the real crowd into the existing baked stands. One file, one function, no
schema change, and both battle lenses get it.**

1. Copy `npc_crowd_3.png` → `public/assets/art/crowd_3x.png` (13.7 KB).
2. `art.js`: `SHEETS.crowd_3x = { w: 288, h: 384 }` and one crop
   `crowdFigure { sheet:'crowd_3x', x:0, y:150, w:48, h:90 }`
   (plus `crowdFigureB { x:48, y:150, w:48, h:84 }`,
   `crowdFigureC { x:96, y:150, w:48, h:90 }` for variety — three measured
   figures, no synthetic recolouring).
3. `tactical-fp.js standsPanel()`: keep the 128 × 96 canvas, keep the tier
   arithmetic, and replace the `fillRect` body-and-face pair (`:184–191`) with
   a `drawImage` of one of the three figures, scaled to the tread. The
   texture stays 128 × 96, so **not one byte of the compositor budget changes**
   — which matters, because that budget is why this file exists (`:29–49`).

That is a real crowd in the stands in both the tactical and the action lens,
with zero risk to the mobile texture ceiling. Cost: **one asset copy, ~6 lines
in `art.js`, ~10 lines in `tactical-fp.js`.** Risk: the bake is async-free
today (`standsPanel` returns a data URL synchronously); a `drawImage` from an
`<img>` needs the sheet loaded first, so the panel must either become
promise-shaped or keep the dotted crowd as its first-frame fallback. **That is
the only non-trivial thing in the step, and it must be planned, not discovered.**

Second step (still small): `arenaPillar` + `pillarPlinth` as real ladder props
placed on the apron corners — this exercises the whole size law on the new sheet
and `dev/check-volumes.mjs` proves it. Third step: the `VENUES` table and the
optional `venue` key.

### 1.9 Honest cost — stadium

| step | size | risk |
|---|---|---|
| crowd into `standsPanel` (§1.8) | 1 asset, ~16 lines, 2 files | **low**, except the sync/async bake — plan it |
| `arenakit_3x` + 5 ladder props | 1 asset, ~25 lines, 2 files, `check-volumes` proves it | **low** |
| banners/awnings as parapet texture | ~30 lines in `standsPanel` | **low** |
| centralise `T`/`K`/`APRON_T`/`RING_H` (prerequisite) | ~10 lines, 2 files | **low**, but must land *before* the venue layer |
| `VENUES` table + optional `venue` key | new module ~120 lines; `tactical-fp` ring rewrite ~60 lines; `boardKey` must gain the venue; `action-fp` inherits | **medium** — the ring strips are the exact geometry the mobile perf decree is about (`perf-arena-mobile`); any per-venue quad count increase must be measured on a phone, not reasoned about |
| authored per-tier geometry (real stepped seating, not a texture) | large | **high — do not do this.** It multiplies quads on the surface the compositor already drops first. The texture is the right answer and the file says why at `:29–49`. |

---

## PART 2 — WORLD

### 2.1 The CHART, exactly

`src/guild/world-guilds.js:18–51`. **32 rows × 64 columns**, equirectangular,
one biome letter per cell. Vocabulary is exactly eight characters:

| char | biome | drawn how |
|---|---|---|
| `~` | ocean | **procedural** (`DRAWN['~']`) — `#1e4e80` + dither + wave dashes |
| `i` | ice | sheet tile `[32, 352]` |
| `t` | taiga | **procedural** — the ice tile plus two drawn pines |
| `g` | grass | sheet tile `[32, 32]` — **see §2.3, this is not grass** |
| `f` | forest | sheet tile `[192, 32]` |
| `h` | hills | **procedural** — the grass tile plus two drawn mounds |
| `m` | mountain | sheet tile `[212, 184]` — note **off-grid**, `212 % 16 = 4`, `184 % 16 = 8`; a probed sample of mountain art, not a tile |
| `d` | desert | sheet tile `[32, 96]` |

Point features, all as `{cx, cy}` chart indices:

- `REALMS` — 4, `{id, name, glyph, blurb}`. **A realm is a property of a seat,
  not of the ground.** There is no way to ask which realm a cell belongs to.
- `SEATS` — 32, `{id, name, realm, cx, cy, mini}`.
- `TOWNS` — 8, `{id, name, realm, cx, cy}`.
- `DUNGEON_CELLS` — 5, `id → [cx, cy]`.

`validateWorld()` (`:151`) runs at import and throws on: a row of the wrong
width, any character outside `[~itgfhmd]`, or any seat/town/delve standing on
`~` or `i`. This is the pattern any new authored layer should copy.

**There are no heights, no props, no roads, no borders, and no per-cell
anything beyond the biome letter.**

**FINDING — `mini` is a dead field.** All 32 seats carry `mini: 0..11`,
documented as an index into `worldmini.png` (3 × 4 grid). There is no
`worldmini.png` in `public/assets/art/` (full directory listed), and nothing in
`src/` reads `.mini` — `globe.js` picks its marker from
`CROPS.hallHome` / `CROPS.hall`, both cut from `worldmap.png`. 32 authored
numbers that no renderer consults.

### 2.2 What `globe.js` registers today

| registry | count | contents |
|---|---|---|
| `TILE16` | **5** | `g[32,32] f[192,32] d[32,96] i[32,352] m[212,184]` |
| `DRAWN` | **3** | `~`, `t`, `h` — procedural fills |
| `CROPS` | **4** | `hallHome[308,133,56,45]`, `hall[258,132,50,37]`, `townA[261,16,21,24]`, `townB[282,16,26,28]` |
| drawn sprites | 1 | the cave mouth (`cave()`, `:127`) — "no cave-mouth exists at marker scale" |

**Nine rectangles out of a sheet holding 39 × 26 = 1014 cells.** Under 1 % of
the art is registered.

Renderers: `renderGlobe()` (`:176`) is a per-pixel orthographic sphere sampling
a baked 1024 × 512 texture; `flatMapDataUrl()` (`:455`) squashes the *same
texture* row-by-row into a 1004 × 496 oval, then stamps hall sprites through
`project()`.

**The single most useful fact for planning both features:** anything baked
*into the texture* appears on **both** renderers for free — the flat map draws
`tex.canvas` and the sphere samples `tex.data`. Anything drawn as a **marker**
costs work twice (a DOM element + `placeMarkers()` projection on the globe; a
`project()` + `drawImage` on the oval).

### 2.3 FINDING — `TILE16.g` is a road tile, not grass

`worldmap.png` is 624 × 416 = **39 × 26 cells of 16 px**. Its top-left carries
two distinct blocks:

- `x32..143, y16..31` — a **grass shade strip**, 7 cells, light → dark. Measured
  `[32,16] = rgb(82,153,67)`, `[128,16] = rgb(48,119,64)`.
- `x16..143, y32..63` — a **dirt-road-on-grass block**, 8 × 2 = 16 cells.

`globe.js` takes `g: [32, 32]` — which is **inside the road block**. Measured
average `rgb(133,137,74)`: olive, i.e. brown road over green grass. It reads as
dry grassland at 16 px on a 320 px sphere, which is why nobody has noticed, but
it is a road patch and it is the exact cell a road layer wants for something
else. The pure grass fill is one row up at `[32, 16]`.

### 2.4 FINDING — the sheet ships a COMPLETE 4-bit road autotile

This is the headline. The 16 cells at `x16..143, y32..63` were probed by
testing, for each cell, whether road-brown reaches the middle 8 px of each
edge. Every one of the 16 possible N/E/S/W masks appears **exactly once, with
no duplicates and no gaps**:

| mask (N=8 E=4 S=2 W=1) | shape | sheet `[sx, sy]` |
|---|---|---|
| 0 | isolated patch | `[128, 48]` |
| 1 | W stub | `[64, 32]` |
| 2 | S stub | `[64, 48]` |
| 3 | SW corner | `[48, 32]` |
| 4 | E stub | `[80, 32]` |
| 5 | E–W straight | `[16, 32]` |
| 6 | ES corner | `[32, 32]` |
| 7 | ESW tee | `[96, 32]` |
| 8 | N stub | `[80, 48]` |
| 9 | NW corner | `[48, 48]` |
| 10 | N–S straight | `[16, 48]` |
| 11 | NSW tee | `[112, 48]` |
| 12 | NE corner | `[32, 48]` |
| 13 | NEW tee | `[112, 32]` |
| 14 | NES tee | `[96, 48]` |
| 15 | crossroads | `[128, 32]` |

A road renderer is therefore a **16-entry lookup table and one `drawImage`** —
no autotile algorithm, no blob maths, no new art. This was measured, not
assumed; the mask table above is the probe's literal output.

**The one caveat, also measured:** these cells are **100 % opaque and grass-
backed**. Painting one over a desert or taiga cell puts a green verge in the
sand. Two honest options: (a) route roads only through `g`/`f`/`h` cells and
validate that at load, the way `validateWorld` already validates dry land; or
(b) at bake time, draw the biome fill first, then copy only the *brown* pixels
of the road cell — one per-pixel pass over at most 2048 cells × 256 px, once,
inside `bakeTexture` which already calls `getImageData`. **(b) is cheap and
correct; recommend it.**

### 2.5 The rest of `worldmap.png`, measured

Alpha-island scan (islands > 900 px) and targeted probes:

| region | contents |
|---|---|
| `x16 y32 w128 h32` | **the 16-piece road autotile** (§2.4) |
| `x32 y16 w112 h16` | 7 grass shades |
| `x16 y80 w48 h48`, `x80 y80 w64 h64` | desert / dune fills |
| `x32 y160 w32 h48`, `x80 y160 w64 h48` | pale sand fills |
| `x16 y224 w48 h160`, `x16 y289 w48 h79` | ice, snow-shore and water fills |
| `x160 y16 w80 h64`, `x160 y128 w80 h32` | forest fills + tree clusters |
| `x162 y213 w60 h55` | mountains / hill masses |
| `x152 y310 w32 h40`, `x144 y352 w48 h32` | snowy peaks and snowy trees |
| `x250 y16 w180 h40` | village house row |
| `x258 y132 w41 h37` | grey keep — **registered** as `CROPS.hall` |
| `x307 y133 w41 h36` | red-roofed castle — **registered** as `CROPS.hallHome` |
| `x258 y181 w41 h39`, `x306 y177 w29 h43` | walled castles, towers |
| `x401 y130 w47 h43`, `x404 y52 w41 h37` | shops / inns |
| `x465 y81 w46 h45` | white pillared temple |
| `x468 y182 w41 h33` | stepped ziggurat |
| `x281 y291 w29 h11` | **wood bridge**, horizontal |
| `x278 y304 w33 h31` | **stone arch bridge**, horizontal |
| `x250 y305 w21 h44`, `x250 y352 w22 h8` | sand/plank spans |
| `x323 y297 w10 h30`, `x338 y299 w12 h27`, `x353 y294 w14 h34` | **vertical bridge segments** (wood, stone, plank) |
| `x562 y247 w44 h34`, `x562 y291 w44 h42`, `x563 y342 w41 h35` | **three open fence/palisade frames** — top rail, side rails, gated bottom |

The bridges are the missing piece of a road network: they are exactly the
"road crosses water" cells the 16-piece set has no answer for. The fence frames
are enclosure art at *town* scale, not realm-border scale — at 64 × 32 world
cells a realm is hundreds of km across and a fence reads as noise. Do not use
them for borders.

### 2.6 What roads would need on both renderers

**Authored structure — recommend a polyline list, not a second grid.**

```js
export const ROADS = [
  { id: 'veyra-spine', realm: 'veyra',
    via: [[15,12],[14,11],[13,10],[11,11],[10,9]] },  // chart cells, in order
];
```

Why the polyline and not a `64 × 32` road-letter chart: a road is a *route*
between seats, the four realms have eight seats each, and the polyline is the
thing an author can read back ("does this actually connect Emberwatch to
home?"). The `via` list rasterises to a cell set at bake, and the N/E/S/W mask
for each cell falls out of its neighbours in that set — the same one-pass
derivation the road table wants. A second 64 × 32 grid would be a *second*
authored fact about the same thing, which is the failure mode `prop-volume.js`
was written to stop.

Validation to write alongside it (mirroring `validateWorld`): every `via` cell
dry land; consecutive `via` cells 4-adjacent; every road endpoint on a seat or a
town; and — if §2.4(a) is chosen — every cell a road-compatible biome.

**Sphere:** one extra pass inside `bakeTexture()` after the biome loop, before
`getImageData`. `renderGlobe()` changes **not at all** — it samples a texture.
**Cost: ~30 lines, zero per-frame cost.**

**Flat oval:** `flatMapDataUrl()` draws `tex.canvas` row by row, so a road baked
into the texture appears on the wall map **with zero code changes**.

**Legibility, measured.** At `zoom = 1` the globe's disc is `2 × R = 296` logical
px across and the texture is 1024 px around, so the equator minifies about
**3.5 : 1** — a 1-px road line will alias to nothing. The road art is 16 px per
cell with a brown band roughly 6–8 px wide, i.e. ~2 screen px at zoom 1 and
~8 at `ZOOM_MAX = 4`. That is thin but visible, and it is exactly the scale the
existing drawn pines and mounds already survive at. On the flat oval the
equator is `2 × rx = 1004` screen px against 1024 texture px — near **1 : 1**,
so roads read cleanly there. No extra work needed for either; state the
measurement so nobody "fixes" the globe by thickening the line and ruining the
oval.

### 2.7 What realm borders would need on both renderers

**The blocker is upstream of both renderers: there is no realm-per-cell fact.**
`REALMS` is a list of four ids and `SEATS[].realm` tags 32 points. Nothing says
which of the 64 × 32 cells belongs to Veyra.

Two honest structures:

**(a) A fifth authored layer — recommended.** `REALM_CHART`, 32 rows × 64
chars, `v/n/a/m` for the four realms and `.` for unclaimed/sea. Authored by hand
for the same reason the biome chart is ("every guild seat must stand on land
that looks deliberate"), and validated the same way: every row 64 wide, every
character in the set, **every seat's and town's cell carries its own realm's
letter**, and no realm letter on `~`/`i`. That last check is worth more than the
feature — it would catch the map and the politics drifting apart.
Cost: 32 authored lines + ~20 lines of validator.

**(b) Derive it — nearest-seat flood fill over land.** No authoring at all,
deterministic, and it self-heals when a seat moves. But it makes the border a
*consequence* of seat placement rather than a design, and a one-cell seat nudge
redraws a coastline. Cheaper to write, worse to own.

**Rendering, either way — bake it, do not draw it.** After the biome pass in
`bakeTexture()`, walk the cells; where a cell's realm differs from its east or
south neighbour, stroke that edge into the texture. Both renderers then get it
free, exactly as with roads.

**The one real tension, measured.** From §2.6 the globe minifies ~3.5 : 1 at
zoom 1 while the oval is ~1 : 1. A border thick enough to survive the globe at
zoom 1 (≥ 4 texture px) is a 4-px line on a 1004-px oval — 0.4 % of its width,
which is fine. So **3–4 texture px is the number that works on both**, and no
second texture is needed. A translucent per-realm land tint under the border is
the cheaper legibility win if the line alone reads faint; it costs one extra
`fillRect` per land cell at bake and nothing at render.

### 2.8 The smallest first step that is visible in play

**Bake the Veyra road spine into the globe texture using the 16-mask table.**

1. Fix `TILE16.g` to `[32, 16]` (the actual grass) — one line, and it makes the
   road block available for what it is.
2. Add `ROAD16` — the 16-entry mask → `[sx, sy]` table from §2.4, verbatim.
3. Add `ROADS` to `world-guilds.js` with **one** polyline: home → the seven
   Veyra halls, with its validator.
4. One extra loop in `bakeTexture()` after the biome pass.

The result is visible in **two places at once** with no renderer changes: the
globe (drag it and the roads turn with the world) and the Study's wall map
(`flatMapDataUrl` draws the same texture). Cost: **~60 lines across two files,
one of which is data.** Risk: low — the only shared surface touched is
`bakeTexture`, and if the road pass throws, the existing `try/catch` at
`openGlobe:369` already closes the globe rather than corrupting anything.

Do **not** bundle the `TILE16.g` fix with the road work silently: it changes the
colour of every grass cell on the globe and the wall map, so it is its own
visible change and should be shown as one.

### 2.9 Honest cost — world

| step | size | risk |
|---|---|---|
| fix `TILE16.g` → `[32,16]` | 1 line | **low**, but it is a *visible* recolour of every grass cell — ship it as its own change |
| `ROAD16` table + `ROADS` polyline + bake pass (§2.8) | ~60 lines, 2 files | **low** |
| brown-only stencil so roads cross desert/taiga (§2.4b) | ~25 lines in `bakeTexture` | **low** — one bake-time pass, no per-frame cost |
| bridges over water cells | ~20 lines + 6 crops; needs a "road enters water" rule | **medium** — the 16-mask set has no water case, so this is genuinely new logic |
| `REALM_CHART` + validator + border bake | 32 data lines, ~50 code lines | **medium** — the *authoring* is the work; the rendering is nearly free |
| roads/borders as markers instead of texture | — | **do not.** It doubles the work (globe DOM + oval stamps) for something the texture path gives away free. |

---

## Recommended build order across both kinds

1. **World — `TILE16.g` fix.** One line, its own change, proves the sheet probe.
2. **Stadium — the real crowd in `standsPanel`** (§1.8). Highest
   visible-change-per-line in either kind, lands in two lenses at once, zero
   compositor cost. Plan the sync/async bake before starting.
3. **World — roads** (§2.8). Two renderers, no renderer code, and the autotile
   table is already proven complete.
4. **Stadium — `arenakit_3x` + the 5 ladder props.** Exercises the size law on
   a new sheet; `dev/check-volumes.mjs` is the proof.
5. **World — `REALM_CHART` + borders.** Mostly authoring; the validator is the
   durable half.
6. **Stadium — banners/awnings baked into the parapet**, resolving §1.5's
   ceiling finding by making them architecture.
7. **Stadium — the `VENUES` table and the optional `venue` key.** Last, because
   it is the only step that touches the pinned schema and the only one with a
   measurable phone-performance risk.

## Open questions this scout could not answer

- **Whether the 2024 colosseum kit's oblique rim pieces (`y48..143`) are usable
  at all in a first-person lens.** They are drawn in RPG-Maker's top-down
  oblique; a first-person ring needs a flat elevation. The tier blocks
  (`y144..300`) *are* elevations and are the usable half. The rim pieces would
  serve a top-down or tactical-board venue, which is a different lens's lane.
- **Whether `standsPanel`'s consumers tolerate an async bake.** `action-fp.js`
  imports it; both call sites need reading before §1.8 is scheduled.
- **What `colosseum_extra.png` is for.** 112 × 48, 1× only, a single curved rim
  strip. There is no 3× sibling, so it cannot be used without upscaling, which
  Art Law does not permit as a substitute for the real cell.
