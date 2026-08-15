/**
 * THE SEASON, WITNESSED — a fixture for the Unity port's Tournaments/Events/Rivals.
 *
 * tournaments.js, events.js and rivals.js import only hero.js — nothing
 * browser-bound — so the REAL functions answer here. Everything that draws
 * randomness runs under a PATCHED Math.random: the same mulberry32 stream
 * (rng.js elementsRng) the C# replays through ElementsGen.Rng. The DRAW ORDER
 * is as load-bearing as the numbers, so every seeded row also records `draws`
 * — the count of Math.random() calls the web consumed. resolveTournament
 * BREAKS on the first loss (it does not roll variance for the rounds after);
 * a port that rolls them anyway matches every `wins` here and still desyncs
 * the rest of the week, and only `draws` catches it.
 *
 * Per the fixture law non-integer values ride as x1e6 ints in a `...X1e6`
 * field (JsonUtility parses a 17-digit decimal a ulp off). Powers, purses,
 * ranks, severityOverflow and appearanceSeed are already integers in the web
 * and ride as-is. `loot: null` rides as "" — the none-sentinel the contract
 * pins, since JsonUtility has no null string.
 *
 * Generated ids are NOT deterministic (tournaments.js:24 and rivals.js:24 draw
 * their run prefix from the REAL Math.random at import time, before any patch),
 * so a generated id rides as "". Ids I authored myself ride through verbatim —
 * that is how the promote-IN-PLACE cases prove they kept their identity.
 *
 *     node dev/dump-tournaments.mjs
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { elementsRng } = await import(new URL('../src/game/engine/rng.js', import.meta.url));
const T = await import(new URL('../src/guild/tournaments.js', import.meta.url));
const E = await import(new URL('../src/guild/events.js', import.meta.url));
const R = await import(new URL('../src/guild/rivals.js', import.meta.url));
const H = await import(new URL('../src/guild/hero.js', import.meta.url));

const STATS = H.HERO_STATS; // ['POW','DEF','SKL','SPD','INT','VIT']
const M = (x) => Math.round(x * 1e6);

// ── The patched stream, with a draw counter ─────────────────────────────────
const realRandom = Math.random;
let _draws = 0;
function withStream(seed, fn) {
  const gen = elementsRng(seed);
  _draws = 0;
  Math.random = () => { _draws += 1; return gen(); };
  try { return fn(); } finally { Math.random = realRandom; }
}
const drawsUsed = () => _draws;

/** A generated id is a fresh run-prefix each `node` run — do not pin it. */
const idOf = (t) => (!t || !t.id || /^tourney_|^rival_/.test(t.id) ? '' : t.id);
const lootOf = (t) => (t && t.rewards && t.rewards.loot) || '';
const statArr = (o) => STATS.map((s) => (o && o[s]) || 0);

/** One schedule entry, flattened the way the C# test reads it. */
function eventRow(t) {
  return {
    id: idOf(t), week: t.week, type: t.type, name: t.name, rank: t.rank,
    field: t.field, rounds: t.rounds,
    gold: t.rewards.gold, rep: t.rewards.reputation, loot: lootOf(t),
    entrants: (t.entrants || []).slice(), resolved: t.resolved ? 1 : 0,
  };
}

/** The synthetic guild events.js/rivals.js mutate — exactly hall.js's shape. */
function mkGuild(spec = {}) {
  return {
    calendar: { week: spec.week ?? 1, year: spec.year ?? 1, weekOfYear: spec.weekOfYear ?? 1 },
    schedule: spec.schedule || [],
    rivals: spec.rivals || [],
    reputation: spec.reputation ?? 0,
  };
}

