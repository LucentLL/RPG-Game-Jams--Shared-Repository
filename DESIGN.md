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
- **Phase 3 — Quartermaster + Squads + Consumables.**
  Group heroes into squads, auto-equip by policy, deploy on quests that withdraw gear + supplies
  and return loot/damage/injuries. Alchemist brews potions (consumables). *Logistics drive expeditions.*
- **Phase 4 — Persistence, repair, inheritance, decay, mentorship.**
  Item history/durability/edge-quality; repair-vs-craft; inheritance on death; potion expiry; food
  spoilage; master→apprentice mentorship; the guild's library/workshops/veterans as institutional memory.

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
