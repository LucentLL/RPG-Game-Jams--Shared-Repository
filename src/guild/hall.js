// Guild Hall — weekly management for the Heroes Guild.
//
// The Monster-Rancher-style loop, now for a WHOLE ROSTER: each hero carries a
// per-week assignment (a training regimen + a diet). You tap a hero to set their
// plan, hire new heroes from the tavern's recruit pool, then Advance Week to
// resolve everyone at once — stats grow (diet-biased), stamina/fatigue/morale
// shift, and weekly upkeep is charged. Persists via platform/storage.
//
// Next layers slot in cleanly on top of this: parties/quests, and guild
// inventory (food supply, smithing materials, armory).

import { createGuild } from './guild.js';
import { HERO_STATS, heroPower, STAT_CAP } from './hero.js';
import { generateRecruit, hireCost, rollRecruitPool } from './recruiting.js';
import { TRAINING_REGIMENS, getRegimen, applyTraining } from './training.js';
import { DIET_PLANS, getDietPlan, applyDiet } from './diet.js';
import { advanceWeek, formatDate } from './calendar.js';
import { weeklyUpkeep, addGold } from './economy.js';
import { saveGame, loadGame } from '../platform/storage.js';

const SLOT = 'guild';
const MAX_ROSTER = 6;
const ARCH_GLYPH = { Knight: '⚔', Mage: '✦', Ranger: '🏹', Cleric: '☩', Rogue: '🗡', Berserker: '🪓', Adventurer: '☉' };

let guild = null;
let selectedId = null; // hero whose assignment panel is open
let report = null;     // last week's per-hero results
let notice = '';       // transient message (hire result / warnings)

function save() { saveGame(SLOT, guild); }
function heroById(id) { return guild.roster.find((h) => h.id === id); }
function clamp(n) { return Math.max(0, Math.min(100, Math.round(n))); }

function ensureAssignment(h) {
  const validTraining = getRegimen(h.assignment && h.assignment.trainingId);
  if (!h.assignment || !validTraining) h.assignment = { trainingId: 'drill_pow', dietId: (h.dietPlanId) || 'balanced' };
  if (!h.dietPlanId) h.dietPlanId = h.assignment.dietId;
}

