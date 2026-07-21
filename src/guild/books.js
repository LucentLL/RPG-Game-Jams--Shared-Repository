/**
 * @file Books — the Library's own inventory, and the guild's institutional memory.
 *
 * A book is a real shelved INSTANCE (like a forged sword), not a stat: bought from
 * the market's rotating stock or brought home from quests, it lives in
 * `inventory.books` and never wears out. Its effect flows through Study: the
 * Scholar's weekly Theory gain is multiplied by the BEST shelved book on their
 * discipline (`bestBook` → `bookStudyMult`), so building the library is how the
 * guild gets smarter across generations (DESIGN.md pillar 4 — a retiring master's
 * know-how outlives them because the shelf remembers).
 */

let _seq = 0;
const _run = Math.random().toString(36).slice(2, 6);
function nextBookId() { return 'book_' + _run + (++_seq).toString(36); }

const rand = (n) => Math.floor(Math.random() * n);

/** Display identity per study subject (matches the professions the Scholar can study). */
export const BOOK_SUBJECTS = {
  blacksmithing: { glyph: '📕', label: 'Metallurgy' },
  alchemy: { glyph: '📗', label: 'Alchemy' },
  cooking: { glyph: '📙', label: 'Culinary Arts' },
  enchanting: { glyph: '📘', label: 'Enchantment' },
};
export const BOOK_SUBJECT_IDS = Object.keys(BOOK_SUBJECTS);

/** Titles by subject and tier (tier 1..3 — deeper theory, rarer volume). */
const TITLES = {
  blacksmithing: [
    ['The Prentice Anvil', 'A Village Smith’s Almanac', 'Iron Before Breakfast'],
    ['Steelcraft: A Treatise', 'The Tempered Edge', 'Letters to a Journeyman'],
    ['Songs of the Mithril Vein', 'The Master’s Last Hammer', 'On Metals That Remember'],
  ],
  alchemy: [
    ['An Herbal Primer', 'Roots & Remedies', 'The Hedge-Witch’s Notebook'],
    ['The Emberroot Codex', 'Distillations, Vol. II', 'Salts, Essences, Vapours'],
    ['Nightcap: Essences & Tinctures', 'The Alembic Grimoire', 'What the Still Keeps Secret'],
  ],
  cooking: [
    ['Bread Before Battle', 'A Camp Cook’s Ledger', 'Ten Honest Loaves'],
    ['The Salted Larder', 'Stews for the Long March', 'A Table for Twelve Swords'],
    ['The Feast Remembered', 'On Fire, Fat & Patience', 'The Last Course of Kings'],
  ],
  enchanting: [
    ['A Child’s First Orbs', 'Notes on Faint Light', 'The Prentice Socket'],
    ['The Planetary Register', 'Bindings, Vol. II', 'On Willing Stones'],
    ['The Far Spheres', 'What the Orbs Dream', 'A Grammar of Starlight'],
  ],
};

/** Market price by tier (index 1..3). Deep theory costs real gold. */
export const BOOK_PRICE = [0, 60, 140, 300];

/**
 * @typedef {Object} Book
 * @property {string} id @property {string} title
 * @property {'blacksmithing'|'alchemy'|'cooking'|'enchanting'} subject
 * @property {number} tier  1..3 — sets the study boost and the price
 * @property {'market'|'quest'|'penned'} source  provenance, shown on the shelf
 * @property {?string} author  the member who penned it (source 'penned')
 * @property {?number} week  guild-week it entered the library
 */

/** @param {string} [subject] @param {number} [tier] @returns {Book} */
export function mintBook(subject, tier, source = 'market', week = null) {
  const sub = BOOK_SUBJECTS[subject] ? subject : BOOK_SUBJECT_IDS[rand(BOOK_SUBJECT_IDS.length)];
  const t = Math.max(1, Math.min(3, tier || (Math.random() < 0.55 ? 1 : Math.random() < 0.72 ? 2 : 3)));
  const shelf = TITLES[sub][t - 1];
  return { id: nextBookId(), title: shelf[rand(shelf.length)], subject: sub, tier: t, source, author: null, week };
}

/** How much a shelved book multiplies weekly Theory gains on its subject. */
export function bookStudyMult(book) { return book ? 1 + 0.25 * (book.tier || 1) : 1; }

