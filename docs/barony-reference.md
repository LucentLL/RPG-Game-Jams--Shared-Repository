# Barony as a reference — the two asks that are systems, not geometry

**Scope.** The user sent four Barony frames and four asks: weapons inboard,
shield to centre on block, **held torches**, **inventory management**. The first
two are viewmodel geometry and belong to the lane holding `FpViewmodel.cs` /
`fp-hands.js`. This document is the other two, scouted against what the code
actually does today. **No code was written in either repo.** Exact code the
other lanes would need is in the handoff sections, not applied.

**Snapshot caveat, and it matters.** `src/guild/delve-fp.js`, `src/guild/delve.js`,
`Assets/Scripts/Delve/DelveWorld.cs` and `Assets/Scripts/Delve/DelveAtlas.cs`
were being edited by another wave while this was written — line numbers in
`delve-fp.js` moved by ~11 lines between two reads twenty minutes apart. Every
citation below therefore gives a **stable anchor** (function or const name) next
to the number. Trust the anchor; re-grep the number.

- Web repo `RPG Battler` @ `b07abdf`, working tree dirty (`delve-fp.js`,
  `delve.js`, `styles/delve.css` modified by the other wave).
- Unity repo `Guild Rancher` @ `5542dec`, working tree dirty
  (`DelveWorld.cs`, `DelveAtlas.cs` modified; `DelveWater.cs`, `DropShadow.cs`
  and two test files untracked — another wave mid-flight).

**EditMode baseline, run before writing and with zero edits of mine:**
**515 tests, 511 passed, 4 failed** (7.86s). This is **not** the 541/541 the
brief stated. The four failures are:

| Test | Class |
|---|---|
| `A_walls_rect_changes_no_geometry_at_all` | `Arena.Tests.DelveWallsTests` |
| `A_reported_face_is_always_outward_and_always_off_something_solid` | `Arena.Tests.MapEditorFacePickTests` |
| `A_screen_sweep_agrees_with_the_oracle_at_every_pitch` | `Arena.Tests.MapEditorFacePickTests` |
| `Every_drawn_face_agrees_with_the_oracle` | `Arena.Tests.MapEditorFacePickTests` |

All four sit squarely in `DelveWorld` / `DelveAtlas` / map-editor face picking —
exactly the files the concurrent wave has open and uncommitted. They are that
wave's in-flight state, not a regression from this lane (this lane changed no
code). The count difference (515 vs 541) is unexplained by anything I touched;
the likeliest reading is that the brief's 541 predates or postdates the other
wave's test additions. **Whoever lands the next change should re-baseline rather
than assume 541/541.**

---

# (A) HELD TORCHES

## A.1 The finding, first

**The web engine's light is already a torch.** Not by analogy — by
construction. `themes.js:28` documents `LIGHTS.dark` as *"a torch: you carry the
light, it falls off fast into black"*, and both renderers implement it as an
**eye-radial** falloff that travels with the player:

- DOM path — `fogAt(x, y)` (`delve-fp.js:1048`) is
  `hypot(x - F.px, y - F.py)` mapped through `L.near`/`L.far`. Distance **from
  the camera**, per quad.
- GL path — the fragment shader (`src/platform/gl-world.js:107-109`) is
  literally `float d = distance(vWorld.xz, uEyeXZ);` then a `mix` to `uFog`.
  Distance **from the eye**, per pixel.

So a held torch in the web is **not new machinery**. It is a second row in the
`LIGHTS` table and a rule for combining it with the theme's. That is a very
small change for a very visible one, and it is the strongest argument for doing
this at all.

**The Unity engine has no falloff whatsoever.** `Assets/Shaders/AtlasSprite.shader`
is 87 lines: sample atlas, multiply by vertex colour, `clip`, return. No world
position varying, no fog uniform, no keyword. `DelveWorld.BuildSky`
(`DelveWorld.cs:1731`, anchor `void BuildSky`) paints a box in `Light.Fog`
and its own comment states the honest limit: *it gives the camera the right
colour at the horizon, not the right falloff* — and marks `LANE WIRE sets
RenderSettings from Light` as **not yet done**. `grep RenderSettings` across
`Assets/Scripts/` returns exactly that one comment and zero call sites.
`EstateWalk.cs:234-235` sets `_cam.Cam.backgroundColor = _world.Light.Fog` and
that is the whole of light in the port.

