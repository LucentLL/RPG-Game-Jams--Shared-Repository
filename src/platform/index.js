// Platform abstraction barrel.
//
// storage and input today; the audio seam follows as the Steam (Tauri/Electron)
// and Android (Capacitor) targets come online. Keeping platform concerns behind
// this layer is what lets one Vite build ship to web, desktop, and mobile.
export * from './storage.js';
export * from './input.js';
export * from './ui-pad.js';
