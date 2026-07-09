# The Crucible — Heroes Guild: Design Vision

> Living design doc. Source: the player-owner's expanded vision (2026-07). Captures
> the target game so we build toward it incrementally. `ARCHITECTURE.md` covers the
> engineering; this covers the *what and why*.

## The pitch

You run a heroes' guild as an **institution**, not a stat screen. A blacksmith forges
*actual* swords that sit in a *real* armory; a quartermaster equips squads by policy;
squads march out carrying withdrawn supplies and march back with loot, damaged gear,
and casualties. Every sword has a history. Every craftsperson knows their trade through
a mix of **books, practice, and battlefield experience**. The guild accumulates
**institutional memory** over decades even as individual heroes come and go.

It sits in the underexplored middle: **RTS × management sim × RPG**, where *logistics
drive the battles* rather than being abstracted into numbers.

## Level of abstraction (the granularity dial) — read this first

Two anchors fix how granular the game is. **Every system must sit between them.**

- **One level _deeper_ than an RTS.** An RTS abstracts everything: "the barracks makes a
  swordsman," resources convert to units instantly, gear is an implicit stat. We go one level
  below — *individual* heroes, *individual* forged swords in a real armory, *explicit* supply
  lines. Logistics are visible and consequential.
- **One level _higher_ than Potion Craft (for trade jobs).** Potion Craft is a hands-on crafting
  *simulator* — you physically grind reagents and steer a pendulum to brew each potion. We stay
  **above** that: the player **manages the craftsperson and the supply chain; they do not operate
  the tools.** No per-item mini-game.

So for any trade job the player decides **who** works, **what** they make, and **with what
materials** — then **time + skill** produce the result. Depth comes from *many interacting
systems* (skill tracks, material quality, item history, spoilage, logistics), **not** from fine
motor control. Time is measured in **weeks**, not individual actions.

| Trade | The player DOES | The player does NOT |
|---|---|---|
| Blacksmith | assign the smith, pick the recipe, supply ore, grow their skill | swing the hammer / play a forging mini-game |
| Alchemist | assign, choose the potion, supply reagents | grind ingredients / steer a brewing pendulum |
| Chef | assign, choose the meal, supply ingredients | cook in real time |

> Combat is the one place the dial can go lower on demand: the player *may* directly play a
> battle (the action arena) or auto-resolve a squad expedition. Production/trade stays at the
> management altitude above; combat offers an optional hands-on layer.

This is why the Phase-1 forge is correct: assign a smith + recipe + ore → Advance Week → skill
drives quality. Keep every future trade system at this altitude.

### Scope boundary — a guild, not a settlement/kingdom

The guild is **not** a colony, city-builder, or 4X kingdom. **Guild members never mine, farm, or
gather raw resources.** Raw materials (ore, reagents, food, cloth) enter the economy only via:

- **Trade** — buy from merchants/markets with gold, and sell surplus/finished goods back; and
- **Service / barter** — heroes earn goods by fulfilling quests (a village pays in grain for
  protection; a lord rewards mithril for slaying a beast).

Villages, mines, farms, and kingdoms exist in the world as **external partners** — patrons who post
quests, markets that stock goods, clients who pay for services — never as things the player builds
or operates internally. The guild is therefore a **transformation + service economy**:

> buy / earn raw materials → **trade jobs** refine them into gear/potions/meals → heroes provide
> **services** (quests, escorts, monster-slaying) → gold + loot + reputation → repeat.

The player runs the *organization*; the surrounding world supplies the raw inputs.

## The four pillars

1. **Real-item logistics.** Equipment and consumables are physical, tracked instances in
   inventory — not stat modifiers. Smiths *make* them; squads *withdraw* them; they get
   *used up*, *worn down*, and *repaired*. It's an economy, not a loadout.
2. **Item persistence & history.** A weapon isn't "Steel Sword +2" forever — it's *this*
   blade: forged by a named smith, carried by Captain Roland for 12 years, 418 kills,
   repaired 9 times, edge quality 82%. On his death it can be inherited. This turns gear
   into meaningful, risk-laden decisions (send the legendary blade on a dangerous mission?).
