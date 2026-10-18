'use strict';
/**
 * [manual] Development order: from the leader to the last colonist by net worth ("the last place player moves last"), reversed
 * ([Atari code]) when the corral has 7 M.U.L.E.s or fewer. Worked out once when development starts, kept in the save.
 * Ties: [PROVISIONAL] stable by player order.
 */
const DevOrder = {
  create(state) {
    const w = new Map(state.players.map((p) => [p.id, ScoringSystem.netWorth(state, p)]));
    const order = state.players.map((p, i) => ({ id: p.id, i })).sort((a, b) => (w.get(b.id) - w.get(a.id)) || (a.i - b.i)).map((x) => x.id);
    const reversed = state.store.ruc <= CONFIG.DEV.lowCorral;
    return { order: reversed ? order.reverse() : order, reversed, corral: state.store.ruc, idx: 0, slot: null };
  }
};
