'use strict';
/**
 * Crystite and the assay office (Tournament only; docs/research/tournament.md §1-2, [Atari code] unless tagged).
 * The true level of every plot lives in plot.hiddenDeposit: -1 river / town (no mining), 0 NONE, 1 LOW, 2 MEDIUM, 3 HIGH, 4 meteorite.
 * state.crystite (null outside Tournament):
 *   seeds   the 3 HIGH deposit centres drawn at game start;
 *   known   the computers' known map, one shared array (null = unknown): filled by their assays, by installed crystite M.U.L.E.s
 *           (their production dots) and by meteorites. [Atari code] only the AI uses it; the human is never shown it;
 *   assays  the human's assay results ({ pid, plotId, level 0..3, turn }) for the side-panel list. Not C64: the original only prints
 *           the message (an R.U.C. convenience, see README).
 */
const CrystiteSystem = {
  /** [Atari code] crystiteFound: "NO" / "LOW" / "MEDIUM" / "HIGH" (+ " CRYSTITE FOUND IN PLOT."), faithful Catalan ("NO" = "Gens de"). */
  LEVEL_NAMES: Object.freeze(['Gens', 'Poc', 'Mitjà', 'Molt']),
  /** Manhattan distance between two plots. */
  dist(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); },
  noMining(p) { return p.terrain === TERRAIN.RIVER || p.terrain === TERRAIN.TOWN; },
  /**
   * [Atari code] $4330-$4343 + expandCrystite $48C9: 3 seeds (the loop runs 3 times; [RE]/[FN] say 4, the code wins) on distinct
   * random plots 0..44 (river and store allowed); each spreads a diamond of 3 - Manhattan distance, the higher value wins where
   * diamonds overlap. $44CD-$44EF: then the river plots and the store are set to -1, but their seeds' diamonds have already spread.
   */
  create(plots, rng) {
    const seeds = [];
    while (seeds.length < CONFIG.CRYSTITE.seeds) { const id = rng.int(plots.length); if (!seeds.includes(id)) seeds.push(id); }
    plots.forEach((p) => {
      const level = Math.max(0, ...seeds.map((id) => CONFIG.CRYSTITE.high - this.dist(plots[id], p)));
      p.hiddenDeposit = this.noMining(p) ? -1 : level;
    });
    return { seeds, known: plots.map(() => null), assays: [] };
  },
  /** [Atari code] $3368-$3375: P = 50 + rand(0..99), re-drawn every round; supply and demand play no part. */
  drawPrice(state, rng) { state.storePrice.crystite = CONFIG.CRYSTITE.priceBase + rng.int(CONFIG.CRYSTITE.priceRand); return state.storePrice.crystite; },
  /** [Atari code] goodAuction $97CA: the crystite auction runs only if a colonist holds (or just produced) some, or the store has some. */
  auctionNeeded(state) { return state.players.some((p) => (p.inventory.crystite || 0) > 0) || (state.store.stock.crystite || 0) > 0; },
  /** [Atari code] $4823, [manual] "All crystite found is shipped off planet": the store's crystite goes to 0 after every crystite auction. */
  shipOff(state) { const n = state.store.stock.crystite || 0; if (n > 0) ResourceLedger.moveItem(state, 'crystite', 'store', 'nature', n); return n; },
  /**
   * The level an assay reports, 0..3. [Atari code] a meteorite's 4 shows as HIGH (if A >= 3 -> 3). A river sample reads -1, which
   * the original's unsigned compare shows as HIGH (probably a bug, tournament.md §2): R.U.C. reports NO instead (fix).
   */
  assayLevel(plot) { return clamp(plot.hiddenDeposit || 0, 0, CONFIG.CRYSTITE.high); },
  /** The human's assay: the result (0..3) is remembered for the side-panel list. */
  record(state, pid, plotId) {
    const level = this.assayLevel(state.plots[plotId]);
    if (state.crystite) state.crystite.assays.push({ pid, plotId, level, turn: state.turn });
    return level;
  },
  learn(state, plotId, level) { if (state.crystite) state.crystite.known[plotId] = level; },
  /** [Atari code] the computers read the real level from the production dots of every installed crystite M.U.L.E. */
  learnFromMules(state) { state.plots.forEach((p) => { if (p.ruc && p.ruc.module === 'crystite') this.learn(state, p.id, p.hiddenDeposit); }); },
  known(state, plotId) { return state.crystite ? state.crystite.known[plotId] : null; },
  /**
   * [Atari code] expandKnownCrystite: around a known 2 or 3 the computers deduce the diamond (level - distance). A known plot is its
   * own value; an unknown plot with nothing to deduce from is 0.
   */
  deduced(state, plotId) {
    const own = this.known(state, plotId); if (own !== null && own !== undefined) return own;
    if (!state.crystite) return 0;
    const p = state.plots[plotId];
    return state.crystite.known.reduce((best, k, id) => (k !== null && k >= 2 ? Math.max(best, k - this.dist(state.plots[id], p)) : best), 0);
  },
  /**
   * [Atari code] $3868-$38E1 computer assay (Tournament only), after its installs and before the pub: skipped once >= 3 HIGH plots
   * are known; candidates are its own plots, then free plots, never river / town / known ones, the highest deduced value first; each
   * candidate is taken with a 1/8 chance (7/8 skipped). Each assay costs 10 + 4 x AISystem.storeDist PTU and the computer stops when fewer than
   * 22 are left. [PROVISIONAL]: the scan wraps around until one is taken (the code's behaviour at the end of the list is unread).
   * `clock` ({ units }) is the computer's development time. Returns the assayed plot ids.
   */
  aiAssay(state, rng, p, clock) {
    if (!state.crystite || !levelRules(state).crystite) return [];
    const K = CONFIG.CRYSTITE; const known = state.crystite.known; const done = [];
    this.learnFromMules(state);
    while (clock.units >= K.aiMinUnits && known.filter((v) => v !== null && v >= K.high).length < K.aiStopHigh) {
      const cands = state.plots.filter((q) => !this.noMining(q) && known[q.id] === null && (q.ownerId === p.id || !q.ownerId))
        .map((q) => ({ q, own: q.ownerId === p.id ? 0 : 1, d: this.deduced(state, q.id) }))
        .sort((a, b) => (a.own - b.own) || (b.d - a.d) || (a.q.id - b.q.id));
      if (!cands.length) break;
      let pick = null;
      for (let k = 0; !pick && k < cands.length * 64; k++) if (rng.int(K.aiPick) === 0) pick = cands[k % cands.length].q;
      pick = pick || cands[0].q;
      clock.units -= K.aiUnits + K.aiDistUnits * AISystem.storeDist(pick);
      this.learn(state, pick.id, pick.hiddenDeposit); done.push(pick.id);
    }
    return done;
  }
};
