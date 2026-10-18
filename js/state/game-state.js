'use strict';
const GameState = {
  /**
   * `level`: CONFIG.LEVELS id (unknown or disabled: Standard). `humans`: the human seats [{ name, colorId, species }] (0-4; [] = the
   * computer demo); without it, one human from `playerName` / `colorId` / `species`. [C64][manual] humans take the first seats
   * (p0 = P1 ...), the computers fill the rest as Mechtrons with the colours left over. A colour already taken goes to the first free one.
   */
  create({ seed, level = 'standard', species = 'mechtron', playerName = 'Roger', colorId = 'yellow', humans = null }) {
    if (!CONFIG.LEVELS[level] || CONFIG.LEVELS[level].disabled) level = 'standard';
    const rules = levelRules({ level });
    const rng = new SeededRNG(seed);
    const plots = Plot.generateMap(rng);
    // [Atari code] Tournament: the hidden crystite deposits (generated only where crystite plays, so other levels keep their PRNG stream).
    const crystite = rules.crystite ? CrystiteSystem.create(plots, rng) : null;
    const palette = CONFIG.PLAYER_COLORS;
    const seats = (humans || [{ name: playerName, colorId, species }]).slice(0, 4);
    const used = [];
    const players = seats.map((h, i) => {
      const want = palette.find((c) => c.id === h.colorId);
      const col = want && !used.includes(want.id) ? want : palette.find((c) => !used.includes(c.id));
      used.push(col.id);
      const name = (h.name && String(h.name).trim()) || (i === 0 ? 'Roger' : `Jugador ${i + 1}`);
      return PlayerState.create(`p${i}`, name, col.hex, true, null, CONFIG.SHAPES[i], speciesById(h.species || 'mechtron').id, rules.startInv, i);
    });
    const rest = palette.filter((c) => !used.includes(c.id));
    CONFIG.AI_NAMES.slice(0, 4 - seats.length).forEach((ai, k) => {
      const i = seats.length + k;
      players.push(PlayerState.create(`p${i}`, ai.name, rest[k].hex, false, ai.profile, CONFIG.SHAPES[i], 'mechtron', rules.startInv));
    });
    // [Atari code][manual] Tournament: the computers get an extra $200 ($1200); humans keep their species' money.
    if (rules.aiCash) players.filter((p) => !p.isHuman).forEach((p) => { p.cash = p.score = p.lastTurnNetWorth = rules.aiCash; });
    const state = {
      schemaVersion: CONFIG.SCHEMA_VERSION, seed: String(seed), rngState: rng.getState(), level,
      turn: 0, phase: 'TURN_START', phaseData: {}, players, plots, store: StoreState.create(rules),
      bank: { cash: 0 }, ext: { cash: 0, items: {} }, modifiers: null, event: null,
      landOrder: players.map((p) => p.id), history: [], auctionLog: [],
      // [Atari code] the store's price P per good (buy/sell lines derive from it; see StoreSystem.price).
      storePrice: {},
      // RUC book-keeping: store.ruc + installed + carried = level rucStart + made - lost (checked by RucAudit).
      rucs: { made: 0, lost: 0 }, settlement: null,
      // [Atari code] used: turnEventsHappened (one flag per personal event, own array: the original's 21-byte overflow is not copied);
      // bag: roundEventsProb tickets left; rank: ordersPlayer (last Status Summary, ties at random); after: drawn event waiting for
      // the production display.
      events: { used: INDIVIDUAL_EVENT_IDS.map(() => 0), bag: Object.fromEntries(PLANET_EVENT_IDS.map((id) => [id, EVENT_DEFS[id].tickets])), rank: null, after: null },
      // Plots marked for sale at the land office ({ pid, plotId, turn }); [manual] auctioned in the next round's land auction.
      landSales: [],
      // [Atari code] the last land-auction set's average price (the next set starts $60 below it; null = none yet, start at $160).
      landAuction: { lastAvg: null },
      // Tournament only (null elsewhere): deposit seeds, the computers' known crystite map and the human's assay results (CrystiteSystem).
      crystite,
      savedAt: 0, createdAt: 0
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
