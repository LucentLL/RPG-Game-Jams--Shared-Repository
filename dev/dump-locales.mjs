/**
 * THE WILDS, WITNESSED — a fixture for the Unity port's Locales.cs.
 *
 * locales.js imports nothing (its typedefs are JSDoc-only), so unlike
 * dump-rooms.mjs there is nothing to lift: the REAL module is imported whole
 * and every answer below is the shipping code's own. The one impurity —
 * resolveHunt/resolveHuntPlayed drawing Math.random() (locales.js:169, 181)
 * — is witnessed by stubbing the global Math.random to NAMED rolls around
 * each call, so the fixture pins the exact double arithmetic at known luck.
 *
 * Every number here is an integer, per the fixture law: risk rides ×1000
 * (0.05 → 50), scores ride ×1000 through JS Math.round, and the named rolls
 * ride ×1000 with BOTH sides computing r = rX1000 / 1000 so the doubles
 * agree to the bit.
 *
 *     node dev/dump-locales.mjs
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const L = await import(new URL('../src/guild/locales.js', import.meta.url));

// ── Named luck: run the real resolver with Math.random pinned ────────────────
const realRandom = Math.random;
function withRoll(r, fn) {
  Math.random = () => r;
  try { return fn(); } finally { Math.random = realRandom; }
}

// ── The tables, verbatim ─────────────────────────────────────────────────────
const prey = Object.keys(L.PREY).map((id) => {
  const p = L.PREY[id];
  return {
    id: p.id, name: p.name, art: p.art, glyph: p.glyph, rank: p.rank, power: p.power,
    meatLo: p.meat[0], meatHi: p.meat[1], peltLo: p.pelt[0], peltHi: p.pelt[1],
    gold: p.gold, rep: p.rep, field: p.field,
    riskX1000: Math.round(p.risk * 1000),
    loot: p.loot || '', ranged: p.ranged || '',
    blurb: p.blurb,
  };
});

const locales = Object.keys(L.LOCALES).map((id) => {
  const l = L.LOCALES[id];
  return {
    id: l.id, name: l.name, glyph: l.glyph, biome: l.biome, tier: l.tier,
    start: l.start ? 1 : 0, preyIds: l.prey, blurb: l.blurb,
  };
});

const orderedIds = L.allLocales().map((l) => l.id);           // discovery/difficulty order
const startIds = L.allLocales().filter((l) => l.start).map((l) => l.id);

// ── The discovery walk: ensureWilds, then scout until the map completes ──────
const discovery = [];
{
  const g = {};
  L.ensureWilds(g);
  for (let step = 0; ; step++) {
    const found = L.discoveredLocales(g).map((l) => l.id);
    const cost = L.scoutCost(g);
    const next = L.discoverNextLocale(g);
    discovery.push({ step, found, cost, nextId: next ? next.id : '' });
    if (!next) break;
  }
}

// ── scoutCost over arbitrary discovery hands (stale ids never count) ─────────
const scoutHands = [
  [],                                       // impossible zero-found guild: the web prices it at −5g
  ['ferncreek'],
  ['ferncreek', 'thornwood'],
  ['ferncreek', 'thornwood', 'mistfen'],
  ['ferncreek', 'thornwood', 'mistfen', 'blackpine'],
  ['ferncreek', 'thornwood', 'mistfen', 'blackpine', 'hollowvein'],
  ['ferncreek', 'ghosttown'],               // a stale id a dropped table row left behind
  ['thornwood', 'hollowvein'],              // discovery out of tier order still just counts
];
const scoutCosts = scoutHands.map((ids) => {
  const discovered = {};
  for (const id of ids) discovered[id] = true;
  return { discovered: ids, cost: L.scoutCost({ wilds: { discovered } }) };
});

// ── resolveHunt at named luck, real module answering ─────────────────────────
const powerFn = (x) => x;                   // parties are raw power numbers; powerFn is the caller's
const parties = [[80], [50, 60], [100, 100, 100], [0], [333], [1000], []];
const rollsX1000 = [0, 1, 250, 500, 750, 999];
const resolvePrey = ['squirrel', 'badger', 'wolf', 'bear', 'ratking', 'slimeking'];

const resolves = [];
for (const preyId of resolvePrey)
  for (const party of parties)
    for (const rX1000 of rollsX1000) {
      const r = rX1000 / 1000;
      const res = withRoll(r, () => L.resolveHunt(L.PREY[preyId], party, powerFn));
      resolves.push({
        preyId, powers: party, rX1000,
        power: res.power,
        scoreX1000: Math.round(res.score * 1000),
        success: res.success ? 1 : 0,
      });
    }

const playedPrey = ['squirrel', 'wolf', 'slimeking'];
const playedParties = [[80], [100, 100, 100], [333]];
const played = [];
for (const preyId of playedPrey)
  for (const party of playedParties)
    for (const rX1000 of rollsX1000)
      for (const won of [0, 1]) {
        const r = rX1000 / 1000;
        const res = withRoll(r, () => L.resolveHuntPlayed(L.PREY[preyId], party, powerFn, won === 1));
        played.push({
          preyId, powers: party, rX1000, won,
          power: res.power,
          scoreX1000: Math.round(res.score * 1000),
          success: res.success ? 1 : 0,
        });
      }

// ── huntSpoils across the yield curve (and the ≥1.25 loot gate's brink) ──────
const spoilScoresX1000 = [0, 500, 1000, 1090, 1249, 1250, 1300, 1600, 2500, 10000];
const spoils = [];
for (const p of prey)
  for (const scoreX1000 of spoilScoresX1000) {
    const s = L.huntSpoils(L.PREY[p.id], scoreX1000 / 1000);
    spoils.push({
      preyId: p.id, scoreX1000,
      gold: s.gold, rep: s.rep, field: s.field, meat: s.meat, pelt: s.pelt,
      loot: s.loot || '',
    });
  }

// ── huntOdds across a spread of party powers, every prey ─────────────────────
const oddsPowers = [0, 1, 40, 64, 80, 96, 100, 120, 150, 160, 175, 200, 240, 250,
                    264, 280, 300, 330, 350, 400, 420, 437, 500, 600, 800, 1000];
const odds = [];
for (const p of prey)
  for (const power of oddsPowers) {
    const o = L.huntOdds(power, L.PREY[p.id]);
    odds.push({ preyId: p.id, power, pct: o.pct, txt: o.txt, cls: o.cls });
  }

const fixture = {
  prey, locales, orderedIds, startIds,
  discovery, scoutCosts,
  resolves, played, spoils, odds,
};
const out = join(ROOT, '..', '..', '..', '..', 'Guild Rancher',
                 'Assets', 'Tests', 'EditMode', 'locales-fixture.json');
writeFileSync(out, JSON.stringify(fixture, null, 1));
console.log(`fixture → ${out}`);
console.log(`${prey.length} prey, ${locales.length} locales, ${discovery.length} discovery steps,`
  + ` ${scoutCosts.length} scout hands, ${resolves.length} resolves, ${played.length} played,`
  + ` ${spoils.length} spoils, ${odds.length} odds`);
