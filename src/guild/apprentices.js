/**
 * @file Apprentices — the academy's minor-league / farm system.
 *
 * The guild houses a pool of UNNAMED trainees. Each week they develop toward
 * graduation; the Dormitory facility caps how many you can bunk, and each costs
 * weekly board (food). When an apprentice is ready, the player GRADUATES one — a
 * deliberate GM-style draft — and it becomes a real named Hero, its archetype set
 * by the apprentice's visible LEAN (preference) and its starting stats lifted by a
 * hidden POTENTIAL. This is the pipeline that feeds the roster (and lets you plan
 * succession: draft the magic-leaning prospect as your old knight retires).
 *
 * An apprentice is intentionally lightweight: `{ id, lean, potential, weeks, readiness }`.
 * `guild.apprentices` persists.
 */
import { FACILITIES, facilityTier } from './guild.js';
import { HERO_STATS, STAT_CAP } from './hero.js';
import { ARCHETYPES, rollStatBlock, generateRecruit } from './recruiting.js';

/** Gold per apprentice per week (food + board), folded into the weekly upkeep. */
export const APPRENTICE_BOARD = 6;
/** One-time gold cost to take a new apprentice into the academy. */
export const APPRENTICE_INTAKE = 60;

/** Preference leans = the archetype an apprentice will graduate into. */
const LEANS = ARCHETYPES.map((a) => a.name);
/** A glyph per lean for the scout report. */
export const LEAN_GLYPH = { Knight: '🛡', Mage: '🔮', Ranger: '🏹', Cleric: '✨', Rogue: '🗡', Berserker: '🪓' };

const rand = (n) => Math.floor(Math.random() * n);
let _seq = 0;
function nextId() { return 'app_' + Math.random().toString(36).slice(2, 7) + (++_seq).toString(36); }

/** Bunk capacity from the Dormitory tier. */
export function dormCapacity(guild) { return FACILITIES.dorm.beds[facilityTier(guild, 'dorm')]; }
/** Weekly board bill for the whole academy. */
export function academyBoard(guild) { return (guild.apprentices || []).length * APPRENTICE_BOARD; }

/** Coarse potential → 1..5 stars for the scout report (hidden ceiling made legible). */
export function potentialStars(p) { return Math.max(1, Math.min(5, Math.round((p || 0) * 5))); }

/** How fast readiness fills each week — a Trainer on staff (teachers) speeds it. */
export function developmentRate(guild) {
  let r = 0.11; // ~9 weeks from intake to ready at base
  if (guild && guild.trainer) r *= 1.3; // an appointed retired champion mentors the class
  return r;
}

/** Take in a fresh apprentice: a random lean + hidden potential, zero readiness. */
export function makeApprentice() {
  return { id: nextId(), lean: LEANS[rand(LEANS.length)], potential: 0.35 + Math.random() * 0.6, weeks: 0, readiness: 0 };
}

/** Sanitize a loaded apprentice (defends old/partial saves). */
export function normalizeApprentice(a) {
  if (!a || typeof a !== 'object') return null;
  return {
    id: a.id || nextId(),
    lean: LEANS.includes(a.lean) ? a.lean : LEANS[rand(LEANS.length)],
    potential: Math.max(0.2, Math.min(1, typeof a.potential === 'number' ? a.potential : 0.5)),
    weeks: Math.max(0, a.weeks | 0),
    readiness: Math.max(0, Math.min(1, typeof a.readiness === 'number' ? a.readiness : 0)),
  };
}

/** One week of development. Mutates the apprentice; returns true if it JUST became ready. */
export function developApprentice(app, guild) {
  const before = app.readiness;
  app.weeks += 1;
  app.readiness = Math.min(1, app.readiness + developmentRate(guild));
  return before < 1 && app.readiness >= 1;
}

/**
 * Graduate an apprentice into a named Hero (the draft). Reuses generateRecruit for the
 * name/traits/lifespan, then overrides archetype + growth + stats from the lean and
 * lifts the starting stats by the hidden potential (a top prospect debuts stronger).
 * @returns {import('./hero.js').Hero}
 */
export function graduate(app) {
  const hero = generateRecruit(); // borrow name, two traits, lifespan
  const arch = ARCHETYPES.find((a) => a.name === app.lean) || ARCHETYPES[0];
  const growth = {};
  for (const s of HERO_STATS) growth[s] = Math.max(0.5, arch.growth[s] + (rand(3) - 1) * 0.25);
  const stats = rollStatBlock(growth);
  for (const s of HERO_STATS) {
    // potential lifts each stat, weighted by the archetype's talent there (up to ~+18 on a gifted stat).
    stats[s] = Math.min(STAT_CAP, Math.round(stats[s] + app.potential * 14 * (growth[s] / 2)));
  }
  hero.archetype = arch.name;
  hero.growth = growth;
  hero.stats = stats;
  hero.preference = app.lean;      // flavor: the specialty they trained toward
  hero.fromAcademy = true;         // debut record — a home-grown hero, not a hire
  return hero;
}
