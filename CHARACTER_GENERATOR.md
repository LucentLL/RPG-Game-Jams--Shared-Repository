# Character Generator — Collaborator Guide

How to generate and draw the game's characters. The system has **two halves**:

1. **Procedural generator** — turns a numeric *seed* + a *prime* (body archetype) into a
   deterministic **appearance** (which hair, top, hat, skin tone, …).
2. **Layered compositor** — draws that appearance (plus optional gear) onto a `<canvas>`
   as a stacked pixel-art sprite, for any facing / animation / frame.

Characters are built from the **Time Fantasy "Elements" generator** part sheets that ship in
this repo under `public/assets/sprites/` (see [Assets](#assets)). Nothing external is needed.

---

## Quick start — `window.CharGen`

`crucible.js` runs as a side-effect module (no ES exports), so the stable programmatic
entry point is the global **`window.CharGen`**, available once the app has loaded.

```js
// 1) Draw a RANDOM character into a canvas, front-facing, idle.
const cv = document.querySelector('#myCanvas');   // any <canvas>, e.g. 64×64
const look = CharGen.render(cv, { seed: Date.now() & 0xffffffff, prime: 'salt' });
// `look` is the appearance object — save it (or its seed+prime) to reproduce this character.

// 2) Draw a SPECIFIC character: same (seed, prime) always looks identical.
CharGen.render(cv, { seed: 12345, prime: 'mercury' });

// 3) Pose it: an animation + frame + facing, with a cosmetic weapon.
CharGen.render(cv, {
  seed: 12345, prime: 'mercury',
  anim: 'nockBow', frame: 1,        // bow-draw pose
  face: CharGen.FACES.east,         // 0 south / 1 west / 2 east / 3 north
  gear: { RHand: { type: 'Bow' } }, // cosmetic; also Sword/Axe/Hammer/Dagger/Wand/Club/Buckler/Crossbow
});

// 4) Redraw an EXACT saved look later (skip the seed→look step):
const saved = CharGen.generate(777, 'sulfur');   // -> appearance object
CharGen.render(cv, { appearance: saved, anim: 'idle' });
```

### `CharGen` reference

| Member | What it is |
|---|---|
| `CharGen.BODY_TYPES` | `['sulfur','salt','mercury']` — the **prime** (body archetype). |
| `CharGen.ANIMS` | Animation names: `idle, move, slash, hurt, death, prone, parry, cast, hold, jump, nockBow, climb`. |
| `CharGen.FACES` | `{ south:0, west:1, east:2, north:3 }` — the `face` value. |
| `CharGen.generate(seed, prime?)` | → **appearance object**. Deterministic. `prime` defaults to random. |
| `CharGen.render(canvas, opts)` | Draws to `canvas`; returns the appearance used. Options below. |

**`render(canvas, opts)` options** — all optional except the canvas:

| Option | Type | Default | Notes |
|---|---|---|---|
| `seed` | number | `1` | With `prime`, (re)generates the look. Ignored if `appearance` is given. |
| `prime` | string | `'salt'` | One of `BODY_TYPES`. |
| `appearance` | object | — | A prior `generate()` result — draws an exact saved look. |
| `anim` | string | `'idle'` | Any `CharGen.ANIMS` name. |
| `frame` | number | `0` | Animation column index (0-based). |
| `face` | number | `0` | `CharGen.FACES` value (0 = south/front). |
| `gear` | object | — | Cosmetic `{ RHand, LHand, Body, Head, Lower }`, each `{ type: '<GearType>' }`. |

The canvas fills in a beat after the call because the part PNGs load asynchronously —
`render` registers a redraw so it repaints itself once they're ready. Use a canvas
around **48–96 px**; source frames are 48×48 drawn at 1× (scale the canvas up with
`image-rendering: pixelated` for crisp zoom).

---

## The appearance data model

`CharGen.generate(seed, prime)` returns:

```js
{
  seed: 12345,
  prime: 'mercury',
  // Each layer is either null (absent) or { name, c } where c is a color-variant index:
  backextra: { name: 'tail1', c: 3 },
  bottom:    { name: 'bottom8', c: 2 },   // never null (clothed)
  top:       { name: 'top14', c: 5 },     // never null
  head:      { name: 'head9', c: 1 },     // never null (the face)
  hair:      { name: 'hair25', c: 6 },    // may be null (bald)
  backhair:  { name: 'backhair8', c: 6 }, // may be null; color-matched to hair when present
  hat:       { name: 'hat5', c: 2 },      // may be null
  frontextra:{ name: 'frontextra2', c: 1 },// may be null
  skinTone:  3,                            // index into ELEMENTS_SKIN_TONES (0 = default)
}
```

**Determinism:** identical `(seed, prime)` → byte-identical appearance. So the cheapest way
to share or persist a character is just those two values. The engine stores exactly this on
every fighter/hero as `appearanceSeed` + `prime` (and caches the resolved `appearance`).

---

## Where the code lives

**Data — `src/game/data/sprite-tables.js`** (has real ES exports; import it directly):
- `BODY_TYPES` — the three primes.
- `ELEMENTS_MANIFEST` — the part catalog: per layer, the list of `{ name, maxC }` parts
  (`maxC` = how many color variants that part has). Add art here to expand the generator.
- `ELEMENTS_ANIMS` — animation table: each is `{ cols:[…], speed, loop }` where `cols` are
  the sprite-sheet columns to step through (e.g. `nockBow: { cols:[15,16,17,18] }`).
- `PRIME_PALETTE_BIAS` — per-prime color leanings.
- `ELEMENTS_SKIN_TONES` / `ELEMENTS_SKIN_SOURCE` — the skin palette-swap table.

**Generator + compositor — `src/game/crucible.js`** (module-private; reach them via `CharGen`):
- `generateAppearance(seed, prime)` — the core procedural roll ([crucible.js](src/game/crucible.js) ~line 583).
- `elementsPickPart(rng, layer, prime)` — picks one part+color for a layer (~561).
- `compositeCharacter(canvas, appearance, animName, frame, facingRow, weapons, bobOpts)` — the layered draw (~1094).
- `renderSpriteStatic(canvas, prime, angle, animName, frame, fighter)` — engine-side helper that
  derives appearance from a fighter/hero and draws it (~1554). Used for all in-game portraits.
- `effectiveAppearance(appearance, gear)` — overlays equipped gear onto the base look (~1313).
- `fighterWeaponLayers(fighter)` — builds the weapon sprite layers from gear (~1367).
- `elementsRng(seed)` — the seeded PRNG, in `src/game/engine/rng.js`.

**Public API glue — `src/game/crucible.js`**: the `window.CharGen` block at the bottom of the file.

---

## In-app tools (no code needed)

Both are wired to the on-screen buttons and also callable from the console:

- **Character builder** — `openBuilder()`. The player-facing creator: spinners for body,
  skin, each part, colors, handedness, plus a live preview and a **Randomize** button
  (`randomizeBuilder()`). `confirmBuilder()` starts a run with the built character.
  State lives in `builderState = { seed, bodyType, appearance, face, dominantHand, cosmeticGear }`.
- **Debug inspector** — `openDebug()`. A pin-static character/frame inspector: cycle any
  animation + frame + part to preview sprites. Great for checking new art frame-by-frame.

---

## Gear types (for the `gear` option)

Weapons: `Sword, Dagger, Club, Wand, Bow, Axe, Hammer, Crossbow`. Off-hand: `Buckler`.
Armor slots: `Body` (`Plate/Mail/Robes/Cloak/Vest`), `Head` (`Helm/Crown/Cap/Hood`),
`Lower` (`Trousers/Leggings/Skirt`). Full list + slots in `src/game/data/gear.js`.
`Bow` and `Crossbow` are **two-handed** (`TWO_HANDED_GEAR_TYPES`) — they fill both hands.

---

## Assets

Everything the generator draws is committed to the repo:

- `public/assets/sprites/` — the runtime part sheets the compositor loads (body layers,
  weapons, `projectile/` arrows & thrown blades, etc.). Served at `/assets/sprites/…`.
- `rpg-assets/` — the fuller source art collection + crop pipeline notes (see its README).

Pull the branch and the sprites come with it — no separate asset download.

---

## One-file example (drop into any page served by the dev server)

```html
<canvas id="hero" width="96" height="96" style="image-rendering:pixelated;width:192px;height:192px"></canvas>
<script type="module">
  // window.CharGen is set by the app bundle (src/main.js imports crucible.js).
  const wait = () => new Promise(r => (window.CharGen ? r() : setTimeout(() => wait().then(r), 50)));
  await wait();
  const cv = document.getElementById('hero');
  CharGen.render(cv, { seed: 20260713, prime: 'salt', anim: 'idle', face: CharGen.FACES.south });
</script>
```
