'use strict';
const StoreSystem = {
  /** [Atari code] calcMulePrice: (P_smithore - P_smithore mod 5) x 2, i.e. twice the smithore price rounded down to $10 (P 50 -> $100). */
  rucPrice(state) { const ps = this.price(state, RESOURCE_DEFS.smithore); return (ps - ps % 5) * 2; },
  /** The store's price P of a good (state.storePrice); a market the state does not track (tests, Phase B) uses its basePrice. */
  price(state, def) { const v = state.storePrice && state.storePrice[def.id]; return v === undefined ? def.basePrice : v; },
  /** [Atari code][C64] store buy line: food / energy P - 15, smithore P (round 1: 15 / 10 / 50). */
  bid(state, def) { return clamp(this.price(state, def) - (def.storeBuyOff || 0), def.minPrice, def.maxPrice); },
  /** [Atari code][C64] store sell line: food / energy P + 20, smithore P + 35 (round 1: 50 / 45 / 85). */
  ask(state, def) { return clamp(this.price(state, def) + (def.storeSellOff || 0), def.minPrice, def.maxPrice); },
  /**
   * [Atari code] calcGoodPriceSupplyDemand: P x (0.25 + 0.75 x demand / supply). The ratio is 3-bit fixed point (quantised down to
   * 1/8), a supply of 0 counts as 1, and only smithore clamps the ratio to [0.25, 3]. Integer form: floor(P x (16 + 6q) / 64), q = 8 x ratio.
   * Rounding the product down is our reading of the integer code ([PROVISIONAL] off-by-one at most).
   */
  supplyDemand(P, demand, supply, clampRatio = false) {
    let q = Math.floor(8 * demand / Math.max(1, supply));
    if (clampRatio) q = clamp(q, 2, 24);
    return Math.floor(P * (16 + 6 * q) / 64);
  },
  /** [Atari code] limitGoodPrice: floor per good (food 30, energy 25, smithore 20), ceiling 250. */
  limit(def, P) { return clamp(P, def.priceFloor || def.minPrice, CONFIG.STORE_PRICE.max); },
  /** [Atari code] after each goods auction P becomes the average price of the units actually traded (only if at least one was). */
  afterAuction(state, res, result) { if (result.volume > 0 && result.avg !== null) state.storePrice[res] = result.avg; },
  /** [Atari code] calcMuleReq: min(free plots, 4) + owned plots without a M.U.L.E., clamped to 0..8 (the smithore demand). */
  muleDemand(state) {
    const free = state.plots.filter((q) => Plot.claimable(q)).length;
    const idle = state.plots.filter((q) => q.ownerId && !q.ruc).length;
    return clamp(Math.min(free, 4) + idle, 0, 8);
  },
  /**
   * Supply/demand update of P for the next round's auctions ([Atari code] formulas). [PROVISIONAL] timing: run once at the end of each
   * round (after the auctions, before the M.U.L.E. build), so round 1 opens at the start prices exactly as observed on the [C64].
   *   Food:     supply = store + sum(max(0, own - req) / 2 + production), demand = next round's requirement x 4
   *   Energy:   supply = store + sum(max(0, own - need) x 3/4 + production), demand = sum(needs) + 4; need = non-energy M.U.L.E.s
   *   Smithore: supply = corral + store smithore / 2, demand = muleDemand; max(50, P') + 7 x binomial step (-28..+28), then >= 20
   * `production` = what each colonist harvested this round (the settlement report).
   */
  updatePrices(state, rng) {
    const P = state.storePrice; const stock = state.store.stock; const defs = RESOURCE_DEFS;
    const rows = state.settlement && state.settlement.turn === state.turn ? state.settlement.rows : [];
    const produced = (pid, res) => { const row = rows.find((r) => r.playerId === pid); return row ? row.produced[res] || 0 : 0; };
    const nonEnergy = (pid) => state.plots.filter((q) => q.ownerId === pid && q.ruc && q.ruc.module !== 'energy').length;
    const req = state.turn >= lastRound(state) ? 0 : ConsumptionSystem.foodNeed(state.turn + 1);
    const foodSupply = state.players.reduce((s, p) => s + Math.floor(Math.max(0, p.inventory.food - req) / 2) + produced(p.id, 'food'), stock.food || 0);
    P.food = this.limit(defs.food, this.supplyDemand(this.price(state, defs.food), req * 4, foodSupply));
    const energySupply = state.players.reduce((s, p) => s + Math.floor(Math.max(0, p.inventory.energy - nonEnergy(p.id)) * 3 / 4) + produced(p.id, 'energy'), stock.energy || 0);
    const energyDemand = state.players.reduce((s, p) => s + nonEnergy(p.id), 0) + 4;
    P.energy = this.limit(defs.energy, this.supplyDemand(this.price(state, defs.energy), energyDemand, energySupply));
    const sp = CONFIG.STORE_PRICE;
    const smithore = Math.max(sp.smithoreInterimMin, this.supplyDemand(this.price(state, defs.smithore), this.muleDemand(state), state.store.ruc + Math.floor((stock.smithore || 0) / 2), true));
    // [Atari code] Beginner: smithore stays at $50 (no supply/demand, no random step).
    const fixed = levelRules(state).smithorePrice;
    P.smithore = fixed || this.limit(defs.smithore, smithore + sp.smithoreStep * clamp(binomialStep(rng, 1), -sp.smithoreStepMax, sp.smithoreStepMax));
    return { food: P.food, energy: P.energy, smithore: P.smithore };
  },
  buyRuc(state, playerId) {
    const price = this.rucPrice(state);
    if (state.store.ruc < 1) return { ok: false, reason: 'no_stock' };
    if (!ResourceLedger.moveCash(state, playerId, 'store', price)) return { ok: false, reason: 'no_cash' };
    state.store.ruc -= 1;
    return { ok: true, price };
  },
  /** [manual] A RUC taken back into the corral returns the FULL price paid for the robot; the outfitting is never refunded. */
  refundRuc(state, playerId, pricePaid) {
    ResourceLedger.moveCash(state, 'store', playerId, pricePaid);
    state.store.ruc += 1;
    return pricePaid;
  },
  /** Outfitting a RUC the colonist is leading (the only way to get a module: there are no loose modules). */
  buyModule(state, playerId, res) {
    const cost = CONFIG.MODULE_COST[res];
    if (!cost) return { ok: false, reason: 'bad_module' };
    if (!ResourceLedger.moveCash(state, playerId, 'store', cost)) return { ok: false, reason: 'no_cash' };
    return { ok: true, price: cost };
  },
  /**
   * Installs an outfitted RUC ({ module, paid }) on an owned plot. Returns { ok, previous }: `previous` is the RUC that was
   * installed there before ([manual] transferring: it now follows the colonist), or null.
   */
  install(state, playerId, plotId, ruc) {
    const plot = plotById(state, plotId);
    if (!plot || plot.ownerId !== playerId || !ruc || !ruc.module) return { ok: false, previous: null };
    const previous = plot.ruc;
    plot.ruc = { module: ruc.module, paid: ruc.paid };
    return { ok: true, previous };
  },
  /** [manual] A M.U.L.E. that runs away is gone: it does not come back to the corral and nothing is refunded. */
  loseRuc(state) { state.rucs.lost += 1; },
  /**
   * Between turns: the smithore the store bought becomes RUCs. [Atari code] buildAndCalcPriceMule: min(14 - corral, smithore / 2),
   * 2 Smithore each, available in the next development. No free food / energy delivery: the store only has what colonists sold it
   * (or what events changed).
   */
  betweenTurns(state) {
    let made = 0; const rules = levelRules(state);
    if (rules.rucReset) {
      // [Atari code] Beginner: every round the store's smithore goes back to 0 and the corral to 25 M.U.L.E.s (book-kept as made / lost).
      if (state.store.stock.smithore > 0) ResourceLedger.moveItem(state, 'smithore', 'store', 'nature', state.store.stock.smithore);
      const diff = rules.rucMax - state.store.ruc;
      state.store.ruc = rules.rucMax;
      if (diff >= 0) state.rucs.made += diff; else state.rucs.lost -= diff;
      return { rucsMade: Math.max(0, diff) };
    }
    while (state.store.ruc < rules.rucMax && state.store.stock.smithore >= CONFIG.SMITHORE_PER_RUC) {
      ResourceLedger.moveItem(state, 'smithore', 'store', 'nature', CONFIG.SMITHORE_PER_RUC);
      state.store.ruc += 1; made++;
    }
    state.rucs.made += made;
    return { rucsMade: made };
  }
};
