# The Crucible — Heroes Guild

A pixel‑art RPG built with vanilla JS + Canvas, bundled by **Vite**. Formerly a
single‑file battler ("The Crucible — Athanor Mode"); now being restructured into
a modular project and pivoted toward a **Monster‑Rancher‑style heroes‑guild
manager** — recruit heroes, plan their diet, assign training, and send them on
quests. Targeting **web, Steam, and Android**.

## Run it

```bash
npm install
npm run dev        # http://localhost:8080
```

- `npm run build` → production build in `dist/`
- `npm run preview` → serve the built `dist/`

## Where things live

| Path | What |
|---|---|
| `index.html` | Entry markup + Vite module script |
| `src/main.js` | Entry point (styles → game → guild/platform) |
| `src/game/crucible.js` | The battle engine & screens (transitional monolith, being split) |
| `src/config/assets.js` | All asset paths — change layout here |
| `src/styles/` | Stylesheet, split by screen |
| `src/guild/` | New guild layer: heroes, recruiting, training, diet, quests, calendar |
| `src/platform/` | Save/input seams for web vs Steam vs Android |
| `public/assets/` | Sprites, materia, FX, **audio (music/sfx)**, fonts, data |

## Read next

**[ARCHITECTURE.md](ARCHITECTURE.md)** — the full picture: what each system does,
the guild pivot plan, and the function‑level roadmap for finishing the split.

The original single file is preserved as `crucible_athanor_v13_01.html` for
reference until the decomposition is complete.
