/**
 * @file Guild economy — gold, weekly wages/upkeep, quest rewards. Kept separate
 * so balancing lives in one place.
 */

/** A hero's weekly wage, scaled by level. @param {import('./hero.js').Hero} hero @returns {number} */
export function heroWage(hero) { return 10 + hero.level * 5; }

/**
 * Total weekly upkeep: hero wages + assigned diet costs.
 * @param {import('./guild.js').Guild} guild
 * @param {(id:string)=>?{weeklyCost:number}} [dietLookup]  e.g. getDietPlan from diet.js
 * @returns {number}
 */
export function weeklyUpkeep(guild, dietLookup) {
  let cost = 0;
  for (const hero of guild.roster) {
    cost += heroWage(hero);
    if (hero.dietPlanId && dietLookup) {
      const plan = dietLookup(hero.dietPlanId);
      if (plan) cost += plan.weeklyCost;
    }
  }
  return cost;
}

/** Apply a gold delta, clamped at zero. @param {import('./guild.js').Guild} guild @param {number} delta @returns {number} */
export function addGold(guild, delta) {
  guild.gold = Math.max(0, guild.gold + delta);
  return guild.gold;
}