// ═══ constants ══════════════════════════════════════════════════════════════
// tournaments.js:14-19 — the flavour names by rank tier, verbatim and in order
// (generateTournament picks with rand(names.length), so the ORDER is the draw).
// Rows, not a string[][]: JsonUtility cannot deserialize a nested array.
const circuits = [
  ['The Village Cup', 'The Harvest Melee', 'The Copper Circuit'],
  ['The Iron Tournament', 'The Free Cities Open', "The Wardens' Trial"],
  ['The Silver Gauntlet', 'The Grand Melee', "The Champions' League"],
  ['The Crown Tournament', 'The Mythic Invitational', 'The Adamant Crucible'],
].map((names, i) => ({ tier: i, names }));

// tournaments.js:161-165 — stakesOf falls back to the `tournament` row for an
// unknown type, so 'festival' below must read identical to 'tournament'.
const stakes = ['tournament', 'major', 'worldcup', 'festival', ''].map((type) => {
  const s = T.stakesOf({ type });
  return {
    type, tier: s.tier, glyph: s.glyph, danger: s.danger,
    injuryX1e6: M(s.injury), deathX1e6: M(s.death), deathRampX1e6: M(s.deathRamp),
  };
});

// events.js:29-33 — EVENT_TYPES display identity; an unknown type reads "" x3.
const eventTypes = ['tournament', 'major', 'worldcup', 'festival'].map((type) => {
  const e = E.EVENT_TYPES[type];
  return { type, glyph: (e && e.glyph) || '', name: (e && e.name) || '', blurb: (e && e.blurb) || '' };
});

// events.js:19 — the 48-week year split into four 12-week seasons.
const seasonOf = [];
for (let wy = 1; wy <= 48; wy++) seasonOf.push({ weekOfYear: wy, season: E.seasonOf(wy) });

// tournaments.js:40-54 — createTournament's defaults, with nothing supplied.
const bare = T.createTournament();
const defaults = {
  type: bare.type, name: bare.name, rank: bare.rank, week: bare.week,
  field: bare.field, rounds: bare.rounds,
  gold: bare.rewards.gold, rep: bare.rewards.reputation, loot: lootOf(bare),
  entrants: bare.entrants.length, resolved: bare.resolved ? 1 : 0,
};

// tournaments.js:57-69 / 192-203 — the per-rank generators. generateTournament
// draws ONE random (the circuit name); generateWorldCup draws none.
const generated = [];
let gseed = 700;
for (const rank of [0, 1, 2, 3, 4, 5, 9]) {
  const s = ++gseed;
  const t = withStream(s, () => T.generateTournament(rank, 40));
  generated.push({ kind: 'tournament', seed: s, rankIn: rank, draws: drawsUsed(), ...eventRow(t) });
  const wc = withStream(s, () => T.generateWorldCup(rank, 192));
  generated.push({ kind: 'worldcup', seed: s, rankIn: rank, draws: drawsUsed(), ...eventRow(wc) });
}

// ═══ roundPowers ════════════════════════════════════════════════════════════
// tournaments.js:107-110 — t.field * (0.65 + i * (0.7 / max(1, rounds-1))).
// rounds === 1 makes the divisor 1, so round 0 is field*0.65 and there is no
// lerp to 1.35; rounds === 0 falls back to 4 through `t.rounds || 4`.
const roundPowers = [];
for (const field of [150, 270, 390, 510, 585, 1, 0])
  for (const rounds of [0, 1, 2, 3, 4, 5, 6]) {
    const t = T.createTournament({ field, rounds });
    const eff = t.rounds || 4;
    const powers = [];
    for (let i = 0; i < eff; i++) powers.push(M(T.roundOpponentPower(t, i)));
    roundPowers.push({ field, rounds, eff, powersX1e6: powers });
  }

