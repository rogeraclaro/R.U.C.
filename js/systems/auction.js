'use strict';
/**
 * Real-time goods auction (spec section 9). Pure, dt-driven engine: no rendering, no wall clock.
 * It only knows generic lots ({id, kind, quantity, sellerId, transferable, getValue(), transfer()}) and a
 * marketDefinition, so a 4th resource plugs in without touching this class.
 * [manual] Two stages: a timed DECLARATION (buyer / seller, changeable until the Declare Timer runs out; OUT is a R.U.C. extension),
 * then the TRADE stage with fixed roles, where only prices move. `clock` counts both stages, `t` only the trade stage.
 * Time runs in time-bar units whose length depends on what happens (AuctionEngine.timing, CONFIG.AUCTION).
 * [Atari code] While a buyer's line and a seller's line touch, units change hands one by one at an accelerating cadence.
 * The whole engine state is plain data: snapshot() / AuctionEngine.restore() let a save resume in the middle of an auction.
 */
class AuctionEngine {
  /** Fungible resource lot: 1 unit moves from seller to buyer. `critical` = the colonist's critical level of this good. */
  static fungibleMarket(def) {
    return {
      id: def.id, label: def.label, minPrice: def.minPrice, maxPrice: def.maxPrice, step: def.auctionStep,
      // Colonist-to-colonist limit while the store is out of stock: [manual] there is no rule cap; this is only a UI technical limit.
      playerMaxPrice: Math.max(def.maxPrice, CONFIG.AUCTION.playerPriceMax),
      basePrice: def.basePrice, priceFloor: def.priceFloor, storeBuyOff: def.storeBuyOff, storeSellOff: def.storeSellOff, kind: 'fungible',
      critical: (state, p) => ConsumptionSystem.criticalLevel(state, p, def.id),
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
  /**
   * Length in ms of one time-bar unit per situation, for the state's level and round (see CONFIG.AUCTION): Standard ATU 30 frames;
   * [Atari code] Beginner ATU 50 (every tick x 5/3, [PROVISIONAL] scaling of the C64 measurements), doubled in round 1.
   */
  static timing(state) {
    const r = levelRules(state); const A = CONFIG.AUCTION;
    const k = (r.auctionAtu / A.atuStandard) * (r.atuRound1x2 && state.turn <= 1 ? 2 : 1);
    const ms = (frames) => frames * k * 1000 / CONFIG.DEV.palHz;
    return { declare: ms(A.frames.declare), idle: ms(A.frames.idle), push: ms(A.frames.push), contact: ms(A.frames.contact) };
  }
  /** [Atari code] one marker step every 8 frames: the speed of every line, human or computer. */
  static lineMs() { return CONFIG.AUCTION.lineFrames * 1000 / CONFIG.DEV.palHz; }

  /** `declare` false: the declaration has 0 units (roles can still be set before the first update, which starts the trade). */
  constructor({ market, state, rng, colonists, withStore = true, onTrade = null, declare = true, timing = AuctionEngine.timing(state) }) {
    this.market = market; this.state = state; this.rng = rng; this.onTrade = onTrade;
    this.timing = timing;
    this.clock = 0; this.t = 0; this.stage = 'declare';
    this.units = declare ? CONFIG.AUCTION.declareUnits : 0; this.unitsTotal = CONFIG.AUCTION.declareUnits;
    this.pushMs = 0; this.ended = false; this.endReason = null;
    this.trades = []; this.volume = 0; this.sum = 0; this.min = null; this.max = null;
    this.contact = AuctionEngine.noContact(); this.notice = null; this.allOutMs = 0; this.noOpMs = 0;
    this.withStore = withStore; this.storeStock = null;
    const mid = Math.round((market.minPrice + market.maxPrice) / 4);
    const mk = (id, ownerId, isStore, role) => ({ id, ownerId, isStore, role, priceF: mid, price: mid, roleSince: 0, tie: rng.next() });
    this.entries = colonists.map((id) => mk(id, id, false, ROLE.OUT));
    if (withStore) { this.entries.push(mk('store-b', 'store', true, ROLE.BUYER)); this.entries.push(mk('store-s', 'store', true, ROLE.SELLER)); }
    if (withStore) this._updateStore();
  }
  static noContact() { return { key: null, ms: 0, n: 0, units: 0 }; }
  static get LIVE() { return ['market', 'state', 'rng', 'onTrade']; }
  snapshot() {
    const plain = {}; Object.keys(this).forEach((k) => { if (!AuctionEngine.LIVE.includes(k)) plain[k] = this[k]; });
    return JSON.parse(JSON.stringify(plain));
  }
  static restore(snap, { market, state, rng, onTrade = null }) {
    const e = Object.create(AuctionEngine.prototype);
    return Object.assign(e, JSON.parse(JSON.stringify(snap)), { market, state, rng, onTrade });
  }
  entry(id) { return this.entries.find((e) => e.id === id); }
  get colonistEntries() { return this.entries.filter((e) => !e.isStore); }
  /** 0 at the start of the trade stage, 1 when its time is up (0 during the declaration). */
  progress() { return this.stage === 'trade' ? clamp(1 - this.units / this.unitsTotal, 0, 1) : 0; }
  /** [manual] With the store out of stock, a colonist's price may go as high as buyers want; otherwise the store bounds apply. */
  playerMax() {
    const stock = this.withStore ? (this.state.store.stock[this.market.id] || 0) : 0;
    return this.withStore && stock > 0 ? this.market.maxPrice : (this.market.playerMaxPrice || this.market.maxPrice);
  }
  priceCap(e) { return !e || e.isStore ? this.market.maxPrice : this.playerMax(); }
  canDeclare() { return !this.ended && this.stage === 'declare'; }
  /** [FN] start lines: sellers 1 step above the store sell line, buyers 10 steps below the store buy line (top / bottom without a store). */
  rolePrice(role) {
    const s = this.market.step; const A = CONFIG.AUCTION;
    if (role === ROLE.SELLER) return this.withStore ? StoreSystem.ask(this.state, this.market) + A.sellerStartSteps * s : this.market.maxPrice;
    return this.withStore ? StoreSystem.bid(this.state, this.market) - A.buyerStartSteps * s : this.market.minPrice;
  }
  /** Only while the declaration lasts; afterwards the role is fixed. Returns true when the entry now has the requested role. */
  setRole(id, role) {
    const e = this.entry(id);
    if (!e) return false;
    if (e.role === role) return true;
    if (!this.canDeclare()) return false;
    e.role = role; e.roleSince = this.clock;
    if (role !== ROLE.OUT) this.setPrice(id, this.rolePrice(role));
    return true;
  }
  /**
   * [Atari code] a colonist at or below its critical level cannot sell: in Standard only computers are stopped (humans may sell below
   * it), in Beginner everyone.
   */
  atCritical(ownerId) {
    const p = playerById(this.state, ownerId);
    if (!p || !this.market.critical) return false;
    if (p.isHuman && !levelRules(this.state).criticalBlocksAll) return false;
    return ResourceLedger.stock(this.state, ownerId, this.market.id) <= this.market.critical(this.state, p);
  }
  /** A line that can trade right now: a seller with a unit it may sell, a buyer that can pay its own price (the store when it is in). */
  _active(e) {
    if (e.role === ROLE.OUT) return false;
    if (e.isStore) return true;
    if (e.role === ROLE.SELLER) return this.market.createLot(this.state, e.ownerId).transferable && !this.atCritical(e.ownerId);
    return ResourceLedger.cash(this.state, e.ownerId) >= e.price;
  }
  /** [FN] a buyer can't go above the lowest active seller line, a seller can't go below the highest active buyer line. */
  _bounds(e) {
    let lo = this.market.minPrice; let hi = this.priceCap(e);
    if (!e.isStore && e.role !== ROLE.OUT) {
      const opp = e.role === ROLE.BUYER ? ROLE.SELLER : ROLE.BUYER;
      this.entries.filter((o) => o.ownerId !== e.ownerId && o.role === opp && this._active(o)).forEach((o) => {
        if (e.role === ROLE.BUYER) hi = Math.min(hi, o.price); else lo = Math.max(lo, o.price);
      });
    }
    return { lo, hi: Math.max(lo, hi) };
  }
  setPrice(id, price) {
    const e = this.entry(id); const b = this._bounds(e); const s = this.market.step;
    e.priceF = clamp(price, b.lo, b.hi);
    e.price = clamp(Math.round(e.priceF / s) * s, b.lo, b.hi);
  }
  /** Continuous marker movement (hold a key / wheel): dir in {-1, +1}. */
  nudge(id, dir, dtMs, stepsPerSec) {
    const e = this.entry(id);
    this.setPrice(id, e.priceF + dir * this.market.step * stepsPerSec * dtMs / 1000);
  }
  /** A human moved a marker: [Atari code] while a stick is pushed the clock runs at the full ATU. */
  push() { this.pushMs = CONFIG.AUCTION.pushMs; }
  /** The store's price P of this good ([Atari code]; its buy / sell lines are P - buyOff / P + sellOff). */
  centralPrice() { return StoreSystem.price(this.state, this.market); }

  /** [Atari code][C64] the store's lines stay on its buy / sell prices; it sells only while it has stock and buys up to its cap. */
  _updateStore() {
    const stock = this.state.store.stock[this.market.id] || 0;
    const sb = this.entry('store-b'); const ss = this.entry('store-s');
    ss.price = ss.priceF = StoreSystem.ask(this.state, this.market);
    sb.price = sb.priceF = StoreSystem.bid(this.state, this.market);
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
  /** First touching pair (buyer line at or above the seller line) whose trade is allowed; a blocked touching pair posts a notice. */
  _findPair() {
    const buyers = this._order(this.entries.filter((e) => e.role === ROLE.BUYER), -1);
    const sellers = this._order(this.entries.filter((e) => e.role === ROLE.SELLER), 1);
    for (const b of buyers) {
      for (const s of sellers) {
        if (b.ownerId === s.ownerId || b.price < s.price) continue;
        const chk = this._check(b, s, s.price);
        if (chk.ok) return { b, s, price: s.price };
        if (chk.reason === 'critical') this._notify('critical', s.ownerId);
        else if (chk.reason === 'no_cash') this._notify('no_cash', b.ownerId);
      }
    }
    return null;
  }
  /** Notices shown on screen ([C64] "SELLER AT CRITICAL LEVEL!", "BUYER'S STRAPPED", "STORE HAS RUN DRY!"). */
  _notify(kind, id) { this.notice = { kind, id, at: this.clock }; }
  _check(b, s, price) {
    const lot = this.market.createLot(this.state, s.ownerId);
    if (!lot.transferable) return { ok: false, reason: 'no_stock' };
    if (!s.isStore && this.atCritical(s.ownerId)) return { ok: false, reason: 'critical' };
    if (b.isStore) { if ((this.state.store.stock[this.market.id] || 0) >= CONFIG.AUCTION.storeBuyCap) return { ok: false, reason: 'store_full' }; }
    else if (ResourceLedger.cash(this.state, b.ownerId) < price) return { ok: false, reason: 'no_cash' };
    return { ok: true, lot };
  }

  /** Atomic: either item AND credits move, or nothing changes. The price is the seller's line (where the lines touch). */
  tryTrade(b, s, price = s.price) {
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
    if (s.isStore && (this.state.store.stock[this.market.id] || 0) < 1) this._notify('store_dry', 'store');
    if (this.onTrade) this.onTrade({ buyer: b.ownerId, seller: s.ownerId, price });
    return { ok: true, price };
  }
  /** [Atari code] ms until the next unit of a contact: 12, 12, 10, 8, 6, 4, 2, 2... BTU of 4 frames. */
  static cadenceMs(n) { const c = CONFIG.AUCTION.cadenceBtu; return c[Math.min(n, c.length - 1)] * CONFIG.AUCTION.btuFrames * 1000 / CONFIG.DEV.palHz; }

  _possible() {
    const res = this.market.id;
    const sellers = this.entries.filter((e) => !e.isStore || (this.state.store.stock[res] || 0) >= 1).filter((e) => this.market.createLot(this.state, e.ownerId).transferable && !this.atCritical(e.ownerId));
    const buyers = this.entries.filter((e) => e.isStore ? (this.state.store.stock[res] || 0) < CONFIG.AUCTION.storeBuyCap : ResourceLedger.cash(this.state, e.ownerId) >= this.market.minPrice);
    return sellers.some((s) => buyers.some((b) => b.ownerId !== s.ownerId));
  }

  update(dt) {
    if (this.ended) return;
    if (this.stage === 'declare') {
      const need = this.units * this.timing.declare;
      if (dt < need) {
        this.clock += dt; this.units -= dt / this.timing.declare; this.pushMs = Math.max(0, this.pushMs - dt);
        if (this.withStore) this._updateStore();
        return;
      }
      // The rest of this update already belongs to the trade stage.
      this.clock += need; dt -= need;
      this.stage = 'trade'; this.units = this.unitsTotal = CONFIG.AUCTION.tradeUnits;
      if (dt <= 0) return;
    }
    this.clock += dt; this.t += dt;
    if (this.withStore) this._updateStore();
    const pair = this._findPair();
    if (pair) {
      const key = `${pair.b.id}|${pair.s.id}`;
      if (key !== this.contact.key) this.contact = Object.assign(AuctionEngine.noContact(), { key });
      this.contact.ms += dt;
      const need = AuctionEngine.cadenceMs(this.contact.n);
      if (this.contact.ms >= need) {
        this.contact.ms -= need;
        if (this.tryTrade(pair.b, pair.s, pair.price).ok) { this.contact.n += 1; this.contact.units += 1; }
      }
    } else if (this.contact.key) this.contact = AuctionEngine.noContact();
    const tick = pair ? this.timing.contact : this.pushMs > 0 ? this.timing.push : this.timing.idle;
    this.units = Math.max(0, this.units - dt / tick);
    this.pushMs = Math.max(0, this.pushMs - dt);
    this.allOutMs = this.colonistEntries.every((e) => e.role === ROLE.OUT) ? this.allOutMs + dt : 0;
    this.noOpMs = this._possible() ? 0 : this.noOpMs + dt;
    if (this.units <= 0) this._end('time');
    else if (this.allOutMs >= CONFIG.AUCTION.allOutMs) this._end('all_out');
    else if (this.noOpMs >= CONFIG.AUCTION.noOpMs) this._end('no_ops');
  }
  _end(reason) { this.ended = true; this.endReason = reason; }
  get result() {
    return { res: this.market.id, volume: this.volume, min: this.min, max: this.max, avg: this.volume ? Math.round(this.sum / this.volume) : null, reason: this.endReason };
  }
}
