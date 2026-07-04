// The Crucible — Vite entry point.
//
// Load order:
//   1. styles (bundled from src/styles/main.css),
//   2. the game module (renders into index.html's markup and installs the
//      inline-handler bridge on window). It self-starts after the DOM is parsed,
//      which is guaranteed here because module scripts are deferred by default.
import './styles/main.css';
import './game/crucible.js';

// --- Guild layer (scaffold) -------------------------------------------------
// The Monster-Rancher-style guild systems are being built alongside the engine.
// Imported so the build validates them; not yet wired into gameplay.
// See src/guild/ and ARCHITECTURE.md for the pivot plan.
import * as guild from './guild/index.js';
import * as platform from './platform/index.js';

// Expose the new layers on a namespaced global so they're reachable from the
// devtools console while the guild UI is being built. Harmless, easy to remove.
window.CRUCIBLE = { guild, platform };