// ═══ resolves ═══════════════════════════════════════════════════════════════
// tournaments.js:121-131 — the lineup's summed power vs the escalating field.
// The lineup is driven through an EXPLICIT powerFn so the case does not depend
// on heroPower; `lineupPowers` is what the C# powerFn must return, in order.
const resolves = [];
let rseed = 1000;
function resolveCase(name, field, rounds, lineupPowers) {
  const s = ++rseed;
  const t = T.createTournament({ field, rounds });
  const lineup = lineupPowers.map((p) => ({ p }));
  const res = withStream(s, () => T.resolveTournament(t, lineup, (h) => h.p));
  const pl = T.placement(res);
  resolves.push({
    name, seed: s, field, rounds, lineupPowers: lineupPowers.slice(),
    draws: drawsUsed(),
    power: res.power, roundsOut: res.rounds, wins: res.wins,
    champion: res.champion ? 1 : 0,
    label: pl.label, place: pl.place, fracX1e6: M(pl.frac),
  });
}
for (const power of [40, 100, 150, 200, 260, 400, 700]) {
  resolveCase(`solo ${power} vs 150/4`, 150, 4, [power]);
  resolveCase(`solo ${power} vs 390/5`, 390, 5, [power]);
}
resolveCase('party of three vs 270/4', 270, 4, [120, 90, 75]);
resolveCase('party of six vs 585/6', 585, 6, [140, 130, 120, 110, 100, 90]);
resolveCase('overwhelming vs 150/1', 150, 1, [900]);
resolveCase('hopeless vs 150/1', 150, 1, [10]);
resolveCase('rounds fallback (0)', 150, 0, [200]);
resolveCase('empty lineup', 150, 4, []);
resolveCase('knife edge 150/4', 150, 4, [130]);
resolveCase('knife edge 150/4 b', 150, 4, [131]);
resolveCase('knife edge 150/4 c', 150, 4, [132]);

// tournaments.js:134-140 — placement over the whole (wins, rounds) grid, so the
// `wins === rounds-1` / `>= ceil(rounds/2)` / `>= 1` ladder is pinned exactly.
const placements = [];
for (let rounds = 1; rounds <= 6; rounds++)
  for (let wins = 0; wins <= rounds; wins++) {
    const pl = T.placement({ wins, rounds, champion: wins === rounds });
    placements.push({ rounds, wins, champion: wins === rounds ? 1 : 0,
                      label: pl.label, place: pl.place, fracX1e6: M(pl.frac) });
  }

// ═══ odds ═══════════════════════════════════════════════════════════════════
// tournaments.js:147-154 — the product of each round's factor, EACH clamped to
// 0..1 before it multiplies (clamp-after-multiply gives different numbers).
const odds = [];
for (const power of [0, 1, 50, 100, 150, 200, 260, 340, 500, 900, 2000])
  for (const [field, rounds] of [[150, 4], [270, 4], [390, 5], [585, 6], [150, 1], [150, 0]]) {
    const t = T.createTournament({ field, rounds });
    odds.push({ power, field, rounds, oddsX1e6: M(T.championOdds(power, t)) });
  }

// ═══ harm ═══════════════════════════════════════════════════════════════════
// tournaments.js:177-187 — every event type x every depth x a mismatch sweep.
// fought = champion ? rounds : min(rounds, wins+1); mismatch clamps to [0.6,2.4];
// a CHAMPION's deathChance is exactly 0; severityOverflow is a JS Math.round of
// a value that goes NEGATIVE when the mismatch clamp bottoms out at 0.6.
const harm = [];
for (const type of ['tournament', 'major', 'worldcup', 'festival'])
  for (const [field, rounds] of [[150, 4], [390, 5], [585, 6], [150, 1]])
    for (let wins = 0; wins <= rounds; wins++)
      for (const power of [1, 40, 100, 200, 400, 900, 5000]) {
        const t = T.createTournament({ type, field, rounds });
        const res = { wins, rounds, champion: wins === rounds };
        const h = T.competitionHarm(t, power, res);
        harm.push({
          type, field, rounds, wins, champion: res.champion ? 1 : 0, power,
          injuryChanceX1e6: M(h.injuryChance), deathChanceX1e6: M(h.deathChance),
          severityOverflow: h.severityOverflow,
        });
      }

