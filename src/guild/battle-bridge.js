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
import { heroPower } from './hero.js';

/** Map a guild Person to the minimal spec `window.playGuildBattle` expects. */
function heroSpec(hero) {
  return {
    name: hero.name,
    stats: hero.stats,
    archetype: hero.archetype,
    appearance: hero.appearance,
    appearanceSeed: hero.appearanceSeed,
    prime: hero.prime,
  };
}

const ARCHES = ['Knight', 'Ranger', 'Mage', 'Cleric', 'Rogue', 'Berserker'];
const CHAMPION_STYLE = ['Iron', 'Copper', 'Silver', 'Golden', 'Crimson', 'Shadow'];

/**
 * A synthetic tournament opponent scaled to the event's field. The played duel stands
 * in for the bracket final, so aim at the tougher end (~final-round strength) and
 * spread that target stat-sum across the six MR stats with a little jitter.
 * @param {import('./tournaments.js').Tournament} t
 */
function syntheticOpponent(t) {
  const target = (t.field || 150) * 1.1;
  const per = Math.max(10, Math.min(100, Math.round(target / 6)));
  const jitter = () => Math.max(8, Math.min(100, per + Math.round((Math.random() - 0.5) * 12)));
  return {
    name: 'The ' + (CHAMPION_STYLE[Math.min(CHAMPION_STYLE.length - 1, (t.rank || 1) - 1)] || 'Iron') + ' Champion',
    archetype: ARCHES[Math.floor(Math.random() * ARCHES.length)],
    stats: { POW: jitter(), DEF: jitter(), SKL: jitter(), SPD: jitter(), INT: jitter(), VIT: jitter() },
    appearanceSeed: (Math.random() * 1e9) | 0,
  };
}

/** Is the playable battle engine available? (crucible.js may not have loaded.) */
export function battleEngineReady() {
  return typeof window !== 'undefined' && typeof window.playGuildBattle === 'function';
}

/**
 * Play a tournament as a single duel and return the same shape `resolveTournament`
 * does — `{power, rounds, wins, champion}` — so `placement()` and the payout code run
 * unchanged. Returns `null` if the engine isn't loaded (caller falls back to simulate).
 * @param {import('./hero.js').Hero} hero  the guild's nominated champion (single-entrant)
 * @param {import('./tournaments.js').Tournament} t
 * @returns {Promise<?{power:number, rounds:number, wins:number, champion:boolean, played:boolean}>}
 */
export async function playTournamentMatch(hero, t) {
  if (!battleEngineReady()) return null;
  const result = await window.playGuildBattle({ player: heroSpec(hero), opponent: syntheticOpponent(t) });
  const won = !!(result && result.winner === 'player');
  const rounds = t.rounds || 4;
  return { power: heroPower(hero), rounds, wins: won ? rounds : 0, champion: won, played: true };
}