**Consequence for the user, who plays the WebGL link:** in Unity, a mine today
is a fully-lit diorama drawn to the horizon with a near-black backdrop behind
it. A held torch there is meaningless until distance falloff exists at all. **In
Unity, the torch is the third step, not the first.**

## A.2 How light reaches the renderer today — the exact path

### Web, both backends

| Step | Where | What happens |
|---|---|---|
| 1. Author | `src/guild/themes.js:28-61` | `LIGHTS` = 3 rows. `dark {rgb:[6,6,10], near:1.2, far:5.2, sprite:0.78}` (`:30`); `open {rgb:[150,168,186], near:22, far:30, sprite:0.95, sky:true, lite:{near:14,far:20}}` (`:58`); `lit {rgb:[16,14,20], near:2.2, far:6.6, sprite:0.86}` (`:60`). A theme names one by key (`THEMES.mine.light = 'dark'`). |
| 2. Select | `delve-fp.js:3030-3031` (anchor `const baseL = LIGHTS[theme.light]`) | `L = COARSE && baseL.lite ? {...baseL, ...lite} : baseL`. `L` is a **module-level `let`** (`delve-fp.js:194`, anchor `let L = LIGHTS.dark`) — one variable, whole mood. |
| 3. Paint the ground colour | `delve-fp.js:3032-3034` | host background + `--fp-fog` CSS var, both `L.rgb`. |
| 4. Fit the build radius | `fitViewRadius()` (`delve-fp.js:1671`) | **This is where light becomes draw distance.** See A.3. |
| 5a. DOM emit | `wantSet` → `applyWants` via `buildGeometry()` (`delve-fp.js:1735`) | Fog is **baked per quad at build time** as a veil child element. Changing `L` mid-walk requires a `buildGeometry()`. |
| 5b. GL emit | `delve-fp.js:4477` (anchor `F.gl.setFog(L.rgb, L.near * T, L.far * T)`) | Called **every frame** in `render()`. `gl-world.js:453` just stores it into two uniforms. Changing `L` mid-frame is free. |
| 6. Creatures | `place()` (`delve-fp.js:1970-1971`) | `fog = min(1, fogAt(x,y) / L.sprite)` — monsters go dark *before* the room does. Ratio, not absolute; a torch needs no change here. |

### Unity

| Step | Where | What happens |
|---|---|---|
| 1. Author | `DelveMaps.LightOf` (`DelveMaps.cs:469-474`) | Byte-for-byte transcription of the three web rows into `DelveLightSpec {Fog, Near, Far, Sky, SpriteDim}` (`DelveMaps.cs:97`). The `lite` phone variant is deliberately dropped (`DelveMaps.cs:95-96`). |
| 2. Select | `DelveWorld.cs:260-261` (anchor `Light = DelveMaps.LightOf(...)`) | `DelveWorld.Light` property (`:108`). |
| 3. Use | `DelveWorld.BuildSky` (`:1731`); `EstateWalk.cs:234-235`; `DelveWorld.cs:511` (skirt sized by `Light.Far`) | Horizon colour and skirt size only. |
| 4. Falloff | **nowhere** | `Near`/`Far` are read for the skirt radius and nothing else. No per-pixel or per-vertex distance term exists. |

## A.3 What a torch does to `viewR`, the veil, and the phone tier

`fitViewRadius()` (`delve-fp.js:1671`) has three branches. A torch hits two of
them very differently.

**Branch 1 — GL on (`glOn()`), any theme.** `F.viewR = span + 2` (the whole
chart) and `near`/`far` are only rewritten for `L.sky`. Underground the authored
lamp is kept verbatim and the whole chart is in the buffer regardless.
**A torch on the rasteriser costs one uniform write per frame and nothing else.**
No rebuild, no re-fit, no layer budget. This is the cheap path and it is the one
the user's WebGL/desktop sessions are on when WebGL2 is available.