// ═══ seasons ════════════════════════════════════════════════════════════════
// events.js:49-96 — minors on season-weeks 2/6/10, the MAJOR on 12; a booked
// week is skipped EXCEPT a squatter on a season-week-12 slot, which is promoted
// IN PLACE (id + entrants preserved).
const seasons = [];
let sseed = 2000;
function seasonCase(name, spec, horizon) {
  const s = ++sseed;
  const guild = mkGuild(spec);
  const before = guild.schedule.map(eventRow);
  withStream(s, () => (horizon === undefined ? E.generateSeason(guild) : E.generateSeason(guild, horizon)));
  seasons.push({
    name, seed: s, week: guild.calendar.week, weekOfYear: spec.weekOfYear ?? 1,
    reputation: spec.reputation ?? 0, horizon: horizon ?? 14,
    draws: drawsUsed(), before, events: guild.schedule.map(eventRow),
  });
}
seasonCase('rep 0 from week 1', { week: 1, weekOfYear: 1, reputation: 0 });
seasonCase('rep 59 (still rank 1)', { week: 1, weekOfYear: 1, reputation: 59 });
seasonCase('rep 60 (rank 2)', { week: 1, weekOfYear: 1, reputation: 60 });
seasonCase('rep 120 (rank 3)', { week: 1, weekOfYear: 1, reputation: 120 });
seasonCase('rep 600 (rank CLAMPED to 4)', { week: 1, weekOfYear: 1, reputation: 600 });
seasonCase('year wrap, week 40', { week: 40, weekOfYear: 40, reputation: 90 });
seasonCase('anchored calendar (week 100, woy 4)', { week: 100, weekOfYear: 4, reputation: 180 });
seasonCase('horizon 26, two majors', { week: 1, weekOfYear: 1, reputation: 0 }, 26);
seasonCase('horizon 1, nothing fits', { week: 1, weekOfYear: 1, reputation: 0 }, 1);
seasonCase('squatter PROMOTED on the major slot', {
  week: 1, weekOfYear: 1, reputation: 0,
  schedule: [T.createTournament({ id: 'sq_major', name: 'Squatter Open', rank: 2, week: 12,
                                  field: 200, rounds: 4, entrants: ['hero_a', 'hero_b'],
                                  rewards: { gold: 400, reputation: 10, loot: null } })],
});
seasonCase('squatter with loot keeps it', {
  week: 1, weekOfYear: 1, reputation: 300,
  schedule: [T.createTournament({ id: 'sq_loot', name: 'Squatter Rich', rank: 4, week: 12,
                                  field: 500, rounds: 6, entrants: ['hero_c'],
                                  rewards: { gold: 900, reputation: 30, loot: 'mithril_ore' } })],
});
seasonCase('squatter on a MINOR slot is left alone', {
  week: 1, weekOfYear: 1, reputation: 0,
  schedule: [T.createTournament({ id: 'sq_minor', name: 'Squatter Minor', rank: 1, week: 6,
                                  field: 150, rounds: 4, entrants: ['hero_d'] })],
});
seasonCase('an existing major is NOT re-promoted', {
  week: 1, weekOfYear: 1, reputation: 0,
  schedule: [T.createTournament({ id: 'sq_maj2', type: 'major', name: 'Already Major', rank: 2,
                                  week: 12, field: 260, rounds: 5, entrants: ['hero_e'],
                                  rewards: { gold: 800, reputation: 20, loot: 'steel_ore' } })],
});
seasonCase('a resolved entry is dropped, its week re-books', {
  week: 1, weekOfYear: 1, reputation: 0,
  schedule: [T.createTournament({ id: 'sq_done', name: 'Finished', week: 6, resolved: true })],
});

