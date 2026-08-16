# The map pack

Every authored map in this game, as data. One file per map, **filename ===
`id`**, `[a-z0-9-]+`.

A map used to be an object literal inside a module the game imports
(`src/guild/delve-maps.js` for the delve charts, `src/game/arena-terrain.js`
for the arena fields). That meant the only way to author a level was to edit
running code — the map editor could draw one but not ship one, no port could
load one, and no tool could check one without scraping JavaScript source text.
This directory is the fix: a chart is a file, and every lens, editor, checker
and port reads the same file.

## The schema

```jsonc
{
  "schema": 1,
  "kind": "delve",              // "delve" | "arena".
                                //   world/estate/tactical are LATER kinds — do not invent them.
  "id": "hollowvein",           // matches the filename stem; [a-z0-9-]+
  "name": "Hollowvein Mine",    // OPTIONAL — omitted where the source authors none
  "theme": "mine",              // key into THEMES (delve-maps.js)
  "grid": ["####", "#..#"],     // ASCII rows, all equal length
  "entry": [4.5, 15.5],         // OPTIONAL. NUMBERS, not integers — see below.
  "exitStairs": false,          // OPTIONAL bool, chart-level
  "water":   [[10, 7]],         // OPTIONAL — see "off-schema keys" below
  "props":   [{ "art": "anvilBare", "x": 5.5, "y": 6, "use": "anvil", "label": "Work the anvil" }],
  "portals": [{ "x": 4.5, "y": 1.5, "to": "libraryLoft", "at": [4.5, 7.3], "enter": true, "stairs": true }],
  "spawns":  [{ "prey": "ghost", "x": 18, "y": 16 }],
  "regions": [{ "x": 0, "y": 0, "w": 8, "h": 6, "theme": "forge" }],
  "paint":   [{ "x": 0, "y": 0, "w": 8, "h": 6, "theme": "forge" }],
  "walls":   [{ "x": 3, "y": 7, "w": 5, "h": 1, "theme": "dormitory" }],
  "locks":   [[21, 11]]
}
```

**Arrays are omitted when empty, and every optional key may be absent.** A
loader must tolerate all of it: `hollowvein` has no `props` key at all, and
`library` has no `spawns`. An empty array and an absent key mean the same
thing, which is why the exporter writes neither.

The grid vocabulary (`#`, `.`, `s`, `o`, `^`, `2`, `,`, `L`, `v`, `S`, `D`,
`K`, `u`, `n`, …) is documented once, at the top of `src/guild/delve-maps.js`,
and is not repeated here — one description, in the file the level model is
compiled by.

## THE ONE HARD RULE: a prop has no width

**The pack carries no prop `w`.** It is DERIVED at load:

```
w = round((form === 'lie' ? d : h) × (art.w / art.h) × 48)
```

where `h`/`d`/`form` are the prop's ladder entry in `src/guild/prop-volume.js`
and `art.w`/`art.h` are its crop in `src/guild/art.js`. That line is not
repeated in any loader either — it is `lawfulWidth` in
**`src/guild/prop-width.js`**, and every caller imports it.

### Why the field is gone rather than merely redundant

CLAUDE.md's **ONE SIZE FACT**: an object's relative size is identical in every
perspective, the chart width IS that fact, and every lens DERIVES from it.
Height is authored on THE HEIGHT LADDER (multiples of `PLAYER_H`); width is
what that height plus the art's own proportions come to.

When `w` was a second authored number sitting beside the height it comes from,
the two could disagree — and did. A width picked for top-down *readability*
(a desk drawn generously so you can tell it from a chair) made a first-person
lens render `forgeFurnace` three tiles tall in a 1.4-tile room, and put the
anvil's working face at eye height. `dev/check-volumes.mjs` was written to
catch that drift after the fact.

Deleting the field makes the law **structural** instead of policed: there is
no longer a slot for a width to drift in. A size that looks wrong is now fixed
at the source — the rung in `prop-volume.js` — because that is the only place
left that can be edited.

### The migration was proved non-destructive

