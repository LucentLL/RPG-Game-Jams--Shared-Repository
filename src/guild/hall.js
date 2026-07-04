// Guild Hall — weekly management for the Heroes Guild (v1: one hero).
//
// The first Monster-Rancher-style loop: each week you assign a training regimen
// and a diet, advance the week, and watch the hero's stats grow while stamina
// and fatigue shift (train too hard without feeding/resting and training stops
// paying off). Built on the guild domain models in this folder; renders into
// #guildScreen (index.html) and persists via platform/storage.
//
// Deliberately structured to scale: guild.roster is already an array, so
// multi-hero management, parties, and guild inventory layer on top of this
// without reshaping the data.

import { createGuild } from './guild.js';
import { HERO_STATS, heroPower } from './hero.js';
import { generateRecruit } from './recruiting.js';
import { TRAINING_REGIMENS, getRegimen, applyTraining } from './training.js';
import { DIET_PLANS, getDietPlan, applyDiet } from './diet.js';
import { advanceWeek, formatDate } from './calendar.js';
import { weeklyUpkeep, addGold } from './economy.js';
import { saveGame, loadGame } from '../platform/storage.js';

const SLOT = 'guild';
const ARCH_GLYPH = { Knight: '⚔', Mage: '✦', Ranger: '🏹', Cleric: '☩', Rogue: '🗡', Berserker: '🪓', Adventurer: '☉' };

let guild = null;
let sel = { trainingId: 'drill_str', dietId: 'balanced' };
let report = null; // last week's outcome, for the recap panel

function heroOf() { return guild.roster[0]; }
function save() { saveGame(SLOT, guild); }

function load() {
  const saved = loadGame(SLOT);
  if (saved && Array.isArray(saved.roster) && saved.roster.length) {
    guild = saved;
    if (heroOf().dietPlanId) sel.dietId = heroOf().dietPlanId;
  } else {
    guild = createGuild({ name: 'The Wandering Blade' });
    const hero = generateRecruit();
    hero.dietPlanId = sel.dietId;
    guild.roster.push(hero);
    save();
  }
}

// --- weekly loop ------------------------------------------------------------
function advance() {
  const h = heroOf();
  const regimen = getRegimen(sel.trainingId);
  const diet = getDietPlan(sel.dietId);
  h.dietPlanId = sel.dietId;

  const condBefore = { stamina: h.condition.stamina, fatigue: h.condition.fatigue, morale: h.condition.morale };

  const upkeep = weeklyUpkeep(guild, getDietPlan);
  addGold(guild, -upkeep);

  const { gains } = applyTraining(h, regimen, diet.statBias); // stat growth (diet biases it)
  applyDiet(h, diet);                                         // stamina/fatigue recovery

  // Light morale dynamics: rest & lavish food lift spirits; grinding wears them down.
  let dm = regimen.intensity === 0 ? 6 : -regimen.intensity;
  if (diet.id === 'feast') dm += 4;
  h.condition.morale = clamp(h.condition.morale + dm);

  h.age += 1;
  advanceWeek(guild.calendar);

  report = {
    regimen, diet, gains, upkeep,
    trained: Object.keys(gains).length > 0,
    staminaDelta: h.condition.stamina - condBefore.stamina,
    fatigueDelta: h.condition.fatigue - condBefore.fatigue,
    moraleDelta: h.condition.morale - condBefore.morale,
  };
  save();
  render();
}

function selectTraining(id) { sel.trainingId = id; render(); }
function selectDiet(id) { sel.dietId = id; render(); }
function back() { showScreen('titleScreen'); }

// --- helpers ----------------------------------------------------------------
function clamp(n) { return Math.max(0, Math.min(100, Math.round(n))); }

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function fmtDelta(n) {
  n = Math.round(n);
  if (n > 0) return `<span class="up">+${n}</span>`;
  if (n < 0) return `<span class="down">${n}</span>`;
  return `${n}`;
}

