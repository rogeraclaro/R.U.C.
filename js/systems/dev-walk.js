'use strict';
/**
 * Town interior, in logical px of the map rectangle. [C64] layout: a street across the town between two rows of four buildings —
 * top row crystite shop (closed: Tournament only, no door), smithore, energy and food shops; bottom row assay office (closed:
 * Tournament only), land office, pub and the corral. The central passage from top to bottom and the street ends are the exits
 * (our own walkable geometry; the C64 sizes are not copied). The strip under the bottom row shows "Els teus diners" as the C64.
 * `kind`: shop / corral (the RUC walks in, see startVisit), pub / land (the colonist goes in), closed (a wall).
 */
// `spot`: the interior counter a colonist must actually walk up to before a shop/corral visit does anything (see moveTown). It
// sits well past the doorway, deep inside the room, so a step that only grazes the threshold while walking the street never
// triggers a purchase by accident — reaching it takes real, visible walking time, both going in and coming back out.
const TOWN = deepFreeze({
  W: CONFIG.COLS * CONFIG.TILE, H: CONFIG.ROWS * CONFIG.TILE, streetTop: 150, streetBottom: 300, passX0: 384, passX1: 480, moneyY: 452,
  buildings: [
    { id: 'shop_crystite', kind: 'closed', label: 'Crystite', x: 12, y: 10, w: 176, h: 140 },
    { id: 'shop_smithore', kind: 'shop', res: 'smithore', label: 'Smithore', x: 196, y: 10, w: 176, h: 140, door: 'bottom', spot: { x: 284, y: 60 } },
    { id: 'shop_energy', kind: 'shop', res: 'energy', label: 'Energia', x: 492, y: 10, w: 176, h: 140, door: 'bottom', spot: { x: 580, y: 60 } },
    { id: 'shop_food', kind: 'shop', res: 'food', label: 'Menjar', x: 676, y: 10, w: 176, h: 140, door: 'bottom', spot: { x: 764, y: 60 } },
    { id: 'assay', kind: 'closed', label: 'Assaig', x: 12, y: 300, w: 176, h: 140 },
    { id: 'land_office', kind: 'land', label: 'Oficina de terres', x: 196, y: 300, w: 176, h: 140, door: 'top', spot: { x: 284, y: 390 } },
    { id: 'pub', kind: 'pub', label: 'Pub', x: 492, y: 300, w: 176, h: 140, door: 'top', spot: { x: 580, y: 390 } },
    { id: 'corral', kind: 'corral', label: 'Corral', x: 676, y: 300, w: 176, h: 140, door: 'top', spot: { x: 764, y: 390 } }
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
  /** `unitMs`: one development unit of this colonist (species and level), for the units left (pub, time bar). */
  create(state, pid, timeMs) {
    return {
      pid, area: 'town', x: (TOWN.passX0 + TOWN.passX1) / 2, y: (TOWN.streetTop + TOWN.streetBottom) / 2,
      carrying: null, latch: null, pressT: 0, visited: false, visiting: null, installing: null, fleeing: null, endWhy: null,
      marking: false, markPlot: null, won: 0,
      timeLeft: timeMs, timeTotal: timeMs, unitMs: ConsumptionSystem.unitMs(state, playerById(state, pid)),
      acc: 0, ended: null, msg: '', bad: false, log: [], seq: 0
    };
  },
  /** Whole development units left (the tiny epsilon absorbs the ms rounding of the turn length). */
  unitsLeft(w) { return Math.max(0, Math.floor(w.timeLeft / w.unitMs + 1e-6)); },
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
  /** { x, y } in px per ms: the [C64] px-per-frame speeds scaled to our TILE, river / mountain slower (see CONFIG.WALK). */
  speed(state, w) {
    const W = CONFIG.WALK; const k = CONFIG.TILE / W.c64Plot * CONFIG.DEV.palHz / 1000;
    if (w.area === 'town') return { x: W.townPxPerFrame.x * k, y: W.townPxPerFrame.y * k };
    const tf = W.terrainFrames; const slow = tf.plain / (tf[this.plotAt(state, w.x, w.y).terrain] || tf.plain);
    return { x: W.mapPxPerFrame.x * k * slow, y: W.mapPxPerFrame.y * k * slow };
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
      if (w.wampus) WampusSystem.step(state, w, CONFIG.WALK.stepMs);
      if (w.timeLeft <= 0) this.end(state, w, 'timeout');
    }
  },
  move(state, w, dir) {
    const sp = this.speed(state, w);
    const nx = w.x + dir.x * sp.x * CONFIG.WALK.stepMs; const ny = w.y + dir.y * sp.y * CONFIG.WALK.stepMs;
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
    // A closed building has no door: it is a wall (falls through to the sliding below).
    if (b && b.kind !== 'closed') {
      // The colonist never actually walks in: they stay right at this doorway (their position never adopts nx, ny) and only
      // the RUC itself goes on to the counter, once genuinely pushing into the door for CONFIG.WALK.doorHoldMs has committed
      // to a visit (see startVisit / MapScreen.drawVisiting) — a brief graze while walking the street falls short of that and
      // does nothing. One visit per approach: holding the door afterwards does not start another.
      if (w.visiting) return;
      if (w.latch !== b.id) { w.latch = b.id; w.pressT = 0; w.visited = false; }
      if (w.visited) return;
      w.pressT += CONFIG.WALK.stepMs;
      // Shops and the corral: only the RUC goes in (scripted visit). The pub and the land office: the colonist goes in at once.
      if (w.pressT >= CONFIG.WALK.doorHoldMs) { w.visited = true; if (b.kind === 'pub' || b.kind === 'land') this.enter(state, w, b); else this.startVisit(state, w, b); }
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
    // [C64] "NO MULES ALLOWED" is in the C64 strings; that it is the pub's and the land office's answer is [PROVISIONAL].
    if ((b.kind === 'pub' || b.kind === 'land') && w.carrying) return this.say(w, 'No s\'hi admeten RUCs.', true, 'refused');
    if (b.kind === 'pub') {
      // [Atari code][C64] the pub ends the development turn and pays (PubSystem) with the units still left.
      w.won = PubSystem.visit(state, w.pid, this.unitsLeft(w)); w.ended = 'pub';
      return this.say(w, `Has guanyat ${w.won} cr jugant!`, false, 'pub');
    }
    if (b.kind === 'land') return this.landOffice(state, w);
    if (b.kind === 'corral') {
      if (w.carrying) {
        const back = StoreSystem.refundRuc(state, w.pid, w.carrying.paid); const mod = w.carrying.module;
        w.carrying = null;
        return this.say(w, `RUC retornat al corral: +${back} cr${mod ? ` (l'equip de ${resLabel(mod).toLowerCase()} es perd)` : ''}.`, false, 'return');
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
    return this.say(w, `Equipat per a ${resLabel(b.res).toLowerCase()} (-${m.price} cr): porta'l a una parcel·la teva.`, false, 'outfit');
  },
  /**
   * [manual][C64] land office (Standard): first visit "MARK PLOT TO SELL THEN COME BACK.", then the button over one of your plots
   * marks it, and back at the office it is "MARKED FOR SALE." for the next land auction (LandOffice, LandAuction).
   * [PROVISIONAL] the development clock keeps running meanwhile ([manual]: it stops while you are at the office).
   */
  landOffice(state, w) {
    if (!levelRules(state).landSales) return this.say(w, 'Al nivell Principiant no es ven terra.', true, 'refused');
    if (!w.marking) { w.marking = true; w.markPlot = null; return this.say(w, 'Marca la parcel·la per vendre i torna.', false, 'office'); }
    if (w.markPlot === null) return this.say(w, 'Cap parcel·la marcada.', true, 'no_mark');
    const id = w.markPlot; LandOffice.mark(state, w.pid, id); w.marking = false; w.markPlot = null;
    return this.say(w, `Parcel·la #${id + 1} en venda: sortirà a la propera subhasta de terres.`, false, 'for_sale');
  },
  /** The "joystick button" (Enter / Space / Acció). It only does something on the map; clicks on the map never call it. */
  act(state, w) {
    if (w.ended || w.installing || w.fleeing) return null; // busy: already installing or fleeing
    if (w.area !== 'map') return this.say(w, 'Al poble, entra als edificis caminant-hi.', true);
    // [C64] "YOU CAUGHT THE MOUNTAIN WAMPUS!! HE GAVE YOU HIS TREASURE CHEST -$n TO LET HIM GO FREE AGAIN.."
    const won = WampusSystem.tryCatch(state, w);
    if (won) return this.say(w, `Has caçat el Wampus de muntanya!! T'ha donat el seu cofre: ${won} cr perquè el deixis lliure.`, false, 'wampus');
    const plot = this.plotAt(state, w.x, w.y); const own = plot.ownerId === w.pid; const house = this.atHouse(w, plot);
    if (!w.carrying && w.marking) {
      if (!own) return this.say(w, 'No és la teva parcel·la.', true);
      w.markPlot = plot.id;
      return this.say(w, `Parcel·la #${plot.id + 1} marcada. Torna a l'oficina de terres.`, false, 'mark');
    }
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
    // [Atari code][manual] Beginner: it only beeps.
    if (!levelRules(state).missFlees) return this.say(w, 'Aquí no el pots instal·lar: el RUC es queda amb tu.', true, 'beep');
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
   * Beginner too: the "only beeps" rule is documented for a wrong button press, not for the end of the turn ([PROVISIONAL]).
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
