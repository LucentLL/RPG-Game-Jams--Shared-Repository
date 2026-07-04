// Attack definitions — extracted from crucible.js.
// ═══ ATTACKS ═══
var BASIC_ATTACK={name:'Strike',type:'physical',dice:'1d6',stat:'STR',range:1,desc:'Basic melee attack.',purity:0,dissolve:0};
var ALL_ATTACKS=[
  BASIC_ATTACK,
  {name:'Calcination Strike',type:'sol',dice:'2d6',stat:'STR',range:1,desc:'Burning fist channels Sol energy.',purity:0,dissolve:0},
  {name:'Sol Flare',type:'sol',dice:'1d10',stat:'CHA',range:3,desc:'Concentrated solar radiance beam.',purity:0,dissolve:0},
  {name:'Coagulation Slam',type:'luna',dice:'1d8',stat:'STR',range:1,desc:'Luna-infused body slam.',purity:0,dissolve:0},
  {name:'Luna Ward',type:'luna',dice:'0d0',stat:'WIS',range:0,desc:'Luna barrier: +3 AC until next turn.',purity:0,dissolve:0,special:'ward',acBonus:3},
  {name:'Distillation Bolt',type:'mercury',dice:'1d8',stat:'INT',range:4,desc:'Mercurial bolt at range.',purity:0,dissolve:0},
  {name:'Mercury Shift',type:'mercury',dice:'0d0',stat:'DEX',range:0,desc:'Teleport up to 3 tiles.',purity:0,dissolve:0,special:'teleport',teleportRange:3},
  {name:'Conjunction',type:'mercury',dice:'1d6',stat:'INT',range:1,desc:'Transmutation strike: dmg + purity.',purity:2,dissolve:0},
  {name:'Dissolution Slash',type:'sol',dice:'1d6',stat:'STR',range:1,desc:'Corrosive Sol: strips 2 purity.',purity:0,dissolve:2},
  {name:'Dissolution Crush',type:'luna',dice:'1d6',stat:'STR',range:1,desc:'Crushing Luna: strips 2 purity.',purity:0,dissolve:2},
  {name:'Dissolution Wave',type:'mercury',dice:'1d4',stat:'INT',range:3,desc:'Entropic wave: ranged, strips purity.',purity:0,dissolve:2},
  {name:'Putrefaction Touch',type:'sol',dice:'1d4',stat:'CHA',range:1,desc:'Inflicts DOT: 1d4 for 2 turns.',purity:0,dissolve:0,special:'dot',dotDice:'1d4',dotTurns:2},
  {name:'Putrefaction Mist',type:'mercury',dice:'1d4',stat:'INT',range:2,desc:'DOT cloud: 1d4 for 2 turns.',purity:0,dissolve:0,special:'dot',dotDice:'1d4',dotTurns:2},
  {name:'Exaltation',type:'luna',dice:'0d0',stat:'WIS',range:0,desc:'Luna healing: restore 2d6 HP.',purity:0,dissolve:0,special:'heal',healDice:'2d6'}
];
var ATTACKS={};ALL_ATTACKS.forEach(function(a){ATTACKS[a.name]=a});

export { BASIC_ATTACK, ALL_ATTACKS, ATTACKS };
