/**
 * @file Training stations — placeable equipment on the Ranch grounds (Pillar A of
 * the Guild Academy, Monster-Rancher "place training gear on your ranch" style).
 *
 * The player drops stations onto predefined slots in the training yard. Each station
 * is tied to one drill and gives that drill a weekly gain bonus (diminishing when you
 * stack the same type). How many stations fit is gated by the Training Yard facility
 * tier — so expanding the Yard (in the Grounds) unlocks more equipment slots.
 *
 * A station is `{ id, type, slot }`; its on-field position is YARD_SLOTS[slot], so
 * nothing spatial needs bespoke saving beyond the slot index. `guild.stations` is the
 * persisted list.
 */
import { facilityTier } from './guild.js';

/** Buildable station types — one per training drill. `boost` is the per-station gain
 *  bonus its drill gets; `cost` is the one-time gold price. */
export const STATIONS = [
  { type: 'sandbag', name: 'Sandbag',         glyph: '🥊', drill: 'pow', stat: 'POW', cost: 120, boost: 0.15 },
  { type: 'pell',    name: 'Pell Post',       glyph: '🛡', drill: 'def', stat: 'DEF', cost: 120, boost: 0.15 },
  { type: 'dummy',   name: 'Training Dummy',  glyph: '🎯', drill: 'skl', stat: 'SKL', cost: 120, boost: 0.15 },
  { type: 'poles',   name: 'Agility Poles',   glyph: '🚩', drill: 'spd', stat: 'SPD', cost: 120, boost: 0.15 },
  { type: 'stone',   name: 'Meditation Stone', glyph: '🗿', drill: 'int', stat: 'INT', cost: 140, boost: 0.15 },
  { type: 'ruck',    name: 'Rucking Track',   glyph: '🎒', drill: 'vit', stat: 'VIT', cost: 120, boost: 0.15 },
];
export function stationDef(type) { return STATIONS.find((s) => s.type === type) || null; }

/** Predefined training-yard slots — tile coords on the GS×GS ranch field, laid out
 *  as a tidy 3×3 in the open ground between the Great Hall and the Kitchen. Stations
 *  occupy these by index; the Yard tier decides how many are usable. */
export const YARD_SLOTS = [
  { tx: 3.5, ty: 2.6 }, { tx: 4.7, ty: 2.5 }, { tx: 5.9, ty: 2.7 },
  { tx: 3.4, ty: 3.8 }, { tx: 4.7, ty: 3.7 }, { tx: 5.9, ty: 3.9 },
  { tx: 3.5, ty: 5.0 }, { tx: 4.7, ty: 4.9 }, { tx: 5.9, ty: 5.1 },
];

/** How many equipment slots the Training Yard unlocks per tier (0..3). */
const SLOT_CAP = [2, 4, 6, 9];

/** Usable slot count for this guild (never more than the physical yard has). */
export function stationCapacity(guild) {
  const cap = SLOT_CAP[facilityTier(guild, 'yard')] ?? SLOT_CAP[0];
  return Math.min(YARD_SLOTS.length, cap);
}
export function stationCount(guild) { return Array.isArray(guild.stations) ? guild.stations.length : 0; }
/** True if there's a free slot within capacity to place another station. */
export function canBuild(guild) { return stationCount(guild) < stationCapacity(guild); }

/**
 * The weekly training multiplier a member gets on `drillId` from placed stations.
 * Each matching station adds its boost, halving each time so stacking three sandbags
 * isn't a flat 3× — the first piece of gear matters most.
 * @returns {number} ≥ 1
 */
export function stationBonusFor(guild, drillId) {
  const list = (guild.stations || []).filter((s) => { const d = stationDef(s.type); return d && d.drill === drillId; });
  let mult = 1, w = 1;
  for (const s of list) { const d = stationDef(s.type); mult += (d.boost || 0) * w; w *= 0.5; }
  return mult;
}

/**
 * Place a station of `type` in `slotIdx`. Returns the station, or null if the slot is
 * out of range / taken / over capacity. Does NOT touch gold — the caller handles cost.
 */
export function addStation(guild, type, slotIdx) {
  if (!Array.isArray(guild.stations)) guild.stations = [];
  const def = stationDef(type);
  if (!def) return null;
  const cap = stationCapacity(guild);
  if (slotIdx == null || slotIdx < 0 || slotIdx >= cap) return null;
  if (guild.stations.length >= cap) return null;
  if (guild.stations.some((s) => s.slot === slotIdx)) return null;
  const st = { id: 'st' + Math.random().toString(36).slice(2, 9), type, slot: slotIdx };
  guild.stations.push(st);
  return st;
}
export function removeStation(guild, id) {
  if (!Array.isArray(guild.stations)) return;
  guild.stations = guild.stations.filter((s) => s.id !== id);
}
