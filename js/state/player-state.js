'use strict';
const PlayerState = {
  /** `startInv`: the level's starting goods; the starting cash comes from the species ([Atari code] computers are Mechtrons). */
  create(id, name, color, isHuman, aiProfile, shape, species = 'mechtron', startInv = CONFIG.START_INV) {
    const inventory = {}; const cash = speciesById(species).cash;
    Object.keys(RESOURCE_DEFS).forEach((k) => { inventory[k] = startInv[k] || 0; });
    return {
      id, name, color, shape, isHuman, aiProfile, species, cash, inventory, plots: [],
      score: cash, lastTurnNetWorth: cash,
      productionReport: null, eventLog: []
    };
  }
};
