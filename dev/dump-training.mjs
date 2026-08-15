/**
 * A WEEK OF TRAINING, WITNESSED — a fixture for the Unity port's TrainingRules.
 *
 * training.js and hero.js import nothing browser-bound, so the REAL functions
 * answer: applyTraining and applySpar run under a PATCHED Math.random — the
 * same mulberry32 stream (rng.js elementsRng) the C# replays through
 * ElementsGen.Rng — and every gain, drop, wear tick, morale swing, xp grant
 * and injury is written down, along with the hero's whole state after. One
 * drifted multiplier, one re-ordered random draw, and a case disagrees.
 *
 * The pure curves (ageMult, wearMult, previewInjuryChance) ride as x1e6 ints
 * per the fixture law; everything else the rules touch is already an integer
 * once clamp100's round lands.
 *
 *     node dev/dump-training.mjs
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { elementsRng } = await import(new URL('../src/game/engine/rng.js', import.meta.url));
const T = await import(new URL('../src/guild/training.js', import.meta.url));
const H = await import(new URL('../src/guild/hero.js', import.meta.url));

const STATS = H.HERO_STATS; // ['POW','DEF','SKL','SPD','INT','VIT']

/** A web-shaped hero from a compact spec. */
function mkHero(spec = {}) {
  const stats = {}, growth = {};
  STATS.forEach((s, i) => { stats[s] = (spec.stats || [20, 20, 20, 20, 20, 20])[i]; });
  STATS.forEach((s, i) => { growth[s] = (spec.growth || [1, 1, 1, 1, 1, 1])[i]; });
  return {
    name: spec.name || 'Case',
    stats, growth,
    condition: {
      stamina: spec.stamina ?? 100, morale: spec.morale ?? 70, loyalty: 60,
      fatigue: spec.fatigue ?? 0, stress: spec.stress ?? 0,
      injury: spec.injury ? T.makeInjury(spec.injury, spec.injuryHit || null) : null,
      discipline: spec.discipline ?? 40,
    },
    traits: spec.traits || [],
    age: spec.age ?? 0, lifespan: spec.lifespan ?? 300, xp: 0,
  };
}

function snap(hero) {
  return {
    stats: STATS.map((s) => hero.stats[s] || 0),
    fatigue: hero.condition.fatigue, stress: hero.condition.stress,
    stamina: hero.condition.stamina, morale: hero.condition.morale,
    discipline: hero.condition.discipline, xp: hero.xp,
    injury: T.injuryLabel(hero.condition.injury) || '',
  };
}
const statArr = (o) => STATS.map((s) => (o && o[s]) || 0);

const realRandom = Math.random;
function withStream(seed, fn) {
  Math.random = elementsRng(seed);
  try { return fn(); } finally { Math.random = realRandom; }
}

// ── The training cases ───────────────────────────────────────────────────────
const CASES = [];
let seed = 100;
function trainCase(name, spec, drill, intensity, opts = {}) {
  const s = ++seed;
  const hero = mkHero(spec);
  const rep = withStream(s, () =>
    T.applyTraining(hero, drill, intensity, {}, opts));
  CASES.push({
    name, seed: s, spec: JSON.stringify(spec), drill, heavy: intensity === 'heavy' ? 1 : 0,
    injuryBonus: opts.injuryBonus || 0, equipMultX100: Math.round((opts.equipMult ?? 1) * 100),
    healRate: opts.healRate || 1, slack: opts.effort === 'slack' ? 1 : 0,
    gains: statArr(rep.gains), drops: statArr(rep.drops),
    rested: rep.rested ? 1 : 0, injured: rep.injured ? 1 : 0,
    breakthrough: rep.breakthrough ? 1 : 0, slacked: rep.slacked ? 1 : 0,
    after: snap(hero),
  });
}

