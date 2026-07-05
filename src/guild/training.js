/**
 * @file Training — Monster-Rancher-style drills.
 *
 * Each drill raises a MAIN stat. The HEAVY version also nudges a SECONDARY stat up
 * and a PAIRED stat DOWN — you can't max everything, and specializing hard costs you
 * elsewhere — at the price of much more Fatigue and Stress. LIGHT is the safe, small
 * gain. Gains scale with the hero's talent, their life stage (young/prime train
 * fastest; the old decline), how worn-down they are (high Fatigue+Stress tanks gains
 * and risks injury), and morale. Rest is the counterweight that sheds Fatigue/Stress.
 */
import { HERO_STATS, STAT_CAP } from './hero.js';

const GAIN_SCALE = 5;

/** Drills: MAIN stat, plus (heavy only) a SECONDARY (+) and a PAIRED penalty (−). */
export const DRILLS = [
  { id: 'pow', name: 'Weight Drills',   main: 'POW', sec: 'VIT', pen: 'INT' },
  { id: 'def', name: 'Shield Wall',     main: 'DEF', sec: 'VIT', pen: 'SPD' },
  { id: 'skl', name: 'Weapon Forms',    main: 'SKL', sec: 'SPD', pen: 'POW' },
  { id: 'spd', name: 'Sprint Course',   main: 'SPD', sec: 'SKL', pen: 'DEF' },
  { id: 'int', name: 'Meditation',      main: 'INT', sec: 'SKL', pen: 'POW' },
  { id: 'vit', name: 'Endurance March', main: 'VIT', sec: 'DEF', pen: 'SPD' },
];
export const REST = { id: 'rest', name: 'Rest & Recover' };

export function getDrill(id) { return id === 'rest' ? REST : (DRILLS.find((d) => d.id === id) || null); }

const clampStat = (v) => Math.max(0, Math.min(STAT_CAP, v));
const clamp100 = (v) => Math.max(0, Math.min(100, Math.round(v)));

/** Life-stage curve: ramps up young, peaks in early prime (~20% of life), then declines. */
function ageMult(hero) {
  const f = Math.max(0, Math.min(1, (hero.age || 0) / (hero.lifespan || 300)));
  return f < 0.2 ? (0.85 + f * 2.25) : Math.max(0.3, 1.3 - (f - 0.2) * 1.25);
}
/** Wear curve: gains fall as Fatigue + Stress*2 climbs (MR's fatigue+stress model). */
function wearMult(c) { return Math.max(0.2, 1 - ((c.fatigue || 0) + (c.stress || 0) * 2) / 400); }

/**
 * Resolve one week of training. Mutates the hero. Returns a report for the recap.
 * @param {import('./hero.js').Hero} hero
 * @param {string} drillId  a DRILLS id, or 'rest'
 * @param {'light'|'heavy'} intensity
 * @param {Object.<string,number>} [dietBias]
 * @param {{injuryBonus?:number}} [opts]  injuryBonus raises the overtraining-injury threshold (Sparring Ring)
 * @returns {{gains:Object,drops:Object,rested?:boolean,injured?:boolean,injury:?string}}
 */
