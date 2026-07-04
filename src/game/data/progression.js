// Progression & materia data tables — extracted from crucible.js.
// Pure data: planetary metals, adjacent compounds, per-round metal budgets, rank tiers.
// ═══ PLANETARY METALS ═══
var PLANETS=[
  {key:'silver',  sym:'☽',name:'Silver',  planet:'Moon',   col:'#b8c4d0',bonus:'defense', bonusDesc:'+AC',     desc:'Lunar reflection.',
    grants:['Luna Ward','Exaltation']},
  {key:'quicksilver',sym:'☿',name:'Quicksilver',planet:'Mercury',col:'#a890f0',bonus:'accuracy',bonusDesc:'+hit',   desc:'Volatile flux.',
    grants:['Mercury Shift','Distillation Bolt']},
  {key:'copper',  sym:'♀',name:'Copper',  planet:'Venus',  col:'#c87850',bonus:'lifesteal',bonusDesc:'Heal',     desc:'Restorative warmth.',
    grants:['Conjunction','Coagulation Slam']},
  {key:'gold',    sym:'☉',name:'Gold',    planet:'Sun',    col:'#d4a843',bonus:'damage',   bonusDesc:'+dmg',     desc:'Solar radiance.',
    grants:['Calcination Strike','Sol Flare']},
  {key:'iron',    sym:'♂',name:'Iron',    planet:'Mars',   col:'#c45040',bonus:'crit',     bonusDesc:'Crit++',   desc:'Aggressive edge.',
    grants:['Dissolution Slash','Dissolution Crush']},
  {key:'tin',     sym:'♃',name:'Tin',     planet:'Jupiter',col:'#a8b8c8',bonus:'range',    bonusDesc:'+range',   desc:'Expansive force.',
    grants:['Dissolution Wave']},
  {key:'lead',    sym:'♄',name:'Lead',    planet:'Saturn', col:'#6b6b75',bonus:'dot',      bonusDesc:'+DOT',     desc:'Heavy oppression.',
    grants:['Putrefaction Touch','Putrefaction Mist']}
];
var COMPOUNDS=[
  {a:0,b:1,name:'Lunar Flux',     col:'#c0b8e8',desc:'+3 AC and +1 hit'},
  {a:1,b:2,name:'Healing Arts',   col:'#b880c0',desc:'Lifesteal heals 1d6'},
  {a:2,b:3,name:'Solar Grace',    col:'#d8a858',desc:'Lifesteal + bonus damage'},
  {a:3,b:4,name:'Solar Forge',    col:'#d47040',desc:'+3 dmg, crit 19-20'},
  {a:4,b:5,name:'War Expansion',  col:'#b06868',desc:'Crit 18-20 and +1 range'},
  {a:5,b:6,name:'Crushing Weight',col:'#8890a0',desc:'+2 range and +2 DOT'}
];

var ROUND_METALS=[
  {name:'Lead',    sym:'♄',col:'#6b6b75',budget:1.0},
  {name:'Tin',     sym:'♃',col:'#a8b8c8',budget:1.2},
  {name:'Iron',    sym:'♂',col:'#c45040',budget:1.4},
  {name:'Copper',  sym:'♀',col:'#c87850',budget:1.6},
  {name:'Silver',  sym:'☽',col:'#b8c4d0',budget:1.8},
  {name:'Gold',    sym:'☉',col:'#d4a843',budget:2.0},
  {name:'Platinum',sym:'✦',col:'#e8dff0',budget:2.3}
];

var RANKS=[
  {links:0,key:'lead',    name:'Lead',    sym:'♄',col:'#6b6b75'},
  {links:1,key:'tin',     name:'Tin',     sym:'♃',col:'#a8b8c8'},
  {links:2,key:'iron',    name:'Iron',    sym:'♂',col:'#c45040'},
  {links:3,key:'copper',  name:'Copper',  sym:'♀',col:'#c87850'},
  {links:4,key:'silver',  name:'Silver',  sym:'☽',col:'#b8c4d0'},
  {links:5,key:'gold',    name:'Gold',    sym:'☉',col:'#d4a843'},
  {links:6,key:'platinum',name:'Platinum',sym:'✦',col:'#e8dff0'}
];

export { PLANETS, COMPOUNDS, ROUND_METALS, RANKS };
