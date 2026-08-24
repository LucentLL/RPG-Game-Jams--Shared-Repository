# The reference shelf (owner list, 2026-08-14)

> `DESIGN.md` says **what and why**. `ARCHITECTURE.md` says **how**. This says
> **whose idea it was, what we took, and what we deliberately left on the shelf.**

Every game below is already cited somewhere in the source — in a file header, in a
comment defending a constant, in a commit message. That is the problem this file
fixes: the lineage was true but scattered, so a decision could be re-argued from
scratch by anyone who hadn't read the right comment.

**The rule of this file: a reference is a debt, and it is paid in three parts.**
Name the ONE mechanic taken, name what is refused with it, and name the module that
holds it. A reference with no refusal is not a reference — it is a mood board, and a
mood board is how a game becomes six games wearing one title.

| Reference | The one thing it gives us |
|---|---|
| **Monster Rancher** | The calendar is the game; the fight is the exam |
| **EA Franchise / Manager / Superstar** | Control is a scope, not a mode — the rest is simulated |
| **Hexen** | How a first-person world stays honest about size |
| **Wizordum** | The editor's grammar — a person who knows one tile editor knows ours |
| **Octopath / DQ remakes / Radiant Historia** | 2D sprites standing in a 3D world |
| **Ragnarok Online (vanilla)** | Craft it, then push it further — at a price |
| **FF7 + Path of Exile** | Sockets, links, and orbs that grow by being used |
| **Dynasty Warriors: Origins** | One against a thousand — and the world as a model you ride across |
| **Halo (Forge)** | Editing inside the play session — the editor is a lens on the world, not a second app |

---

## Monster Rancher — the calendar is the game

**What it gives us.** A finite life measured in weeks, and a schedule you can see
years out. Training is not a slider; it is a coin spent from a life, aimed at a
tournament you already have the date for. The post-week beat — every member's report
lined up, praise or scold, one each — is MR's, and so is the shape where you peak and
taper **one** champion rather than fielding the roster.

**Where it lives.** `src/guild/tournaments.js` (`STAKES`, `competitionHarm`) ·
`src/guild/events.js` (typed season, `WORLD_CUP_CADENCE = 192` weeks) ·
`src/guild/training.js` (`rollConduct` → `✨ exceeded / ✓ solid / 🤥 cheated / ✗ failed`)
· `src/guild/hall.js` (`advanceAll`, `fellInGlory` → Hall of Fame) ·
`src/guild/stations.js` (place the training gear on the grounds) ·
`src/guild/apprentices.js` (the farm system that backfills a death).

**What we refuse.**
- **Breeding and disc-generation.** The guild's pipeline is an *academy* — housed
  apprentices you supply and teach, drafted when ready. Prospects come from the
  world, not from a lab. (Cut list, `DESIGN.md`.)
- **Day granularity, weather, feeding minigames.** The tick is a **week**. Anything
  that needs a day is a system asking to be a different game. (**Amended 2026-08-24**:
  the day exists now — three watches inside the week, with the week still the one ledger
  every system resolves at; `DESIGN.md` § "The Three Watches". Weather and feeding stay
  refused.)
- **Praise as a free buff.** Praise reads *conduct*: praise a hidden slack and they
  file away that nobody checks (Discipline −5). MR's grammar, not a morale button.

---

## EA Sports Franchise / Manager / Superstar — control is a scope

**What it gives us.** The single most load-bearing structural idea in the project:
**one simulation always running, and a mode only decides which decisions the player
takes over.** Superstar = be one hero. Team = play the guild's battles. Manager =
today's sim. Nothing about the world changes between them; the AI simply stops
handing you the wheel.

**Where it lives.** `src/guild/battle-bridge.js` (the one adapter —
`playTournamentMatch` / `playQuestBout` / `playHuntBout`, each standing beside its
resolver fallback at its own call site; the long-promised `resolveEncounter` funnel is
still an extraction, not a fact) · `guild.battlePrefs` per event type ·
`window.playGuildBattle(config)` in `src/game/crucible.js` — both lenses return the
identical payload, so payout, reputation, fatigue and recap never learn whether a
fight was played or simulated.

