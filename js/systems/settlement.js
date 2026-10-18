'use strict';
/**
 * Settlement of one turn, after development and the planetary event. Applied ONCE, atomically through the ledger, per colonist:
 *   start    the reserve left from the previous turn
 *   used     energy spent by non-energy RUCs (from that reserve) and food eaten
 *   spoiled  [card] 50% of the food left, 25% of the energy left, ore above 50: on the reserve, BEFORE the new harvest
 *   produced the new harvest (it is never spoiled this turn)
 *   lost     taken from the reserve by an "after production" planetary event (pirates); pest/pirates lower `produced` instead
 *   final  = start - used - spoiled + produced - lost
 * The report lives in state.settlement, so a reload or a skipped screen never runs it twice.
 */
const SettlementSystem = {
  spoilage(res, left) {
    if (res === 'food') return Math.floor(left * CONFIG.SPOILAGE.foodPct / 100);
    if (res === 'energy') return Math.floor(left * CONFIG.SPOILAGE.energyPct / 100);
    return Math.max(0, left - CONFIG.SPOILAGE.oreCap);
  },
  run(state, rng) {
    if (state.settlement && state.settlement.turn === state.turn) return state.settlement;
    const need = ConsumptionSystem.foodNeed(state.turn);
    const resIds = enabledResources(state).map((d) => d.id);
    const harvest = [];
    const rows = state.players.map((p) => {
      const blank = () => { const o = {}; resIds.forEach((r) => { o[r] = 0; }); return o; };
      // lost: goods taken by an "after production" event from the reserve (pirates), so start - used - spoiled + produced - lost = final.
      const start = blank(); const used = blank(); const spoiled = blank(); const produced = blank(); const lost = blank();
      resIds.forEach((r) => { start[r] = p.inventory[r] || 0; });
      const act = ProductionSystem.activation(state, p, rng);
      if (act.powered > 0) ResourceLedger.moveItem(state, 'energy', p.id, 'nature', act.powered);
      used.energy = act.powered;
      const eaten = Math.min(need, p.inventory.food);
      if (eaten > 0) ResourceLedger.moveItem(state, 'food', p.id, 'nature', eaten);
      used.food = eaten;
      resIds.forEach((r) => {
        const n = this.spoilage(r, p.inventory[r] || 0);
        spoiled[r] = n;
        if (n > 0) ResourceLedger.moveItem(state, r, p.id, 'nature', n);
      });
      const items = act.mine.map((plot) => {
        const on = act.on.has(plot.id);
        const amount = on ? ProductionSystem.rollYield(state, plot, rng) : ProductionSystem.canProduce(plot, plot.ruc.module) ? ProductionSystem.applyEvents(state, plot, 0) : 0;
        if (amount > 0 && resIds.includes(plot.ruc.module)) { harvest.push({ owner: p.id, res: plot.ruc.module, amount }); produced[plot.ruc.module] += amount; }
        // zeroed: set later by an "after production" event (pest, pirates) that takes this plot's harvest.
        return { plotId: plot.id, module: plot.ruc.module, active: on, amount, zeroed: null };
      });
      p.productionReport = { turn: state.turn, energyUsed: act.powered, items };
      return { playerId: p.id, need, start, used, spoiled, produced, lost, missingFood: need - eaten, stopped: act.stopped, items };
    });
    harvest.forEach((h) => ResourceLedger.moveItem(state, h.res, 'nature', h.owner, h.amount));
    rows.forEach((row) => { const p = playerById(state, row.playerId); row.final = {}; resIds.forEach((r) => { row.final[r] = p.inventory[r] || 0; }); });
    state.settlement = { turn: state.turn, need, rows };
    return state.settlement;
  }
};
