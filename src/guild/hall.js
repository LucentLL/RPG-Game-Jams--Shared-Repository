// Guild Hall — weekly management for the Heroes Guild.
//
// Each hero gets a weekly assignment: TRAIN a stat, or WORK the FORGE (consume
// materials to make a real weapon that lands in the armory), plus a diet. Advance
// Week resolves the whole roster. You hire from the tavern and equip heroes from
// the armory — by hand, or via the QUARTERMASTER policy that auto-issues the best
// available gear to the strongest heroes ("by rank") before they march. Equipped
// quality feeds combatPower, so a well-forged armory measurably wins quests.
// Consumables/provisioning (an Alchemist's potions a party withdraws) come next.

import { createGuild, FACILITIES, maxRoster, facilityTier, fedCapacity } from './guild.js';
import { HERO_STATS, heroPower, STAT_CAP, lifeStage, lifeFrac, TRAITS, traitMult } from './hero.js';
import { generateRecruit, hireCost, rollRecruitPool } from './recruiting.js';
import { makeApprentice, normalizeApprentice, dormCapacity, academyBoard, developApprentice, developmentRate, graduate, potentialStars, LEAN_GLYPH, APPRENTICE_INTAKE } from './apprentices.js';
import { DRILLS, REST, getDrill, applyTraining, applySpar, injuryLabel, previewInjuryChance, inflictInjury, rollInjurySeverity } from './training.js';
import { stationBonusFor } from './stations.js';
import { DIET_PLANS, getDietPlan, applyDiet } from './diet.js';
import { advanceWeek, formatDate } from './calendar.js';
import { weeklyUpkeep, addGold, guildIncome } from './economy.js';
import { RECIPES, getRecipe, previewQuality, forge, study, recipeUnlocked } from './smithing.js';
import { POTION_RECIPES, getPotionRecipe, previewPotency, brew, potionUnlocked, applyPotion } from './alchemy.js';
import { MATERIALS, createInventory, armoryItems, findItem, addMaterial, gearBonus, EQUIP_SLOTS, findPotion, consumePotion, potionCount } from './inventory.js';
import { generateQuestBoard, resolveQuest, resolveQuestPlayed } from './quests.js';
import { nextTournament, resolveTournament, placement, championOdds } from './tournaments.js';
import { generateSeason, EVENT_TYPES, seasonOf } from './events.js';
import { roleFor } from './roles.js';
import { qualityTier } from './item.js';
import { MATERIAL_PRICE, buyPrice, itemSellValue, createMarket, refreshMarket } from './market.js';
import { saveGame, loadGame } from '../platform/storage.js';
import { playTournamentMatch, playQuestBout, battleEngineReady } from './battle-bridge.js';
import { renderRanch, stopRanchLoop, toggleBuild, pickStation, placeStationAt, removeStationById } from './ranch.js';

const SLOT = 'guild';
// The roster cap is no longer a constant — it's derived from the Living Quarters
// facility tier via maxRoster(guild) (see the Grounds view). Tier 0 == 6, as before.
const QUEST_STAMINA = 40; // dispatching on a quest costs stamina — questing can't be spammed
/** Whether a hero would actually march if dispatched — injured or too-tired heroes stay home. */
const canMarch = (h) => !h.condition.injury && h.condition.stamina >= QUEST_STAMINA;
const DRILL_MIGRATE = { drill_pow: 'pow', guard_def: 'def', forms_skl: 'skl', sprint_spd: 'spd', study_int: 'int', march_vit: 'vit', spar: 'pow' };
const ARCH_GLYPH = { Knight: '⚔', Mage: '✦', Ranger: '🏹', Cleric: '☩', Rogue: '🗡', Berserker: '🪓', Adventurer: '☉' };
const KIND_GLYPH = { sword: '⚔', armor: '🛡', bow: '🏹' };

let guild = null;
let selectedId = null;
let report = null;
let notice = '';
let currentRoom = 'hub'; // UI-only: which room the stage shows. Never saved — resets to hub each session.
// The play opt-in now lives ON the guild (guild.playPlan = {kind,id,mode}) so it
// survives reload and can arm quests as well as tournaments. `planFor` reads it.
let advancing = false; // re-entrancy guard — a played battle makes advanceAll async & minutes-long.
let ranchView = true; // UI-only: the guild opens on the RANCH (home view); rooms are drill-in detail.

// The guild hall's rooms, in the sketch's row-major order. `tag` = work vs storage vs
// living; `locked` rooms are stubbed until their system (the Alchemist) is built.
const ROOMS = [
  { id: 'grounds', glyph: '🏕', name: 'Grounds', tag: 'COMPOUND' },
  { id: 'calendar', glyph: '📅', name: 'Calendar', tag: 'SEASON' },
  { id: 'roster', glyph: '🛡', name: 'Roster', tag: 'MEMBERS' },
  { id: 'arena', glyph: '⚔', name: 'Arena', tag: 'COMBAT' },
  { id: 'forge', glyph: '🔨', name: 'Forge', tag: 'WORK' },
  { id: 'kitchen', glyph: '🍲', name: 'Kitchen', tag: 'WORK' },
  { id: 'apothecary', glyph: '🏺', name: 'Apothecary', tag: 'STORAGE' },
  { id: 'library', glyph: '📖', name: 'Library', tag: 'WORK' },
  { id: 'armory', glyph: '🗡', name: 'Armory', tag: 'STORAGE' },
  { id: 'laboratory', glyph: '⚗', name: 'Laboratory', tag: 'WORK' },
  { id: 'quarters', glyph: '🍺', name: 'Quarters', tag: 'LIVING' },
  { id: 'academy', glyph: '🎓', name: 'Academy', tag: 'LIVING' },
];
function getRoom(id) { return ROOMS.find((r) => r.id === id) || null; }

function save() { saveGame(SLOT, guild); }
function heroById(id) { return guild.roster.find((h) => h.id === id); }
function clamp(n) { return Math.max(0, Math.min(100, Math.round(n))); }

/** Field power = trained stats + whatever gear the hero is carrying. Used for quest
 *  odds, resolution, and the displayed ⚡ so equipping visibly makes a hero stronger. */
function combatPower(h) { return heroPower(h) + gearBonus(guild.inventory, h); }

/** The armed play lens for an event, or null. guild.playPlan = {kind, id, mode}. */
function planFor(kind, id) {
  const p = guild && guild.playPlan;
  return (p && p.kind === kind && p.id === id) ? p.mode : null;
}

/** Top two healing batches from the Apothecary — the corner's kit for a played battle. */
function withdrawPotions() {
  return (guild.inventory.potions || [])
    .filter((b) => b.type === 'heal' && b.qty > 0)
    .sort((a, b) => (b.potency || 0) - (a.potency || 0))
    .slice(0, 2)
    .map((b) => ({ batchId: b.id, name: b.name, glyph: b.glyph, potency: b.potency, qty: b.qty }));
}
/** Decrement REAL Apothecary stock for potions drunk mid-battle (result.itemsUsed). */
function spendPotions(used) {
  for (const id in used) for (let i = 0; i < used[id]; i++) consumePotion(guild.inventory, id);
}

/** Modal lens chooser for a due match: resolves {mode:'action'|'tactical'|'sim', remember}.
 *  Shown mid-advanceAll (which is already async); the overlay sits above everything. */
function chooseLens({ glyph, title, sub }) {
  return new Promise((resolve) => {
    const old = document.querySelector('.lens-overlay'); if (old) old.remove();
    const ov = document.createElement('div');
    ov.className = 'lens-overlay';
    ov.innerHTML = `<div class="lens-card">
        <div class="lens-title">${glyph || '🏆'} ${title}</div>
        <div class="lens-sub">${sub}</div>
        <button class="lens-btn" data-m="action">⚔ Fight it live <span>real-time arena — stick + tap</span></button>
        <button class="lens-btn" data-m="tactical">♟ Command it <span>simultaneous turn-based tactics</span></button>
        <button class="lens-btn" data-m="spectate">👁 Spectate <span>watch it fought turn by turn — take control anytime</span></button>
        <button class="lens-btn sim" data-m="sim">▶ Simulate <span>let the week resolve it</span></button>
        <label class="lens-remember"><input type="checkbox"> don’t ask again — always simulate <span class="dim">(re-enable on the Calendar)</span></label>
      </div>`;
    document.body.appendChild(ov);
    ov.querySelectorAll('.lens-btn').forEach((b) => {
      b.onclick = () => {
        const remember = !!ov.querySelector('.lens-remember input').checked;
        ov.remove();
        resolve({ mode: b.dataset.m, remember });
      };
    });
  });
}

/** Between played bracket rounds: fight the next round yourself, or hand the rest
 *  to the resolver? (Both paths run the same power×variance curve — no hidden tax.) */
function bracketInterstitial(t) {
  return (nextRound, rounds, nextFoePower) => new Promise((resolve) => {
    const old = document.querySelector('.lens-overlay'); if (old) old.remove();
    const ov = document.createElement('div');
    ov.className = 'lens-overlay';
    ov.innerHTML = `<div class="lens-card">
        <div class="lens-title">${(EVENT_TYPES[t.type] || {}).glyph || '🏆'} ${t.name}</div>
        <div class="lens-sub">Round won! Next: <b>round ${nextRound} of ${rounds}</b> — a ~${nextFoePower}⚡ foe waits in the ring.</div>
        <button class="lens-btn" data-v="fight">⚔ Fight on <span>next opponent, same controls</span></button>
        <button class="lens-btn sim" data-v="sim">▶ Simulate the rest <span>the resolver plays out the remaining rounds</span></button>
      </div>`;
    document.body.appendChild(ov);
    ov.querySelectorAll('.lens-btn').forEach((b) => {
      b.onclick = () => { ov.remove(); resolve(b.dataset.v === 'fight'); };
    });
  });
}

/** Weekly training multiplier bag = each diet's per-stat bias × the Training Yard's
 *  flat gain multiplier. It merges into training.js's existing (dietBias[stat]||1)
 *  factor, so no gain-formula change is needed — a better yard trains everyone faster. */
function trainingBias(diet) {
  let m = FACILITIES.yard.mainMult[facilityTier(guild, 'yard')] || 1;
  if (guild.trainer) m *= 1.15; // a retired champion runs the drills — everyone learns faster
  const db = (diet && diet.statBias) || {};
  const bias = {};
  for (const s of HERO_STATS) bias[s] = (db[s] || 1) * m;
  return bias;
}
/** Training opts bag: Sparring Ring headroom + the diet's injury-risk modifier
 *  (finally wired) + the Infirmary's healing rate. */
function ringOpts(diet) {
  return {
    injuryBonus: FACILITIES.ring.injuryBonus[facilityTier(guild, 'ring')] || 0,
    injuryRiskMod: (diet && diet.injuryRiskMod) ?? 1,
    healRate: FACILITIES.infirmary.healRate[facilityTier(guild, 'infirmary')] || 1,
  };
}

// --- Quartermaster: hand armory gear out by policy ---------------------------
const itemScore = (it) => (it.quality || 0) * (it.durability ? it.durability.current / (it.durability.max || 100) : 1);

/** Close the open wielder-history entry of an item being set down. */
function closeWielder(item) {
  const w = item.history.wielders[item.history.wielders.length - 1];
  if (w && !w.toWeek) w.toWeek = guild.calendar.week;
}
/** Put `item` on hero `h`, returning any displaced item to the armory. Pure state — no UI. */
function doEquip(h, item) {
  if (h.equipped[item.slot]) { const prev = findItem(guild.inventory, h.equipped[item.slot]); if (prev) { prev.location = 'armory'; closeWielder(prev); } }
  h.equipped[item.slot] = item.id;
  item.location = h.id;
  item.history.wielders.push({ personId: h.id, fromWeek: guild.calendar.week, toWeek: null });
}

/**
 * Issue the best available armory gear to a set of heroes, strongest hero first
 * ("by rank"). Only upgrades — never strips a hero of better gear. A hero's old
 * item returns to the armory and can trickle down to a weaker hero. Returns the
 * number of items issued.
 * @param {import('./hero.js').Hero[]} candidates
 */
function armHeroes(candidates) {
  const inv = guild.inventory;
  const order = [...candidates].sort((a, b) => heroPower(b) - heroPower(a)); // rank by trained stats (stable during allocation)
  let issued = 0;
  for (const slot of EQUIP_SLOTS) {
    for (const h of order) {
      const pool = armoryItems(inv).filter((it) => it.slot === slot).sort((a, b) => itemScore(b) - itemScore(a));
      if (!pool.length) break; // nothing of this slot left to hand out
      const best = pool[0];
      const cur = h.equipped[slot] ? findItem(inv, h.equipped[slot]) : null;
      if (!cur || itemScore(best) > itemScore(cur)) { doEquip(h, best); issued++; }
    }
  }
  return issued;
}

function ensureAssignment(h) {
  const a = h.assignment || {};
  h.assignment = {
    type: ['forge', 'study', 'quest', 'brew'].includes(a.type) ? a.type : 'train',
    trainingId: (a.trainingId === 'spar' || getDrill(a.trainingId)) ? a.trainingId : (DRILL_MIGRATE[a.trainingId] || 'pow'),
    intensity: a.intensity === 'heavy' ? 'heavy' : 'light',
    sparWith: a.sparWith || null,
    recipeId: getRecipe(a.recipeId) ? a.recipeId : 'iron_sword',
    potionId: getPotionRecipe(a.potionId) ? a.potionId : 'minor_heal',
    discipline: a.discipline === 'alchemy' ? 'alchemy' : 'blacksmithing',
    questId: a.questId || null,
    dietId: getDietPlan(a.dietId) ? a.dietId : (getDietPlan(h.dietPlanId) ? h.dietPlanId : 'balanced'),
  };
  if (!h.dietPlanId) h.dietPlanId = h.assignment.dietId;
  if (!Array.isArray(h.schedule)) h.schedule = []; // Pillar B: multi-week training plan
  else h.schedule = h.schedule.filter((p) => p && (p.trainingId === 'rest' || getDrill(p.trainingId))).slice(0, 8); // sanitize legacy/oversized queues
}

// Migrate old saves: D&D stats -> MR stats, and add professions/equipped/inventory.
function migrateHero(h) {
  if (h && h.stats && h.stats.POW === undefined) {
    const o = h.stats;
    const up = (v) => Math.min(STAT_CAP, Math.round((v || 10) * 2.5));
    h.stats = { POW: up(o.STR), DEF: up(o.CHA ?? o.CON), SKL: up(o.WIS ?? o.DEX), SPD: up(o.DEX), INT: up(o.INT), VIT: up(o.CON) };
  }
  if (!h.growth || h.growth.POW === undefined) { h.growth = {}; HERO_STATS.forEach((s) => { h.growth[s] = 2; }); }
  if (!h.professions) h.professions = {};
  if (!h.professions.blacksmithing) h.professions.blacksmithing = { theory: 0, practice: 0, field: 0 };
  if (!h.professions.alchemy) h.professions.alchemy = { theory: 0, practice: 0, field: 0 };
  if (!h.equipped) h.equipped = {};
  if (!h.condition) h.condition = { stamina: 100, morale: 70, loyalty: 60, fatigue: 0, stress: 0, injury: null };
  if (h.condition.stress == null) h.condition.stress = 0;
  if (h.level == null) h.level = 1;
  if (h.xp == null) h.xp = 0;
  if (h.age == null) h.age = 0;
  if (h.lifespan == null) h.lifespan = 300;
  // Career arc + the injury ladder (K4). Legacy string injuries become objects.
  if (!h.career) h.career = { debut: null, titles: [], wins: 0, losses: 0, injuries: 0, techniques: [] };
  if (h.retired == null) h.retired = false;
  if (h.staffRole === undefined) h.staffRole = null;
  // Personality + obedience (K5). Existing members grew up without traits — roll none
  // (they're "known quantities"); recruits arrive with two. Discipline starts middling.
  if (!Array.isArray(h.traits)) h.traits = [];
  if (h.condition.discipline == null) h.condition.discipline = 40;
  if (typeof h.condition.injury === 'string') {
    h.condition.injury = { kind: h.condition.injury === 'bruised' ? 'bruised' : 'strained', weeksLeft: h.condition.injury === 'bruised' ? 1 : 2, statHit: null };
  }
}