**What we refuse.**
- **A mode-specific save or a second simulation.** A save has no mode in it; absent
  `control`, every existing save already *is* Manager.
- **Removing [▶ Simulate].** It is on every card, always, including the World Cup.
  The management altitude is the floor of the game, not a fallback for the impatient.
- **A camera in the list of rulesets.** Settled 2026-08-07 (`2db5063`): *a mode is a
  ruleset; first person is a camera.* The picker offers ⚔ Arena / ♟ Command /
  ▶ Simulate — you can stand inside a tactical fight and step back out mid-match, and
  the board keeps running either way.

**2026-08-24, the owner completes the thought:** the scopes merge into one ZOOM DIAL —
Superstar is the dial held low on one person, Manager is the dial at rest, and the new
day-of-three-watches is the rung that was missing between the week and the fight.
`DESIGN.md` § "The Zoom" and § "The Three Watches"; control becomes `focus`, not `mode`.

---

## Hexen — how a first-person world stays honest

The FP lens is Hexen's, and not decoratively: three separate bugs were fixed by
doing what Hexen did.

**What it gives us.**
- **Pitch is a SHEAR, not a rotation.** Rotating about the eye swings a standee's
  feet through the perspective divide — over a ±24° look sweep a fighter at melee
  range changed on-screen height by 1.6×, which is what the playtester felt as *"I
  feel taller than enemies when looking down."* Doom/Heretic/Hexen slide the horizon
  instead: depth is untouched, nothing resizes, billboards stay screen-parallel and
  can never be caught being paper. `src/game/action-fp.js:677`.
- **There are exactly two kinds of thing.** Architecture (walls, floors, ceilings —
  real geometry) and sprites (everything else, turned to face you every frame). The
  whole prop-volume model rests on that split. `src/guild/prop-volume.js:97`.
- **The dead stay where they fell.** Most of why a Hexen corridor reads as a place
  you have *been*. `src/guild/delve-fp.js:3736` (`CORPSE_CAP = 14`).
- **Keys, locks, and doors that mean something.** Shipped `a9effcf`. The switch is still
  owed — the wiring debt below.

**Its companion, which the owner's list left out but the code has:** the *swing* is
Hexen's, the *hit* is **Morrowind's** — you aim and time the blow yourself, and
whether it lands is a roll made from numbers the rest of the game already prints
(`↯` over the prey's recommended power — the same ratio `huntOdds` shows on the hunt
card). `src/guild/delve-fp.js:265`, `rollHit` at `:3561`. No second combat economy
was invented for the corridor.

**What we refuse.**
- **The hub crawl as the delve's spine.** A delve is a **push-your-luck depth
  question**: health recovers to a ceiling that drops with every bout, so the real
  decision is how deep to go — not a corridor you farm, and not a map you re-walk
  three times for a coloured key.
- **Weapon-piece hunting as progression.** Progression is the guild's — forge,
  refine, train, slot. A dungeon does not run its own parallel character build.
- **Projectiles, dash, soul-gauge, ward/DOT in the arena.** Cut deliberately; they
  smuggle area and collision subsystems into a hitscan engine.
- **ACS, the script layer.** Hexen's doors answer scripts; ours will answer DATA — a link
  is an authored edge every lens honours, never code (`DESIGN.md` § "The World Editor",
  step 4).

---

## Wizordum — the editor's grammar

**What it gives us.** Ergonomics, not content. The drafting table binds the number
row to modes, held letters to drag modifiers, **Shift as "the destructive version of
what this button already does"**, and **right-click as the eyedropper** — because
picking up what is already under the cursor is the thing you want twenty times a
minute, and spending a whole mouse button on "paint floor" is spending it on a tile
that is one click away. A person who has used one tile editor should not have to
learn a second grammar. `src/guild/map-editor.js:1151`, `:1311`.

It also stands as the working proof of the wider bet: the 90s first-person grammar,
drawn crisply, reads as a **current** game rather than a nostalgia exercise.

