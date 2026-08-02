# Handoff — mobile rendering, and the input work around it

Written 2026-08-02 at the end of a long session, for whoever picks this up next
(probably a fresh chat). Branch `feat/the-delve`, merged to `main`, deployed to
the playtest link after every change below.

**Playtest:** https://lucentll.github.io/RPG-Game-Jams--Shared-Repository/
(a `main` push does NOT update it — see `reference-playtest-deploy` in memory)

---

## 1. THE OPEN PROBLEM — read this first

**On a phone, large parts of the world do not draw, and flicker in and out as
the camera moves.** Not geometry, not transparency: the compositor is being
asked for more than the device will give, and past that point it silently stops
allocating surfaces. Whatever it could not allocate is simply absent, and it
picks differently every frame.

It affects **all three 3D lenses**, not one:

| lens | file | screen |
|---|---|---|
| action arena (real-time) | `src/game/action-fp.js` | `#actionScreen` |
| tactical board (turn-based) | `src/game/tactical-fp.js` | `#battleScreen` |
| delve crawler (walking) | `src/guild/delve-fp.js` | `#delveFpScreen` |

Desktop is fine everywhere. The player can run Hexen on the same phone, which is
a completely fair comparison and worth taking seriously — see §4.

### What I tried, in order, and what is actually known

1. **Removed CSS `filter` from every quad.** A filtered element cannot be tiled
   by the compositor; it must go into ONE render surface, and past
   `GL_MAX_TEXTURE_SIZE` that surface silently fails. The dims are baked into
   the textures now (`bake()` in tactical-fp.js). **This one is well-founded** —
   `delve.css` already documented the same finding for the delve.
2. **Segmented long slabs** (`strip()`, `field()`), 18,900 → 2,700 CSS px.
3. **Guarded the per-frame transform write** in `aimCamera` — it rewrote the
   world transform on every rAF with raw `Math.sin` in the string. Verified:
   zero rewrites while the camera is parked. **This one is real.**
4. **K-scale**: `T` 900 → 300 in both battle lenses, with `scale3d(3)` outermost
   in the camera. Layout area 359 → 39.7 Mpx².
5. Capped the crawler's open-air view radius (11 → 8 coarse, 17 → 13 desktop).

**After all of that, the player sent an arena screenshot with the same wholesale
surface loss.** So it is NOT fixed, and steps 4–5 may have bought nothing.

### The assumption that probably broke it

I measured **layout area in CSS pixels** and treated it as a proxy for GPU
memory. That proxy evidently does not predict the failure.

The specific suspicion, which I was warned about and did not test:
**Chrome likely picks raster scale from the element's EFFECTIVE on-screen
transform.** If so, shrinking each quad to 900px and then applying
`scale3d(3)` on the ancestor rasters it at 2700px again — the K-scale is a
no-op for memory while being mathematically elegant. Same texture, same budget,
same drop.

**Do not build on top of the K-scale until this is tested.** It may need
reverting.

### The diagnostic to run FIRST

On the player's actual phone, over USB:

```
chrome://inspect  →  remote-debug the device  →  DevTools → More tools → Layers
```

That panel reports **real memory per layer and the actual raster scale**. It
answers in five minutes what a session of proxy measurements did not:
- Did K help, do nothing, or make it worse?
- Is the binding constraint layer COUNT or layer MEMORY?
- Which specific layers are being dropped?

Useful in-page census (paste in the console on the phone):

```js
[...document.querySelectorAll('.tfp-q, .fp-q')]
  .map(q => [q.className, q.offsetWidth, q.offsetHeight,
             Math.round(Math.max(q.offsetWidth, q.offsetHeight) * devicePixelRatio)])
  .sort((a, b) => b[3] - a[3]).slice(0, 10);
```

### Measured, on desktop, current code

| lens | live quads | biggest quad | layout area |
|---|---|---|---|
| tactical | 99 | 900 CSS px | 39.7 Mpx² |
| action arena | 80 | 900 CSS px | 37.6 Mpx² |
| delve crawler (campus) | **629** | 420 CSS px | 62.5 Mpx² |

The crawler is a different shape of problem: tiny quads, huge COUNT. Open ground
emits one floor quad per cell, so an outdoor map at radius 11 is ~500 layers
before a single wall. Underground is fine because rock emits nothing.

---

## 2. THE STRUCTURAL QUESTION

Hexen draws into one 320×200 byte framebuffer — 64 KB, one pass, a column loop.
This renderer is the **DOM compositor**: every quad is an element in a
`preserve-3d` subtree with a 3D transform, so each gets its own GPU render
surface, rastered at CSS size × DPR *regardless of how much screen it covers*,
then depth-sorted and composited every frame.

Everything above chips at the symptoms of that. The honest structural answer is
**one `<canvas>` and a real rasteriser** — no layers, no texture budget, no
compositor deciding what to drop, cost proportional to *screen* pixels.

The player's stated goal makes this more attractive, not less: they want one
world shown as **top-down, isometric, first-person and over-the-shoulder with
the same accurate information**. On a canvas those become four projection
functions over one tile model. In the DOM they are four renderers that each
reinvent the world and drift apart (which has already happened twice — see §3).

**My recommendation: do the Layers-panel diagnostic, then seriously scope the
canvas rewrite rather than a sixth optimisation pass.**

---

## 3. THE DATA-MODEL LESSON (already half-applied)