function load() {
  const saved = loadGame(SLOT);
  if (saved && Array.isArray(saved.roster) && saved.roster.length) {
    guild = saved;
  } else {
    guild = createGuild({ name: 'The Wandering Blade' });
    guild.roster.push(generateRecruit());
  }
  if (!guild.inventory) guild.inventory = createInventory();
  if (!Array.isArray(guild.inventory.potions)) guild.inventory.potions = []; // Apothecary storage (added with the Alchemist)
  if (!guild.market) guild.market = createMarket();
  else { const def = createMarket().stock; for (const k in def) if (guild.market.stock[k] == null) guild.market.stock[k] = def[k]; } // seed herbs into pre-Alchemist saves
  if (!['off', 'party', 'all'].includes(guild.quartermaster)) guild.quartermaster = 'off';
  if (typeof guild.reputation !== 'number') guild.reputation = 0;
  // Facilities: the Grounds reshaped this from a legacy string[] into a tier map.
  // Old saves (and pre-Grounds new games) start every facility at tier 0 — cap 6,
  // no training/injury bonus — so nothing changes until the player expands.
  if (!guild.facilities || typeof guild.facilities !== 'object' || Array.isArray(guild.facilities)) {
    guild.facilities = {};
  }
  for (const k of Object.keys(FACILITIES)) { // derived, not hardcoded — new facilities migrate for free
    if (typeof guild.facilities[k] !== 'number' || guild.facilities[k] < 0) guild.facilities[k] = 0;
  }
  if (!Array.isArray(guild.stations)) guild.stations = []; // ranch training equipment (Guild Academy Pillar A)
  guild.apprentices = Array.isArray(guild.apprentices) ? guild.apprentices.map(normalizeApprentice).filter(Boolean) : []; // academy pool
  if (!Array.isArray(guild.hallOfFame)) guild.hallOfFame = [];
  if (guild.trainer === undefined) guild.trainer = null;
  if (!Array.isArray(guild.schedule)) guild.schedule = []; // tournament calendar (added with the season loop)
  guild.schedule.forEach((t) => { if (!t.type) t.type = 'tournament'; }); // typed-event migration (added with the season fabric)
  // Battle prefs + play plan (added with the two-lens playable combat).
  if (!guild.battlePrefs || typeof guild.battlePrefs !== 'object') guild.battlePrefs = { tournament: 'ask' };
  if (!['ask', 'sim'].includes(guild.battlePrefs.tournament)) guild.battlePrefs.tournament = 'ask';
  if (guild.playPlan && !(guild.playPlan.kind && guild.playPlan.id && guild.playPlan.mode)) guild.playPlan = null;
  if (guild.playPlan === undefined) guild.playPlan = null;
  generateSeason(guild); // seed/top-up the typed season so there's always a horizon to train toward
  if (!Array.isArray(guild.questBoard) || !guild.questBoard.length) guild.questBoard = generateQuestBoard(guild, 3);
  guild.roster.forEach((h) => { migrateHero(h); ensureAssignment(h); });
  const staleRecruits = guild.recruits && guild.recruits[0] && guild.recruits[0].stats && guild.recruits[0].stats.POW === undefined;
  if (!Array.isArray(guild.recruits) || !guild.recruits.length || staleRecruits) guild.recruits = rollRecruitPool(3);
  guild.recruits.forEach(migrateHero);
  if (!selectedId && guild.roster[0]) selectedId = guild.roster[0].id;
  save();
}

// --- interactions -----------------------------------------------------------
function selectHero(id) { selectedId = id; notice = ''; render(); }
function setActivity(type) { const h = heroById(selectedId); if (h) { h.assignment.type = ['forge', 'study', 'quest', 'brew'].includes(type) ? type : 'train'; if (h.assignment.type !== 'quest') h.assignment.questId = null; save(); render(); } }
function setQuest(questId) { const h = heroById(selectedId); if (h) { h.assignment.type = 'quest'; h.assignment.questId = questId; save(); render(); } }
function setTraining(id) { const h = heroById(selectedId); if (h) { h.assignment.trainingId = id; h.assignment.type = 'train'; h.assignment.sparWith = null; h.assignment.questId = null; save(); render(); } }
function assignTo(heroId, jobType) {
  const h = heroById(heroId); if (!h) return;
  h.assignment.type = ['forge', 'study', 'brew'].includes(jobType) ? jobType : 'train';
  h.assignment.questId = null;
  selectedId = heroId; notice = `${h.name} assigned.`;
  save(); render();
}
/** Pair two members to spar — a MUTUAL assignment, so both spend the week sparring. */
function setSpar(partnerId) {
  const h = heroById(selectedId); const p = heroById(partnerId);
  if (!h || !p || h.id === p.id) return;
  for (const [x, y] of [[h, p], [p, h]]) { x.assignment.type = 'train'; x.assignment.trainingId = 'spar'; x.assignment.sparWith = y.id; x.assignment.questId = null; }
  notice = `${h.name} and ${p.name} will spar.`;
  save(); render();
}
function setIntensity(level) { const h = heroById(selectedId); if (h) { h.assignment.intensity = level === 'heavy' ? 'heavy' : 'light'; h.assignment.type = 'train'; h.assignment.questId = null; save(); render(); } }
// Pillar B — the multi-week training plan. Adds capture the CURRENT intensity toggle,
// so you can queue "POW heavy, then SPD light" by flipping intensity between adds.
function scheduleAdd(drillId) {
  const h = heroById(selectedId); if (!h) return;
  if (!Array.isArray(h.schedule)) h.schedule = [];
  if (h.schedule.length >= 8) return; // cap the plan at 8 weeks out
  const id = (drillId === 'rest' || getDrill(drillId)) ? drillId : 'pow';
  h.schedule.push({ trainingId: id, intensity: h.assignment.intensity === 'heavy' ? 'heavy' : 'light' });
  save(); render();
}
function scheduleRemoveAt(i) { const h = heroById(selectedId); if (h && Array.isArray(h.schedule)) { h.schedule.splice(i, 1); save(); render(); } }
function scheduleClear() { const h = heroById(selectedId); if (h) { h.schedule = []; save(); render(); } }
function setRecipe(id) { const h = heroById(selectedId); if (h) { h.assignment.recipeId = id; h.assignment.type = 'forge'; h.assignment.questId = null; save(); render(); } }
function setPotion(id) { const h = heroById(selectedId); if (h) { h.assignment.potionId = id; h.assignment.type = 'brew'; h.assignment.questId = null; save(); render(); } }
function setDiscipline(d) { const h = heroById(selectedId); if (h) { h.assignment.discipline = d === 'alchemy' ? 'alchemy' : 'blacksmithing'; h.assignment.type = 'study'; h.assignment.questId = null; save(); render(); } }
function setDiet(id) { const h = heroById(selectedId); if (h) { h.assignment.dietId = id; h.dietPlanId = id; save(); render(); } }

function usePotion(batchId) {
  const h = heroById(selectedId); if (!h) { notice = 'Select a member to treat first.'; render(); return; }
  const batch = findPotion(guild.inventory, batchId); if (!batch || batch.qty <= 0) return;
  const result = applyPotion(batch, h);
  if (!result) { notice = `${h.name} doesn't need the ${batch.name} right now.`; render(); return; }
  consumePotion(guild.inventory, batchId);
  notice = `${h.name} drinks a ${batch.name} — ${result}.`;
  save(); render();
}

function equipItem(itemId) {
  const h = heroById(selectedId); if (!h) { notice = 'Select a hero first, then equip.'; render(); return; }
  const item = findItem(guild.inventory, itemId); if (!item || item.location !== 'armory') return;
  doEquip(h, item);
  notice = `${h.name} equips the ${item.name}.`;
  save(); render();
}
function unequipSlot(slot) {
  const h = heroById(selectedId); if (!h || !h.equipped[slot]) return;
  const item = findItem(guild.inventory, h.equipped[slot]);
  if (item) { item.location = 'armory'; closeWielder(item); }
  delete h.equipped[slot];
  save(); render();
}

function setPolicy(p) { guild.quartermaster = ['off', 'party', 'all'].includes(p) ? p : 'off'; save(); render(); }
function provision() { // manual "kit everyone out from stores now"
  const n = armHeroes(guild.roster);
  notice = n ? `Quartermaster issued ${n} item(s) from the armory.` : 'Everyone already carries the best gear in stock.';
  save(); render();
}

function buyMaterial(matId) {
  const m = guild.market;
  const price = buyPrice(matId);
  if ((m.stock[matId] || 0) <= 0) { notice = `The market is out of ${MATERIALS[matId].name} this week.`; render(); return; }
  if (guild.gold < price) { notice = `Not enough gold — ${MATERIALS[matId].name} costs ${price}g.`; render(); return; }
  addGold(guild, -price);
  m.stock[matId] -= 1;
  guild.inventory.materials[matId] = (guild.inventory.materials[matId] || 0) + 1;
  notice = `Bought 1 ${MATERIALS[matId].name} for ${price}g.`;
  save(); render();
}
function sellItem(itemId) {
  const item = findItem(guild.inventory, itemId);
  if (!item || item.location !== 'armory') { notice = 'That item is carried by a hero — unequip it first.'; render(); return; }
  const value = itemSellValue(item);
  const i = guild.inventory.items.findIndex((it) => it.id === itemId);
  if (i < 0) return;
  guild.inventory.items.splice(i, 1);
  addGold(guild, value);
  notice = `Sold ${item.name} for ${value}g.`;
  save(); render();
}

function hire(id) {
  if (guild.roster.length >= maxRoster(guild)) { notice = `Quarters are full (${maxRoster(guild)}). Expand Living Quarters in the Grounds.`; render(); return; }
  const i = guild.recruits.findIndex((r) => r.id === id); if (i < 0) return;
  const r = guild.recruits[i]; const cost = hireCost(r);
  if (r.career && r.career.debut == null) r.career.debut = guild.calendar.week; // the career clock starts at signing
  if (guild.gold < cost) { notice = `Not enough gold to hire ${r.name} (${cost}g).`; render(); return; }
  addGold(guild, -cost); migrateHero(r); ensureAssignment(r); guild.roster.push(r); guild.recruits.splice(i, 1);
  selectedId = r.id; notice = `${r.name} joined the guild.`;
  save(); render();
}

