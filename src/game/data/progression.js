// Progression & materia data tables — extracted from crucible.js.
// Pure data: planetary metals, adjacent compounds, per-round metal budgets, rank tiers.
// ═══ PLANETARY METALS ═══
// ELEMENTS, NOT METALS (user decree, 2026-08-22: "remove the metal/alchemy
// nomenclature from the materia. Just give them basic elemental names for
// now"). ONLY `name` and `desc` changed — `key`, `col`, `bonus`, `bonusDesc`
// and `grants` are untouched, and a socketed orb stores an INDEX into this
// array, so nothing already forged, saved or pinned shifts under the rename.
// Each element matches what its row already DID: 'Flame Strike, Fire Blast'
// was Gold's grant list before it was Fire's, and the point of the rename is
// that the name now says so. `sym`/`planet` stay as data nothing draws.
// The Unity port carries the identical table (Assets/Scripts/Arena/Materia.cs).
var PLANETS=[
  {key:'silver',  sym:'☽',name:'Light',  planet:'Moon',   col:'#b8c4d0',bonus:'defense', bonusDesc:'+AC',     desc:'Warding radiance.',
    grants:['Stone Ward','Mend']},
  {key:'quicksilver',sym:'☿',name:'Lightning',planet:'Mercury',col:'#a890f0',bonus:'accuracy',bonusDesc:'+hit',   desc:'Volatile arc.',
    grants:['Blink','Lightning Bolt']},
  {key:'copper',  sym:'♀',name:'Earth',  planet:'Venus',  col:'#c87850',bonus:'lifesteal',bonusDesc:'Heal',     desc:'Restorative ground.',
    grants:['Charged Strike','Stone Slam']},
  {key:'gold',    sym:'☉',name:'Fire',    planet:'Sun',    col:'#d4a843',bonus:'damage',   bonusDesc:'+dmg',     desc:'Kindled fury.',
    grants:['Flame Strike','Fire Blast']},
  {key:'iron',    sym:'♂',name:'Ice',    planet:'Mars',   col:'#c45040',bonus:'crit',     bonusDesc:'Crit++',   desc:'Shattering cold.',
    grants:['Rending Slash','Shattering Crush']},
  {key:'tin',     sym:'♃',name:'Wind',     planet:'Jupiter',col:'#a8b8c8',bonus:'range',    bonusDesc:'+range',   desc:'Carrying gale.',
    grants:['Static Wave']},
  {key:'lead',    sym:'♄',name:'Poison',    planet:'Saturn', col:'#6b6b75',bonus:'dot',      bonusDesc:'+DOT',     desc:'Creeping blight.',
    grants:['Venom Touch','Poison Cloud']}
];
// Named for the ELEMENTS that make them, now that the orbs are elements —
// 'Solar Forge' was Gold-and-Iron and would read as a leftover beside Fire and
// Ice. Pairing is by INDEX and every effect is untouched; only the names moved.
var COMPOUNDS=[
  {a:0,b:1,name:'Radiant Arc',     col:'#c0b8e8',desc:'+3 AC and +1 hit'},
  {a:1,b:2,name:'Grounded Current',col:'#b880c0',desc:'Lifesteal heals 1d6'},
  {a:2,b:3,name:'Molten Vein',     col:'#d8a858',desc:'Lifesteal + bonus damage'},
  {a:3,b:4,name:'Thermal Shock',   col:'#d47040',desc:'+3 dmg, crit 19-20'},
  {a:4,b:5,name:'Blizzard',        col:'#b06868',desc:'Crit 18-20 and +1 range'},
  {a:5,b:6,name:'Miasma',          col:'#8890a0',desc:'+2 range and +2 DOT'}
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
