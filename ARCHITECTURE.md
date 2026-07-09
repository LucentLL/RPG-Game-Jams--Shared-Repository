# The Crucible → Heroes Guild — Architecture

This document is the map for the project's transition from a **monolithic HTML
battler** into a **modular Vite game** that pivots toward a **Monster‑Rancher‑style
heroes‑guild manager**, targeting **web, Steam (desktop), and Android**.

It has two jobs:
1. Describe the structure **as it is now** (after the initial split).
2. Carry the **function‑level roadmap** for decomposing the remaining game logic,
   derived from a full analysis of the original 6,888‑line file.

---

## 1. What this repo is

The original game — `crucible_athanor_v13_01.html` — is a single 6,888‑line file:
one `<style>`, one `<script>` (276 functions), everything global, assets loaded
by relative path. It's a deep, working battler: procedural terrain, a modular
"Elements" character sprite compositor with palette swaps, an FF7‑style materia
system, gear/crafting, a full turn‑based combat engine with a timeline replayer,
plus a real‑time "action arena," a character builder, and a localStorage Pantheon.

**The pivot:** the player will run a **heroes' guild** — recruit heroes, plan their
diet, assign training, and dispatch them on **quests** submitted to the guild
board. Almost nothing is thrown away:

| Existing system | Role in the guild game |
|---|---|
| Battle engine (`combat`, `combat-ai`) | Quest / tournament **resolution layer** |
| Elements sprite compositor | **Hero appearance** |
| Gear + materia | **Hero equipment** |
| Stat roll / derive | **Hero stats & growth** |
| Pantheon (localStorage) | **Roster / hall of fame** |
| Action arena | Optional real‑time quest mode |

The new work is the **wrapper**: guild, recruiting, training, diet, quest board,
and a weekly calendar/time loop. That layer is scaffolded under `src/guild/`.

---

## 2. Current directory layout

```
.
├─ index.html                  # Vite entry: head + game markup (was lines 406–662)
├─ vite.config.js              # base:'./' for web + Steam + Android packaging
├─ package.json                # scripts: dev / build / preview
├─ crucible_athanor_v13_01.html# ORIGINAL, kept for reference until the split is done
│
├─ public/assets/              # served verbatim by Vite (referenced by URL, not import)
│  ├─ sprites/{core,ce1,ce2}/  # Elements packs (multi-base fall-through loader)
│  ├─ materia/                 # crystalorb_rm_1_*.png
│  ├─ fx/effects-pack-14/      # cast spell-flourish frames
│  ├─ audio/{music,sfx}/       # ← drop tracks/SFX here (see each README)
│  ├─ fonts/                   # ← self-hosted fonts go here before packaging
│  └─ data/                    # CSV part-defs etc. (reference / future data-driven gen)
│
├─ src/
│  ├─ main.js                  # entry: imports styles, game, guild, platform
│  ├─ config/assets.js         # ALL asset base paths (one place to re-point)
│  ├─ styles/                  # <style> block split by screen (main.css @imports the rest)
│  ├─ game/
│  │  └─ crucible.js           # transitional monolith (the old <script>, now an ES module)
│  ├─ guild/                   # NEW guild layer — data models + pure systems (scaffold)
│  │  ├─ guild.js hero.js recruiting.js training.js diet.js
│  │  ├─ quests.js calendar.js economy.js
│  │  └─ index.js              # barrel
│  └─ platform/                # storage/input/audio seams for web vs Steam vs Android
│     ├─ storage.js index.js
│
└─ (elements_*_pack / _tdsm folders)  # SOURCE asset packs — reference, not loaded at runtime
```