async function advanceAll() {
  if (advancing) return; // a played battle is mid-flight — ignore repeat Advance clicks
  advancing = true;
  try {
  const income = guildIncome(guild);            // patron retainer (stopgap until quest income)
  addGold(guild, income);
  const upkeep = weeklyUpkeep(guild, getDietPlan) + academyBoard(guild); // wages/diet + apprentice board (food)
  const shortfall = Math.max(0, upkeep - guild.gold); // can't fully pay wages this week?
  addGold(guild, -upkeep);
  const week = guild.calendar.week;
  const results = [];

  // --- Quartermaster: auto-issue gear BEFORE quests resolve so it counts in the field. ---
  let issued = 0;
  if (guild.quartermaster === 'all') issued = armHeroes(guild.roster);
  else if (guild.quartermaster === 'party') issued = armHeroes(guild.roster.filter((h) => h.assignment.type === 'quest' && h.assignment.questId && canMarch(h)));

  // --- Quest pre-pass: heroes assigned to the SAME quest form a PARTY; the quest
  // resolves ONCE on the party's combined power, and guild rewards are paid ONCE. ---
  const parties = {};
  for (const h of guild.roster) {
    if (h.assignment.type === 'quest' && h.assignment.questId) (parties[h.assignment.questId] = parties[h.assignment.questId] || []).push(h);
  }
  const questPlan = {}; // heroId -> { quest, outcome, marched, isLead, partySize }
  for (const questId in parties) {
    const party = parties[questId];
    const quest = guild.questBoard.find((q) => q.id === questId);
    const marchers = quest ? party.filter(canMarch) : [];
    // Played-quest seam: if the player armed this quest, its climactic bout runs in
    // the chosen lens (strongest marcher vs the quest's boss). The duel SHIFTS the
    // resolver's luck band via resolveQuestPlayed — it never replaces the power check.
    let outcome = null;
    if (quest && marchers.length) {
      const qLens = planFor('quest', questId);
      if (qLens && battleEngineReady()) {
        guild.playPlan = null; // consume the opt-in
        const champion = marchers.reduce((a, b) => (combatPower(a) >= combatPower(b) ? a : b));
        const bout = await playQuestBout(champion, quest, marchers.length, { mode: qLens, items: withdrawPotions() });
        if (bout && bout.itemsUsed) spendPotions(bout.itemsUsed);
        outcome = bout ? resolveQuestPlayed(quest, marchers, combatPower, bout.won) : resolveQuest(quest, marchers, combatPower);
      } else {
        if (qLens) guild.playPlan = null; // armed but engine missing — consumed either way
        outcome = resolveQuest(quest, marchers, combatPower);
      }
    }
    if (outcome && outcome.success) { // guild rewards, once for the whole party
      addGold(guild, quest.rewards.gold);
      guild.reputation += quest.rewards.reputation;
      if (quest.loot) addMaterial(guild.inventory, quest.loot, 1);
    }
    party.forEach((h) => {
      questPlan[h.id] = { quest, outcome, marched: marchers.includes(h), isLead: marchers[0] === h, partySize: marchers.length };
      h.assignment.questId = null; // dispatch spent — pick a new quest next week
    });
  }

  // The quest board regenerates weekly, so any quest opt-in not consumed above is
  // dead — clear it or it lingers in the save forever (review fix).
  if (guild.playPlan && guild.playPlan.kind === 'quest') guild.playPlan = null;

  // --- Tournament pre-pass: any scheduled tournament DUE this week resolves now on the
  // entered lineup (uninjured entrants only), as a small bracket vs an escalating field.
  // The guild is paid once, scaled by placement; competing tires the lineup. ---
  const tournamentResults = [];
  for (const t of guild.schedule) {
    if (t.resolved || t.week > week) continue; // future events wait; <= week is due (incl. any straggler)
    const lineup = (t.entrants || []).map((id) => heroById(id)).filter((h) => h && !h.condition.injury);
    if (!lineup.length) {
      t.resolved = true; t.result = { forfeit: true };
      if (guild.playPlan && guild.playPlan.id === t.id) guild.playPlan = null; // the play opt-in dies with the forfeited event
      tournamentResults.push({ name: t.name, rank: t.rank, eventType: t.type, forfeit: true, hadEntrants: (t.entrants || []).length > 0 });
      continue;
    }
    // Seam: PLAY this match through the battle engine — armed in advance (playPlan),
    // or offered NOW by the due-match chooser (battlePrefs.tournament === 'ask', the
    // Monster-Rancher "your fight is up" moment). Simulate always remains a choice.
    // A played result returns the SAME {power,rounds,wins,champion} shape as the resolver.
    let res;
    const armed = planFor('tournament', t.id);
    let lens = armed;
    if (!lens && guild.battlePrefs.tournament === 'ask' && battleEngineReady()) {
      const pick = await chooseLens({
        glyph: '🏆', title: t.name,
        sub: `${lineup[0].name} steps up — ⚡${combatPower(lineup[0])} vs a ~${t.field}⚡ field. Resolve it how?`,
      });
      if (pick.remember) guild.battlePrefs.tournament = 'sim';
      lens = pick.mode === 'sim' ? null : pick.mode;
    }
    if (lens && battleEngineReady()) {
      if (armed) guild.playPlan = null; // consume the opt-in (a chooser pick never armed one)
      const played = await playTournamentMatch(lineup[0], t, {
        mode: lens, items: withdrawPotions(),
        powerFn: combatPower,               // gear counts, same as the simulated bracket
        interstitial: bracketInterstitial(t), // per-round: fight on / simulate the rest
      });
      if (played && played.itemsUsed) spendPotions(played.itemsUsed);
      res = played || resolveTournament(t, lineup, combatPower); // null → engine missing, fall back
    } else {
      if (armed) guild.playPlan = null; // armed but declined/unavailable — consumed either way
      res = resolveTournament(t, lineup, combatPower);
    }
    const pl = placement(res);
    const gold = Math.round(t.rewards.gold * pl.frac);
    const rep = Math.round(t.rewards.reputation * pl.frac);
    if (gold) addGold(guild, gold);
    if (rep) guild.reputation += rep;
    if (pl.place === 1 && t.rewards.loot) addMaterial(guild.inventory, t.rewards.loot, 1);
    lineup.forEach((h) => { // competing tires the lineup; a good run lifts morale and teaches Field
      h.condition.stamina = Math.max(0, h.condition.stamina - 20);
      h.condition.fatigue = Math.min(100, h.condition.fatigue + 15);
      // Showmen feel the crowd twice as hard (traitMult 'morale'); wins knit the Bond,
      // and a title fought BY HAND knits it hardest (the coached-win rule).
      h.condition.morale = clamp(h.condition.morale + (pl.place === 1 ? 12 : pl.place <= 4 ? 4 : -6) * traitMult(h, 'morale'));
      const bondGain = (res.champion ? 3 : pl.place <= 4 ? 1 : 0) + (res.played && res.champion ? 2 : 0);
      if (bondGain) h.condition.loyalty = clamp((h.condition.loyalty ?? 60) + bondGain * traitMult(h, 'bond'));
      for (const k in h.professions) h.professions[k].field = Math.min(100, (h.professions[k].field || 0) + (2 + t.rank));
      if (h.career) { // the record book (K4): rounds won, the exit, and titles taken
        h.career.wins += res.wins;
        if (!res.champion) h.career.losses += 1;
        else h.career.titles.push(t.name);
      }
    });
    t.resolved = true;
    t.result = { placement: pl.label, place: pl.place, wins: res.wins, rounds: res.rounds, gold, rep };
    tournamentResults.push({ name: t.name, rank: t.rank, eventType: t.type, played: !!res.played, placement: pl.label, champion: pl.place === 1, gold, rep, party: lineup.length, loot: pl.place === 1 ? t.rewards.loot : null });
  }

  // Snapshot injuries at the START of the week: a member who bruises themselves mid-loop
  // during their own bout must not retroactively demote their (healthy) spar partner.
  const wasInjured = new Map(guild.roster.map((x) => [x.id, !!x.condition.injury]));
  for (const h of guild.roster) {
    const a = h.assignment;
    const diet = getDietPlan(a.dietId);
    h.dietPlanId = a.dietId;
    const cb = { stamina: h.condition.stamina, fatigue: h.condition.fatigue };
    let entry = { name: h.name, id: h.id, type: a.type };
    let questMorale = null;
    let onExpedition = false; // true only if the hero actually marched out this week

    if (h.condition.injury && a.type !== 'train') {
      // Injured members can't work the craft or march — the week is forced rest until
      // they heal (the train path already handles injury inside applyTraining). This
      // keeps the hero card's "will only recover (rest) until healed" promise honest.
      const res = applyTraining(h, 'rest', 'light', diet.statBias, ringOpts(diet));
      entry.type = 'train'; // recap renders the rest/recovery line
      entry.rested = true; entry.injury = res.injury;
    } else if (a.type === 'forge') {
      const recipe = getRecipe(a.recipeId);
      entry.forge = forge(h, recipe, guild.inventory, week);
      entry.recipeName = recipe.name;
    } else if (a.type === 'brew') {
      const recipe = getPotionRecipe(a.potionId) || POTION_RECIPES[0];
      entry.brew = brew(h, recipe, guild.inventory, week);
      entry.recipeName = recipe.name;
    } else if (a.type === 'study') {
      const disc = a.discipline === 'alchemy' ? 'alchemy' : 'blacksmithing';
      entry.study = study(h, disc);
      entry.discipline = disc;
    } else if (a.type === 'quest') {
      const plan = questPlan[h.id];
      if (!plan || !plan.quest) {
        entry.quest = { noQuest: true };
      } else if (!plan.marched) {
        entry.quest = { tooTired: true }; // too tired/injured to march this week
      } else {
        onExpedition = true;
        const success = plan.outcome.success;
        h.condition.stamina = Math.max(0, h.condition.stamina - QUEST_STAMINA);
        h.condition.fatigue = Math.min(100, h.condition.fatigue + (success ? 20 : 35));
        // The quest's RISK finally bites: marching can wound you — half as often when
        // the job goes well, scaled by the diet's injury-risk modifier.
        if (!h.condition.injury) {
          const wound = (plan.quest.risk || 0) * (success ? 0.5 : 1) * ((diet.injuryRiskMod) ?? 1);
          if (Math.random() < wound) {
            const r = Math.random();
            const inj = inflictInjury(h, r < 0.45 ? 'bruised' : rollInjurySeverity(30), 'VIT');
            entry.wounded = injuryLabel(inj);
          }
        }
        entry.quest = { title: plan.quest.title, success, party: plan.partySize, played: !!plan.outcome.played, won: !!plan.outcome.won };
        if (success) {
          const fieldGain = plan.quest.rewards.field; // only a SUCCESSFUL quest teaches Field Insight —
          for (const k in h.professions) h.professions[k].field = Math.min(100, (h.professions[k].field || 0) + fieldGain); // ...and it sharpens every craft the hero practices (smithing AND alchemy)
          entry.field = fieldGain;
          if (plan.isLead) entry.reward = { gold: plan.quest.rewards.gold, rep: plan.quest.rewards.reputation, loot: plan.quest.loot };
          questMorale = 8;
        } else {
          entry.field = 0;
          questMorale = -12;
        }
      }
    } else if (a.trainingId === 'spar') {
      const partner = heroById(a.sparWith);
      // Partner must ACTUALLY be sparring back this week (not forging/questing on a stale link)
      // and must have started the week uninjured — snapshot, not their live (maybe self-injured) state.
      const mutual = partner && partner.assignment.type === 'train' && partner.assignment.trainingId === 'spar'
        && partner.assignment.sparWith === h.id && !wasInjured.get(partner.id);
      if (h.condition.injury) {
        const res = applyTraining(h, 'rest', 'light', diet.statBias, ringOpts(diet)); // injured — rest, don't spar
        entry.rested = true; entry.injury = res.injury;
      } else if (mutual) {
        const res = applySpar(h, partner, trainingBias(diet), ringOpts(diet)); // both partners resolve their own side
        entry.drill = 'Spar vs ' + partner.name.split(' ')[0];
        entry.gains = res.gains; entry.drops = res.drops; entry.injury = res.injury;
        entry.trained = Object.keys(res.gains).length > 0; entry.spar = true;
      } else {
        const res = applyTraining(h, 'skl', 'light', trainingBias(diet), { ...ringOpts(diet), equipMult: stationBonusFor(guild, 'skl') }); // partner unavailable — solo footwork
        entry.drill = 'Spar — no partner';
        entry.gains = res.gains; entry.drops = res.drops; entry.injury = res.injury;
        entry.trained = Object.keys(res.gains).length > 0;
      }
    } else {
      const res = applyTraining(h, a.trainingId, a.intensity, trainingBias(diet), { ...ringOpts(diet), equipMult: stationBonusFor(guild, a.trainingId) });
      entry.drill = (getDrill(a.trainingId) || REST).name;
      entry.gains = res.gains; entry.drops = res.drops;
      entry.rested = res.rested; entry.injured = res.injured; entry.injury = res.injury;
      entry.breakthrough = res.breakthrough;
      entry.trained = Object.keys(res.gains).length > 0;
    }

    if (!onExpedition) applyDiet(h, diet); // only heroes who actually marched out skip guild rest
    // Training/rest morale is applied inside applyTraining; forge/study take a small dip; quests set questMorale.
    let dm = questMorale != null ? questMorale : (a.type === 'forge' || a.type === 'study' || a.type === 'brew' ? -1 : 0);
    if (diet.id === 'feast') dm += 4;
    h.condition.morale = clamp(h.condition.morale + dm);
    // Bond moves (K5): rest weeks knit it; a NEW injury this week frays it.
    if (entry.rested) h.condition.loyalty = clamp((h.condition.loyalty ?? 60) + 1 * traitMult(h, 'bond'));
    if (!wasInjured.get(h.id) && h.condition.injury) h.condition.loyalty = clamp((h.condition.loyalty ?? 60) - 3);
    h.age += 1;
    entry.sta = h.condition.stamina - cb.stamina; entry.fat = h.condition.fatigue - cb.fatigue;
    results.push(entry);
  }

  // --- Life's arc (K4): Twilight members decay; a spent lifespan retires them
  // into the Hall of Fame (ceremony, not a silent delete). Their gear returns to
  // the armory for inheritance. Run AFTER the loop so they get their last week. ---
  const retiring = [];
  for (const h of guild.roster) {
    if (lifeStage(h).key === 'twilight') {
      for (const s of HERO_STATS) if (Math.random() < 0.5) h.stats[s] = Math.max(1, (h.stats[s] || 0) - 1); // E[−0.5]/stat/week
    }
    if (h.age >= h.lifespan) retiring.push(h);
  }
  for (const h of retiring) {
    guild.roster = guild.roster.filter((x) => x.id !== h.id);
    for (const slot of Object.keys(h.equipped || {})) { // the blade outlives its wielder
      const it = findItem(guild.inventory, h.equipped[slot]);
      if (it) { it.location = 'armory'; closeWielder(it); }
    }
    h.retired = true;
    guild.hallOfFame.push({
      id: h.id, name: h.name, archetype: h.archetype, level: h.level,
      appearanceSeed: h.appearanceSeed, appearance: h.appearance, prime: h.prime,
      career: h.career, stats: { ...h.stats }, peakPower: heroPower(h), retiredWeek: week,
    });
    results.push({ name: h.name, id: h.id, type: 'retire', career: h.career });
  }
  if (retiring.length) {
    const gone = new Set(retiring.map((h) => h.id));
    for (const h of guild.roster) { // clear assignments pointing at the departed
      if (h.assignment.sparWith && gone.has(h.assignment.sparWith)) { h.assignment.sparWith = null; h.assignment.trainingId = 'rest'; }
    }
    for (const t of guild.schedule) if (!t.resolved) t.entrants = (t.entrants || []).filter((id) => !gone.has(id));
    if (selectedId && gone.has(selectedId)) selectedId = guild.roster[0] ? guild.roster[0].id : null;
  }
  if (shortfall > 0) guild.roster.forEach((h) => { h.condition.morale = clamp(h.condition.morale - 8); }); // unpaid wages hurt morale
  // Schedule advance (Pillar B): a member on the training track pulls the next planned
  // week off their queue, so a multi-week plan plays out automatically. Non-training
  // weeks (quest/forge/…) don't consume the plan — it waits until they train again.
  for (const h of guild.roster) {
    if (h.assignment.type === 'train' && Array.isArray(h.schedule) && h.schedule.length) {
      const p = h.schedule.shift();
      h.assignment.trainingId = p.trainingId;
      h.assignment.intensity = p.intensity === 'heavy' ? 'heavy' : 'light';
      h.assignment.sparWith = null; // planned weeks are solo drills
    }
  }
  // Academy (farm system): apprentices develop toward graduation each week (board billed via upkeep above).
  for (const a of (guild.apprentices || [])) developApprentice(a, guild);
  advanceWeek(guild.calendar);
  refreshMarket(guild.market);
  guild.questBoard = generateQuestBoard(guild, 3);
  guild.recruits = rollRecruitPool(3);
  generateSeason(guild); // drop the just-resolved event(s) and keep the season paced ahead
  report = { income, upkeep, shortfall, results, issued, tournaments: tournamentResults };
  guild.lastReport = report; // persist the recap — it used to vanish on reload
  notice = '';
  currentRoom = 'hub'; // land on the hub so the weekly recap is always seen
  ranchView = false; stopRanchLoop(); // land on the hub recap after a week resolves
  save(); showScreen('guildScreen'); applyViewToggle(); render({ top: true });
  } finally { advancing = false; }
}

function back() { showScreen('titleScreen'); }

// --- view helpers -----------------------------------------------------------
function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  const el = document.getElementById(id); if (el) el.classList.add('active');
}
function fmtDelta(n) { n = Math.round(n); if (n > 0) return `<span class="up">+${n}</span>`; if (n < 0) return `<span class="down">${n}</span>`; return `${n}`; }
function glyphOf(h) { return ARCH_GLYPH[h.archetype] || '☉'; }

// --- character sprites (Elements engine, exposed by crucible.js) -------------
/** A canvas the post-render pass paints with a member's generated pixel sprite. */
function personSprite(person, px) {
  const p = px || 40;
  return `<canvas class="hero-sprite" width="${p * 2}" height="${p * 2}" data-hid="${person.id}" aria-label="${person.name}"></canvas>`;
}
/** A member OR a tavern recruit, by id. */
function personById(id) { return heroById(id) || (guild.recruits || []).find((r) => r.id === id) || null; }
/** After each render, draw every sprite canvas via the shared Elements renderer. */
function paintSprites() {
  if (typeof window.renderGuildSprite !== 'function') return; // crucible.js not loaded (shouldn't happen)
  if (typeof window.pruneDetachedSpriteRedraws === 'function') window.pruneDetachedSpriteRedraws(); // drop last render's detached canvases
  document.querySelectorAll('#guildScreen canvas.hero-sprite[data-hid]').forEach((cv) => {
    const p = personById(cv.dataset.hid);
    if (p) try { window.renderGuildSprite(cv, p); } catch (e) { /* asset race — the redraw registry repaints on load */ }
  });
}
function statTotal(h) { return HERO_STATS.reduce((s, k) => s + (h.stats[k] || 0), 0); }
function questOdds(hp, rec) {
  // Matches resolveQuest: success needs (hp/rec) * variance >= 1, variance uniform on
  // [0.75, 1.25]. So P(success) = clamp((1.25 - rec/hp) / 0.5, 0, 1) — the label is
  // derived from the TRUE probability so it can never drift from the resolver.
  const need = Math.max(1, rec) / Math.max(1, hp);
  const pct = Math.round(Math.max(0, Math.min(1, (1.25 - need) / 0.5)) * 100);
  if (pct >= 85) return { txt: 'Favorable', cls: 'up', pct };
  if (pct >= 50) return { txt: 'Even', cls: '', pct };
  if (pct >= 20) return { txt: 'Risky', cls: 'down', pct };
  return { txt: 'Grim', cls: 'down', pct };
}
// `readout` overrides the right-hand number — condition bars show the 0-100 stat
// (default), but capacity bars pass a real "N / M" count so the badge isn't a bare
// clamped percentage (which would also hide over-capacity, e.g. 12/6 pinning at 100).
function bar(label, value, color, readout) {
  const v = clamp(value);
  const right = readout != null ? readout : v;
  return `<div class="cond-row"><div class="lbl"><span>${label}</span><span>${right}</span></div>
    <div class="cond-track"><div class="cond-fill" style="width:${v}%;background:${color}"></div></div></div>`;
}
function mini(value, color) { return `<span class="mini"><span class="mini-fill" style="width:${clamp(value)}%;background:${color}"></span></span>`; }
function qualHTML(item) { const t = qualityTier(item.quality); return `<span style="color:${t.col}">${t.name}</span> q${item.quality}`; }

