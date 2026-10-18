'use strict';
const ConsumptionSystem = {
  /** [Atari code][C64] food required for the current round: 3 (rounds 1-4), 4 (5-8), 5 (9-12). */
  foodNeed(turn) { const r = CONFIG.FOOD_NEED.find((x) => turn >= x.from && turn <= x.to); return r ? r.n : CONFIG.FOOD_NEED[2].n; },
  /** [Atari code][C64] development time units = 10 + floor(91 x min(1, food / need)): 101 with enough food, 10 with none. */
  devUnits(food, need) { return CONFIG.DEV.baseUnits + Math.floor(CONFIG.DEV.foodUnits * Math.min(1, need > 0 ? food / need : 1)); },
  /**
   * Development time of a colonist, counted with the food it holds when its turn starts (it is eaten later, at production). One unit is
   * 28 PAL frames ([C64] 50.125 Hz): 101 units ~ 56.4 s, 10 units ~ 5.6 s. Same for every difficulty. `speciesFactor`: hook for the
   * species handicap ([Atari code] Flapper 9/7, Humanoid 5/7 of a unit), 1 until species exist. No money penalty for hunger.
   */
  humanTimeMs(state, player, speciesFactor = 1) {
    const units = this.devUnits(player.inventory.food || 0, this.foodNeed(state.turn));
    return Math.round(units * CONFIG.DEV.unitFrames * speciesFactor * 1000 / CONFIG.DEV.palHz);
  }
};