3. **Multi-track expertise.** Skill has three independent sources — **Theory** (books,
   study), **Practice** (doing the work), **Field Insight** (using/observing in the field).
   A profession is a *shape* (e.g. Theory 90 / Practice 35 / Field 68), not a single level.
   Breakthroughs require thresholds across tracks, so no single path suffices.
4. **Institutional memory.** Retiring masters mentor apprentices; books preserve theory;
   workshops preserve technique; returning veterans pass on field lessons. The *guild*
   grows wiser across generations — growing the institution rivals winning battles.

## Core loop — the generalized weekly assignment

The current guild loop (train a stat + pick a diet, Advance Week) generalizes into the
whole game. Each **person** gets one assignment per week:

| Assignment | Effect | Consumes | Produces |
|---|---|---|---|
| **Train** `<stat>` | Grows a combat stat (POW/DEF/SKL/SPD/INT/VIT, 0–100) | stamina | — |
| **Study** `<profession>` | Grows the **Theory** track; unlocks recipes | a book / library access | knowledge |
| **Work** `<profession>` | Grows the **Practice** track | materials, a workshop | **real items** into the armory |
| **Quest** `<squad>` | Grows **Field Insight**; resolves combat | withdrawn supplies | loot, XP, *damaged gear*, casualties |
| **Rest** | Recovers stamina/fatigue/morale | — | — |
| **Mentor** (master + apprentice) | Transfers Practice/Field to the apprentice | the master's week | institutional memory |

"Advance Week" then resolves everyone's assignment, runs production, ages consumables,
charges upkeep, and returns squads. Diet still modifies recovery/growth as it does now.

## Data model (target)

Heroes and craftspeople are the **same base entity** — a Person. A "smith" is just a
person whose Practice/Theory in blacksmithing is high; a "knight" leans on combat stats.

```
Person {
  id, name, appearance, archetype,
  stats:      { POW, DEF, SKL, SPD, INT, VIT },        // 0..100 — combat (exists today)
  condition:  { stamina, fatigue, morale, loyalty, injury },
  professions: {                                        // NEW — the multi-track skills
    blacksmithing: { theory, practice, field },         // each 0..100
    alchemy:       { theory, practice, field },
    cooking:       { theory, practice, field },
    command:       { theory, practice, field }, ...
  },
  rank: 'recruit' | 'veteran' | 'leader' | 'master',
  age, lifespan,                                         // retirement → can mentor
  assignment: { type, ... },                             // this week's task
  carrying: [ItemId, ...],                               // equipped item INSTANCES
}

Item {                                                   // NEW — a persistent instance
  id, kind: 'sword'|'armor'|'bow'|'potion'|...,
  material: 'iron'|'steel'|'mithril'|..., quality,       // set at forge time from smith + ore
  durability: { current, max },                          // "edge quality"
  history: {
    forgedBy, forgedWeek,
    wielders: [{ personId, fromWeek, toWeek }],          // ownership chain → inheritance
    kills, battles, repairs: [{ week, smithId }],
  },
  location: 'armory' | personId | 'in-transit',
}

Inventory (guild) {
  weapons: [Item], armor: [Item],                        // individual instances
  consumables: { 'healing-potion': batch[], antidote: batch[], arrows: {count} },  // batches carry expiry
  materials:   { 'iron-ore': {count, purity}, 'mithril-ore': {...} },              // purity → quality
  food:        [ batch{ kind, count, spoilsWeek } ],
}

Squad { id, name, leaderId, memberIds[], policy, deployment, withdrawn:{gear,supplies} }

Guild {                                                  // extends today's guild
  name, gold, reputation, calendar,
  roster: [Person], recruits: [Person], squads: [Squad],
  inventory: Inventory, workshops: [...], library: [...], // production + theory sources
  questBoard: [Quest], policies: { quartermaster },
}
```

## Signature systems

