/**
 * @file Battle bridge (Phase 1) — the seam that lets the guild PLAY a battle instead
 * of auto-resolving it. The tactical engine lives in crucible.js and exposes
 * `window.playGuildBattle({player, opponent}) -> Promise<{winner,...}>`. Here we
 * adapt a guild Person into that call and map the outcome back into the exact shape
 * `resolveTournament` returns, so `advanceAll`'s tournament pre-pass consumes a played
 * result identically to a simulated one.
 *
 * Scope of Phase 1: a single climactic 1v1 duel stands in for the whole bracket —
 * win → Champion, lose → Eliminated. Gear→engine conversion and multi-round brackets
 * are deliberately deferred (see DESIGN.md · Playable combat).
 */
import { heroPower, traitAdd } from './hero.js';
import { roundOpponentPower } from './tournaments.js';

/** Map a guild Person to the minimal spec `window.playGuildBattle` expects. */
function heroSpec(hero) {
  return {
    name: hero.name,
    stats: hero.stats,
    archetype: hero.archetype,
    appearance: hero.appearance,
    appearanceSeed: hero.appearanceSeed,
    prime: hero.prime,
    // Obedience (K5): the tactical lens rolls P(obey)=(discipline+bond)/200 (+trait
    // mods) each executed turn — failure is Foolery, the hero fighting their own way.
    obedience: {
      discipline: hero.condition ? (hero.condition.discipline ?? 40) : 40,
      bond: hero.condition ? (hero.condition.loyalty ?? 60) : 60,
      obeyMod: traitAdd(hero, 'obey'),
    },
  };
}

const ARCHES = ['Knight', 'Ranger', 'Mage', 'Cleric', 'Rogue', 'Berserker'];
const CHAMPION_STYLE = ['Iron', 'Copper', 'Silver', 'Golden', 'Crimson', 'Shadow'];

/** Spread a target stat-sum across the six MR stats with a little jitter. */
function foeStats(targetPower) {
  const per = Math.max(10, Math.min(100, Math.round((targetPower || 120) / 6)));
  const jitter = () => Math.max(8, Math.min(100, per + Math.round((Math.random() - 0.5) * 12)));
  return { POW: jitter(), DEF: jitter(), SKL: jitter(), SPD: jitter(), INT: jitter(), VIT: jitter() };
}

const CONTENDER_NAMES = ['Bracket Contender', 'The Gatekeeper', 'A Rising Blade', 'The Veteran Circuit-Runner', 'The Crowd Favorite'];

/**
 * The opponent for round `i` of a tournament bracket. When the event carries a
 * drawn field (opts.field — the persistent named rivals the Tourney Board showed),
 * round `i` fights THAT rival: same name, face, and stat spread the player scouted.
 * Without a field (legacy events mid-save), fall back to a synthetic foe scaled to
 * the round's strength (roundOpponentPower — the resolver's own curve either way).
 * @param {import('./tournaments.js').Tournament} t @param {number} i 0-based round
 * @param {?{name:string,archetype:string,stats:Object,appearanceSeed:number}} rival
 */
function roundOpponent(t, i, rival) {
  if (rival && rival.stats) {
    return { name: rival.name, archetype: rival.archetype, stats: rival.stats, appearanceSeed: rival.appearanceSeed };
  }
  const rounds = t.rounds || 4;
  const isFinal = i >= rounds - 1;
  return {
    name: isFinal
      ? 'The ' + (CHAMPION_STYLE[Math.min(CHAMPION_STYLE.length - 1, (t.rank || 1) - 1)] || 'Iron') + ' Champion'
      : CONTENDER_NAMES[Math.min(CONTENDER_NAMES.length - 1, i)],
    archetype: ARCHES[Math.floor(Math.random() * ARCHES.length)],
    stats: foeStats(roundOpponentPower(t, i)),
    appearanceSeed: (Math.random() * 1e9) | 0,
  };
}

/** Named boss standing at the heart of each quest flavor (fallback: The Quarry). */
const QUEST_BOSSES = {
  'Clear the Warrens': 'The Warren Alpha',
  'Escort the Caravan': 'The Ambush Captain',
  'Slay the Beast': 'The Beast Itself',
  'Recover the Relic': 'The Relic Warden',
  'Purge the Ruins': 'The Ruin-Shade',
  'Break the Siege': 'The Siege Commander',
  'Hunt the Poachers': 'The Poacher King',
};

/** Is the playable battle engine available? (crucible.js may not have loaded.) */
export function battleEngineReady() {
  return typeof window !== 'undefined' && typeof window.playGuildBattle === 'function';
}

