'use strict';
/* =====================================================================
 * Self-tests (?test=1). Pure logic only: no DOM, no storage, no assets.
 * ===================================================================== */
function runSelfTests() {
  const results = [];
  const t = (name, fn) => {
    try { const r = fn(); results.push({ name, ok: r === undefined || r === true, detail: r === undefined || r === true ? '' : String(r) }); }
    catch (e) { results.push({ name, ok: false, detail: `threw ${e.message}` }); }
  };
  const eq = (a, b, what = '') => (a === b ? true : `${what} expected ${b}, got ${a}`);
  const fresh = (seed = 'test', difficulty = 'colony') => GameState.create({ seed, difficulty });
  // Ledger-based setters keep the conservation invariant valid (tests that audit must never poke balances directly).
  const setInv = (state, id, res, n) => {
    const cur = ResourceLedger.stock(state, id, res);
    if (n > cur) ResourceLedger.moveItem(state, res, 'nature', id, n - cur); else if (n < cur) ResourceLedger.moveItem(state, res, id, 'nature', cur - n);
  };
  const setCash = (state, id, n) => {
    const cur = ResourceLedger.cash(state, id);
    if (n > cur) ResourceLedger.moveCash(state, 'nature', id, n - cur); else if (n < cur) ResourceLedger.moveCash(state, id, 'nature', cur - n);
  };
  const audited = (state, carried = 0) => { const bad = ResourceLedger.audit(state); if (!RucAudit.ok(state, carried)) bad.push(`RUCs ${JSON.stringify(RucAudit.count(state, carried))}`); return bad.length ? bad.join(';') : true; };
  const engineFor = (state, rng, res, ids, withStore = false, declareMs = 0) => new AuctionEngine({ market: AuctionEngine.fungibleMarket(RESOURCE_DEFS[res]), state, rng, colonists: ids, withStore, declareMs });
  /** A plot with a RUC taken from the corral (so the RUC book-keeping stays exact). */
  const develop = (state, pid, plotId, module) => { LandGrantSystem.assign(state, pid, plotId); const r = StoreSystem.buyRuc(state, pid); state.plots[plotId].ruc = { module, paid: r.price }; return state.plots[plotId]; };
  /** Stand-alone plots (custom tiny maps) for pure production maths. */
  const lone = (id, x, y, terrain, module, richness = 0, owner = 'p0') => { const p = Plot.create(id, x, y, terrain, richness); p.ownerId = owner; p.ruc = { module, paid: 100 }; return p; };
  /**
   * Land-race driver. Human inputs are timestamped on the GAME clock (`at`, ms) and queued up front, so the result must not
   * depend on the frame size `dt` used to advance time.
   */
  const raceRun = (state, rng, land, ms, dt = 10, inputs = []) => {
    inputs.forEach((i) => land.inputs.push({ pid: i.pid, at: i.at }));
    for (let tt = 0; tt < ms && !land.done; tt += dt) LandRace.update(state, rng, land, dt);
  };
  const owners = (state) => state.plots.map((p) => p.ownerId || '-').join('');
  // Walking helpers (pure DevWalk, no DOM).
  const walkState = (seed = 'walk') => { const { state, rng } = fresh(seed); return { state, rng, w: DevWalk.create(state, 'p0', 60000) }; };
  const go = (state, w, dir, ms) => DevWalk.update(state, w, dir, ms);
  const goUntil = (state, w, dir, pred, max = 30000) => { for (let tt = 0; tt < max && !pred(); tt += 10) DevWalk.update(state, w, dir, 10); return pred(); };
  const midY = (TOWN.streetTop + TOWN.streetBottom) / 2; const midX = (TOWN.passX0 + TOWN.passX1) / 2;
  /** Walks up to a building's doorway, pushes long enough to commit, waits out the whole scripted visit, then steps back off. */
  const visit = (state, w, id) => {
    const b = TOWN.buildings.find((x) => x.id === id); const n = w.log.length;
    const dy = b.door === 'bottom' ? -1 : 1;
    goUntil(state, w, { x: 0, y: w.y < midY ? 1 : -1 }, () => Math.abs(w.y - midY) < 4);
    goUntil(state, w, { x: Math.sign(b.spot.x - w.x), y: 0 }, () => Math.abs(w.x - b.spot.x) < 4);
    goUntil(state, w, { x: 0, y: dy }, () => !!w.visiting);
    go(state, w, { x: 0, y: dy }, CONFIG.WALK.visitMs + 50);
    goUntil(state, w, { x: 0, y: -dy }, () => w.latch === null);
    return w.log.slice(n);
  };
  /** Leaves the town through the south exit: the walker lands at the top edge of plot 31 (river, just below the town). */
  const leaveSouth = (state, w) => {
    goUntil(state, w, { x: 0, y: w.y < midY ? 1 : -1 }, () => Math.abs(w.y - midY) < 4);
    goUntil(state, w, { x: Math.sign(midX - w.x), y: 0 }, () => Math.abs(w.x - midX) < 3);
    return goUntil(state, w, { x: 0, y: 1 }, () => w.area === 'map');
  };
  const toHouse = (state, w, plotId) => goUntil(state, w, { x: 0, y: 1 }, () => DevWalk.atHouse(w, state.plots[plotId]));
  /** Presses Acció (starting a deferred install) and runs the game clock past CONFIG.WALK.installMs so it actually applies. */
  const install = (state, w) => { const k = DevWalk.act(state, w); if (k !== 'installing') return k; go(state, w, { x: 0, y: 0 }, CONFIG.WALK.installMs + 50); return 'install'; };
  const mkGame = () => { const g = new Game(document.createElement('canvas'), new AssetLoader([])); g.persist = false; return g; };
  const noSavedAt = (k, v) => (k === 'savedAt' ? undefined : v);

  /* ---------- PRNG and map ---------- */
  t('PRNG: same seed -> same sequence, different seed differs', () => {
    const a = new SeededRNG('x'); const b = new SeededRNG('x'); const c = new SeededRNG('y');
    const sa = [a.next(), a.next(), a.next()]; const sb = [b.next(), b.next(), b.next()];
    if (JSON.stringify(sa) !== JSON.stringify(sb)) return 'sequences differ for equal seeds';
    return c.next() !== sa[0] ? true : 'different seeds gave the same first value';
  });
  t('PRNG: getState/setState resumes the exact stream', () => {
    const a = new SeededRNG('resume'); a.next(); a.next(); const s = a.getState();
    const x = a.next(); const b = new SeededRNG('other'); b.setState(s);
    return eq(b.next(), x, 'resumed value');
  });
  t('Map: 9x5, river column with the town at its centre, >=8 plains, >=8 mountains, 1-3 peaks (60 seeds)', () => {
    for (let i = 0; i < 60; i++) {
      const plots = Plot.generateMap(new SeededRNG(`m${i}`));
      const rivers = plots.filter((p) => p.terrain === TERRAIN.RIVER); const town = plots.filter((p) => p.terrain === TERRAIN.TOWN);
      const plains = plots.filter((p) => p.terrain === TERRAIN.PLAIN).length;
      const mountains = plots.filter((p) => p.terrain === TERRAIN.MOUNTAIN);
      if (plots.length !== 45) return `seed m${i}: ${plots.length} plots`;
      if (rivers.length !== 4 || rivers.some((p) => p.x !== 4) || town.length !== 1 || town[0].id !== 22) return `seed m${i}: river/town wrong`;
      if (plains < 8 || mountains.length < 8) return `seed m${i}: plains ${plains} mountains ${mountains.length}`;
      if (mountains.some((p) => p.richness < 1 || p.richness > 3)) return `seed m${i}: richness`;
    }
    const { state } = fresh();
    return !LandGrantSystem.assign(state, 'p0', 22) && !Plot.claimable(state.plots[22]) ? true : 'the town could be claimed';
  });
  t('Map: same seed generates the same map', () => eq(JSON.stringify(Plot.generateMap(new SeededRNG('same'))), JSON.stringify(Plot.generateMap(new SeededRNG('same')))));

  /* ---------- P0.2 production ---------- */
  t('Production table: [manual] averages river/plain/mountain food 4/2/1, energy 2/3/1, smithore 0/1/1+peaks', () => {
    const { state } = fresh();
    const exp = [['river', 0, 4, 2, 0], ['plain', 0, 2, 3, 1], ['mountain', 1, 1, 1, 2], ['mountain', 2, 1, 1, 3], ['mountain', 3, 1, 1, 4]];
    for (const [ter, rich, f, e, s] of exp) {
      for (const [res, v] of [['food', f], ['energy', e], ['smithore', s]]) {
        const plot = lone(99, 0, 0, ter, res, rich); state.plots = [plot];
        if (ProductionSystem.meanYield(state, plot) !== v) return `${ter}${rich} ${res}: ${ProductionSystem.meanYield(state, plot)} != ${v}`;
      }
    }
  });
  t('Bonuses: adjacency +1 at most (two neighbours still +1); a scattered trio gives +1 each; six plots +2; they add up', () => {
    const { state } = fresh();
    const centre = lone(1, 1, 1, TERRAIN.PLAIN, 'energy'); state.plots = [centre, lone(2, 0, 1, TERRAIN.PLAIN, 'energy'), lone(3, 2, 1, TERRAIN.PLAIN, 'energy')];
    if (ProductionSystem.adjacencyBonus(state, centre) !== 1) return 'two neighbours must give +1, not +2';
    if (ProductionSystem.meanYield(state, centre) !== 5) return `centre: 3 + 1 + 1 expected, got ${ProductionSystem.meanYield(state, centre)}`;
    state.plots = [lone(1, 0, 0, TERRAIN.PLAIN, 'energy'), lone(2, 4, 2, TERRAIN.PLAIN, 'energy'), lone(3, 8, 4, TERRAIN.PLAIN, 'energy')];
    if (state.plots.some((p) => ProductionSystem.adjacencyBonus(state, p) !== 0 || ProductionSystem.learningBonus(state, p) !== 1)) return 'scattered trio must give +1 each and no adjacency';
    state.plots = [0, 2, 4, 6, 8].map((x, i) => lone(i + 1, x, 0, TERRAIN.PLAIN, 'energy')).concat([lone(9, 0, 4, TERRAIN.PLAIN, 'energy')]);
    if (ProductionSystem.learningBonus(state, state.plots[0]) !== 2) return 'six plots of the same good must give +2';
    state.plots = [lone(1, 0, 0, TERRAIN.PLAIN, 'energy'), lone(2, 1, 0, TERRAIN.PLAIN, 'energy', 0, 'p1'), lone(3, 0, 1, TERRAIN.PLAIN, 'food')];
    if (ProductionSystem.adjacencyBonus(state, state.plots[0]) !== 0) return 'a neighbour of another owner or good counted';
    // Manual example: 3 smithore mines, 2 of them side by side -> all +1 (learning curve), the two adjacent +1 more.
    state.plots = [lone(1, 0, 0, TERRAIN.MOUNTAIN, 'smithore', 1), lone(2, 1, 0, TERRAIN.MOUNTAIN, 'smithore', 1), lone(3, 5, 3, TERRAIN.MOUNTAIN, 'smithore', 1)];
    return eq(state.plots.map((p) => ProductionSystem.meanYield(state, p)).join(), '4,4,3', 'manual example');
  });
  t('River smithore stays 0 whatever the bonuses ([manual] no mining in the river valley)', () => {
    const { state, rng } = fresh();
    state.plots = [lone(1, 0, 0, TERRAIN.RIVER, 'smithore'), lone(2, 1, 0, TERRAIN.MOUNTAIN, 'smithore', 1), lone(3, 2, 0, TERRAIN.MOUNTAIN, 'smithore', 1)];
    for (let i = 0; i < 50; i++) if (ProductionSystem.rollYield(state, state.plots[0], rng) !== 0) return 'the river produced smithore';
    return eq(ProductionSystem.meanYield(state, state.plots[0]), 0, 'river mean');
  });
  t('Harvest variation: [Atari code] Standard round(0.5 x binomial) -> -1/0/+1 at ~16/68/16 %, +-2 rare (~0.1 %), seeded', () => {
    const rng = new SeededRNG('var'); const N = 40000; const n = new Map();
    for (let i = 0; i < N; i++) { const v = ProductionSystem.variation(rng); n.set(v, (n.get(v) || 0) + 1); }
    const pct = (v) => 100 * (n.get(v) || 0) / N;
    if ([...n.keys()].some((v) => Math.abs(v) > 3)) return `out of range ${JSON.stringify([...n])}`;
    if (Math.abs(pct(0) - 67.664) > 1.2 || Math.abs(pct(1) - 16.063) > 1 || Math.abs(pct(-1) - 16.063) > 1) return `0 ${pct(0)} +1 ${pct(1)} -1 ${pct(-1)}`;
    return pct(2) + pct(-2) < 0.6 ? true : `+-2 ${pct(2) + pct(-2)} %`;
  });
  t('Harvest variation: seeded, same seed = same harvest, seeds differ, 0..8, never negative, centred on the mean', () => {
    const run = (seed) => { const rng = new SeededRNG(seed); const { state } = fresh(); const plot = lone(1, 0, 0, TERRAIN.RIVER, 'food'); state.plots = [plot]; return Array.from({ length: 400 }, () => ProductionSystem.rollYield(state, plot, rng)); };
    const a = run('h1'); const b = run('h1'); const c = run('h2');
    if (a.join() !== b.join()) return 'same seed gave a different harvest';
    if (a.join() === c.join()) return 'different seeds gave the same harvest';
    if (a.some((v) => v < 0 || v > 8)) return 'out of 0..8';
    const mean = a.reduce((s, v) => s + v, 0) / a.length;
    if (Math.abs(mean - 4) > 0.3) return `mean ${mean} (expected about 4)`;
    const { state } = fresh(); const rng = new SeededRNG('ext');
    state.plots = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((x) => lone(x, x, 0, TERRAIN.MOUNTAIN, 'smithore', 3)).concat([lone(20, 0, 4, TERRAIN.MOUNTAIN, 'food', 1)]);
    if (ProductionSystem.meanYield(state, state.plots[0]) !== 8) return 'nine mines should average 8';
    for (let i = 0; i < 300; i++) for (const p of state.plots) { const v = ProductionSystem.rollYield(state, p, rng); if (v < 0 || v > 8) return `extreme ${v}`; }
  });
  /* ---------- P0.3 energy ---------- */
  const energyCase = (modules, energy) => {
    const { state, rng } = fresh('energy'); state.turn = 2;
    const ids = [0, 2, 6]; modules.forEach((m, i) => develop(state, 'p0', ids[i], m));
    setInv(state, 'p0', 'energy', energy);
    const row = SettlementSystem.run(state, rng).rows[0];
    return { state, row, item: (m) => row.items.filter((it) => it.module === m) };
  };
  t('Energy: with 0 energy an energy RUC still produces (it powers itself)', () => {
    const c = energyCase(['energy'], 0);
    return c.item('energy')[0].active && c.row.used.energy === 0 && c.row.produced.energy > 0 ? true : JSON.stringify(c.row.items);
  });
  t('Energy: with 0 energy a food RUC is stopped; energy made this turn does not power it', () => {
    const c = energyCase(['energy', 'food'], 0);
    return !c.item('food')[0].active && c.row.produced.food === 0 && c.row.stopped === 1 ? true : JSON.stringify(c.row);
  });
  t('Energy: 1 energy, 1 energy RUC + 2 others -> exactly one other runs; only the energy really spent is reported', () => {
    const c = energyCase(['energy', 'food', 'smithore'], 1);
    const others = c.row.items.filter((it) => it.module !== 'energy' && it.active).length;
    if (others !== 1 || !c.item('energy')[0].active) return `active ${JSON.stringify(c.row.items)}`;
    if (c.row.used.energy !== 1 || c.row.stopped !== 1) return `used ${c.row.used.energy} stopped ${c.row.stopped}`;
    return audited(c.state);
  });
  t('Energy shortage: [Atari code] one RANDOM non-energy RUC per missing unit produces nothing (seeded; energy RUCs never hit)', () => {
    const stopped = new Set();
    for (let i = 0; i < 40; i++) {
      const { state } = fresh('energy'); state.turn = 2;
      [0, 2, 6].forEach((id, k) => develop(state, 'p0', id, ['food', 'smithore', 'energy'][k]));
      setInv(state, 'p0', 'energy', 1);
      const act = ProductionSystem.activation(state, state.players[0], new SeededRNG(`pick${i}`));
      const again = ProductionSystem.activation(state, state.players[0], new SeededRNG(`pick${i}`));
      if ([...act.on].join() !== [...again.on].join()) return 'same seed picked differently';
      const off = act.mine.filter((q) => !act.on.has(q.id));
      if (off.length !== 1 || off[0].ruc.module === 'energy' || act.stopped !== 1 || act.powered !== 1) return `missing 1 -> ${JSON.stringify(off.map((q) => q.ruc.module))}`;
      stopped.add(off[0].ruc.module);
    }
    return stopped.size === 2 ? true : `always the same RUC stopped: ${[...stopped]}`;
  });

  /* ---------- P0.1 settlement (consumption, spoilage, harvest) ---------- */
  t('Settlement without harvest: food 4 -3 eaten -0 spoiled = 1; energy 2 -0 spoiled (25% of 2, floored) = 2', () => {
    const { state, rng } = fresh(); state.turn = 1;
    const row = SettlementSystem.run(state, rng).rows[0];
    return `${row.used.food},${row.spoiled.food},${row.final.food},${row.spoiled.energy},${row.final.energy}` === '3,0,1,0,2' ? true : JSON.stringify(row);
  });
  t('Settlement with harvest: old reserve and new harvest traced apart; the harvest is never spoiled this turn', () => {
    const { state, rng } = fresh('harv'); state.turn = 1; setInv(state, 'p0', 'food', 7);
    develop(state, 'p0', 31, 'food'); develop(state, 'p0', 2, 'energy');
    const row = SettlementSystem.run(state, rng).rows[0];
    for (const r of ['food', 'energy', 'smithore']) {
      if (row.final[r] !== row.start[r] - row.used[r] - row.spoiled[r] + row.produced[r]) return `${r}: ${JSON.stringify(row)}`;
    }
    if (row.produced.food < 1 || row.spoiled.food !== 2) return `food spoilage must only touch the reserve: ${JSON.stringify(row)}`;
    return state.players[0].inventory.food === row.final.food ? audited(state) : 'inventory differs from the report';
  });
  t('Settlement: odd amounts and zero (PROVISIONAL floor): food left 3/5/0, energy 3/4/0', () => {
    const got = [6, 8, 0].map((f) => { const { state, rng } = fresh(); state.turn = 1; setInv(state, 'p0', 'food', f); return SettlementSystem.run(state, rng).rows[0]; });
    if (got.map((r) => `${r.spoiled.food}/${r.final.food}`).join() !== '1/2,2/3,0/0') return got.map((r) => `${r.spoiled.food}/${r.final.food}`).join();
    if (got[2].missingFood !== 3) return 'zero food must leave 3 missing';
    const en = [3, 4, 0].map((e) => { const { state, rng } = fresh(); state.turn = 1; setInv(state, 'p0', 'energy', e); return SettlementSystem.run(state, rng).rows[0].spoiled.energy; });
    return eq(en.join(), '0,1,0', 'energy spoilage');
  });
  t('Settlement: [card] smithore only spoils above 50 (50 keeps 50, 51 loses 1)', () => {
    const got = [50, 51].map((n) => { const { state, rng } = fresh(); setInv(state, 'p1', 'smithore', n); state.turn = 1; return SettlementSystem.run(state, rng).rows[1]; });
    return `${got[0].spoiled.smithore}/${got[0].final.smithore},${got[1].spoiled.smithore}/${got[1].final.smithore}` === '0/50,1/50' ? true : JSON.stringify(got.map((r) => r.spoiled));
  });
  t('Settlement: energy is spent from the reserve before spoilage and before the harvest', () => {
    const { state, rng } = fresh('eb'); state.turn = 1; develop(state, 'p0', 31, 'food'); setInv(state, 'p0', 'energy', 5);
    const row = SettlementSystem.run(state, rng).rows[0];
    // 5 - 1 used = 4 left, 25% spoils -> 1; no energy harvest
    return row.used.energy === 1 && row.spoiled.energy === 1 && row.final.energy === 3 ? true : JSON.stringify(row);
  });
  t('Settlement: runs once per turn (reload or a skipped screen never consumes twice)', () => {
    const { state, rng } = fresh('once'); state.turn = 3; develop(state, 'p0', 31, 'food');
    const a = SettlementSystem.run(state, rng); const inv = JSON.stringify(state.players.map((p) => p.inventory)); const r0 = rng.getState();
    const b = SettlementSystem.run(state, rng);
    const back = GameState.clone(state); const c = SettlementSystem.run(back, rng);
    if (a !== b || JSON.stringify(state.players.map((p) => p.inventory)) !== inv || rng.getState() !== r0) return 'second run changed something';
    return JSON.stringify(c) === JSON.stringify(a) ? audited(state) : 'a reloaded state ran the settlement again';
  });

  /* ---------- P0.4 food, time and no debt ---------- */
  t('Food need: [Atari code][C64] 3 per turn in rounds 1-4, 4 in 5-8, 5 in 9-12; hunger costs no money', () => {
    const bands = [1, 4, 5, 8, 9, 12].map((n) => ConsumptionSystem.foodNeed(n)).join();
    if (bands !== '3,3,4,4,5,5') return `bands ${bands}`;
    const { state, rng } = fresh(); state.turn = 5; const p = state.players[0]; setInv(state, 'p0', 'food', 1);
    const cash = p.cash; const row = SettlementSystem.run(state, rng).rows[0];
    if (row.missingFood !== 3) return `missing ${row.missingFood}`;
    return p.cash === cash && !('survivalDebt' in p) && !('debt' in ScoringSystem.breakdown(state, p)) ? true : 'hunger must not cost money';
  });
  t('Development time: [Atari code][C64] 10 + floor(91 x min(1, food / need)) units of 28 PAL frames (full ~56.4 s), any difficulty; species hook', () => {
    const units = [[0, 3], [1, 3], [2, 3], [3, 3], [9, 3], [3, 4], [4, 5]].map(([f, n]) => ConsumptionSystem.devUnits(f, n)).join();
    if (units !== '10,40,70,101,101,78,82') return `units ${units}`;
    for (const diff of Object.keys(CONFIG.DIFFICULTY)) {
      const { state } = fresh('time', diff); state.turn = 1; const p = state.players[0];
      if (ConsumptionSystem.humanTimeMs(state, p) !== 56419) return `${diff}: full food ${ConsumptionSystem.humanTimeMs(state, p)} ms`;
      setInv(state, 'p0', 'food', 1); if (ConsumptionSystem.humanTimeMs(state, p) !== 22344) return `${diff}: 1 food ${ConsumptionSystem.humanTimeMs(state, p)} ms`;
      setInv(state, 'p0', 'food', 0); if (ConsumptionSystem.humanTimeMs(state, p) !== 5586) return `${diff}: no food ${ConsumptionSystem.humanTimeMs(state, p)} ms`;
    }
    const { state } = fresh(); state.turn = 1;
    return eq(ConsumptionSystem.humanTimeMs(state, state.players[0], 9 / 7), 72539, 'species factor 9/7 (Flapper, 36 frames per unit)');
  });

  /* ---------- P1.5 store ---------- */
  t('Start: [Atari code][C64] colonists 4 food / 2 energy; store 8 food / 8 energy / 8 smithore, 14 RUCs (cap 14); modules 25/50/75; plot 500', () => {
    const { state } = fresh(); const st = state.store;
    if (!state.players.every((p) => `${p.inventory.food}/${p.inventory.energy}/${p.inventory.smithore}` === '4/2/0')) return `colonists ${JSON.stringify(state.players.map((p) => p.inventory))}`;
    const got = `${st.stock.food}/${st.stock.energy}/${st.stock.smithore}/${st.ruc}/${CONFIG.RUC_MAX}/${Object.values(CONFIG.MODULE_COST).join('-')}/${CONFIG.PLOT_VALUE}`;
    return eq(got, '8/8/8/14/14/25-50-75/500', 'store');
  });
  t('Store: [Atari code] builds min(14 - corral, floor(smithore / 2)) RUCs between turns, 2 smithore each; no free food/energy restock', () => {
    const { state, rng } = fresh('fab');
    const before = JSON.stringify(state.store);
    if (StoreSystem.betweenTurns(state).rucsMade || JSON.stringify(state.store) !== before) return 'a full corral (14) must build nothing';
    ResourceLedger.moveItem(state, 'food', 'store', 'nature', 8); if (StoreSystem.betweenTurns(state).rucsMade || state.store.stock.food !== 0) return 'free restock';
    state.store.ruc = 10; state.rucs.lost = 4; // four RUCs gone for good, so the RUC book-keeping still closes
    setInv(state, 'p1', 'smithore', 2);
    const e = engineFor(state, rng, 'smithore', ['p1'], true); e.setRole('p1', ROLE.SELLER); e.setPrice('p1', 20);
    for (let i = 0; i < 40 && state.players[1].inventory.smithore > 0; i++) e.update(100);
    if (state.store.stock.smithore !== 10) return `store smithore ${state.store.stock.smithore}`;
    if (state.store.ruc !== 10) return 'a RUC appeared during the same turn';
    const r = StoreSystem.betweenTurns(state);
    if (r.rucsMade !== 4 || state.store.ruc !== 14 || state.store.stock.smithore !== 2) return `made ${r.rucsMade}, corral ${state.store.ruc}, smithore ${state.store.stock.smithore}`;
    state.store.ruc = 12; state.rucs.lost = 6; ResourceLedger.moveItem(state, 'smithore', 'nature', 'store', 1);
    const r2 = StoreSystem.betweenTurns(state);
    if (r2.rucsMade !== 1 || state.store.ruc !== 13 || state.store.stock.smithore !== 1) return `odd smithore: made ${r2.rucsMade}, corral ${state.store.ruc}`;
    return audited(state);
  });
  t('Store prices: [C64] round 1 store buys/sells smithore 50/85, food 15/50, energy 10/45 ([Atari code] P 50/30/25; P-15/P+20, P/P+35)', () => {
    const { state } = fresh();
    const got = ['smithore', 'food', 'energy'].map((id) => `${StoreSystem.price(state, RESOURCE_DEFS[id])}:${StoreSystem.bid(state, RESOURCE_DEFS[id])}/${StoreSystem.ask(state, RESOURCE_DEFS[id])}`).join(' ');
    if (got !== '50:50/85 30:15/50 25:10/45') return `round 1 ${got}`;
    const e = engineFor(state, new SeededRNG('r1'), 'food', ['p0'], true);
    return eq(`${e.entry('store-b').price}/${e.entry('store-s').price}/${e.centralPrice()}`, '15/50/30', 'store lines in the food auction');
  });
  t('Store prices: [Atari code] P x (0.25 + 0.75 x demand/supply), ratio in 1/8 steps, supply 0 -> 1, smithore ratio clamped to [0.25, 3]', () => {
    const f = (P, d, s, c = false) => StoreSystem.supplyDemand(P, d, s, c);
    const got = [f(100, 12, 12), f(100, 6, 12), f(100, 30, 4), f(100, 30, 4, true), f(40, 5, 0), f(100, 1, 40, true), f(100, 0, 40)].join();
    return eq(got, '100,62,587,250,160,43,25', 'supplyDemand');
  });
  t('Store prices: [Atari code] after an auction with trades P = average traded price; floors food 30 / energy 25 / smithore 20, ceiling 250', () => {
    const { state } = fresh();
    StoreSystem.afterAuction(state, 'food', { volume: 0, avg: null }); if (state.storePrice.food !== 30) return 'no trade must keep P';
    StoreSystem.afterAuction(state, 'food', { volume: 3, avg: 44 }); if (state.storePrice.food !== 44) return `avg -> ${state.storePrice.food}`;
    if (`${StoreSystem.bid(state, RESOURCE_DEFS.food)}/${StoreSystem.ask(state, RESOURCE_DEFS.food)}` !== '29/64') return 'lines follow P';
    // Food: end of round 1, need next round 3 -> demand 12; supply = store 8 + sum(max(0, own - 3) / 2) + production (none).
    state.turn = 1; state.storePrice.food = 30; state.players.forEach((p) => setInv(state, p.id, 'food', 4));
    StoreSystem.updatePrices(state, new SeededRNG('u1'));
    if (state.storePrice.food !== 41) return `food scarce: ${state.storePrice.food} (expected floor(30 x 88 / 64) = 41)`;
    state.storePrice.food = 30; setInv(state, 'p0', 'food', 200); StoreSystem.updatePrices(state, new SeededRNG('u2'));
    if (state.storePrice.food !== 30) return `food floor: ${state.storePrice.food}`;
    // Energy: demand = sum(non-energy RUCs) + 4, supply = store + sum(max(0, own - need) x 3/4) + production.
    const b = fresh(); const s2 = b.state; s2.turn = 1; develop(s2, 'p0', 0, 'food'); develop(s2, 'p0', 2, 'smithore');
    ResourceLedger.moveItem(s2, 'energy', 'store', 'nature', 8); s2.players.forEach((p) => setInv(s2, p.id, 'energy', 0));
    StoreSystem.updatePrices(s2, new SeededRNG('u3'));
    if (s2.storePrice.energy !== 118) return `energy scarce: ${s2.storePrice.energy} (expected floor(25 x 304 / 64) = 118)`;
    s2.storePrice.energy = 240; StoreSystem.updatePrices(s2, new SeededRNG('u4'));
    return eq(s2.storePrice.energy, 250, 'ceiling');
  });
  t('Store prices: [Atari code] smithore = max(50, supply/demand) + 7 x binomial step (-28..+28), min 20; RUC price = 2 x smithore rounded down to $10', () => {
    const steps = new Map(); const rng = new SeededRNG('smi');
    for (let i = 0; i < 600; i++) {
      const { state } = fresh(); state.turn = 1; StoreSystem.updatePrices(state, rng);
      const k = (state.storePrice.smithore - 50) / 7;
      if (!Number.isInteger(k) || Math.abs(k) > 4) return `smithore ${state.storePrice.smithore}`;
      steps.set(k, (steps.get(k) || 0) + 1);
    }
    if (!steps.get(0) || !steps.get(1) || !steps.get(-1)) return `steps ${JSON.stringify([...steps])}`;
    // Scarce: corral and smithore empty -> supply 0 -> ratio clamped to 3 -> 50 x 160 / 64 = 125, then the random step.
    const { state } = fresh(); state.turn = 3; state.store.ruc = 0; state.rucs.lost = 14; ResourceLedger.moveItem(state, 'smithore', 'store', 'nature', 8);
    StoreSystem.updatePrices(state, new SeededRNG('scarce'));
    if (Math.abs(state.storePrice.smithore - 125) > 28 || (state.storePrice.smithore - 125) % 7) return `scarce smithore ${state.storePrice.smithore}`;
    const mule = [49, 50, 57, 20, 250].map((P) => { state.storePrice.smithore = P; return StoreSystem.rucPrice(state); }).join();
    return eq(mule, '90,100,110,40,500', 'RUC price');
  });
  t('Auction: [manual] with the store out of stock colonists trade above the store top; with stock a colonist price stops at it (250 + 20)', () => {
    const { state, rng } = fresh(); setInv(state, 'p1', 'food', 3); setCash(state, 'p0', 2000);
    ResourceLedger.moveItem(state, 'food', 'store', 'nature', 8);
    const e = engineFor(state, rng, 'food', ['p0', 'p1'], true);
    e.setRole('p1', ROLE.SELLER); e.setPrice('p1', 300); e.setRole('p0', ROLE.BUYER); e.setPrice('p0', 300); e.update(600);
    if (e.volume !== 1 || e.trades[0].price !== 300) return `no trade above the store ceiling: ${JSON.stringify(e.trades)}`;
    if (ResourceLedger.audit(state).length) return 'ledger';
    const b = fresh(); const e2 = engineFor(b.state, b.rng, 'food', ['p0', 'p1'], true);
    e2.setRole('p0', ROLE.BUYER); e2.setPrice('p0', 500);
    return eq(e2.entry('p0').price, 270, 'price with store stock');
  });

  /* ---------- P1.6 + 6 bis: walking development, return and runaway RUCs ---------- */
  t('Store: returning a RUC refunds 100% of the robot price', () => {
    const { state } = fresh(); const c0 = state.players[0].cash;
    const r = StoreSystem.buyRuc(state, 'p0'); StoreSystem.refundRuc(state, 'p0', r.price);
    return state.players[0].cash === c0 && state.store.ruc === 14 ? audited(state) : 'refund';
  });
  t('Walk: arrows move the colonist (not a cursor); the clock runs while walking and standing still', () => {
    const { state, w } = walkState(); const x0 = w.x; const t0 = w.timeLeft;
    go(state, w, walkDirs(new Set(['ArrowRight'])), 500);
    if (!(w.x > x0)) return 'the colonist did not move';
    if (w.timeLeft !== t0 - 500) return `clock ${w.timeLeft}`;
    go(state, w, { x: 0, y: 0 }, 500);
    return eq(w.timeLeft, t0 - 1000, 'clock while standing');
  });
  t('Controls: arrow keys and the touch pad give the same directions; opposite inputs cancel', () => {
    const a = walkDirs(new Set(['ArrowUp', 'ArrowLeft'])); const b = walkDirs(new Set(), { x: -1, y: -1 }); const c = walkDirs(new Set(['ArrowLeft']), { x: 1, y: 0 });
    return a.x === -1 && a.y === -1 && b.x === -1 && b.y === -1 && c.x === 0 && c.y === 0 ? true : JSON.stringify([a, b, c]);
  });
  t('Walk: buying needs pushing at the corral\'s door for CONFIG.WALK.doorHoldMs; the colonist never walks in; holding after does not charge twice', () => {
    const { state, w } = walkState(); const p = state.players[0]; const c0 = p.cash;
    const b = TOWN.buildings.find((x) => x.id === 'corral');
    goUntil(state, w, { x: Math.sign(b.spot.x - w.x), y: 0 }, () => Math.abs(w.x - b.spot.x) < 4);
    goUntil(state, w, { x: 0, y: 1 }, () => !!w.latch); // walk up to the door (normal, visible movement)
    const doorX = w.x; const doorY = w.y;
    goUntil(state, w, { x: 0, y: 1 }, () => !!w.visiting, CONFIG.WALK.doorHoldMs + 200); // then push to commit
    if (!w.visiting || w.x !== doorX || w.y !== doorY) return `did not commit at the door (visiting ${!!w.visiting}, moved ${w.x !== doorX || w.y !== doorY})`;
    go(state, w, { x: 0, y: 1 }, CONFIG.WALK.visitMs + 50); // let the scripted visit play out fully
    if (w.log.join() !== 'buy' || !w.carrying || w.x !== doorX || w.y !== doorY) return `log ${w.log}, moved ${w.x !== doorX || w.y !== doorY}`;
    go(state, w, { x: 0, y: 1 }, 500); // keep pushing further at the door
    if (w.log.join() !== 'buy') return 'pushing further re-triggered the visit';
    return p.cash === c0 - w.carrying.paid && state.store.ruc === 13 ? audited(state, 1) : `cash ${p.cash}`;
  });
  t('Walk: outfitting for food, energy or smithore needs walking into that shop, paid once', () => {
    for (const res of ['food', 'energy', 'smithore']) {
      const { state, w } = walkState(`out-${res}`); const p = state.players[0];
      if (visit(state, w, `shop_${res}`).length || w.carrying) return 'a shop gave something without a RUC';
      visit(state, w, 'corral'); const c1 = p.cash;
      if (visit(state, w, `shop_${res}`).join() !== 'outfit' || w.carrying.module !== res) return `${res}: not outfitted`;
      if (p.cash !== c1 - CONFIG.MODULE_COST[res]) return `${res}: charged ${c1 - p.cash}`;
      const bad = audited(state, 1); if (bad !== true) return bad;
    }
  });
  t('Walk: leading an outfitted RUC to the house of your own plot and pressing the button installs it, not instantly (no refund)', () => {
    const { state, w } = walkState(); const p = state.players[0]; LandGrantSystem.assign(state, 'p0', 31);
    visit(state, w, 'corral'); visit(state, w, 'shop_food'); const cash = p.cash;
    if (!leaveSouth(state, w) || !toHouse(state, w, 31)) return 'could not reach the house';
    const started = DevWalk.act(state, w);
    if (started !== 'installing' || state.plots[31].ruc || !w.installing || w.carrying) return `act ${started}: must not install at once`;
    if (DevWalk.act(state, w) !== null) return 'the button must be busy while installing';
    go(state, w, { x: 0, y: 0 }, CONFIG.WALK.installMs - 200);
    if (state.plots[31].ruc) return 'installed before CONFIG.WALK.installMs';
    go(state, w, { x: 0, y: 0 }, 250);
    if (!state.plots[31].ruc || state.plots[31].ruc.module !== 'food' || w.carrying || w.installing) return `not installed after installMs: ${w.msg}`;
    return p.cash === cash ? audited(state) : 'installing changed the cash';
  });
  t('Walk speed: 2/3 of the previous PROVISIONAL values (per playtesting feedback)', () => eq(`${CONFIG.WALK.mapSpeed}/${CONFIG.WALK.townSpeed}`, '0.12/0.2', 'WALK speeds'));
  t('Install animation: blocks movement and Acció while it plays, resolves after exactly CONFIG.WALK.installMs', () => {
    const { state, w } = walkState(); LandGrantSystem.assign(state, 'p0', 31);
    visit(state, w, 'corral'); visit(state, w, 'shop_food'); leaveSouth(state, w); toHouse(state, w, 31);
    if (DevWalk.act(state, w) !== 'installing') return 'act did not start installing';
    const x0 = w.x; const y0 = w.y;
    go(state, w, { x: 1, y: 1 }, 300); // also advances the install clock by 300 ms; the check below reads it back rather than assuming 0
    if (w.x !== x0 || w.y !== y0 || DevWalk.act(state, w) !== null) return 'movement or Acció not blocked while installing';
    go(state, w, { x: 0, y: 0 }, CONFIG.WALK.installMs - w.installing.t - 200);
    if (state.plots[31].ruc) return 'installed too early';
    go(state, w, { x: 0, y: 0 }, 250);
    return state.plots[31].ruc && state.plots[31].ruc.module === 'food' && !w.installing ? true : 'not installed on time';
  });
  t('Flee animation (not C64-sourced): the RUC is lost at once, but the dash off blocks movement until CONFIG.WALK.fleeShuffleMs + fleeRunMs', () => {
    const { state, w } = walkState(); LandGrantSystem.assign(state, 'p1', 40);
    visit(state, w, 'corral'); visit(state, w, 'shop_food'); leaveSouth(state, w);
    goUntil(state, w, { x: 0, y: 1 }, () => DevWalk.atHouse(w, state.plots[40]));
    const lostBefore = state.rucs.lost;
    if (DevWalk.act(state, w) !== 'flee' || w.carrying || state.rucs.lost !== lostBefore + 1 || !w.fleeing) return 'the RUC must be lost at once, animation deferred';
    const x0 = w.x; const y0 = w.y;
    go(state, w, { x: 1, y: 0 }, 300); // also advances the flee clock by 300 ms; the check below reads it back rather than assuming 0
    if (w.x !== x0 || w.y !== y0) return 'movement not blocked while fleeing';
    go(state, w, { x: 0, y: 0 }, CONFIG.WALK.fleeShuffleMs + CONFIG.WALK.fleeRunMs - w.fleeing.t - 100);
    if (!w.fleeing) return 'resolved too early';
    go(state, w, { x: 0, y: 0 }, 150);
    return !w.fleeing ? audited(state) : 'flee animation never resolved';
  });
  t('Shop entry is not instant: a brief graze against the doorway (short of CONFIG.WALK.doorHoldMs) does not trigger a visit', () => {
    const { state, w } = walkState(); const p = state.players[0]; const cash0 = p.cash; const ruc0 = state.store.ruc;
    goUntil(state, w, { x: 0, y: w.y < midY ? 1 : -1 }, () => Math.abs(w.y - midY) < 4);
    goUntil(state, w, { x: Math.sign(109 - w.x), y: 0 }, () => Math.abs(w.x - 109) < 4);
    goUntil(state, w, { x: 0, y: -1 }, () => w.y <= TOWN.streetTop + 1); // right up against shop_food's doorway
    go(state, w, { x: 0, y: -1 }, CONFIG.WALK.doorHoldMs - 100); // a shorter push than it takes to commit
    if (!w.latch) return 'test setup: did not even touch the building';
    go(state, w, { x: 0, y: 1 }, 80); // straight back out before committing
    return !w.visiting && !w.visited && !w.carrying && state.store.ruc === ruc0 && p.cash === cash0 && w.log.length === 0 ? true : `grazing acted: log ${w.log}, cash ${p.cash}, corral ${state.store.ruc}`;
  });
  t('Human turn countdown: a 3 s "get ready" modal runs before the walk starts; its clock is untouched until then', () => {
    const g = mkGame(); g.newGame({ seed: 'countdown-1', difficulty: 'relaxed' });
    let guard = 0;
    while (guard++ < 200000 && !(g.turns.phase === 'DEVELOPMENT' && g.devSlot() && g.devSlot().pid === 'p0' && g.devSlot().stage !== 'card')) {
      const s = g.devSlot(); if (s && s.stage === 'card') g.devSkipCard();
      g.tick(50);
    }
    const slot = g.devSlot();
    if (!slot || slot.pid !== 'p0' || slot.stage !== 'countdown' || g.humanWalk()) return `expected the human's countdown, got phase ${g.turns.phase} stage ${slot && slot.stage}`;
    for (let i = 0; i < Math.floor(CONFIG.DEV.countdownMs / 50) - 2; i++) g.tick(50);
    if (g.humanWalk()) return 'the walk started before the 3 s countdown finished';
    for (let i = 0; i < 4; i++) g.tick(50);
    const w = g.humanWalk();
    // A little slack: some of these 4 ticks land after the walk was already created and ticking down its own clock.
    return w && w.timeTotal - w.timeLeft <= 200 ? true : `walk did not start with a fresh clock (${JSON.stringify(w)})`;
  });
  t('Walk: no remote development (no panel API, the button does nothing in town); unoutfitted or a foreign plot never installs', () => {
    if (['humanPickPlot', 'confirmInstall', 'chooseModule', 'buyRuc', 'returnRuc', 'canInstall'].some((m) => typeof Game.prototype[m] === 'function')) return 'a remote development API still exists';
    let { state, w } = walkState(); LandGrantSystem.assign(state, 'p0', 31); LandGrantSystem.assign(state, 'p1', 40);
    visit(state, w, 'corral');
    if (DevWalk.act(state, w) !== null || !w.carrying) return 'the button in town must do nothing';
    leaveSouth(state, w); toHouse(state, w, 31);
    if (DevWalk.act(state, w) !== null || !w.carrying || state.plots[31].ruc) return 'an unoutfitted RUC must not be installed';
    goUntil(state, w, { x: 0, y: 1 }, () => DevWalk.atHouse(w, state.plots[40]));
    if (DevWalk.act(state, w) !== 'flee' || w.carrying || state.plots[40].ruc) return 'a foreign plot must make it run away';
    // The whole plot tile counts as home, not a small radius at its centre: landing right at the edge still installs.
    ({ state, w } = walkState('walk2')); LandGrantSystem.assign(state, 'p0', 31);
    visit(state, w, 'corral'); visit(state, w, 'shop_food'); leaveSouth(state, w);
    if (!DevWalk.atHouse(w, state.plots[31])) return 'the whole plot tile must count as the house, not just its centre';
    if (install(state, w) !== 'install' || state.plots[31].ruc.module !== 'food') return 'installing from the tile edge must work';
    return audited(state);
  });
  t('Walk: changing an installed RUC = pick it up at the plot, re-outfit it in a shop (paid) and walk back to install it', () => {
    const { state, w } = walkState(); const p = state.players[0]; LandGrantSystem.assign(state, 'p0', 31);
    visit(state, w, 'corral'); visit(state, w, 'shop_food'); leaveSouth(state, w); toHouse(state, w, 31); install(state, w);
    const cash = p.cash; const t0 = w.timeLeft;
    if (DevWalk.act(state, w) !== 'pickup' || state.plots[31].ruc || w.carrying.module !== 'food') return 'pick up';
    if (!goUntil(state, w, { x: 0, y: -1 }, () => w.area === 'town')) return 'could not go back to town';
    if (visit(state, w, 'shop_energy').join() !== 'outfit') return 're-outfit';
    if (p.cash !== cash - CONFIG.MODULE_COST.energy) return `re-outfit charged ${cash - p.cash}`;
    leaveSouth(state, w); toHouse(state, w, 31);
    if (install(state, w) !== 'install' || state.plots[31].ruc.module !== 'energy') return 'reinstall';
    if (!(w.timeLeft < t0 - 2000)) return 'the round trip must cost development time';
    return audited(state);
  });
  t('Walk: [manual] back in the corral before time is up = robot refunded, outfitting lost', () => {
    const { state, w } = walkState(); const p = state.players[0]; const c0 = p.cash;
    if (visit(state, w, 'corral').join() !== 'buy') return 'buy';
    if (visit(state, w, 'shop_energy').join() !== 'outfit') return 'outfit';
    if (visit(state, w, 'corral').join() !== 'return') return 'return';
    if (p.cash !== c0 - CONFIG.MODULE_COST.energy || w.carrying || state.store.ruc !== 14) return `cash ${p.cash}, corral ${state.store.ruc}`;
    return audited(state);
  });
  t('Walk: [manual] time running out (or ending the turn) while leading a RUC = it runs away; nothing back, never in the corral again', () => {
    for (const how of ['timeout', 'done']) {
      const { state, w } = walkState(`flee-${how}`); const p = state.players[0];
      visit(state, w, 'corral'); visit(state, w, 'shop_food'); const cash = p.cash;
      if (how === 'timeout') go(state, w, { x: 0, y: 0 }, 70000);
      else { DevWalk.end(state, w, 'done'); go(state, w, { x: 0, y: 0 }, CONFIG.WALK.fleeShuffleMs + CONFIG.WALK.fleeRunMs + 50); }
      if (w.ended !== how || w.carrying || w.fleeing) return `${how}: still carrying or fleeing (ended ${w.ended})`;
      if (p.cash !== cash || state.store.ruc !== 13 || state.rucs.lost !== 1) return `${how}: cash ${p.cash} corral ${state.store.ruc} lost ${state.rucs.lost}`;
      const bad = audited(state); if (bad !== true) return bad;
    }
  });
  t('Walk: save / resume mid-walk (JSON) keeps position, RUC and clock and continues identically', () => {
    const { state, rng, w } = walkState(); LandGrantSystem.assign(state, 'p0', 31);
    visit(state, w, 'corral'); visit(state, w, 'shop_food'); go(state, w, { x: 1, y: 1 }, 700);
    const snap = JSON.stringify({ state, w, rng: rng.getState() }); const back = JSON.parse(snap);
    if (JSON.stringify(back) !== snap || back.w.carrying.module !== 'food') return 'round trip';
    const script = (st, ww) => { leaveSouth(st, ww); toHouse(st, ww, 31); DevWalk.act(st, ww); go(st, ww, { x: 1, y: -1 }, 900); };
    script(state, w); script(back.state, back.w);
    return JSON.stringify({ s: back.state, w: back.w }) === JSON.stringify({ s: state, w }) ? true : 'diverged after resuming';
  });

  /* ---------- P1.7 auctions ---------- */
  t('Auction order: [manual] smithore -> food -> energy; crystite would go second with no engine change (still off)', () => {
    if (auctionResources().map((d) => d.id).join() !== 'smithore,food,energy') return auctionResources().map((d) => d.id).join();
    const defs = Object.assign({}, RESOURCE_DEFS, { crystite: Object.assign({}, RESOURCE_DEFS.crystite, { enabled: true }) });
    FEATURES.crystite = true;
    try { const ids = auctionResources(defs).map((d) => d.id).join(); if (ids !== 'smithore,crystite,food,energy') return ids; } finally { FEATURES.crystite = false; }
    const phases = mkGame().turns.phases.map((p) => p.id).filter((id) => id.startsWith('AUCTION_')).join();
    return eq(phases, 'AUCTION_smithore,AUCTION_food,AUCTION_energy', 'phase order');
  });
  t('Declaration: roles change freely until the declare timer ends, then they are fixed; no trade meanwhile', () => {
    const { state, rng } = fresh(); setInv(state, 'p1', 'food', 5);
    const e = engineFor(state, rng, 'food', ['p0', 'p1'], false, 3000);
    if (!e.setRole('p0', ROLE.SELLER) || !e.setRole('p0', ROLE.BUYER) || !e.setRole('p1', ROLE.SELLER)) return 'declaring failed';
    e.setPrice('p0', 60); e.setPrice('p1', 20);
    e.update(2990); if (e.volume || e.stage !== 'declare') return 'traded or ended the declaration early';
    e.update(10); if (e.stage !== 'trade') return 'the declaration did not end';
    if (e.setRole('p0', ROLE.SELLER) || e.entry('p0').role !== ROLE.BUYER) return 'the role changed after the declaration';
    e.update(500); return eq(e.volume, 1, 'trade after the declaration');
  });
  t('Declaration: snapshot / restore in the middle of the declaration resumes the auction identically (AI included)', () => {
    const mk = () => {
      const { state, rng } = fresh('decl'); setInv(state, 'p1', 'food', 9); setInv(state, 'p2', 'food', 0);
      const e = new AuctionEngine({ market: AuctionEngine.fungibleMarket(RESOURCE_DEFS.food), state, rng, colonists: ['p0', 'p1', 'p2', 'p3'], declareMs: 5000 });
      const brains = {}; state.players.forEach((p) => { brains[p.id] = AISystem.createBrain(state, rng, p); });
      return { state, rng, e, brains };
    };
    const tick = (X, n) => { for (let i = 0; i < n; i++) { X.state.players.forEach((p) => AISystem.tick(X.state, X.rng, p, X.brains[p.id], X.e, 50)); X.e.update(50); } };
    const A = mk(); tick(A, 40);
    if (A.e.stage !== 'declare') return 'not in the declaration';
    const B0 = JSON.parse(JSON.stringify({ state: A.state, eng: A.e.snapshot(), brains: A.brains, rng: A.rng.getState() }));
    const rngB = new SeededRNG('x'); rngB.setState(B0.rng);
    const B = { state: B0.state, rng: rngB, brains: B0.brains, e: AuctionEngine.restore(B0.eng, { market: AuctionEngine.fungibleMarket(RESOURCE_DEFS.food), state: B0.state, rng: rngB }) };
    tick(A, 600); tick(B, 600);
    if (A.e.stage !== 'trade') return 'never left the declaration';
    return JSON.stringify(A.e.snapshot()) === JSON.stringify(B.e.snapshot()) && JSON.stringify(A.state) === JSON.stringify(B.state) ? true : 'diverged after restore';
  });
  t('Auction ties: [manual] at the same price the poorer colonist trades first; the store after colonists', () => {
    let { state, rng } = fresh(); setInv(state, 'p1', 'food', 5); setCash(state, 'p2', 3000); setCash(state, 'p3', 500);
    let e = engineFor(state, rng, 'food', ['p1', 'p2', 'p3']);
    e.setRole('p1', ROLE.SELLER); e.setPrice('p1', 40); e.setRole('p2', ROLE.BUYER); e.setPrice('p2', 40); e.setRole('p3', ROLE.BUYER); e.setPrice('p3', 40);
    e.update(500); if (!e.trades[0] || e.trades[0].buyer !== 'p3') return `buyer tie won by ${e.trades[0] && e.trades[0].buyer}`;
    ({ state, rng } = fresh()); setInv(state, 'p1', 'food', 5); setInv(state, 'p2', 'food', 5); setCash(state, 'p1', 3000);
    e = engineFor(state, rng, 'food', ['p1', 'p2', 'p3']);
    e.setRole('p1', ROLE.SELLER); e.setPrice('p1', 40); e.setRole('p2', ROLE.SELLER); e.setPrice('p2', 40); e.setRole('p3', ROLE.BUYER); e.setPrice('p3', 40);
    e.update(500); if (!e.trades[0] || e.trades[0].seller !== 'p2') return `seller tie won by ${e.trades[0] && e.trades[0].seller}`;
    ({ state, rng } = fresh()); setInv(state, 'p1', 'food', 5);
    e = engineFor(state, rng, 'food', ['p1', 'p3'], true);
    const ask = e.entry('store-s').price;
    e.setRole('p1', ROLE.SELLER); e.setPrice('p1', ask); e.setRole('p3', ROLE.BUYER); e.setPrice('p3', ask);
    e.update(500); return e.trades[0] && e.trades[0].seller === 'p1' ? true : `store tie: ${JSON.stringify(e.trades)}`;
  });
  t('Trade price: where the lines meet (the resting marker); same-tick fallback = rounded midpoint (PROVISIONAL)', () => {
    let { state, rng } = fresh(); setInv(state, 'p1', 'food', 5);
    let e = engineFor(state, rng, 'food', ['p0', 'p1']);
    e.setRole('p1', ROLE.SELLER); e.setPrice('p1', 40); e.setRole('p0', ROLE.BUYER); e.setPrice('p0', 30);
    e.update(100); e.setPrice('p0', 45); e.update(500);
    if (!e.trades[0] || e.trades[0].price !== 40) return `buyer moving up must pay the resting ask: ${JSON.stringify(e.trades)}`;
    ({ state, rng } = fresh()); setInv(state, 'p1', 'food', 5);
    e = engineFor(state, rng, 'food', ['p0', 'p1']);
    e.setRole('p0', ROLE.BUYER); e.setPrice('p0', 41); e.setRole('p1', ROLE.SELLER); e.setPrice('p1', 40);
    const c0 = state.players[0].cash;
    e.update(499); if (e.volume !== 0) return 'traded before 500 ms';
    e.update(1); if (e.volume !== 1 || e.trades[0].price !== 41) return `midpoint ${e.trades[0] && e.trades[0].price}`;
    if (state.players[0].cash !== c0 - 41 || state.players[0].inventory.food !== 5) return 'buyer balances';
    return audited(state);
  });
  t('Auction: crossing that breaks resets the 500 ms timer', () => {
    const { state, rng } = fresh(); setInv(state, 'p1', 'food', 5);
    const e = engineFor(state, rng, 'food', ['p0', 'p1']);
    e.setRole('p0', ROLE.BUYER); e.setPrice('p0', 41); e.setRole('p1', ROLE.SELLER); e.setPrice('p1', 40);
    e.update(400); e.setPrice('p0', 30); e.update(100); e.setPrice('p0', 41); e.update(400);
    return eq(e.volume, 0, 'volume after interruption');
  });
  t('Auction: markers separate 2 steps after a trade (PROVISIONAL, see README)', () => {
    const { state, rng } = fresh(); setInv(state, 'p1', 'smithore', 5);
    const e = engineFor(state, rng, 'smithore', ['p0', 'p1']);
    e.setRole('p0', ROLE.BUYER); e.setPrice('p0', 60); e.setRole('p1', ROLE.SELLER); e.setPrice('p1', 60);
    e.update(500);
    if (e.volume !== 1) return 'no trade';
    return e.entry('p0').price === 56 && e.entry('p1').price === 64 ? true : `markers ${e.entry('p0').price}/${e.entry('p1').price}`;
  });
  t('Auction: highest bid wins', () => {
    const { state, rng } = fresh(); setInv(state, 'p1', 'food', 3);
    const e = engineFor(state, rng, 'food', ['p0', 'p1', 'p2'], true);
    e.setRole('p1', ROLE.SELLER); e.setPrice('p1', 20);
    e.setRole('p0', ROLE.BUYER); e.setPrice('p0', 50);
    e.setRole('p2', ROLE.BUYER); e.setPrice('p2', 60);
    e.update(500);
    return eq(e.trades[0] && e.trades[0].buyer, 'p2', 'winner');
  });
  t('Auction: the store sells only real stock and buys colonist surplus', () => {
    const { state, rng } = fresh(); ResourceLedger.moveItem(state, 'food', 'store', 'nature', 8); setInv(state, 'p0', 'food', 4);
    let e = engineFor(state, rng, 'food', ['p0', 'p1'], true);
    e.setRole('p1', ROLE.BUYER); e.setPrice('p1', 120); e.update(600);
    if (e.volume !== 0) return 'the store sold with empty stock';
    e = engineFor(state, rng, 'food', ['p0', 'p1'], true);
    e.setRole('p0', ROLE.SELLER); e.setPrice('p0', 15); e.update(600);
    return e.volume >= 1 && state.store.stock.food >= 1 ? audited(state) : 'the store did not buy';
  });
  t('Auction: blocked without cash or stock, state untouched (atomic)', () => {
    const { state, rng } = fresh(); state.players[0].cash = 10; state.players[1].inventory.food = 1;
    const e = engineFor(state, rng, 'food', ['p0', 'p1']);
    const snap = JSON.stringify(state);
    const b = e.entry('p0'); const s = e.entry('p1'); b.price = 50; s.price = 30;
    let r = e.tryTrade(b, s, 40);
    if (r.ok || r.reason !== 'no_cash') return `cash block: ${JSON.stringify(r)}`;
    state.players[0].cash = 500; state.players[1].inventory.food = 0;
    const snap2 = JSON.stringify(state);
    r = e.tryTrade(b, s, 40);
    if (r.ok || r.reason !== 'no_stock') return `stock block: ${JSON.stringify(r)}`;
    return JSON.stringify(state) === snap2 && snap !== snap2 ? true : 'state changed by a blocked trade';
  });
  t('Auction: ends on time, when all are out, and with no possible deal', () => {
    let { state, rng } = fresh(); let e = engineFor(state, rng, 'food', ['p0', 'p1']);
    e.setRole('p0', ROLE.BUYER); for (let i = 0; i < 46; i++) e.update(1000);
    if (e.endReason !== 'time') return `reason ${e.endReason}`;
    ({ state, rng } = fresh()); e = engineFor(state, rng, 'food', ['p0', 'p1']);
    e.update(2900); if (e.ended) return 'ended too early (all out)';
    e.update(200); if (e.endReason !== 'all_out') return `all_out ${e.endReason}`;
    ({ state, rng } = fresh()); state.players.forEach((p) => { p.inventory.food = 0; }); e = engineFor(state, rng, 'food', ['p0', 'p1']);
    e.setRole('p0', ROLE.BUYER); e.update(4900); if (e.ended) return 'no_ops too early';
    e.update(200); return eq(e.endReason, 'no_ops', 'no possible deal');
  });
  t('Auction: a 4th resource needs no engine change', () => {
    const { state, rng } = fresh();
    const def = { id: 'gizmo', label: 'Gizmo', basePrice: 40, minPrice: 10, maxPrice: 90, auctionStep: 1 };
    state.ext.items.gizmo = 0; state.store.stock.gizmo = 0; state.initialTotals.items.gizmo = 0;
    setInv(state, 'p0', 'gizmo', 3); setCash(state, 'p1', 200);
    const e = new AuctionEngine({ market: AuctionEngine.fungibleMarket(def), state, rng, colonists: ['p0', 'p1'], withStore: false });
    e.setRole('p0', ROLE.SELLER); e.setPrice('p0', 30); e.setRole('p1', ROLE.BUYER); e.setPrice('p1', 50); e.update(500);
    return e.volume === 1 && state.players[1].inventory.gizmo === 1 && ResourceLedger.audit(state).length === 0 ? true : 'gizmo trade failed';
  });
  t('Auction: generic single lot (future land) transfers ownership', () => {
    const { state, rng } = fresh(); const plot = state.plots[0]; plot.ownerId = 'p1'; state.players[1].plots.push(plot.id);
    const market = { id: 'land', label: 'Terra', minPrice: 50, maxPrice: 500, step: 5, basePrice: 300, kind: 'plot',
      createLot: (st, sellerId) => ({ id: `plot:${plot.id}`, kind: 'plot', quantity: 1, sellerId, transferable: plot.ownerId === sellerId, getValue: () => 300,
        transfer: (s2, toId) => { plot.ownerId = toId; return true; } }) };
    const e = new AuctionEngine({ market, state, rng, colonists: ['p0', 'p1'], withStore: false });
    e.setRole('p1', ROLE.SELLER); e.setPrice('p1', 200); e.setRole('p0', ROLE.BUYER); e.setPrice('p0', 250); e.update(500);
    return e.volume === 1 && plot.ownerId === 'p0' ? true : 'plot did not change owner';
  });
  t('Phase B stays off: flags false, crystite disabled and not auctioned, hidden deposits kept', () => {
    const ids = enabledResources().map((d) => d.id).join();
    if (ids !== 'food,energy,smithore') return `enabled ${ids}`;
    if (RESOURCE_DEFS.crystite.enabled || !('hiddenDeposit' in fresh().state.plots[0])) return 'crystite / hiddenDeposit';
    return FEATURES.crystite === false && FEATURES.wampus === false && FEATURES.landAuctions === false ? true : 'a Phase B flag is on';
  });

  /* ---------- P2.8 land ---------- */
  t('Land race: cursor sweeps free plots row-major, skips owned plots and the town instantly, 400 ms per free plot (Colònia)', () => {
    const { state, rng } = fresh('land1');
    [0, 1, 5, 9].forEach((id) => LandGrantSystem.assign(state, 'p3', id));
    const land = LandRace.create(state, rng, []);
    if (land.msPerPlot !== 400) return `msPerPlot ${land.msPerPlot}`;
    const seq = [land.cursor]; const stamps = [land.clock]; let last = land.cursor;
    while (!land.done) {
      LandRace.update(state, rng, land, 10);
      if (land.cursor >= 0 && land.cursor !== last) { seq.push(land.cursor); stamps.push(land.clock); last = land.cursor; }
    }
    const expected = state.plots.filter((p) => Plot.claimable(p)).map((p) => p.id);
    if (seq.join() !== expected.join()) return `sequence ${seq.join()} != ${expected.join()}`;
    if (seq.includes(22)) return 'the town was offered';
    const gaps = stamps.slice(1).map((v, i) => v - stamps[i]);
    return gaps.every((g) => g === 400) ? true : `dwell gaps ${[...new Set(gaps)].join(',')}`;
  });
  t('Land race: speed per difficulty (500 / 400 / 300 ms) and claim pause (2000 ms) come from CONFIG', () => {
    const got = ['relaxed', 'colony', 'ruthless'].map((d) => { const { state, rng } = fresh('spd', d); return LandRace.create(state, rng, []).msPerPlot; });
    if (CONFIG.LAND.landClaimPauseMs !== 2000) return `claim pause ${CONFIG.LAND.landClaimPauseMs}`;
    return eq(got.join(), '500,400,300', 'ms per plot');
  });
  t('Land race: a colonist claims at most ONE plot per turn; later presses are ignored', () => {
    const { state, rng } = fresh('land2');
    const land = LandRace.create(state, rng, []);
    raceRun(state, rng, land, 3000, 10, [{ pid: 'p0', at: 100 }, { pid: 'p0', at: 200 }, { pid: 'p1', at: 2200 }]);
    if (state.players[0].plots.join() !== '0') return `p0 plots ${state.players[0].plots}`;
    if (state.players[1].plots.join() !== '1') return `p1 plots ${state.players[1].plots}`;
    return land.claimed.p0 === 0 && land.claimed.p1 === 1 && !ResourceLedger.audit(state).length ? true : 'claimed map';
  });
  t('Land race: simultaneous claims -> lower net worth wins; equal -> previous order rotated', () => {
    let { state, rng } = fresh('land3'); state.turn = 3; state.landOrder = ['p0', 'p1', 'p2', 'p3'];
    setCash(state, 'p1', 2000); setCash(state, 'p2', 500);
    let land = LandRace.create(state, rng, []);
    raceRun(state, rng, land, 100, 10, [{ pid: 'p1', at: 50 }, { pid: 'p2', at: 50 }]);
    if (state.plots[0].ownerId !== 'p2') return `poorer colonist should win, got ${state.plots[0].ownerId}`;
    if (!land.eligible.includes('p1') || land.claimed.p1 !== undefined) return 'the loser must stay in the race';
    ({ state, rng } = fresh('land3b')); state.turn = 3; state.landOrder = ['p0', 'p1', 'p2', 'p3'];
    land = LandRace.create(state, rng, []);
    if (land.tieOrder.join() !== 'p1,p2,p3,p0') return `tieOrder ${land.tieOrder}`;
    raceRun(state, rng, land, 100, 10, [{ pid: 'p0', at: 50 }, { pid: 'p2', at: 50 }]);
    if (state.plots[0].ownerId !== 'p2') return `tie-break winner ${state.plots[0].ownerId}`;
    ({ state, rng } = fresh('land3c')); state.turn = 1;
    return eq(LandGrantSystem.tieOrder(state).join(), 'p0,p1,p2,p3', 'turn 1 tie order');
  });
  t('Land race: [manual] ONE sweep only — a colonist who never presses gets no plot; the other three claim normally', () => {
    const { state, rng } = fresh('land4'); const land = LandRace.create(state, rng, ['p1', 'p2', 'p3']);
    for (let i = 0; i < 100000 && !land.done; i++) LandRace.update(state, rng, land, 10);
    if (land.sweep !== 1) return 'a second sweep started';
    if (state.players[0].plots.length !== 0) return 'the idle colonist got a plot';
    if (!['p1', 'p2', 'p3'].every((id) => playerById(state, id).plots.length === 1)) return `AI plots ${state.players.map((p) => p.plots.length)}`;
    return LandGrantSystem.freePlots(state).length > 0 ? true : 'no free plot was left (test too weak)';
  });
  t('Land race AI: only public cursor path, reaction time respected, always retargets ahead', () => {
    const { state, rng } = fresh('land5'); const d = CONFIG.DIFFICULTY.colony;
    const land = LandRace.create(state, rng, state.players.map((p) => p.id));
    let lastClaim = null; const claims = []; let resumedAt = 0; let prevCursor = land.cursor;
    for (let i = 0; i < 20000 && !land.done; i++) {
      LandRace.update(state, rng, land, 10);
      if (prevCursor < 0 && land.cursor >= 0) resumedAt = land.clock;
      prevCursor = land.cursor;
      Object.entries(land.ai).forEach(([pid, a]) => { if (land.cursor >= 0 && a.target < land.cursor) throw new Error(`${pid} aims at ${a.target} behind cursor ${land.cursor}`); });
      if (land.lastClaim && land.lastClaim !== lastClaim && (!lastClaim || land.lastClaim.clock !== lastClaim.clock || land.lastClaim.pid !== lastClaim.pid)) { claims.push({ ...land.lastClaim, since: land.lastClaim.clock - resumedAt }); lastClaim = land.lastClaim; }
    }
    if (claims.length !== 4) return `claims ${claims.length}`;
    if (claims.some((c) => c.since < d.reactMin)) return `a claim before the minimum reaction time after the cursor resumed: ${claims.map((c) => c.since)}`;
    return state.players.every((p) => p.plots.length === 1) ? true : 'every colonist must end with exactly one plot';
  });
  t('Land race pause: after a claim the cursor is hidden and NOBODY can claim for 2000 ms', () => {
    const { state, rng } = fresh('pause1');
    const land = LandRace.create(state, rng, []);
    raceRun(state, rng, land, 110, 10, [{ pid: 'p0', at: 100 }]);
    if (land.claimed.p0 !== 0) return 'p0 should have claimed plot 0';
    if (land.cursor !== -1 || land.pause <= 0) return `cursor ${land.cursor}, pause ${land.pause}`;
    if (LandRace.canClaim(land, 'p1') || LandRace.press(land, 'p1')) return 'a press was accepted during the pause';
    raceRun(state, rng, land, 1500, 10, [{ pid: 'p1', at: 500 }, { pid: 'p2', at: 1500 }]);
    if (state.players[1].plots.length || state.players[2].plots.length) return 'a claim slipped in during the pause';
    if (land.cursor !== -1) return 'cursor must stay hidden while paused';
    raceRun(state, rng, land, 500, 10);
    return land.cursor === 1 && land.pause <= 0 && land.dwellLeft > 0 && land.dwellLeft <= 400 ? true : `after the pause: cursor ${land.cursor}, pause ${land.pause}, dwell ${land.dwellLeft}`;
  });
  t('Land race pause: the sweep resumes at the plot AFTER the claimed one, with a full dwell', () => {
    const { state, rng } = fresh('pause2');
    LandGrantSystem.assign(state, 'p3', 1); LandGrantSystem.assign(state, 'p3', 2);
    const land = LandRace.create(state, rng, []);
    if (land.cursor !== 0) return `start ${land.cursor}`;
    raceRun(state, rng, land, 50, 10, [{ pid: 'p0', at: 20 }]);
    let guard = 0; while (land.pause > 0 && guard++ < 1000) LandRace.update(state, rng, land, 10);
    return land.cursor === 3 && land.dwellLeft === 400 ? true : `resumed at ${land.cursor} with dwell ${land.dwellLeft} (expected plot 3, owned 1 and 2 skipped)`;
  });
  t('Land race pause: AI reaction timers do not run down during the pause (they restart when the cursor resumes)', () => {
    const { state, rng } = fresh('pause3'); const d = CONFIG.DIFFICULTY.colony;
    const land = LandRace.create(state, rng, ['p1', 'p2', 'p3']);
    raceRun(state, rng, land, 60, 10, [{ pid: 'p0', at: 30 }]);
    if (land.claimed.p0 === undefined) return 'p0 should have claimed first';
    if (Object.keys(land.ai).length) return 'AI timers must not exist during the pause';
    let guard = 0; while (land.pause > 0 && guard++ < 1000) LandRace.update(state, rng, land, 10);
    const plans = Object.values(land.ai);
    if (!plans.length) return 'AI must re-plan when the cursor resumes';
    return plans.every((a) => a.pressAt >= land.clock + d.reactMin - CONFIG.LAND.stepMs && a.target >= land.cursor) ? true : `plans ${JSON.stringify(land.ai)} at clock ${land.clock}`;
  });
  t('Land race pause: a claim that leaves nobody able to claim ends the phase at once', () => {
    const { state, rng } = fresh('pause4');
    state.plots.forEach((p) => { if (p.id !== 7) LandGrantSystem.assign(state, 'p3', p.id); });
    const land = LandRace.create(state, rng, []);
    if (land.cursor !== 7) return `cursor ${land.cursor}`;
    raceRun(state, rng, land, 60, 10, [{ pid: 'p0', at: 30 }]);
    return land.done && land.pause <= 0 && state.plots[7].ownerId === 'p0' ? true : `done ${land.done}, pause ${land.pause}`;
  });
  t('Land race: same seed + same timestamped inputs -> same outcome for ANY frame size (10 / 17 / 50 ms)', () => {
    const sim = (dt) => {
      const { state, rng } = fresh('race-det');
      const land = LandRace.create(state, rng, ['p1', 'p2']);
      raceRun(state, rng, land, 200000, dt, [{ pid: 'p0', at: 730 }, { pid: 'p0', at: 3100 }, { pid: 'p3', at: 9000 }, { pid: 'p3', at: 23000 }]);
      return `${owners(state)}|${JSON.stringify(land.claimed)}|${land.clock}|${rng.getState()}`;
    };
    const a = sim(10); const b = sim(17); const c = sim(50);
    return a === b && b === c ? true : `10ms ${a}\n17ms ${b}\n50ms ${c}`;
  });
  t('Land race: serialize/deserialize mid-sweep and mid-pause resumes to the same outcome', () => {
    for (const at of [2300, 700]) {
      const { state, rng } = fresh(`race-save-${at}`);
      const land = LandRace.create(state, rng, ['p1', 'p2', 'p3']);
      raceRun(state, rng, land, at, 10, [{ pid: 'p0', at: 30 }]);
      if (land.done) return 'race ended too early for the test';
      const snap = JSON.stringify({ state, land, rng: rng.getState() });
      for (let i = 0; i < 100000 && !land.done; i++) LandRace.update(state, rng, land, 10);
      const back = JSON.parse(snap);
      if (JSON.stringify(back) !== snap) return 'JSON round trip is not identical';
      const rng2 = new SeededRNG('x'); rng2.setState(back.rng);
      for (let i = 0; i < 100000 && !back.land.done; i++) LandRace.update(back.state, rng2, back.land, 10);
      if (owners(back.state) !== owners(state) || rng2.getState() !== rng.getState() || back.land.clock !== land.clock) return `resumed ${owners(back.state)} vs ${owners(state)}`;
    }
  });

  /* ---------- P2.9 development order ---------- */
  t('Development order: [Atari code] leader first to last; stable tie; last first when the corral has 7 RUCs or fewer (7 reverses, 8 does not)', () => {
    const { state } = fresh(); setCash(state, 'p0', 900); setCash(state, 'p1', 3000); setCash(state, 'p2', 1500); setCash(state, 'p3', 1500);
    const o = DevOrder.create(state);
    if (o.order.join() !== 'p1,p2,p3,p0' || o.reversed) return `normal ${o.order}`;
    state.store.ruc = 8; if (DevOrder.create(state).reversed) return '8 RUCs must not reverse';
    state.store.ruc = 7; const r = DevOrder.create(state);
    return r.reversed && r.order.join() === 'p0,p3,p2,p1' ? true : `reversed ${r.order}`;
  });
  t('Development queue: a purchase changes the corral for the next colonists; the queue survives a JSON save', () => {
    const { state, rng } = fresh('dq'); state.turn = 2;
    [0, 8, 36, 44].forEach((id, i) => LandGrantSystem.assign(state, `p${i}`, id));
    state.store.ruc = 1; state.rucs.lost = 13;
    const q = DevOrder.create(state);
    const first = playerById(state, q.order[0]); const second = playerById(state, q.order[1]);
    if (AISystem.develop(state, rng, first).length !== 1 || state.store.ruc !== 0) return 'the first colonist did not take the last RUC';
    if (AISystem.develop(state, rng, second).length) return 'a RUC came from an empty corral';
    q.idx = 2; const back = JSON.parse(JSON.stringify(q));
    return back.idx === 2 && back.order.join() === q.order.join() ? audited(state) : 'queue round trip';
  });

  /* ---------- P2.10 events ([Atari code] events.md; C64 strings c64-strings.txt) ---------- */
  const ranked = (state, order) => { state.events.rank = order.slice(); return state; };
  const PERSONAL_Q = [1, 1, -1, 2, -3, 4, -2, -1, 2, 4, 8, 2, 3, 6, 4, 2, -6, -4, -4, -4, -1, 1];
  t('Personal events: [Atari code][C64] the 22 original events in the original order, weights and humour', () => {
    if (INDIVIDUAL_EVENT_IDS.length !== 22) return `${INDIVIDUAL_EVENT_IDS.length} personal events`;
    const q = INDIVIDUAL_EVENT_IDS.map((id) => EVENT_DEFS[id].quality);
    if (q.join() !== PERSONAL_Q.join()) return `weights ${q.join()}`;
    if (INDIVIDUAL_EVENT_IDS.some((id) => EVENT_DEFS[id].origin !== 'c64' || EVENT_DEFS[id].scope !== 'individual')) return 'origin/scope';
    const { state } = fresh('txt'); state.turn = 1;
    const all = INDIVIDUAL_EVENT_IDS.map((id) => EVENT_DEFS[id].text({ each: 50, total: 100, amount: 50, plot: 3 })).join(' ');
    const words = ['glac-elfs', 'anguila de pantà', 'rata-ant', 'kazinga', 'cucs berruga', 'cuques-gat', 'llangardaix-ratpenat', 'gitanos espacials', 'Estupidesa Artificial', 'claqué'];
    const miss = words.filter((w) => !all.includes(w));
    return miss.length ? `missing ${miss.join(', ')}` : true;
  });
  t('Personal events: [Atari code] amount = |weight| x 25 x (floor(round/4) + 1); per-MULE events multiply by the MULE count', () => {
    const { state } = fresh('amt');
    for (const [turn, want] of [[1, 200], [3, 200], [4, 400], [7, 400], [8, 600], [11, 600], [12, 800]]) {
      state.turn = turn; const a = EventSystem.amount(state, 'museum', 'p0');
      if (a.total !== want) return `museum round ${turn}: ${a.total} != ${want}`;
    }
    state.turn = 5; develop(state, 'p0', 36, 'smithore'); develop(state, 'p0', 37, 'smithore'); develop(state, 'p0', 0, 'food');
    const a = EventSystem.amount(state, 'mining_repair', 'p0');
    if (a.each !== 100 || a.count !== 2 || a.total !== 200) return `mining ${JSON.stringify(a)}`;
    const cash = state.players[0].cash; const rec = EventSystem.build(state, new SeededRNG('m'), 'mining_repair', 'p0');
    if (state.players[0].cash !== cash - 200 || !rec.text.includes('100 cr') || !rec.text.includes('200 cr') || !rec.negative) return `${rec.text} cash ${state.players[0].cash}`;
    return audited(state);
  });
  t('Personal events: [Atari code] 22/80 = 27.5 % per player turn, one draw of its own each turn', () => {
    const { state, rng } = fresh('ind'); state.turn = 5; ranked(state, ['p1', 'p0', 'p2', 'p3']);
    let hits = 0; const N = 4000;
    for (let i = 0; i < N; i++) {
      const before = rng.getState(); if (EventSystem.rollIndividual(GameState.clone(state), rng, 'p0')) hits++;
      if (rng.getState() === before) return 'no draw';
    }
    return Math.abs(hits / N - 0.275) < 0.025 ? true : `rate ${hits / N}`;
  });
  t('Personal events: [Atari code] 1st place never good, the LAST TWO never bad, 2nd place gets both', () => {
    const { state, rng } = fresh('lead'); state.turn = 6; ranked(state, ['p1', 'p0', 'p2', 'p3']);
    const seen = { good: 0, bad: 0 };
    for (let i = 0; i < 600; i++) {
      let rec = EventSystem.rollIndividual(GameState.clone(state), rng, 'p1'); if (rec && !rec.negative) return 'the leader got lucky';
      for (const pid of ['p2', 'p3']) { rec = EventSystem.rollIndividual(GameState.clone(state), rng, pid); if (rec && rec.negative) return `${pid} (bottom two) got bad luck`; }
      rec = EventSystem.rollIndividual(GameState.clone(state), rng, 'p0'); if (rec) seen[rec.negative ? 'bad' : 'good']++;
    }
    return seen.good && seen.bad ? true : `2nd place ${JSON.stringify(seen)}`;
  });
  t('Personal events: [Atari code] each once per game; the search goes down (wrapping) at most 20 candidates', () => {
    const { state, rng } = fresh('once'); state.turn = 2; ranked(state, ['p1', 'p0', 'p2', 'p3']);
    state.events.used = state.events.used.map((v, i) => (i === 9 ? 0 : 1));
    const s = (start) => EventSystem.search(state, start, 'p0');
    if (s(9) !== 9 || s(10) !== 9 || s(11) !== 9) return 'did not find #09 going down';
    if (s(8) !== null || s(7) !== null) return 'searched past 20 candidates';
    let got = 0;
    for (let i = 0; i < 400; i++) { const c = GameState.clone(state); const rec = EventSystem.rollIndividual(c, rng, 'p0'); if (rec) { got++; if (rec.id !== 'wart_worm' || c.events.used[9] !== 1) return `${rec.id} used ${c.events.used[9]}`; } }
    if (!got) return 'never found';
    state.events.used[9] = 1;
    for (let i = 0; i < 400; i++) if (EventSystem.rollIndividual(GameState.clone(state), rng, 'p0')) return 'an event happened twice';
    return SaveSystem.deserialize(SaveSystem.serialize(state, rng)).state.events.used.join() === state.events.used.join() ? true : 'used flags not saved';
  });
  t('Personal events: [Atari code] a non-leader with 0 food gets the package instead (even if already used); the leader does not', () => {
    const { state, rng } = fresh('starve'); state.turn = 3; ranked(state, ['p1', 'p0', 'p2', 'p3']);
    setInv(state, 'p0', 'food', 0); setInv(state, 'p1', 'food', 0); state.events.used[0] = 1;
    let got = 0;
    for (let i = 0; i < 300; i++) {
      const c = GameState.clone(state); const rec = EventSystem.rollIndividual(c, rng, 'p0');
      if (rec) { got++; if (rec.id !== 'package' || c.players[0].inventory.food !== 3 || c.players[0].inventory.energy !== state.players[0].inventory.energy + 2) return `${rec.id} food ${c.players[0].inventory.food}`; }
      const l = EventSystem.rollIndividual(GameState.clone(state), rng, 'p1'); if (l && l.id === 'package') return 'the leader got the package';
    }
    return got ? true : 'no package';
  });
  t('Personal events: [Atari code] an unaffordable penalty is cancelled silently (not marked used); cash-bound ones are skipped', () => {
    const { state, rng } = fresh('broke'); state.turn = 2; ranked(state, ['p1', 'p0', 'p2', 'p3']);
    develop(state, 'p0', 0, 'food'); setCash(state, 'p0', 0);
    state.events.used = state.events.used.map((v, i) => (i === 4 ? 0 : 1));
    for (let i = 0; i < 300; i++) { const c = GameState.clone(state); if (EventSystem.rollIndividual(c, rng, 'p0') || c.events.used[4] || c.players[0].cash) return 'lost bolt charged without cash'; }
    if (EventSystem.precondition(state, 'gypsy_inlaws', 'p0')) return 'gypsy in-laws need the cash';
    setCash(state, 'p0', 2000);
    if (!EventSystem.precondition(state, 'gypsy_inlaws', 'p0')) return 'cash 2000 must allow it';
    let got = null; for (let i = 0; i < 300 && !got; i++) got = EventSystem.rollIndividual(state, rng, 'p0');
    return got && got.id === 'lost_bolt' && state.players[0].cash === 2000 - 75 ? audited(state) : `got ${got && got.id} cash ${state.players[0].cash}`;
  });
  t('Personal events: [Atari code] lost plot = owned plot with the highest index (with its MULE, needs a MULE); extra plot = random free plot', () => {
    const { state, rng } = fresh('plots'); state.turn = 4;
    LandGrantSystem.assign(state, 'p0', 3); LandGrantSystem.assign(state, 'p0', 40);
    if (EventSystem.precondition(state, 'lost_plot', 'p0')) return 'lost plot without any MULE';
    develop(state, 'p0', 20, 'food'); state.plots[40].ruc = { module: 'energy', paid: 100 }; state.store.ruc -= 1;
    if (!EventSystem.precondition(state, 'lost_plot', 'p0')) return 'precondition';
    const lost = state.rucs.lost; EventSystem.build(state, rng, 'lost_plot', 'p0');
    if (state.plots[40].ownerId || state.plots[40].ruc || state.players[0].plots.includes(40) || state.rucs.lost !== lost + 1) return 'plot 40 not lost with its MULE';
    if (state.plots[20].ownerId !== 'p0' || state.plots[3].ownerId !== 'p0') return 'lost the wrong plot';
    const free = LandGrantSystem.freePlots(state).length; const rec = EventSystem.build(state, rng, 'extra_plot', 'p0');
    const got = state.plots[rec.params.plot - 1];
    if (LandGrantSystem.freePlots(state).length !== free - 1 || got.ownerId !== 'p0' || !state.players[0].plots.includes(got.id)) return 'extra plot';
    return audited(state);
  });
  t('Planetary events: [Atari code] bag 3/2/3/3/3/2/2/2 drawn without replacement, one per round 1-11', () => {
    const { state } = fresh('bag');
    const init = { pest_attack: 3, pirates: 2, acid_rain: 3, planetquake: 3, sunspot: 3, meteorite: 2, radiation: 2, store_fire: 2 };
    if (JSON.stringify(state.events.bag) !== JSON.stringify(init) || PLANET_EVENT_IDS.join() !== Object.keys(init).join()) return JSON.stringify(state.events.bag);
    const rng = new SeededRNG('bag'); const first = {}; const N = 3000;
    for (let g = 0; g < N; g++) {
      const s = GameState.clone(state); const got = {};
      for (let r = 0; r < 11; r++) { const id = EventSystem.drawPlanet(s, rng); got[id] = (got[id] || 0) + 1; if (!r) first[id] = (first[id] || 0) + 1; }
      if (Object.entries(got).some(([id, n]) => n > init[id])) return `game ${g}: ${JSON.stringify(got)}`;
      if (Object.values(s.events.bag).reduce((a, b) => a + b, 0) !== 9) return 'tickets left';
    }
    const off = PLANET_EVENT_IDS.find((id) => Math.abs((first[id] || 0) / N - init[id] / 20) > 0.03);
    return off ? `first draw ${off}: ${first[off] / N}` : true;
  });
  t('Planetary events: [Atari code] sunspot +3 energy (cap 8); quake halves mining; acid rain row food +4 / energy -2, others +1 / -1 (0..8)', () => {
    const { state } = fresh(); const m = state.modifiers;
    const en = lone(1, 0, 2, TERRAIN.PLAIN, 'energy'); const fo = lone(2, 1, 2, TERRAIN.PLAIN, 'food'); const sm = lone(3, 2, 0, TERRAIN.MOUNTAIN, 'smithore', 2);
    state.plots = [en, fo, sm];
    m.sunspot = true;
    if (ProductionSystem.applyEvents(state, en, 3) !== 6 || ProductionSystem.applyEvents(state, en, 7) !== 8 || ProductionSystem.applyEvents(state, fo, 3) !== 3) return 'sunspot';
    Object.assign(m, GameState.freshModifiers()); m.quake = true;
    if (ProductionSystem.applyEvents(state, sm, 5) !== 2 || ProductionSystem.applyEvents(state, fo, 5) !== 5) return 'quake';
    Object.assign(m, GameState.freshModifiers()); m.acidRow = 2;
    if (ProductionSystem.applyEvents(state, fo, 2) !== 6 || ProductionSystem.applyEvents(state, en, 3) !== 1 || ProductionSystem.applyEvents(state, fo, 6) !== 8 || ProductionSystem.applyEvents(state, en, 1) !== 0) return 'acid row';
    m.acidRow = 0;
    if (ProductionSystem.applyEvents(state, fo, 2) !== 3 || ProductionSystem.applyEvents(state, en, 3) !== 2 || ProductionSystem.applyEvents(state, en, 0) !== 0 || ProductionSystem.applyEvents(state, sm, 4) !== 4) return 'acid other rows';
  });
  t('Planetary events: [Atari code] pest (after production) eats all the food of one plot of the 1st or 2nd place', () => {
    const { state, rng } = fresh('pest'); state.turn = 3; ranked(state, ['p1', 'p2', 'p0', 'p3']);
    develop(state, 'p0', 31, 'food'); develop(state, 'p1', 40, 'food'); develop(state, 'p3', 13, 'food');
    state.players.forEach((p) => setInv(state, p.id, 'energy', 3));
    const st = SettlementSystem.run(state, rng);
    const row = st.rows.find((r) => r.playerId === 'p1'); const it = row.items.find((x) => x.plotId === 40);
    if (!it.amount) return 'test setup: plot 40 produced nothing';
    const food = state.players[1].inventory.food; const n = it.amount;
    const rec = EventSystem.build(state, rng, 'pest_attack', null);
    if (!rec || rec.targetId !== 'p1' || state.players[1].inventory.food !== food - n || it.amount !== 0 || it.zeroed !== 'pest') return `pest ${rec && rec.text}`;
    if (row.produced.food !== 0 || row.final.food !== state.players[1].inventory.food) return 'settlement row not updated';
    const bad = audited(state); if (bad !== true) return bad;
    ranked(state, ['p2', 'p1', 'p0', 'p3']);
    return EventSystem.build(state, rng, 'pest_attack', null) === null ? true : 'pest found a plot without production';
  });
  t('Planetary events: [Atari code] pirates take ALL smithore (players and store); fire empties the store only', () => {
    const { state, rng } = fresh('pir'); state.turn = 5; setInv(state, 'p1', 'smithore', 7); setInv(state, 'p3', 'smithore', 2);
    const rec = EventSystem.build(state, rng, 'pirates', null);
    if (state.players.some((p) => p.inventory.smithore) || state.store.stock.smithore !== 0 || rec.params.amount !== 9 + 8) return `pirates ${rec.params.amount}`;
    const { state: s2 } = fresh('fire'); setInv(s2, 'p0', 'food', 5);
    EventSystem.build(s2, rng, 'store_fire', null);
    if (['food', 'energy', 'smithore'].some((r) => s2.store.stock[r] !== 0) || s2.players[0].inventory.food !== 5) return 'fire';
    const b = audited(state); return b === true ? audited(s2) : b;
  });
  t('Planetary events: [Atari code] radiation takes a MULE of the 1st/2nd place; meteorite hits a non-town non-river plot', () => {
    const { state, rng } = fresh('rad'); state.turn = 4; ranked(state, ['p2', 'p0', 'p1', 'p3']);
    develop(state, 'p1', 0, 'food'); develop(state, 'p3', 8, 'food');
    if (EventSystem.build(state, rng, 'radiation', null) !== null) return 'radiation hit the 3rd/4th place';
    develop(state, 'p0', 36, 'smithore');
    const rec = EventSystem.build(state, rng, 'radiation', null);
    if (!rec || state.plots[36].ruc || !state.plots[0].ruc || !state.plots[8].ruc || state.rucs.lost !== 1) return 'radiation';
    for (let i = 0; i < 60; i++) {
      const { state: s, rng: r } = fresh(`met${i}`); develop(s, 'p0', 0, 'food');
      const m = EventSystem.build(s, r, 'meteorite', null); const p = s.plots[m.params.plot - 1];
      if (p.terrain === TERRAIN.TOWN || p.terrain === TERRAIN.RIVER || p.hiddenDeposit !== 4 || p.ruc) return `meteorite on ${p.id}`;
      if (p.id === 0 && s.rucs.lost !== 1) return 'MULE not destroyed';
      const b = audited(s); if (b !== true) return b;
    }
    return audited(state);
  });
  t('Planetary events: [Atari code] planetquake: half mining always; the slide moves a mountain level and destroys both MULEs', () => {
    let slid = 0;
    for (let i = 0; i < 40; i++) {
      const { state, rng } = fresh(`quake${i}`);
      const before = state.plots.map((p) => `${p.terrain}${p.richness}`); setCash(state, 'p0', 100000);
      state.plots.forEach((p) => { if (p.terrain !== TERRAIN.TOWN && !p.ruc && state.store.ruc > 0) develop(state, 'p0', p.id, 'energy'); });
      const rec = EventSystem.build(state, rng, 'planetquake', null);
      if (!state.modifiers.quake) return 'no halving';
      const changed = state.plots.filter((p, k) => `${p.terrain}${p.richness}` !== before[k]);
      if (!rec.params.slide) { if (changed.length) return 'terrain changed without a slide'; continue; }
      slid++;
      const { from, to } = rec.params.slide; const a = state.plots[from]; const b = state.plots[to];
      if (Math.abs(a.x - b.x) !== 1 || a.y !== b.y || changed.length !== 2 || b.terrain !== TERRAIN.MOUNTAIN) return `slide ${JSON.stringify(rec.params.slide)}`;
      if ((a.terrain === TERRAIN.MOUNTAIN ? a.richness : 0) !== Number(before[from].slice(-1)) - 1) return 'source did not lose a level';
      if (a.ruc || b.ruc) return 'MULEs survived the slide';
      const bad = audited(state); if (bad !== true) return bad;
    }
    return slid > 5 && slid < 35 ? true : `slides ${slid}/40 (expected about half)`;
  });
  t('Planetary phases: before-events act before PRODUCTION, after-events after it; round 12 = "La nau ha tornat!" with no draw', () => {
    const g = mkGame(); g.newGame({ seed: 'phases' }); const s = g.state; s.turn = 3; s.event = { items: [] };
    g.debugForced = ['store_fire']; g.turns.enter(g, 'PLANET_EVENT');
    if (s.events.after !== 'store_fire' || s.store.stock.food !== 8) return 'the fire struck before production';
    g.turns.enter(g, 'PLANET_EVENT_AFTER');
    if (s.events.after !== null || s.store.stock.food !== 0 || !g.turns.phaseData.items.length) return 'the fire did not strike after production';
    const ids = g.turns.phases.map((p) => p.id);
    if (!(ids.indexOf('PLANET_EVENT') < ids.indexOf('PRODUCTION') && ids.indexOf('PRODUCTION') < ids.indexOf('PLANET_EVENT_AFTER'))) return ids.join();
    g.debugForced = ['sunspot']; g.turns.enter(g, 'PLANET_EVENT');
    if (!s.modifiers.sunspot || s.events.after) return 'sunspot must act before production';
    const bag = JSON.stringify(s.events.bag); s.turn = CONFIG.TURNS; g.turns.enter(g, 'PLANET_EVENT');
    const it = g.turns.phaseData.items[0];
    if (!it || it.id !== 'ship_back' || it.name !== 'La nau ha tornat!' || JSON.stringify(s.events.bag) !== bag) return 'round 12';
    s.turn = 4; g.turns.enter(g, 'PLANET_EVENT');
    return Object.values(s.events.bag).reduce((a, b) => a + b, 0) === Object.values(JSON.parse(bag)).reduce((a, b) => a + b, 0) - 1 ? true : 'no ticket drawn in round 4';
  });
  t('Debug: a forced event applies only itself; events and their cards survive a JSON save', () => {
    const g = mkGame(); g.newGame({ seed: 'dbg' });
    g.debugEventIdx = Object.keys(EVENT_DEFS).indexOf('museum') - 1;
    const want = EventSystem.amount(g.state, 'museum', 'p0').total;
    const before = GameState.clone(g.state); g.debugEvent(); const after = GameState.clone(g.state);
    if (after.players[0].cash !== before.players[0].cash + want) return `museum not applied: ${g.debugLog}`;
    if (JSON.stringify(after.event) !== JSON.stringify(GameState.clone(after).event)) return 'event record not serialisable';
    after.players[0].cash = before.players[0].cash; after.players[0].eventLog = before.players[0].eventLog; after.ext.cash = before.ext.cash; after.event = before.event;
    return JSON.stringify(after) === JSON.stringify(before) ? true : 'the forced event changed something else';
  });

  /* ---------- P2.11 scoring ---------- */
  t('Net worth: [Atari code] cash + goods at the store price P + 500 per plot + outfit cost + 35 per installed RUC; no debt', () => {
    const { state } = fresh(); const p = state.players[0];
    setCash(state, 'p0', 500); setInv(state, 'p0', 'food', 2); setInv(state, 'p0', 'energy', 0); setInv(state, 'p0', 'smithore', 1);
    state.storePrice.food = 40;
    LandGrantSystem.assign(state, 'p0', 0); LandGrantSystem.assign(state, 'p0', 1); state.plots[0].ruc = { module: 'smithore', paid: 100 };
    const b = ScoringSystem.breakdown(state, p);
    // 500 + 2*40 + 1*50 (smithore P) + 2*500 + 35 (robot) + 75 (module)
    return b.total === 1740 && b.plots === 1000 && b.modules === 75 && b.rucs === 35 && !('debt' in b) ? true : JSON.stringify(b);
  });
  t('Colony failure: [Atari code] no food (energy) RUC and no food (energy) anywhere ends the game at once with "total lack of"', () => {
    const { state } = fresh();
    if (ScoringSystem.colonyFailure(state) !== null) return 'a fresh colony failed';
    state.players.forEach((p) => setInv(state, p.id, 'food', 0));
    if (ScoringSystem.colonyFailure(state) !== null) return 'the store still has food';
    ResourceLedger.moveItem(state, 'food', 'store', 'nature', 8);
    if (ScoringSystem.colonyFailure(state) !== 'food') return `no food at all -> ${ScoringSystem.colonyFailure(state)}`;
    develop(state, 'p1', 0, 'food'); if (ScoringSystem.colonyFailure(state) !== null) return 'a food RUC keeps the colony alive';
    state.players.forEach((p) => setInv(state, p.id, 'energy', 0)); ResourceLedger.moveItem(state, 'energy', 'store', 'nature', 8);
    if (ScoringSystem.colonyFailure(state) !== 'energy') return `no energy at all -> ${ScoringSystem.colonyFailure(state)}`;
    const g = mkGame(); g.newGame({ seed: 'lack' }); g.state.turn = 3;
    g.state.players.forEach((p) => setInv(g.state, p.id, 'food', 0)); ResourceLedger.moveItem(g.state, 'food', 'store', 'nature', 8);
    g.turns.enter(g, 'NEXT');
    const f = g.state.final;
    if (g.state.phase !== 'GAME_OVER' || !f || f.survives || f.winnerId !== null || f.lack !== 'food') return `final ${JSON.stringify(f)}`;
    return GameOverScreen.lackText(f.lack) === 'La colònia ha fracassat per una manca total de menjar!' ? true : GameOverScreen.lackText(f.lack);
  });
  t('Colony result: [manual] 60,000 combined — 59,999 fails, 60,000 succeeds even with one rich colonist; no First Founder on failure', () => {
    const { state } = fresh();
    const total = () => state.players.reduce((s, p) => s + ScoringSystem.netWorth(state, p), 0);
    setCash(state, 'p1', state.players[1].cash + 60000 - total() - 1);
    if (ScoringSystem.survival(state).survives || total() !== 59999) return `59,999 -> ${JSON.stringify(ScoringSystem.survival(state))}`;
    setCash(state, 'p1', state.players[1].cash + 1);
    const s = ScoringSystem.survival(state);
    if (!s.survives || s.combined !== 60000) return '60,000 must succeed';
    if (!state.players.filter((p) => p.id !== 'p1').every((p) => ScoringSystem.netWorth(state, p) < 2000)) return 'test setup';
    const g = mkGame(); g.state = state; g.rng = new SeededRNG('fin'); g.mode = 'play'; g.finish();
    if (!state.final.survives || state.final.winnerId !== 'p1') return `final ${JSON.stringify(state.final)}`;
    setCash(state, 'p1', 100); g.finish();
    return !state.final.survives && state.final.winnerId === null && state.final.rank.length === 4 ? true : 'failure must keep the ranking without a First Founder';
  });

  /* ---------- saves, conservation, determinism, engine ---------- */
  t('Save: schema 4 round trip keeps state (store prices, event bag and used flags) and PRNG; schemas 1-3 (old rules) and corrupt saves are refused', () => {
    if (CONFIG.SCHEMA_VERSION !== 4) return `schema ${CONFIG.SCHEMA_VERSION}`;
    const { state, rng } = fresh('save'); rng.next(); rng.next();
    state.turn = 4; state.phase = 'DEVELOPMENT'; state.storePrice.food = 33; state.events.bag.pirates = 1; state.events.used[13] = 1;
    const text = SaveSystem.serialize(state, rng);
    const back = SaveSystem.deserialize(text);
    if (back.incompatible) return 'incompatible';
    const rng2 = new SeededRNG('x'); rng2.setState(back.state.rngState);
    if (JSON.stringify(back.state) !== text) return 'state differs after round trip';
    if (rng2.next() !== rng.next()) return 'rng stream differs';
    if (back.state.storePrice.food !== 33) return 'store price lost';
    if (back.state.events.bag.pirates !== 1 || back.state.events.used[13] !== 1) return 'event bag / used flags lost';
    for (const v of [1, 2, 3]) {
      const old = SaveSystem.deserialize(JSON.stringify({ schemaVersion: v, turn: 3 }));
      if (!old.incompatible || old.reason !== 'old_rules') return `schema ${v}: ${JSON.stringify(old)}`;
    }
    const bad = SaveSystem.deserialize('{oops');
    return bad.incompatible && bad.reason === 'corrupt' ? true : 'corrupt save accepted';
  });
  t('Conservation: settlement + events + store keep every credit, item and RUC accounted', () => {
    const { state, rng } = fresh('audit'); state.turn = 3;
    [0, 2, 6, 8, 36, 44].forEach((id, i) => develop(state, `p${i % 4}`, id, ['food', 'energy', 'smithore'][i % 3]));
    ['museum', 'bat_lizard', 'traveler', 'glac_elves', 'package', 'lost_plot', 'extra_plot', 'solar_dirty'].forEach((id, i) => EventSystem.build(state, rng, id, `p${i % 4}`));
    ['radiation', 'meteorite', 'planetquake'].forEach((id) => EventSystem.build(state, rng, id, null));
    SettlementSystem.run(state, rng);
    ['pest_attack', 'pirates', 'store_fire'].forEach((id) => EventSystem.build(state, rng, id, null));
    StoreSystem.betweenTurns(state);
    return audited(state);
  });
  t('Determinism: same seed + same actions -> same result', () => {
    const run = () => {
      const { state, rng } = GameState.create({ seed: 'det' });
      state.turn = 1;
      const land = LandRace.create(state, rng, state.players.map((p) => p.id));
      raceRun(state, rng, land, 60000);
      state.players.forEach((p) => AISystem.develop(state, rng, p));
      EventSystem.rankPlayers(state, rng);
      state.players.forEach((p) => EventSystem.rollIndividual(state, rng, p.id));
      EventSystem.build(state, rng, EventSystem.drawPlanet(state, rng), null); SettlementSystem.run(state, rng);
      return JSON.stringify(state) + rng.getState();
    };
    return eq(run(), run(), 'runs');
  });
  t('TurnSystem: phases can be inserted by ID and the afterDevelopment hook fires', () => {
    const ts = new TurnSystem(); const log = [];
    ts.define([{ id: 'A', label: 'A' }, { id: 'DEVELOPMENT', label: 'DEV' }, { id: 'B', label: 'B' }]);
    ts.insertAfter('DEVELOPMENT', { id: 'WAMPUS', label: 'W' });
    ts.onHook('afterDevelopment', () => log.push('hook'));
    const game = { now: 0, state: {}, announce() {}, save() {} };
    ts.enter(game, 'DEVELOPMENT'); ts.canAdvance = true; ts.update(game, 0);
    return ts.phase === 'WAMPUS' && log.length === 1 ? true : `phase ${ts.phase}, hooks ${log.length}`;
  });

  /* ---------- whole game (real phase code, no DOM rendering) ---------- */
  t('Game: resume mid-walk and mid-declaration continues exactly; pause freezes the walker', () => {
    const tickUntil = (G, pred, max = 200000) => {
      for (let i = 0; i < max && !pred(); i++) { const ph = G.turns.phase; if (G.turns.phaseData && G.turns.phaseData.skippable && ph && !ph.startsWith('AUCTION_')) G.skipPhase(); G.tick(50); }
      return pred();
    };
    const copy = (G) => { G.snapshotPhase(); const H = mkGame(); H.resume(SaveSystem.deserialize(SaveSystem.serialize(G.state, G.rng))); return H; };
    const same = (A, B) => JSON.stringify(A.state, noSavedAt) === JSON.stringify(B.state, noSavedAt) && A.rng.getState() === B.rng.getState();
    const g = mkGame(); g.newGame({ seed: 'resume-1' });
    if (!tickUntil(g, () => !!g.humanWalk())) return `no human walk (phase ${g.turns.phase})`;
    g.rt.pad = { x: 1, y: 0 }; for (let i = 0; i < 20; i++) g.tick(50);
    const h = copy(g);
    if (!h.humanWalk() || !same(g, h)) return 'resume lost the walk';
    for (const G of [g, h]) { G.rt.pad = { x: 0, y: 1 }; for (let i = 0; i < 40; i++) G.tick(50); }
    if (!same(g, h)) return 'the walk diverged after resuming';
    const w0 = JSON.stringify(g.humanWalk()); g.paused = true; for (let i = 0; i < 40; i++) g.tick(50); g.paused = false;
    if (JSON.stringify(g.humanWalk()) !== w0) return 'pause did not freeze the walker and its clock';
    for (const G of [g, h]) { G.rt.pad = { x: 0, y: 0 }; tickUntil(G, () => G.turns.phase === 'AUCTION_smithore' && G.rt.auction.engine.clock > 1500); }
    if (!same(g, h)) return 'diverged before the auction';
    const k = copy(g);
    if (!k.rt.auction || k.rt.auction.engine.stage !== 'declare') return 'not resumed in the declaration';
    for (const G of [g, k]) for (let i = 0; i < 500; i++) G.tick(50);
    if (JSON.stringify(g.rt.auction.engine.snapshot()) !== JSON.stringify(k.rt.auction.engine.snapshot())) return 'the auction diverged after resuming';
    return same(g, k) ? audited(g.state) : 'state diverged after resuming the auction';
  });
  t('Game: a full 12-turn autopilot game ends; the same seed gives the same game; ledger, RUCs and result consistent', () => {
    const play = (seed) => { const g = mkGame(); g.autopilot = true; g.newGame({ seed, difficulty: 'colony' }); for (let n = 0; n < 400000 && g.state.phase !== 'GAME_OVER'; n++) g.tick(50); return g; };
    const a = play('full-1'); const b = play('full-1');
    if (a.state.phase !== 'GAME_OVER') return `stuck in ${a.state.phase}, turn ${a.state.turn}`;
    const key = (g) => JSON.stringify({ f: g.state.final, h: g.state.history, p: g.state.plots, r: g.rng.getState(), l: g.state.auctionLog });
    if (key(a) !== key(b)) return 'the same seed gave a different game';
    if (a.state.history.length !== CONFIG.TURNS) return `history ${a.state.history.length}`;
    const f = a.state.final;
    if (f.rank.length !== 4 || f.survives !== (f.combined >= CONFIG.SURVIVAL.combined) || (f.survives ? !f.winnerId : f.winnerId !== null)) return JSON.stringify(f);
    const trades = a.state.auctionLog.reduce((s, x) => s + x.volume, 0);
    console.log(`SELFTEST full game full-1: colony ${f.combined} cr (${f.survives ? 'success' : 'failure'}), ${trades} units traded, RUCs made ${a.state.rucs.made}, lost ${a.state.rucs.lost}`);
    return audited(a.state);
  });

  const failed = results.filter((r) => !r.ok);
  return { total: results.length, passed: results.length - failed.length, failed: failed.length, results };
}
