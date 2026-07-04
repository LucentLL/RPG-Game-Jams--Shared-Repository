// Elements sprite-compositor data tables — extracted from crucible.js.
// Layer draw-orders, animation frame table, part manifest, palette bias, skin
// tones, weapon-mirror/fallback config, and the 8-facing geometry list.

var BODY_TYPES=['sulfur','salt','mercury'];

var ELEMENTS_LAYER_ORDER_SOUTH = [
  'shadow','backextra','backhair','weapon_back','bottom','top','head','hair','frontextra','hat','weapon_front'
];
// SIDE (E/W — camera sees a profile):
//   - back accessory & backhair sit BEHIND the body, so the near arm/hand
//     covers any tail/cape sprite that overlaps the silhouette. The portion
//     of the back accessory that extends past the body (e.g. a cape edge or
//     tail tip in empty space) is still visible because nothing else is
//     drawn over those pixels.
var ELEMENTS_LAYER_ORDER_SIDE = [
  'shadow','backextra','backhair','weapon_back','bottom','top','head','hair','frontextra','hat','weapon_front'
];
// NORTH (back view, also used by reverseDraw anims like Climb):
//   - back accessory is the dominant element, drawn over hair AND hat.
//   - backhair is drawn AFTER head AND after head-hair, so a ponytail / long
//     hair reads over the back of the skull and over the front hairline.
//   - frontextra (belts/sashes etc.) drops behind body — not visible from back.
var ELEMENTS_LAYER_ORDER_NORTH = [
  'shadow','weapon_back','frontextra','bottom','top','head','hair','backhair','hat','backextra','weapon_front'
];

// Legacy aliases (kept so existing references resolve; behavior is driven by
// the per-facing lookup in compositeCharacter).
var ELEMENTS_LAYER_ORDER = ELEMENTS_LAYER_ORDER_SOUTH;
var ELEMENTS_LAYER_ORDER_REV = ELEMENTS_LAYER_ORDER_NORTH;

var WEAPON_MIRROR_OK_ANIMS = { idle:1, move:1, hurt:1, death:1, prone:1 };

var _PASSIVE_ANIMS = { idle:1, move:1, hurt:1 };
var _PASSIVE_FALLBACK_COLS = [1, 0, 2];           // walk-stand → walk-frames
var _ACTIVE_FALLBACK_COLS  = [10, 11, 16, 15, 1, 0]; // attack → bow → idle

var ELEMENTS_ANIMS = {
  idle:   { cols: [1],          speed: 400, loop: true  },
  move:   { cols: [1,2,1,0],    speed: 140, loop: true  },          // Walk cycle
  slash:  { cols: [10,11,12,13,14], speed: 70, loop: false },       // Attack/Tool
  hurt:   { cols: [6],          speed: 250, loop: false },          // Crouch (recoil)
  death:  { cols: [22],         speed: 600, loop: false, hold: true },  // Sleep/Dead — held until cleared
  prone:  { cols: [22],         speed: 600, loop: false, hold: true },  // Knocked prone — same pose, held while `_prone` set
  parry:  { cols: [4],          speed: 150, loop: false },          // Arms Up stand (defensive / shove)
  cast:   { cols: [4,15,16,17,18], speed: 140, loop: false },       // Raise hands overhead → release like a bow shot
  hold:   { cols: [4,5,4,3],    speed: 140, loop: true },           // Arms Up walk
  jump:   { cols: [6,7,8,9],    speed: 90,  loop: false },
  nockBow:{ cols: [15,16,17,18],speed: 110, loop: false },
  climb:  { cols: [20,21,20,19],speed: 160, loop: true, reverseDraw: true }
};

