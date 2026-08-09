/**
 * @file Guild calendar / time loop. The game advances in weeks. Each week the
 * player sets assignments (train / quest / rest / diet), then advances —
 * resolving training, diets, dispatched quests, wages, and events.
 */

/**
 * @typedef {Object} Calendar
 * @property {number} week        absolute week counter (1-based)
 * @property {number} year
 * @property {number} weekOfYear
 */

const WEEKS_PER_YEAR = 48;
/**
 * FOUR WEEKS TO A MONTH, TWELVE MONTHS TO A YEAR — which is what 48 weeks has
 * always meant, just never said out loud. The season bar already divides the
 * year into four (events.js SEASONS, twelve weeks each); a month is that same
 * ruler at the next notch down, so nothing is re-authored here, only named.
 *
 * The player asked for it to plan against (2026-08-09): "when planning character
 * schedules in advance, it should display the Month/Weeks to better keep track".
 * A queue counted in "3rd, 4th, 5th" cannot be compared with a tournament dated
 * to a week.
 */
export const WEEKS_PER_MONTH = 4;
export const MONTHS = [
  'Thawmoon', 'Seedmoon', 'Blossom',      // Spring
  'Longsun', 'Highsun', 'Emberfall',      // Summer
  'Harvest', 'Rustmoon', 'Gloaming',      // Autumn
  'Frostmoon', 'Deepwinter', 'Wolfmoon',  // Winter
];

/** Normalise any week number (including one projected past new year) to 1..48. */
function wrapWeek(weekOfYear) { return ((Math.max(1, weekOfYear | 0) - 1) % WEEKS_PER_YEAR) + 1; }
/** 0..11 — which month a week of the year falls in. */
export function monthOfWeek(weekOfYear) {
  return Math.floor((wrapWeek(weekOfYear) - 1) / WEEKS_PER_MONTH);
}
/** 1..4 — which week WITHIN its month. */
export function weekOfMonth(weekOfYear) {
  return ((wrapWeek(weekOfYear) - 1) % WEEKS_PER_MONTH) + 1;
}
export function monthName(weekOfYear) { return MONTHS[monthOfWeek(weekOfYear)]; }
/** "Frostmoon wk 2" — the label a plan row wears. */
export function shortDate(weekOfYear) {
  return `${monthName(weekOfYear)} wk ${weekOfMonth(weekOfYear)}`;
}
/** How many years ahead a projected week rolls into. */
export function yearsAhead(fromWeekOfYear, offset) {
  return Math.floor((Math.max(1, fromWeekOfYear | 0) - 1 + (offset | 0)) / WEEKS_PER_YEAR);
}

/** @param {Partial<Calendar>} [init] @returns {Calendar} */
export function createCalendar(init = {}) {
  return { week: init.week ?? 1, year: init.year ?? 1, weekOfYear: init.weekOfYear ?? 1 };
}

/** Advance one week, rolling over the year. @param {Calendar} cal @returns {Calendar} */
export function advanceWeek(cal) {
  cal.week += 1;
  cal.weekOfYear += 1;
  if (cal.weekOfYear > WEEKS_PER_YEAR) { cal.weekOfYear = 1; cal.year += 1; }
  return cal;
}

/** @param {Calendar} cal @returns {string} */
export function formatDate(cal) {
  return `${monthName(cal.weekOfYear)} wk ${weekOfMonth(cal.weekOfYear)} · Yr ${cal.year}`;
}
