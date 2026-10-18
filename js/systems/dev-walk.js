'use strict';
/**
 * Town interior, in logical px of the map rectangle. [PROVISIONAL] layout (not the C64 geometry): a street across the town, a
 * passage from top to bottom, the three Phase A outfitting shops and the corral. No land office, assay office or pub (see README).
 */
// `spot`: the interior counter a colonist must actually walk up to before a shop/corral visit does anything (see moveTown). It
// sits well past the doorway, deep inside the room, so a step that only grazes the threshold while walking the street never
// triggers a purchase by accident — reaching it takes real, visible walking time, both going in and coming back out.
const TOWN = deepFreeze({
  W: CONFIG.COLS * CONFIG.TILE, H: CONFIG.ROWS * CONFIG.TILE, streetTop: 170, streetBottom: 310, passX0: 384, passX1: 480,
  buildings: [
    { id: 'shop_food', kind: 'shop', res: 'food', label: 'Taller de menjar', x: 24, y: 16, w: 170, h: 154, door: 'bottom', spot: { x: 109, y: 66 } },
    { id: 'shop_energy', kind: 'shop', res: 'energy', label: 'Taller d\'energia', x: 204, y: 16, w: 170, h: 154, door: 'bottom', spot: { x: 289, y: 66 } },
    { id: 'shop_smithore', kind: 'shop', res: 'smithore', label: 'Taller de smithore', x: 490, y: 16, w: 170, h: 154, door: 'bottom', spot: { x: 575, y: 66 } },
    { id: 'corral', kind: 'corral', label: 'Corral de RUCs', x: 490, y: 310, w: 350, h: 154, door: 'top', spot: { x: 665, y: 414 } }
  ]
});

/**
 * The human colonist walking during development (pure logic, plain JSON state kept in the save). Movement runs in fixed 10 ms
 * steps; the development clock keeps running while walking, inside buildings or standing still.
 * [manual]: get a M.U.L.E. in the corral, take it to an outfitting shop ("go all the way in and come all the way out"), lead it to
 * your plot and press the button over the house. Pressing anywhere else outside town, or running out of time while leading it,
 * makes it run away. Taking it back into the corral refunds the robot, never the outfitting.
 */
