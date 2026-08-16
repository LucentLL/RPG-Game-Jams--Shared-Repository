# The Wizordum editor — read off four reference frames (2026-08-15)

The user supplied four screenshots of Wizordum's shipped level editor as the
target for the drafting table. This file is what those frames actually show,
written down so the build has a spec instead of a memory.

**Asset law:** these are reference images of a commercial game's tool. Nothing in
them is a licensed asset. We take the INTERACTION MODEL and none of the art —
every chip, icon and tile in our editor keeps coming from `rpg-assets/` and
`public/assets/` under the art law in CLAUDE.md. See `feedback-asset-ownership`.

---

## What the frames show

### Chrome

- **Top-left toolbar:** new, open, save, save-as, a person glyph, a tools glyph,
  a green ▶ (playtest), a yellow ⚠ (warnings/lint).
- **Title, centred:** the map's name — `Unnamed`, `Pits of Damnation`,
  `Castle of the Lake`. Editing an untitled map is normal and named later.
- **Top-right:** export, grid toggle, a sun (lighting toggle), help, panel toggle.
- **Left rail, vertical:** select arrow · block/solid · tile grid · a bucket ·
  a stamp · camera · person (player start) · a half-filled circle (lighting).
  The rail is **contextual** — frame 3 swaps in a water-drop where frame 1 has a
  bucket, and frame 4 grows a second row of **brush shapes** (filled square,
  diamond, diamond-with-arrow, three bars, two bars, grid, minus).
- **Layer block:** a lock and a power glyph over three rows of paired diamonds
  (visibility + lock per layer), beside a blue "layer up" plane, a green plane
  and a tan "layer down" plane, each with a row of radio dots.
- **Bottom-left readout, always visible:** the active key hints, then
  `Layer: N`, `Tile : N`, `Pos : (x, y, z)`, `ID :`.
- **Bottom-right:** a minimap (frames 3-4).

### The viewport

The main view is **the game's own 3D renderer**, at a free angled camera, and you
place directly into it. It is not a plan canvas with a preview — the level is
shown finished (lighting, water, foliage, banners) while you edit it.

Non-geometry objects draw as **translucent ghost boxes with floating text
labels** — `Player Start`, `Easy Goblin Caster`, `Wall Collapse` — and spawns
add a red rune on the floor beneath them. Selected objects get an orange
gizmo with drag arrows.

### The palette

A **search box over one flat searchable list**, not tabs. Typing `rock` in frame 1
returns ten entries — `Rocks`, `Rocks – Water`, `Swamp Rock – 1`,
`Mines – Rocks 1`, `Rocks – Snow`, `Lava Rock Spawner`, `Rocks – Obsidian`,
`Rocks – Obsidian (Big)`, `Rocks – Lava`, `Rocks – Lava (Big)`. Each row is
`[thumbnail] [name] [badge]`; the badge reads `P`. Icon tint encodes class —
cyan diamonds for triggers, brown leaves for doors, green for enemies.

Naming convention throughout is `Family – Variant`, which is what makes the
search useful: one query reaches every member of a family.

Three palettes are visible across the frames:

- **props/scenery** (frame 1)
- **interactives** (frame 2): `Flame Bar (Vertical)`, `Switch`,
  `Switch – Multiuse`, `Switch – Chain`, `Switch – Stone (Push)`,
  `Skull Pedestal – Silver/Gold`, `Teleport`, `Magic Floor`,
  `Shootable Switch`, `Shootable Switch (Blue)`, `Combination`,
  `Keyhole – Bronze/Silver/Gold`, then doors: `Door – Wooden`,
  `Door – Wooden – Trigger`, `Door – Single`, `Door – Fence`,
  `Door – Fence – Trigger`, `Door – Fence – Bronze/Silver/Gold Key`,
  `Door – Sewers`, `Door – Sewers (Trigger)`.
- **enemies** (frame 3): 25 rows, `Skeleton Crossbowman` through
  `Goblin Ironclad`, including `Tentacle (Hidden)` and
  `Skeleton Swordsman (H…)` — a hidden/ambush variant is a separate palette
  entry rather than a parameter.

### The trigger graph — the single biggest thing we do not have

Frame 2's selected object is labelled, stacked vertically:

```
RELAY
COUNT
ACTIVATOR
```

and fans roughly a dozen yellow link lines down a corridor to targets, several
tagged `x2`. So the model is: **any object may be an activator, links are
authored edges drawn in the world, and relays/counters/multipliers sit on the
edges.** Frame 1 shows the same arrows between the player start and two goblin
spawns; frame 3 wires a `Wall Collapse` trigger to something up the cliff.

This is a level-design system, not an editor feature — both lenses have to
render and honour it. It is the largest single item on this list.

### Layers

`Layer: 0`, `1`, `-1`, `-2` across the frames — a **signed stack you switch
between**, with per-layer visibility and lock. Frames 3 and 4 are the same map
one layer apart: at `-1` you stand on the stone jetty, at `-2` the water and the
ship's lower hull are the edit surface. Everything else stays drawn.

### Controls (frame 4, verbatim)

