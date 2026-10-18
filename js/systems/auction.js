'use strict';
/**
 * Real-time continuous double auction (spec section 9). Pure, dt-driven engine: no rendering, no wall clock.
 * It only knows generic lots ({id, kind, quantity, sellerId, transferable, getValue(), transfer()}) and a
 * marketDefinition, so a 4th resource - or a future land lot - plugs in without touching this class.
 * [manual] Two stages: a timed DECLARATION (buyer / seller, changeable until the Declare Timer runs out; OUT is a R.U.C. extension),
 * then the TRADE stage with fixed roles, where only prices move. `clock` counts both stages, `t` only the trade stage.
 * The whole engine state is plain data: snapshot() / AuctionEngine.restore() let a save resume in the middle of an auction.
 */
class AuctionEngine {
  /** Fungible resource lot: 1 unit moves from seller to buyer. */
  static fungibleMarket(def) {
    return {
      id: def.id, label: def.label, minPrice: def.minPrice, maxPrice: def.maxPrice, step: def.auctionStep,
      // Colonist-to-colonist limit while the store is out of stock: [manual] there is no rule cap; this is only a UI technical limit.
      playerMaxPrice: Math.max(def.maxPrice, CONFIG.AUCTION.playerPriceMax),
      basePrice: def.basePrice, priceFloor: def.priceFloor, storeBuyOff: def.storeBuyOff, storeSellOff: def.storeSellOff, kind: 'fungible',
      createLot(state, sellerId) {
        return {
          id: `${def.id}:${sellerId}`, kind: 'fungible', quantity: 1, sellerId,
          transferable: ResourceLedger.stock(state, sellerId, def.id) >= 1,
          getValue: () => StoreSystem.price(state, def),
          transfer: (st, toId) => ResourceLedger.moveItem(st, def.id, sellerId, toId, 1)
        };
      }
    };
  }

  constructor({ market, state, rng, colonists, withStore = true, onTrade = null, declareMs = 0 }) {
    this.market = market; this.state = state; this.rng = rng; this.onTrade = onTrade;
    this.clock = 0; this.t = 0; this.stage = 'declare'; this.declareLeft = declareMs;
    this.ended = false; this.endReason = null;
    this.trades = []; this.volume = 0; this.sum = 0; this.min = null; this.max = null;
    this.crossKey = null; this.crossMs = 0; this.allOutMs = 0; this.noOpMs = 0; this.lastActivity = 0;
    this.withStore = withStore; this.storeStock = null;
    const mid = Math.round((market.minPrice + market.maxPrice) / 4);
    const mk = (id, ownerId, isStore, role) => ({ id, ownerId, isStore, role, priceF: mid, price: mid, priceSince: 0, roleSince: 0, tie: rng.next(), blocked: null });
    this.entries = colonists.map((id) => mk(id, id, false, ROLE.OUT));
    if (withStore) { this.entries.push(mk('store-b', 'store', true, ROLE.BUYER)); this.entries.push(mk('store-s', 'store', true, ROLE.SELLER)); }
    if (withStore) this._updateStore();
  }
  snapshot() {
    return JSON.parse(JSON.stringify({
      clock: this.clock, t: this.t, stage: this.stage, declareLeft: this.declareLeft, ended: this.ended, endReason: this.endReason,
      trades: this.trades, volume: this.volume, sum: this.sum, min: this.min, max: this.max, crossKey: this.crossKey, crossMs: this.crossMs,
      allOutMs: this.allOutMs, noOpMs: this.noOpMs, lastActivity: this.lastActivity, withStore: this.withStore, storeStock: this.storeStock,
      entries: this.entries
    }));
  }
  static restore(snap, { market, state, rng, onTrade = null }) {
    const e = Object.create(AuctionEngine.prototype);
    return Object.assign(e, JSON.parse(JSON.stringify(snap)), { market, state, rng, onTrade });
  }
  entry(id) { return this.entries.find((e) => e.id === id); }
  get colonistEntries() { return this.entries.filter((e) => !e.isStore); }
  /** [manual] With the store out of stock, a colonist's price may go as high as buyers want; otherwise the store bounds apply. */
  playerMax() {
    const stock = this.withStore ? (this.state.store.stock[this.market.id] || 0) : 0;
    return this.withStore && stock > 0 ? this.market.maxPrice : (this.market.playerMaxPrice || this.market.maxPrice);
  }
  priceCap(e) { return !e || e.isStore ? this.market.maxPrice : this.playerMax(); }
  snap(price, e = null) {
    const s = this.market.step;
    return clamp(Math.round(price / s) * s, this.market.minPrice, this.priceCap(e));
  }
  canDeclare() { return !this.ended && this.stage === 'declare'; }
  /** Start marker of a role: [manual] sellers start at the top (store selling price), buyers at the bottom (store buying price). */
  rolePrice(role) {
    if (role === ROLE.SELLER) return this.withStore ? StoreSystem.ask(this.state, this.market) : this.market.maxPrice;
    return this.withStore ? StoreSystem.bid(this.state, this.market) : this.market.minPrice;
  }
  /** Only while the declaration lasts; afterwards the role is fixed. Returns true when the entry now has the requested role. */
  setRole(id, role) {
    const e = this.entry(id);
    if (!e) return false;
    if (e.role === role) return true;
    if (!this.canDeclare()) return false;
    e.role = role; e.roleSince = this.clock; e.blocked = null;
    if (role !== ROLE.OUT) this.setPrice(id, this.rolePrice(role));
    return true;
  }
  setPrice(id, price) {
    const e = this.entry(id);
    e.priceF = clamp(price, this.market.minPrice, this.priceCap(e));
    const p = this.snap(e.priceF, e);
    if (p !== e.price) { e.price = p; e.priceSince = this.clock; }
  }
  /** Continuous marker movement (hold a key / wheel): dir in {-1, +1}. */
  nudge(id, dir, dtMs, stepsPerSec) {
    const e = this.entry(id);
    this.setPrice(id, e.priceF + dir * this.market.step * stepsPerSec * dtMs / 1000);
  }
  /** The store's price P of this good ([Atari code]; its buy / sell lines are P - buyOff / P + sellOff). */
  centralPrice() { return StoreSystem.price(this.state, this.market); }

