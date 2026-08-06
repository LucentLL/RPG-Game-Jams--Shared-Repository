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
- **THE HEIGHT LADDER (user decree, 2026-08-06).** Object heights are authored
  relative to THE PLAYER (`PLAYER_H` = 760/900 tiles, prop-volume.js), on the
  ladder 0.125x · 0.25x · 0.5x · 0.75x · 1x · 1.25x · 1.5x · 2x · 3x — and a
  thing meant for human use is sized for a human to use (desks at the waist,
  shelves at the shoulder, a pell as tall as the fighter). The chart width is
  COMPUTED from the ladder height (`w = h × art aspect × 48`), never eyeballed
  — that is how an anvil came to stand eye-high. `node dev/check-volumes.mjs`
  fails on any width that drifts off its rung; run it after touching any prop
  size.
- **ONE COLLISION FACT.** A thing blocks the space its art occupies — in every
  lens, no more, no less. "Bigger than the art" collision is a bug by
  definition; so is walking through something you can see.
- **ONE RULES FACT.** Combat, reach, line of sight, movement legality: decided
  by the shared model (crucible.js / arena-terrain.js / the delve grids),
  never by a lens. If a view file can answer a rules question, that is a bug
  in the view file.
- **ONE WORLD.** The lenses are cameras on one world, not copies of it. State
  carried between views (position, facing, spoils, worked seams) crosses 1:1.

## Art law (earned three times over — see memory `project-delve-2p5d`)

- The designated sheet cells ARE the poses: never fake a pose, a fall, or
  volume with synthetic transforms. "Near enough to see, you can always tell."
- Animated art stays a sprite (a carving cannot stir); still art may be
  extruded to real volume from its own pixels (`voxel-sprite.js`).
- Owned tilesets first (`RPG Assets/`, `public/assets/`): draw new art only
  when no kit carries the thing, and say so in a comment.
