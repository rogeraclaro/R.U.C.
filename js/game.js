'use strict';
class Game {
  constructor(canvas, assets) {
    this.canvas = canvas; this.assets = assets;
    this.now = 0; this.paused = false; this.helpOpen = false; this.mode = 'loading';
    this.debug = false; this.autopilot = false; this.debugForced = []; this.debugLog = ''; this.fps = 60; this.titleNotice = '';
    this.persist = true; // false in self-tests: a simulated game must never overwrite the player's save
    this.state = null; this.rng = null; this.rt = {}; this.turns = new TurnSystem();
    this.settings = this.loadSettings();
    this.setup = { name: 'Roger', color: 'yellow', level: 'standard', species: 'mechtron', seed: this.randomSeed() };
    this.renderer = new Renderer(canvas, this); this.input = new InputManager(canvas, this); this.audio = new AudioManager(this);
    const map = new MapScreen();
    this.screens = { title: new TitleScreen(), setup: new SetupScreen(), map, production: new ProductionScreen(map), report: new ReportScreen(), auction: new AuctionScreen(), landAuction: new LandAuctionScreen(), gameover: new GameOverScreen() };
    this.screen = this.screens.title; this.screenCtx = null;
    this.help = new HelpOverlay(); this.pauseOv = new PauseOverlay();
    this.defineTurnPhases();
    this.makeHiddenInput();
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.mode === 'play') this.paused = true; });
  }

  /* ---- settings, helpers ---- */
  loadSettings() {
    const d = { sound: true, reduceMotion: false };
    try { return Object.assign(d, JSON.parse(localStorage.getItem('ruc-settings') || '{}')); } catch (e) { return d; }
  }
  saveSettings() { try { localStorage.setItem('ruc-settings', JSON.stringify(this.settings)); } catch (e) { /* ignore */ } }
  /** Seeds are only generated here, outside game logic, so Math.random never touches a deterministic run. */
  randomSeed() { return Math.random().toString(36).slice(2, 8).toUpperCase(); }
  announce(text) { const el = document.getElementById('sr'); if (el) el.textContent = text; }
  fast(ms) { return this.autopilot ? Math.min(ms, 120) : ms; }
  toggleSound() { this.settings.sound = !this.settings.sound; this.saveSettings(); }
  toggleReduceMotion() { this.settings.reduceMotion = !this.settings.reduceMotion; this.saveSettings(); }
  toggleHelp() { this.helpOpen = !this.helpOpen; }
  togglePause() { if (this.mode === 'play') this.paused = !this.paused; }
  onEscape() {
    if (this.helpOpen) this.helpOpen = false;
    else if (this.mode === 'play') this.paused = !this.paused;
    else if (this.mode === 'setup') this.goTitle();
  }
  makeHiddenInput() {
    const el = document.createElement('input');
    el.id = 'hid'; el.setAttribute('aria-hidden', 'true'); el.autocomplete = 'off'; el.spellcheck = false;
    el.style.cssText = 'position:fixed;left:50%;bottom:0;width:1px;height:1px;opacity:0;border:0;padding:0;';
    document.body.appendChild(el);
    el.addEventListener('input', () => { if (this.textEdit) this.textEdit.onChange(el.value.slice(0, this.textEdit.maxLen)); });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); el.blur(); this.canvas.focus(); }
      else if (e.key === 'Tab') { e.preventDefault(); el.blur(); this.canvas.focus(); this.renderer.cycleFocus(e.shiftKey ? -1 : 1); this.renderer.showFocus = true; }
    });
    el.addEventListener('blur', () => { this.textEdit = null; });
    this.hid = el;
  }
  /** Tapping a text field focuses a real (invisible) input so touch keyboards appear. */
  beginTextEdit(onChange, value, maxLen) { this.textEdit = { onChange, maxLen }; this.hid.value = value; this.hid.focus(); }

  /* ---- screens and modes ---- */
  setScreen(name) {
    if (this.screenCtx) { this.input.popContext(this.screenCtx); this.screenCtx = null; }
    this.screen = this.screens[name];
    if (this.screen.onKey) this.screenCtx = this.input.pushContext({ onKeyDown: (e) => this.screen.onKey(this, e) });
  }
  goTitle() { this.mode = 'title'; this.paused = false; this.helpOpen = false; this.setScreen('title'); }
  goSetup() { this.mode = 'setup'; this.setScreen('setup'); }
  /**
   * Autosaves happen at every phase boundary and between colonists in development. A manual exit also writes a save when the
   * current phase can be resumed exactly (`resumable`: land race, development, auctions); the other phases keep the last boundary
   * save, because re-entering them half-way could apply their effects twice.
   */
  exitToTitle() {
    const def = this.turns.phase && this.turns.get(this.turns.phase);
    if (def && def.resumable) this.save();
    this.turns.phase = null; this.goTitle();
  }
  newGame(opts) {
    const seed = (opts.seed && String(opts.seed).trim()) || this.randomSeed();
    const { state, rng } = GameState.create({ seed, level: opts.level, species: opts.species, playerName: (opts.playerName || 'Roger').trim() || 'Roger', colorId: opts.colorId });
    this.state = state; this.rng = rng; this.rt = {}; this.paused = false; this.helpOpen = false; this.mode = 'play';
    state.createdAt = Date.now();
    this.turns.enter(this, 'TURN_START');
  }
  continueGame() {
    const r = SaveSystem.load();
    if (!r || r.incompatible) {
      // Never accepted silently: the player is told why, and the old save is discarded.
      this.titleNotice = r && r.reason === 'old_rules'
        ? `El desat és d'una versió anterior (esquema ${r.version}) amb unes altres regles: no es pot continuar. Comença una partida nova.`
        : 'El desat és incompatible o està malmès. Comença una partida nova.';
      SaveSystem.clear(); this.goTitle(); return;
    }
    this.resume(r);
  }
  /** Re-enters the saved phase; resumable phases continue from their saved phaseData instead of starting again. */
  resume(r) {
    this.state = r.state; this.rng = new SeededRNG(r.state.seed); this.rng.setState(r.state.rngState);
    this.rt = {}; this.paused = false; this.mode = 'play';
    if (this.state.phase === 'GAME_OVER') { this.turns.phase = null; this.setScreen('gameover'); return; }
    const def = this.turns.get(this.state.phase);
    const resume = !!(def && def.resumable && this.state.phaseData && Object.keys(this.state.phaseData).length);
    this.turns.enter(this, this.state.phase, resume);
  }
  /** A resumable phase copies its live objects (e.g. the auction engine) into phaseData as plain data before a save. */
  snapshotPhase() {
    const def = this.turns.phase && this.turns.get(this.turns.phase);
    if (def && def.snapshot && this.state.phaseData === this.turns.phaseData) def.snapshot(this, this.turns);
  }
  save() {
    if (!this.state || this.mode !== 'play' || !this.persist) return;
    this.snapshotPhase();
    SaveSystem.save(this.state, this.rng);
  }
  /**
   * [Atari code] colony rating 0..6 (ScoringSystem.rating); the leader is the First Founder only when the ship is back (last round)
   * and the rating is at least 3 (a colony of $60,000, [manual]). The ranking is shown either way.
   * `lack` ('food' / 'energy'): [Atari code] the colony failed early for a total lack of that good (ScoringSystem.colonyFailure).
   */
  finish(lack = null) {
    const s = this.state; const surv = ScoringSystem.survival(s); const rank = ScoringSystem.ranking(s, this.rng);
    const rating = ScoringSystem.rating(surv.combined);
    const founder = !lack && s.turn >= lastRound(s) && rating >= CONFIG.RATING.founderMin;
    s.final = { survives: surv.survives && !lack, rating, combined: surv.combined, winnerId: founder ? rank[0].p.id : null, lack, rank: rank.map((x) => ({ id: x.p.id, b: x.b })) };
    s.phase = 'GAME_OVER'; this.turns.phase = null; this.setScreen('gameover'); this.save();
  }

  /* ---- loop ---- */
  start() {
    this.lastTs = null;
    const loop = (ts) => {
      if (this.lastTs === null) this.lastTs = ts;
      const raw = ts - this.lastTs; this.lastTs = ts;
      if (raw > 0) this.fps = Math.round(this.fps * 0.9 + (1000 / raw) * 0.1);
      this.tick(raw); this.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  /** Logic step. `dt` is capped so a slow frame or a tab switch never advances the game in one huge jump. */
  tick(rawDt) {
    const dt = Math.min(Math.max(rawDt, 0), CONFIG.MAX_DT_MS);
    if (this.paused || this.helpOpen) return;
    this.now += dt;
    if (this.mode === 'play' && this.turns.phase) this.turns.update(this, dt);
  }
  /** Test/debug helper: runs `ms` of game time in fixed steps (optionally until `until()` is true). */
  fastForward(ms, step = 50, until = null) {
    for (let t = 0; t < ms; t += step) { this.tick(step); if (until && until()) return true; }
    return until ? until() : true;
  }
  render() {
    const r = this.renderer; r.begin();
    if (this.mode === 'loading') this.drawLoading(r);
    else if (this.mode === 'test') this.drawTests(r);
    else {
      this.screen.draw(this, r);
      if (this.mode === 'title' && this.titleNotice) r.text(this.titleNotice, 64, 620, { size: 18, color: COL.bad, maxW: 1100 });
      if (this.helpOpen) { r.beginModal(); r.region('barrier', 0, 0, CONFIG.W, CONFIG.H, {}); this.help.draw(this, r); }
      else if (this.paused) { r.beginModal(); r.region('barrier', 0, 0, CONFIG.W, CONFIG.H, {}); this.pauseOv.draw(this, r); }
    }
  }
  drawLoading(r) {
    r.text('R.U.C.', 640, 200, { size: 72, color: COL.amber, align: 'center' });
    r.bar(390, 340, 500, 24, this.assets.progress, COL.cyan);
    r.text(`Carregant recursos ${Math.round(this.assets.progress * 100)}% (${this.assets.settled}/${this.assets.list.length})`, 640, 380, { size: 18, align: 'center' });
  }
  drawTests(r) {
    const res = this.testResults; const rows = 25; const cols = Math.max(1, Math.ceil(res.results.length / rows)); const cw = Math.floor(1260 / cols);
    r.text(`Self-tests: ${res.passed}/${res.total} PASS${res.failed ? ` · ${res.failed} FAIL` : ''} (detall complet a la consola)`, 16, 10, { size: 22, color: res.failed ? COL.bad : COL.good });
    res.results.forEach((t, i) => {
      const col = Math.floor(i / rows); const y = 44 + (i % rows) * 27;
      r.text(`${t.ok ? 'PASS' : 'FAIL'} ${t.name}`, 12 + col * cw, y, { size: 16, color: t.ok ? COL.good : COL.bad, maxW: cw - 16 });
      if (!t.ok) r.text(t.detail, 36 + col * cw, y + 13, { size: 16, color: COL.amber, maxW: cw - 40 });
    });
  }

  /* ---- what the HUD/instruction line shows ---- */
  /** { left, total } time-bar units for the HUD's shrinking bar (auctions), or null. Development uses the vertical bar on the map (MapScreen.timeBar). */
  hudTimer() {
    const ph = this.turns.phase;
    if (ph && ph.startsWith('AUCTION_') && this.rt.auction) { const e = this.rt.auction.engine; return { left: e.units, total: e.unitsTotal }; }
    const la = this.landAuction();
    if (la && la.stage === 'bid') return { left: la.units, total: la.unitsTotal };
    return null;
  }
  /** The live land-auction object while the LAND_AUCTION phase runs (null otherwise). */
  landAuction() { return this.turns.phase === 'LAND_AUCTION' && this.turns.phaseData ? this.turns.phaseData.landAuction || null : null; }
  /** The live land-race object while the LAND_GRANT phase runs (null otherwise). */
  landRace() { return this.turns.phase === 'LAND_GRANT' && this.turns.phaseData ? this.turns.phaseData.land || null : null; }
  /** The colonist whose development turn is running (null outside DEVELOPMENT). */
  devSlot() { const d = this.turns.phase === 'DEVELOPMENT' && this.turns.phaseData ? this.turns.phaseData.dev : null; return d ? d.slot : null; }
  /** The human's walker while it is really walking (null during the event card, the AI turns and after the end). */
  humanWalk() { const s = this.devSlot(); return s && s.stage === 'walk' && s.walk && !s.walk.ended ? s.walk : null; }
  instruction() {
    const ph = this.turns.phase;
    if (ph === 'LAND_GRANT') {
      const land = this.landRace(); if (!land) return '';
      const mine = land.claimed.p0;
      if (mine !== undefined) return `Has reclamat la parcel·la #${mine + 1}. Esperant els altres...`;
      if (land.done) return 'Aquest torn no tens parcel·la.';
      if (land.pause > 0 && land.lastClaim) return `${playerById(this.state, land.lastClaim.pid).name} ha reclamat la parcel·la #${land.lastClaim.plot + 1}`;
      return 'Clica o prem Enter per reclamar aquesta parcel·la';
    }
    if (ph === 'DEVELOPMENT') {
      const slot = this.devSlot(); if (!slot) return '';
      const w = this.humanWalk();
      if (w) {
        if (w.marking && !w.carrying) return w.markPlot === null ? 'Oficina de terres: prem Acció sobre una parcel·la teva per marcar-la i torna a l\'oficina.' : `Parcel·la #${w.markPlot + 1} marcada: torna a l'oficina de terres per posar-la a la venda.`;
        if (!w.carrying) return w.area === 'town' ? 'Compra un RUC al corral, o ves al pub a acabar el torn.' : 'Torna al poble per un RUC, o retira\'n un de la casa d\'una parcel·la teva.';
        if (!w.carrying.module) return w.area === 'town' ? 'Entra a un taller per equipar el RUC.' : 'Torna al poble: el RUC s\'ha d\'equipar a un taller.';
        return w.area === 'town' ? 'Surt del poble i porta el RUC a la casa d\'una parcel·la teva.' : 'Posa\'t sobre la casa d\'una parcel·la teva i prem Acció.';
      }
      if (slot.stage === 'ready') return 'Prem el botó per començar (Acció, Enter, Espai o clic).';
      return `Desenvolupament: torn de ${playerById(this.state, slot.pid).name}`;
    }
    if (ph === 'PLANET_EVENT') return 'Esdeveniment planetari abans de la producció';
    if (ph === 'PLANET_EVENT_AFTER') return 'Esdeveniment planetari després de la producció';
    return ph ? this.turns.get(ph).label : '';
  }

  /* ---- human actions ---- */
  /** The human "buzzer" of the land race: stamped on the GAME clock, so it is deterministic and frozen by pause. */
  humanClaim() {
    const land = this.landRace();
    if (!land || this.paused || this.helpOpen) return;
    if (LandRace.press(land, 'p0')) this.audio.play('click');
  }
  /** Walking direction: held arrow keys plus the on-screen pad (touch / pointer). */
  devDirs() { return walkDirs(this.input.keys, this.rt.pad); }
  /** The colonist's action button. There is deliberately no way to pick a plot, buy or outfit from a panel. */
  devAction() { const w = this.humanWalk(); if (w && !this.paused && !this.helpOpen) DevWalk.act(this.state, w); }
  devFinish() { const w = this.humanWalk(); if (w && !this.paused) DevWalk.end(this.state, w, 'done'); }
  /** [C64] "PRESS YOUR STICK BUTTON TO START": the human's walk and its clock start only now. */
  devStart() {
    const s = this.devSlot(); if (!s || s.stage !== 'ready' || this.paused || this.helpOpen) return;
    s.stage = 'walk'; s.walk = DevWalk.create(this.state, s.pid, ConsumptionSystem.humanTimeMs(this.state, playerById(this.state, s.pid)));
  }
  devFeedback(w) {
    const kind = w.log[w.log.length - 1];
    this.audio.play(w.bad ? 'error' : kind === 'install' ? 'phase' : 'click');
    if (w.msg) this.announce(w.msg);
  }
  /** Starts the colonist whose turn it is: [Atari code] its own personal event draw (27.5 %), then the walk (human) or the AI's moves. */
  startDevSlot() {
    const dev = this.turns.phaseData.dev; const s = this.state;
    if (dev.idx >= dev.order.length) { this.turns.canAdvance = true; return; }
    const pid = dev.order[dev.idx]; const p = playerById(s, pid);
    const fi = this.debugForced.findIndex((id) => EVENT_DEFS[id] && EVENT_DEFS[id].scope === 'individual');
    const forced = p.isHuman && fi >= 0 ? this.debugForced.splice(fi, 1)[0] : null;
    const ev = EventSystem.rollIndividual(s, this.rng, pid, forced);
    if (ev) { s.event.items.push(ev); this.audio.play('event'); }
    const slot = { pid, event: ev, stage: 'show', timer: 0, log: [], walk: null };
    if (p.isHuman && !this.autopilot) {
      // [C64] the personal event (if any) is shown first, then "press the button to start"; the walk is created by devStart.
      slot.stage = 'ready';
      this.announce(`${ev ? `${ev.text} ` : ''}Prem el botó per començar.`);
    } else {
      if (ev) slot.log.push(`${p.name}: ${ev.text}`);
      const turn = AISystem.turn(s, this.rng, p);
      turn.installs.forEach((a) => slot.log.push(`${p.name}: RUC de ${resLabel(a.module).toLowerCase()} a la parcel·la ${a.plotId + 1}`));
      if (!turn.installs.length) slot.log.push(`${p.name} no instal·la cap RUC aquest torn.`);
      if (turn.pub) slot.log.push(`${p.name} va al pub i guanya ${turn.pub} cr jugant.`);
      slot.timer = this.fast(ev ? 2600 : 1400);
      this.announce(slot.log.join(' '));
    }
    dev.slot = slot;
  }
  updateDevelopment(dt) {
    const dev = this.turns.phaseData.dev; const slot = dev.slot;
    if (!slot) { this.startDevSlot(); return; }
    if (slot.stage === 'ready') return; // waits for the button (devStart)
    if (slot.stage === 'walk') {
      const w = slot.walk;
      DevWalk.update(this.state, w, this.devDirs(), dt);
      if (w.seq !== this.rt.walkSeq) { this.rt.walkSeq = w.seq; this.devFeedback(w); }
      if (w.ended) {
        const why = w.ended === 'timeout' ? 'S\'ha acabat el temps de desenvolupament.' : w.ended === 'pub' ? 'Has anat al pub: el torn s\'acaba.' : 'Has acabat el torn.';
        slot.stage = 'show'; slot.timer = w.ended === 'pub' ? 2500 : 1500; slot.log = [why, w.msg].filter(Boolean);
      }
      return;
    }
    slot.timer -= dt;
    if (slot.timer > 0) return;
    dev.idx += 1; dev.slot = null; this.rt.walkSeq = null; this.rt.pad = { x: 0, y: 0 };
    if (dev.idx >= dev.order.length) { this.turns.canAdvance = true; return; }
    // Boundary save between colonists: a reload starts the next colonist's turn (and its event draw) exactly once.
    this.save();
    this.startDevSlot();
  }
  /** Sounds and screen-reader text when a land-auction lot changes stage. */
  landAuctionFeedback(la) {
    if (la.stage === 'intro' && la.lot) { this.rt.landView = { hi: 0 }; this.announce(`Parcel·la #${la.lot.plotId + 1}: les ofertes comencen a ${la.lot.start} cr`); }
    if (la.stage === 'result') {
      const r = la.result;
      this.audio.play(r.sold ? 'trade' : 'phase');
      this.announce(r.sold ? `Parcel·la venuda! Preu de venda: ${r.price} cr (${playerById(this.state, r.buyer).name})` : 'Sense ofertes. La parcel·la no s\'ha venut!');
    }
  }
  /** Shows a planetary card; a quiet round (no event, or no target) shows nothing and moves on at once, as the original. */
  showPlanetCard(ts, rec) {
    ts.phaseData.items = rec ? [rec] : []; ts.phaseData.skippable = true;
    ts.phaseData.timer = rec ? this.fast(4000) : 0;
    if (rec) { this.audio.play('event'); this.announce(`${rec.name}. ${rec.text}`); }
    this.setScreen('map');
  }
  skipPhase() { if (this.turns.phaseData && this.turns.phaseData.skippable) this.turns.canAdvance = true; }

  /* ---- auction input ---- */
  /** Roles can only be chosen during the declaration ([manual]); afterwards they are fixed. */
  auctionRole(role) {
    const a = this.rt.auction; if (!a || a.engine.ended || !a.engine.canDeclare()) return;
    if (role !== ROLE.OUT) a.lastRole = role;
    a.engine.setRole('p0', role);
  }
  /** [Atari code] a human marker moves one step per 8 frames (the line speed of every colonist); Shift x3 is a R.U.C. convenience. */
  humanStepsPerSec() { return (1000 / AuctionEngine.lineMs()) * (this.input.keys.has('Shift') ? 3 : 1); }
  auctionToggleOut() {
    const a = this.rt.auction; if (!a) return;
    this.auctionRole(a.engine.entry('p0').role === ROLE.OUT ? (a.lastRole || ROLE.BUYER) : ROLE.OUT);
  }
  updateAuctionInput(dt) {
    const a = this.rt.auction; const e = a.engine; const k = this.input.keys;
    if (e.stage !== 'trade' || e.entry('p0').role === ROLE.OUT) return;
    const dir = (k.has('ArrowUp') ? 1 : 0) - (k.has('ArrowDown') ? 1 : 0);
    if (dir) { e.nudge('p0', dir, dt, this.humanStepsPerSec()); e.push(); }
  }
  /** Human marker in the land auction: the same keys and line speed as the goods auction. */
  updateLandInput(dt) {
    const la = this.landAuction(); const k = this.input.keys;
    if (!la || la.stage !== 'bid' || !la.bids.p0) return;
    const dir = (k.has('ArrowUp') ? 1 : 0) - (k.has('ArrowDown') ? 1 : 0);
    if (dir) { LandAuction.nudge(this.state, la, 'p0', dir, dt, this.humanStepsPerSec()); LandAuction.push(la); }
  }
  /** Pointer / touch: puts the human's land bid at a price (dragging the lane or the buttons). */
  landBid(price) {
    const la = this.landAuction(); if (!la || la.stage !== 'bid' || !la.bids.p0 || this.paused) return;
    LandAuction.setBid(this.state, la, 'p0', price); LandAuction.push(la);
  }
  /** Shortens the result card of the current lot (button / Enter). */
  landNext() { const la = this.landAuction(); if (la && la.stage === 'result') la.timer = 0; }
  /** Visible price window: from the store minimum up to a top that only grows during the auction (never past the colonist limit). */
  auctionView() {
    const a = this.rt.auction; const e = a.engine; const m = e.market;
    const prices = e.entries.filter((x) => x.role !== ROLE.OUT).map((x) => x.price).concat([e.centralPrice()]);
    const want = Math.ceil((Math.max(...prices) * 1.3 + 10) / 20) * 20;
    a.viewHi = Math.min(Math.max(a.viewHi || 0, want, m.minPrice + 60), e.playerMax());
    return { lo: m.minPrice, hi: Math.max(a.viewHi, m.minPrice + 20) };
  }

  /* ---- debug ---- */
  debugNextPhase() {
    const a = this.rt.auction;
    const la = this.landAuction();
    if (a && this.turns.phase && this.turns.phase.startsWith('AUCTION_') && !a.engine.ended) a.engine._end('debug');
    else if (la && !la.done) LandAuction.finish(this.state, la);
    else if (this.turns.phase === 'DEVELOPMENT' && this.humanWalk()) this.devFinish();
    else this.turns.canAdvance = true;
  }
  debugCash() { ResourceLedger.moveCash(this.state, 'nature', 'p0', 1000); }
  /** Applies ONE event right now (individual ones target the human); nothing else changes. */
  debugEvent() {
    const ids = Object.keys(EVENT_DEFS); this.debugEventIdx = ((this.debugEventIdx || 0) + 1) % ids.length;
    const id = ids[this.debugEventIdx]; const def = EVENT_DEFS[id];
    try {
      const personal = def.scope === 'individual';
      const ok = !personal || (EventSystem.precondition(this.state, id, 'p0') && EventSystem.affordable(this.state, id, 'p0'));
      const rec = ok ? EventSystem.build(this.state, this.rng, id, personal ? 'p0' : null) : null;
      if (!rec) { this.debugLog = `${id}: ara no és aplicable`; return; }
      this.state.event = this.state.event || { items: [] }; this.state.event.items.push(rec); this.debugLog = `forçat: ${id}`;
    } catch (e) { this.debugLog = `error ${e.message}`; }
  }
  drawDebugBar(r) {
    const s = this.state; const y = 696;
    r.panel(0, y, CONFIG.W, 24, { fill: 'rgba(60,20,40,0.94)', frame: false });
    const stock = enabledResources().map((d) => `${d.id[0].toUpperCase()}${s.store.stock[d.id]}`).join(' ');
    r.text(`${this.turns.phase} · llavor ${s.seed} · ${this.fps} FPS · botiga ${stock} · RUC ${s.store.ruc} · ${this.debugAI()} ${this.debugLog}`, 8, y + 3, { size: 16, maxW: 780, shadow: false });
    r.button('dbg-next', 'Següent fase', 800, y, 150, 24, { size: 16, onClick: () => this.debugNextPhase() });
    r.button('dbg-cash', '+1000 cr', 958, y, 110, 24, { size: 16, onClick: () => this.debugCash() });
    r.button('dbg-ev', 'Força esdeveniment', 1076, y, 188, 24, { size: 16, onClick: () => this.debugEvent() });
  }
  debugAI() {
    const a = this.rt.auction; if (!a) return '';
    return this.state.players.slice(1).map((p) => { const b = a.brains[p.id]; return b ? `${p.name[0]}:${b.role[0]}${b.target ? Math.round(b.target) : '-'}` : ''; }).join(' ');
  }

  /* ---- turn phases ([manual] cycle: land grant, development, planetary event, production, status, auctions, summary) ---- */
  defineTurnPhases() {
    const timed = (g, dt, ts) => { ts.phaseData.timer -= dt; if (ts.phaseData.timer <= 0) ts.canAdvance = true; };
    const defs = [
      {
        // [C64] round 1 opens with the landing: "Aterreu al planeta Irata." / "La nau tornarà d'aquí a N mesos." (a skippable card).
        id: 'TURN_START', label: 'Inici de torn',
        enter: (g, ts) => {
          const s = g.state; s.turn += 1; s.modifiers = GameState.freshModifiers(); s.event = { items: [] }; EventSystem.rankPlayers(s, g.rng); g.rt = {};
          if (s.turn === 1) g.showPlanetCard(ts, EventSystem.landing(s)); else { g.setScreen('map'); ts.canAdvance = true; }
        },
        update: timed
      },
      {
        id: 'LAND_GRANT', label: 'Adjudicació de terra', save: true, resumable: true,
        enter: (g, ts) => {
          g.setScreen('map');
          if (ts.phaseData.land) return; // resumed from a save taken mid-sweep: keep cursor, timers and claims as they were
          // The autopilot human is driven by the same AI planner (with its simulated reaction time).
          const aiIds = g.state.players.filter((p) => !p.isHuman || g.autopilot).map((p) => p.id);
          ts.phaseData.land = LandRace.create(g.state, g.rng, aiIds);
        },
        update: (g, dt, ts) => {
          const land = ts.phaseData.land;
          LandRace.update(g.state, g.rng, land, dt);
          const c = land.lastClaim; const key = c ? `${c.pid}@${c.clock}` : '';
          if (c && key !== g.rt.seenClaim) {
            g.rt.seenClaim = key; g.audio.play(c.pid === 'p0' ? 'trade' : 'phase');
            g.announce(`${playerById(g.state, c.pid).name} reclama la parcel·la ${c.plot + 1}`);
          }
          if (land.done) { land.hold -= dt; if (land.hold <= 0) ts.canAdvance = true; }
        }
      },
      {
        // [Atari code][C64] Standard: right after the land grant, the marked plots and 0-3 colony plots are auctioned (LandAuction).
        id: 'LAND_AUCTION', label: 'Subhasta de terres', save: true, resumable: true,
        enter: (g, ts) => {
          if (!ts.phaseData.landAuction) {
            const aiIds = g.state.players.filter((p) => !p.isHuman || g.autopilot).map((p) => p.id);
            ts.phaseData.landAuction = LandAuction.create(g.state, g.rng, aiIds, { fast: g.autopilot });
          }
          const la = ts.phaseData.landAuction;
          if (la.done) { ts.canAdvance = true; return; }
          g.setScreen('landAuction'); g.rt.landView = { hi: 0 };
          g.announce(`Subhasta de terres: les ofertes comencen a ${la.lot.start} cr`);
        },
        update: (g, dt, ts) => {
          const la = ts.phaseData.landAuction;
          if (!g.autopilot) g.updateLandInput(dt);
          const before = `${la.stage}|${la.lot && la.lot.plotId}`;
          LandAuction.update(g.state, g.rng, la, dt);
          if (`${la.stage}|${la.lot && la.lot.plotId}` !== before) g.landAuctionFeedback(la);
          if (la.done) ts.canAdvance = true;
        }
      },
      {
        // One colonist after another in net-worth order (DevOrder). The whole queue lives in phaseData, so it can be saved mid-way.
        id: 'DEVELOPMENT', label: 'Desenvolupament', save: true, resumable: true,
        enter: (g, ts) => {
          g.setScreen('map'); g.rt.pad = { x: 0, y: 0 };
          if (!ts.phaseData.dev) ts.phaseData.dev = DevOrder.create(g.state);
          if (!ts.phaseData.dev.slot) g.startDevSlot();
        },
        update: (g, dt) => g.updateDevelopment(dt)
      },
      {
        // [Atari code] rounds 1-11: one ticket from the bag. "Before production" events act now; "after production" ones wait for
        // PLANET_EVENT_AFTER. Round 12: "THE SHIP IS BACK!" and no draw. A debug-forced event replaces the draw (no ticket used).
        id: 'PLANET_EVENT', label: 'Esdeveniment planetari', save: true,
        enter: (g, ts) => {
          const s = g.state; let rec = null;
          if (s.turn >= lastRound(s)) rec = EventSystem.shipBack();
          else {
            const fi = g.debugForced.findIndex((id) => EVENT_DEFS[id] && EVENT_DEFS[id].scope === 'planet');
            const id = fi >= 0 ? g.debugForced.splice(fi, 1)[0] : EventSystem.drawPlanet(s, g.rng);
            if (EVENT_DEFS[id].timing === 'after') s.events.after = id;
            else { rec = EventSystem.build(s, g.rng, id, null); if (rec) s.event.items.push(rec); }
          }
          g.showPlanetCard(ts, rec);
        },
        update: timed
      },
      {
        id: 'PRODUCTION', label: 'Producció', save: true,
        enter: (g, ts) => {
          const st = SettlementSystem.run(g.state, g.rng);
          const order = []; st.rows.forEach((row) => row.items.forEach((it) => order.push({ playerId: row.playerId, ...it })));
          g.rt.prod = { reports: st.rows, order, t: 0, duration: g.fast(g.settings.reduceMotion ? 1800 : 5000) }; ts.phaseData.skippable = true; g.setScreen('production');
          g.announce('Producció completada');
        },
        update: (g, dt, ts) => { const p = g.rt.prod; p.t += dt; if (p.t >= p.duration + g.fast(2500)) ts.canAdvance = true; }
      },
      {
        // [Atari code] pest, pirates and fire strike after the production has been shown.
        id: 'PLANET_EVENT_AFTER', label: 'Esdeveniment planetari', save: true,
        enter: (g, ts) => {
          const s = g.state; const id = s.events.after; s.events.after = null;
          const rec = id ? EventSystem.build(s, g.rng, id, null) : null;
          if (rec) s.event.items.push(rec);
          g.showPlanetCard(ts, rec);
        },
        update: timed
      },
      {
        id: 'STATUS', label: 'Estat: consum i malbaratament', save: true,
        enter: (g, ts) => { g.rt.reportMode = 'status'; ts.phaseData.timer = g.fast(400); ts.phaseData.skippable = true; g.setScreen('report'); g.announce('Estat del torn: consum, malbaratament i collita'); },
        update: (g, dt, ts) => { if (g.autopilot) timed(g, dt, ts); }
      }
    ];
    auctionResources().forEach((d) => defs.push(this.auctionPhase(d)));
    defs.push(
      {
        id: 'TURN_REPORT', label: 'Informe del torn', save: true,
        enter: (g, ts) => {
          const s = g.state;
          // [PROVISIONAL] order: P for the next round's auctions first, then the M.U.L.E. build (see StoreSystem.updatePrices).
          StoreSystem.updatePrices(s, g.rng); g.rt.storeReport = StoreSystem.betweenTurns(s); ScoringSystem.endTurn(s);
          g.rt.turnRank = ScoringSystem.ranking(s, g.rng); g.rt.auctionSummary = s.auctionLog.filter((x) => x.turn === s.turn);
          g.rt.reportMode = 'turn'; ts.phaseData.skippable = true; ts.phaseData.timer = g.fast(400); g.setScreen('report');
          g.announce(`Informe del torn ${s.turn}`);
        },
        update: (g, dt, ts) => { if (g.autopilot) timed(g, dt, ts); }
      },
      { id: 'AUTOSAVE', label: 'Desat', enter: (g, ts) => { g.save(); ts.canAdvance = true; } },
      {
        id: 'NEXT', label: 'Següent / final',
        enter: (g, ts) => { const lack = ScoringSystem.colonyFailure(g.state); if (lack || g.state.turn >= lastRound(g.state)) g.finish(lack); else ts.canAdvance = true; }
      }
    );
    this.turns.define(defs);
  }
  auctionPhase(def) {
    return {
      id: `AUCTION_${def.id}`, label: `Subhasta de ${def.label.toLowerCase()}`, save: true, resumable: true,
      enter: (g, ts) => {
        const s = g.state; const market = AuctionEngine.fungibleMarket(def); const onTrade = () => g.audio.play('trade');
        const saved = ts.phaseData.auction;
        if (saved) {
          // Resumed from a save taken mid-auction (declaration or trade stage): exact engine, AI brains and roles.
          g.rt.auction = { engine: AuctionEngine.restore(saved.engine, { market, state: s, rng: g.rng, onTrade }), brains: JSON.parse(JSON.stringify(saved.brains)), res: def.id, endHold: saved.endHold, lastRole: saved.lastRole, viewHi: saved.viewHi };
        } else {
          const engine = new AuctionEngine({ market, state: s, rng: g.rng, colonists: s.players.map((p) => p.id), onTrade });
          const brains = {};
          s.players.forEach((p) => { if (!p.isHuman || g.autopilot) brains[p.id] = AISystem.createBrain(s, g.rng, p); });
          // [manual] with a surplus your character jumps to SELL, otherwise to BUY; the human can change it until the declaration ends.
          s.players.forEach((p) => { if (p.isHuman && !g.autopilot) engine.setRole(p.id, AISystem.defaultRole(s, p, def.id)); });
          g.rt.auction = { engine, brains, res: def.id, endHold: 0, lastRole: ROLE.BUYER, viewHi: 0 };
        }
        g.setScreen('auction'); g.announce(`Subhasta de ${def.label}: declareu-vos compradors o venedors`);
      },
      snapshot: (g, ts) => {
        const a = g.rt.auction;
        if (a) ts.phaseData.auction = { engine: a.engine.snapshot(), brains: JSON.parse(JSON.stringify(a.brains)), endHold: a.endHold, lastRole: a.lastRole, viewHi: a.viewHi || 0 };
      },
      update: (g, dt, ts) => {
        const a = g.rt.auction; const e = a.engine; const s = g.state;
        if (!e.ended) {
          s.players.forEach((p) => { const b = a.brains[p.id]; if (b) AISystem.tick(s, g.rng, p, b, e, dt); });
          if (!g.autopilot) g.updateAuctionInput(dt);
          e.update(dt);
        } else {
          a.endHold += dt; ts.phaseData.skippable = true;
          if (a.endHold >= (g.autopilot ? 200 : 4000)) ts.canAdvance = true;
        }
      },
      exit: (g) => {
        const s = g.state; const e = g.rt.auction.engine; const res = e.result;
        s.auctionLog.push({ turn: s.turn, res: res.res, volume: res.volume, min: res.min, avg: res.avg, max: res.max });
        StoreSystem.afterAuction(s, def.id, res);
        g.rt.auction.engine.ended = true;
      }
    };
  }
}

(function boot() {
  const canvas = document.getElementById('game');
  const params = new URLSearchParams(location.search);
  const assets = new AssetLoader();
  const game = new Game(canvas, assets);
  game.debug = params.get('debug') === '1';
  window.RUC = { game, assets, runSelfTests, CONFIG, FEATURES, AuctionEngine, LandAuction, ResourceLedger, RucAudit, ScoringSystem, SaveSystem, GameState, AISystem, SettlementSystem, EventSystem, DevWalk, PubSystem, LandOffice };
  if (params.get('test') === '1') {
    game.mode = 'test'; game.testResults = runSelfTests(); window.__testResults = game.testResults;
    console.log(`SELFTESTS ${game.testResults.passed}/${game.testResults.total}`);
    game.testResults.results.filter((t) => !t.ok).forEach((t) => console.log(`SELFTEST FAIL ${t.name}: ${t.detail}`));
    game.start(); return;
  }
  if (params.get('seed')) game.setup.seed = params.get('seed');
  game.start();
  assets.load().then(() => {
    game.mode = 'title'; game.setScreen('title'); canvas.focus();
    if (params.get('autoplay') === '1') { game.autopilot = true; game.newGame({ seed: game.setup.seed, level: params.get('level') || 'standard', playerName: 'Roger', colorId: 'yellow' }); }
  });
}());
