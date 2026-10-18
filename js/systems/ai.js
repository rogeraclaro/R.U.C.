'use strict';
/** AI: sees only public state (prices, stock, markers) and its own inventory. Never the seed or future events. */
const AISystem = {
  profile(p) { return AI_PROFILES[p.aiProfile] || AI_PROFILES.conservative; },
  /** One AI level for every game (CONFIG.AI): the original has no computer-strength setting. */
  diff() { return CONFIG.AI; },
  rucCount(state, p) { return state.plots.filter((q) => q.ownerId === p.id && q.ruc).length; },
  nonEnergyRucs(state, p) { return state.plots.filter((q) => q.ownerId === p.id && q.ruc && q.ruc.module !== 'energy').length; },
  expectedProd(state, p, res) {
    return state.plots.filter((q) => q.ownerId === p.id && q.ruc && q.ruc.module === res).reduce((s, q) => s + ProductionSystem.expectedYield(state, q), 0);
  },
  /** Units worth keeping for next turn. Turn 12 is the last one: nothing left to protect, so sell everything. */
  reserve(state, p, res) {
    if (state.turn >= lastRound(state)) return 0;
    const min = this.diff(state).minReserve; const prof = this.profile(p);
    if (res === 'food') {
      const need = Math.max(0, ConsumptionSystem.foodNeed(state.turn + 1) - this.expectedProd(state, p, 'food'));
      return Math.max(min, need + (prof.extremeGuard ? 2 : 0));
    }
    // [manual] critical energy level: non-energy plots with a M.U.L.E. + 1 (energy made next turn arrives too late to power them).
    if (res === 'energy') return Math.max(min, this.nonEnergyRucs(state, p) + 1);
    return 0;
  },
  /** The role a colonist starts the declaration with: [manual] "If you have a surplus ... your character will automatically jump to SELL". */
  defaultRole(state, p, res) {
    return (p.inventory[res] || 0) > ConsumptionSystem.criticalLevel(state, p, res) ? ROLE.SELLER : ROLE.BUYER;
  },
  createBrain(state, rng, p) {
    const d = this.diff(state);
    return { id: p.id, role: ROLE.OUT, target: null, limit: null, nextDecisionAt: rng.range(d.reactMin, d.reactMax), nextMoveAt: 0 };
  },
  /**
   * Picks role + target price + `limit` (a seller keeps `limit` units, a buyer stops at `limit` units: with continuous trading a
   * line that touches keeps trading). Prices drift from an optimistic start toward the store's price as the trade time runs out.
   * Not from the original ([Atari code]: the auction AI is undocumented); the engine enforces the critical level on its own.
   */
  decide(state, rng, p, engine, brain = null) {
    const def = engine.market; const res = def.id;
    if (res === 'crystite') return this.decideCrystite(state, rng, p, engine);
    const prof = this.profile(p); const d = this.diff(state);
    const smart = levelRules(state).smartAi && (res === 'food' || res === 'energy'); const T = CONFIG.AI_TOURNAMENT;
    const inv = p.inventory[res] || 0; const reserve = this.reserve(state, p, res);
    const central = StoreSystem.price(state, def);
    const err = (rng.next() * 2 - 1) * d.valuationErr / 100;
    const val = central * (1 + err);
    const progress = clamp(engine.progress() / 0.7, 0, 1);
    const storeBid = StoreSystem.bid(state, def); const storeAsk = StoreSystem.ask(state, def);
    const cap = (price) => prof.extremeGuard ? clamp(price, def.basePrice * 0.7, def.basePrice * 1.4) : price;
    const cash = p.cash;
    if (inv > reserve) {
      let margin = prof.margin;
      if (p.aiProfile === 'opportunist' && storeAsk > def.basePrice * 1.15) margin *= 1.5;
      const start = val * (1 + margin / 100);
      let floor = storeBid;
      if (p.aiProfile === 'industrial' && res === 'smithore') floor = Math.max(storeBid, val * 0.9);
      let limit = reserve;
      // [Atari code] Tournament: a small surplus is held back (only rand(0..surplus) is sold), drawn once per auction (kept in the brain).
      const surplus = inv - reserve; const H = T.holdBack;
      if (smart && surplus < H[res] && central <= H.maxPrice && cash >= H.cash) {
        if (brain && brain.holdBack !== undefined) limit = brain.holdBack;
        else { limit = inv - rng.int(surplus + 1); if (brain) brain.holdBack = limit; }
      }
      return { role: ROLE.SELLER, target: cap(start - (start - floor) * progress), limit };
    }
    const desperate = (res === 'food' && inv < ConsumptionSystem.foodNeed(state.turn + 1) - this.expectedProd(state, p, 'food')) || (res === 'energy' && inv < this.nonEnergyRucs(state, p));
    const speculate = p.aiProfile === 'opportunist' && inv < reserve + 6 && central < def.basePrice * 0.85 && cash > 500 && state.turn < lastRound(state);
    if (inv < reserve || speculate) {
      const start = val * (1 - (speculate ? 10 : prof.margin) / 100);
      // Only starvation / blackout justifies bidding past the store price (up to the store ceiling, never to the UI limit).
      const ceiling = desperate ? def.maxPrice : storeAsk;
      let bid = cap(start + (ceiling - start) * progress);
      const safety = desperate ? 0 : 120;
      bid = Math.min(bid, cash - safety);
      if (bid < def.minPrice) return { role: ROLE.OUT, target: null, limit: null };
      let limit = speculate ? reserve + 6 : reserve;
      // [Atari code] Tournament: with only buyers, buy the store out (its whole stock) if the need is smaller than it and affordable.
      const stock = state.store.stock[res] || 0;
      if (smart && state.turn < lastRound(state) && stock <= T.buyOut.maxStock && reserve - inv < stock && storeAsk * stock < cash
        && !engine.colonistEntries.some((x) => x.role === ROLE.SELLER)) limit = inv + stock;
      return { role: ROLE.BUYER, target: bid, limit };
    }
    return { role: ROLE.OUT, target: null, limit: null };
  },
  /** Crystite (Tournament): the [Atari code] trading rules of CONFIG.AI_TOURNAMENT.crystite; prices drift as in decide. */
  decideCrystite(state, rng, p, engine) {
    const def = engine.market; const K = CONFIG.AI_TOURNAMENT.crystite; const prof = this.profile(p);
    const inv = p.inventory.crystite || 0; const P = StoreSystem.price(state, def); const cash = p.cash;
    const val = P * (1 + (rng.next() * 2 - 1) * this.diff(state).valuationErr / 100);
    const progress = clamp(engine.progress() / 0.7, 0, 1);
    if (inv > 0) {
      const sell = P >= K.sellBelow ? inv : Math.min(inv, Math.max(inv - K.keep, Math.ceil(Math.max(0, K.cashGoal - cash) / P)));
      if (sell <= 0) return { role: ROLE.OUT, target: null, limit: null };
      const start = val * (1 + prof.margin / 100); const floor = StoreSystem.bid(state, def);
      return { role: ROLE.SELLER, target: start - (start - floor) * progress, limit: inv - sell };
    }
    if (P < K.buyBelow && cash >= K.buyCash) {
      const n = Math.min(K.maxBuy, Math.floor((cash - K.cashKeep) / P)); const start = val * (1 - prof.margin / 100);
      return { role: ROLE.BUYER, target: Math.min(start + (P - start) * progress, cash), limit: n };
    }
    return { role: ROLE.OUT, target: null, limit: null };
  },
  /**
   * Declares during the declaration and moves the marker one step per [Atari code] line step (8 frames) during the trade stage,
   * honouring reaction latency and the 1.5 s decision hold. Roles are fixed after the declaration: an AI that changes its mind (or
   * reaches its `limit`) retreats instead of switching sides.
   */
  tick(state, rng, p, brain, engine, dt) {
    const e = engine.entry(p.id);
    if (engine.clock >= brain.nextDecisionAt) {
      const d = this.decide(state, rng, p, engine, brain);
      const d0 = this.diff(state);
      brain.nextDecisionAt = engine.clock + Math.max(CONFIG.AUCTION.aiHoldMs, rng.range(d0.reactMin, d0.reactMax));
      if (engine.canDeclare()) { engine.setRole(p.id, d.role); brain.role = d.role; brain.target = d.target; brain.limit = d.limit; }
      else {
        brain.role = e.role;
        if (e.role === ROLE.OUT) brain.target = null;
        else if (d.role === e.role) { brain.target = d.target; brain.limit = d.limit; }
        else brain.target = e.role === ROLE.SELLER ? engine.market.maxPrice : engine.market.minPrice;
      }
    }
    if (engine.stage !== 'trade') return;
    const inv = p.inventory[engine.market.id] || 0;
    if (brain.limit !== null && brain.limit !== undefined && brain.target !== null) {
      if (e.role === ROLE.BUYER && inv >= brain.limit) brain.target = engine.market.minPrice;
      if (e.role === ROLE.SELLER && inv <= brain.limit) brain.target = engine.market.maxPrice;
    }
    brain.nextMoveAt -= dt;
    if (brain.target !== null && e.role !== ROLE.OUT) {
      while (brain.nextMoveAt <= 0) {
        brain.nextMoveAt += AuctionEngine.lineMs();
        const diff = brain.target - e.priceF;
        const s = engine.market.step;
        if (Math.abs(diff) >= s) engine.setPrice(p.id, e.priceF + Math.sign(diff) * s);
      }
    } else brain.nextMoveAt = 0;
  },
  /**
   * Most a computer pays for a plot in a land auction. [Atari code] rates a plot by its exploitation (here LandGrantSystem.scorePlot)
   * times the rounds left; the money scale is [PROVISIONAL]: score x (20 + 8 x rounds left) +-valuation error (a typical round-1 plot
   * ~ $540, close to the $536 sale seen on the [C64]), never more than its cash minus a $200 reserve.
   */
  landValue(state, rng, p, plot) {
    const roundsLeft = Math.max(0, lastRound(state) - state.turn);
    const err = 1 + (rng.next() * 2 - 1) * this.diff(state).valuationErr / 100;
    const v = LandGrantSystem.scorePlot(state, p, plot) * (20 + 8 * roundsLeft) * err;
    return Math.max(0, Math.floor(Math.min(v, p.cash - 200)));
  },
  /**
   * Development for AI colonists (also used by the autopilot for the human). [manual] the computer players are not shown walking
   * ("they are boring to watch"), so this happens at once, but through the same store rules: robot from the corral, outfit, install.
   */
  /**
   * [Atari code] a computer's whole development turn: it has the same units as a human (food), installs while at least 35 are left,
   * each install costing 25 + 2 x distance (plots from the town), then goes to the pub if at least 3 are left. Computers never
   * catch the Wampus. Returns { installs, pub (cr won, 0 = no visit), unitsLeft }.
   */
  turn(state, rng, p) {
    const clock = { units: ConsumptionSystem.turnUnits(state, p) };
    const installs = this.develop(state, rng, p, clock);
    // [Atari code] Tournament: the assay round comes after the installs and before the pub (CrystiteSystem.aiAssay).
    const assays = CrystiteSystem.aiAssay(state, rng, p, clock);
    const pub = clock.units >= CONFIG.PUB.pubMinUnits ? PubSystem.visit(state, p.id, clock.units) : 0;
    return { installs, assays, pub, unitsLeft: clock.units };
  },
  /** Units an install costs the computer: [Atari code] 25 + 2 x the plot's distance from the town (plots, |dx| + |dy|). */
  installUnits(plot) { return CONFIG.PUB.aiInstallUnits + CONFIG.PUB.aiDistUnits * (Math.abs(plot.x - CONFIG.RIVER_COL) + Math.abs(plot.y - CONFIG.TOWN_ROW)); },
  /** `clock` ({ units }, optional): the turn's development units, spent per install (see turn). */
  develop(state, rng, p, clock = null) {
    const prof = this.profile(p);
    const reserveCash = { conservative: 320, industrial: 160, opportunist: 220 }[p.aiProfile] || 250;
    const maxInstalls = { conservative: 1, industrial: 2, opportunist: 2 }[p.aiProfile] || 1;
    const actions = [];
    for (let n = 0; n < maxInstalls; n++) {
      const free = state.plots.filter((q) => q.ownerId === p.id && !q.ruc);
      if (!free.length || state.store.ruc < 1 || state.turn >= lastRound(state)) break;
      if (clock && clock.units < CONFIG.PUB.aiMinUnits) break;
      // Energy RUCs power themselves; every other RUC needs 1 energy from the reserve (plus the new one, plus 1 of margin).
      const energyOk = p.inventory.energy + this.expectedProd(state, p, 'energy') >= this.nonEnergyRucs(state, p) + 2;
      const nextNeed = ConsumptionSystem.foodNeed(Math.min(lastRound(state), state.turn + 1));
      const foodOk = p.inventory.food + this.expectedProd(state, p, 'food') >= nextNeed + 1;
      let module = !energyOk ? 'energy' : !foodOk ? 'food' : prof.prefers;
      // Tournament: a free plot of its own with KNOWN medium / high crystite gets a crystite M.U.L.E. ([Atari code] the computers rate
      // crystite on known values only; this simple rule is [PROVISIONAL]).
      const rich = energyOk && foodOk && levelRules(state).crystite ? free.map((q) => ({ q, k: CrystiteSystem.known(state, q.id) }))
        .filter((x) => x.k !== null && x.k >= 2).sort((a, b) => (b.k - a.k) || (a.q.id - b.q.id))[0] : null;
      if (rich) module = 'crystite';
      if (module === 'smithore' && !free.some((q) => q.terrain === TERRAIN.MOUNTAIN)) module = 'food';
      const mine = (q) => (x) => x.ownerId === p.id && x.ruc && x.ruc.module === module;
      const plot = rich ? rich.q : free.map((q) => ({ q, s: ProductionSystem.baseYield(q, module) * 10 + (Plot.neighbours(state.plots, q).some(mine(q)) ? 5 : 0) + rng.next() }))
        .sort((a, b) => b.s - a.s)[0].q;
      // The chosen plot may yield nothing for that module (e.g. smithore on the river): fall back to what it does yield.
      if (!rich && (!ProductionSystem.canProduce(plot, module) || ProductionSystem.baseYield(plot, module) === 0)) {
        module = ['energy', 'food', 'smithore'].find((m) => ProductionSystem.canProduce(plot, m) && ProductionSystem.baseYield(plot, m) > 0);
      }
      const cost = StoreSystem.rucPrice(state) + CONFIG.MODULE_COST[module];
      if (p.cash < cost + reserveCash) break;
      const r = StoreSystem.buyRuc(state, p.id); if (!r.ok) break;
      const m = StoreSystem.buyModule(state, p.id, module);
      if (!m.ok) { StoreSystem.refundRuc(state, p.id, r.price); break; }
      StoreSystem.install(state, p.id, plot.id, { module, paid: r.price });
      if (clock) clock.units = Math.max(0, clock.units - this.installUnits(plot));
      actions.push({ plotId: plot.id, module });
    }
    return actions;
  }
};
