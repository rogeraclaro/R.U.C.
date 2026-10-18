'use strict';
/**
 * Land auction ([C64] "LAND AUCTION"): the same lanes as the goods auction, but every colonist except the seller is a bidder whose
 * marker rises from below the start line; a mini map on the right shows the plot. Messages are faithful Catalan translations of the
 * C64 strings: "BIDS START AT $", "HIGH BID IS $", "NO BIDS TENDERED", "PLOT IS SOLD!", "PLOT DIDN'T SELL!", "SALE PRICE: $".
 */
class LandAuctionScreen {
  /** ↑ / ↓ are polled every tick (Game.updateLandInput); Enter / Space close the result card. */
  onKey(game, e) {
    const la = game.landAuction(); if (!la || game.paused) return false;
    if ((e.key === 'Enter' || e.key === ' ') && la.stage === 'result') { game.landNext(); return true; }
    return e.key === 'ArrowUp' || e.key === 'ArrowDown';
  }
  /** Price window: from the bidders' bottom line up to a top that only grows during the lot. */
  view(game, la) {
    const lo = LandAuction.bottom(la);
    const top = Math.max(...Object.values(la.bids).map((b) => b.price), la.lot.start);
    const want = Math.ceil((top + 80) / 20) * 20;
    game.rt.landView = game.rt.landView || { hi: 0 };
    game.rt.landView.hi = Math.max(game.rt.landView.hi, want, la.lot.start + 160);
    return { lo, hi: game.rt.landView.hi };
  }
  priceY(v, price) { return AUC.bottom - (price - v.lo) / (v.hi - v.lo) * (AUC.bottom - AUC.top); }
  yPrice(v, y) { return v.lo + (AUC.bottom - y) / (AUC.bottom - AUC.top) * (v.hi - v.lo); }
  laneX(i) { return AUC.lanesX + i * AUC.laneStep; }
  /** The high bid; once the lot is resolved, the recorded sale (net worths have changed since, so a tie could resolve differently). */
  high(s, la) {
    if (la.stage === 'result') return la.result && la.result.sold ? { pid: la.result.buyer, price: la.result.price } : null;
    return LandAuction.highBid(s, la);
  }
  sellerName(s, la) { return la.lot.sellerId === 'colony' ? 'la colònia' : playerById(s, la.lot.sellerId).name; }
  draw(game, r) {
    const s = game.state; const la = game.landAuction(); const ctx = r.ctx;
    r.asset('auction_hall_bg', 0, 0, CONFIG.W, CONFIG.H); r.dim(0.35);
    Hud.draw(game, r);
    r.text('Subhasta de terres', 16, 64, { size: 24, color: COL.amber });
    if (!la || !la.lot) { if (game.debug) game.drawDebugBar(r); return; }
    const bidding = la.stage === 'bid' && !game.paused;
    const frac = la.stage === 'bid' ? la.units / la.unitsTotal : la.stage === 'intro' ? 1 : 0;
    r.bar(400, 62, 560, 14, frac, frac < 0.2 ? COL.bad : COL.cyan);
    r.text(`${Math.ceil(la.stage === 'bid' ? la.units : la.stage === 'intro' ? la.unitsTotal : 0)}`, 972, 60, { size: 20 });
    const v = this.view(game, la); const py = (p) => clamp(this.priceY(v, p), AUC.top - 8, AUC.bottom + 8);
    r.panel(AUC.axisX - 4, AUC.top - 26, AUC.laneStep * 4 + 30, AUC.bottom - AUC.top + 80, { fill: 'rgba(6,9,18,0.55)', frame: false });
    const right = AUC.lanesX + AUC.laneStep * 4 - 6;
    const range = v.hi - v.lo; const tick = range > 400 ? 100 : range > 200 ? 40 : 20;
    for (let p = Math.ceil(v.lo / tick) * tick; p <= v.hi; p += tick) {
      const y = this.priceY(v, p);
      ctx.strokeStyle = 'rgba(180,200,230,0.16)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(AUC.lanesX, y + 0.5); ctx.lineTo(right, y + 0.5); ctx.stroke();
      r.text(String(p), AUC.axisX - 6, y - 9, { size: 16, color: COL.dim, align: 'right' });
    }
    // [C64] "BIDS START AT $160": the start line
    const sy = py(la.lot.start);
    ctx.setLineDash([10, 6]); ctx.strokeStyle = COL.amber; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(AUC.lanesX, sy); ctx.lineTo(right, sy); ctx.stroke(); ctx.setLineDash([]);
    r.text(`Les ofertes comencen a ${la.lot.start} cr`, AUC.lanesX + 6, sy + 4, { size: 16, color: COL.amber });
    const high = this.high(s, la);
    if (high) {
      const hy = py(high.price);
      ctx.strokeStyle = COL.good; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(AUC.lanesX, hy); ctx.lineTo(right, hy); ctx.stroke();
      r.text(`Oferta més alta: ${high.price} cr`, AUC.lanesX + 6, hy - 22, { size: 16, color: COL.good });
    }
    s.players.forEach((p, i) => {
      const lx = this.laneX(i); const bid = la.bids[p.id];
      ctx.strokeStyle = p.color; ctx.globalAlpha = 0.35; ctx.lineWidth = 2; ctx.strokeRect(lx + 0.5, AUC.top - 24, AUC.laneW, AUC.bottom - AUC.top + 48); ctx.globalAlpha = 1;
      r.glyph(p.shape, lx + 14, AUC.top - 40, 8, p.color, '#05070d');
      r.text(p.name, lx + 28, AUC.top - 50, { size: 16, maxW: 110 });
      r.text(bid ? 'POSTOR' : 'VENEDOR', lx + 6, AUC.top - 26, { size: 16, color: bid ? COL.text : COL.amber });
      if (bid) {
        const y = py(bid.price); const bx = lx + 60;
        game.screens.auction.drawMarker(r, ROLE.BUYER, bx, y, p.color, p.shape, la.stage !== 'bid');
        r.text(String(bid.price), bx + 16, y - 9, { size: 16, color: bid.price >= la.lot.start ? COL.text : COL.dim });
      }
      r.text(`${p.cash} cr`, lx + 6, AUC.bottom + 44, { size: 16, color: COL.dim, maxW: AUC.laneW - 8 });
    });
    if (la.bids.p0) {
      const drag = (y) => { if (bidding) game.landBid(this.yPrice(v, y)); };
      r.region('la-lane', this.laneX(0), AUC.top - 24, AUC.laneW, AUC.bottom - AUC.top + 48, {
        label: 'La teva oferta', onDown: (x, y) => drag(y), onMove: (x, y, down) => { if (down) drag(y); },
        onWheel: (dy) => { if (bidding) game.landBid(la.bids.p0.price + (dy < 0 ? 1 : -1) * CONFIG.LAND_AUCTION.step); }
      });
    }
    this.drawPlotPanel(game, r, la);
    const Y = 610;
    r.panel(16, Y - 8, 1248, 104, {});
    const canBid = bidding && !!la.bids.p0; const step = CONFIG.LAND_AUCTION.step;
    r.button('la-up', `Puja ▲ ${step * 4} cr`, 30, Y, 200, 48, { disabled: !canBid, onClick: () => game.landBid(la.bids.p0.price + step * 4) });
    r.button('la-down', `Baixa ▼ ${step * 4} cr`, 240, Y, 200, 48, { disabled: !canBid, onClick: () => game.landBid(la.bids.p0.price - step * 4) });
    const hint = game.isDemo() ? 'Demostració: els ordinadors pugen les seves ofertes.' : game.humanIds().length > 1 ? 'Cada jugador puja la seva oferta alhora: J1 ↑/↓, J2 W/S, J3 I/K, J4 8/5 (mantén-ho premut). Guanya l\'oferta més alta quan s\'acaba el temps.'
      : !la.bids.p0 ? `Ets el venedor: els altres colons fan les ofertes per la teva parcel·la.`
      : '↑/↓ (mantén-ho premut; Maj ×3), arrossega al teu carril o roda: puja la teva oferta. Guanya l\'oferta més alta quan s\'acaba el temps.';
    r.wrap(hint, 460, Y + 2, 790, 22, { size: 16, color: COL.dim });
    if (la.stage === 'intro') this.drawIntro(r, la, s);
    if (la.stage === 'result') this.drawResult(game, r, la);
    if (game.debug) game.drawDebugBar(r);
  }
  /** Mini map with the plot on auction framed, plus the lot's facts. */
  drawPlotPanel(game, r, la) {
    const s = game.state; const X = 752; const Y = 100; const W = 512; const T = W / CONFIG.COLS; const ctx = r.ctx;
    r.panel(X - 8, Y - 8, W + 16, 494, {});
    ctx.drawImage(MapLayer.get(game), X, Y, W, T * CONFIG.ROWS);
    s.plots.forEach((p) => {
      if (!p.ownerId) return;
      const o = playerById(s, p.ownerId); ctx.strokeStyle = o.color; ctx.lineWidth = 3; ctx.strokeRect(X + p.x * T + 2, Y + p.y * T + 2, T - 4, T - 4);
    });
    const plot = s.plots[la.lot.plotId]; const px = X + plot.x * T; const pyy = Y + plot.y * T;
    const pulse = 0.55 + 0.45 * Math.abs(Math.sin(game.now / 300));
    ctx.globalAlpha = pulse; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.strokeRect(px - 2, pyy - 2, T + 4, T + 4); ctx.globalAlpha = 1;
    const y0 = Y + T * CONFIG.ROWS + 16;
    r.text(`Parcel·la #${plot.id + 1}`, X, y0, { size: 22, color: COL.amber });
    r.text(`${terrainName(plot)}${plot.terrain === TERRAIN.MOUNTAIN ? ` · ${plot.richness} cims` : ''}${plot.ruc ? ` · RUC de ${resLabel(plot.ruc.module).toLowerCase()}` : ''}`, X, y0 + 30, { size: 18, maxW: W });
    r.text(`Ven: ${this.sellerName(s, la)}`, X, y0 + 56, { size: 18, maxW: W });
    r.text(`Les ofertes comencen a ${la.lot.start} cr`, X, y0 + 82, { size: 18, color: COL.amber, maxW: W });
    const high = this.high(s, la);
    r.text(high ? `Oferta més alta: ${high.price} cr (${playerById(s, high.pid).name})` : 'Encara no hi ha cap oferta', X, y0 + 108, { size: 18, color: high ? COL.good : COL.dim, maxW: W });
  }
  drawIntro(r, la, s) {
    r.panel(240, 250, 480, 170, {});
    r.text('Subhasta de terres', 480, 266, { size: 28, color: COL.amber, align: 'center' });
    r.text(`Parcel·la #${la.lot.plotId + 1} · ven ${this.sellerName(s, la)}`, 480, 312, { size: 20, align: 'center', maxW: 450 });
    r.text(`Les ofertes comencen a ${la.lot.start} cr`, 480, 352, { size: 22, color: COL.good, align: 'center', maxW: 450 });
  }
  drawResult(game, r, la) {
    const res = la.result; const s = game.state;
    r.panel(240, 230, 480, 230, {});
    if (res.sold) {
      r.text('Parcel·la venuda!', 480, 246, { size: 30, color: COL.good, align: 'center' });
      r.text(`Preu de venda: ${res.price} cr`, 480, 296, { size: 24, align: 'center' });
      r.text(`Comprador: ${playerById(s, res.buyer).name}`, 480, 332, { size: 20, color: COL.dim, align: 'center' });
    } else {
      r.text('Sense ofertes', 480, 246, { size: 30, color: COL.amber, align: 'center' });
      r.text('La parcel·la no s\'ha venut!', 480, 296, { size: 24, align: 'center' });
    }
    r.button('la-next', 'Continuar', 380, 390, 200, 50, { primary: true, onClick: () => game.landNext() });
  }
}