function questTitle(id) { const q = guild.questBoard.find((x) => x.id === id); return q ? q.title : null; }
function rosterRow(h) {
  const a = h.assignment;
  const plan = a.type === 'forge' ? `🔨 ${getRecipe(a.recipeId).name}`
    : a.type === 'brew' ? `⚗ ${(getPotionRecipe(a.potionId) || {}).name || 'Brew'}`
    : a.type === 'study' ? `📖 Study ${a.discipline === 'alchemy' ? 'Alchemy' : 'Smithing'}`
    : a.type === 'quest' ? `🗺 ${a.questId ? (questTitle(a.questId) || 'On Quest') : '(choose quest)'}`
    : a.trainingId === 'spar' ? `🤺 Spar ${((heroById(a.sparWith) || {}).name || '?').split(' ')[0]}`
    : `⚔ ${(getDrill(a.trainingId) || REST).name}${a.intensity === 'heavy' ? ' (H)' : ''}`;
  return `<button class="roster-row ${h.id === selectedId ? 'sel' : ''}" onclick="__guild.selectHero('${h.id}')">
      <span class="rr-portrait">${personSprite(h, 60)}</span>
      <span class="rr-main">
        <span class="rr-name">${h.name} <span class="rr-sub">${h.archetype} Lv${h.level}</span></span>
        <span class="rr-assign">${plan} · 🍖 ${getDietPlan(a.dietId).name}</span>
        <span class="rr-cond">sta ${mini(h.condition.stamina, 'var(--success)')} fat ${mini(h.condition.fatigue, '#e08a3c')}</span>
      </span>
      <span class="rr-power">⚡${combatPower(h)}</span>
    </button>`;
}

function equippedLine(h) {
  const parts = [];
  ['weapon', 'body'].forEach((slot) => {
    const id = h.equipped[slot];
    if (id) { const it = findItem(guild.inventory, id); if (it) parts.push(`${KIND_GLYPH[it.kind] || '▪'} ${it.name} <span class="eq-q">${qualHTML(it)}</span> <button class="eq-x" onclick="__guild.unequipSlot('${slot}')">✕</button>`); }
  });
  return parts.length ? `<div class="equipped">${parts.join('')}</div>` : `<div class="equipped none">— no gear equipped —</div>`;
}

// --- room content builders (decomposed from the old single plan card) --------

/** Compact avatar strip to switch which member you're managing inside a work room. */
function heroSwitcher() {
  if (guild.roster.length <= 1) return '';
  return `<div class="hero-switch">${guild.roster.map((h) => `<button class="hs-chip ${h.id === selectedId ? 'sel' : ''}" title="${h.name}" onclick="__guild.selectHero('${h.id}')">${personSprite(h, 48)}</button>`).join('')}</div>`;
}

/** The member's stat / condition / gear card — the shared header used in the Roster room. */
function heroHeader(h) {
  const rep = report && report.results ? report.results.find((r) => r.id === h.id) : null;
  const stats = HERO_STATS.map((s) => {
    const val = h.stats[s] || 0;
    const g = rep && rep.gains && rep.gains[s] ? rep.gains[s] : 0;
    return `<div class="stat-cell"><div class="k">${s}</div><div class="v">${val}<span class="cap">/${STAT_CAP}</span></div>
      <div class="statbar"><span style="width:${Math.round(val / STAT_CAP * 100)}%"></span></div><div class="d">${g ? '+' + g : ''}</div></div>`;
  }).join('');
  const stage = lifeStage(h);
  const cr = h.career || {};
  const record = (cr.wins || cr.losses || (cr.titles || []).length)
    ? ` · <span class="dim">${cr.wins || 0}W–${cr.losses || 0}L${(cr.titles || []).length ? ' · 👑' + cr.titles.length : ''}</span>` : '';
  const chips = (h.traits || []).map((t) => `<span class="trait-chip" title="${(TRAITS[t] || {}).desc || ''}">${t}</span>`).join('');
  return `<div class="assign-head"><span class="rr-portrait">${personSprite(h, 64)}</span> <b>${h.name}</b> · ${h.archetype} Lv${h.level} · <span style="color:${stage.col}">${stage.name}</span>${record} · ⚡${combatPower(h)}</div>
      ${chips ? `<div class="trait-row">${chips}</div>` : ''}
      <div class="stat-grid">${stats}</div>
      ${bar('Life', lifeFrac(h) * 100, stage.col, `${h.age}/${h.lifespan} wks — ${stage.desc}`)}
      ${bar('Stamina', h.condition.stamina, 'var(--success)')}${bar('Fatigue', h.condition.fatigue, '#e08a3c')}${bar('Stress', h.condition.stress || 0, '#c05a8a')}${bar('Morale', h.condition.morale, '#8ab4d8')}
      ${bar('Bond', h.condition.loyalty ?? 60, '#c9a0e8')}${bar('Discipline', h.condition.discipline ?? 40, '#9fb8a8')}
      ${h.condition.injury ? `<div class="injury-flag">⚠ ${injuryLabel(h.condition.injury)} — recovers (rest) until healed; a potent draught cures it</div>` : ''}
      ${equippedLine(h)}`;
}

function skillShapeOf(h) {
  const prof = h.professions.blacksmithing;
  return `<div class="skill-shape">🔨 Blacksmithing — <b>Theory ${prof.theory}</b> · <b>Practice ${prof.practice}</b> · <span class="dim">Field ${prof.field}</span></div>`;
}

/** Training drills + Light/Heavy intensity toggle. Picking a drill sets the member to Train. */
function trainBody(h) {
  const at = h.assignment.type;
  const heavy = (h.assignment.intensity || 'light') === 'heavy';
  const drillItems = DRILLS.map((d) => {
    const desc = heavy ? `${d.main}+ ${d.sec}+ <span class="down">${d.pen}−</span>` : `${d.main}+`;
    return `<button class="opt ${at === 'train' && d.id === h.assignment.trainingId ? 'active' : ''}" onclick="__guild.setTraining('${d.id}')">
      <span><span class="o-name">${d.name}</span> <span class="o-desc">${desc}</span></span></button>`;
  }).join('');
  const restItem = `<button class="opt ${at === 'train' && h.assignment.trainingId === 'rest' ? 'active' : ''}" onclick="__guild.setTraining('rest')">
      <span><span class="o-name">💤 ${REST.name}</span> <span class="o-desc">shed fatigue &amp; stress</span></span></button>`;
  const sparring = at === 'train' && h.assignment.trainingId === 'spar';
  const others = guild.roster.filter((x) => x.id !== h.id);
  const sparList = others.length
    ? others.map((p) => `<button class="opt ${sparring && h.assignment.sparWith === p.id ? 'active' : ''}" onclick="__guild.setSpar('${p.id}')">
        <span><span class="o-name">🤺 vs ${p.name}</span> <span class="o-desc">both sharpen SKL &amp; SPD · Lv${p.level}</span></span></button>`).join('')
    : '<div class="hint">Recruit another member to spar with.</div>';
  // The HONEST injury odds for each intensity — the exact roll applyTraining makes
  // after this week's wear lands (previewInjuryChance shares the math).
  const diet = getDietPlan(h.assignment.dietId);
  const riskPct = (i) => Math.round(previewInjuryChance(h, i, ringOpts(diet)) * 100);
  const rl = riskPct('light'), rh = riskPct('heavy');
  // Plan-ahead queue (Pillar B): coming weeks, each a drill captured at the intensity
  // that was set when it was added. Advance Week shifts the front into this week.
  const sched = Array.isArray(h.schedule) ? h.schedule : [];
  const chips = sched.length
    ? sched.map((p, i) => `<span class="sched-chip">${i + 1}. ${(getDrill(p.trainingId) || REST).name}${p.intensity === 'heavy' ? ' ·H' : ''}<button onclick="__guild.scheduleRemoveAt(${i})" title="Remove from plan">✕</button></span>`).join('')
    : '<span class="dim" style="font-size:0.75em">No plan — next week repeats this one.</span>';
  const addBtns = DRILLS.map((d) => `<button class="sched-btn" onclick="__guild.scheduleAdd('${d.id}')" title="Queue ${d.name} (${heavy ? 'heavy' : 'light'})">+ ${d.main}</button>`).join('')
    + `<button class="sched-btn" onclick="__guild.scheduleAdd('rest')" title="Queue Rest">+ 💤</button>`
    + (sched.length ? `<button class="sched-btn clear" onclick="__guild.scheduleClear()">clear</button>` : '');
  const schedHTML = `<div class="plan-title" style="font-size:0.72em;margin-top:10px">📅 Plan ahead <span class="dim" style="font-weight:400">— each Advance Week runs the next drill (adds as ${heavy ? 'heavy' : 'light'})</span></div>
    <div class="sched-queue">${chips}</div>
    <div class="sched-add">${addBtns}</div>`;
  return `<div class="intensity-toggle">
      <button class="${heavy ? '' : 'on'}" onclick="__guild.setIntensity('light')">Light${rl ? ` · <span class="down">⚠${rl}%</span>` : ''}</button>
      <button class="${heavy ? 'on' : ''}" onclick="__guild.setIntensity('heavy')">Heavy · +sec −paired${rh ? ` · <span class="down">⚠${rh}%</span>` : ''}</button>
    </div><div class="opt-list">${drillItems}${restItem}</div>
    ${schedHTML}
    <div class="plan-title" style="font-size:0.72em;margin-top:10px">🤺 Spar a partner <span class="dim" style="font-weight:400">— both train, pairs up automatically</span></div>
    <div class="opt-list">${sparList}</div>`;
}

/** Quest board scoped to member h, with party-projected odds. Picking one dispatches h. */
function questBody(h) {
  const at = h.assignment.type;
  const hp = combatPower(h);
  const hCanMarch = canMarch(h); // this member would be benched at resolution if injured/too tired
  const list = guild.questBoard.map((q) => {
    // Preview only the members who'd actually march — matches the resolution filter — so
    // the odds and "party of N" don't over-promise by counting benched members.
    const otherMarchers = guild.roster.filter((x) => x.id !== h.id && x.assignment.type === 'quest' && x.assignment.questId === q.id && canMarch(x));
    const marchPower = otherMarchers.reduce((s, x) => s + combatPower(x), 0) + (hCanMarch ? hp : 0);
    const odds = questOdds(marchPower, q.recommendedPower); // odds if this member joins (and can march)
    const chosen = at === 'quest' && h.assignment.questId === q.id;
    const lootTxt = q.loot ? ` · +1 ${MATERIALS[q.loot].name}` : '';
    const n = otherMarchers.length + (hCanMarch ? 1 : 0);
    const partyTag = n > 1 ? ` · <span class="dim">party of ${n}</span>` : '';
    return `<button class="opt quest-opt ${chosen ? 'active' : ''}" onclick="__guild.setQuest('${q.id}')">
      <span><span class="o-name">${q.title} <span class="q-rank">R${q.rank}</span></span> <span class="o-desc">${q.patron} · <span class="${odds.cls}">${odds.txt} ~${odds.pct}%</span>${partyTag}</span></span>
      <span class="o-cost">${q.rewards.gold}g · +${q.rewards.reputation}rep${lootTxt}</span></button>`;
  }).join('');
  // The chosen quest can be PLAYED: its climactic bout (strongest marcher vs the boss)
  // in either lens. Winning shifts the luck band; the power check still decides.
  const cur = at === 'quest' && h.assignment.questId ? guild.questBoard.find((q) => q.id === h.assignment.questId) : null;
  const lensBar = cur ? `<div class="tourney-lens quest-lens">
      <button class="tourney-play ${planFor('quest', cur.id) === 'action' ? 'on' : ''}" onclick="__guild.setPlayQuest('${cur.id}','action')">${planFor('quest', cur.id) === 'action' ? '⚔ Leading the bout live' : '⚔ Lead the bout live'}</button>
      <button class="tourney-play ${planFor('quest', cur.id) === 'tactical' ? 'on' : ''}" onclick="__guild.setPlayQuest('${cur.id}','tactical')">${planFor('quest', cur.id) === 'tactical' ? '♟ Commanding the bout' : '♟ Command the bout'}</button>
    </div>
    <div class="hint" style="text-align:left;padding:0 2px 6px">On Advance Week the party's strongest marcher duels <b>${cur.title}</b>'s boss — win it and the job's luck swings your way; the party's ⚡ still decides.</div>` : '';
  return `<div class="opt-list">${list}</div>${lensBar}`;
}

/** Forge recipe list for member h. Picking a recipe sets them to Forge. */
function forgeBody(h) {
  const at = h.assignment.type;
  const isForge = at === 'forge';
  const prof = h.professions.blacksmithing;
  const forgeList = RECIPES.map((r) => {
    const cost = Object.keys(r.cost).map((k) => `${MATERIALS[k].name} ×${r.cost[k]}`).join(', ');
    const enough = Object.keys(r.cost).every((k) => (guild.inventory.materials[k] || 0) >= r.cost[k]);
    if (!recipeUnlocked(h, r)) {
      return `<button class="opt lack" disabled><span><span class="o-name">🔒 ${r.name}</span> <span class="o-desc">study to unlock</span></span><span class="o-cost">Theory ${r.reqTheory}</span></button>`;
    }
    return `<button class="opt ${isForge && r.id === h.assignment.recipeId ? 'active' : ''} ${enough ? '' : 'lack'}" onclick="__guild.setRecipe('${r.id}')">
      <span><span class="o-name">${KIND_GLYPH[r.kind] || ''} ${r.name}</span> <span class="o-desc">${cost}</span></span>
      <span class="o-cost">~q${previewQuality(r, prof.practice, prof.field)}</span></button>`;
  }).join('');
  return `${skillShapeOf(h)}<div class="opt-list">${forgeList}</div>`;
}

function alchemyShapeOf(h) {
  const p = h.professions.alchemy || { theory: 0, practice: 0, field: 0 };
  return `<div class="skill-shape">⚗ Alchemy — <b>Theory ${p.theory}</b> · <b>Practice ${p.practice}</b> · <span class="dim">Field ${p.field}</span></div>`;
}

