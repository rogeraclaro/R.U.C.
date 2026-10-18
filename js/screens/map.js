'use strict';
/** Static map layer (ground + terrain tiles) cached in an offscreen canvas; ownership and RUCs are drawn per frame. */
const MapLayer = {
  key: '',
  canvas: null,
  build(game) {
    const a = game.assets; const T = CONFIG.TILE;
    const c = document.createElement('canvas'); c.width = CONFIG.COLS * T; c.height = CONFIG.ROWS * T;
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
    a.draw(x, 'map_ground_base', 0, 0, c.width, c.height);
    game.state.plots.forEach((p) => {
      if (p.terrain === TERRAIN.TOWN) {
        a.draw(x, 'tile_river_01', p.x * T, p.y * T, T, T);
        a.drawContain(x, 'colony_store', p.x * T + 4, p.y * T + 4, T - 8, T - 30);
        x.fillStyle = 'rgba(6,9,18,0.8)'; x.fillRect(p.x * T + 3, p.y * T + T - 24, T - 6, 21);
        x.fillStyle = COL.amber; x.font = 'bold 16px ui-monospace, Menlo, Consolas, monospace'; x.textBaseline = 'middle'; x.textAlign = 'center';
        x.fillText('POBLE', p.x * T + T / 2, p.y * T + T - 13);
        return;
      }
      const name = p.terrain === TERRAIN.RIVER ? (p.y % 2 ? 'tile_river_02' : 'tile_river_01')
        : p.terrain === TERRAIN.PLAIN ? ((p.x * 3 + p.y) % 2 ? 'tile_plain_02' : 'tile_plain_01')
          : (p.richness >= 2 ? 'tile_mountain_02' : 'tile_mountain_01');
      a.draw(x, name, p.x * T, p.y * T, T, T);
      // Terrain must never rely on colour alone: initial + richness pips are drawn on the tile.
      x.fillStyle = 'rgba(6,9,18,0.72)'; x.fillRect(p.x * T + 3, p.y * T + T - 24, p.terrain === TERRAIN.MOUNTAIN ? 56 : 30, 21);
      x.fillStyle = COL.text; x.font = 'bold 16px ui-monospace, Menlo, Consolas, monospace'; x.textBaseline = 'middle'; x.textAlign = 'left';
      x.fillText(p.terrain === TERRAIN.RIVER ? 'R' : p.terrain === TERRAIN.PLAIN ? 'P' : 'M', p.x * T + 8, p.y * T + T - 13);
      for (let i = 0; i < p.richness; i++) { x.fillStyle = COL.amber; x.fillRect(p.x * T + 26 + i * 12, p.y * T + T - 18, 8, 10); }
    });
    return c;
  },
  get(game) {
    // The terrain is part of the key: a planetquake slide changes it mid-game.
    const k = `${game.state.seed}|${game.assets.settled}|${game.assets.failed.size}|${game.state.plots.map((p) => p.richness).join('')}`;
    if (k !== this.key || !this.canvas) { this.canvas = this.build(game); this.key = k; }
    return this.canvas;
  }
};

const terrainName = (p) => ({ river: 'Riu', plain: 'Plana', mountain: 'Muntanya', town: 'Poble' }[p.terrain] || p.terrain);

