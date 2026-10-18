'use strict';
const GameState = {
  create({ seed, difficulty = 'colony', playerName = 'Roger', colorId = 'yellow' }) {
    const rng = new SeededRNG(seed);
    const plots = Plot.generateMap(rng);
    const palette = CONFIG.PLAYER_COLORS;
    const human = palette.find((c) => c.id === colorId) || palette[0];
    const rest = palette.filter((c) => c.id !== human.id);
    const players = [PlayerState.create('p0', playerName || 'Roger', human.hex, true, null, CONFIG.SHAPES[0])];
    CONFIG.AI_NAMES.forEach((ai, i) => players.push(PlayerState.create(`p${i + 1}`, ai.name, rest[i].hex, false, ai.profile, CONFIG.SHAPES[i + 1])));
    const state = {
      schemaVersion: CONFIG.SCHEMA_VERSION, seed: String(seed), rngState: rng.getState(), difficulty,
      turn: 0, phase: 'TURN_START', phaseData: {}, players, plots, store: StoreState.create(),
      bank: { cash: 0 }, ext: { cash: 0, items: {} }, modifiers: null, event: null,
      landOrder: players.map((p) => p.id), history: [], auctionLog: [],
      // [Atari code] the store's price P per good (buy/sell lines derive from it; see StoreSystem.price).
      storePrice: {},
      // RUC book-keeping: store.ruc + installed + carried = RUC_START + made - lost (checked by RucAudit).
      rucs: { made: 0, lost: 0 }, settlement: null,
      // [Atari code] used: turnEventsHappened (one flag per personal event, own array: the original's 21-byte overflow is not copied);
      // bag: roundEventsProb tickets left; rank: ordersPlayer (last Status Summary, ties at random); after: drawn event waiting for
      // the production display.
      events: { used: INDIVIDUAL_EVENT_IDS.map(() => 0), bag: Object.fromEntries(PLANET_EVENT_IDS.map((id) => [id, EVENT_DEFS[id].tickets])), rank: null, after: null },
      flags: { landAuctions: false }, savedAt: 0, createdAt: 0
    };
    Object.keys(RESOURCE_DEFS).forEach((k) => { state.ext.items[k] = 0; state.storePrice[k] = RESOURCE_DEFS[k].basePrice; });
    state.initialTotals = { cash: players.reduce((s, p) => s + p.cash, 0), items: {} };
    Object.keys(RESOURCE_DEFS).forEach((k) => {
      state.initialTotals.items[k] = players.reduce((s, p) => s + p.inventory[k], 0) + state.store.stock[k];
    });
    state.modifiers = GameState.freshModifiers();
    return { state, rng };
  },
  /** Per-round production modifiers of the "before production" planetary events (see ProductionSystem.applyEvents). */
  freshModifiers() { return { sunspot: false, quake: false, acidRow: null }; },
  clone(state) { return JSON.parse(JSON.stringify(state)); }
};