/** Potion recipe list for member h. Picking a recipe sets them to Brew. */
function brewBody(h) {
  const isBrew = h.assignment.type === 'brew';
  const prof = h.professions.alchemy || { theory: 0, practice: 0, field: 0 };
  const list = POTION_RECIPES.map((r) => {
    const cost = Object.keys(r.cost).map((k) => `${MATERIALS[k].name} ×${r.cost[k]}`).join(', ');
    const enough = Object.keys(r.cost).every((k) => (guild.inventory.materials[k] || 0) >= r.cost[k]);
    if (!potionUnlocked(h, r)) {
      return `<button class="opt lack" disabled><span><span class="o-name">🔒 ${r.name}</span> <span class="o-desc">study alchemy to unlock</span></span><span class="o-cost">Theory ${r.reqTheory}</span></button>`;
    }
    return `<button class="opt ${isBrew && r.id === h.assignment.potionId ? 'active' : ''} ${enough ? '' : 'lack'}" onclick="__guild.setPotion('${r.id}')">
      <span><span class="o-name">${r.glyph} ${r.name}</span> <span class="o-desc">${cost}</span></span>
      <span class="o-cost">~p${previewPotency(r, prof.practice, prof.field)} ×${r.yield}</span></button>`;
  }).join('');
  return `${alchemyShapeOf(h)}<div class="opt-list">${list}</div>`;
}

/** Library/Study body: pick a discipline; the Scholar raises its Theory this week. */
function studyBody(h) {
  const a = h.assignment;
  const assigned = a.type === 'study';
  const disc = a.discipline === 'alchemy' ? 'alchemy' : 'blacksmithing';
  const toggle = `<div class="intensity-toggle">
      <button class="${assigned && disc === 'blacksmithing' ? 'on' : ''}" onclick="__guild.setDiscipline('blacksmithing')">⚒ Metallurgy</button>
      <button class="${assigned && disc === 'alchemy' ? 'on' : ''}" onclick="__guild.setDiscipline('alchemy')">⚗ Alchemy</button>
    </div>`;
  const shape = disc === 'alchemy' ? alchemyShapeOf(h) : skillShapeOf(h);
  return `${shape}${toggle}
      <div class="hint" style="text-align:left;padding:4px 0">Pick a discipline — the Scholar studies it, raising its <b>Theory</b> (which unlocks recipes). Practice from working the craft still sets quality.</div>
      ${assigned ? `<div class="room-jobline">📖 ${h.name} is studying <b>${disc === 'alchemy' ? 'Alchemy' : 'Metallurgy'}</b> this week.</div>` : '<div class="hint">Pick a discipline above to assign this member to study.</div>'}`;
}

/** Diet list for member h. */
function dietBody(h) {
  return `<div class="opt-list">${DIET_PLANS.map((d) => `<button class="opt ${d.id === h.assignment.dietId ? 'active' : ''}" onclick="__guild.setDiet('${d.id}')">
      <span><span class="o-name">${d.name}</span> <span class="o-desc">${d.description}</span></span><span class="o-cost">${d.weeklyCost}g/wk</span></button>`).join('')}</div>`;
}

/** One-line summary of what a member is doing this week. */
function jobLabel(h) {
  const a = h.assignment;
  return a.type === 'forge' ? `🔨 Forging ${(getRecipe(a.recipeId) || {}).name || ''}`
    : a.type === 'brew' ? `⚗ Brewing ${(getPotionRecipe(a.potionId) || {}).name || ''}`
    : a.type === 'study' ? `📖 Studying ${a.discipline === 'alchemy' ? 'alchemy' : 'metallurgy'}`
    : a.type === 'quest' ? `🗺 ${a.questId ? (questTitle(a.questId) || 'On a quest') : 'Quest (pick one)'}`
    : a.trainingId === 'spar' ? `🤺 Sparring ${((heroById(a.sparWith) || {}).name || '?').split(' ')[0]}`
    : `⚔ ${(getDrill(a.trainingId) || REST).name}${a.intensity === 'heavy' ? ' (Heavy)' : ''}`;
}

function armoryPanel() {
  const inv = guild.inventory;
  const mats = Object.keys(MATERIALS).map((k) => `<span class="mat"><b style="color:${MATERIALS[k].col}">${inv.materials[k] || 0}</b> ${MATERIALS[k].name}</span>`).join('');
  const shelf = armoryItems(inv);
  const carried = inv.items.filter((it) => it.location !== 'armory');
  const shelfHTML = shelf.length ? shelf.map((it) => `<div class="armory-item">
      <span class="ai-icon">${KIND_GLYPH[it.kind] || '▪'}</span>
      <span class="ai-main"><b>${it.name}</b><span class="rr-sub">${qualHTML(it)}${it.history.forgedByName ? ' · forged by ' + it.history.forgedByName : ''}</span></span>
      <span class="ai-actions">
        <button class="rc-hire" onclick="__guild.equipItem('${it.id}')">Equip</button>
        <button class="rc-hire sell" onclick="__guild.sellItem('${it.id}')">Sell ${itemSellValue(it)}g</button>
      </span>
    </div>`).join('') : '<div class="hint">Empty. Assign a hero to the Forge to make weapons.</div>';

  return `<div class="plan-card">
      <div class="plan-title">🏛 Armory</div>
      <div class="materials">${mats}</div>
      <div class="armory-shelf">${shelfHTML}</div>
      ${carried.length ? `<div class="rr-sub" style="margin-top:8px">${carried.length} item(s) carried by heroes.</div>` : ''}
    </div>`;
}

function quartermasterPanel() {
  const inv = guild.inventory;
  const policy = guild.quartermaster || 'off';
  const shelf = armoryItems(inv);
  const idleW = shelf.filter((it) => it.slot === 'weapon').length;
  const idleB = shelf.filter((it) => it.slot === 'body').length;
  const kitted = guild.roster.filter((h) => EQUIP_SLOTS.every((s) => h.equipped[s])).length;
  const POLICIES = [
    { id: 'off', name: 'Manual', desc: 'You equip each hero by hand.' },
    { id: 'party', name: 'Arm Party', desc: 'Marching heroes auto-draw the best gear each week (strongest first).' },
    { id: 'all', name: 'Arm All', desc: 'Every hero auto-draws the best available gear each week.' },
  ];
  const toggle = POLICIES.map((p) => `<button class="${policy === p.id ? 'on' : ''}" onclick="__guild.setPolicy('${p.id}')">${p.name}</button>`).join('');
  const desc = (POLICIES.find((p) => p.id === policy) || POLICIES[0]).desc;
  return `<div class="plan-card">
      <div class="plan-title">🎽 Quartermaster</div>
      <div class="activity-toggle">${toggle}</div>
      <div class="skill-shape"><span class="dim">${desc}</span></div>
      <div class="rr-sub" style="margin-bottom:10px">${kitted}/${guild.roster.length} fully kitted · armory idle: ${idleW} weapon${idleW === 1 ? '' : 's'}, ${idleB} armor</div>
      <button class="advance-btn" style="font-size:0.82em;padding:11px" onclick="__guild.provision()">⚙ Provision from stores now</button>
    </div>`;
}

function marketPanel() {
  const m = guild.market;
  const rows = Object.keys(MATERIAL_PRICE).map((id) => {
    const price = buyPrice(id);
    const stock = m.stock[id] || 0;
    const afford = guild.gold >= price && stock > 0;
    return `<div class="market-row">
        <span class="mk-name"><b style="color:${MATERIALS[id].col}">${MATERIALS[id].name}</b> <span class="rr-sub">stock ${stock}</span></span>
        <button class="rc-hire ${afford ? '' : 'disabled'}" onclick="__guild.buyMaterial('${id}')">Buy · ${price}g</button>
      </div>`;
  }).join('');
  return `<div class="plan-card">
      <div class="plan-title">⚖ Market · Buy Materials</div>
      <div class="market-list">${rows}</div>
      <div class="hint" style="text-align:left;padding:6px 0 0">Sell forged goods from the Armory above. Stock refreshes each week.</div>
    </div>`;
}

function recapPanel() {
  const rep = report || guild.lastReport; // module var this session, persisted copy after a reload
  if (!rep) return '';
  const lines = rep.results.map((r) => {
    if (r.type === 'forge') {
      const f = r.forge;
      if (f.ok) return `<div class="r-line"><b>${r.name}</b> forged <span class="up">${f.item.name} (q${f.quality})</span> <span class="dim">· +${f.practiceGain} practice</span></div>`;
      const why = f.reason === 'materials' ? 'out of materials' : (f.reason === 'locked' ? 'recipe not yet unlocked' : 'too tired to work');
      return `<div class="r-line"><b>${r.name}</b> <span class="down">couldn't forge — ${why}</span></div>`;
    }
    if (r.type === 'brew') {
      const b = r.brew;
      if (b.ok) return `<div class="r-line"><b>${r.name}</b> brewed <span class="up">${b.qty}× ${b.batch.name} (p${b.potency})</span> <span class="dim">· +${b.practiceGain} practice</span></div>`;
      const why = b.reason === 'materials' ? 'out of herbs' : (b.reason === 'locked' ? 'recipe not yet unlocked' : 'too tired to brew');
      return `<div class="r-line"><b>${r.name}</b> <span class="down">couldn't brew — ${why}</span></div>`;
    }
    if (r.type === 'study') return `<div class="r-line"><b>${r.name}</b> studied ${r.discipline === 'alchemy' ? 'alchemy' : 'metallurgy'} — <span class="up">Theory +${r.study.theoryGain}</span></div>`;
    if (r.type === 'retire') {
      const cr = r.career || {};
      const titles = (cr.titles || []).length ? ` · 👑 ${(cr.titles || []).length} title${cr.titles.length > 1 ? 's' : ''}` : '';
      return `<div class="r-line">🎓 <b>${r.name}</b> <span class="up">retires with honors</span> — ${cr.wins || 0}W–${cr.losses || 0}L${titles} · enshrined in the Hall of Fame (Quarters)</div>`;
    }
    if (r.type === 'quest') {
      const wound = r.wounded ? ` <span class="down">· ⚠ ${r.wounded}</span>` : '';
      const led = r.quest && r.quest.played ? ` <span class="dim">· ${r.quest.won ? 'boss felled by hand' : 'the played bout was lost'}</span>` : '';
      if (r.quest && r.quest.noQuest) return `<div class="r-line"><b>${r.name}</b> <span class="down">had no quest assigned</span></div>`;
      if (r.quest && r.quest.tooTired) return `<div class="r-line"><b>${r.name}</b> <span class="down">too exhausted to set out — rest first</span></div>`;
      if (r.quest && r.quest.success) {
        const party = r.quest.party > 1 ? ` <span class="dim">(party of ${r.quest.party})</span>` : '';
        if (r.reward) {
          const loot = r.reward.loot ? ` +1 ${MATERIALS[r.reward.loot].name}` : '';
          return `<div class="r-line"><b>${r.name}</b> completed <span class="up">${r.quest.title}</span> — <span class="up">+${r.reward.gold}g · +${r.reward.rep} rep${loot}</span> <span class="dim">· Field +${r.field}</span>${party}${led}${wound}</div>`;
        }
        return `<div class="r-line"><b>${r.name}</b> joined <span class="up">${r.quest.title}</span> <span class="dim">· Field +${r.field}</span>${party}${led}${wound}</div>`;
      }
      return `<div class="r-line"><b>${r.name}</b> <span class="down">failed ${r.quest ? r.quest.title : 'a quest'}</span>${led}${wound}</div>`;
    }
    if (r.rested) return `<div class="r-line"><b>${r.name}</b> rested <span class="dim">— fat ${fmtDelta(r.fat)}${r.injury ? ', still hurt' : ''}</span></div>`;
    if (r.injured) return `<div class="r-line"><b>${r.name}</b> <span class="down">injured — recovering</span> <span class="dim">(fat ${fmtDelta(r.fat)})</span></div>`;
    const ups = HERO_STATS.filter((s) => r.gains && r.gains[s]).map((s) => `<span class="up">${s}+${r.gains[s]}</span>`);
    const downs = HERO_STATS.filter((s) => r.drops && r.drops[s]).map((s) => `<span class="down">${s}−${r.drops[s]}</span>`);
    const body = ups.concat(downs).join(' ') || '<span class="down">no gain — too worn down</span>';
    const bt = r.breakthrough ? ' <span class="up">✨ breakthrough!</span>' : '';
    return `<div class="r-line"><b>${r.name}</b> · ${body}${bt}${r.injury ? ` <span class="down">⚠ ${injuryLabel(r.injury)}!</span>` : ''} <span class="dim">(fat ${fmtDelta(r.fat)})</span></div>`;
  }).join('');
  const qm = rep.issued ? `<div class="r-line dim">🎽 quartermaster issued ${rep.issued} item(s) from stores</div>` : '';
  const tLines = (rep.tournaments || []).map((t) => {
    const glyph = (EVENT_TYPES[t.eventType] || {}).glyph || '🏆';
    if (t.forfeit) return `<div class="r-line">${glyph} <b>${t.name}</b> <span class="down">${t.hadEntrants ? 'forfeited — entrants unfit to compete' : 'passed — no one entered'}</span></div>`;
    const loot = t.loot ? ` +1 ${MATERIALS[t.loot].name}` : '';
    const team = t.party > 1 ? ` <span class="dim">(team of ${t.party})</span>` : '';
    const pay = t.gold || t.rep ? ` — <span class="up">+${t.gold}g · +${t.rep} rep${loot}</span>` : '';
    const played = t.played ? ' <span class="dim">· fought by hand</span>' : '';
    return `<div class="r-line">${glyph} <b>${t.name}</b> · <span class="${t.champion ? 'up' : ''}">${t.placement}</span>${pay}${team}${played}</div>`;
  }).join('');
  return `<div class="week-report"><h4>Last week</h4>${tLines}${lines}${qm}<div class="r-line">income <span class="up">+${rep.income}g</span> · upkeep <span class="down">−${rep.upkeep}g</span>${rep.shortfall ? ' · <span class="down">insolvent — morale −8 all</span>' : ''}</div></div>`;
}

function recruitCard(r) {
  const cost = hireCost(r);
  const afford = guild.gold >= cost && guild.roster.length < maxRoster(guild);
  return `<div class="recruit-card">
      <span class="rr-portrait rc-portrait">${personSprite(r, 76)}</span>
      <span class="rc-info"><b>${r.name}</b><span class="rr-sub">${ARCH_GLYPH[r.archetype] || '☉'} ${r.archetype} · Σ${statTotal(r)} · ⚡${heroPower(r)}</span>${(r.traits || []).length ? `<span class="rr-sub trait-line">${r.traits.map((t) => `<span class="trait-chip" title="${(TRAITS[t] || {}).desc || ''}">${t}</span>`).join('')}</span>` : ''}</span>
      <button class="rc-hire ${afford ? '' : 'disabled'}" onclick="__guild.hire('${r.id}')">Hire · ${cost}g</button>
    </div>`;
}

