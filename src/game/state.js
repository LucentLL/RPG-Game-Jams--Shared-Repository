// Shared mutable game state.
//
// ES modules cannot share a *reassignable* binding across files, so every
// cross-module mutable global lives as a field on this single object. New,
// already-split modules import `S` and read/write `S.run`, `S.p1`, etc.
//
// Transitional bridge: the still-large crucible.js refers to these by their
// bare legacy names (`run`, `p1`, `tiles`, ...). Since it no longer declares
// them, those bare references resolve against the global object — so we mirror
// each field onto `window` with a get/set that proxies to `S`. This preserves
// the original semantics exactly (including local `var` shadows in crucible.js,
// which still win over the window accessor). As crucible.js is broken apart into
// modules that import `S`, its bare-name usage disappears and this bridge
// shrinks to nothing.
//
// (`_craftFn` is intentionally absent: the legacy code already stores it as
// `window._craftFn`, so it is shared correctly as-is.)

export const S = {
  run: null,            // current run state
  p1: null, p2: null,   // current fighters
  gamePhase: 'title',
  turnNum: 1,
  moveQueue: [],
  lastMoveType: null,
  selectedAttack: null,
  tiles: [],
  executing: false,
  statsOpen: false,
  arenaGrid: null,
  animLoopRunning: false,
  actionLoopRunning: false,
  _pendingRunMode: 'turn',
  _snapshotIntervalMap: new Map(), // entity -> boundary times (seconds)
  _snapshotPathMap: new Map(),     // entity -> movement path steps
  _snapshotStartMap: new Map(),    // entity -> {x, y, facing}
  // Arena terrain — set by generateArena() (engine/terrain.js); read by the
  // combat engine and the grid renderer. Bridged onto window so crucible.js's
  // remaining bare-name reads (arenaName/arenaPassable/arenaTerrainCost) resolve.
  arenaElevation: null,
  arenaPassable: null,
  arenaTerrainCost: null,
  arenaName: '',
};

if (typeof window !== 'undefined') {
  for (const k of Object.keys(S)) {
    Object.defineProperty(window, k, {
      get() { return S[k]; },
      set(v) { S[k] = v; },
      configurable: true,
    });
  }
}