`dev/migrate-maps.mjs` re-derived every authored `w` before dropping it and
required an **exact** match — not the ±1px authoring tolerance
`check-volumes.mjs` allows, but exact, because the whole claim is that the
number in the source carried no information. All **59 props across 15 charts**
reproduced exactly. Any that had not would have been printed in a table and
its chart left unwritten; neither the chart nor the ladder would have been
"corrected" to make the migration go through.

## THREE OPEN COLLISIONS WITH THE PIN

Three facts the shipped charts author have no legal home in the pinned schema.
All three are written **as authored**, and
`src/guild/map-pack-validate.js` **rejects all three today** — which is the
correct behaviour and is exactly how they were found. Until the pin moves,
`ferncreek`, `apothecary` and `libraryLoft` cannot enter the pack; the other
twelve load clean.

| what | where | why it must not be quietly resolved |
| --- | --- | --- |
| chart key `water` | `ferncreek`, 28 cells | Water is deliberately NOT a grid char: a liquid is not a *kind* of ground, it is something lying on top of whatever ground is already there, so a `,` creek bed can be one step down **and** full of water. Drop the array and the bed, the vines and the bridge all stay — and the creek is dry. |
| prop key `cls` | `apothecary` cauldron | `apoth-boil` walks the witch-at-her-cauldron's four frames. Drop it and an animation becomes a still. |
| id `libraryLoft` | the id rule is `[a-z0-9-]+` | The id is a **key**: `library`'s portal `to`, a `hall.js` locale hook, the Unity registry and two pinned fixtures all name it. Renaming it is a cross-repo rules change, not a filename tidy — so the exporter reports it and does not rename. |

Dropping the first two would make the migration lossy; renaming the third is a
rules change smuggled in by an exporter; inventing a field for any of them
papers over a decision. So: **reported, never resolved here.** The pin is what
should move.

`regions` is in the schema and no shipped chart uses one; the exporter would
write it if one did. `paint` and `walls` are documented in full below.

## THE THREE RECT CHANNELS: `paint`, `walls`, `regions`

All three are the same four numbers plus a `theme` — `{x, y, w, h, theme}` —
and they are **not interchangeable**. They differ by which surface they speak
for, and getting them confused is the one mistake this shape invites:

| key | surface | what it can change |
| --- | --- | --- |
| `paint` | the **GROUND** of the cells in the rect | dressing only |
| `walls` | the **VERTICAL faces** of the cells in the rect — block sides, wall runs, terrace risers, trench inner faces | dressing only |
| `regions` | a **ROOM** — walls *and* a ceiling (even under open sky) *and* gameplay meaning (`campus.js:362`) | it says a place EXISTS |

`paint` and `walls` are **FILL-ONLY DRESSING AND NEVER A RULE** (CLAUDE.md,
ONE RULES FACT). Neither may change a height, a passability, a collision, a
line of sight, or what a cell *is*. That is not a convention — it is the
reason they are allowed to be authored per-rect at all: a rules fact has to
come from the shared model, so anything a lens could decide on its own must be
unable to decide anything.

A `walls` rect that lands on a floor cell is simply **nothing to dress** —
legal, and worth a note, not an error.

### `walls`: what a chart's stone is made of

A chart has one `theme`, and until 2026-08-16 that was the *only* thing that
could say what a wall looked like: a player building in the 3D drafting table
got dirt walls and no way to ask for anything else. `walls` is the missing
channel. Each rect dresses the vertical surfaces of the cells it covers with
another theme's **wall contract** — `THEMES[t].walls`, i.e.
`{sheet, tall, low, crown}` (`src/guild/themes.js`).

**Absent means the map's own theme.** Every shipped chart is unchanged by the
addition and nothing needed migrating.

**Later rects win over earlier ones**, exactly as `paint` does — which is what
makes "change *this one block* to wood" a 1×1 rect appended to the array
rather than a second mechanism.

