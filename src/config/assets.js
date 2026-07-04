// Central asset paths.
//
// Vite copies everything under /public verbatim into the build, so runtime
// assets live at <BASE_URL>assets/... . Because vite.config.js sets
// `base: './'`, BASE_URL is './' and every path below stays relative — the
// same build then works from a web server, an Electron/Tauri shell (Steam),
// and a Capacitor WebView (Android), none of which serve from a domain root.
//
// The game constructs image URLs by string concatenation (not `import`), so
// keeping the bases here means a future path/layout change is a one-file edit.
const ASSET_BASE = import.meta.env.BASE_URL + 'assets/';

// Modular "Elements" character sprite packs. The loader tries these in order
// and falls through to the next on a 404, so core / CE1 / CE2 can each keep
// their own folder without copying files between them.
export const SPRITE_BASES = [
  ASSET_BASE + 'sprites/core/',
  ASSET_BASE + 'sprites/ce1/',
  ASSET_BASE + 'sprites/ce2/',
];

// Materia orb spritesheets (crystalorb_rm_1_<color>.png).
export const MATERIA_BASE = ASSET_BASE + 'materia/';

// Visual FX packs. Cast flourish frames live at FX_BASE + 'effects-pack-14/1/'.
export const FX_BASE = ASSET_BASE + 'fx/';

// Audio (populated as music/sfx are added).
export const AUDIO_MUSIC_BASE = ASSET_BASE + 'audio/music/';
export const AUDIO_SFX_BASE = ASSET_BASE + 'audio/sfx/';
