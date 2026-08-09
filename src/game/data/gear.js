// Gear & blacksmithing data tables — extracted from crucible.js.
// ═══ GEAR DATA ═══
// Every gear type below maps to a real Time Element pixel-art sprite. Types
// without a sprite (Gauntlet, Tome, Ring, Amulet) were removed.
// `dmg` and `ac` are WHAT THE PIECE ITSELF IS WORTH, before any materia.
//
// These did not exist until 2026-08-08, and their absence was visible the first
// time the compare panel was pointed at a real swap: trading an off-hand dagger
// for a buckler moved NOTHING. Type, tier and material were pure naming — a
// Bone Sword and a Platinum Sword swung identically, and a shield defended
// exactly as well as the knife it replaced, because all combat power lived in
// the socketed materia. A player cannot be asked "is this better?" about two
// pieces the engine cannot tell apart.
//
// STARTING VALUES, MEANT TO BE TUNED. They are deliberately small and readable
// so the rebalance is a pass over this table and nothing else: a weapon's `dmg`
// is added to every attack it makes, a piece's `ac` to the fighter's armour
// class, and material tier adds `gearTierBonus` on top of both. Nothing else in
// the codebase authors these numbers. @see gearDamage / gearArmor below.
var GEAR_TYPES=[
  // Hand — weapons deal, the buckler defends. A shield's `dmg` is 0 and that is
  // the point: putting one on trades offence for defence, which is the whole
  // reason to own one.
  {type:'Sword',   pos:'Hand', sMin:1,sMax:3, icon:'⚔', dmg:2, ac:0},
  {type:'Dagger',  pos:'Hand', sMin:0,sMax:2, icon:'†', dmg:1, ac:0},
  {type:'Wand',    pos:'Hand', sMin:1,sMax:3, icon:'✧', dmg:1, ac:0},
  {type:'Bow',     pos:'Hand', sMin:1,sMax:3, icon:'➳', dmg:3, ac:0},
  {type:'Axe',     pos:'Hand', sMin:1,sMax:3, icon:'⚒', dmg:3, ac:0},
  {type:'Hammer',  pos:'Hand', sMin:1,sMax:3, icon:'', dmg:3, ac:0},
  {type:'Club',    pos:'Hand', sMin:0,sMax:1, icon:'⌇', dmg:1, ac:0},
  {type:'Buckler', pos:'Hand', sMin:0,sMax:2, icon:'▣', dmg:0, ac:2},
  // Body — the piece that covers the most of you is worth the most.
  {type:'Plate',   pos:'Body', sMin:1,sMax:4, icon:'▣', dmg:0, ac:4},
  {type:'Mail',    pos:'Body', sMin:1,sMax:3, icon:'⛓', dmg:0, ac:3},
  {type:'Robes',   pos:'Body', sMin:1,sMax:3, icon:'', dmg:0, ac:1},
  {type:'Cloak',   pos:'Body', sMin:0,sMax:2, icon:'', dmg:0, ac:1},
  {type:'Vest',    pos:'Body', sMin:0,sMax:1, icon:'△', dmg:0, ac:1},
  // Head
  {type:'Helm',    pos:'Head', sMin:1,sMax:3, icon:'', dmg:0, ac:2},
  {type:'Crown',   pos:'Head', sMin:1,sMax:2, icon:'♛', dmg:0, ac:1},
  {type:'Cap',     pos:'Head', sMin:0,sMax:1, icon:'', dmg:0, ac:1},
  {type:'Hood',    pos:'Head', sMin:0,sMax:2, icon:'', dmg:0, ac:1},
  // Lower
  {type:'Trousers',pos:'Lower', sMin:0,sMax:2, icon:'', dmg:0, ac:1},
  {type:'Leggings',pos:'Lower', sMin:1,sMax:2, icon:'', dmg:0, ac:2},
  {type:'Skirt',   pos:'Lower', sMin:0,sMax:2, icon:'', dmg:0, ac:1}
];

/** Type name → its row above. Built once; every lookup goes through it. */
var GEAR_TYPE_BY_NAME={};
GEAR_TYPES.forEach(function(g){ GEAR_TYPE_BY_NAME[g.type]=g; });

/**
 * What the MATERIAL is worth, on top of the type. Seven tiers (Bone → Platinum)
 * over four steps, so a material jump is felt but never swamps the type: a
 * Platinum Dagger (1+3) still does not out-hit a Bone Axe (3+0) by much, and
 * choosing a weapon stays a choice about what it IS.
 */
function gearTierBonus(tier){ return Math.floor((tier||0)/2); }

// Canonical ordering of equip slots. Drives every loop that iterates the
// player's gear (draft, materia, save, etc.).
var EQUIP_SLOTS = ['Head','LHand','Body','RHand','Lower'];

// The slots that are HANDS. A piece here pays out as DAMAGE (getMateriaBonus);
// armour is not a slot list because a shield is armour worn in a hand — what a
// piece is worth is decided by the piece, not by where it hangs.
// @see gearDamage / gearArmor.
var HAND_SLOTS = ['LHand','RHand'];

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

/**
 * WHAT ONE PIECE OF GEAR IS WORTH — the two questions the whole game asks about
 * an item, answered in one place.
 *
 * A piece pays out as EITHER damage or armour, never both, and its refinement
 * follows whichever it pays: +5 on a sword is five more damage, +5 on a buckler
 * or a helm is five more armour. That is what makes refining any slot worth the
 * reagents (user decree, 2026-08-08) — before it, +N counted only on hands and
 * chest, so a +9 helm bought nothing at all.
 *
 * These are the ONLY authors of an item's intrinsic numbers. The combat engine
 * asks them, and so does the compare panel, so a player can never be shown a
 * number the fight will not honour (CLAUDE.md — ONE RULES FACT).
 */
// A COSMETIC piece is a sprite, not a weapon: it is what a guild member is drawn
// holding so they never read as unfinished, and its numbers belong to the guild
// model, not to this table. Skipped by both, or a portrait would arm a fighter.
// @see guildCosmeticGear in crucible.js.
function gearDamage(gear){
  if(!gear||gear.cosmetic)return 0;
  var gt=GEAR_TYPE_BY_NAME[gear.type];
  if(!gt||!gt.dmg)return 0;   // shields and armour deal nothing
  return gt.dmg+gearTierBonus(gear.tier)+(gear.refinement||0);
}
function gearArmor(gear){
  if(!gear||gear.cosmetic)return 0;
  var gt=GEAR_TYPE_BY_NAME[gear.type];
  if(!gt||!gt.ac)return 0;    // weapons defend nothing
  return gt.ac+gearTierBonus(gear.tier)+(gear.refinement||0);
}

export {
  GEAR_TYPES, GEAR_TYPE_BY_NAME, EQUIP_SLOTS, HAND_SLOTS,
  GEAR_MATERIALS, REFINE_TABLE,
  MAX_REFINEMENT, MAX_SOCKETS, WEAPON_GEAR_TYPES, SHIELD_GEAR_TYPES,
  TWO_HANDED_GEAR_TYPES, isTwoHandedType,
  gearTierBonus, gearDamage, gearArmor,
};
