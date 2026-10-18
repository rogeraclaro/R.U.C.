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
    // [Atari code] usage comes before production: next round's food is eaten from what is kept now (the critical level), so the
    // food the colonist's own RUCs will make never counts here.
    if (res === 'food') return Math.max(min, ConsumptionSystem.foodNeed(state.turn + 1) + (prof.extremeGuard ? 2 : 0));
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
    const desperate = (res === 'food' && inv < ConsumptionSystem.foodNeed(state.turn + 1)) || (res === 'energy' && inv < this.nonEnergyRucs(state, p));
    const speculate = p.aiProfile === 'opportunist' && inv < reserve + 6 && central < def.basePrice * 0.85 && cash > 500 && state.turn < lastRound(state);
    if (inv < reserve || speculate) {
      const start = val * (1 - (speculate ? 10 : prof.margin) / 100);
      // Only starvation / blackout justifies bidding past the store price (up to the store ceiling, never to the UI limit).
      const ceiling = desperate ? def.maxPrice : storeAsk;
      // The profile's price guard never applies to starvation / blackout: a cautious computer still pays what it takes to eat.
      let bid = desperate ? start + (ceiling - start) * progress : cap(start + (ceiling - start) * progress);
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
   * Most a computer pays for a plot in a land auction. [Atari code] calcPlotQualityForLandAuctionAi: fixed goods qualities (food 3,
   * energy 2, smithore 6, crystite 12.5 + round / 2), the best exploitation rating with no shortage bonus, + rand(0..7), times the
   * rounds left. The bidding itself is undocumented ([RE] TODO): the money scale is [PROVISIONAL] $3 per rating point (a typical
   * round-1 plot ~ $500-600, close to the $536 sale seen on the [C64]), never more than its cash minus a $200 reserve.
   */
  landValue(state, rng, p, plot) {
    const roundsLeft = Math.max(0, lastRound(state) - state.turn);
    const q = { food: 3, energy: 2, smithore: 6, crystite: 12.5 + state.turn / 2 };
    const rating = (this.bestExploitation(state, p, plot, q, 'land', false).rating + rng.int(8)) * roundsLeft;
    return Math.max(0, Math.floor(Math.min(rating * CONFIG.AI.landDollarsPerPoint, p.cash - 200)));
  },
  /** [Atari code] calcPlotDistFromStore: max(|col - 4|, 2 x |row - 2|), +1 on the river column (1..5; the town itself is 1). */
  storeDist(plot) {
    const dc = Math.abs(plot.x - CONFIG.RIVER_COL);
    return Math.max(dc, 2 * Math.abs(plot.y - CONFIG.TOWN_ROW)) + (dc === 0 ? 1 : 0);
  },
  /** Goods a plot can host: [Atari code] no smithore / crystite on the river, crystite only where the level has it. */
  modulesFor(state, plot) {
    return ['food', 'energy', 'smithore', 'crystite'].filter((r) => ProductionSystem.canProduce(plot, r) && (r !== 'crystite' || levelRules(state).crystite));
  },
  /**
   * [Atari code] calcGoodsQuality: each good rated 0..31 = its average SIMULATED store price over `rounds` rounds (2 in the turn AI,
   * 3 in the land grant) / 8. The simulation (calcGoodsPriceFromWhen, no random term): every colonist's food and energy is pooled
   * with the store's, the RUCs produce at their mean (no energy penalty) and are added each round, then the usual supply / demand
   * formula runs with floors food / energy 10, smithore 50 (M.U.L.E. supply = corral + store smithore / 2, demand fixed at 5),
   * and the round's demand is taken off the pool. A first pass is made and its prices discarded (the pools are kept), as in the code.
   * Crystite (Tournament): (100 + 4 x round) / 8. Pure: the PRNG is not touched.
   */
  goodsQuality(state, rounds) {
    const defs = RESOURCE_DEFS; const start = { food: StoreSystem.price(state, defs.food), energy: StoreSystem.price(state, defs.energy), smithore: StoreSystem.price(state, defs.smithore) };
    const stock = state.store.stock; const P = Object.assign({}, start);
    const pool = {
      food: (stock.food || 0) + state.players.reduce((s, p) => s + (p.inventory.food || 0), 0),
      energy: (stock.energy || 0) + state.players.reduce((s, p) => s + (p.inventory.energy || 0), 0),
      mule: Math.floor((stock.smithore || 0) / 2) + state.store.ruc
    };
    const prod = (res) => state.plots.filter((q) => q.ownerId && q.ruc && q.ruc.module === res).reduce((s, q) => s + ProductionSystem.clampUnits(ProductionSystem.meanYield(state, q)), 0);
    const made = { food: prod('food'), energy: prod('energy') };
    const foodDemand = 4 * ConsumptionSystem.foodNeed(state.turn + 1);
    const energyDemand = state.players.reduce((s, p) => s + this.nonEnergyRucs(state, p), 0) + 4;
    const lim = (v, lo) => clamp(v, lo, CONFIG.STORE_PRICE.max);
    const step = () => {
      pool.food = Math.min(255, pool.food + made.food); pool.energy = Math.min(255, pool.energy + made.energy);
      P.food = lim(StoreSystem.supplyDemand(P.food, foodDemand, pool.food), 10);
      P.energy = lim(StoreSystem.supplyDemand(P.energy, energyDemand, pool.energy), 10);
      P.smithore = lim(StoreSystem.supplyDemand(P.smithore, 5, pool.mule, true), 50);
      pool.food = Math.max(0, pool.food - foodDemand); pool.energy = Math.max(0, pool.energy - energyDemand); pool.mule = Math.max(0, pool.mule - 5);
    };
    step(); Object.assign(P, start);
    const sum = { food: 0, energy: 0, smithore: 0 };
    for (let k = 0; k < rounds; k++) { step(); Object.keys(sum).forEach((r) => { sum[r] += P[r]; }); }
    const q = {};
    Object.keys(sum).forEach((r) => { q[r] = Math.min(CONFIG.STORE_PRICE.max, Math.floor(sum[r] / rounds)) >> 3; });
    q.crystite = levelRules(state).crystite ? (100 + 4 * state.turn) >> 3 : 0;
    return q;
  },
  /**
   * [Atari code] calcPlotProdWithEcos for the AI. mode 'real' = the production rules; 'turn' (AiChooseExpTurn) and 'land'
   * (AiSelectBuyLand) simulate one more RUC of that good: the learning curve counts it, and when it completes a group of 3 the bonus
   * the other plots would gain is added too; economies of scale count +1 per own neighbour of that good ('land' adds 2 per own
   * neighbour of any kind), capped at 1 / 2 / 3. Crystite in a simulation uses the computers' known level. Clamped 0..8.
   */
  capacity(state, p, plot, res, mode) {
    if (!ProductionSystem.canProduce(plot, res)) return 0;
    const sim = mode !== 'real';
    let prod = res === 'crystite' && sim ? (CrystiteSystem.known(state, plot.id) || 0) : ProductionSystem.baseYield(plot, res);
    const owned = state.plots.filter((q) => q.ownerId === p.id && q.ruc && q.ruc.module === res).length;
    const n = owned + (sim ? 1 : 0);
    prod += Math.floor(n / 3);
    if (sim && n % 3 === 0) prod += owned;
    let eco = 0;
    Plot.neighbours(state.plots, plot).filter((q) => q.ownerId === p.id).forEach((q) => { if (mode === 'land') eco += 2; if (q.ruc && q.ruc.module === res) eco += 1; });
    prod += Math.min(eco, { real: 1, turn: 2, land: 3 }[mode]);
    return clamp(prod, 0, CONFIG.PRODUCTION.max);
  },
  /**
   * [Atari code] calcPlotQualityAi: (good quality + one situation bonus) x capacity, max 255. The bonus (not in round 1, not with
   * `bonus` false = land auctions): food 11 if it has no food RUC and no shortage, 10 if short (14 with a colony shortage); energy 12
   * if not short and (no energy RUC or fewer than 1/4 of its RUCs), 11 if short or exactly 1/4 (15 with a colony shortage).
   * "Short" = own stock + own production < this round's requirement; a colony shortage = the store has none of it.
   */
  exploitationRating(state, p, plot, res, quality, mode, bonus = true) {
    let q = quality[res] || 0;
    if (bonus && state.turn > 1 && (res === 'food' || res === 'energy')) {
      const mine = state.plots.filter((x) => x.ownerId === p.id && x.ruc);
      const kind = mine.filter((x) => x.ruc.module === res).length;
      const need = res === 'food' ? ConsumptionSystem.foodNeed(state.turn) : this.nonEnergyRucs(state, p);
      const surplus = (p.inventory[res] || 0) + this.expectedProd(state, p, res) - need;
      const colonyShort = (state.store.stock[res] || 0) === 0;
      const short = 9 + (res === 'food' ? 1 : 2) + (colonyShort ? 4 : 0); const plenty = 10 + (res === 'food' ? 1 : 2);
      if (surplus < 0) q += short;
      else if (kind === 0) q += plenty;
      else if (res === 'energy') { const quarter = Math.floor(mine.length / 4); if (quarter === kind) q += short; else if (quarter > kind) q += plenty; }
    }
    return Math.min(255, q * this.capacity(state, p, plot, res, mode));
  },
  /** [Atari code] calcPlotExpAndQualityAi: the best good for a plot ({ res, rating }); ties go to the cheaper good (food first). */
  bestExploitation(state, p, plot, quality, mode, bonus = true) {
    let best = { res: 'food', rating: -1 };
    this.modulesFor(state, plot).reverse().forEach((res) => {
      const rating = this.exploitationRating(state, p, plot, res, quality, mode, bonus);
      if (rating >= best.rating) best = { res, rating };
    });
    return best;
  },
  /** [Atari code] calcPlayersPlotsQuality: a free plot's land-grant rating = its best exploitation ('land' mode) - store distance, >= 0. */
  landRating(state, p, plot, quality) {
    return Math.max(0, this.bestExploitation(state, p, plot, quality, 'land').rating - this.storeDist(plot));
  },
  /**
   * The goods qualities a computer uses for the land grant: [Atari code] 3 simulated rounds; in round 1 one good, drawn per computer
   * (food 2/4, energy 1/4, smithore 1/4: crystite's ticket leaves the qualities as they are), is rated 32.
   */
  grantQuality(state, rng) {
    const q = this.goodsQuality(state, 3);
    if (state.turn <= 1) { const r = rng.int(4); if (r < 3) q[['food', 'energy', 'smithore'][r]] = 32; }
    return q;
  },
  /**
   * [Atari code] calcPlayerBestPlotAi: scanning from `from`, the highest rating wins (a later plot wins a tie; a 0 is taken only with
   * a 1/4 chance). The row penalty starts at 0 and grows by 1 after plot 27 and after plot 36 (so it only applies when the scan
   * started before them, as in the code). `ratings[id]` = landRating, `free(id)` = claimable. Returns the plot id or -1.
   */
  bestPlot(ratings, from, free, rng) {
    let best = -1; let bestEval = 0; let penalty = 0;
    for (let id = from; id < ratings.length; id++) {
      if (free(id)) {
        const ev = Math.max(0, ratings[id] - penalty);
        if (ev >= bestEval && (ev !== 0 || rng.int(4) === 0)) { bestEval = ev; best = id; }
      }
      if (id === 27 || id === 36) penalty++;
    }
    return best;
  },
  /**
   * [Atari code] playerTurnAi, a computer's whole development turn (also the autopilot's): it has the same units as a human (food),
   * develops while at least 35 are left (develop), then assays (Tournament), then goes to the pub if at least 3 are left. Computers
   * never catch the Wampus. [manual] they are not shown walking ("they are boring to watch"): it happens at once, through the same
   * store rules (RUC from the corral, outfit, install). Returns { installs, assays, pub (cr won, 0 = no visit), unitsLeft }.
   */
  turn(state, rng, p) {
    const clock = { units: ConsumptionSystem.turnUnits(state, p) };
    const installs = this.develop(state, rng, p, clock);
    // [Atari code] Tournament: the assay round comes after the installs and before the pub (CrystiteSystem.aiAssay).
    const assays = CrystiteSystem.aiAssay(state, rng, p, clock);
    const pub = clock.units >= CONFIG.PUB.pubMinUnits ? PubSystem.visit(state, p.id, clock.units) : 0;
    return { installs, assays, pub, unitsLeft: clock.units };
  },
  /** Units an action costs a computer: [Atari code] decreaseTimeFromAction = base + 4 x storeDist (an install: 25 + 4 x 1..5). */
  installUnits(plot) { return CONFIG.PUB.aiInstallUnits + CONFIG.PUB.aiDistUnits * this.storeDist(plot); },
  /**
   * [Atari code] playerTurnAi, phase 1. While >= 35 units are left: rate the goods over 2 simulated rounds; for each own plot (from
   * the last id, each plot at most once per turn) the gain = best exploitation ('turn' simulation) - the current one ('real'; an
   * empty plot is 0 and needs a RUC in the corral and the money for it). A plot whose best good is its current one is skipped; the
   * biggest gain >= 2 that the colonist can pay the outfit for wins (a tie goes to the lower plot id). No cash reserve and no cap
   * other than time. A RUC already there is re-outfitted in place (only the outfit is paid). Each one costs installUnits.
   * `clock` ({ units }): the turn's development units (default: the colonist's full turn).
   */
  develop(state, rng, p, clock = null) {
    const time = clock || { units: ConsumptionSystem.turnUnits(state, p) };
    const actions = []; const done = [];
    while (time.units >= CONFIG.PUB.aiMinUnits) {
      const quality = this.goodsQuality(state, 2);
      // [Atari code] byte_B375: calcGoodsQuality resets it to "real", then the first plot's best-exploitation call leaves it at the
      // turn simulation, so every later plot of the scan rates its CURRENT RUC in that simulated mode too (the code's own comment
      // calls it a bug: the RUC counts itself once more). Kept as in the original.
      let best = null; let sim = false;
      for (let id = state.plots.length - 1; id >= 0; id--) {
        const plot = state.plots[id];
        if (plot.ownerId !== p.id || done.includes(id)) continue;
        let cash = p.cash; let current = 0;
        if (!plot.ruc) {
          if (state.store.ruc < 1) continue;
          cash -= StoreSystem.rucPrice(state); if (cash < 0) continue;
        } else current = this.exploitationRating(state, p, plot, plot.ruc.module, quality, sim ? 'turn' : 'real');
        const b = this.bestExploitation(state, p, plot, quality, 'turn'); sim = true;
        if (plot.ruc && b.res === plot.ruc.module) continue;
        const gain = b.rating - current;
        if (gain < CONFIG.AI.minGain || (best && gain < best.gain) || cash < CONFIG.MODULE_COST[b.res]) continue;
        best = { plot, module: b.res, gain };
      }
      if (!best) break;
      const { plot, module } = best; const reoutfit = !!plot.ruc; done.push(plot.id);
      if (!reoutfit) {
        const r = StoreSystem.buyRuc(state, p.id); if (!r.ok) break;
        if (!StoreSystem.buyModule(state, p.id, module).ok) { StoreSystem.refundRuc(state, p.id, r.price); break; }
        StoreSystem.install(state, p.id, plot.id, { module, paid: r.price });
      } else {
        if (!StoreSystem.buyModule(state, p.id, module).ok) break;
        StoreSystem.install(state, p.id, plot.id, { module, paid: plot.ruc.paid });
      }
      time.units -= this.installUnits(plot);
      actions.push({ plotId: plot.id, module, reoutfit });
    }
    return actions;
  }
};
