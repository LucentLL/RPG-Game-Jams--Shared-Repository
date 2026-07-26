// Attack definitions — extracted from crucible.js.
//
// NAMING: these used to be alchemical (Calcination Strike, Putrefaction Mist,
// Sol/Luna/Mercury damage types) — a holdover from the Athanor build. The guild
// game calls things what they are: plain elements, plain verbs. The MECHANICS
// are untouched; only the names and the three damage-type keys changed.
//   sol → fire · luna → earth · mercury → lightning
// ATTACK_ALIASES below maps every retired name onto its replacement, so rosters,
// materia grants and progression tables written before the rename still resolve.
// ═══ ATTACKS ═══
var BASIC_ATTACK={name:'Strike',type:'physical',dice:'1d6',stat:'STR',range:1,desc:'Basic melee attack.',purity:0,dissolve:0};
var ALL_ATTACKS=[
  BASIC_ATTACK,
  {name:'Flame Strike',type:'fire',dice:'2d6',stat:'STR',range:1,desc:'A burning fist.',purity:0,dissolve:0},
  {name:'Fire Blast',type:'fire',dice:'1d10',stat:'CHA',range:3,desc:'A lance of flame at range.',purity:0,dissolve:0},
  {name:'Stone Slam',type:'earth',dice:'1d8',stat:'STR',range:1,desc:'A body slam with the weight of rock behind it.',purity:0,dissolve:0},
  {name:'Stone Ward',type:'earth',dice:'0d0',stat:'WIS',range:0,desc:'A barrier of stone: +3 AC until next turn.',purity:0,dissolve:0,special:'ward',acBonus:3},
  {name:'Lightning Bolt',type:'lightning',dice:'1d8',stat:'INT',range:4,desc:'A bolt loosed at range.',purity:0,dissolve:0},
  {name:'Blink',type:'lightning',dice:'0d0',stat:'DEX',range:0,desc:'Flicker up to 3 tiles.',purity:0,dissolve:0,special:'teleport',teleportRange:3},
  {name:'Charged Strike',type:'lightning',dice:'1d6',stat:'INT',range:1,desc:'A crackling blow: damage + purity.',purity:2,dissolve:0},
  {name:'Rending Slash',type:'fire',dice:'1d6',stat:'STR',range:1,desc:'A searing cut: strips 2 purity.',purity:0,dissolve:2},
  {name:'Shattering Crush',type:'earth',dice:'1d6',stat:'STR',range:1,desc:'A crushing blow: strips 2 purity.',purity:0,dissolve:2},
  {name:'Static Wave',type:'lightning',dice:'1d4',stat:'INT',range:3,desc:'A rolling discharge: ranged, strips purity.',purity:0,dissolve:2},
  {name:'Venom Touch',type:'fire',dice:'1d4',stat:'CHA',range:1,desc:'Inflicts poison: 1d4 for 2 turns.',purity:0,dissolve:0,special:'dot',dotDice:'1d4',dotTurns:2},
  {name:'Poison Cloud',type:'lightning',dice:'1d4',stat:'INT',range:2,desc:'A choking cloud: 1d4 for 2 turns.',purity:0,dissolve:0,special:'dot',dotDice:'1d4',dotTurns:2},
  {name:'Mend',type:'earth',dice:'0d0',stat:'WIS',range:0,desc:'Knit wounds: restore 2d6 HP.',purity:0,dissolve:0,special:'heal',healDice:'2d6'},
  // Physical ranged attacks — these LOOSE a projectile object across the field
  // (the combat projectile system keys off range>=2). An archer's bow shot and a
  // rogue's thrown blade.
  {name:'Arrow Shot',type:'physical',dice:'1d8',stat:'DEX',range:5,desc:'A loosed arrow finds its mark.',purity:0,dissolve:0},
  {name:'Thrown Blade',type:'physical',dice:'1d6',stat:'DEX',range:3,desc:'A blade spun from the hand.',purity:0,dissolve:0}
];
var ATTACKS={};ALL_ATTACKS.forEach(function(a){ATTACKS[a.name]=a});

/** Retired alchemical names → what they are called now. */
var ATTACK_ALIASES={
  'Calcination Strike':'Flame Strike',
  'Sol Flare':'Fire Blast',
  'Coagulation Slam':'Stone Slam',
  'Luna Ward':'Stone Ward',
  'Distillation Bolt':'Lightning Bolt',
  'Mercury Shift':'Blink',
  'Conjunction':'Charged Strike',
  'Dissolution Slash':'Rending Slash',
  'Dissolution Crush':'Shattering Crush',
  'Dissolution Wave':'Static Wave',
  'Putrefaction Touch':'Venom Touch',
  'Putrefaction Mist':'Poison Cloud',
  'Exaltation':'Mend'
};
// Old spellings resolve to the same object, so `ATTACKS[name]` is never empty
// for something written before the rename.
Object.keys(ATTACK_ALIASES).forEach(function(old){ ATTACKS[old]=ATTACKS[ATTACK_ALIASES[old]]; });

/** Canonical name for an attack, whichever spelling came in. */
function attackName(n){ return ATTACK_ALIASES[n] || n; }

/** Display colour per damage type — one table instead of the four inline
 *  ternaries that used to spell out sol/luna/mercury at each call site. */
var TYPE_COLORS={ fire:'#f59e0b', earth:'#7ba05b', lightning:'#7dd3fc', physical:'#94a3b8' };
/** Colour for a type, defaulting to the physical grey. */
function typeColor(t){ return TYPE_COLORS[t] || TYPE_COLORS.physical; }

export { BASIC_ATTACK, ALL_ATTACKS, ATTACKS, ATTACK_ALIASES, attackName, TYPE_COLORS, typeColor };