- **Production chain.** Work-assigned smith + workshop + materials → item instances. Quality
  = f(Practice, ore purity); *recipes available* = f(Theory); **repair** costs a fraction of a
  new craft. Alchemist → potions (with expiry); Chef → meals (buffs + spoilage).
- **Quartermaster policy.** Auto-equip from the armory by rank: leaders → best (mithril),
  veterans → steel, recruits → iron. Deploying a squad *withdraws* its gear + a supply
  manifest (e.g. 18 healing potions, 6 antidotes, 400 arrows, 2 tents) from inventory.
- **Squads & expeditions.** Combat resolves via the existing battle engine (quest/tournament
  layer). Survivors return with loot → storage; gear returns damaged → repair queue; the dead
  free their gear for **inheritance**.
- **Logistics depth (later).** Ore impurities, potion expiry, food spoilage, feed for mounts,
  caravans that can be ambushed in transit, elite squads that drain the rarest stock.

## Build roadmap (each phase is playable)

Built on today's working weekly loop (roster, training, diet, recruiting, MR stats).

- **Phase 1 — Real items + Armory + a Blacksmith (Practice).**
  Item instances, `Guild.inventory`, a `work: blacksmithing` assignment that consumes materials
  and forges sword instances into the armory (quality from Practice). Manually equip a hero from
  the armory. *First taste of real items.*
- **Phase 2 — Multi-track skills (Theory + Field).**
  Study (books → Theory → unlock recipes) and Field Insight (from quests). Recipe availability +
  quality gate on all three tracks. Show each person's expertise *shape* in the UI. *The signature system.*
- **Phase 3 — Quartermaster + Squads + Consumables.** *(Squads ✅ · Quartermaster ✅ · Alchemist ✅ · Provisioning ⏳)*
  ✅ **Squads:** heroes sharing a quest form a party; it resolves once on combined power, pays reward
  once, splits Field to all marchers. ✅ **Quartermaster:** `guild.quartermaster` policy (off/party/all)
  auto-issues the best armory gear to the strongest heroes first ("by rank"), upgrade-only with
  trickle-down; equipped **quality now feeds combatPower** so the armory measurably wins quests.
  ✅ **Alchemist:** a full trade paralleling the smith — the Laboratory brews potion batches (potency
  from alchemy Practice, recipes gated by alchemy Theory, herbs bought at market) into the Apothecary;
  potions are *used* to heal stamina, cure injuries, and shed fatigue/stress. The Library Scholar now
  studies either Metallurgy or Alchemy. ⏳ **Provisioning:** squads auto-*withdraw* potions before a
  march and spend them to swing a bad roll / heal casualties on return. *(Damage/casualty returns land here + Phase 4.)*
- **Phase 4 — Persistence, repair, inheritance, decay, mentorship.**
  Item history/durability/edge-quality; repair-vs-craft; inheritance on death; potion expiry; food
  spoilage; master→apprentice mentorship; the guild's library/workshops/veterans as institutional memory.
