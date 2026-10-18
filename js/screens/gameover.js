'use strict';
class GameOverScreen {
  draw(game, r) {
    const s = game.state; const f = s.final;
    r.asset('bg_irata_sky', 0, 0, CONFIG.W, CONFIG.H); r.dim(0.66);
    r.panel(30, 20, 1220, 680, {});
    // [C64] "THE SHIP IS BACK!" then [Atari code] "OVERALL, THE COLONY ..." (rating 0..6) and the First Founder (rating >= 3).
    const good = !f.lack && f.rating >= CONFIG.RATING.founderMin;
    r.text(f.lack ? GameOverScreen.lackText(f.lack) : 'La nau ha tornat!', 60, 32, { size: 30, color: good ? COL.good : COL.bad, maxW: 690 });
    r.text(f.winnerId ? `First Founder: ${playerById(s, f.winnerId).name}` : 'Sense First Founder', 760, 40, { size: 24, color: COL.amber, maxW: 470 });
    if (!f.lack) r.wrap(GameOverScreen.ratingText(f.rating), 60, 72, 1150, 22, { size: 18, color: good ? COL.good : COL.amber });
    r.text(`Patrimoni de la colònia ${f.combined} cr · valoració ${f.rating}/${CONFIG.RATING.max} (cal ${CONFIG.SURVIVAL.combined} per a l'èxit).`, 60, 118, { size: 16, color: COL.dim, maxW: 1150 });
    const cols = [['Pos.', 60], ['Colon', 120], ['Efectiu', 300], ['Béns', 400], ['Parcel·les', 500], ['RUCs', 630], ['Mòduls', 720], ['Patrimoni', 830]];
    cols.forEach(([h, x]) => r.text(h, x, 146, { size: 16, color: COL.dim }));
    f.rank.forEach((row, i) => {
      const p = playerById(s, row.id); const y = 170 + i * 30; const b = row.b;
      r.text(`#${i + 1}`, 60, y, { size: 18 }); r.glyph(p.shape, 132, y + 11, 8, p.color, '#05070d');
      r.text(p.name, 150, y, { size: 18, color: p.isHuman ? COL.amber : COL.text, maxW: 140 });
      r.text(String(b.cash), 300, y, { size: 18 }); r.text(String(b.inventory), 400, y, { size: 18 }); r.text(String(b.plots), 500, y, { size: 18 });
      r.text(String(b.rucs), 630, y, { size: 18 }); r.text(String(b.modules), 720, y, { size: 18 }); r.text(String(b.total), 830, y, { size: 18, color: COL.amber });
    });
    this.drawWorthChart(game, r, 60, 326, 640, 286);
    r.text('Volum per recurs', 740, 316, { size: 18, color: COL.cyan });
    const res = auctionResources(s);
    res.forEach((d, i) => {
      const log = s.auctionLog.filter((x) => x.res === d.id); const vol = log.reduce((a, b) => a + b.volume, 0);
      r.icon(d.id, 740, 346 + i * 36, 24); r.text(`${d.label}: ${vol} unitats`, 774, 348 + i * 36, { size: 18 });
    });
    r.wrap(`Patrimoni: efectiu + béns (al preu de la botiga) + ${CONFIG.PLOT_VALUE}/parcel·la + RUCs instal·lats (${CONFIG.RUC_WORTH} + cost del mòdul). Sense cap deute.`, 740, 360 + res.length * 36, 480, 22, { size: 16, color: COL.dim });
    // The same seats again (humans with their names, colours and species; the computers fill the rest).
    const again = (seed) => game.newGame({ seed, level: s.level, humans: s.players.filter((p) => p.isHuman).map((p) => ({ name: p.name, colorId: colorIdOf(p.color), species: p.species })) });
    r.button('g-same', 'Repetir llavor', 60, 630, 240, 52, { onClick: () => again(s.seed) });
    r.button('g-new', 'Nova llavor', 320, 630, 240, 52, { primary: true, onClick: () => again(game.randomSeed()) });
    r.button('g-title', 'Títol', 580, 630, 160, 52, { onClick: () => game.goTitle() });
    r.text(`Llavor: ${s.seed}`, 780, 646, { size: 18, color: COL.dim });
  }
  /** [Atari code] the colony rating text (COLONY_RATINGS, 0..6). */
  static ratingText(rating) { return COLONY_RATINGS[clamp(rating, 0, COLONY_RATINGS.length - 1)]; }
  /** [Atari code] "THE COLONY FAILED BECAUSE OF A TOTAL LACK OF FOOD / ENERGY!", in Catalan. */
  static lackText(res) { return `La colònia ha fracassat per una manca total ${res === 'food' ? 'de menjar' : "d'energia"}!`; }
  drawWorthChart(game, r, x, y, w, h) {
    const s = game.state; const c = r.ctx; const hist = s.history;
    c.fillStyle = 'rgba(6,9,18,0.7)'; c.fillRect(x, y, w, h); c.strokeStyle = COL.border; c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    r.text('Patrimoni per torn', x + 8, y - 24, { size: 18, color: COL.cyan });
    if (!hist.length) return;
    const max = Math.max(...hist.flatMap((hh) => hh.worth), 1); const min = Math.min(...hist.flatMap((hh) => hh.worth), 0);
    const px = (i) => x + 50 + (hist.length === 1 ? 0 : i / (hist.length - 1) * (w - 70));
    const py = (v) => y + h - 24 - (v - min) / Math.max(1, max - min) * (h - 44);
    r.text(String(max), x + 4, y + 4, { size: 16, color: COL.dim }); r.text(String(min), x + 4, y + h - 44, { size: 16, color: COL.dim });
    s.players.forEach((p, k) => {
      c.strokeStyle = p.color; c.lineWidth = p.isHuman ? 4 : 2; c.setLineDash(k === 0 ? [] : k === 1 ? [10, 4] : k === 2 ? [3, 4] : [14, 4, 3, 4]); c.beginPath();
      hist.forEach((hh, i) => { if (i === 0) c.moveTo(px(i), py(hh.worth[k])); else c.lineTo(px(i), py(hh.worth[k])); }); c.stroke(); c.setLineDash([]);
      r.text(p.name, x + 60 + k * 110, y + h - 22, { size: 16, color: p.color });
    });
  }
}
