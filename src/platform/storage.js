/**
 * @file Save-data abstraction. Today it wraps localStorage; behind this seam we
 * can swap in Capacitor Preferences (Android) or Tauri/Electron fs (Steam)
 * without touching game code. The engine's Pantheon currently calls localStorage
 * directly — migrate it through here during the decomposition.
 */

const NS = 'crucible.';

/** @param {string} slot @param {*} data @returns {boolean} */
export function saveGame(slot, data) {
  try { localStorage.setItem(NS + slot, JSON.stringify(data)); return true; }
  catch (e) { console.warn('[storage] save failed', e); return false; }
}

/** @param {string} slot @returns {*} */
export function loadGame(slot) {
  try { const raw = localStorage.getItem(NS + slot); return raw ? JSON.parse(raw) : null; }
  catch (e) { console.warn('[storage] load failed', e); return null; }
}

/** @param {string} slot @returns {boolean} */
export function hasSave(slot) { return localStorage.getItem(NS + slot) != null; }

/** @param {string} slot */
export function deleteSave(slot) { localStorage.removeItem(NS + slot); }

/** @returns {string[]} */
export function listSlots() {
  return Object.keys(localStorage).filter(k => k.startsWith(NS)).map(k => k.slice(NS.length));
}