Ten themes carry a wall contract (`interior`, `guildhall`, `kitchen`, `forge`,
`apothecary`, `armory`, `dormitory`, `classroom`, `guildmaster`, `arena`).
`mine` and `meadow` do not: their verticals come off the cliff sheet's own
faces (`delve-fp.js:475`), so naming one in a `walls` rect asks for a texture
that does not exist and the faces keep what they already wore.

#### The one chart that uses it

`forge` dresses `{x: 3, y: 7, w: 5, h: 1, theme: "dormitory"}` — the two
waist-high `b` blocks flanking the smithy's south approach, in the `dormitory`
theme's plank wall, so they read as timber benches against the sooty stone
instead of more of the same wall. The three floor cells between them are in
the rect and are simply not dressed: nothing vertical there, which is the
fill-only rule doing its job in a shipped file rather than in a comment.

#### The lint is advice, never an error

`dev/check-maps.mjs` prints these under **the dressing** and the run stays
green; nothing dressing gets wrong may fail a build.

- a rect covering **no vertical surface** (all flat ground) — *nothing to
  dress here*. Asked of the level model, never of raw char adjacency, and
  deliberately generous: the note fires only when nothing in the rect could
  own a face. A face is owned by the cell the **material** is in — a block's
  sides belong to the block, not to the floor tile in front of it.
- a rect naming a theme with **no walls contract** in `THEMES`.
- a rect lying **entirely off the grid** — the usual way is a rect authored
  against a bigger draft, after which the grid shrank under it.

### A climb is a FLOOR cell, not a wall

Related, and the same confusion from the other side: `L` (ladder), `v` (vine)
and `S` (stairs) are **ground you walk onto**, dressed with the thing you
climb. They are not something you hang on a wall's face. Painting one into a
wall cell **replaces the wall** — put the climb on the floor cell *in front
of* the ledge it serves ("directly south of the ledge it serves, so it leans
on its face"), and the wall stays standing.

## `entry` and portal `x`/`y` are numbers, not integers

The web authors half-tiles — `entry: [4.5, 15.5]`, `portals: [{x: 4.5, y:
1.5}]` — and **the fraction is load-bearing**. `entry` is where a body stands;
a portal fires within 0.8 tiles of its point, so flooring `4.5` to `4` moves
the trigger half a tile off the doorway it belongs to. They are written as
authored. A port that wants cell indices floors them at ITS boundary, which is
where that narrowing is honest.

## Two maps are not in the pack, on purpose

- **`propbench`** — GENERATED from `PROP_VOL` at import time
  (`delve-maps.js` `buildPropBench`). It is a review bench holding one of
  every placeable object, and it grows the moment a prop is authored. Freezing
  it into a file is exactly the staleness its own doc comment exists to
  prevent. It stays a function.
- **`campus`** — `DELVE_MAPS.campus` is `null`, a placeholder.
  `mapForLocale('campus')` derives the grounds from the player's live layout
  on every call, because the campus is the one map the player can REBUILD.
  There is no chart here to move.

## Regenerating and checking

```
node --import ./dev/register-vite-env.mjs dev/migrate-maps.mjs
```

One-shot: it writes every file, then reads each one back cold, re-derives the
props' widths, and deep-compares the result against the live chart object in
`delve-maps.js` — PASS/FAIL per chart, naming the first differing path. It
exits non-zero on any failure.

The comparison licenses exactly two normalizations, applied to **both** sides:
an empty array is dropped, and an `undefined` value is dropped. Nothing else —
a `0`, a `false` and an empty string all survive as themselves.

It ends with a **self-test**: seven mutations, each aimed at the claim
responsible for catching it — stealing `hollowvein`'s key leaves the level
model bit-identical (a `K` derives its floor from its neighbours exactly as
the `.` replacing it does), so that one is the *print*'s job, while flattening
the crow's nest is the *model*'s. A round-trip check that cannot fail is not a
check.

The standing audit is separate and is what to run after editing a file by
hand:

```
node --import ./dev/register-vite-env.mjs dev/check-maps.mjs
```

Once `delve-maps.js` loads from the pack, the migration script's job is done
and its round-trip becomes a regression check rather than a migration.
