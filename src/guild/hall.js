// Guild Hall — weekly management for the Heroes Guild.
//
// Each hero gets a weekly assignment: TRAIN a stat, or WORK the FORGE (consume
// materials to make a real weapon that lands in the armory), plus a diet. Advance
// Week resolves the whole roster. You hire from the tavern and equip heroes from
// the armory — by hand, or via the QUARTERMASTER policy that auto-issues the best
// available gear to the strongest heroes ("by rank") before they march. Equipped
// quality feeds combatPower, so a well-forged armory measurably wins quests.
// Consumables/provisioning (an Alchemist's potions a party withdraws) come next.

import { createGuild } from './guild.js';
import { HERO_STATS, heroPower, STAT_CAP } from './hero.js';
import { generateRecruit, hireCost, rollRecruitPool } from './recruiting.js';
import { DRILLS, REST, getDrill, applyTraining } from './training.js';
import { DIET_PLANS, getDietPlan, applyDiet } from './diet.js';
import { advanceWeek, formatDate } from './calendar.js';
import { weeklyUpkeep, addGold, guildIncome } from './economy.js';
import { RECIPES, getRecipe, previewQuality, forge, study, recipeUnlocked } from './smithing.js';
import { POTION_RECIPES, getPotionRecipe, previewPotency, brew, potionUnlocked, applyPotion } from './alchemy.js';
import { MATERIALS, createInventory, armoryItems, findItem, addMaterial, gearBonus, EQUIP_SLOTS, findPotion, consumePotion, potionCount } from './inventory.js';
import { generateQuestBoard, resolveQuest } from './quests.js';
import { roleFor } from './roles.js';
import { qualityTier } from './item.js';
import { MATERIAL_PRICE, buyPrice, itemSellValue, createMarket, refreshMarket } from './market.js';
import { saveGame, loadGame } from '../platform/storage.js';

const SLOT = 'guild';
const MAX_ROSTER = 6;
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

// The guild hall's rooms, in the sketch's row-major order. `tag` = work vs storage vs
// living; `locked` rooms are stubbed until their system (the Alchemist) is built.
const ROOMS = [
  { id: 'roster', glyph: '🛡', name: 'Roster', tag: 'MEMBERS' },
  { id: 'forge', glyph: '🔨', name: 'Forge', tag: 'WORK' },
  { id: 'kitchen', glyph: '🍲', name: 'Kitchen', tag: 'WORK' },
  { id: 'apothecary', glyph: '🏺', name: 'Apothecary', tag: 'STORAGE' },
  { id: 'library', glyph: '📖', name: 'Library', tag: 'WORK' },
  { id: 'armory', glyph: '🗡', name: 'Armory', tag: 'STORAGE' },
  { id: 'laboratory', glyph: '⚗', name: 'Laboratory', tag: 'WORK' },
  { id: 'quarters', glyph: '🍺', name: 'Quarters', tag: 'LIVING' },
];
function getRoom(id) { return ROOMS.find((r) => r.id === id) || null; }

function save() { saveGame(SLOT, guild); }
function heroById(id) { return guild.roster.find((h) => h.id === id); }
function clamp(n) { return Math.max(0, Math.min(100, Math.round(n))); }

/** Field power = trained stats + whatever gear the hero is carrying. Used for quest
 *  odds, resolution, and the displayed ⚡ so equipping visibly makes a hero stronger. */