/**
 * Play a tournament as a FULL BRACKET, round by round, and return the same shape
 * `resolveTournament` does — `{power, rounds, wins, champion}` — so `placement()`
 * and the payout code run unchanged. Losing round i exits with i wins, restoring
 * the real Finalist (½ purse) / Semi-finalist (¼) placements the single-duel
 * stand-in used to flatten to Champion-or-nothing. Between won rounds, the caller's
 * `opts.interstitial(nextRound, rounds, nextFoePower)` asks "fight on or simulate
 * the rest?" — declined rounds resolve on the SAME power×variance curve the
 * simulated bracket uses (no hidden penalty either way).
 * @param {import('./hero.js').Hero} hero  the guild's nominated champion (single-entrant)
 * @param {import('./tournaments.js').Tournament} t
 * @param {{mode?:'action'|'tactical', items?:?Array,
 *          powerFn?:(h:any)=>number, field?:?Array,
 *          interstitial?:(nextRound:number, rounds:number, nextFoePower:number)=>Promise<boolean>}} [opts]
 * @returns {Promise<?{power:number, rounds:number, wins:number, champion:boolean, played:boolean, itemsUsed:?Object}>}
 */
export async function playTournamentMatch(hero, t, opts = {}) {
  if (!battleEngineReady()) return null;
  const rounds = t.rounds || 4;
  const powerFn = opts.powerFn || heroPower;
  const mode = opts.mode === 'tactical' || opts.mode === 'spectate' ? opts.mode : 'action';
  const field = Array.isArray(opts.field) ? opts.field : []; // drawn rivals, one per round (may be empty)
  const items = (opts.items || []).map((it) => ({ ...it })); // local kit — depletes across rounds
  const itemsUsed = {};
  let wins = 0;
  let simulateRest = false;
  for (let i = 0; i < rounds; i++) {
    if (simulateRest) {
      const variance = 0.8 + Math.random() * 0.4; // the resolver's own curve
      if (powerFn(hero) * variance >= roundOpponentPower(t, i)) { wins++; continue; }
      break;
    }
    const result = await window.playGuildBattle({
      player: heroSpec(hero), opponent: roundOpponent(t, i, field[i]),
      mode, label: t.name + ' — round ' + (i + 1) + ' of ' + rounds,
      items: items.filter((it) => it.qty > 0),
    });
    if (result && result.itemsUsed) {
      for (const id in result.itemsUsed) {
        itemsUsed[id] = (itemsUsed[id] || 0) + result.itemsUsed[id];
        const it = items.find((x) => x.batchId === id);
        if (it) it.qty = Math.max(0, it.qty - result.itemsUsed[id]);
      }
    }
    if (!(result && result.winner === 'player')) break; // eliminated in round i
    wins++;
    if (wins >= rounds) break;
    if (opts.interstitial) {
      const fightOn = await opts.interstitial(i + 2, rounds, Math.round(roundOpponentPower(t, i + 1)));
      if (!fightOn) simulateRest = true;
    }
  }
  return { power: powerFn(hero), rounds, wins, champion: wins === rounds, played: true,
    itemsUsed: Object.keys(itemsUsed).length ? itemsUsed : null };
}

/**
 * Play a quest's CLIMACTIC BOUT: the party's champion vs the boss at the heart of the
 * job, scaled to this party's share of the recommended power (a bigger party means a
 * smaller share of the fight is yours). The caller maps the outcome through
 * `resolveQuestPlayed` — the duel shifts the luck band, it never replaces the power
 * check. Returns null if the engine isn't loaded (caller falls back to simulate).
 * @param {import('./hero.js').Hero} hero  the strongest marcher (leads the charge)
 * @param {import('./quests.js').Quest} quest
 * @param {number} partySize
 * @param {{mode?:'action'|'tactical', items?:?Array}} [opts]
 * @returns {Promise<?{won:boolean, forfeit:boolean, itemsUsed:?Object}>}
 */
export async function playQuestBout(hero, quest, partySize, opts = {}) {
  if (!battleEngineReady()) return null;
  const foe = {
    name: QUEST_BOSSES[quest.title] || 'The Quarry',
    archetype: ARCHES[Math.floor(Math.random() * ARCHES.length)],
    stats: foeStats((quest.recommendedPower || 120) / Math.max(1, partySize)),
    appearanceSeed: (Math.random() * 1e9) | 0,
  };
  const result = await window.playGuildBattle({
    player: heroSpec(hero), opponent: foe,
    mode: opts.mode === 'tactical' || opts.mode === 'spectate' ? opts.mode : 'action',
    label: quest.title,
    items: opts.items || null,
  });
  return {
    won: !!(result && result.winner === 'player'),
    forfeit: !!(result && result.forfeit),
    itemsUsed: (result && result.itemsUsed) || null,
  };
}
