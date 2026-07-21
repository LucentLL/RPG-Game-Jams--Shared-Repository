/**
 * @file Item — a persistent equipment instance (not a stat modifier).
 *
 * Phase 1 carries identity + material + quality + the seed of a history. Later
 * phases fill in durability wear, the wielder chain, repairs, kill counts, and
 * inheritance on death (see DESIGN.md — item persistence pillar).
 */

let _itemSeq = 0;
const _itemRun = Math.random().toString(36).slice(2, 7);
function nextItemId() { return 'item_' + _itemRun + (++_itemSeq).toString(36); }

/** Quality bands (0..100). A better smith / better ore pushes items up the tiers. */
export const QUALITY_TIERS = [
  { min: 85, name: 'Masterwork', col: '#e8dff0' },
  { min: 65, name: 'Fine', col: '#d4a843' },
  { min: 45, name: 'Sound', col: '#b8c4d0' },
  { min: 25, name: 'Crude', col: '#c87850' },
  { min: 0, name: 'Shoddy', col: '#6b6b75' },
];

/** @param {number} q @returns {{min:number,name:string,col:string}} */
export function qualityTier(q) {
  return QUALITY_TIERS.find((t) => q >= t.min) || QUALITY_TIERS[QUALITY_TIERS.length - 1];
}

/**
 * @typedef {Object} Item
 * @property {string} id
 * @property {string} kind    'sword' | 'armor' | 'bow' | ...
 * @property {string} slot    'weapon' | 'body' | ...
 * @property {string} material 'iron' | 'steel' | 'mithril' | 'leather' | ...
 * @property {number} quality 0..100 — set at forge time from smith Practice + material
 * @property {number} plus    0..10 — the REFINE level (+N, RO-style); flat power on top of quality
 * @property {string} name
 * @property {{current:number,max:number}} durability  edge quality (wear comes later)
 * @property {Object} history  { forgedBy, forgedByName, forgedWeek, wielders[], kills, repairs[] }
 * @property {string} location 'armory' | personId
 */

/** @param {Partial<Item>} [init] @returns {Item} */
export function createItem(init = {}) {
  return {
    id: init.id || nextItemId(),
    kind: init.kind || 'sword',
    slot: init.slot || 'weapon',
    material: init.material || 'iron',
    quality: init.quality ?? 30,
    plus: init.plus || 0,
    name: init.name || 'Iron Sword',
    durability: init.durability || { current: 100, max: 100 },
    history: init.history || { forgedBy: null, forgedByName: null, forgedWeek: null, wielders: [], kills: 0, repairs: [] },
    location: init.location || 'armory',
  };
}

/** Display name with the refine level worn up front, RO-style: "+5 Steel Sword". */
export function itemLabel(item) {
  return (item.plus > 0 ? `+${item.plus} ` : '') + item.name;
}