  _updateStore() {
    const stock = this.state.store.stock[this.market.id] || 0;
    const sb = this.entry('store-b'); const ss = this.entry('store-s');
    const central = this.centralPrice();
    const idle = this.t - this.lastActivity;
    // [PROVISIONAL] after 5 s without trades the store closes its spread one step every 2 s, but never past P (auction behaviour,
    // not from the original: left for the auction batch).
    const n = this.stage === 'trade' && idle >= CONFIG.AUCTION.storeIdleMs ? 1 + Math.floor((idle - CONFIG.AUCTION.storeIdleMs) / CONFIG.AUCTION.storeNudgeMs) : 0;
    const step = this.market.step;
    const put = (e, v) => { const p = clamp(v, this.market.minPrice, this.market.maxPrice); if (p !== e.price) { e.price = p; e.priceSince = this.clock; } e.priceF = p; };
    put(ss, Math.max(StoreSystem.ask(this.state, this.market) - n * step, central));
    put(sb, Math.min(StoreSystem.bid(this.state, this.market) + n * step, central));
    ss.role = stock >= 1 ? ROLE.SELLER : ROLE.OUT;
    sb.role = stock < CONFIG.AUCTION.storeBuyCap ? ROLE.BUYER : ROLE.OUT;
    // When the store gets stock back, colonist markers fall back under the store ceiling.
    const cap = this.playerMax();
    this.colonistEntries.forEach((c) => { if (c.priceF > cap) this.setPrice(c.id, c.priceF); });
    this.storeStock = stock;
  }

  _worth(ownerId) { const p = playerById(this.state, ownerId); return p ? ScoringSystem.netWorth(this.state, p) : 0; }
  /**
   * Same price: colonists before the store, then [manual] the colonist with LESS net worth ("the player with the least amount of
   * money, land and goods always gets the advantage"), then [PROVISIONAL] the longest waiting and a seeded key.
   */
  _order(list, dir) {
    const worth = new Map(list.map((e) => [e.id, e.isStore ? 0 : this._worth(e.ownerId)]));
    return list.slice().sort((a, b) => dir * (a.price - b.price) || (a.isStore - b.isStore) || (worth.get(a.id) - worth.get(b.id)) || (a.roleSince - b.roleSince) || (a.tie - b.tie));
  }

