/**
 * @file Applications — how a trainee actually gets into the Academy.
 *
 * The old intake was a lottery: pay 60g, receive a random lean and a hidden
 * potential. This replaces it with a negotiation, and inverts the usual economy
 * of talent: **the better the prospect, the more they cost you.**
 *
 * Would-be trainees write to the guild. Each application shows its
 * QUALIFICATIONS — a lean and a scouted star rating — and the applicant's family
 * MEANS. You then name a TUITION, and they accept or decline:
 *
 *   · A 1★ from a wealthy house will happily pay full tuition. They are income.
 *   · A 5★ has every guild in the circuit writing back, and will only come on a
 *     full scholarship — a NEGATIVE tuition the guild pays every week.
 *   · Everyone between is a haggle, and a rich 5★ or a destitute 1★ is a real
 *     (and interesting) roll.
 *
 * Tuition is a WEEKLY signed figure that nets against the Academy's board bill,
 * so a hall full of scholarships genuinely strains the treasury while a couple
 * of paying merchants' sons subsidise it.
 *
 * `guild.applications` persists. Accepting one produces an ordinary apprentice
 * (apprentices.js) carrying its lean, potential and tuition, so everything
 * downstream — weekly development, the star strip, graduation — is untouched.
 */
import { makeApprentice, potentialStars } from './apprentices.js';
import { ARCHETYPES } from './recruiting.js';

/** How many applications sit on the board at once. */
export const BOARD_SIZE = 4;
/** Declines an applicant tolerates before withdrawing. */
export const PATIENCE = 3;
/** Weeks an application stays open before the applicant places elsewhere. */
export const OPEN_WEEKS = 4;

/** What a wealthy family can put toward a term, at wealth 1.0. */
const WEALTH_CEILING = 240;
/** Gold per star of leverage — what talent lets an applicant demand knocked off. */
const STAR_LEVERAGE = 62;
/** Reputation shifts every reservation: a famous hall can charge more. */
const REP_PULL = 1.5, REP_CAP = 40;

const rand = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[rand(a.length)];
let _seq = 0;
const nextId = () => 'app_' + Math.random().toString(36).slice(2, 7) + (++_seq).toString(36);

/** Applicants have a station in life, not a name — they stay anonymous trainees
 *  until graduation lends them one, exactly as the Academy intends. */
const TRADE_ORIGIN = [
  "a cooper's son", "a smith's daughter", "a fisher's child", "a carter's son",
  "a weaver's daughter", "a miller's son", "a tanner's daughter", "a mason's son",
  "a herbalist's daughter", "a shepherd's son", "a scribe's daughter", "an innkeep's son",
];
const HIGH_ORIGIN = [
  "a merchant's heir", "a reeve's daughter", "a banker's son", "a magistrate's ward",
  "a shipwright's heir", "a wool-factor's daughter",
];
const LOW_ORIGIN = [
  'an orphan of the levy', 'a foundling', 'a runaway', 'a drover with no house',
  'a beggar of the north gate', 'a war-widow\'s son',
];
const PLACES = [
  'Ferrock', 'Duskmere', 'the Nine Fords', 'Ashvale', 'Greywater', 'Hollowmarch',
  'Stonebridge', 'the Reach', 'Coldharbour', 'Marrowfen', 'Highcairn', 'Saltcombe',
];

/** Wealth band → the phrase shown on the card (the player's only read on means). */
export function wealthBand(w) {
  if (w >= 0.78) return { id: 'rich', label: 'wealthy house', glyph: '' };
  if (w >= 0.52) return { id: 'comfortable', label: 'comfortable family', glyph: '' };
  if (w >= 0.26) return { id: 'modest', label: 'modest means', glyph: '' };
  return { id: 'poor', label: 'nothing to their name', glyph: '' };
}

/**
 * The most tuition this applicant will accept — signed. Positive means they will
 * PAY that much a week; negative means they require a stipend of that size.
 *
 * Wealth is rolled INDEPENDENTLY of talent, which is the whole point: it is what
 * makes a rich 1★ worth taking for the money and a penniless 5★ an expensive
 * prize. Reputation shifts the whole curve — prospects will pay to attend a
 * famous hall, and need less coaxing to join one.
 */
export function reservation(app, guild) {
  const stars = potentialStars(app.potential);
  const rep = Math.min((guild && guild.reputation) || 0, REP_CAP) * REP_PULL;
  return Math.round(WEALTH_CEILING * app.wealth - STAR_LEVERAGE * (stars - 1) + rep);
}

/**
 * The stepper's opening figure — deliberately NOT their reservation, which would
 * hand the player the answer. This is the bursar's naive asking price: what the
 * family could plausibly afford, ignoring the applicant's talent entirely.
 *
 * So a 1★ accepts it instantly, and every star above that is leverage the player
 * has to discount for themselves. Stars are visible and the discount is a flat
 * ~STAR_LEVERAGE each, so the rule is learnable in two or three refusals rather
 * than being a guessing game.
 */
