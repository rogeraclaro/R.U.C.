'use strict';
class ReportScreen {
  draw(game, r) {
    const mode = game.rt.reportMode;
    r.asset('bg_irata_sky', 0, 0, CONFIG.W, CONFIG.H); r.dim(0.6);
    Hud.draw(game, r);
    if (mode === 'status') this.drawStatus(game, r); else this.drawTurn(game, r);
    if (game.debug) game.drawDebugBar(r);
  }
  /** The settlement, with the old reserve and the new harvest shown separately. */
  drawStatus(game, r) {
    const s = game.state; const st = s.settlement; const res = enabledResources(s);
    r.panel(40, 70, 1200, 640, {});
    r.text(`Estat del torn ${s.turn}: reserva, consum, malbaratament i collita`, 70, 84, { size: 26, color: COL.amber });
    r.wrap(`Cada colon menja ${st.need} de menjar. Després es malbarata el 50% del menjar i el 25% de l'energia que queden a la reserva (${res.length > 3 ? 'smithore i crystite' : 'smithore'}: només per sobre de 50). La collita nova arriba després i no es malbarata.`, 70, 122, 1140, 22, { size: 16, color: COL.dim });
    const colW = res.length > 3 ? 232 : 310; const cx = (k) => 280 + k * colW;
    r.text('Cada casella: reserva − ús − malbaratat + collita nova = final', 280, 168, { size: 16, color: COL.cyan, maxW: 930 });
    res.forEach((d, k) => { r.icon(d.id, cx(k), 190, 22); r.text(d.label, cx(k) + 28, 192, { size: 16, color: COL.dim, maxW: colW - 40 }); });
    st.rows.forEach((row, i) => {
      const p = playerById(s, row.playerId); const y = 224 + i * 86;
      r.glyph(p.shape, 80, y + 12, 9, p.color, '#05070d');
      r.text(p.name, 100, y, { size: 20, color: p.isHuman ? COL.amber : COL.text, maxW: 170 });
      res.forEach((d, k) => r.text(`${row.start[d.id]} −${row.used[d.id]} −${row.spoiled[d.id]} +${row.produced[d.id]}${row.lost && row.lost[d.id] ? ` −${row.lost[d.id]}` : ''} = ${row.final[d.id]}`, cx(k), y, { size: res.length > 3 ? 18 : 20, maxW: colW - 10 }));
      const notes = [];
      if (row.missingFood) notes.push(`falta menjar ${row.missingFood}: el temps de desenvolupament depèn del menjar que tinguis a l'inici del torn`);
      if (row.stopped) notes.push(`${row.stopped} RUC sense energia (aturat)`);
      const hit = row.items.filter((it) => it.zeroed).map((it) => `parcel·la #${it.plotId + 1}: ${it.zeroed === 'pest' ? 'plaga' : 'pirates'}`);
      if (hit.length) notes.push(`collita perduda (${hit.join(', ')})`);
      res.forEach((d) => { if (row.lost && row.lost[d.id] > 0) notes.push(`els pirates s'enduen ${row.lost[d.id]} de ${d.label.toLowerCase()} de la reserva`); });
      r.text(notes.join(' · ') || 'cap penalització', 100, y + 30, { size: 16, color: notes.length ? COL.bad : COL.dim, maxW: 1100 });
    });
    r.button('rep-next', 'A les subhastes', 500, 640, 280, 50, { primary: true, onClick: () => game.skipPhase() });
  }
  drawTurn(game, r) {
    const s = game.state; const rk = game.rt.turnRank;
    r.panel(40, 70, 1200, 640, {});
    r.text(`Informe del torn ${s.turn}`, 70, 84, { size: 28, color: COL.amber });
    // Goods columns follow the game's resources (Tournament adds crystite); plots, RUCs, worth and rank shift right after them.
    const goods = enabledResources(s); const gx = (j) => 400 + j * 96; const after = gx(goods.length) + 14;
    const cols = [['Colon', 70], ['Efectiu', 280]].concat(goods.map((d, j) => [d.label, gx(j)]), [['Parc.', after], ['RUC', after + 70], ['Patrimoni', after + 150], ['Pos.', after + 290]]);
    cols.forEach(([h, x]) => r.text(h, x, 132, { size: 16, color: COL.dim }));
    rk.forEach((row, i) => {
      const p = row.p; const y = 160 + i * 42;
      r.glyph(p.shape, 80, y + 12, 9, p.color, '#05070d');
      r.text(p.name, 100, y, { size: 18, color: p.isHuman ? COL.amber : COL.text, maxW: 160 });
      r.text(String(p.cash), 280, y, { size: 18 });
      goods.forEach((d, j) => r.text(String(p.inventory[d.id]), gx(j), y, { size: 18 }));
      r.text(String(s.plots.filter((q) => q.ownerId === p.id).length), after, y, { size: 18 });
      r.text(String(s.plots.filter((q) => q.ownerId === p.id && q.ruc).length), after + 70, y, { size: 18 });
      r.text(fmtCr(row.b.total), after + 150, y, { size: 18, color: COL.amber });
      r.text(`#${i + 1}`, after + 290, y, { size: 18 });
    });
    r.text('Subhastes', 70, 340, { size: 20, color: COL.cyan });
    (game.rt.auctionSummary || []).forEach((a, i) => {
      const d = RESOURCE_DEFS[a.res]; const y = 372 + i * 30;
      r.icon(a.res, 70, y - 2, 24);
      r.text(`${d.label}: volum ${a.volume}${a.volume ? ` · mín ${a.min} · mitjà ${a.avg} · màx ${a.max}` : ' · sense operacions'}`, 104, y, { size: 18, maxW: 620 });
    });
    r.text('Botiga', 760, 340, { size: 20, color: COL.cyan });
    const st = game.rt.storeReport || { rucsMade: 0 };
    r.text(`RUCs fabricats: ${st.rucsMade} (corral ${s.store.ruc})`, 760, 372, { size: 18, maxW: 460 });
    r.text('Sense reposició gratuïta de menjar ni energia.', 760, 402, { size: 16, color: COL.dim, maxW: 460 });
    enabledResources(s).forEach((d, i) => r.text(`${d.label}: ${s.store.stock[d.id]} u · preu ${StoreSystem.price(s, d)} cr (compra ${StoreSystem.bid(s, d)} · ven ${StoreSystem.ask(s, d)})`, 760, 432 + i * 26, { size: 16, maxW: 460 }));
    const surv = ScoringSystem.survival(s);
    r.text(`Patrimoni de la colònia: ${surv.combined} cr (cal ${surv.needCombined} al final del torn ${lastRound(s)})`, 70, 530, { size: 18, color: surv.survives ? COL.good : COL.amber, maxW: 1100 });
    (s.event && s.event.items || []).slice(0, 3).forEach((ev, i) => r.text(`${ev.scope === 'planet' ? 'Planetari' : 'Individual'}: ${ev.text}`, 70, 566 + i * 24, { size: 16, color: COL.dim, maxW: 1140, fit: true }));
    r.button('rep-next', s.turn >= lastRound(s) ? 'Veure el resultat final' : 'Torn següent', 470, 646, 340, 52, { primary: true, size: 20, onClick: () => game.skipPhase() });
  }
}