  /** First crossing pair whose trade would actually be allowed right now. */
  _findPair() {
    const buyers = this._order(this.entries.filter((e) => e.role === ROLE.BUYER), -1);
    const sellers = this._order(this.entries.filter((e) => e.role === ROLE.SELLER), 1);
    for (const b of buyers) {
      for (const s of sellers) {
        if (b.ownerId === s.ownerId || b.price < s.price) continue;
        const price = this._tradePrice(b, s);
        if (this._check(b, s, price).ok) return { b, s, price };
      }
    }
    return null;
  }
  /**
   * [manual] trading happens where the buy line and the sell line meet: the price of the marker that was already resting there (the
   * other one moved into it). [PROVISIONAL] approximation when both markers reached their price in the same tick: rounded midpoint.
   */
  _tradePrice(b, s) {
    if (b.priceSince < s.priceSince) return b.price;
    if (s.priceSince < b.priceSince) return s.price;
    return Math.round((b.price + s.price) / 2);
  }
  _check(b, s, price) {
    const lot = this.market.createLot(this.state, s.ownerId);
    if (!lot.transferable) return { ok: false, reason: 'no_stock' };
    if (b.isStore) { if ((this.state.store.stock[this.market.id] || 0) >= CONFIG.AUCTION.storeBuyCap) return { ok: false, reason: 'store_full' }; }
    else if (ResourceLedger.cash(this.state, b.ownerId) < price) return { ok: false, reason: 'no_cash' };
    return { ok: true, lot };
  }

  /** Atomic: either item AND credits move, or nothing changes. */
  tryTrade(b, s, price = this._tradePrice(b, s)) {
    const chk = this._check(b, s, price);
    if (!chk.ok) return { ok: false, reason: chk.reason };
    if (!chk.lot.transfer(this.state, b.ownerId)) return { ok: false, reason: 'no_stock' };
    if (!ResourceLedger.moveCash(this.state, b.ownerId, s.ownerId, price)) {
      ResourceLedger.moveItem(this.state, this.market.id, b.ownerId, s.ownerId, 1); // rollback
      return { ok: false, reason: 'no_cash' };
    }
    this.volume += 1; this.sum += price;
    this.min = this.min === null ? price : Math.min(this.min, price);
    this.max = this.max === null ? price : Math.max(this.max, price);
    this.trades.push({ t: this.t, price, buyer: b.ownerId, seller: s.ownerId });
    this.lastActivity = this.t;
    // [PROVISIONAL] both markers are pushed apart so the same pair does not instantly trade again (see README).
    const gap = CONFIG.AUCTION.separateSteps * this.market.step;
    this.setPrice(b.id, b.priceF - gap); this.setPrice(s.id, s.priceF + gap);
    b.roleSince = s.roleSince = this.clock;
    if (this.onTrade) this.onTrade({ buyer: b.ownerId, seller: s.ownerId, price });
    return { ok: true, price };
  }

  _possible() {
    const res = this.market.id;
    const sellers = this.entries.filter((e) => !e.isStore || (this.state.store.stock[res] || 0) >= 1).filter((e) => this.market.createLot(this.state, e.ownerId).transferable);
    const buyers = this.entries.filter((e) => e.isStore ? (this.state.store.stock[res] || 0) < CONFIG.AUCTION.storeBuyCap : ResourceLedger.cash(this.state, e.ownerId) >= this.market.minPrice);
    return sellers.some((s) => buyers.some((b) => b.ownerId !== s.ownerId));
  }

  update(dt) {
    if (this.ended) return;
    if (this.stage === 'declare') {
      this.declareLeft -= dt;
      if (this.declareLeft > 0) { this.clock += dt; if (this.withStore) this._updateStore(); return; }
      // The rest of this tick already belongs to the trade stage.
      const over = -this.declareLeft;
      this.clock += dt - over; this.declareLeft = 0; this.stage = 'trade';
      dt = over;
      if (dt <= 0) return;
    }
    this.clock += dt; this.t += dt;
    if (this.withStore) this._updateStore();
    const pair = this._findPair();
    if (pair) {
      const key = `${pair.b.id}|${pair.s.id}`;
      this.crossMs = key === this.crossKey ? this.crossMs + dt : dt;
      this.crossKey = key;
      // Only a bid >= ask held continuously for 500 ms closes a deal.
      if (this.crossMs >= CONFIG.AUCTION.matchMs) { this.tryTrade(pair.b, pair.s, pair.price); this.crossMs = 0; this.crossKey = null; }
    } else { this.crossMs = 0; this.crossKey = null; }
    this.allOutMs = this.colonistEntries.every((e) => e.role === ROLE.OUT) ? this.allOutMs + dt : 0;
    this.noOpMs = this._possible() ? 0 : this.noOpMs + dt;
    if (this.t >= CONFIG.AUCTION.maxMs) this._end('time');
    else if (this.allOutMs >= CONFIG.AUCTION.allOutMs) this._end('all_out');
    else if (this.noOpMs >= CONFIG.AUCTION.noOpMs) this._end('no_ops');
  }
  _end(reason) { this.ended = true; this.endReason = reason; }
  get result() {
    return { res: this.market.id, volume: this.volume, min: this.min, max: this.max, avg: this.volume ? Math.round(this.sum / this.volume) : null, reason: this.endReason };
  }
}
