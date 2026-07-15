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
import { HERO_STATS, STAT_CAP, traitMult } from './hero.js';

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

// ─── Injuries: a severity LADDER, not a boolean ──────────────────────────────
// condition.injury is now { kind, weeksLeft, statHit } — bruises shrug off in a
// week; a torn muscle costs a month AND permanently dents the drilled stat.
export const INJURY_KINDS = {
  bruised:  { name: 'Bruised',     weeks: 1 },
  strained: { name: 'Strained',    weeks: 2 },
  torn:     { name: 'Torn Muscle', weeks: 5, statHit: 2 },
};
/** Roll a severity from how far wear overflowed the threshold (worse overflow → worse tears). */
export function rollInjurySeverity(overflow) {
  const r = Math.random();
  if ((overflow || 0) > 60 && r < 0.25) return 'torn';
  if (r < 0.65) return 'strained';
  return 'bruised';
}
/** Build the injury object; `statHit` names the stat a tear permanently dents. */
export function makeInjury(kind, hitStat) {
  const def = INJURY_KINDS[kind] || INJURY_KINDS.strained;
  return { kind, weeksLeft: def.weeks, statHit: def.statHit && hitStat ? { stat: hitStat, amt: def.statHit } : null };
}
/** Short display line: "Torn Muscle — 3wk". Tolerates legacy string injuries. */
export function injuryLabel(injury) {
  if (!injury) return null;
  if (typeof injury === 'string') return injury;
  const def = INJURY_KINDS[injury.kind] || { name: injury.kind };
  return `${def.name} — ${injury.weeksLeft}wk`;
}
/** One week of healing. `rate` 1 normally, 2 with an Infirmary. Clears when done. */
function healInjury(c, rate = 1) {
  if (!c.injury) return;
  if (typeof c.injury === 'string') { c.injury = makeInjury('strained', null); } // legacy mid-session value
  c.injury.weeksLeft -= rate;
  if (c.injury.weeksLeft <= 0) c.injury = null;
}
/** Inflict an injury: applies the permanent stat dent (tears) + career tally. */
export function inflictInjury(hero, kind, hitStat) {
  const inj = makeInjury(kind, hitStat);
  hero.condition.injury = inj;
  if (inj.statHit) hero.stats[inj.statHit.stat] = Math.max(0, Math.min(STAT_CAP, (hero.stats[inj.statHit.stat] || 0) - inj.statHit.amt));
  if (hero.career) hero.career.injuries = (hero.career.injuries || 0) + 1;
  return inj;
}

/**
 * The HONEST pre-drill injury odds — the same math applyTraining will roll after
 * this week's fatigue/stress lands, so the picker can't lie (anti-lie principle).
 * @returns {number} 0..0.6 chance
 */
export function previewInjuryChance(hero, intensity, opts = {}) {
  const c = hero.condition;
  const heavy = intensity === 'heavy';
  const fat = Math.max(0, Math.min(100, c.fatigue + (heavy ? 25 : 12)));
  const str = Math.max(0, Math.min(100, (c.stress || 0) + (heavy ? 14 : 6)));
  const wear = fat + str * 2;
  const injThresh = 185 + (opts.injuryBonus || 0);
  if (wear <= injThresh) return 0;
  return Math.min(0.6, (wear - injThresh) / 160) * (opts.injuryRiskMod ?? 1) * traitMult(hero, 'injury');
}

const clampStat = (v) => Math.max(0, Math.min(STAT_CAP, v));
const clamp100 = (v) => Math.max(0, Math.min(100, Math.round(v)));

/**
 * The weekly CONDUCT roll (the Weekly Assembly's raw material): does this member
 * actually put the work in, or coast and hide it? Low Discipline and low morale
 * invite slacking; traits weigh in (Lazy doubles it, Loyal won't let the guild
 * down). A slacked week still LOOKS like training from the outside — the Assembly
 * report is what exposes it, and praise/scold is how the player answers.
 * @param {import('./hero.js').Hero} hero @returns {'honest'|'slack'}
 */
export function rollConduct(hero) {
  const c = hero.condition;
  const base = Math.max(0, (55 - (c.discipline ?? 40)) / 250) + ((c.morale || 0) < 40 ? 0.06 : 0);
  const chance = Math.min(0.4, base * traitMult(hero, 'slack'));
  return Math.random() < chance ? 'slack' : 'honest';
}

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
 * @param {{injuryBonus?:number,equipMult?:number,effort?:'honest'|'slack'}} [opts]  injuryBonus raises the overtraining-injury threshold (Sparring Ring); equipMult scales gains from placed ranch training stations; effort 'slack' = the hero coasts (rollConduct) — third-strength gains, half the wear, no injury risk, no discipline growth
 * @returns {{gains:Object,drops:Object,rested?:boolean,injured?:boolean,slacked?:boolean,injury:?string}}
 */
