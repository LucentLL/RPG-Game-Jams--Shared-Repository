/**
 * @file Roles — the job each guild category/room represents.
 *
 * The guild is "an area for work and for storage": a member hired and assigned to
 * a room fills that room's ROLE, and (for trades) grows the matching profession's
 * skill tracks with use. Some trades (cooking/alchemy) are identity-only for now —
 * their deep mechanics arrive with the Kitchen/Alchemist systems — but the role
 * exists so hiring and assignment read as "put a Blacksmith on the Forge".
 *
 * @typedef {Object} Role
 * @property {string} name     the job title (Blacksmith, Cook, ...)
 * @property {string} glyph
 * @property {'work'|'storage'|'field'|'living'} kind
 * @property {?string} skill   the professions[] key this role trains, if any
 * @property {string} blurb
 */

/** @type {Object.<string, Role>} keyed by room id. */
export const ROLES = {
  grounds:    { name: 'The Grounds',   glyph: '🏕', kind: 'living',  skill: null,           blurb: 'The whole compound — expand quarters, training & stores.' },
  calendar:   { name: 'The Season',    glyph: '📅', kind: 'field',   skill: null,           blurb: 'Tournaments ahead — enter heroes early and train toward them.' },
  roster:     { name: 'Adventurer',    glyph: '🛡', kind: 'field',   skill: null,           blurb: 'Trains, then quests in the field.' },
  arena:      { name: 'Combatant',     glyph: '⚔', kind: 'field',   skill: null,           blurb: 'Step in for a live practice bout — anytime.' },
  forge:      { name: 'Blacksmith',    glyph: '🔨', kind: 'work',    skill: 'blacksmithing', blurb: 'Forges weapons & armor into the armory.' },
  kitchen:    { name: 'Cook',          glyph: '🍲', kind: 'work',    skill: 'cooking',       blurb: 'Prepares meals that speed recovery.' },
  library:    { name: 'Scholar',       glyph: '📖', kind: 'work',    skill: 'blacksmithing', blurb: 'Studies theory to unlock recipes.' },
  armory:     { name: 'Quartermaster', glyph: '🗡', kind: 'storage', skill: null,           blurb: 'Issues gear to the party by policy.' },
  apothecary: { name: 'Apothecary',    glyph: '🏺', kind: 'storage', skill: 'alchemy',       blurb: 'Keeps & dispenses potions and supplies.' },
  laboratory: { name: 'Alchemist',     glyph: '⚗', kind: 'work',    skill: 'alchemy',       blurb: 'Brews potions from gathered herbs.' },
  quarters:   { name: 'Steward',       glyph: '🍺', kind: 'living',  skill: null,           blurb: 'Runs the hall and takes on recruits.' },
};

/** @param {string} roomId @returns {?Role} */
export function roleFor(roomId) { return ROLES[roomId] || null; }