export function applyTraining(hero, drillId, intensity, dietBias = {}, opts = {}) {
  const c = hero.condition;
  const gains = {}, drops = {};

  // Rest — the recovery counterweight.
  if (drillId === 'rest' || !getDrill(drillId)) {
    c.fatigue = clamp100(c.fatigue - 35);
    c.stress = clamp100((c.stress || 0) - 20);
    c.stamina = Math.min(100, (c.stamina || 0) + 25);
    c.morale = clamp100(c.morale + 5);
    if (c.injury && c.fatigue < 25 && (c.stress || 0) < 25) c.injury = null;
    return { gains, drops, rested: true, injury: c.injury };
  }

  // An injured hero can't train — the week becomes forced rest until they recover.
  if (c.injury) {
    c.fatigue = clamp100(c.fatigue - 30);
    c.stress = clamp100((c.stress || 0) - 18);
    c.stamina = Math.min(100, (c.stamina || 0) + 15);
    if (c.fatigue < 25 && (c.stress || 0) < 25) c.injury = null;
    return { gains, drops, injured: true, injury: c.injury };
  }

  const drill = getDrill(drillId);
  const heavy = intensity === 'heavy';
  const base = GAIN_SCALE * (heavy ? 1.8 : 1.0) * wearMult(c) * ageMult(hero) * (0.85 + (c.morale / 100) * 0.3);

  const grow = (stat, factor) => {
    const cur = hero.stats[stat] || 0;
    if (cur >= STAT_CAP) return;
    const room = (STAT_CAP - cur) / STAT_CAP;
    const amt = Math.max(1, Math.round(base * factor * (hero.growth[stat] || 1) * (dietBias[stat] || 1) * (0.3 + 0.7 * room)));
    const next = clampStat(cur + amt);
    if (next > cur) gains[stat] = (gains[stat] || 0) + (next - cur);
    hero.stats[stat] = next;
  };

  grow(drill.main, 1);
  if (heavy) {
    grow(drill.sec, 0.4);
    const cur = hero.stats[drill.pen] || 0;             // heavy training saps a paired stat
    const next = clampStat(cur - Math.round(base * 0.4));
    if (next < cur) drops[drill.pen] = (drops[drill.pen] || 0) + (cur - next);
    hero.stats[drill.pen] = next;
  }

  c.fatigue = clamp100(c.fatigue + (heavy ? 25 : 12)); // heavy outpaces most diets' relief → fatigue builds
  c.stress = clamp100((c.stress || 0) + (heavy ? 14 : 6));
  c.stamina = Math.max(0, (c.stamina || 0) - (heavy ? 12 : 6));
  c.morale = clamp100(c.morale - (heavy ? 2 : 1));
  hero.xp += heavy ? 14 : 8;

  // Overtraining injury: chance rises with combined wear (Fatigue + Stress*2). A
  // Sparring Ring (opts.injuryBonus) raises the threshold, so injuries start later.
  const wear = c.fatigue + (c.stress || 0) * 2;
  const injThresh = 185 + (opts.injuryBonus || 0);
  if (wear > injThresh && Math.random() < Math.min(0.6, (wear - injThresh) / 160)) c.injury = 'strained';

  return { gains, drops, injury: c.injury };
}

/**
 * Resolve one member's side of a sparring bout. BOTH members call this (once each),
 * so both improve. Sparring sharpens SKL & SPD (technique/reflexes) with some POW —
 * and you learn MORE from a stronger partner. Contact training piles on Fatigue/Stress
 * and carries a real injury risk. Mutates `hero`; reads `partner`.
 * @param {import('./hero.js').Hero} hero @param {import('./hero.js').Hero} partner
 * @param {Object.<string,number>} [dietBias]
 * @param {{injuryBonus?:number}} [opts]  injuryBonus raises the contact-injury threshold (Sparring Ring)
 * @returns {{gains:Object,drops:Object,spar:boolean,partnerName:string,injury:?string}}
 */
export function applySpar(hero, partner, dietBias = {}, opts = {}) {
  const c = hero.condition;
  const gains = {}, drops = {};
  const combat = (h) => (h.stats.SKL || 0) + (h.stats.SPD || 0) + (h.stats.POW || 0);
  const edge = Math.max(0.7, Math.min(1.8, combat(partner) / Math.max(1, combat(hero)))); // a stronger partner teaches more
  const base = GAIN_SCALE * 1.35 * edge * wearMult(c) * ageMult(hero) * (0.85 + (c.morale / 100) * 0.3);
  const grow = (stat, factor) => {
    const cur = hero.stats[stat] || 0;
    if (cur >= STAT_CAP) return;
    const room = (STAT_CAP - cur) / STAT_CAP;
    const amt = Math.max(1, Math.round(base * factor * (hero.growth[stat] || 1) * (dietBias[stat] || 1) * (0.3 + 0.7 * room)));
    const next = clampStat(cur + amt);
    if (next > cur) gains[stat] = (gains[stat] || 0) + (next - cur);
    hero.stats[stat] = next;
  };
  grow('SKL', 1); grow('SPD', 0.7); grow('POW', 0.4);
  c.fatigue = clamp100(c.fatigue + 18);
  c.stress = clamp100((c.stress || 0) + 10);
  c.stamina = Math.max(0, (c.stamina || 0) - 10);
  c.morale = clamp100(c.morale + 1); // a good bout lifts spirits
  hero.xp += 12;
  const wear = c.fatigue + (c.stress || 0) * 2;
  const injThresh = 185 + (opts.injuryBonus || 0); // Sparring Ring softens contact-injury risk
  if (wear > injThresh && Math.random() < Math.min(0.6, (wear - injThresh) / 150)) c.injury = 'bruised';
  return { gains, drops, spar: true, partnerName: partner.name, injury: c.injury };
}

export { HERO_STATS };