**What we refuse.** Its content and its scale — we are not building a shooter's
level flow. We took the keyboard.

---

## Octopath Traveler · Dragon Quest remakes · Radiant Historia — 2.5D

**What it gives us.** The house look, stated as a law rather than a style: **2D
sprites standing IN a world with real depth.** A perspective-tilted ground plane,
real vertical geometry hanging off every edge (plateau faces, cliff walls, chasm
below), and every character a counter-rotated paper standee that stays upright about
its own feet. The estate, the delve, the arena and the drafting table are all the
same camera recipe — `rotateX(52°)` under `perspective:1150px`, y-sorted.
`src/guild/delve-maps.js:7` · `src/guild/delve.js` · `src/guild/ranch.js` ·
`src/platform/gl-world.js` (the rasteriser that made it survive a phone).

**What we refuse.**
- **HD-2D's signature blur.** Depth-of-field and bloom are CSS filters on quads, and
  filters on quads are exactly what makes a mid-range Android drop the floor out of
  the scene. Our depth cue is the **veil fog** and honest geometry. (See
  `reference-css3d-mobile-budget`.)
- **3D character models.** Animated art stays a sprite — *a carving cannot stir.*
  Still art may be extruded to real volume from its own pixels
  (`src/platform/voxel-sprite.js`). Project law, earned three times.
- **Re-authoring a thing per lens.** ONE SIZE FACT: an object's size against the
  player is identical in every perspective; every lens derives, none re-authors.
  `node dev/check-volumes.mjs` fails the build on drift. (`CLAUDE.md`.)

**Open, and honestly marked so:** *Radiant Historia's* contribution is the one not
yet paid — its grid is a **positioning** puzzle (shove a foe into the tile where the
next blow catches three of them), and our tactical lens is currently a
simultaneous-order board without that geometry. Listed under debts below; do not
cite RH as shipped.

---

## Ragnarok Online (vanilla) — craft it, then push it further

**What it gives us.** The +N grammar, guild-sized. A forged piece carries a **`plus`
level (+0 → +10)** shown RO-style in its name (*+5 Steel Sword*). Every material has
a **safe limit** below which refines never fail — and the finer the material, the
*earlier* the risk starts: leather/iron +7, steel +6, mithril +5. Past it, a
per-material success table (~60% → ~19% at +10) plus the smith's Practice/10, and
**failure destroys the piece** — story, slotted materia and all. The protective tier
is RO's too, except the other trades make it: 🫙 **Tempering Oil** (alchemist; failure
knocks −1 instead of shattering) and ⭐ **Smith's Blessing** (enchanter; failure keeps
the level). `src/guild/smithing.js` (`MATERIAL_META`, `REFINE_ROWS`).

**Why it survives contact with a management sim:** each +1 adds flat power that
feeds `gearBonus` and `itemScore`, so the quartermaster values a +7 blade correctly
and the displayed tournament odds stay true. **Anti-lie:** the number shown is the
number the resolver checks.

**What we refuse.**
- **The click-until-broke sink.** Refining costs a smith's *week*, ore, and a fee.
  It competes with forging and questing for a person's time — that is the tax, not
  the gold.
- **A forging minigame.** The granularity dial is fixed: one level deeper than an
  RTS, one level **higher** than Potion Craft. The player manages the craftsperson;
  they do not swing the hammer.
- **Losing the story on a rework.** Reworks and refines stamp into
  `history.repairs[]` — a storied blade improves *without* being reset to anonymous.

---

## Final Fantasy VII + Path of Exile — sockets, links, growth

Two references, one system, and they divide cleanly.

**From FF7:** orbs slotted into gear sockets; **orbs level by being used** (1 xp per
surviving armour orb per round, `matXpNeeded`, max Lv5); and **adjacency combines** —
two orbs in linked sockets produce a named compound (Silver+Quicksilver → *Lunar
Flux*, +3 AC and +1 hit; six pairs total). `src/game/data/progression.js`
(`PLANETS`, `COMPOUNDS`) · `src/guild/enchanting.js` (`slotMateria`).