// ═══ worldCups ══════════════════════════════════════════════════════════════
// events.js:105-117 — books at ceil((week+1)/192)*192; a squatter is promoted
// IN PLACE keeping its id and entrants (Object.assign(existing, wc, {id, entrants})).
// generateWorldCup draws NO randomness, so every row here must report draws 0.
const worldCups = [];
let wseed = 3000;
function wcCase(name, spec) {
  const s = ++wseed;
  const guild = mkGuild(spec);
  const before = guild.schedule.map(eventRow);
  const ret = withStream(s, () => E.ensureWorldCup(guild));
  worldCups.push({
    name, seed: s, week: guild.calendar.week, reputation: spec.reputation ?? 0,
    draws: drawsUsed(), returned: ret === undefined ? 0 : 1,
    before, events: guild.schedule.map(eventRow),
  });
}
wcCase('empty schedule, week 1', { week: 1, reputation: 0 });
wcCase('empty schedule, week 191', { week: 191, reputation: 0 });
wcCase('week 192 books the NEXT cup', { week: 192, reputation: 300 });
wcCase('week 193', { week: 193, reputation: 0 });
wcCase('rep 600 clamps the rank', { week: 1, reputation: 600 });
wcCase('squatter PROMOTED in place', {
  week: 1, reputation: 0,
  schedule: [T.createTournament({ id: 'sq_wc', name: 'Squatter Cup', rank: 1, week: 192,
                                  field: 150, rounds: 4, entrants: ['hero_f', 'hero_g'] })],
});
wcCase('already booked → early return', {
  week: 1, reputation: 0,
  schedule: [T.createTournament({ id: 'wc_here', type: 'worldcup', name: 'The World Cup',
                                  rank: 2, week: 192, field: 405, rounds: 6,
                                  rewards: { gold: 2800, reputation: 60, loot: 'mithril_ore' } })],
});
wcCase('a worldcup on the WRONG week does not count', {
  week: 1, reputation: 0,
  schedule: [T.createTournament({ id: 'wc_late', type: 'worldcup', name: 'The World Cup',
                                  rank: 2, week: 384, field: 405, rounds: 6 })],
});
wcCase('other events survive the booking', {
  week: 1, reputation: 0,
  schedule: [T.createTournament({ id: 'keep_me', name: 'Minor', week: 6 }),
             T.createTournament({ id: 'drop_me', name: 'Done', week: 2, resolved: true })],
});

// ═══ rivals ═════════════════════════════════════════════════════════════════
// rivals.js:56-69 — createRival's draw order is FORE, AFT, ARCHES,
// appearanceSeed, then spreadStats' six, then record.w (rand 6), record.l
// (rand 4): TWELVE draws, in that order, inside the object literal.
function rivalRow(r, idx) {
  return {
    idx, name: r.name, archetype: r.archetype, appearanceSeed: r.appearanceSeed,
    power: r.power, stats: statArr(r.stats),
    recW: r.record.w, recL: r.record.l, recD: r.record.d,
    titles: r.titles, seenWeek: r.seenWeek,
  };
}
const rivalsCreated = [];
let vseed = 4000;
for (const power of [0, 10, 30, 120, 300, 600, 900, 5000])
  for (const week of [1, 77]) {
    const s = ++vseed;
    const r = withStream(s, () => R.createRival(power, week));
    rivalsCreated.push({ seed: s, powerIn: power, weekIn: week, draws: drawsUsed(), ...rivalRow(r, -1) });
  }

