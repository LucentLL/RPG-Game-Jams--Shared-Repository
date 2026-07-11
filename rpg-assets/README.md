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

To add more: copy the sheet into `public/assets/art/`, measure the crop (the
alpha-cluster probe in session notes, or any pixel editor), and register it in
`src/guild/art.js` — `artSprite('name')` then renders it anywhere, pixel-crisp
at any size.

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