**From PoE:** **links are a property of the item you gamble to add.** Fusing the next
link is a roll with a rising cost (`(links+1)*8`), and an item's *rank name* is read
off its link count — 0 links Lead, 6 links Platinum. `src/game/crucible.js:1801`,
`:7631`. The seven planetary metals double as that ladder, so the naming, the
socketing and the alchemy all speak one vocabulary.

**And ours:** the orbs are **crafted by a member on a bench** — an Enchanter's week,
gated by Theory, costing ore. A materia is a product of the guild's economy, not a
drop.

**What we refuse.**
- **PoE's loot deluge and its trade economy.** Items here are *few, named, and made
  by a person* (pillar 2 — item persistence & history). A currency market would
  dissolve every one of those histories into a price.
- **Materia as the whole character.** In FF7 the orbs are the build. Here they sit
  **on top of** stats, refinement, curriculum and specialization — a fifth voice in
  the chorus, not the singer.

---

## Dynasty Warriors: Origins — one against a thousand, and the world as a model

Two mechanics from one reference, added 2026-08-22 with two screenshots on the screen.

**What it gives us (the field).** The spectacle of one fighter against a thousand, made
survivable not by weak enemies but by a crowd that *waits its turn*: a handful press, the
rest hold a ring and step in as a slot opens; captains fight for real; when the last captain
falls the company breaks. Faction colour as a UNIFORM over generated faces — never a tint.
The K.O. count as the one number on the glass. Shipped as slice 0 in Unity
(`Assets/Scripts/Arena/Battlefield.cs`, `SpatialGrid.cs`, the open field in
`ArenaWorld.cs`; `DESIGN.md` § "The Battlefield"). Every blow still goes through the one
`UseAttack` path and the one d20 resolver — a mode is a ruleset, and this one only says who is
on the field and how they behave.

**What it gives us (the road).** The world map as a *place*: a miniature landscape with
castles and towns standing on it as models and the hero riding across it at the model's
scale. Designed, not started (`DESIGN.md` § "The Overworld"); the parts are
`WorldGen.Height`, `DelveWorld`'s one-height-map rule and the unused world-scale sheets in
RPG Assets.

**What we refuse.**
- **A second combat engine for the crowd.** Conscripts and captains are spawn numbers and AI
  states; nothing about a hit is decided on the field. ONE RULES FACT.
- **Unit micro.** Orders go to *companies* through their captains (the Warcraft-3-light
  line); the player never selects a conscript.
- **Free-fight doors in guild mode.** The Battlefield is a TITLE exhibition until it is a
  calendar event (a Muster) with stakes — the 2026-08-21 decree holds.
- **The web lens.** The DOM compositor cannot carry a thousand bodies; this is the first
  feature the Unity build has that the web does not, recorded as a divergence.

---

## Halo (Forge) — the editor lives inside the game

Added 2026-08-23 with the owner's world-editor directive, alongside the two editor
references already on this shelf (Wizordum gave the grammar, Hexen gives the wiring bar).

**What it gives us.** ONE mechanic: **editing is a mode of being in the world, not a second
application.** In Forge you fly the level you were just playing, place a thing, and play it
that instant — the edit/play boundary is a button, not an export. Our seam is already half
built: Walk It hands a live draft to the real walker and back, and the Unity editor's
viewport IS the game's renderer (`MapEditorView3D` — `DelveWorld` to a RenderTexture, rays
picking cells and faces). Forge names the destination: the **build hand inside the walk** —
place, turn and erase from first person or over-the-shoulder, with the plan canvas kept as
the precision instrument. `DESIGN.md` § "The World Editor", roadmap step 6.

**What we refuse.**
- **Physics as content.** Forge's toys are rigid bodies; our world is a chart. Everything
  placed is a schema fact the validator can read, or it doesn't exist.
- **Budget as gameplay.** Forge makes the object budget a visible resource to spend; ours
  stays lint (the >96 bake-cost warning) — advice from the model, never a currency.
