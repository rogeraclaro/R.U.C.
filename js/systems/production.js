'use strict';
const ProductionSystem = {
  baseYield(plot, res) {
    const row = PRODUCTION_TABLE[plot.terrain];
    const cell = row && (row[plot.richness] || row[0]);
    return cell ? (cell[res] || 0) : 0;
  },
  /** [manual] Smithore (and Crystite) cannot be mined in the river valley: no bonus can make such a plot produce it. */
  canProduce(plot, res) { return plot.terrain !== TERRAIN.TOWN && !(plot.terrain === TERRAIN.RIVER && (res === 'smithore' || res === 'crystite')); },
  sameGood(plot) { const res = plot.ruc.module; return (q) => q.ownerId === plot.ownerId && !!q.ruc && q.ruc.module === res; },
  /** [manual] Economies of scale: +1 if at least one orthogonal neighbour of the same owner makes the same good. Never more than +1. */
  adjacencyBonus(state, plot) { return Plot.neighbours(state.plots, plot).some(this.sameGood(plot)) ? 1 : 0; },
  /** [manual] Learning curve: +1 on each plot for every complete group of 3 own plots making the same good, wherever they are. */
  learningBonus(state, plot) { return Math.floor(state.plots.filter(this.sameGood(plot)).length / 3); },
  /** Average yield (base + both bonuses), before the random variation and the events. */
  meanYield(state, plot) {
    if (!plot.ruc || !this.canProduce(plot, plot.ruc.module)) return 0;
    return this.baseYield(plot, plot.ruc.module) + this.adjacencyBonus(state, plot) + this.learningBonus(state, plot);
  },
  /**
   * [Atari code] random variation: units = mean + round(F x binomial), Standard F = 0.5 -> -1/0/+1 at ~16/68/16 %, +-2 at ~0.1 % each
   * (see binomialStep). One seeded draw per plot; the result is then clamped to 0..8.
   */
  /** Level amplitude ([Atari code] Beginner 0: no draw at all, so the PRNG stream is not used). */
  variation(state, rng) { const F = levelRules(state).varAmp; return F ? binomialStep(rng, F) : 0; },
  clampUnits(u) { return clamp(u, CONFIG.PRODUCTION.min, CONFIG.PRODUCTION.max); },
  /**
   * [Atari code] "before production" planetary events change each plot's final production (after variation and the 0..8 clamp):
   * planetquake halves mining (floor); sunspot +3 energy, max 8; acid rain: cloud row food +4 / energy -2, other rows food +1 /
   * energy -1, clamped 0..8. [Atari code] reading: they act on every plot with that MULE type, so an unpowered food plot (0) still
   * gets the acid-rain +1 ([PROVISIONAL]: not seen in the emulator).
   */
  applyEvents(state, plot, units) {
    const m = state.modifiers; const res = plot.ruc.module; let u = units;
    if (m.quake && (res === 'smithore' || res === 'crystite')) u = Math.floor(u / 2);
    if (m.sunspot && res === 'energy') u = Math.min(CONFIG.PRODUCTION.max, u + 3);
    if (m.acidRow !== null && m.acidRow !== undefined && (res === 'food' || res === 'energy')) {
      const cloud = plot.y === m.acidRow;
      u = this.clampUnits(u + (res === 'food' ? (cloud ? 4 : 1) : (cloud ? -2 : -1)));
    }
    return u;
  },
  /** What a colonist can expect (tooltip, AI): the mean with this turn's known events, without the random draw. */
  expectedYield(state, plot) {
    if (!plot.ruc || !this.canProduce(plot, plot.ruc.module)) return 0;
    return this.applyEvents(state, plot, this.clampUnits(this.meanYield(state, plot)));
  },
  /** Real yield of a powered plot this turn: one seeded draw per plot. */
  rollYield(state, plot, rng) {
    if (!plot.ruc || !this.canProduce(plot, plot.ruc.module)) return 0;
    return this.applyEvents(state, plot, this.clampUnits(this.meanYield(state, plot) + this.variation(state, rng)));
  },
  /**
   * [manual] Food and Smithore RUCs each need one unit of energy left over from the previous turn; energy RUCs power themselves, and
   * energy made this turn never powers anything until the next one. [Atari code] for each missing unit one RANDOM exploitation of
   * that colonist produces nothing (seeded PRNG). [PROVISIONAL] detail: drawn among its non-energy RUCs, without repetition (as [FN]
   * does; the write-up only says "a random exploitation owned by the player").
   */
  activation(state, p, rng) {
    const mine = state.plots.filter((q) => q.ownerId === p.id && q.ruc).sort((a, b) => a.id - b.id);
    const needy = mine.filter((q) => q.ruc.module !== 'energy');
    const powered = Math.min(needy.length, p.inventory.energy || 0);
    const on = new Set(needy.map((q) => q.id));
    for (let k = needy.length - powered, pool = needy.slice(); k > 0; k--) on.delete(pool.splice(rng.int(pool.length), 1)[0].id);
    mine.forEach((q) => { if (q.ruc.module === 'energy') on.add(q.id); });
    return { mine, on, powered, stopped: needy.length - powered };
  }
};
