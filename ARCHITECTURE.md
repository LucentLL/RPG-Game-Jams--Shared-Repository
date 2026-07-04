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

> **Progress — Phase A (partial), done & verified:**
> `data/progression.js`, `data/gear.js`, `data/attacks.js`, `data/arena-templates.js`,
> `items/blacksmithing.js`, `engine/rng.js` are extracted out of `crucible.js`
> (now ~5.9k lines, down from 6.3k). Build passes; title→stat→draft drive is clean.
> **Next:** `data/config.js` (scattered scalars), `data/sprite-tables.js`,
> `data/orb-tables.js`, then `state.js` and the engine subsystems.

### Shared state comes first
Many globals (`run`, `p1`, `p2`, `gamePhase`, `turnNum`, `moveQueue`, loop flags,
snapshot maps, `_craftFn`) are reassigned across modules. **ES module imports are
read‑only live bindings**, so these can't be `export let` + mutated elsewhere.

→ `src/game/state.js` exports a single mutable object:
```js
export const S = { run: null, p1: null, p2: null, gamePhase: 'title', /* … */ };
```
Modules do `S.run = …` / read `S.p1`. This is the largest structural change.

### Extraction order (leaf → entangled)

**Phase A — pure data & leaves** (no game‑state deps):
`state.js` · `data/config.js` · `data/progression.js` · `data/gear.js` ·
`data/attacks.js` · `data/sprite-tables.js` · `data/orb-tables.js` ·
`data/arena-templates.js` · `engine/rng.js` · `items/blacksmithing.js` ·
`items/stat-gen.js` · `engine/procedural-tiles.js`

**Phase B — engine subsystems:**
`engine/sprite-loader.js` (the shared image cache + redraw bus) · `engine/battle-log.js` ·
`items/gear-gen.js` · `engine/arena.js` · `engine/facing.js` · `engine/skin-tone.js` ·
`engine/appearance.js` · `engine/cast-fx.js` · `engine/compositor.js` · `engine/orb-render.js`

**Phase C — combat & assembly:**
`items/fighter-build.js` · `items/opponent-gen.js` · `engine/animation.js` ·
`items/materia-combat.js` · `engine/sprite-render.js` · `screens/gear-cards.js` ·
`screens/materia-ui.js` · `engine/combat-ai.js` · `items/crafting.js` · `engine/combat.js`

**Phase D — screen controllers (most entangled, last):**
`screens/crafting.js` · `screens/loot.js` · `screens/run-entry.js` ·
`screens/character-builder.js` · `screens/stat-screen.js` · `screens/lab.js` ·
`screens/title.js` · `screens/debug-room.js` · `screens/action-arena.js` ·
`screens/draft.js` · `screens/vs-battle.js` · then a thin `game/main.js` (init + bridge)

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
