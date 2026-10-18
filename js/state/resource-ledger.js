'use strict';
/**
 * Every credit / item movement goes through here. 'store' owns store stock and the bank wallet, 'nature' is the
 * external source/sink (production, consumption, events). Because both ends are tracked, audit() can prove that
 * nothing is created or lost by mistake (acceptance criterion 6).
 */
const ResourceLedger = {
  holder(state, id) {
    if (id === 'store') return { inv: state.store.stock, walletOwner: state.bank };
    if (id === 'nature') return { inv: state.ext.items, walletOwner: state.ext };
    const p = state.players.find((q) => q.id === id);
    if (!p) throw new Error(`unknown owner ${id}`);
    return { inv: p.inventory, walletOwner: p };
  },
  stock(state, id, res) { return this.holder(state, id).inv[res] || 0; },
  cash(state, id) { return this.holder(state, id).walletOwner.cash; },
  /** @returns {boolean} false (and no change at all) when the source lacks stock. */
  moveItem(state, res, from, to, qty) {
    if (!Number.isInteger(qty) || qty <= 0) throw new Error(`bad qty ${qty}`);
    const a = this.holder(state, from); const b = this.holder(state, to);
    if (from !== 'nature' && (a.inv[res] || 0) < qty) return false;
    a.inv[res] = (a.inv[res] || 0) - qty;
    b.inv[res] = (b.inv[res] || 0) + qty;
    return true;
  },
  moveCash(state, from, to, amount) {
    if (!Number.isInteger(amount) || amount < 0) throw new Error(`bad amount ${amount}`);
    if (amount === 0) return true;
    const a = this.holder(state, from); const b = this.holder(state, to);
    // The store acts as an unlimited bank; only colonists are bound by their wallet.
    if (from !== 'nature' && from !== 'store' && a.walletOwner.cash < amount) return false;
    a.walletOwner.cash -= amount;
    b.walletOwner.cash += amount;
    return true;
  },
  /** Returns a list of violations (empty = every credit and item is accounted for). */
  audit(state) {
    const bad = [];
    const cash = state.players.reduce((s, p) => s + p.cash, 0) + state.bank.cash + state.ext.cash;
    if (cash !== state.initialTotals.cash) bad.push(`cash ${cash} != ${state.initialTotals.cash}`);
    Object.keys(state.initialTotals.items).forEach((res) => {
      const n = state.players.reduce((s, p) => s + (p.inventory[res] || 0), 0) + (state.store.stock[res] || 0) + (state.ext.items[res] || 0);
      if (n !== state.initialTotals.items[res]) bad.push(`${res} ${n} != ${state.initialTotals.items[res]}`);
    });
    state.players.forEach((p) => {
      if (p.cash < 0) bad.push(`${p.id} negative cash`);
      Object.entries(p.inventory).forEach(([r, v]) => { if (v < 0) bad.push(`${p.id} negative ${r}`); });
    });
    Object.entries(state.store.stock).forEach(([r, v]) => { if (v < 0) bad.push(`store negative ${r}`); });
    return bad;
  }
};

/** RUCs are not items of the ledger, so they get their own conservation check. `carried` = RUCs a walker is leading right now. */
const RucAudit = {
  count(state, carried = 0) {
    const installed = state.plots.filter((p) => p.ruc).length;
    return { have: state.store.ruc + installed + carried, expected: CONFIG.RUC_START + state.rucs.made - state.rucs.lost };
  },
  ok(state, carried = 0) { const c = this.count(state, carried); return c.have === c.expected && state.store.ruc >= 0; }
};