// rivals.js:87-117 — ensureField. `pool` seeds a deterministic starting pool of
// exact powers (created OUTSIDE the case seed, then hand-set) so the ±25%
// nearest-wins search is exercised on known numbers rather than on noise.
const rivalFields = [];
let fseed = 5000;
function poolOf(powers, week) {
  // Minted on their own stream, then pinned to exact powers/records so the case
  // is about the SEARCH, not about createRival's draws (pinned above already).
  return powers.map((p, i) => {
    const r = withStream(9000 + i, () => R.createRival(p, week));
    r.power = p; r.record = { w: 0, l: 0, d: 0 }; r.titles = 0; r.seenWeek = week;
    return r;
  });
}
function fieldCase(name, spec, pick) {
  const s = ++fseed;
  const guild = mkGuild(spec);
  const t = pick(guild);
  const poolBefore = guild.rivals.length;
  const changed = withStream(s, () => R.ensureField(guild, t));
  const index = new Map(guild.rivals.map((r, i) => [r.id, i]));
  rivalFields.push({
    name, seed: s, week: guild.calendar.week, draws: drawsUsed(),
    changed: changed ? 1 : 0, poolBefore, poolAfter: guild.rivals.length,
    drawn: (t.rivalIds || []).map((id) => index.has(id) ? index.get(id) : -1),
    drawnOther: [],
    field: guild.rivals.map((r, i) => rivalRow(r, i)),
  });
  return { guild, t };
}
fieldCase('empty pool mints the whole field', { week: 5, schedule: [], rivals: [] }, (g) => {
  const t = T.createTournament({ id: 'ef1', field: 150, rounds: 4, week: 20 });
  g.schedule.push(t); return t;
});
fieldCase('pool sits exactly on the round targets', {
  week: 5, rivals: poolOf([97.5, 130, 162.5, 195], 3),
}, (g) => {
  const t = T.createTournament({ id: 'ef2', field: 150, rounds: 4, week: 20 });
  g.schedule.push(t); return t;
});
fieldCase('the NEAREST inside 25% wins, not the first', {
  // Round 0 wants 97.5: 80 is a 0.179 gap, 95 is a 0.026 gap — 95 must win even
  // though 80 is scanned first and already qualified (bestGap tightens).
  week: 5, rivals: poolOf([80, 95, 300, 301, 302, 303], 3),
}, (g) => {
  const t = T.createTournament({ id: 'ef3', field: 150, rounds: 4, week: 20 });
  g.schedule.push(t); return t;
});
fieldCase('nothing within 25% mints new blood', {
  week: 5, rivals: poolOf([12, 14, 16, 18], 3),
}, (g) => {
  const t = T.createTournament({ id: 'ef4', field: 390, rounds: 5, week: 20 });
  g.schedule.push(t); return t;
});
fieldCase('rounds fallback (0 → 4)', { week: 5, rivals: [] }, (g) => {
  const t = T.createTournament({ id: 'ef5', field: 270, rounds: 0, week: 20 });
  g.schedule.push(t); return t;
});
fieldCase('a resolved event draws nothing', { week: 5, rivals: [] }, (g) => {
  const t = T.createTournament({ id: 'ef6', field: 150, rounds: 4, week: 20, resolved: true });
  g.schedule.push(t); return t;
});
// The idempotence pass: ensureField on an already-drawn field returns false and
// draws NOTHING (rivals.js:92) — the repair path must not retune a live board.
{
  const s = ++fseed;
  const guild = mkGuild({ week: 5, rivals: [] });
  const t = T.createTournament({ id: 'ef7', field: 150, rounds: 4, week: 20 });
  guild.schedule.push(t);
  withStream(s, () => R.ensureField(guild, t));
  const firstDraw = (t.rivalIds || []).slice();
  const again = withStream(s + 1, () => R.ensureField(guild, t));
  const index = new Map(guild.rivals.map((r, i) => [r.id, i]));
  rivalFields.push({
    name: 'second pass is a no-op', seed: s + 1, week: 5, draws: drawsUsed(),
    changed: again ? 1 : 0, poolBefore: guild.rivals.length, poolAfter: guild.rivals.length,
    drawn: firstDraw.map((id) => index.get(id)), drawnOther: [],
    field: guild.rivals.map((r, i) => rivalRow(r, i)),
  });
  // A dangling id (the rival died / was pruned) forces the WHOLE field to redraw.
  t.rivalIds[2] = 'rival_gone';
  const s3 = ++fseed;
  const redrew = withStream(s3, () => R.ensureField(guild, t));
  const index3 = new Map(guild.rivals.map((r, i) => [r.id, i]));
  rivalFields.push({
    name: 'a dangling id forces a full redraw', seed: s3, week: 5, draws: drawsUsed(),
    changed: redrew ? 1 : 0, poolBefore: 4, poolAfter: guild.rivals.length,
    drawn: (t.rivalIds || []).map((id) => index3.has(id) ? index3.get(id) : -1),
    drawnOther: [],
    field: guild.rivals.map((r, i) => rivalRow(r, i)),
  });
}
// The `taken` set spans every OTHER unresolved event — a rival cannot stand in
// two live fields at once (rivals.js:96-99).
{
  const s = ++fseed;
  const guild = mkGuild({ week: 5, rivals: poolOf([97.5, 130, 162.5, 195], 3) });
  const a = T.createTournament({ id: 'twin_a', field: 150, rounds: 4, week: 20 });
  const b = T.createTournament({ id: 'twin_b', field: 150, rounds: 4, week: 28 });
  guild.schedule.push(a, b);
  withStream(s, () => R.ensureField(guild, a));
  const s2 = ++fseed;
  const changed = withStream(s2, () => R.ensureField(guild, b));
  const index = new Map(guild.rivals.map((r, i) => [r.id, i]));
  rivalFields.push({
    name: 'a rival cannot stand in two live fields', seed: s2, week: 5, draws: drawsUsed(),
    changed: changed ? 1 : 0, poolBefore: 4, poolAfter: guild.rivals.length,
    drawn: (b.rivalIds || []).map((id) => index.get(id)),
    drawnOther: (a.rivalIds || []).map((id) => index.get(id)),
    field: guild.rivals.map((r, i) => rivalRow(r, i)),
  });
}