/** @param {Book} book */
export function bookPrice(book) { return BOOK_PRICE[Math.max(1, Math.min(3, book.tier || 1))]; }

/** Shelve a book in the library. @param {import('./inventory.js').Inventory} inv */
export function addBook(inv, book) { (inv.books || (inv.books = [])).push(book); return book; }

/** The strongest shelved volume on a subject (the one the Scholar studies from). */
export function bestBook(inv, subject) {
  return (inv.books || []).filter((b) => b.subject === subject).sort((a, b) => (b.tier || 0) - (a.tier || 0))[0] || null;
}

/** The market's weekly shelf: one or two volumes, tier-weighted toward primers. */
export function rollBookStock() {
  const n = Math.random() < 0.4 ? 2 : 1;
  return Array.from({ length: n }, () => mintBook());
}

// ─── The Scriptorium: members write the Library ──────────────────────────────
// A member who has mastered a subject can spend a Library week PENNING a volume
// on it — one member's Theory becomes everyone's study multiplier. Tier scales
// with the author's subject Theory (30/55/80 → ★/★★/★★★); a practiced Historian's
// scribe-craft nudges the thresholds. Writing also grows the historian Practice
// track, so the guild's Historian gets better at the actual craft of the shelf.

export const WRITE_MIN_THEORY = 30;
export const WRITE_STAMINA = 20;

/** The tier this member would pen on a subject right now (0 = not learned enough). */
export function previewBookTier(hero, subject) {
  if (!BOOK_SUBJECTS[subject]) return 0;
  const theory = ((hero.professions[subject] || {}).theory) || 0;
  const scribe = ((hero.professions.historian || {}).practice) || 0;
  const eff = theory + scribe * 0.2; // a practiced scribe writes a little above their notes
  if (theory < WRITE_MIN_THEORY) return 0;
  return eff >= 80 ? 3 : eff >= 55 ? 2 : 1;
}

/**
 * Spend the week writing a book on `subject` into the Library. Mutates the author
 * (stamina/fatigue/xp + historian Practice) and the inventory (shelves the volume).
 * @param {import('./hero.js').Hero} hero @param {string} subject
 * @param {import('./inventory.js').Inventory} inv @param {number} week
 * @returns {{ok:boolean, reason?:string, book?:Book, tier?:number, practiceGain?:number}}
 */
export function writeBook(hero, subject, inv, week) {
  const c = hero.condition;
  if (!BOOK_SUBJECTS[subject]) return { ok: false, reason: 'subject' };
  const tier = previewBookTier(hero, subject);
  if (tier < 1) return { ok: false, reason: 'unread' }; // can't write what you haven't mastered
  if (c.stamina < WRITE_STAMINA) return { ok: false, reason: 'stamina' };

  const book = mintBook(subject, tier, 'penned', week);
  book.author = hero.name;
  addBook(inv, book);

  const prof = hero.professions.historian || (hero.professions.historian = { theory: 0, practice: 0, field: 0 });
  const room = (100 - prof.practice) / 100; // scribe-craft grows like any Practice
  const gain = Math.max(1, Math.round(5 * (0.3 + 0.7 * room)));
  prof.practice = Math.min(100, prof.practice + gain);

  c.stamina = Math.max(0, c.stamina - WRITE_STAMINA);
  c.fatigue = Math.min(100, c.fatigue + 8);
  hero.xp += 8;
  return { ok: true, book, tier, practiceGain: gain };
}

/**
 * The shelf teaches the shop floor: a member working a trade week consults the
 * best shelved volume on their subject and picks up a little Theory — how a
 * novice Cook with a stocked Library learns recipes they were never taught.
 * @returns {?{theoryGain:number, title:string}} null when no book covers the subject
 */
export function learnOnTheJob(hero, subject, inv) {
  const bk = bestBook(inv, subject);
  if (!bk) return null;
  const prof = hero.professions[subject] || (hero.professions[subject] = { theory: 0, practice: 0, field: 0 });
  if (prof.theory >= 100) return null;
  const room = (100 - prof.theory) / 100;
  const gain = Math.max(1, Math.round(2 * bookStudyMult(bk) * (0.3 + 0.7 * room)));
  prof.theory = Math.min(100, prof.theory + gain);
  return { theoryGain: gain, title: bk.title };
}
