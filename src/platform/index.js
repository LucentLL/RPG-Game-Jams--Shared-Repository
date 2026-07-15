// Platform abstraction barrel.
//
// storage today; input and audio seams follow as the Steam (Tauri/Electron) and
// Android (Capacitor) targets come online. Keeping platform concerns behind this
// layer is what lets one Vite build ship to web, desktop, and mobile.
export * from './storage.js';
