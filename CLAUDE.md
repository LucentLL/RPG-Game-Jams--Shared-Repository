# The Crucible — project law

Standing rules for every session working in this repository. These outrank
convenience, refactors, and any single lens's private logic.

## Every perspective is a valid game (user decree, 2026-08-06)

The game is played WHOLE in any of its lenses — top-down, isometric,
first person, over-the-shoulder, action arena, tactical board. None of them is
a preview of another. Therefore:

- **ONE SIZE FACT.** An object's relative size (against the player, against
  its tile) is identical in every perspective. The chart's authored width
  (`p.w`, px against the 48px tile — what the top-down has always drawn) is
  that fact; every lens DERIVES from it and none may re-author it. A size that
  looks wrong is fixed at the source, never patched per-lens.
- **THE TILE IS FIVE FEET, WIDE AND TALL (user decree, 2026-09-20).** The world
  is measured in FEET, not in people: *"Tiles can't be the 'height of a human'
  when characters can have variance in height ... Let's say default tile size
  is 5ft wide and 5ft tall."* A person is six feet, so `PLAYER_H` = 1.2 tiles;
  ONE LEVEL of ledge is a whole tile (five feet — what a ladder, a vine or a
  flight of steps carries you up); a wall is ten feet. It was 0.844 tiles,
  which made the tile seven feet and a level 3.3 — a ladder to the waist, which
  is the report that ended it. `DelveScale` (Unity) and `prop-volume.js` (web)
  are the two copies and they are one table.
- **THE HEIGHT LADDER (user decree, 2026-08-06).** Object heights are authored
  relative to THE PLAYER (`PLAYER_H`, above), on the ladder 0.125x · 0.25x ·
  0.5x · 0.75x · 1x · 1.25x · 1.5x · 2x · 3x — and a thing meant for human use
  is sized for a human to use (desks at the waist, shelves at the shoulder, a
  pell as tall as the fighter). Creature RANKS are rungs too. The chart width
  is COMPUTED from the ladder height (`w = h × art aspect × 48`), never
  eyeballed — that is how an anvil came to stand eye-high. `node
  dev/check-volumes.mjs` fails on any width that drifts off its rung; run it
  after touching any prop size.
  A DEPTH or a hung height is a LENGTH in tiles, not a fraction of a cell: it
  keeps its feet when the tile is re-measured, and nothing may shrink a thing
  for being broad (a tree is three people tall, two tiles across, and blocks
  only its bole).
- **ONE COLLISION FACT.** A thing blocks the space its art occupies — in every
  lens, no more, no less. "Bigger than the art" collision is a bug by
  definition; so is walking through something you can see.
- **ONE RULES FACT.** Combat, reach, line of sight, movement legality: decided
  by the shared model (crucible.js / arena-terrain.js / the delve grids),
  never by a lens. If a view file can answer a rules question, that is a bug
  in the view file.
- **ONE WORLD.** The lenses are cameras on one world, not copies of it. State
  carried between views (position, facing, spoils, worked seams) crosses 1:1.

## Every mode is the same game (user decree, 2026-09-20)

*"All modes maps should be created with the same Map Editor. All modes should
have the same functionality for navigation, interaction, and combat. It is very
inefficient that changes made are not universal. Per mode features can be added
on top of a mode like Guild Management or Party control, but the underlying
fundamentals should be universal."*

The lens law above says one world seen through many cameras. This is the same
law one level up: ONE GAME played under many RULE SETS. Therefore:

- **ONE EDITOR.** Every place any mode plays on is a chart the Map Editor made
  and can open again — a `kind` of chart, never a literal grid in code and never
  a private generator's private vocabulary. A generator may GROW a place, but
  what it grows is a chart (`TerrainGen` already does this for halls and towns).
  The Battlefield's generated plain is the last world that is not an area; it is
  owed a kind, and nothing new may join it.
- **ONE SUBSTRATE.** Navigation (the step law, collision, levels, climbs, water,
  doors), interaction (offers, uses, keys, portals, exits) and combat (bodies,
  attacks, the wind-up, stamina, the guard, skills, damage, targeting, the AI)
  are each implemented ONCE, and every mode plays on that one implementation. A
  fix or a feature to a fundamental lands in the shared layer and is therefore
  in every mode the day it ships. A mode with a private copy of a fundamental —
  "the Wilds' fight", "the arena's walk" — is a bug by definition, however
  faithfully it was ported. (`DelveFight` beside `ArenaCombat` is the standing
  example: the Wilds had no wind-up because its fight was a second fight.)
- **MODES ARE LAYERS.** What a mode may own is what is genuinely its own: guild
  management, party control, a bout's bell and its lists, an army's orders, a
  hunt's spoils. A layer switches mechanics ON over the substrate; it never
  re-implements one. If a mode needs a fundamental to behave differently, the
  difference is a parameter of the shared thing, stated there.
- **QUICKPLAY IS THE CORE MODE'S OWN CODE.** *"Arena is a Quickplay version of
  the same mode from the core mode tournaments. Battlefield modes are quick play
  versions of eventual Guild vs Guild battles."* One entry each: quickplay
  supplies a roster and a venue and calls the SAME bout the calendar's
  tournament calls, the SAME battle a guild-vs-guild war will call. Nothing is
  built for a quickplay mode that the core mode cannot use, and nothing the core
  mode needs may live behind a quickplay-only door.
- **THE TEST, before writing any fundamental:** *which modes does this reach?*
  If the answer is not "all of them", it is in the wrong file. The staged plan
  for getting there from a build that grew four engines is
  `Guild Rancher/docs/ONE-SUBSTRATE.md`.

## Art law (earned three times over — see memory `project-delve-2p5d`)

- The designated sheet cells ARE the poses: never fake a pose, a fall, or
  volume with synthetic transforms. "Near enough to see, you can always tell."
- Animated art stays a sprite (a carving cannot stir); still art may be
  extruded to real volume from its own pixels (`voxel-sprite.js`).
- Owned tilesets first (`RPG Assets/`, `public/assets/`): draw new art only
  when no kit carries the thing, and say so in a comment.
