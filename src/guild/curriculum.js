/**
 * @file The Academy curriculum — every member is a fighter who specializes.
 *
 * Identity through-line (the thing that makes the guild's systems mesh):
 *   MAJOR   — a combat DISCIPLINE (Melee / Ranged / Magic), set by the member's
 *             archetype at recruitment (their nature). It's a LENS over the existing
 *             stat drills: a discipline emphasizes its stats and levels as the member
 *             trains combat, unlocking techniques.
 *   TRACK   — the player's schooling choice for the member:
 *             · an ELECTIVE trade (Blacksmithing / Potion-Crafting / Historian /
 *               Cooking / Enchanting), or
 *             · a DOUBLE MAJOR — give up the elective to train a SECOND discipline.
 *
 * Phase 1 (this build): disciplines are identity + stat emphasis + technique unlocks;
 * they do NOT yet rewrite a fighter's arena attack kit (that's a later phase).
 */

/** Combat disciplines. `drills` are the DRILLS ids (training.js) this discipline
 *  emphasizes; training one of them feeds the discipline's growth. */
export const DISCIPLINES = {
  melee:  { id: 'melee',  name: 'Melee',  glyph: '⚔', col: '#d98a5a', stats: ['POW', 'DEF', 'VIT'], drills: ['pow', 'def', 'vit'], blurb: 'blade & bulwark — close the distance' },
  ranged: { id: 'ranged', name: 'Ranged', glyph: '🏹', col: '#8ab45a', stats: ['SKL', 'SPD'],        drills: ['skl', 'spd'],        blurb: 'bow & thrown steel — strike from afar' },
  magic:  { id: 'magic',  name: 'Magic',  glyph: '✦', col: '#8a7bd0', stats: ['INT'],               drills: ['int'],               blurb: 'the aether — bend the elements' },
};
export const DISCIPLINE_IDS = ['melee', 'ranged', 'magic'];
export function disciplineById(id) { return DISCIPLINES[id] || null; }

/** A member's MAJOR is fixed by their archetype (their nature). */
const ARCH_MAJOR = {
  Knight: 'melee', Berserker: 'melee',
  Ranger: 'ranged', Rogue: 'ranged',
  Mage: 'magic', Cleric: 'magic',
  Adventurer: 'melee',
};
export function majorForArchetype(archetype) { return ARCH_MAJOR[archetype] || 'melee'; }

/** Which drills feed which discipline (reverse of DISCIPLINES.drills). */
export function disciplineForDrill(drillId) {
  for (const id of DISCIPLINE_IDS) if (DISCIPLINES[id].drills.indexOf(drillId) >= 0) return id;
  return null;
}

/**
 * Elective trades. Each maps to a guild ROOM + a weekly assignment type + a
 * profession the member advances. Blacksmithing/Potion/Historian reuse the shipped
 * forge/brew/study jobs; Cooking and Enchanting are new.
 */
export const ELECTIVES = {
  blacksmithing: { id: 'blacksmithing', name: 'Blacksmithing',  glyph: '🔨', room: 'forge',      assign: 'forge',   prof: 'blacksmithing', blurb: 'forge weapons & armor' },
  potion:        { id: 'potion',        name: 'Potion-Crafting', glyph: '⚗', room: 'laboratory', assign: 'brew',    prof: 'alchemy',       blurb: 'brew potions & elixirs' },
  historian:     { id: 'historian',     name: 'Historian',       glyph: '📖', room: 'library',    assign: 'study',   prof: 'historian',     blurb: 'study lore & technique' },
  cooking:       { id: 'cooking',       name: 'Cooking',         glyph: '🍳', room: 'kitchen',    assign: 'cook',    prof: 'cooking',       blurb: 'cook rations from the pantry' },
  enchanting:    { id: 'enchanting',    name: 'Enchanting',      glyph: '✨', room: 'armory',     assign: 'enchant', prof: 'enchanting',    blurb: 'craft & slot materia' },
};
export const ELECTIVE_IDS = ['blacksmithing', 'potion', 'historian', 'cooking', 'enchanting'];
export function electiveById(id) { return ELECTIVES[id] || null; }
/** The elective an assignment type belongs to (forge → blacksmithing, cook → cooking…). */
export function electiveForAssign(type) { return ELECTIVE_IDS.map((k) => ELECTIVES[k]).find((e) => e.assign === type) || null; }