Both "objects look wrong" bugs had the same root: **the data described a
picture, not a volume**, so each lens invented the rest and they disagreed.

Props were `{kind, x, y}` — a label and a point. Fixed in
`src/game/arena-terrain.js`: they now carry `h` (height in TILES, so each lens
scales by its own unit), `flat`, and `face` (which shelf a flat prop is bolted
to, computed once at bake). The arena renders that honestly now:

- **Round things get a CROSS** — two quads at right angles through the centre.
  Ground contact on both axes, depth from every bearing, no per-frame rotation.
  This is the trick every Doom descendant used for trees.
- **Flat things take their shelf's rotation** from the map and never turn to
  face the camera.
- **Both stand on `liftAt()`** — the placement transform used to hard-code `0px`
  on Y, so anything on a shelf sank a step into the world.

### NOT DONE — the next clean piece of work

`src/guild/delve-fp.js` has its **own decor system** which never got this. Desks
and furniture there are still flat full-height billboards — a desk renders as a
wall-sized panel instead of a waist-high box. The player asked for exactly the
right thing:

> "project the objects onto volumetric cube tiles" — the same transformation as
> shifting a top-down map to isometric.

Concretely: give delve decor a footprint + height in tiles, and emit a box (or
cross) sitting on its cell, mirroring what `buildDressing` in `action-fp.js`
now does. A desk should be ~0.5 tiles tall with real sides.

---

## 4. WHAT DID GET FIXED THIS SESSION (all deployed, all verified)

Input — `src/platform/input.js` (new) and `src/platform/ui-pad.js` (new):
- **Right-drag to look**, FFXI/FFXIV style. Was a pointer lock, which took the
  cursor and made attacks 2–6 unreachable. Cursor is never taken now.
- **Controller cross hotbar** — hold LT/RT, face cluster is 1–4, d-pad is 5–8,
  with live attack names on screen. D-pad stops walking while held.
- **Menu cursor** (`ui-pad.js`) — pad and arrow keys navigate every screen
  spatially. Lenses claim the pad with one predicate each via `claimPad()`.
- Virtual thumb-stick gated on `(pointer: coarse)`, not touch capability.

Rules and view:
- **Draft gate**: required all five slots including both hands, so a two-handed
  bow was unenterable. Now Head/Body/Lower; hands are free.
- **Ledges**: `canStandAt` refused any level change without a ladder in EITHER
  direction, so the first shelf you climbed was one you could never leave. Up
  needs a climb; down is free.
- **Victory beat** — the loop holds 1.4s on the killing blow, then a card over
  the held scene instead of jumping to loot.
- **Wands and staves** now show in first person (the art existed; the type table
  never listed it). **Dual wield** shows both weapons.
- **Viewmodel** hangs 46% off the bottom / 24% off the side, no invented tilt,
  sized off the smaller viewport axis (portrait had it filling the room).
- **FF-style command list** for `#battleScreen` below 620px height / 560px width
  — Move / Attack / View / Etc / Execute. Verified zero overlaps at 900×420.

---

## 5. GOTCHAS WORTH KNOWING

- `showScreen` only flips a class — **no DOM mutation fires**, so anything
  watching for screen changes via MutationObserver will miss them.
- Overlay detection must NOT use `offsetParent !== null` (null for every
  `position: fixed` element) nor `opacity !== '0'` (the globe fades in).
- `readPad()` memoises ~4ms because `hit()` is an edge; two reads in one frame
  would eat the press.
- Never `padReset()` to reclaim the pad — it makes held buttons read as fresh
  presses. Mask them instead.
- The browser pane used for testing **runs no rAF**, hence the dev probes:
  `__arenaStep(n)`, `__actFpLook(yaw,pitch)`, `__fpLook(rad,steps)`,
  `__padUi.step()`, `__padReport()`, alongside `__fpStep` / `__delveStep`.
- `K` is only a similarity if EVERY world-px value carries it — including the
  ones in CSS. The tile is published as `--tfp-t`; apron repeat, overhead HP bar
  and standee shadow are `calc()`ed from it.

---

## 6. HOW TO DEPLOY

`main` does not update the playtest link. The only recipe that works:

```bash
npm run build
git worktree add /tmp/ghp gh-pages
cd /tmp/ghp && git rm -rq . && cp -r <repo>/dist/. .
git checkout origin/gh-pages -- .nojekyll     # required, do not lose this
git add -A && git commit -m "deploy: ..." && git push origin gh-pages
cd <repo> && git worktree remove /tmp/ghp --force
```

Then confirm it actually shipped — Pages takes 30–60s:

```bash
gh api repos/LucentLL/RPG-Game-Jams--Shared-Repository/pages/builds/latest --jq .status
curl -s https://lucentll.github.io/RPG-Game-Jams--Shared-Repository/ | grep -o 'index-[A-Za-z0-9_-]*\.js'
```

Compare that hash against `dist/assets/` and diff the shasums. A stale deploy
already cost this project one full round of "it isn't fixed" — it wasn't; the
player was on an old bundle.

---

## 7. IF YOU READ NOTHING ELSE

1. The mobile rendering problem is **not fixed**. Do not claim it is.
2. **Measure on the device with the Layers panel** before changing more code.
   Layout-px is not GPU memory and this session proved it the hard way.
3. The K-scale may be a no-op. Test before building on it.
4. Trust the player's screenshots over any model of the renderer. Twice this
   session a confident diagnosis was wrong and the screenshot was right.