var ELEMENTS_MANIFEST = {
  shadow: { fixed: true },
  backextra: { allowEmpty: true, parts: [
    {name:'backextra1', maxC:6}, {name:'backextra2', maxC:3}, {name:'backextra3', maxC:2},
    {name:'backpack1',  maxC:4}, {name:'backpack2',  maxC:3},
    {name:'tail1', maxC:7}, {name:'tail2', maxC:5}, {name:'tail3', maxC:10}, {name:'tail4', maxC:10}
  ]},
  backhair: { allowEmpty: true, parts: [
    {name:'backhair1', maxC:7}, {name:'backhair2', maxC:7}, {name:'backhair3', maxC:7}, {name:'backhair4', maxC:7}, {name:'backhair5', maxC:7},
    {name:'backhair6', maxC:7}, {name:'backhair7', maxC:7}, {name:'backhair8', maxC:14}, {name:'backhair9', maxC:6},
    {name:'backhair10', maxC:6}, {name:'backhair11', maxC:26}
  ]},
  bottom: { allowEmpty: false, parts: [
    {name:'bottom0', maxC:0, randomSkip:true},
    {name:'bottom1', maxC:4}, {name:'bottom2', maxC:4}, {name:'bottom3', maxC:4}, {name:'bottom4', maxC:4},
    {name:'bottom5', maxC:4}, {name:'bottom6', maxC:4}, {name:'bottom7', maxC:4}, {name:'bottom8', maxC:5},
    {name:'bottom9', maxC:6}, {name:'bottom10', maxC:7}, {name:'bottom11', maxC:6}, {name:'bottom12', maxC:11},
    {name:'bottom13', maxC:15}, {name:'bottom14', maxC:6}, {name:'bottom15', maxC:11},
    {name:'bottom16', maxC:11}, {name:'bottom17', maxC:7}, {name:'bottom18', maxC:13}, {name:'bottom19', maxC:16}
  ]},
  top: { allowEmpty: false, parts: [
    {name:'top0', maxC:0, randomSkip:true},
    {name:'top1', maxC:4}, {name:'top2', maxC:5}, {name:'top3', maxC:4}, {name:'top4', maxC:4}, {name:'top5', maxC:4},
    {name:'top6', maxC:4}, {name:'top7', maxC:4}, {name:'top8', maxC:4}, {name:'top9', maxC:4}, {name:'top10', maxC:4},
    {name:'top11', maxC:5}, {name:'top12', maxC:5}, {name:'top13', maxC:9}, {name:'top14', maxC:11}, {name:'top15', maxC:10},
    {name:'top16', maxC:9}, {name:'top17', maxC:13}, {name:'top18', maxC:10}, {name:'top19', maxC:5}, {name:'top20', maxC:5},
    {name:'top21', maxC:10}, {name:'top22', maxC:9}, {name:'top23', maxC:0},
    {name:'top24', maxC:0}, {name:'top25', maxC:6}, {name:'top26', maxC:7}, {name:'top27', maxC:5}
  ]},
  head: { allowEmpty: false, parts: [
    {name:'head1', maxC:2}, {name:'head2', maxC:2}, {name:'head3', maxC:0}, {name:'head4', maxC:2},
    {name:'head5', maxC:2}, {name:'head6', maxC:2}, {name:'head7', maxC:0}, {name:'head8', maxC:0},
    {name:'head9', maxC:3}, {name:'head10', maxC:3}, {name:'head11', maxC:3}, {name:'head12', maxC:3},
    {name:'head13', maxC:3}, {name:'head14', maxC:3}, {name:'head15', maxC:0}, {name:'head16', maxC:0}, {name:'head17', maxC:2},
    {name:'head18', maxC:6}, {name:'head19', maxC:6}, {name:'head20', maxC:7}
  ]},
  hair: { allowEmpty: true, parts: [
    {name:'hair1', maxC:7}, {name:'hair2', maxC:7}, {name:'hair3', maxC:7}, {name:'hair4', maxC:7}, {name:'hair5', maxC:7},
    {name:'hair6', maxC:7}, {name:'hair7', maxC:7}, {name:'hair8', maxC:7}, {name:'hair9', maxC:7},
    {name:'hair10', maxC:7}, {name:'hair11', maxC:7}, {name:'hair12', maxC:7},
    {name:'hair13', maxC:11}, {name:'hair14', maxC:11}, {name:'hair15', maxC:7}, {name:'hair16', maxC:7}, {name:'hair17', maxC:7},
    {name:'hair18', maxC:7}, {name:'hair19', maxC:7}, {name:'hair20', maxC:7}, {name:'hair21', maxC:7},
    {name:'hair22', maxC:6}, {name:'hair23', maxC:25}, {name:'hair24', maxC:23}, {name:'hair25', maxC:6}
  ]},
  hat: { allowEmpty: true, parts: [
    {name:'hat1', maxC:4}, {name:'hat2', maxC:4}, {name:'hat3', maxC:2}, {name:'hat4', maxC:3}, {name:'hat5', maxC:6}, {name:'hat6', maxC:6},
    {name:'hat7', maxC:5}, {name:'hat8', maxC:5}, {name:'hat9', maxC:6},
    {name:'crown1', maxC:5}, {name:'crown2', maxC:5},
    {name:'hat11', maxC:8}, {name:'hat12', maxC:2}, {name:'hat13', maxC:4}
  ]},
  frontextra: { allowEmpty: true, parts: [
    {name:'frontextra1', maxC:7}, {name:'frontextra2', maxC:8}, {name:'frontextra3', maxC:3},
    {name:'frontextra4', maxC:6}, {name:'frontextra5', maxC:6}, {name:'frontextra6', maxC:2}
  ]}
};