| Action | Binding |
| --- | --- |
| Place | L-Click |
| Delete | Shift + L-Click |
| Copy | R-Click |
| Fill Area | C + Drag + Click |
| Draw Room | X + Drag + Click |
| Rotate | Shift + Q/E |
| Toggle Param1 | X *(frame 2)* |
| Toggle Param2 | C *(frame 2)* |

`Copy` on right-click is an **eyedropper**: pick the thing under the cursor into
the hand. `Draw Room` is a single gesture that lays a floor and walls it.

### Spawn difficulty

Labels read `Easy Goblin Caster`, `Easy Goblin berserk` — the difficulty tier is
part of the placement, so one chart serves every difficulty and a spawn appears
only at or above its tier.

---

## Gap table against our drafting table

`src/guild/map-editor.js`, shipped 2026-08-06. Ours already matches or beats
Wizordum on: model-driven lint (the ⚠), 60-deep undo, instant playtest
("Walk It" → the real delve → `resumeEditor`), and four-bearing rotation.

| Wizordum | Ours today | Verdict |
| --- | --- | --- |
| Searchable flat palette, `Family – Variant` | four tabs of chips, no search | **Build.** Cheapest large win. |
| Place / Delete / **Copy** / **Fill Area** / **Draw Room** | ALL FIVE ALREADY SHIP | **Nothing to do.** Verified live 2026-08-15: the editor's own hint line reads `L-click paint · R-click pick · Shift+click erase · X+drag room · V+drag fill`, and the code backs it (`E.mods.x`/`E.mods.v` held-modifiers read at drag time, `fillRect(r, E.rectMode)`, and map-editor.js:1499 "eyedropper now and never routes here"). The v1 known-limits list that called these missing was written 2026-08-06 and superseded on the 7th — do not trust it again without checking the running editor. |
| Ghost boxes + floating labels for flags | flags are plan-canvas chips | **Build.** In both plan and 3D. |
| Full readout `Layer / Tile / Pos / ID` | partial | **Build.** Trivial. |
| Minimap | none | **Build.** Small. |
| Grid toggle, lighting toggle | none | **Build.** Small. |
| Signed layer stack + per-layer show/lock | six terrace levels in tile glyphs | **Adapt, do not copy.** Our levels are a derived model (`makeLevelModel`), not a stack. Give the editor a *focus level*: active level bright, others dimmed, edits clamped. |
| Spawn difficulty tier | none | **Build.** One field. |
| Trigger graph w/ relays, counters, `x2` | `locks:[[x,y]]` only | **Build, as its own project.** New `links` structure both lenses must honour. |
| Per-object params on X/C | none | **Build** alongside links. |
| Edit inside the game's 3D renderer | plan canvas + dimetric extrusion that takes picks | **Partly have it.** The real prize is placing from the **first-person** lens (`delve-fp.js`), which we own and Wizordum's angled camera only approximates. |
| Rotate objects Shift+Q/E | refused | **Do not build.** Objects are single-elevation sprites facing the camera in every lens (Hexen's answer); free rotation needs side-view art nobody owns. Wall-hung art already orients to its wall. Asked for twice, answer unchanged — see `project-map-editor`. |

## Build order

1. **Palette search + `Family – Variant` naming** — reaches every kind at once,
   and it is the only thing that lets one palette scale from delve props to
   props+enemies+triggers+tiles across five map kinds.
2. **Readout, minimap, grid/light toggles, ghost labels** — one pass of chrome.
3. **Focus level + spawn difficulty.**
4. **Object facing** (user decree, 2026-08-15) — see below.
5. **The trigger graph.** Its own build: schema, both lenses, lint, Unity port.

## Object facing — the rotation answer, revised

The earlier reading of the art law ("objects are camera-facing sprites, so
rotation would be a faked pose") was **wrong, and the user corrected it**:

> "some objects have voxel depth so directional facing is important. some
> objects will remain 2D and rotate as I see fit"

That is right, and `PROP_VOL` already carries the discriminator — no new
authoring table is needed. Of 43 props:

| class | count | facing means |
| --- | --- | --- |
| has a depth `d` | 23 | **A FACT.** It extrudes to real volume from its own pixels (`platform/voxel-sprite.js` — `extrudePlan`/`extrudeFold`/`extrudeSprite`), so turning it shows sides the extrusion actually built. Not a faked pose. |
| `flat: true` | 5 | Nothing — radially symmetric (barrels, cauldron, basket). Lint says so. |
| `form: 'wall'` | 6 | Already derived from the wall it hangs on. |
| thin card | 9 | The author's call, per the decree. |

Schema: one optional `facing` on the prop, integer degrees, `0` = the
orientation the art was drawn in — so an absent facing is exactly today's
behaviour and no migrated chart changed.

**Collision does not move and does not need to.** `blockerRadius(w, d)` is a
CIRCLE sized off `max(w, d)` (prop-volume.js:313-317), so it is already
rotation-invariant: ONE COLLISION FACT holds at every angle. This is what makes
facing a cheap addition rather than a physics change.

Rendering: extruded props take a `rotateY` on the quad assembly. Still to do in
each lens (top-down delve, FP, the editor's dimetric view) and in the Unity port
(`DelveProp` gains `Facing`, pinned by the fixture).