- **Phase 5 — A minor league (the owner's 2026-07 direction).** Two tiers of people:
  **named heroes = professionals** (individually managed, as today), and a larger pool of **generic
  members = trainees/prospects** (a few → 100+) the guild *houses and supplies*. Trainees perform
  activities + training, have stats that shift with training/experience and weapon/armor proficiencies,
  and **graduate to become named heroes** once good enough — a farm system, not commanders-with-troops.
  UI must scale to many (roll-ups, not per-unit micro). Depends on: cheap generic-person storage,
  a graduation threshold, and batch training. *Deferred; "named for now".*
- **Supply-gated diet (paired with Phase 5 / the Cook).** A member has a *preferred/assigned* diet but
  only actually eats it if the **Kitchen stocks that food** (food becomes real supply, like gear/potions);
  otherwise they eat what's available — grudgingly if it's not their preference, or willingly under orders.
  Turns diet into logistics. *Kitchen is currently a plain per-member menu until this lands.*
- ✅ **Done alongside:** work departments show **only their active workers** (+ an "assign a member"
  picker); **sparring** — pair two members to train each other (mutual assignment; you learn more from a
  stronger partner; contact-injury risk).

## The season & tournaments (added 2026-07)

The weekly loop needed a **long horizon**. Quests are reactive (a fresh board each week);
**tournaments are the opposite — scheduled tentpole events at fixed future weeks, visible in
advance** (Monster Rancher's calendar), so training gains a *purpose and a deadline*: peak a hero's
stats **and** keep them healthy for the Rank-3 tournament you can see six weeks out.

- **Data:** `guild.schedule` — a rolling window of `Tournament`s (`{week, rank, field, rounds,
  rewards, entrants[]}`) kept topped-up by `ensureSchedule()` (one roughly every 8 weeks, ranks
  rising the further out they sit, floored by reputation). `src/guild/tournaments.js` mirrors `quests.js`.
- **Nominate one champion, resolve on the week:** you send **one** hero per tournament (Monster-Rancher
  style — you peak and taper a single ace, not the whole roster); on its week `advanceAll`'s tournament
  pre-pass runs a small **bracket** — that champion's `combatPower` vs an escalating field
  (`resolveTournament`, final round ≈ field×1.35), placement → scaled payout (Champion pays full gold +
  rep + loot; finalists a fraction). **An injured champion can't compete** (forfeit), so the
  "peak-and-taper" tension is real: a fresh recruit can't win — you must *train* them up and keep them
  healthy. Single-entrant is deliberate — combined-lineup power made stacking heroes a guaranteed
  zero-risk win (caught by the review). Pairs with the Grounds (train harder/safer via facilities) and
  diet/fatigue/injury (don't crest into an injury on tournament week).
- **UI:** a `📅 Calendar` room (upcoming cards with countdown, field, rewards, entered lineup +
  win-odds), a hub "Next tournament" teaser, and recap lines. Reuses the quest power×variance model
  so displayed odds can't drift from the resolver.

## Combat controls — direction (owner 2026-07)

Target feel: **Warcraft-3-*light*** — hero-led command, not mass micro. The player directly drives
**one member or a small squad** while the rest (up to the ~100-unit "war exercise" vision) run on AI,
with **auto-resolve** always available as the management-altitude fallback. This is deliberately the
*mobile-friendly* end of RTS. Strongest precedent: **Iron Marines** (Ironhide) — a few squads + a
leveling hero, tap-to-select / tap-to-command, "universal acclaim" on touch; MOBAs (LoL: Wild Rift)
prove precise hero + skillshot control at scale; Bad North proves tap-drag squad tactics. The friction
case — selecting individual soldiers in a dense RTS (the Company of Heroes iPad port) — is exactly what
we sidestep by keeping *direct* control to a hero/squad. The 100-unit spectacle is an AI-driven render
problem, not a control one: it needs a single scene canvas + baked per-character sprite atlases (the
current per-character-canvas renderer tops out ~15–25 animated on desktop / ~6–12 on mid-range Android).

## Modes & playable combat — one simulation, three lenses (owner 2026-07)

The game offers **EA-Sports-style control scopes** (like Superstar / Team / Manager): **My Hero**
(be one custom hero), **Team** (play the guild's battles), **Manager/Guildmaster** (today's
management sim). The unifying rule is the owner's: **whatever the player isn't actively controlling
is simulated.** There is one always-running guild simulation; a *mode* only changes which decisions
and battles the player takes over vs. lets the AI/sim handle.

**The keystone this rests on:** the battle engine must be *playable inside guild mode*. Guild combat
was auto-resolved by power math; the tactical engine (the original Crucible battler) existed but was
wired to its own `p1`/`p2` + `run` state. The enabling abstraction is a **resolution layer** where a
battle is *either* simulated (the math) *or* played (hand guild heroes to the engine → a result), with
the played result returning the **exact same shape** the resolver does — so everything downstream
(payout, reputation, fatigue, placement, recap) never learns which it was.

**Architecture (four layers over the sim):**
- **Simulation core** — `hall.js advanceAll()` weekly tick + `resolveQuest`/`resolveTournament`. The
  only two points where combat is decided. Unchanged; runs identically in all modes.
- **Control-scope layer** *(future `src/guild/control.js`)* — `guild.control = { mode, focusId }` +
  `playerOwns(battle)` ("player's call or the AI's?") + `autoManage(guild)` (sim-the-rest).
- **Resolution seam** — inside `advanceAll`, `outcome = playerOwns ? await playBattle(…) : resolve(…)`.
- **Battle adapter** — `src/guild/battle-bridge.js` (`heroSpec`, `playTournamentMatch`) → the engine's
  `window.playGuildBattle({player,opponent})` facade in `crucible.js` (`guildFighterFromSpec`,
  `startGuildBattle`), which reuses the real action arena with no `run`/roguelike state.

### Build status & roadmap
- **Phase 1 — Keystone ✅ DONE (2026-07).** Play ONE 1v1 tournament match through the action arena and
  feed the win/loss back into `advanceAll` unchanged. A guild Person's MR stats convert to an engine
  fighter (`guildFighterFromSpec`, hp/attacks by archetype; gear→engine is stubbed), fights a synthetic
  field champion, and the result flows through `placement()` → rewards → recap exactly like a simulated
  one. A **virtual touch joystick** (`ensureActionJoystick`, added to the arena) makes it mobile-real
  (attacks were already tappable). `advanceAll` is now `async` with an `advancing` re-entrancy guard; a
  "🎮 Play this match yourself" opt-in on the tournament card sets `playTournamentId`. Single duel: win →
  Champion, lose → Eliminated (no bracket gradient yet).
- **Phase 2 — Manager+, formalized (SMALL).** Extract `control.js`; generalize "Play this match" to any
  tournament. Absent `control` defaults to `manager` → every existing save already *is* Manager mode.
- **Phase 3 — My Hero (MEDIUM).** Own one hero; play only their fights; `autoManage` runs the rest via
  reuse-only assignment passes (gear/diet/training/dispatch/tournament-entry). **Forces mobile touch
  controls** (the joystick shipped in Phase 1 is the head start).
- **Phase 4 — Team, small (MED→LARGE).** ≤4-a-side; de-singleton `p1`/`p2` so >2 fighters coexist.
- **Phase 5 — Team, full melee (EPIC).** The 100-member war exercise — the **only** thing that forces
  the single-scene-canvas + baked-sprite-atlas renderer rewrite. Sequenced last; blocks nothing before it.

Presentation: the **real-time action arena** is the guild-battle vehicle (self-contained, already
playable); the turn-based tactical grid can return later as a second presentation (shares the fighter
model). Deferred from Phase 1: gear→engine conversion, multi-round played brackets, and a win/lose
result overlay.

## The Monster Rancher expansion (owner 2026-07) — the designed direction

> Owner directive: *"more like a Monster Rancher game, with the option for full simultaneous
> turn-based combat and/or action-RPG combat (ref: Shining Soul). Go all in. Expand guild
> building and calendar events beyond simulated — let the player manually participate."*
> Synthesized 2026-07 from a codebase map + reference research + a judged 3-proposal panel.

**Vision.** You open the guild on the Ranch and the calendar is already talking: the Autumn
Major is nine weeks out, the Harvest Festival in three, your Ranger is mid-errantry, and every
week is a coin spent from her finite life. When a fight arrives you pick your altitude every
time: **Simulate** it and keep planning, **Tactics** it in the simultaneous move-queue engine
(where a low-bond hero may ignore your orders), or **Fight** it yourself in the action arena,
holding the attack to bloom a charge ring your training weeks unlocked. Heroes age, tear
muscles, win Majors, retire in ceremony, and return as staff running the Target Range that
hosts next year's Marksman Cup. *The calendar is the game; combat is the exam; the guild you
build is the venue.*

### Systems (S1–S11)

- **S1 Battle facade + shared spec.** `window.playGuildBattle(config)` is the single entry for
  ALL played combat: `{player, opponent, mode:'action'|'tactical', label, items?, rules?}`.
  Both lenses resolve the identical payload `{winner, playerHp, playerMaxHp, oppHp, oppMaxHp,
  itemsUsed?, forfeit?}`; `_guildBattle` is shared (lenses are mutually exclusive).
- **S2 resolveEncounter dispatcher + battle prefs.** One funnel in battle-bridge.js for kinds
  tournament-round/quest-bout/spar/festival-bout/rival/errantry-boss. `guild.battlePrefs`
  (`'ask'|'sim'|'action'|'tactical'` per event type), `guild.playPlan` replaces the module-var
  opt-in (survives reload), `guild.lastReport` persists the recap. Pre-battle chooser overlay
  **[⚔ Arena] [♟ Tactics] [▶ Simulate]** + "remember for this event type".
- **S3 Typed event fabric.** `guild.schedule` entries gain `type:'tournament'|'major'|'festival'
  |'errantry'|'rival'|'exhibition'` (+ migration). `EVENT_TYPES[type] = {generate, card,
  resolve, playAdapter}` registry in `src/guild/events.js`; `ensureSchedule` grows into
  `generateSeason()` (48-week year: anchor tournament per season E→S, festival week 6, monthly
  minors, condition-triggered rivals/invitationals). Calendar room becomes a season strip.
- **S4 Full brackets.** `playTournamentMatch` loops per-round vs escalating synthetic opponents
  (shared `roundOpponentPower` ends the resolveTournament/championOdds duplicated-constants
  lie); lose → stop with *i* wins → `placement()` unchanged, restoring Finalist/Semi payouts.
  Between rounds: **[Fight on] [Simulate the rest]**.
- **S5 Lifecycle.** `hero.career{debut,titles,wins,losses,injuries,techniques}`, `retired`,
  `staffRole`; `guild.hallOfFame`. Stages from age/lifespan: Novice <15%, Prime 15–50%,
  Veteran 50–80%, Twilight >80% (−0.5/stat/week); forced retirement = ceremony + optional
  **staff conversion** (+15% to a facility's drill output). Roster lifecycle band with the
  peak zone marked — the load-bearing MR element.
- **S6 Injury ladder.** `condition.injury` → `{kind, weeksLeft, statHit}`; severity from wear
  overflow (bruised 1wk / strained 2wk / torn 4–6wk −2 permanent / career-ending in Twilight).
  Wire the three dead fields: `diet.injuryRiskMod`, `quest.risk`, breakthrough drills (5%
  heavy-drill crit: +50% gain). Drill picker shows computed risk % (anti-lie principle).
- **S7 Personality, bond, Foolery.** Roll 2 traits at creation (~12 pool, small named
  multipliers); `condition.discipline` new; loyalty becomes **Bond**. Played tactical matches
  roll `P(obey)=(discipline+bond)/200±trait` each planning phase; failure = **Foolery** — the
  hero's turn is planned by the (actor-parameterized) AI, watchable on the timeline. Autopilot
  toggle = pure-watch tier with take-control at turn boundaries.
- **S8 Errantries + techniques.** `hero.awayUntil` (multi-week unavailability — the one
  mechanic the codebase lacks), `hero.techniques[]`. Six sites, one per MR stat, 4 weeks,
  ×1.6 focused gains, ×1.5 injury risk, weekly log lines; return-week boss fight in the
  player's chosen lens. Win → technique merged into the fighter's attack kit in BOTH lenses.
- **S9 Festivals, rivals, exhibitions.** Festival week suspends the tick: judged craft
  exhibition (score = quality × durability% × U(0.85..1.15) vs a field — the smithing/alchemy
  math IS the contest), playable exhibition duel, festival vendor. Rep thresholds inject
  persistent named **rivals** whose champion grows between meetings. Player-ordered
  exhibitions: spend reputation to host your own event at a venue facility.
- **S10 Facilities = venues + training + staff.** New: range (SKL), track (SPD), bathhouse
  (VIT/recovery), lodge (rivals/invitationals), festhall (booths), infirmary (halves injury
  weeks). Entries gain `venue` + drill hooks; facility key lists derived from
  `Object.keys(FACILITIES)` (pays the 4-site hardcode debt). Tier unlocks drill variants and
  feeds `generateSeason` (range ≥1 → your guild hosts the Marksman Cup). Staffed by S5
  veterans or idle heroes. Three Houses rule: everything is one tap from the calendar; the
  Ranch is sugar, never a corridor.
- **S11 Action layer (Shining-Soul, trimmed).** Hold-to-charge on the existing keydown/keyup +
  new pointerdown/up: 2 tiers scaling damage dice + toHit, tier 2 **stat-gated** (POW≥40
  melee / SKL≥40 ranged / INT≥40 caster) so training visibly grows the kit. Charging
  suppresses tap-attacks. `config.items` → two tap slots drinking real brewed potions;
  `result.itemsUsed` decrements real inventory. (Archetype charge *geometry* — arcs, spreads,
  displacement — deliberately cut: it smuggles area/collision subsystems into a hitscan engine.)

### The two combat lenses

**(a) Tactical** — "full simultaneous turn-based combat": `startGuildTacticalBattle` beside the
action seam (~80 lines) — set `_guildBattle`, assign p1/p2 (guildFighterFromSpec already emits
grid-ready fighters), replicate startBattle minus its `run.*` lines, then intercept **checkWin**
(the single choke point for all 5 call sites) to resolve the promise instead of routing into
loot/game-over. Guard the one guaranteed crash (`run.totalDamage` at resolveOneAttack) and give
battleScreen a forfeit twin. Every exit path MUST resolve the promise or the `advancing` lock
wedges the guild. This lens doubles as the Watch/Coach tier (S7) and is already tap-native.
**(b) Action** — shipped; S11 additions only.
**Choice:** every combat-shaped card offers [Simulate] [Tactics] [Arena]; Simulate is never
removed; prefs remembered per event type; played results map into the canonical resolvers'
exact output shapes — one simulation, two windows onto it.

### Event taxonomy

| Event | Cadence | Sim / Watch / Play |
|---|---|---|
| Anchor tournament (E→S) | last week/season | Sim / Tactics-coach / both lenses, per-round |
| Major/Invitational | condition-triggered | same, unique loot |
| Festival | week 6/season | judged booths + playable duel + vendor |
| Minors | monthly | Sim default, playable on demand |
| Errantry | player-booked, 4wk | Sim weekly logs; boss finale watch/play |
| Rival visit | rep threshold | both lenses |
| Player-ordered exhibition | rep cost | both lenses |

### Keystone plan (each keeps the build green; migrations in `load()`)

- **K1 — Tactical lens (M):** practice bouts + tournament matches playable in the turn-based
  engine. crucible.js facade + checkWin intercept, index.html forfeit, bridge `mode`, hall
  lens toggles.
- **K2 — Chooser + charge + consumables (M):** [Sim/Tactics/Arena] on every battle incl.
  quests (played bout shifts resolveQuest variance — skill bounds, never replaces, the check);
  hold-to-charge; potions mid-fight.
- **K3 — Typed events + season + full brackets (M-L):** events.js registry, generateSeason,
  season-strip calendar, per-round played brackets with honest Finalist/Semi purses.
- **K4 — Lifecycle + injury ladder (M):** peak/decline stages, retirement ceremony, staff
  conversion, injury objects + dead-field wiring, honest drill risk %.
- **K5 — Personality + coach tier (M):** traits, discipline/bond, Foolery, autopilot watch
  tier (parameterize genAIMoves/pickAIAttack by actor — budgeted).
- **K6 — Festivals + errantries (L):** the participable calendar; techniques land on the
  attack bar in both lenses.
- **K7 — Facilities-as-venues + rivals + hosted events (L):** build the venue, staff it with
  your retired champion, host the Cup; recurring rivals.

### Cut list (deliberate)

2v2/FFA true multi-combatant (p1/p2 singletons pervade ~15 functions; sequential 1v1 brackets
deliver the fantasy; revisit only after the batched renderer, which stays LAST) · archetype
charge geometry payloads · gear→engine conversion (deferred until durability+repair ship as a
pair — wiring it now silently nerfs everything) · projectiles/dash/soul-gauge · ward/DOT in the
arena · mid-battle lens hot-swap (process-wide combat globals) · bespoke minigame engines
(every contest is a judged prep-check or a combat bout) · festival crowds >4 extra actors
(compositor ceiling) · cooking/day-granularity/weather/breeding · audio (no assets yet; the
300 unused FX frames in packs 2–6 are the cheaper spectacle lever).

## Open design decisions

- **One pool or two?** Recommend heroes and craftspeople are the *same* Person entity (professions
  are a dimension), so a knight can dabble at the forge and a smith can be sent to fight. Simpler,
  more emergent. (Alternative: dedicated non-combatant staff.)
- **Instances vs stacks.** Weapons/armor = instances (history). Materials & arrows = counted stacks.
  Potions/food = **batches** with an expiry/spoil week. Keeps the sim tractable without tracking
  every individual arrow.
- **How deep, how soon?** The persistence/logistics depth (Phase 4) is the soul of the idea but the
  most content; ship Phases 1–3 first so it's a playable game before the deep sim.

## The Guild Academy — training as a school (owner 2026-07-09)

From Monster-Rancher references (place training gear on the ranch; plan a per-monster
weekly schedule). The guild trains like a **school**: three pillars layered over the
existing weekly-assignment + training-drill + facility systems.

- **Pillar A — the grounds as a buildable gym (SHIPPED 2026-07-09).** The player places
  **training stations** on the ranch. One station per drill: Sandbag→POW, Pell Post→DEF,
  Training Dummy→SKL, Agility Poles→SPD, Meditation Stone→INT, Rucking Track→VIT. Each gives
  its drill a **+15% weekly gain** (diminishing when the same type stacks). How many fit is
  gated by the **Training Yard facility tier** (2 / 4 / 6 / 9 slots) — expanding the Yard in
  Grounds unlocks more. Placement is on-field: tap a 🏗 Build toggle → pick from a palette
  (gold-gated) → tap a ＋ ground spot. Remove = 50% refund. Members visibly **congregate at
  the station matching their drill** in the wander loop. New module `src/guild/stations.js`
  (`STATIONS`, `YARD_SLOTS`, `stationBonusFor`, `stationCapacity`, add/remove); `guild.stations`
  persists; `applyTraining` gained `opts.equipMult`; the ranch build UI lives in `ranch.js`/`ranch.css`.
  On branch `feat/ranch-training-equipment`.
- **Pillar B — per-member week schedules (NEXT).** Today one assignment per week; add a
  **queue** of drills across upcoming weeks per member (the MR schedule screen). Advance Week
  pops the front. Gives the tournament calendar teeth — plan a peak/taper toward an event.
- **Pillar C — the curriculum (auto-scheduler).** Fills those queues: everyone takes the **core**
  (Conditioning→VIT/stamina, Discipline→stress↓/bond↑), their **combat type** picks a **track**
  (melee/ranged/magic), and each member takes one **elective** = the existing trades
  (cooking/alchemy/blacksmithing) which **create & slot materia/consumables**. Also the graduation
  pipeline for Phase-5 minor-league trainees (finish tracks → become a named hero).

## Relationship to the current codebase

- `src/guild/` already has the bones: `hero` (→ Person), `training`, `diet`, `recruiting`, `calendar`,
  `economy`, `guild`, and the playable `hall.js` weekly loop. This design *extends* them (add
  `professions`, `items`, `inventory`, `squads`) rather than replacing them.
- The battle engine (being decomposed out of `crucible.js`) becomes the **quest/expedition resolver**.
- Elements sprites become **hero appearance**; gear instances will render on them once the sprite
  engine is extracted (see ARCHITECTURE.md).