class MapScreen {
  constructor() { this.cursor = 20; this.hover = null; }
  /**
   * Land race: Enter/Space anywhere is the "buzzer". Development: held arrows walk (polled every tick by Game.devDirs) and Enter/Space
   * is the colonist's action button. A focused panel / HUD button keeps its own Enter/Space.
   */
  onKey(game, e) {
    if (game.paused || game.helpOpen) return false;
    const f = game.renderer.focusId;
    const onButton = !!f && (f.startsWith('hud-') || f.startsWith('d-') || f.startsWith('dbg-'));
    const action = e.key === 'Enter' || e.key === ' ';
    if (game.turns.phase === 'LAND_GRANT') {
      if (!action || (onButton && !f.startsWith('d-'))) return false;
      game.humanClaim(); return true;
    }
    if (game.turns.phase === 'DEVELOPMENT') {
      const slot = game.devSlot();
      if (slot && slot.stage === 'card' && action && !onButton) { game.devSkipCard(); return true; }
      if (!game.humanWalk()) return false;
      if (e.key.startsWith('Arrow')) return true;
      if (action && !onButton) { game.devAction(); return true; }
    }
    return false;
  }
  /** Thick animated frame + corner brackets + label: the cursor never relies on colour alone. Animation runs on the game clock. */
  drawLandCursor(game, r, land) {
    const s = game.state; const c = r.ctx;
    if (land.lastClaim) {
      const age = land.clock - land.lastClaim.clock;
      if (age >= 0 && age < 800) {
        const o = playerById(s, land.lastClaim.pid); const pr = this.plotRect(s.plots[land.lastClaim.plot]); const k = age / 800;
        c.save(); c.globalAlpha = 1 - k; c.strokeStyle = o.color; c.lineWidth = 6; c.strokeRect(pr.x - k * 16, pr.y - k * 16, pr.w + k * 32, pr.h + k * 32);
        c.restore(); r.glyph(o.shape, pr.x + pr.w / 2, pr.y + pr.h / 2, 14 + (1 - k) * 8, o.color, '#05070d');
      }
    }
    if (land.cursor < 0) return;
    const rc = this.plotRect(s.plots[land.cursor]);
    // Reduce-motion removes the pulse only; it never changes how fast the cursor sweeps.
    const pulse = game.settings.reduceMotion ? 0 : Math.sin(land.clock / 90);
    const inset = 2 + (pulse + 1) * 1.5;
    c.fillStyle = 'rgba(255,255,255,0.16)'; c.fillRect(rc.x, rc.y, rc.w, rc.h);
    c.lineWidth = 7; c.strokeStyle = '#ffffff'; c.strokeRect(rc.x + inset + 3.5, rc.y + inset + 3.5, rc.w - 2 * inset - 7, rc.h - 2 * inset - 7);
    c.lineWidth = 3; c.strokeStyle = COL.amber; c.strokeRect(rc.x + inset + 8, rc.y + inset + 8, rc.w - 2 * inset - 16, rc.h - 2 * inset - 16);
    c.strokeStyle = '#000'; c.lineWidth = 6; const L = 20;
    [[rc.x, rc.y, 1, 1], [rc.x + rc.w, rc.y, -1, 1], [rc.x, rc.y + rc.h, 1, -1], [rc.x + rc.w, rc.y + rc.h, -1, -1]].forEach(([x, y, dx, dy]) => {
      c.strokeStyle = '#000'; c.lineWidth = 8; c.beginPath(); c.moveTo(x + dx * L, y); c.lineTo(x, y); c.lineTo(x, y + dy * L); c.stroke();
      c.strokeStyle = COL.amber; c.lineWidth = 4; c.beginPath(); c.moveTo(x + dx * L, y); c.lineTo(x, y); c.lineTo(x, y + dy * L); c.stroke();
    });
    r.panel(rc.x + 8, rc.y + rc.h / 2 - 12, rc.w - 16, 24, { fill: 'rgba(6,9,18,0.85)', frame: false });
    r.text('RECLAMA', rc.x + rc.w / 2, rc.y + rc.h / 2 - 9, { size: 16, color: COL.amber, align: 'center', shadow: false });
  }
  plotRect(p) { return { x: CONFIG.MAP_X + p.x * CONFIG.TILE, y: CONFIG.MAP_Y + p.y * CONFIG.TILE, w: CONFIG.TILE, h: CONFIG.TILE }; }
  plotAt(game, px, py) {
    const x = Math.floor((px - CONFIG.MAP_X) / CONFIG.TILE); const y = Math.floor((py - CONFIG.MAP_Y) / CONFIG.TILE);
    return x < 0 || y < 0 || x >= CONFIG.COLS || y >= CONFIG.ROWS ? null : game.state.plots[y * CONFIG.COLS + x];
  }
  /** Draws map + owners + RUCs. Reused by the production animation through `opts.plotFx`; `opts.walk` adds the houses to aim at. */
  drawMap(game, r, opts = {}) {
    const s = game.state; const ctx = r.ctx; const w = opts.walk;
    ctx.drawImage(MapLayer.get(game), CONFIG.MAP_X, CONFIG.MAP_Y);
    s.plots.forEach((p) => {
      const { x, y } = this.plotRect(p); const T = CONFIG.TILE;
      if (p.ownerId) {
        const o = playerById(s, p.ownerId);
        ctx.strokeStyle = o.color; ctx.lineWidth = 4; ctx.strokeRect(x + 2, y + 2, T - 4, T - 4);
        r.glyph(o.shape, x + 14, y + 14, 9, o.color, '#05070d');
      }
      if (p.ruc) {
        const fx = opts.plotFx ? opts.plotFx(p) : null;
        const frame = fx && fx.walking ? Math.floor(game.now / 90) % 8 : 0;
        r.asset(fx && fx.walking ? 'ruc_walk_strip' : 'ruc_idle', x + 22, y + 8, 50, 50, frame);
        r.asset(RESOURCE_DEFS[p.ruc.module].module, x + 60, y + 52, 32, 32);
        ctx.strokeStyle = RESOURCE_DEFS[p.ruc.module].color; ctx.lineWidth = 2; ctx.strokeRect(x + 60.5, y + 52.5, 31, 31);
        if (fx && fx.draw) fx.draw(ctx, x, y);
      }
      if (w && p.ownerId === w.pid) {
        // The house: the whole tile counts, not just its centre — being anywhere on your own plot is enough to install/retire a RUC.
        const cx = x + T / 2; const cy = y + T / 2; const on = DevWalk.atHouse(w, p);
        ctx.fillStyle = on ? 'rgba(255,179,71,0.28)' : 'rgba(255,179,71,0.07)'; ctx.fillRect(x + 3, y + 3, T - 6, T - 6);
        ctx.strokeStyle = on ? '#fff' : COL.amber; ctx.lineWidth = on ? 3 : 2; ctx.strokeRect(x + 3.5, y + 3.5, T - 7, T - 7);
        ctx.beginPath(); ctx.moveTo(cx - 8, cy + 5); ctx.lineTo(cx, cy - 7); ctx.lineTo(cx + 8, cy + 5); ctx.closePath(); ctx.fillStyle = on ? '#fff' : COL.amber; ctx.fill();
      }
    });
  }
  /** Town interior: drawn in the map rectangle while the colonist is inside the town. */
  drawTown(game, r) {
    const c = r.ctx; const s = game.state; const X = CONFIG.MAP_X; const Y = CONFIG.MAP_Y;
    c.fillStyle = '#231f2c'; c.fillRect(X, Y, TOWN.W, TOWN.H);
    c.fillStyle = '#4d4557'; c.fillRect(X, Y + TOWN.streetTop, TOWN.W, TOWN.streetBottom - TOWN.streetTop); c.fillRect(X + TOWN.passX0, Y, TOWN.passX1 - TOWN.passX0, TOWN.H);
    r.text('◀ sortida', X + 8, Y + TOWN.streetTop + 8, { size: 16, color: COL.dim });
    r.text('sortida ▶', X + TOWN.W - 8, Y + TOWN.streetTop + 8, { size: 16, color: COL.dim, align: 'right' });
    r.text('▲ sortida', X + (TOWN.passX0 + TOWN.passX1) / 2, Y + 6, { size: 16, color: COL.dim, align: 'center' });
    r.text('▼ sortida', X + (TOWN.passX0 + TOWN.passX1) / 2, Y + TOWN.H - 24, { size: 16, color: COL.dim, align: 'center' });
    TOWN.buildings.forEach((b) => {
      const bx = X + b.x; const by = Y + b.y; const color = b.kind === 'corral' ? COL.amber : RESOURCE_DEFS[b.res].color;
      r.panel(bx, by, b.w, b.h, { fill: 'rgba(12,17,31,0.96)', border: color });
      const dy = b.door === 'bottom' ? by + b.h - 8 : by;
      c.fillStyle = color; c.fillRect(bx + b.w / 2 - 36, dy, 72, 8);
      r.text(b.label, bx + b.w / 2, by + 10, { size: 16, color, align: 'center', maxW: b.w - 12 });
      if (b.kind === 'shop') {
        r.assetContain(RESOURCE_DEFS[b.res].module, bx + b.w / 2 - 30, by + 36, 60, 60);
        r.text(`Equip: ${CONFIG.MODULE_COST[b.res]} cr`, bx + b.w / 2, by + 104, { size: 16, align: 'center' });
      } else {
        r.assetContain('ruc_idle', bx + 16, by + 30, 90, 90);
        r.text(`${s.store.ruc} RUCs · ${StoreSystem.rucPrice(s)} cr`, bx + 120, by + 48, { size: 18 });
        r.text('Entra: compra un RUC', bx + 120, by + 78, { size: 16, color: COL.dim, maxW: b.w - 130 });
        r.text('o retorna el teu', bx + 120, by + 100, { size: 16, color: COL.dim, maxW: b.w - 130 });
      }
      // The counter the RUC walks to: a quiet ring normally, bright and pulsing once you are pushing at the door.
      const sx = X + b.spot.x; const sy = Y + b.spot.y; const walk = game.humanWalk(); const active = !!(walk && walk.latch === b.id && !walk.visited);
      const pulse = active && !game.settings.reduceMotion ? Math.sin(game.now / 150) * 3 : 0;
      c.strokeStyle = active ? '#fff' : 'rgba(255,255,255,0.25)'; c.lineWidth = active ? 3 : 1.5;
      c.beginPath(); c.arc(sx, sy, 17 + pulse, 0, Math.PI * 2); c.stroke();
    });
  }
  /** Colonist portrait + identity dot, drawn in place at (X, Y): shared by the normal, installing and fleeing renders. */
  drawColonist(r, p, X, Y) {
    const c = r.ctx;
    r.assetFrame('colonists_strip', X - 16, Y - 40, 32, 32, Math.max(0, portraitFrame(p)));
    c.strokeStyle = '#000'; c.lineWidth = 5; c.beginPath(); c.arc(X, Y, 7, 0, Math.PI * 2); c.stroke();
    r.glyph(p.shape, X, Y, 6, p.color, '#fff');
  }
  drawWalker(game, r, w) {
    const p = playerById(game.state, w.pid);
    const X = CONFIG.MAP_X + w.x; const Y = CONFIG.MAP_Y + w.y;
    if (w.installing) { this.drawInstalling(game, r, w, p, X, Y); return; }
    if (w.fleeing) { this.drawFleeing(game, r, w, p, X, Y); return; }
    if (w.visiting) { this.drawVisiting(game, r, w, p, X, Y); return; }
    const moving = game.devDirs().x !== 0 || game.devDirs().y !== 0;
    if (w.carrying) {
      const frame = moving && !game.settings.reduceMotion ? Math.floor(game.now / 90) % 8 : 0;
      r.asset(moving ? 'ruc_walk_strip' : 'ruc_idle', X - 50, Y - 26, 40, 40, frame);
      if (w.carrying.module) r.asset(RESOURCE_DEFS[w.carrying.module].module, X - 34, Y + 6, 20, 20);
      else r.text('?', X - 30, Y + 4, { size: 16, color: COL.bad });
    }
    this.drawColonist(r, p, X, Y);
  }
  /**
   * The colonist stays put right at the doorway (X, Y); only the RUC walks on to the counter and back, its module/state read
   * live off w.carrying so both legs render correctly for every kind of visit (buy: nothing goes in, something comes out;
   * return: something goes in, nothing comes back; outfit: goes in one way, comes out re-equipped).
   */
  drawVisiting(game, r, w, p, X, Y) {
    this.drawColonist(r, p, X, Y);
    if (!w.carrying) return;
    const b = TOWN.buildings.find((x) => x.id === w.visiting.id);
    const half = CONFIG.WALK.visitMs / 2;
    const prog = w.visiting.phase === 'in' ? clamp(w.visiting.t / half, 0, 1) : clamp(1 - (w.visiting.t - half) / half, 0, 1);
    const sx = CONFIG.MAP_X + b.spot.x; const sy = CONFIG.MAP_Y + b.spot.y;
    const mx = X + (sx - X) * prog; const my = Y + (sy - Y) * prog;
    const frame = game.settings.reduceMotion ? 0 : Math.floor(game.now / 110) % 8;
    r.asset('ruc_walk_strip', mx - 20, my - 26, 40, 40, frame);
    if (w.carrying.module) r.asset(RESOURCE_DEFS[w.carrying.module].module, mx - 10, my + 4, 20, 20);
  }
  /** The RUC rises to the house, its new module appears at the top, then it comes back down (see CONFIG.WALK.installMs). */
  drawInstalling(game, r, w, p, X, Y) {
    this.drawColonist(r, p, X, Y);
    const k = clamp(w.installing.t / CONFIG.WALK.installMs, 0, 1);
    const rise = k < 0.5 ? k / 0.5 : 1 - (k - 0.5) / 0.5; // 0 -> 1 -> 0
    const dy = game.settings.reduceMotion ? -20 : -Math.round(rise * 34);
    const frame = game.settings.reduceMotion ? 0 : Math.floor(game.now / 90) % 8;
    r.asset('ruc_walk_strip', X - 20, Y - 34 + dy, 40, 40, frame);
    if (k > 0.45) r.asset(RESOURCE_DEFS[w.installing.ruc.module].module, X - 4, Y - 6 + dy, 22, 22);
    // Clamped so the label never climbs into the instruction line above the map, even for a plot on the top row.
    r.text('Instal·lant…', X, Math.max(CONFIG.MAP_Y + 4, Y - 68 + dy), { size: 16, color: COL.amber, align: 'center' });
  }
  /** A quick side-to-side jitter, then a dash off in a random direction (see CONFIG.WALK.fleeShuffleMs/fleeRunMs). Not C64-sourced. */
  drawFleeing(game, r, w, p, X, Y) {
    this.drawColonist(r, p, X, Y);
    const t = w.fleeing.t; const shuffleMs = CONFIG.WALK.fleeShuffleMs;
    let fx = X; let fy = Y;
    if (t < shuffleMs) fx = X + Math.sin(t / 35) * 8;
    else {
      const dist = ((t - shuffleMs) / CONFIG.WALK.fleeRunMs) * 260;
      fx = X + Math.cos(w.fleeing.angle) * dist; fy = Y + Math.sin(w.fleeing.angle) * dist;
    }
    const frame = game.settings.reduceMotion ? 0 : Math.floor(game.now / 60) % 8;
    r.asset('ruc_walk_strip', fx - 20, fy - 20, 40, 40, frame);
  }
  drawTooltip(game, r, p, px, py) {
    let lines;
    if (p.terrain === TERRAIN.TOWN) lines = ['Poble: corral i tallers', 'Hi entres caminant durant el desenvolupament'];
    else {
      lines = [`${terrainName(p)}${p.richness ? ` · ${p.richness} cims` : ''}`,
        `Propietari: ${p.ownerId ? playerById(game.state, p.ownerId).name : 'lliure'}`,
        `Mitjana base: menjar ${ProductionSystem.baseYield(p, 'food')} · energia ${ProductionSystem.baseYield(p, 'energy')} · smithore ${ProductionSystem.baseYield(p, 'smithore')}`];
      if (p.ruc) {
        const s = game.state;
        lines.push(`RUC: ${resLabel(p.ruc.module)} · mitjana ${ProductionSystem.meanYield(s, p)} (veí +${ProductionSystem.adjacencyBonus(s, p)}, grups de 3 +${ProductionSystem.learningBonus(s, p)})`);
        lines.push('La collita real varia al voltant de la mitjana');
      }
    }
    const w = 460; const h = 12 + lines.length * 24;
    const x = clamp(px + 16, 8, CONFIG.W - w - 8); const y = clamp(py + 16, 60, CONFIG.H - h - 8);
    r.panel(x, y, w, h, { fill: 'rgba(6,9,18,0.96)', frame: false });
    lines.forEach((l, i) => r.text(l, x + 10, y + 8 + i * 24, { size: 16, maxW: w - 20 }));
  }
  draw(game, r) {
    const s = game.state;
    r.asset('bg_irata_sky', 0, 0, CONFIG.W, CONFIG.H); r.dim(0.55);
    Hud.draw(game, r);
    r.text(game.instruction(), 16, 66, { size: 20, color: COL.amber, maxW: 860 });
    const walk = game.humanWalk();
    const inTown = !!walk && walk.area === 'town';
    if (inTown) this.drawTown(game, r); else this.drawMap(game, r, { walk });
    const land = game.landRace();
    // The whole grid is one focusable region. Clicking a plot never installs anything (no remote installation): it only claims in
    // the land race (on pointer DOWN) and shows the tooltip.
    r.region('map', CONFIG.MAP_X, CONFIG.MAP_Y, CONFIG.COLS * CONFIG.TILE, CONFIG.ROWS * CONFIG.TILE, {
      focusable: true, label: 'Mapa',
      onDown: () => { if (land) game.humanClaim(); },
      onMove: (x, y) => { const p = this.plotAt(game, x, y); this.hover = p ? p.id : null; if (p) this.cursor = p.id; },
      onKey: (e) => {
        if (walk) return false;
        const c = this.cursor; const col = c % CONFIG.COLS; const row = Math.floor(c / CONFIG.COLS);
        if (e.key === 'ArrowLeft') this.cursor = row * CONFIG.COLS + Math.max(0, col - 1);
        else if (e.key === 'ArrowRight') this.cursor = row * CONFIG.COLS + Math.min(CONFIG.COLS - 1, col + 1);
        else if (e.key === 'ArrowUp') this.cursor = Math.max(0, row - 1) * CONFIG.COLS + col;
        else if (e.key === 'ArrowDown') this.cursor = Math.min(CONFIG.ROWS - 1, row + 1) * CONFIG.COLS + col;
        else if (e.key === 'Enter' || e.key === ' ') { if (land) game.humanClaim(); }
        else return false;
        this.hover = this.cursor; return true;
      }
    });
    if (land) this.drawLandCursor(game, r, land);
    else if (!walk && r.focusId === 'map' && r.showFocus) {
      // Keyboard inspection cursor (tooltips only). It is never the colonist's position.
      const cr = this.plotRect(s.plots[this.cursor]);
      r.ctx.setLineDash([8, 6]); r.ctx.strokeStyle = '#fff'; r.ctx.lineWidth = 3; r.ctx.strokeRect(cr.x + 1.5, cr.y + 1.5, cr.w - 3, cr.h - 3); r.ctx.setLineDash([]);
    }
    if (walk) this.drawWalker(game, r, walk);
    this.drawPlayers(game, r);
    this.drawBottom(game, r);
    const slot = game.devSlot();
    const planet = game.turns.phase === 'PLANET_EVENT' || game.turns.phase === 'PLANET_EVENT_AFTER';
    if (planet && (game.turns.phaseData.items || []).length) this.drawEventCards(game, r, game.turns.phaseData.items, '');
    else if (slot && slot.stage === 'card') this.drawEventCards(game, r, [slot.event], '');
    else if (slot && slot.stage === 'countdown') this.drawTurnCountdown(game, r, slot);
    const ptr = game.input.pointer; const under = inTown ? null : this.plotAt(game, ptr.x, ptr.y);
    const kbd = !walk && r.focusId === 'map' && r.showFocus ? s.plots[this.cursor] : null;
    const tipPlot = under || kbd;
    const cards = planet || (slot && slot.stage === 'card');
    if (tipPlot && !game.paused && !cards) {
      const tr = this.plotRect(tipPlot);
      this.drawTooltip(game, r, tipPlot, under ? ptr.x : tr.x + 40, under ? ptr.y : tr.y + 40);
    }
  }
  drawPlayers(game, r) {
    const s = game.state; const X = 896; const W = 368;
    const land = game.landRace(); const dev = game.turns.phase === 'DEVELOPMENT' ? game.turns.phaseData.dev : null;
    s.players.forEach((p, i) => {
      const y = 64 + i * 108;
      const current = dev && dev.order[dev.idx] === p.id;
      r.panel(X, y, W, 102, { border: current ? COL.cyan : p.isHuman ? COL.amber : COL.border });
      r.assetFrame('colonists_strip', X + 8, y + 8, 64, 64, Math.max(0, portraitFrame(p)));
      r.glyph(p.shape, X + 86, y + 20, 9, p.color, '#05070d');
      r.text(`${p.name}${p.isHuman ? ' (tu)' : ''}`, X + 102, y + 8, { size: 18, maxW: 150 });
      r.text(p.isHuman ? 'jugador' : AI_PROFILES[p.aiProfile].label, X + 102, y + 32, { size: 16, color: COL.dim, maxW: 150 });
      r.text(fmtCr(p.cash), X + W - 10, y + 8, { size: 18, color: COL.amber, align: 'right' });
      if (land) {
        const got = land.claimed[p.id];
        if (got !== undefined) r.text(`✔ parcel·la #${got + 1}`, X + W - 10, y + 32, { size: 16, color: COL.good, align: 'right' });
        else if (land.done) r.text('✕ sense parcel·la', X + W - 10, y + 32, { size: 16, color: COL.bad, align: 'right' });
        else r.text('● a la cursa', X + W - 10, y + 32, { size: 16, color: COL.cyan, align: 'right' });
      } else if (dev) {
        const k = dev.order.indexOf(p.id);
        r.text(current ? `▶ torn ${k + 1}/4` : k < dev.idx ? `fet (${k + 1}/4)` : `espera (${k + 1}/4)`, X + W - 10, y + 32, { size: 16, color: current ? COL.cyan : COL.dim, align: 'right' });
      }
      enabledResources().forEach((d, k) => { const x = X + 8 + k * 88; r.icon(d.id, x, y + 72, 24); r.text(String(p.inventory[d.id]), x + 30, y + 74, { size: 18 }); });
      const mine = s.plots.filter((q) => q.ownerId === p.id);
      r.text(`${mine.length}P ${mine.filter((q) => q.ruc).length}R`, X + W - 10, y + 74, { size: 16, color: COL.dim, align: 'right' });
    });
    const y = 64 + 4 * 108;
    r.panel(X, y, W, 712 - y, {});
    r.text('Botiga', X + 10, y + 6, { size: 18, color: COL.cyan });
    enabledResources().forEach((d, k) => {
      const st = s.store.stock[d.id];
      r.icon(d.id, X + 10, y + 32 + k * 30, 24);
      r.text(`${st} u · compra ${StoreSystem.bid(s, d)} · ven ${st > 0 ? StoreSystem.ask(s, d) : '—'}`, X + 42, y + 34 + k * 30, { size: 16, maxW: 316 });
    });
    r.text(`Corral: ${s.store.ruc} RUCs · ${StoreSystem.rucPrice(s)} cr`, X + 10, y + 34 + 3 * 30, { size: 16 });
  }
  /** Touch / pointer direction pad for walking: each arrow is held (pointer down) and released (pointer up). */
  drawPad(game, r, cx, cy) {
    const B = 38; const g = 2; const pad = game.rt.pad || (game.rt.pad = { x: 0, y: 0 });
    [['pad-up', '▲', 0, -1], ['pad-down', '▼', 0, 1], ['pad-left', '◀', -1, 0], ['pad-right', '▶', 1, 0]].forEach(([id, label, dx, dy]) => {
      const x = cx - B / 2 + dx * (B + g); const y = cy - B / 2 + dy * (B + g);
      const on = (dx && pad.x === dx) || (dy && pad.y === dy);
      r.ctx.fillStyle = on ? COL.btnHi : COL.btn; r.ctx.fillRect(x, y, B, B);
      r.ctx.strokeStyle = on ? COL.cyan : COL.border; r.ctx.lineWidth = 2; r.ctx.strokeRect(x + 1, y + 1, B - 2, B - 2);
      r.text(label, x + B / 2, y + 9, { size: 18, align: 'center', shadow: false });
      r.region(id, x, y, B, B, {
        label: `Camina ${label}`,
        onDown: () => { if (dx) pad.x = dx; if (dy) pad.y = dy; },
        onUp: () => { if (dx && pad.x === dx) pad.x = 0; if (dy && pad.y === dy) pad.y = 0; }
      });
    });
  }
  drawBottom(game, r) {
    const s = game.state; const phase = game.turns.phase;
    const X = CONFIG.MAP_X; const Y = 590; const W = 864;
    r.panel(X, Y, W, 122, {});
    if (phase === 'DEVELOPMENT') this.drawDevPanel(game, r, X, Y);
    else if (phase === 'LAND_GRANT') {
      r.assetContain('colony_store', X + 6, Y + 8, 128, 104);
      const land = game.landRace();
      const cur = land && land.cursor >= 0 ? s.plots[land.cursor] : null;
      const claimText = land && land.pause > 0 && land.lastClaim ? `${playerById(s, land.lastClaim.pid).name} ha reclamat la parcel·la #${land.lastClaim.plot + 1}. La cursa continua...` : '';
      r.text(claimText || (cur ? `Parcel·la #${cur.id + 1} · ${terrainName(cur)}${cur.richness ? ` (${cur.richness} cims)` : ''}` : 'La cursa ha acabat.'), X + 142, Y + 10, { size: 18, maxW: 700 });
      if (cur) r.text(`Mitjana base: menjar ${ProductionSystem.baseYield(cur, 'food')} · energia ${ProductionSystem.baseYield(cur, 'energy')} · smithore ${ProductionSystem.baseYield(cur, 'smithore')}`, X + 142, Y + 36, { size: 16, color: COL.dim, maxW: 700 });
      if (land) r.text(`Una sola passada · parcel·les lliures: ${LandGrantSystem.freePlots(s).length}`, X + 142, Y + 58, { size: 16, color: COL.dim, maxW: 700 });
      const can = !!land && LandRace.canClaim(land, 'p0');
      r.button('b-land-claim', 'Reclama (Enter)', X + 142, Y + 82, 260, 34, { primary: true, disabled: !can, onDown: () => game.humanClaim(), onClick: () => game.humanClaim() });
    } else {
      r.assetContain('colony_store', X + 6, Y + 8, 128, 104);
      r.text(game.instruction(), X + 142, Y + 14, { size: 18, maxW: 700 });
    }
    if (game.debug) game.drawDebugBar(r);
  }
  drawDevPanel(game, r, X, Y) {
    const s = game.state; const dev = game.turns.phaseData.dev; const slot = dev && dev.slot;
    if (!slot) return;
    const who = playerById(s, slot.pid);
    const walk = game.humanWalk();
    if (walk) {
      const cr = walk.carrying; const busy = !!(walk.installing || walk.fleeing || walk.visiting);
      const carry = walk.installing ? 'Instal·lant el RUC…' : walk.fleeing ? 'El RUC fuig!' : walk.visiting ? 'El RUC entra a dins...'
        : cr ? `Portes un RUC ${cr.module ? `equipat per a ${resLabel(cr.module).toLowerCase()}` : 'sense equipar'} (robot: ${cr.paid} cr)` : 'No portes cap RUC';
      r.text(carry, X + 12, Y + 8, { size: 18, color: busy ? COL.amber : cr ? COL.amber : COL.text, maxW: 660 });
      r.text(walk.msg || (walk.area === 'town' ? 'Camina dins dels edificis per usar-los. Surt per les vores obertes.' : 'Acció sobre la casa d\'una parcel·la teva: instal·la o retira un RUC.'), X + 12, Y + 36, { size: 16, color: walk.bad ? COL.bad : COL.dim, maxW: 660 });
      r.button('d-act', 'Acció (Enter)', X + 12, Y + 72, 200, 40, { primary: true, disabled: busy, onClick: () => game.devAction() });
      r.button('d-end', cr ? 'Acabar (el RUC fugirà)' : 'Acabar el torn', X + 222, Y + 72, 250, 40, { onClick: () => game.devFinish() });
      r.text('Fletxes: caminar', X + 484, Y + 84, { size: 16, color: COL.dim });
      this.drawPad(game, r, X + 790, Y + 61);
      return;
    }
    r.assetFrame('colonists_strip', X + 8, Y + 8, 64, 64, Math.max(0, portraitFrame(who)));
    if (slot.stage === 'card') {
      r.text(`Esdeveniment abans del teu torn: ${slot.event.name}`, X + 84, Y + 10, { size: 18, maxW: 760 });
      r.button('d-card', 'Continuar (Enter)', X + 84, Y + 72, 240, 40, { primary: true, onClick: () => game.devSkipCard() });
      return;
    }
    r.text(`Torn de desenvolupament de ${who.name}${dev.reversed ? ' · corral amb 7 RUCs o menys: ordre invers' : ''}`, X + 84, Y + 8, { size: 18, maxW: 770 });
    (slot.log || []).slice(0, 3).forEach((l, i) => r.text(l, X + 84, Y + 36 + i * 24, { size: 16, color: COL.dim, maxW: 770 }));
  }
  /**
   * "Get ready" modal shown for CONFIG.DEV.countdownMs right before the human's development slot starts (no skip button on
   * purpose): the walk and its clock only begin once this ends, so the turn never starts while the player is still reacting.
   */
  drawTurnCountdown(game, r, slot) {
    r.dim(0.6);
    const p = playerById(game.state, slot.pid);
    const secs = Math.max(1, Math.ceil(slot.timer / 1000));
    const x = 390; const y = 210; const w = 500; const h = 300;
    r.panel(x, y, w, h, { border: COL.amber });
    r.assetFrame('colonists_strip', x + w / 2 - 32, y + 24, 64, 64, Math.max(0, portraitFrame(p)));
    r.text(`Comença el torn de ${p.name}`, x + w / 2, y + 104, { size: 22, color: COL.amber, align: 'center', maxW: w - 40 });
    r.text(String(secs), x + w / 2, y + 136, { size: 72, color: COL.text, align: 'center' });
    r.text('Prepara\'t per caminar...', x + w / 2, y + 244, { size: 18, color: COL.dim, align: 'center' });
  }
  drawEventCards(game, r, items, emptyText) {
    r.dim(0.55);
    const w = 400; const gap = 30; const n = Math.max(1, items.length);
    const x0 = (CONFIG.W - (n * w + (n - 1) * gap)) / 2;
    if (!items.length) {
      r.panel(340, 250, 600, 160, {});
      r.text(`Torn ${game.state.turn}`, 640, 270, { size: 30, color: COL.amber, align: 'center' });
      r.text(emptyText, 640, 330, { size: 20, align: 'center', maxW: 560 });
    }
    items.forEach((ev, i) => {
      const x = x0 + i * (w + gap); const y = 130;
      r.panel(x, y, w, 460, { border: ev.negative ? COL.bad : COL.good });
      r.text(`Torn ${game.state.turn} · ${ev.scope === 'planet' ? 'Planetari' : 'Individual'}`, x + w / 2, y + 12, { size: 16, color: COL.dim, align: 'center' });
      r.text(ev.name, x + w / 2, y + 40, { size: 26, color: ev.negative ? COL.bad : COL.good, align: 'center', maxW: w - 20 });
      r.assetFrame('event_cards_strip', x + 40, y + 88, w - 80, 220, ev.art);
      r.wrap(ev.text, x + 20, y + 320, w - 40, 24, { size: 18, align: 'center' });
      r.text('Esdeveniment original (C64)', x + w / 2, y + 430, { size: 16, color: COL.dim, align: 'center', maxW: w - 20 });
    });
    const skip = () => { if (game.turns.phase === 'DEVELOPMENT') game.devSkipCard(); else game.skipPhase(); };
    r.region('event-skip', 0, 0, CONFIG.W, CONFIG.H, { focusable: true, label: 'Salta la targeta', onClick: skip, onKey: (e) => { if (e.key === 'Enter' || e.key === ' ') { skip(); return true; } return false; } });
    r.text('Clic, Enter o Espai per continuar', 640, 620, { size: 16, color: COL.dim, align: 'center' });
  }
}
