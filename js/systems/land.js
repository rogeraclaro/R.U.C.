'use strict';
const LandGrantSystem = {
  freePlots(state) { return state.plots.filter((p) => Plot.claimable(p)); },
  assign(state, playerId, plotId) {
    const plot = plotById(state, plotId);
    if (!plot || !Plot.claimable(plot)) return false;
    plot.ownerId = playerId;
    playerById(state, playerId).plots.push(plotId);
    return true;
  },
  /** Tie-break order for simultaneous claims: the previous order rotated by one position each turn (turn 1: as created). */
  tieOrder(state) {
    const prev = state.landOrder;
    return state.turn <= 1 ? prev.slice() : prev.slice(1).concat(prev[0]);
  },
  /** How much a colonist wants a free plot: needs first, then the profile's terrain taste, richness and adjacency. */
  scorePlot(state, player, p) {
    const foodCapable = state.plots.filter((q) => q.ownerId === player.id && q.terrain !== TERRAIN.MOUNTAIN).length;
    let s = 0;
    if (player.aiProfile === 'industrial') s += p.terrain === TERRAIN.MOUNTAIN ? 3 + p.richness * 2 : p.terrain === TERRAIN.PLAIN ? 3 : 2;
    else if (player.aiProfile === 'conservative') s += p.terrain === TERRAIN.RIVER ? 5 : p.terrain === TERRAIN.PLAIN ? 4 : 2 + p.richness * 0.5;
    else s += p.terrain === TERRAIN.PLAIN ? 4 : p.terrain === TERRAIN.RIVER ? 3.5 : 2.5 + p.richness * 0.8;
    if (foodCapable < 2 && p.terrain !== TERRAIN.MOUNTAIN) s += 2;
    s += Plot.neighbours(state.plots, p).filter((n) => n.ownerId === player.id).length * 0.8;
    return s;
  }
};

/**
 * Land grant as a real-time race (original M.U.L.E. spirit). A cursor sweeps the free plots row by row; whoever presses while
 * it sits on a free plot gets it. Everything lives in one plain, JSON-friendly object (`land`, kept in phaseData) and advances
 * in FIXED game-clock steps, so the same seed + the same timestamped inputs always give the same result, at any frame rate,
 * and a save taken mid-sweep resumes exactly.
 */
