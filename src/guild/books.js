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
};

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
};

/** Market price by tier (index 1..3). Deep theory costs real gold. */
export const BOOK_PRICE = [0, 60, 140, 300];

/**
 * @typedef {Object} Book
 * @property {string} id @property {string} title
 * @property {'blacksmithing'|'alchemy'} subject
 * @property {number} tier  1..3 — sets the study boost and the price
 * @property {'market'|'quest'} source  provenance, shown on the shelf
 * @property {?number} week  guild-week it entered the library
 */

/** @param {'blacksmithing'|'alchemy'} [subject] @param {number} [tier] @returns {Book} */
export function mintBook(subject, tier, source = 'market', week = null) {
  const sub = BOOK_SUBJECTS[subject] ? subject : (Math.random() < 0.5 ? 'blacksmithing' : 'alchemy');
  const t = Math.max(1, Math.min(3, tier || (Math.random() < 0.55 ? 1 : Math.random() < 0.72 ? 2 : 3)));
  const shelf = TITLES[sub][t - 1];
  return { id: nextBookId(), title: shelf[rand(shelf.length)], subject: sub, tier: t, source, week };
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