export function applyTraining(hero, drillId, intensity, dietBias = {}, opts = {}) {
  const c = hero.condition;
  const gains = {}, drops = {};
  const slacking = opts.effort === 'slack';

  // Rest — the recovery counterweight. Injuries heal on a WEEKS clock now
  // (opts.healRate 2 with an Infirmary), not the old fatigue/stress gate.
  if (drillId === 'rest' || !getDrill(drillId)) {
    const rec = traitMult(hero, 'recover'); // Lazy/Glutton rest deeper
    c.fatigue = clamp100(c.fatigue - 35 * rec);
    c.stress = clamp100((c.stress || 0) - 20 * rec);
    c.stamina = Math.min(100, (c.stamina || 0) + Math.round(25 * rec));
    c.morale = clamp100(c.morale + 5);
    healInjury(c, opts.healRate || 1);
    return { gains, drops, rested: true, injury: c.injury };
  }

  // An injured hero can't train — the week becomes forced rest until they recover.
  if (c.injury) {
    c.fatigue = clamp100(c.fatigue - 30);
    c.stress = clamp100((c.stress || 0) - 18);
    c.stamina = Math.min(100, (c.stamina || 0) + 15);
    healInjury(c, opts.healRate || 1);
    return { gains, drops, injured: true, injury: c.injury };
  }

  const drill = getDrill(drillId);
  const heavy = intensity === 'heavy';
  // Breakthrough (MR's "training went great!"): heavy drills carry a 5% chance the
  // week clicks — half again the gains and a morale lift. The upside that keeps
  // heavy-drill gambling interesting opposite the injury ladder. A slacker can't
  // stumble into one — breakthroughs are earned.
  const breakthrough = heavy && !slacking && Math.random() < 0.05;
  const base = GAIN_SCALE * (heavy ? 1.8 : 1.0) * (breakthrough ? 1.5 : 1) * traitMult(hero, 'gain')
    * wearMult(c) * ageMult(hero) * (0.85 + (c.morale / 100) * 0.3)
    * (opts.equipMult ?? 1) // placed training stations (ranch equipment) boost their drill
    * (slacking ? 0.35 : 1); // a coasted week: going through the motions

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

  const wearScale = slacking ? 0.5 : 1; // loafing is easy on the body
  c.fatigue = clamp100(c.fatigue + (heavy ? 25 : 12) * wearScale); // heavy outpaces most diets' relief → fatigue builds
  c.stress = clamp100((c.stress || 0) + (heavy ? 14 : 6) * wearScale * traitMult(hero, 'stress')); // Stoics shrug it off
  c.stamina = Math.max(0, (c.stamina || 0) - (heavy ? 12 : 6) * wearScale);
  c.morale = clamp100(c.morale + (breakthrough ? 8 : slacking ? 2 : -(heavy ? 2 : 1))); // a stolen easy week feels great
  if (!slacking) c.discipline = clamp100((c.discipline ?? 40) + 1); // drilling instills discipline (obeys better in fights)
  hero.xp += slacking ? 3 : heavy ? 14 : 8;

  // Overtraining injury: chance rises with combined wear (Fatigue + Stress*2). A
  // Sparring Ring (opts.injuryBonus) raises the threshold; the diet's injuryRiskMod
  // (finally wired) scales the roll; severity scales with the overflow — a tear
  // permanently dents the drilled stat. Slackers never push hard enough to get hurt.
  const wear = c.fatigue + (c.stress || 0) * 2;
  const injThresh = 185 + (opts.injuryBonus || 0);
  if (!slacking && wear > injThresh && Math.random() < Math.min(0.6, (wear - injThresh) / 160) * (opts.injuryRiskMod ?? 1) * traitMult(hero, 'injury')) {
    inflictInjury(hero, rollInjurySeverity(wear - injThresh), drill.main);
  }

  return { gains, drops, injury: c.injury, breakthrough, slacked: slacking || undefined };
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
  const base = GAIN_SCALE * 1.35 * edge * traitMult(hero, 'gain') * wearMult(c) * ageMult(hero) * (0.85 + (c.morale / 100) * 0.3);
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
  c.stress = clamp100((c.stress || 0) + 10 * traitMult(hero, 'stress'));
  c.stamina = Math.max(0, (c.stamina || 0) - 10);
  c.morale = clamp100(c.morale + 1); // a good bout lifts spirits
  c.discipline = clamp100((c.discipline ?? 40) + 1); // partnered drill work builds discipline too
  hero.xp += 12;
  const wear = c.fatigue + (c.stress || 0) * 2;
  const injThresh = 185 + (opts.injuryBonus || 0); // Sparring Ring softens contact-injury risk
  if (wear > injThresh && Math.random() < Math.min(0.6, (wear - injThresh) / 150) * (opts.injuryRiskMod ?? 1) * traitMult(hero, 'injury')) {
    // Contact injuries skew light: mostly bruises, the odd strain, rare tears.
    const r = Math.random();
    inflictInjury(hero, r < 0.6 ? 'bruised' : rollInjurySeverity(wear - injThresh), 'SKL');
  }
  return { gains, drops, spar: true, partnerName: partner.name, injury: c.injury };
}

export { HERO_STATS };