// rivals.js:127-148 — recordFieldOutcome. Every drawn rival banks `i` wins for
// the matches that carried them to round i+1, THEN the beat/stopped-you branch,
// THEN the final rival's title — with the double-count guard for the case where
// your champion reached the final and lost it (that W is already booked).
// This function draws NO randomness.
const rivalOutcomes = [];
function outcomeCase(name, rounds, res) {
  const guild = mkGuild({ week: 30, rivals: [] });
  const t = T.createTournament({ id: 'oc', field: 150, rounds, week: 30 });
  guild.schedule.push(t);
  guild.rivals = poolOf(Array.from({ length: rounds }, (_, i) => 100 + i * 10), 30);
  guild.rivals.forEach((r, i) => { r.record = { w: i, l: i, d: 0 }; r.titles = i; });
  t.rivalIds = guild.rivals.map((r) => r.id);
  const before = guild.rivals.map((r) => ({ w: r.record.w, l: r.record.l, d: r.record.d, titles: r.titles }));
  _draws = 0;
  const saved = Math.random; Math.random = () => { _draws += 1; return saved(); };
  try { R.recordFieldOutcome(guild, t, res); } finally { Math.random = saved; }
  rivalOutcomes.push({
    name, rounds, draws: drawsUsed(),
    res: res === null ? 'null' : JSON.stringify(res),
    // Explicit, so the C# passes a nullable res without re-parsing a JSON string.
    resNull: res === null ? 1 : 0,
    resWins: res ? (res.wins || 0) : 0,
    resRounds: res ? (res.rounds || 0) : 0,
    resChampion: res && res.champion ? 1 : 0,
    resForfeit: res && res.forfeit ? 1 : 0,
    deltas: guild.rivals.map((r, i) => ({
      idx: i,
      dW: r.record.w - before[i].w, dL: r.record.l - before[i].l,
      dD: r.record.d - before[i].d, dTitles: r.titles - before[i].titles,
    })),
  });
}
for (const rounds of [1, 4, 6]) {
  for (let wins = 0; wins <= rounds; wins++)
    outcomeCase(`rounds ${rounds}, wins ${wins}`, rounds, { wins, rounds, champion: wins === rounds });
  outcomeCase(`rounds ${rounds}, forfeit`, rounds, { forfeit: true, wins: 0, rounds, champion: false });
  outcomeCase(`rounds ${rounds}, null res`, rounds, null);
}
// A field shorter than `rounds` (a legacy save) must not crash — ids[rounds-1]
// is undefined and rivalById returns null.
{
  const guild = mkGuild({ week: 30, rivals: poolOf([100, 110], 30) });
  const t = T.createTournament({ id: 'oc_short', field: 150, rounds: 4, week: 30 });
  guild.schedule.push(t);
  t.rivalIds = guild.rivals.map((r) => r.id);
  const before = guild.rivals.map((r) => ({ w: r.record.w, l: r.record.l, d: r.record.d, titles: r.titles }));
  R.recordFieldOutcome(guild, t, { wins: 1, rounds: 4, champion: false });
  rivalOutcomes.push({
    name: 'short field (2 rivals, rounds 4)', rounds: 4, draws: 0,
    res: JSON.stringify({ wins: 1, rounds: 4, champion: false }),
    resNull: 0, resWins: 1, resRounds: 4, resChampion: 0, resForfeit: 0,
    deltas: guild.rivals.map((r, i) => ({
      idx: i, dW: r.record.w - before[i].w, dL: r.record.l - before[i].l,
      dD: r.record.d - before[i].d, dTitles: r.titles - before[i].titles,
    })),
  });
}