**Branch 2 — DOM, non-sky (`if (!L.sky)`, `delve-fp.js:1686`).**

```
F.viewR = min(viewCap(), ceil(L.near + FOG_CULL * (L.far - L.near)) + 1)
```

with `FOG_CULL = COARSE ? 0.90 : 0.96` (`:192`) and
`viewCap() = L.sky ? (COARSE?32:48) : (COARSE?12:16)` (`:175`). Worked through:

| light | tier | near/far | `viewR` today | window |
|---|---|---|---|---|
| `dark` | desktop | 1.2 / 5.2 | **7** | 15×15 |
| `dark` | phone | 1.2 / 5.2 | **6** | 13×13 |
| `lit` | desktop | 2.2 / 6.6 | **8** | 17×17 |
| `lit` | phone | 2.2 / 6.6 | **8** | 17×17 |

A candidate torch at **near 2.6 / far 9.0** (roughly Barony's reach — you see
the wall you are on and lose the corridor about eight tiles out):

| light | tier | `viewR` with torch | window | vs today |
|---|---|---|---|---|
| torch over `dark` | desktop | **10** (cap 16, clear) | 21×21 | 2.04× area |
| torch over `dark` | phone | **10** (cap 12, clear) | 21×21 | **2.78× area** |
| torch over `lit` | desktop | **10** | 21×21 | 1.56× area |

`dev/check-drawdist.mjs`'s own census (quoted in `delve-fp.js`'s `viewCap` doc
block) puts Hollowvein at **R7 / 232 layers, both tiers**. Scaling by area puts
a desktop torch near **~470 layers** — comfortably inside the estate's 1463 —
and a phone torch near **~640**, which is where the CSS-3D mobile budget starts
to bite (`memory: reference-css3d-mobile-budget`, `perf-arena-mobile`).

**Therefore, on the DOM path underground, the torch needs its own `lite` row,
exactly the way `open` already has one** (`themes.js:58`). Something like
`lite: { near: 2.0, far: 7.0 }` holds the phone at `viewR` 8 (17×17, ~300
layers) — visibly brighter than the 13×13 it has now, and under half the cost of
the desktop number. That is the same pattern the file already lives by and needs
no new concept.