// --- rooms ------------------------------------------------------------------
/** A short status line per room, shown on hub tiles and rail chips. */
function roomStatus(id) {
  const r = guild.roster;
  switch (id) {
    case 'grounds': return `${r.length}/${maxRoster(guild)} housed`;
    case 'arena': return r.length ? 'fight now' : 'no fighters';
    case 'calendar': { const t = nextTournament(guild); if (!t) return 'no events'; const w = Math.max(0, t.week - guild.calendar.week); return `${w === 0 ? 'this week' : w + 'w'} · R${t.rank}`; }
    case 'roster': return `${r.length} member${r.length === 1 ? '' : 's'}`;
    case 'forge': { const n = r.filter((h) => h.assignment.type === 'forge').length; return n ? `${n} forging` : 'idle'; }
    case 'library': { const n = r.filter((h) => h.assignment.type === 'study').length; return n ? `${n} studying` : 'idle'; }
    case 'kitchen': return 'set diets';
    case 'armory': { const n = guild.inventory.items.length; return `${n} item${n === 1 ? '' : 's'}`; }
    case 'quarters': return `${guild.recruits.length} for hire`;
    case 'academy': { const a = guild.apprentices || []; const ready = a.filter((x) => x.readiness >= 1).length; return ready ? `${a.length} · ${ready} ready` : `${a.length}/${dormCapacity(guild)} bunks`; }
    case 'laboratory': { const n = r.filter((h) => h.assignment.type === 'brew').length; return n ? `${n} brewing` : 'idle'; }
    case 'apothecary': { const n = potionCount(guild.inventory); return `${n} potion${n === 1 ? '' : 's'}`; }
    default: return '';
  }
}

function rosterRoom() {
  const h = heroById(selectedId);
  const list = `<div class="plan-card"><div class="plan-title">🛡 Roster · ${guild.roster.length}/${maxRoster(guild)}</div>
      <div class="roster-list">${guild.roster.map(rosterRow).join('')}</div></div>`;
  if (!h) return list;
  return `${list}
    <div class="plan-card">
      ${heroHeader(h)}
      <div class="room-jobline">This week: <b>${jobLabel(h)}</b></div>
      <div class="plan-title">⚔ Train</div>${trainBody(h)}
      <div class="plan-title">🗺 Dispatch on a Quest</div>${questBody(h)}
    </div>`;
}

/** A work department: shows ONLY the members assigned to this job, plus an "Assign a
 *  member" picker to bring others in. The configured subject is the selected member if
 *  they work here, else the first worker. */
function deptRoom(jobType, roleGlyph, roleName, bodyFn) {
  const workers = guild.roster.filter((h) => h.assignment.type === jobType);
  // selectedId is realigned to a worker in openRoom() (navigation time, not render time),
  // so the selected member is a worker here whenever one exists.
  const subject = (heroById(selectedId) && heroById(selectedId).assignment.type === jobType) ? heroById(selectedId) : (workers[0] || null);
  const chips = workers.map((h) => `<button class="hs-chip ${subject && h.id === subject.id ? 'sel' : ''}" title="${h.name}" onclick="__guild.selectHero('${h.id}')">${personSprite(h, 48)}</button>`).join('');
  const available = guild.roster.filter((h) => h.assignment.type !== jobType);
  const addChips = available.map((h) => `<button class="hs-chip add" title="Assign ${h.name}" onclick="__guild.assignTo('${h.id}','${jobType}')">${personSprite(h, 42)}</button>`).join('');
  const workerRow = workers.length
    ? `<div class="dept-lbl">${roleGlyph} Working here · ${workers.length}</div><div class="hero-switch">${chips}</div>`
    : `<div class="room-jobline">No one works the ${roleName.toLowerCase()} this week.</div>`;
  const addRow = available.length ? `<div class="dept-lbl add">➕ Assign a member</div><div class="hero-switch">${addChips}</div>` : '';
  return `<div class="plan-card">
      ${workerRow}
      ${addRow}
      ${subject ? `<div class="plan-title">${roleGlyph} ${subject.name}</div>${bodyFn(subject)}` : ''}
    </div>`;
}

function forgeRoom() { return deptRoom('forge', '🔨', 'Forge', forgeBody); }
function libraryRoom() { return deptRoom('study', '📖', 'Library', studyBody); }
function laboratoryRoom() { return deptRoom('brew', '⚗', 'Laboratory', brewBody); }

/** The Kitchen is the guild MENU — everyone eats, so it lists every member's diet
 *  (not a worker roster). Pick a member to change their diet. */
function kitchenRoom() {
  const h = heroById(selectedId);
  const menu = `<div class="plan-card"><div class="plan-title">🍲 The Menu · who eats what</div>
      <div class="roster-list">${guild.roster.map((m) => `<button class="roster-row ${m.id === selectedId ? 'sel' : ''}" onclick="__guild.selectHero('${m.id}')">
          <span class="rr-portrait sm">${personSprite(m, 34)}</span>
          <span class="rr-main"><span class="rr-name">${m.name}</span><span class="rr-assign">🍖 ${getDietPlan(m.assignment.dietId).name}</span></span>
        </button>`).join('')}</div>
      <div class="hint" style="text-align:left;padding:6px 2px 0">Everyone eats. Supply-gated meals — where a member only gets their diet if the Kitchen stocks it — arrive with the Cook mechanic.</div></div>`;
  if (!h) return menu;
  return `${menu}<div class="plan-card"><div class="plan-title">🍖 ${h.name}'s Diet</div>${dietBody(h)}</div>`;
}
function apothecaryRoom() {
  const inv = guild.inventory;
  const h = heroById(selectedId);
  const herbs = Object.keys(MATERIALS).filter((k) => MATERIALS[k].kind === 'herb')
    .map((k) => `<span class="mat"><b style="color:${MATERIALS[k].col}">${inv.materials[k] || 0}</b> ${MATERIALS[k].name}</span>`).join('');
  const shelf = inv.potions || [];
  const shelfHTML = shelf.length ? shelf.map((b) => `<div class="armory-item">
      <span class="ai-icon">${b.glyph || '🧪'}</span>
      <span class="ai-main"><b>${b.name} ×${b.qty}</b><span class="rr-sub">potency ${b.potency}${b.brewedByName ? ' · brewed by ' + b.brewedByName : ''}</span></span>
      <span class="ai-actions"><button class="rc-hire" onclick="__guild.usePotion('${b.id}')">Use</button></span>
    </div>`).join('') : '<div class="hint">Empty. Assign an Alchemist to the Laboratory to brew potions.</div>';
  const ctx = h ? `<div class="plan-card">
      <div class="plan-title">🩹 Treating · ${h.name}</div>
      ${heroSwitcher()}
      ${bar('Stamina', h.condition.stamina, 'var(--success)')}${bar('Fatigue', h.condition.fatigue, '#e08a3c')}${bar('Stress', h.condition.stress || 0, '#c05a8a')}
      ${h.condition.injury ? `<div class="injury-flag">⚠ ${injuryLabel(h.condition.injury)} — a potent draught (p70+) cures it outright</div>` : ''}
      <div class="room-jobline">Pick a member, then <b>Use</b> a potion below to treat them.</div>
    </div>` : '';
  return `${ctx}<div class="plan-card">
      <div class="plan-title">🏺 Apothecary · ${potionCount(inv)} potion(s)</div>
      <div class="materials">${herbs}</div>
      <div class="armory-shelf">${shelfHTML}</div>
    </div>`;
}

function armoryRoom() {
  // Equip acts on the selected member, so make that target visible & switchable
  // here — the shelf's Equip button would otherwise silently arm an off-screen hero.
  const h = heroById(selectedId);
  const ctx = h ? `<div class="plan-card">
      <div class="plan-title">🎯 Equipping · ${h.name} <span class="rr-sub">⚡${combatPower(h)}</span></div>
      ${heroSwitcher()}
      ${equippedLine(h)}
      <div class="room-jobline">Pick a member, then <b>Equip</b> items from the armory below onto them.</div>
    </div>` : '';
  return `${ctx}<div class="room-cols">${armoryPanel()}${quartermasterPanel()}${marketPanel()}</div>`;
}
/** Appoint a Hall-of-Famer as the guild trainer (+15% training gains, one slot). */
function appointTrainer(hofId) {
  const f = (guild.hallOfFame || []).find((x) => x.id === hofId); if (!f) return;
  guild.trainer = (guild.trainer && guild.trainer.id === hofId) ? null
    : { id: f.id, name: f.name, archetype: f.archetype, appearanceSeed: f.appearanceSeed, appearance: f.appearance, prime: f.prime };
  notice = guild.trainer ? `${f.name} now runs the training yard — gains +15%.` : `${f.name} steps down from the yard.`;
  save(); render();
}

/** The shrine: retired members' frozen careers, and the trainer appointment. */
function hallOfFamePanel() {
  const hof = guild.hallOfFame || [];
  if (!hof.length) return '';
  const rows = hof.slice().reverse().map((f) => {
    const cr = f.career || {};
    const titles = (cr.titles || []).length ? ` · 👑${cr.titles.length}` : '';
    const isTrainer = guild.trainer && guild.trainer.id === f.id;
    return `<div class="opt hof-row">
        <span><span class="o-name">🎓 ${f.name}</span> <span class="o-desc">${f.archetype} · ${cr.wins || 0}W–${cr.losses || 0}L${titles} · peak ⚡${f.peakPower || '?'}</span></span>
        <button class="bout-btn ${isTrainer ? 'on' : ''}" onclick="__guild.appointTrainer('${f.id}')">${isTrainer ? '🏋 Head Trainer' : 'Appoint trainer'}</button>
      </div>`;
  }).join('');
  return `<div class="plan-card">
      <div class="plan-title">🏛 Hall of Fame ${guild.trainer ? `· <span class="rr-sub">trainer: ${guild.trainer.name} (+15% gains)</span>` : ''}</div>
      <div class="opt-list">${rows}</div>
    </div>`;
}

function quartersRoom() {
  return `${hallOfFamePanel()}<div class="plan-card">
      <div class="plan-title">🍺 Tavern · Recruits · roster ${guild.roster.length}/${maxRoster(guild)}</div>
      <div class="recruit-list">${guild.recruits.map(recruitCard).join('')}</div>
      ${guild.roster.length >= maxRoster(guild) ? '<div class="hint">Quarters are full — expand Living Quarters in the 🏕 Grounds to house more.</div>' : ''}
    </div>`;
}

// --- Academy (the minor-league / farm system) -------------------------------
/** One apprentice card: lean, scouted potential (stars), readiness bar, graduate/release. */
function apprenticeCard(a) {
  const stars = potentialStars(a.potential);
  const starStr = '★'.repeat(stars) + '☆'.repeat(5 - stars);
  const pct = Math.round(a.readiness * 100);
  const ready = a.readiness >= 1;
  const rosterFull = guild.roster.length >= maxRoster(guild);
  const gradLabel = ready ? (rosterFull ? '🎓 Roster full' : '🎓 Graduate → roster') : `Developing · ${pct}%`;
  return `<div class="app-card ${ready ? 'ready' : ''}">
      <div class="app-head"><span class="app-lean">${LEAN_GLYPH[a.lean] || '🎓'} Leans ${a.lean}</span><span class="app-stars" title="scouted potential">${starStr}</span></div>
      <div class="app-bar"><span style="width:${pct}%"></span></div>
      <div class="app-meta">${ready ? '<b>Ready to graduate</b>' : `week ${a.weeks} in the academy`}</div>
      <div class="app-actions">
        <button class="app-grad" ${ready && !rosterFull ? '' : 'disabled'} onclick="__guild.promoteApprentice('${a.id}')">${gradLabel}</button>
        <button class="app-drop" title="Release this apprentice" onclick="__guild.dismissApprentice('${a.id}')">✕</button>
      </div>
    </div>`;
}
function academyRoom() {
  const apps = guild.apprentices || [];
  const cap = dormCapacity(guild);
  const board = apps.length * 6;
  const canTake = apps.length < cap;
  const rate = Math.round(developmentRate(guild) * 100);
  const cards = apps.length
    ? apps.map(apprenticeCard).join('')
    : '<div class="hint">No apprentices yet. Take one in to start your farm system — house them, feed them, and graduate the best into named heroes.</div>';
  return `<div class="plan-card">
      <div class="plan-title">🎓 Academy · ${apps.length}/${cap} bunks · board ${board}g/wk</div>
      <div class="hint" style="text-align:left">Apprentices develop ~${rate}%/week${guild.trainer ? ' (your trainer mentors the class)' : ' — appoint a trainer to teach faster'}. When one is ready, graduate them into a named hero — a draft shaped by their lean &amp; potential. Bunks = the 🎓 Dormitory (expand in 🏕 Grounds).</div>
      <button class="app-take" ${canTake ? '' : 'disabled'} onclick="__guild.takeApprentice()">${canTake ? `＋ Take in an apprentice · ☉${APPRENTICE_INTAKE}g` : 'Dormitory full — expand it in the Grounds'}</button>
      <div class="app-list">${cards}</div>
    </div>`;
}
function takeApprentice() {
  if (!Array.isArray(guild.apprentices)) guild.apprentices = [];
  if (guild.apprentices.length >= dormCapacity(guild)) { notice = 'The Dormitory is full — expand it in the 🏕 Grounds.'; render(); return; }
  if (guild.gold < APPRENTICE_INTAKE) { notice = `Taking in an apprentice costs ${APPRENTICE_INTAKE}g.`; render(); return; }
  addGold(guild, -APPRENTICE_INTAKE);
  guild.apprentices.push(makeApprentice());
  save(); render();
}
function promoteApprentice(id) {
  const i = (guild.apprentices || []).findIndex((a) => a.id === id);
  if (i < 0) return;
  const app = guild.apprentices[i];
  if (app.readiness < 1) { notice = 'That apprentice is not ready to graduate yet.'; render(); return; }
  if (guild.roster.length >= maxRoster(guild)) { notice = `Quarters are full (${maxRoster(guild)}). Expand Living Quarters before graduating.`; render(); return; }
  const hero = graduate(app);
  migrateHero(hero); ensureAssignment(hero);
  guild.roster.push(hero);
  guild.apprentices.splice(i, 1);
  selectedId = hero.id;
  notice = `🎓 ${hero.name} graduated from the academy as a ${hero.archetype}!`;
  save(); render();
}
function dismissApprentice(id) {
  guild.apprentices = (guild.apprentices || []).filter((a) => a.id !== id);
  save(); render();
}
function roomStub(room) {
  return `<div class="plan-card room-soon">
      <div class="room-soon-glyph">${room.glyph}</div>
      <div class="plan-title">${room.name}</div>
      <div class="hint">${room.soon || 'Coming soon.'}</div>
    </div>`;
}

// --- Grounds (the outdoors / compound view) ---------------------------------
// A capacity dashboard fronted by an illustrated compound. The scene is pure
// CSS/DOM (no canvas, no RAF) so it costs no battery; buildings are tappable and
// the Bunkhouse visibly grows as Living Quarters are expanded. Below the scene:
// capacity roll-ups (bars/counts that read the same at 6 members or 120 trainees)
// and the facility upgrade grid. See DESIGN.md Phase 5 (the minor league).

/** Human-readable effect of a facility AT a given tier (for the "now → next" line). */
function facilityEffect(key, t) {
  const def = FACILITIES[key];
  if (key === 'quarters') return `${def.caps[t]} beds`;
  if (key === 'mess') return `feeds ${def.fed[t]}`;
  if (key === 'yard') { const p = Math.round((def.mainMult[t] - 1) * 100); return p ? `+${p}% training` : 'standard training'; }
  if (key === 'ring') return def.injuryBonus[t] ? `+${def.injuryBonus[t]} injury guard` : 'no injury guard';
  if (key === 'infirmary') return def.healRate[t] > 1 ? `injuries heal ×${def.healRate[t]}` : 'bed rest only';
  if (key === 'dorm') return `${def.beds[t]} bunks`;
  return '';
}

