// Heroes Guild — domain barrel.
//
// The pivot: the player runs a heroes' guild — recruit heroes, plan their diet,
// assign training, and dispatch them on quests submitted to the guild board.
// Battles (quest/tournament resolution) reuse the battle engine in src/game/.
//
// Nothing here is wired into gameplay yet — these are the data models and pure
// systems the new weekly game loop will be built on. See ARCHITECTURE.md for
// how this layer plugs into the existing engine.
export * from './guild.js';
export * from './hero.js';
export * from './recruiting.js';
export * from './training.js';
export * from './diet.js';
export * from './quests.js';
export * from './calendar.js';
export * from './economy.js';
export * from './item.js';
export * from './inventory.js';
export * from './smithing.js';
