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

## Open design decisions

- **One pool or two?** Recommend heroes and craftspeople are the *same* Person entity (professions
  are a dimension), so a knight can dabble at the forge and a smith can be sent to fight. Simpler,
  more emergent. (Alternative: dedicated non-combatant staff.)
- **Instances vs stacks.** Weapons/armor = instances (history). Materials & arrows = counted stacks.
  Potions/food = **batches** with an expiry/spoil week. Keeps the sim tractable without tracking
  every individual arrow.
- **How deep, how soon?** The persistence/logistics depth (Phase 4) is the soul of the idea but the
  most content; ship Phases 1–3 first so it's a playable game before the deep sim.

## Relationship to the current codebase

- `src/guild/` already has the bones: `hero` (→ Person), `training`, `diet`, `recruiting`, `calendar`,
  `economy`, `guild`, and the playable `hall.js` weekly loop. This design *extends* them (add
  `professions`, `items`, `inventory`, `squads`) rather than replacing them.
- The battle engine (being decomposed out of `crucible.js`) becomes the **quest/expedition resolver**.
- Elements sprites become **hero appearance**; gear instances will render on them once the sprite
  engine is extracted (see ARCHITECTURE.md).