var PRIME_PALETTE_BIAS = {
  sulfur:  { hair:[2,3,5,6],   top:[1,2,5],   bottom:[1,2,4], hat:[2,3,4,5], backextra:[1,2,3,4] },
  salt:    { hair:[1,4,6,7],   top:[2,3,4],   bottom:[2,3,4], hat:[2,5,6],   backextra:[3,4,5,6] },
  mercury: { hair:[1,5,6,7],   top:[3,4,5],   bottom:[3,4,5], hat:[1,4,5,6], backextra:[2,3,5,6] }
};

var ELEMENTS_SKIN_SOURCE = [
  [115, 23, 45], [187,117, 71], [219,164, 99], [244,210,156], [250,244,214]
];
var ELEMENTS_SKIN_TONES = [
  { name: 'Default', target: null },
  { name: 'Tone 1',  target: [[ 86, 31, 45],[157, 85, 52],[180,114, 60],[212,145, 73],[240,193,117]] },
  { name: 'Tone 2',  target: [[ 72, 28, 14],[119, 65, 40],[149, 81, 35],[185,126, 80],[219,170,118]] },
  { name: 'Tone 3',  target: [[ 54, 21, 12],[ 88, 51, 34],[123, 76, 45],[152,103, 67],[199,142, 82]] },
  { name: 'Green',   target: [[ 24, 78, 58],[ 61,138, 62],[108,179, 40],[175,227, 86],[228,252,162]] },
  { name: 'Red',     target: [[ 78, 34, 24],[143, 36, 22],[199, 73, 52],[233,101,100],[252,162,171]] },
  { name: 'Bone',    target: [[ 81, 57, 63],[137,120,108],[182,172,170],[230,225,225],[246,255,255]] }
];

var ELEMENTS_FIXED_LAYERS = { shadow: 1, bottom: 1 };
var ELEMENTS_HAT_OPEN_TOP = { crown1: 1, crown2: 1 };

var SPRITE_ANIMS = ELEMENTS_ANIMS;

var BOB_EXCITE_ANIMS = { slash:1, move:1, hurt:1, parry:1, cast:1, jump:1, hold:1 };
var BOB_EXCITE_DURATION_MS = 1500; // ~two bobs at peak speed before fully settling

var FACINGS=[
  {l:'S',a:0},{l:'SW',a:-Math.PI*0.25},{l:'W',a:-Math.PI*0.5},{l:'NW',a:-Math.PI*0.75},
  {l:'N',a:Math.PI},{l:'NE',a:Math.PI*0.75},{l:'E',a:Math.PI*0.5},{l:'SE',a:Math.PI*0.25}
];

export {
  BODY_TYPES, ELEMENTS_LAYER_ORDER_SOUTH, ELEMENTS_LAYER_ORDER_SIDE, ELEMENTS_LAYER_ORDER_NORTH,
  ELEMENTS_LAYER_ORDER, ELEMENTS_LAYER_ORDER_REV, WEAPON_MIRROR_OK_ANIMS,
  _PASSIVE_ANIMS, _PASSIVE_FALLBACK_COLS, _ACTIVE_FALLBACK_COLS,
  ELEMENTS_ANIMS, ELEMENTS_MANIFEST, PRIME_PALETTE_BIAS,
  ELEMENTS_SKIN_SOURCE, ELEMENTS_SKIN_TONES, ELEMENTS_FIXED_LAYERS, ELEMENTS_HAT_OPEN_TOP,
  SPRITE_ANIMS, BOB_EXCITE_ANIMS, BOB_EXCITE_DURATION_MS, FACINGS,
};
