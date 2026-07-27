# rpg-assets — the shared pixel-art library

The team's licensed asset collection (Patreon bundles 2017–2025 + loose tilesets),
committed here so every machine and jam project pulls the same art. This folder is
**source material — nothing in it loads at runtime.** The game serves only what's
been hand-picked into `public/assets/` (curated copies; crops are registered in
[`src/guild/art.js`](../src/guild/art.js)).

> The Elements character packs are NOT duplicated here — they already live at the
> repo root (`elements_core_pack_2.14.24/` etc.) and feed the sprite compositor.

## Layout

- `20XXpatronbundle/` — yearly bundles, most sheets in three scales:
  `1x` (16px tiles) · `2x_RMVX` (32px) · `3x_MV/MZ/MMV` (48px — **matches the
  game's 48px world; prefer these**).
- `weapons/` — Elements weapon-format sheets (1104×192, a 23×4 grid of 48px
  cells) that drop straight into the character compositor: `maces/`,
  `wizardstaff/`, `bow2_and_crossbow/`, plus the back-worn `backsheath1and2/`
  and `backsheath3andquiver/`. Colour variants use the `_cN` suffix. These are
  already wired in — see the weapons table below.
- Loose PNGs at the root — one-off tilesets (kitchens, bathrooms, airships,
  minecarts, shipwrecks, tools, world-map pieces…).

## What's already wired into the game

| Sprite | Source sheet | Used by |
|---|---|---|
| Trees (two silhouettes) | `2025pbundle/.../elements_tree_3x.png` | campus tree lines |
| Village well | `2017patronbundle/.../welltiles_3.png` | campus avenue |
| Market stall | `2025pbundle/.../marketstalls25_om_3.png` | campus south gate |
| Covered wagon | `coveredwagontiles_1.png` | campus south gate |
| Bookshelves | `2018patronbundle/.../secret_bookshelf_3.png` | Library room scene |
| Anvil | `2017patronbundle/.../blacksmith_bigsheet_mv.png` | Forge room scene |
| Stone ovens + counters | `ultint_oven1a.png`, `.../bakerykitchentiles_e_1.png` | Kitchen room scene |
| Bunks | `2018patronbundle/.../bigbeds_3.png` | Quarters room scene |
| Maces (held) | `weapons/maces/mace1-3` | combat, generator, Cleric heroes |
| Staves (held) | `weapons/wizardstaff/staff1-3` | combat, generator, Mage heroes |
| Crossbow, Bow2 (held) | `weapons/bow2_and_crossbow/` | combat, generator, Ranger tiers |
| Sheathed weapons (back) | `weapons/backsheath*/`, `backquiver` | out-of-combat sprites + generator "Back" slot |
| Gear icons (held big) | `2018patronbundle/.../{mswords,mspears,mshields}_icon32.png`, `.../marrows_icon32.png`, `2020patronbundle/2020/icons/icons_hammers_32_fc.png` | the first-person Delve's weapon + shield viewmodel (art.js `gearIcon`) |

> **Why a second weapon art source.** The compositor's weapon cells carry about
> ten pixels of blade (sword1.png r0c1 measures an 8×11 alpha box) — right for a
> 48px battle sprite, useless held up to the screen. The 32px item icons are the
> same art family at four times the ink, drawn hilt-at-lower-left, which mirrors
> into a blade rising out of the near corner. `mspears_icon32` carries spears in
> 0–6 and **axes in 7–12**; `marrows_icon32` carries bows in 3–6 and crossbows in
> 7–9. Copies live at `public/assets/art/gear_*32.png`.

Room set-pieces are cropped via `src/guild/art.js` (`artSprite('name')`).
Character weapons instead go straight into the Elements compositor: copy the
sheet (base + every `_cN`) into `public/assets/sprites/core/weapon/`, then add
a ladder entry in `src/game/data/orb-tables.js` (`GEAR_WEAPON_LADDER`) for a
held weapon, or map an archetype to it via `GUILD_ARCH_WEAPON` /
`GUILD_ARCH_WEAPON[...].sheath` in `crucible.js` for a back-worn one.

## The mining map — where to dig next

- **Kitchen/food depth**: `ultint_tileB/C_kitchen`, `bakerykitchentiles`, `food_3`,
  ovens — full Kitchen interior + pantry/provision icons (supply-gated diet).
- **Forge**: `blacksmith_bigsheet` (smith characters AND anvils/forges) — a real
  smithy interior; the smith sprites could staff the Forge scene.
- **Laboratory**: `2017 witch/witchX_cauldron` (animated cauldron — solid-color
  frame backgrounds need keying), `ultint_flowerpotsvases`.
- **Quarters/inn**: `bigbeds`, `tent_inside`, `bathroom_*`.
- **Campus & world**: `bush_autotiles`, `tallbush`, `stonefence`/`ff_fence`
  (estate borders!), `streetlight_city`, `welltiles_snow` (winter seasons),
  `frogheim_floortextures` (interior floors), `shipwreck_planks_terrain`.
- **Events/festivals**: `marketstalls_16` (2017) + `marketstalls25` (booth
  variety), `lobit_flags` (bunting for festival weeks), `2025 arcadezone`.
- **Quest flavor**: minecarts + rails, airships/balloons, `worldmap-brokenbridges`,
  `worldminishipwrecks` (a world map screen someday), fishing gear + `bobber`.
- **People**: yearly character sheets (children, dancers, heroes Alex/Hogan),
  `pets_1–3` (ranch pets!), `animals_expansion_2023`, `insect_champ` (monsters).
- **Tools**: `tool_hammer/hoe/net/scythe/watering` — station/prop dressing.

## License note

These are paid bundle assets — fine to use in the team's games; do not treat this
folder as redistributable on its own. Keep the repo's visibility in line with the
bundle license terms.