for (const drill of ['pow', 'def', 'skl', 'spd', 'int', 'vit']) {
  trainCase(`fresh ${drill} light`, {}, drill, 'light');
  trainCase(`fresh ${drill} heavy`, {}, drill, 'heavy');
}
trainCase('worn heavy, no ring', { fatigue: 80, stress: 40 }, 'pow', 'heavy');
trainCase('worn heavy, ring 20', { fatigue: 80, stress: 40 }, 'pow', 'heavy', { injuryBonus: 20 });
trainCase('worn heavy, ring 50', { fatigue: 80, stress: 40 }, 'pow', 'heavy', { injuryBonus: 50 });
trainCase('exhausted heavy', { fatigue: 95, stress: 70 }, 'skl', 'heavy');
trainCase('rest, worn', { fatigue: 80, stress: 50 }, 'rest', 'light');
trainCase('rest, lazy', { fatigue: 80, stress: 50, traits: ['Lazy'] }, 'rest', 'light');
trainCase('rest heals strain', { injury: 'strained' }, 'rest', 'light');
trainCase('injured cannot train', { injury: 'torn', injuryHit: 'POW' }, 'pow', 'heavy');
trainCase('injured, infirmary 2', { injury: 'torn', injuryHit: 'POW' }, 'pow', 'heavy', { healRate: 2 });
trainCase('hotheaded heavy', { traits: ['Hotheaded'] }, 'pow', 'heavy');
trainCase('fragile worn heavy', { traits: ['Fragile'], fatigue: 80, stress: 40 }, 'pow', 'heavy');
trainCase('stoic heavy', { traits: ['Stoic'] }, 'pow', 'heavy');
trainCase('prodigy light', { traits: ['Prodigy'] }, 'int', 'light');
trainCase('slack week', {}, 'pow', 'heavy', { effort: 'slack' });
trainCase('slack light', { discipline: 20, morale: 30 }, 'def', 'light', { effort: 'slack' });
trainCase('yarded gains', {}, 'skl', 'heavy', { equipMult: 1.2 });
trainCase('veteran gains', { age: 200 }, 'pow', 'light');
trainCase('twilight gains', { age: 280 }, 'pow', 'light');
trainCase('talented growth', { growth: [1.4, 1, 1, 1, 1, 1.2] }, 'pow', 'heavy');
trainCase('near cap', { stats: [96, 20, 20, 20, 20, 20] }, 'pow', 'heavy');
trainCase('low morale', { morale: 10 }, 'spd', 'light');

// ── The sparring cases ───────────────────────────────────────────────────────
const SPARS = [];
function sparCase(name, spec, partnerSpec, opts = {}) {
  const s = ++seed;
  const hero = mkHero(spec);
  const partner = mkHero(partnerSpec);
  const rep = withStream(s, () => T.applySpar(hero, partner, {}, opts));
  SPARS.push({
    name, seed: s, spec: JSON.stringify(spec), partner: JSON.stringify(partnerSpec),
    injuryBonus: opts.injuryBonus || 0,
    gains: statArr(rep.gains), after: snap(hero),
  });
}
sparCase('even bout', {}, {});
sparCase('stronger partner', {}, { stats: [40, 20, 40, 40, 20, 20] });
sparCase('weaker partner', { stats: [40, 20, 40, 40, 20, 20] }, {});
sparCase('worn contact risk', { fatigue: 85, stress: 45 }, {}, {});
sparCase('worn contact, ring', { fatigue: 85, stress: 45 }, {}, { injuryBonus: 50 });

// ── The conduct roll ─────────────────────────────────────────────────────────
const CONDUCT = [];
for (const spec of [{}, { discipline: 20, morale: 30 }, { discipline: 20, morale: 30, traits: ['Lazy'] }, { traits: ['Loyal'] }]) {
  for (let s = 1; s <= 4; s++) {
    const cs = ++seed;
    const hero = mkHero(spec);
    const conduct = withStream(cs, () => T.rollConduct(hero));
    CONDUCT.push({ seed: cs, spec: JSON.stringify(spec), slack: conduct === 'slack' ? 1 : 0 });
  }
}

// ── The pure preview odds, x1e6 ──────────────────────────────────────────────
// (ageMult/wearMult are module-private in training.js — they are witnessed
// through every case outcome above rather than probed directly.)
const M = (x) => Math.round(x * 1e6);
const previews = [];
for (const spec of [{}, { fatigue: 80, stress: 40 }, { fatigue: 95, stress: 70 }, { fatigue: 95, stress: 70, traits: ['Ironbody'] }])
  for (const heavy of [false, true])
    for (const bonus of [0, 20, 50]) {
      const hero = mkHero(spec);
      previews.push({ spec: JSON.stringify(spec), heavy: heavy ? 1 : 0, bonus,
                      v: M(T.previewInjuryChance(hero, heavy ? 'heavy' : 'light', { injuryBonus: bonus })) });
    }

const fixture = { stats: STATS, cases: CASES, spars: SPARS, conduct: CONDUCT, previews };
const out = join(ROOT, '..', '..', '..', '..', 'Guild Rancher',
                 'Assets', 'Tests', 'EditMode', 'training-fixture.json');
writeFileSync(out, JSON.stringify(fixture, null, 1));
console.log(`fixture → ${out}`);
console.log(`${CASES.length} training cases, ${SPARS.length} spars, ${CONDUCT.length} conduct rolls, ${previews.length} previews`);