function combatPower(h) { return heroPower(h) + gearBonus(guild.inventory, h); }

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
    trainingId: getDrill(a.trainingId) ? a.trainingId : (DRILL_MIGRATE[a.trainingId] || 'pow'),
    intensity: a.intensity === 'heavy' ? 'heavy' : 'light',
    recipeId: getRecipe(a.recipeId) ? a.recipeId : 'iron_sword',
    potionId: getPotionRecipe(a.potionId) ? a.potionId : 'minor_heal',
    discipline: a.discipline === 'alchemy' ? 'alchemy' : 'blacksmithing',
    questId: a.questId || null,
    dietId: getDietPlan(a.dietId) ? a.dietId : (getDietPlan(h.dietPlanId) ? h.dietPlanId : 'balanced'),
  };
  if (!h.dietPlanId) h.dietPlanId = h.assignment.dietId;
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
function setTraining(id) { const h = heroById(selectedId); if (h) { h.assignment.trainingId = id; h.assignment.type = 'train'; h.assignment.questId = null; save(); render(); } }
function setIntensity(level) { const h = heroById(selectedId); if (h) { h.assignment.intensity = level === 'heavy' ? 'heavy' : 'light'; h.assignment.type = 'train'; h.assignment.questId = null; save(); render(); } }
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
  if (guild.roster.length >= MAX_ROSTER) { notice = `Roster is full (${MAX_ROSTER}).`; render(); return; }
  const i = guild.recruits.findIndex((r) => r.id === id); if (i < 0) return;
  const r = guild.recruits[i]; const cost = hireCost(r);
  if (guild.gold < cost) { notice = `Not enough gold to hire ${r.name} (${cost}g).`; render(); return; }
  addGold(guild, -cost); migrateHero(r); ensureAssignment(r); guild.roster.push(r); guild.recruits.splice(i, 1);
  selectedId = r.id; notice = `${r.name} joined the guild.`;
  save(); render();
}