/** Buy the next tier of a facility (gold-gated only — rank isn't advanced anywhere yet). */
function upgradeFacility(key) {
  const def = FACILITIES[key]; if (!def) return;
  const t = facilityTier(guild, key);
  if (t >= def.costs.length - 1) { notice = `${def.name} is already at its highest tier.`; render(); return; }
  const cost = def.costs[t + 1];
  if (guild.gold < cost) { notice = `Not enough gold — upgrading ${def.name} costs ${cost}g.`; render(); return; }
  addGold(guild, -cost);
  guild.facilities[key] = t + 1;
  notice = `${def.name} expanded to Tier ${t + 1} — ${facilityEffect(key, t + 1)}.`;
  save(); render(); // default render() preserves scroll so the player keeps their place in the grid
}

/** One facility's card: current tier, its effect now → next, and an Upgrade button. */
function facilityCard(key) {
  const def = FACILITIES[key];
  const t = facilityTier(guild, key);
  const maxed = t >= def.costs.length - 1;
  const cost = maxed ? 0 : def.costs[t + 1];
  const afford = guild.gold >= cost;
  const action = maxed
    ? '<span class="fac-max">✦ Fully expanded</span>'
    : `<button class="rc-hire ${afford ? '' : 'disabled'}" onclick="__guild.upgradeFacility('${key}')">Expand · ${cost}g</button>`;
  return `<div class="plan-card fac-card">
      <div class="fac-head"><span class="fac-glyph">${def.glyph}</span><span class="fac-name">${def.name}</span><span class="fac-tier">Tier ${t}</span></div>
      <div class="fac-desc">${def.desc}</div>
      <div class="fac-now">Now <b>${facilityEffect(key, t)}</b>${maxed ? '' : ` <span class="dim">→ ${facilityEffect(key, t + 1)}</span>`}</div>
      <div class="fac-action">${action}</div>
    </div>`;
}

/** The buildings in the compound scene, left→right. Each opens its room; the
 *  Bunkhouse (grow:'quarters') gains storeys as Living Quarters expand. */
const COMPOUND_BUILDINGS = [
  { room: 'quarters', glyph: '🏠', name: 'Bunkhouse', cls: 'bld-quarters', h: 50, grow: 'quarters' },
  { room: 'library', glyph: '📖', name: 'Library', cls: 'bld-library', h: 60 },
  { room: 'roster', glyph: '🏰', name: 'Great Hall', cls: 'bld-hall', h: 86, wide: true },
  { room: 'forge', glyph: '🔨', name: 'Forge', cls: 'bld-forge', h: 52 },
  { room: 'armory', glyph: '🗡', name: 'Armory', cls: 'bld-armory', h: 56 },
  { room: 'kitchen', glyph: '🍲', name: 'Kitchen', cls: 'bld-kitchen', h: 46 },
];
function compoundScene() {
  const buildings = COMPOUND_BUILDINGS.map((b) => {
    const floors = b.grow ? facilityTier(guild, b.grow) : 0; // extra storeys as the facility tiers up
    const height = Math.min(100, b.h + floors * 8);
    const wins = Array.from({ length: 1 + floors }, () => '<span class="bld-win"></span>').join('');
    return `<button class="building ${b.cls} ${b.wide ? 'wide' : ''}" style="height:${height}%" onclick="__guild.openRoom('${b.room}')" aria-label="Enter ${b.name}" title="Enter ${b.name}">
        <span class="bld-roof"></span>
        <span class="bld-wall"><span class="bld-glyph">${b.glyph}</span><span class="bld-wins">${wins}</span></span>
        <span class="bld-label">${b.name}</span>
      </button>`;
  }).join('');
  return `<div class="compound" role="group" aria-label="The guild grounds — tap a building to enter">
      <div class="compound-row">${buildings}</div>
    </div>`;
}

function groundsRoom() {
  const roster = guild.roster;
  const housed = roster.length, cap = maxRoster(guild), fed = fedCapacity(guild);
  const training = roster.filter((h) => h.assignment.type === 'train').length;
  const upkeep = weeklyUpkeep(guild, getDietPlan);
  const named = roster.length; // every roster member is a named hero today
  const trainees = 0;          // generic trainees (the Phase-5 minor league) — counted here, none yet
  const facGrid = Object.keys(FACILITIES).map(facilityCard).join(''); // derived — new facilities appear for free
  const strip = roster.slice(0, 8).map((h) => `<button class="hs-chip" title="${h.name}" onclick="__guild.selectHero('${h.id}')">${personSprite(h, 48)}</button>`).join('')
    + (roster.length > 8 ? `<span class="hs-more">+${roster.length - 8}</span>` : '');
  return `${compoundScene()}
    <div class="plan-card">
      <div class="plan-title">🏕 The Grounds · capacity</div>
      ${bar('Housing', cap ? housed / cap * 100 : 0, housed >= cap ? 'var(--danger)' : 'var(--success)', `${housed} / ${cap}`)}
      <div class="fac-note">Beds in the Living Quarters${housed >= cap ? ' — full; expand to recruit more' : ''}</div>
      ${bar('Fed', fed ? housed / fed * 100 : 0, housed > fed ? '#e08a3c' : '#8ab4d8', `${housed} / ${fed}`)}
      <div class="fac-note">Mess Hall capacity${housed > fed ? ' — overstretched; expand it to keep everyone fed' : ''}</div>
      ${bar('In training', roster.length ? training / roster.length * 100 : 0, 'var(--gold)', `${training} / ${roster.length}`)}
      <div class="fac-note">Members drilling this week · upkeep −${upkeep}g/wk</div>
    </div>
    <div class="plan-card">
      <div class="plan-title">👥 Headcount</div>
      <div class="headcount">
        <span class="hc-cell"><b>${named}</b><span>Named heroes</span></span>
        <span class="hc-cell"><b>${trainees}</b><span>Trainees</span></span>
        <span class="hc-cell"><b>${housed}/${cap}</b><span>Housed</span></span>
      </div>
      <div class="hint" style="text-align:left;padding:6px 2px 0">Trainees — a pool of generic recruits who train up and graduate into named heroes — arrive with the minor-league system. This view already scales to them.</div>
      <div class="dept-lbl" style="margin-top:10px">Members</div>
      <div class="hero-switch">${strip}</div>
    </div>
    <div class="plan-title" style="margin:2px 2px 8px">🏗 Expand the compound</div>
    <div class="fac-hub">${facGrid}</div>`;
}

// --- Calendar (the season of tournaments) -----------------------------------
/** Nominate the ONE champion who represents the guild in an upcoming tournament
 *  (Monster-Rancher style — you peak and taper a single ace, not dump the roster in).
 *  Entering replaces any current pick, so a lineup is always at most one hero. */
function enterTournament(tId, heroId) {
  const t = (guild.schedule || []).find((x) => x.id === tId); const h = heroById(heroId);
  if (!t || !h || t.resolved) return;
  t.entrants = [heroId]; // single-entrant: one champion per event (replace, never stack)
  notice = `${h.name} will represent the guild in ${t.name}.`;
  save(); render();
}
function leaveTournament(tId, heroId) {
  const t = (guild.schedule || []).find((x) => x.id === tId); if (!t) return;
  t.entrants = (t.entrants || []).filter((id) => id !== heroId);
  save(); render();
}
/** Toggle whether the player will PLAY this tournament's match (vs auto-resolve) next
 *  Advance Week — and in WHICH combat lens: the live arena or turn-based tactics.
 *  Tapping the already-armed lens disarms it (back to auto-resolve). */
function setPlayNext(tId, mode) {
  const m = mode === 'tactical' ? 'tactical' : 'action';
  guild.playPlan = planFor('tournament', tId) === m ? null : { kind: 'tournament', id: tId, mode: m };
  notice = guild.playPlan
    ? (m === 'tactical'
      ? 'You’ll command this match turn by turn — nominate a champion, then Advance Week.'
      : 'You’ll fight this match live — nominate a champion, then Advance Week.')
    : 'This match will auto-resolve.';
  save(); render();
}
/** Arm (or disarm) PLAYING a quest's climactic bout on Advance Week. */
function setPlayQuest(qId, mode) {
  const m = mode === 'tactical' ? 'tactical' : 'action';
  guild.playPlan = planFor('quest', qId) === m ? null : { kind: 'quest', id: qId, mode: m };
  notice = guild.playPlan
    ? 'The party’s strongest marcher will fight the quest’s boss — you at the controls. Advance Week when ready.'
    : 'The quest will resolve on its own.';
  save(); render();
}
/** Calendar toggle: ask how to resolve each due match, or always simulate quietly. */
function setAskTournaments() {
  guild.battlePrefs.tournament = guild.battlePrefs.tournament === 'ask' ? 'sim' : 'ask';
  notice = guild.battlePrefs.tournament === 'ask'
    ? 'Due matches will ask: fight it live, command it, or simulate.'
    : 'Due matches will simulate without asking.';
  save(); render();
}

/** One upcoming tournament: countdown, field, rewards, your champion + picker, win odds. */
function tournamentCard(t) {
  const weeksOut = t.week - guild.calendar.week;
  const when = weeksOut <= 0 ? 'this week' : weeksOut === 1 ? 'next week' : `in ${weeksOut} weeks`;
  const entrant = (t.entrants || []).map(heroById).filter(Boolean)[0] || null; // one champion per event
  const fit = entrant && !entrant.condition.injury ? entrant : null; // matches the resolver's injured filter
  const power = fit ? combatPower(fit) : 0;
  const champ = Math.round(championOdds(power, t) * 100);
  const oddsCls = champ >= 50 ? 'up' : champ >= 20 ? '' : 'down';
  const loot = t.rewards.loot ? ` · +1 ${MATERIALS[t.rewards.loot].name}` : '';
  const odds = !entrant ? '<span class="dim">Choose a champion to see your odds.</span>'
    : !fit ? '<span class="down">Injured — would forfeit. Heal them, or send someone else.</span>'
    : `${entrant.name} <b>⚡${power}</b> · <span class="${oddsCls}">~${champ}% to win it all</span>`;
  const chip = entrant
    ? `<button class="hs-chip sel ${entrant.condition.injury ? 'unfit' : ''}" title="${entrant.condition.injury ? entrant.name + ' — injured, cannot compete; withdraw?' : 'Withdraw ' + entrant.name}" onclick="__guild.leaveTournament('${t.id}','${entrant.id}')">${personSprite(entrant, 42)}</button>`
    : '<span class="dim" style="font-size:0.82em">No champion chosen.</span>';
  const avail = guild.roster.filter((h) => !entrant || h.id !== entrant.id);
  const addChips = avail.map((h) => `<button class="hs-chip add" title="Send ${h.name}" onclick="__guild.enterTournament('${t.id}','${h.id}')">${personSprite(h, 42)}</button>`).join('');
  return `<div class="plan-card tourney-card ${weeksOut <= 1 ? 'imminent' : ''} ${t.type === 'major' ? 'major' : ''}">
      <div class="tourney-head"><span class="tourney-name">${(EVENT_TYPES[t.type] || {}).glyph || '🏆'} ${t.name}</span><span class="q-rank">R${t.rank}</span><span class="tourney-when">${when}</span></div>
      ${t.type === 'major' ? '<div class="rr-sub major-tag">👑 The season’s tentpole — double purse, one rank up, a deeper bracket.</div>' : ''}
      <div class="rr-sub">Field ~${t.field}⚡ · best of ${t.rounds} · Champion <span class="up">${t.rewards.gold}g · +${t.rewards.reputation} rep${loot}</span></div>
      <div class="tourney-odds">${odds}</div>
      ${fit && weeksOut <= 1
        ? `<div class="tourney-lens">
            <button class="tourney-play ${planFor('tournament', t.id) === 'action' ? 'on' : ''}" title="Real-time arena — move with the stick, tap to attack" onclick="__guild.setPlayNext('${t.id}','action')">${planFor('tournament', t.id) === 'action' ? '⚔ Fighting it live — winner take all' : '⚔ Fight it live'}</button>
            <button class="tourney-play ${planFor('tournament', t.id) === 'tactical' ? 'on' : ''}" title="Turn-based tactics — queue moves; both sides execute at once" onclick="__guild.setPlayNext('${t.id}','tactical')">${planFor('tournament', t.id) === 'tactical' ? '♟ Commanding it turn by turn' : '♟ Command it (tactics)'}</button>
          </div>`
        : (fit ? '<div class="hint" style="text-align:left;padding:0 2px 8px">🎮 Playable once it’s a week out.</div>' : '')}
      <div class="dept-lbl">Your champion</div>
      <div class="hero-switch">${chip}</div>
      ${avail.length ? `<div class="dept-lbl add">➕ ${entrant ? 'Send someone else' : 'Choose a champion'}</div><div class="hero-switch">${addChips}</div>` : ''}
    </div>`;
}
function calendarRoom() {
  const cur = guild.calendar.week;
  const upcoming = (guild.schedule || []).filter((t) => !t.resolved && t.week >= cur).sort((a, b) => a.week - b.week);
  const cards = upcoming.length ? upcoming.map(tournamentCard).join('') : '<div class="plan-card"><div class="hint">No tournaments scheduled — advance a week to refresh the season.</div></div>';
  // The 12-week season strip: one chip per coming week; glyphs mark booked events.
  const byWeek = new Map((guild.schedule || []).filter((t) => !t.resolved).map((t) => [t.week, t]));
  let strip = '';
  for (let w = cur; w < cur + 12; w++) {
    const wy = ((guild.calendar.weekOfYear - 1 + (w - cur)) % 48) + 1;
    const ev = byWeek.get(w);
    strip += `<span class="cal-chip ${w === cur ? 'now' : ''} ${ev ? 'has-ev' : ''} ${ev && ev.type === 'major' ? 'major' : ''}"
        title="${ev ? `${ev.name} (R${ev.rank}) — ${seasonOf(wy)}, week ${wy}` : `${seasonOf(wy)}, week ${wy}`}">
        <span class="cal-wk">${wy}</span><span class="cal-glyph">${ev ? (EVENT_TYPES[ev.type] || {}).glyph || '🏆' : '·'}</span></span>`;
  }
  const ask = guild.battlePrefs.tournament === 'ask';
  return `<div class="plan-card">
      <div class="plan-title">📅 ${seasonOf(guild.calendar.weekOfYear)} · ${formatDate(guild.calendar)}</div>
      <div class="cal-strip">${strip}</div>
      <div class="hint" style="text-align:left;padding:2px 2px 4px">Tournaments are set weeks in advance — <b>nominate one champion and train them toward the date</b>. Each resolves automatically on its week as a bracket fought on your champion's ⚡; an injured champion can't compete, so peak them <em>and</em> keep them healthy.</div>
      <button class="opt" onclick="__guild.setAskTournaments()" style="margin-top:6px;width:100%">
        <span><span class="o-name">${ask ? '🔔' : '🔕'} Due-match chooser</span> <span class="o-desc">${ask ? 'each due match asks: fight it live, command it, or simulate' : 'due matches simulate quietly (no prompt)'}</span></span>
        <span class="o-cost">${ask ? 'ON' : 'OFF'}</span></button>
    </div>
    ${cards}`;
}

// --- Arena (always-open live combat) ----------------------------------------
/** Start a LIVE practice bout right now (independent of Advance Week): your fighter
 *  vs a member or a mirror-strength training dummy. Pure practice — no gold, no
 *  injuries, no stat/morale change — so it can't be farmed; it's just "combat mode". */
