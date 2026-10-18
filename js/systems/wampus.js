'use strict';
/**
 * The Mountain Wampus (mechanics.md §9, [Atari code] unless tagged). [manual] "The Wampus lives in caves in the mountains. When he
 * opens his door, his bell rings and a light flashes. If you catch him, he will pay you to let him go." You must be outside of
 * town and without a M.U.L.E. Computers never catch him ([Atari code][manual]), so only the human walk carries one.
 * State: plain JSON in the walk (`w.wampus`), saved mid-turn with it; its own seeded PRNG state (`rng`), so the hunt never disturbs
 * the game's PRNG stream and resumes exactly. It runs on the development clock in the walk's fixed steps (DevWalk.update).
 * Times are counted in the colonist's development units (PTU = w.unitMs: 7 BTU + species + level, see ConsumptionSystem).
 * Beginner has him too: the manual does not tie him to a level [PROVISIONAL].
 */
const WampusSystem = {
  /** [Atari code] 100 x (floor(round / 4) + 1): rounds 1-3 $100, 4-7 $200, 8-11 $300, 12 $400. */
  reward(round) { return 100 * (Math.floor(round / 4) + 1); },
  /**
   * [Atari code] first appearance after Ta/4 PTU: Ta = BTU waited before pressing start, capped at 255; a personal event takes 100
   * BTU off. The cap before the subtraction, the floor at 0 and the whole-PTU rounding are [PROVISIONAL] readings.
   */
  firstDelayPtu(waitMs, hadEvent) {
    const btuMs = CONFIG.DEV.btuFrames * 1000 / CONFIG.DEV.palHz;
    const ta = Math.max(0, Math.min(255, Math.floor(waitMs / btuMs)) - (hadEvent ? 100 : 0));
    return Math.floor(ta / 4);
  },
  mountains(state) { return state.plots.filter((p) => p.terrain === TERRAIN.MOUNTAIN).map((p) => p.id); },
  /** Hidden in a random mountain; `t` = ms until he next opens his door. `shown` counts appearances (the game rings the bell). */
  create(state, pid, waitMs, hadEvent) {
    const rng = new SeededRNG(`wampus|${state.seed}|${state.turn}|${pid}`); const ms = this.mountains(state);
    const plotId = ms.length ? rng.pick(ms) : null;
    const unitMs = ConsumptionSystem.unitMs(state, playerById(state, pid));
    return { rng: rng.getState(), plotId, next: plotId, visible: false, t: this.firstDelayPtu(waitMs, hadEvent) * unitMs, caught: false, shown: 0 };
  },
  /** One fixed step of the development clock. */
  step(state, w, dtMs) {
    const wp = w.wampus;
    if (!wp || wp.caught || wp.plotId === null) return;
    wp.t -= dtMs;
    if (wp.t > 1e-6) return;
    const rng = new SeededRNG(0); rng.setState(wp.rng);
    if (wp.visible) { wp.visible = false; this.hide(state, wp, rng, w.unitMs); } else this.appear(state, w, wp, rng);
    wp.rng = rng.getState();
  },
  /** [Atari code] 50 %: stays put for 4-7 PTU; 50 %: moves to a random mountain after exactly 2 PTU. */
  hide(state, wp, rng, unitMs) {
    if (rng.chance(50)) { wp.next = wp.plotId; wp.t += rng.range(4, 7) * unitMs; } else { wp.next = rng.pick(this.mountains(state)); wp.t += 2 * unitMs; }
  },
  /** [Atari code][manual] standing on his mountain keeps him from opening his door: he hides again. Visible for 1-4 PTU. */
  appear(state, w, wp, rng) {
    wp.plotId = wp.next;
    if (w.area === 'map' && DevWalk.atHouse(w, state.plots[wp.plotId])) { this.hide(state, wp, rng, w.unitMs); return; }
    wp.visible = true; wp.shown += 1; wp.t += rng.range(1, 4) * w.unitMs;
  },
  /**
   * The action button on his plot while he is visible, outside town, with no M.U.L.E. in tow: he pays the reward (money from outside
   * the colony, like the pub) and is gone for the rest of the turn ([Atari code] once per turn). The turn goes on: nothing in the
   * manual or the code ends it (unlike the pub). Returns the amount (0 = no catch).
   */
  tryCatch(state, w) {
    const wp = w.wampus;
    if (!wp || wp.caught || !wp.visible || w.area !== 'map' || w.carrying || !DevWalk.atHouse(w, state.plots[wp.plotId])) return 0;
    const won = this.reward(state.turn);
    ResourceLedger.moveCash(state, 'nature', w.pid, won);
    wp.caught = true; wp.visible = false;
    return won;
  }
};