// rivals.js:155-164 — pruneRivals. The `pool.length <= 24` early return means a
// small pool NEVER prunes, however stale; drawn rivals are kept regardless.
const prunes = [];
function pruneCase(name, poolSpec, maxIdle) {
  const guild = mkGuild({ week: 200, rivals: [] });
  guild.rivals = poolOf(poolSpec.map(() => 100), 1);
  guild.rivals.forEach((r, i) => { r.seenWeek = poolSpec[i]; });
  const t = T.createTournament({ id: 'pr', field: 150, rounds: 2, week: 210 });
  t.rivalIds = [guild.rivals[0].id];
  guild.schedule.push(t);
  const beforeSeen = guild.rivals.map((r) => r.seenWeek);
  if (maxIdle === undefined) R.pruneRivals(guild); else R.pruneRivals(guild, maxIdle);
  prunes.push({
    name, week: 200, maxIdle: maxIdle ?? 96, before: beforeSeen,
    kept: guild.rivals.map((r) => r.seenWeek), poolAfter: guild.rivals.length,
  });
}
pruneCase('pool of 5 is never pruned', [1, 1, 1, 1, 1]);
pruneCase('pool of 26, most stale', Array.from({ length: 26 }, (_, i) => (i < 20 ? 1 : 150)));
pruneCase('pool of 26, maxIdle 10', Array.from({ length: 26 }, (_, i) => (i < 20 ? 1 : 195)), 10);
pruneCase('pool of 25, none stale', Array.from({ length: 25 }, () => 199));

// ═══ write ══════════════════════════════════════════════════════════════════
const fixture = {
  stats: STATS,
  worldCupCadence: T.WORLD_CUP_CADENCE,
  seasonNames: E.SEASONS,
  circuits,
  stakes,
  eventTypes,
  defaults,
  generated,
  roundPowers,
  resolves,
  placements,
  odds,
  harm,
  seasons,
  worldCups,
  rivals: { created: rivalsCreated, fields: rivalFields, outcomes: rivalOutcomes, prunes },
  seasonOf,
};
const out = join(ROOT, '..', '..', '..', '..', 'Guild Rancher',
                 'Assets', 'Tests', 'EditMode', 'tournaments-fixture.json');
writeFileSync(out, JSON.stringify(fixture, null, 1));
console.log(`fixture → ${out}`);
for (const [k, v] of Object.entries(fixture)) {
  if (Array.isArray(v)) console.log(`  ${k}: ${v.length}`);
  else if (v && typeof v === 'object')
    for (const [k2, v2] of Object.entries(v)) console.log(`  ${k}.${k2}: ${Array.isArray(v2) ? v2.length : v2}`);
  else console.log(`  ${k}: ${v}`);
}
