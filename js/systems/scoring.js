'use strict';
const ScoringSystem = {
  /** [Atari code] goods are valued at the store's current price P. */
  price(state, res) { return StoreSystem.price(state, RESOURCE_DEFS[res]); },
  /**
   * [Atari code] net worth = cash + goods at P + $500 per plot + for each installed RUC its outfit cost + $35 (CONFIG.RUC_WORTH).
   * [C64] open question: the first Status Summary shows GOODS 150 for 4 food + 2 energy, while P 30/25 gives 170 (see README).
   */
  breakdown(state, p) {
    const goods = enabledResources().reduce((s, d) => s + (p.inventory[d.id] || 0) * this.price(state, d.id), 0);
    const plots = state.plots.filter((q) => q.ownerId === p.id);
    const withRuc = plots.filter((q) => q.ruc);
    const land = plots.length * CONFIG.PLOT_VALUE;
    const rucs = withRuc.length * CONFIG.RUC_WORTH;
    const modules = withRuc.reduce((s, q) => s + (CONFIG.MODULE_COST[q.ruc.module] || 0), 0);
    return { cash: p.cash, inventory: goods, plots: land, rucs, modules, total: p.cash + goods + land + rucs + modules };
  },
  netWorth(state, p) { return this.breakdown(state, p).total; },
  /** Closes a turn: refreshes scores and the history chart. */
  endTurn(state) {
    const worths = state.players.map((p) => this.netWorth(state, p));
    state.players.forEach((p, i) => { p.lastTurnNetWorth = worths[i]; p.score = worths[i]; });
    state.history.push({ turn: state.turn, worth: worths.slice() });
  },
  /**
   * [Atari code] "Colony difficulties": with no Food M.U.L.E. in the colony and no food anywhere (colonists + store) the colony fails
   * at once; the same for Energy. Returns 'food', 'energy' or null. [PROVISIONAL] checked at the end of each round (exact moment unknown).
   */
  colonyFailure(state) {
    for (const res of ['food', 'energy']) {
      const rucs = state.plots.some((q) => q.ruc && q.ruc.module === res);
      const units = state.players.reduce((s, p) => s + (p.inventory[res] || 0), state.store.stock[res] || 0);
      if (!rucs && units === 0) return res;
    }
    return null;
  },
  /** [Atari code] calcAndDrawScore: round((colony total - 10000) / 20000), clamped to 0..6 (index into COLONY_RATINGS). */
  rating(total) { const R = CONFIG.RATING; return clamp(Math.round((total - R.offset) / R.step), 0, R.max); },
  /** [manual] Standard: the colony succeeds with a combined net worth of at least $60,000. There is no per-colonist minimum. */
  survival(state) {
    const combined = state.players.reduce((s, p) => s + this.netWorth(state, p), 0);
    return { survives: combined >= CONFIG.SURVIVAL.combined, combined, needCombined: CONFIG.SURVIVAL.combined };
  },
  /** Tie-breaks: cash, productive plots, then a seeded draw. */
  ranking(state, rng) {
    const rows = state.players.map((p) => ({ p, b: this.breakdown(state, p), prod: state.plots.filter((q) => q.ownerId === p.id && q.ruc).length, tie: rng.next() }));
    rows.sort((a, b) => (b.b.total - a.b.total) || (b.b.cash - a.b.cash) || (b.prod - a.prod) || (a.tie - b.tie));
    return rows;
  }
};
