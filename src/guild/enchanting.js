/**
 * @file Enchanting — the Enchanter's trade (a guild ELECTIVE). Mirrors the smith/cook.
 *
 * An Enchanter works the bench for the week and CRAFTS a materia — a planetary orb
 * ({planetIdx, level, xp}, the exact shape the combat run uses) — into the guild's
 * materia store. Higher planets need more Theory (lore); the orb's LEVEL scales with
 * the Enchanter's Practice. Crafted orbs can then be SLOTTED into an armoury weapon's
 * sockets.
 *
 * Phase 1 (matches the chosen scope): crafting + slotting are real and economic, but a
 * slotted orb does not yet change a played arena fight — that waits on the gear→engine
 * bridge (battle-bridge deliberately forwards only stats today). So enchanting is, for
 * now, the guild's way to BUILD a materia collection and dress its weapons.
 */
import { PLANETS } from '../game/data/progression.js';
import { hasMaterials, spendMaterials, addMateria, removeMateriaAt, addMaterial } from './inventory.js';

export const MATERIA_MAX_LVL = 5;

/** Raw-material cost to enchant an orb of planet `i` — the potent planets cost dearer ore. */
export function orbCost(planetIdx) {
  const cost = { iron_ore: 3 };
  if (planetIdx >= 3) cost.steel_ore = 1;
  if (planetIdx >= 5) cost.mithril_ore = 1;
  return cost;
}
/** Theory (enchanting lore) a planet's orb needs — the outer planets are harder-won. */
export function orbReqTheory(planetIdx) { return planetIdx * 6; }

/** Enchanting profession block, tolerant of un-migrated heroes. */
function enchProf(hero) { return (hero.professions.enchanting || (hero.professions.enchanting = { theory: 0, practice: 0, field: 0 })); }
export function orbUnlocked(hero, planetIdx) { return (enchProf(hero).theory || 0) >= orbReqTheory(planetIdx); }

/** The level an Enchanter of this Practice/Field would forge (1..MAX). */
export function previewOrbLevel(practice, field) {
  return Math.max(1, Math.min(MATERIA_MAX_LVL, 1 + Math.floor(((practice || 0) * 0.6 + (field || 0) * 0.2) / 26)));
}

/**
 * Craft one materia this week into the guild store. Mutates the enchanter + inventory.
 * @param {import('./hero.js').Hero} hero @param {number} planetIdx
 * @param {import('./inventory.js').Inventory} inv @param {number} week
 * @returns {{ok:boolean, reason?:string, orb?:Object, planet?:Object, level?:number, practiceGain?:number}}
 */
export function craftMateria(hero, planetIdx, inv, week) {
  const c = hero.condition;
  const prof = enchProf(hero);
  if (planetIdx == null || planetIdx < 0 || planetIdx >= PLANETS.length) return { ok: false, reason: 'planet' };
  if (!orbUnlocked(hero, planetIdx)) return { ok: false, reason: 'locked' };
  const cost = orbCost(planetIdx);
  if (!hasMaterials(inv, cost)) return { ok: false, reason: 'materials' };
  if (c.stamina < 18) return { ok: false, reason: 'stamina' };

  spendMaterials(inv, cost);
  const level = previewOrbLevel(prof.practice, prof.field);
  const orb = { planetIdx, level, xp: 0, craftedBy: hero.id, craftedByName: hero.name, week };
  addMateria(inv, orb);

  const room = (100 - prof.practice) / 100;
  const gain = Math.max(1, Math.round(5 * (0.3 + 0.7 * room)));
  prof.practice = Math.min(100, prof.practice + gain);

  c.stamina = Math.max(0, c.stamina - 18);
  c.fatigue = Math.min(100, c.fatigue + 12);
  hero.xp += 8;
  return { ok: true, orb, planet: PLANETS[planetIdx], level, practiceGain: gain };
}

// ─── Smith's Blessing — the Enchanter's refining reagent ─────────────────────
// A mithril-laced charm for the Forge: guard a refine attempt with one and a
// FAILED attempt keeps its level instead of shattering (RO's Blacksmith Blessing).
// The Enchanter's second work mode — the first goods one trade makes for another.

export const BLESSING_REQ_THEORY = 30;
export const BLESSING_STAMINA = 20;
export const BLESSING_COST = { mithril_ore: 1, iron_ore: 2 };

export function blessingUnlocked(hero) { return (enchProf(hero).theory || 0) >= BLESSING_REQ_THEORY; }

/**
 * Craft one Smith's Blessing into the Forge stockroom. Mutates the enchanter + inventory.
 * @returns {{ok:boolean, reason?:string, qty?:number, practiceGain?:number}}
 */
export function craftBlessing(hero, inv, week) {
  const c = hero.condition;
  const prof = enchProf(hero);
  if (!blessingUnlocked(hero)) return { ok: false, reason: 'locked' };
  if (!hasMaterials(inv, BLESSING_COST)) return { ok: false, reason: 'materials' };
  if (c.stamina < BLESSING_STAMINA) return { ok: false, reason: 'stamina' };

  spendMaterials(inv, BLESSING_COST);
  addMaterial(inv, 'smith_blessing', 1);

  const room = (100 - prof.practice) / 100;
  const gain = Math.max(1, Math.round(4 * (0.3 + 0.7 * room)));
  prof.practice = Math.min(100, prof.practice + gain);

  c.stamina = Math.max(0, c.stamina - BLESSING_STAMINA);
  c.fatigue = Math.min(100, c.fatigue + 10);
  hero.xp += 7;
  return { ok: true, qty: 1, practiceGain: gain };
}

/** How many sockets an armoury weapon carries (derived from quality if never set). */
export function itemSockets(item) {
  if (item.sockets == null) item.sockets = Math.max(1, Math.min(3, 1 + Math.floor((item.quality || 0) / 40)));
  return item.sockets;
}

/**
 * Slot a stored materia (by index) into an armoury item's socket. Mutates both.
 * @returns {{ok:boolean, reason?:string, orb?:Object}}
 */
export function slotMateria(item, inv, materiaIndex) {
  if (!item) return { ok: false, reason: 'noitem' };
  const cap = itemSockets(item);
  if (!Array.isArray(item.materia)) item.materia = [];
  if (item.materia.length >= cap) return { ok: false, reason: 'full' };
  const orb = removeMateriaAt(inv, materiaIndex);
  if (!orb) return { ok: false, reason: 'noorb' };
  item.materia.push(orb);
  return { ok: true, orb };
}

/** A short label for an orb in the UI (planet glyph + name + level). */
export function orbLabel(orb) {
  const p = PLANETS[orb.planetIdx] || { sym: '○', name: 'Orb', col: '#888' };
  return { sym: p.sym, name: p.name, col: p.col, lvl: orb.level || 1 };
}
