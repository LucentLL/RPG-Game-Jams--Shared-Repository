/**
 * @file The Wilds — local areas around the guild you DISCOVER and HUNT.
 *
 * A companion to the quest board (quests.js), pitched at the same management
 * altitude: you dispatch a member (any archetype, any gear) to hunt a chosen
 * creature in a discovered area, and it AUTO-RESOLVES on Advance Week from party
 * power vs the prey's difficulty — with the same option to PLAY or SPECTATE the
 * climactic bout through the battle bridge (battle-bridge.js · playHuntBout).
 *
 * Areas start hidden. The nearest one (Ferncreek Hollow) is known from the start;
 * the rest are DISCOVERED — by commissioning a scout (gold), or as a byproduct of
 * questing (a returning party maps a new locale). Deeper areas hold bigger, meaner
 * game: squirrels and opossums give way to wolves and bears.
 *
 * A kill brings home GAME MEAT (feeds the Kitchen pantry / the Hunter's Table diet),
 * a PELT (a hide sold at the Market), gold, reputation, and FIELD INSIGHT — the same
 * third-skill track a quest teaches. So one hunt feeds three shipped loops at once:
 * diet/condition, trade income, and craft quality.
 *
 * Prey are shown as real pixel standees via art.js crops (artSprite(prey.art)); the
 * creature sheets were curated into public/assets/art/ and registered in art.js.
 */

const rand = (n) => Math.floor(Math.random() * n);
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/**
 * @typedef {Object} Prey
 * @property {string} id @property {string} name @property {string} art  art.js crop name
 * @property {string} glyph @property {number} rank @property {number} power  recommended party power
 * @property {[number,number]} meat  game-meat yield range (min,max) — scales with how cleanly you win
 * @property {[number,number]} pelt  pelt yield range (min,max); [0,0] = no hide (slimes, beetles)
 * @property {number} gold @property {number} rep @property {number} field  field insight on success
 * @property {number} risk  injury chance on the march (as quests)
 * @property {?string} loot  optional bonus material id on a clean kill (e.g. an herb), or null
 * @property {string} blurb
 */

/** @type {Object.<string,Prey>} */
export const PREY = {
  squirrel: { id: 'squirrel', name: 'Giant Squirrel', art: 'squirrel', glyph: '🐿', rank: 1, power: 80,
    meat: [1, 2], pelt: [1, 1], gold: 28, rep: 1, field: 3, risk: 0.05, loot: null,
    blurb: 'Quick and skittish — good practice game for a green hunter.' },
  opossum: { id: 'opossum', name: 'Opossum', art: 'opossum', glyph: '🦝', rank: 1, power: 100,
    meat: [1, 2], pelt: [1, 2], gold: 34, rep: 1, field: 3, risk: 0.06, loot: null,
    blurb: 'Plays dead, then bolts. A steady source of meat and hide.' },
  beetle: { id: 'beetle', name: 'Thornshell Beetle', art: 'beetle', glyph: '🪲', rank: 2, power: 150,
    meat: [0, 0], pelt: [2, 3], gold: 40, rep: 1, field: 4, risk: 0.1, loot: null,
    blurb: 'No meat on it, but the lacquered carapace fetches a fair price.' },
  badger: { id: 'badger', name: 'Ridgeback Badger', art: 'badger', glyph: '🦡', rank: 2, power: 165,
    meat: [2, 3], pelt: [1, 2], gold: 46, rep: 2, field: 4, risk: 0.14, loot: null,
    blurb: 'Corners hard and bites harder. A proper test of nerve.' },
  slime: { id: 'slime', name: 'Fen Slime', art: 'slime', glyph: '🟢', rank: 2, power: 175,
    meat: [0, 0], pelt: [0, 0], gold: 30, rep: 2, field: 5, risk: 0.08, loot: 'emberroot',
    blurb: 'Inedible and hideless, but its core condenses into rare reagent.' },
  wolf: { id: 'wolf', name: 'Dire Wolf', art: 'wolf', glyph: '🐺', rank: 3, power: 250,
    meat: [2, 4], pelt: [2, 3], gold: 64, rep: 3, field: 5, risk: 0.2, loot: null,
    blurb: 'Hunts in the mind even alone. Its pelt is worth the danger.' },
  bear: { id: 'bear', name: 'Cave Bear', art: 'bear', glyph: '🐻', rank: 4, power: 330,
    meat: [4, 6], pelt: [2, 4], gold: 92, rep: 4, field: 6, risk: 0.28, loot: null,
    blurb: 'The apex of the near country. Bring a party, and bring a plan.' },
};

/**
 * @typedef {Object} Locale
 * @property {string} id @property {string} name @property {string} glyph @property {string} biome
 * @property {number} tier  discovery order / difficulty band (1 = nearest, known from the start)
 * @property {boolean} start  known without scouting
 * @property {string[]} prey  prey ids offered here
 * @property {string} blurb
 */

/** @type {Object.<string,Locale>} */
export const LOCALES = {
  ferncreek: { id: 'ferncreek', name: 'Ferncreek Hollow', glyph: '🌿', biome: 'woodland', tier: 1, start: true,
    prey: ['squirrel', 'opossum', 'badger'],
    blurb: 'A ferny dell a stone’s throw past the south gate — where every guild bloods its hunters.' },
  thornwood: { id: 'thornwood', name: 'Thornwood', glyph: '🌲', biome: 'deep forest', tier: 2, start: false,
    prey: ['opossum', 'beetle', 'badger', 'wolf'],
    blurb: 'Old timber where the light goes green and the paths forget themselves.' },
  mistfen: { id: 'mistfen', name: 'Mistfen Marsh', glyph: '🐸', biome: 'wetland', tier: 3, start: false,
    prey: ['beetle', 'slime', 'badger'],
    blurb: 'Reed and black water. Things without bones move under the mist.' },
  blackpine: { id: 'blackpine', name: 'Blackpine Ridge', glyph: '⛰', biome: 'highland', tier: 4, start: false,
    prey: ['wolf', 'bear'],
    blurb: 'The near country’s roof. Only a proven party climbs it twice.' },
};