/** Discipline XP → level. Levels 0..5; techniques unlock at 1/2/3/4/5. */
const DISC_THRESHOLDS = [40, 110, 220, 380, 600];
export function discLevel(xp) { let l = 0; for (const t of DISC_THRESHOLDS) { if ((xp || 0) >= t) l++; else break; } return l; }
/** XP into the current level and what the next level needs (for a progress bar). */
export function discProgress(xp) {
  const lvl = discLevel(xp);
  const floor = lvl === 0 ? 0 : DISC_THRESHOLDS[lvl - 1];
  const ceil = DISC_THRESHOLDS[lvl] != null ? DISC_THRESHOLDS[lvl] : floor;
  return { lvl, xp: xp || 0, floor, ceil, frac: ceil > floor ? Math.min(1, ((xp || 0) - floor) / (ceil - floor)) : 1 };
}

/** Signature techniques a discipline earns as it levels (Phase 1: identity/flavor +
 *  a stat edge; Phase 2 will wire them into the arena kit). */
export const DISC_TECHNIQUES = {
  melee:  [{ lvl: 1, name: 'Guard Break' }, { lvl: 2, name: 'Cleave' }, { lvl: 3, name: 'Rampart' }, { lvl: 4, name: 'Sunder' }, { lvl: 5, name: 'Executioner' }],
  ranged: [{ lvl: 1, name: 'Aimed Shot' }, { lvl: 2, name: 'Quick Nock' }, { lvl: 3, name: 'Pinning Shot' }, { lvl: 4, name: 'Volley' }, { lvl: 5, name: 'Rain of Arrows' }],
  magic:  [{ lvl: 1, name: 'Spark' }, { lvl: 2, name: 'Ward' }, { lvl: 3, name: 'Kindle' }, { lvl: 4, name: 'Elemental Surge' }, { lvl: 5, name: 'Cataclysm' }],
};
/** Techniques a member has earned in a discipline at the given level. */
export function techniquesFor(discId, lvl) { return (DISC_TECHNIQUES[discId] || []).filter((t) => t.lvl <= lvl); }

/**
 * Ensure a hero's academy fields exist (new heroes + old saves). Major is fixed from
 * archetype; disciplines start empty; the Track defaults to an elective inferred from
 * any trade they're already working, else undeclared (the player enrolls them).
 * @param {import('./hero.js').Hero} h
 */
export function ensureCurriculum(h) {
  if (!h.major || !DISCIPLINES[h.major]) h.major = majorForArchetype(h.archetype);
  if (!h.disc || typeof h.disc !== 'object') h.disc = { melee: 0, ranged: 0, magic: 0 };
  for (const d of DISCIPLINE_IDS) if (typeof h.disc[d] !== 'number') h.disc[d] = 0;
  if (!h.track || (h.track.kind !== 'elective' && h.track.kind !== 'double')) {
    const inferred = h.assignment ? (electiveForAssign(h.assignment.type) || {}).id : null;
    h.track = { kind: 'elective', electiveId: inferred || null, second: null };
  }
  // Sanitize double-major's second discipline (must be a real, non-major discipline).
  if (h.track.kind === 'double' && (!DISCIPLINES[h.track.second] || h.track.second === h.major)) {
    h.track.second = DISCIPLINE_IDS.find((d) => d !== h.major);
  }
}

/** The member's active combat disciplines (major, plus a double-major's second). */
export function activeDisciplines(h) {
  const out = [h.major];
  if (h.track && h.track.kind === 'double' && h.track.second && h.track.second !== h.major) out.push(h.track.second);
  return out;
}
/** The member's elective, or null if double-majoring / undeclared. */
export function memberElective(h) {
  return h.track && h.track.kind === 'elective' && h.track.electiveId ? electiveById(h.track.electiveId) : null;
}
/** Can this member work assignment `type` (a trade job)? Combat/dispatch aren't gated. */
export function canWorkAssign(h, type) {
  const e = electiveForAssign(type);
  if (!e) return true; // not a trade job (train/quest/hunt/rest) — always allowed
  return !!(h.track && h.track.kind === 'elective' && h.track.electiveId === e.id);
}
