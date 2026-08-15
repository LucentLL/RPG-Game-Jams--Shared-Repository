/**
 * THE CALENDAR, WITNESSED — a fixture for the Unity port's Calendar.
 *
 * calendar.js imports nothing, so the REAL module answers directly: month
 * names, month-of-week and week-of-month over four years of weeks (including
 * the wrap past new year), yearsAhead projections, and formatDate through a
 * mutating calendar advanced week by week — pinned against the port's
 * derive-from-absolute-week reformulation, which must agree with the web's
 * running counters at every step or the two builds date the same tournament
 * to different moons.
 *
 *     node dev/dump-calendar.mjs
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const cal = await import(new URL('../src/guild/calendar.js', import.meta.url));

const weeks = [];
for (let w = 1; w <= 200; w++)
  weeks.push({ w, month: cal.monthOfWeek(w), wom: cal.weekOfMonth(w), name: cal.monthName(w), date: cal.shortDate(w) });

const ahead = [];
for (const from of [1, 12, 47, 48])
  for (const off of [0, 1, 47, 48, 96, 100])
    ahead.push({ from, off, years: cal.yearsAhead(from, off) });

// The RUNNING calendar, advanced 200 weeks from the seed — the web's own
// mutation, recorded so the port's derivation must match its every stop.
const run = [];
const c = cal.createCalendar();
for (let i = 0; i < 200; i++) {
  run.push({ week: c.week, year: c.year, woy: c.weekOfYear, date: cal.formatDate(c) });
  cal.advanceWeek(c);
}

const fixture = { months: cal.MONTHS, weeks, ahead, run };
const out = join(ROOT, '..', '..', '..', '..', 'Guild Rancher',
                 'Assets', 'Tests', 'EditMode', 'calendar-fixture.json');
writeFileSync(out, JSON.stringify(fixture, null, 1));
console.log(`fixture → ${out}  (${weeks.length} weeks, ${ahead.length} projections, ${run.length} run steps)`);