function bar(label, value, color) {
  const v = clamp(value);
  return `<div class="cond-row">
      <div class="lbl"><span>${label}</span><span>${v}</span></div>
      <div class="cond-track"><div class="cond-fill" style="width:${v}%;background:${color}"></div></div>
    </div>`;
}

// --- render -----------------------------------------------------------------
function render() {
  const h = heroOf();

  const stats = HERO_STATS.map((s) => {
    const d = report && report.gains && report.gains[s] ? `+${report.gains[s]}` : '';
    return `<div class="stat-cell"><div class="k">${s}</div><div class="v">${h.stats[s]}</div><div class="d">${d}</div></div>`;
  }).join('');

  const training = TRAINING_REGIMENS.map((r) => {
    const focus = r.focus.length ? r.focus.join('/') : 'recover';
    const cost = r.staminaCost ? `−${r.staminaCost} sta` : 'restful';
    return `<button class="opt ${r.id === sel.trainingId ? 'active' : ''}" onclick="__guild.selectTraining('${r.id}')">
        <span><span class="o-name">${r.name}</span> <span class="o-desc">${focus}</span></span>
        <span class="o-cost">${cost}</span>
      </button>`;
  }).join('');

  const diet = DIET_PLANS.map((d) => {
    return `<button class="opt ${d.id === sel.dietId ? 'active' : ''}" onclick="__guild.selectDiet('${d.id}')">
        <span><span class="o-name">${d.name}</span> <span class="o-desc">${d.description}</span></span>
        <span class="o-cost">${d.weeklyCost}g/wk</span>
      </button>`;
  }).join('');

  let recap = '';
  if (report) {
    const gainStr = report.trained
      ? HERO_STATS.filter((s) => report.gains[s]).map((s) => `<span class="up">${s} +${report.gains[s]}</span>`).join(' · ')
      : '<span class="down">too fatigued to train effectively — rest or feed better</span>';
    recap = `<div class="week-report">
        <h4>Last week · ${report.regimen.name} + ${report.diet.name}</h4>
        <div class="r-line">${gainStr}</div>
        <div class="r-line">stamina ${fmtDelta(report.staminaDelta)} · fatigue ${fmtDelta(report.fatigueDelta)} · morale ${fmtDelta(report.moraleDelta)} · upkeep <span class="down">−${report.upkeep}g</span></div>
      </div>`;
  }

  const glyph = ARCH_GLYPH[h.archetype] || '☉';

  document.getElementById('guildScreen').innerHTML = `
    <div class="guild-wrap">
      <div class="guild-topbar">
        <div class="guild-name">☙ ${guild.name}</div>
        <div class="guild-meta"><span>☉ <b>${guild.gold}</b>g</span><span>${formatDate(guild.calendar)}</span></div>
        <button class="guild-back" onclick="__guild.back()">↩ title</button>
      </div>

      <div class="hero-card">
        <div class="hero-top">
          <div class="hero-portrait">${glyph}</div>
          <div class="hero-id">
            <div class="hero-name">${h.name}</div>
            <div class="hero-sub">${h.archetype} · Lv ${h.level} · ${h.age} wks</div>
            <div class="hero-power">⚡ ${heroPower(h)} power</div>
          </div>
        </div>
        <div class="stat-grid">${stats}</div>
        ${bar('Stamina', h.condition.stamina, 'var(--success)')}
        ${bar('Fatigue', h.condition.fatigue, '#e08a3c')}
        ${bar('Morale', h.condition.morale, '#8ab4d8')}
      </div>

      <div class="plan-card">
        <div class="plan-title">⚔ Training this week</div>
        <div class="opt-list">${training}</div>
        <div class="plan-title">🍖 Diet this week</div>
        <div class="opt-list">${diet}</div>
        <button class="advance-btn" onclick="__guild.advance()">▶ ADVANCE WEEK</button>
      </div>

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
window.__guild = { selectTraining, selectDiet, advance, back };
