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
export function formatDate(cal) { return `Year ${cal.year}, Week ${cal.weekOfYear}`; }
