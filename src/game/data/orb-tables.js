// Materia-orb frame tuples + gear-appearance sprite ladders (extracted from crucible.js).
var ORB_FRAMES = {
  idle:    [[1,0],[0,1],[1,1],[2,1]],          // 4-frame pulse (top, l, c, r)
  levelup: [[3,0],[3,1],[3,2],[3,3]],          // halo column (red-arrow path)
  crumble: [[5,0],[5,1],[5,2],[5,3]],          // cracks progress (blue-arrow start)
  dust:    [10,3]                              // single dust pile cell
};
// Planet → orb color. Sol/Mars/Mercury/Venus map directly; Luna/Jupiter/
// Saturn reuse the closest match (Luna→blue, Jupiter→yellow, Saturn→green).
// Order matches PLANETS: [Moon, Mercury, Venus, Sun, Mars, Jupiter, Saturn].
var PLANET_TO_ORB_COLOR = ['blue','blue','green','yellow','red','yellow','green'];
var ORB_COLORS = ['blue','red','green','yellow'];

var GEAR_WEAPON_LADDER = {
  Sword: [
    {stem:'sword1', maxC:3}, {stem:'sword2', maxC:3}, {stem:'sword3', maxC:3},
    {stem:'sword4', maxC:3}, {stem:'sword5', maxC:4}
  ],
  Dagger: [ {stem:'dagger', maxC:3, slotSuffix:true} ],
  Wand:   [ {stem:'wand1', maxC:8} ],
  Bow:    [ {stem:'bow1', maxC:0}, {stem:'bow1', maxC:0}, {stem:'bow1arrow1', maxC:0} ],
  Axe:    [ {stem:'axe1', maxC:3}, {stem:'axe1', maxC:3}, {stem:'axe2', maxC:3}, {stem:'axe2', maxC:3} ],
  Hammer: [ {stem:'hammer', maxC:3} ],
  Club:   [ {stem:'pickaxe1', maxC:2} ],
  Buckler:[ {stem:'shield1', maxC:0, slotSuffix:true}, {stem:'shield1', maxC:0, slotSuffix:true}, {stem:'shield2', maxC:6, slotSuffix:true}, {stem:'shield2', maxC:6, slotSuffix:true} ]
};

// Body / Head / Lower → layer override mapping. Lets gear cards AND the
// on-field sprite show real pixel art for armor / hats / pants. Higher tier
// indexes a later (fancier) stem.
var GEAR_BODY_LADDER = {
  Plate: [
    {layer:'top', stem:'top9',  maxC:4}, {layer:'top', stem:'top10', maxC:4},
    {layer:'top', stem:'top12', maxC:5}, {layer:'top', stem:'top14', maxC:11},
    {layer:'top', stem:'top17', maxC:13}
  ],
  Mail: [
    {layer:'top', stem:'top5',  maxC:4}, {layer:'top', stem:'top13', maxC:9},
    {layer:'top', stem:'top15', maxC:10}, {layer:'top', stem:'top21', maxC:10}
  ],
  Robes: [
    {layer:'top', stem:'top11', maxC:5}, {layer:'top', stem:'top18', maxC:10},
    {layer:'top', stem:'top25', maxC:6}, {layer:'top', stem:'top26', maxC:7}
  ],
  Cloak: [
    {layer:'backextra', stem:'backextra1', maxC:6},
    {layer:'backextra', stem:'backextra2', maxC:3},
    {layer:'backextra', stem:'backextra3', maxC:2}
  ],
  Vest: [
    {layer:'top', stem:'top1', maxC:4}, {layer:'top', stem:'top2', maxC:5},
    {layer:'top', stem:'top3', maxC:4}, {layer:'top', stem:'top19', maxC:5}
  ]
};
var GEAR_HEAD_LADDER = {
  Helm: [
    {layer:'hat', stem:'hat1', maxC:4}, {layer:'hat', stem:'hat2', maxC:4},
    {layer:'hat', stem:'hat3', maxC:2}, {layer:'hat', stem:'hat5', maxC:6}
  ],
  Crown: [
    {layer:'hat', stem:'crown1', maxC:5}, {layer:'hat', stem:'crown2', maxC:5}
  ],
  Cap: [
    {layer:'hat', stem:'hat4', maxC:3}, {layer:'hat', stem:'hat7', maxC:5}, {layer:'hat', stem:'hat8', maxC:5}
  ],
  Hood: [
    {layer:'hat', stem:'hat6', maxC:6}, {layer:'hat', stem:'hat9', maxC:6},
    {layer:'hat', stem:'hat11', maxC:8}, {layer:'hat', stem:'hat13', maxC:4}
  ]
};
var GEAR_LOWER_LADDER = {
  Trousers: [
    {layer:'bottom', stem:'bottom1', maxC:4}, {layer:'bottom', stem:'bottom4', maxC:4}, {layer:'bottom', stem:'bottom7', maxC:4}
  ],
  Leggings: [
    {layer:'bottom', stem:'bottom2', maxC:4}, {layer:'bottom', stem:'bottom6', maxC:4}, {layer:'bottom', stem:'bottom9', maxC:6}
  ],
  Skirt: [
    {layer:'bottom', stem:'bottom3', maxC:4}, {layer:'bottom', stem:'bottom8', maxC:5}, {layer:'bottom', stem:'bottom13', maxC:15}
  ]
};

export { ORB_FRAMES, PLANET_TO_ORB_COLOR, ORB_COLORS, GEAR_WEAPON_LADDER, GEAR_BODY_LADDER, GEAR_HEAD_LADDER, GEAR_LOWER_LADDER };