// Migrate heroes saved under the old D&D stat block (STR/DEX/…) to the new
// Monster-Rancher stats (POW/DEF/…), scaling values up so trained progress carries over.
function migrateHero(h) {
  if (h && h.stats && h.stats.POW === undefined) {
    const o = h.stats;
    const up = (v) => Math.min(STAT_CAP, Math.round((v || 10) * 2.5));
    h.stats = {
      POW: up(o.STR), DEF: up(o.CHA ?? o.CON), SKL: up(o.WIS ?? o.DEX),
      SPD: up(o.DEX), INT: up(o.INT), VIT: up(o.CON),
    };
  }
  if (!h || !h.growth || h.growth.POW === undefined) {
    if (h) { h.growth = {}; HERO_STATS.forEach((s) => { h.growth[s] = 2; }); }
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
  guild.roster.forEach((h) => { migrateHero(h); ensureAssignment(h); });
  const staleRecruits = guild.recruits && guild.recruits[0] && guild.recruits[0].stats && guild.recruits[0].stats.POW === undefined;
  if (!Array.isArray(guild.recruits) || !guild.recruits.length || staleRecruits) guild.recruits = rollRecruitPool(3);
  if (!selectedId && guild.roster[0]) selectedId = guild.roster[0].id;
  save();
}

// --- interactions -----------------------------------------------------------
function selectHero(id) { selectedId = id; notice = ''; render(); }

function setTraining(id) { const h = heroById(selectedId); if (h) { h.assignment.trainingId = id; save(); render(); } }
function setDiet(id) { const h = heroById(selectedId); if (h) { h.assignment.dietId = id; h.dietPlanId = id; save(); render(); } }

function hire(id) {
  if (guild.roster.length >= MAX_ROSTER) { notice = `Roster is full (${MAX_ROSTER}). Cannot hire more.`; render(); return; }
  const i = guild.recruits.findIndex((r) => r.id === id);
  if (i < 0) return;
  const r = guild.recruits[i];
  const cost = hireCost(r);
  if (guild.gold < cost) { notice = `Not enough gold to hire ${r.name} (${cost}g).`; render(); return; }
  addGold(guild, -cost);
  ensureAssignment(r);
  guild.roster.push(r);
  guild.recruits.splice(i, 1);
  selectedId = r.id;
  notice = `${r.name} joined the guild.`;
  save(); render();
}

function advanceAll() {
  const upkeep = weeklyUpkeep(guild, getDietPlan);
  addGold(guild, -upkeep);
  const results = [];
  for (const h of guild.roster) {
    const a = h.assignment;
    const regimen = getRegimen(a.trainingId);
    const diet = getDietPlan(a.dietId);
    h.dietPlanId = a.dietId;
    const cb = { stamina: h.condition.stamina, fatigue: h.condition.fatigue, morale: h.condition.morale };
    const { gains } = applyTraining(h, regimen, diet.statBias); // stat growth
    applyDiet(h, diet);                                         // recovery
    let dm = regimen.intensity === 0 ? 6 : -regimen.intensity;
    if (diet.id === 'feast') dm += 4;
    h.condition.morale = clamp(h.condition.morale + dm);
    h.age += 1;
    results.push({
      name: h.name, regimen: regimen.name, diet: diet.name, gains,
      trained: Object.keys(gains).length > 0,
      sta: h.condition.stamina - cb.stamina, fat: h.condition.fatigue - cb.fatigue,
    });
  }
  advanceWeek(guild.calendar);
  guild.recruits = rollRecruitPool(3); // fresh faces at the tavern
  report = { upkeep, results };
  notice = '';
  save(); render();
}

function back() { showScreen('titleScreen'); }

// --- view helpers -----------------------------------------------------------
function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function fmtDelta(n) { n = Math.round(n); if (n > 0) return `<span class="up">+${n}</span>`; if (n < 0) return `<span class="down">${n}</span>`; return `${n}`; }
function glyphOf(h) { return ARCH_GLYPH[h.archetype] || '☉'; }
function statTotal(h) { return HERO_STATS.reduce((s, k) => s + (h.stats[k] || 0), 0); }

function bar(label, value, color) {
  const v = clamp(value);
  return `<div class="cond-row"><div class="lbl"><span>${label}</span><span>${v}</span></div>
    <div class="cond-track"><div class="cond-fill" style="width:${v}%;background:${color}"></div></div></div>`;
}
function mini(value, color) { return `<span class="mini"><span class="mini-fill" style="width:${clamp(value)}%;background:${color}"></span></span>`; }

function rosterRow(h) {
  const reg = getRegimen(h.assignment.trainingId);
  const diet = getDietPlan(h.assignment.dietId);
  return `<button class="roster-row ${h.id === selectedId ? 'sel' : ''}" onclick="__guild.selectHero('${h.id}')">
      <span class="rr-portrait">${glyphOf(h)}</span>
      <span class="rr-main">
        <span class="rr-name">${h.name} <span class="rr-sub">${h.archetype} Lv${h.level}</span></span>
        <span class="rr-assign">⚔ ${reg.name} · 🍖 ${diet.name}</span>
        <span class="rr-cond">sta ${mini(h.condition.stamina, 'var(--success)')} fat ${mini(h.condition.fatigue, '#e08a3c')}</span>
      </span>
      <span class="rr-power">⚡${heroPower(h)}</span>
    </button>`;
}

function assignPanel() {
  const h = heroById(selectedId);
  if (!h) return '<div class="plan-card"><div class="hint">Tap a hero above to plan their week.</div></div>';

  const rep = report && report.results ? report.results.find((r) => r.name === h.name) : null;
  const stats = HERO_STATS.map((s) => {
    const val = h.stats[s] || 0;
    const g = rep && rep.gains && rep.gains[s] ? rep.gains[s] : 0;
    const pct = Math.round((val / STAT_CAP) * 100);
    return `<div class="stat-cell">
        <div class="k">${s}</div>
        <div class="v">${val}<span class="cap">/${STAT_CAP}</span></div>
        <div class="statbar"><span style="width:${pct}%"></span></div>
        <div class="d">${g ? '+' + g : ''}</div>
      </div>`;
  }).join('');

  const training = TRAINING_REGIMENS.map((r) => {
    const focus = r.focus.length ? r.focus.join('/') : 'recover';
    const cost = r.staminaCost ? `−${r.staminaCost} sta` : 'restful';
    return `<button class="opt ${r.id === h.assignment.trainingId ? 'active' : ''}" onclick="__guild.setTraining('${r.id}')">
        <span><span class="o-name">${r.name}</span> <span class="o-desc">${focus}</span></span><span class="o-cost">${cost}</span></button>`;
  }).join('');

  const diet = DIET_PLANS.map((d) => `<button class="opt ${d.id === h.assignment.dietId ? 'active' : ''}" onclick="__guild.setDiet('${d.id}')">
      <span><span class="o-name">${d.name}</span> <span class="o-desc">${d.description}</span></span><span class="o-cost">${d.weeklyCost}g/wk</span></button>`).join('');

  return `<div class="plan-card">
      <div class="assign-head"><span class="rr-portrait sm">${glyphOf(h)}</span> Planning <b>${h.name}</b> · ${h.archetype} Lv${h.level} · ${h.age} wks · ⚡${heroPower(h)}</div>
      <div class="stat-grid">${stats}</div>
      ${bar('Stamina', h.condition.stamina, 'var(--success)')}
      ${bar('Fatigue', h.condition.fatigue, '#e08a3c')}
      ${bar('Morale', h.condition.morale, '#8ab4d8')}
      <div class="plan-title">⚔ Training</div><div class="opt-list">${training}</div>
      <div class="plan-title">🍖 Diet</div><div class="opt-list">${diet}</div>
    </div>`;
}

function recruitCard(r) {
  const cost = hireCost(r);
  const afford = guild.gold >= cost && guild.roster.length < MAX_ROSTER;
  return `<div class="recruit-card">
      <span class="rr-portrait sm">${glyphOf(r)}</span>
      <span class="rc-info"><b>${r.name}</b><span class="rr-sub">${r.archetype} · Σ${statTotal(r)} · ⚡${heroPower(r)}</span></span>
      <button class="rc-hire ${afford ? '' : 'disabled'}" onclick="__guild.hire('${r.id}')">Hire · ${cost}g</button>
    </div>`;
}

// --- render -----------------------------------------------------------------
function render() {
  const upkeep = weeklyUpkeep(guild, getDietPlan);

  const recap = report ? `<div class="week-report">
      <h4>Last week</h4>
      ${report.results.map((r) => {
        const g = r.trained ? HERO_STATS.filter((s) => r.gains[s]).map((s) => `${s}+${r.gains[s]}`).join(' ') : 'no gain — too fatigued';
        return `<div class="r-line"><b>${r.name}</b> · <span class="${r.trained ? 'up' : 'down'}">${g}</span> <span class="dim">(sta ${fmtDelta(r.sta)}, fat ${fmtDelta(r.fat)})</span></div>`;
      }).join('')}
      <div class="r-line">upkeep <span class="down">−${report.upkeep}g</span></div>
    </div>` : '';

  document.getElementById('guildScreen').innerHTML = `
    <div class="guild-wrap">
      <div class="guild-topbar">
        <div class="guild-name">☙ ${guild.name}</div>
        <div class="guild-meta"><span>☉ <b>${guild.gold}</b>g</span><span>${formatDate(guild.calendar)}</span></div>
        <button class="guild-back" onclick="__guild.back()">↩ title</button>
      </div>

      ${notice ? `<div class="notice">${notice}</div>` : ''}

      <div class="hero-card">
        <div class="plan-title">Roster · ${guild.roster.length}/${MAX_ROSTER}</div>
        <div class="roster-list">${guild.roster.map(rosterRow).join('')}</div>
      </div>

      ${assignPanel()}

      <div class="plan-card">
        <div class="plan-title">🍺 Tavern · Recruits</div>
        <div class="recruit-list">${guild.recruits.map(recruitCard).join('')}</div>
      </div>

      <button class="advance-btn" onclick="__guild.advanceAll()">▶ ADVANCE WEEK · −${upkeep}g upkeep</button>

      ${recap}
    </div>`;
}

// --- entry ------------------------------------------------------------------
export function openGuild() {
  if (!guild) load();
  render();
  showScreen('guildScreen');
}

window.openGuild = openGuild;
window.__guild = { selectHero, setTraining, setDiet, hire, advanceAll, back };