const DevWalk = {
  townTile() { return { x: CONFIG.RIVER_COL * CONFIG.TILE, y: CONFIG.TOWN_ROW * CONFIG.TILE, w: CONFIG.TILE, h: CONFIG.TILE }; },
  create(state, pid, timeMs) {
    return {
      pid, area: 'town', x: (TOWN.passX0 + TOWN.passX1) / 2, y: (TOWN.streetTop + TOWN.streetBottom) / 2,
      carrying: null, latch: null, pressT: 0, visited: false, visiting: null, installing: null, fleeing: null, endWhy: null,
      timeLeft: timeMs, timeTotal: timeMs, acc: 0, ended: null, msg: '', bad: false, log: [], seq: 0
    };
  },
  plotAt(state, x, y) {
    const c = clamp(Math.floor(x / CONFIG.TILE), 0, CONFIG.COLS - 1); const r = clamp(Math.floor(y / CONFIG.TILE), 0, CONFIG.ROWS - 1);
    return state.plots[r * CONFIG.COLS + c];
  },
  /** "At the house" = anywhere on that plot's own tile — the whole square, not a small spot at its centre. */
  atHouse(w, plot) {
    const px = plot.x * CONFIG.TILE; const py = plot.y * CONFIG.TILE;
    return w.x >= px && w.x < px + CONFIG.TILE && w.y >= py && w.y < py + CONFIG.TILE;
  },
  inTownFloor(x, y) { return (y >= TOWN.streetTop && y <= TOWN.streetBottom) || (x >= TOWN.passX0 && x <= TOWN.passX1); },
  buildingAt(x, y) { return TOWN.buildings.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) || null; },
  speed(state, w) {
    if (w.area === 'town') return CONFIG.WALK.townSpeed;
    const p = this.plotAt(state, w.x, w.y);
    const slow = p.terrain === TERRAIN.RIVER || p.terrain === TERRAIN.MOUNTAIN;
    return CONFIG.WALK.mapSpeed * (slow ? CONFIG.WALK.slowPct : 100) / 100;
  },
  /**
   * dir: { x, y } with each axis in {-1, 0, 1}. Movement and actions are suspended while `installing` or `fleeing` play out
   * (busy states); the development clock keeps running regardless, same as walking or standing still.
   */
  update(state, w, dir, dtMs) {
    if (w.ended) return;
    w.acc += dtMs;
    while (w.acc >= CONFIG.WALK.stepMs && !w.ended) {
      w.acc -= CONFIG.WALK.stepMs;
      w.timeLeft -= CONFIG.WALK.stepMs;
      if (w.installing) { w.installing.t += CONFIG.WALK.stepMs; if (w.installing.t >= CONFIG.WALK.installMs) this.finishInstall(state, w); }
      else if (w.fleeing) { w.fleeing.t += CONFIG.WALK.stepMs; if (w.fleeing.t >= CONFIG.WALK.fleeShuffleMs + CONFIG.WALK.fleeRunMs) this.finishFlee(w); }
      else if (w.visiting) { w.visiting.t += CONFIG.WALK.stepMs; this.stepVisit(state, w); }
      else if (dir.x || dir.y) this.move(state, w, dir);
      if (w.timeLeft <= 0) this.end(state, w, 'timeout');
    }
  },
  move(state, w, dir) {
    const d = this.speed(state, w) * CONFIG.WALK.stepMs;
    const nx = w.x + dir.x * d; const ny = w.y + dir.y * d;
    // Latch/spot bookkeeping for buildings lives entirely in moveTown now (entering and leaving are both free, gradual movement).
    if (w.area === 'town') this.moveTown(state, w, nx, ny); else this.moveMap(state, w, nx, ny);
  },
  moveMap(state, w, nx, ny) {
    nx = clamp(nx, 0, TOWN.W - 0.01); ny = clamp(ny, 0, TOWN.H - 0.01);
    const t = this.townTile();
    if (nx >= t.x && nx < t.x + t.w && ny >= t.y && ny < t.y + t.h) {
      // Stepping onto the town tile zooms into the town, arriving through the matching edge.
      const fromW = w.x < t.x; const fromE = w.x >= t.x + t.w;
      w.area = 'town';
      if (fromW || fromE) {
        w.x = fromW ? 1 : TOWN.W - 1;
        w.y = TOWN.streetTop + clamp((ny - t.y) / t.h, 0, 1) * (TOWN.streetBottom - TOWN.streetTop);
      } else {
        w.y = w.y < t.y ? 1 : TOWN.H - 1;
        w.x = TOWN.passX0 + clamp((nx - t.x) / t.w, 0, 1) * (TOWN.passX1 - TOWN.passX0);
      }
      return;
    }
    w.x = nx; w.y = ny;
  },
  moveTown(state, w, nx, ny) {
    const t = this.townTile();
    if (nx < 0 || nx > TOWN.W || ny < 0 || ny > TOWN.H) {
      // Leaving through an open edge: back on the map, just outside the town tile.
      const sy = clamp((w.y - TOWN.streetTop) / (TOWN.streetBottom - TOWN.streetTop), 0, 1);
      const sx = clamp((w.x - TOWN.passX0) / (TOWN.passX1 - TOWN.passX0), 0, 1);
      w.area = 'map'; w.latch = null; w.pressT = 0; w.visited = false;
      if (nx < 0) { w.x = t.x - 1; w.y = t.y + sy * (t.h - 1); } else if (nx > TOWN.W) { w.x = t.x + t.w; w.y = t.y + sy * (t.h - 1); } else if (ny < 0) { w.y = t.y - 1; w.x = t.x + sx * (t.w - 1); } else { w.y = t.y + t.h; w.x = t.x + sx * (t.w - 1); }
      return;
    }
    const b = this.buildingAt(nx, ny);
    if (b) {
      // The colonist never actually walks in: they stay right at this doorway (their position never adopts nx, ny) and only
      // the RUC itself goes on to the counter, once genuinely pushing into the door for CONFIG.WALK.doorHoldMs has committed
      // to a visit (see startVisit / MapScreen.drawVisiting) — a brief graze while walking the street falls short of that and
      // does nothing. One visit per approach: holding the door afterwards does not start another.
      if (w.visiting) return;
      if (w.latch !== b.id) { w.latch = b.id; w.pressT = 0; w.visited = false; }
      if (w.visited) return;
      w.pressT += CONFIG.WALK.stepMs;
      if (w.pressT >= CONFIG.WALK.doorHoldMs) { w.visited = true; this.startVisit(state, w, b); }
      return;
    }
    if (w.latch) { w.latch = null; w.pressT = 0; w.visited = false; }
    if (this.inTownFloor(nx, ny)) { w.x = nx; w.y = ny; return; }
    // Walls (and the building just left): slide along them.
    if (!this.buildingAt(nx, w.y) && this.inTownFloor(nx, w.y)) { w.x = nx; return; }
    if (!this.buildingAt(w.x, ny) && this.inTownFloor(w.x, ny)) w.y = ny;
  },
  /** Starts the scripted visit; the actual effect (buy/refund/outfit) applies at the midpoint, see stepVisit. */
  startVisit(state, w, b) { w.visiting = { id: b.id, t: 0, phase: 'in' }; },
  stepVisit(state, w) {
    const half = CONFIG.WALK.visitMs / 2;
    if (w.visiting.phase === 'in' && w.visiting.t >= half) {
      w.visiting.phase = 'out';
      this.enter(state, w, TOWN.buildings.find((x) => x.id === w.visiting.id));
    }
    if (w.visiting.t >= CONFIG.WALK.visitMs) w.visiting = null;
  },
  say(w, msg, bad = false, kind = null) { w.msg = msg; w.bad = bad; w.seq += 1; if (kind) w.log.push(kind); return kind; },
  enter(state, w, b) {
    w.latch = b.id;
    if (b.kind === 'corral') {
      if (w.carrying) {
        const back = StoreSystem.refundRuc(state, w.pid, w.carrying.paid); const mod = w.carrying.module;
        w.carrying = null;
        return this.say(w, `RUC retornat al corral: +${back} cr${mod ? ` (l'equip de ${resLabel(mod).toLowerCase()} no es retorna)` : ''}.`, false, 'return');
      }
      const r = StoreSystem.buyRuc(state, w.pid);
      if (!r.ok) return this.say(w, r.reason === 'no_cash' ? 'No tens prou crèdits per a un RUC.' : 'El corral és buit: no queden RUCs.', true);
      w.carrying = { module: null, paid: r.price };
      return this.say(w, `Has comprat un RUC per ${r.price} cr. Porta'l a un taller per equipar-lo.`, false, 'buy');
    }
    if (!w.carrying) return this.say(w, 'Primer cal treure un RUC del corral.', true);
    if (w.carrying.module === b.res) return this.say(w, `Aquest RUC ja està equipat per a ${resLabel(b.res).toLowerCase()}.`, true);
    const m = StoreSystem.buyModule(state, w.pid, b.res);
    if (!m.ok) return this.say(w, 'No tens prou crèdits per a aquest equip.', true);
    w.carrying.module = b.res;
    return this.say(w, `RUC equipat per a ${resLabel(b.res).toLowerCase()}: -${m.price} cr. Porta'l a la casa d'una parcel·la teva.`, false, 'outfit');
  },
  /** The "joystick button" (Enter / Space / Acció). It only does something on the map; clicks on the map never call it. */
  act(state, w) {
    if (w.ended || w.installing || w.fleeing) return null; // busy: already installing or fleeing
    if (w.area !== 'map') return this.say(w, 'Al poble, entra als edificis caminant-hi.', true);
    const plot = this.plotAt(state, w.x, w.y); const own = plot.ownerId === w.pid; const house = this.atHouse(w, plot);
    if (!w.carrying) {
      if (house && own && plot.ruc) {
        w.carrying = { module: plot.ruc.module, paid: plot.ruc.paid }; plot.ruc = null;
        return this.say(w, `Has retirat el RUC de la parcel·la #${plot.id + 1}: ara et segueix.`, false, 'pickup');
      }
      return this.say(w, 'Aquí no hi ha res a fer.', true);
    }
    if (house && own) {
      if (!w.carrying.module) return this.say(w, 'Aquest RUC no està equipat: porta\'l abans a un taller.', true);
      // Not instant: the RUC rises to the house, the module is added, then it comes back down (finishInstall applies the change).
      w.installing = { plotId: plot.id, ruc: w.carrying, t: 0 };
      w.carrying = null;
      return this.say(w, `Instal·lant el RUC a la parcel·la #${plot.id + 1}...`, false, 'installing');
    }
    // [manual] Standard: pressing the button anywhere but over the house of your own plot makes the M.U.L.E. run away.
    return this.flee(state, w, 'Has premut fora de la casa d\'una parcel·la teva: el RUC ha fugit!');
  },
  /** Applies the deferred install once the rise/add/descend animation has played (see `act`). */
  finishInstall(state, w) {
    const { plotId, ruc } = w.installing;
    const r = StoreSystem.install(state, w.pid, plotId, ruc);
    w.carrying = r.previous ? { module: r.previous.module, paid: r.previous.paid } : null;
    w.installing = null;
    this.say(w, r.previous ? `RUC instal·lat a la parcel·la #${plotId + 1}; l'anterior ara et segueix.` : `RUC instal·lat a la parcel·la #${plotId + 1}.`, false, 'install');
  },
  /**
   * The RUC's own effect (lost for good, nothing refunded) applies at once; only the visual choreography — a quick jitter, then a
   * dash off in a random direction — is deferred (`w.fleeing`, resolved by `finishFlee`). The direction is derived from the current
   * state rather than drawn from the seeded PRNG, so it stays deterministic without disturbing that stream.
   */
  flee(state, w, msg) {
    const angle = (SeededRNG.hash(`flee|${state.turn}|${w.pid}|${Math.round(w.x)}|${Math.round(w.y)}|${w.timeLeft}`) % 360) * Math.PI / 180;
    w.fleeing = { t: 0, angle };
    w.carrying = null;
    StoreSystem.loseRuc(state);
    return this.say(w, msg, true, 'flee');
  },
  /** Resolves a deferred `end()` (see below) once the flee animation is done. */
  finishFlee(w) {
    w.fleeing = null;
    if (w.endWhy) { const why = w.endWhy; w.endWhy = null; w.ended = why; w.timeLeft = Math.max(0, w.timeLeft); }
  },
  /**
   * End of the colonist's development (time out or voluntary): a RUC still being led runs away ([manual]); nothing is refunded.
   * If it was mid-install, that install is completed first (a leftover previous module, if any, flees instead). `w.ended` itself
   * is only set once any flee animation this triggers has played, so the turn queue does not move on before it is shown.
   */
  end(state, w, why) {
    if (w.ended || w.fleeing) return;
    if (w.installing) this.finishInstall(state, w);
    if (w.carrying) {
      this.flee(state, w, why === 'timeout' ? 'S\'ha acabat el temps amb el RUC a la mà: ha fugit.' : 'Has acabat el torn amb el RUC a la mà: ha fugit.');
      w.endWhy = why;
      return;
    }
    w.ended = why; w.timeLeft = Math.max(0, w.timeLeft);
  }
};

/** Walking direction from the held arrow keys and the on-screen pad (both work at once; opposite inputs cancel). */
function walkDirs(keys, pad = null) {
  const p = pad || { x: 0, y: 0 };
  const x = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0) + (p.x || 0);
  const y = (keys.has('ArrowDown') ? 1 : 0) - (keys.has('ArrowUp') ? 1 : 0) + (p.y || 0);
  return { x: Math.sign(x), y: Math.sign(y) };
}
