// The Crucible — Vite entry point.
//
// Load order:
//   1. styles (bundled from src/styles/main.css),
//   2. the game module (renders into index.html's markup and installs the
//      inline-handler bridge on window). It self-starts after the DOM is parsed,
//      which is guaranteed here because module scripts are deferred by default.
import './styles/main.css';
import './game/crucible.js';

// --- Guild layer ------------------------------------------------------------
// The Monster-Rancher-style heroes-guild game, built alongside the battle engine.
import * as guild from './guild/index.js';
import * as platform from './platform/index.js';
import './guild/hall.js'; // Guild Hall screen — registers window.openGuild

// --- Input ------------------------------------------------------------------
// The menu cursor: a controller (or the arrow keys) can reach every screen in
// the game, not just the combat lenses. Last, so every screen it navigates has
// already registered itself. @see platform/ui-pad.js
platform.startUiPad();

// Expose the layers on a namespaced global for the devtools console.
window.CRUCIBLE = { guild, platform };
