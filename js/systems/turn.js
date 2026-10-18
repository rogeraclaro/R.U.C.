'use strict';
/** Ordered phase list with insertion by ID, so Phase B can plug phases in without touching the engine. */
class TurnSystem {
  constructor() {
    this.phases = [];
    this.hooks = { afterDevelopment: [] };
    this.phase = null; this.phaseStartedAt = 0; this.phaseData = {}; this.canAdvance = false;
  }
  define(defs) { this.phases = defs.slice(); }
  indexOf(id) { return this.phases.findIndex((p) => p.id === id); }
  get(id) { return this.phases[this.indexOf(id)]; }
  insertAfter(id, def) { const i = this.indexOf(id); if (i < 0) throw new Error(`no phase ${id}`); this.phases.splice(i + 1, 0, def); }
  insertBefore(id, def) { const i = this.indexOf(id); if (i < 0) throw new Error(`no phase ${id}`); this.phases.splice(i, 0, def); }
  onHook(name, fn) { (this.hooks[name] = this.hooks[name] || []).push(fn); }
  runHook(name, game) { (this.hooks[name] || []).forEach((fn) => fn(game)); }
  nextId(id) { const i = this.indexOf(id); return this.phases[(i + 1) % this.phases.length].id; }
  /** `resume` re-enters a phase with the phaseData stored in the save (phases marked `resumable` can be saved mid-way). */
  enter(game, id, resume = false) {
    const def = this.get(id);
    if (!def) throw new Error(`unknown phase ${id}`);
    this.phase = id; this.phaseStartedAt = game.now; this.phaseData = resume && game.state.phaseData ? game.state.phaseData : {}; this.canAdvance = false;
    game.state.phase = id; game.state.phaseData = this.phaseData;
    game.announce(def.label);
    if (def.enter) def.enter(game, this);
  }
  update(game, dt) {
    const def = this.get(this.phase);
    if (!def) return;
    if (def.update) def.update(game, dt, this);
    if (this.canAdvance) this.advance(game);
  }
  advance(game) {
    const def = this.get(this.phase);
    if (def.exit) def.exit(game, this);
    if (this.phase === 'DEVELOPMENT') this.runHook('afterDevelopment', game);
    const next = this.nextId(this.phase);
    game.state.phase = next; game.state.phaseData = {};
    if (def.save) game.save();
    this.enter(game, next);
  }
}
