'use strict';
/**
 * Land auctions ([Atari code], Standard only; [C64] "LAND AUCTION" right after the land grant). Each round: first the plots that
 * colonists marked at the land office (the owner sells), then 0-3 colony plots. One plot at a time: an ascending-bid auction where
 * the bidders' markers rise in $4 steps from below the start line; whoever is highest when the time units run out gets the plot.
 * Everything lives in one plain, JSON-friendly object (`la`, kept in phaseData), so a save taken mid-auction resumes exactly.
 * Stages per lot: 'intro' ("BIDS START AT $"), 'bid', 'result' ("PLOT IS SOLD!" / "NO BIDS TENDERED"); then 'done' after the last one.
 */
const LandAuction = {
  /**
   * [Atari code] colony plots this round: Standard Normal(1, amplitude 1) -> 0: 16.2 %, 1: 67.7 %, 2: 16.1 %, 3: 0.1 % (the production
   * variation draw, binomialStep with F = 0.5); Tournament amplitude 2 (F = 1) -> 0..5: 31.1 / 37.7 / 24.3 / 6.2 / 0.6 / 0.01 %.
   * Capped by the free plots. None in Beginner or with the feature off.
   */
  colonyCount(state, rng) {
    const r = levelRules(state);
    if (!FEATURES.landAuctions || !r.landAuctions) return 0;
    const n = clamp(1 + binomialStep(rng, r.landAuctionAmp), 0, r.landAuctionMax);
    return Math.min(n, LandGrantSystem.freePlots(state).length);
  },
  /** `aiIds`: colonists driven by the computer. `opts.colony` forces the number of colony plots (tests); `opts.fast` shortens the cards. */
  create(state, rng, aiIds, opts = {}) {
    const on = FEATURES.landAuctions && levelRules(state).landAuctions;
    const marked = on ? LandOffice.forSale(state).map((x) => ({ plotId: x.plotId, sellerId: x.pid })) : [];
    const colony = opts.colony !== undefined ? opts.colony : this.colonyCount(state, rng);
    const L = CONFIG.LAND_AUCTION;
    const la = {
      queue: marked, colonyLeft: on ? colony : 0, aiIds: aiIds.slice(), prices: [], sold: [],
      introMs: opts.fast ? Math.min(L.introMs, 200) : L.introMs, resultMs: opts.fast ? Math.min(L.resultMs, 200) : L.resultMs,
      timing: AuctionEngine.timing(state), lot: null, stage: 'intro', timer: 0, clock: 0, units: 0, unitsTotal: CONFIG.AUCTION.tradeUnits,
      pushMs: 0, bids: {}, ai: {}, result: null, done: false
    };
    this.nextLot(state, rng, la);
    return la;
  },
  /** [Atari code] start price: $160 for the first auction of the game, then $60 below the previous price / the last set's average. */
  startPrice(state, la) {
    const L = CONFIG.LAND_AUCTION;
    const prev = la.prices.length ? la.prices[la.prices.length - 1] : state.landAuction.lastAvg;
    return prev === null || prev === undefined ? L.firstStart : Math.max(L.minStart, prev - L.drop);
  },
  bottom(la) { return la.lot.start - CONFIG.LAND_AUCTION.bottomSteps * CONFIG.LAND_AUCTION.step; },
  nextLot(state, rng, la) {
    let lot = null;
    while (la.queue.length && !lot) {
      const m = la.queue.shift(); const p = state.plots[m.plotId];
      if (p && p.ownerId === m.sellerId) lot = { plotId: m.plotId, sellerId: m.sellerId };
    }
    if (!lot && la.colonyLeft > 0) {
      const free = LandGrantSystem.freePlots(state);
      // [PROVISIONAL] which free plot the colony offers is not documented: a random one.
      if (free.length) { la.colonyLeft -= 1; lot = { plotId: rng.pick(free).id, sellerId: 'colony' }; } else la.colonyLeft = 0;
    }
    if (!lot) { this.finish(state, la); return; }
    lot.start = this.startPrice(state, la);
    la.lot = lot; la.stage = 'intro'; la.timer = la.introMs; la.result = null; la.bids = {}; la.ai = {};
    la.units = la.unitsTotal = CONFIG.AUCTION.tradeUnits; la.pushMs = 0;
    const bottom = this.bottom(la); const plot = state.plots[lot.plotId];
    state.players.filter((p) => p.id !== lot.sellerId).forEach((p) => {
      la.bids[p.id] = { price: bottom, priceF: bottom };
      if (la.aiIds.includes(p.id)) {
        // [PROVISIONAL] the computer starts moving after a reaction time, then raises one step per line step while it is outbid.
        la.ai[p.id] = { max: AISystem.landValue(state, rng, p, plot), wait: rng.range(CONFIG.AI.reactMin, CONFIG.AI.reactMax), acc: 0 };
      }
    });
  },
  /** The set is over: [Atari code] the next round starts $60 below this set's average price. */
  finish(state, la) {
    if (la.prices.length) state.landAuction.lastAvg = Math.round(la.prices.reduce((a, b) => a + b, 0) / la.prices.length);
    la.lot = null; la.stage = 'done'; la.done = true; la.ai = {};
  },
  /** Highest affordable price on the $4 grid of this lot (at least the bottom). */
  maxFor(state, la, pid) {
    const L = CONFIG.LAND_AUCTION; const cash = playerById(state, pid).cash;
    return Math.max(this.bottom(la), la.lot.start + Math.floor((cash - la.lot.start) / L.step) * L.step);
  },
  /** Moves a bidder's marker (bidding stage only), snapped to the $4 grid and never above what it can pay. */
  setBid(state, la, pid, price) {
    const b = la.bids[pid]; if (!b || la.stage !== 'bid') return false;
    const L = CONFIG.LAND_AUCTION; const hi = this.maxFor(state, la, pid);
    b.priceF = clamp(price, this.bottom(la), hi);
    b.price = clamp(la.lot.start + Math.round((b.priceF - la.lot.start) / L.step) * L.step, this.bottom(la), hi);
    return true;
  },
  nudge(state, la, pid, dir, dtMs, stepsPerSec) {
    const b = la.bids[pid]; if (!b || la.stage !== 'bid') return;
    this.setBid(state, la, pid, b.priceF + dir * CONFIG.LAND_AUCTION.step * stepsPerSec * dtMs / 1000);
  },
  push(la) { la.pushMs = CONFIG.AUCTION.pushMs; },
  /** Valid bids (at or above the start line) sorted best first: highest, then [Atari code][manual] the poorer colonist. */
  ranking(state, la) {
    const worth = (id) => ScoringSystem.netWorth(state, playerById(state, id));
    const order = state.players.map((p) => p.id);
    return Object.keys(la.bids).filter((id) => la.bids[id].price >= la.lot.start && playerById(state, id).cash >= la.bids[id].price)
      .sort((a, b) => (la.bids[b].price - la.bids[a].price) || (worth(a) - worth(b)) || (order.indexOf(a) - order.indexOf(b)));
  },
  highBid(state, la) { const r = this.ranking(state, la); return r.length ? { pid: r[0], price: la.bids[r[0]].price } : null; },
  update(state, rng, la, dt) {
    if (la.done) return;
    la.clock += dt;
    if (la.stage === 'intro') { la.timer -= dt; if (la.timer <= 0) { la.stage = 'bid'; la.timer = 0; } return; }
    if (la.stage === 'result') { la.timer -= dt; if (la.timer <= 0) this.nextLot(state, rng, la); return; }
    this.aiStep(state, la, dt);
    const tick = la.pushMs > 0 ? la.timing.push : la.timing.idle;
    la.units = Math.max(0, la.units - dt / tick);
    la.pushMs = Math.max(0, la.pushMs - dt);
    if (la.units <= 0) this.resolve(state, la);
  },
  /** Each computer bidder: one $4 step per line step while it is not the high bidder and the next price is within its valuation. */
  aiStep(state, la, dt) {
    const L = CONFIG.LAND_AUCTION; const line = AuctionEngine.lineMs();
    Object.keys(la.ai).forEach((pid) => {
      const a = la.ai[pid]; const b = la.bids[pid];
      if (a.wait > 0) { a.wait -= dt; return; }
      a.acc += dt;
      while (a.acc >= line) {
        a.acc -= line;
        const high = this.highBid(state, la);
        if (high && high.pid === pid) continue; // already the winner (ties go to the poorer colonist): hold
        const want = high ? high.price + L.step : la.lot.start;
        const goal = Math.min(want, a.max, this.maxFor(state, la, pid));
        if (b.price + L.step <= goal) this.setBid(state, la, pid, b.price + L.step);
      }
    });
  },
  /** Time is up: [Atari code] the highest bid wins; an unsold colony plot records start / 2 + 52 and ends the colony set. */
  resolve(state, la) {
    const lot = la.lot; const L = CONFIG.LAND_AUCTION; const best = this.highBid(state, la);
    if (best) {
      ResourceLedger.moveCash(state, best.pid, lot.sellerId === 'colony' ? 'store' : lot.sellerId, best.price);
      LandGrantSystem.transfer(state, lot.plotId, best.pid);
      la.prices.push(best.price); la.sold.push({ plotId: lot.plotId, buyer: best.pid, seller: lot.sellerId, price: best.price });
      la.result = { sold: true, buyer: best.pid, price: best.price };
    } else {
      if (lot.sellerId === 'colony') { la.prices.push(Math.floor(lot.start / 2) + L.noBidHalf); la.colonyLeft = 0; }
      la.result = { sold: false };
    }
    LandOffice.clear(state, lot.plotId);
    la.stage = 'result'; la.timer = la.resultMs; la.ai = {};
  }
};
