'use strict';
/** AI: sees only public state (prices, stock, markers) and its own inventory. Never the seed or future events. */
const AISystem = {
  profile(p) { return AI_PROFILES[p.aiProfile] || AI_PROFILES.conservative; },
  diff(state) { return CONFIG.DIFFICULTY[state.difficulty]; },
  rucCount(state, p) { return state.plots.filter((q) => q.ownerId === p.id && q.ruc).length; },
  nonEnergyRucs(state, p) { return state.plots.filter((q) => q.ownerId === p.id && q.ruc && q.ruc.module !== 'energy').length; },
  expectedProd(state, p, res) {
    return state.plots.filter((q) => q.ownerId === p.id && q.ruc && q.ruc.module === res).reduce((s, q) => s + ProductionSystem.expectedYield(state, q), 0);
  },
  /** Units worth keeping for next turn. Turn 12 is the last one: nothing left to protect, so sell everything. */
  reserve(state, p, res) {
    if (state.turn >= CONFIG.TURNS) return 0;
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
    const critical = res === 'food' ? ConsumptionSystem.foodNeed(Math.min(CONFIG.TURNS, state.turn + 1)) : res === 'energy' ? this.nonEnergyRucs(state, p) + 1 : 0;
    return (p.inventory[res] || 0) > critical ? ROLE.SELLER : ROLE.BUYER;
  },
  createBrain(state, rng, p) {
    const d = this.diff(state);
    return { id: p.id, role: ROLE.OUT, target: null, nextDecisionAt: rng.range(d.reactMin, d.reactMax), nextMoveAt: 0 };
  },
  /** Picks role + target price. Prices drift from an optimistic start toward the store's price as time passes. */
  decide(state, rng, p, engine) {
    const def = engine.market; const res = def.id;
    const prof = this.profile(p); const d = this.diff(state);
    const inv = p.inventory[res] || 0; const reserve = this.reserve(state, p, res);
    const central = StoreSystem.price(state, def);
    const err = (rng.next() * 2 - 1) * d.valuationErr / 100;
    const val = central * (1 + err);
    const progress = clamp(engine.t / (CONFIG.AUCTION.maxMs * 0.7), 0, 1);
    const storeBid = StoreSystem.bid(state, def); const storeAsk = StoreSystem.ask(state, def);
    const cap = (price) => prof.extremeGuard ? clamp(price, def.basePrice * 0.7, def.basePrice * 1.4) : price;
    const cash = p.cash;
    if (inv > reserve) {
      let margin = prof.margin;
      if (p.aiProfile === 'opportunist' && storeAsk > def.basePrice * 1.15) margin *= 1.5;
      const start = val * (1 + margin / 100);
      let floor = storeBid;
      if (p.aiProfile === 'industrial' && res === 'smithore') floor = Math.max(storeBid, val * 0.9);
      return { role: ROLE.SELLER, target: cap(start - (start - floor) * progress) };
    }
    const desperate = (res === 'food' && inv < ConsumptionSystem.foodNeed(state.turn + 1) - this.expectedProd(state, p, 'food')) || (res === 'energy' && inv < this.nonEnergyRucs(state, p));
    const speculate = p.aiProfile === 'opportunist' && inv < reserve + 6 && central < def.basePrice * 0.85 && cash > 500 && state.turn < CONFIG.TURNS;
    if (inv < reserve || speculate) {
      const start = val * (1 - (speculate ? 10 : prof.margin) / 100);
      // Only starvation / blackout justifies bidding past the store price (up to the store ceiling, never to the UI limit).
      const ceiling = desperate ? def.maxPrice : storeAsk;
      let bid = cap(start + (ceiling - start) * progress);
      const safety = desperate ? 0 : 120;
      bid = Math.min(bid, cash - safety);
      if (bid < def.minPrice) return { role: ROLE.OUT, target: null };
      return { role: ROLE.BUYER, target: bid };
    }
    return { role: ROLE.OUT, target: null };
  },
  /**
   * Declares during the declaration and moves the marker gradually during the trade stage, honouring reaction latency and the 1.5 s
   * decision hold. Roles are fixed after the declaration: an AI that changes its mind retreats instead of switching sides.
   */
  tick(state, rng, p, brain, engine, dt) {
    const e = engine.entry(p.id);
    if (engine.clock >= brain.nextDecisionAt) {
      const d = this.decide(state, rng, p, engine);
      const d0 = this.diff(state);
      brain.nextDecisionAt = engine.clock + Math.max(CONFIG.AUCTION.aiHoldMs, rng.range(d0.reactMin, d0.reactMax));
      if (engine.canDeclare()) { engine.setRole(p.id, d.role); brain.role = d.role; brain.target = d.target; }
      else {
        brain.role = e.role;
        if (e.role === ROLE.OUT) brain.target = null;
        else if (d.role === e.role) brain.target = d.target;
        else brain.target = e.role === ROLE.SELLER ? engine.market.maxPrice : engine.market.minPrice;
      }
    }
    if (engine.stage !== 'trade') return;
    brain.nextMoveAt -= dt;
    if (brain.target !== null && e.role !== ROLE.OUT) {
      while (brain.nextMoveAt <= 0) {
        brain.nextMoveAt += CONFIG.AUCTION.aiMoveMs;
        const diff = brain.target - e.priceF;
        const s = engine.market.step;
        if (Math.abs(diff) >= s) engine.setPrice(p.id, e.priceF + Math.sign(diff) * s);
      }
    } else brain.nextMoveAt = 0;
  },
  /**
   * Development for AI colonists (also used by the autopilot for the human). [manual] the computer players are not shown walking
   * ("they are boring to watch"), so this happens at once, but through the same store rules: robot from the corral, outfit, install.
   */
  develop(state, rng, p) {
    const prof = this.profile(p);
    const reserveCash = { conservative: 320, industrial: 160, opportunist: 220 }[p.aiProfile] || 250;
    const maxInstalls = { conservative: 1, industrial: 2, opportunist: 2 }[p.aiProfile] || 1;
    const actions = [];
    for (let n = 0; n < maxInstalls; n++) {
      const free = state.plots.filter((q) => q.ownerId === p.id && !q.ruc);
      if (!free.length || state.store.ruc < 1 || state.turn >= CONFIG.TURNS) break;
      // Energy RUCs power themselves; every other RUC needs 1 energy from the reserve (plus the new one, plus 1 of margin).
      const energyOk = p.inventory.energy + this.expectedProd(state, p, 'energy') >= this.nonEnergyRucs(state, p) + 2;
      const nextNeed = ConsumptionSystem.foodNeed(Math.min(CONFIG.TURNS, state.turn + 1));
      const foodOk = p.inventory.food + this.expectedProd(state, p, 'food') >= nextNeed + 1;
      let module = !energyOk ? 'energy' : !foodOk ? 'food' : prof.prefers;
      if (module === 'smithore' && !free.some((q) => q.terrain === TERRAIN.MOUNTAIN)) module = 'food';
      const mine = (q) => (x) => x.ownerId === p.id && x.ruc && x.ruc.module === module;
      const scored = free.map((q) => ({ q, s: ProductionSystem.baseYield(q, module) * 10 + (Plot.neighbours(state.plots, q).some(mine(q)) ? 5 : 0) + rng.next() }));
      const plot = scored.sort((a, b) => b.s - a.s)[0].q;
      // The chosen plot may yield nothing for that module (e.g. smithore on the river): fall back to what it does yield.
      if (!ProductionSystem.canProduce(plot, module) || ProductionSystem.baseYield(plot, module) === 0) {
        module = ['energy', 'food', 'smithore'].find((m) => ProductionSystem.canProduce(plot, m) && ProductionSystem.baseYield(plot, m) > 0);
      }
      const cost = StoreSystem.rucPrice(state) + CONFIG.MODULE_COST[module];
      if (p.cash < cost + reserveCash) break;
      const r = StoreSystem.buyRuc(state, p.id); if (!r.ok) break;
      const m = StoreSystem.buyModule(state, p.id, module);
      if (!m.ok) { StoreSystem.refundRuc(state, p.id, r.price); break; }
      StoreSystem.install(state, p.id, plot.id, { module, paid: r.price });
      actions.push({ plotId: plot.id, module });
    }
    return actions;
  }
};