### How the split kept the game working
- The `<script>` moved verbatim to `src/game/crucible.js`. The **only** changes:
  asset paths now come from `src/config/assets.js`, and a **window bridge** at the
  end exposes the 64 functions used by inline `onclick=` handlers (ES modules are
  scoped, so the markup couldn't otherwise see them).
- The `<style>` split into `src/styles/*.css` along its section comments;
  `main.css` `@import`s them in the original order.
- Verified: production build passes (17 modules), the title + debug rooms render,
  sprites composite with live palette swaps, and there are **zero asset 404s**.

---

## 3. Asset pipeline

Runtime assets live in `public/assets/`. Vite copies `public/` into the build
untouched, and because the game builds URLs by string concatenation (not
`import`), **`src/config/assets.js` is the single source of truth** for paths:

```js
SPRITE_BASES   // sprites/core, sprites/ce1, sprites/ce2  (tried in order, 404-fallthrough)
MATERIA_BASE   // materia/
FX_BASE        // fx/            → cast frames at FX_BASE+'effects-pack-14/1/N.png'
AUDIO_MUSIC_BASE / AUDIO_SFX_BASE
```

**Adding audio:** drop files in `public/assets/audio/{music,sfx}/` and reference
`AUDIO_MUSIC_BASE + 'title.ogg'`. Prefer `.ogg` (web + Android friendly).

**Adding art:** new sprite parts go under an existing `sprites/*` pack (the loader
tries all bases). New standalone art → a new folder under `public/assets/` + a
base constant in `config/assets.js`.

---

## 4. The guild layer (`src/guild/`)

Scaffolded, not yet wired into gameplay. Each module is pure data‑model + logic
(JSDoc‑typed, side‑effect‑free) so the eventual UI can sit on top cleanly.

| Module | Owns |
|---|---|
| `hero.js` | `Hero` model — stats (STR/DEX/CON/INT/WIS/CHA, **matching the engine**), growth rates, condition (stamina/morale/loyalty/fatigue/injury), diet, assignment, loadout, traits |
| `recruiting.js` | Recruit generation & hire cost (rolls stats the same way the engine does) |
| `training.js` | Training regimens → weekly stat gains vs. stamina/fatigue |
| `diet.js` | Diet plans → stat‑growth bias + recovery (the Monster‑Rancher feeding loop) |
| `quests.js` | Quest board model + `resolveQuest()` (stubbed; **will call the battle engine**) |
| `calendar.js` | Weekly time loop |
| `economy.js` | Gold, wages, upkeep |
| `guild.js` | Top‑level `Guild` object tying it all together |

**Next steps for the pivot** (suggested order):
1. A guild‑hall screen + weekly loop that reads/writes a `Guild` via `platform/storage.js`.
2. `resolveQuest()` → dispatch a hero into the existing combat engine (auto‑resolve mode).
3. Generate hero **appearance** via the Elements `appearance` engine so recruits render.
4. Reconcile the old "run" progression with the new guild economy.

---

## 5. Engine decomposition roadmap

A full analysis of the original file (413 top‑level symbols) produced the target
below — **44 modules**, leaf‑first, so the game keeps running at every step.
Extract in this order; after each module, `npm run build` + smoke‑test before the next.

> **Progress — Phase A data layer + first engine/items leaves done & verified.**
> `crucible.js` is down to **~5.7k lines** (from 6.9k). Extracted and building green
> (**43 modules**):
> - **Phase A data layer:** `data/progression.js`, `data/gear.js`, `data/attacks.js`,
>   `data/config.js`, `data/orb-tables.js`, `data/sprite-tables.js`,
>   `data/arena-templates.js`, `items/blacksmithing.js`, `engine/rng.js`.
> - **`state.js` — done.** Shared mutable state lives on a single `export const S = {…}`
>   in [`src/game/state.js`](src/game/state.js); a transitional bridge mirrors each field
>   onto `window` (get/set accessors) so crucible.js's bare-name refs still resolve while
>   new modules `import { S }`. The bridge shrinks as crucible.js is split apart.
> - **Engine/items leaves (2026-07):** `engine/facing.js`, `engine/procedural-tiles.js`,
>   `engine/terrain.js` (+ BFS; its 4 arena vars moved onto `S`), `items/stat-gen.js`,
>   `items/gear-gen.js`, `engine/combat-ai.js`.
>
> Verified live each step: `npm run build` after every extraction, plus a runtime
> smoke-test (title→forge→stat→draft with zero console errors, and each extracted
> module dynamically imported and exercised in the running app).
>
> **The remaining split follows the reconciled staged plan in §5.1 below** — a full
> coupling analysis of every section of the *current* file. It supersedes the original
> leaf-first sketch: two of the biggest "state-first" migrations are already done (only
> `_guildBattle` + `_tacAuto` remain), and the order is re-risked against today's tree.

### Shared state comes first
Many globals (`run`, `p1`, `p2`, `gamePhase`, `turnNum`, `moveQueue`, loop flags,
snapshot maps, `_craftFn`) are reassigned across modules. **ES module imports are
read‑only live bindings**, so these can't be `export let` + mutated elsewhere.

→ `src/game/state.js` exports a single mutable object:
```js
export const S = { run: null, p1: null, p2: null, gamePhase: 'title', /* … */ };
```
Modules do `S.run = …` / read `S.p1`. This is the largest structural change.

### 5.1 Reconciled staged extraction plan (current file)

Produced by a full per-section coupling analysis of the **current** `crucible.js`
(reconciled against `state.js` + the already-extracted modules). Extract strictly
**one module per commit**, `npm run build` after each, and run an **interactive**
smoke-test at the 🔴 gates (build alone can't catch a broken image cache, a dropped
redraw registration, or an rAF double-schedule).

**Already on `S` (no migration needed):** `run, p1, p2, gamePhase, turnNum, moveQueue,
lastMoveType, selectedAttack, tiles, executing, statsOpen, arenaGrid, animLoopRunning,
actionLoopRunning, _pendingRunMode, _snapshot*Map, arenaElevation/Passable/TerrainCost/Name`.
**Only two globals still need migrating:** `_guildBattle` and `_tacAuto` (batch **M1** —
add to `S` **and delete the local `var`s**, or a surviving `var` shadows the bridge).

| # | Module | Risk | Note |
|---|---|---|---|
| ✅ | `engine/procedural-tiles.js`, `engine/terrain.js`, `items/stat-gen.js`, `items/gear-gen.js`, `engine/combat-ai.js` | — | **DONE this pass** |
| 1 | `engine/appearance.js` (`generateAppearance`, `elementsPickPart`) | low | root of the sprite chain — do before the loader |
| 2 | `engine/bob-loop.js` (idle-bob rAF) | low | zero imports; delete dead `unregisterBobRenderer` |
| 3 | `engine/weapon-layers.js` (`effectiveAppearance`, `fighterWeaponLayers`, gear→desc, `GUILD_ARCH_*`) | low | pure over gear-ladder data |
| 4 | `items/fighter-build.js` (`buildPlayer/OpponentFighter`, materia/attacks) | low | reads `S.run` + data consts |
| 5 | `engine/sprite-loader.js` (`getElementsPart`, `_elementsImgCache`, **redraw bus**, `getElementsWeapon`) | 🔴 high | **hazard hub** — cache + bus must be the single home |
| 6 | `engine/skin-tone.js` · 7 `engine/cast-fx.js` · 8 `engine/orb-sprites.js` · 9 `engine/compositor.js` | med | after the loader — **🔴 interactive smoke-test after the compositor** (sprites composite w/ weapons/hats/tones, bob animates, orbs + cast-FX render) |
| 10 | `screens/run-entry.js` · 11 `items/opponent-gen.js` · 12 `screens/character-builder.js` · 13 `screens/gear-cards.js` (`_gearIconObserver`) | med | 🟡 check builder preview + gear icons after 12/13 |
| 14 | `engine/sprite-render.js` + `engine/anim-loop.js` | 🔴 high | rAF ownership; preserve `window.renderGuildSprite` / `__ranchGfx` / `pruneDetachedSpriteRedraws` |
| — | **M1 state migration:** `_guildBattle` + `_tacAuto` → `S` | — | land alone; delete the local `var`s |
| 15 | `engine/materia.js` (`getMateriaBonus`, `getFighterAC`, `gainMateriaXP`) · 16 `screens/draft.js` · 17 `screens/stat-screen.js` | med–high | draft↔battle cycle → dispatch via `window.*`, never static-import |
| 18 | `screens/action-arena.js` · 19 `game/guild-battle.js` (action branch only) · 20 `screens/battle-grid.js` · 21 `engine/action-combat.js` · 22 `engine/combat.js` · 23 `engine/attack-resolve.js` · 24 `screens/endscreens.js` | 🔴 high | the turn engine — **🔴 interactive smoke-test after `combat.js` and after `endscreens.js`**: full turn match, action match, and a guild battle returning its exact `{winner,…}` payload |
| 25 | `screens/lab.js` · 26 `screens/merchant.js` · 27 `screens/crafting.js` (`window._craftFn`) · 28 `screens/loot.js` | med | 🟡 loot→lab→equip/sell→buy→refine/socket/fuse |
| 29 | `screens/pantheon.js` · 30 `screens/title.js` · 31 `game/main.js` (shrink the `Object.assign(window,…)` bridge) | high | **last** — 🔴 full loop smoke-test |
| — | `ui/log.js` (`logMsg`/`renderAll`), `screens/materia-detail.js` (`showMatDetail`) | — | deferred separate pass (huge fan-in) |
| — | `SPRITE_SHEET_MAP`, `spriteImages`, `loadSpriteSheets`, `lastAnimTick`, `unregisterBobRenderer` | — | **dead code — delete, don't carry** |

**⚠ Do not parallelize.** Every step edits the same three regions of `crucible.js` (the
import block, the export list, the single `Object.assign(window,…)` bridge at the bottom)
and the circular edges (draft↔battle, lab↔craft, combat↔battle-grid) only stay safe because
they resolve at call-time through the window bridge. Two concurrent extractions guarantee
merge conflicts and silent bridge breakage. Run strictly sequentially, one module per commit.

### Known refactor hazards (from the analysis)
1. **Live‑binding trap** — mutable globals must move into the `S` state object (above), not `export let`.
2. **Circular deps among screens** — `combat ↔ vs-battle ↔ title`, `draft ↔ vs-battle/action-arena`, `lab ↔ crafting`. Break by making `title.js` the flow hub (owns `showScreen` + game‑over/victory), and use **dynamic `import()`** for confirm→next‑screen transitions.
3. **One redraw bus** — `elementsRegisterRedraw`/`_elementsFireRedraws` and the `_elements*/_orb*/_toned*` caches are process‑global singletons. Keep them in exactly one module imported everywhere; duplication fragments the cache and breaks async redraw‑on‑load.
4. **rAF loop ownership** — three loops (battle grid `animLoopRunning`, action arena `actionLoopRunning`, static‑preview bob). Each must have exactly one start/stop owner and its flag in `state.js`, or you get double‑scheduling.
5. **`window._craftFn`** — a cross‑module callback channel between the crafting mutations and the craft‑overlay UI. Keep it a single shared slot (state.js or window), not duplicated.
6. **`_gearIconObserver`** — a load‑time `MutationObserver` with side effects; instantiate exactly once, after `document` exists, before gear/orb HTML is injected.
7. **`materia-combat.js` must stay engine‑neutral** — it's used by turn combat, the action arena, and the lab preview. Pass a logger rather than hard‑importing `battle-log`.
8. **Inline‑handler bridge** — every function named in the `window` bridge must stay exported; migrating screens to `addEventListener` is the clean long‑term fix (out of scope for a mechanical split).

---

## 6. Platform & packaging (Steam + Android)

`vite.config.js` sets **`base: './'`** so one build runs from a web server, a
desktop shell, or a mobile WebView (all load `index.html` from a non‑root origin).

- **Steam (desktop):** wrap `dist/` with **Tauri** (small, Rust) or **Electron**.
  Add under `src-tauri/` or `electron/` — both are `.gitignore`d already.
- **Android (Play Store):** wrap with **Capacitor** (`npx cap add android`).
  The `android/` build dirs are `.gitignore`d.
- **`src/platform/`** is the seam: `storage.js` wraps `localStorage` today and can
  swap to Capacitor Preferences / Tauri fs without touching game code. Input and
  audio seams follow.
- **Offline TODO:** self‑host the Google Fonts (Cinzel, Cormorant Garamond) into
  `public/assets/fonts/` before shipping — app‑store builds shouldn't need network.
  The viewport is already locked (no pinch‑zoom) for mobile.

---

## 7. Dev workflow

```bash
npm install       # once
npm run dev       # Vite dev server on http://localhost:8080  (matches .vscode debug config)
npm run build     # production build → dist/
npm run preview   # serve the built dist/ on :8080
```

Git baseline commit `44a4bf3` is the pre‑restructure monolith + raw asset packs —
a clean point to diff against or revert to.