/** @param {string} id @returns {?Prey} */
export function preyById(id) { return PREY[id] || null; }
/** @param {string} id @returns {?Locale} */
export function localeById(id) { return LOCALES[id] || null; }

/** All locales in discovery/difficulty order. */
export function allLocales() { return Object.values(LOCALES).sort((a, b) => a.tier - b.tier); }

/**
 * Ensure the guild's Wilds discovery state exists (new games + old saves). The
 * starter locale(s) are always known; everything else waits to be discovered.
 * @param {import('./guild.js').Guild} guild
 */
export function ensureWilds(guild) {
  if (!guild.wilds || typeof guild.wilds !== 'object') guild.wilds = { discovered: {} };
  if (!guild.wilds.discovered || typeof guild.wilds.discovered !== 'object') guild.wilds.discovered = {};
  for (const l of allLocales()) if (l.start) guild.wilds.discovered[l.id] = true;
  return guild.wilds;
}

/** Is this locale known to the guild? */
export function isDiscovered(guild, localeId) {
  return !!(guild.wilds && guild.wilds.discovered && guild.wilds.discovered[localeId]);
}
/** Discovered locales, difficulty order. */
export function discoveredLocales(guild) { return allLocales().filter((l) => isDiscovered(guild, l.id)); }
/** Undiscovered locales, difficulty order (next to find is first). */
export function undiscoveredLocales(guild) { return allLocales().filter((l) => !isDiscovered(guild, l.id)); }

/** Gold to commission a scout for the NEXT area — rises as the near country is mapped. */
export function scoutCost(guild) {
  const found = discoveredLocales(guild).length;
  return 40 + (found - 1) * 45; // 40, 85, 130, ...
}

/**
 * Reveal the next-nearest undiscovered locale. Returns the newly-found Locale, or
 * null if the map is complete. Used by the Scout commission AND the quest-discovery
 * hook (a returning party stumbles on a new area).
 * @param {import('./guild.js').Guild} guild
 */
export function discoverNextLocale(guild) {
  ensureWilds(guild);
  const next = undiscoveredLocales(guild)[0];
  if (!next) return null;
  guild.wilds.discovered[next.id] = true;
  return next;
}

/**
 * Auto-resolve a hunt: combined party power vs the prey's recommended power, with
 * the same luck band as a quest (resolveQuest). @see quests.js
 * @param {Prey} prey @param {import('./hero.js').Hero[]} party
 * @param {(h:import('./hero.js').Hero)=>number} powerFn
 * @returns {{success:boolean, score:number, power:number}}
 */
export function resolveHunt(prey, party, powerFn) {
  const power = party.reduce((s, h) => s + powerFn(h), 0);
  const variance = 0.75 + Math.random() * 0.5; // 0.75..1.25 — the quarry's luck
  const score = (power / Math.max(1, prey.power)) * variance;
  return { success: score >= 1, score, power };
}

/**
 * Resolve a hunt whose bout the player PLAYED (battle-bridge). As with quests, the
 * duel shifts the luck band but never replaces the power check.
 * @see quests.js resolveQuestPlayed
 */
export function resolveHuntPlayed(prey, party, powerFn, won) {
  const power = party.reduce((s, h) => s + powerFn(h), 0);
  const variance = won ? 0.95 + Math.random() * 0.3 : 0.55 + Math.random() * 0.4;
  const score = (power / Math.max(1, prey.power)) * variance;
  return { success: score >= 1, score, power, played: true, won: !!won };
}

/** A yield within [min,max], scaled by how CLEANLY the hunt was won (score over the
 *  bar): a blowout brings the full haul, a squeaker the minimum. */
function yieldOf(range, score) {
  const [lo, hi] = range;
  if (hi <= lo) return lo;
  return lo + Math.round((hi - lo) * clamp01((score - 1) / 0.6));
}

/**
 * The spoils of a successful hunt. Caller pays these into the guild once per party.
 * @param {Prey} prey @param {number} score  resolveHunt().score
 * @returns {{gold:number, rep:number, field:number, meat:number, pelt:number, loot:?string}}
 */
export function huntSpoils(prey, score) {
  return {
    gold: prey.gold,
    rep: prey.rep,
    field: prey.field,
    meat: yieldOf(prey.meat, score),
    pelt: yieldOf(prey.pelt, score),
    // A clean kill (comfortably past the bar) sometimes yields the prey's rare drop.
    loot: prey.loot && score >= 1.25 ? prey.loot : null,
  };
}

/** Odds label for a party power vs prey — derived from the TRUE success probability
 *  of resolveHunt (variance uniform on [0.75,1.25]) so it can never drift from the
 *  resolver. Class names match the quest board's (up / '' / down). @see hall.js questOdds */
export function huntOdds(partyPower, prey) {
  const need = Math.max(1, prey.power) / Math.max(1, partyPower);
  const pct = Math.round(Math.max(0, Math.min(1, (1.25 - need) / 0.5)) * 100);
  if (pct >= 85) return { txt: 'Favorable', cls: 'up', pct };
  if (pct >= 50) return { txt: 'Even', cls: '', pct };
  if (pct >= 20) return { txt: 'Risky', cls: 'down', pct };
  return { txt: 'Grim', cls: 'down', pct };
}