function advanceAll() {
  const income = guildIncome(guild);            // patron retainer (stopgap until quest income)
  addGold(guild, income);
  const upkeep = weeklyUpkeep(guild, getDietPlan);
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
    const outcome = (quest && marchers.length) ? resolveQuest(quest, marchers, combatPower) : null;
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
      const res = applyTraining(h, 'rest', 'light', diet.statBias);
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
        entry.quest = { title: plan.quest.title, success, party: plan.partySize };
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
    } else {
      const res = applyTraining(h, a.trainingId, a.intensity, diet.statBias);
      entry.drill = (getDrill(a.trainingId) || REST).name;
      entry.gains = res.gains; entry.drops = res.drops;
      entry.rested = res.rested; entry.injured = res.injured; entry.injury = res.injury;
      entry.trained = Object.keys(res.gains).length > 0;
    }

    if (!onExpedition) applyDiet(h, diet); // only heroes who actually marched out skip guild rest
    // Training/rest morale is applied inside applyTraining; forge/study take a small dip; quests set questMorale.
    let dm = questMorale != null ? questMorale : (a.type === 'forge' || a.type === 'study' || a.type === 'brew' ? -1 : 0);
    if (diet.id === 'feast') dm += 4;
    h.condition.morale = clamp(h.condition.morale + dm);
    h.age += 1;
    entry.sta = h.condition.stamina - cb.stamina; entry.fat = h.condition.fatigue - cb.fatigue;
    results.push(entry);
  }
  if (shortfall > 0) guild.roster.forEach((h) => { h.condition.morale = clamp(h.condition.morale - 8); }); // unpaid wages hurt morale
  advanceWeek(guild.calendar);
  refreshMarket(guild.market);
  guild.questBoard = generateQuestBoard(guild, 3);
  guild.recruits = rollRecruitPool(3);
  report = { income, upkeep, shortfall, results, issued };
  notice = '';
  currentRoom = 'hub'; // land on the hub so the weekly recap is always seen
  save(); render();
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
function bar(label, value, color) {
  const v = clamp(value);
  return `<div class="cond-row"><div class="lbl"><span>${label}</span><span>${v}</span></div>
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
    : `⚔ ${(getDrill(a.trainingId) || REST).name}${a.intensity === 'heavy' ? ' (H)' : ''}`;
  return `<button class="roster-row ${h.id === selectedId ? 'sel' : ''}" onclick="__guild.selectHero('${h.id}')">
      <span class="rr-portrait">${personSprite(h, 44)}</span>
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
  return `<div class="hero-switch">${guild.roster.map((h) => `<button class="hs-chip ${h.id === selectedId ? 'sel' : ''}" title="${h.name}" onclick="__guild.selectHero('${h.id}')">${personSprite(h, 38)}</button>`).join('')}</div>`;
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
  return `<div class="assign-head"><span class="rr-portrait">${personSprite(h, 46)}</span> <b>${h.name}</b> · ${h.archetype} Lv${h.level} · ${h.age} wks · ⚡${combatPower(h)}</div>
      <div class="stat-grid">${stats}</div>
      ${bar('Stamina', h.condition.stamina, 'var(--success)')}${bar('Fatigue', h.condition.fatigue, '#e08a3c')}${bar('Stress', h.condition.stress || 0, '#c05a8a')}${bar('Morale', h.condition.morale, '#8ab4d8')}
      ${h.condition.injury ? '<div class="injury-flag">⚠ Injured — will only recover (rest) until healed</div>' : ''}
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
  return `<div class="intensity-toggle">
      <button class="${heavy ? '' : 'on'}" onclick="__guild.setIntensity('light')">Light</button>
      <button class="${heavy ? 'on' : ''}" onclick="__guild.setIntensity('heavy')">Heavy · +sec −paired</button>
    </div><div class="opt-list">${drillItems}${restItem}</div>`;
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
  return `<div class="opt-list">${list}</div>`;
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
  if (!report) return '';
  const lines = report.results.map((r) => {
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
    if (r.type === 'quest') {
      if (r.quest && r.quest.noQuest) return `<div class="r-line"><b>${r.name}</b> <span class="down">had no quest assigned</span></div>`;
      if (r.quest && r.quest.tooTired) return `<div class="r-line"><b>${r.name}</b> <span class="down">too exhausted to set out — rest first</span></div>`;
      if (r.quest && r.quest.success) {
        const party = r.quest.party > 1 ? ` <span class="dim">(party of ${r.quest.party})</span>` : '';
        if (r.reward) {
          const loot = r.reward.loot ? ` +1 ${MATERIALS[r.reward.loot].name}` : '';
          return `<div class="r-line"><b>${r.name}</b> completed <span class="up">${r.quest.title}</span> — <span class="up">+${r.reward.gold}g · +${r.reward.rep} rep${loot}</span> <span class="dim">· Field +${r.field}</span>${party}</div>`;
        }
        return `<div class="r-line"><b>${r.name}</b> joined <span class="up">${r.quest.title}</span> <span class="dim">· Field +${r.field}</span>${party}</div>`;
      }
      return `<div class="r-line"><b>${r.name}</b> <span class="down">failed ${r.quest ? r.quest.title : 'a quest'}</span></div>`;
    }
    if (r.rested) return `<div class="r-line"><b>${r.name}</b> rested <span class="dim">— fat ${fmtDelta(r.fat)}${r.injury ? ', still hurt' : ''}</span></div>`;
    if (r.injured) return `<div class="r-line"><b>${r.name}</b> <span class="down">injured — recovering</span> <span class="dim">(fat ${fmtDelta(r.fat)})</span></div>`;
    const ups = HERO_STATS.filter((s) => r.gains && r.gains[s]).map((s) => `<span class="up">${s}+${r.gains[s]}</span>`);
    const downs = HERO_STATS.filter((s) => r.drops && r.drops[s]).map((s) => `<span class="down">${s}−${r.drops[s]}</span>`);
    const body = ups.concat(downs).join(' ') || '<span class="down">no gain — too worn down</span>';
    return `<div class="r-line"><b>${r.name}</b> · ${body}${r.injury ? ' <span class="down">⚠ strained!</span>' : ''} <span class="dim">(fat ${fmtDelta(r.fat)})</span></div>`;
  }).join('');
  const qm = report.issued ? `<div class="r-line dim">🎽 quartermaster issued ${report.issued} item(s) from stores</div>` : '';
  return `<div class="week-report"><h4>Last week</h4>${lines}${qm}<div class="r-line">income <span class="up">+${report.income}g</span> · upkeep <span class="down">−${report.upkeep}g</span>${report.shortfall ? ' · <span class="down">insolvent — morale −8 all</span>' : ''}</div></div>`;
}

function recruitCard(r) {
  const cost = hireCost(r);
  const afford = guild.gold >= cost && guild.roster.length < MAX_ROSTER;
  return `<div class="recruit-card">
      <span class="rr-portrait rc-portrait">${personSprite(r, 56)}</span>
      <span class="rc-info"><b>${r.name}</b><span class="rr-sub">${ARCH_GLYPH[r.archetype] || '☉'} ${r.archetype} · Σ${statTotal(r)} · ⚡${heroPower(r)}</span></span>
      <button class="rc-hire ${afford ? '' : 'disabled'}" onclick="__guild.hire('${r.id}')">Hire · ${cost}g</button>
    </div>`;
}

// --- rooms ------------------------------------------------------------------
/** A short status line per room, shown on hub tiles and rail chips. */
function roomStatus(id) {
  const r = guild.roster;
  switch (id) {
    case 'roster': return `${r.length} member${r.length === 1 ? '' : 's'}`;
    case 'forge': { const n = r.filter((h) => h.assignment.type === 'forge').length; return n ? `${n} forging` : 'idle'; }
    case 'library': { const n = r.filter((h) => h.assignment.type === 'study').length; return n ? `${n} studying` : 'idle'; }
    case 'kitchen': return 'set diets';
    case 'armory': { const n = guild.inventory.items.length; return `${n} item${n === 1 ? '' : 's'}`; }
    case 'quarters': return `${guild.recruits.length} for hire`;
    case 'laboratory': { const n = r.filter((h) => h.assignment.type === 'brew').length; return n ? `${n} brewing` : 'idle'; }
    case 'apothecary': { const n = potionCount(guild.inventory); return `${n} potion${n === 1 ? '' : 's'}`; }
    default: return '';
  }
}

function rosterRoom() {
  const h = heroById(selectedId);
  const list = `<div class="plan-card"><div class="plan-title">🛡 Roster · ${guild.roster.length}/${MAX_ROSTER}</div>
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

/** Shared shell for the single-member work rooms (Forge / Kitchen / Library). */
function workRoom(title, body, headline) {
  const h = heroById(selectedId);
  if (!h) return `<div class="plan-card"><div class="hint">Hire a member in the Quarters, then assign them here.</div></div>`;
  return `<div class="plan-card">
      ${heroSwitcher()}
      ${headline || ''}
      <div class="plan-title">${title}</div>
      ${body(h)}
    </div>`;
}

function forgeRoom() {
  const forging = guild.roster.filter((x) => x.assignment.type === 'forge').map((x) => x.name.split(' ')[0]);
  const head = `<div class="room-jobline">${forging.length ? '🔨 ' + forging.join(', ') + ' at the forge' : 'No one is forging this week.'}</div>`;
  const h = heroById(selectedId);
  return workRoom(h ? `🔨 ${h.name} — Forge` : '🔨 Forge', forgeBody, head);
}
function libraryRoom() {
  const studying = guild.roster.filter((x) => x.assignment.type === 'study').map((x) => x.name.split(' ')[0]);
  const head = `<div class="room-jobline">${studying.length ? '📖 ' + studying.join(', ') + ' studying' : 'No one is studying this week.'}</div>`;
  const h = heroById(selectedId);
  return workRoom(h ? `📖 ${h.name} — Library` : '📖 Library', studyBody, head);
}
function kitchenRoom() {
  const h = heroById(selectedId);
  const head = h ? `<div class="room-jobline">🍖 Now feeding <b>${getDietPlan(h.assignment.dietId).name}</b></div>` : '';
  return workRoom(h ? `🍲 ${h.name} — Diet` : '🍲 Kitchen', dietBody, head);
}
function laboratoryRoom() {
  const brewing = guild.roster.filter((x) => x.assignment.type === 'brew').map((x) => x.name.split(' ')[0]);
  const head = `<div class="room-jobline">${brewing.length ? '⚗ ' + brewing.join(', ') + ' brewing' : 'No one is brewing this week.'}</div>`;
  const h = heroById(selectedId);
  return workRoom(h ? `⚗ ${h.name} — Laboratory` : '⚗ Laboratory', brewBody, head);
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
      ${h.condition.injury ? '<div class="injury-flag">⚠ Injured — a Healing or Greater draught can cure it</div>' : ''}
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
function quartersRoom() {
  return `<div class="plan-card">
      <div class="plan-title">🍺 Tavern · Recruits · roster ${guild.roster.length}/${MAX_ROSTER}</div>
      <div class="recruit-list">${guild.recruits.map(recruitCard).join('')}</div>
      ${guild.roster.length >= MAX_ROSTER ? '<div class="hint">Roster is full — dismiss a member or expand your quarters later.</div>' : ''}
    </div>`;
}
function roomStub(room) {
  return `<div class="plan-card room-soon">
      <div class="room-soon-glyph">${room.glyph}</div>
      <div class="plan-title">${room.name}</div>
      <div class="hint">${room.soon || 'Coming soon.'}</div>
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
function renderHub() {
  return `${recapPanel()}
    <div class="hub-head">☙ <b>${guild.name}</b> — choose a room</div>
    <div class="room-hub">${ROOMS.map(roomTile).join('')}</div>`;
}

function renderRoom(id) {
  const room = getRoom(id);
  if (id === 'hub' || !room) return renderHub();
  const hdr = roleTag(id); // every room announces its role
  if (room.locked) return hdr + roomStub(room);
  switch (id) {
    case 'roster': return hdr + rosterRoom();
    case 'forge': return hdr + forgeRoom();
    case 'kitchen': return hdr + kitchenRoom();
    case 'library': return hdr + libraryRoom();
    case 'laboratory': return hdr + laboratoryRoom();
    case 'apothecary': return hdr + apothecaryRoom();
    case 'armory': return hdr + armoryRoom();
    case 'quarters': return hdr + quartersRoom();
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
    <button class="room-chip hub-chip ${currentRoom === 'hub' ? 'on' : ''}" onclick="__guild.openRoom('hub')"><span class="rc-glyph">🏰</span><span class="rc-body"><span class="rc-name">Hub</span></span></button>
    <div class="rail-rooms">${ROOMS.map(roomChip).join('')}</div>
    <button class="advance-btn rail-advance" onclick="__guild.advanceAll()">▶ ADVANCE WEEK <span class="ra-cost">−${upkeep}g</span></button>`;
}

// --- render -----------------------------------------------------------------
function render() {
  document.getElementById('guildScreen').innerHTML = `
    <div class="guild-hall">
      <aside class="room-rail">${railHTML()}</aside>
      <main class="room-stage">
        ${notice ? `<div class="notice">${notice}</div>` : ''}
        ${renderRoom(currentRoom)}
      </main>
    </div>`;
  paintSprites(); // canvases exist now — draw the Elements sprites into them
}

// --- room / fullscreen controls ---------------------------------------------
function openRoom(id) {
  currentRoom = id;
  notice = '';
  if (!selectedId && guild.roster[0]) selectedId = guild.roster[0].id; // work rooms key off a subject
  render();
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
  render();
  showScreen('guildScreen');
}

window.__guild = { selectHero, setActivity, setTraining, setIntensity, setRecipe, setPotion, setDiscipline, usePotion, setDiet, setQuest, equipItem, unequipSlot, setPolicy, provision, buyMaterial, sellItem, hire, advanceAll, back, openRoom, toggleFullscreen };
window.openGuild = openGuild;
