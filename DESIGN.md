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
motor control. Time is measured in **weeks**, not individual actions (**amended
2026-08-24**: the week now holds three-watch days the player may advance — see "The Three
Watches"; the ledger still settles weekly).

| Trade | The player DOES | The player does NOT |
|---|---|---|
| Blacksmith | assign the smith, pick the recipe, supply ore, grow their skill | swing the hammer / play a forging mini-game |
| Alchemist | assign, choose the potion, supply reagents | grind ingredients / steer a brewing pendulum |
| Chef | assign, choose the meal, supply ingredients | cook in real time |

> Combat is the one place the dial can go lower on demand: the player *may* directly play a
> battle (the action arena) or auto-resolve a squad expedition. Production/trade stays at the
> management altitude above; combat offers an optional hands-on layer.
> (**Amended 2026-08-22 and 2026-08-24**: drills may be PERFORMED with a lens's own verb, and
> the day and walk rungs zoom lower everywhere — see "Training drills" and "The Zoom".
> Production keeps this altitude: a forge moment has no rung to play, at any zoom.)

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
- **Control-scope layer** *(future `src/guild/control.js`)* — `guild.control = { mode, focusId }`
  (**amended 2026-08-24**: control is a FOCUS, not a mode — the dial holds on a person and the
  field spec follows; see "The Zoom") + `playerOwns(battle)` ("player's call or the AI's?") +
  `autoManage(guild)` (sim-the-rest).
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
(every contest is a judged prep-check or a combat bout — **amended 2026-08-22**: a drill may
also be PERFORMED, with a verb a lens already has; see "Training drills" below; the refusal of
a separate minigame engine stands) · festival crowds >4 extra actors
(compositor ceiling — lifted in Unity by the batched atlas; see "The Battlefield") ·
cooking/weather/breeding (day-granularity **amended 2026-08-24**: the day exists now as
three watches the player may advance — see "The Three Watches" below; the WEEK remains the
ledger every system resolves at, and weather and feeding minigames stay refused) · audio
(no assets yet; the 300 unused FX frames in packs 2–6 are the cheaper spectacle lever).

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
- **Pillar B — per-member week schedules (SHIPPED 2026-07-09).** Each hero has a `schedule` =
  a FIFO queue of upcoming training weeks `{trainingId, intensity}` (this week stays the live
  `assignment`; the queue is the weeks *after*). The Train panel has a **📅 Plan ahead** row: set
  Light/Heavy, tap `+ POW` etc. to append (each item captures the intensity it was added at — so
  you can queue "POW heavy → SPD light"), ✕ to drop, clear to reset (cap 8). On Advance Week a
  post-pass shifts each training hero's queue front into their assignment, so a plan plays out
  automatically; a hero on a non-training activity (quest/forge) doesn't consume the plan — it
  waits. `hero.schedule` persists (init/sanitized in `ensureAssignment`); bridge gained
  `scheduleAdd`/`scheduleRemoveAt`/`scheduleClear`. Pairs with the tournament calendar (peak/taper
  toward an event). NEXT: auto-fill from Pillar C's curriculum.
- **Pillar C — the curriculum (auto-scheduler, NEXT).** Fills those queues: everyone takes the
  **core** (Conditioning→VIT/stamina, Discipline→stress↓/bond↑), their **combat type** picks a
  **track** (melee/ranged/magic), and each member takes one **elective** = the existing trades
  (cooking/alchemy/blacksmithing) which **create & slot materia/consumables**. It also directs
  **apprentice** development (below) — a class studies a curriculum, then graduates.

### The Academy — apprentice farm system (SHIPPED 2026-07-09)

The minor-league pipeline (DESIGN.md Phase 5 realized). The guild houses a pool of **unnamed
apprentices** the player supplies and teaches, then **drafts** the best into named heroes — the
GM move, and the substrate for succession planning (draft the magic-leaning prospect as your old
knight retires).

- **`guild.apprentices`** = lightweight `{id, lean, potential, weeks, readiness}`. `lean` = the
  archetype they'll graduate into (visible, with a glyph); `potential` = a hidden ceiling shown as
  a 1–5 **star** scout rating.
- **Supply gates it:** a new **Dormitory** facility caps bunks (3/6/12/24); each apprentice costs
  weekly **board** (gold, folded into upkeep = food); a **Trainer** on staff (teachers) speeds
  development. (Books/Library → dev speed = a later hook.)
- **Weekly development:** `readiness` climbs ~11%/wk (×1.3 with a trainer) → ready in ~9 weeks.
- **Graduation = the draft:** a manual **Promote** (needs an open quarters slot) runs `graduate()`
  — reuses `generateRecruit` for name/traits/lifespan, then sets archetype from the lean and lifts
  starting stats by potential. The graduate joins the roster as a full hero (assignment + schedule).
- New `src/guild/apprentices.js`; a 🎓 **Academy** room + a 🎓 ranch building; `ARCHETYPES` exported
  from recruiting. **NEXT:** apprentices develop toward stat/skill/proficiency profiles (not just a
  readiness bar), a scout report with preferences, and Pillar C driving their curriculum.

## The stakes gradient & the World Cup (owner 2026-07-09) — SHIPPED

The mechanic that makes the Academy *matter*: competing carries **injury + death risk that
rises with the competition**, so your legends can fall — and you keep a successor in training.

- **Stakes tier by event type** (`tournaments.js` `STAKES`): the monthly minors are **Friendlies**
  (injury ~4%, **death 0%** — safe practice, the run-up matches), the seasonal **Majors** are
  **Competitive** (injury ~12%, death ~0.6%), and the **World Cup** is **Lethal** (injury ~24%,
  death ~3% base). `competitionHarm(t, power, res)` scales each by **how deep they fought** ×
  **how outmatched** they were — an outmatched fighter going deep in the Cup hits ~40% death; a
  **champion never dies** (they won every round); friendlies never kill.
- **The World Cup** (`events.js` `worldcup` type, `generateWorldCup`): once every **4 years**
  (`WORLD_CUP_CADENCE = 192` weeks — one tunable number), a 6-round bracket with the richest purse.
  `ensureWorldCup` always books the next one so it's visible **looming for years** to breed toward.
- **Death** (`hall.js` `fellInGlory`): a killed competitor is **enshrined in the Hall of Fame**
  ("fell at <event>"), gear returned to the armory, entrant/spar/selection refs cleaned — mirrors
  the age-retirement path. The recap names the fallen; the freed roster slot is what the Academy
  graduate backfills. **The loop closes.**
- **NEXT:** team/national events (multiple members compete and can each fall — revives the deferred
  Team combat lens); a pre-event risk % on the champion card; a "successor ready?" nudge on a death.

## The Tourney Board — brackets, previews & records (owner 2026-07-09) — SHIPPED

> Owner directive (from Monster-Rancher-DS league screenshots): *"I'd like to see tournament
> brackets, combatant previews, win/loss/draw records, not just instantly starting a round fight."*

The circuit has **faces** now. Tournaments used to be fought against an anonymous power curve
(synthetic foes minted mid-fight and discarded); now every scheduled event draws a **field of
persistent named rivals** you can scout, and no fight starts unannounced.

- **The rival circuit** (`src/guild/rivals.js`): `guild.rivals` — a persistent pool of named
  competitors (`{name, archetype, appearanceSeed, power, stats, record:{w,l,d}, titles}`).
  `ensureField(guild, t)` draws one rival per bracket round into `t.rivalIds` (called from
  `load()` and after each Advance Week — **never mid-render**), preferring pool rivals near that
  round's strength so faces recur across seasons. **Anti-lie:** a drawn rival is *retuned* to
  exactly `roundOpponentPower(t, i)` — the ⚡ on the board IS the number the resolver checks and
  the stat spread a played round fights (`battle-bridge` `roundOpponent` consumes the same rival).
- **The Tourney Board**: when an event is due (battlePrefs `'ask'`), the bare lens chooser is
  replaced by the full **ladder** — final at the top, round 1 at the bottom, every rival with
  portrait, archetype, ⚡, and career record; your champion (record + title odds) beneath. The
  lens choice ([⚔ Fight live] [♟ Command] [👁 Spectate] [▶ Simulate]) lives *on* the board.
  The same ladder is available any time from the Calendar card ("🏟 View the draw"), and the
  between-rounds interstitial names the next rival. Simulate is never removed.
- **Records on both sides**: `hero.career` gains `draws` (W–L–D shown on the roster header and
  the board); `recordFieldOutcome` writes each event into the rivals' careers — reaching round
  *i* banks *i* wins, your champion's run adds their L (or the W of the one who stopped you),
  and if the guild doesn't lift the cup, the final-round rival takes the **title**. Forfeit an
  event and the field plays itself out. Rivals unseen for ~2 years prune away (drawn ones never).
- **NEXT:** head-to-head grudge records (you vs. THIS rival across seasons), rival growth
  between meetings (K7's persistent rivals), and a league-grid presentation for round-robin
  minors (the MR-DS screenshot's grid — needs a round-robin event type first).

## The Weekly Assembly — reports, praise & scold (owner 2026-07-09) — SHIPPED

> Owner directive: *"weekly updates for all named heroes on screen at once — successes,
> failures, skill point increases; reports on if they failed, cheated, or exceeded
> expectations; the opportunity to praise or scold."* (Monster Rancher's post-training beat.)

After Advance Week, the **Assembly overlay** lines up every named member's week on one screen:
what they did, what it earned (stat/skill chips, forged/brewed goods, quest outcomes, injuries),
and their **conduct** — with one **Praise/Scold** per member per week.

- **Conduct** (`training.js` `rollConduct` + per-branch classification in `advanceAll`):
  `✨ exceeded` (breakthrough drills, comfortable quest clears at score ≥1.3, near-ceiling
  crafts, book-fed theory leaps) · `✓ solid` · `🤥 cheated` (**slacked and hid it** — a
  discipline/morale roll, Lazy ×2 / Hotheaded ×1.4 / Loyal ×0.6; a slacked week trains at ~⅓
  strength for half the wear, never breaks through, never gets hurt, and *feels great*) ·
  `✗ failed` (no gains, failed quests, jobs that couldn't run). Resting/recovering weeks carry
  no conduct.
- **Praise/scold is a read on conduct, not a free buff** (the MR grammar): praise exceeded →
  Bond +4, morale +8; praise a hidden slack → they beam *and file away that nobody checks*
  (Discipline −5); scold the cheat → Discipline +6, they own it; scold honest excellence →
  Bond −5, morale −8 — that's how you lose people. Feedback notes say how it landed; the choice
  persists on `guild.lastReport` (reopen the assembly from the hub recap).
- The overlay also banners tournament results/casualties, the pantry shortfall, retirements,
  and an Academy roll-up. It is a **sibling of the room-hub host** inside `#guildScreen`, so
  room re-renders never wipe it and `paintSprites` reaches its portraits.
- **NEXT:** apprentice conduct in the roll-up; a season-end review (the same grammar at
  12-week scale); conduct history influencing traits (a serially-praised slacker hardens
  into Lazy).

## Room stores — every workshop keeps its own shelf (owner 2026-07-09) — SHIPPED

> Owner directive: *"Parts of the guild should have their own inventory to perform work:
> Forge, Kitchen, Apothecary, Laboratory. Armory can be used to Forge for refining, but is a
> separate storage. Library stores books that can be studied to improve skills — bought from
> the world or found on quests."*

One `guild.inventory` still persists everything (no save-shape upheaval), but every store now
**belongs to a room**, is shown there, and is worked from there:

| Room | Its store | Worked by |
|---|---|---|
| 🔨 Forge | **Stockroom** — ore stacks | forging **and refining** draw ore |
| ⚗ Laboratory | **Stores** — herb stacks | brewing draws herbs |
| 🏺 Apothecary | potion batches (as before) | treatment + battle kits |
| 🍲 Kitchen | **Pantry** — grain & salted meat | *diets eat it* (below) |
| 🗡 Armory | finished gear ONLY (materials moved out) | equip/sell/**refine** |
| 📖 Library | **the Shelf** — book instances | study is guided by it |

- **The pantry is real** (the first slice of supply-gated diet): every diet draws 1 food/week —
  grain for plain tables, **salted meat** for Protein/Feast. A short pantry means **plain
  rations**: Balanced recovery, no growth bias, no feast morale, −2 morale grumbling, a recap
  warning. Market sells grain (3g) and salted meat (9g); the full Cook trade still arrives with
  Phase 5.
- **Refining — the Armory feeds the Forge** (`smithing.js` `refine`): a smith's week can rework
  a shelved piece instead of forging fresh. Quality closes **half the gap** toward what the
  smith could forge outright (same Practice/Field math — anti-lie), capped by the material
  ceiling; durability restores; the work is stamped into `history.repairs[]` so a storied blade
  improves **without losing its story** (pillar 2). Costs 1 ore of its material; a smith whose
  own work is no better than the piece is told it's *beyond their craft*. Equipped items must
  be unequipped first (they're not in the Armory).
- **Books — the Library's own inventory** (`src/guild/books.js`): real shelved instances
  (`{title, subject, tier 1–3, source}`), never consumed. The best shelved volume on a subject
  multiplies Study's weekly Theory gain (×1.25/×1.5/×1.75 by tier; Studious stacks). They enter
  the guild **only** through the world: the market's rotating bookseller shelf (1–2 volumes/week,
  60/140/300g) or **recovered on rank-2+ quests** (~20%, deeper jobs shelter deeper theory).
  This is pillar 4 made physical — the shelf is institutional memory that outlives its readers.
- **NEXT:** ore purity & herb freshness per room store; pantry variety feeding preference
  morale (supply-gated diet, Phase 5); technique manuals (books that teach combat techniques,
  pairing with K6 errantries); withdrawing room stock into quest supply manifests (Phase 3
  provisioning).

## The Refinement System & the Scriptorium (owner 2026-07-21)

> Owner directive (with the iRO Refinement System reference): *"expand on
> blacksmithing/forging where materials are formed into armor/weapons, then refined.
> Similar systems can be used for potion brewing, cooking, Book writing (guild members
> can write books based on their skillset for other members to study). Majors should
> have specializations like Melee → Swords or Magic → Offensive."*

Four systems, one grammar: **craft it, then push it further — at a price.**

### Refinement — the +N system (Ragnarok Online's grammar, guild-sized)

A forged piece now carries a **`plus` level (+0 → +10)** on top of its quality — shown
RO-style in its name (*+5 Steel Sword*). The smith's week gains a third mode:

- **Forge** (new piece) · **Rework** (the old quality-rework, renamed — closes half the
  gap to the smith's own ceiling, restores durability) · **Refine** (+N, the new risk game).
- Every material has a **safety limit** (`MATERIAL_META` in smithing.js): iron/leather +7,
  steel +6, mithril +5 — up to it, refines **always succeed** (RO's safe line: the finer
  the material, the earlier the risk starts). Past it, success rolls a per-material table
  (RO Lv1–3 weapon columns, ~60% → ~19% at +10) **plus the smith's Practice/10** as a
  Mastersmith-style bonus, and **failure destroys the piece** — story, slotted materia
  and all. The Weekly Assembly reports the shatter.
- Each attempt costs 1 ore of the item's material + a gold fee (10/25/60g by tier) —
  refining mithril is a rich guild's game, exactly like RO's 5,000z Oridecon clicks.
- Each +1 adds **flat power** by material (iron/leather +2, steel +3, mithril +5 — RO's
  per-weapon-level ATK), folded into `gearBonus` and `itemScore`, so the quartermaster
  values a +7 blade correctly and tournament odds tell the truth (anti-lie).
- **Protective reagents** (the Enriched/HD/Blessing tier, made by the OTHER trades):
  - 🫙 **Tempering Oil** (Alchemist brew, emberroot+sunleaf): a failure only knocks the
    piece **−1** instead of destroying it (RO's HD ore).
  - ⭐ **Smith's Blessing** (Enchanter craft, mithril-laced): a failure **keeps the
    level** (RO's Blacksmith Blessing). Consumed per attempt, like the ore.
  Both are `reagent`-kind materials shelved in the Forge stockroom — the first goods one
  trade makes *for* another trade. The refine panel picks the guard per smith.

### Forging — materials into armor & weapons (recipe spread)

The recipe book doubles: steel/mithril **armor**, and two Wilds-fed pieces — a
**Leather Jerkin** (3 pelts) and a **Hunter's Bow** (pelts + iron band) — so the hunt →
forge → refine loop runs on home-won materials. `leather` joins the material table
(refines with pelts; safe +7 like iron).

### The Scriptorium — members write the Library (and the shelf teaches back)

Books stop being import-only. Two moves:

- **Writing** (the Historian's second mode, Library room): a member with **Theory ≥ 30**
  in a subject can spend the week **penning a volume** on it — tier 1/2/3 at Theory
  30/55/80 (a practiced Historian's scribe-craft nudges the threshold), stamped
  **`author`** and `source:'penned'` on the shelf. The Historian finally has a real
  product: they turn one member's mastery into everyone's multiplier.
- **The shelf teaches the shop floor**: every trade week (forge/rework/refine, brew,
  cook, enchant) the worker **consults the best book on their subject** — a small weekly
  Theory gain (`learnOnTheJob`, scaled by book tier). This closes the loop that was
  silently broken: Cooking/Enchanting Theory had NO growth path (study only offered
  Metallurgy/Alchemy), so cure-meat, hearty stew and planets 1+ were unreachable gates.
  Study now offers all **four subjects** (`BOOK_SUBJECTS` + titles for Culinary Arts 📙
  and Enchantment 📘), and a novice cook with a stocked shelf learns on the job.

### Specializations — the major's second declaration

At **discipline level 2** a member may declare a specialization inside their major
(`SPECIALIZATIONS` in curriculum.js, picked on the Curriculum panel):

- ⚔ Melee → 🗡 **Swordsmanship** · 🪓 **Axes & Maces** · 🛡 **Shield & Guard**
- 🏹 Ranged → 🏹 **Bows** · 🎯 **Crossbows** · 🔪 **Thrown Blades**
- ✦ Magic → 🔥 **Offensive** · 💫 **Restorative** · 🌀 **Warding**

Phase-1 effects (same altitude as techniques): **+15% discipline XP** in that discipline,
and a **gear affinity** — an equipped piece whose kind matches the specialization
(sword → Swordsmanship, bow → Bows, armor → Shield & Guard…) contributes **×1.15** to
`gearBonus`. The declaration shows on the member sheet's identity line
(*⚔ Melee · Swordsmanship*). Phase 2 (the gear→engine bridge) will make specs reshape
the arena kit. Also fixed here: discipline XP accrual was dead code (`res.trained` vs
`entry.trained` — the gate could never pass), so disciplines actually level now.

**NEXT:** spec-specific techniques; refine events (a visiting master smith week, RO's
refine-rate events); selling penned books to the market; enchanted armor kinds for the
magic specs to claim as affinity.

## Visual direction — 2D sprites in a 3D world (owner 2026-07-09)

> Owner directive: *"Visually, I'd like to do something like Shining Soul or Ys VI. 2D
> sprites and 3D world."*

The target look: crisp 48px pixel-art characters standing IN a world with real depth — Ys VI /
Shining Soul's grammar of billboarded sprites over dimensional ground, not flat top-down tiles.
The good news: **the game already speaks this language in CSS.** The ranch is a
`rotateX(52°)` ground plane under `perspective:1150px` with counter-rotated "paper standee"
sprites; the action arena is the same recipe at 50°. The direction formalizes that grammar and
carries it to canvas when scale demands it. Three stages, each shippable:

1. **Now — CSS-3D dioramas + THE CAMPUS (shipped 2026-07-09).** Ranch + arena stay the
   reference implementation: the camera numbers (52°/1150px), standee counter-rotation, y-sort
   z-index (`2 + round(ty*10)`), and the baked procedural ground ARE the art direction. The
   ranch is now a **22×22-tile navigable campus** (`RANCH_GS`, ranch.js): districts — the Great
   Hall avenue, a crafts quarter (Forge/Armory/Laboratory/Apothecary), a worn **training yard**,
   the arena, a pond, tree-lined borders, a south gate — over a ground baked by `bakeCampus`
   (crucible.js) from the procedural tile painters (grass/path/water/rocks/flowers). A real
   **camera** navigates it: drag to pan, wheel/pinch/± to zoom, ⤢ to survey the whole estate
   (the transform composes `scale·translate` after the plane's rotateX, so panning moves along
   the ground). And members **visibly perform their weekly assignment** (the MR ask): a duty
   loop replaces wandering — POW slashes the sandbag, DEF parries at the pell, SKL runs forms
   at the dummy, SPD dashes-and-jumps the poles, INT sits at the meditation stone, VIT rucks
   the yard perimeter, spar pairs square off at the arena, smiths hammer (side-on) at the
   Forge door, alchemists stir at the Laboratory, questers muster restless at the gate, the
   resting drift between the pond and Quarters. Missing equipment = shadow-drilling the open
   yard, so placing gear visibly upgrades the theater. Off-screen actors skip their per-frame
   recomposite (rough viewport cull); a tick error logs and never freezes the loop; grow the
   grid number for a bigger estate. New scenes reuse this recipe; sprites always render
   integer-scaled, `image-rendering: pixelated`, no smoothing.
2. **Mid — the single scene-canvas renderer** (the perf plan's path, unlocks crowds): replace
   per-character `<canvas>` + DOM moves with ONE canvas per scene — project the same tilted-
   plane camera in code, blit **baked per-character atlases** (spawn-time `compositeCharacter`
   → used frames × facings at native 48px, ~0.7 MB/char), painter's-algorithm y-sort, viewport
   cull, low-Hz sim tick. This is the *same* look at 100 characters (the war-exercise renderer,
   Modes Phase 5) — the diorama grammar, drawn faster. Ground graduates from painted-flat to
   parallax strips/heightened tiles as art allows (`public/assets/tiles/` + a `TILES_BASE`
   in `config/assets.js` when real tile art lands).
3. **Later/Steam — true-3D ground, still 2D sprites** (optional): a real perspective scene
   (Three.js or hand-rolled) with a textured ground mesh and **billboarded sprite quads** —
   Ys VI exactly. Only if stage 2's projection wants real camera moves (rotation, dolly);
   nothing before it depends on this.

**Constraints carried from the perf analysis** (see ARCHITECTURE.md + the render map): never
per-frame per-character canvases; bake at native 48px, not display size; `willReadFrequently`
on bake-time scratch canvases; nameplates/HP into the canvas or a batched overlay; every loop
gates on its screen being active. Characters stay Elements-compositor output — the art
investment is in **world** art, not redrawing the cast.

## The Battlefield — one against a thousand (owner 2026-08-22)

> Owner directive, with *Dynasty Warriors: Origins* on the screen: *"As an additional mode to
> test, I want it to be like Dynasty Warriors. We already have the capability to spawn hundreds
> of characters. They should wear faction colors (different faces, hair, skin, etc) but wear
> generic gears. Some characters are 'leaders' that have more advanced armor and are more like
> Action Arena opponents. This can be player 1 vs 1,000 (for example), or the player can also
> command an army for 1,000 vs 1,000 (not hard numbers, just ideas)."*

**Where it lives, and why only there.** The capability the owner names is the Unity crowd's
(`Crowd.cs` — 1,472 spectators, one atlas, one draw call). The web arena is hard-wired to
`p1`/`p2` with a DOM canvas per fighter and cannot carry it; the web stays the spec for the
*rules* (one resolver, one reach law, one collision fact), not for this lens. A recorded
divergence, not a port gap.

**Slice 0 — SHIPPED 2026-08-22 (Unity).** Two title doors beside the other exhibitions —
*The Battlefield · one against a hundred* and *· two armies* — walk the arena's own gear draft
and land on an **open field** (`ArenaField.OpenField`: turf to the outskirts, a scatter of
boulders, no stands). Two companies, **Crimson** and **Azure**, are *uniforms*, not tints: one
tunic stem in one of the sheet's own colourways (`top14_c1` / `top14_c3`, chosen by sampling
every shipped colourway) worn over faces, hair and skin the generator rolled — the tint wash the
crowd once wore was the tell that it was wallpaper. **Conscripts** are spawn numbers read by the
unchanged resolver: scores 6–9, 8–12 HP, a sword, the plain Strike. **Captains** are arena
opponents: `RollStats`, round-6 refined gear, armour and kit from that gear, the duel's 0.9 s
cadence, a name. *The musou trick:* a target is engaged by at most four conscripts; the rest hold
a ring at 2.4 tiles and drift, stepping in as a slot opens; conscripts feint 45% of the time.
*The rout:* when a company's last captain falls the company breaks and leaves the field. HUD: the
K.O. count, both companies' census, the captain's bar by name, the rout banner. `[` `]` scale
the plan, `R` re-deals, F re-deals. A `SpatialGrid` (2-tile cells, rebuilt per frame) makes a
thousand bodies linear rather than quadratic; `Fighter.Step` gained a listed-neighbour overload
with the same circle law. Files: `Battlefield.cs`, `SpatialGrid.cs`, `BattlefieldTests.cs`
(12 pins), the open-field branch in `ArenaWorld`, the smoke player photographs it.

**Roadmap (each step keeps the build green):**
1. **Perf proof at a thousand** — an `ArenaPerfTests` row at 500 / 1,000 / 2,000; the APK
   measurement ([[project-unity-pivot]]'s standing rule: WebGL is a look, the APK is the
   number); the far ring skips breath and skirt quads (LOD); the horizon past the outskirts.
2. **Command an army** — the *Warcraft-3-light* direction above, finally with a field to stand
   on: orders to your company (Follow · Hold · Charge · Flank), captains take them, conscripts
   follow their captain; a rally banner; on touch a held radial. No unit micro.
3. **The stage grammar** — objectives the reference is made of: camps to take (a banner
   flips a company's colour), a commander to fell, an escort to bring off the field,
   reinforcement waves; **morale** drives the rout earlier than "last captain" (captains' kills
   raise it, the hero's K.O. streak breaks it). Fields authored on the drafting table as a
   `battlefield` map kind.
4. **The musou blow** — the held charge (K2) becomes the area strike: one swing, the resolver
   rolled once per body in the arc; a K.O. streak counter; curriculum techniques
   (`DISC_TECHNIQUES`) land as the hero's arts.
5. **Into the guild** — a *Muster* event on the calendar (the decree holds: no free-fight doors
   in guild mode): the roster marches as the captains of your company, levies hired by the
   week (**amended 2026-08-23**: the levies are the academy's own apprentices — see "The
   Hundred of Every Hall" below; hired levies are repealed), casualties through the injury
   ladder, spoils through the economy; [Simulate] resolves by power × numbers and is never
   removed.
6. **Creatures on the field** — beast tribes and wolf packs as the enemy once the
   creature-in-arena branch exists ([[project-the-wilds]] phase 1).

## The Overworld — a world you ride across (owner 2026-08-22)

> Owner direction, with the second *Origins* screenshot: the 3D world map with guilds and towns
> on it should be *"something more like this"* — a miniature landscape of real mountains, rivers,
> forests and roads, castles and towns standing on it as models, and the hero riding across it
> at diorama scale.

**What we already have.** `WorldGen.Height` is a continuous heightfield that until the globe
shipped was only ever used to pick a biome letter; `DelveWorld` turns any height chart into one
static mesh by the one face rule; `DelveWalker`/`EstateWalk` walk such a chart in three lenses;
the RPG Assets bundles carry world-scale terrain, mountain, tree, town and bridge sheets that
nothing reads yet (`tf_newworld_terrain_master`, `tf_newworld_treesmountainsB`,
`overworld_mountains`, `worldmaptowns_extras`, `woodbridge`, `wmountainpath`). The globe and the
flat oval stay: the globe is the *survey*; this is the *ride*.

**The scale law (to decree before building).** The overworld is a MODEL: a world tile is a
league, and the hero is a figure standing on the model, the size of a town — exactly the
screenshot. ONE SIZE FACT still holds *within* the lens (the hero is `PLAYER_H` against the
overworld's tile); what is declared is that the overworld's tile is not the delve's.

**Roadmap:**
1. **Relief as ground** — quantise `Height` into a level chart (4×4 tiles per world cell →
   256×128; sea, shore, lowland, hills, mountains as levels), biome letters choose the turf;
   derived from `Height` alone (no new chance draws, so the C# stays exact and
   `dev/dump-world.mjs` pins it).
2. **Dressing** — peaks, trees, rivers (moisture flow, deterministic) and roads between the
   seats (least-cost over the levels — new surface, fixture-pinned) from the sheets above.
3. **Halls and towns as buildings** — the 32 seats as keeps, the 8 towns, the Wilds as
   cave-mouths; stepping onto one opens the dossier the globe already draws (contacts, venues).
4. **The rider** — an `EstateWalk` session on the world chart; travel is walking; distance
   costs weeks on the calendar (the errantry hook, K6).
5. **Three lenses on the world** — survey (the globe's orbit), ride (over the shoulder), map
   (top-down); the flat oval remains the founding select.
6. **Encounters on the road** — a hunt at a Wilds mark; bandits as a small Battlefield
   (one against twenty) — where this roadmap and the one above meet.

## Training drills — performed, not only simulated (owner 2026-08-22)

> Owner directive: *"Let's also make a roadmap for adding actual training drills for each
> skill type. Like Monster Rancher, this can range from pushing boulders, hurdling obstacles,
> blocking or striking projectiles, keeping balance while meditating, etc. These can be
> simulated or performed by the player as individual characters."*

**The principle that keeps the altitude.** A drill is a VERB OF A LENS YOU ALREADY HAVE — never
a bespoke minigame engine (the cut list is amended, not repealed). Every drill exists three
ways: *simulated* (today's `applyTraining`), *watched* (the duty loop on the grounds — the
member performs it, shipped 2026-07-09), and *performed* (the player takes the member, the way
"Take control of <name>" already hands them a fight). Performance feeds the SAME result shape:
`applyTraining(hero, drill, intensity, bias, { equipMult, performance })` ↔
`TrainingRules.ApplyTraining(..., WeekOpts { EquipMult, Performance })`, a 0.6–1.5 multiplier
in the slot the stations already use, and the conduct line (exceeded / solid / failed) read off
the score. Anti-lie: the drill card shows the band a performance can reach.

| Stat | Drill (training.js) | Performed as | The verb, and whose it is |
|---|---|---|---|
| POW | Weight Drills | **Push the boulder** — shove a boulder the length of the yard before the bell | *push*: a movable prop body (new rules verb; `prop-volume` collision) |
| DEF | Shield Wall | **Hold the wall** — a trainer looses arrows and stones; raise the guard on the beat | *guard* + the arena's projectiles (both exist) |
| SKL | Weapon Forms | **Strike the marks** — dummies rise around the yard; hit them as they rise | *swing* vs a dummy with an AC (exists) |
| SPD | Sprint Course | **Run the poles** — hurdles on a timed course, a miss costs a beat | *vault*: a timed use of a low prop (new rules verb) |
| INT | Meditation | **Keep the stone** — sit; hold the drifting centre against gusts with the look | *hold*: the look seam (`createLook` / the pad's right stick) |
| VIT | Endurance March | **The ruck** — laps of the yard under a pack; pace it or burn out | *walk* + stamina (exist) |

Spar stays a bout (both lenses). Techniques from the curriculum unlock as a drill's "exceeded"
outcome at discipline thresholds (`DISC_THRESHOLDS`).

**Roadmap:**
1. **The seam** — `performance` in both builds, fixture-pinned (`dev/dump-training.mjs`
   extended); the drill card's band; a performed week is the same assignment plus a *perform*
   verb at the station; [Simulate] stays on every card.
2. **Stations on the Unity grounds** — port `stations.js` (Unity derives `EquipMult` from the
   yard tier alone today; the per-drill stations close that divergence); the yard slots become
   the drill grounds.
3. **Three verbs on existing systems** — Hold the wall, Strike the marks, The ruck. Zero new
   engines.
4. **Two new rules verbs** — *push* and *vault* — in the shared walker (both builds; the
   boulder push is also a Battlefield mechanic waiting to happen).
5. **Keep the stone** — the balance hold on the look seam.
6. **Curriculum and coaching** — Pillar C schedules drills; the player performs one member's
   week and the rest simulate (the EA Superstar scope); apprentices drill too.
7. **Errantries** as performed multi-week drills with a return-week boss (K6).

## The World Editor — one tool for every place (owner 2026-08-23)

> Owner directive: *"World Editor: The one now is...bad. I've referenced Hexen, Wizordum,
> Halo. All have editors. All allow editing walls, adding bridges, adding water. This is a
> well understood feature. A lot of progress is needed here to build future maps and arenas."*

**What the complaint is actually about.** Walls, bridges and water are all authorable
today — walls are painted chars (`B`/`b`) or laid whole by the X+drag room gesture, bridges
are the two-surface `n`/`u` cells that keep their trench, water is a first-class overlay in
both builds (animated in Unity by `DelveWater`). What the three references have that we
genuinely lack is three other things, and naming them right IS the roadmap: **(1) a world
that answers** — there is no switch, trigger, lift or scripted event anywhere in the schema;
`locks:[[x,y]]` on doors is the entire interactive vocabulary, where Wizordum wires relay
graphs down a corridor and Hexen's whole game is a switch here opening a wall there.
**(2) breadth** — `PACK_KINDS` is `delve|arena`, so the battlefields, wilds, venues and
world charts the game now needs cannot be authored at all (the Battlefield roadmap already
promises a `battlefield` map kind it cannot have). **(3) the editor that moves trails the
frozen spec** — the web table (2,725 lines, reference-only since 2026-08-23) still out-verbs
the Unity one: no room or fill gesture, no Surfaces/paint tab, and no `levels` layer in
`MapPack`, so a chart sculpted past the char vocabulary **walks flat in Unity**
(`map-pack-validate.js:204`'s standing warning).

**Where it lives, and why only there.** The Unity drafting table (`MapEditorScreen.cs`,
`MapEditorView3D.cs`, `MapDrafts.cs`) is THE editor now; the web table is its parity floor,
never the tool that grows. And Unity already holds the one card the references play: it
edits **inside the game's own renderer** — the real `DelveWorld` to a RenderTexture, rays
picking cells and faces — which is the thing Wizordum's angled camera approximates and
Forge simply is. **THE FORMAT IS THE GAME:** everything the editor places is a fact in the
one pack schema, read by one loader (`MapPack.Parse`, shipped and drawn alike), checked by
one validator, walked by every lens. An editor feature with no schema fact behind it is
refused.

> Owner directive, 2026-08-29 (with five Wizordum frames): *"there needs to be a way to
> apply skins/layers to faces of building blocks. blocks can be generic gray building
> blocks before skins are applied, or they can be pre-determine as dirt, wood, etc.
> ex: place dirt blocks across map. then add grass to top layer of some blocks."*
> **Answered the same day, on the shipped schema** (no new fact — `paint` owns standable
> tops, `walls` owns verticals and unstandable crowns, per-cell 1×1 rects, later wins):
> the Surfaces tab landed in Unity (every distinct floor as a chip named by its looks),
> the Paint hand is face-aware in the 3D view (top tap paints the cell, side tap paints
> the ground in front — the climb redirect's twin — and PaintStrip aims identically),
> pre-dressed **Block · material** chips lay a 'B' block and its walls rect in one tap or
> one stroked run, and the generic block is simply an undressed 'B' wearing the map's own
> stone. `MapDrafts.Clone`'s paint drop (the bug named below) was fixed FIRST, and
> `DelveWorld.ThemeAt/WallThemeAt/GroundThemeAt` went public+static so the editor's
> readout and the drawn world are one resolver. Named exclusions, kept for web parity:
> stairs read the region/base theme (paint does not reach treads) and an 'n' bridge deck
> prefers plank — both builds agree, and re-deciding that is an owner call, not a port's.

**Roadmap (each step keeps the build green):**
1. **Parity closes** — Unity gains the web's missing verbs: X+drag room, V+drag rectangle
   fill ~~, the Surfaces/paint tab~~ (**the Surfaces tab and the `MapDrafts.Clone` paint
   fix SHIPPED 2026-08-29** — see the face-skin directive above); the prop palette
   enumerated from a public `DelveAtlas.VolumeIds` instead of the hand-typed 43 rows; and
   the **levels layer parses in Unity** so the 2026-08-21 sculpt law finally crosses
   ([[project-map-editor]]'s recorded gap).
2. **The chrome pass** — the Wizordum build-order rows still unbuilt: minimap, ghost labels
   on flags, focus level (active level bright, the rest dimmed, edits clamped), spawn
   difficulty tiers; and one addition of our own, redo beside the 60-deep undo.
3. **Height for things** — props gain a level slot: a table on a terrace, a brazier on a
   bridge deck. The lint that pins furniture to level 0 flips from refusal to
   surface-must-exist; the collision circle and the rest-on law already hold at any height.
4. **The wiring** — the world answers: `links` enter the schema as authored edges — switch
   → door, plate → portcullis, lever → lift, counters and relays after — and any placed
   thing may be an activator. This is a RULES system every lens must honour, not an editor
   feature; the delve's bump-doors, keys and locks are its shipped ancestors. Refusal: no
   scripting language — Hexen's ACS stays on the shelf. A link is a data edge, not code.
5. **Every kind of place** — `PACK_KINDS` opens: `battlefield` (camps, banners,
   reinforcement gates — the field the Battlefield's stage grammar is waiting to stand on),
   `wilds`, venue dressing for arenas (the STADIUM scout), later `world`. Arena charts are
   editable TODAY — but the one arena-only schema fact, the `foe` corner, has no hand in
   either editor; it gets one here. The estate stays derived (it opens as an editable copy,
   never the source — the room layout is its author) and the tactical kind waits its turn:
   both named rather than quietly dropped. Each kind brings its own lint duties, never its
   own editor.
6. **Edit in the lens** — Forge's mechanic, and the prize the Wizordum reference named:
   while walking a draft (Walk It already round-trips through all three cameras), a build
   hand places, turns and erases from inside the walk. The plan canvas stays the precision
   instrument.

## The Hundred of Every Hall — 32 schools, 32 armies (owner 2026-08-23)

> Owner directive: *"Training for a 100 character army. Each guild. 32 guilds in the world.
> Each guild has their 'speciality' or focus; swords, fire magic, evasion, healing,
> potions, etc."*

**What stands, and what is missing.** The 32 halls exist as identities and nothing more —
`SEAT_ROSTER` / `WorldMap.Seats` carry id, name, realm and a keep sprite; no roster, no
power, no focus. Opposition is individual: the rival pool is drawn and retuned per bracket
round, and a hall "has" rivals only by the `rivalSeat` hash. The hundred exists in pieces:
~106 counted dormitory beds and a 100-apprentice class walking at 16.7 ms; a quarters cap
of 120; the Battlefield's companies of 100 behind the engage ring — but its soldiers are
anonymous conscripts, and of everything your guild is, only a commissioned apprentice's
FACE crosses onto the field today.

**Three decrees.**
- **THE SPECIALTY IS A SEAT FACT.** One focus per hall, stored by seat id (save-safe the
  way contacts and venues already are), drawn from mechanics that exist — never a display
  label (the materia rename already taught what a rule keyed on a NAME costs). It expresses
  everywhere the hall appears: its rivals, its dossier, its army at a muster.
- **THE ARMY IS THE ACADEMY.** The hundred is not bought at a door. Roster members march as
  captains carrying their real stats, gear and kit (the member→fighter bridge —
  `ToFighterStats`, `BattleAc`, kit from `Equipped` — exists and stops at fighter 0
  today); apprentices march as levies whose band
  derives from readiness and aptitude — the class the semester plan taught IS the army it
  fields. Anti-lie: the muster sheet shows the band training bought.
- **A FOCUS IS TAUGHT, NOT WORN.** The player's hall earns its focus from its school. The
  substrate is the curriculum — majors, discipline levels, specializations — and it is
  web-frozen; porting it to Unity is a prerequisite step of this roadmap, not a
  nice-to-have.

**The specialty menu, priced honestly.**

| Focus | The mechanic it rides today | State |
|---|---|---|
| Swords · Axes & Maces · Hammers · Bows · Crossbows | gear types with their own damage/reach/hands + curriculum specializations (Swordsmanship…, ×1.15 affinity) | gear in both builds; curriculum web-frozen, unported |
| Fire — and each of the seven elements | materia bonuses (Flame Strike / Fire Blast are engine rows) | rows in both builds; the web applies bonuses to every combatant, Unity only to the played arena fighter — a gap step 2 inherits |
| Healing | the Mend verb (2d6; the AI self-casts under 40%), the Restorative spec, the Church direction | both builds |
| Potions | the Alchemy trade; the battle bridge's items channel (items in, itemsUsed out) | trade in both; nothing maps brews into the channel yet |
| Evasion | **nothing** — no evade term exists in either build, and the FP lens's private `BLOCK_EVADE` cannot be it (ONE RULES FACT) | needs its own decree in the shared resolver first |

**Roadmap (each step keeps the build green):**
1. **The seat learns its trade** — a `focus` on each of the 32, authored in `SEAT_ROSTER` /
   `WorldMap.Seats` (deterministic, fixture-pinned); the globe dossier and the world map
   say it; hall standing — the first per-seat state beyond contacts — opens its ledger.
2. **Rivals wear their school** — the mint and the retune read the rival's hall: archetype
   lean, gear kinds, materia colours. Power retuning is untouched, so the anti-lie holds —
   the number on the board is still the number the resolver checks.
3. **The curriculum comes to Unity** — majors, discipline levels 0–5, techniques and
   specializations port (Unity's "Discipline" today is a conduct stat, and
   `Professions.Disciplines` already spends the word on the three trades — the combat
   majors arrive needing their own name); the player's hall DECLARES its focus from what
   its school demonstrably teaches. The authored focus on the player's own seat is the
   school's inheritance — the founding default a declaration supersedes — and the dossier
   shows the declared one.
4. **The hundred musters from the ledger** — roster members take captain slots with their
   stats, gear and names; commissioned apprentices keep their minted Name; levies derive a
   conscript band from readiness × aptitude; the census is the real academy + roster count,
   and casualties write back through the injury ladder. The atlas ceiling (28 soldier looks
   per company) is the honest constraint: levies wear the school's uniform, not a hundred
   faces. Levy training rides `AcademyTerm` as it stands — captains stay on the per-member
   MR loop, because that loop is the game.
5. **The Muster on the calendar** — the Battlefield's step 5, now against a NAMED hall: a
   `muster` event type (one `Events` row, one stakes row), `venueId` ported, marching costs
   the week. **The other hundred is minted, not stored:** the named hall's captains are its
   own circuit rivals (the pool `rivalSeat` already binds to it), mustered in its colours
   and focus; its levy band and census derive from the hall's standing — deterministic off
   the seat, fixture-pinned, so power × numbers has a source on BOTH sides. Standing moves
   with the season's results: the hall you march on next year is not the one you scouted
   this year. [Simulate] is never removed; played is the Battlefield. Hall W-L-D standings
   make the 32 a league the season can point at.
6. **The war of the schools** — focus against focus on the field: the fire hall's captains
   burn, the healing hall's line outlasts its wounds, the potions hall drinks its own
   stock — and the evasion hall waits, honestly listed, until the evade decree is written.
   No unit micro, no free-fight doors, no second combat engine — the standing refusals all
   hold.

## The Three Watches — a day you can stand inside (owner 2026-08-24)

> Owner directive: *"I think the daily activities should be split into three. Morning,
> Afternoon, and Night. it works well with Study (mental) one section, practice (physical),
> and sleep. or double majors can double down. this means advancing days instead of weeks.
> this structure can be more rewarding if a player chooses to role play as a particular
> character. for EA reference, the Superstar mode."*

This amends two standing laws, and both now carry the dated note in place: the cut list's
day-granularity refusal (above) and the Monster Rancher rule that the tick is a week
(REFERENCES.md). What survives of the old law is its load-bearing half:

**THE WEEK IS THE SUM OF ITS DAYS.** Every system that exists resolves at the week
boundary and keeps doing so: `WeekResolver.Advance` is the game's one verb, its order
fixed (hunts → events → the spar PAIRING → the member loop, where the bouts and drills
actually resolve → the academy → the purse settles once → the Wayhouse recruit board
re-rolls → `Week++` → the calendar tops up), its randomness one injected stream whose
DRAW ORDER the tournament fixture counts. The day is the tick the player advances; a day
ACCUMULATES — watches worked, wear taken — and the boundary resolves the totals.
Weekly-nonlinear rules stay weekly and run once: the single slack roll, wear (fatigue
plus twice stress) against the 185 injury threshold, `Age += 1`, injury weeks. The pin that makes the whole
directive safe: **a week advanced day by day on its defaults produces the identical
ledger to the week resolved whole** — bit-for-bit, fixture-checked, the draw counter as
the trap. Zooming in changes outcomes only where the player actually changed a decision
or performed a verb. That is the EA law applied to time: a day is a camera on the week
until you touch something.

**The watches.** Morning is STUDY, the mental watch — `study:<discipline>` theory today,
the curriculum majors when they port, books when the shelf does. Afternoon is PRACTICE,
the physical watch — the six drills, the spar, the stations. Night is SLEEP — the rest
verb finally holding its own slot: the recovery numbers (−35 fatigue, −20 stress,
+25 stamina, each recover-trait-scaled, and a flat +5 morale) become the nights' work,
split so the week-sum law holds against the training fixture. A member's default day
DERIVES from their weekly assignment — a Weight-Drills week practices weights, studies
the major, sleeps — so nobody schedules 21 slots; the assignment is the day-plan, and
"advance the week" simply runs the remaining days on their defaults. EVERY assignment
derives, not only training: a craft week works its bench in the afternoon and studies its
theory in the morning (the learn-on-the-job rule finally has a slot to live in); an away
week — quest, hunt, an errantry — belongs to the road, its days advancing without
choices. (Vocabulary settled deliberately: these are a DAY's watches; the older "Watch
tier" of Sim/Watch/Play is the spectate rung and keeps its full name.)

**Double majors double down.** The double major traded the elective away for a second
discipline, and under the weekly grain that was quiet starvation — one drill fed exactly
one discipline per week ("slower on both roads" was emergent, never a rule). The watches
give them what the week could not: BOTH waking watches on the two disciplines, every day.
The elective member's study watch is their trade instead. Burning the night for a third
working watch is legal and priced by the wear math that already exists — fatigue plus
twice stress against the threshold; the injury ladder is the answer to a semester of
skipped sleep.

**What night needs, honestly.** No sub-week time exists anywhere — the week is the
smallest unit in either build, and the sun is compile-time constants (light is dressing).
Night on the grounds is therefore a LIGHTS row — a theme mood, the honest cheap path —
not a new shader term. Roster members have no beds: the dormitory counts and seats
apprentices only, though its own header decree already names "100 guild members" —
`Hero.Bed` and a counted Living Quarters chart are owed: the counted-beds law extended to
members, the same debt the Hundred's hundred implies. A sleeper LIES as plan art in the
ground plane — the corpse ruling; no faked pose.

**Roadmap (each step keeps the build green):**
1. **The clock** — `Guild.Day` (0–6) under `Guild.Week`, saved under a versioned key;
   *Advance Day* beside *Advance Week*, and Advance Week ≡ seven Advance Days,
   pinned bit-for-bit against the whole-week resolve. An order-pinning test on
   `WeekResolver.Advance` lands FIRST — today the order is pinned only indirectly.
2. **The watch ledger** — each day derives its three watches from the weekly assignment;
   days accumulate, the boundary resolves; every existing fixture passes unchanged. And
   the day must SHOW its accumulation, honestly labeled: watches worked, wear taken, the
   conduct band forming — provisional numbers that settle at the boundary, where results,
   gold and recaps land as they always did. Seven silent clicks would be the directive
   refused; the legible day ledger is part of the clock.
3. **The day card** — the role-play surface: follow one member through their day (the
   take-control seam is the door), their three watches become three choices, and the
   grounds show it — the duty loop already stations everyone by assignment; now it
   stations them by watch. Only the afternoon has a performed verb today (the drills'
   roadmap); morning and night are menus until study and sleep earn verbs of their own —
   named, not hidden. And the dial must hold on an APPRENTICE too: rising from the
   academy is the Superstar fantasy at its purest — their day is the class's lesson,
   until the day they are pulled out or graduate.
4. **Doubling down and the night** — double-major watches; sleep splits the rest verb
   across nights; the skipped night priced by the standing wear math; `Hero.Bed` and the
   counted quarters.
5. **The estate after dark** — the third watch made visible: the night LIGHTS row,
   sleepers abed as plan art, the duty loop's night shift. Dressing only; no rule
   reads the dark.
6. **The event takes its day** — an event wears a day of its week on the calendar, and
   advancing onto that day is where the PLAYED path opens (the armed plan fires there);
   the default simulate stays at the boundary, identical, with the draw-order pin as the
   proof. The followed member's week gains the shape the Superstar reference is made of:
   training days that point at a game day.

## Commanders and Masters — every domain gets a face (owner 2026-08-24)

> Owner directive: *"I'm thinking 'commanders' should be leaders of a domain; forge,
> apothecary, etc. or maybe they should be leaders of their respective combat
> proficiency."*

**The answer to the "or maybe" is both — one appointment system, two words.** The seed
already exists, and only one of it: the web's `guild.trainer`, the Head Trainer — an
appointed Hall-of-Famer worth +15% to roster training and ×1.3 to apprentice development,
beside the field already declared for exactly this (`hero.staffRole`, "post-retirement
posting" — declared and migrated, never yet written; the shipped appointment stores a
snapshot on `guild.trainer`) and guild.js's own comment declaring the hook: *"staff
slots generalize later."* Later is now. **MASTERS head domains** — the Forgemaster, the
master Apothecary, the head of the kitchen, the Librarian: titles minted for the posts.
What roles.js already gives every domain room is a titled FACE (Blacksmith at the forge,
Apothecary, Cook, Scholar at the library) for the master post to stand above.
**COMMANDERS lead combat proficiencies** — the sword-commander, the fire-commander;
the disciplines and specializations are their taxonomy, which is one more reason the
curriculum port (the Hundred's step 3) comes first. The vocabulary is settled
deliberately, because "commander" is already claimed twice: the Battlefield's captains
and the Academy's commissioned apprentices. Both collisions become convergence — on the
field, a proficiency's commander IS a captain of the Hundred, and the Academy's
commission lane becomes the *cadet*-commander serving under them. "Master" already speaks
craft in this codebase (Mastersmith); it stays on the domain side.

**What an appointment does — three effects, all on seams that exist:**
- **The multiplier.** The trainer's ×1.15/×1.3 generalized per post; and the craft
  screens' `Guild.Selected` cursor — today literally "who works the room" — gains a
  standing answer: the master works the bench when nobody else is chosen.
- **The teaching.** A study watch in a domain is tutored by its master (the Academy's
  ×1.3 tutoring precedent, now pointed the other way).
- **The field.** A proficiency's commander takes a captain slot at the Muster, their
  proficiency's levies mustered under them.

And a post costs a day: under the Three Watches, an active master's bench default and
tutoring are watches of THEIR day. An appointment is an assignment with a title, never a
free aura.

**Roadmap (each step keeps the build green):**
1. **The post** — `staffRole` generalized and ported (Unity's own comment admits "this
   fork has no roles system"); appointed from the roster or the Hall of Fame, saved under
   a versioned key; the Head Trainer becomes the first row of a table instead of a
   special case.
2. **Masters of the trades** — forge, apothecary, kitchen: multiplier, bench default,
   study-watch tutoring.
3. **Commanders of the proficiencies** — after the curriculum port; they captain the
   Muster's companies and colour its order of battle.
4. **The cadet lane folds under** — the Academy's "commission" becomes cadet-commander,
   ranked beneath the proficiency's commander it apprentices to.

## The Zoom — Manager and Superstar were one game all along (owner 2026-08-24)

> Owner directive: *"I want the player to zoom in as far as they want, but also simulate
> what they don't find interesting. essentially merging Manager mode and Superstar
> modes."*

This is not a new law — it is the EA law the project was built on: one simulation always
running, and control only decides which decisions the player takes over. What the
directive changes is the shape of the control: the scopes stop being MODES you pick and
become a DIAL you hold per thing. Superstar is the dial held low on one person; Manager
is the dial at rest. No save carries a mode; absent any focus, every save already IS
Manager.

**The rungs, honestly inventoried.** Season (simulate-only by design) → week (the drills
roadmap's step 6 designs the played week) → **day (the rung that was missing — the Three
Watches build it)** → event (the web plays or simulates per card through the Tourney
Board; Unity carries the marked SEAM, the round-tripped `Played` flag, and an
`AskTournaments` toggle that honestly says nothing reads it yet) → round (fight on /
simulate the rest, between bracket rounds) → moment (spectate's grab-the-reins at any
turn boundary — the finest zoom that exists; the Battlefield is already one fighter
played inside a thousand simulated bodies) → walk (take control of any member on the
grounds — and, once the Three Watches land, of an apprentice living the class's day).
The fine rungs are combat's alone: a forge, kitchen or study moment stays a judged check
at every zoom (the standing minigame refusal) — the dial shows no rung there because
there is none to play.

**The build.** The control layer was always Phase 2 — `guild.control` with `playerOwns`
and `autoManage` — and the dial gives it its true shape: `focus`, not `mode`. Follow one
person and every card they stand on offers play; everything else simulates on the prefs
that exist (`battlePrefs` grows keys beyond `tournament`). It lands Unity-first (the web
is frozen), rung by rung as each played path arrives, under the standing honesty rule: a
button that cannot fight is a lie, so the dial never shows a rung it cannot play.
[Simulate] is never removed — the dial's resting state is the whole game.

## Relationship to the current codebase

- `src/guild/` already has the bones: `hero` (→ Person), `training`, `diet`, `recruiting`, `calendar`,
  `economy`, `guild`, and the playable `hall.js` weekly loop. This design *extends* them (add
  `professions`, `items`, `inventory`, `squads`) rather than replacing them.
- The battle engine (being decomposed out of `crucible.js`) becomes the **quest/expedition resolver**.
- Elements sprites become **hero appearance**; gear instances will render on them once the sprite
  engine is extracted (see ARCHITECTURE.md).