- **The scripting layer.** Modern Forge grew node scripting; same refusal as Hexen's ACS —
  a link is a data edge both lenses honour, not code.
- **Co-editing.** One author, one draft, one store.

---

## The seams a reference may never cross

Any new borrowing is checked against these before it is written down. All four have
already been paid for.

1. **One size fact, one collision fact, one rules fact.** A lens is a camera. If a
   view file can answer a rules question, that is a bug in the view file. (`CLAUDE.md`)
2. **Anti-lie.** A number shown to the player is the number the resolver uses —
   tournament odds, refine %, drill risk, a rival's ⚡.
3. **The altitude holds.** Between "one level deeper than an RTS" and "one level
   higher than Potion Craft." Every contest is a judged prep-check or a combat bout —
   or, since 2026-08-22, a DRILL PERFORMED WITH A VERB A LENS ALREADY HAS (push, vault,
   guard, strike, walk, hold; `DESIGN.md` § "Training drills"). Still no bespoke
   minigame engines: a drill that needs its own engine is a different game asking in.
4. **Simulate is never removed.**

## Open reference debts

| Debt | Owed to | Status |
|---|---|---|
| Grid **positioning** in the tactical lens (shove, zone, line) | Radiant Historia | Not started; needs the p1/p2 singleton broken first |
| Errantries — multi-week absence, focused gains, return-week boss | Monster Rancher | Designed as K6; `hero.awayUntil` not yet built |
| Festivals as a participable week | Monster Rancher | K6 |
| My Hero / Team control scopes | EA Superstar / Team | Manager ships; reshaped 2026-08-24 into the zoom dial (control as `focus` — row below); Phases 3–4 |
| Technique manuals (books that teach combat techniques) | — | Pairs with K6 |
| Command an army — orders to a company, a Muster on the calendar | Dynasty Warriors: Origins | Slice 0 shipped 2026-08-22 (one against a hundred · two armies, Unity); orders and the calendar event not started |
| The overworld as a model you ride across | Dynasty Warriors: Origins | Designed 2026-08-22; `WorldGen.Height` + `DelveWorld` are the parts |
| Performed training drills (boulder, wall, marks, poles, stone, ruck) | Monster Rancher | Designed 2026-08-22; the seam is a `performance` factor beside `equipMult` in both builds |
| The wiring — a switch here opens a door there (`links` every lens honours) | Hexen + Wizordum | Not started; `locks:[[x,y]]` is the whole interactive vocabulary today (`DESIGN.md` § "The World Editor", step 4) |
| Edit in the lens — the build hand inside a walked draft | Halo (Forge) | Not started; Walk It + the in-renderer viewport (`MapEditorView3D`) are the parts |
| The hundred of every hall — 32 seat specialties, rivals wearing their school, and the named hall + minted enemy army the Muster row above still lacks | — (owner directive 2026-08-23) | Designed 2026-08-23 as the layer on the DW:Origins Muster debt; seats carry no focus, roster or standing yet, and evasion has no shared mechanic to ride |
| The three watches — the day inside the week, the week-sum law | Monster Rancher (amended) + EA Superstar | Designed 2026-08-24; no sub-week time exists in either build, and the `WeekResolver.Advance` order-pinning test is owed before the clock |
| Masters and Commanders — staff posts generalized from the Head Trainer | — (owner directive 2026-08-24) | Designed 2026-08-24; `guild.trainer` is the only appointed head anywhere, web-frozen, and Unity has no roles system by its own admission |
| The zoom dial — control as `focus`, not `mode` | EA Manager / Superstar | Designed 2026-08-24; `control.js` still unextracted, `battlePrefs` has one key, and Unity's event seam has no played path yet |

## How a new reference joins this file

Name the game. Name the **one** mechanic — not the vibe. Name what comes with it
that we are refusing. Name the module that will hold it. If the refusal line is hard
to write, the reference isn't understood well enough to borrow from yet.

> **The port inherits this.** Unity is the destination and 1:1 with the HTML game is
> the directive — so every row above is a spec the Unity build is held to, not a
> nice-to-have that stops at the web edition.
