// Gear & blacksmithing data tables — extracted from crucible.js.
// ═══ GEAR DATA ═══
// Every gear type below maps to a real Time Element pixel-art sprite. Types
// without a sprite (Gauntlet, Tome, Ring, Amulet) were removed.
var GEAR_TYPES=[
  // Hand
  {type:'Sword',   pos:'Hand', sMin:1,sMax:3, icon:'⚔'},
  {type:'Dagger',  pos:'Hand', sMin:0,sMax:2, icon:'🗡'},
  {type:'Wand',    pos:'Hand', sMin:1,sMax:3, icon:'✧'},
  {type:'Bow',     pos:'Hand', sMin:1,sMax:3, icon:'🏹'},
  {type:'Axe',     pos:'Hand', sMin:1,sMax:3, icon:'🪓'},
  {type:'Hammer',  pos:'Hand', sMin:1,sMax:3, icon:'🔨'},
  {type:'Club',    pos:'Hand', sMin:0,sMax:1, icon:'⌇'},
  {type:'Buckler', pos:'Hand', sMin:0,sMax:2, icon:'🛡'},
  // Body
  {type:'Plate',   pos:'Body', sMin:1,sMax:4, icon:'🛡'},
  {type:'Mail',    pos:'Body', sMin:1,sMax:3, icon:'⛓'},
  {type:'Robes',   pos:'Body', sMin:1,sMax:3, icon:'👘'},
  {type:'Cloak',   pos:'Body', sMin:0,sMax:2, icon:'🧥'},
  {type:'Vest',    pos:'Body', sMin:0,sMax:1, icon:'△'},
  // Head
  {type:'Helm',    pos:'Head', sMin:1,sMax:3, icon:'⛑'},
  {type:'Crown',   pos:'Head', sMin:1,sMax:2, icon:'👑'},
  {type:'Cap',     pos:'Head', sMin:0,sMax:1, icon:'🧢'},
  {type:'Hood',    pos:'Head', sMin:0,sMax:2, icon:'🪖'},
  // Lower
  {type:'Trousers',pos:'Lower', sMin:0,sMax:2, icon:'👖'},
  {type:'Leggings',pos:'Lower', sMin:1,sMax:2, icon:'🦵'},
  {type:'Skirt',   pos:'Lower', sMin:0,sMax:2, icon:'👗'}
];

// Canonical ordering of equip slots. Drives every loop that iterates the
// player's gear (draft, materia, save, etc.).
var EQUIP_SLOTS = ['Head','LHand','Body','RHand','Lower'];

var GEAR_MATERIALS=[
  ['Bone','Crude','Tarnished','Scrap'],
  ['Tin','Pewter','Dull','Worn'],
  ['Iron','Forged','Tempered','Honed'],
  ['Copper','Burnished','Warm','Etched'],
  ['Silver','Polished','Gleaming','Bright'],
  ['Gold','Radiant','Blessed','Noble'],
  ['Platinum',"Philosopher's",'Transcendent','Astral']
];

// ═══ BLACKSMITHING — Refinement / Drill / Link ═══
// Success rates: REFINE_TABLE[attemptLevel][gearLevel-1]
// attemptLevel = current refinement (for refine), current sockets (for drill), current links (for link)
var REFINE_TABLE=[
  [100,100,100,100], // 0→1
  [100,100,100,100], // 1→2
  [100,100,100,100], // 2→3
  [100,100,100,100], // 3→4
  [100,100,100, 60], // 4→5
  [100,100, 60, 40], // 5→6
  [100, 60, 50, 40], // 6→7
  [ 60, 40, 20, 20], // 7→8
  [ 40, 20, 20, 20], // 8→9
  [ 19, 19, 19,  9]  // 9→10
];
var MAX_REFINEMENT=10;
var MAX_SOCKETS=5;

// Gear roles (kept for gameplay logic in draft/loadout/AI generation).
var WEAPON_GEAR_TYPES = ['Sword','Dagger','Club','Wand','Bow','Axe','Hammer'];
var SHIELD_GEAR_TYPES = ['Buckler'];

// Two-handed weapons occupy BOTH hands: equipping one clears the off-hand, and no
// shield or second weapon can sit alongside it. Bows and crossbows are drawn with
// two hands (and loose a projectile in combat).
var TWO_HANDED_GEAR_TYPES = ['Bow','Crossbow'];
function isTwoHandedType(type){ return TWO_HANDED_GEAR_TYPES.indexOf(type) >= 0; }

export {
  GEAR_TYPES, EQUIP_SLOTS, GEAR_MATERIALS, REFINE_TABLE,
  MAX_REFINEMENT, MAX_SOCKETS, WEAPON_GEAR_TYPES, SHIELD_GEAR_TYPES,
  TWO_HANDED_GEAR_TYPES, isTwoHandedType,
};
