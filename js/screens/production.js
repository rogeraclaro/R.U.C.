'use strict';
class ProductionScreen {
  constructor(map) { this.map = map; }
  draw(game, r) {
    const s = game.state; const prod = game.rt.prod; const T = CONFIG.TILE;
    r.asset('bg_irata_sky', 0, 0, CONFIG.W, CONFIG.H); r.dim(0.55);
    Hud.draw(game, r);
    r.text('Producció: cada RUC de menjar o smithore gasta 1 energia', 16, 66, { size: 20, color: COL.amber, maxW: 860 });
    const order = prod.order; const t = prod.t;
    const t0 = 800; const t1 = prod.duration - 1300;
    const per = order.length ? (t1 - t0) / order.length : 1;
    const reached = new Map(); order.forEach((o, i) => reached.set(o.plotId, { o, at: t0 + i * per }));
    const fx = (plot) => {
      const rec = reached.get(plot.id);
      if (!rec) return null;
      const since = t - rec.at;
      return {
        walking: since >= 0 && since < 700 && rec.o.active,
        draw: (ctx, x, y) => {
          if (since < 0) return;
          const rise = clamp(since / 600, 0, 1);
          if (rec.o.active && rec.o.amount > 0) {
            r.icon(rec.o.module, x + 8, y + 8 - Math.round(rise * 8), 22);
            r.text(`+${rec.o.amount}`, x + 34, y + 10 - Math.round(rise * 8), { size: 18, color: COL.good });
          } else {
            ctx.fillStyle = 'rgba(6,9,18,0.8)'; ctx.fillRect(x + 4, y + 4, 88, 26);
            const why = rec.o.active ? '0' : '✕ sense E';
            r.text(why, x + 8, y + 8, { size: 16, color: COL.bad });
          }
        }
      };
    };
    this.map.drawMap(game, r, { plotFx: fx });
    // Dim every tile the animation has not reached yet.
    const ctx = r.ctx; ctx.fillStyle = 'rgba(4,6,14,0.62)';
    s.plots.forEach((p) => { const rec = reached.get(p.id); if (!rec || t < rec.at) ctx.fillRect(CONFIG.MAP_X + p.x * T, CONFIG.MAP_Y + p.y * T, T, T); });
    this.map.drawPlayers(game, r);
    const X = CONFIG.MAP_X; const Y = 590;
    r.panel(X, Y, 864, 122, {});
    if (t >= prod.duration - 1300 || game.settings.reduceMotion) {
      prod.reports.forEach((rep, i) => {
        const p = playerById(s, rep.playerId);
        r.text(`${p.name}: ${enabledResources().map((d) => `${d.label} +${rep.produced[d.id] || 0}`).join(' · ')}${rep.stopped ? ` · sense energia ${rep.stopped}` : ''}`, X + 12, Y + 8 + i * 25, { size: 18, color: p.isHuman ? COL.amber : COL.text, maxW: 700 });
      });
      r.button('prod-next', 'Continuar', X + 720, Y + 76, 132, 38, { primary: true, onClick: () => game.skipPhase() });
    } else {
      r.bar(X + 12, Y + 50, 840, 14, t / prod.duration, COL.cyan);
      r.text('Els RUCs treballen...', X + 12, Y + 12, { size: 18 });
      r.button('prod-skip', 'Salta', X + 720, Y + 76, 132, 38, { onClick: () => game.skipPhase() });
    }
    if (game.debug) game.drawDebugBar(r);
  }
}