**The veil.** On the DOM path the fog is a child element attached lazily the
first time a quad takes fog (`applyWants`, `delve-fp.js:1840`'s `veilFor`), and
it is baked at build time. So **lighting or dousing a torch mid-walk is a
`fitViewRadius(); buildGeometry();` pair** — which is exactly what a level
change already does (`delve-fp.js:1019`, anchor
`fitViewRadius(); buildGeometry(); drawMap();`). One frame of rebuild cost, on a
deliberate player action. That is acceptable; a torch that *flickers* its radius
per frame on the DOM path is not, and must not be attempted.

**`L.rgb` must not change.** `rgb` is what distance dissolves *into* — the
darkness itself — and it is written once at mount into the host background and
`--fp-fog` (`delve-fp.js:3032-3034`). The room's dark does not get warmer
because you are holding fire. **A torch moves `near`/`far` only.** A warm
near-field tint is a genuinely separate feature: it needs a second term in the
GL fragment shader and has no DOM equivalent at all. Mark it out of scope and
say so out loud, or the two lanes will each assume the other did it.

## A.4 Override, or add? — override by per-field max

Recommended combination rule, one line, no per-theme special cases:

```
L = { ...base, near: max(base.near, torch.near), far: max(base.far, torch.far) }
```

Why max and not add:

- **The meadow is protected for free.** `open` is 22/30; `max` leaves it
  untouched, so a torch in daylight correctly does nothing. An additive term
  would push the vista to 31/39 and blow past `viewCap` and the layer budget in
  the one chart that cannot afford it (the estate, 46 rows).
- **A lit room reads right.** `lit` 2.2/6.6 → 2.6/9.0: the lamps are still
  there, the torch reaches further than they do.
- **Dousing is free.** Drop the torch term and you fall back to the theme's own
  numbers with no state to unwind.
- **It keeps ONE RULES FACT.** One expression, evaluated in `prep`
  (`delve-fp.js:3030`) and again whenever the off-hand changes. No lens decides
  anything.

## A.5 The design question this document cannot answer for you

With `max`, the mine **without** a torch stays exactly as bright as it is today
(1.2/5.2). But `themes.js:28` already spends the torch metaphor on that row —
*"dark is a torch"*. So a torch would read as a modest buff, not as the
difference between seeing and not seeing.

The Barony reading is the other one: **re-author `dark` down to a bare-handed
floor** — say 0.6/2.4, "you see the wall you are touching" — and let a torch
restore today's numbers or better. That is the honest version of the ask.

Its cost is not small and I will not pretend otherwise:

- `viewR` for a torchless mine becomes `ceil(0.6 + 0.96×1.8) + 1 = 4` — a 9×9
  window. Very claustrophobic, and a real change to what every existing mine
  playtest felt like.
- Every chart authored under `dark` changes, including any the map pack ships.
- The delve's combat is tuned against what you can see coming (`FOE_DMG`'s 0.7
  edge, `delve-fp.js:309`, is explicitly *"a deliberate edge left to the
  delver"*). Halving sight range without re-measuring that is a balance change
  wearing a lighting change's clothes.

**This is a user decree, not an engineering call.** Ask before building it.
The build order in A.8 assumes the cheap reading (`dark` unchanged) and can be
re-pointed at the other in one table edit.

## A.6 Is a torch an off-hand item? Yes — and there is a landmine there

**The slot exists and is right for it.** `EQUIP_SLOTS = ['weapon', 'offhand',
'head', 'body', 'lower']` (`src/guild/inventory.js:99`), mirrored exactly in
`Assets/Scripts/Guild/Item.cs:190` (`EquipSlots`). The delve reads
`hooks.gear.offhand` for the left hand (`delve-fp.js:2914`, anchor
`function mountHands`) and hands it to `fp-hands.js` as `shield:` (`:2925`).

**What a torch displaces: the shield.** That is Barony's own trade and it is a
good one — light or a board, pick. It also lands cleanly on this project's
existing rule that a bow takes both hands and puts a shield down
(`hall.js:296`, anchor `function doEquip`).

**THE LANDMINE.** `hasShield()` is:

```js
function hasShield() { return !!(F.hooks.gear && F.hooks.gear.offhand); }
```

`delve-fp.js:3493` (anchor `function hasShield`). It tests that the off-hand is
**non-empty**, not that it holds a shield. `foeHit` (`delve-fp.js:4062`) then
picks the block table off that boolean:

```js
const shielded = hasShield();
const cut   = shielded ? BLOCK_CUT   : BARE_BLOCK_CUT;    // 0.55 vs 0.85
const evade = shielded ? BLOCK_EVADE : BARE_BLOCK_EVADE;  // 0.22 vs 0.06
```

`BLOCK_CUT`/`BARE_BLOCK_CUT` at `delve-fp.js:310` and `:314`. **Ship a torch
into that slot with no other change and a lit candle blocks exactly as well as
a mithril buckler** — 45% off the damage and a 22% evade — which is precisely
the bug the comment above `foeHit` says was already fixed once ("a bare hand and
a mithril shield stopped exactly as much, and the piece you had gone and forged
bought you nothing").

**The fix is a kind test, not a slot test.** `hooks.gear.offhand` carries
`{kind, material, name}` (`delve-fp.js:2888`, *"kind and material, nothing
else"*), so the shape is already there:

```js
function hasShield() {
  const o = F.hooks.gear && F.hooks.gear.offhand;
  return !!(o && o.kind === 'shield');
}
```

**This is a one-line change in `delve-fp.js`, which this lane may not touch.**
It is reproduced verbatim in the handoff notes. **It must land in the same
change as the torch item or before it — never after.**

**What blocking with a torch should then do:** fall to
`BARE_BLOCK_CUT`/`BARE_BLOCK_EVADE` (0.85 / 0.06) — the shoulder turned into the
blow, which is what your body is doing when the other hand is holding fire.
Nothing new to author. If the design later wants "you can't guard at all with a
torch", that is a third table row, not a special case; do not add it now.

## A.7 Art — what is owned, what is not (ART LAW)

I searched `RPG Assets/` and `public/assets/`. **There is no torch sprite in any
owned kit.** `find -iname "*torch*"` returns nothing in either tree.

What *does* exist, and it is better than expected:

- **`public/assets/art/candles_3x.png`** — 576×480, already registered in
  `src/guild/art.js:68` and already cropped once (`bedCandle`, `art.js:186`).
  I opened it: it is **eight rows of candles in ~48px cells** — rows 1-3 are a
  three-frame **flame animation loop**, row 4 the same candle unlit; rows 5-7
  repeat that for candlesticks, row 8 unlit. Nine styles across, in white /
  gold / blue-grey palettes. **The right-hand three columns are glow blobs** —
  three sizes × three intensities of soft yellow halo, i.e. light-halo sprites
  the kit already ships.
- `public/assets/art/lamppost_3x.png` — a *standing* lamp, already used as an
  estate prop (`campus.js:64`, `lampPost`).
- `public/assets/fx/effects-pack-14/{1..6}/` — animation frame folders,
  unaudited by me for a flame loop. **Unverified.**

**Honest recommendation:** the first shipped light source should be a **candle**,
not a torch, because the candle sheet is owned, already loaded, carries its own
three-frame flame *and* its own glow sprites, and drops straight into the
off-hand viewmodel slot with real art rather than a drawn stand-in. Call it a
candle in the fiction and the ask is still satisfied — "held light source,
visibly the room's light" — with zero new art. A drawn torch can follow.

**What it renders as today if nothing is done:** `art.js`'s `WORN` table
(`:330-350`) maps *kind* → sheet. There is no `torch` or `candle` row, and
`shieldSheet` (`art.js:364`) is only reached via the `shield` row — so an
unknown off-hand kind falls out of the table entirely and the hand shows
nothing. That is a silent-empty-hand failure, not a wrong-sprite failure, which
is the better of the two but still has to be authored.

## A.8 Build order for (A), with honest costs

| # | Step | Repo | Cost | Visible in play? |
|---|---|---|---|---|
| **1** | Fix `hasShield()` to test `kind === 'shield'`. Add a test that a non-shield off-hand blocks at the bare numbers. | web (`delve-fp.js` — **other lane**) | ~1 line + 1 test, 30 min | No (prevents a bug) |
| **2** | **THE SMALLEST VISIBLE STEP.** Add `LIGHTS.torch = {near: 2.6, far: 9.0, lite:{near:2.0,far:7.0}}` to `themes.js` and the per-field `max` combine in `prep`, driven by a hardcoded `true`. Walk Hollowvein. | web (`themes.js` is free; the combine is in `delve-fp.js` — **other lane**) | ~6 lines, 1 hour | **Yes — immediately, and this is the whole proof of concept** |
| **3** | Add `candle` (or `torch`) as a real off-hand item kind: `KINDS` row in `smithing.js:73`-style, `WORN` row in `art.js` pointing at `candles_3x`, `Shapes` row in `Item.cs:161`. Drive the light off `hooks.gear.offhand.kind`. Re-fit + rebuild on equip change. | web + Unity data | ~1 day | Yes |
| **4** | Off-hand viewmodel: draw the candle lower-left with its three-frame flame loop from `candles_3x`, rows 1-3. The sheet cells **are** the poses (CLAUDE.md art law) — no synthetic flicker transform. | web `fp-hands.js` / Unity `FpViewmodel.cs` — **viewmodel lane** | ~1 day | Yes |
| **5** | **Unity falloff.** Add a world-position varying + `uFog`/`uFogRange`/`uEyeXZ` globals to `AtlasSprite.shader` and push them from the walk each frame. Without this, steps 2-4 are invisible in the build the user actually plays. | Unity (`AtlasSprite.shader` is free; the per-frame push needs `EstateWalk.cs`) | ~1 day + a perf pass on WebGL | **Yes, and it is the step that makes the port match at all** |
| **6** | Re-run `node --import ./dev/register-vite-env.mjs dev/check-drawdist.mjs` and record the new Hollowvein numbers in the `viewCap` census table. Re-baseline EditMode. | both | ~1 hour | No |

**Step 2 is the answer to "smallest first step visible in play."** A single new
row in `themes.js` plus a `max` — no item, no art, no slot, no Unity — and the
mine visibly opens up. If it does not feel like anything at 2.6/9.0, no further
work is warranted and you have spent an hour finding that out.

**The one number I would measure before trusting any of this:** the phone DOM
tier. Everything above is arithmetic off `fitViewRadius`'s own formula; the
layer counts are scaled from the `check-drawdist` census, not measured. Run the
checker.

---

# (B) INVENTORY MANAGEMENT

## B.1 The distinction that matters most

**Barony's inventory is a single-character roguelike backpack.** One body, one
run, one bag; weight limits what that body can carry away; unidentified items
create the risk that the run turns on; the hotbar is a combat-speed access
problem because you are the only one there and the monster is already swinging.

**This game's inventory is a guild store.** `createInventory`
(`src/guild/inventory.js:48`) returns `{items, materials, potions, books,
materia}` — a **guild-level** object hung off `guild.inventory`, and an `Item`
carries `location: 'armory' | personId` (`src/guild/item.js:38, 53`). Ownership
is a *field on the item*, not a container it lives in. `armoryItems(inv)`
(`inventory.js:86`) is "everything nobody is currently holding". There is no bag
anywhere in the codebase, because a guild does not have one.

**Where the analogy holds:**

- **The paperdoll.** Five slots, one item each, a picture of the person wearing
  them. This game already has it — `paintMemberDoll` (`hall.js:362`), handed to
  the field sheet as a **painter** so the sheet never learns what a guild Item
  looks like (`hall.js:814`). Barony's paperdoll and this one are the same
  object.
- **The item tooltip as a decision aid.** Barony's tooltip exists so you can
  answer "is this better?" This game already answers it, and better:
  `itemCompareRows(worn, cand, h)` (`hall.js:450`) produces before/after rows in
  the guild's own numbers, and `field-sheet.js`'s picker shows them **with the
  candidate previewed on the doll** (`hall.js:814-815`, `preview` arg).
- **Mid-walk access.** Barony opens the bag in the dungeon. This game opens the
  field sheet in the delve — `openWalkSheet` (`delve-fp.js:4964`), and it
  **deliberately does not pause** (`field-sheet.js` header: *"a sheet that
  stopped the world would be a way to stop being hit"*). Same instinct, better
  articulated.
- **The hotbar.** The delve already has a one-slot one: the drink button,
  `R`/`fp-drink` (`delve-fp.js:3164`, key map `:3261`). Barony's is the same
  idea with more slots.

**Where copying it would fight this design:**

- **Weight/encumbrance is the wrong axis.** I grepped `weight|encumb` across
  `src/guild/` and `src/game/data/gear.js`: **zero hits** that mean carry
  capacity. The one weight-shaped idea the game has is `bulk` on a smithing
  recipe (`smithing.js:73`), which is *forge effort*, not carry load. Barony
  needs weight because one body carries the whole run's loot out. Here, a delve
  banks its haul into a **guild** store on exit (`F.haul` → `endDelve`,
  `delve-fp.js:4914`) and the guild's store is uncapped by design —
  the limiting resources are **gold, stamina and time**, which the calendar and
  `HuntDispatch.QuestStamina` already meter. Adding weight would add a fourth
  limiter that fights the three that already work.
- **UNIDENTIFIED is the wrong mystery.** Barony hides an item's stats so
  *picking it up* is a gamble. This game's mystery is **forging**: `previewQuality`
  and the refine gamble (`smithing.js`, `refineChance`, `REFINE_GUARDS`) already
  put the risk at the moment of *making*, and the RO-style `+N` (`item.js:34`,
  `itemLabel` `:58`) puts the result on the item's own name. Two mysteries about
  the same item is one too many, and the second one erases the first: a
  "+7 Mithril Sword (unidentified)" is a worse object than either half.
- **The grid is the wrong container.** A grid is a *spatial* representation of a
  *capacity* constraint. With no capacity constraint it is a list with worse
  scanning. The guild's store is browsed by **room** — `ROOM_OF_KIND`
  (`inventory.js:33`) shelves ore at the Forge, herbs at the Laboratory, food at
  the Kitchen, hides at the Armory — which is a *semantic* container and is the
  better one for a manager.
- **The backpack itself.** The delve carries no items. `F.haul` is a tally
  (`{gold, mats, kills, field, taken, dodged}`), keys are a bare counter
  (`F.keyCount`, `delve-fp.js:4294`'s `F.keyCount++` in the pickup path), and
  ore goes straight to the tally in `mineOre` (`delve-fp.js:4301`). Nothing is ever
  *dropped*, so nothing needs a place to be.

**The one-line version:** take Barony's **paperdoll**, its **tooltip**, and its
**hotbar**. Leave its **grid**, its **weight** and its **unidentified state**.

## B.2 What exists today — the honest survey

### Web

| Barony feature | Status | Where |
|---|---|---|
| Paperdoll | **Shipped** | `paintMemberDoll` `hall.js:362`; wired as a painter into the sheet `hall.js:814` |
| Five equip slots | **Shipped** | `EQUIP_SLOTS` `inventory.js:99`; `SHEET_SLOT` labels in `hall.js` |
| Equip/unequip from a panel | **Shipped, mid-walk** | `memberSheetSpec(h).equip` `hall.js:827-853` (`options` `:828`, `apply` `:847`); routes through `doEquip`/`returnToArmory` (`hall.js:296`/`:288`) so the two-handed rule holds |
| Item tooltip, with a comparison | **Shipped and better than Barony's** | `itemCompareRows` `hall.js:450`; `displacedNote`; `compare-panel.js` |
| Item **value** | **Shipped** | `itemSellValue(item)` `market.js:36`; `MATERIAL_PRICE` `:14` |
| Item quality bands (Barony's "cursed/blessed" tier read) | **Shipped** | `QUALITY_TIERS` `item.js:14-20`, five bands with colours |
| Refine level on the name | **Shipped** | `itemLabel` `item.js:58` — "+5 Steel Sword" |
| Durability | **Shipped as a field, shown in the sheet** | `item.js:51`; printed in `memberSheetSpec` `hall.js:806` |
| Consumables | **Shipped** (`potions`, batches with qty) | `inventory.js:72-84` |
| Hotbar | **One slot** (drink) | `delve-fp.js:3203` `fp-drink` button, key map `r: 'drink'` `:3300`, count badge `:4243` |
| **Grid layout** | **Absent** | — |
| **Weight** | **Absent** | zero hits |
| **UNIDENTIFIED** | **Absent** | zero hits |
| Drop / pick up an item in the world | **Absent** | the delve has no item entities; keys are a counter |

### Unity

| Barony feature | Status | Where |
|---|---|---|
| `Item` model | **Ported** | `Assets/Scripts/Guild/Item.cs` (588 lines) — kinds, slots, quality, `EquipSlots` `:190`, slot weights `:461` |
| Arena `Gear` model | **Ported** | `Assets/Scripts/Arena/Gear.cs` (600 lines) — `GearType` table `:116`, two-hand + shield-on-shield refusal `:517-586` |
| Gear draft screen | **Ported** | `GearDraftScreen.cs` (462 lines) — the pre-arena loadout |
| Guild stores | **Partial** | `GuildStores.cs` (102 lines), `Materials.cs` (229 lines) |
| Paperdoll | **Absent** | no `paintMemberDoll` equivalent; `PortraitStrip.cs` is portraits only |
| Field sheet (in-walk stats/gear panel) | **Absent** | `grep FieldSheet Assets/Scripts/` → zero hits |
| Mid-walk equip | **Absent** | follows from the above |
| Armory / forge inventory browsing | **Partial** | `ForgeScreen.cs` exists; the armory door hits the *"not yet ported"* notice (`docs/parity/parity-unity-state.md` §2) |
| Hotbar / consumables in a walk | **Absent** | — |

**The port gap is the story here.** The web has a genuinely good inventory
already; Unity has the *model* faithfully ported and almost none of the
*screens*. This matches `memory: project-unity-room-parity` (16 deep web rooms
vs ~6 partial Unity screens). **For the user, who plays the Unity link, "inventory
management" reads as missing not because the design is missing but because the
port is.**

## B.3 What Barony actually adds that this game lacks

Stripping out the three things that fight the design, exactly **three** real
gaps remain:

1. **A hotbar with more than one slot.** The delve has `R` = drink. Barony's
   bottom-centre bar is the same idea generalised. Cheap, and it is the one
   Barony HUD element that is unambiguously an improvement here.
2. **The store, browsable as a whole, from inside the world.** The field sheet
   shows the *member's five slots*. It does not show the guild's shelves. In the
   web you must leave the delve to see what the Armory holds. Barony's left
   panel is that view. **This is the real ask hiding inside "inventory
   management."**
3. **Unity has neither of the above, nor the paperdoll, nor mid-walk equip.**

## B.4 Build order for (B), with honest costs

| # | Step | Repo | Cost | Why this order |
|---|---|---|---|---|
| **1** | **Port the field sheet to Unity.** `field-sheet.js` is 281 lines and takes a *description* (`openFieldSheet(spec)`, `:240`) — rows, a worn set, chips, a `doll` painter, an `equip` block. It knows nothing about either lens by design. That contract ports directly. | Unity (new `FieldSheetScreen.cs`) | 2-3 days | Closes the biggest visible gap in the build the user plays, and does it with a contract that already exists rather than a new design |
| **2** | Port `paintMemberDoll` as the sheet's `doll` painter. | Unity | 1-2 days | The paperdoll is the half of Barony's panel that this game genuinely wants |
| **3** | Widen the delve hotbar from one slot to N, web first. `fp-drink` is already a button with a key binding and a count badge — generalise it over `inventory.potions`. | web `delve-fp.js` (**other lane**) + `styles/delve.css` | 1 day | The one Barony HUD idea that is a straight win |
| **4** | Add a **Stores** tab to the field sheet: the guild's shelves grouped by `ROOM_OF_KIND` (`inventory.js:33`), read-only in the delve. Not a grid — the room grouping the game already has. | web `field-sheet.js` (free) + `hall.js` spec builder | 2 days | The real content of "inventory management"; do it after the sheet exists in both engines or you will build it twice |
| **5** | Port the hotbar and the Stores tab to Unity. | Unity | 2-3 days | |

**Deliberately not on this list:** a grid layout, a weight/encumbrance system,
an UNIDENTIFIED state, and world-droppable items. Each is a design change, not a
port, and §B.1 argues each fights something the game already does well. If the
user wants one anyway that is their call — but it should be asked as a design
question, not smuggled in as "matching Barony."

---

## Things I did not verify, and will not guess about

- **`effects-pack-14` frame contents.** I listed the folders; I did not open the
  frames. If a flame loop is in there it changes the art answer in A.7.
- **Actual layer counts for a torch-radius mine.** Every number in A.3 is
  arithmetic off `fitViewRadius`'s own formula and area-scaling from the
  `check-drawdist` census printed in `delve-fp.js`. **Run
  `dev/check-drawdist.mjs` before trusting them.**
- **WebGL cost of adding fog to `AtlasSprite.shader`.** One varying and two
  globals is small, but this shader draws the whole crowd in the arena as well
  as the delve, and `memory: perf-arena-mobile` records that the arena already
  died on a phone once. Measure the APK, not the WebGL link.
- **Whether `dark` should be re-authored down (A.5).** Design decree, not mine.
- **The EditMode count discrepancy (515 vs the brief's 541).** I did not
  investigate the other wave's test additions.
- **Whether the delve's `hooks.gear` reaches Unity's walk at all.** I read
  `EstateWalk.cs`'s use of `FpViewmodel` but did not trace the Unity gear
  pipeline end to end.
