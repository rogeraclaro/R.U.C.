'use strict';
const AUC = { axisX: 100, lanesX: 120, laneStep: 152, laneW: 146, storeX: 736, storeW: 140, sliderX: 912, top: 156, bottom: 536, statsX: 984 };
/** [C64] auction messages, faithful Catalan ("SELLER AT CRITICAL LEVEL!", "BUYER'S STRAPPED", "STORE HAS RUN DRY!"). */
const AUCTION_NOTICES = { critical: 'Venedor al nivell crític!', no_cash: 'El comprador no té diners', store_dry: 'La botiga s\'ha quedat sense estoc!' };

class AuctionScreen {
  /** The price axis is a window [lo, hi] that only grows during an auction (colonists may bid past the store ceiling). */
  priceY(v, price) { return AUC.bottom - (price - v.lo) / (v.hi - v.lo) * (AUC.bottom - AUC.top); }
  yPrice(v, y) { return v.lo + (AUC.bottom - y) / (AUC.bottom - AUC.top) * (v.hi - v.lo); }
  laneX(i) { return AUC.lanesX + i * AUC.laneStep; }
  /** Declaration: ↑/→ seller, ↓/← buyer, Space in/out. Trade stage: held ↑/↓ are polled by Game.updateAuctionInput. */
  onKey(game, e) {
    const a = game.rt.auction; if (!a || a.engine.ended || game.paused) return false;
    if (a.engine.canDeclare()) {
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { game.auctionRole(ROLE.SELLER); return true; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { game.auctionRole(ROLE.BUYER); return true; }
      if (e.key === ' ' || e.key === 'Spacebar') { game.auctionToggleOut(); return true; }
    }
    return e.key === 'ArrowUp' || e.key === 'ArrowDown';
  }
  drawMarker(r, kind, x, y, color, shape, dim) {
    const c = r.ctx; c.save(); c.globalAlpha = dim ? 0.55 : 1;
    c.fillStyle = color; c.strokeStyle = '#05070d'; c.lineWidth = 3; c.beginPath();
    if (kind === ROLE.BUYER) { c.moveTo(x - 10, y - 12); c.lineTo(x + 12, y); c.lineTo(x - 10, y + 12); } else { c.moveTo(x + 10, y - 12); c.lineTo(x - 12, y); c.lineTo(x + 10, y + 12); }
    c.closePath(); c.stroke(); c.fill(); c.restore();
    r.glyph(shape, x + (kind === ROLE.BUYER ? -2 : 2), y, 4, '#05070d', null);
  }
  draw(game, r) {
    const s = game.state; const a = game.rt.auction; const e = a.engine; const m = e.market; const human = s.players[0];
    const v = game.auctionView(); const py = (p) => clamp(this.priceY(v, p), AUC.top - 8, AUC.bottom + 8);
    const declaring = e.canDeclare(); const live = !game.paused && !e.ended;
    r.asset('auction_hall_bg', 0, 0, CONFIG.W, CONFIG.H); r.dim(0.35);
    Hud.draw(game, r);
    r.icon(m.id, 16, 62, 30);
    r.text(`Subhasta de ${m.label.toLowerCase()}`, 54, 64, { size: 24, color: COL.amber });
    // [C64] time bar in units: declaration 31, trading 72 (slower while a trade runs or a stick is pushed).
    const frac = e.units / e.unitsTotal;
    r.bar(400, 62, 560, 14, frac, declaring ? COL.amber : frac < 0.2 ? COL.bad : COL.cyan);
    r.text(`${Math.ceil(e.units)}`, 972, 60, { size: 20, color: declaring ? COL.amber : COL.text });
    if (declaring) r.text('Declareu-vos compradors o venedors', 400, 80, { size: 16, color: COL.amber });
    else if (e.contact.key && e.contact.units) r.text(`${e.contact.units} unitats negociades`, 400, 80, { size: 16, color: COL.good });
    const note = e.notice && e.clock - e.notice.at < 1500 ? AUCTION_NOTICES[e.notice.kind] : null;
    if (note) r.text(note, 960, 80, { size: 16, color: COL.bad, align: 'right' });
    r.panel(AUC.axisX - 4, AUC.top - 26, AUC.storeX + AUC.storeW - AUC.axisX + 12, AUC.bottom - AUC.top + 80, { fill: 'rgba(6,9,18,0.55)', frame: false });
    // price axis
    const range = v.hi - v.lo; const tick = range > 400 ? 100 : range > 200 ? 40 : range > 120 ? 20 : 10;
    for (let p = Math.ceil(v.lo / tick) * tick; p <= v.hi; p += tick) {
      const y = this.priceY(v, p);
      r.ctx.strokeStyle = 'rgba(180,200,230,0.16)'; r.ctx.lineWidth = 1; r.ctx.beginPath(); r.ctx.moveTo(AUC.lanesX, y + 0.5); r.ctx.lineTo(AUC.storeX + AUC.storeW, y + 0.5); r.ctx.stroke();
      r.text(String(p), AUC.axisX - 6, y - 9, { size: 16, color: COL.dim, align: 'right' });
    }
    if (m.maxPrice <= v.hi) {
      const yc = this.priceY(v, m.maxPrice);
      r.ctx.strokeStyle = COL.bad; r.ctx.lineWidth = 1; r.ctx.beginPath(); r.ctx.moveTo(AUC.lanesX, yc); r.ctx.lineTo(AUC.storeX + AUC.storeW, yc); r.ctx.stroke();
      r.text(`sostre de botiga ${m.maxPrice}`, AUC.lanesX + 6, yc - 20, { size: 16, color: COL.bad });
    }
    const cy = py(e.centralPrice());
    r.ctx.setLineDash([10, 6]); r.ctx.strokeStyle = COL.amber; r.ctx.lineWidth = 2; r.ctx.beginPath(); r.ctx.moveTo(AUC.lanesX, cy); r.ctx.lineTo(AUC.storeX + AUC.storeW, cy); r.ctx.stroke(); r.ctx.setLineDash([]);
    r.text(`preu botiga ${e.centralPrice()}`, this.laneX(2) + 6, cy - 20, { size: 16, color: COL.amber });
    // lanes
    s.players.forEach((p, i) => {
      const lx = this.laneX(i); const en = e.entry(p.id);
      r.ctx.strokeStyle = p.color; r.ctx.globalAlpha = 0.35; r.ctx.lineWidth = 2; r.ctx.strokeRect(lx + 0.5, AUC.top - 24, AUC.laneW, AUC.bottom - AUC.top + 48); r.ctx.globalAlpha = 1;
      r.glyph(p.shape, lx + 14, AUC.top - 40, 8, p.color, '#05070d');
      r.text(p.name, lx + 28, AUC.top - 50, { size: 16, maxW: 110 });
      r.text(en.role === ROLE.BUYER ? 'COMPRADOR' : en.role === ROLE.SELLER ? 'VENEDOR' : 'FORA', lx + 6, AUC.top - 26, { size: 16, color: en.role === ROLE.OUT ? COL.dim : COL.text });
      if (en.role !== ROLE.OUT) {
        const y = py(en.price); const bx = lx + (en.role === ROLE.BUYER ? 36 : 110);
        this.drawMarker(r, en.role, bx, y, p.color, p.shape, declaring);
        r.text(String(en.price), en.role === ROLE.BUYER ? bx + 16 : bx - 46, y - 9, { size: 16 });
      }
      this.drawStock(r, game, p, m, lx);
      r.text(`${p.cash} cr`, lx + 6, AUC.bottom + 44, { size: 16, color: COL.dim, maxW: AUC.laneW - 8 });
    });
    // store lane
    const sb = e.entry('store-b'); const ss = e.entry('store-s'); const sx = AUC.storeX; const stock = s.store.stock[m.id] || 0;
    r.ctx.strokeStyle = COL.amber; r.ctx.globalAlpha = 0.5; r.ctx.lineWidth = 2; r.ctx.strokeRect(sx + 0.5, AUC.top - 24, AUC.storeW, AUC.bottom - AUC.top + 48); r.ctx.globalAlpha = 1;
    r.text('BOTIGA', sx + 6, AUC.top - 50, { size: 16, color: COL.amber });
    r.text(`estoc ${stock}`, sx + 6, AUC.top - 26, { size: 16, color: COL.dim });
    // [C64] "STORE HAS N UNITS" while the colonists declare.
    if (declaring) r.text(`La botiga té ${stock} unitats`, sx + 6, AUC.bottom + 44, { size: 16, color: COL.amber, maxW: AUC.storeW + 160 });
    if (sb.role !== ROLE.OUT) { this.drawMarker(r, ROLE.BUYER, sx + 34, py(sb.price), COL.amber, 'square', declaring); r.text(String(sb.price), sx + 50, py(sb.price) - 9, { size: 16 }); }
    if (ss.role !== ROLE.OUT) { this.drawMarker(r, ROLE.SELLER, sx + 104, py(ss.price), COL.amber, 'square', declaring); r.text(String(ss.price), sx + 58, py(ss.price) - 9, { size: 16 }); }
    if (!stock && !declaring) r.wrap('Sense estoc: preu lliure', sx + 6, AUC.bottom + 28, AUC.storeW - 10, 18, { size: 16, color: COL.bad });
    // contact: [Atari code] while a buyer's and a seller's lines touch, units change hands one by one (the line glows)
    if (e.contact.key) {
      const [bid, sid] = e.contact.key.split('|'); const eb = e.entry(bid); const es = e.entry(sid);
      const pos = (en) => { if (en.isStore) return { x: en.id === 'store-b' ? sx + 34 : sx + 104, y: py(en.price) }; const i = s.players.findIndex((q) => q.id === en.id); return { x: this.laneX(i) + (en.role === ROLE.BUYER ? 36 : 110), y: py(en.price) }; };
      const pb = pos(eb); const ps = pos(es);
      r.ctx.strokeStyle = COL.good; r.ctx.lineWidth = 4; r.ctx.beginPath(); r.ctx.moveTo(pb.x, pb.y); r.ctx.lineTo(ps.x, ps.y); r.ctx.stroke();
    }
    // recent trade flashes
    e.trades.slice(-3).forEach((tr) => {
      const age = e.t - tr.t; if (age > 1500) return;
      r.text(`✔ ${tr.price} cr`, AUC.storeX + AUC.storeW + 10, py(tr.price) - age / 40, { size: 18, color: COL.good });
    });
    // slider (touch friendly) + lane pointer control for the human: prices only move in the trade stage
    const hen = e.entry('p0'); const sy = py(hen.price); const trading = live && !declaring;
    r.ctx.fillStyle = 'rgba(20,28,48,0.9)'; r.ctx.fillRect(AUC.sliderX + 14, AUC.top, 8, AUC.bottom - AUC.top);
    r.ctx.fillStyle = hen.role === ROLE.OUT ? COL.dim : COL.cyan; r.ctx.fillRect(AUC.sliderX + 6, sy - 10, 24, 20);
    r.text(String(hen.price), AUC.sliderX + 18, AUC.top - 26, { size: 20, color: COL.cyan, align: 'center' });
    const drag = (y) => { if (trading) { e.setPrice('p0', this.yPrice(v, y)); e.push(); } };
    r.region('a-slider', AUC.sliderX - 6, AUC.top - 10, 48, AUC.bottom - AUC.top + 20, { label: 'Preu', onDown: (x, y) => drag(y), onMove: (x, y, down) => { if (down) drag(y); } });
    r.region('a-lane', this.laneX(0), AUC.top - 24, AUC.laneW, AUC.bottom - AUC.top + 48, {
      label: 'El teu carril',
      onDown: (x, y) => {
        if (!live) return;
        if (declaring) game.auctionRole(x < this.laneX(0) + AUC.laneW / 2 ? ROLE.BUYER : ROLE.SELLER);
        else drag(y);
      },
      onMove: (x, y, down) => { if (down) drag(y); },
      onWheel: (dy) => { if (trading) { e.nudge('p0', dy < 0 ? 1 : -1, 1000, 3); e.push(); } }
    });
    // stats
    const X = AUC.statsX;
    r.panel(X, 100, 280, 462, {});
    r.text('El teu estat', X + 12, 108, { size: 18, color: COL.cyan });
    r.text(`${m.label}: ${human.inventory[m.id]} u`, X + 12, 134, { size: 18 }); r.text(`Efectiu: ${human.cash} cr`, X + 12, 158, { size: 18, color: COL.amber });
    r.text('Operacions', X + 12, 194, { size: 18, color: COL.cyan });
    const res = e.result;
    r.text(`Volum ${res.volume}`, X + 12, 220, { size: 16 });
    r.text(res.volume ? `mín ${res.min} · mitjà ${res.avg} · màx ${res.max}` : 'sense operacions encara', X + 12, 244, { size: 16, maxW: 256 });
    this.drawChart(r, e, v, X + 12, 282, 256, 150);
    e.trades.slice(-4).reverse().forEach((tr, i) => r.text(`${Math.floor(tr.t / 1000)}s ${playerById(s, tr.buyer) ? playerById(s, tr.buyer).name : 'Botiga'} ← ${playerById(s, tr.seller) ? playerById(s, tr.seller).name : 'Botiga'} ${tr.price}`, X + 12, 442 + i * 26, { size: 16, maxW: 260 }));
    // human controls: roles only during the declaration, prices only afterwards
    const Y = 610;
    r.panel(16, Y - 8, 1248, 104, {});
    r.button('a-buy', '◀ COMPRADOR (↓)', 30, Y, 230, 48, { checked: hen.role === ROLE.BUYER, disabled: !live || !declaring, onClick: () => game.auctionRole(ROLE.BUYER) });
    r.button('a-sell', 'VENEDOR (↑) ▶', 270, Y, 230, 48, { checked: hen.role === ROLE.SELLER, disabled: !live || !declaring, onClick: () => game.auctionRole(ROLE.SELLER) });
    r.button('a-out', 'FORA (Espai)', 510, Y, 200, 48, { checked: hen.role === ROLE.OUT, disabled: !live || !declaring, onClick: () => game.auctionRole(ROLE.OUT) });
    r.button('a-up', 'Preu ▲', 730, Y, 120, 48, { disabled: !trading || hen.role === ROLE.OUT, onClick: () => { e.nudge('p0', 1, 1000, 4); e.push(); } });
    r.button('a-down', 'Preu ▼', 858, Y, 120, 48, { disabled: !trading || hen.role === ROLE.OUT, onClick: () => { e.nudge('p0', -1, 1000, 4); e.push(); } });
    r.text(declaring ? 'Declara: ↑/→ venedor, ↓/← comprador, Espai fora. Després el rol és fix.' : '↑/↓ o roda: preu (Maj ×3). El rol ja no es pot canviar.', 30, Y + 56, { size: 16, color: declaring ? COL.amber : COL.dim, maxW: 760 });
    r.text('Línies en contacte: unitat a unitat', 800, Y + 56, { size: 16, color: COL.dim, maxW: 450 });
    if (e.ended) this.drawEnd(game, r);
    if (game.debug) game.drawDebugBar(r);
  }
  /**
   * Units held, with the critical level ([C64] black requirement line over each player's bar; [Atari code] food: next round's need,
   * energy: non-energy M.U.L.E.s + 1, smithore: none): a horizontal bar under the lane with the requirement tick, plus a text line.
   */
  drawStock(r, game, p, m, lx) {
    const inv = p.inventory[m.id] || 0; const crit = ConsumptionSystem.criticalLevel(game.state, p, m.id);
    const scale = Math.max(10, inv, crit + 2); const w = AUC.laneW - 12; const gx = lx + 6; const gy = AUC.bottom + 28;
    r.ctx.fillStyle = 'rgba(6,9,18,0.85)'; r.ctx.fillRect(gx, gy, w, 10);
    r.ctx.fillStyle = p.color; r.ctx.fillRect(gx, gy, Math.round(w * inv / scale), 10);
    if (crit > 0) {
      const cx = Math.round(gx + w * crit / scale);
      r.ctx.fillStyle = '#ffffff'; r.ctx.fillRect(cx - 3, gy - 3, 6, 16); r.ctx.fillStyle = '#05070d'; r.ctx.fillRect(cx - 1, gy - 2, 3, 14);
    }
    r.text(crit > 0 ? `${inv}u · crític ${crit}` : `${inv} unitats`, lx + 6, AUC.bottom + 6, { size: 16, color: crit > 0 && inv <= crit ? COL.bad : COL.text, maxW: AUC.laneW - 8 });
  }
  drawChart(r, e, v, x, y, w, h) {
    const c = r.ctx;
    c.fillStyle = 'rgba(6,9,18,0.7)'; c.fillRect(x, y, w, h); c.strokeStyle = COL.border; c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    r.text(String(v.hi), x + 3, y + 2, { size: 16, color: COL.dim }); r.text(String(v.lo), x + 3, y + h - 20, { size: 16, color: COL.dim });
    const cyy = y + h - (e.centralPrice() - v.lo) / (v.hi - v.lo) * h;
    c.strokeStyle = 'rgba(255,255,255,0.15)'; c.beginPath(); c.moveTo(x, cyy); c.lineTo(x + w, cyy); c.stroke();
    c.fillStyle = COL.good;
    const n = e.trades.length;
    e.trades.forEach((tr, i) => { const px = x + 40 + (n > 1 ? i / (n - 1) : 0.5) * (w - 46); const py = y + h - (tr.price - v.lo) / (v.hi - v.lo) * h; c.fillRect(px - 3, py - 3, 6, 6); });
  }
  drawEnd(game, r) {
    const res = game.rt.auction.engine.result;
    r.dim(0.5); r.panel(340, 230, 600, 250, {});
    r.text('La subhasta s\'ha acabat', 640, 246, { size: 30, color: COL.amber, align: 'center' });
    const why = { time: 'temps esgotat', all_out: 'tots fora', no_ops: 'cap operació possible' }[res.reason] || res.reason;
    r.text(`Motiu: ${why}`, 640, 300, { size: 18, align: 'center' });
    r.text(`Volum ${res.volume}${res.volume ? ` · mín ${res.min} · mitjà ${res.avg} · màx ${res.max}` : ' · sense operacions'}`, 640, 336, { size: 20, align: 'center', maxW: 560 });
    r.button('a-next', 'Continuar', 540, 400, 200, 50, { primary: true, onClick: () => game.skipPhase() });
  }
}