async function practiceBout(myId, oppId, mode) {
  if (advancing) return; // a battle (bout or tournament) is already live
  const me = heroById(myId);
  if (!me) { notice = 'Pick your fighter first.'; render(); return; }
  if (typeof window.playGuildBattle !== 'function') { notice = 'The combat engine is still loading — try again in a moment.'; render(); return; }
  const opp = oppId === '__dummy'
    ? { name: 'Training Dummy', archetype: 'Adventurer', stats: { ...me.stats }, appearanceSeed: 424242 }
    : heroById(oppId);
  if (!opp) return;
  const toSpec = (p) => ({ name: p.name, stats: p.stats, archetype: p.archetype, appearance: p.appearance, appearanceSeed: p.appearanceSeed, prime: p.prime });
  advancing = true;
  try {
    const result = await window.playGuildBattle({
      player: toSpec(me), opponent: toSpec(opp),
      mode: mode === 'tactical' || mode === 'spectate' ? mode : 'action', label: 'Practice bout',
    });
    const won = result && result.winner === 'player';
    notice = (result && result.forfeit) ? `${me.name} bowed out of the bout.`
      : won ? `${me.name} won the practice bout vs ${opp.name}!`
      : `${me.name} lost the bout vs ${opp.name} — no harm done, just practice.`;
  } finally { advancing = false; }
  showScreen('guildScreen'); render();
  if (ranchView) { renderRanch(guild, save); applyViewToggle(); } // restart the ranch loop after a bout
}

/** The Arena — jump straight into a live, playable bout (no Advance Week needed).
 *  Pick your fighter (the switcher), pick an opponent, fight. The always-open combat mode. */
function arenaRoom() {
  const h = heroById(selectedId);
  if (!h) return `<div class="plan-card"><div class="plan-title">⚔ The Arena</div><div class="hint">Recruit a member, then step into the ring.</div></div>`;
  // Each opponent offers BOTH combat lenses: ⚔ the live arena, ♟ turn-based tactics.
  const boutRow = (oppId, name, desc) => `<div class="opt bout-row">
      <span><span class="o-name">${name}</span> <span class="o-desc">${desc}</span></span>
      <span class="bout-btns">
        <button class="bout-btn" title="Real-time — move with the stick, tap to attack" onclick="__guild.practiceBout('${h.id}','${oppId}','action')">⚔ Live</button>
        <button class="bout-btn" title="Turn-based — queue moves; both sides execute at once" onclick="__guild.practiceBout('${h.id}','${oppId}','tactical')">♟ Tactics</button>
        <button class="bout-btn" title="Watch it fought turn by turn — take control anytime" onclick="__guild.practiceBout('${h.id}','${oppId}','spectate')">👁</button>
      </span></div>`;
  const dummy = boutRow('__dummy', '🥊 Training Dummy', 'a mirror of your own strength');
  const oppList = guild.roster.filter((m) => m.id !== h.id)
    .map((o) => boutRow(o.id, `⚔ vs ${o.name}`, `${o.archetype} Lv${o.level} · ⚡${combatPower(o)}`)).join('');
  return `<div class="plan-card">
      <div class="plan-title">⚔ The Arena · <span class="rr-sub">as ${h.name}</span></div>
      ${heroSwitcher()}
      <div class="room-jobline">Step into the ring <b>right now</b> — <b>⚔ Live</b> (on-screen stick or WASD, tap to attack) or <b>♟ Tactics</b> (queue your moves; both sides execute simultaneously). Pure practice: no gold, no injuries.</div>
      <div class="dept-lbl">Choose an opponent</div>
      <div class="opt-list">${dummy}${oppList}</div>
    </div>`;
}

// --- hub --------------------------------------------------------------------
function roomTile(room) {
  const role = roleFor(room.id);
  return `<button class="room-tile ${room.locked ? 'locked' : ''}" onclick="__guild.openRoom('${room.id}')">
      <span class="rt-glyph">${room.glyph}</span>
      <span class="rt-name">${room.name}</span>
      <span class="rt-tag">${role ? role.name : room.tag}</span>
      <span class="rt-status">${roomStatus(room.id)}</span>
    </button>`;
}

/** A one-line role banner shown atop every room. */
function roleTag(roomId) {
  const r = roleFor(roomId);
  return r ? `<div class="role-banner"><span class="role-name">${r.glyph} ${r.name}</span> <span class="dim">— ${r.blurb}</span></div>` : '';
}

// --- EO-style room scenes -----------------------------------------------------
// Every room opens on an illustrated banner (Etrian Odyssey town-facility style):
// the room's interior as a mood gradient, a giant glyph watermark, the people
// actually WORKING there this week standing at the counter, and a flavor line.
const ROOM_FLAVOR = {
  grounds: 'The compound at dusk — every wall your gold has raised.',
  calendar: 'The season stretches ahead. Every week is a coin — spend it well.',
  roster: 'Your people: their weeks, their wounds, their wills.',
  arena: 'Sand, sweat, and a crowd that never quite goes home.',
  forge: 'The anvil rings. Sparks settle into steel that will outlive its maker.',
  kitchen: 'Stew thick enough to stand a spoon in.',
  apothecary: 'Glass, herbcraft, and the difference between a scar and a grave.',
  library: 'Dust, vellum, and the long patience of theory.',
  armory: 'Every blade here has a name, a maker, and a story.',
  laboratory: 'Something bubbles that probably shouldn’t.',
  quarters: 'Bunks, tankards, and tomorrow’s legends asleep by nine.',
};
/** Who's pictured working the room this week (falls back to the selected member). */
function roomWorkers(roomId) {
  const job = ROOM_JOB[roomId];
  if (job) return guild.roster.filter((h) => h.assignment.type === job);
  if (roomId === 'arena') return guild.roster.filter((h) => h.assignment.trainingId === 'spar');
  if (roomId === 'roster' || roomId === 'quarters') return guild.roster.slice(0, 5);
  if (roomId === 'kitchen') return guild.roster.slice(0, 3);
  const sel = heroById(selectedId);
  return sel ? [sel] : [];
}
function roomScene(roomId) {
  const room = getRoom(roomId);
  if (!room) return '';
  const workers = roomWorkers(roomId).slice(0, 5);
  const sprites = workers.map((h) => `<span class="rs-worker" title="${h.name}">${personSprite(h, 52)}</span>`).join('');
  return `<div class="room-scene scene-${roomId}">
      <span class="rs-glyph">${room.glyph}</span>
      <div class="rs-text"><div class="rs-name">${room.glyph} ${room.name}</div>
        <div class="rs-flavor">${ROOM_FLAVOR[roomId] || ''}</div></div>
      <div class="rs-floor"></div>
      <div class="rs-workers">${sprites || '<span class="rs-empty">no one here this week</span>'}</div>
    </div>`;
}
function renderHub() {
  const nt = nextTournament(guild);
  const w = nt ? Math.max(0, nt.week - guild.calendar.week) : 0;
  const teaser = nt ? `<button class="hub-tourney" onclick="__guild.openRoom('calendar')">🏆 Next: <b>${nt.name}</b> <span class="q-rank">R${nt.rank}</span> <span class="hub-tourney-when">${w === 0 ? 'this week' : w === 1 ? 'next week' : 'in ' + w + ' weeks'}</span></button>` : '';
  return `${recapPanel()}
    <div class="hub-head">☙ <b>${guild.name}</b> — choose a room</div>
    ${teaser}
    <div class="room-hub">${ROOMS.map(roomTile).join('')}</div>`;
}

function renderRoom(id) {
  const room = getRoom(id);
  if (id === 'hub' || !room) return renderHub();
  const hdr = roomScene(id) + roleTag(id); // EO-style scene banner, then the role line
  if (room.locked) return hdr + roomStub(room);
  switch (id) {
    case 'grounds': return hdr + groundsRoom();
    case 'calendar': return hdr + calendarRoom();
    case 'roster': return hdr + rosterRoom();
    case 'arena': return hdr + arenaRoom();
    case 'forge': return hdr + forgeRoom();
    case 'kitchen': return hdr + kitchenRoom();
    case 'library': return hdr + libraryRoom();
    case 'laboratory': return hdr + laboratoryRoom();
    case 'apothecary': return hdr + apothecaryRoom();
    case 'armory': return hdr + armoryRoom();
    case 'quarters': return hdr + quartersRoom();
    case 'academy': return hdr + academyRoom();
    default: return renderHub();
  }
}

// --- rail (persistent left nav) ---------------------------------------------
function roomChip(room) {
  const on = currentRoom === room.id;
  return `<button class="room-chip ${on ? 'on' : ''} ${room.locked ? 'locked' : ''}" onclick="__guild.openRoom('${room.id}')">
      <span class="rc-glyph">${room.glyph}</span>
      <span class="rc-body"><span class="rc-name">${room.name}</span><span class="rail-status">${roomStatus(room.id)}</span></span>
    </button>`;
}
function railHTML() {
  const upkeep = weeklyUpkeep(guild, getDietPlan);
  const inFs = typeof document !== 'undefined' && (document.fullscreenElement || document.webkitFullscreenElement);
  return `<div class="rail-top">
      <div class="rail-title">
        <span class="guild-name">☙ ${guild.name}</span>
        <span class="rail-topbtns">
          <button class="guild-back" onclick="__guild.toggleFullscreen()" title="Fullscreen">${inFs ? '⤢' : '⛶'}</button>
          <button class="guild-back" onclick="__guild.back()" title="Leave to title">↩</button>
        </span>
      </div>
      <div class="guild-meta"><span>☉ <b>${guild.gold}</b>g</span><span>✦ <b>${guild.reputation}</b></span><span>${formatDate(guild.calendar)}</span></div>
    </div>
    <button class="room-chip hub-chip" onclick="__guild.openRanch()"><span class="rc-glyph">⌂</span><span class="rc-body"><span class="rc-name">Ranch</span></span></button>
    <button class="room-chip hub-chip ${currentRoom === 'hub' ? 'on' : ''}" onclick="__guild.openRoom('hub')"><span class="rc-glyph">🏰</span><span class="rc-body"><span class="rc-name">Hub</span></span></button>
    <div class="rail-rooms">${ROOMS.map(roomChip).join('')}</div>
    <button class="advance-btn rail-advance" onclick="__guild.advanceAll()">▶ ADVANCE WEEK <span class="ra-cost">−${upkeep}g</span></button>`;
}

// --- render -----------------------------------------------------------------
// Re-renders the room-hub (rail + stage) into a CHILD `.guild-hall-host` div, NOT
// #guildScreen itself — so the ranch view (a sibling `.ranch-view` with its own
// animated canvas subtree + RAF loop) is never wiped by a room re-render. Snapshots
// .room-stage scrollTop so an in-room menu tap doesn't jump to the top; navigation
// that should start fresh (switching rooms, Advance Week) passes { top: true }.
function render({ top = false } = {}) {
  const screen = document.getElementById('guildScreen');
  let host = screen.querySelector('.guild-hall-host');
  if (!host) { host = document.createElement('div'); host.className = 'guild-hall-host'; screen.appendChild(host); }
  const prevStage = host.querySelector('.room-stage');
  const keepScroll = top ? 0 : (prevStage ? prevStage.scrollTop : 0);
  host.innerHTML = `
    <div class="guild-hall">
      <aside class="room-rail">${railHTML()}</aside>
      <main class="room-stage">
        ${notice ? `<div class="notice">${notice}</div>` : ''}
        ${renderRoom(currentRoom)}
      </main>
    </div>`;
  const stage = host.querySelector('.room-stage');
  if (stage) stage.scrollTop = keepScroll;
  paintSprites(); // canvases exist now — draw the Elements sprites into them
}

// --- ranch (home view) ------------------------------------------------------
/** Show exactly one of the ranch view or the room-hub host (they're siblings in #guildScreen). */
function applyViewToggle() {
  const screen = document.getElementById('guildScreen');
  const host = screen.querySelector('.guild-hall-host');
  const view = screen.querySelector('.ranch-view');
  if (host) host.hidden = ranchView;
  if (view) view.hidden = !ranchView;
}
/** Go home to the ranch. */
function openRanch() { ranchView = true; renderRanch(guild, save); applyViewToggle(); }
/** Drill from the ranch into a room's menus. */
function enterRoomFromRanch(roomId) { stopRanchLoop(); ranchView = false; applyViewToggle(); openRoom(roomId); }
/** Tap a member on the ranch → open their Roster card. */
function manageMemberFromRanch(id) { stopRanchLoop(); ranchView = false; selectedId = id; applyViewToggle(); openRoom('roster'); }

// --- room / fullscreen controls ---------------------------------------------
const ROOM_JOB = { forge: 'forge', library: 'study', laboratory: 'brew' };
function openRoom(id) {
  currentRoom = id;
  notice = '';
  if (!selectedId && guild.roster[0]) selectedId = guild.roster[0].id; // work rooms key off a subject
  // Entering a work room, point at one of ITS workers (if the current pick works elsewhere),
  // so the room's controls target a member shown here. Done on navigation, not during render.
  const job = ROOM_JOB[id];
  if (job) {
    const sel = heroById(selectedId);
    if (!sel || sel.assignment.type !== job) { const w = guild.roster.find((h) => h.assignment.type === job); if (w) selectedId = w.id; }
  }
  render({ top: true }); // a fresh room starts scrolled to the top
}
function toggleFullscreen() {
  const el = document.documentElement;
  const inFs = document.fullscreenElement || document.webkitFullscreenElement;
  if (!inFs) {
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (req) {
      Promise.resolve(req.call(el)).then(() => {
        try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* desktop/iOS reject orientation lock */ }
      }).catch(() => {});
    } else { notice = 'Fullscreen unavailable here — use your browser or OS fullscreen.'; render(); }
  } else {
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (exit) exit.call(document);
  }
}

// --- entry ------------------------------------------------------------------
export function openGuild() {
  if (!guild) load();
  currentRoom = 'hub';
  // Re-render on fullscreen change so the ⛶/⤢ glyph tracks state (hook once).
  if (!window.__guildFsHooked) {
    window.__guildFsHooked = true;
    const onFs = () => { const g = document.getElementById('guildScreen'); if (g && g.classList.contains('active')) render(); };
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('webkitfullscreenchange', onFs);
  }
  render({ top: true });        // build the room-hub host (hidden while on the ranch)
  ranchView = true; renderRanch(guild, save); applyViewToggle(); // open ON the ranch (home)
  showScreen('guildScreen');
}

// Every handler no-ops while a week is advancing (a played battle can be mid-flight;
// rail buttons still render behind the battle screen and would corrupt the in-flight
// week). practiceBout/advanceAll keep their own internal checks as a second belt.
const __guildApi = { selectHero, setActivity, setTraining, setIntensity, scheduleAdd, scheduleRemoveAt, scheduleClear, setRecipe, setPotion, setDiscipline, usePotion, setDiet, setQuest, assignTo, setSpar, equipItem, unequipSlot, setPolicy, provision, buyMaterial, sellItem, hire, takeApprentice, promoteApprentice, dismissApprentice, advanceAll, back, openRoom, toggleFullscreen, upgradeFacility, enterTournament, leaveTournament, setPlayNext, setPlayQuest, setAskTournaments, appointTrainer, practiceBout, openRanch, enterRoomFromRanch, manageMemberFromRanch, ranchBuild: toggleBuild, ranchPick: pickStation, ranchPlace: placeStationAt, ranchRemoveStation: removeStationById };
window.__guild = {};
for (const k in __guildApi) {
  window.__guild[k] = (...args) => {
    if (advancing && k !== 'toggleFullscreen') return; // mid-battle/mid-week: guild mutations wait
    return __guildApi[k](...args);
  };
}
window.openGuild = openGuild;
