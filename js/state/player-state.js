'use strict';
const PlayerState = {
  /**
   * `startInv`: the level's starting goods; the starting cash comes from the species ([Atari code] computers are Mechtrons).
   * `keys`: a human's control layout (PlayerControls seat 0-3: P1 arrows, P2 WASD, ...); null for a computer.
   */
  create(id, name, color, isHuman, aiProfile, shape, species = 'mechtron', startInv = CONFIG.START_INV, keys = null) {
    const inventory = {}; const cash = speciesById(species).cash;
    Object.keys(RESOURCE_DEFS).forEach((k) => { inventory[k] = startInv[k] || 0; });
    return {
      id, name, color, shape, isHuman, keys: isHuman ? keys : null, aiProfile, species, cash, inventory, plots: [],
      score: cash, lastTurnNetWorth: cash,
      productionReport: null, eventLog: []
    };
  }
};
