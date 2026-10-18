'use strict';
const EventSystem = {
  /**
   * [Atari code] ordersPlayer: the ranking of the last Status Summary (total score), ties broken at random. Drawn once at the start of
   * each round (seeded) and kept in the save, so every event of the round sees the same order.
   */
  rankPlayers(state, rng) {
    const rows = state.players.map((p) => ({ id: p.id, w: p.score, tie: rng.next() }));
    state.events.rank = rows.sort((a, b) => (b.w - a.w) || (a.tie - b.tie)).map((x) => x.id);
    return state.events.rank;
  },
  /** The current ranking (1st first); without a drawn one (tests, debug) a stable order by score. */
  rank(state) {
    if (state.events.rank) return state.events.rank;
    return state.players.map((p, i) => ({ id: p.id, w: p.score, i })).sort((a, b) => (b.w - a.w) || (a.i - b.i)).map((x) => x.id);
  },
  mules(state, pid, modules = null) { return state.plots.filter((q) => q.ownerId === pid && q.ruc && (!modules || modules.includes(q.ruc.module))).length; },
  /** [Atari code] calcCashQualityPlayerEvent: |quality| x 25 x (floor(round / 4) + 1), times the MULE count for the per-MULE events. */
  amount(state, id, pid) {
    const def = EVENT_DEFS[id];
    const each = Math.abs(def.quality) * CONFIG.EVENTS.moneyUnit * (Math.floor(state.turn / 4) + 1);
    const count = def.perMule ? this.mules(state, pid, def.perMule) : 1;
    return { each, count, total: each * count };
  },
  /** Personal events that move money (the others give or take goods or land). */
  isMoney(id) { return !['package', 'traveler', 'glac_elves', 'lost_plot', 'extra_plot'].includes(id); },
  /** [Atari code] event preconditions: the search moves on to the next candidate when one fails. */
  precondition(state, id, pid) {
    const def = EVENT_DEFS[id];
    if (def.needs === 'mule') return this.mules(state, pid) > 0;
    if (def.perMule) return this.mules(state, pid, def.perMule) > 0;
    if (def.needs === 'cash') return playerById(state, pid).cash >= this.amount(state, id, pid).total;
    if (def.needs === 'free_plot') return LandGrantSystem.freePlots(state).length > 0;
    return true;
  },
  /** [Atari code] a money penalty the player cannot pay cancels the event silently (no message, no charge, not marked used). */
  affordable(state, id, pid) { return !(this.isMoney(id) && EVENT_DEFS[id].quality < 0) || playerById(state, pid).cash >= this.amount(state, id, pid).total; },
  /** [Atari code] candidate check: not used yet, no bad one for the last two, no good one for the first, precondition holds. */
  eligible(state, idx, pid, rank = this.rank(state)) {
    const id = INDIVIDUAL_EVENT_IDS[idx]; const q = EVENT_DEFS[id].quality;
    if (state.events.used[idx]) return false;
    if (q < 0 && rank.slice(-2).includes(pid)) return false;
    if (q > 0 && rank[0] === pid) return false;
    return this.precondition(state, id, pid);
  },
  /** [Atari code] from `start` downwards with wrap-around (21 -> 0 -> 21), at most 20 candidates. Returns the index or null. */
  search(state, start, pid) {
    const n = INDIVIDUAL_EVENT_IDS.length; const rank = this.rank(state);
    for (let k = 0, x = start; k < CONFIG.EVENTS.personalTries; k++, x = (x + n - 1) % n) if (this.eligible(state, x, pid, rank)) return x;
    return null;
  },
  /**
   * [Atari code] playerEvent, at the start of each player's development turn (humans and computers): random[0..79] < 22 (27.5 %) picks
   * the candidate, then search(); a non-leader with 0 food gets #00 (the package) instead, even if it already happened. A debug-forced
   * event skips the roll, the ranking rules and the used flag, but still needs its precondition and the cash.
   */
  rollIndividual(state, rng, pid, forced = null) {
    let idx = null;
    if (forced) {
      const f = INDIVIDUAL_EVENT_IDS.indexOf(forced);
      if (f < 0 || !this.precondition(state, forced, pid)) return null;
      idx = f;
    } else {
      const a = rng.int(CONFIG.EVENTS.personalDie);
      if (a >= INDIVIDUAL_EVENT_IDS.length) return null;
      idx = this.search(state, a, pid);
      if (idx === null) return null;
      if (idx !== 0 && this.rank(state)[0] !== pid && (playerById(state, pid).inventory.food || 0) === 0) idx = 0;
    }
    const id = INDIVIDUAL_EVENT_IDS[idx];
    if (!this.affordable(state, id, pid)) return null;
    state.events.used[idx] = 1;
    return this.build(state, rng, id, pid);
  },
  /** [Atari code] roundEvent draw: one ticket from the bag, uniformly among the tickets left; the ticket is always consumed. */
  drawPlanet(state, rng) {
    const bag = state.events.bag;
    let r = rng.int(PLANET_EVENT_IDS.reduce((s, id) => s + bag[id], 0));
    for (const id of PLANET_EVENT_IDS) { if (r < bag[id]) { bag[id] -= 1; return id; } r -= bag[id]; }
    return null;
  },
  /** [Atari code] round 12 has no colony event: "THE SHIP IS BACK!" instead. */
  /** [C64] game start: "THE PLANET IRATA." / "THE SHIP WILL BE BACK IN 12 MONTHS." (the level's number of rounds). */
  landing(state) { return { id: 'landing', scope: 'planet', negative: false, name: 'Aterratge', art: 4, origin: 'c64', targetId: null, text: `Aterreu al planeta Irata. La nau tornarà d'aquí a ${lastRound(state)} mesos.`, params: {} }; },
  shipBack() { return { id: 'ship_back', scope: 'planet', negative: false, name: 'La nau ha tornat!', art: 4, origin: 'c64', targetId: null, text: 'La nau de la Federació aterra: s\'ha acabat el temps.', params: {} }; },
  /** [Atari code] random start plot, then down (wrapping) to the first plot that matches. */
  scanPlots(state, rng, pred) {
    const n = state.plots.length; const start = rng.int(n);
    for (let k = 0; k < n; k++) { const q = state.plots[(start - k + n) % n]; if (pred(q)) return q; }
    return null;
  },
  /** The settlement row and item of a plot if this round's production is already done (for the "after production" events). */
  harvestOf(state, plotId) {
    const st = state.settlement; if (!st || st.turn !== state.turn) return null;
    for (const row of st.rows) { const item = row.items.find((x) => x.plotId === plotId); if (item) return { row, item }; }
    return null;
  },
  destroyRuc(state, plot) { if (!plot.ruc) return false; plot.ruc = null; StoreSystem.loseRuc(state); return true; },
  /**
   * [Atari code] planetquake slide: a random mountain loses one level (level 1 becomes plain) and the plot left or right of it gains one
   * (a plain becomes a 1-peak mountain); any MULE on either plot is destroyed. [PROVISIONAL] edge rules (not in the decoded routine):
   * the direction is random and the other side is tried if it is off the map, river, town or already 3 peaks; otherwise no slide.
   */
  slide(state, rng) {
    const src = rng.pick(state.plots.filter((q) => q.terrain === TERRAIN.MOUNTAIN));
    if (!src) return null;
    const dirs = rng.int(2) ? [1, -1] : [-1, 1];
    const dst = dirs.map((d) => state.plots.find((q) => q.y === src.y && q.x === src.x + d))
      .find((q) => q && (q.terrain === TERRAIN.PLAIN || (q.terrain === TERRAIN.MOUNTAIN && q.richness < 3)));
    if (!dst) return null;
    src.richness -= 1; if (src.richness === 0) src.terrain = TERRAIN.PLAIN;
    if (dst.terrain === TERRAIN.PLAIN) { dst.terrain = TERRAIN.MOUNTAIN; dst.richness = 1; } else dst.richness += 1;
    this.destroyRuc(state, src); this.destroyRuc(state, dst);
    return { from: src.id, to: dst.id };
  },
  /**
   * Applies the effect at once (through the ledger) and returns the card record, whose text carries the numbers applied. A planetary
   * event with no valid target (pest, radiation; pest also before this round's production) returns null: a quiet round.
   */
  build(state, rng, id, targetId) {
    const def = EVENT_DEFS[id]; const m = state.modifiers;
    let target = targetId ? playerById(state, targetId) : null;
    const params = {};
    const top2 = this.rank(state).slice(0, 2);
    if (def.scope === 'individual') {
      const a = this.amount(state, id, targetId); Object.assign(params, a, { amount: a.total });
      if (this.isMoney(id)) {
        if (def.quality > 0) ResourceLedger.moveCash(state, 'nature', targetId, a.total);
        else if (!ResourceLedger.moveCash(state, targetId, 'nature', a.total)) return null;
      }
      if (id === 'package') { ResourceLedger.moveItem(state, 'food', 'nature', targetId, 3); ResourceLedger.moveItem(state, 'energy', 'nature', targetId, 2); }
      if (id === 'traveler') ResourceLedger.moveItem(state, 'smithore', 'nature', targetId, 2);
      if (id === 'glac_elves') { const f = target.inventory.food || 0; const n = f - Math.floor(f / 2); if (n > 0) ResourceLedger.moveItem(state, 'food', targetId, 'nature', n); }
      if (id === 'lost_plot') {
        const plot = state.plots.filter((q) => q.ownerId === targetId).sort((x, y) => y.id - x.id)[0];
        this.destroyRuc(state, plot); plot.ownerId = null; target.plots = target.plots.filter((k) => k !== plot.id); params.plot = plot.id + 1;
      }
      if (id === 'extra_plot') { const plot = rng.pick(LandGrantSystem.freePlots(state)); LandGrantSystem.assign(state, targetId, plot.id); params.plot = plot.id + 1; }
    } else {
      if (id === 'pest_attack') {
        const plot = this.scanPlots(state, rng, (q) => {
          if (!q.ruc || q.ruc.module !== 'food' || !top2.includes(q.ownerId)) return false;
          const h = this.harvestOf(state, q.id); return !!h && h.item.amount > 0;
        });
        if (!plot) return null;
        const { row, item } = this.harvestOf(state, plot.id); const n = item.amount;
        target = playerById(state, plot.ownerId);
        ResourceLedger.moveItem(state, 'food', target.id, 'nature', n);
        row.produced.food -= n; row.final.food -= n; item.amount = 0; item.zeroed = 'pest';
        Object.assign(params, { plot: plot.id + 1, amount: n });
      }
      if (id === 'pirates') {
        // [Atari code] $7710: Standard / Beginner take every player's smithore AND the store's, and this round's smithore production;
        // Tournament takes every player's crystite and this round's crystite production (the store's smithore is not touched).
        const res = levelRules(state).crystite ? 'crystite' : 'smithore';
        params.amount = 0; params.res = res;
        state.players.forEach((p) => {
          const k = p.inventory[res] || 0;
          const st = state.settlement && state.settlement.turn === state.turn ? state.settlement.rows.find((r) => r.playerId === p.id) : null;
          if (st && st.produced[res] !== undefined) {
            st.lost[res] += k - st.produced[res]; st.produced[res] = 0; st.final[res] = 0;
            st.items.forEach((it) => { if (it.module === res && it.amount > 0) { it.amount = 0; it.zeroed = 'pirates'; } });
          }
          if (k > 0) { ResourceLedger.moveItem(state, res, p.id, 'nature', k); params.amount += k; }
        });
        const s = res === 'smithore' ? state.store.stock.smithore || 0 : 0;
        if (s > 0) { ResourceLedger.moveItem(state, 'smithore', 'store', 'nature', s); params.amount += s; }
      }
      if (id === 'store_fire') {
        ['food', 'energy', 'smithore'].forEach((r) => { const n = state.store.stock[r] || 0; if (n > 0) ResourceLedger.moveItem(state, r, 'store', 'nature', n); });
      }
      if (id === 'acid_rain') { m.acidRow = rng.int(CONFIG.ROWS); params.row = m.acidRow; }
      if (id === 'sunspot') m.sunspot = true;
      if (id === 'planetquake') { m.quake = true; params.slide = rng.int(2) ? this.slide(state, rng) : null; }
      if (id === 'meteorite') {
        // [Atari code] $7CA7: a plot that is not town or river with crystite < 3 gets a level-4 deposit (no spread) and loses its MULE;
        // the computers know it at once. The "new crystite deposit" subtext is printed only in Tournament ($7DB3).
        const plot = rng.pick(state.plots.filter((q) => q.terrain !== TERRAIN.TOWN && q.terrain !== TERRAIN.RIVER && (q.hiddenDeposit || 0) < 3));
        if (!plot) return null;
        plot.hiddenDeposit = 4; CrystiteSystem.learn(state, plot.id, 4);
        Object.assign(params, { plot: plot.id + 1, mule: this.destroyRuc(state, plot), crystite: levelRules(state).crystite });
      }
      if (id === 'radiation') {
        const plot = this.scanPlots(state, rng, (q) => !!q.ruc && top2.includes(q.ownerId));
        if (!plot) return null;
        target = playerById(state, plot.ownerId); this.destroyRuc(state, plot); params.plot = plot.id + 1;
      }
    }
    params.who = target ? target.name : '';
    const rec = {
      id, scope: def.scope, negative: def.scope === 'individual' ? def.quality < 0 : def.negative, name: def.name, art: def.art, origin: def.origin,
      targetId: target ? target.id : null, text: def.text(params), params
    };
    if (target) target.eventLog.push({ turn: state.turn, id, text: rec.text });
    return rec;
  }
};