export function suggestedOffer(app, guild) {
  const rep = Math.min((guild && guild.reputation) || 0, REP_CAP) * REP_PULL;
  return Math.round(WEALTH_CEILING * app.wealth + rep);
}

/** Roll one application. */
export function makeApplication() {
  const lean = pick(ARCHETYPES).name;
  // Talent spans the full band, unlike the old 0.35-floor lottery — 1★ walk-ons
  // and the occasional 5★ both have to be possible for the haggle to matter.
  const potential = 0.12 + Math.random() * 0.86;
  const wealth = Math.random();
  const band = wealthBand(wealth);
  const origin = band.id === 'rich' ? pick(HIGH_ORIGIN) : band.id === 'poor' ? pick(LOW_ORIGIN) : pick(TRADE_ORIGIN);
  return {
    id: nextId(),
    lean, potential, wealth,
    origin, place: pick(PLACES),
    appearanceSeed: (Math.random() * 0x7fffffff) | 0,
    patience: PATIENCE,
    weeks: 0,
    lastOffer: null,       // the player's most recent number, for the card
    lastVerdict: null,     // 'high' | 'low' — which way the decline went
  };
}

/** Sanitize a loaded application (defends old/partial saves). */
export function normalizeApplication(a) {
  if (!a || typeof a !== 'object') return null;
  const leans = ARCHETYPES.map((x) => x.name);
  return {
    id: a.id || nextId(),
    lean: leans.includes(a.lean) ? a.lean : pick(leans),
    potential: Math.max(0.05, Math.min(1, typeof a.potential === 'number' ? a.potential : 0.5)),
    wealth: Math.max(0, Math.min(1, typeof a.wealth === 'number' ? a.wealth : 0.5)),
    origin: a.origin || pick(TRADE_ORIGIN),
    place: a.place || pick(PLACES),
    appearanceSeed: typeof a.appearanceSeed === 'number' ? a.appearanceSeed : (Math.random() * 0x7fffffff) | 0,
    patience: Math.max(0, Math.min(PATIENCE, a.patience == null ? PATIENCE : a.patience | 0)),
    weeks: Math.max(0, a.weeks | 0),
    lastOffer: typeof a.lastOffer === 'number' ? a.lastOffer : null,
    lastVerdict: a.lastVerdict === 'high' || a.lastVerdict === 'low' ? a.lastVerdict : null,
    // A loaded applicant is a trainee-to-be, so it renders in plain kit like one.
    plainLook: true,
  };
}

/** Fill the board up to BOARD_SIZE, keeping whoever is already on it. */
export function ensureApplications(guild) {
  if (!Array.isArray(guild.applications)) guild.applications = [];
  guild.applications = guild.applications.map(normalizeApplication).filter(Boolean);
  while (guild.applications.length < BOARD_SIZE) guild.applications.push(makeApplication());
  return guild.applications;
}

/**
 * Answer an offer. Returns what happened so the caller can talk about it.
 * @param {Object} guild @param {Object} app @param {number} offer  signed weekly tuition
 * @returns {{ok:boolean, reason?:string, apprentice?:Object, verdict?:'high'|'low', gap?:number}}
 */
export function offerTuition(guild, app, offer) {
  const res = reservation(app, guild);
  const asked = Math.round(offer);
  if (asked > res) {
    // Too steep. They say so, and lose a little patience.
    app.patience -= 1;
    app.lastOffer = asked;
    app.lastVerdict = 'high';
    return { ok: false, reason: app.patience <= 0 ? 'withdrawn' : 'declined', verdict: 'high', gap: asked - res };
  }
  // Accepted. They come in at exactly what was offered — undercutting their
  // reservation is the player's reward for reading them right.
  const appr = makeApprentice();
  appr.lean = app.lean;
  appr.potential = app.potential;
  appr.appearanceSeed = app.appearanceSeed;
  appr.tuition = asked;                    // signed, billed weekly
  appr.origin = app.origin;
  appr.place = app.place;
  return { ok: true, apprentice: appr, verdict: 'low', gap: res - asked };
}

/** Drop an application off the board. */
export function closeApplication(guild, id) {
  guild.applications = (guild.applications || []).filter((a) => a.id !== id);
}

/**
 * A week passes on the board: applications age out, exhausted ones leave, and
 * fresh letters arrive to fill the gaps. Returns the ones that left.
 */
export function tickApplications(guild) {
  ensureApplications(guild);
  const gone = [];
  guild.applications = guild.applications.filter((a) => {
    a.weeks += 1;
    if (a.patience <= 0 || a.weeks > OPEN_WEEKS) { gone.push(a); return false; }
    return true;
  });
  while (guild.applications.length < BOARD_SIZE) guild.applications.push(makeApplication());
  return gone;
}

/**
 * Net weekly tuition across the academy — POSITIVE is income to the guild.
 * A hall of scholarships reads as a bill; a couple of paying merchants' sons
 * offset it. Netted against board in the weekly gold flow.
 */
export function academyTuition(guild) {
  return (guild.apprentices || []).reduce((sum, a) => sum + (a.tuition || 0), 0);
}