const LandRace = {
  create(state, rng, aiIds) {
    const d = CONFIG.DIFFICULTY[state.difficulty];
    const land = {
      msPerPlot: d.landMsPerPlot, clock: 0, acc: 0, sweep: 0, cursor: -1, dwellLeft: 0, eligible: [],
      claimed: {}, inputs: [], ai: {}, aiIds: aiIds.slice(), tieOrder: LandGrantSystem.tieOrder(state),
      pause: 0, afterPlot: -1, done: false, hold: CONFIG.LAND.holdMs, lastClaim: null
    };
    state.landOrder = land.tieOrder.slice();
    this.startSweep(state, rng, land, 1, state.players.map((p) => p.id));
    return land;
  },
  /** First free plot at or after `from` in sweep order (ids are row-major, so this is left->right, top->bottom). The town is skipped. */
  nextFree(state, from) {
    for (let i = from; i < state.plots.length; i++) if (Plot.claimable(state.plots[i])) return i;
    return -1;
  },
  startSweep(state, rng, land, n, eligible) {
    land.sweep = n; land.eligible = eligible.slice(); land.ai = {};
    land.cursor = this.nextFree(state, 0); land.dwellLeft = land.msPerPlot;
    if (land.cursor < 0 || !land.eligible.length) { this.finish(land); return; }
    land.aiIds.filter((id) => land.eligible.includes(id)).forEach((id) => this.plan(state, rng, land, id));
  },
  finish(land) { land.cursor = -1; land.done = true; land.ai = {}; land.inputs = []; },
  canClaim(land, pid) { return !land.done && !(land.pause > 0) && land.eligible.includes(pid) && land.claimed[pid] === undefined; },
  /** Human input, stamped on the game clock (not wall clock). Duplicate pending presses are collapsed. */
  press(land, pid) {
    if (!this.canClaim(land, pid) || land.inputs.some((i) => i.pid === pid)) return false;
    land.inputs.push({ pid, at: land.clock + land.acc });
    return true;
  },
  /**
   * AI: pick a target among the free plots at or AHEAD of the public cursor (the sweep order is public), scored with the usual
   * valuation +-error, then schedule the press so it lands around the cursor's arrival, shifted by a reaction time drawn
   * from the seeded PRNG. It never looks at anything a human could not see.
   */
  plan(state, rng, land, pid) {
    const d = CONFIG.DIFFICULTY[state.difficulty]; const player = playerById(state, pid);
    const reaction = rng.range(d.reactMin, d.reactMax);
    let best = -1; let bestScore = -1e9; let bestRank = 0; let rank = 0;
    for (let id = land.cursor; id < state.plots.length; id++) {
      const p = state.plots[id]; if (!Plot.claimable(p)) continue;
      const err = (rng.next() * 2 - 1) * d.valuationErr / 100;
      // A small penalty per plot of waiting: the far end of the map may be gone by the time the cursor gets there.
      const sc = LandGrantSystem.scorePlot(state, player, p) * (1 + err) - 0.04 * rank;
      if (sc > bestScore) { bestScore = sc; best = id; bestRank = rank; }
      rank++;
    }
    if (best < 0) { delete land.ai[pid]; return; }
    const arrival = bestRank === 0 ? 0 : land.dwellLeft + (bestRank - 1) * land.msPerPlot;
    // The AI anticipates the arrival by its AVERAGE reaction; its actual (random) reaction decides how early/late it lands.
    const mid = (d.reactMin + d.reactMax) / 2;
    land.ai[pid] = { target: best, pressAt: Math.round(land.clock + Math.max(reaction, arrival + reaction - mid)) };
  },
  update(state, rng, land, dtMs) {
    if (land.done) return;
    land.acc += dtMs;
    while (land.acc >= CONFIG.LAND.stepMs && !land.done) { land.acc -= CONFIG.LAND.stepMs; this.step(state, rng, land); }
  },
  step(state, rng, land) {
    land.clock += CONFIG.LAND.stepMs;
    if (land.pause > 0) {
      // Claim pause: the cursor is hidden and frozen, and any press that lands in this window is simply lost.
      land.inputs = land.inputs.filter((i) => i.at > land.clock);
      land.pause -= CONFIG.LAND.stepMs;
      if (land.pause <= 0) this.resume(state, rng, land);
      return;
    }
    const claimants = [];
    const due = land.inputs.filter((i) => i.at <= land.clock).sort((a, b) => a.at - b.at);
    if (due.length) land.inputs = land.inputs.filter((i) => i.at > land.clock);
    due.forEach((i) => { if (this.canClaim(land, i.pid) && !claimants.includes(i.pid)) claimants.push(i.pid); });
    land.aiIds.forEach((pid) => {
      const a = land.ai[pid];
      if (a && a.pressAt <= land.clock) { delete land.ai[pid]; if (this.canClaim(land, pid) && !claimants.includes(pid)) claimants.push(pid); }
    });
    if (claimants.length && land.cursor >= 0) {
      // Catch-up rule: on a simultaneous claim the poorer colonist wins; equal wealth falls back to the rotated order.
      const worth = (id) => ScoringSystem.netWorth(state, playerById(state, id));
      const winner = claimants.slice().sort((a, b) => (worth(a) - worth(b)) || (land.tieOrder.indexOf(a) - land.tieOrder.indexOf(b)))[0];
      this.claim(state, rng, land, winner);
      return;
    }
    land.dwellLeft -= CONFIG.LAND.stepMs;
    if (land.dwellLeft <= 0) this.advance(state, rng, land);
  },
  claim(state, rng, land, pid) {
    const plotId = land.cursor;
    LandGrantSystem.assign(state, pid, plotId);
    land.claimed[pid] = plotId; land.lastClaim = { pid, plot: plotId, clock: land.clock };
    // AI timers are dropped: they must not run down while the cursor is away, so they are re-planned when it comes back.
    land.ai = {}; land.cursor = -1;
    // Only wait if someone can still claim something afterwards; otherwise the phase ends right after the claim highlight.
    const waiting = land.eligible.some((id) => land.claimed[id] === undefined);
    const canContinue = waiting && this.nextFree(state, plotId + 1) >= 0;
    if (!canContinue) { this.finish(land); return; }
    land.afterPlot = plotId; land.pause = CONFIG.LAND.landClaimPauseMs;
  },
  /** End of the claim pause: the sweep continues at the plot AFTER the claimed one, with a full dwell. */
  resume(state, rng, land) {
    land.pause = 0;
    land.cursor = this.nextFree(state, land.afterPlot + 1); land.dwellLeft = land.msPerPlot;
    if (land.cursor < 0) { this.endSweep(state, rng, land); return; }
    land.aiIds.forEach((id) => { if (this.canClaim(land, id)) this.plan(state, rng, land, id); });
  },
  advance(state, rng, land) {
    land.cursor = this.nextFree(state, land.cursor + 1); land.dwellLeft = land.msPerPlot;
    if (land.cursor < 0) { this.endSweep(state, rng, land); return; }
    land.aiIds.forEach((id) => { const a = land.ai[id]; if (a && a.target < land.cursor) this.plan(state, rng, land, id); });
  },
  /** [manual] One single sweep: a colonist who did not press in time gets no plot this turn (no second sweep). */
  endSweep(state, rng, land) { this.finish(land); }
};
