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
  const fresh = (seed = 'test', level = 'standard', species = 'mechtron') => GameState.create({ seed, level, species });
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
  /** `declare` false: the declaration has 0 units left, so roles can still be set and the first update starts the trade stage. */
  const engineFor = (state, rng, res, ids, withStore = false, declare = false) => new AuctionEngine({ market: AuctionEngine.fungibleMarket(RESOURCE_DEFS[res]), state, rng, colonists: ids, withStore, declare });
  /** Frames (PAL) -> ms, unrounded (auction ticks and the trade cadence). */
  const fms = (frames) => frames * 1000 / CONFIG.DEV.palHz;
  const runEngine = (e, ms, step = 10) => { for (let k = 0; k < ms && !e.ended; k += step) e.update(step); };
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
    goUntil(state, w, { x: 0, y: dy }, () => !!w.visiting || w.visited || !!w.ended); // the pub / land office have no RUC visit
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
  t('Map art: decoration/peak hash is pure (same seed+plot = same art, other seed differs) and never touches the game PRNG', () => {
    const { state: s } = fresh('art'); const before = JSON.stringify(s); const T = CONFIG.TILE;
    const art = (seed) => JSON.stringify(s.plots.map((p) => [MapArt.decor(seed, p, T), MapArt.peaks(seed, p, T)]).concat([MapArt.riverEdge(seed, 123, T)]));
    const a = art(s.seed);
    if (a !== art(s.seed)) return 'art not deterministic';
    if (a === art('other')) return 'art ignores the seed';
    MapArt.cacheKey(s);
    return eq(JSON.stringify(s), before, 'state (incl. rngState) changed by map art');
  });
  t('Map art: one peak sprite per level of richness, inside its plot; plains/river/town get none; river band stays in its column', () => {
    const T = CONFIG.TILE;
    for (const seed of ['a', 'b', 'c', 'd']) {
      for (const p of fresh(seed).state.plots) {
        const k = MapArt.peaks(seed, p, T);
        if (k.length !== (p.terrain === TERRAIN.MOUNTAIN ? p.richness : 0)) return `plot ${p.id}: ${k.length} peaks for richness ${p.richness}`;
        if (k.some((q) => q.x - q.w / 2 < 0 || q.x + q.w / 2 > T || q.y - q.h < 0 || q.y > T)) return `plot ${p.id}: peak outside the plot`;
      }
      for (let y = 0; y < CONFIG.ROWS * T; y += 7) { const e = MapArt.riverEdge(seed, y, T); if (e.l < 4 || e.r > T - 4 || e.r - e.l < T * 0.3) return `river edge off at y ${y}`; }
    }
    return true;
  });
  t('Map art: the unowned plot grid is only implied (a 1 px line a few levels off the ground, still visible)', () => {
    const T = 8; const c = document.createElement('canvas'); c.width = 2 * T; c.height = 2 * T; const ctx = c.getContext('2d');
    const [r, g, b] = MapArt.PAL.ground; ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.fillRect(0, 0, 2 * T, 2 * T);
    MapArt.paintGrid(ctx, T, 2 * T, 2 * T);
    const lum = (x, y) => { const d = ctx.getImageData(x, y, 1, 1).data; return 0.299 * d[0] + 0.587 * d[1] + 0.114 * d[2]; };
    const diff = Math.abs(lum(T, 3) - lum(T - 3, 3)); const width = [T - 1, T + 1].filter((x) => Math.abs(lum(x, 3) - lum(T - 3, 3)) > 1).length;
    return diff >= 3 && diff <= 10 && width === 0 ? true : `contrast ${diff.toFixed(1)}, extra width ${width}`;
  });
  t('Map art: the cached layer key follows the terrain (a planetquake slide changes it; owners and RUCs do not)', () => {
    const { state: s } = fresh('slide'); const k0 = MapArt.cacheKey(s);
    LandGrantSystem.assign(s, 'p0', s.plots.find((p) => p.terrain === TERRAIN.PLAIN).id);
    if (MapArt.cacheKey(s) !== k0) return 'owner changed the key';
    let slid = null; for (let i = 0; i < 20 && !slid; i++) slid = EventSystem.slide(s, new SeededRNG(`q${i}`));
    if (!slid) return 'no slide happened';
    return MapArt.cacheKey(s) !== k0 ? true : 'slide kept the key';
  });

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
    const rng = new SeededRNG('var'); const N = 40000; const n = new Map(); const { state } = fresh();
    for (let i = 0; i < N; i++) { const v = ProductionSystem.variation(state, rng); n.set(v, (n.get(v) || 0) + 1); }
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
  t('Development time: [Atari code][C64] 10 + floor(91 x min(1, food / need)) units of 28 PAL frames (full ~56.4 s); species and level change the unit', () => {
    const units = [[0, 3], [1, 3], [2, 3], [3, 3], [9, 3], [3, 4], [4, 5]].map(([f, n]) => ConsumptionSystem.devUnits(f, n)).join();
    if (units !== '10,40,70,101,101,78,82') return `units ${units}`;
    const { state } = fresh('time'); state.turn = 1; const p = state.players[0];
    if (ConsumptionSystem.humanTimeMs(state, p) !== 56419) return `full food ${ConsumptionSystem.humanTimeMs(state, p)} ms`;
    setInv(state, 'p0', 'food', 1); if (ConsumptionSystem.humanTimeMs(state, p) !== 22344) return `1 food ${ConsumptionSystem.humanTimeMs(state, p)} ms`;
    setInv(state, 'p0', 'food', 0); if (ConsumptionSystem.humanTimeMs(state, p) !== 5586) return `no food ${ConsumptionSystem.humanTimeMs(state, p)} ms`;
    // [Atari code] a unit is 7 BTU (28 frames): Flapper +2 BTU, Humanoid -2 BTU, Beginner +2 BTU on top.
    const full = (level, species) => { const { state: st } = fresh('time', level, species); st.turn = 1; return ConsumptionSystem.humanTimeMs(st, st.players[0]); };
    const got = [['standard', 'flapper'], ['standard', 'humanoid'], ['beginner', 'mechtron'], ['beginner', 'flapper'], ['beginner', 'humanoid']].map(([l, sp]) => full(l, sp)).join();
    return eq(got, '72539,40299,72539,88658,56419', 'flapper / humanoid / beginner full turns');
  });

  /* ---------- P1.5 store ---------- */
  t('Start: [Atari code][C64] colonists 4 food / 2 energy; store 8 food / 8 energy / 8 smithore, 14 RUCs (cap 14); modules 25/50/75 (crystite 100); plot 500', () => {
    const { state } = fresh(); const st = state.store;
    if (!state.players.every((p) => `${p.inventory.food}/${p.inventory.energy}/${p.inventory.smithore}` === '4/2/0')) return `colonists ${JSON.stringify(state.players.map((p) => p.inventory))}`;
    const got = `${st.stock.food}/${st.stock.energy}/${st.stock.smithore}/${st.ruc}/${CONFIG.RUC_MAX}/${Object.values(CONFIG.MODULE_COST).join('-')}/${CONFIG.PLOT_VALUE}`;
    return eq(got, '8/8/8/14/14/25-50-75-100/500', 'store');
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
  t('Auction: [manual] with the store out of stock colonists trade above the store top; with stock a buyer stops at the store sell line', () => {
    const { state, rng } = fresh(); setInv(state, 'p1', 'food', 6); setCash(state, 'p0', 2000); // above p1's critical level (3)
    ResourceLedger.moveItem(state, 'food', 'store', 'nature', 8);
    const e = engineFor(state, rng, 'food', ['p0', 'p1'], true);
    e.setRole('p1', ROLE.SELLER); e.setPrice('p1', 300); e.setRole('p0', ROLE.BUYER); e.setPrice('p0', 300); runEngine(e, 1000);
    if (e.volume !== 1 || e.trades[0].price !== 300) return `no trade above the store ceiling: ${JSON.stringify(e.trades)}`;
    if (ResourceLedger.audit(state).length) return 'ledger';
    const b = fresh(); const e2 = engineFor(b.state, b.rng, 'food', ['p0', 'p1'], true);
    e2.setRole('p0', ROLE.BUYER); e2.setPrice('p0', 500);
    return eq(e2.entry('p0').price, 50, 'buyer price with store stock (store ask 50)');
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
  t('Walk speed: [C64] map 0.667 h / 0.333 v px per frame on a 32-px plot (x3 to our TILE), town 1.33 px/frame; terrain 6/14/21 frames per step', () => {
    const { state, w } = walkState(); const near = (a, b) => Math.abs(a - b) < 1e-9;
    const town = DevWalk.speed(state, w);
    if (!near(town.x, 4 * CONFIG.DEV.palHz / 1000) || !near(town.y, 2 * CONFIG.DEV.palHz / 1000)) return `town ${JSON.stringify(town)}`;
    const at = (id) => { const p = state.plots[id]; w.area = 'map'; w.x = p.x * CONFIG.TILE + 40; w.y = p.y * CONFIG.TILE + 40; return DevWalk.speed(state, w); };
    const plain = state.plots.find((p) => p.terrain === TERRAIN.PLAIN); const mount = state.plots.find((p) => p.terrain === TERRAIN.MOUNTAIN);
    const sp = at(plain.id); const sr = at(4); const sm = at(mount.id);
    if (!near(sp.x, 2 * CONFIG.DEV.palHz / 1000) || !near(sp.y, CONFIG.DEV.palHz / 1000)) return `plain ${JSON.stringify(sp)}`;
    if (!near(sr.x, sp.x * 6 / 14) || !near(sm.y, sp.y * 6 / 21)) return `river ${JSON.stringify(sr)} mountain ${JSON.stringify(sm)}`;
    // Crossing a plain plot horizontally takes ~48 PAL frames (~958 ms), vertically ~96 (~1915 ms), at any frame size.
    const cross = (dir, dt) => { const { state: st, w: ww } = walkState(); ww.area = 'map'; ww.x = plain.x * CONFIG.TILE + 0.5; ww.y = plain.y * CONFIG.TILE + 0.5; let ms = 0;
      while (DevWalk.plotAt(st, ww.x, ww.y).id === plain.id && ms < 5000) { DevWalk.update(st, ww, dir, dt); ms += dt; } return ms; };
    const h = cross({ x: 1, y: 0 }, 10); const v = cross({ x: 0, y: 1 }, 10); const h17 = cross({ x: 1, y: 0 }, 17);
    return Math.abs(h - 958) <= 20 && Math.abs(v - 1915) <= 20 && Math.abs(h17 - h) <= 17 ? true : `crossing h ${h} ms (17 ms frames ${h17}), v ${v} ms`;
  });
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
    const fx = TOWN.buildings.find((b) => b.id === 'shop_food').spot.x;
    goUntil(state, w, { x: Math.sign(fx - w.x), y: 0 }, () => Math.abs(w.x - fx) < 4);
    goUntil(state, w, { x: 0, y: -1 }, () => w.y <= TOWN.streetTop + 1); // right up against shop_food's doorway
    go(state, w, { x: 0, y: -1 }, CONFIG.WALK.doorHoldMs - 100); // a shorter push than it takes to commit
    if (!w.latch) return 'test setup: did not even touch the building';
    go(state, w, { x: 0, y: 1 }, 80); // straight back out before committing
    return !w.visiting && !w.visited && !w.carrying && state.store.ruc === ruc0 && p.cash === cash0 && w.log.length === 0 ? true : `grazing acted: log ${w.log}, cash ${p.cash}, corral ${state.store.ruc}`;
  });
  t('Turn start: [C64] "Prem el botó per començar" waits for the human (no countdown); the walk and its clock start on the button', () => {
    if ('countdownMs' in CONFIG.DEV) return 'the 3 s countdown still exists';
    const g = mkGame(); g.newGame({ seed: 'ready-1' });
    let guard = 0;
    while (guard++ < 200000 && !(g.turns.phase === 'DEVELOPMENT' && g.devSlot() && g.devSlot().pid === 'p0')) { if (g.turns.phaseData.skippable) g.skipPhase(); g.tick(50); }
    const slot = g.devSlot();
    if (!slot || slot.stage !== 'ready' || g.humanWalk()) return `expected the human's ready prompt, got phase ${g.turns.phase} stage ${slot && slot.stage}`;
    for (let i = 0; i < 400; i++) g.tick(50); // 20 s: nothing starts by itself
    if (g.humanWalk() || g.devSlot().stage !== 'ready') return 'the turn started without the button';
    if (g.hudTimer() !== null) return 'no horizontal HUD timer during development (the time bar is vertical, on the map)';
    g.devStart();
    const w = g.humanWalk();
    if (!w || w.timeLeft !== w.timeTotal) return `walk did not start with a fresh clock (${JSON.stringify(w)})`;
    g.tick(50);
    const bar = MapScreen.timeBar(g.state, g.humanWalk());
    return bar.units === DevWalk.unitsLeft(w) && bar.frac > 0.98 && bar.frac <= 1 && bar.color === playerById(g.state, 'p0').color ? true : `bar ${JSON.stringify(bar)}`;
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

  /* ---------- town, pub, land office, species, levels (fidelity batches 3 and 5) ---------- */
  t('Town: [C64] top row crystite (closed) / smithore / energy / food; bottom row assay (closed) / land office / pub / corral', () => {
    const { state } = fresh('signs');
    const row = (top) => TOWN.buildings.filter((b) => (b.y < TOWN.streetTop) === top).sort((a, b) => a.x - b.x).map((b) => `${b.id}${DevWalk.kind(state, b) === 'closed' ? '*' : ''}`).join();
    const top = row(true); const bottom = row(false);
    if (top !== 'shop_crystite*,shop_smithore,shop_energy,shop_food') return `top ${top}`;
    if (bottom !== 'assay*,land_office,pub,corral') return `bottom ${bottom}`;
    return MapScreen.corralSign(state) === 'RUCs 100 cr' && MapScreen.moneyLine(state.players[0]) === 'Els teus diners: 1000 cr' ? true : `${MapScreen.corralSign(state)} / ${MapScreen.moneyLine(state.players[0])}`;
  });
  t('Town: the closed crystite shop and assay office have no door — pushing at them does nothing', () => {
    for (const id of ['shop_crystite', 'assay']) {
      const { state, w } = walkState(`closed-${id}`); const b = TOWN.buildings.find((x) => x.id === id); const cash = state.players[0].cash;
      goUntil(state, w, { x: 0, y: w.y < midY ? 1 : -1 }, () => Math.abs(w.y - midY) < 4);
      goUntil(state, w, { x: Math.sign(b.x + b.w / 2 - w.x), y: 0 }, () => Math.abs(w.x - (b.x + b.w / 2)) < 4);
      go(state, w, { x: 0, y: b.y < TOWN.streetTop ? -1 : 1 }, 3000);
      if (w.visiting || w.visited || w.log.length || w.ended || state.players[0].cash !== cash) return `${id}: something happened (${w.log})`;
    }
  });
  t('Pub: [Atari code][C64] round bonus 50 / 100 / 150 / 200 + (rand 0..255 mod 2 x units left); a sum above 255 pays 250', () => {
    const b = [1, 3, 4, 7, 8, 11, 12].map((r) => PubSystem.bonus(r)).join();
    if (b !== '50,50,100,100,150,150,200') return `bonus ${b}`;
    const cases = [[50, 28, 99, 78], [50, 3, 82, 53], [200, 255, 101, 253], [150, 120, 101, 250], [200, 201, 101, 250], [50, 77, 0, 50]];
    const bad = cases.filter(([bo, r, u, want]) => PubSystem.payout(bo, r, u) !== want);
    return bad.length ? `payout ${JSON.stringify(bad.map(([bo, r, u]) => PubSystem.payout(bo, r, u)))}` : true;
  });
  t('Pub: walking in ends the development turn and pays "Has guanyat N cr jugant!" (ledger kept); with a RUC "No s\'hi admeten RUCs"', () => {
    const { state, w } = walkState('pub'); state.turn = 1; const p = state.players[0]; const cash = p.cash;
    const log = visit(state, w, 'pub');
    if (w.ended !== 'pub' || log.join() !== 'pub') return `ended ${w.ended}, log ${log}`;
    const won = p.cash - cash;
    if (won < 50 || won > 50 + 2 * 107 || w.msg !== `Has guanyat ${won} cr jugant!`) return `won ${won}: ${w.msg}`;
    const bad = audited(state); if (bad !== true) return bad;
    const r = walkState('pub2'); r.state.turn = 1; visit(r.state, r.w, 'corral');
    const log2 = visit(r.state, r.w, 'pub');
    if (r.w.ended || !r.w.carrying || log2.join() !== 'refused' || r.w.msg !== 'No s\'hi admeten RUCs.') return `with a RUC: ended ${r.w.ended}, log ${log2}, ${r.w.msg}`;
    return audited(r.state, 1);
  });
  t('AI turn: [Atari code] installs cost 25 + 4 x calcPlotDistFromStore units while >= 35 are left, then the pub if >= 3 are left', () => {
    const { state, rng } = fresh('aipub'); state.turn = 1; const p = state.players[1];
    [0, 8].forEach((id) => LandGrantSystem.assign(state, 'p1', id));
    setInv(state, 'p1', 'food', 0); // 10 units: no install (< 35), pub with 10 units left
    const cash = p.cash; const r = AISystem.turn(state, rng, p);
    if (r.installs.length || r.unitsLeft !== 10) return `starving: ${JSON.stringify(r)}`;
    if (!(r.pub >= 50 && r.pub < 70) || p.cash !== cash + r.pub) return `pub ${r.pub}, cash ${p.cash - cash}`;
    const { state: s2, rng: g2 } = fresh('aipub2'); s2.turn = 1; const q = s2.players[2]; setCash(s2, 'p2', 5000);
    [0, 8, 36].forEach((id) => LandGrantSystem.assign(s2, 'p2', id));
    const r2 = AISystem.turn(s2, g2, q);
    const spent = r2.installs.reduce((acc, a) => acc + 25 + 4 * AISystem.storeDist(s2.plots[a.plotId]), 0);
    if (!r2.installs.length || r2.unitsLeft !== 101 - spent) return `installs ${JSON.stringify(r2)}`;
    return audited(s2);
  });
  t('AI distance: [Atari code] calcPlotDistFromStore = max(|col - 4|, 2 x |row - 2|), +1 on the river column ([RE] table 444454444 ...)', () => {
    const rows = [0, 1, 2, 3, 4].map((y) => [0, 1, 2, 3, 4, 5, 6, 7, 8].map((x) => (x === 4 && y === 2 ? ' ' : AISystem.storeDist({ x, y }))).join(''));
    return eq(rows.join('/'), '444454444/432232234/4321 1234/432232234/444454444', 'distances');
  });
  t('AI turn: [Atari code] playerTurnAi has no cash reserve and no per-colonist cap: time (>= 35 PTU) and money decide, up to 3 RUCs', () => {
    const { state, rng } = fresh('ai3'); state.turn = 2; const p = state.players[1];
    [12, 14, 22, 30].forEach((id) => LandGrantSystem.assign(state, 'p1', id));
    setInv(state, 'p1', 'food', 6); setInv(state, 'p1', 'energy', 6); setCash(state, 'p1', 2000);
    const r = AISystem.turn(state, rng, p);
    if (r.installs.length !== 3) return `installs ${JSON.stringify(r.installs)} (units left ${r.unitsLeft})`;
    const poor = fresh('ai3b'); poor.state.turn = 2; [12, 14].forEach((id) => LandGrantSystem.assign(poor.state, 'p1', id));
    setInv(poor.state, 'p1', 'food', 6); setInv(poor.state, 'p1', 'energy', 6);
    setCash(poor.state, 'p1', StoreSystem.rucPrice(poor.state) + 75); // a RUC + the dearest Standard outfit: no reserve is kept
    const r2 = AISystem.develop(poor.state, poor.rng, poor.state.players[1]);
    if (r2.length !== 1 || poor.state.players[1].cash !== 75 - CONFIG.MODULE_COST[r2[0].module]) return `poor: ${JSON.stringify(r2)}, cash ${poor.state.players[1].cash}`;
    return audited(state) === true ? audited(poor.state) : audited(state);
  });
  t('AI turn: [Atari code] re-outfits one of its RUCs in place when the best exploitation rates >= 2 higher (only the outfit is paid)', () => {
    const { state, rng } = fresh('aire'); state.turn = 3; const p = state.players[2];
    const plot = state.plots.find((q) => q.terrain === TERRAIN.MOUNTAIN && q.richness === 3);
    develop(state, 'p2', plot.id, 'food'); state.storePrice.smithore = 200; state.rucs.lost += state.store.ruc; state.store.ruc = 0;
    setInv(state, 'p2', 'food', 8); setInv(state, 'p2', 'energy', 8); setCash(state, 'p2', 1000);
    const acts = AISystem.develop(state, rng, p);
    if (acts.length !== 1 || acts[0].plotId !== plot.id || acts[0].module !== 'smithore') return `acts ${JSON.stringify(acts)}`;
    if (plot.ruc.module !== 'smithore' || p.cash !== 1000 - CONFIG.MODULE_COST.smithore || state.store.ruc !== 0) return `ruc ${JSON.stringify(plot.ruc)}, cash ${p.cash}`;
    return audited(state);
  });
  t('AI turn: [Atari code] only the first scanned plot rates its current RUC for real; later ones in the simulated mode (byte_B375 left at 1)', () => {
    const { state, rng } = fresh('aib375'); state.turn = 3; const p = state.players[1];
    [40, 30, 20].forEach((id) => develop(state, 'p1', id, 'energy'));
    setInv(state, 'p1', 'food', 8); setInv(state, 'p1', 'energy', 8); setCash(state, 'p1', 0); // no money: nothing is bought
    const calls = []; const orig = AISystem.exploitationRating;
    AISystem.exploitationRating = function (st, pl, plot, res, q, mode, bonus) { if (plot.ruc && plot.ruc.module === res && mode !== 'turn') calls.push(`${plot.id}:${mode}`); else if (plot.ruc && plot.ruc.module === res) calls.push(`${plot.id}:sim`); return orig.call(this, st, pl, plot, res, q, mode, bonus); };
    try { AISystem.develop(state, rng, p, { units: 40 }); } finally { AISystem.exploitationRating = orig; }
    const cur = calls.filter((c, i) => i === calls.findIndex((x) => x.split(':')[0] === c.split(':')[0]));
    return eq(cur.slice(0, 3).join(), '40:real,30:sim,20:sim', 'current-rating modes');
  });
  t('AI goods quality: [Atari code] calcGoodsQuality = mean simulated price / 8 (food / energy floor 10, smithore 50; crystite (100 + 4 x round) / 8)', () => {
    const { state } = fresh('gq'); state.turn = 2;
    setInv(state, 'store', 'food', 200); setInv(state, 'store', 'smithore', 0); state.store.ruc = 14;
    const q = AISystem.goodsQuality(state, 2);
    if (q.food !== 1 || q.energy !== 1 || q.smithore !== 6) return JSON.stringify(q);
    const t2 = fresh('gq2', 'tournament'); t2.state.turn = 5;
    return eq(AISystem.goodsQuality(t2.state, 2).crystite, 15, 'crystite quality');
  });
  t('AI ratings: [Atari code] exploitation rating = quality x simulated capacity (0..8); land rating = best - store distance', () => {
    const { state } = fresh('rate'); state.turn = 1; const p = state.players[1]; // round 1: no situation bonus
    const river = state.plots.find((q) => q.x === 4 && q.y === 1);
    const q = { food: 32, energy: 0, smithore: 0, crystite: 0 };
    const best = AISystem.bestExploitation(state, p, river, q, 'land', false);
    if (best.res !== 'food' || best.rating !== 128) return JSON.stringify(best);
    return eq(AISystem.landRating(state, p, river, q), 125, 'land rating');
  });
  t('AI auction: a starving (or blacked-out) computer of any profile bids up to the store price, never stops at its profile cap', () => {
    const bad = [];
    for (const res of ['food', 'energy']) {
      const { state, rng } = fresh(`aistarve-${res}`); state.turn = 6; const p = state.players[1]; // Bran: the cautious profile
      if (res === 'energy') { develop(state, 'p1', 0, 'food'); develop(state, 'p1', 1, 'food'); }
      setInv(state, 'p1', res, 0); setCash(state, 'p1', 3000); state.storePrice[res] = 100; setInv(state, 'store', res, 10);
      const e = engineFor(state, rng, res, state.players.map((x) => x.id), true); e.update(10); e.units = 1; // the end of the trading time
      const d = AISystem.decide(state, rng, p, e, {}); const ask = StoreSystem.ask(state, RESOURCE_DEFS[res]);
      if (d.role !== ROLE.BUYER || d.target < ask) bad.push(`${res}: ${d.role} at ${d.target}, store asks ${ask}`);
    }
    return bad.length ? bad.join('; ') : true;
  });
  t('AI auction: [Atari code] food is eaten BEFORE production, so a computer below next round\'s requirement buys even with food RUCs', () => {
    const { state, rng } = fresh('aifood'); state.turn = 4; const p = state.players[1];
    const river = state.plots.find((q) => q.terrain === TERRAIN.RIVER); develop(state, 'p1', river.id, 'food');
    setInv(state, 'p1', 'food', 3); setInv(state, 'p1', 'energy', 3); setCash(state, 'p1', 2000);
    const e = engineFor(state, rng, 'food', state.players.map((x) => x.id), true, true);
    const d = AISystem.decide(state, rng, p, e, {});
    return d.role === ROLE.BUYER && d.limit >= 4 ? true : `decision ${JSON.stringify(d)}`;
  });
  t('Land office: [manual][C64] Standard: "Marca la parcel·la per vendre i torna" -> mark your plot -> back at the office it is stored for sale (inert)', () => {
    const { state, w } = walkState('office'); LandGrantSystem.assign(state, 'p0', 31); state.turn = 2;
    if (visit(state, w, 'land_office').join() !== 'office' || w.msg !== 'Marca la parcel·la per vendre i torna.') return `office: ${w.msg}`;
    if (visit(state, w, 'land_office').join() !== 'no_mark') return `no plot marked: ${w.msg}`;
    leaveSouth(state, w); toHouse(state, w, 31);
    if (DevWalk.act(state, w) !== 'mark' || w.markPlot !== 31) return `mark: ${w.msg}`;
    if (!goUntil(state, w, { x: 0, y: -1 }, () => w.area === 'town')) return 'back to town';
    if (visit(state, w, 'land_office').join() !== 'for_sale') return `for sale: ${w.msg}`;
    const sale = LandOffice.forSale(state);
    if (sale.length !== 1 || sale[0].pid !== 'p0' || sale[0].plotId !== 31 || sale[0].turn !== 2) return JSON.stringify(state.landSales);
    if (JSON.stringify(JSON.parse(JSON.stringify(state.landSales))) !== JSON.stringify(state.landSales)) return 'not JSON-safe';
    state.plots[31].ownerId = 'p1'; // plot lost (e.g. an event): the mark simply no longer counts
    if (LandOffice.forSale(state).length) return 'a mark on a plot you no longer own must not count';
    const b = fresh('office-b', 'beginner'); const wb = DevWalk.create(b.state, 'p0', 60000);
    const log = visit(b.state, wb, 'land_office');
    return log.join() === 'refused' && !b.state.landSales.length ? audited(state) : `beginner: ${log} ${wb.msg}`;
  });
  t('Species: [Atari code][C64] 8 species; Flapper 1600 cr, Humanoid 600, others 1000; computers are always Mechtrons with 1000', () => {
    const ids = CONFIG.SPECIES.map((x) => x.id).join();
    if (ids !== 'mechtron,gollumer,packer,bonzoid,spheroid,flapper,leggite,humanoid') return ids;
    if (CONFIG.SPECIES.some((x) => !x.label || !x.desc)) return 'label / description missing';
    for (const [sp, cash] of [['flapper', 1600], ['humanoid', 600], ['leggite', 1000], ['mechtron', 1000]]) {
      const { state } = fresh('sp', 'standard', sp);
      if (state.players[0].cash !== cash || state.players[0].species !== sp) return `${sp}: ${state.players[0].cash}`;
      if (!state.players.slice(1).every((q) => q.species === 'mechtron' && q.cash === 1000)) return 'computers';
      const bad = audited(state); if (bad !== true) return `${sp}: ${bad}`;
    }
  });
  t('Levels: Principiant (6 rounds), Estàndard (12, default) and Torneig (12); one AI level (no difficulty knobs)', () => {
    if (Object.keys(CONFIG.LEVELS).join() !== 'beginner,standard,tournament') return Object.keys(CONFIG.LEVELS).join();
    if (CONFIG.LEVELS.beginner.label !== 'Principiant' || CONFIG.LEVELS.standard.label !== 'Estàndard' || CONFIG.LEVELS.tournament.label !== 'Torneig') return 'labels';
    if (Object.values(CONFIG.LEVELS).some((L) => L.disabled)) return 'a level is disabled';
    if (lastRound(fresh('lv', 'tournament').state) !== 12) return 'tournament rounds';
    const { state } = GameState.create({ seed: 'lv' });
    if (state.level !== 'standard' || lastRound(state) !== 12 || 'difficulty' in state) return `default ${state.level}`;
    if (lastRound(fresh('lv', 'beginner').state) !== 6) return 'beginner rounds';
    if (mkGame().setup.level !== 'standard') return 'setup default';
    return ['reactMin', 'reactMax', 'valuationErr', 'minReserve'].every((k) => typeof CONFIG.AI[k] === 'number') ? true : 'CONFIG.AI';
  });
  t('Beginner: [Atari code] 8 food / 4 energy, store 16 / 16 / 0 and 25 RUCs reset every round, no production variation, smithore fixed at 50', () => {
    const { state, rng } = fresh('beg', 'beginner'); const st = state.store;
    if (!state.players.every((p) => p.inventory.food === 8 && p.inventory.energy === 4)) return 'start goods';
    if (`${st.stock.food}/${st.stock.energy}/${st.stock.smithore}/${st.ruc}` !== '16/16/0/25') return `store ${st.stock.food}/${st.stock.energy}/${st.stock.smithore}/${st.ruc}`;
    state.turn = 2; const plot = develop(state, 'p0', 0, 'food');
    for (let i = 0; i < 200; i++) if (ProductionSystem.rollYield(state, plot, rng) !== ProductionSystem.expectedYield(state, plot)) return 'production varied in Beginner';
    ResourceLedger.moveItem(state, 'smithore', 'nature', 'store', 6);
    StoreSystem.updatePrices(state, rng); if (state.storePrice.smithore !== 50) return `smithore ${state.storePrice.smithore}`;
    StoreSystem.betweenTurns(state);
    if (st.ruc !== 25 || st.stock.smithore !== 0) return `reset: corral ${st.ruc}, smithore ${st.stock.smithore}`;
    return audited(state);
  });
  t('Beginner: [Atari code][manual] a RUC never runs away on a wrong button press (it only beeps)', () => {
    const b = fresh('beg-walk', 'beginner'); const w = DevWalk.create(b.state, 'p0', 60000); LandGrantSystem.assign(b.state, 'p1', 40);
    visit(b.state, w, 'corral'); visit(b.state, w, 'shop_food'); leaveSouth(b.state, w);
    goUntil(b.state, w, { x: 0, y: 1 }, () => DevWalk.atHouse(w, b.state.plots[40]));
    const k = DevWalk.act(b.state, w);
    return k === 'beep' && w.carrying && !w.fleeing && b.state.rucs.lost === 0 ? audited(b.state, 1) : `act ${k}, lost ${b.state.rucs.lost}`;
  });
  t('Game: a full Beginner autopilot game lasts 6 rounds and ends with a rating', () => {
    const g = mkGame(); g.autopilot = true; g.newGame({ seed: 'beg-full', level: 'beginner' });
    for (let n = 0; n < 300000 && g.state.phase !== 'GAME_OVER'; n++) g.tick(50);
    if (g.state.phase !== 'GAME_OVER' || g.state.history.length !== 6) return `phase ${g.state.phase}, history ${g.state.history.length}`;
    return typeof g.state.final.rating === 'number' ? audited(g.state) : JSON.stringify(g.state.final);
  });

  /* ---------- P1.7 auctions ---------- */
  t('Auction order: [manual] smithore -> food -> energy; crystite goes second in Tournament with no engine change', () => {
    if (auctionResources(fresh().state).map((d) => d.id).join() !== 'smithore,food,energy') return auctionResources(fresh().state).map((d) => d.id).join();
    const ids = auctionResources(fresh('ao', 'tournament').state).map((d) => d.id).join(); if (ids !== 'smithore,crystite,food,energy') return ids;
    const phases = mkGame().turns.phases.map((p) => p.id).filter((id) => id.startsWith('AUCTION_')).join();
    return eq(phases, 'AUCTION_smithore,AUCTION_food,AUCTION_energy', 'phase order');
  });
  t('Auction timing: declare 31 units x 13 frames (~8 s, longer than the C64 ~4.3 s on purpose); trading 72 units x 8 frames (~11.5 s) when idle', () => {
    if (CONFIG.AUCTION.frames.declare !== 13) return `declare frames ${CONFIG.AUCTION.frames.declare}`;
    const { state, rng } = fresh(); setInv(state, 'p1', 'food', 9);
    const e = engineFor(state, rng, 'food', ['p0', 'p1'], true, true);
    e.setRole('p0', ROLE.BUYER); e.setRole('p1', ROLE.SELLER);
    const declare = 31 * fms(13); const trade = 72 * fms(8);
    runEngine(e, Math.floor(declare / 10) * 10);
    if (e.stage !== 'declare') return `declaration ended early (${e.clock} ms)`;
    runEngine(e, 20); if (e.stage !== 'trade') return 'the declaration did not end at 31 x 13 frames';
    if (e.unitsTotal !== 72 || Math.abs(e.units - 72) > 0.3) return `trade units ${e.units}/${e.unitsTotal}`;
    const left = trade - (e.clock - declare);
    runEngine(e, Math.floor(left / 10) * 10 - 10); if (e.ended) return `ended early: ${e.endReason} at ${e.clock}`;
    runEngine(e, 30); return eq(e.endReason, 'time', `end after ${Math.round(declare + trade)} ms`);
  });
  t('Auction timing: [C64] 60 frames per unit while a buyer and a seller touch; [Atari code] a full ATU (30 frames) while a stick is pushed', () => {
    const mk = () => { const { state, rng } = fresh(); setInv(state, 'p1', 'food', 30); setCash(state, 'p0', 5000); const e = engineFor(state, rng, 'food', ['p0', 'p1']); e.setRole('p1', ROLE.SELLER); e.setRole('p0', ROLE.BUYER); return e; };
    const idle = mk(); runEngine(idle, 1000);
    if (Math.abs((72 - idle.units) - 1000 / fms(8)) > 0.1) return `idle used ${72 - idle.units}`;
    const push = mk(); for (let k = 0; k < 100; k++) { push.push(); push.update(10); }
    if (Math.abs((72 - push.units) - 1000 / fms(30)) > 0.1) return `pushing used ${72 - push.units}`;
    const touch = mk(); touch.setPrice('p1', 40); touch.setPrice('p0', 40); runEngine(touch, 1000);
    if (!touch.contact.key) return 'no contact';
    return Math.abs((72 - touch.units) - 1000 / fms(60)) < 0.1 ? true : `contact used ${72 - touch.units}`;
  });
  t('Auction timing: [Atari code] Beginner ATU 50 instead of 30 (every tick x 5/3), doubled in round 1', () => {
    const units = (level, turn) => { const { state, rng } = fresh('bt', level); state.turn = turn; const e = engineFor(state, rng, 'food', ['p0'], false, true); runEngine(e, 1000); return 31 - e.units; };
    const std = units('standard', 1); const b2 = units('beginner', 2); const b1 = units('beginner', 1);
    if (Math.abs(std - 1000 / fms(CONFIG.AUCTION.frames.declare)) > 0.1) return `standard ${std}`;
    if (Math.abs(b2 - std * 3 / 5) > 0.1) return `beginner round 2 ${b2}`;
    return Math.abs(b1 - std * 3 / 10) < 0.1 ? true : `beginner round 1 ${b1}`;
  });
  t('Declaration: roles change freely until the declare timer ends, then they are fixed; no trade meanwhile', () => {
    const { state, rng } = fresh(); setInv(state, 'p1', 'food', 5);
    const e = engineFor(state, rng, 'food', ['p0', 'p1'], false, true);
    if (!e.setRole('p0', ROLE.SELLER) || !e.setRole('p0', ROLE.BUYER) || !e.setRole('p1', ROLE.SELLER)) return 'declaring failed';
    e.setPrice('p1', 40); e.setPrice('p0', 60);
    const declareMs = CONFIG.AUCTION.declareUnits * fms(CONFIG.AUCTION.frames.declare);
    runEngine(e, Math.floor(declareMs / 10) * 10 - 10); if (e.volume || e.stage !== 'declare') return 'traded or ended the declaration early';
    runEngine(e, 50); if (e.stage !== 'trade') return 'the declaration did not end';
    if (e.setRole('p0', ROLE.SELLER) || e.entry('p0').role !== ROLE.BUYER) return 'the role changed after the declaration';
    runEngine(e, 1000); return eq(e.volume, 1, 'trade after the declaration');
  });
  t('Declaration: [FN] sellers start 1 step above the store sell line, buyers 10 steps below the store buy line', () => {
    const { state, rng } = fresh(); const e = engineFor(state, rng, 'food', ['p0', 'p1'], true, true);
    e.setRole('p0', ROLE.SELLER); e.setRole('p1', ROLE.BUYER);
    return eq(`${e.entry('p0').price}/${e.entry('p1').price}`, '51/15', 'start lines (food: store 15 / 50, bottom 15)');
  });
  t('Declaration: snapshot / restore in the middle of the declaration resumes the auction identically (AI included)', () => {
    const mk = () => {
      const { state, rng } = fresh('decl'); setInv(state, 'p1', 'food', 9); setInv(state, 'p2', 'food', 0);
      const e = new AuctionEngine({ market: AuctionEngine.fungibleMarket(RESOURCE_DEFS.food), state, rng, colonists: ['p0', 'p1', 'p2', 'p3'] });
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
    runEngine(e, 1000); if (!e.trades[0] || e.trades[0].buyer !== 'p3') return `buyer tie won by ${e.trades[0] && e.trades[0].buyer}`;
    ({ state, rng } = fresh()); setInv(state, 'p1', 'food', 5); setInv(state, 'p2', 'food', 5); setCash(state, 'p1', 3000);
    e = engineFor(state, rng, 'food', ['p1', 'p2', 'p3']);
    e.setRole('p1', ROLE.SELLER); e.setPrice('p1', 40); e.setRole('p2', ROLE.SELLER); e.setPrice('p2', 40); e.setRole('p3', ROLE.BUYER); e.setPrice('p3', 40);
    runEngine(e, 1000); if (!e.trades[0] || e.trades[0].seller !== 'p2') return `seller tie won by ${e.trades[0] && e.trades[0].seller}`;
    ({ state, rng } = fresh()); setInv(state, 'p1', 'food', 5);
    e = engineFor(state, rng, 'food', ['p1', 'p3'], true);
    const ask = e.entry('store-s').price;
    e.setRole('p1', ROLE.SELLER); e.setPrice('p1', ask); e.setRole('p3', ROLE.BUYER); e.setPrice('p3', ask);
    runEngine(e, 1000); return e.trades[0] && e.trades[0].seller === 'p1' ? true : `store tie: ${JSON.stringify(e.trades)}`;
  });
  t('Auction: [FN] a buyer stops at the lowest seller line (store sell line while it has stock), a seller at the highest buyer line (or the store buy line)', () => {
    const { state, rng } = fresh(); setInv(state, 'p1', 'food', 6); setCash(state, 'p0', 2000);
    const e = engineFor(state, rng, 'food', ['p0', 'p1', 'p2'], true);
    e.setRole('p0', ROLE.BUYER); e.setPrice('p0', 200); if (e.entry('p0').price !== 50) return `buyer above the store ask: ${e.entry('p0').price}`;
    e.setPrice('p0', 30); e.setRole('p1', ROLE.SELLER); e.setPrice('p1', 45); e.setPrice('p0', 200);
    if (e.entry('p0').price !== 45) return `buyer above a colonist seller: ${e.entry('p0').price}`;
    e.setPrice('p0', 30); e.setPrice('p1', 0); if (e.entry('p1').price !== 30) return `seller below the highest buyer: ${e.entry('p1').price}`;
    e.setRole('p2', ROLE.SELLER); e.setPrice('p0', 15); e.setPrice('p1', 0);
    return eq(e.entry('p1').price, 15, 'seller stops at the store buy line');
  });
  t('Auction: [Atari code] continuous unit-by-unit transfer while the lines touch, one unit per 12, 12, 10, 8, 6, 4, 2, 2... BTU; breaking contact resets it', () => {
    const { state, rng } = fresh(); setInv(state, 'p1', 'food', 20); setCash(state, 'p0', 5000);
    const e = engineFor(state, rng, 'food', ['p0', 'p1']);
    e.setRole('p1', ROLE.SELLER); e.setPrice('p1', 40); e.setRole('p0', ROLE.BUYER); e.setPrice('p0', 60);
    if (e.entry('p0').price !== 40) return `the buyer must stop on the seller line, got ${e.entry('p0').price}`;
    const at = []; let clock = 0;
    for (; clock < 5000; clock += 10) { const v = e.volume; e.update(10); if (e.volume > v) at.push(clock + 10); }
    let cum = 0; const want = [12, 12, 10, 8, 6, 4, 2, 2, 2].map((btu) => { cum += fms(btu * 4); return cum; });
    const off = at.slice(0, 9).map((ms, i) => ms - want[i]);
    if (off.length < 9 || off.some((d) => d < 0 || d >= 10)) return `unit times ${at.slice(0, 9).join()} vs ${want.map(Math.round).join()}`;
    if (!e.trades.every((tr) => tr.price === 40)) return 'units traded off the contact line';
    if (e.contact.units !== e.volume) return `units traded counter ${e.contact.units}`;
    e.setPrice('p0', 30); runEngine(e, 200); const v0 = e.volume; e.setPrice('p0', 60);
    runEngine(e, Math.floor(fms(48) / 10) * 10 - 10); if (e.volume !== v0) return 'the cadence did not restart after the contact broke';
    runEngine(e, 20); if (e.volume !== v0 + 1) return 'no unit after a fresh 12 BTU';
    return audited(state);
  });
  t('Auction: highest bid wins', () => {
    const { state, rng } = fresh(); setInv(state, 'p1', 'food', 6);
    const e = engineFor(state, rng, 'food', ['p0', 'p1', 'p2']);
    e.setRole('p1', ROLE.SELLER); e.setPrice('p1', 60);
    e.setRole('p0', ROLE.BUYER); e.setPrice('p0', 50);
    e.setRole('p2', ROLE.BUYER); e.setPrice('p2', 60);
    runEngine(e, 1000);
    return eq(e.trades[0] && e.trades[0].buyer, 'p2', 'winner');
  });
  t('Auction: the store sells only real stock ("La botiga s\'ha quedat sense estoc!") and buys colonist surplus at its buy line', () => {
    let { state, rng } = fresh(); setCash(state, 'p0', 5000);
    let e = engineFor(state, rng, 'food', ['p0', 'p1'], true);
    e.setRole('p0', ROLE.BUYER); e.setPrice('p0', 999); runEngine(e, 8000);
    if (state.store.stock.food !== 0 || state.players[0].inventory.food !== 12) return `bought ${state.players[0].inventory.food - 4}, store left ${state.store.stock.food}`;
    if (!e.trades.every((tr) => tr.price === 50 && tr.seller === 'store')) return 'store sales off its sell line';
    if (!e.notice || e.notice.kind !== 'store_dry') return `notice ${JSON.stringify(e.notice)}`;
    if (!e.ended) { e.setPrice('p0', 300); if (e.entry('p0').price !== 300) return 'with the store dry a buyer may go above its line'; }
    ({ state, rng } = fresh()); setInv(state, 'p0', 'food', 4);
    e = engineFor(state, rng, 'food', ['p0', 'p1'], true);
    e.setRole('p0', ROLE.SELLER); e.setPrice('p0', 0); runEngine(e, 2000);
    return e.volume >= 1 && e.trades[0].price === 15 && state.store.stock.food >= 9 ? audited(state) : `the store did not buy: ${JSON.stringify(e.trades)}`;
  });
  t('Auction: a buyer without the money does not trade ("El comprador no té diners")', () => {
    const { state, rng } = fresh(); setCash(state, 'p0', 45);
    const e = engineFor(state, rng, 'food', ['p0'], true);
    e.setRole('p0', ROLE.BUYER); e.setPrice('p0', 999); runEngine(e, 3000);
    return e.volume === 0 && e.notice && e.notice.kind === 'no_cash' ? audited(state) : `volume ${e.volume}, notice ${JSON.stringify(e.notice)}`;
  });
  t('Critical level: [Atari code] food = next round\'s need (round 12: 0), energy = non-energy RUCs + 1, smithore none', () => {
    const { state } = fresh(); const p = state.players[1]; develop(state, 'p1', 0, 'food'); develop(state, 'p1', 2, 'smithore'); develop(state, 'p1', 3, 'energy');
    const c = (turn) => { state.turn = turn; return ['food', 'energy', 'smithore'].map((r) => ConsumptionSystem.criticalLevel(state, p, r)).join('/'); };
    const got = [1, 3, 4, 8, 11, 12].map(c).join(' ');
    return eq(got, '3/3/0 3/3/0 4/3/0 5/3/0 5/3/0 0/3/0', 'critical levels');
  });
  t('Critical level: [Atari code] Standard computers stop selling at it ("Venedor al nivell crític!"), humans may sell below; Beginner blocks everyone', () => {
    const { state, rng } = fresh(); state.turn = 1; setInv(state, 'p0', 'food', 5); setInv(state, 'p1', 'food', 5);
    const e = engineFor(state, rng, 'food', ['p0', 'p1'], true);
    e.setRole('p0', ROLE.SELLER); e.setRole('p1', ROLE.SELLER); e.setPrice('p0', 0); e.setPrice('p1', 0);
    let seen = false; for (let k = 0; k < 12000 && !e.ended; k += 10) { e.update(10); if (e.notice && e.notice.kind === 'critical' && e.notice.id === 'p1') seen = true; }
    if (state.players[1].inventory.food !== 3) return `computer sold down to ${state.players[1].inventory.food}`;
    if (state.players[0].inventory.food !== 0) return `human kept ${state.players[0].inventory.food}`;
    if (!seen) return 'no critical-level notice';
    const b = fresh('crit', 'beginner'); b.state.turn = 2;
    const e2 = engineFor(b.state, b.rng, 'food', ['p0'], true);
    e2.setRole('p0', ROLE.SELLER); e2.setPrice('p0', 0); runEngine(e2, 30000);
    return eq(b.state.players[0].inventory.food, 3, 'Beginner human food after selling');
  });
  t('Auction: blocked without cash or stock, state untouched (atomic)', () => {
    const { state, rng } = fresh(); state.players[0].cash = 10; state.players[1].inventory.food = 5;
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
  t('Auction: ends when the time units run out, when all are out, and with no possible deal (PROVISIONAL early ends)', () => {
    let { state, rng } = fresh(); setInv(state, 'p1', 'food', 5); let e = engineFor(state, rng, 'food', ['p0', 'p1']);
    e.setRole('p0', ROLE.BUYER); e.setRole('p1', ROLE.SELLER); runEngine(e, 11400);
    if (e.ended) return `ended early: ${e.endReason}`;
    runEngine(e, 200); if (e.endReason !== 'time') return `reason ${e.endReason}`;
    ({ state, rng } = fresh()); e = engineFor(state, rng, 'food', ['p0', 'p1']);
    runEngine(e, 2900); if (e.ended) return 'ended too early (all out)';
    runEngine(e, 200); if (e.endReason !== 'all_out') return `all_out ${e.endReason}`;
    ({ state, rng } = fresh()); state.players.forEach((p) => { p.inventory.food = 0; }); e = engineFor(state, rng, 'food', ['p0', 'p1']);
    e.setRole('p0', ROLE.BUYER); runEngine(e, 4900); if (e.ended) return 'no_ops too early';
    runEngine(e, 200); return eq(e.endReason, 'no_ops', 'no possible deal');
  });
  t('Auction: a 4th resource needs no engine change', () => {
    const { state, rng } = fresh();
    const def = { id: 'gizmo', label: 'Gizmo', basePrice: 40, minPrice: 10, maxPrice: 90, auctionStep: 1 };
    state.ext.items.gizmo = 0; state.store.stock.gizmo = 0; state.initialTotals.items.gizmo = 0;
    setInv(state, 'p0', 'gizmo', 3); setCash(state, 'p1', 200);
    const e = new AuctionEngine({ market: AuctionEngine.fungibleMarket(def), state, rng, colonists: ['p0', 'p1'], withStore: false, declare: false });
    e.setRole('p0', ROLE.SELLER); e.setPrice('p0', 30); e.setRole('p1', ROLE.BUYER); e.setPrice('p1', 50); runEngine(e, 1000);
    return e.volume === 1 && state.players[1].inventory.gizmo === 1 && ResourceLedger.audit(state).length === 0 ? true : 'gizmo trade failed';
  });
  t('Auction: a generic single lot transfers ownership', () => {
    const { state, rng } = fresh(); const plot = state.plots[0]; plot.ownerId = 'p1'; state.players[1].plots.push(plot.id);
    const market = { id: 'land', label: 'Terra', minPrice: 50, maxPrice: 500, step: 5, basePrice: 300, kind: 'plot',
      createLot: (st, sellerId) => ({ id: `plot:${plot.id}`, kind: 'plot', quantity: 1, sellerId, transferable: plot.ownerId === sellerId, getValue: () => 300,
        transfer: (s2, toId) => { plot.ownerId = toId; return true; } }) };
    const e = new AuctionEngine({ market, state, rng, colonists: ['p0', 'p1'], withStore: false, declare: false });
    e.setRole('p1', ROLE.SELLER); e.setPrice('p1', 200); e.setRole('p0', ROLE.BUYER); e.setPrice('p0', 250); runEngine(e, 1000);
    return e.volume === 1 && plot.ownerId === 'p0' ? true : 'plot did not change owner';
  });
  t('Feature flags: crystite and land auctions on (crystite only plays in Tournament); the wampus has no flag; hidden deposits on every plot', () => {
    const ids = enabledResources(fresh().state).map((d) => d.id).join();
    if (ids !== 'food,energy,smithore') return `Standard enabled ${ids}`;
    if (!('hiddenDeposit' in fresh().state.plots[0])) return 'hiddenDeposit';
    return FEATURES.crystite === true && !('wampus' in FEATURES) && FEATURES.landAuctions === true ? true : 'feature flags';
  });

  /* ---------- Batch 4: land auctions ---------- */
  /** Runs a land auction for `ms` (or until `until()`), in 10 ms steps. */
  const runLA = (state, rng, la, ms, until = null) => { for (let k = 0; k < ms && !la.done && !(until && until()); k += 10) LandAuction.update(state, rng, la, 10); };
  t('Land auction: [Atari code] colony plots per round = 1 + variation: 0 16.2 %, 1 67.7 %, 2 16.1 %, 3 0.1 %; capped by free plots; none in Beginner', () => {
    const rng = new SeededRNG('lac'); const { state } = fresh(); const n = [0, 0, 0, 0];
    for (let i = 0; i < 20000; i++) n[LandAuction.colonyCount(state, rng)]++;
    const pct = n.map((x) => x / 200);
    if (Math.abs(pct[0] - 16.2) > 1.2 || Math.abs(pct[1] - 67.7) > 1.5 || Math.abs(pct[2] - 16.1) > 1.2 || pct[3] > 0.4) return `shares ${pct.join('/')}`;
    state.plots.filter((p) => Plot.claimable(p)).slice(1).forEach((p) => LandGrantSystem.assign(state, 'p1', p.id));
    for (let i = 0; i < 300; i++) if (LandAuction.colonyCount(state, rng) > 1) return 'more lots than free plots';
    const b = fresh('lab', 'beginner');
    for (let i = 0; i < 300; i++) if (LandAuction.colonyCount(b.state, rng)) return 'land auction in Beginner';
    return true;
  });
  t('Land auction: [Atari code] bids start at $160, the next lot $60 below the previous price; no bid -> start/2 + 52 and the colony set ends; next round starts at the set average - 60', () => {
    const { state, rng } = fresh('lap'); state.turn = 2; setCash(state, 'p0', 2000);
    const la = LandAuction.create(state, rng, [], { colony: 3 });
    if (la.lot.start !== 160 || la.lot.sellerId !== 'colony') return `first lot ${JSON.stringify(la.lot)}`;
    runLA(state, rng, la, 10000, () => la.stage === 'bid');
    LandAuction.setBid(state, la, 'p0', 201);
    if (la.bids.p0.price !== 200) return `$4 steps from the start: ${la.bids.p0.price}`;
    const plotA = la.lot.plotId;
    runLA(state, rng, la, 30000, () => la.stage === 'result');
    if (!la.result.sold || la.result.buyer !== 'p0' || la.result.price !== 200 || state.plots[plotA].ownerId !== 'p0') return `lot 1 ${JSON.stringify(la.result)}`;
    runLA(state, rng, la, 10000, () => la.stage === 'bid');
    if (la.lot.start !== 140) return `second lot starts at ${la.lot.start}`;
    runLA(state, rng, la, 60000);
    if (!la.done || la.prices.join() !== '200,122' || la.sold.length !== 1) return `set ${la.prices.join()} sold ${la.sold.length} done ${la.done}`;
    if (state.landAuction.lastAvg !== 161) return `average ${state.landAuction.lastAvg}`;
    state.turn = 3; const next = LandAuction.create(state, rng, [], { colony: 1 });
    return eq(next.lot && next.lot.start, 101, 'next round start');
  });
  t('Land auction: highest bid at time-out wins, a tie goes to the poorer colonist, nobody bids past their cash; colony sale money goes to the store', () => {
    const { state, rng } = fresh('lat'); state.turn = 2; setCash(state, 'p0', 900); setCash(state, 'p2', 900); setCash(state, 'p3', 250);
    LandGrantSystem.assign(state, 'p2', 0);
    const la = LandAuction.create(state, rng, [], { colony: 1 }); const plotId = la.lot.plotId;
    runLA(state, rng, la, 10000, () => la.stage === 'bid');
    LandAuction.setBid(state, la, 'p3', 400); if (la.bids.p3.price !== 248) return `bid past cash ${la.bids.p3.price}`;
    LandAuction.setBid(state, la, 'p0', 300); LandAuction.setBid(state, la, 'p2', 300);
    const bank = state.bank.cash;
    runLA(state, rng, la, 30000, () => la.stage === 'result');
    if (!la.result.sold || la.result.buyer !== 'p0') return `tie won by ${la.result.buyer} (p2 owns a plot, so p0 is poorer)`;
    if (state.players[0].cash !== 600 || state.bank.cash !== bank + 300 || state.plots[plotId].ownerId !== 'p0' || !state.players[0].plots.includes(plotId)) return 'transfer';
    return audited(state);
  });
  t('Land auction: plots marked at the land office go first with the owner as seller (money to the owner), the mark is cleared; an unsold plot stays', () => {
    const { state, rng } = fresh('lam'); state.turn = 3; LandGrantSystem.assign(state, 'p0', 10); LandGrantSystem.assign(state, 'p0', 12);
    LandOffice.mark(state, 'p0', 10); setCash(state, 'p1', 2000);
    const la = LandAuction.create(state, rng, [], { colony: 0 });
    if (!la.lot || la.lot.plotId !== 10 || la.lot.sellerId !== 'p0' || la.lot.start !== 160) return `lot ${JSON.stringify(la.lot)}`;
    runLA(state, rng, la, 10000, () => la.stage === 'bid');
    if (la.bids.p0) return 'the seller must not bid on its own plot';
    LandAuction.setBid(state, la, 'p1', 180); const c0 = state.players[0].cash;
    runLA(state, rng, la, 60000);
    if (state.plots[10].ownerId !== 'p1' || state.players[0].plots.includes(10) || state.players[0].cash !== c0 + 180) return 'player sale';
    if (LandOffice.forSale(state).length) return 'mark not cleared';
    LandOffice.mark(state, 'p0', 12); const la2 = LandAuction.create(state, rng, [], { colony: 0 });
    runLA(state, rng, la2, 60000);
    if (state.plots[12].ownerId !== 'p0' || la2.result.sold || LandOffice.forSale(state).length) return 'unsold plot';
    return audited(state);
  });
  t('Land auction: computers bid by their land valuation ($4 steps above the start) and never past it or their cash', () => {
    const { state, rng } = fresh('lai'); state.turn = 2;
    const la = LandAuction.create(state, rng, ['p1', 'p2', 'p3'], { colony: 1 }); const plot = state.plots[la.lot.plotId];
    const vals = ['p1', 'p2', 'p3'].map((id) => la.ai[id].max);
    if (vals.some((v) => !Number.isInteger(v) || v < 0)) return `valuations ${vals}`;
    runLA(state, rng, la, 60000, () => la.stage === 'result');
    const bids = ['p1', 'p2', 'p3'].map((id) => la.bids[id].price);
    if (bids.some((b, i) => b > Math.max(vals[i], la.lot.start - 40))) return `bids ${bids} past valuations ${vals}`;
    if (bids.some((b) => (b - la.lot.start) % 4)) return 'off the $4 grid';
    const best = Math.max(...vals);
    if (best >= la.lot.start && (!la.result.sold || plot.ownerId === null)) return `nobody bought though valuations were ${vals}`;
    return audited(state);
  });

  /* ---------- P2.8 land ---------- */
  t('Land grant AI: [Atari code] calcPlayerBestPlotAi keeps the best rating (a later plot wins ties, a 0 only 1/4), row penalty +1 after plot 27 / 36', () => {
    const rng = new SeededRNG('bp'); const all = () => true;
    const r = new Array(45).fill(0); r[10] = 20; r[30] = 20; r[40] = 21;
    if (AISystem.bestPlot(r, 0, all, rng) !== 10) return `from 0: ${AISystem.bestPlot(r, 0, all, rng)}`; // 30 -> 19, 40 -> 19
    if (AISystem.bestPlot(r, 28, all, rng) !== 40) return 'from 28: no penalty was earned yet, 21 must win';
    r[12] = 20; if (AISystem.bestPlot(r, 0, all, rng) !== 12) return 'a tie must go to the later plot';
    return AISystem.bestPlot(r, 0, (id) => id !== 12 && id !== 10, rng) === 40 ? true : 'claimed plots must be skipped';
  });
  t('Land grant AI: [Atari code] each computer aims at the plot of its own rating map (best exploitation - store distance), ahead of the cursor', () => {
    const { state, rng } = fresh('lgai'); state.turn = 3;
    const land = LandRace.create(state, rng, ['p1', 'p2', 'p3']);
    for (const pid of ['p1', 'p2', 'p3']) {
      const a = land.ai[pid]; if (!a) return `${pid} has no plan`;
      const p = playerById(state, pid); const q = land.quality[pid];
      const ratings = state.plots.map((x) => (Plot.claimable(x) ? AISystem.landRating(state, p, x, q) : 0));
      const top = Math.max(...ratings.map((v, id) => (id >= land.cursor ? v - (id > 36 ? 2 : id > 27 ? 1 : 0) : -1)));
      const mine = ratings[a.target] - (a.target > 36 ? 2 : a.target > 27 ? 1 : 0);
      if (mine !== top) return `${pid} aims at ${a.target} (${mine}), best ${top}`;
    }
    return JSON.stringify(JSON.parse(JSON.stringify(land))) === JSON.stringify(land) ? true : 'land not JSON-safe';
  });
  t('Land race: cursor sweeps free plots row-major, skips owned plots and the town instantly, 320 ms per free plot (Standard)', () => {
    const { state, rng } = fresh('land1');
    [0, 1, 5, 9].forEach((id) => LandGrantSystem.assign(state, 'p3', id));
    const land = LandRace.create(state, rng, []);
    if (land.msPerPlot !== 320) return `msPerPlot ${land.msPerPlot}`;
    const seq = [land.cursor]; const stamps = [land.clock]; let last = land.cursor;
    while (!land.done) {
      LandRace.update(state, rng, land, 10);
      if (land.cursor >= 0 && land.cursor !== last) { seq.push(land.cursor); stamps.push(land.clock); last = land.cursor; }
    }
    const expected = state.plots.filter((p) => Plot.claimable(p)).map((p) => p.id);
    if (seq.join() !== expected.join()) return `sequence ${seq.join()} != ${expected.join()}`;
    if (seq.includes(22)) return 'the town was offered';
    const gaps = stamps.slice(1).map((v, i) => v - stamps[i]);
    return gaps.every((g) => g === 320) ? true : `dwell gaps ${[...new Set(gaps)].join(',')}`;
  });
  t('Land race: [C64][Atari code] Standard 16 frames per plot (320 ms) and a 64-frame claim pause (1280 ms); Beginner 32 / 128 frames', () => {
    const got = ['standard', 'beginner'].map((l) => { const { state, rng } = fresh('spd', l); const land = LandRace.create(state, rng, []); return `${land.msPerPlot}/${land.pauseMs}`; });
    if ('DIFFICULTY' in CONFIG || 'landClaimPauseMs' in CONFIG.LAND) return 'old difficulty pacing still in CONFIG';
    return eq(got.join(), '320/1280,640/2550', 'ms per plot / claim pause');
  });
  t('Land race: a colonist claims at most ONE plot per turn; later presses are ignored', () => {
    const { state, rng } = fresh('land2');
    const land = LandRace.create(state, rng, []);
    raceRun(state, rng, land, 3000, 10, [{ pid: 'p0', at: 100 }, { pid: 'p0', at: 200 }, { pid: 'p1', at: 1500 }]);
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
    const { state, rng } = fresh('land5'); const d = CONFIG.AI;
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
  t('Land race pause: after a claim the cursor is hidden and NOBODY can claim for 1280 ms (Standard)', () => {
    const { state, rng } = fresh('pause1');
    const land = LandRace.create(state, rng, []);
    raceRun(state, rng, land, 110, 10, [{ pid: 'p0', at: 100 }]);
    if (land.claimed.p0 !== 0) return 'p0 should have claimed plot 0';
    if (land.cursor !== -1 || land.pause <= 0) return `cursor ${land.cursor}, pause ${land.pause}`;
    if (LandRace.canClaim(land, 'p1') || LandRace.press(land, 'p1')) return 'a press was accepted during the pause';
    raceRun(state, rng, land, 1200, 10, [{ pid: 'p1', at: 500 }, { pid: 'p2', at: 1250 }]);
    if (state.players[1].plots.length || state.players[2].plots.length) return 'a claim slipped in during the pause';
    if (land.cursor !== -1) return 'cursor must stay hidden while paused';
    raceRun(state, rng, land, 200, 10);
    return land.cursor === 1 && land.pause <= 0 && land.dwellLeft > 0 && land.dwellLeft <= 320 ? true : `after the pause: cursor ${land.cursor}, pause ${land.pause}, dwell ${land.dwellLeft}`;
  });
  t('Land race pause: the sweep resumes at the plot AFTER the claimed one, with a full dwell', () => {
    const { state, rng } = fresh('pause2');
    LandGrantSystem.assign(state, 'p3', 1); LandGrantSystem.assign(state, 'p3', 2);
    const land = LandRace.create(state, rng, []);
    if (land.cursor !== 0) return `start ${land.cursor}`;
    raceRun(state, rng, land, 50, 10, [{ pid: 'p0', at: 20 }]);
    let guard = 0; while (land.pause > 0 && guard++ < 1000) LandRace.update(state, rng, land, 10);
    return land.cursor === 3 && land.dwellLeft === 320 ? true : `resumed at ${land.cursor} with dwell ${land.dwellLeft} (expected plot 3, owned 1 and 2 skipped)`;
  });
  t('Land race pause: AI reaction timers do not run down during the pause (they restart when the cursor resumes)', () => {
    const { state, rng } = fresh('pause3'); const d = CONFIG.AI;
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
    const bag = JSON.stringify(s.events.bag); s.turn = lastRound(s); g.turns.enter(g, 'PLANET_EVENT');
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
  t('Turn report: every event of the round gets its own line (1 column up to 3, then 2 columns), all above the continue button', () => {
    for (let n = 0; n <= 10; n++) {
      const slots = ReportScreen.eventSlots(n);
      if (slots.length !== n) return `${n} events -> ${slots.length} slots`;
      const keys = new Set(slots.map((sl) => `${sl.x},${sl.y}`));
      if (keys.size !== n) return `${n} events: overlapping slots`;
      if (slots.some((sl) => sl.y < 556 || sl.y + sl.size > 640 || sl.x + sl.w > 1240)) return `${n} events: ${JSON.stringify(slots)}`;
      if (n <= 3 && slots.some((sl) => sl.x !== 70)) return `${n} events must stay in one column`;
    }
    return true;
  });
  t('Colony rating: [Atari code] round((total - 10000) / 20000) clamped 0..6, with the 7 original texts in Catalan', () => {
    const got = [0, 9999, 19999, 20000, 39999, 40000, 59999, 60000, 79999, 80000, 100000, 119999, 120000, 900000].map((v) => ScoringSystem.rating(v)).join();
    if (got !== '0,0,0,1,1,2,2,3,3,4,5,5,6,6') return `ratings ${got}`;
    if (COLONY_RATINGS.length !== 7 || !COLONY_RATINGS.every((x) => x.startsWith('En conjunt, la colònia '))) return 'texts';
    const keys = ['presó per a deutors', 'naus de comerç', 'tendes', 'mínims', 'còmodament', 'finques elegants', 'luxosa'];
    return keys.every((k, i) => COLONY_RATINGS[i].includes(k)) ? true : COLONY_RATINGS.join(' | ');
  });
  t('Colony result: [Atari code] First Founder only at the real end and with a colony of at least 60,000 (rating >= 3); ranking always shown', () => {
    const { state } = fresh(); state.turn = 12;
    const total = () => state.players.reduce((s, p) => s + ScoringSystem.netWorth(state, p), 0);
    setCash(state, 'p1', state.players[1].cash + 60000 - total() - 1);
    if (ScoringSystem.survival(state).survives || total() !== 59999) return `59,999 -> ${JSON.stringify(ScoringSystem.survival(state))}`;
    const g = mkGame(); g.state = state; g.rng = new SeededRNG('fin'); g.mode = 'play'; g.finish();
    if (state.final.winnerId !== null || state.final.rating !== 2) return `59,999 must not give a First Founder: ${JSON.stringify(state.final)}`;
    setCash(state, 'p1', state.players[1].cash + 1);
    const s = ScoringSystem.survival(state);
    if (!s.survives || s.combined !== 60000) return '60,000 must succeed';
    g.finish();
    if (!state.final.survives || state.final.winnerId !== 'p1' || state.final.rating !== 3) return `final ${JSON.stringify(state.final)}`;
    state.turn = 7; g.finish();
    if (state.final.winnerId !== null) return 'no First Founder before the ship is back';
    state.turn = 12; setCash(state, 'p1', 100); g.finish();
    return state.final.winnerId === null && state.final.rank.length === 4 && state.final.rating === 0 ? true : 'failure must keep the ranking without a First Founder';
  });
  t('Ship messages: [C64] "Aterreu al planeta Irata." / "La nau tornarà d\'aquí a N mesos." at the start (6 in Beginner), "La nau ha tornat!" at the end', () => {
    const txt = (level) => { const { state } = fresh('ship', level); return EventSystem.landing(state).text; };
    if (!txt('standard').includes('Aterreu al planeta Irata.') || !txt('standard').includes('La nau tornarà d\'aquí a 12 mesos.')) return txt('standard');
    if (!txt('beginner').includes('d\'aquí a 6 mesos.')) return txt('beginner');
    const g = mkGame(); g.newGame({ seed: 'land-msg' });
    const it = (g.turns.phaseData.items || [])[0];
    if (g.turns.phase !== 'TURN_START' || !it || it.id !== 'landing') return `round 1 must open with the landing card (phase ${g.turns.phase})`;
    return EventSystem.shipBack().name === 'La nau ha tornat!' ? true : 'ship back';
  });

  /* ---------- Batch 7: the Mountain Wampus ---------- */
  const mountainIds = (state) => state.plots.filter((p) => p.terrain === TERRAIN.MOUNTAIN).map((p) => p.id);
  /** Puts the walker on the map, in the middle of plot `id` (test teleport: the walk itself is covered elsewhere). */
  const standOn = (state, w, id) => { const p = state.plots[id]; w.area = 'map'; w.x = p.x * CONFIG.TILE + CONFIG.TILE / 2; w.y = p.y * CONFIG.TILE + CONFIG.TILE / 2; };
  /** A walker with a wampus that is visible right now on its mountain (the walker stays in town). */
  const wampusVisible = (seed = 'wampus', level = 'standard') => {
    const { state } = fresh(seed, level); const w = DevWalk.create(state, 'p0', 60000);
    w.wampus = WampusSystem.create(state, 'p0', 0, false);
    go(state, w, { x: 0, y: 0 }, 10);
    return { state, w };
  };
  t('Wampus: [Atari code] reward 100 x (floor(round / 4) + 1): R1-3 100, R4-7 200, R8-11 300, R12 400', () => {
    const got = Array.from({ length: 12 }, (_, i) => WampusSystem.reward(i + 1)).join();
    return eq(got, '100,100,100,200,200,200,200,300,300,300,300,400', 'rewards');
  });
  t('Wampus: [Atari code] first appearance after Ta/4 PTU (Ta = BTU waited before start, max 255; a personal event takes 100 off)', () => {
    const btu = CONFIG.DEV.btuFrames * 1000 / CONFIG.DEV.palHz;
    const cases = [[0, false, 0], [40, false, 10], [43, false, 10], [255, false, 63], [400, false, 63], [255, true, 38], [50, true, 0], [150, true, 12]];
    for (const [b, ev, ptu] of cases) { const got = WampusSystem.firstDelayPtu(b * btu + 1, ev); if (got !== ptu) return `${b} BTU event ${ev}: ${got} PTU, expected ${ptu}`; }
    const { state } = fresh('wampus-first'); const w = DevWalk.create(state, 'p0', 60000);
    w.wampus = WampusSystem.create(state, 'p0', 40 * btu + 1, false);
    if (w.wampus.visible || !mountainIds(state).includes(w.wampus.plotId)) return `start ${JSON.stringify(w.wampus)}`;
    go(state, w, { x: 0, y: 0 }, 10 * w.unitMs - 20);
    if (w.wampus.visible) return 'appeared before 10 PTU';
    go(state, w, { x: 0, y: 0 }, 30);
    return w.wampus.visible ? true : 'not visible after 10 PTU';
  });
  t('Wampus: [Atari code] visible 1-4 PTU, then hidden: stays put 4-7 PTU or moves to a random mountain after exactly 2 PTU (seeded)', () => {
    const trace = (seed) => {
      const { state } = fresh(seed); const w = DevWalk.create(state, 'p0', 600000);
      w.wampus = WampusSystem.create(state, 'p0', 0, false);
      const spans = []; let vis = w.wampus.visible; let since = 0; let plot = w.wampus.plotId;
      for (let tt = 0; tt < 300000; tt += 10) {
        go(state, w, { x: 0, y: 0 }, 10); since += 10;
        if (w.wampus.visible !== vis) {
          spans.push({ vis, ms: since, from: plot, to: w.wampus.plotId }); vis = w.wampus.visible; since = 0; plot = w.wampus.plotId;
          if (!mountainIds(state).includes(plot)) return { bad: `plot ${plot} is not a mountain` };
        }
      }
      return { spans: spans.slice(1), u: w.unitMs }; // the first span is the initial delay
    };
    let stays = 0; let moves = 0;
    for (const seed of ['wa-1', 'wa-2', 'wa-3']) {
      const r = trace(seed); if (r.bad) return r.bad;
      for (const sp of r.spans) {
        const ptu = sp.ms / r.u;
        if (sp.vis) { if (!(ptu > 0.98 && ptu < 4.02)) return `visible ${ptu} PTU`; if (Math.abs(ptu - Math.round(ptu)) > 0.02) return `visible not whole PTU: ${ptu}`; continue; }
        if (Math.abs(ptu - 2) < 0.02) moves += 1;
        else if (ptu > 3.98 && ptu < 7.02 && Math.abs(ptu - Math.round(ptu)) < 0.02) { stays += 1; if (sp.to !== sp.from) return `stayed ${ptu} PTU but moved ${sp.from} -> ${sp.to}`; }
        else return `hidden ${ptu} PTU`;
      }
    }
    if (stays < 5 || moves < 5) return `stays ${stays} moves ${moves}`;
    return JSON.stringify(trace('wa-1')) === JSON.stringify(trace('wa-1')) ? true : 'same seed, different wampus';
  });
  t('Wampus: [manual][Atari code] standing on his mountain keeps him from opening his door', () => {
    const { state } = fresh('wampus-stand'); const w = DevWalk.create(state, 'p0', 600000);
    w.wampus = WampusSystem.create(state, 'p0', 0, false);
    const id = w.wampus.plotId; standOn(state, w, id);
    for (let tt = 0; tt < 120000; tt += 10) { go(state, w, { x: 0, y: 0 }, 10); if (w.wampus.visible && w.wampus.plotId === id) return `appeared under the colonist at ${tt} ms`; }
    return true;
  });
  t('Wampus: Acció on his plot (no RUC in tow) catches him: reward, the C64 message, once per turn, the turn goes on', () => {
    const { state, w } = wampusVisible(); state.turn = 5;
    if (!w.wampus.visible) return 'setup: not visible';
    const cash0 = playerById(state, 'p0').cash; const other = mountainIds(state).find((id) => id !== w.wampus.plotId);
    standOn(state, w, other);
    if (DevWalk.act(state, w) === 'wampus') return 'caught from another mountain';
    standOn(state, w, w.wampus.plotId);
    if (DevWalk.act(state, w) !== 'wampus') return `not caught: ${w.msg}`;
    if (playerById(state, 'p0').cash !== cash0 + 200) return `cash ${playerById(state, 'p0').cash - cash0}`;
    if (w.msg !== "Has caçat el Wampus de muntanya!! T'ha donat el seu cofre: 200 cr perquè el deixis lliure.") return `msg ${w.msg}`;
    if (w.ended || w.wampus.visible) return 'the turn ended or he is still there';
    for (let tt = 0; tt < 120000; tt += 10) { go(state, w, { x: 0, y: 0 }, 10); if (w.wampus.visible) return 'appeared again after the catch'; }
    return audited(state);
  });
  t('Wampus: never caught while leading a RUC, from town, or while hidden; Beginner has him too [PROVISIONAL]', () => {
    let { state, w } = wampusVisible('wampus-no');
    standOn(state, w, w.wampus.plotId); w.carrying = { module: 'food', paid: 100 }; state.store.ruc -= 1;
    if (DevWalk.act(state, w) === 'wampus' || w.wampus.caught) return 'caught while leading a RUC';
    ({ state, w } = wampusVisible('wampus-town'));
    if (DevWalk.act(state, w) === 'wampus') return 'caught from town';
    ({ state, w } = wampusVisible('wampus-hid')); standOn(state, w, w.wampus.plotId); w.wampus.visible = false;
    if (DevWalk.act(state, w) === 'wampus') return 'caught while hidden';
    ({ state, w } = wampusVisible('wampus-beg', 'beginner')); standOn(state, w, w.wampus.plotId);
    return DevWalk.act(state, w) === 'wampus' ? true : 'Beginner: no wampus';
  });
  t('Wampus: the game times the wait before the start button, gives only the human a wampus, rings his bell and plays the catch', () => {
    const g = mkGame(); const spy = { log: [], play(k) { this.log.push(k); }, music() {}, stopMusic() {}, hold() {}, soundChanged() {}, unlock() {} }; g.audio = spy; g.newGame({ seed: 'wampus-game' });
    let guard = 0;
    while (guard++ < 200000 && !(g.turns.phase === 'DEVELOPMENT' && g.devSlot() && g.devSlot().pid === 'p0')) { if (g.turns.phaseData.skippable) g.skipPhase(); g.tick(50); }
    const slot = g.devSlot(); if (!slot || slot.stage !== 'ready') return 'no ready prompt';
    for (let i = 0; i < 20; i++) g.tick(50);
    if (!(slot.waitMs >= 1000)) return `waitMs ${slot.waitMs}`;
    g.devStart(); const w = g.humanWalk(); const wp = w.wampus;
    if (!wp) return 'the human has no wampus';
    const ptu = WampusSystem.firstDelayPtu(slot.waitMs, !!slot.event);
    if (Math.abs(wp.t - ptu * w.unitMs) > 1) return `first delay ${wp.t} ms, expected ${ptu} PTU`;
    spy.log.length = 0; wp.t = 10; g.tick(50);
    if (!wp.visible || !spy.log.includes('wampus_bell')) return `no bell: ${spy.log}`;
    standOn(g.state, w, wp.plotId); g.devAction(); g.tick(50);
    return spy.log.includes('wampus') && wp.caught ? true : `catch sound: ${spy.log}`;
  });
  t('Wampus: a save mid-walk restores him exactly (the hunt continues the same way)', () => {
    const g = mkGame(); g.newGame({ seed: 'wampus-save' });
    let guard = 0;
    while (guard++ < 200000 && !g.humanWalk()) { if (g.turns.phaseData.skippable) g.skipPhase(); const sl = g.devSlot(); if (sl && sl.stage === 'ready') g.devStart(); g.tick(50); }
    if (!g.humanWalk() || !g.humanWalk().wampus) return 'no walk with a wampus';
    for (let i = 0; i < 100; i++) g.tick(50);
    g.snapshotPhase(); const h = mkGame(); h.resume(SaveSystem.deserialize(SaveSystem.serialize(g.state, g.rng)));
    if (JSON.stringify(h.humanWalk().wampus) !== JSON.stringify(g.humanWalk().wampus)) return 'wampus lost by the save';
    for (const G of [g, h]) for (let i = 0; i < 300; i++) G.tick(50);
    return JSON.stringify(h.humanWalk().wampus) === JSON.stringify(g.humanWalk().wampus) ? true : 'the hunt diverged after resuming';
  });
  t('Wampus: a flashing point of light on the map; Reduir moviment keeps a steady glow', () => {
    const flash = [0, 100, 200, 300, 400, 500].map((n) => MapScreen.wampusGlow(n, false));
    if (new Set(flash).size < 2 || flash.some((a) => !(a > 0))) return `flashing ${flash}`;
    const steady = [0, 100, 200, 300, 400, 500].map((n) => MapScreen.wampusGlow(n, true));
    return new Set(steady).size === 1 && steady[0] === 1 ? true : `steady ${steady}`;
  });

  /* ---------- saves, conservation, determinism, engine ---------- */
  t('Save: schema 9 round trip keeps state (level, species, land sales, land-auction prices, store prices, event bag) and PRNG; schemas 1-8 (old rules) and corrupt saves are refused', () => {
    if (CONFIG.SCHEMA_VERSION !== 9) return `schema ${CONFIG.SCHEMA_VERSION}`;
    const { state, rng } = fresh('save'); rng.next(); rng.next();
    state.turn = 4; state.phase = 'DEVELOPMENT'; state.storePrice.food = 33; state.events.bag.pirates = 1; state.events.used[13] = 1; state.landAuction.lastAvg = 222;
    const text = SaveSystem.serialize(state, rng);
    const back = SaveSystem.deserialize(text);
    if (back.incompatible) return 'incompatible';
    const rng2 = new SeededRNG('x'); rng2.setState(back.state.rngState);
    if (JSON.stringify(back.state) !== text) return 'state differs after round trip';
    if (rng2.next() !== rng.next()) return 'rng stream differs';
    if (back.state.storePrice.food !== 33) return 'store price lost';
    if (back.state.events.bag.pirates !== 1 || back.state.events.used[13] !== 1) return 'event bag / used flags lost';
    if (back.state.level !== 'standard' || back.state.players[0].species !== 'mechtron' || !Array.isArray(back.state.landSales)) return 'level / species / land sales lost';
    if (back.state.landAuction.lastAvg !== 222) return 'land-auction price lost';
    for (const v of [1, 2, 3, 4, 5, 6, 7, 8]) {
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
  t('Input: Enter / Space with nothing focused press the screen\'s primary button (status, report, production, auction end)', () => {
    const g = mkGame(); g.mode = 'play'; let hits = 0; const key = (k) => ({ key: k, code: k === ' ' ? 'Space' : k, preventDefault() {} });
    g.renderer.widgets = [{ id: 'other', x: 0, y: 0, w: 10, h: 10, focusable: true, onClick: () => { hits += 100; } },
      { id: 'rep-next', x: 0, y: 0, w: 10, h: 10, focusable: true, primary: true, onClick: () => { hits += 1; } }];
    g.renderer.focusId = null; g.input.onKeyDown(key('Enter')); g.input.onKeyDown(key(' '));
    if (hits !== 2) return `hits ${hits}`;
    g.renderer.focusId = 'other'; g.input.onKeyDown(key('Enter'));
    if (hits !== 102) return `a focused button must keep its own Enter (hits ${hits})`;
    // The event card is a full-screen region ("Clic, Enter o Espai per continuar"): it must react without being focused first.
    g.renderer.widgets = []; g.renderer.focusId = 's-start';
    g.renderer.region('event-skip', 0, 0, 10, 10, { focusable: true, primary: true, onKey: (e) => { if (e.key === 'Enter') { hits += 1000; return true; } return false; } });
    g.input.onKeyDown(key('Enter'));
    return hits === 1102 ? true : `event card: hits ${hits}`;
  });
  t('Game: resume mid-walk and mid-declaration continues exactly; pause freezes the walker', () => {
    const tickUntil = (G, pred, max = 200000) => {
      for (let i = 0; i < max && !pred(); i++) {
        const ph = G.turns.phase; if (G.turns.phaseData && G.turns.phaseData.skippable && ph && !ph.startsWith('AUCTION_')) G.skipPhase();
        const sl = G.devSlot(); if (sl && sl.stage === 'ready') G.devStart();
        G.tick(50);
      }
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
  t('Game: LAND_AUCTION follows LAND_GRANT (Standard; skipped in Beginner); a save taken mid-land-auction resumes exactly', () => {
    const ids = mkGame().turns.phases.map((p) => p.id);
    if (ids.indexOf('LAND_AUCTION') !== ids.indexOf('LAND_GRANT') + 1) return ids.join();
    const tickUntil = (G, pred, max = 20000) => { for (let i = 0; i < max && !pred(); i++) { if (G.turns.phaseData && G.turns.phaseData.skippable) G.skipPhase(); G.tick(50); } return pred(); };
    const b = mkGame(); b.newGame({ seed: 'lab-game', level: 'beginner' });
    if (!tickUntil(b, () => b.turns.phase === 'DEVELOPMENT')) return `beginner stuck in ${b.turns.phase}`;
    if (b.state.landAuction.lastAvg !== null) return 'a land auction ran in Beginner';
    const copy = (G) => { G.snapshotPhase(); const H = mkGame(); H.resume(SaveSystem.deserialize(SaveSystem.serialize(G.state, G.rng))); return H; };
    const same = (A, B) => JSON.stringify(A.state, noSavedAt) === JSON.stringify(B.state, noSavedAt) && A.rng.getState() === B.rng.getState();
    for (const seed of ['la-1', 'la-2', 'la-3', 'la-4', 'la-5']) {
      const g = mkGame(); g.newGame({ seed });
      if (!tickUntil(g, () => g.turns.phase === 'LAND_AUCTION' || g.turns.phase === 'DEVELOPMENT')) return `stuck in ${g.turns.phase}`;
      const la = g.turns.phaseData.landAuction;
      if (g.turns.phase !== 'LAND_AUCTION' || !la || la.done) continue; // 0 colony plots this round (16 %): try another seed
      if (!tickUntil(g, () => la.stage === 'bid' && la.units < 40)) return 'the land auction never reached the bidding';
      g.input.keys.add('ArrowUp'); for (let i = 0; i < 60; i++) g.tick(50); g.input.keys.delete('ArrowUp');
      if (!(g.turns.phaseData.landAuction.bids.p0.price >= la.lot.start)) return `the human could not bid: ${JSON.stringify(la.bids.p0)}`;
      const h = copy(g);
      if (h.turns.phase !== 'LAND_AUCTION' || !same(g, h)) return 'not resumed in the land auction';
      for (const G of [g, h]) tickUntil(G, () => G.turns.phase === 'DEVELOPMENT');
      return same(g, h) ? audited(g.state) : 'the land auction diverged after resuming';
    }
    return 'no seed with a land auction in round 1';
  });

  /* ---------- audio (no AudioContext: only the decisions about what plays) ---------- */
  /** Stand-in for AudioManager that records every call. */
  const audioSpy = () => {
    const log = [];
    return { log, play: (k) => log.push(k), music: (id) => log.push(`music:${id}`), stopMusic: () => log.push('music:-'), hold: (on) => log.push(`hold:${on}`), soundChanged: () => log.push('sound'), unlock() {} };
  };
  t('Audio: music only where the original had it (title/setup, production-status-report, game over); none in land, development, auctions', () => {
    const tf = (mode, phase = null, extra = {}) => AudioManager.trackFor({ mode, phase, ...extra });
    const want = [
      [tf('title'), 'title'], [tf('setup'), 'title'], [tf('test'), null], [tf('loading'), null],
      [tf('play', 'PRODUCTION'), 'status'], [tf('play', 'STATUS'), 'status'], [tf('play', 'TURN_REPORT'), 'status'],
      [tf('play', 'AUTOSAVE'), 'status'], [tf('play', 'PLANET_EVENT_AFTER', { card: false }), 'status'], [tf('play', 'PLANET_EVENT_AFTER', { card: true }), null],
      [tf('play', 'LAND_GRANT'), null], [tf('play', 'LAND_AUCTION'), null], [tf('play', 'DEVELOPMENT'), null], [tf('play', 'AUCTION_food'), null], [tf('play', 'TURN_START'), null],
      [tf('play', null, { gameOver: true, survives: true }), 'end_success'], [tf('play', null, { gameOver: true, survives: false }), 'end_failure']
    ];
    const bad = want.map(([got, exp], i) => (got === exp ? null : `#${i} ${got}!=${exp}`)).filter(Boolean);
    return bad.length ? bad.join(', ') : true;
  });
  t('Audio: every planetary event has its own effect; personal events sound good or bad by their quality', () => {
    const planet = Object.values(EVENT_DEFS).filter((d) => d.scope === 'planet');
    const miss = planet.filter((d) => !AudioManager.FX[AudioManager.eventFx(d.id)]).map((d) => d.id);
    if (miss.length) return `no effect for ${miss}`;
    if (new Set(planet.map((d) => AudioManager.eventFx(d.id))).size !== planet.length) return 'two planetary events share an effect';
    if (AudioManager.eventFx('landing') !== 'ship_land') return 'landing';
    const ind = Object.values(EVENT_DEFS).filter((d) => d.scope === 'individual');
    const wrong = ind.filter((d) => AudioManager.eventFx(d.id) !== (d.quality > 0 ? 'event_good' : 'event_bad')).map((d) => d.id);
    return wrong.length ? `personal ${wrong}` : true;
  });
  t('Audio: never throws without an AudioContext; switching the sound off stops the music at once and on resumes it', () => {
    const settings = { sound: true }; const a = new AudioManager({ settings });
    AudioManager.KINDS.forEach((k) => a.play(k)); AudioManager.TRACKS.forEach((id) => a.music(id)); a.hold(true); a.hold(false); a.play('nope'); a.music('nope');
    a.stopMusic(); if (a.timer) return 'stopMusic left the scheduler running';
    a.wanted = 'status'; a.playing = 'status'; settings.sound = false; a.soundChanged();
    if (a.playing !== null || a.wanted !== 'status') return `off: playing ${a.playing}, wanted ${a.wanted}`;
    a.stopMusic();
    const g = mkGame(); const spy = audioSpy(); g.audio = spy; const before = g.settings.sound;
    g.toggleSound(); g.toggleSound();
    return g.settings.sound === before && spy.log.join() === 'sound,sound' ? true : `toggle log ${spy.log}`;
  });
  t('Audio: the game asks for the phase music and holds it while paused', () => {
    const g = mkGame(); const spy = audioSpy(); g.audio = spy;
    g.mode = 'title'; g.syncMusic(); g.syncMusic();
    if (spy.log.filter((x) => x.startsWith('music:')).join() !== 'music:title') return `title: ${spy.log}`;
    g.newGame({ seed: 'music-1' }); spy.log.length = 0; g.syncMusic();
    if (!spy.log.includes('music:-')) return `no music at the landing: ${spy.log}`;
    g.paused = true; spy.log.length = 0; g.syncMusic();
    if (!spy.log.includes('hold:true')) return `pause did not hold the music: ${spy.log}`;
    g.paused = false; spy.log.length = 0; g.syncMusic();
    return spy.log.includes('hold:false') ? true : `unpause: ${spy.log}`;
  });
  t('Audio: the walk warns once when ~10 % of the time is left, then "time up"; turn start and land cursor ticks sound', () => {
    const g = mkGame(); const spy = audioSpy(); g.audio = spy; g.newGame({ seed: 'ready-1' });
    let guard = 0; let ticks = 0;
    while (guard++ < 200000 && !(g.turns.phase === 'DEVELOPMENT' && g.devSlot() && g.devSlot().pid === 'p0')) {
      if (g.turns.phase === 'LAND_GRANT') ticks += 1;
      if (g.turns.phaseData.skippable) g.skipPhase(); g.tick(50);
    }
    if (!ticks || !spy.log.includes('cursor_tick')) return 'no cursor ticks during the land grant';
    if (!spy.log.includes('claim')) return 'no claim sound';
    spy.log.length = 0; g.devStart();
    const w = g.humanWalk(); let warnedAt = null;
    while (g.humanWalk()) { g.tick(50); if (warnedAt === null && spy.log.includes('time_warning')) warnedAt = w.timeLeft / w.timeTotal; }
    const n = (k) => spy.log.filter((x) => x === k).length;
    if (n('turn_start') !== 1) return `turn_start x${n('turn_start')}`;
    if (n('time_warning') !== 1) return `time_warning x${n('time_warning')}`;
    if (!(warnedAt > 0.08 && warnedAt <= 0.1)) return `warned at ${warnedAt}`;
    return n('time_up') === 1 ? true : `time_up x${n('time_up')}`;
  });
  t('Game: a full 12-turn autopilot game ends; the same seed gives the same game; ledger, RUCs and result consistent', () => {
    const play = (seed) => { const g = mkGame(); g.autopilot = true; g.newGame({ seed, level: 'standard' }); for (let n = 0; n < 400000 && g.state.phase !== 'GAME_OVER'; n++) g.tick(50); return g; };
    const a = play('full-1'); const b = play('full-1');
    if (a.state.phase !== 'GAME_OVER') return `stuck in ${a.state.phase}, turn ${a.state.turn}`;
    const key = (g) => JSON.stringify({ f: g.state.final, h: g.state.history, p: g.state.plots, r: g.rng.getState(), l: g.state.auctionLog });
    if (key(a) !== key(b)) return 'the same seed gave a different game';
    if (a.state.history.length !== 12) return `history ${a.state.history.length}`;
    const f = a.state.final;
    if (f.rank.length !== 4 || f.rating !== ScoringSystem.rating(f.combined) || (f.rating >= 3 ? !f.winnerId : f.winnerId !== null)) return JSON.stringify(f);
    const trades = a.state.auctionLog.reduce((s, x) => s + x.volume, 0);
    console.log(`SELFTEST full game full-1: colony ${f.combined} cr (${f.survives ? 'success' : 'failure'}), ${trades} units traded, RUCs made ${a.state.rucs.made}, lost ${a.state.rucs.lost}`);
    return audited(a.state);
  });

  /* ---------- Batch 8: Tournament (crystite, assay office, collusion) ---------- */
  const T_LVL = 'tournament';
  /** Manhattan distance between two plot ids on the 9 x 5 map. */
  const plotDist = (a, b) => Math.abs(a % CONFIG.COLS - b % CONFIG.COLS) + Math.abs(Math.floor(a / CONFIG.COLS) - Math.floor(b / CONFIG.COLS));
  const noMining = (id) => id % CONFIG.COLS === CONFIG.RIVER_COL;
  t('Tournament: [Atari code] enabled, 12 rounds, cursor 3 BTU, ATU 25, computers $1200 (humans by species), variation amplitude 2 (+-4)', () => {
    if (CONFIG.LEVELS.tournament.disabled) return 'Torneig still disabled';
    const r = levelRules({ level: T_LVL });
    if (r.rounds !== 12 || r.cursorFrames !== 12 || r.auctionAtu !== 25 || !r.crystite || !r.collusion) return JSON.stringify(r);
    const { state } = GameState.create({ seed: 'tour', level: T_LVL, species: 'flapper' });
    if (state.level !== T_LVL) return `level ${state.level}`;
    if (state.players[0].cash !== 1600 || state.players.slice(1).some((p) => p.cash !== 1200)) return `cash ${state.players.map((p) => p.cash)}`;
    if (state.store.stock.crystite !== 0 || state.players.some((p) => p.inventory.crystite !== 0)) return 'crystite stocks';
    if (fresh('std').state.players[1].cash !== 1000) return 'Standard computers changed';
    const rng = new SeededRNG('tvar'); const n = 40000; const k = {};
    for (let i = 0; i < n; i++) { const v = ProductionSystem.variation(state, rng); k[v] = (k[v] || 0) + 1; }
    if (Object.keys(k).some((v) => Math.abs(v) > 4)) return `beyond +-4: ${Object.keys(k)}`;
    const pct = (v) => 100 * (k[v] || 0) / n;
    return Math.abs(pct(0) - 37.7) < 1.5 && Math.abs(pct(1) - 24.3) < 1.5 && Math.abs(pct(-2) - 6.2) < 1 ? audited(state) : `shares ${JSON.stringify(k)}`;
  });
  t('Tournament: [Atari code] colony land auctions 0..5 per round: 31.1 / 37.7 / 24.3 / 6.2 / 0.6 % (Standard keeps 0..3)', () => {
    const { state } = fresh('tla', T_LVL); const rng = new SeededRNG('tla'); const n = 20000; const k = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < n; i++) k[LandAuction.colonyCount(state, rng)] += 1;
    const pct = k.map((x) => 100 * x / n);
    if (Math.abs(pct[0] - 31.1) > 1.5 || Math.abs(pct[1] - 37.7) > 1.5 || Math.abs(pct[2] - 24.3) > 1.5 || Math.abs(pct[3] - 6.2) > 1) return pct.map((x) => x.toFixed(1)).join('/');
    const s = fresh('sla').state; const r2 = new SeededRNG('sla');
    for (let i = 0; i < 3000; i++) if (LandAuction.colonyCount(s, r2) > 3) return 'Standard above 3';
    return true;
  });
  t('Crystite deposits: [Atari code] 3 HIGH seeds on distinct plots, diamond 3 - distance (higher wins), river and town -1 (Tournament only)', () => {
    for (let i = 0; i < 40; i++) {
      const { state } = fresh(`dep${i}`, T_LVL); const d = state.crystite;
      if (!d || d.seeds.length !== 3 || new Set(d.seeds).size !== 3) return `seeds ${d && d.seeds}`;
      for (const p of state.plots) {
        const want = noMining(p.id) ? -1 : Math.max(0, ...d.seeds.map((s) => 3 - plotDist(s, p.id)));
        if (p.hiddenDeposit !== want) return `seed set ${d.seeds}: plot ${p.id} has ${p.hiddenDeposit}, expected ${want}`;
      }
    }
    if (JSON.stringify(fresh('same', T_LVL).state.plots) !== JSON.stringify(fresh('same', T_LVL).state.plots)) return 'not seeded';
    const s = fresh('dep-std').state;
    return s.crystite === null && s.plots.every((p) => p.hiddenDeposit === null) ? true : 'Standard got crystite deposits';
  });
  t('Crystite: enabled only in Tournament (resources, auctions $4 steps, outfit $100); Standard and Beginner stay without it', () => {
    const ids = (st) => enabledResources(st).map((d) => d.id).join();
    if (ids(fresh('a').state) !== 'food,energy,smithore' || ids(fresh('b', 'beginner').state) !== 'food,energy,smithore' || ids(null) !== 'food,energy,smithore') return 'crystite leaked';
    const ts = fresh('c', T_LVL).state;
    if (ids(ts) !== 'food,energy,smithore,crystite') return ids(ts);
    if (auctionResources(ts).map((d) => d.id).join() !== 'smithore,crystite,food,energy') return auctionResources(ts).map((d) => d.id).join();
    const m = AuctionEngine.fungibleMarket(RESOURCE_DEFS.crystite);
    return m.step === 4 && CONFIG.MODULE_COST.crystite === 100 && RESOURCE_DEFS.crystite.basePrice === 100 ? true : `step ${m.step}, outfit ${CONFIG.MODULE_COST.crystite}`;
  });
  t('Crystite production: [Atari code] deposit level + adjacency + learning curve + variation, needs 1 energy, none in the river, spoils above 50', () => {
    const { state, rng } = fresh('cprod', T_LVL); state.turn = 3;
    const a = develop(state, 'p1', 0, 'crystite'); const b = develop(state, 'p1', 1, 'crystite'); const c = develop(state, 'p1', 18, 'crystite');
    a.hiddenDeposit = 2; b.hiddenDeposit = 0; c.hiddenDeposit = 3;
    // a: 2 + adjacency 1 + learning 1 (3 crystite plots) = 4; b (NONE): 0 + 1 + 1 = 2.
    if (ProductionSystem.meanYield(state, a) !== 4 || ProductionSystem.meanYield(state, b) !== 2 || ProductionSystem.meanYield(state, c) !== 4) return `means ${[a, b, c].map((q) => ProductionSystem.meanYield(state, q))}`;
    const river = develop(state, 'p2', 13, 'crystite');
    if (ProductionSystem.meanYield(state, river) !== 0 || ProductionSystem.rollYield(state, river, rng) !== 0) return 'river produced crystite';
    setInv(state, 'p1', 'energy', 0); setInv(state, 'p1', 'crystite', 53);
    const st = SettlementSystem.run(state, rng); const row = st.rows.find((x) => x.playerId === 'p1');
    if (row.produced.crystite !== 0 || row.stopped !== 3) return `unpowered crystite produced ${row.produced.crystite}`;
    if (row.spoiled.crystite !== 3 || row.final.crystite !== 50) return `spoilage ${row.spoiled.crystite}, final ${row.final.crystite}`;
    return audited(state);
  });
  t('Crystite store: [Atari code] P = 50 + rand(0..99) each round; buys at P rounded down to $4, sells at that + 140; Standard untouched', () => {
    const { state, rng } = fresh('cprice', T_LVL); const d = RESOURCE_DEFS.crystite; const seen = new Set();
    if (StoreSystem.bid(state, d) !== 100 || StoreSystem.ask(state, d) !== 240) return `round 1 ${StoreSystem.bid(state, d)}/${StoreSystem.ask(state, d)}`;
    for (let i = 0; i < 600; i++) {
      state.turn = 1 + (i % 11); StoreSystem.updatePrices(state, rng); const P = state.storePrice.crystite; seen.add(P);
      if (P < 50 || P > 149) return `P ${P}`;
      if (StoreSystem.bid(state, d) !== P - P % 4 || StoreSystem.ask(state, d) !== P - P % 4 + 140) return `P ${P}: ${StoreSystem.bid(state, d)}/${StoreSystem.ask(state, d)}`;
      // The auction's market must draw the same store lines (on the $4 grid, so the markers can meet them).
      const m = AuctionEngine.fungibleMarket(d);
      if (StoreSystem.bid(state, m) !== StoreSystem.bid(state, d) || StoreSystem.ask(state, m) % 4) return `market lines ${StoreSystem.bid(state, m)}/${StoreSystem.ask(state, m)}`;
    }
    if (!seen.has(50) || !seen.has(149) || seen.size < 95) return `draws ${seen.size}`;
    const s = fresh('cprice-std'); s.state.turn = 2; StoreSystem.updatePrices(s.state, s.rng);
    return s.state.storePrice.crystite === 100 ? true : 'Standard crystite price moved';
  });
  t('Crystite score: [Atari code] crystite valued at the store price P; a crystite plot = 500 + 100 outfit + 35', () => {
    const { state } = fresh('cscore', T_LVL); develop(state, 'p0', 0, 'crystite'); setInv(state, 'p0', 'crystite', 3); state.storePrice.crystite = 120;
    const b = ScoringSystem.breakdown(state, state.players[0]);
    const goods = 4 * state.storePrice.food + 2 * state.storePrice.energy + 3 * 120;
    return b.inventory === goods && b.plots === 500 && b.modules === 100 && b.rucs === 35 ? true : JSON.stringify(b);
  });
  t('Crystite auction: [Atari code] after smithore, only when someone holds crystite; the store buys and then ships it all off planet', () => {
    const ph = (lvl) => { const g = mkGame(); g.newGame({ seed: 'cauc', level: lvl }); return g.turns.phases.map((p) => p.id).filter((id) => id.startsWith('AUCTION_')).join(); };
    if (ph(T_LVL) !== 'AUCTION_smithore,AUCTION_crystite,AUCTION_food,AUCTION_energy') return ph(T_LVL);
    if (ph('standard') !== 'AUCTION_smithore,AUCTION_food,AUCTION_energy') return `standard ${ph('standard')}`;
    const tick = (G, pred, max = 60000) => { for (let i = 0; i < max && !pred(); i++) { const p = G.turns.phase; if (G.turns.phaseData.skippable && p && !p.startsWith('AUCTION_')) G.skipPhase(); G.tick(50); } return pred(); };
    const g = mkGame(); g.autopilot = true; g.newGame({ seed: 'cauc', level: T_LVL });
    if (!tick(g, () => g.turns.phase === 'AUCTION_food')) return `stuck in ${g.turns.phase}`;
    if (g.state.auctionLog.some((x) => x.res === 'crystite')) return 'a crystite auction ran with no crystite anywhere';
    if (!tick(g, () => g.turns.phase === 'AUCTION_smithore')) return `round 2 stuck in ${g.turns.phase}`;
    // [Atari code] with P < 100 a computer sells only what it needs to reach $1000 (or the excess over 50): give it a reason to sell.
    setInv(g.state, 'p1', 'crystite', 6); setCash(g.state, 'p1', 100);
    if (!tick(g, () => g.turns.phase === 'AUCTION_crystite' && !!g.rt.auction && g.rt.auction.res === 'crystite')) return 'no crystite auction';
    const e = g.rt.auction.engine;
    if (e.entry('p1').role !== ROLE.SELLER && !tick(g, () => e.entry('p1').role === ROLE.SELLER, 200)) return `p1 role ${e.entry('p1').role}`;
    if (!tick(g, () => g.turns.phase === 'AUCTION_food')) return 'crystite auction never ended';
    const log = g.state.auctionLog.filter((x) => x.res === 'crystite');
    if (log.length !== 1 || !(log[0].volume > 0)) return `log ${JSON.stringify(log)}`;
    return g.state.store.stock.crystite === 0 ? audited(g.state) : `store kept ${g.state.store.stock.crystite} crystite`;
  });
  t('Town (Tournament): the crystite shop and the assay office open; outfitting a RUC for crystite costs $100', () => {
    const { state } = fresh('ctown', T_LVL); const std = fresh('ctown').state;
    const kinds = (st) => ['shop_crystite', 'assay'].map((id) => DevWalk.kind(st, TOWN.buildings.find((b) => b.id === id))).join();
    if (kinds(std) !== 'closed,closed') return `Standard ${kinds(std)}`;
    if (kinds(state) !== 'shop,assay') return `Tournament ${kinds(state)}`;
    const w = DevWalk.create(state, 'p0', 60000); const cash = state.players[0].cash; const ruc = StoreSystem.rucPrice(state);
    visit(state, w, 'corral'); const log = visit(state, w, 'shop_crystite');
    if (log.join() !== 'outfit' || !w.carrying || w.carrying.module !== 'crystite') return `outfit ${log} ${JSON.stringify(w.carrying)}`;
    return state.players[0].cash === cash - ruc - 100 ? audited(state, 1) : `paid ${cash - state.players[0].cash}`;
  });
  t('Assay office (human): [Atari code] the C64 procedure and messages; a river sample reads "No" (fix); level 4 reads "Molt"; results remembered', () => {
    const { state } = fresh('assay', T_LVL); const w = DevWalk.create(state, 'p0', 120000);
    const say = () => w.msg;
    visit(state, w, 'assay'); if (say() !== 'Agafa una mostra del sòl i torna.') return `request: ${say()}`;
    visit(state, w, 'assay'); if (say() !== 'Cal una mostra.') return `no sample: ${say()}`;
    leaveSouth(state, w); // plot 31: river
    if (DevWalk.act(state, w) !== 'sample' || say() !== 'Mostra a punt: torna a l\'oficina.') return `sample: ${say()}`;
    standOn(state, w, 30); if (DevWalk.act(state, w) !== 'one_plot' || say() !== 'Una parcel·la per viatge.') return `2nd plot: ${say()}`;
    standOn(state, w, 31); goUntil(state, w, { x: 0, y: -1 }, () => w.area === 'town');
    visit(state, w, 'assay'); if (say() !== 'Gens de crystite a la parcel·la #32.') return `river result: ${say()}`;
    state.plots[30].hiddenDeposit = 4; visit(state, w, 'assay'); leaveSouth(state, w); standOn(state, w, 30); DevWalk.act(state, w);
    standOn(state, w, 31); goUntil(state, w, { x: 0, y: -1 }, () => w.area === 'town');
    visit(state, w, 'assay'); if (say() !== 'Molt crystite a la parcel·la #31.') return `meteorite plot: ${say()}`;
    if (JSON.stringify(state.crystite.assays) !== JSON.stringify([{ pid: 'p0', plotId: 31, level: 0, turn: 0 }, { pid: 'p0', plotId: 30, level: 3, turn: 0 }])) return JSON.stringify(state.crystite.assays);
    if (['Gens', 'Poc', 'Mitjà', 'Molt'].join() !== CrystiteSystem.LEVEL_NAMES.join()) return 'level names';
    return state.plots[30].hiddenDeposit === 4 ? audited(state) : 'the true level was changed';
  });
  t('Assay office (computer): [Atari code] 10 + 4 x store distance PTU each, stops under 22 PTU or with 3 HIGH known, skips river and known plots', () => {
    for (let i = 0; i < 20; i++) {
      const { state, rng } = fresh(`aia${i}`, T_LVL); state.turn = 2; const p = state.players[1];
      const clock = { units: 101 }; const done = CrystiteSystem.aiAssay(state, rng, p, clock);
      const known = state.crystite.known;
      let units = 101;
      for (const id of done) {
        if (units < 22) return 'assayed with fewer than 22 PTU';
        if (noMining(id)) return `assayed river/town ${id}`;
        if (known[id] !== state.plots[id].hiddenDeposit) return `plot ${id} known ${known[id]}`;
        units -= 10 + 4 * AISystem.storeDist(state.plots[id]);
      }
      if (new Set(done).size !== done.length) return 'assayed a plot twice';
      if (units !== clock.units) return `units ${clock.units}, expected ${units}`;
      const highs = known.filter((v) => v >= 3).length;
      if (clock.units >= 22 && highs < 3 && done.length < 36) return `stopped early: ${clock.units} PTU, ${highs} high`;
    }
    const { state, rng } = fresh('aia-high', T_LVL); [0, 1, 2].forEach((id) => { state.crystite.known[id] = 3; });
    const clock = { units: 101 };
    if (CrystiteSystem.aiAssay(state, rng, state.players[2], clock).length || clock.units !== 101) return 'assayed with 3 HIGH known';
    CrystiteSystem.learn(state, 20, 3);
    if (CrystiteSystem.deduced(state, 21) !== 2 || CrystiteSystem.deduced(state, 38) !== 1) return `deduced ${CrystiteSystem.deduced(state, 21)}/${CrystiteSystem.deduced(state, 38)}`;
    const s = fresh('aia-std'); s.state.turn = 2;
    return AISystem.turn(s.state, s.rng, s.state.players[1]).assays.length === 0 ? true : 'a Standard computer assayed';
  });
  t('Tournament events: [Atari code] pirates take all players\' crystite and this round\'s crystite (smithore and store untouched); meteorite text', () => {
    const { state, rng } = fresh('tpir', T_LVL); state.turn = 5;
    const plot = develop(state, 'p2', 0, 'crystite'); plot.hiddenDeposit = 3; setInv(state, 'p2', 'energy', 3);
    setInv(state, 'p1', 'crystite', 7); setInv(state, 'p1', 'smithore', 4);
    SettlementSystem.run(state, rng);
    const made = state.settlement.rows.find((x) => x.playerId === 'p2').produced.crystite;
    const rec = EventSystem.build(state, rng, 'pirates', null);
    if (state.players.some((p) => p.inventory.crystite)) return 'crystite left';
    if (state.players[1].inventory.smithore !== 4 || state.store.stock.smithore !== 8) return 'smithore taken in Tournament';
    const row = state.settlement.rows.find((x) => x.playerId === 'p2');
    if (row.produced.crystite !== 0 || row.final.crystite !== 0 || (made > 0 && row.items[0].zeroed !== 'pirates')) return 'production not zeroed';
    if (rec.params.amount !== 7 + made || !rec.text.includes('crystite')) return rec.text;
    const m = EventSystem.build(state, rng, 'meteorite', null);
    if (!m.text.includes('El meteorit crea un nou jaciment de crystite.')) return m.text;
    if (state.crystite.known[m.params.plot - 1] !== 4) return 'meteorite not known to the computers';
    const s = fresh('spir'); const ms = EventSystem.build(s.state, s.rng, 'meteorite', null);
    return ms.text.includes('crystite') ? `Standard text: ${ms.text}` : audited(state);
  });
  t('Tournament AI: [Atari code] buys the store out, holds back small surpluses, trades crystite by its price rules; Standard unchanged', () => {
    const mk = (lvl, res) => {
      const { state, rng } = fresh(`tai-${lvl}`, lvl); state.turn = 3;
      return { state, rng, e: engineFor(state, rng, res, state.players.map((p) => p.id), true, true) };
    };
    // Buy the store out: food auction, only buyers, store 10 units <= 20, the computer needs less than that.
    let { state, rng, e } = mk(T_LVL, 'food'); const p = state.players[1];
    setInv(state, 'p1', 'food', 1); setCash(state, 'p1', 5000); setInv(state, 'store', 'food', 10);
    let d = AISystem.decide(state, rng, p, e, {});
    if (d.role !== ROLE.BUYER || d.limit !== 11) return `buy out: ${JSON.stringify(d)}`;
    ({ state, rng, e } = mk('standard', 'food'));
    setInv(state, 'p1', 'food', 1); setCash(state, 'p1', 5000); setInv(state, 'store', 'food', 10);
    d = AISystem.decide(state, rng, state.players[1], e, {});
    if (d.limit === 11) return 'Standard bought the store out';
    // Small surplus: sells only rand(0..surplus).
    ({ state, rng, e } = mk(T_LVL, 'food')); setCash(state, 'p1', 3000);
    const reserve = AISystem.reserve(state, state.players[1], 'food'); setInv(state, 'p1', 'food', reserve + 3);
    const limits = new Set();
    for (let i = 0; i < 60; i++) { const dd = AISystem.decide(state, rng, state.players[1], e, {}); if (dd.role !== ROLE.SELLER) return `surplus role ${dd.role}`; limits.add(dd.limit); }
    if ([...limits].some((l) => l < reserve || l > reserve + 3) || limits.size < 3) return `limits ${[...limits]}`;
    const brain = {}; const first = AISystem.decide(state, rng, state.players[1], e, brain).limit;
    for (let i = 0; i < 10; i++) if (AISystem.decide(state, rng, state.players[1], e, brain).limit !== first) return 'the held-back amount is re-drawn every decision';
    // Crystite.
    ({ state, rng, e } = mk(T_LVL, 'crystite')); const c = state.players[2];
    const cd = (inv, cash, P) => { setInv(state, 'p2', 'crystite', inv); setCash(state, 'p2', cash); state.storePrice.crystite = P; return AISystem.decide(state, rng, c, e, {}); };
    const chk = [[cd(60, 2000, 90), ROLE.SELLER, 50], [cd(8, 500, 90), ROLE.SELLER, 2], [cd(8, 500, 120), ROLE.SELLER, 0], [cd(0, 2000, 80), ROLE.BUYER, 15], [cd(0, 2000, 90), ROLE.OUT, null], [cd(0, 1000, 80), ROLE.OUT, null], [cd(0, 9000, 40), ROLE.BUYER, 25]];
    const bad = chk.map(([dd, role, limit], i) => (dd.role === role && dd.limit === limit ? null : `#${i} ${dd.role}/${dd.limit}`)).filter(Boolean);
    return bad.length ? bad.join(', ') : true;
  });
  t('Tournament AI: rates known crystite (land, development) and learns it from assays, crystite RUCs and meteorites', () => {
    // Round 1 (no situation bonus) with plenty of food: the known HIGH crystite (quality (100 + 4) / 8 = 13, x 3) beats food / energy.
    const { state, rng } = fresh('taik', T_LVL); state.turn = 1; const p = state.players[1]; setInv(state, 'store', 'food', 200);
    const plot = state.plots.find((q) => !noMining(q.id) && q.terrain === TERRAIN.PLAIN);
    const q = AISystem.goodsQuality(state, 3);
    const before = AISystem.landRating(state, p, plot, q); CrystiteSystem.learn(state, plot.id, 3);
    if (!(AISystem.landRating(state, p, plot, q) > before)) return 'known crystite does not raise the plot rating';
    LandGrantSystem.assign(state, 'p1', plot.id); setCash(state, 'p1', 5000); setInv(state, 'p1', 'food', 20); setInv(state, 'p1', 'energy', 20);
    const acts = AISystem.develop(state, rng, p);
    if (!acts.some((a) => a.plotId === plot.id && a.module === 'crystite')) return `installs ${JSON.stringify(acts)}`;
    const other = develop(state, 'p3', 44, 'crystite'); other.hiddenDeposit = 2;
    CrystiteSystem.learnFromMules(state);
    return state.crystite.known[44] === 2 ? audited(state) : 'did not learn from a crystite RUC';
  });
  t('Collusion: [Atari code] Tournament goods auctions; >= 2 humans press within 10 jiffies incl. a buyer and a seller; only they trade, store out', () => {
    const C = CONFIG.AUCTION.collusion;
    const setup = (lvl, roles = { p0: ROLE.BUYER, p1: ROLE.SELLER }) => {
      const { state, rng } = fresh(`col-${lvl}`, lvl); state.players[1].isHuman = true;
      setInv(state, 'p1', 'food', 10); setInv(state, 'p2', 'food', 10);
      const e = engineFor(state, rng, 'food', ['p0', 'p1', 'p2', 'p3'], true, false);
      Object.entries(Object.assign({ p2: ROLE.SELLER, p3: ROLE.BUYER }, roles)).forEach(([id, role]) => e.setRole(id, role));
      runEngine(e, 20);
      return { state, e };
    };
    let { state, e } = setup('standard'); e.collusionPress('p0'); e.collusionPress('p1');
    if (e.collusion) return 'collusion in Standard';
    ({ state, e } = setup(T_LVL, { p0: ROLE.BUYER, p1: ROLE.BUYER }));
    e.collusionPress('p0'); e.collusionPress('p1'); if (e.collusion) return 'two buyers colluded';
    ({ state, e } = setup(T_LVL));
    if (e.collusionPress('p2')) return 'a computer pressed';
    e.collusionPress('p0'); runEngine(e, fms(C.windowFrames) + 30); e.collusionPress('p1');
    if (e.collusion) return 'presses more than 10 jiffies apart colluded';
    runEngine(e, fms(C.cooldownFrames)); e.setPrice('p3', 45);
    e.collusionPress('p0'); runEngine(e, 50); e.collusionPress('p1');
    if (!e.collusion || e.collusion.stage !== 'flash' || e.collusion.members.join() !== 'p0,p1') return `no collusion: ${JSON.stringify(e.collusion)}`;
    const main = e.units; const p2Price = e.entry('p2').price; const stock = state.store.stock.food;
    runEngine(e, fms(C.flashFrames) - 30);
    if (e.collusion.stage !== 'flash' || e.units !== main) return 'the main timer ran during the flash';
    runEngine(e, 60);
    if (e.collusion.stage !== 'active') return `stage ${e.collusion.stage}`;
    e.setPrice('p2', 20); if (e.entry('p2').price !== p2Price) return 'a frozen colonist moved its marker';
    e.setPrice('p0', 55); runEngine(e, 4000);
    if (!e.volume || e.trades.some((x) => x.buyer !== 'p0' || x.seller !== 'p1')) return `trades ${JSON.stringify(e.trades)}`;
    if (state.store.stock.food !== stock || state.players[2].inventory.food !== 10) return 'the store or a frozen colonist traded';
    if (e.units !== main) return 'the main timer ran during the collusion';
    e.setPrice('p0', 15); e.setPrice('p1', 200);
    for (let k = 0; k < 20000 && e.collusion; k++) e.update(10);
    return e.collusion === null && e.units === main ? audited(state) : `not over: ${JSON.stringify(e.collusion)}, units ${e.units}/${main}`;
  });
  t('Collusion: [Atari code] separate 50-unit timer; "La col·lusió s\'ha acabat", main timer restored, repeatable; survives a snapshot', () => {
    const C = CONFIG.AUCTION.collusion;
    const { state, rng } = fresh('col2', T_LVL); state.players[1].isHuman = true; setInv(state, 'p1', 'food', 10);
    const e = engineFor(state, rng, 'food', ['p0', 'p1'], true, false);
    e.setRole('p0', ROLE.BUYER); e.setRole('p1', ROLE.SELLER); runEngine(e, 20);
    const go2 = () => { e.collusionPress('p0'); e.collusionPress('p1'); };
    go2(); const main = e.units;
    runEngine(e, fms(C.flashFrames) + 10);
    if (e.collusion.stage !== 'active' || e.collusion.unitsTotal !== C.units || !(e.collusion.units > C.units - 1 && e.collusion.units < C.units)) return JSON.stringify(e.collusion);
    const snap = AuctionEngine.restore(e.snapshot(), { market: e.market, state, rng });
    if (JSON.stringify(snap.collusion) !== JSON.stringify(e.collusion)) return 'snapshot lost the collusion';
    let ms = 0; while (e.collusion && e.collusion.stage === 'active' && ms < 60000) { e.update(10); ms += 10; }
    const want = 50 * e.timing.idle;
    if (Math.abs(ms - want) > 40) return `collusion lasted ${ms} ms, expected ~${Math.round(want)}`;
    if (!e.collusion || e.collusion.stage !== 'over' || AUCTION_NOTICES.collusion_over !== 'La col·lusió s\'ha acabat') return `end ${JSON.stringify(e.collusion)}`;
    let over = 0; while (e.collusion && over < 5000) { e.update(10); over += 10; }
    if (Math.abs(over - fms(C.overFrames)) > 20) return `"over" shown ${over} ms`;
    if (e.collusion !== null || e.units !== main) return `restore: ${JSON.stringify(e.collusion)} units ${e.units}/${main}`;
    runEngine(e, fms(C.cooldownFrames)); go2();
    return e.collusion && e.collusion.stage === 'flash' ? audited(state) : 'not repeatable';
  });
  t('Save: schema 8 keeps the Tournament state (deposits, known crystite, assays) exactly', () => {
    const { state, rng } = fresh('tsave', T_LVL); CrystiteSystem.learn(state, 3, 2); state.crystite.assays.push({ pid: 'p0', plotId: 3, level: 2, turn: 1 });
    const back = SaveSystem.deserialize(SaveSystem.serialize(state, rng));
    return !back.incompatible && JSON.stringify(back.state) === JSON.stringify(state) ? true : 'round trip';
  });
  t('Game: a full 12-turn Tournament autopilot game ends; the same seed gives the same game; crystite mined and traded; ledger, RUCs consistent', () => {
    const play = (seed) => { const g = mkGame(); g.autopilot = true; g.newGame({ seed, level: T_LVL }); for (let n = 0; n < 400000 && g.state.phase !== 'GAME_OVER'; n++) g.tick(50); return g; };
    const a = play('tour-1'); const b = play('tour-1');
    if (a.state.phase !== 'GAME_OVER') return `stuck in ${a.state.phase}, turn ${a.state.turn}`;
    const key = (g) => JSON.stringify({ f: g.state.final, h: g.state.history, p: g.state.plots, r: g.rng.getState(), l: g.state.auctionLog, c: g.state.crystite });
    if (key(a) !== key(b)) return 'the same seed gave a different game';
    if (a.state.history.length !== 12) return `history ${a.state.history.length}`;
    const f = a.state.final; const log = a.state.auctionLog;
    const trades = log.reduce((s, x) => s + x.volume, 0); const cry = log.filter((x) => x.res === 'crystite').reduce((s, x) => s + x.volume, 0);
    const mules = a.state.plots.filter((q) => q.ruc && q.ruc.module === 'crystite').length;
    console.log(`SELFTEST full game tournament tour-1: colony ${f.combined} cr (${f.survives ? 'success' : 'failure'}), ${trades} units traded (crystite ${cry}), crystite RUCs ${mules}, assays known ${a.state.crystite.known.filter((v) => v !== null).length}, RUCs made ${a.state.rucs.made}, lost ${a.state.rucs.lost}`);
    if (!cry || !mules) return `no crystite economy: traded ${cry}, RUCs ${mules}`;
    return audited(a.state);
  });

  /* ---------- Batch 9: 1-4 human players on one machine, computer demo ---------- */
  const two = [{ name: 'Ada', colorId: 'cyan', species: 'flapper' }, { name: 'Bo', colorId: 'coral', species: 'humanoid' }];
  /** A game with these human seats (empty list: the computer demo). */
  const mpGame = (seed, humans = two, level = 'standard') => { const g = mkGame(); g.newGame({ seed, level, humans }); return g; };
  /** Advances a game with several humans: every human presses on the hand-over screens, human turns start and end at once. */
  const drive = (G, pred, max = 200000) => {
    for (let i = 0; i < max && !pred(); i++) {
      const pd = G.turns.phaseData; const ph = G.turns.phase;
      if (pd && pd.wait) G.humanIds().forEach((id) => G.playerButton(id));
      else if (pd && pd.skippable && ph && (!ph.startsWith('AUCTION_') || (G.rt.auction && G.rt.auction.engine.ended))) G.skipPhase();
      else if (ph === 'LAND_AUCTION') G.landNext();
      const sl = G.devSlot(); if (sl && sl.stage === 'ready') G.devStart(); else if (G.humanWalk()) G.devFinish();
      G.tick(50);
    }
    return pred();
  };
  const key = (code, k = code) => ({ code, key: k, repeat: false });
  t('Seats: 2 humans take the first seats (own name, colour, species, keys); the computers fill the rest as Mechtrons; colours stay unique', () => {
    const { state } = GameState.create({ seed: 'seats', humans: [two[0], { name: 'Bo', colorId: 'cyan', species: 'humanoid' }] });
    const ps = state.players;
    const sig = ps.map((p) => `${p.id}:${p.name}:${p.isHuman ? 'H' : 'C'}:${colorIdOf(p.color)}:${p.species}:${p.keys}:${p.shape}`).join(' ');
    if (sig !== 'p0:Ada:H:cyan:flapper:0:circle p1:Bo:H:yellow:humanoid:1:square p2:Bran:C:coral:mechtron:null:triangle p3:Vela:C:violet:mechtron:null:diamond') return sig;
    if (ps[0].cash !== 1600 || ps[1].cash !== 600 || ps[2].aiProfile !== 'conservative') return 'species cash / profile';
    const four = GameState.create({ seed: 'seats', humans: [two[0], two[1], { name: 'C' }, { name: 'D' }] }).state.players;
    if (four.some((p) => !p.isHuman) || four.map((p) => p.keys).join() !== '0,1,2,3' || new Set(four.map((p) => p.color)).size !== 4) return 'four humans';
    const demo = GameState.create({ seed: 'seats', humans: [] }).state.players;
    if (demo.map((p) => `${p.name}${p.isHuman ? 'H' : ''}`).join() !== 'Bran,Vela,Nox,Iris') return demo.map((p) => p.name).join();
    // One human: exactly the state of the classic setup (the determinism lines depend on it).
    const a = GameState.create({ seed: 'one', playerName: 'Roger', colorId: 'cyan', species: 'flapper' }).state;
    const b = GameState.create({ seed: 'one', humans: [{ name: 'Roger', colorId: 'cyan', species: 'flapper' }] }).state;
    return JSON.stringify(a) === JSON.stringify(b) ? true : 'one-human state differs';
  });
  t('Controls: P1 arrows + Enter/Space, P2 W A S D + Q, P3 I J K L + U, P4 keypad 8 4 5 6 (2) + 0', () => {
    const m = (c) => { const x = PlayerControls.match(c); return x ? `${x.seat}${x.action[0]}` : '-'; };
    const got = ['ArrowUp', 'Enter', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyI', 'KeyJ', 'KeyK', 'KeyL', 'KeyU', 'Numpad8', 'Numpad4', 'Numpad5', 'Numpad2', 'Numpad6', 'Numpad0', 'KeyZ'].map(m).join(' ');
    if (got !== '0u 0b 0b 1u 1l 1d 1r 1b 2u 2l 2d 2r 2b 3u 3l 3d 3d 3r 3b -') return got;
    const d = PlayerControls.dirs(new Set(['KeyW', 'KeyD', 'ArrowDown']), 1);
    return d.x === 1 && d.y === -1 ? true : JSON.stringify(d);
  });
  t('Land grant (2 humans): both buttons in the same step -> one claim by the tie rule; the other human claims a later plot', () => {
    const g = mpGame('mp-land');
    if (!drive(g, () => g.turns.phase === 'LAND_GRANT' && g.landRace().cursor >= 0)) return `stuck in ${g.turns.phase}`;
    const land = g.landRace(); const first = land.cursor;
    g.humanClaim(); if (!g.onPlayerKey(key('KeyQ', 'q'))) return 'P2 button not taken';
    if (land.inputs.map((i) => i.pid).join() !== 'p0,p1') return `inputs ${JSON.stringify(land.inputs)}`;
    g.tick(50);
    const s = g.state; const worth = (id) => ScoringSystem.netWorth(s, playerById(s, id));
    const want = worth('p0') !== worth('p1') ? (worth('p0') < worth('p1') ? 'p0' : 'p1') : land.tieOrder.find((id) => id === 'p0' || id === 'p1');
    if (land.claimed[want] !== first || Object.keys(land.claimed).length !== 1) return `claimed ${JSON.stringify(land.claimed)} want ${want}`;
    const other = want === 'p0' ? 'p1' : 'p0';
    if (!drive(g, () => land.cursor >= 0 && LandRace.canClaim(land, other), 4000)) return 'the cursor never came back';
    g.playerButton(other); g.tick(50);
    return land.claimed[other] !== undefined && land.claimed[other] > first ? true : `other ${JSON.stringify(land.claimed)}`;
  });
  t('Auction (2 humans): each moves his own marker with his own keys at the same time; they trade with each other', () => {
    const g = mpGame('mp-auc');
    if (!drive(g, () => g.turns.phase === 'AUCTION_food' && g.rt.auction && g.rt.auction.engine.canDeclare())) return `stuck in ${g.turns.phase}`;
    const e = g.rt.auction.engine; const s = g.state;
    setInv(s, 'p1', 'food', 12); setCash(s, 'p0', 2000);
    g.auctionRole(ROLE.BUYER); g.onPlayerKey(key('KeyW', 'w')); // P1 buyer (arrows / buttons), P2 seller (W = up)
    if (e.entry('p0').role !== ROLE.BUYER || e.entry('p1').role !== ROLE.SELLER) return `roles ${e.entry('p0').role}/${e.entry('p1').role}`;
    if (!drive(g, () => e.stage === 'trade', 2000)) return 'no trade stage';
    const ask = StoreSystem.ask(s, e.market); const bid = StoreSystem.bid(s, e.market); const mid = (ask + bid) / 2;
    const p1Start = e.entry('p1').price; const p0Start = e.entry('p0').price;
    g.input.keys.add('KeyS'); g.input.keys.add('ArrowUp'); g.fastForward(500);
    if (!(e.entry('p1').price < p1Start && e.entry('p0').price > p0Start)) return `both should move: p0 ${p0Start}->${e.entry('p0').price}, p1 ${p1Start}->${e.entry('p1').price}`;
    g.input.keys.delete('ArrowUp');
    for (let i = 0; i < 200 && e.entry('p1').price > mid; i++) g.tick(50);
    g.input.keys.delete('KeyS'); g.input.keys.add('ArrowUp');
    for (let i = 0; i < 400 && !e.trades.some((x) => x.buyer === 'p0' && x.seller === 'p1') && !e.ended; i++) g.tick(50);
    g.input.keys.delete('ArrowUp');
    return e.trades.some((x) => x.buyer === 'p0' && x.seller === 'p1') ? audited(s) : `no human-human trade: ${JSON.stringify(e.trades.slice(0, 3))}`;
  });
  t('Development (2 humans): P1\'s Enter / Space never start or act in P2\'s turn (only P2\'s button or a click does)', () => {
    const g = mpGame('mp-dev');
    if (!drive(g, () => { const sl = g.devSlot(); if (sl && sl.pid === 'p0' && sl.stage === 'ready') { g.devStart(); DevWalk.end(g.state, g.humanWalk(), 'done'); } return !!sl && sl.pid === 'p1' && sl.stage === 'ready'; })) return `no P2 slot (${g.turns.phase})`;
    g.renderer.widgets = [{ id: 'd-start', x: 0, y: 0, w: 10, h: 10, focusable: true, primary: true, onClick: () => g.devStart() }]; g.renderer.focusId = null;
    const pk = (c, k) => Object.assign(key(c, k), { preventDefault() {} }); g.input.onKeyDown(pk('Enter', 'Enter')); g.input.onKeyDown(pk('Space', ' '));
    if (g.devSlot().stage !== 'ready') return 'P1\'s key started P2\'s turn';
    g.onPlayerKey(key('KeyQ', 'q'));
    return g.devSlot().stage === 'walk' ? true : `P2's button: ${g.devSlot().stage}`;
  });
  t('Land auction (2 humans): both bidders raise their own markers with their own keys', () => {
    const g = mpGame('mp-la');
    if (!drive(g, () => g.turns.phase === 'LAND_GRANT')) return 'no land grant';
    const la = LandAuction.create(g.state, g.rng, ['p2', 'p3'], { colony: 1 });
    g.turns.phase = 'LAND_AUCTION'; g.turns.phaseData = { landAuction: la }; g.setScreen('landAuction');
    for (let i = 0; i < 400 && la.stage !== 'bid'; i++) g.tick(50);
    if (la.stage !== 'bid') return `stage ${la.stage}`;
    const a = la.bids.p0.price; const b = la.bids.p1.price;
    g.input.keys.add('ArrowUp'); g.input.keys.add('KeyW'); g.fastForward(1000); g.input.keys.delete('ArrowUp'); g.input.keys.delete('KeyW');
    return la.bids.p0.price > a && la.bids.p1.price > b ? true : `bids ${a}->${la.bids.p0.price}, ${b}->${la.bids.p1.price}`;
  });
  t('Collusion (Tournament, 2 humans): P1 Enter and P2 Q within 10 jiffies, a buyer and a seller -> COL·LUSIÓ', () => {
    const g = mpGame('mp-col', two, 'tournament');
    if (!drive(g, () => g.turns.phase === 'AUCTION_food' && g.rt.auction && g.rt.auction.engine.canDeclare())) return `stuck in ${g.turns.phase}`;
    const e = g.rt.auction.engine;
    g.auctionRole(ROLE.BUYER); g.onPlayerKey(key('KeyW', 'w'));
    if (!drive(g, () => e.stage === 'trade', 2000)) return 'no trade stage';
    g.screens.auction.onKey(g, { key: 'Enter' }); g.onPlayerKey(key('KeyQ', 'q'));
    return e.collusion && e.collusion.members.join() === 'p0,p1' ? true : `collusion ${JSON.stringify(e.collusion)}`;
  });
  t('Development (2 humans): one at a time; the active human starts and walks with his own controls; P1 cannot start P2\'s turn', () => {
    const g = mpGame('mp-dev');
    const p1Ready = () => { const sl = g.devSlot(); return !!sl && sl.pid === 'p1' && sl.stage === 'ready'; };
    for (let i = 0; i < 200000 && !p1Ready(); i++) {
      const pd = g.turns.phaseData; if (pd && pd.skippable) g.skipPhase();
      const sl = g.devSlot(); if (sl && sl.pid === 'p0' && sl.stage === 'ready') g.devStart(); else if (g.humanWalk()) g.devFinish();
      g.tick(50);
    }
    if (!p1Ready()) return `stuck in ${g.turns.phase}`;
    g.screens.map.onKey(g, { key: 'Enter' }); g.tick(50);
    if (g.humanWalk()) return 'P1 started P2\'s turn';
    g.onPlayerKey(key('KeyQ', 'q')); const w = g.humanWalk();
    if (!w || w.pid !== 'p1') return 'P2 could not start his turn';
    const x = w.x; g.input.keys.add('KeyA'); g.fastForward(500); g.input.keys.delete('KeyA');
    if (!(w.x < x)) return `P2 did not walk: ${x} -> ${w.x}`;
    const x2 = w.x; g.input.keys.add('ArrowLeft'); g.fastForward(500); g.input.keys.delete('ArrowLeft');
    return w.x === x2 ? true : 'P1 arrows moved P2\'s colonist';
  });
  t('Hand-over (2 humans): "Prem tots els botons" waits for every human with no timeout; one human keeps the old wait', () => {
    const g = mpGame('mp-hand');
    if (!drive(g, () => g.turns.phase === 'STATUS')) return `stuck in ${g.turns.phase}`;
    if (!g.turns.phaseData.wait) return 'no button wait';
    g.skipPhase(); g.tick(50); if (g.turns.phase !== 'STATUS') return 'advanced with one button';
    if (!g.turns.phaseData.wait.pressed.includes('p0')) return 'P1 press not recorded';
    g.onPlayerKey(key('KeyQ', 'q')); g.tick(50);
    if (g.turns.phase === 'STATUS') return 'did not advance with every button';
    if (!drive(g, () => g.turns.phase === 'TURN_REPORT', 100000)) return 'no turn report';
    g.fastForward(120000); if (g.turns.phase !== 'TURN_REPORT') return 'the summary advanced on its own';
    g.humanIds().forEach((id) => g.playerButton(id)); g.tick(50); if (g.turns.phase === 'TURN_REPORT') return 'did not advance after every button';
    const one = mkGame(); one.newGame({ seed: 'mp-hand' });
    if (!drive(one, () => one.turns.phase === 'STATUS')) return 'single: no status';
    if (one.turns.phaseData.wait) return 'single human got the multi wait';
    one.fastForward(30000); return one.turns.phase === 'STATUS' ? true : 'single human status timed out';
  });
  t('No auto-advance with a human seat: event card, production, status, land- and goods-auction results wait for Continuar (120 s)', () => {
    const g = mpGame('stay-1', [two[0]]); const long = 120000;
    const stays = (label, at, press) => {
      if (!drive(g, at)) return `${label}: never reached (${g.turns.phase})`;
      const ph = g.turns.phase; g.fastForward(long);
      if (g.turns.phase !== ph || !at()) return `${label}: advanced on its own to ${g.turns.phase}`;
      press(); g.tick(50); return at() ? `${label}: Continuar did not advance` : null;
    };
    const steps = [
      ['landing card', () => g.turns.phase === 'TURN_START', () => g.skipPhase()],
      ['land-auction result', () => !!g.landAuction() && g.landAuction().stage === 'result', () => g.landNext()],
      ['production', () => g.turns.phase === 'PRODUCTION', () => g.skipPhase()],
      ['status', () => g.turns.phase === 'STATUS', () => g.skipPhase()],
      ['goods-auction end', () => !!(g.turns.phase || '').startsWith('AUCTION_') && !!g.rt.auction && g.rt.auction.engine.ended, () => g.skipPhase()],
      ['turn report', () => g.turns.phase === 'TURN_REPORT', () => g.skipPhase()]
    ];
    for (const [label, at, press] of steps) {
      // A goods auction is only reached by playing it out: the drive loop never ends it, so run the clock first.
      if (label === 'goods-auction end') { drive(g, () => (g.turns.phase || '').startsWith('AUCTION_')); g.fastForward(long, 50, at); }
      const err = stays(label, at, press); if (err) return err;
    }
    return true;
  });
  t('Save: schema 9 keeps the seats (humans, names, colours, species, keys) of a 2-human game; schema 8 is refused', () => {
    if (CONFIG.SCHEMA_VERSION !== 9) return `schema ${CONFIG.SCHEMA_VERSION}`;
    const { state, rng } = GameState.create({ seed: 'mp-save', humans: two });
    const back = SaveSystem.deserialize(SaveSystem.serialize(state, rng));
    if (back.incompatible || JSON.stringify(back.state) !== JSON.stringify(state)) return 'round trip';
    if (back.state.players.map((p) => `${p.name}${p.isHuman ? p.keys : '-'}`).join() !== 'Ada0,Bo1,Bran-,Vela-') return 'seats lost';
    const old = SaveSystem.deserialize(JSON.stringify({ schemaVersion: 8, turn: 3 }));
    return old.incompatible && old.reason === 'old_rules' ? true : JSON.stringify(old);
  });
  t('Demo: four computers play with no input; hand-over screens advance after [Atari code] ~8.5 s; never saved; a finished demo restarts', () => {
    const g = mpGame('demo-1', []);
    if (!g.isDemo() || g.humanIds().length) return 'not a demo';
    const real = SaveSystem.save; let saves = 0; SaveSystem.save = () => { saves++; return true; }; g.persist = true;
    try {
      const seen = new Set(); let statusMs = 0;
      for (let i = 0; i < 200000 && !(g.state.turn === 2 && g.turns.phase === 'DEVELOPMENT'); i++) { seen.add(g.turns.phase); if (g.turns.phase === 'STATUS') statusMs += 50; g.tick(50); }
      if (g.state.turn !== 2 || g.turns.phase !== 'DEVELOPMENT') return `stuck in ${g.turns.phase}, turn ${g.state.turn}`;
      if (!['LAND_GRANT', 'DEVELOPMENT', 'PRODUCTION', 'STATUS', 'AUCTION_food', 'TURN_REPORT'].every((p) => seen.has(p))) return [...seen].join();
      if (Math.abs(statusMs - CONFIG.HANDOVER.demoMs) > 100) return `status shown ${statusMs} ms`;
      if (saves) return `demo saved ${saves} times`;
      const seed = g.state.seed; g.finish(); g.fastForward(CONFIG.HANDOVER.demoMs + 200);
      return g.mode === 'play' && g.isDemo() && g.state.turn === 1 && g.state.seed !== seed ? true : `no restart: ${g.mode} ${g.state.seed} ${g.state.turn}`;
    } finally { SaveSystem.save = real; }
  });
  t('Gamepad: the first button on a pad claims the next human seat; then d-pad / stick + A act as that player', () => {
    const g = mpGame('mp-pad');
    if (!drive(g, () => g.turns.phase === 'LAND_GRANT' && g.landRace().cursor >= 0)) return `stuck in ${g.turns.phase}`;
    const pad = (index, a, axes = [0, 0], dpad = []) => ({ index, connected: true, axes, buttons: Array.from({ length: 16 }, (_, k) => ({ pressed: k === 0 ? a : dpad.includes(k) })) });
    GamepadInput.poll(g, [pad(0, true), pad(1, false)]);
    GamepadInput.poll(g, [pad(0, false), pad(1, true)]);
    if (JSON.stringify(g.padSeats) !== '{"0":0,"1":1}') return `seats ${JSON.stringify(g.padSeats)}`;
    if (g.landRace().inputs.length) return 'the claiming press also acted';
    GamepadInput.poll(g, [pad(0, false), pad(1, false, [0, -0.9])]);
    if (g.playerDirs('p1').y !== -1 || g.playerDirs('p0').y !== 0) return `stick ${JSON.stringify(g.playerDirs('p1'))}`;
    GamepadInput.poll(g, [pad(0, false, [0, 0], [15]), pad(1, true)]);
    if (g.playerDirs('p0').x !== 1) return 'd-pad right';
    return g.landRace().inputs.map((i) => i.pid).join() === 'p1' ? true : `inputs ${JSON.stringify(g.landRace().inputs)}`;
  });

  t('Setup: picking a colour another seat holds swaps them; more humans never share a colour; the options feed GameState', () => {
    const st = mkGame().setup;
    SetupScreen.setHumans(st, 2); SetupScreen.pickColor(st, 1, 'yellow');
    if (st.seats[0].color !== 'coral' || st.seats[1].color !== 'yellow') return `swap ${st.seats.map((x) => x.color)}`;
    st.seats[2].color = 'yellow'; SetupScreen.setHumans(st, 3);
    if (new Set(st.seats.slice(0, 3).map((x) => x.color)).size !== 3) return `dup ${st.seats.map((x) => x.color)}`;
    const o = SetupScreen.options(st); SetupScreen.setHumans(st, 0);
    return o.humans.length === 3 && SetupScreen.options(st).humans.length === 0 && GameState.create(o).state.players.filter((p) => p.isHuman).length === 3 ? true : JSON.stringify(o);
  });
  const failed = results.filter((r) => !r.ok);
  return { total: results.length, passed: results.length - failed.length, failed: failed.length, results };
}
