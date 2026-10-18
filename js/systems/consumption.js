'use strict';
const ConsumptionSystem = {
  /** [Atari code][C64] food required for the current round: 3 (rounds 1-4), 4 (5-8), 5 (9-12). */
  foodNeed(turn) { const r = CONFIG.FOOD_NEED.find((x) => turn >= x.from && turn <= x.to); return r ? r.n : CONFIG.FOOD_NEED[2].n; },
  /** [Atari code][C64] development time units = 10 + floor(91 x min(1, food / need)): 101 with enough food, 10 with none. */
  devUnits(food, need) { return CONFIG.DEV.baseUnits + Math.floor(CONFIG.DEV.foodUnits * Math.min(1, need > 0 ? food / need : 1)); },
  /** [Atari code] frames per development unit: 4 x (7 BTU + species BTU (Flapper +2, Humanoid -2) + level BTU (Beginner +2)). */
  unitFrames(state, player) { return CONFIG.DEV.btuFrames * (CONFIG.DEV.unitBtu + speciesById(player.species).btu + levelRules(state).extraBtu); },
  /** One development unit in ms ([C64] PAL 50.125 Hz). */
  unitMs(state, player) { return this.unitFrames(state, player) * 1000 / CONFIG.DEV.palHz; },
  /** Development units of a colonist this turn, counted with the food it holds when its turn starts (eaten later, at production). */
  turnUnits(state, player) { return this.devUnits(player.inventory.food || 0, this.foodNeed(state.turn)); },
  /** Development time in ms: 101 units ~ 56.4 s, 10 units ~ 5.6 s (Standard, 28-frame units). No money penalty for hunger. */
  humanTimeMs(state, player) { return Math.round(this.turnUnits(state, player) * this.unitFrames(state, player) * 1000 / CONFIG.DEV.palHz); }
};
